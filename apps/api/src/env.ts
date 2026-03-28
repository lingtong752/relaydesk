import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, "../../../.env") });

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  PORT: z.coerce.number().default(4010),
  WEB_ORIGIN: z.string().min(1).default("http://127.0.0.1:5173"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-4-20250514"),
  ANTHROPIC_BASE_URL: z.string().url().default("https://api.anthropic.com"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.2-codex"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com"),
  OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("medium")
});

export const env = envSchema.parse(process.env);
