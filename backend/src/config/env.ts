import "dotenv/config";
import { z } from "zod";

// All configuration enters the app through this single validated object.
// A missing/invalid variable fails fast at boot instead of surfacing later
// as an undefined somewhere deep in a request handler.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  SMS_PROVIDER_API_KEY: z.string().default(""),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
