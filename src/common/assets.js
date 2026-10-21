import fs from 'fs';
import path from 'path';

const cache = new Map();

/**
 * Loads an image used on PDFs. `ref` is either a file path relative to the project root
 * (e.g. "assets/logo.png") or "storage:<path>" for a file in the private invoices bucket
 * (used on Vercel, where personal assets such as the signature are not in the repo).
 * Results are cached per process; a missing asset resolves to null.
 */
export async function loadAsset(ref, storage, bucket) {
  if (!ref) return null;
  if (cache.has(ref)) return cache.get(ref);

  let buffer = null;
  if (ref.startsWith('storage:')) {
    const { data, error } = await storage.from(bucket).download(ref.slice('storage:'.length));
    if (!error && data) buffer = Buffer.from(await data.arrayBuffer());
  } else {
    const file = path.resolve(process.cwd(), ref);
    if (fs.existsSync(file)) buffer = fs.readFileSync(file);
  }
  cache.set(ref, buffer);
  return buffer;
}
