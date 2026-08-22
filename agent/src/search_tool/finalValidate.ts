/**
 * Final Validation and Polish - Output Validation Layer
 * 
 * This is the final step in the search pipeline. It ensures that the output
 * matches the expected schema (SearchAnswerSchema) before being returned to the client.
 * 
 * CONNECTIONS:
 * - Used by: searchChain.ts (as the final step after the pipeline branch)
 * - Uses: SearchAnswerSchema from ../utils/schemas.ts for validation
 *        getChatModel from ../shared/models.ts for LLM-based repair
 * - Exports: finalValidateAndPolish (used in the main searchChain)
 * 
 * IMPACT:
 * - Ensures all API responses have the correct structure
 * - Handles edge cases where previous steps produce invalid output
 * - Provides graceful fallbacks when validation fails
 */

import { RunnableLambda } from "@langchain/core/runnables";
import { candidate } from "./types";
import { SearchAnswerSchema } from "../utils/schemas";
import { getChatModel } from "../shared/models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ============================================================================
// FINAL VALIDATION AND POLISH STEP
// ============================================================================
//
// This step receives the candidate output from either webPath or directPath
// and ensures it conforms to the SearchAnswerSchema before returning to the client.
//
// INPUT:  candidate = { answer: string, sources: string[], mode: "web" | "direct" }
// OUTPUT: SearchAnswer = { answer: string, sources: string[] }
//
// VALIDATION APPROACH:
// 1. Try direct schema validation (most cases pass)
// 2. If validation fails, ask LLM to reformat the output
// 3. If LLM reformatting fails, return a safe fallback
export const finalValidateAndPolish = RunnableLambda.from(
  async (candidate: candidate) => {
    // Create a draft object matching the expected output schema
    // (SearchAnswerSchema expects answer and sources, not mode)
    const finalDraft = {
      answer: candidate.answer,
      sources: candidate.sources ?? [],
    };

    // Step 1: Try direct validation first (most cases will pass)
    // This is the fast path - if the candidate already has valid structure,
    // we return it immediately without LLM intervention
    const parsed = SearchAnswerSchema.safeParse(finalDraft);
    if (parsed.success) return parsed.data;

    // Step 2: If validation fails, use the model to reformat the output
    // This handles cases where the answer might be malformed, empty, or structurally invalid
    //
    // LangChain v1 note: Using model.invoke() with messages API since
    // model.bind() with response_format isn't available in the JS implementation
    const model = getChatModel({ temperature: 0.2 });
    
    // Ask the LLM to format the draft into a valid JSON response
    // This is a repair mechanism for edge cases where the pipeline produces invalid output
    const response = await model.invoke([
      new SystemMessage(
        [
          "You are a helpful assistant that formats answers correctly.",
          "Respond with a valid JSON object matching: {answer: string, sources: string[]}",
          "Ensure answer is non-empty and sources is an array of valid URLs.",
          "If the input is already valid, return it as-is.",
        ].join("\n")
      ),
      new HumanMessage(
        [
          "Format this into a valid response:",
          JSON.stringify(finalDraft),
        ].join("\n\n")
      ),
    ]);

    // Extract and normalize the response text
    const text = typeof response.content === "string" 
      ? response.content 
      : String(response.content);

    // Parse the LLM's response - it should return valid JSON
    try {
      const json = JSON.parse(text);
      const parsed2 = SearchAnswerSchema.safeParse(json);
      if (parsed2.success) return parsed2.data;
    } catch {
      // Step 3: If LLM reformat fails, return a safe fallback
      // This ensures we always return a valid response, even in error cases
      return {
        answer: finalDraft.answer || "I couldn't generate a valid answer.",
        sources: finalDraft.sources || [],
      };
    }

    // Final fallback - should rarely be reached
    return {
      answer: finalDraft.answer || "I couldn't generate a valid answer.",
      sources: finalDraft.sources || [],
    };
  }
);
