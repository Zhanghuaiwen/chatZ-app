-- ChatZ local database schema (P1)
-- Single local user, no auth. WAL keeps reads fast while we debounce-write.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Generic key/value bag: holds the serialized `settings` object and `activeId`.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT    NOT NULL DEFAULT '新对话',
  kind       TEXT    NOT NULL DEFAULT 'chat', -- chat | rag | agent
  kb_id      TEXT,
  agent_id   TEXT,
  head_id    TEXT,                            -- active leaf in the message tree
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Messages are stored as a tree of nodes. P1 writes a linear chain
-- (parent_id = previous node); P3 turns this into real branches.
CREATE TABLE IF NOT EXISTS message_nodes (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_id         TEXT,
  role              TEXT    NOT NULL,          -- system | user | assistant
  content           TEXT    NOT NULL DEFAULT '',
  attachments_json  TEXT,
  provider          TEXT,
  model             TEXT,
  status            TEXT    NOT NULL DEFAULT 'complete', -- complete | streaming | error | aborted
  selected_child_id TEXT,                      -- which child is on the active path
  meta_json         TEXT,                      -- extras (e.g. token usage)
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_conv   ON message_nodes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON message_nodes(conversation_id, parent_id);
