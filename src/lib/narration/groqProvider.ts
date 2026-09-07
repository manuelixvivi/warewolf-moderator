// ============================================================
// ASPIRE: WEREWOLF - Groq AI Narration Provider
// "One Village. Many Lies. One Wolf."
// ============================================================

import { NarrationContext } from "./types";
import { validateNarrationOutput } from "./validator";
import { generateFallbackNarrative } from "./fallbackProvider";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_NAME = "llama-3.3-70b-versatile";

export async function generateGroqNarrative(context: NarrationContext): Promise<string> {
  const fallback = generateFallbackNarrative(context);

  if (!GROQ_API_KEY) {
    return fallback;
  }

  const systemPrompt = `You are the master atmospheric AI narrator for the social deduction game "ASPIRE: WEREWOLF" ("One Village. Many Lies. One Wolf.").
Your goal is to provide dramatic, suspenseful storytelling in Indonesian based STRICTLY on the engine facts provided.

CRITICAL RULES:
1. STRICT TRUTH: You must ONLY narrate the factual events given in <ENGINE_FACTS>. Do NOT invent extra deaths or events.
2. STRICT SECRECY: NEVER reveal the secret roles of alive players or dead players unless explicitly stated in facts! For example, do NOT say "Budi sang Seer telah mati". Only say "Budi telah tewas".
3. TONE: Atmospheric, cinematic, suspenseful, 2-3 sentences max.
4. LANGUAGE: Indonesian (bahasa Indonesia yang dramatis dan sastrawi).`;

  const userPrompt = `<ENGINE_FACTS>
Phase: ${context.phase}
Day: ${context.dayCount}
Night: ${context.nightCount}
Theme: ${context.theme}
Killed: ${context.facts.killedPlayerNames.join(", ") || "None"}
Saved: ${context.facts.savedPlayerNames.join(", ") || "None"}
Eliminated by Vote: ${context.facts.eliminatedPlayerName || "None"}
Tie Vote: ${context.facts.isTieVote ? "YES" : "NO"}
Prince Survived: ${context.facts.princeSurvived ? "YES" : "NO"}
Tanner Won: ${context.facts.tannerWon ? "YES" : "NO"}
Winner: ${context.facts.winnerTeam || "None"}
Reason: ${context.facts.winReason || ""}
</ENGINE_FACTS>

Berikan narasi dramatis singkat dalam Bahasa Indonesia sesuai fakta di atas!`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500); // 6.5s timeout

    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 220,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("Groq API response not OK:", response.status, response.statusText);
      return fallback;
    }

    const data = await response.json();
    const generatedText = data?.choices?.[0]?.message?.content?.trim();

    if (!generatedText) {
      return fallback;
    }

    // Safety and leak validation
    const validation = validateNarrationOutput(generatedText, context);
    if (!validation.isValid) {
      console.warn("Groq narrative rejected by safety validator:", validation.violationReason);
      return fallback;
    }

    return generatedText;
  } catch (err) {
    console.warn("Groq API call failed, falling back to deterministic narrator:", err);
    return fallback;
  }
}
