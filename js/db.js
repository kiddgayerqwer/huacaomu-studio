// 本機資料庫：所有資料先存在 iPad (IndexedDB)，離線也能用。
// 每次修改都會放進「待上傳」佇列，有網路時由 sync.js 上傳到雲端。

export const STORES = ['members', 'purchases', 'sessions', 'services', 'contracts', 'appointments', 'measurements', 'settings'];

const DB_NAME = 'huacaomu-studio';
const DB_VER = 1;
let db;
const cache = {};
const listeners = new Set();

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function init() {
  db = await new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  for (const s of STORES) cache[s] = await req(db.transaction(s).objectStore(s).getAll());
  // 請瀏覽器不要自動清除資料
  try { await navigator.storage?.persist?.(); } catch (e) { /* ignore */ }
}

export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

export const all = (s) => cache[s].filter((r) => !r.deleted);
export const get = (s, id) => cache[s].find((r) => r.id === id && !r.deleted);
export const byMember = (s, memberId) => all(s).filter((r) => r.memberId === memberId);

async function writeLocal(s, rec, queue) {
  const t = db.transaction([s, 'outbox'], 'readwrite');
  t.objectStore(s).put(rec);
  if (queue) t.objectStore('outbox').put({ id: rec.id, store: s, updatedAt: rec.updatedAt });
  await done(t);
  const i = cache[s].findIndex((x) => x.id === rec.id);
  if (i >= 0) cache[s][i] = rec; else cache[s].push(rec);
}

export async function save(s, rec) {
  const now = new Date().toISOString();
  rec = { ...rec };
  rec.id = rec.id || uid();
  rec.createdAt = rec.createdAt || now;
  rec.updatedAt = now;
  await writeLocal(s, rec, true);
  emit();
  return rec;
}

export async function remove(s, id) {
  const r = cache[s].find((x) => x.id === id);
  if (r) await save(s, { ...r, deleted: true });
}

// ---- 給同步使用 ----
export async function pending() {
  const items = await req(db.transaction('outbox').objectStore('outbox').getAll());
  return items
    .map((o) => ({ ...o, rec: cache[o.store]?.find((r) => r.id === o.id) }))
    .filter((o) => o.rec);
}

export async function clearOutbox(items) {
  const t = db.transaction('outbox', 'readwrite');
  const os = t.objectStore('outbox');
  for (const it of items) {
    const cur = await req(os.get(it.id));
    // 上傳途中若又被修改，就保留在佇列中下次再傳
    if (cur && cur.updatedAt === it.updatedAt) os.delete(it.id);
  }
  await done(t);
}

export async function applyRemote(store, rec) {
  if (!STORES.includes(store) || !rec || !rec.id) return false;
  const local = cache[store].find((x) => x.id === rec.id);
  if (local && local.updatedAt > rec.updatedAt) return false;
  const queued = await req(db.transaction('outbox').objectStore('outbox').get(rec.id));
  if (queued && queued.updatedAt > rec.updatedAt) return false;
  await writeLocal(store, rec, false);
  return true;
}

export const notify = emit;

export async function getMeta(k) {
  const r = await req(db.transaction('meta').objectStore('meta').get(k));
  return r ? r.v : undefined;
}
export async function setMeta(k, v) {
  const t = db.transaction('meta', 'readwrite');
  t.objectStore('meta').put({ k, v });
  await done(t);
}

// ---- 備份 ----
export function exportAll() {
  const out = { app: 'huacaomu-studio', version: 1, exportedAt: new Date().toISOString() };
  for (const s of STORES) out[s] = cache[s];
  return out;
}

export async function importAll(data) {
  let n = 0;
  for (const s of STORES) {
    for (const rec of data[s] || []) {
      const local = cache[s].find((x) => x.id === rec.id);
      if (!local || (rec.updatedAt || '') > (local.updatedAt || '')) {
        await writeLocal(s, rec, true);
        n++;
      }
    }
  }
  emit();
  return n;
}
