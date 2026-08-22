/**
 * Open URL Utility - Web Page Fetching and Content Extraction
 * 
 * This module fetches web pages, cleans their content, and extracts the main
 * textual information for the LLM to process. It acts as a "browser" for the LLM,
 * since LLMs themselves cannot browse the web.
 * 
 * CONNECTIONS:
 * - Used by: openAndSummarizeStep in webPipeline.ts
 * - Uses: OpenUrlOutputSchema from ./schemas.ts for output validation
 * - Uses: html-to-text library for HTML to plain text conversion
 * 
 * IMPACT:
 * - All web page fetching goes through this function
 * - Content cleaning here affects what information the LLM sees
 * - Timeouts or failures here trigger fallback to snippet-based summaries
 */

import { convert } from "html-to-text";
import { OpenUrlOutputSchema } from "./schemas";

// Timeout for URL fetch requests (15 seconds)
// Longer than search timeout because fetching and processing pages takes more time
const OPEN_URL_TIMEOUT_MS = 15000;

// ============================================================================
// OPEN URL FUNCTION (Public API)
// ============================================================================
//
// Main function that fetches a web page, extracts and cleans its content.
//
// @param url - The URL to fetch and process
// @returns Promise<{ url: string, content: string }> - Validated URL and cleaned content
//
// PROCESSING STEPS:
// 1. Validate the URL (must be http/https)
// 2. Fetch the page with a custom User-Agent
// 3. Extract the content based on Content-Type
// 4. Convert HTML to plain text (if HTML) with element filtering
// 5. Clean whitespace and cap content length
export async function openUrl(url: string) {
  // Step 1: Validate the URL format and protocol
  const normalized = validateUrl(url);

  // Step 2: Fetch the page
  // The LLM cannot browse the web itself, so our code acts as a browser tool.
  // We use a custom User-Agent to avoid instant 403 errors from strict websites.

  // Setup timeout and abort controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPEN_URL_TIMEOUT_MS);

  try {
    const res = await fetch(normalized, {
      headers: {
        "User-Agent": "agent-core/2.0 (+search-tool-langchain)",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await safeText(res);
      throw new Error(`OpenURL failed ${res.status} - ${body.slice(0, 200)}`);
    }

    // Step 3: Extract raw content based on Content-Type
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();

    // Step 4: Convert HTML to plain text
    // We strip all unnecessary elements (nav, header, footer, scripts, styles)
    // to keep only the article-like content that we want the model to see
    const text = contentType.includes("text/html")
      ? convert(raw, {
          wordwrap: false,
          selectors: [
            // Skip navigation elements - usually contain links but not main content
            {
              selector: "nav",
              format: "skip",
            },
            // Skip header - typically contains site branding and menus
            {
              selector: "header",
              format: "skip",
            },
            // Skip footer - typically contains copyright, links, but not main content
            {
              selector: "footer",
              format: "skip",
            },
            // Skip script tags - contains JavaScript code, not content
            {
              selector: "script",
              format: "skip",
            },
            // Skip style tags - contains CSS, not content
            {
              selector: "style",
              format: "skip",
            },
          ],
        })
      : raw;

    // Step 5: Clean and cap the content
    // - Collapse multiple whitespace characters into single spaces
    // - Limit to 8000 characters to control input size to the summarization model
    const cleaned = collapseWhitespace(text);
    const capped = cleaned.slice(0, 8000);

    // Validate and return the final output
    return OpenUrlOutputSchema.parse({
      url: normalized,
      content: capped,
    });
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout errors specifically
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenURL request timed out after ${OPEN_URL_TIMEOUT_MS}ms`);
    }

    // Re-throw other errors
    throw error;
  }

// ============================================================================
// URL VALIDATION (Internal Helper)
// ============================================================================
//
// Validates that a URL string is a valid, supported URL.
//
// @param url - The URL string to validate
// @returns string - The normalized URL string
// @throws Error - If URL is invalid or uses unsupported protocol
//
// SUPPORTED PROTOCOLS: http, https
function validateUrl(url: string) {
  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error("only http/https are supported");
    }

    return parsed.toString();
  } catch {
    throw new Error("Invalid Url");
  }
}

// ============================================================================
// SAFE TEXT EXTRACTION (Internal Helper)
// ============================================================================
//
// Safely extracts text from a Response object.
// Tries to parse as JSON first, falls back to a default string if that fails.
//
// @param res - The Response object to extract text from
// @returns Promise<string> - The extracted text
async function safeText(res: Response) {
  try {
    return await res.json();
  } catch {
    return "<no body>";
  }
}

// ============================================================================
// WHITESPACE COLLAPSING (Internal Helper)
// ============================================================================
//
// Collapses multiple consecutive whitespace characters into single spaces.
// This cleans up the text after HTML-to-text conversion.
//
// @param s - The string to clean
// @returns string - The cleaned string with normalized whitespace
function collapseWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}
