const NAMES = ['はる', 'みなと'];
const APP_VERSION = '1.0.0';

const STAMPS = [
  { id: 'ok', file: 'ok.png', label: 'OK' },
  { id: 'arigatou', file: 'arigatou.png', label: 'ありがとう' },
  { id: 'guts', file: 'guts.png', label: 'やったね' },
  { id: 'heart', file: 'heart.png', label: 'だいすき' },
];
const STAMP_FILE = Object.fromEntries(STAMPS.map((s) => [s.id, s.file]));

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
const privateToggleOtherEl = document.getElementById('private-toggle-other');
const itemList = document.getElementById('item-list');
const emptyMsg = document.getElementById('empty-msg');
const filterBtns = document.querySelectorAll('.filter-btn');
const personFilterBtns = document.querySelectorAll('.person-filter-btn');
const listControls = document.getElementById('list-controls');
const searchInput = document.getElementById('search-input');

const calendarToggleBtn = document.getElementById('calendar-toggle');
const calendarView = document.getElementById('calendar-view');
const calCloseBtn = document.getElementById('cal-close');
const calPrevBtn = document.getElementById('cal-prev');
const calNextBtn = document.getElementById('cal-next');
const calMonthLabel = document.getElementById('cal-month-label');
const calendarGrid = document.getElementById('calendar-grid');
const calendarDayPanel = document.getElementById('calendar-day-panel');
const calDayTitle = document.getElementById('cal-day-title');
const calDayItems = document.getElementById('cal-day-items');
const calDayAddForm = document.getElementById('cal-day-add-form');
const calDayAddInput = document.getElementById('cal-day-add-input');
const appFooterEl = document.getElementById('app-footer');
appFooterEl.textContent = `Ver.${APP_VERSION}`;

let myName = localStorage.getItem('yaritai_name') || '';
if (!NAMES.includes(myName)) myName = '';
let items = [];
let currentFilter = 'active';
let currentPerson = 'all';
let pollTimer = null;
let editingId = null;
let expandedIds = new Set();
let openStampFor = new Set();
let searchQuery = '';
let commentInputFocused = false;
let calendarMode = false;
let calendarMonth = new Date();
calendarMonth.setDate(1);
let selectedDate = null;

function otherName() {
  return NAMES.find((n) => n !== myName) || '相手';
}

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

// コメント入力中は自動更新で入力欄が消えてキーボードが閉じないようにする
document.addEventListener('focusin', (e) => {
  if (e.target.classList.contains('comment-input')) {
    commentInputFocused = true;
  }
});

document.addEventListener('focusout', (e) => {
  if (e.target.classList.contains('comment-input')) {
    commentInputFocused = false;
  }
});

// タスク達成時のちょっとした祝福エフェクト
const CELEBRATE_EMOJIS = ['✨', '🎉', '⭐', '💫'];

