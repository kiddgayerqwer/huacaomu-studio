import * as DB from './db.js';
import * as Sync from './sync.js';

// ================= 小工具 =================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const money = (n) => 'NT$ ' + Math.round(Number(n) || 0).toLocaleString('zh-TW');
const num = (v) => (v === '' || v == null ? null : Number(v));
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const fmtDate = (s) => { if (!s) return ''; const d = new Date(s + 'T00:00:00'); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`; };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ================= 選項 =================
const CATS = { fitness: '健身', massage: '芳療按摩', other: '其他' };
const OPT = {
  gender: ['女', '男', '其他'],
  source: ['朋友介紹', 'Instagram', 'Facebook', 'Google', 'LINE', '路過', '其他'],
  method: ['現金', '轉帳', '信用卡', 'LINE Pay', '街口', '其他'],
  serviceItem: ['精油芳療按摩', '全身舒壓按摩', '肩頸放鬆', '背部按摩', '腿部淋巴', '頭部舒壓', '運動按摩', '其他'],
  areas: ['頭', '肩頸', '上背', '下背', '手臂', '腹部', '臀部', '大腿', '小腿', '足部', '全身'],
  pressure: ['輕', '中', '中重', '重'],
  focus: ['上肢', '下肢', '核心', '全身', '有氧/心肺', '伸展/活動度', '體態矯正', '減脂', '增肌'],
  apptType: ['健身', '芳療按摩', '其他'],
  apptStatus: ['已預約', '已完成', '取消', '未到'],
  oils: ['薰衣草', '甜橙', '佛手柑', '尤加利', '薄荷', '迷迭香', '茶樹', '乳香', '依蘭', '天竺葵', '玫瑰', '檀香', '杜松', '葡萄柚', '洋甘菊', '甜杏仁油(基底)', '荷荷芭油(基底)'],
};

const DEFAULT_SETTINGS = {
  studioName: '花草沐studio',
  studioPhone: '',
  studioAddress: '',
  contractTemplate: `立契約書人
甲方（會員）：{會員姓名}
乙方（工作室）：{工作室名稱}

一、課程／服務內容：{方案名稱}，共 {堂數} 堂。
二、合約期間：自 {開始日} 起至 {結束日} 止，逾期未使用之堂數視同使用完畢。
三、費用：新台幣 {金額} 元整。
四、預約與取消：甲方如需取消或改期，應於預約時間 24 小時前告知；未告知或無故未到者，視同已使用一堂。
五、健康告知：甲方應據實告知身體狀況（包含疾病、手術、受傷、懷孕、過敏、精油過敏等）。如有隱瞞，因此所生之風險由甲方自行負責。
六、甲方應遵從乙方之指導，如身體不適應立即告知乙方並停止活動。
七、本課程不得轉讓他人使用，經雙方同意者除外。
八、退費依消費者保護法及相關規定辦理。
九、本合約一式兩份，雙方各執一份為憑。`,
};
let SETTINGS = { ...DEFAULT_SETTINGS };

// ================= 欄位定義 =================
const F = {
  members: [
    { k: 'name', label: '姓名', type: 'text', required: true },
    { k: 'phone', label: '電話', type: 'tel' },
    { k: 'gender', label: '性別', type: 'select', options: OPT.gender },
    { k: 'birthday', label: '生日', type: 'date' },
    { k: 'email', label: 'Email', type: 'email' },
    { k: 'line', label: 'LINE ID', type: 'text' },
    { k: 'address', label: '地址', type: 'text', wide: true },
    { k: 'emergency', label: '緊急聯絡人／電話', type: 'text', wide: true },
    { k: 'joinDate', label: '入會日期', type: 'date', def: () => ymd() },
    { k: 'source', label: '從哪裡知道我們', type: 'select', options: OPT.source },
    { k: 'height', label: '身高 (cm)', type: 'number' },
    { k: 'occupation', label: '職業', type: 'text' },
    { k: 'goals', label: '目標／需求', type: 'textarea', wide: true, ph: '例：減脂 5 公斤、改善肩頸痠痛、睡眠品質' },
    { k: 'health', label: '病史／身體狀況／禁忌', type: 'textarea', wide: true, ph: '例：高血壓、椎間盤突出、懷孕中、近期手術' },
    { k: 'allergy', label: '過敏（含精油過敏）', type: 'textarea', wide: true },
    { k: 'tags', label: '標籤（用逗號分開）', type: 'text', wide: true, ph: '例：VIP, 上班族' },
    { k: 'note', label: '備註', type: 'textarea', wide: true },
  ],
  purchases: [
    { k: 'category', label: '類別', type: 'select', options: Object.keys(CATS), labels: CATS, def: 'fitness', required: true },
    { k: 'name', label: '方案名稱', type: 'text', required: true, ph: '例：一對一健身 10 堂' },
    { k: 'total', label: '堂數', type: 'number', required: true, def: 10 },
    { k: 'price', label: '金額', type: 'number', required: true },
    { k: 'paid', label: '已付金額', type: 'number', hint: '空白表示已付清' },
    { k: 'method', label: '付款方式', type: 'select', options: OPT.method },
    { k: 'date', label: '購買日期', type: 'date', def: () => ymd(), required: true },
    { k: 'expiry', label: '到期日', type: 'date', def: () => addDays(ymd(), 180) },
    { k: 'note', label: '備註', type: 'textarea', wide: true },
  ],
  sessions: [
    { k: 'date', label: '日期', type: 'date', def: () => ymd(), required: true },
    { k: 'time', label: '時間', type: 'time' },
    { k: 'duration', label: '時長（分鐘）', type: 'number', def: 60 },
    { k: 'purchaseId', label: '扣抵課程', type: 'purchase', cat: 'fitness' },
    { k: 'focus', label: '訓練重點', type: 'chips', options: OPT.focus, wide: true },
    { k: 'exercises', label: '訓練內容', type: 'exercises', wide: true },
    { k: 'condition', label: '會員當天狀況', type: 'textarea', wide: true, ph: '例：睡眠不足、膝蓋有點緊' },
    { k: 'rpe', label: '自覺強度 RPE (1-10)', type: 'number' },
    { k: 'homework', label: '回家功課', type: 'textarea', wide: true },
    { k: 'note', label: '教練備註', type: 'textarea', wide: true },
  ],
  services: [
    { k: 'date', label: '日期', type: 'date', def: () => ymd(), required: true },
    { k: 'time', label: '時間', type: 'time' },
    { k: 'duration', label: '時長（分鐘）', type: 'number', def: 90 },
    { k: 'purchaseId', label: '扣抵課程', type: 'purchase', cat: 'massage' },
    { k: 'item', label: '服務項目', type: 'select', options: OPT.serviceItem, def: '精油芳療按摩' },
    { k: 'price', label: '單次收費（沒有扣課程時）', type: 'number' },
    { k: 'oils', label: '使用精油', type: 'chips', options: OPT.oils, wide: true, other: true },
    { k: 'blend', label: '調油配方', type: 'text', wide: true, ph: '例：薰衣草 3 滴 + 甜橙 2 滴 + 甜杏仁油 10ml' },
    { k: 'areas', label: '按摩部位', type: 'chips', options: OPT.areas, wide: true },
    { k: 'pressure', label: '力道', type: 'select', options: OPT.pressure },
    { k: 'before', label: '服務前狀況', type: 'textarea', wide: true, ph: '例：右肩緊繃、頭痛、睡不好' },
    { k: 'after', label: '服務後反饋', type: 'textarea', wide: true },
    { k: 'advice', label: '居家建議', type: 'textarea', wide: true },
    { k: 'note', label: '備註', type: 'textarea', wide: true },
  ],
  appointments: [
    { k: 'memberId', label: '會員', type: 'member', required: true },
    { k: 'date', label: '日期', type: 'date', def: () => ymd(), required: true },
    { k: 'time', label: '時間', type: 'time', required: true },
    { k: 'duration', label: '時長（分鐘）', type: 'number', def: 60 },
    { k: 'type', label: '類型', type: 'select', options: OPT.apptType },
    { k: 'status', label: '狀態', type: 'select', options: OPT.apptStatus, def: '已預約' },
    { k: 'note', label: '備註', type: 'textarea', wide: true },
  ],
  measurements: [
    { k: 'date', label: '日期', type: 'date', def: () => ymd(), required: true },
    { k: 'weight', label: '體重 (kg)', type: 'number' },
    { k: 'bodyFat', label: '體脂率 (%)', type: 'number' },
    { k: 'muscle', label: '肌肉量 (kg)', type: 'number' },
    { k: 'visceral', label: '內臟脂肪', type: 'number' },
    { k: 'chest', label: '胸圍 (cm)', type: 'number' },
    { k: 'waist', label: '腰圍 (cm)', type: 'number' },
    { k: 'hip', label: '臀圍 (cm)', type: 'number' },
    { k: 'arm', label: '上臂圍 (cm)', type: 'number' },
    { k: 'thigh', label: '大腿圍 (cm)', type: 'number' },
    { k: 'bp', label: '血壓', type: 'text', ph: '例：120/80' },
    { k: 'note', label: '備註', type: 'textarea', wide: true },
  ],
  contracts: [
    { k: 'purchaseId', label: '對應課程', type: 'purchase', cat: null, any: true },
    { k: 'title', label: '合約名稱', type: 'text', required: true, def: '課程服務合約' },
    { k: 'start', label: '開始日', type: 'date', def: () => ymd() },
    { k: 'end', label: '結束日', type: 'date', def: () => addDays(ymd(), 180) },
    { k: 'amount', label: '金額', type: 'number' },
    { k: 'content', label: '合約內容', type: 'textarea', wide: true, rows: 14 },
  ],
};

const TITLES = { members: '會員', purchases: '買課', sessions: '上課紀錄', services: '服務紀錄', contracts: '合約', appointments: '預約', measurements: '身體數據' };

// ================= 計算 =================
function used(p) {
  return DB.all('sessions').filter((s) => s.purchaseId === p.id).length + DB.all('services').filter((s) => s.purchaseId === p.id).length;
}
const remaining = (p) => (Number(p.total) || 0) - used(p);
const expired = (p) => p.expiry && p.expiry < ymd();
const activePkgs = (memberId, cat) => DB.byMember('purchases', memberId)
  .filter((p) => (!cat || p.category === cat) && remaining(p) > 0 && !expired(p))
  .sort((a, b) => (a.expiry || '9').localeCompare(b.expiry || '9') || (a.date || '').localeCompare(b.date || ''));
const member = (id) => DB.get('members', id);
const memberName = (id) => member(id)?.name || '（已刪除會員）';
const owed = (p) => (p.paid === null || p.paid === undefined || p.paid === '' ? 0 : Math.max(0, (Number(p.price) || 0) - Number(p.paid)));
const age = (b) => { if (!b) return ''; const d = new Date(b), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };

function revenueIn(prefix) {
  const p = DB.all('purchases').filter((x) => (x.date || '').startsWith(prefix)).reduce((s, x) => s + (Number(x.price) || 0), 0);
  const s = DB.all('services').filter((x) => !x.purchaseId && (x.date || '').startsWith(prefix)).reduce((s, x) => s + (Number(x.price) || 0), 0);
  return p + s;
}

// ================= 表單 =================
function fieldHTML(f, v, ctx) {
  const id = 'f_' + f.k;
  const req = f.required ? ' required' : '';
  const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
  let input = '';
  switch (f.type) {
    case 'textarea':
      input = `<textarea id="${id}" name="${f.k}" rows="${f.rows || 3}"${ph}${req}>${esc(v)}</textarea>`; break;
    case 'select':
      input = `<select id="${id}" name="${f.k}"${req}><option value="">—</option>${f.options.map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(f.labels ? f.labels[o] : o)}</option>`).join('')}</select>`; break;
    case 'chips': {
      const vals = Array.isArray(v) ? v : [];
      const extra = vals.filter((x) => !f.options.includes(x));
      input = `<div class="chips" data-name="${f.k}">${[...f.options, ...extra].map((o) => `<button type="button" class="chip${vals.includes(o) ? ' on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}${f.other ? '<button type="button" class="chip add" data-add>＋ 其他</button>' : ''}</div>`; break;
    }
    case 'purchase': {
      const pkgs = DB.byMember('purchases', ctx.memberId).filter((p) => f.any || p.category === f.cat);
      const opts = pkgs.filter((p) => p.id === v || (remaining(p) > 0 && !expired(p)) || f.any);
      if (v === undefined && !f.any) { v = activePkgs(ctx.memberId, f.cat)[0]?.id || ''; }
      input = `<select id="${id}" name="${f.k}"><option value="">${f.any ? '（不指定）' : '不扣課程（單次付費／體驗）'}</option>${opts.map((p) => `<option value="${p.id}"${p.id === v ? ' selected' : ''}>${esc(p.name)}・剩 ${remaining(p)} 堂${p.expiry ? '・到期 ' + p.expiry : ''}</option>`).join('')}</select>`; break;
    }
    case 'member': {
      const ms = DB.all('members').sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
      input = `<select id="${id}" name="${f.k}"${req}><option value="">請選擇會員</option>${ms.map((m) => `<option value="${m.id}"${m.id === v ? ' selected' : ''}>${esc(m.name)}${m.phone ? '・' + esc(m.phone) : ''}</option>`).join('')}</select>`; break;
    }
    case 'exercises': {
      const rows = Array.isArray(v) && v.length ? v : [{}, {}, {}];
      input = `<div class="ex" data-name="${f.k}"><div class="ex-head"><span>動作</span><span>重量</span><span>次數</span><span>組數</span><span></span></div>${rows.map(exRow).join('')}<button type="button" class="btn ghost small" data-addex>＋ 新增動作</button></div>`; break;
    }
    default:
      input = `<input id="${id}" name="${f.k}" type="${f.type}" value="${esc(v)}"${f.type === 'number' ? ' inputmode="decimal" step="any"' : ''}${ph}${req}>`;
  }
  return `<label class="field${f.wide ? ' wide' : ''}"><span>${esc(f.label)}${f.required ? ' <b>*</b>' : ''}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
}
const exRow = (e = {}) => `<div class="ex-row"><input placeholder="例：深蹲" value="${esc(e.name)}" list="exlist"><input placeholder="kg" value="${esc(e.weight)}"><input placeholder="次" inputmode="numeric" value="${esc(e.reps)}"><input placeholder="組" inputmode="numeric" value="${esc(e.sets)}"><button type="button" class="x" data-delex>✕</button></div>`;

function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'chips') {
      out[f.k] = $$(`.chips[data-name="${f.k}"] .chip.on`, form).map((c) => c.dataset.v);
    } else if (f.type === 'exercises') {
      out[f.k] = $$('.ex-row', form).map((r) => { const i = $$('input', r).map((x) => x.value.trim()); return { name: i[0], weight: i[1], reps: i[2], sets: i[3] }; }).filter((e) => e.name);
    } else {
      const el = form.elements.namedItem(f.k);
      if (!el) continue;
      out[f.k] = f.type === 'number' ? num(el.value) : el.value.trim();
    }
  }
  return out;
}

function openModal(html, { wide } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet${wide ? ' wide' : ''}">${html}</div>`;
  m.classList.add('open');
  document.body.classList.add('noscroll');
  return m.firstElementChild;
}
function closeModal() {
  const m = $('#modal');
  m.classList.remove('open');
  m.innerHTML = '';
  document.body.classList.remove('noscroll');
}

