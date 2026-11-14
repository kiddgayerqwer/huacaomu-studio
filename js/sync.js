// 雲端同步 (Google Apps Script + Google 試算表)。
// 沒網路時資料留在 iPad 的待上傳佇列，恢復連線後自動上傳。
import * as DB from './db.js';
import { CLOUD } from './config.js';

let cfg = null;
let busy = false;
let again = false;
let timer = null;
const listeners = new Set();
export const status = { state: 'off', last: null, error: null, pending: 0 };

export const onStatus = (fn) => listeners.add(fn);
const notify = () => listeners.forEach((fn) => fn(status));

export async function init() {
  cfg = (await DB.getMeta('cloud')) || null;
  window.addEventListener('online', () => soon(300));
  window.addEventListener('offline', () => { status.state = 'offline'; notify(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(300); });
  DB.onChange(() => soon(1500));
  setInterval(() => { if (!document.hidden) soon(0); }, 60 * 1000);
  await refreshPending();
  soon(500);
}

export const configured = () => !!(cfg && cfg.url && cfg.token);
export const account = () => (cfg ? { url: cfg.url } : null);
export const defaults = () => ({ url: CLOUD.url || '' });

export function soon(ms) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

async function refreshPending() {
  status.pending = (await DB.pending()).length;
  if (!configured()) status.state = 'off';
  else if (!navigator.onLine) status.state = 'offline';
  notify();
}

// Apps Script 只接受「簡單請求」，所以用 text/plain 送 JSON
async function call(url, token, action, payload = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, action, ...payload }),
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`雲端錯誤 ${r.status}`);
  const j = await r.json().catch(() => { throw new Error('雲端回應格式錯誤，請確認網址是否正確、部署權限是否為「所有人」'); });
  if (!j.ok) throw new Error(j.error || '雲端錯誤');
  return j;
}

export async function connect(url, token) {
  url = url.trim();
  token = token.trim();
  if (!/^https:\/\/script\.google\.com\//.test(url)) throw new Error('網址應該以 https://script.google.com/ 開頭');
  await call(url, token, 'ping');
  cfg = { url, token };
  await DB.setMeta('cloud', cfg);
  await DB.setMeta('pullCursor', 0);
  await syncNow();
}

export async function logout() {
  cfg = null;
  await DB.setMeta('cloud', null);
  await refreshPending();
}

export async function syncNow() {
  if (!configured() || !navigator.onLine) { await refreshPending(); return; }
  if (busy) { again = true; return; }
  busy = true;
  status.state = 'syncing';
  notify();
  try {
    await push();
    await pull();
    status.state = 'ok';
    status.last = new Date();
    status.error = null;
  } catch (e) {
    console.error(e);
    status.state = navigator.onLine ? 'error' : 'offline';
    status.error = e.message;
  }
  busy = false;
  status.pending = (await DB.pending()).length;
  notify();
  if (again) { again = false; soon(500); }
}

async function push() {
  const items = await DB.pending();
  // 每次送一小批（含簽名圖片時資料較大）
  let batch = [], size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const records = batch.map(({ store, rec }) => ({ id: rec.id, store, updatedAt: rec.updatedAt, deleted: !!rec.deleted, data: rec }));
    await call(cfg.url, cfg.token, 'push', { records });
    await DB.clearOutbox(batch);
    batch = []; size = 0;
  };
  for (const it of items) {
    const s = JSON.stringify(it.rec).length;
    if (batch.length && (size + s > 400000 || batch.length >= 50)) await flush();
    batch.push(it); size += s;
  }
  await flush();
}

async function pull() {
  let since = (await DB.getMeta('pullCursor')) || 0;
  let changed = false;
  for (;;) {
    const j = await call(cfg.url, cfg.token, 'pull', { since });
    for (const row of j.rows) {
      if (await DB.applyRemote(row.store, row.data)) changed = true;
    }
    since = j.cursor;
    await DB.setMeta('pullCursor', since);
    if (!j.more) break;
  }
  if (changed) DB.notify();
}
