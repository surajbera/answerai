export type SearchResponse = {
  answer: string
  sources: string[]
}

export const MIN_QUERY_LENGTH = 5

export function isQueryTooShort(query: string): boolean {
  return query.trim().length < MIN_QUERY_LENGTH
}

export async function fetchSearch(query: string): Promise<SearchResponse> {
  let res: Response

  try {
    res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: query }),
    })
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.")
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`

    try {
      const body: unknown = await res.json()
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        message = body.error
      }
    } catch {
      // response wasn't JSON — keep the generic status message
    }

    throw new Error(message)
  }

  return (await res.json()) as SearchResponse
}