function editRecord(store, rec = {}, ctx = {}) {
  const fields = F[store];
  const isNew = !rec.id;
  const vals = { ...rec };
  if (isNew) for (const f of fields) if (vals[f.k] === undefined && f.def !== undefined) vals[f.k] = typeof f.def === 'function' ? f.def() : f.def;
  if (store === 'contracts' && isNew && !vals.content) vals.content = fillTemplate(ctx.memberId, null, vals);
  const sheet = openModal(`
    <form class="form">
      <header class="sheet-head"><button type="button" class="btn ghost" data-close>取消</button><h2>${isNew ? '新增' : '編輯'}${TITLES[store]}${ctx.memberId && store !== 'members' ? `・${esc(memberName(ctx.memberId))}` : ''}</h2><button class="btn primary" type="submit">儲存</button></header>
      <div class="grid">${fields.map((f) => fieldHTML(f, vals[f.k], ctx)).join('')}</div>
      ${!isNew ? `<div class="danger-zone"><button type="button" class="btn danger" data-del>刪除這筆${TITLES[store]}</button></div>` : ''}
    </form>`, { wide: true });
  const form = $('form', sheet);

  if (store === 'contracts') {
    const sync = () => {
      const pid = form.elements.purchaseId.value;
      const p = pid && DB.get('purchases', pid);
      if (p) {
        if (!form.elements.amount.value) form.elements.amount.value = p.price ?? '';
        if (p.date) form.elements.start.value = p.date;
        if (p.expiry) form.elements.end.value = p.expiry;
      }
      if (isNew) form.elements.content.value = fillTemplate(ctx.memberId, p, readForm(form, fields));
    };
    form.elements.purchaseId.addEventListener('change', sync);
    ['start', 'end', 'amount'].forEach((k) => form.elements[k].addEventListener('change', () => { if (isNew) form.elements.content.value = fillTemplate(ctx.memberId, DB.get('purchases', form.elements.purchaseId.value), readForm(form, fields)); }));
  }

  form.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && !chip.hasAttribute('data-add')) { chip.classList.toggle('on'); return; }
    if (e.target.closest('[data-add]')) {
      const v = prompt('輸入其他選項');
      if (v && v.trim()) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip on'; b.dataset.v = v.trim(); b.textContent = v.trim(); e.target.closest('[data-add]').before(b); }
      return;
    }
    if (e.target.closest('[data-addex]')) { e.target.closest('[data-addex]').insertAdjacentHTML('beforebegin', exRow()); return; }
    if (e.target.closest('[data-delex]')) { e.target.closest('.ex-row').remove(); return; }
    if (e.target.closest('[data-close]')) { closeModal(); return; }
    if (e.target.closest('[data-del]')) {
      if (confirm(`確定要刪除這筆${TITLES[store]}嗎？`)) {
        DB.remove(store, rec.id).then(() => { closeModal(); toast('已刪除'); if (store === 'members') location.hash = '#/members'; });
      }
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm(form, fields);
    const saved = await DB.save(store, { ...rec, ...data, ...(ctx.memberId && store !== 'members' && store !== 'appointments' ? { memberId: ctx.memberId } : {}) });
    closeModal();
    toast('已儲存' + (navigator.onLine ? '' : '（離線，連網後自動上傳）'));
    if (ctx.after) ctx.after(saved);
  });
}

