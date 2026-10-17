/**
 * Pure helpers for the conversation message tree.
 *
 * A conversation is `{ id, title, nodes: Node[], headId }`.
 * A Node is `{ id, parentId, role, content, attachments?, usage?, status?,
 * selectedChildId, createdAt }`.
 *
 * The visible thread is the path from the root down to `headId`. Branching is
 * expressed by a parent whose children are ordered variants; `selectedChildId`
 * remembers which variant was last chosen so switching back is stable.
 */

export function indexNodes(nodes) {
  const byId = new Map();
  for (const n of nodes || []) byId.set(n.id, n);
  return byId;
}

/** The active root..head path (invisible branches excluded). */
export function getPath(conv) {
  const byId = indexNodes(conv?.nodes);
  const out = [];
  let cur = conv?.headId ? byId.get(conv.headId) : null;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return out.reverse();
}

/** Children of a given parent (pass null for roots), ordered by creation. */
export function childrenOf(nodes, parentId) {
  return (nodes || [])
    .filter((n) => (n.parentId ?? null) === (parentId ?? null))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/** Sibling variants of a node (including the node itself). */
export function variantsOf(conv, nodeId) {
  const node = indexNodes(conv?.nodes).get(nodeId);
  if (!node) return { siblings: [], index: -1, count: 0 };
  const siblings = childrenOf(conv.nodes, node.parentId ?? null);
  return {
    siblings,
    index: siblings.findIndex((n) => n.id === nodeId),
    count: siblings.length,
  };
}

/** Walks down from a node following `selectedChildId`, returning the leaf id. */
export function leafUnder(nodes, nodeId) {
  const byId = indexNodes(nodes);
  let cur = byId.get(nodeId);
  const seen = new Set();
  while (cur?.selectedChildId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = byId.get(cur.selectedChildId);
    if (!next) break;
    cur = next;
  }
  return cur?.id ?? nodeId;
}

/** Root..node path (inclusive) for a specific node. */
export function lineage(conv, nodeId) {
  const byId = indexNodes(conv?.nodes);
  const out = [];
  let cur = byId.get(nodeId);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return out.reverse();
}

/** Maps nodes to the provider-agnostic message shape sent to the server. */
export function toApiMessages(nodes) {
  return (nodes || []).map((n) => ({
    role: n.role,
    content: n.content,
    ...(n.attachments?.length ? { attachments: n.attachments } : {}),
  }));
}

// --- Immutable mutations (return a new conversation) ---------------------

export function updateNode(conv, nodeId, patch) {
  return {
    ...conv,
    nodes: conv.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
  };
}

/** Appends a node as the selected child of its parent and moves the head to it. */
export function appendNode(conv, node) {
  const parentId = node.parentId ?? null;
  const created = {
    content: "",
    status: "complete",
    selectedChildId: null,
    createdAt: Date.now(),
    ...node,
    parentId,
  };
  let nodes = [...(conv.nodes || []), created];
  if (parentId) {
    nodes = nodes.map((n) =>
      n.id === parentId ? { ...n, selectedChildId: created.id } : n,
    );
  }
  return { ...conv, nodes, headId: created.id };
}

/** Switches the active branch to the subtree under `nodeId`, remembering the
 *  choice on the parent so returning to this subtree lands on the same variant. */
export function switchTo(conv, nodeId) {
  const node = indexNodes(conv.nodes).get(nodeId);
  let nodes = conv.nodes || [];
  if (node?.parentId) {
    nodes = nodes.map((n) =>
      n.id === node.parentId ? { ...n, selectedChildId: nodeId } : n,
    );
  }
  return { ...conv, nodes, headId: leafUnder(nodes, nodeId) };
}

/** Collects a node id and all of its descendants. */
function collectSubtree(nodes, rootId) {
  const doomed = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (!doomed.has(n.id) && n.parentId && doomed.has(n.parentId)) {
        doomed.add(n.id);
        changed = true;
      }
    }
  }
  return doomed;
}

/** Deletes a node and its entire subtree, repairing the parent's selection and
 *  the conversation head. */
export function deleteSubtree(conv, nodeId) {
  const nodes0 = conv.nodes || [];
  const node = indexNodes(nodes0).get(nodeId);
  if (!node) return conv;
  const parentId = node.parentId ?? null;
  const doomed = collectSubtree(nodes0, nodeId);

  let nodes = nodes0.filter((n) => !doomed.has(n.id));

  if (parentId) {
    nodes = nodes.map((n) => {
      if (n.id !== parentId) return n;
      const selectedValid =
        n.selectedChildId && !doomed.has(n.selectedChildId) &&
        nodes.some((m) => m.id === n.selectedChildId);
      if (selectedValid) return n;
      const sibs = childrenOf(nodes, parentId);
      return {
        ...n,
        selectedChildId: sibs.length ? sibs[sibs.length - 1].id : null,
      };
    });
  }

  let headId = conv.headId;
  if (doomed.has(headId)) {
    if (parentId && nodes.some((n) => n.id === parentId)) {
      headId = leafUnder(nodes, parentId);
    } else {
      const roots = childrenOf(nodes, null);
      headId = roots.length ? leafUnder(nodes, roots[roots.length - 1].id) : null;
    }
  }

  return { ...conv, nodes, headId };
}
