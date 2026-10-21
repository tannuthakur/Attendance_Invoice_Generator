const BASE = `${import.meta.env.VITE_API_URL || ''}/api/v1`;
const STORAGE_KEY = 'payroll.session';

export class ApiError extends Error {
  constructor(status, body) {
    const msg = Array.isArray(body?.message) ? body.message.join('\n') : body?.message || `Request failed (${status})`;
    super(msg);
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Session (access + refresh tokens)
// ---------------------------------------------------------------------------
let session = readSession();
const listeners = new Set();

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export function getSession() {
  return session;
}

export function setSession(tokens) {
  session = tokens ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt } : null;
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode): the session lives in memory only.
  }
  if (!session) listeners.forEach((fn) => fn());
}

/** Called when the session ends (logout or refresh failure). */
export function onSessionEnd(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let refreshing = null;
async function refreshSession() {
  if (!session?.refreshToken) return false;
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      setSession(await res.json());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
function buildUrl(path, query) {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function api(path, { method = 'GET', body, query, auth = true } = {}) {
  // Refresh a little before expiry rather than waiting for a 401.
  if (auth && session?.expiresAt && session.expiresAt * 1000 - Date.now() < 30_000) await refreshSession();

  const send = () =>
    fetch(buildUrl(path, query), {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && auth && session) {
    if (await refreshSession()) res = await send();
    if (res.status === 401) setSession(null);
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Loads every page of a paginated list endpoint ({ data, total }). */
export async function fetchAllPages(path, query = {}) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const res = await api(path, { query: { ...query, page, limit: 100 } });
    rows.push(...res.data);
    if (rows.length >= res.total || res.data.length === 0) return rows;
  }
}

/** Saves a URL (e.g. a signed URL with Content-Disposition: attachment) without leaving the page. */
export function saveUrl(url, fileName) {
  const a = document.createElement('a');
  a.href = url;
  if (fileName) a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Fetches a binary response (POST with JSON body, or GET) as { blob, fileName }. */
export async function fetchFile(path, { method = 'POST', body, fallbackName = 'download.pdf' } = {}) {
  const send = () =>
    fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const fileName = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  return { blob: await res.blob(), fileName };
}

/** Saves a Blob as a file. */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  saveUrl(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
