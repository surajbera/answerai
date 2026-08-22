/**
 * Route Strategy - Query Mode Determination
 * 
 * This module determines whether a query should use the web search pipeline
 * (fetching and summarizing web content) or the direct LLM pipeline (answering
 * directly without web access).
 * 
 * CONNECTIONS:
 * - Used by: searchChain.ts (as the first step in the pipeline)
 * - Exports: routerStep which is consumed by the main searchChain
 * 
 * IMPACT:
 * - This routing decision affects performance, cost, and answer quality
 * - Web mode: Slower, more accurate for factual/current queries, uses API calls
 * - Direct mode: Faster, cheaper, but limited to LLM's training data
 */

import { RunnableLambda } from "@langchain/core/runnables";
import { SearchInputSchema } from "../utils/schemas";

// ============================================================================
// ROUTING STRATEGY FUNCTION
// ============================================================================
//
// Determines the processing mode based on query characteristics.
//
// RULES FOR WEB MODE:
// 1. Long queries (>70 characters) - likely need more context than LLM has
// 2. Recent years mentioned (2024-2039) - LLM may not have current data
// 3. Specific patterns that indicate need for current/factual information:
//    - Comparisons: "top 10", "best", "vs", "compare", "ranking"
//    - Pricing: "price", "cost", "cheapest", "under $X"
//    - Current events: "latest", "today", "news", "released", "announced"
//    - Technical: "deprecated", "compatible with", "install"
//    - Location-based: "near me", "nearby"
//
// @param q - The user's search query
// @returns "web" if web search is needed, "direct" for LLM-only
function routeStrategy(q: string): "web" | "direct" {
  const trimedQuery = q.toLowerCase().trim();

  const isLongQuery = trimedQuery.length > 70;

  const recentYearRegex = /\b20(2[4-9]|3[0-9])\b/.test(trimedQuery);

  // Patterns that indicate the query needs web search for accurate results
  // These can be customized based on the specific use case of the application
  const patterns: RegExp[] = [
    // Ranking/Comparison patterns
    /\btop[-\s]*\d+\b/u,                 // "top 10", "top-5"
    /\bbest\b/u,                          // "best laptop"
    /\brank(?:ing|ings)?\b/u,             // "ranking", "rankings"
    /\bwhich\s+is\s+better\b/u,          // "which is better"
    /\b(?:vs\.?|versus)\b/u,             // "A vs B", "A versus B"
    /\bcompare|comparison\b/u,           // "compare", "comparison"

    // Pricing patterns
    /\bprice|prices|pricing|cost|costs|cheapest|cheaper|affordable\b/u,
    /\bunder\s*\d+(?:\s*[kK])?\b/u,       // "under 100", "under $500"
    /\p{Sc}\s*\d+/u,                     // Currency symbols with numbers

    // Current/Time-sensitive patterns
    /\blatest|today|now|current\b/u,
    /\bnews|breaking|trending\b/u,
    /\b(released?|launch|launched|announce|announced|update|updated)\b/u,
    /\bchangelog|release\s*notes?\b/u,

    // Technical patterns
    /\bdeprecated|eol|end\s*of\s*life|sunset\b/u,
    /\broadmap\b/u,

    // Compatibility/Setup patterns
    /\bworks\s+with|compatible\s+with|support(?:ed)?\s+on\b/u,
    /\binstall(ation)?\b/u,

    // Location patterns
    /\bnear\s+me|nearby\b/u,
  ];

  const isQueryPresentInPatterns = patterns.some((pattern) =>
    pattern.test(trimedQuery)
  );

  // Use web mode if query is long, mentions recent years, or matches any pattern
  if (isLongQuery || recentYearRegex || isQueryPresentInPatterns) {
    return "web";
  } else {
    return "direct";
  }
}

// ============================================================================
// RUNNABLE LAMBDA: LangChain-compatible routing step
// ============================================================================
//
// Wraps the routeStrategy function in a RunnableLambda for use in the LCEL pipeline.
//
// INPUT:  { q: string } - The validated user query
// OUTPUT: { q: string, mode: "web" | "direct" } - Query with determined mode
//
// This is the FIRST step in the searchChain pipeline.
// Its output determines which path (webPath or directPath) will be taken next.
export const routerStep = RunnableLambda.from(async (input: { q: string }) => {
  const { q } = SearchInputSchema.parse(input);

  // decide the mode -> web, direct
  const mode = routeStrategy(q);

  return {
    q,
    mode,
  };
});
