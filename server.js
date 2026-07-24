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
      due_date TEXT,
      sort_order DOUBLE PRECISION,
      repeat_type TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      stamp TEXT
    )
  `);
  // 既存テーブルに stamp / sort_order / repeat_type 列がなければ追加する（マイグレーション）
  await pool.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS stamp TEXT`);
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS sort_order DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS repeat_type TEXT`);
}

// スタンプの種類（id → 表示用ラベル）。追加時のバリデーションにも使う
const STAMPS = {
  ok: 'OK',
  arigatou: 'ありがとう',
  guts: 'やったね',
  heart: 'だいすき',
};

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
    sortOrder: row.sort_order !== null && row.sort_order !== undefined ? Number(row.sort_order) : null,
    repeat: row.repeat_type || null,
  };
}

function rowToComment(row) {
  return {
    id: row.id,
    author: row.author,
    text: row.text,
    stamp: row.stamp || null,
    createdAt: Number(row.created_at),
  };
}

// ---- ファイル保存（DATABASE_URL 未設定時のローカル動作用） ----
function normalizeItem(item) {
  if (item.status) return { comments: [], ...item };
  const { done, doneBy, doneAt, ...rest } = item;
  return {
    comments: [],
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
    const items = rows.map(rowToItem);
    const { rows: commentRows } = await pool.query('SELECT * FROM comments ORDER BY created_at ASC');
    const commentsByItem = {};
    for (const cr of commentRows) {
      if (!commentsByItem[cr.item_id]) commentsByItem[cr.item_id] = [];
      commentsByItem[cr.item_id].push(rowToComment(cr));
    }
    for (const item of items) {
      item.comments = commentsByItem[item.id] || [];
    }
    return items;
  }
  return loadItemsFromFile();
}

async function insertItem(item) {
  if (pool) {
    await pool.query(
      `INSERT INTO items (id, text, added_by, created_at, status, closed_by, closed_at, visibility, note, due_date, repeat_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [item.id, item.text, item.addedBy, item.createdAt, item.status, item.closedBy, item.closedAt, item.visibility, item.note, item.dueDate, item.repeat]
    );
    return;
  }
  const items = loadItemsFromFile();
  items.push(item);
  saveItemsToFile(items);
}

