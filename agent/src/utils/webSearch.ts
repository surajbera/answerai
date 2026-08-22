/**
 * Web Search Utility - Search the internet for query
 * 
 * This is the main search utility that delegates to the configured search provider.
 * It provides a clean interface for searching the web with a natural language query.
 * 
 * CONNECTIONS:
 * - Used by: webSearchStep in webPipeline.ts
 * - Delegates to: serperSearch in serperSearch.ts
 * 
 * IMPACT:
 * - All web searches go through this function
 * - Changing the search provider only requires modifying the delegate call
 */

import { serperSearch } from "./serperSearch";

// ============================================================================
// WEB SEARCH FUNCTION
// ============================================================================
//
// Main search function that handles user queries.
//
// @param q - The user's search query (natural language)
// @returns Promise<SearchResult[]> - Array of search results, each containing:
//   - title: string
//   - url: string (valid URL)
//   - snippet: string (optional)
//
// The results are validated by SearchResultsSchema which ensures:
// - Maximum of 10 results
// - Each result has valid title and URL
//
// Currently delegates to Serper (free alternative to Tavily)
export async function webSearch(q: string) {
  // Normalize and validate the query
  const query = (q ?? "").trim();
  if (!query) return [];

  // Delegate to the actual search provider
  return await serperSearch(query);
}
