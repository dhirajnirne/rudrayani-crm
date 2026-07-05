import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./config/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import authRoutes from "./routes/auth";
import healthRoutes from "./routes/health";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    }),
  );

  app.use("/api", healthRoutes);
  app.use("/api/auth", authRoutes);

  // TODO (Phase 1): agency/company/branch/team routes
  // TODO (Phase 2): import-template + excel-import routes
  // TODO (Phase 3): allocation, calling, disposition, payment routes
  // TODO (Phase 4): location-ping ingestion route (Section 9 of the build brief)

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
