import { env } from "../shared/env";
import { SearchResultSchema, SearchResultsSchema } from "./schemas";

const SERPER_API_URL = "https://google.serper.dev/search";
const SERPER_TIMEOUT_MS = 10000;

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
}

export async function webSearch(q: string) {
  const query = (q ?? "").trim();
  if (!query) return [];

  return await searchSerperUtil(query);
}

async function searchSerperUtil(query: string) {
  if (!env.SERPER_API_KEY) {
    throw new Error("SERPER_API_KEY is missing");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);

  try {
    const response = await fetch(SERPER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": env.SERPER_API_KEY,
      },
      body: JSON.stringify({ q: query }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => "<no body>");
      throw new Error(`Serper error: ${response.status} - ${text}`);
    }

    const data = await response.json();

    const organicResults = Array.isArray(data?.organic) ? data.organic : [];

    const normalized = organicResults.slice(0, 5).map((r: SerperOrganicResult) =>
      SearchResultSchema.parse({
        title: String(r?.title ?? "").trim() || "Untitled",
        url: String(r?.link ?? "").trim(),
        snippet: String(r?.snippet ?? "").trim().slice(0, 220),
      })
    );

    return SearchResultsSchema.parse(normalized);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Serper request timed out after ${SERPER_TIMEOUT_MS}ms`);
    }

    throw error;
  }
}