import type { Request, Response } from "express";

export async function healthz(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok" });
}
