import pino from "pino";

const isProd = process.env["NODE_ENV"] === "production";

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? (isProd ? "info" : "debug"),
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
      },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-csrf-token']",
      "req.headers['x-paylite-signature']",
      "*.password",
      "*.passwordHash",
      "*.pan",
      "*.bankAccount",
      "*.webhookSecret",
    ],
    censor: "[REDACTED]",
  },
});
