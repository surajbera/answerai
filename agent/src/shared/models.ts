import { env } from "./env";
import { initChatModel } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

type ModelOpts = {
  temperature?: number;    // Controls randomness (lower = more deterministic)
  maxTokens?: number;      // Maximum tokens in response (optional)
};

// ============================================================================
// GET CHAT MODEL FUNCTION (Public API)
// ============================================================================
// - "openai:gpt-5.6-luna" (default in env.ts schema)
export function getChatModel(opts: ModelOpts = {}): BaseChatModel {
  const temp = opts?.temperature ?? 0.2;
  const maxTokens = opts?.maxTokens;

  // LangChain v1: Use initChatModel with model string identifier
  // Format: "provider:model-name" (e.g., "openai:gpt-4o-mini")
  return initChatModel(`openai:${env.OPENAI_MODEL}`, {
    apiKey: env.OPENAI_API_KEY,
    temperature: temp,
    maxTokens: maxTokens,
  });
}
