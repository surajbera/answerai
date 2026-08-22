import { RunnableLambda } from "@langchain/core/runnables";
import { candidate } from "./types";
import { getChatModel } from "../shared/models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ============================================================================
// DIRECT PATH: LLM-only query processing
// ============================================================================
//
// This is the simpler, faster pipeline that sends the query directly to the LLM
// without performing any web search or content fetching.
//
// WHEN USED:
// - Short queries (< 70 characters)
// - Queries that don't match web search patterns (see routeStrategy.ts)
// - General knowledge questions that don't require current information
//
// NOTES:
// - sources array is always empty since no web pages are consulted
// - mode is always "direct" to indicate this path was taken
export const directPath = RunnableLambda.from(
  async (input: { q: string; mode: "web" | "direct" }): Promise<candidate> => {
    // Get the chat model with low temperature for deterministic, factual responses
    const model = getChatModel({ temperature: 0.2 });

    const res = await model.invoke([
      new SystemMessage(
        [
          "You answer briefly and clearly for beginners",
          "If unsure, say so",
        ].join("\n")
      ),
      new HumanMessage(input.q),
    ]);

    // Handle the response content (can be string or other types)
    const directAns = (
      typeof res.content === "string" ? res.content : String(res.content)
    ).trim();

    return {
      answer: directAns,
      sources: [], // No sources since we didn't consult any web pages
      mode: "direct", // Indicates this was a direct LLM response
    };
  }
);