// ================= 合約與簽名 =================
function fillTemplate(memberId, p, vals = {}) {
  const m = member(memberId) || {};
  const map = {
    '{會員姓名}': m.name || '', '{會員電話}': m.phone || '', '{工作室名稱}': SETTINGS.studioName,
    '{方案名稱}': p?.name || '＿＿＿＿＿＿', '{堂數}': p?.total ?? '＿＿', '{金額}': (vals.amount ?? p?.price ?? '') === '' || (vals.amount ?? p?.price) == null ? '＿＿＿＿' : Number(vals.amount ?? p.price).toLocaleString('zh-TW'),
    '{開始日}': vals.start || p?.date || '＿＿＿＿', '{結束日}': vals.end || p?.expiry || '＿＿＿＿',
  };
  return Object.entries(map).reduce((s, [k, v]) => s.split(k).join(String(v)), SETTINGS.contractTemplate);
}

function signaturePad(title) {
  return new Promise((resolve) => {
    const sheet = openModal(`
      <header class="sheet-head"><button type="button" class="btn ghost" data-cancel>取消</button><h2>${esc(title)}</h2><button type="button" class="btn primary" data-ok>完成</button></header>
      <p class="muted center">請在下方框內簽名（可用手指或 Apple Pencil）</p>
      <div class="sigwrap"><canvas class="sigpad"></canvas><div class="sigline">簽名處</div></div>
      <div class="center"><button type="button" class="btn ghost" data-clear>清除重簽</button></div>`, { wide: true });
    const cv = $('canvas', sheet);
    const ctx = cv.getContext('2d');
    const ratio = Math.max(window.devicePixelRatio || 1, 2);
    const rect = cv.getBoundingClientRect();
    cv.width = rect.width * ratio; cv.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d2a22';
    let drawing = false, last = null, dirty = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; last = pos(e); });
    cv.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      e.preventDefault();
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events) {
        const p = pos(ev);
        ctx.lineWidth = e.pointerType === 'pen' ? 1.2 + p.p * 3 : 2.6;
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        last = p; dirty = true;
      }
    });
    const end = () => { drawing = false; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-clear]')) { ctx.clearRect(0, 0, cv.width, cv.height); dirty = false; }
      if (e.target.closest('[data-cancel]')) { closeModal(); resolve(null); }
      if (e.target.closest('[data-ok]')) {
        if (!dirty) { toast('還沒有簽名喔'); return; }
        // 縮小存檔，減少資料量
        const out = document.createElement('canvas');
        const w = Math.min(900, rect.width * 2); out.width = w; out.height = w * rect.height / rect.width;
        const o = out.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
        o.drawImage(cv, 0, 0, out.width, out.height);
        const data = out.toDataURL('image/jpeg', 0.8);
        closeModal(); resolve(data);
      }
    });
  });
}

function contractDoc(c) {
  const m = member(c.memberId) || {};
  return `<article class="contract-doc">
    <h1>${esc(SETTINGS.studioName)}</h1>
    <h2>${esc(c.title)}</h2>
    <table class="kv">
      <tr><th>會員姓名</th><td>${esc(m.name)}</td><th>電話</th><td>${esc(m.phone)}</td></tr>
      <tr><th>合約期間</th><td>${esc(c.start || '')} ～ ${esc(c.end || '')}</td><th>金額</th><td>${c.amount != null ? money(c.amount) : ''}</td></tr>
    </table>
    <div class="contract-body">${nl2br(c.content)}</div>
    <div class="sigs">
      <div><div class="sigbox">${c.memberSig ? `<img src="${c.memberSig}" alt="會員簽名">` : ''}</div><div class="siglabel">甲方（會員）簽名</div></div>
      <div><div class="sigbox">${c.studioSig ? `<img src="${c.studioSig}" alt="工作室簽名">` : ''}</div><div class="siglabel">乙方（${esc(SETTINGS.studioName)}）簽名</div></div>
    </div>
    <p class="signed-at">簽署日期：${c.signedAt ? esc(new Date(c.signedAt).toLocaleString('zh-TW')) : '尚未簽署'}</p>
    ${SETTINGS.studioAddress || SETTINGS.studioPhone ? `<p class="studio-info">${esc(SETTINGS.studioAddress)} ${esc(SETTINGS.studioPhone)}</p>` : ''}
  </article>`;
}

