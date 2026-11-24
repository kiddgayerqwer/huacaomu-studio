/**
 * 花草沐studio 雲端資料庫 (Google Apps Script)
 *
 * 第一次使用：
 *   1. 在上方選單選擇函式「setup」，按「執行」，依畫面允許權限。
 *   2. 執行完畢後，「執行記錄」會顯示「通行碼」，請記下來。
 *   3. 右上角「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *      執行身分：我　／　誰可以存取：所有人　→ 部署，複製「網頁應用程式網址」。
 *   4. 在 iPad 的花草沐studio「設定」頁貼上網址和通行碼。
 */

const ROOT_FOLDER_NAME = 'gym';
const SHEET_NAME = '花草沐studio 資料庫';
const DB_TAB = '_db';
const CHUNK = 45000; // 每格最多 50000 字，資料太大時分多格存放
const MAX_CHUNKS = 20;

const LABELS = {
  members: ['會員', { name: '姓名', phone: '電話', gender: '性別', birthday: '生日', email: 'Email', line: 'LINE', address: '地址', emergency: '緊急聯絡人', joinDate: '入會日期', source: '來源', height: '身高', occupation: '職業', goals: '目標', health: '身體狀況/禁忌', allergy: '過敏', tags: '標籤', _wallet: '儲值金餘額', note: '備註' }],
  purchases: ['買課紀錄', { _member: '會員', category: '類別', name: '方案名稱', total: '堂數', usedBefore: '轉入前已上', _used: '已用', _left: '剩餘', price: '金額', paid: '已付', method: '付款方式', date: '購買日期', expiry: '到期日', note: '備註' }],
  sessions: ['上課紀錄', { _member: '會員', date: '日期', time: '時間', duration: '分鐘', _pkg: '扣抵課程', focus: '訓練重點', exercises: '訓練內容', condition: '當天狀況', rpe: 'RPE', homework: '回家功課', note: '備註' }],
  topups: ['儲值紀錄', { _member: '會員', date: '儲值日期', plan: '儲值方案', amount: '儲值金額', bonus: '贈送金額', _credit: '入帳金額', method: '付款方式', note: '備註' }],
  services: ['服務紀錄', { _member: '會員', date: '日期', time: '時間', duration: '分鐘', item: '服務項目', _pay: '付款方式', _pkg: '扣抵課程', price: '金額', method: '收款方式', oils: '精油', blend: '調油配方', areas: '部位', pressure: '力道', before: '服務前', after: '服務後', advice: '居家建議', note: '備註' }],
  contracts: ['合約', { _member: '會員', title: '合約名稱', start: '開始日', end: '結束日', amount: '金額', _signed: '會員已簽名', signedAt: '簽署時間' }],
  appointments: ['預約', { _member: '會員', date: '日期', time: '時間', duration: '分鐘', type: '類型', status: '狀態', note: '備註' }],
  checkins: ['簽到表', { _member: '會員', date: '日期', time: '時間', type: '項目', _pkg: '扣抵課程', _nth: '堂次', _signed: '已簽名', note: '備註' }],
  measurements: ['身體數據', { _member: '會員', date: '日期', weight: '體重', bodyFat: '體脂%', muscle: '肌肉量', visceral: '內臟脂肪', chest: '胸圍', waist: '腰圍', hip: '臀圍', arm: '上臂', thigh: '大腿', bp: '血壓', note: '備註' }],
};
const CATS = { fitness: '健身', massage: '芳療按摩', other: '其他' };
const PAY = { wallet: '儲值金扣款', cash: '現金／單次付費', package: '扣課程堂數' };
function payOf_(s) { return s.payType || (s.purchaseId ? 'package' : 'cash'); }

// ================= 設定 =================
function setup() {
  const props = PropertiesService.getScriptProperties();
  const folder = getRootFolder_();
  const ss = getSpreadsheet_();
  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  // 每 5 分鐘把有變動的會員資料輸出成 PDF
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'exportDirty') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('exportDirty').timeBased().everyMinutes(5).create();
  Logger.log('✅ 設定完成');
  Logger.log('雲端硬碟資料夾：' + folder.getUrl());
  Logger.log('試算表：' + ss.getUrl());
  Logger.log('🔑 通行碼：' + props.getProperty('TOKEN'));
}

