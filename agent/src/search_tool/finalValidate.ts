import { RunnableLambda } from "@langchain/core/runnables";
import { candidate } from "./types";
import { SearchAnswerSchema } from "../utils/schemas";
import { getChatModel } from "../shared/models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export const finalValidateAndPolish = RunnableLambda.from(
  async (candidate: candidate) => {
    const finalDraft = {
      answer: candidate.answer,
      sources: candidate.sources ?? [],
    };

    const parsed = SearchAnswerSchema.safeParse(finalDraft);
    if (parsed.success) return parsed.data;

    const model = getChatModel({ temperature: 0.2 });
    
    const response = await model.invoke([
      new SystemMessage(
        [
          "You are a helpful assistant that formats answers correctly.",
          "Respond with a valid JSON object matching: {answer: string, sources: string[]}",
          "Ensure answer is non-empty and sources is an array of valid URLs.",
          "If the input is already valid, return it as-is.",
        ].join("\n")
      ),
      new HumanMessage(
        [
          "Format this into a valid response:",
          JSON.stringify(finalDraft),
        ].join("\n\n")
      ),
    ]);

    const text = typeof response.content === "string" 
      ? response.content 
      : String(response.content);

    try {
      const json = JSON.parse(text);
      const parsed2 = SearchAnswerSchema.safeParse(json);
      if (parsed2.success) return parsed2.data;
    } catch {
      return {
        answer: finalDraft.answer || "I couldn't generate a valid answer.",
        sources: finalDraft.sources || [],
      };
    }

    return {
      answer: finalDraft.answer || "I couldn't generate a valid answer.",
      sources: finalDraft.sources || [],
    };
  }
);
