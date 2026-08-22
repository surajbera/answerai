/**
 * Serper Search Utility - Google Search API Integration
 * 
 * This module integrates with Serper's Google Search API to perform web searches.
 * Serper is used as a free alternative to Tavily for fetching search results.
 * 
 * CONNECTIONS:
 * - Used by: webSearch in webSearch.ts
 * - Uses: env.SERPER_API_KEY from ../shared/env.ts
 * - Uses: SearchResultSchema and SearchResultsSchema from ./schemas.ts for validation
 * 
 * IMPACT:
 * - This is the actual search provider for the application
 * - Requires SERPER_API_KEY to be set in .env file
 * - Rate limits and API errors here affect the entire search pipeline
 */

import { env } from "../shared/env";
import { SearchResultSchema, SearchResultsSchema } from "./schemas";

// Serper API endpoint for Google search
const SERPER_API_URL = "https://google.serper.dev/search";

// ============================================================================
// SERPER SEARCH FUNCTION (Public API)
// ============================================================================
//
// Public function that performs a web search using Serper.
//
// @param q - The search query
// @returns Promise<SearchResult[]> - Validated array of search results
//
// This is the entry point used by webSearch.ts
export async function serperSearch(q: string) {
  const query = (q ?? "").trim();
  if (!query) return [];

  return await searchSerperUtil(query);
}

// Timeout for Serper API requests (10 seconds)
const SERPER_TIMEOUT_MS = 10000;

// ============================================================================
// SERPER UTILITY FUNCTION (Internal Implementation)
// ============================================================================
//
// Internal function that handles the actual API call to Serper.
//
// @param query - The search query to send to Serper
// @returns Promise<SearchResult[]> - Validated and normalized search results
//
// API REQUEST DETAILS:
// - Endpoint: https://google.serper.dev/search
// - Method: POST
// - Headers: Content-Type: application/json, X-API-KEY: [SERPER_API_KEY]
// - Body: { q: string, num: number, gl: string, hl: string }
//
// RESPONSE HANDLING:
// - Validates the API key exists
// - Sets up timeout and abort controller
// - Handles HTTP errors with descriptive messages
// - Extracts organic results from Serper response
// - Normalizes and validates each result
// - Returns at most 5 results (can be configured)
async function searchSerperUtil(query: string) {
  // Check if API key is configured
  if (!env.SERPER_API_KEY) {
    throw new Error("SERPER_API_KEY is missing");
  }

  // Setup timeout and abort controller for the fetch request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);

  try {
    // Make the API request to Serper
    const response = await fetch(SERPER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": env.SERPER_API_KEY,
      },
      body: JSON.stringify({
        q: query,
        num: 5,      // Number of results to return
        gl: "us",    // Geographic location for search
        hl: "en",    // Language for search
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const text = await response.text().catch(() => "<no body>");
      throw new Error(`Serper error: ${response.status} - ${text}`);
    }

    // Parse the JSON response
    const data = await response.json();
    
    // Extract organic search results from Serper's response format
    // Serper returns results in data.organic array
    const results = Array.isArray(data?.organic) ? data.organic : [];

    // Normalize and validate each result using SearchResultSchema
    // This ensures we have consistent data types and valid URLs
    const normalized = results.slice(0, 5).map((r: any) =>
      SearchResultSchema.parse({
        title: String(r?.title ?? "").trim() || "Untitled",
        url: String(r?.link ?? "").trim(),
        snippet: String(r?.snippet ?? "").trim().slice(0, 220),
      })
    );

    // Validate the final array of results
    // This ensures we don't return more than 10 results (schema max)
    return SearchResultsSchema.parse(normalized);
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle timeout errors specifically
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Serper request timed out after ${SERPER_TIMEOUT_MS}ms`);
    }
    
    // Re-throw other errors
    throw error;
  }
}
