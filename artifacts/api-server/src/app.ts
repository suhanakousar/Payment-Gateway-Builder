import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./utils/logger";

const app: Express = express();
const isProd = process.env["NODE_ENV"] === "production";

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

const corsOriginEnv = process.env["CORS_ORIGIN"];
const corsOrigin = corsOriginEnv
  ? corsOriginEnv.split(",").map((s) => s.trim())
  : true;

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ["X-CSRF-Token"],
  }),
);

app.use(cookieParser());

app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/api", router);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({
    error: isProd ? "Internal server error" : err.message,
  });
});

export default app;
