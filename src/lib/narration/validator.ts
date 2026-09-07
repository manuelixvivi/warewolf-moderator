// ============================================================
// ASPIRE: WEREWOLF - Narration Output Safety Validator
// "One Village. Many Lies. One Wolf."
// ============================================================

import { NarrationContext } from "./types";

export function validateNarrationOutput(
  text: string,
  context: NarrationContext
): { isValid: boolean; violationReason?: string } {
  if (!text || text.trim().length < 15) {
    return { isValid: false, violationReason: "Narration output is too short or empty." };
  }

  const lowerText = text.toLowerCase();

  // Check for forbidden secret role leaks
  if (context.forbiddenRoleLeaks && context.forbiddenRoleLeaks.length > 0) {
    for (const leak of context.forbiddenRoleLeaks) {
      const pName = leak.playerName.toLowerCase();
      const rName = leak.roleName.toLowerCase();

      // If both player name and their role name appear close to each other
      if (lowerText.includes(pName) && lowerText.includes(rName)) {
        return {
          isValid: false,
          violationReason: `Potensi kebocoran peran rahasia: Nama "${leak.playerName}" dan role "${leak.roleName}" terdeteksi dalam narasi publik.`,
        };
      }
    }
  }

  // Ensure output doesn't contain meta prompt tags or hallucinations
  if (lowerText.includes("<engine_facts>") || lowerText.includes("system prompt")) {
    return { isValid: false, violationReason: "Metaprompt artifacts detected in narrative." };
  }

  return { isValid: true };
}