function showToken() {
  Logger.log('🔑 通行碼：' + PropertiesService.getScriptProperties().getProperty('TOKEN'));
}

function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 重新建立 */ } }
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_FOLDER_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* 重新建立 */ } }
  const ss = SpreadsheetApp.create(SHEET_NAME);
  const file = DriveApp.getFileById(ss.getId());
  file.moveTo(getRootFolder_());
  const db = ss.getSheets()[0];
  db.setName(DB_TAB);
  db.getRange(1, 1, 1, 6).setValues([['id', 'store', 'updatedAt', 'deleted', 'seq', 'data(json)']]);
  db.setFrozenRows(1);
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function subFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ================= 網頁 API =================
function doGet() {
  return ContentService.createTextOutput('花草沐studio 雲端運作中 ✅');
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || req.token !== token) throw new Error('通行碼錯誤');
    if (req.action === 'ping') out = { ok: true };
    else if (req.action === 'push') out = push_(req.records || []);
    else if (req.action === 'pull') out = pull_(Number(req.since) || 0);
    else throw new Error('未知的動作');
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function readDb_(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, Math.max(6, sh.getLastColumn())).getValues();
}

function push_(records) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getSpreadsheet_();
    const sh = ss.getSheetByName(DB_TAB);
    const props = PropertiesService.getScriptProperties();
    let seq = Number(props.getProperty('SEQ') || 0);
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
    const index = {};
    ids.forEach(function (id, i) { index[id] = i + 2; });
    const touchedStores = {};
    const dirty = JSON.parse(props.getProperty('DIRTY') || '{}');
    records.forEach(function (rec) {
      const json = JSON.stringify(rec.data);
      const chunks = [];
      for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
      if (chunks.length > MAX_CHUNKS) throw new Error('資料太大：' + rec.id);
      let row = index[rec.id];
      if (row) {
        const cur = sh.getRange(row, 3).getValue();
        if (cur && String(cur) > String(rec.updatedAt)) return; // 雲端的比較新，略過
      } else {
        row = sh.getLastRow() + 1;
        index[rec.id] = row;
      }
      seq++;
      const values = [rec.id, rec.store, rec.updatedAt, rec.deleted ? 1 : 0, seq].concat(chunks);
      while (values.length < 5 + MAX_CHUNKS) values.push('');
      const lastCol = sh.getMaxColumns();
      if (lastCol < values.length) sh.insertColumnsAfter(lastCol, values.length - lastCol);
      sh.getRange(row, 1, 1, values.length).setNumberFormat('@').setValues([values]);
      touchedStores[rec.store] = true;
      const mid = rec.store === 'members' ? rec.id : rec.data && rec.data.memberId;
      if (mid && rec.store !== 'settings') dirty[mid] = true;
    });
    props.setProperty('SEQ', String(seq));
    props.setProperty('DIRTY', JSON.stringify(dirty));
    SpreadsheetApp.flush();
    try { rebuildTabs_(ss, Object.keys(touchedStores)); } catch (e) { console.error(e); }
    return { ok: true, seq: seq };
  } finally {
    lock.releaseLock();
  }
}

function pull_(since) {
  const sh = getSpreadsheet_().getSheetByName(DB_TAB);
  const rows = readDb_(sh)
    .filter(function (r) { return Number(r[4]) > since; })
    .sort(function (a, b) { return Number(a[4]) - Number(b[4]); });
  const page = rows.slice(0, 300);
  const out = page.map(function (r) {
    return { store: r[1], seq: Number(r[4]), data: JSON.parse(r.slice(5).join('')) };
  });
  return { ok: true, rows: out, cursor: page.length ? Number(page[page.length - 1][4]) : since, more: rows.length > page.length };
}

