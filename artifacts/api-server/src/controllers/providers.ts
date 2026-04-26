import type { Request, Response } from "express";
import { providerRouter } from "../providers";

export function health(_req: Request, res: Response): void {
  res.json(providerRouter.snapshot());
}
