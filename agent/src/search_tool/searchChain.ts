import { RunnableBranch, RunnableSequence } from "@langchain/core/runnables";
import { routerStep } from "./routeStrategy";
import { candidate } from "./types";
import { validateOutput } from "./validateOutput";
import { SearchInput } from "../utils/schemas";
import { directPath } from "./directPipeline";
import { webPath } from "./webPipeline";

const branch = RunnableBranch
  .from<{ q: string; mode: "web" | "direct" }, candidate>([
    [(input) => input.mode === "web", webPath],
    directPath,
  ]);

export const searchChain = RunnableSequence.from([
  routerStep,
  branch,
  validateOutput,
]);

export async function runSearch(input: SearchInput) {
  return await searchChain.invoke(input);
}

/**
 * RunnableBranch.from<InputType, OutputType>([...]);
 * .from is a static factory method that creates a branch.
 * It takes an array of [condition, runnable] tuples.
 * The last element is the default runnable if no conditions match.
*/