// ================= 方便閱讀的分頁 =================
function loadAll_() {
  const all = {};
  readDb_(getSpreadsheet_().getSheetByName(DB_TAB)).forEach(function (r) {
    if (Number(r[3])) return;
    const d = JSON.parse(r.slice(5).join(''));
    (all[r[1]] = all[r[1]] || []).push(d);
  });
  return all;
}

function helpers_(all) {
  const members = {};
  (all.members || []).forEach(function (m) { members[m.id] = m; });
  const pkgs = {};
  (all.purchases || []).forEach(function (p) { pkgs[p.id] = p; });
  const usedCount = {};
  (all.sessions || []).concat(all.services || []).forEach(function (s) { if (s.purchaseId) usedCount[s.purchaseId] = (usedCount[s.purchaseId] || 0) + 1; });
  // 儲值金餘額 = 儲值（含贈送）− 用儲值金扣款的芳療服務
  const wallet = {};
  (all.topups || []).forEach(function (t) { wallet[t.memberId] = (wallet[t.memberId] || 0) + (Number(t.amount) || 0) + (Number(t.bonus) || 0); });
  (all.services || []).forEach(function (s) { if (payOf_(s) === 'wallet') wallet[s.memberId] = (wallet[s.memberId] || 0) - (Number(s.price) || 0); });
  return { members: members, pkgs: pkgs, wallet: wallet, used: function (p) { return (Number(p.usedBefore) || 0) + (usedCount[p.id] || 0); } };
}

function cell_(store, k, r, h) {
  if (k === '_member') return h.members[r.memberId] ? h.members[r.memberId].name : '';
  if (k === '_pkg' && store === 'checkins' && r.pay === 'wallet') return '儲值金 -' + (Number(r.price) || 0);
  if (k === '_pkg' && store === 'checkins' && r.pay === 'cash') return '現金 ' + (Number(r.price) || 0);
  if (k === '_pkg' && store === 'services' && payOf_(r) !== 'package') return '';
  if (k === '_pkg') return h.pkgs[r.purchaseId] ? h.pkgs[r.purchaseId].name : (r.purchaseId ? '' : '單次');
  if (k === '_pay') return PAY[payOf_(r)];
  if (k === '_wallet') return h.wallet[r.id] === undefined ? '' : h.wallet[r.id];
  if (k === '_credit') return (Number(r.amount) || 0) + (Number(r.bonus) || 0);
  if (k === '_used') return h.used(r);
  if (k === '_left') return (Number(r.total) || 0) - h.used(r);
  if (k === '_signed') return (r.memberSig || r.signature) ? '是' : '否';
  if (k === '_nth') return r.nth ? r.nth + '/' + r.total : '';
  if (k === 'category') return CATS[r[k]] || r[k] || '';
  if (k === 'exercises') return (r.exercises || []).map(function (e) { return e.name + ' ' + (e.weight || '') + ' ' + (e.reps || '') + 'x' + (e.sets || ''); }).join('\n');
  const v = r[k];
  if (Array.isArray(v)) return v.join('、');
  return v === null || v === undefined ? '' : v;
}

