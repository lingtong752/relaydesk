import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, "../../../.env") });

const envSchema = z.object({
  USE_IN_MEMORY_DB: z.coerce.boolean().default(false),
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DB: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(8).optional(),
  PORT: z.coerce.number().default(4010),
  WEB_ORIGIN: z.string().min(1).default("http://127.0.0.1:5173"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-4-20250514"),
  ANTHROPIC_BASE_URL: z.string().url().default("https://api.anthropic.com"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.2-codex"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com"),
  OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("medium"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com")
});

const databaseEnvSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1)
});

const authEnvSchema = z.object({
  JWT_SECRET: z.string().min(8)
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

export function getDatabaseEnv(source: Partial<Env> = env) {
  return databaseEnvSchema.parse(source);
}

export function getAuthEnv(source: Partial<Env> = env) {
  return authEnvSchema.parse(source);
}