function viewContract(id) {
  const c = DB.get('contracts', id);
  if (!c) return;
  const sheet = openModal(`
    <header class="sheet-head"><button type="button" class="btn ghost" data-close>關閉</button><h2>合約</h2><button type="button" class="btn primary" data-print>列印／存 PDF</button></header>
    <div class="contract-actions">
      <button class="btn" data-sig="memberSig">✍️ ${c.memberSig ? '重新' : ''}會員簽名</button>
      <button class="btn" data-sig="studioSig">✍️ ${c.studioSig ? '重新' : ''}工作室簽名</button>
      <button class="btn ghost" data-edit>編輯內容</button>
    </div>
    <div class="paper">${contractDoc(c)}</div>`, { wide: true });
  sheet.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) closeModal();
    if (e.target.closest('[data-print]')) printHTML(contractDoc(c), `${memberName(c.memberId)}_${c.title}`);
    if (e.target.closest('[data-edit]')) editRecord('contracts', c, { memberId: c.memberId, after: (s) => viewContract(s.id) });
    const b = e.target.closest('[data-sig]');
    if (b) {
      const who = b.dataset.sig;
      const img = await signaturePad(who === 'memberSig' ? `會員簽名：${memberName(c.memberId)}` : `${SETTINGS.studioName} 簽名`);
      if (img) {
        const upd = { ...c, [who]: img };
        if (upd.memberSig && !upd.signedAt) upd.signedAt = new Date().toISOString();
        const s = await DB.save('contracts', upd);
        toast('簽名已儲存');
        viewContract(s.id);
      } else viewContract(c.id);
    }
  });
}

function printHTML(html, title) {
  const area = $('#print-area');
  area.innerHTML = html;
  const old = document.title;
  document.title = title || old;
  setTimeout(() => { window.print(); document.title = old; }, 50);
}

// ================= 畫面 =================
const views = {};
const main = () => $('#main');

function render() {
  const [, route = '', id] = location.hash.replace(/^#\/?/, '#').split(/[#/]/);
  const r = route || 'home';
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === (r === 'member' ? 'members' : r)));
  const fn = views[r] || views.home;
  const scroll = render.lastRoute === location.hash ? window.scrollY : 0;
  main().innerHTML = fn(id);
  render.lastRoute = location.hash;
  window.scrollTo(0, scroll);
}

const empty = (t) => `<div class="empty">${t}</div>`;

views.home = () => {
  const today = ymd();
  const month = today.slice(0, 7);
  const appts = DB.all('appointments').filter((a) => a.date === today && a.status !== '取消').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const upcoming = DB.all('appointments').filter((a) => a.date > today && a.date <= addDays(today, 7) && a.status === '已預約').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const pk = DB.all('purchases').filter((p) => member(p.memberId));
  const low = pk.filter((p) => !expired(p) && remaining(p) > 0 && remaining(p) <= 2);
  const soon = pk.filter((p) => remaining(p) > 0 && p.expiry && p.expiry >= today && p.expiry <= addDays(today, 30));
  const unpaid = pk.filter((p) => owed(p) > 0);
  const mm = today.slice(5, 7);
  const bdays = DB.all('members').filter((m) => (m.birthday || '').slice(5, 7) === mm);
  const sessionsM = DB.all('sessions').filter((s) => (s.date || '').startsWith(month)).length;
  const servicesM = DB.all('services').filter((s) => (s.date || '').startsWith(month)).length;
  const inactive = DB.all('members').filter((m) => {
    const lastAct = [...DB.byMember('sessions', m.id), ...DB.byMember('services', m.id)].map((x) => x.date).sort().pop();
    return lastAct && lastAct < addDays(today, -30) && activePkgs(m.id).length;
  });

  const apptRow = (a) => `<a class="row" href="#/member/${a.memberId}"><span class="time">${a.date !== today ? fmtDate(a.date).slice(5) + ' ' : ''}${esc(a.time)}</span><span class="grow"><b>${esc(memberName(a.memberId))}</b> <span class="pill ${a.type === '健身' ? 'fit' : 'spa'}">${esc(a.type || '')}</span></span><span class="muted">${esc(a.status)}</span></a>`;
  const pkRow = (p, extra) => `<a class="row" href="#/member/${p.memberId}"><span class="grow"><b>${esc(memberName(p.memberId))}</b>・${esc(p.name)}</span><span class="muted">${extra}</span></a>`;

  return `
  <section class="hero">
    <div><h1>${esc(SETTINGS.studioName)}</h1><p class="muted">${fmtDate(today)}</p></div>
    <div class="hero-actions"><button class="btn primary" data-act="newMember">＋ 新增會員</button><button class="btn" data-act="newAppt">＋ 新增預約</button></div>
  </section>
  <section class="stats">
    <div class="stat"><span>會員人數</span><b>${DB.all('members').length}</b></div>
    <div class="stat"><span>本月營收</span><b>${money(revenueIn(month))}</b></div>
    <div class="stat"><span>本月健身課</span><b>${sessionsM}</b></div>
    <div class="stat"><span>本月芳療服務</span><b>${servicesM}</b></div>
  </section>
  <div class="cols">
    <section class="card"><h3>今日預約</h3>${appts.length ? appts.map(apptRow).join('') : empty('今天沒有預約')}</section>
    <section class="card"><h3>未來 7 天</h3>${upcoming.length ? upcoming.map(apptRow).join('') : empty('沒有預約')}</section>
    <section class="card warn"><h3>堂數快用完（≤2 堂）</h3>${low.length ? low.map((p) => pkRow(p, `剩 ${remaining(p)} 堂`)).join('') : empty('沒有')}</section>
    <section class="card warn"><h3>30 天內到期</h3>${soon.length ? soon.map((p) => pkRow(p, `${p.expiry} 到期・剩 ${remaining(p)} 堂`)).join('') : empty('沒有')}</section>
    ${unpaid.length ? `<section class="card warn"><h3>尚有未付款</h3>${unpaid.map((p) => pkRow(p, `欠 ${money(owed(p))}`)).join('')}</section>` : ''}
    ${inactive.length ? `<section class="card"><h3>超過 30 天沒來（還有剩餘堂數）</h3>${inactive.map((m) => `<a class="row" href="#/member/${m.id}"><span class="grow"><b>${esc(m.name)}</b></span><span class="muted">${esc(m.phone)}</span></a>`).join('')}</section>` : ''}
    <section class="card"><h3>本月壽星 🎂</h3>${bdays.length ? bdays.map((m) => `<a class="row" href="#/member/${m.id}"><span class="grow"><b>${esc(m.name)}</b></span><span class="muted">${m.birthday.slice(5).replace('-', '/')}</span></a>`).join('') : empty('沒有')}</section>
  </div>`;
};

