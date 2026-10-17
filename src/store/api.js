import { STORAGE_KEY } from "../constants";

/**
 * Frontend storage layer. Talks to the local ChatZ server which persists
 * everything into SQLite. Replaces the old localStorage-only `utils` helpers.
 */

function readLegacy() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearLegacy() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Immediately persists a state snapshot. */
export async function saveStateNow(snapshot) {
  const res = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) throw new Error(`保存失败 (${res.status})`);
  return res.json();
}

/** Loads the whole app state, migrating legacy localStorage data on first run. */
export async function loadState() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`加载失败 (${res.status})`);
  const data = await res.json();

  const empty = !data.conversations?.length && !data.settings;
  if (empty) {
    const legacy = readLegacy();
    if (legacy?.conversations?.length || legacy?.settings) {
      const migrated = {
        conversations: legacy.conversations || [],
        activeId: legacy.activeId ?? null,
        settings: legacy.settings ?? null,
      };
      await saveStateNow(migrated);
      clearLegacy();
      return migrated;
    }
  }

  return {
    settings: data.settings ?? null,
    activeId: data.activeId ?? null,
    conversations: data.conversations ?? [],
  };
}

let timer = null;
let pending = null;

/** Clears the pending timer and returns the queued snapshot, if any. */
function takePending() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const snapshot = pending;
  pending = null;
  return snapshot;
}

/** Debounced persist. Coalesces rapid updates (e.g. streaming deltas). */
export function saveState(snapshot, delay = 600) {
  pending = snapshot;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const snap = takePending();
    if (!snap) return;
    saveStateNow(snap).catch((err) => {
      console.error("保存本地数据失败:", err);
    });
  }, delay);
}

/** Best-effort flush of any queued snapshot (page hide/unload). Uses
 *  sendBeacon when available so the request survives navigation. */
export function flushState() {
  const snapshot = takePending();
  if (!snapshot) return;
  const json = JSON.stringify(snapshot);

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      const blob = new Blob([json], { type: "application/json" });
      if (navigator.sendBeacon("/api/state", blob)) return;
    } catch {
      // fall through to fetch
    }
  }

  fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    keepalive: true,
  }).catch(() => {});
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushState);
  window.addEventListener("pagehide", flushState);
}
