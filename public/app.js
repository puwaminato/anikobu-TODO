const NAMES = ['はる', 'みなと'];

const nameGate = document.getElementById('name-gate');
const nameChoiceBtns = document.querySelectorAll('.name-choice-btn');
const appEl = document.getElementById('app');
const currentNameEl = document.getElementById('current-name');
const changeNameBtn = document.getElementById('change-name');
const addForm = document.getElementById('add-form');
const addInput = document.getElementById('add-input');
const privateCheckbox = document.getElementById('private-checkbox');
const itemList = document.getElementById('item-list');
const emptyMsg = document.getElementById('empty-msg');
const filterBtns = document.querySelectorAll('.filter-btn');

let myName = localStorage.getItem('yaritai_name') || '';
if (!NAMES.includes(myName)) myName = '';
let items = [];
let currentFilter = 'all';
let pollTimer = null;
let editingId = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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

async function fetchItems() {
  try {
    const res = await fetch('/api/items?viewer=' + encodeURIComponent(myName));
    items = await res.json();
    render();
  } catch (e) {
    console.error('取得失敗', e);
  }
}

async function addItem(text, isPrivate) {
  const res = await fetch('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, name: myName, visibility: isPrivate ? 'private' : 'shared' }),
  });
  const newItem = await res.json();
  items.unshift(newItem);
  render();
}

async function toggleDone(id, done) {
  const res = await fetch('/api/items/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done, name: myName }),
  });
  const updated = await res.json();
  const idx = items.findIndex((i) => i.id === id);
  if (idx !== -1) items[idx] = updated;
  render();
}

async function editItemText(id, text) {
  const res = await fetch('/api/items/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
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
  addInput.value = '';
  privateCheckbox.checked = false;
  addItem(text, isPrivate);
});

filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function render() {
  if (editingId !== null) return;

  let filtered = items;
  if (currentFilter === 'active') filtered = items.filter((i) => !i.done);
  if (currentFilter === 'done') filtered = items.filter((i) => i.done);

  emptyMsg.classList.toggle('hidden', filtered.length > 0);

  itemList.innerHTML = filtered
    .map((item) => {
      const meta = item.done
        ? `${escapeHtml(item.doneBy || '')}さんが達成 (${formatDate(item.doneAt)}) / 追加: ${escapeHtml(item.addedBy)}`
        : `追加: ${escapeHtml(item.addedBy)} (${formatDate(item.createdAt)})`;
      const privateBadge = item.visibility === 'private' ? `<span class="private-badge">🔒 自分だけ</span><br>` : '';
      return `
        <li class="item ${item.done ? 'done' : ''}" data-id="${item.id}">
          <div class="item-checkbox-wrap">
            <input type="checkbox" class="item-checkbox" ${item.done ? 'checked' : ''}>
          </div>
          <div class="item-body">
            ${privateBadge}
            <div class="item-text">${escapeHtml(item.text)}</div>
            <div class="item-meta">${meta}</div>
          </div>
          <div class="item-actions">
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
    toggleDone(id, e.target.checked);
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
  const textDiv = li.querySelector('.item-text');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'item-text-input';
  input.value = item.text;
  input.maxLength = 200;
  textDiv.replaceWith(input);
  input.focus();
  input.select();

  const finish = async (shouldSave) => {
    editingId = null;
    const v = input.value.trim();
    if (shouldSave && v && v !== item.text) {
      await editItemText(id, v);
    } else {
      render();
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// 初期化
if (myName) {
  showApp();
} else {
  showNameGate();
}
