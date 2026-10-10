"use client";

/**
 * Voz en español para las consignas. En iOS hay que "desbloquear" la síntesis
 * dentro de un toque del usuario (unlock() en el botón Empezar).
 */
export class Speaker {
  enabled = true;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.enabled = false;
      return;
    }
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      this.voice =
        voices.find((v) => v.lang === "es-AR") ??
        voices.find((v) => v.lang === "es-US") ??
        voices.find((v) => v.lang === "es-MX") ??
        voices.find((v) => v.lang.startsWith("es")) ??
        null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  }

  unlock(): void {
    if (!this.enabled) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }

  say(text: string, opts: { interrupt?: boolean } = {}): void {
    if (!this.enabled || !text) return;
    const synth = window.speechSynthesis;
    if (opts.interrupt) synth.cancel();
    // No acumular una cola larga: si ya hay 2 pendientes, descartamos.
    if (!opts.interrupt && synth.pending && synth.speaking) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.voice?.lang ?? "es-AR";
    if (this.voice) u.voice = this.voice;
    u.rate = 1.05;
    synth.speak(u);
  }

  stop(): void {
    if (this.enabled) window.speechSynthesis.cancel();
  }
}
