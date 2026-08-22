/**
 * Environment Configuration - Schema and Validation
 * 
 * This module defines and validates the environment variables required by the
 * application. It uses Zod for schema validation to ensure all required
 * configuration is present at startup.
 * 
 * CONNECTIONS:
 * - Used by: models.ts (for OPENAI_API_KEY and OPENAI_MODEL)
 *           serperSearch.ts (for SERPER_API_KEY)
 *           index.ts (for PORT and ALLOWED_ORIGIN)
 * 
 * IMPACT:
 * - Application will fail to start if required variables are missing
 * - Default values are provided for optional configuration
 */

import { z } from "zod";

// ============================================================================
// ENVIRONMENT SCHEMA
// ============================================================================
//
// Defines all environment variables with their types, defaults, and requirements.
//
// REQUIRED VARIABLES (no default, will fail if missing):
// - OPENAI_API_KEY: API key for OpenAI (used in models.ts)
// - SERPER_API_KEY: API key for Serper search (used in serperSearch.ts)
//
// OPTIONAL VARIABLES (have defaults):
// - PORT: Server port (default: "5000")
// - ALLOWED_ORIGIN: CORS origin (default: "http://localhost:5174")
// - OPENAI_MODEL: OpenAI model identifier (default: "gpt-5.6-luna")
const EnvSchema = z.object({
  // Server Configuration
  PORT: z.string().default("5000"),              // Port for the Express server
  ALLOWED_ORIGIN: z.url().default("http://localhost:5174"),  // Allowed CORS origin

  // OpenAI Configuration (Required - fail fast if missing)
  OPENAI_API_KEY: z.string(),                      // OpenAI API key
  OPENAI_MODEL: z.string().default("gpt-5.6-luna"),  // OpenAI model identifier

  // Search Provider Configuration (Required for Serper search)
  SERPER_API_KEY: z.string(),                     // Serper API key for web search
});

// ============================================================================
// VALIDATED ENVIRONMENT
// ============================================================================
//
// Parses and validates the environment variables at application startup.
// If any required variable is missing or invalid, this will throw an error
// and the application will fail to start.
//
// This is the single source of truth for all environment configuration.
export const env = EnvSchema.parse(process.env);
