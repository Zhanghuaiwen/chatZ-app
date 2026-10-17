import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { DB_PATH } from "./db/index.js";
import stateRoutes from "./routes/state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "127.0.0.1";

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 });

await app.register(stateRoutes);

// Serve the built SPA when it exists (production). In dev the Vite server
// proxies /api here, so static serving is simply skipped.
if (fs.existsSync(DIST)) {
  await app.register(fastifyStatic, { root: DIST });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`ChatZ server ready · db=${DB_PATH}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