let memberQuery = '';
views.members = () => {
  const q = memberQuery.toLowerCase();
  const ms = DB.all('members').filter((m) => !q || [m.name, m.phone, m.tags, m.line, m.email].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return `
  <section class="page-head"><h1>會員</h1><button class="btn primary" data-act="newMember">＋ 新增會員</button></section>
  <input class="search" type="search" placeholder="搜尋姓名、電話、標籤…" value="${esc(memberQuery)}" data-search>
  <div class="member-list">${ms.length ? ms.map((m) => {
    const pk = activePkgs(m.id);
    return `<a class="member-card" href="#/member/${m.id}">
      <div class="avatar">${esc((m.name || '?').slice(0, 1))}</div>
      <div class="grow"><b>${esc(m.name)}</b><div class="muted">${esc(m.phone || '')}</div>
      <div class="tags">${(m.tags || '').split(/[,，、]/).filter((t) => t.trim()).map((t) => `<span class="tag">${esc(t.trim())}</span>`).join('')}</div></div>
      <div class="right">${pk.map((p) => `<span class="pill ${p.category === 'fitness' ? 'fit' : 'spa'}">${CATS[p.category] || ''} 剩 ${remaining(p)}</span>`).join('')}</div>
    </a>`;
  }).join('') : empty(DB.all('members').length ? '找不到符合的會員' : '還沒有會員，點右上角「新增會員」開始吧')}</div>`;
};

let memberTab = 'overview';
views.member = (id) => {
  const m = member(id);
  if (!m) return empty('找不到這位會員');
  const pks = DB.byMember('purchases', id).sort(byDateDesc);
  const sessions = DB.byMember('sessions', id).sort(byDateDesc);
  const services = DB.byMember('services', id).sort(byDateDesc);
  const contracts = DB.byMember('contracts', id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const appts = DB.all('appointments').filter((a) => a.memberId === id).sort(byDateDesc);
  const meas = DB.byMember('measurements', id).sort(byDateDesc);
  const tabs = [['overview', '總覽'], ['purchases', `買課 ${pks.length}`], ['sessions', `上課 ${sessions.length}`], ['services', `服務 ${services.length}`], ['contracts', `合約 ${contracts.length}`], ['measurements', `身體數據 ${meas.length}`], ['appointments', `預約 ${appts.length}`]];
  const active = activePkgs(id);
  const tab = memberTab;
  const totalSpent = pks.reduce((s, p) => s + (Number(p.price) || 0), 0) + services.filter((s) => !s.purchaseId).reduce((s, x) => s + (Number(x.price) || 0), 0);

  let body = '';
  const pkgName = (pid) => { const p = DB.get('purchases', pid); return p ? esc(p.name) : '單次'; };
  if (tab === 'overview') {
    const info = [['電話', m.phone], ['性別', m.gender], ['生日', m.birthday ? `${m.birthday}（${age(m.birthday)} 歲）` : ''], ['Email', m.email], ['LINE', m.line], ['職業', m.occupation], ['身高', m.height ? m.height + ' cm' : ''], ['地址', m.address], ['緊急聯絡人', m.emergency], ['入會日期', m.joinDate], ['來源', m.source]].filter(([, v]) => v);
    body = `<div class="cols">
      <section class="card"><h3>基本資料</h3><dl class="info">${info.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>
      <section class="card"><h3>健康與需求</h3>
        ${m.allergy ? `<div class="alert">⚠️ 過敏：${nl2br(m.allergy)}</div>` : ''}
        ${m.health ? `<p><b>身體狀況／禁忌</b><br>${nl2br(m.health)}</p>` : ''}
        ${m.goals ? `<p><b>目標</b><br>${nl2br(m.goals)}</p>` : ''}
        ${m.note ? `<p><b>備註</b><br>${nl2br(m.note)}</p>` : ''}
        ${!m.allergy && !m.health && !m.goals && !m.note ? empty('尚未填寫') : ''}
      </section>
      <section class="card"><h3>有效課程</h3>${active.length ? active.map((p) => pkgBar(p)).join('') : empty('沒有剩餘堂數的課程')}<p class="muted">累計消費 ${money(totalSpent)}</p></section>
      <section class="card"><h3>最近紀錄</h3>${[...sessions.map((s) => ({ ...s, _t: '健身' })), ...services.map((s) => ({ ...s, _t: '芳療' }))].sort(byDateDesc).slice(0, 5).map((s) => `<div class="row"><span class="time">${esc(s.date)}</span><span class="grow"><span class="pill ${s._t === '健身' ? 'fit' : 'spa'}">${s._t}</span> ${esc(s._t === '健身' ? (s.focus || []).join('、') : s.item)}</span></div>`).join('') || empty('還沒有紀錄')}</section>
    </div>`;
  } else if (tab === 'purchases') {
    body = pks.length ? pks.map((p) => `<div class="rec" data-act="edit" data-store="purchases" data-id="${p.id}">
      <div class="rec-head"><span class="pill ${p.category === 'fitness' ? 'fit' : 'spa'}">${CATS[p.category] || ''}</span><b>${esc(p.name)}</b><span class="grow"></span><span>${money(p.price)}</span></div>
      ${pkgBar(p)}
      <div class="muted">購買 ${esc(p.date)}${p.method ? '・' + esc(p.method) : ''}${p.expiry ? '・到期 ' + esc(p.expiry) : ''}${owed(p) ? `・<span class="red">尚欠 ${money(owed(p))}</span>` : ''}</div>
      ${p.note ? `<div>${nl2br(p.note)}</div>` : ''}
    </div>`).join('') : empty('還沒有買課紀錄');
  } else if (tab === 'sessions') {
    body = sessions.length ? sessions.map((s) => `<div class="rec" data-act="edit" data-store="sessions" data-id="${s.id}">
      <div class="rec-head"><b>${fmtDate(s.date)} ${esc(s.time || '')}</b><span class="grow"></span><span class="muted">${pkgName(s.purchaseId)}${s.duration ? '・' + s.duration + ' 分' : ''}</span></div>
      ${(s.focus || []).length ? `<div class="tags">${s.focus.map((f) => `<span class="tag">${esc(f)}</span>`).join('')}</div>` : ''}
      ${(s.exercises || []).length ? `<table class="extable"><tr><th>動作</th><th>重量</th><th>次數</th><th>組數</th></tr>${s.exercises.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.weight)}</td><td>${esc(e.reps)}</td><td>${esc(e.sets)}</td></tr>`).join('')}</table>` : ''}
      ${s.condition ? `<p><b>狀況：</b>${nl2br(s.condition)}</p>` : ''}${s.rpe ? `<p><b>RPE：</b>${s.rpe}</p>` : ''}
      ${s.homework ? `<p><b>回家功課：</b>${nl2br(s.homework)}</p>` : ''}${s.note ? `<p><b>備註：</b>${nl2br(s.note)}</p>` : ''}
    </div>`).join('') : empty('還沒有上課紀錄');
  } else if (tab === 'services') {
    body = services.length ? services.map((s) => `<div class="rec" data-act="edit" data-store="services" data-id="${s.id}">
      <div class="rec-head"><b>${fmtDate(s.date)} ${esc(s.time || '')}</b><span>${esc(s.item || '')}</span><span class="grow"></span><span class="muted">${s.purchaseId ? pkgName(s.purchaseId) : s.price ? money(s.price) : '單次'}${s.duration ? '・' + s.duration + ' 分' : ''}</span></div>
      ${(s.oils || []).length ? `<p><b>精油：</b>${s.oils.map(esc).join('、')}</p>` : ''}${s.blend ? `<p><b>配方：</b>${esc(s.blend)}</p>` : ''}
      ${(s.areas || []).length ? `<p><b>部位：</b>${s.areas.map(esc).join('、')}${s.pressure ? `・力道 ${esc(s.pressure)}` : ''}</p>` : ''}
      ${s.before ? `<p><b>服務前：</b>${nl2br(s.before)}</p>` : ''}${s.after ? `<p><b>服務後：</b>${nl2br(s.after)}</p>` : ''}
      ${s.advice ? `<p><b>居家建議：</b>${nl2br(s.advice)}</p>` : ''}${s.note ? `<p><b>備註：</b>${nl2br(s.note)}</p>` : ''}
    </div>`).join('') : empty('還沒有服務紀錄');
  } else if (tab === 'contracts') {
    body = contracts.length ? contracts.map((c) => `<div class="rec" data-act="viewContract" data-id="${c.id}">
      <div class="rec-head"><b>${esc(c.title)}</b><span class="grow"></span>${c.memberSig ? '<span class="pill ok">已簽名</span>' : '<span class="pill warnp">未簽名</span>'}</div>
      <div class="muted">${esc(c.start || '')} ～ ${esc(c.end || '')}${c.amount != null ? '・' + money(c.amount) : ''}</div>
    </div>`).join('') : empty('還沒有合約');
  } else if (tab === 'measurements') {
    body = (meas.length >= 2 ? `<section class="card">${chart(meas.slice().reverse())}</section>` : '') + (meas.length ? `<div class="tablewrap"><table class="mtable"><tr><th>日期</th><th>體重</th><th>體脂%</th><th>肌肉量</th><th>腰圍</th><th>臀圍</th><th>胸圍</th><th>上臂</th><th>大腿</th></tr>${meas.map((x) => `<tr data-act="edit" data-store="measurements" data-id="${x.id}"><td>${esc(x.date)}</td><td>${x.weight ?? ''}</td><td>${x.bodyFat ?? ''}</td><td>${x.muscle ?? ''}</td><td>${x.waist ?? ''}</td><td>${x.hip ?? ''}</td><td>${x.chest ?? ''}</td><td>${x.arm ?? ''}</td><td>${x.thigh ?? ''}</td></tr>`).join('')}</table></div>` : empty('還沒有身體數據'));
  } else if (tab === 'appointments') {
    body = appts.length ? appts.map((a) => `<div class="rec" data-act="edit" data-store="appointments" data-id="${a.id}"><div class="rec-head"><b>${fmtDate(a.date)} ${esc(a.time)}</b><span class="pill ${a.type === '健身' ? 'fit' : 'spa'}">${esc(a.type || '')}</span><span class="grow"></span><span>${esc(a.status)}</span></div>${a.note ? `<div>${nl2br(a.note)}</div>` : ''}</div>`).join('') : empty('還沒有預約');
  }

  const addMap = { purchases: '＋ 買課', sessions: '＋ 上課紀錄', services: '＋ 服務紀錄', contracts: '＋ 合約', measurements: '＋ 身體數據', appointments: '＋ 預約' };
  return `
  <section class="member-head">
    <a href="#/members" class="back">‹ 會員</a>
    <div class="mh-main"><div class="avatar big">${esc(m.name.slice(0, 1))}</div>
      <div class="grow"><h1>${esc(m.name)}</h1><div class="muted">${esc(m.phone || '')}${m.allergy ? ' ・<span class="red">⚠️ 有過敏</span>' : ''}</div>
      <div class="tags">${active.map((p) => `<span class="pill ${p.category === 'fitness' ? 'fit' : 'spa'}">${esc(p.name)} 剩 ${remaining(p)} 堂</span>`).join('')}</div></div>
      <button class="btn ghost" data-act="edit" data-store="members" data-id="${m.id}">編輯資料</button>
    </div>
    <div class="quick">
      <button class="btn fitb" data-act="add" data-store="sessions">＋ 上課紀錄</button>
      <button class="btn spab" data-act="add" data-store="services">＋ 服務紀錄</button>
      <button class="btn" data-act="add" data-store="purchases">＋ 買課</button>
      <button class="btn" data-act="add" data-store="contracts">＋ 合約</button>
      <button class="btn" data-act="add" data-store="appointments">＋ 預約</button>
      <button class="btn" data-act="add" data-store="measurements">＋ 身體數據</button>
      <button class="btn ghost" data-act="printMember">🖨 列印</button>
    </div>
  </section>
  <nav class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</nav>
  ${addMap[tab] ? `<div class="tab-add"><button class="btn primary small" data-act="add" data-store="${tab}">${addMap[tab]}</button></div>` : ''}
  <div class="tab-body" data-member="${id}">${body}</div>`;
};

function pkgBar(p) {
  const t = Number(p.total) || 0, u = used(p), pct = t ? Math.min(100, (u / t) * 100) : 0;
  return `<div class="pkg"><div class="pkg-top"><span>${esc(p.name)}</span><span><b>剩 ${t - u}</b> / ${t} 堂${expired(p) ? ' <span class="red">已到期</span>' : ''}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
}

function chart(rows) {
  const W = 640, H = 220, P = 34;
  const series = [['weight', '體重 kg', 'var(--c1)'], ['bodyFat', '體脂 %', 'var(--c2)'], ['waist', '腰圍 cm', 'var(--c3)']]
    .map(([k, l, c]) => ({ k, l, c, pts: rows.filter((r) => r[k] != null && r[k] !== '').map((r) => ({ d: r.date, v: Number(r[k]) })) }))
    .filter((s) => s.pts.length >= 2);
  if (!series.length) return '';
  const dates = rows.map((r) => r.date);
  const t0 = new Date(dates[0]).getTime(), t1 = new Date(dates[dates.length - 1]).getTime() || t0 + 1;
  const x = (d) => P + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - P * 2);
  const lines = series.map((s) => {
    const vs = s.pts.map((p) => p.v); const mn = Math.min(...vs), mx = Math.max(...vs); const span = mx - mn || 1;
    const y = (v) => H - P - ((v - mn) / span) * (H - P * 2);
    const path = s.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const lastP = s.pts[s.pts.length - 1];
    return `<path d="${path}" fill="none" stroke="${s.c}" stroke-width="2.5" stroke-linejoin="round"/>${s.pts.map((p) => `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="3.5" fill="${s.c}"/>`).join('')}<text x="${x(lastP.d) + 6}" y="${y(lastP.v) + 4}" fill="${s.c}" font-size="12">${lastP.v}</text>`;
  }).join('');
  const legend = series.map((s) => { const f = s.pts[0].v, l = s.pts[s.pts.length - 1].v, d = +(l - f).toFixed(1); return `<span><i style="background:${s.c}"></i>${s.l}：${f} → ${l}（${d > 0 ? '+' : ''}${d}）</span>`; }).join('');
  return `<h3>變化趨勢</h3><div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" class="chart"><line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="var(--line)"/>${lines}<text x="${P}" y="${H - 10}" font-size="11" fill="var(--muted)">${dates[0]}</text><text x="${W - P}" y="${H - 10}" font-size="11" fill="var(--muted)" text-anchor="end">${dates[dates.length - 1]}</text></svg><p class="muted small">每條線各自縮放，看的是趨勢。</p>`;
}

let calStart = null;
views.calendar = () => {
  if (!calStart) { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); calStart = ymd(d); }
  const days = [...Array(7)].map((_, i) => addDays(calStart, i));
  const appts = DB.all('appointments');
  const today = ymd();
  return `
  <section class="page-head"><h1>預約行事曆</h1><button class="btn primary" data-act="newAppt">＋ 新增預約</button></section>
  <div class="calnav"><button class="btn ghost" data-act="week" data-d="-7">‹ 上週</button><b>${days[0].replace(/-/g, '/')} – ${days[6].slice(5).replace('-', '/')}</b><button class="btn ghost" data-act="week" data-d="0">本週</button><button class="btn ghost" data-act="week" data-d="7">下週 ›</button></div>
  <div class="week">${days.map((d) => {
    const list = appts.filter((a) => a.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return `<div class="day${d === today ? ' today' : ''}"><div class="day-h">${WEEK[new Date(d + 'T00:00').getDay()]} <b>${+d.slice(8)}</b><button class="mini" data-act="newAppt" data-date="${d}">＋</button></div>
      ${list.map((a) => `<div class="appt ${a.type === '健身' ? 'fit' : 'spa'} ${a.status === '取消' ? 'cancel' : ''}" data-act="edit" data-store="appointments" data-id="${a.id}"><b>${esc(a.time)}</b> ${esc(memberName(a.memberId))}<small>${esc(a.type || '')}・${esc(a.status)}</small>${a.status === '已預約' && a.date <= today ? `<button class="mini done" data-act="complete" data-id="${a.id}">✓ 完成並記錄</button>` : ''}</div>`).join('') || '<div class="muted small">—</div>'}
    </div>`;
  }).join('')}</div>`;
};

