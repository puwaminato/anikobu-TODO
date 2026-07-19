const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const DATABASE_URL = process.env.DATABASE_URL;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// DATABASE_URL が設定されていれば Postgres（Supabase等）、
// なければローカルファイル（data.json）に保存する。
let pool = null;
if (DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      added_by TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      closed_by TEXT,
      closed_at BIGINT,
      visibility TEXT NOT NULL DEFAULT 'shared',
      note TEXT DEFAULT '',
      due_date TEXT
    )
  `);
}

function rowToItem(row) {
  return {
    id: row.id,
    text: row.text,
    addedBy: row.added_by,
    createdAt: Number(row.created_at),
    status: row.status,
    closedBy: row.closed_by,
    closedAt: row.closed_at !== null ? Number(row.closed_at) : null,
    visibility: row.visibility,
    note: row.note || '',
    dueDate: row.due_date,
  };
}

// ---- ファイル保存（DATABASE_URL 未設定時のローカル動作用） ----
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

function loadItemsFromFile() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const items = raw.trim() ? JSON.parse(raw) : [];
    return items.map(normalizeItem);
  } catch (e) {
    return [];
  }
}

function saveItemsToFile(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

// ---- データ操作（pool があれば Postgres、なければファイル） ----
async function getAllItems() {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM items');
    return rows.map(rowToItem);
  }
  return loadItemsFromFile();
}

async function insertItem(item) {
  if (pool) {
    await pool.query(
      `INSERT INTO items (id, text, added_by, created_at, status, closed_by, closed_at, visibility, note, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [item.id, item.text, item.addedBy, item.createdAt, item.status, item.closedBy, item.closedAt, item.visibility, item.note, item.dueDate]
    );
    return;
  }
  const items = loadItemsFromFile();
  items.push(item);
  saveItemsToFile(items);
}

async function updateItemStatus(id, status, closedBy, closedAt) {
  if (pool) {
    const { rows } = await pool.query(
      `UPDATE items SET status=$2, closed_by=$3, closed_at=$4 WHERE id=$1 RETURNING *`,
      [id, status, closedBy, closedAt]
    );
    return rows[0] ? rowToItem(rows[0]) : null;
  }
  const items = loadItemsFromFile();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  item.status = status;
  item.closedBy = closedBy;
  item.closedAt = closedAt;
  saveItemsToFile(items);
  return item;
}

async function updateItemContent(id, text, note, dueDate) {
  if (pool) {
    const { rows } = await pool.query(
      `UPDATE items SET text=$2, note=$3, due_date=$4 WHERE id=$1 RETURNING *`,
      [id, text, note, dueDate]
    );
    return rows[0] ? rowToItem(rows[0]) : null;
  }
  const items = loadItemsFromFile();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  item.text = text;
  item.note = note;
  item.dueDate = dueDate;
  saveItemsToFile(items);
  return item;
}

async function updateItemVisibility(id, visibility) {
  if (pool) {
    const { rows } = await pool.query(
      `UPDATE items SET visibility=$2 WHERE id=$1 RETURNING *`,
      [id, visibility]
    );
    return rows[0] ? rowToItem(rows[0]) : null;
  }
  const items = loadItemsFromFile();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  item.visibility = visibility;
  saveItemsToFile(items);
  return item;
}

async function removeItem(id) {
  if (pool) {
    const { rowCount } = await pool.query('DELETE FROM items WHERE id=$1', [id]);
    return rowCount > 0;
  }
  const items = loadItemsFromFile();
  const filtered = items.filter((i) => i.id !== id);
  if (filtered.length === items.length) return false;
  saveItemsToFile(filtered);
  return true;
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
app.get('/api/items', async (req, res) => {
  const viewer = (req.query.viewer || '').trim();
  const items = (await getAllItems())
    .filter((i) => i.visibility !== 'private' || i.addedBy === viewer)
    .sort(compareItems);
  res.json(items);
});

// 追加
app.post('/api/items', async (req, res) => {
  const { text, name, visibility, note, dueDate } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
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
  await insertItem(newItem);
  res.status(201).json(newItem);
});

// 状態（active / done / abandoned）または公開範囲（shared / private）の切り替え
app.patch('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  const { status, visibility, name } = req.body;

  if (status !== undefined) {
    if (!['active', 'done', 'abandoned'].includes(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const closedBy = status === 'active' ? null : (name || '').trim() || '匿名';
    const closedAt = status === 'active' ? null : Date.now();
    const updated = await updateItemStatus(id, status, closedBy, closedAt);
    if (!updated) return res.status(404).json({ error: 'not found' });
    return res.json(updated);
  }

  if (visibility !== undefined) {
    if (!['shared', 'private'].includes(visibility)) {
      return res.status(400).json({ error: 'invalid visibility' });
    }
    const updated = await updateItemVisibility(id, visibility);
    if (!updated) return res.status(404).json({ error: 'not found' });
    return res.json(updated);
  }

  res.status(400).json({ error: 'status or visibility is required' });
});

// 編集（本文・メモ・期限）
app.put('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  const { text, note, dueDate } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const updated = await updateItemContent(id, text.trim(), (note || '').trim(), dueDate || null);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

// 削除
app.delete('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  const ok = await removeItem(id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`やりたいことリストアプリ起動: http://localhost:${PORT}`);
      console.log(pool ? 'データ保存先: Postgres (DATABASE_URL)' : 'データ保存先: ローカルファイル (data.json)');
    });
  })
  .catch((err) => {
    console.error('DB初期化エラー', err);
    process.exit(1);
  });
