function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

type SourceListProps = {
  sources: string[]
}

export function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {getHostname(url)}
        </a>
      ))}
    </div>
  )
}
