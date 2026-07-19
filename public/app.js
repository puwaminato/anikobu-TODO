const NAMES = ['はる', 'みなと'];

const nameGate = document.getElementById('name-gate');
const nameChoiceBtns = document.querySelectorAll('.name-choice-btn');
const appEl = document.getElementById('app');
const currentNameEl = document.getElementById('current-name');
const changeNameBtn = document.getElementById('change-name');
const addForm = document.getElementById('add-form');
const addInput = document.getElementById('add-input');
const detailsToggle = document.getElementById('details-toggle');
const addDetails = document.getElementById('add-details');
const addNote = document.getElementById('add-note');
const addDue = document.getElementById('add-due');
const privateCheckbox = document.getElementById('private-checkbox');
const itemList = document.getElementById('item-list');
const emptyMsg = document.getElementById('empty-msg');
const filterBtns = document.querySelectorAll('.filter-btn');
const personFilterBtns = document.querySelectorAll('.person-filter-btn');
const listControls = document.getElementById('list-controls');

const calendarToggleBtn = document.getElementById('calendar-toggle');
const calendarView = document.getElementById('calendar-view');
const calPrevBtn = document.getElementById('cal-prev');
const calNextBtn = document.getElementById('cal-next');
const calMonthLabel = document.getElementById('cal-month-label');
const calendarGrid = document.getElementById('calendar-grid');
const calendarDayPanel = document.getElementById('calendar-day-panel');
const calDayTitle = document.getElementById('cal-day-title');
const calDayItems = document.getElementById('cal-day-items');
const calDayAddForm = document.getElementById('cal-day-add-form');
const calDayAddInput = document.getElementById('cal-day-add-input');

let myName = localStorage.getItem('yaritai_name') || '';
if (!NAMES.includes(myName)) myName = '';
let items = [];
let currentFilter = 'active';
let currentPerson = 'all';
let pollTimer = null;
let editingId = null;
let expandedIds = new Set();
let calendarMode = false;
let calendarMonth = new Date();
calendarMonth.setDate(1);
let selectedDate = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// タップ位置に波紋を出す（録画時などにタップ箇所が分かるように）
function spawnRipple(x, y, size) {
  const ripple = document.createElement('span');
  ripple.className = 'tap-ripple';
  ripple.style.width = size + 'px';
  ripple.style.height = size + 'px';
  ripple.style.left = x - size / 2 + 'px';
  ripple.style.top = y - size / 2 + 'px';
  document.body.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

document.addEventListener('pointerdown', (e) => {
  const target = e.target.closest('button, .item-checkbox-wrap');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.3;
  spawnRipple(e.clientX, e.clientY, size);
});

// 画面・一覧が切り替わる時にフェードインさせる
function triggerFadeIn(el) {
  el.classList.remove('fade-in');
  void el.offsetWidth;
  el.classList.add('fade-in');
}

function showApp() {
  nameGate.classList.add('hidden');
  appEl.classList.remove('hidden');
  triggerFadeIn(appEl);
  currentNameEl.textContent = myName;
  fetchItems();
  if (!pollTimer) {
    pollTimer = setInterval(fetchItems, 4000);
  }
}

function showNameGate() {
  appEl.classList.add('hidden');
  nameGate.classList.remove('hidden');
  triggerFadeIn(nameGate);
}

nameChoiceBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    myName = btn.dataset.name;
    localStorage.setItem('yaritai_name', myName);
    showApp();
  });
});

changeNameBtn.addEventListener('click', showNameGate);

detailsToggle.addEventListener('click', () => {
  const isHidden = addDetails.classList.toggle('hidden');
  detailsToggle.textContent = isHidden ? '＋ メモ・期限を追加' : '－ メモ・期限を閉じる';
});

function renderCurrentView() {
  if (calendarMode) {
    renderCalendar();
    renderDayPanel();
  } else {
    render();
  }
}

calendarToggleBtn.addEventListener('click', () => {
  calendarMode = !calendarMode;
  if (calendarMode) {
    listControls.classList.add('hidden');
    itemList.classList.add('hidden');
    emptyMsg.classList.add('hidden');
    calendarView.classList.remove('hidden');
    calendarToggleBtn.textContent = '📋';
    calendarToggleBtn.title = '一覧に戻る';
    triggerFadeIn(calendarView);
    renderCalendar();
    renderDayPanel();
  } else {
    calendarView.classList.add('hidden');
    listControls.classList.remove('hidden');
    itemList.classList.remove('hidden');
    calendarToggleBtn.textContent = '📅';
    calendarToggleBtn.title = 'カレンダー';
    triggerFadeIn(itemList);
    render();
  }
});

async function fetchItems() {
  try {
    const res = await fetch('/api/items?viewer=' + encodeURIComponent(myName));
    items = await res.json();
    renderCurrentView();
  } catch (e) {
    console.error('取得失敗', e);
  }
}

async function addItem(text, isPrivate, note, dueDate) {
  const res = await fetch('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, name: myName, visibility: isPrivate ? 'private' : 'shared', note, dueDate }),
  });
  const newItem = await res.json();
  items.unshift(newItem);
  renderCurrentView();
}

