import { type Request, type Response, type NextFunction, type ErrorRequestHandler } from "express";
import { logger } from "../lib/logger";

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled error");
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
};
