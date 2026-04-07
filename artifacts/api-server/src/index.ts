import { createServer } from "node:http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { seedStudyResources } from "./seed.js";
import { setupWebSocket } from "./services/ws.js";
import { setupQueues } from "./services/queue.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);

setupWebSocket(server);
setupQueues();

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  seedStudyResources().catch((e) => logger.error({ err: e }, "Seed failed"));
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  server.close(() => process.exit(0));
});
