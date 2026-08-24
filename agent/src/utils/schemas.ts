import { z } from "zod";

export const SearchResultSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
  snippet: z.string().optional().default(""),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResultsSchema = z.array(SearchResultSchema).max(5);

export type SearchResults = z.infer<typeof SearchResultsSchema>;

export const OpenUrlInputSchema = z.object({
  url: z.url(),
});

export const FetchUrlContentOutputSchema = z.object({
  url: z.url(),
  content: z.string().min(1),
});

export type FetchUrlContentOutput = z.infer<typeof FetchUrlContentOutputSchema>;

export const SummarizeInputSchema = z.object({
  text: z.string().min(50, "Need a bit more text to summarize"),
});

export const SummarizeOutputSchema = z.object({
  summary: z.string().min(1),
});

export const SearchInputSchema = z.object({
  q: z.string().min(5, "Please ask a specific query"),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

export const SearchAnswerSchema = z.object({
  answer: z.string().min(1),
  sources: z.array(z.url()).default([]),
});

export type SearchAnswer = z.infer<typeof SearchAnswerSchema>;