async function setStatus(id, status) {
  const res = await fetch('/api/items/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, name: myName }),
  });
  const updated = await res.json();
  const idx = items.findIndex((i) => i.id === id);
  if (idx !== -1) items[idx] = updated;
  renderCurrentView();
}

async function setVisibility(id, visibility) {
  const res = await fetch('/api/items/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  });
  const updated = await res.json();
  const idx = items.findIndex((i) => i.id === id);
  if (idx !== -1) items[idx] = updated;
  renderCurrentView();
}

async function editItem(id, { text, note, dueDate }) {
  const res = await fetch('/api/items/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, note, dueDate }),
  });
  const updated = await res.json();
  const idx = items.findIndex((i) => i.id === id);
  if (idx !== -1) items[idx] = updated;
  renderCurrentView();
}

async function deleteItem(id) {
  await fetch('/api/items/' + id, { method: 'DELETE' });
  items = items.filter((i) => i.id !== id);
  renderCurrentView();
}

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = addInput.value.trim();
  if (!text) return;
  const isPrivate = privateCheckbox.checked;
  const note = addNote.value.trim();
  const dueDate = addDue.value || null;
  addInput.value = '';
  privateCheckbox.checked = false;
  addNote.value = '';
  addDue.value = '';
  addDetails.classList.add('hidden');
  detailsToggle.textContent = '＋ メモ・期限を追加';
  addItem(text, isPrivate, note, dueDate);
});

filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
    triggerFadeIn(itemList);
  });
});

personFilterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    personFilterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentPerson = btn.dataset.person;
    render();
    triggerFadeIn(itemList);
  });
});

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDueDate(dueDate) {
  const [, m, d] = dueDate.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function dueBadgeHtml(item) {
  if (!item.dueDate) return '';
  let cls = '';
  if (item.status === 'active') {
    const today = todayStr();
    if (item.dueDate < today) cls = 'overdue';
    else {
      const soonLimit = new Date();
      soonLimit.setDate(soonLimit.getDate() + 2);
      const soonStr = `${soonLimit.getFullYear()}-${String(soonLimit.getMonth() + 1).padStart(2, '0')}-${String(soonLimit.getDate()).padStart(2, '0')}`;
      if (item.dueDate <= soonStr) cls = 'soon';
    }
  }
  const label = cls === 'overdue' ? '期限切れ' : '期限';
  return `<span class="due-badge ${cls}">📅 ${label} ${formatDueDate(item.dueDate)}</span>`;
}

function itemExpandHtml(item) {
  if (!expandedIds.has(item.id)) return '';
  const addedLine = `追加: ${escapeHtml(item.addedBy)} (${formatDate(item.createdAt)})`;
  let closedLine = '';
  if (item.status === 'done') {
    closedLine = `<div class="item-meta">達成: ${escapeHtml(item.closedBy || '')}さん (${formatDate(item.closedAt)})</div>`;
  } else if (item.status === 'abandoned') {
    closedLine = `<div class="item-meta">頓挫: ${escapeHtml(item.closedBy || '')}さん (${formatDate(item.closedAt)})</div>`;
  }
  return `
    <div class="item-expand">
      <div class="item-meta">${addedLine}</div>
      ${closedLine}
      <label class="visibility-toggle">
        <input type="checkbox" class="visibility-checkbox" ${item.visibility === 'private' ? 'checked' : ''}>
        🔒 自分だけに表示（相手には見えません）
      </label>
    </div>
  `;
}

function itemToHtml(item) {
  const lockIcon = item.visibility === 'private' ? '<span class="lock-icon">🔒</span>' : '';
  const noteHtml = item.note ? `<div class="item-note">📝 ${escapeHtml(item.note)}</div>` : '';
  const closedClass = item.status !== 'active' ? 'closed' : '';
  const abandonedClass = item.status === 'abandoned' ? 'abandoned' : '';
  const abandonActiveClass = item.status === 'abandoned' ? 'active' : '';
  return `
    <li class="item ${closedClass} ${abandonedClass}" data-id="${escapeHtml(item.id)}" data-owner="${escapeHtml(item.addedBy)}">
      <div class="item-checkbox-wrap">
        <input type="checkbox" class="item-checkbox" ${item.status === 'done' ? 'checked' : ''}>
      </div>
      <div class="item-body">
        <div class="item-text">${lockIcon}${escapeHtml(item.text)}</div>
        ${noteHtml}
        ${dueBadgeHtml(item)}
        ${itemExpandHtml(item)}
      </div>
      <div class="item-actions">
        <button class="abandon-btn ${abandonActiveClass}" title="頓挫にする">🏳️</button>
        <button class="edit-btn" title="編集">✏️</button>
        <button class="delete-btn" title="削除">🗑️</button>
      </div>
    </li>
  `;
}

function render() {
  if (editingId !== null) return;

  let filtered = items;
  if (currentFilter !== 'all') filtered = filtered.filter((i) => i.status === currentFilter);
  if (currentPerson !== 'all') filtered = filtered.filter((i) => i.addedBy === currentPerson);

  emptyMsg.classList.toggle('hidden', filtered.length > 0);

  itemList.innerHTML = filtered.map(itemToHtml).join('');
}

function handleItemClick(e) {
  const li = e.target.closest('.item');
  if (!li) return;
  const id = li.dataset.id;

  if (e.target.classList.contains('item-checkbox')) {
    setStatus(id, e.target.checked ? 'done' : 'active');
  } else if (e.target.classList.contains('item-text')) {
    if (expandedIds.has(id)) expandedIds.delete(id);
    else expandedIds.add(id);
    renderCurrentView();
  } else if (e.target.classList.contains('visibility-checkbox')) {
    setVisibility(id, e.target.checked ? 'private' : 'shared');
  } else if (e.target.classList.contains('abandon-btn')) {
    const item = items.find((i) => i.id === id);
    setStatus(id, item && item.status === 'abandoned' ? 'active' : 'abandoned');
  } else if (e.target.classList.contains('delete-btn')) {
    if (confirm('削除しますか？')) deleteItem(id);
  } else if (e.target.classList.contains('edit-btn')) {
    startEdit(li, id);
  }
}

itemList.addEventListener('click', handleItemClick);
calDayItems.addEventListener('click', handleItemClick);

function startEdit(li, id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  editingId = id;

  const form = document.createElement('div');
  form.className = 'edit-form';

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.maxLength = 200;
  textInput.value = item.text;

  const noteInput = document.createElement('textarea');
  noteInput.maxLength = 500;
  noteInput.rows = 2;
  noteInput.placeholder = 'メモ（任意）';
  noteInput.value = item.note || '';

  const dueRow = document.createElement('div');
  dueRow.className = 'edit-form-row';
  dueRow.appendChild(document.createTextNode('期限 '));
  const dueInput = document.createElement('input');
  dueInput.type = 'date';
  dueInput.value = item.dueDate || '';
  dueRow.appendChild(dueInput);

  const actions = document.createElement('div');
  actions.className = 'edit-form-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'edit-cancel-btn';
  cancelBtn.textContent = 'キャンセル';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'edit-save-btn';
  saveBtn.textContent = '保存';
  actions.append(cancelBtn, saveBtn);

  form.append(textInput, noteInput, dueRow, actions);
  li.innerHTML = '';
  li.appendChild(form);

  textInput.focus();
  textInput.select();

  cancelBtn.addEventListener('click', () => {
    editingId = null;
    renderCurrentView();
  });

  saveBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (!text) {
      textInput.focus();
      return;
    }
    editingId = null;
    editItem(id, { text, note: noteInput.value.trim(), dueDate: dueInput.value || null });
  });
}

