import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SourceList } from "@/components/SourceList"
import type { QaEntry } from "@/hooks/useSearch"

type AnswerCardProps = {
  entry: QaEntry
}

export function AnswerCard({ entry }: AnswerCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{entry.query}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="whitespace-pre-wrap text-sm leading-6">{entry.answer}</p>
        <SourceList sources={entry.sources} />
      </CardContent>
    </Card>
  )
}
