import { generateText, type LanguageModelV1 } from "ai";

export type IdeaMode = "you" | "them";
export type IdeaContext = { mode: IdeaMode; where: string; searches: string[]; booked: string[] };
export const IDEA_COUNT = 3;
export const MAX_IDEA_CHARS = 140;

/** Used when the model returns nothing usable, so the button always gives something. */
export const FALLBACK_IDEAS: Record<IdeaMode, string[]> = {
  you: ["A sunset sail for two this Saturday", "Live jazz and a late dinner on Friday", "A Korean spa day with a scrub, Sunday afternoon"],
  them: ["A pottery class for my sister's birthday, under $100", "A couples massage for my parents' anniversary", "A surf lesson for a friend who just moved here"],
};

export function ideaPrompt(c: IdeaContext): string {
  const lines = [
    `Suggest exactly ${IDEA_COUNT} fresh experience ideas for a kickinit user ${c.mode === "them" ? "who is shopping for a GIFT for someone else" : "planning something for themselves"}, in or near ${c.where || "Los Angeles"}.`,
    c.searches.length
      ? `Their recent searches (newest first):\n${c.searches.map((s) => `- ${s}`).join("\n")}`
      : "They haven't searched yet, so pick three varied ideas (food, wellness, something active or cultural).",
    c.booked.length ? `Things they've booked:\n${c.booked.map((b) => `- ${b}`).join("\n")}` : "",
    "Build on their tastes but don't repeat a past search word for word; vary the type of experience.",
    `Write each idea as a short request they could send to the concierge as-is (under ${MAX_IDEA_CHARS} characters), with a when and a who where it helps.`,
    "Reply with only the ideas, one per line. No numbering, no quotes, no intro.",
  ];
  return lines.filter(Boolean).join("\n\n");
}

/** Cleans the model's reply into at most 3 distinct one-line ideas. */
export function parseIdeas(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const idea = raw.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, "").replace(/^["“']|["”']$/g, "").trim();
    if (idea.length < 3 || idea.length > MAX_IDEA_CHARS) continue;
    if (out.some((o) => o.toLowerCase() === idea.toLowerCase())) continue;
    out.push(idea);
    if (out.length === IDEA_COUNT) break;
  }
  return out;
}

/** Three ideas from Claude based on the visitor's history; falls back to stock ideas if the reply is unusable. */
export async function suggestIdeas(c: IdeaContext, model: LanguageModelV1): Promise<{ ideas: string[]; personalized: boolean }> {
  const { text } = await generateText({ model, prompt: ideaPrompt(c), maxTokens: 300 });
  const ideas = parseIdeas(text);
  return ideas.length ? { ideas, personalized: c.searches.length > 0 || c.booked.length > 0 } : { ideas: FALLBACK_IDEAS[c.mode], personalized: false };
}
