import type { Request, Response } from "express";
import * as dashboardService from "../services/dashboard";

export async function summary(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.summary(req.merchant!.id);
  res.json(data);
}