// ---- カレンダー ----
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function dateToStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  calMonthLabel.textContent = `${year}年${month + 1}月`;

  const datesWithItems = new Set(items.filter((i) => i.dueDate).map((i) => i.dueDate));
  const today = todayStr();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = WEEKDAY_LABELS.map((w) => `<div class="cal-weekday">${w}</div>`).join('');

  for (let i = 0; i < firstWeekday; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = dateToStr(year, month, d);
    const classes = ['cal-cell'];
    if (dateStr === today) classes.push('today');
    if (dateStr === selectedDate) classes.push('selected');
    const dot = datesWithItems.has(dateStr) ? '<span class="cal-dot"></span>' : '';
    html += `<div class="${classes.join(' ')}" data-date="${dateStr}">${d}${dot}</div>`;
  }

  calendarGrid.innerHTML = html;
}

function renderDayPanel() {
  if (editingId !== null) return;
  if (!selectedDate) {
    calendarDayPanel.classList.add('hidden');
    return;
  }
  calendarDayPanel.classList.remove('hidden');
  const [, m, d] = selectedDate.split('-');
  calDayTitle.textContent = `${Number(m)}月${Number(d)}日の予定`;

  const dayItems = items.filter((i) => i.dueDate === selectedDate);
  calDayItems.innerHTML = dayItems.length
    ? dayItems.map(itemToHtml).join('')
    : '<li class="cal-day-empty">この日の予定はまだありません</li>';
}

calendarGrid.addEventListener('click', (e) => {
  const cell = e.target.closest('.cal-cell:not(.empty)');
  if (!cell) return;
  selectedDate = cell.dataset.date;
  renderCalendar();
  renderDayPanel();
});

calPrevBtn.addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});

calNextBtn.addEventListener('click', () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

calDayAddForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = calDayAddInput.value.trim();
  if (!text || !selectedDate) return;
  calDayAddInput.value = '';
  const res = await fetch('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, name: myName, visibility: 'shared', note: '', dueDate: selectedDate }),
  });
  const newItem = await res.json();
  items.unshift(newItem);
  renderCalendar();
  renderDayPanel();
});

// 初期化
if (myName) {
  showApp();
} else {
  showNameGate();
}
