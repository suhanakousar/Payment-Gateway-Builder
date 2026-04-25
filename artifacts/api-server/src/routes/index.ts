import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import merchantRouter from "./merchant";
import ordersRouter from "./orders";
import webhookRouter from "./webhook";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(merchantRouter);
router.use(ordersRouter);
router.use(webhookRouter);
router.use(dashboardRouter);

export default router;
