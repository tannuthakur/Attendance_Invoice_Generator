/**
 * Minimal stand-in for SupabaseService used by HTTP tests.
 * `tables[name](calls)` returns `{ data, error }` for a query; `calls` is the list of
 * builder calls made (e.g. ['eq', 'id', '…']) so handlers can answer per filter.
 */
export function fakeSupabase({ tables = {}, rpc = {}, storage = {}, auth = {} } = {}) {
  const recorded = { queries: [], rpc: [], uploads: [] };

  const from = (table) => {
    const calls = [];
    recorded.queries.push({ table, calls });
    const builder = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            const handler = tables[table];
            if (!handler) throw new Error(`fakeSupabase: no handler for table "${table}"`);
            const result = Promise.resolve(typeof handler === 'function' ? handler(calls) : handler);
            return result.then.bind(result);
          }
          return (...args) => {
            calls.push([prop, ...args]);
            return builder;
          };
        },
      },
    );
    return builder;
  };

  const admin = {
    from,
    rpc: async (name, args) => {
      recorded.rpc.push({ name, args });
      if (!rpc[name]) throw new Error(`fakeSupabase: no rpc "${name}"`);
      return rpc[name](args);
    },
    storage: {
      from: (bucket) => ({
        upload: async (path, body, opts) => {
          recorded.uploads.push({ bucket, path, body, opts });
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path, ttl) => ({
          data: { signedUrl: `https://storage.test/${bucket}/${path}?ttl=${ttl}` },
          error: null,
        }),
        remove: async () => ({ data: [], error: null }),
        ...storage,
      }),
    },
    auth: { getUser: async () => ({ data: null, error: new Error('no') }), admin: {}, ...auth },
  };

  return { admin, anon: () => ({ auth }), recorded };
}

/** Value of the first `.eq(column, value)` call. */
export const eqOf = (calls, column) => calls.find(([m, c]) => m === 'eq' && c === column)?.[2];
export const ok = (data) => ({ data, error: null });
