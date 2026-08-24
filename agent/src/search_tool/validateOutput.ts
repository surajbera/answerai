import { RunnableLambda } from "@langchain/core/runnables";
import { candidate } from "./types";
import { SearchAnswerSchema } from "../utils/schemas";

export const validateOutput = RunnableLambda.from(
  async (candidate: candidate) => {
    const answer = candidate.answer?.trim();
    const sources = candidate.sources ?? [];

    if (!answer) {
      return {
        answer: "I couldn't generate a valid answer.",
        sources: sources,
      };
    }

    return SearchAnswerSchema.parse({
      answer,
      sources,
    });
  }
);
