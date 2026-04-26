import type { Request, Response } from "express";
import * as dashboardService from "../services/dashboard";

export async function summary(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.summary(req.merchant!.id);
  res.json(data);
}

export async function timeseries(req: Request, res: Response): Promise<void> {
  const days = Math.min(60, Math.max(1, Number(req.query["days"] ?? 14)));
  const data = await dashboardService.dailyRevenue(req.merchant!.id, days);
  res.json(data);
}

export async function methods(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.methodBreakdown(req.merchant!.id);
  res.json(data);
}

export async function providers(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.providerBreakdown(req.merchant!.id);
  res.json(data);
}
