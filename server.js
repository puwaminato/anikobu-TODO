const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadItems() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveItems(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

// 一覧取得（viewer本人の分は private も含め、他人の private は除外）
app.get('/api/items', (req, res) => {
  const viewer = (req.query.viewer || '').trim();
  const items = loadItems()
    .filter((i) => i.visibility !== 'private' || i.addedBy === viewer)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(items);
});

// 追加
app.post('/api/items', (req, res) => {
  const { text, name, visibility } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const items = loadItems();
  const newItem = {
    id: crypto.randomUUID(),
    text: text.trim(),
    addedBy: (name || '').trim() || '匿名',
    createdAt: Date.now(),
    done: false,
    doneBy: null,
    doneAt: null,
    visibility: visibility === 'private' ? 'private' : 'shared',
  };
  items.push(newItem);
  saveItems(items);
  res.status(201).json(newItem);
});

// 完了/未完了の切り替え
app.patch('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const { done, name } = req.body;
  const items = loadItems();
  const item = items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });

  item.done = !!done;
  item.doneBy = item.done ? (name || '').trim() || '匿名' : null;
  item.doneAt = item.done ? Date.now() : null;
  saveItems(items);
  res.json(item);
});

// テキスト編集
app.put('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const items = loadItems();
  const item = items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });

  item.text = text.trim();
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
