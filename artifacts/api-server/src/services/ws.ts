import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
import { logger } from "../lib/logger.js";

const userSockets = new Map<string, Set<WebSocket>>();
let wss: WebSocketServer | null = null;

export function setupWebSocket(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let userId: string | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          userId?: string;
        };

        if (msg.type === "identify" && msg.userId) {
          if (userId && userSockets.has(userId)) {
            userSockets.get(userId)!.delete(ws);
            if (userSockets.get(userId)!.size === 0) userSockets.delete(userId);
          }
          userId = msg.userId;
          if (!userSockets.has(userId)) userSockets.set(userId, new Set());
          userSockets.get(userId)!.add(ws);
          ws.send(JSON.stringify({ type: "identified", userId }));
          logger.info({ userId }, "WebSocket client identified");
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (userId) {
        const set = userSockets.get(userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) userSockets.delete(userId);
        }
      }
    });

    ws.on("error", (err) => {
      logger.warn({ err: err.message }, "WebSocket client error");
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeat);
      }
    }, 30_000);

    ws.on("close", () => clearInterval(heartbeat));
  });

  logger.info("WebSocket server ready at /ws");
}

export function emitToUser(userId: string, event: Record<string, unknown>): void {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;
  const payload = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch {
        // ignore send errors
      }
    }
  }
}

export function broadcastAll(event: Record<string, unknown>): void {
  if (!wss) return;
  const payload = JSON.stringify(event);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch {
        // ignore
      }
    }
  }
}

export function getConnectedUserCount(): number {
  return userSockets.size;
}
