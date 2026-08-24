import { AnswerCard } from "@/components/AnswerCard"
import { EmptyState } from "@/components/EmptyState"
import { SearchForm } from "@/components/SearchForm"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSearch } from "@/hooks/useSearch"

function App() {
  const { history, loading, error, ask } = useSearch()

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">AnswerAI</h1>
        <p className="text-sm text-muted-foreground">
          Ask a question — get a short, cited answer, with the source URLs it
          actually read when it searched the web.
        </p>
      </header>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <CardContent className="flex flex-col gap-3">
            {history.length === 0 ? (
              <EmptyState />
            ) : (
              history.map((entry) => <AnswerCard key={entry.id} entry={entry} />)
            )}
          </CardContent>
        </ScrollArea>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <SearchForm onSubmit={ask} loading={loading} />
    </main>
  )
}

export default App