function rebuildTabs_(ss, stores) {
  const all = loadAll_();
  const h = helpers_(all);
  // 買課的剩餘堂數會因上課/服務改變
  if (stores.indexOf('sessions') >= 0 || stores.indexOf('services') >= 0) stores.push('purchases');
  // 會員分頁的儲值金餘額會因儲值或芳療扣款改變
  if (stores.indexOf('topups') >= 0 || stores.indexOf('services') >= 0) stores.push('members');
  stores = stores.filter(function (s, i) { return stores.indexOf(s) === i; });
  stores.forEach(function (store) {
    if (!LABELS[store]) return;
    const name = LABELS[store][0], cols = LABELS[store][1];
    const keys = Object.keys(cols);
    let sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const rows = (all[store] || []).slice().sort(function (a, b) { return String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')); });
    const data = [keys.map(function (k) { return cols[k]; })].concat(rows.map(function (r) { return keys.map(function (k) { return cell_(store, k, r, h); }); }));
    sh.clearContents();
    sh.getRange(1, 1, data.length, keys.length).setNumberFormat('@').setValues(data);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, keys.length).setFontWeight('bold').setBackground('#e5ede3');
  });
}

// ================= 輸出 PDF 到 gym 資料夾 =================
function exportDirty() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const dirty = JSON.parse(props.getProperty('DIRTY') || '{}');
    const ids = Object.keys(dirty);
    if (!ids.length) return;
    props.setProperty('DIRTY', '{}');
    const all = loadAll_();
    const h = helpers_(all);
    const settings = (all.settings || [])[0] || {};
    const studio = settings.studioName || '花草沐studio';
    const base = subFolder_(getRootFolder_(), '會員');
    const start = Date.now();
    for (let i = 0; i < ids.length; i++) {
      if (Date.now() - start > 4 * 60 * 1000) { // 快超過時間限制，剩下的下次再做
        const rest = JSON.parse(props.getProperty('DIRTY') || '{}');
        ids.slice(i).forEach(function (x) { rest[x] = true; });
        props.setProperty('DIRTY', JSON.stringify(rest));
        break;
      }
      const id = ids[i];
      const m = h.members[id];
      if (!m) continue;
      const folder = subFolder_(base, safe_(m.name) + '_' + id.slice(0, 4));
      const by = function (s) { return (all[s] || []).filter(function (r) { return r.memberId === id; }); };
      writePdf_(folder, '會員紀錄.pdf', memberHtml_(m, by, h, studio));
      writePhotos_(folder, by('photos'));
      by('contracts').forEach(function (c) {
        writePdf_(folder, '合約_' + safe_(c.title) + '_' + (c.start || String(c.createdAt).slice(0, 10)) + '_' + c.id.slice(0, 4) + '.pdf', contractHtml_(c, m, settings, studio));
      });
    }
  } finally {
    lock.releaseLock();
  }
}

function exportAllNow() {
  const all = loadAll_();
  const dirty = {};
  (all.members || []).forEach(function (m) { dirty[m.id] = true; });
  PropertiesService.getScriptProperties().setProperty('DIRTY', JSON.stringify(dirty));
  rebuildTabs_(getSpreadsheet_(), Object.keys(LABELS));
  exportDirty();
}

// 體態照片存成 JPG 放在會員資料夾的「體態照片」裡（只有你自己看得到）
function writePhotos_(memberFolder, photos) {
  const it0 = memberFolder.getFoldersByName('體態照片');
  if (!photos.length && !it0.hasNext()) return;
  const folder = it0.hasNext() ? it0.next() : memberFolder.createFolder('體態照片');
  const want = {};
  photos.forEach(function (ph) {
    if (!ph.image) return;
    want[safe_(ph.date + '_' + (ph.angle || '照片')) + '_' + ph.id.slice(0, 6) + '.jpg'] = ph;
  });
  const have = {};
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (want[f.getName()]) have[f.getName()] = true; else f.setTrashed(true);
  }
  Object.keys(want).forEach(function (name) {
    if (have[name]) return;
    const m = String(want[name].image).match(/^data:(image\/[a-z]+);base64,(.*)$/);
    if (!m) return;
    folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name));
  });
}

function safe_(s) { return String(s || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40); }
function e_(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/\n/g, '<br>'); }
const CSS_ = '<style>body{font-family:"Noto Sans TC",sans-serif;font-size:12px;color:#222}h1{color:#4a6650;text-align:center;font-size:20px;margin:0}h2{text-align:center;font-size:16px}h3{color:#4a6650;border-bottom:1px solid #ccc;margin-top:18px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f2f0ea}.sig{height:90px;border-bottom:1px solid #444;text-align:center}.sig img{max-height:85px}</style>';

function writePdf_(folder, name, html) {
  const blob = Utilities.newBlob(html, 'text/html', name.replace(/\.pdf$/, '.html')).getAs('application/pdf').setName(name);
  const old = folder.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  folder.createFile(blob);
}

