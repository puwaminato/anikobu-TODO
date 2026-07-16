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

let myName = localStorage.getItem('yaritai_name') || '';
if (!NAMES.includes(myName)) myName = '';
let items = [];
let currentFilter = 'active';
let currentPerson = 'all';
let pollTimer = null;
let editingId = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showApp() {
  nameGate.classList.add('hidden');
  appEl.classList.remove('hidden');
  currentNameEl.textContent = myName;
  fetchItems();
  if (!pollTimer) {
    pollTimer = setInterval(fetchItems, 4000);
  }
}

function showNameGate() {
  appEl.classList.add('hidden');
  nameGate.classList.remove('hidden');
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

async function fetchItems() {
  try {
    const res = await fetch('/api/items?viewer=' + encodeURIComponent(myName));
    items = await res.json();
    render();
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
  render();
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
  render();
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
  render();
}

async function deleteItem(id) {
  await fetch('/api/items/' + id, { method: 'DELETE' });
  items = items.filter((i) => i.id !== id);
  render();
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
  });
});

personFilterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    personFilterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentPerson = btn.dataset.person;
    render();
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

function render() {
  if (editingId !== null) return;

  let filtered = items;
  if (currentFilter !== 'all') filtered = filtered.filter((i) => i.status === currentFilter);
  if (currentPerson !== 'all') filtered = filtered.filter((i) => i.addedBy === currentPerson);

  emptyMsg.classList.toggle('hidden', filtered.length > 0);

  itemList.innerHTML = filtered
    .map((item) => {
      let meta;
      if (item.status === 'done') {
        meta = `${escapeHtml(item.closedBy || '')}さんが達成 (${formatDate(item.closedAt)}) / 追加: ${escapeHtml(item.addedBy)}`;
      } else if (item.status === 'abandoned') {
        meta = `${escapeHtml(item.closedBy || '')}さんが頓挫 (${formatDate(item.closedAt)}) / 追加: ${escapeHtml(item.addedBy)}`;
      } else {
        meta = `追加: ${escapeHtml(item.addedBy)} (${formatDate(item.createdAt)})`;
      }
      const privateBadge = item.visibility === 'private' ? `<span class="private-badge">🔒 自分だけ</span><br>` : '';
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
            ${privateBadge}
            <div class="item-text">${escapeHtml(item.text)}</div>
            ${noteHtml}
            <div class="item-meta">${meta}</div>
            ${dueBadgeHtml(item)}
          </div>
          <div class="item-actions">
            <button class="abandon-btn ${abandonActiveClass}" title="頓挫にする">🏳️</button>
            <button class="edit-btn" title="編集">✏️</button>
            <button class="delete-btn" title="削除">🗑️</button>
          </div>
        </li>
      `;
    })
    .join('');
}

itemList.addEventListener('click', (e) => {
  const li = e.target.closest('.item');
  if (!li) return;
  const id = li.dataset.id;

  if (e.target.classList.contains('item-checkbox')) {
    setStatus(id, e.target.checked ? 'done' : 'active');
  } else if (e.target.classList.contains('abandon-btn')) {
    const item = items.find((i) => i.id === id);
    setStatus(id, item && item.status === 'abandoned' ? 'active' : 'abandoned');
  } else if (e.target.classList.contains('delete-btn')) {
    if (confirm('削除しますか？')) deleteItem(id);
  } else if (e.target.classList.contains('edit-btn')) {
    startEdit(li, id);
  }
});

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
    render();
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

// 初期化
if (myName) {
  showApp();
} else {
  showNameGate();
}
