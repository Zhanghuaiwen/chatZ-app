import { db } from "../db/index.js";

const now = () => Date.now();

export function generateId() {
  return now().toString(36) + Math.random().toString(36).slice(2);
}

const listStmt = db.prepare(
  `SELECT id, title, kind, kb_id, agent_id, head_id, created_at, updated_at
   FROM conversations ORDER BY updated_at DESC`,
);
const getStmt = db.prepare(`SELECT * FROM conversations WHERE id = ?`);
const upsertStmt = db.prepare(
  `INSERT INTO conversations (id, title, kind, kb_id, agent_id, head_id, created_at, updated_at)
   VALUES (@id, @title, @kind, @kb_id, @agent_id, @head_id, @created_at, @updated_at)
   ON CONFLICT(id) DO UPDATE SET
     title = excluded.title,
     kind = excluded.kind,
     kb_id = excluded.kb_id,
     agent_id = excluded.agent_id,
     head_id = excluded.head_id,
     updated_at = excluded.updated_at`,
);
const nodesStmt = db.prepare(
  `SELECT * FROM message_nodes WHERE conversation_id = ? ORDER BY created_at, rowid`,
);
const deleteNodesStmt = db.prepare(
  `DELETE FROM message_nodes WHERE conversation_id = ?`,
);
const insertNodeStmt = db.prepare(
  `INSERT INTO message_nodes
     (id, conversation_id, parent_id, role, content, attachments_json,
      provider, model, status, selected_child_id, created_at)
   VALUES
     (@id, @conversation_id, @parent_id, @role, @content, @attachments_json,
      @provider, @model, @status, @selected_child_id, @created_at)`,
);
const setChildStmt = db.prepare(
  `UPDATE message_nodes SET selected_child_id = ? WHERE id = ?`,
);
const updateHeadStmt = db.prepare(
  `UPDATE conversations SET head_id = ?, updated_at = ? WHERE id = ?`,
);

/** Rebuilds the visible flat message array by walking the tree from the
 *  root following each node's selected_child_id. */
function loadMessages(conversationId) {
  const nodes = nodesStmt.all(conversationId);
  if (!nodes.length) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byParent = new Map();
  for (const n of nodes) {
    const key = n.parent_id ?? "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(n);
  }

  const first = byParent.get("__root__")?.[0];
  if (!first) return nodes.map(toMessage);

  const out = [];
  let cur = first;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(toMessage(cur));
    const kids = byParent.get(cur.id) || [];
    cur = cur.selected_child_id
      ? byId.get(cur.selected_child_id)
      : kids[0];
  }
  return out;
}

function toMessage(node) {
  const msg = { id: node.id, role: node.role, content: node.content };
  if (node.attachments_json) {
    try {
      msg.attachments = JSON.parse(node.attachments_json);
    } catch {
      // ignore malformed attachment payloads
    }
  }
  return msg;
}

/** Writes the array of flat messages as a fresh linear chain, replacing any
 *  previous nodes for that conversation. Returns the new head node id. */
function writeMessages(conversationId, messages) {
  deleteNodesStmt.run(conversationId);
  if (!messages?.length) return null;

  const base = now();
  let prevId = null;
  let headId = null;

  messages.forEach((msg, i) => {
    const id = generateId();
    insertNodeStmt.run({
      id,
      conversation_id: conversationId,
      parent_id: prevId,
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : "",
      attachments_json: msg.attachments?.length
        ? JSON.stringify(msg.attachments)
        : null,
      provider: msg.provider ?? null,
      model: msg.model ?? null,
      status: msg.status ?? "complete",
      selected_child_id: null,
      created_at: base + i,
    });
    if (prevId) setChildStmt.run(id, prevId);
    prevId = id;
    headId = id;
  });

  return headId;
}

export function listConversations() {
  return listStmt.all().map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    kbId: row.kb_id,
    agentId: row.agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: loadMessages(row.id),
  }));
}

export function getConversation(id) {
  const row = getStmt.get(id);
  if (!row) return null;
  return { ...row, messages: loadMessages(id) };
}

/** Persists the whole app state snapshot: settings + activeId + conversations. */
export const saveConversations = db.transaction((conversations) => {
  const keepIds = [];

  for (const conv of conversations) {
    const existing = getStmt.get(conv.id);
    const createdAt = existing?.created_at ?? now();
    // Insert the conversation row first so message_nodes satisfies its FK.
    upsertStmt.run({
      id: conv.id,
      title: conv.title ?? "新对话",
      kind: conv.kind ?? "chat",
      kb_id: conv.kbId ?? null,
      agent_id: conv.agentId ?? null,
      head_id: null,
      created_at: createdAt,
      updated_at: now(),
    });
    const headId = writeMessages(conv.id, conv.messages);
    updateHeadStmt.run(headId, now(), conv.id);
    keepIds.push(conv.id);
  }

  if (keepIds.length) {
    const placeholders = keepIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM conversations WHERE id NOT IN (${placeholders})`).run(
      ...keepIds,
    );
  } else {
    db.prepare(`DELETE FROM conversations`).run();
  }
});