function memberHtml_(m, by, h, studio) {
  const sort = function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); };
  let html = CSS_ + '<h1>' + e_(studio) + '</h1><h2>會員紀錄：' + e_(m.name) + '</h2>';
  html += '<table>' + [['電話', m.phone], ['生日', m.birthday], ['Email', m.email], ['LINE', m.line], ['地址', m.address], ['緊急聯絡人', m.emergency], ['入會日期', m.joinDate], ['目標', m.goals], ['身體狀況/禁忌', m.health], ['過敏', m.allergy], ['備註', m.note]]
    .filter(function (x) { return x[1]; }).map(function (x) { return '<tr><th>' + x[0] + '</th><td>' + e_(x[1]) + '</td></tr>'; }).join('') + '</table>';
  const section = function (store, title) {
    const cols = LABELS[store][1];
    const keys = Object.keys(cols).filter(function (k) { return k !== '_member'; });
    const rows = by(store).sort(sort);
    if (!rows.length) return '';
    return '<h3>' + title + '（' + rows.length + '）</h3><table><tr>' + keys.map(function (k) { return '<th>' + cols[k] + '</th>'; }).join('') + '</tr>' +
      rows.map(function (r) { return '<tr>' + keys.map(function (k) { return '<td>' + e_(cell_(store, k, r, h)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
  };
  const cks = by('checkins').sort(function (a, b) { return String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))); });
  if (cks.length) {
    html += '<h3>客戶簽到表（' + cks.length + '）</h3><table><tr><th>#</th><th>日期</th><th>時間</th><th>項目</th><th>課程</th><th>堂次</th><th>會員簽名</th></tr>' +
      cks.map(function (c, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + e_(c.date) + '</td><td>' + e_(c.time) + '</td><td>' + e_(c.type) + '</td><td>' + e_(cell_('checkins', '_pkg', c, h)) + '</td><td>' + e_(cell_('checkins', '_nth', c, h)) + '</td><td>' + (c.signature ? '<img src="' + c.signature + '" style="height:40px">' : '') + '</td></tr>';
      }).join('') + '</table>';
  }
  if (h.wallet[m.id] !== undefined) html += '<h3>芳療儲值金餘額：NT$ ' + Number(h.wallet[m.id]).toLocaleString() + '</h3>';
  html += section('purchases', '買課紀錄') + section('topups', '儲值紀錄') + section('sessions', '上課紀錄') + section('services', '服務紀錄') + section('measurements', '身體數據') + section('appointments', '預約');
  html += '<p style="text-align:right;color:#888">更新時間：' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm') + '</p>';
  return html;
}

function contractHtml_(c, m, settings, studio) {
  return CSS_ + '<h1>' + e_(studio) + '</h1><h2>' + e_(c.title) + '</h2>' +
    '<table><tr><th>會員姓名</th><td>' + e_(m.name) + '</td><th>電話</th><td>' + e_(m.phone) + '</td></tr>' +
    '<tr><th>合約期間</th><td>' + e_(c.start) + ' ～ ' + e_(c.end) + '</td><th>金額</th><td>' + (c.amount != null ? 'NT$ ' + Number(c.amount).toLocaleString() : '') + '</td></tr></table>' +
    '<div style="margin:16px 0;line-height:1.9">' + e_(c.content) + '</div>' +
    '<table style="border:0"><tr><td style="border:0;width:50%"><div class="sig">' + (c.memberSig ? '<img src="' + c.memberSig + '">' : '') + '</div><p style="text-align:center">甲方（會員）簽名</p></td>' +
    '<td style="border:0"><div class="sig">' + (c.studioSig ? '<img src="' + c.studioSig + '">' : '') + '</div><p style="text-align:center">乙方（' + e_(studio) + '）簽名</p></td></tr></table>' +
    '<p style="text-align:right">簽署日期：' + (c.signedAt ? Utilities.formatDate(new Date(c.signedAt), 'Asia/Taipei', 'yyyy/MM/dd HH:mm') : '尚未簽署') + '</p>' +
    (settings.studioAddress || settings.studioPhone ? '<p style="text-align:right;color:#666">' + e_(settings.studioAddress) + ' ' + e_(settings.studioPhone) + '</p>' : '');
}
