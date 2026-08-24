import { convert } from "html-to-text";
import { OpenUrlOutputSchema } from "./schemas";

const OPEN_URL_TIMEOUT_MS = 15000;

export async function openUrl(url: string) {
  const normalized = validateUrl(url);

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

    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();

    const text = contentType.includes("text/html")
      ? convert(raw, {
          wordwrap: false,
          selectors: [
            {
              selector: "nav",
              format: "skip",
            },
            {
              selector: "header",
              format: "skip",
            },
            {
              selector: "footer",
              format: "skip",
            },
            {
              selector: "script",
              format: "skip",
            },
            {
              selector: "style",
              format: "skip",
            },
          ],
        })
      : raw;

    const cleaned = collapseWhitespace(text);
    const capped = cleaned.slice(0, 8000);

    return OpenUrlOutputSchema.parse({
      url: normalized,
      content: capped,
    });
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenURL request timed out after ${OPEN_URL_TIMEOUT_MS}ms`);
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

async function safeText(res: Response) {
  try {
    return await res.json();
  } catch {
    return "<no body>";
  }
}

function collapseWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}
