import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { logger } from "../lib/logger.js";
import { getSession, SESSION_COOKIE } from "../lib/auth.js";

const userSockets = new Map<string, Set<WebSocket>>();
const messageCounts = new WeakMap<WebSocket, { count: number; resetAt: number }>();
let wss: WebSocketServer | null = null;

function cookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function throttle(ws: WebSocket): boolean {
  const now = Date.now();
  const current = messageCounts.get(ws) ?? { count: 0, resetAt: now + 60_000 };
  if (now > current.resetAt) { current.count = 0; current.resetAt = now + 60_000; }
  current.count += 1;
  messageCounts.set(ws, current);
  return current.count <= 60;
}

export function setupWebSocket(server: HttpServer): void {
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    if (!req.url?.startsWith("/ws")) return;
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
    const sid = bearer || cookie(req, SESSION_COOKIE);
    const session = sid ? await getSession(sid).catch(() => null) : null;
    if (!session?.user?.id) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss!.handleUpgrade(req, socket, head, (ws) => wss!.emit("connection", ws, req, session.user.id));
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, userId: string) => {
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(ws);
    ws.send(JSON.stringify({ type: "identified", userId }));
    logger.info({ userId }, "WebSocket client connected");

    ws.on("message", () => {
      if (!throttle(ws)) {
        ws.send(JSON.stringify({ type: "error", error: "rate_limited" }));
        ws.close(1008, "rate_limited");
      }
    });

    ws.on("close", () => {
      const set = userSockets.get(userId);
      if (set) { set.delete(ws); if (set.size === 0) userSockets.delete(userId); }
    });

    ws.on("error", (err) => logger.warn({ err: err.message }, "WebSocket client error"));

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
      else clearInterval(heartbeat);
    }, 30_000);
    ws.on("close", () => clearInterval(heartbeat));
  });

  logger.info("WebSocket server ready at /ws");
}

export function emitToUser(userId: string, event: Record<string, unknown>): void {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;
  const payload = JSON.stringify(event);
  for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) { try { ws.send(payload); } catch {} }
}

export function broadcastAll(event: Record<string, unknown>): void {
  if (!wss) return;
  const payload = JSON.stringify(event);
  for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) { try { ws.send(payload); } catch {} }
}

export function getConnectedUserCount(): number { return userSockets.size; }
