import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().default("5000"),
  ALLOWED_ORIGIN: z.url().default("http://localhost:5174"),
  OPENAI_API_KEY: z.string(),
  OPENAI_MODEL: z.string().default("gpt-5.6-luna"),
  SERPER_API_KEY: z.string(),
  FIRECRAWL_API_KEY: z.string(),
});

export const env = EnvSchema.parse(process.env);
