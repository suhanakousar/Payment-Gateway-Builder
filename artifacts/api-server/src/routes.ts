import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as auth from "./controllers/auth";
import * as orders from "./controllers/orders";
import * as refund from "./controllers/refund";
import * as merchantWebhooks from "./controllers/merchantWebhooks";
import * as providerWebhook from "./controllers/providerWebhook";
import * as dashboard from "./controllers/dashboard";
import * as health from "./controllers/health";
import { requireAuth } from "./middlewares/auth";
import { csrfProtection } from "./middlewares/csrf";

const isProd = process.env["NODE_ENV"] === "production";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later." },
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many order requests, slow down." },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const router = Router();

router.get("/healthz", health.healthz);

// CSRF token issuance - safe to expose without auth (issues a new cookie).
router.get("/auth/csrf", auth.csrf);
router.post("/auth/signup", authLimiter, csrfProtection, auth.signup);
router.post("/auth/login", authLimiter, csrfProtection, auth.login);
router.post("/auth/logout", csrfProtection, auth.logout);
router.get("/auth/me", requireAuth, auth.me);
router.put("/merchant/kyc", requireAuth, csrfProtection, auth.updateKyc);

router.get("/merchant/webhooks", requireAuth, merchantWebhooks.list);
router.post("/merchant/webhooks", requireAuth, csrfProtection, merchantWebhooks.create);
router.delete("/merchant/webhooks/:id", requireAuth, csrfProtection, merchantWebhooks.remove);
router.post("/merchant/webhooks/:id/test", requireAuth, csrfProtection, merchantWebhooks.test);
router.get("/merchant/webhook-logs", requireAuth, merchantWebhooks.logs);

router.post("/orders", requireAuth, csrfProtection, orderLimiter, orders.create);
router.get("/orders", requireAuth, orders.list);
router.get("/orders/export", requireAuth, orders.exportCsv);
router.get("/orders/:id", orders.getOne);
router.post("/orders/:id/refund", requireAuth, csrfProtection, refund.refund);

if (!isProd) {
  router.post("/orders/:txnId/simulate", orders.simulate);
}

router.post("/webhook", webhookLimiter, providerWebhook.receive);

router.get("/dashboard/summary", requireAuth, dashboard.summary);

export default router;