views.reports = () => {
  const now = new Date();
  const months = [...Array(12)].map((_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
  const data = months.map((m) => ({ m, fit: DB.all('purchases').filter((p) => p.category === 'fitness' && (p.date || '').startsWith(m)).reduce((s, p) => s + (+p.price || 0), 0), spa: DB.all('purchases').filter((p) => p.category !== 'fitness' && (p.date || '').startsWith(m)).reduce((s, p) => s + (+p.price || 0), 0) + DB.all('services').filter((s) => !s.purchaseId && (s.date || '').startsWith(m)).reduce((s, x) => s + (+x.price || 0), 0), cnt: DB.all('sessions').filter((s) => (s.date || '').startsWith(m)).length + DB.all('services').filter((s) => (s.date || '').startsWith(m)).length }));
  const max = Math.max(1, ...data.map((d) => d.fit + d.spa));
  const yr = String(now.getFullYear());
  const yTotal = revenueIn(yr);
  const top = DB.all('members').map((m) => ({ m, v: DB.byMember('purchases', m.id).reduce((s, p) => s + (+p.price || 0), 0) + DB.byMember('services', m.id).filter((s) => !s.purchaseId).reduce((s, x) => s + (+x.price || 0), 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10);
  const liability = DB.all('purchases').filter((p) => !expired(p) && remaining(p) > 0).reduce((s, p) => s + (+p.total ? (+p.price || 0) * remaining(p) / +p.total : 0), 0);
  const oilCount = {};
  DB.all('services').forEach((s) => (s.oils || []).forEach((o) => { oilCount[o] = (oilCount[o] || 0) + 1; }));
  const oils = Object.entries(oilCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `
  <section class="page-head"><h1>營收統計</h1></section>
  <section class="stats">
    <div class="stat"><span>${yr} 年營收</span><b>${money(yTotal)}</b></div>
    <div class="stat"><span>本月營收</span><b>${money(revenueIn(months[11]))}</b></div>
    <div class="stat"><span>未使用堂數價值</span><b>${money(liability)}</b></div>
    <div class="stat"><span>尚未收款</span><b>${money(DB.all('purchases').reduce((s, p) => s + owed(p), 0))}</b></div>
  </section>
  <section class="card"><h3>近 12 個月營收</h3><div class="legend"><span><i style="background:var(--c1)"></i>健身</span><span><i style="background:var(--c2)"></i>芳療按摩／其他</span></div>
    <div class="bars">${data.map((d) => `<div class="bcol" title="${d.m}：${money(d.fit + d.spa)}"><div class="bval">${d.fit + d.spa ? Math.round((d.fit + d.spa) / 1000) + 'k' : ''}</div><div class="bstack"><i style="height:${(d.spa / max) * 100}%;background:var(--c2)"></i><i style="height:${(d.fit / max) * 100}%;background:var(--c1)"></i></div><div class="blabel">${+d.m.slice(5)}月</div><div class="bcnt">${d.cnt} 堂</div></div>`).join('')}</div>
  </section>
  <div class="cols">
    <section class="card"><h3>消費排行</h3>${top.length ? top.map((x, i) => `<a class="row" href="#/member/${x.m.id}"><span class="time">${i + 1}</span><span class="grow">${esc(x.m.name)}</span><b>${money(x.v)}</b></a>`).join('') : empty('還沒有資料')}</section>
    <section class="card"><h3>常用精油</h3>${oils.length ? oils.map(([o, n]) => `<div class="row"><span class="grow">${esc(o)}</span><span class="muted">${n} 次</span></div>`).join('') : empty('還沒有資料')}</section>
  </div>
  <section class="card"><h3>匯出 Excel（CSV）</h3><p class="muted">可直接用 Excel 開啟。</p><div class="btnrow">${Object.keys(TITLES).map((s) => `<button class="btn" data-act="csv" data-store="${s}">${TITLES[s]}</button>`).join('')}</div></section>`;
};

views.settings = () => {
    const st = Sync.status;
  const def = Sync.defaults();
  return `
  <section class="page-head"><h1>設定</h1></section>
  <section class="card"><h3>☁️ 雲端同步</h3>
    ${Sync.configured() ? `
      <p>已連線到你的 Google 雲端</p>
      <p id="sync-text">${syncText(st)}</p>
      <div class="btnrow"><button class="btn primary" data-act="syncNow">立即同步</button><button class="btn ghost" data-act="logout">中斷連線</button></div>
    ` : `
      <p class="muted">連線後，資料會自動備份到你的 Google 試算表，合約與會員紀錄會存成 PDF 放進雲端硬碟的 gym 資料夾，電腦也會自動同步。未連線時資料只存在這台裝置。</p>
      <form class="grid" data-form="login">
        <label class="field wide"><span>雲端網址（Apps Script 網頁應用程式網址）</span><input name="url" value="${esc(def.url)}" placeholder="https://script.google.com/macros/s/……/exec" autocapitalize="off" autocorrect="off"></label>
        <label class="field wide"><span>通行碼</span><input name="token" autocapitalize="off" autocorrect="off" autocomplete="off"></label>
        <div class="field wide"><button class="btn primary">連線並開始同步</button></div>
      </form>`}
    <p class="muted small">待上傳：${st.pending} 筆</p>
  </section>
  <section class="card"><h3>🏠 工作室資訊（顯示在合約上）</h3>
    <form class="grid" data-form="studio">
      <label class="field"><span>工作室名稱</span><input name="studioName" value="${esc(SETTINGS.studioName)}"></label>
      <label class="field"><span>電話</span><input name="studioPhone" value="${esc(SETTINGS.studioPhone)}"></label>
      <label class="field wide"><span>地址</span><input name="studioAddress" value="${esc(SETTINGS.studioAddress)}"></label>
      <label class="field wide"><span>合約範本　<small>可用：{會員姓名} {工作室名稱} {方案名稱} {堂數} {金額} {開始日} {結束日}</small></span><textarea name="contractTemplate" rows="14">${esc(SETTINGS.contractTemplate)}</textarea></label>
      <div class="field wide btnrow"><button class="btn primary">儲存</button><button type="button" class="btn ghost" data-act="resetTemplate">還原預設合約範本</button></div>
    </form>
  </section>
  <section class="card"><h3>💾 備份</h3>
    <p class="muted">建議每月下載一次完整備份檔存到電腦。</p>
    <div class="btnrow"><button class="btn" data-act="backup">下載完整備份</button><label class="btn ghost">從備份檔還原<input type="file" accept=".json,application/json" data-import hidden></label></div>
  </section>
  <section class="card"><h3>📱 安裝到 iPad 主畫面</h3>
    <p>用 Safari 開啟本網站 → 點上方「分享」按鈕 → 選「加入主畫面」。之後從主畫面開啟，就像 App 一樣，沒有網路也能使用。</p>
    <p class="muted small">儲存空間：<span id="storage-info">計算中…</span></p>
  </section>`;
};

function syncText(st) {
  const last = st.last ? `（上次 ${st.last.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}）` : '';
  return ({ off: '尚未連線雲端，資料只存在這台裝置', offline: `離線中，${st.pending} 筆等待上傳`, syncing: '同步中…', ok: `已同步 ${last}`, error: `同步失敗：${st.error || ''}` })[st.state] || '';
}

function updateSyncBadge() {
  const st = Sync.status;
  const b = $('#sync-badge');
  const offline = !navigator.onLine;
  let cls = 'off', text = '只存本機';
  if (Sync.configured()) {
    if (offline) { cls = 'offline'; text = st.pending ? `離線・${st.pending} 筆待上傳` : '離線'; }
    else if (st.state === 'syncing') { cls = 'syncing'; text = '同步中'; }
    else if (st.state === 'error') { cls = 'error'; text = '同步失敗'; }
    else { cls = 'ok'; text = st.pending ? `${st.pending} 筆待上傳` : '已同步'; }
  } else if (offline) { cls = 'offline'; text = '離線'; }
  b.className = 'sync ' + cls;
  b.textContent = text;
}

// ================= CSV =================
function toCSV(store) {
  const fields = F[store];
  const rows = DB.all(store).sort(byDateDesc);
  const cols = store === 'members' ? [] : [{ k: '_member', label: '會員' }];
  const all = [...cols, ...fields.filter((f) => f.type !== 'member'), ...(store === 'appointments' ? [{ k: '_member', label: '會員' }] : []), ...(store === 'purchases' ? [{ k: '_used', label: '已用堂數' }, { k: '_left', label: '剩餘堂數' }] : [])];
  const uniq = all.filter((c, i) => all.findIndex((x) => x.k === c.k) === i);
  const val = (r, c) => {
    if (c.k === '_member') return memberName(r.memberId);
    if (c.k === '_used') return used(r);
    if (c.k === '_left') return remaining(r);
    const v = r[c.k];
    if (c.type === 'purchase') return DB.get('purchases', v)?.name || '';
    if (c.k === 'category') return CATS[v] || v || '';
    if (c.type === 'exercises') return (v || []).map((e) => `${e.name} ${e.weight || ''}${e.weight ? 'kg' : ''} ${e.reps || ''}x${e.sets || ''}`).join('；');
    if (Array.isArray(v)) return v.join('、');
    return v ?? '';
  };
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return '﻿' + [uniq.map((c) => q(c.label)).join(','), ...rows.map((r) => uniq.map((c) => q(val(r, c))).join(','))].join('\r\n');
}

function printMember(id) {
  const m = member(id);
  const sessions = DB.byMember('sessions', id).sort(byDateDesc);
  const services = DB.byMember('services', id).sort(byDateDesc);
  const pks = DB.byMember('purchases', id).sort(byDateDesc);
  printHTML(`<article class="contract-doc"><h1>${esc(SETTINGS.studioName)}・會員紀錄</h1><h2>${esc(m.name)}</h2>
    <p>電話：${esc(m.phone)}　生日：${esc(m.birthday)}　入會：${esc(m.joinDate)}</p>
    ${m.allergy ? `<p><b>過敏：</b>${nl2br(m.allergy)}</p>` : ''}${m.health ? `<p><b>身體狀況：</b>${nl2br(m.health)}</p>` : ''}${m.goals ? `<p><b>目標：</b>${nl2br(m.goals)}</p>` : ''}
    <h3>買課</h3><table class="kv">${pks.map((p) => `<tr><td>${esc(p.date)}</td><td>${esc(p.name)}</td><td>${money(p.price)}</td><td>剩 ${remaining(p)}/${p.total}</td></tr>`).join('')}</table>
    <h3>上課紀錄</h3><table class="kv">${sessions.map((s) => `<tr><td>${esc(s.date)}</td><td>${(s.focus || []).join('、')}</td><td>${(s.exercises || []).map((e) => esc(`${e.name} ${e.weight || ''} ${e.reps || ''}x${e.sets || ''}`)).join('<br>')}</td><td>${nl2br(s.note)}</td></tr>`).join('')}</table>
    <h3>服務紀錄</h3><table class="kv">${services.map((s) => `<tr><td>${esc(s.date)}</td><td>${esc(s.item)}</td><td>${(s.oils || []).join('、')}</td><td>${nl2br(s.after || s.note)}</td></tr>`).join('')}</table>
  </article>`, `${m.name}_會員紀錄`);
}

// ================= 事件 =================
const actions = {
  newMember: () => editRecord('members', {}, { after: (m) => { location.hash = '#/member/' + m.id; } }),
  newAppt: (d) => editRecord('appointments', d.date ? { date: d.date } : {}, {}),
  edit: (d) => {
    const rec = DB.get(d.store, d.id);
    if (rec) editRecord(d.store, rec, { memberId: rec.memberId });
  },
  add: (d) => {
    const mid = $('.tab-body')?.dataset.member || location.hash.split('/')[2];
    if (d.store === 'appointments') return editRecord('appointments', { memberId: mid, type: '健身' }, {});
    editRecord(d.store, {}, { memberId: mid, after: (s) => { if (d.store === 'contracts') viewContract(s.id); else { memberTab = d.store; render(); } } });
  },
  tab: (d) => { memberTab = d.tab; render(); },
  viewContract: (d) => viewContract(d.id),
  week: (d) => { if (+d.d === 0) calStart = null; else calStart = addDays(calStart, +d.d); render(); },
  complete: async (d) => {
    const a = DB.get('appointments', d.id);
    await DB.save('appointments', { ...a, status: '已完成' });
    const store = a.type === '健身' ? 'sessions' : 'services';
    editRecord(store, { date: a.date, time: a.time, duration: a.duration }, { memberId: a.memberId, after: () => toast('已記錄') });
  },
  csv: (d) => download(`${SETTINGS.studioName}_${TITLES[d.store]}_${ymd()}.csv`, toCSV(d.store), 'text/csv;charset=utf-8'),
  backup: () => download(`${SETTINGS.studioName}_完整備份_${ymd()}.json`, JSON.stringify(DB.exportAll()), 'application/json'),
  syncNow: async () => { await Sync.syncNow(); toast(syncText(Sync.status)); render(); },
  logout: async () => { if (confirm('中斷後資料仍會保留在這台裝置，但不再同步到雲端。確定中斷？')) { await Sync.logout(); render(); } },
  resetTemplate: () => { if (confirm('還原成預設合約範本？')) { $('[name=contractTemplate]').value = DEFAULT_SETTINGS.contractTemplate; } },
  printMember: () => printMember(location.hash.split('/')[2]),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#modal form')) return;
  e.preventDefault();
  e.stopPropagation();
  actions[el.dataset.act]?.(el.dataset);
});

document.addEventListener('input', (e) => {
  if (e.target.matches('[data-search]')) {
    memberQuery = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = $('[data-search]'); s.focus(); try { s.setSelectionRange(pos, pos); } catch (err) { /* */ }
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.matches('[data-import]')) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'huacaomu-studio') throw new Error('不是本系統的備份檔');
      const n = await DB.importAll(data);
      toast(`已還原 ${n} 筆資料`);
    } catch (err) { alert('還原失敗：' + err.message); }
  }
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f));
  if (f.dataset.form === 'login') {
    const btn = $('button', f); btn.disabled = true; btn.textContent = '連線中…';
    try {
      await Sync.connect(v.url, v.token);
      toast('連線成功，開始同步');
    } catch (err) { alert('連線失敗：' + err.message); }
    render();
  } else if (f.dataset.form === 'studio') {
    const cur = DB.get('settings', 'studio') || { id: 'studio' };
    await DB.save('settings', { ...cur, ...v });
    toast('已儲存');
  }
});

