import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/csrf-token", (req: Request, res: Response): void => {
  const csrfToken = typeof res.locals.csrfToken === "string"
    ? res.locals.csrfToken
    : req.cookies?.csrf_token;

  if (!csrfToken) {
    res.status(500).json({ error: "CSRF token unavailable" });
    return;
  }

  res.json({ csrfToken });
});

export default router;
