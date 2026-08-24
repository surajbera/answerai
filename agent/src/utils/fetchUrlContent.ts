import FirecrawlApp from "firecrawl";
import { env } from "../shared/env";
import { FetchUrlContentOutputSchema } from "./schemas";

const firecrawl = new FirecrawlApp({ apiKey: env.FIRECRAWL_API_KEY });
const CONTENT_LENGTH_LIMIT = 8000;

export async function fetchUrlContent(url: string) {
  const normalized = validateUrl(url);

  try {
    const result = await firecrawl.crawlUrl(normalized, {
      formats: ["text"], // default is text
      pageOptions: { fetchOptions: { timeout: 15000 } },
    });

    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
      throw new Error("Firecrawl returned no content");
    }

    const markdownContent = result.data[0].markdown || result.data[0].content || "";
    const cleaned = collapseWhitespace(markdownContent);
    const capped = cleaned.slice(0, CONTENT_LENGTH_LIMIT);

    return FetchUrlContentOutputSchema.parse({
      url: normalized,
      content: capped,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Firecrawl failed: ${error.message}`);
    }
    throw error;
  }
}

function validateUrl(url: string) {
  try {
    const parsed = new URL(url);

    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error("only http/https are supported");
    }

    return parsed.toString();
  } catch {
    throw new Error("Invalid Url");
  }
}

function collapseWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}
