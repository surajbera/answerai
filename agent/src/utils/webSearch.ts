import { serperSearch } from "./serperSearch";

export async function webSearch(q: string) {
  const query = (q ?? "").trim();
  if (!query) return [];

  return await serperSearch(query);
}
