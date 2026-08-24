import { env } from "./env";
import { initChatModel } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

type ModelOpts = {
  temperature?: number;
  maxTokens?: number;
};

export async function initOpenAIModel(opts: ModelOpts = {}): Promise<BaseChatModel> {
  const temp = opts?.temperature ?? 0.2;
  const maxTokens = opts?.maxTokens;

  return initChatModel(`openai:${env.OPENAI_MODEL}`, {
    apiKey: env.OPENAI_API_KEY,
    temperature: temp,
    maxTokens: maxTokens,
  });
}
