// ============================================================
// AI Moderator Voice Engine (Web Speech API)
// Provides speech narration in Indonesian (with English fallback)
// ============================================================

class NarratorVoice {
  private enabled: boolean = true;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private isInitialized: boolean = false;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.initVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  private initVoices() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    // Prioritize Indonesian voice
    const idVoice = voices.find(
      (v) => v.lang.startsWith("id") || v.name.toLowerCase().includes("indonesia")
    );
    this.selectedVoice = idVoice || voices.find((v) => v.lang.startsWith("en")) || voices[0] || null;
    this.isInitialized = true;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  public isVoiceEnabled(): boolean {
    return this.enabled;
  }

  public speak(text: string, rate: number = 0.95, pitch: number = 0.9) {
    if (!this.enabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop current speech
      if (!this.isInitialized) {
        this.initVoices();
      }

      // Strip markdown asterisks or symbols for clean speech
      const cleanText = text
        .replace(/\*\*/g, "")
        .replace(/[\#\_\`\~]/g, "")
        .replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
        .trim();

      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
        utterance.lang = this.selectedVoice.lang;
      } else {
        utterance.lang = "id-ID";
      }

      utterance.rate = rate; // Slightly slower for dramatic atmosphere
      utterance.pitch = pitch; // Slightly deeper tone

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("Narrator Voice error:", err);
    }
  }

  public stop() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export const narratorVoice = new NarratorVoice();
