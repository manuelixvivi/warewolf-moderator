// ============================================================
// ASPIRE: WEREWOLF - Narration Types
// "One Village. Many Lies. One Wolf."
// ============================================================

export type StoryTheme =
  | "CLASSIC_MEDIEVAL" // Desa Terpencil, Kabut Malam, Lonceng Gereja
  | "GOTHIC_HORROR"    // Kastil Kuno, Kutukan Darah, Badai Petir
  | "CYBERPUNK_NEO"    // Distopia Neon, Rogue Cyborgs, Blackout
  | "FOLKLORE_NUSANTARA"; // Hutan Larangan, Kabut Gaib, Malam Satu Suro

export type NarrationStyle = "DRAMATIC" | "MYSTERIOUS" | "INTENSE" | "POETIC";

export interface NarrationContext {
  phase: "MORNING" | "VOTE_RESULT" | "GAME_OVER";
  theme: StoryTheme;
  style: NarrationStyle;
  dayCount: number;
  nightCount: number;
  // Engine Facts (Authoritative)
  facts: {
    killedPlayerNames: string[];
    savedPlayerNames: string[];
    eliminatedPlayerName?: string | null;
    isTieVote?: boolean;
    princeSurvived?: boolean;
    tannerWon?: boolean;
    winnerTeam?: string | null;
    winReason?: string;
  };
  // Confidential information used strictly for leak validation (NEVER revealed unless allowed)
  forbiddenRoleLeaks?: Array<{ playerName: string; roleName: string }>;
}
