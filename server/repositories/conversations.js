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
      provider, model, status, selected_child_id, meta_json, created_at)
   VALUES
     (@id, @conversation_id, @parent_id, @role, @content, @attachments_json,
      @provider, @model, @status, @selected_child_id, @meta_json, @created_at)`,
);
const updateHeadStmt = db.prepare(
  `UPDATE conversations SET head_id = ?, updated_at = ? WHERE id = ?`,
);

function toNode(row) {
  const node = {
    id: row.id,
    parentId: row.parent_id,
    role: row.role,
    content: row.content,
    selectedChildId: row.selected_child_id,
    status: row.status,
    createdAt: row.created_at,
  };
  if (row.attachments_json) {
    try {
      node.attachments = JSON.parse(row.attachments_json);
    } catch {
      // ignore malformed attachment payloads
    }
  }
  if (row.meta_json) {
    try {
      const meta = JSON.parse(row.meta_json);
      if (meta.usage) node.usage = meta.usage;
    } catch {
      // ignore malformed meta payloads
    }
  }
  return node;
}

function loadNodes(conversationId) {
  return nodesStmt.all(conversationId).map(toNode);
}

/** Converts a legacy flat message array into a linear node tree. */
function chainFromMessages(messages) {
  const base = now();
  const nodes = [];
  let prevId = null;
  (messages || []).forEach((m, i) => {
    const id = generateId();
    nodes.push({
      id,
      parentId: prevId,
      role: m.role,
      content: typeof m.content === "string" ? m.content : "",
      attachments: m.attachments?.length ? m.attachments : undefined,
      usage: m.usage,
      selectedChildId: null,
      createdAt: base + i,
    });
    if (prevId) nodes[nodes.length - 2].selectedChildId = id;
    prevId = id;
  });
  return { nodes, headId: prevId };
}

/** Replaces all nodes for a conversation with the given tree. Accepts either
 *  `conv.nodes` (tree) or a legacy `conv.messages` (flat chain). Returns the
 *  head node id to store on the conversation row. */
function writeTree(conversationId, conv) {
  deleteNodesStmt.run(conversationId);

  let nodes;
  let headId;
  if (Array.isArray(conv.nodes)) {
    nodes = conv.nodes;
    headId = conv.headId ?? null;
  } else {
    const chain = chainFromMessages(conv.messages);
    nodes = chain.nodes;
    headId = conv.headId ?? chain.headId;
  }
  if (!nodes.length) return null;

  for (const n of nodes) {
    insertNodeStmt.run({
      id: n.id,
      conversation_id: conversationId,
      parent_id: n.parentId ?? null,
      role: n.role,
      content: typeof n.content === "string" ? n.content : "",
      attachments_json: n.attachments?.length
        ? JSON.stringify(n.attachments)
        : null,
      provider: n.provider ?? null,
      model: n.model ?? null,
      status: n.status ?? "complete",
      selected_child_id: n.selectedChildId ?? null,
      meta_json: n.usage ? JSON.stringify({ usage: n.usage }) : null,
      created_at: n.createdAt ?? now(),
    });
  }

  const ids = new Set(nodes.map((n) => n.id));
  return ids.has(headId) ? headId : nodes[nodes.length - 1].id;
}

export function listConversations() {
  return listStmt.all().map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    kbId: row.kb_id,
    agentId: row.agent_id,
    headId: row.head_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nodes: loadNodes(row.id),
  }));
}

export function getConversation(id) {
  const row = getStmt.get(id);
  if (!row) return null;
  return { ...row, nodes: loadNodes(id) };
}

/** Persists the whole app state snapshot: settings + activeId + conversations.
 *  Concurrency: a single write transaction per request. */
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
    const headId = writeTree(conv.id, conv);
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
