/**
 * Web Pipeline - Web Search and Summarization
 * 
 * This pipeline handles queries that require web search. It fetches search results,
 * visits each page, extracts and summarizes the content, then uses an LLM to
 * compose a final answer from the summaries.
 * 
 * CONNECTIONS:
 * - Used by: searchChain.ts (via webPath export, as one branch of the pipeline)
 * - Uses: webSearch from ../utils/webSearch.ts
 *        openUrl from ../utils/openUrl.ts
 *        summarize from ../utils/summarize.ts
 *        getChatModel from ../shared/models.ts
 * - Exports: webPath (complete pipeline), webSearchStep, openAndSummarizeStep, ComposeStep
 * 
 * IMPACT:
 * - This is the "web" branch of the search pipeline
 * - Used when routerStep determines the query needs web search
 * - More expensive (API calls) but provides current, factual information
 */

import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import { webSearch } from "../utils/webSearch";
import { openUrl } from "../utils/openUrl";
import { summarize } from "../utils/summarize";
import { candidate } from "./types";
import { getChatModel } from "../shared/models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// Maximum number of search results to process (for cost and performance control)
const setTopResults = 5;

// ============================================================================
// STEP 1: Web Search - Fetch search results for the query
// ============================================================================
export const webSearchStep = RunnableLambda.from(
  async (input: { q: string; mode: "web" | "direct" }) => {
    const results = await webSearch(input.q); // tavily

    return {
      ...input,
      results,
    };
  }
);

// ============================================================================
// STEP 2: Open and Summarize - Visit pages and extract summaries
// ============================================================================
//
// This step takes the search results and for each one:
// 1. Opens the URL using openUrl (fetches and cleans HTML content)
// 2. Summarizes the content using the LLM
// 3. Returns an array of { url, summary } pairs
//
// INPUT:  { q: string, mode: "web" | "direct", results: SearchResult[] }
// OUTPUT: { q: string, mode: "web" | "direct", pageSummaries: {url, summary}[], fallback: string }
//
// FALLBACK BEHAVIOR:
// - "no-results": No search results were returned
// - "snippets": All URL fetches failed, using search snippets instead
// - "none": At least one URL was successfully fetched and summarized
export const openAndSummarizeStep = RunnableLambda.from(
  async (input: { q: string; mode: "web" | "direct"; results: any[] }) => {
    // Handle empty results case
    if (!Array.isArray(input.results) || input.results.length === 0) {
      return {
        ...input,
        pageSummaries: [],
        fallback: "no-results" as const,
      };
    }

    // Process only the top N results (controlled by setTopResults)
    const extractTopResults = input.results.slice(0, setTopResults);

    // Use Promise.allSettled to handle failures gracefully
    // Each promise: fetch URL -> clean content -> summarize
    const settledResults = await Promise.allSettled(
      extractTopResults.map(async (result: any) => {
        const opened = await openUrl(result.url);
        const summarizeContent = await summarize(opened.content);

        return {
          url: opened.url,
          summary: summarizeContent.summary,
        };
      })
    );

    // Filter to only successful results
    const settledResultsPageSummaries = settledResults
      .filter((settledResult) => settledResult.status === "fulfilled")
      .map((s) => s.value);

    // Edge case: All URL fetches or summarizations failed
    // Fallback to using the search result snippets/titles as content
    if (settledResultsPageSummaries.length === 0) {
      const fallbackSnippetSummaries = extractTopResults
        .map((result: any) => ({
          url: result.url,
          summary: String(result.snippet || result.title || "").trim(),
        }))
        .filter((x: any) => x.summary.length > 0);

      return {
        ...input,
        pageSummaries: fallbackSnippetSummaries,
        fallback: "snippets" as const,
      };
    }

    return {
      ...input,
      pageSummaries: settledResultsPageSummaries,
      fallback: "none" as const,
    };
  }
);

// ============================================================================
// STEP 3: Compose - Generate final answer from summaries
// ============================================================================
//
// This step takes the page summaries and uses an LLM to compose a final answer.
// It handles two scenarios:
// 1. No summaries available: Falls back to direct LLM response
// 2. Summaries available: Uses LLM to answer based on the summaries
//
// INPUT:  { q: string, pageSummaries: {url, summary}[], mode: "web" | "direct", fallback: string }
// OUTPUT: candidate = { answer: string, sources: string[], mode: "web" | "direct" }
//
// The final answer:
// - Is based only on the provided summaries (no hallucination)
// - Includes citations (sources) to the original URLs
// - Is concise (5-8 sentences max) and beginner-friendly
export const ComposeStep = RunnableLambda.from(
  async (input: {
    q: string;
    pageSummaries: Array<{ url: string; summary: string }>;
    mode: "web" | "direct";
    fallback: "no-results" | "snippets" | "none";
  }): Promise<candidate> => {
    const model = getChatModel({ temperature: 0.2 });

    // If no summaries are available (all fetches failed), use direct LLM response
    if (!input.pageSummaries || input.pageSummaries.length === 0) {
      const directResponseFromModel = await model.invoke([
        new SystemMessage(
          [
            "You answer briefly and clearly for beginners",
            "If unsure, say so",
          ].join("\n")
        ),
        new HumanMessage(input.q),
      ]);

      const directAns = (
        typeof directResponseFromModel.content === "string"
          ? directResponseFromModel.content
          : String(directResponseFromModel.content)
      ).trim();

      return {
        answer: directAns,
        sources: [],
        mode: "direct",
      };
    }

    // Generate answer based on the page summaries
    // The LLM is instructed to:
    // - Use only the provided summaries (no hallucination)
    // - Be accurate and neutral
    // - Keep response to 5-8 sentences
    const res = await model.invoke([
      new SystemMessage(
        [
          "You concisely answer questions using provided page summaries",
          "Rules:",
          "- Be accurate and netral",
          "- 5-8 sentences max",
          "- Use only the provided summaries; do not invent new facts",
        ].join("\n")
      ),
      new HumanMessage(
        [
          `Question: ${input.q}`,
          "Summaries:",
          JSON.stringify(input.pageSummaries, null, 2),
        ].join("\n")
      ),
    ]);

    const finalAns =
      typeof res.content === "string" ? res.content : String(res.content);

    // Extract all source URLs from the summaries
    const extractSources = input.pageSummaries.map((x) => x.url);

    return {
      answer: finalAns,
      sources: extractSources,
      mode: "web",
    };
  }
);

// ============================================================================
// WEB PIPELINE: Complete web search and answer generation
// ============================================================================
//
// This is the full web pipeline that combines all three steps:
// 1. webSearchStep: Fetch search results
// 2. openAndSummarizeStep: Open pages and extract summaries
// 3. ComposeStep: Generate final answer from summaries
//
// This pipeline is used by searchChain.ts when routerStep determines
// that web search is needed for the query.
//
// LCEL (LangChain Expression Language) allows chaining these operations
export const webPath = RunnableSequence.from([
  webSearchStep,
  openAndSummarizeStep,
  ComposeStep,
]);
