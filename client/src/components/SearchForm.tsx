import { useState, type FormEvent } from "react"
import { ArrowUp, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isQueryTooShort } from "@/api/search"

type SearchFormProps = {
  onSubmit: (query: string) => void
  loading: boolean
}

export function SearchForm({ onSubmit, loading }: SearchFormProps) {
  const [value, setValue] = useState("")

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading || isQueryTooShort(value)) return

    onSubmit(value)
    setValue("")
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask anything..."
        disabled={loading}
        aria-label="Question"
      />
      <Button
        type="submit"
        size="icon"
        disabled={loading || isQueryTooShort(value)}
      >
        {loading ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        <span className="sr-only">Ask</span>
      </Button>
    </form>
  )
}