function celebrate(x, y) {
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('span');
    p.className = 'celebrate-particle';
    p.textContent = CELEBRATE_EMOJIS[Math.floor(Math.random() * CELEBRATE_EMOJIS.length)];
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 40;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.setProperty('--dx', Math.cos(angle) * distance + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * distance + 'px');
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

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
  privateToggleOtherEl.textContent = otherName();
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

function openCalendar() {
  calendarMode = true;
  listControls.classList.add('hidden');
  itemList.classList.add('hidden');
  emptyMsg.classList.add('hidden');
  calendarView.classList.remove('hidden');
  calendarToggleBtn.textContent = '📋';
  calendarToggleBtn.title = '一覧に戻る';
  triggerFadeIn(calendarView);
  renderCalendar();
  renderDayPanel();
}

function closeCalendar() {
  calendarMode = false;
  calendarView.classList.add('hidden');
  listControls.classList.remove('hidden');
  itemList.classList.remove('hidden');
  calendarToggleBtn.textContent = '📅';
  calendarToggleBtn.title = 'カレンダー';
  triggerFadeIn(itemList);
  render();
}

calendarToggleBtn.addEventListener('click', () => {
  if (calendarMode) {
    closeCalendar();
  } else {
    openCalendar();
  }
});

calCloseBtn.addEventListener('click', closeCalendar);

async function fetchItems() {
  try {
    const res = await fetch('/api/items?viewer=' + encodeURIComponent(myName));
    items = await res.json();
    if (!commentInputFocused) {
      renderCurrentView();
    }
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

async function addComment(itemId, text) {
  const res = await fetch(`/api/items/${itemId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, name: myName }),
  });
  const comment = await res.json();
  const item = items.find((i) => i.id === itemId);
  if (item) {
    if (!item.comments) item.comments = [];
    item.comments.push(comment);
  }
  renderCurrentView();
}

async function addStamp(itemId, stampId) {
  const res = await fetch(`/api/items/${itemId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: myName, stamp: stampId }),
  });
  const comment = await res.json();
  const item = items.find((i) => i.id === itemId);
  if (item) {
    if (!item.comments) item.comments = [];
    item.comments.push(comment);
  }
  renderCurrentView();
}

async function editComment(itemId, commentId, text) {
  const res = await fetch(`/api/items/${itemId}/comments/${commentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const updated = await res.json();
  const item = items.find((i) => i.id === itemId);
  if (item && item.comments) {
    const idx = item.comments.findIndex((c) => c.id === commentId);
    if (idx !== -1) item.comments[idx] = updated;
  }
  renderCurrentView();
}

async function deleteComment(itemId, commentId) {
  await fetch(`/api/items/${itemId}/comments/${commentId}`, { method: 'DELETE' });
  const item = items.find((i) => i.id === itemId);
  if (item && item.comments) {
    item.comments = item.comments.filter((c) => c.id !== commentId);
  }
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

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render();
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

function commentBodyHtml(c) {
  if (c.stamp) {
    const file = STAMP_FILE[c.stamp];
    return file
      ? `<div class="comment-text comment-stamp"><img src="/${file}" alt="${escapeHtml(c.text)}" class="stamp-img"></div>`
      : `<div class="comment-text">${escapeHtml(c.text)}</div>`;
  }
  return `<div class="comment-text">${escapeHtml(c.text)}</div>`;
}

function commentsHtml(item) {
  const comments = item.comments || [];
  const list = comments
    .map(
      (c) => `
        <div class="comment" data-owner="${escapeHtml(c.author)}" data-comment-id="${escapeHtml(c.id)}">
          <div class="comment-head">
            <div class="comment-head-info">
              <span class="comment-author">${escapeHtml(c.author)}</span>
              <span class="comment-time">${formatDate(c.createdAt)}</span>
            </div>
            ${
              c.author === myName
                ? `
            <span class="comment-actions">
              ${c.stamp ? '' : '<button type="button" class="comment-edit-btn" title="編集">✏️</button>'}
              <button type="button" class="comment-delete-btn" title="削除">🗑️</button>
            </span>`
                : ''
            }
          </div>
          ${commentBodyHtml(c)}
        </div>
      `
    )
    .join('');
  const stampPaletteHtml = openStampFor.has(item.id)
    ? `
    <div class="stamp-palette">
      ${STAMPS.map(
        (s) => `
        <button type="button" class="stamp-btn" data-stamp="${s.id}" title="${escapeHtml(s.label)}">
          <img src="/${s.file}" alt="${escapeHtml(s.label)}">
        </button>
      `
      ).join('')}
    </div>
  `
    : '';
  return `
    <div class="comment-thread">
      ${list || '<div class="comment-empty">まだコメントはありません</div>'}
      <div class="comment-add-row">
        <form class="comment-form" data-item-id="${escapeHtml(item.id)}">
          <input type="text" class="comment-input" placeholder="返信を入力…" maxlength="300" autocomplete="off">
          <button type="submit">送信</button>
        </form>
        <button type="button" class="stamp-toggle-btn" title="スタンプ">😊</button>
      </div>
      ${stampPaletteHtml}
    </div>
  `;
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
  const visibilityToggle =
    item.addedBy === myName
      ? `
      <label class="visibility-toggle">
        <input type="checkbox" class="visibility-checkbox" ${item.visibility === 'private' ? 'checked' : ''}>
        🔒 ${escapeHtml(otherName())}には見えません
      </label>
    `
      : '';
  return `
    <div class="item-expand">
      <div class="item-meta">${addedLine}</div>
      ${closedLine}
      ${visibilityToggle}
      ${commentsHtml(item)}
    </div>
  `;
}

function commentCountHtml(item) {
  const count = (item.comments || []).length;
  return count ? `<span class="comment-count">💬 ${count}</span>` : '';
}

function calAddBtnHtml(item) {
  if (!item.dueDate) return '';
  return `<a class="cal-add-btn" href="/api/items/${encodeURIComponent(item.id)}/ics" title="iPhoneカレンダーに追加">📆</a>`;
}

function itemToHtml(item) {
  const lockIcon = item.visibility === 'private' ? '<span class="lock-icon">🔒</span>' : '';
  const noteHtml = item.note ? `<div class="item-note">📝 ${escapeHtml(item.note)}</div>` : '';
  const closedClass = item.status !== 'active' ? 'closed' : '';
  const abandonedClass = item.status === 'abandoned' ? 'abandoned' : '';
  const abandonActiveClass = item.status === 'abandoned' ? 'active' : '';
  return `
    <li class="item ${closedClass} ${abandonedClass}" data-id="${escapeHtml(item.id)}" data-owner="${escapeHtml(item.addedBy)}">
      <div class="item-row">
        <div class="item-checkbox-wrap">
          <input type="checkbox" class="item-checkbox" ${item.status === 'done' ? 'checked' : ''}>
        </div>
        <div class="item-body">
          <div class="item-text">${lockIcon}${escapeHtml(item.text)}</div>
          ${noteHtml}
          ${dueBadgeHtml(item)}
          ${commentCountHtml(item)}
        </div>
        <div class="item-actions">
          ${calAddBtnHtml(item)}
          <button class="abandon-btn ${abandonActiveClass}" title="頓挫にする">🫧</button>
          <button class="edit-btn" title="編集">✏️</button>
          <button class="delete-btn" title="削除">🗑️</button>
        </div>
      </div>
      ${itemExpandHtml(item)}
    </li>
  `;
}

function render() {
  if (editingId !== null) return;

  let filtered = items;
  if (currentFilter !== 'all') filtered = filtered.filter((i) => i.status === currentFilter);
  if (currentPerson !== 'all') filtered = filtered.filter((i) => i.addedBy === currentPerson);
  if (searchQuery) {
    filtered = filtered.filter(
      (i) => i.text.toLowerCase().includes(searchQuery) || (i.note && i.note.toLowerCase().includes(searchQuery))
    );
  }

  emptyMsg.classList.toggle('hidden', filtered.length > 0);
  emptyMsg.textContent = searchQuery
    ? `「${searchInput.value.trim()}」に一致するタスクが見つかりません`
    : 'まだ何もありません。やりたいことを追加してみましょう！';

  itemList.innerHTML = filtered.map(itemToHtml).join('');
}

function handleItemClick(e) {
  const li = e.target.closest('.item');
  if (!li) return;
  const id = li.dataset.id;

  const stampBtn = e.target.closest('.stamp-btn');
  if (stampBtn) {
    openStampFor.delete(id);
    addStamp(id, stampBtn.dataset.stamp);
    return;
  }

  if (e.target.classList.contains('item-checkbox')) {
    if (e.target.checked) {
      const rect = e.target.getBoundingClientRect();
      celebrate(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
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
  } else if (e.target.classList.contains('comment-delete-btn')) {
    const commentDiv = e.target.closest('.comment');
    if (confirm('コメントを削除しますか？')) deleteComment(id, commentDiv.dataset.commentId);
  } else if (e.target.classList.contains('comment-edit-btn')) {
    const commentDiv = e.target.closest('.comment');
    startCommentEdit(commentDiv, id, commentDiv.dataset.commentId);
  } else if (e.target.classList.contains('stamp-toggle-btn')) {
    if (openStampFor.has(id)) openStampFor.delete(id);
    else openStampFor.add(id);
    renderCurrentView();
  }
}

itemList.addEventListener('click', handleItemClick);
calDayItems.addEventListener('click', handleItemClick);

function handleCommentSubmit(e) {
  const form = e.target.closest('.comment-form');
  if (!form) return;
  e.preventDefault();
  const itemId = form.dataset.itemId;
  const input = form.querySelector('.comment-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addComment(itemId, text);
}

itemList.addEventListener('submit', handleCommentSubmit);
calDayItems.addEventListener('submit', handleCommentSubmit);

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

function startCommentEdit(commentDiv, itemId, commentId) {
  const item = items.find((i) => i.id === itemId);
  const comment = item && (item.comments || []).find((c) => c.id === commentId);
  if (!comment) return;
  editingId = itemId;

  const textEl = commentDiv.querySelector('.comment-text');

  const form = document.createElement('div');
  form.className = 'comment-edit-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 300;
  input.value = comment.text;

  const actions = document.createElement('div');
  actions.className = 'comment-edit-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'comment-edit-cancel-btn';
  cancelBtn.textContent = 'キャンセル';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'comment-edit-save-btn';
  saveBtn.textContent = '保存';
  actions.append(cancelBtn, saveBtn);

  form.append(input, actions);
  textEl.replaceWith(form);

  input.focus();
  input.select();

  cancelBtn.addEventListener('click', () => {
    editingId = null;
    renderCurrentView();
  });

  saveBtn.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    editingId = null;
    editComment(itemId, commentId, text);
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
