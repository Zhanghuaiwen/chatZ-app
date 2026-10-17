import { getSetting, setSetting } from "../repositories/settings.js";
import { listConversations, saveConversations } from "../repositories/conversations.js";

/** State snapshot endpoints: the frontend loads and saves the whole app state
 *  (settings + active conversation + conversations with messages). */
export default async function stateRoutes(app) {
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/state", async () => ({
    settings: getSetting("settings", null),
    activeId: getSetting("activeId", null),
    conversations: listConversations(),
  }));

  app.post("/api/state", async (req, reply) => {
    const body = req.body || {};
    if (!Array.isArray(body.conversations)) {
      return reply.code(400).send({ error: "conversations must be an array" });
    }

    if (body.settings && typeof body.settings === "object") {
      setSetting("settings", body.settings);
    }
    setSetting("activeId", body.activeId ?? null);
    saveConversations(body.conversations);

    return { ok: true, count: body.conversations.length };
  });
}
