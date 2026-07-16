const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 古い形式（done/doneBy/doneAt）のデータを status 形式に変換
function normalizeItem(item) {
  if (item.status) return item;
  const { done, doneBy, doneAt, ...rest } = item;
  return {
    ...rest,
    status: done ? 'done' : 'active',
    closedBy: doneBy || null,
    closedAt: doneAt || null,
  };
}

function loadItems() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const items = raw.trim() ? JSON.parse(raw) : [];
    return items.map(normalizeItem);
  } catch (e) {
    return [];
  }
}

function saveItems(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

// 未達成は期限が近い順、達成済み・頓挫は対応した日が新しい順
function compareItems(a, b) {
  const aActive = a.status === 'active';
  const bActive = b.status === 'active';
  if (aActive !== bActive) return aActive ? -1 : 1;
  if (aActive) {
    if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt - a.createdAt;
  }
  return (b.closedAt || 0) - (a.closedAt || 0);
}

// 一覧取得（viewer本人の分は private も含め、他人の private は除外）
app.get('/api/items', (req, res) => {
  const viewer = (req.query.viewer || '').trim();
  const items = loadItems()
    .filter((i) => i.visibility !== 'private' || i.addedBy === viewer)
    .sort(compareItems);
  res.json(items);
});

// 追加
app.post('/api/items', (req, res) => {
  const { text, name, visibility, note, dueDate } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const items = loadItems();
  const newItem = {
    id: crypto.randomUUID(),
    text: text.trim(),
    addedBy: (name || '').trim() || '匿名',
    createdAt: Date.now(),
    status: 'active',
    closedBy: null,
    closedAt: null,
    visibility: visibility === 'private' ? 'private' : 'shared',
    note: (note || '').trim(),
    dueDate: dueDate || null,
  };
  items.push(newItem);
  saveItems(items);
  res.status(201).json(newItem);
});

// 状態の切り替え（active / done / abandoned）
app.patch('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const { status, name } = req.body;
  if (!['active', 'done', 'abandoned'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  const items = loadItems();
  const item = items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });

  item.status = status;
  item.closedBy = status === 'active' ? null : (name || '').trim() || '匿名';
  item.closedAt = status === 'active' ? null : Date.now();
  saveItems(items);
  res.json(item);
});

// 編集（本文・メモ・期限）
app.put('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const { text, note, dueDate } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const items = loadItems();
  const item = items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });

  item.text = text.trim();
  item.note = (note || '').trim();
  item.dueDate = dueDate || null;
  saveItems(items);
  res.json(item);
});

// 削除
app.delete('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const items = loadItems();
  const filtered = items.filter((i) => i.id !== id);
  if (filtered.length === items.length) {
    return res.status(404).json({ error: 'not found' });
  }
  saveItems(filtered);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`やりたいことリストアプリ起動: http://localhost:${PORT}`);
});
