import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger";

/** Throw from any handler to produce a clean JSON error with a status code. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  // Postgres unique-constraint violation -> conflict, not a 500.
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    res.status(409).json({ error: "A record with that value already exists" });
    return;
  }
  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
