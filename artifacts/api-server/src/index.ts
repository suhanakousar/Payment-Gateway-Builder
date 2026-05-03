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
  const defaultProvider = process.env["DEFAULT_PROVIDER"] ?? "decentro";
  const webhookUrl = `https://${domain}/api/webhook?provider=${defaultProvider}`;
  const decentroLive = Boolean(
    process.env["DECENTRO_CLIENT_ID"] &&
    process.env["DECENTRO_CLIENT_SECRET"] &&
    process.env["DECENTRO_MODULE_SECRET"],
  );
  logger.info(
    { webhookUrl, provider: defaultProvider, live: decentroLive },
    decentroLive
      ? "Decentro LIVE mode — register webhook URL in Decentro dashboard"
      : "Decentro SANDBOX mode — set DECENTRO_CLIENT_ID + DECENTRO_CLIENT_SECRET + DECENTRO_MODULE_SECRET for live payments",
  );

  startJobs();
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  stopJobs();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
