import { useCallback, useState } from "react"

import { fetchSearch, isQueryTooShort } from "@/api/search"

export type QaEntry = {
  id: string
  query: string
  answer: string
  sources: string[]
}

export function useSearch() {
  const [history, setHistory] = useState<QaEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = useCallback(
    async (rawQuery: string) => {
      if (loading) return

      const query = rawQuery.trim()

      if (isQueryTooShort(query)) {
        setError("Please ask a specific query")
        return
      }

      setLoading(true)
      setError(null)

      try {
        const { answer, sources } = await fetchSearch(query)
        const entry: QaEntry = { id: crypto.randomUUID(), query, answer, sources }
        setHistory((prev) => [entry, ...prev])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      } finally {
        setLoading(false)
      }
    },
    [loading]
  )

  return { history, loading, error, ask }
}
