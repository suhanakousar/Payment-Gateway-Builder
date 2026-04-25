import { Router, type IRouter } from "express";
import { DashboardTimeseriesQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import {
  dashboardSummaryForMerchant,
  dashboardTimeseriesForMerchant,
} from "../services/orderService";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const data = await dashboardSummaryForMerchant(req.merchant!.merchantId);
  res.json(data);
});

router.get("/dashboard/timeseries", requireAuth, async (req, res) => {
  const parsed = DashboardTimeseriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const days = parsed.data.days ?? 14;
  const data = await dashboardTimeseriesForMerchant(
    req.merchant!.merchantId,
    days,
  );
  res.json(data);
});

export default router;
