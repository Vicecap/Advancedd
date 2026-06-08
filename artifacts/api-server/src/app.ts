import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { csrfProtection } from "./lib/csrf";
import { validateUserText } from "./lib/inputSecurity";
import { logSecurityEvent } from "./lib/security";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./middlewares/errorHandler";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();
app.set("trust proxy", 1);
// In your main router file (e.g. src/routes/index.ts or app.ts)

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

const configuredOrigins = (process.env.CORS_ORIGINS ?? "https://ts.totalsportss.online,https://doc.totalsportss.online")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const devOrigins = process.env.NODE_ENV === "production" ? [] : ["http://localhost:23183", "http://localhost:5173", "http://127.0.0.1:23183", "http://127.0.0.1:5173"];
const allowedOrigins = new Set([...configuredOrigins, ...devOrigins]);
app.use(cors({
  credentials: Boolean(1),
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    void logSecurityEvent({ headers: { origin }, socket: {}, method: "OPTIONS", path: "cors", originalUrl: "cors" } as any, "cors_rejected", "medium", null, `Rejected CORS origin ${origin}`, { blocked: true });
    return callback(new Error("CORS origin not allowed"));
  },
}));
app.use(cookieParser());
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use(authMiddleware);
app.use(csrfProtection);
app.use(validateUserText);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

app.use("/api", limiter);
app.use("/api", router);

app.use(errorHandler);

export default app;
