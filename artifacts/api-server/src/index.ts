import "./utils/loadEnv";
import app from "./app";
import { logger } from "./utils/logger";
import { startJobs, stopJobs } from "./jobs";

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  const domain = process.env["REPLIT_DEV_DOMAIN"] ?? `localhost:${port}`;
  const webhookUrl = `https://${domain}/api/webhook?provider=cashfree`;
  const isLive = Boolean(process.env["CASHFREE_APP_ID"] && process.env["CASHFREE_SECRET_KEY"]);
  logger.info(
    { webhookUrl, live: isLive },
    isLive
      ? "Cashfree LIVE mode — register webhook URL in Cashfree dashboard"
      : "Cashfree SANDBOX mode — set CASHFREE_APP_ID + CASHFREE_SECRET_KEY for live payments",
  );

  startJobs();
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  stopJobs();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
