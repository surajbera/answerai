/**
 * Search API Routes
 * 
 * This module defines the Express router for handling search requests.
 * It's the bridge between HTTP requests and the LangChain search pipeline.
 * 
 * CONNECTIONS:
 * - Mounted at /search in index.ts
 * - Uses SearchInputSchema from ../utils/schemas.ts for request validation
 * - Calls runSearch from ../search_tool/searchChain.ts to execute the search pipeline
 * 
 * IMPACT:
 * - All POST requests to /search are handled here
 * - Validates input using Zod schema before processing
 * - Returns either the search result or an error response
 */

import { Router } from "express";
import { SearchInputSchema } from "../utils/schemas";
import { runSearch } from "../search_tool/searchChain";

export const searchRouter = Router();

// POST /search - Endpoint for processing search queries
// 
// REQUEST BODY: { q: string } - The user's search query
// 
// FLOW:
// 1. Validates request body against SearchInputSchema (min 5 characters)
// 2. Passes validated input to runSearch() which executes the full pipeline:
//    - routeStrategy determines mode (web or direct)
//    - webPath or directPath processes the query
//    - finalValidateAndPolish validates and formats the response
// 3. Returns the final answer with sources and mode information
//
// RESPONSE:
// Success (200): { answer: string, sources: string[], mode: "web" | "direct" }
// Error (400): { error: string }
searchRouter.post("/", async (req, res) => {
  try {
    const input = SearchInputSchema.parse(req.body);
    const result = await runSearch(input);
    res.status(200).json(result);
  } catch (e) {
    const errorMessage = (e as Error)?.message ?? "unknown error occured";
    res.status(400).json({ error: errorMessage });
  }
});
