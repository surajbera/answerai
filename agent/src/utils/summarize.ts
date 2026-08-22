/**
 * Summarize Utility - Content Summarization
 * 
 * This module provides text summarization capabilities using an LLM.
 * It takes raw text content and produces a concise, factual summary suitable
 * for use in answer generation.
 * 
 * CONNECTIONS:
 * - Used by: openAndSummarizeStep in webPipeline.ts
 * - Uses: getChatModel from ../shared/models.ts
 * - Uses: SummarizeInputSchema and SummarizeOutputSchema from ./schemas.ts
 * 
 * IMPACT:
 * - The quality of summaries affects the final answer quality
 * - Summarization happens for each web page visited in web mode
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getChatModel } from "../shared/models";
import { SummarizeInputSchema, SummarizeOutputSchema } from "./schemas";

// ============================================================================
// SUMMARIZE FUNCTION (Public API)
// ============================================================================
//
// Takes raw text content and returns a concise summary.
//
// @param text - The raw text content to summarize
// @returns Promise<{ summary: string }> - The generated summary
//
// PROCESSING STEPS:
// 1. Validate input (minimum 50 characters required)
// 2. Clip to maximum length (4000 characters)
// 3. Send to LLM with summarization prompt
// 4. Normalize the output (clean whitespace, cap length)
// 5. Validate and return the final summary
export async function summarize(text: string) {
  // Validate and normalize the input text
  const { text: raw } = SummarizeInputSchema.parse({ text });

  // Clip to maximum length to control input size to the model
  const clipped = clip(raw, 4000);

  // Get the chat model with low temperature for consistent results
  const model = getChatModel({ temperature: 0.2 });

  // Ask the model to summarize in a controlled manner
  // The prompt ensures:
  // - Factual and neutral tone
  // - Beginner-friendly language
  // - No hallucination (only use provided text)
  // - Concise output (5-8 sentences)
  const res = await model.invoke([
    new SystemMessage(
      [
        "You are a helpful assistant that writes short, accurate summaries.",
        "Guidelines:",
        "- Be factual and neutral, aviod marketing language.",
        "- 5-8 sentences; no lists unless absolutely necessary.",
        "- Do NOT invent sources; you only summarize the provided text.",
        "- Keep it readable for beginners",
      ].join("\n")
    ),

    new HumanMessage(
      [
        "Summarize the following content for a beginner friendly audience.",
        "Focus on key facts and remove fluff",
        "TEXT:",
        clipped,
      ].join("\n\n")
    ),
  ]);

  // Extract and normalize the response
  const rawModelOutput =
    typeof res.content === "string" ? res.content : String(res.content);

  const summary = normalizeSummary(rawModelOutput);

  // Validate and return the final summary
  return SummarizeOutputSchema.parse({ summary });
}

// ============================================================================
// CLIP FUNCTION (Internal Helper)
// ============================================================================
//
// Clips a string to a maximum length.
//
// @param s - The string to clip
// @param max - Maximum length
// @returns string - The clipped string (or original if under max)
function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max) : s;
}

// ============================================================================
// NORMALIZE SUMMARY FUNCTION (Internal Helper)
// ============================================================================
//
// Normalizes the summary text by:
// 1. Collapsing multiple spaces before newlines to single newline
// 2. Reducing multiple consecutive newlines to double newlines
// 3. Trimming whitespace
// 4. Capping at 2500 characters
//
// @param s - The raw summary text
// @returns string - The normalized summary
function normalizeSummary(s: string) {
  const t = s
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return t.slice(0, 2500);
}
