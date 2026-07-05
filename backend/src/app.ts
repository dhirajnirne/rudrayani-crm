import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./config/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import authRoutes from "./routes/auth";
import branchRoutes from "./routes/branches";
import catalogRoutes from "./routes/catalog";
import companyRoutes from "./routes/companies";
import customerRoutes from "./routes/customers";
import dispositionRoutes from "./routes/dispositions";
import employeeRoutes from "./routes/employees";
import healthRoutes from "./routes/health";
import importTemplateRoutes from "./routes/import-templates";
import importRoutes from "./routes/imports";
import teamRoutes from "./routes/teams";

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
  app.use("/api/branches", branchRoutes);
  app.use("/api/teams", teamRoutes);
  app.use("/api/companies", companyRoutes);
  app.use("/api/employees", employeeRoutes);
  app.use("/api/imports", importRoutes);
  app.use("/api/import-templates", importTemplateRoutes);
  app.use("/api/dispositions", dispositionRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api", catalogRoutes);
  // TODO (Phase 3): allocation, calling, payment routes
  // TODO (Phase 4): location-ping ingestion route (Section 9 of the build brief)

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