// ================= 啟動 =================
// 工作室設定存成 settings 資料表裡的一筆紀錄，才能跟著雲端同步到其他裝置
const loadSettings = () => { SETTINGS = { ...DEFAULT_SETTINGS, ...(DB.get('settings', 'studio') || {}) }; };

async function start() {
  await DB.init();
  loadSettings();
  await Sync.init();
  DB.onChange(() => {
    loadSettings();
    // 表單打開時不重畫，避免打字中被打斷
    if (!$('#modal').classList.contains('open')) render();
  });
  Sync.onStatus(() => {
    updateSyncBadge();
    const el = $('#sync-text');
    if (el) el.textContent = syncText(Sync.status);
  });
  window.addEventListener('online', updateSyncBadge);
  window.addEventListener('offline', updateSyncBadge);
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/member/')) memberTab = 'overview'; render(); });
  updateSyncBadge();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(console.error);
  if (navigator.storage?.estimate) {
    setInterval(async () => {
      const el = $('#storage-info');
      if (!el) return;
      const { usage } = await navigator.storage.estimate();
      const persisted = await navigator.storage.persisted?.();
      el.textContent = `已使用 ${(usage / 1024 / 1024).toFixed(1)} MB${persisted ? '・已設為永久保存' : ''}`;
    }, 1500);
  }
}

start();