async function addCommentToItem(itemId, author, text, stamp = null) {
  const comment = { id: crypto.randomUUID(), author, text, stamp, createdAt: Date.now() };
  if (pool) {
    await pool.query(
      `INSERT INTO comments (id, item_id, author, text, stamp, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [comment.id, itemId, comment.author, comment.text, comment.stamp, comment.createdAt]
    );
    return comment;
  }
  const items = loadItemsFromFile();
  const item = items.find((i) => i.id === itemId);
  if (!item) return null;
  if (!item.comments) item.comments = [];
  item.comments.push(comment);
  saveItemsToFile(items);
  return comment;
}

async function updateComment(itemId, commentId, text) {
  if (pool) {
    const { rows } = await pool.query(
      `UPDATE comments SET text=$2 WHERE id=$1 AND item_id=$3 RETURNING *`,
      [commentId, text, itemId]
    );
    return rows[0] ? rowToComment(rows[0]) : null;
  }
  const items = loadItemsFromFile();
  const item = items.find((i) => i.id === itemId);
  if (!item || !item.comments) return null;
  const comment = item.comments.find((c) => c.id === commentId);
  if (!comment) return null;
  comment.text = text;
  saveItemsToFile(items);
  return comment;
}

async function removeComment(itemId, commentId) {
  if (pool) {
    const { rowCount } = await pool.query(
      `DELETE FROM comments WHERE id=$1 AND item_id=$2`,
      [commentId, itemId]
    );
    return rowCount > 0;
  }
  const items = loadItemsFromFile();
  const item = items.find((i) => i.id === itemId);
  if (!item || !item.comments) return false;
  const before = item.comments.length;
  item.comments = item.comments.filter((c) => c.id !== commentId);
  if (item.comments.length === before) return false;
  saveItemsToFile(items);
  return true;
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

async function updateItemContent(id, text, note, dueDate, repeat) {
  if (pool) {
    const { rows } = await pool.query(
      `UPDATE items SET text=$2, note=$3, due_date=$4, repeat_type=$5 WHERE id=$1 RETURNING *`,
      [id, text, note, dueDate, repeat]
    );
    return rows[0] ? rowToItem(rows[0]) : null;
  }
  const items = loadItemsFromFile();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  item.text = text;
  item.note = note;
  item.dueDate = dueDate;
  item.repeat = repeat;
  saveItemsToFile(items);
  return item;
}

// 繰り返し設定を解除する（達成して次回分を作った直後、二重生成を防ぐため）
async function clearItemRepeat(id) {
  if (pool) {
    await pool.query('UPDATE items SET repeat_type=NULL WHERE id=$1', [id]);
    return;
  }
  const items = loadItemsFromFile();
  const item = items.find((i) => i.id === id);
  if (item) item.repeat = null;
  saveItemsToFile(items);
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

// 手動並び替え。渡された順番どおりに sort_order = 0,1,2... を振り直す
async function reorderItems(ids) {
  if (pool) {
    for (let i = 0; i < ids.length; i++) {
      await pool.query('UPDATE items SET sort_order=$2 WHERE id=$1', [ids[i], i]);
    }
    return;
  }
  const items = loadItemsFromFile();
  ids.forEach((id, i) => {
    const item = items.find((it) => it.id === id);
    if (item) item.sortOrder = i;
  });
  saveItemsToFile(items);
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

// ---- iPhoneカレンダー登録用の .ics ファイル生成 ----
function icsEscape(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function icsDateOf(dueDate) {
  return dueDate.replace(/-/g, '');
}

// 終日イベントの DTEND は「翌日」を指定する仕様のため+1日する
function icsNextDayOf(dueDate) {
  const [y, m, d] = dueDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function buildIcs(item) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//yaritai-list//JP',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${item.id}@anikobu-todo`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDateOf(item.dueDate)}`,
    `DTEND;VALUE=DATE:${icsNextDayOf(item.dueDate)}`,
    `SUMMARY:${icsEscape(item.text)}`,
  ];
  if (item.note) lines.push(`DESCRIPTION:${icsEscape(item.note)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// 繰り返し設定（daily/weekly/monthly）に応じて次の期限日を計算する
const REPEAT_TYPES = ['daily', 'weekly', 'monthly'];

function nextDueDateOf(dueDate, repeat) {
  const [y, m, d] = dueDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (repeat === 'daily') dt.setUTCDate(dt.getUTCDate() + 1);
  else if (repeat === 'weekly') dt.setUTCDate(dt.getUTCDate() + 7);
  else if (repeat === 'monthly') dt.setUTCMonth(dt.getUTCMonth() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// 未達成は「手動で並び替えた順（あれば）」＞「期限が近い順」、達成済み・頓挫は対応した日が新しい順
function compareItems(a, b) {
  const aActive = a.status === 'active';
  const bActive = b.status === 'active';
  if (aActive !== bActive) return aActive ? -1 : 1;
  if (aActive) {
    const aOrder = a.sortOrder;
    const bOrder = b.sortOrder;
    if (aOrder != null && bOrder != null) return aOrder - bOrder;
    if (aOrder != null) return -1;
    if (bOrder != null) return 1;
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

// 手動並び替え（未達成タスクのドラッグ&ドロップ）。渡された id の順番どおりに並び順を保存する
app.post('/api/items/reorder', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids is required' });
  }
  await reorderItems(ids);
  res.status(204).end();
});

// 追加
app.post('/api/items', async (req, res) => {
  const { text, name, visibility, note, dueDate, repeat } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  // 繰り返しは期限がある場合のみ意味を持つ
  const repeatValue = dueDate && REPEAT_TYPES.includes(repeat) ? repeat : null;
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
    sortOrder: null,
    repeat: repeatValue,
    comments: [],
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

    // 繰り返し設定のあるタスクを達成したら、次回分を自動で作成する
    if (status === 'done' && updated.repeat && updated.dueDate) {
      const nextItem = {
        id: crypto.randomUUID(),
        text: updated.text,
        addedBy: updated.addedBy,
        createdAt: Date.now(),
        status: 'active',
        closedBy: null,
        closedAt: null,
        visibility: updated.visibility,
        note: updated.note,
        dueDate: nextDueDateOf(updated.dueDate, updated.repeat),
        sortOrder: null,
        repeat: updated.repeat,
        comments: [],
      };
      await insertItem(nextItem);
      // 達成済みの方は繰り返し設定を外す（トグルで再度達成にしても二重生成しない）
      await clearItemRepeat(id);
      updated.repeat = null;
    }

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

// 編集（本文・メモ・期限・繰り返し）
app.put('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  const { text, note, dueDate, repeat } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const repeatValue = dueDate && REPEAT_TYPES.includes(repeat) ? repeat : null;
  const updated = await updateItemContent(id, text.trim(), (note || '').trim(), dueDate || null, repeatValue);
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

// iPhoneカレンダーに追加できる .ics ファイルを返す（期限があるタスクのみ）
app.get('/api/items/:id/ics', async (req, res) => {
  const { id } = req.params;
  const items = await getAllItems();
  const item = items.find((i) => i.id === id);
  if (!item || !item.dueDate) return res.status(404).send('not found');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="event.ics"');
  res.send(buildIcs(item));
});

// コメント（返信）を追加。stamp が指定された場合はスタンプコメントとして扱う
app.post('/api/items/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { text, name, stamp } = req.body;

  let commentText = (text || '').trim();
  let stampId = null;
  if (stamp) {
    if (!STAMPS[stamp]) return res.status(400).json({ error: 'invalid stamp' });
    stampId = stamp;
    commentText = STAMPS[stamp];
  }
  if (!commentText) {
    return res.status(400).json({ error: 'text is required' });
  }

  if (pool) {
    const { rows } = await pool.query('SELECT id FROM items WHERE id=$1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
  }
  const comment = await addCommentToItem(id, (name || '').trim() || '匿名', commentText, stampId);
  if (!comment) return res.status(404).json({ error: 'not found' });
  res.status(201).json(comment);
});

// コメント編集
app.put('/api/items/:id/comments/:commentId', async (req, res) => {
  const { id, commentId } = req.params;
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const updated = await updateComment(id, commentId, text.trim());
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

// コメント削除
app.delete('/api/items/:id/comments/:commentId', async (req, res) => {
  const { id, commentId } = req.params;
  const ok = await removeComment(id, commentId);
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
