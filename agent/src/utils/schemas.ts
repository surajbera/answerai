/**
 * Zod Schemas - Input/Output Validation
 * 
 * This module defines all the Zod schemas used for validating inputs and outputs
 * throughout the application. Using Zod ensures type safety and proper error
 * messages for API clients.
 * 
 * CONNECTIONS:
 * - Used by: Almost all modules in the application for validation
 * - Exports: Multiple schemas used in different parts of the pipeline
 * 
 * IMPACT:
 * - Changing schemas will affect validation in all modules that use them
 * - Schema errors are returned to the client with helpful messages
 */

import { z } from "zod";

// ============================================================================
// SEARCH RESULT SCHEMAS
// ============================================================================

// Schema for a single search result from the search provider
export const SearchResultSchema = z.object({
  title: z.string().min(1),        // Title of the search result (required)
  url: z.url(),                    // URL of the search result (must be valid URL)
  snippet: z.string().optional().default(""),  // Description snippet (optional)
});

// Schema for an array of search results (maximum 10)
export const SearchResultsSchema = z.array(SearchResultSchema).max(10);

export type SearchResults = z.infer<typeof SearchResultsSchema>;

// ============================================================================
// URL OPENING SCHEMAS
// ============================================================================

// Schema for input to the openUrl function
export const OpenUrlInputSchema = z.object({
  url: z.url(),  // Must be a valid URL
});

// Schema for output from the openUrl function
export const OpenUrlOutputSchema = z.object({
  url: z.url(),              // The normalized URL that was fetched
  content: z.string().min(1), // The cleaned text content (required, min 1 char)
});

// ============================================================================
// SUMMARIZATION SCHEMAS
// ============================================================================

// Schema for input to the summarize function
export const SummarizeInputSchema = z.object({
  text: z.string().min(50, "Need a bit more text to summarize"),
  // Minimum 50 characters required for meaningful summarization
});

// Schema for output from the summarize function
export const SummarizeOutputSchema = z.object({
  summary: z.string().min(1),  // The generated summary (required, min 1 char)
});

// ============================================================================
// SEARCH INPUT SCHEMA
// ============================================================================

// Schema for the main search API input
export const SearchInputSchema = z.object({
  q: z.string().min(5, "Please ask a specific query"),
  // Query must be at least 5 characters to be meaningful
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

// ============================================================================
// SEARCH ANSWER SCHEMA
// ============================================================================

// Schema for the final search response returned to the client
export const SearchAnswerSchema = z.object({
  answer: z.string().min(1),           // The answer text (required, min 1 char)
  sources: z.array(z.url()).default([]), // Array of source URLs (optional, defaults to empty array)
});

export type SearchAnswer = z.infer<typeof SearchAnswerSchema>;
