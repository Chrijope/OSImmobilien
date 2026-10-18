/**
 * Zerlegt ein Skript in Clips, die das Videomodell in einem Stueck erzeugen
 * kann (Seedance 2.0: 4 bis 15 Sekunden).
 *
 * Gerechnet wird mit 2,5 gesprochenen Woertern je Sekunde, ueblich fuer
 * ruhiges Deutsch. Geschnitten wird an Satzenden; nur ein einzelner Satz, der
 * allein zu lang ist, wird mitten im Satz geteilt.
 */

export const WOERTER_JE_SEKUNDE = 2.5;
export const MAX_SEKUNDEN = 15;
export const MIN_SEKUNDEN = 4;
// Eine Sekunde Luft fuer Ein- und Ausatmen am Clipende.
const MAX_WOERTER = Math.floor((MAX_SEKUNDEN - 1) * WOERTER_JE_SEKUNDE);

export type ClipPlan = { text: string; sekunden: number };

function woerter(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function dauerFuer(text: string): number {
  const s = Math.ceil(woerter(text).length / WOERTER_JE_SEKUNDE) + 1;
  return Math.min(MAX_SEKUNDEN, Math.max(MIN_SEKUNDEN, s));
}

export function skriptInClips(skript: string): ClipPlan[] {
  const saetze = skript.trim().split(/(?<=[.!?…])\s+/).filter((s) => s.trim());
  const teile: string[] = [];
  for (const satz of saetze) {
    const w = woerter(satz);
    for (let i = 0; i < w.length; i += MAX_WOERTER) teile.push(w.slice(i, i + MAX_WOERTER).join(" "));
  }

  const clips: string[] = [];
  for (const teil of teile) {
    const letzter = clips[clips.length - 1];
    if (letzter && woerter(letzter).length + woerter(teil).length <= MAX_WOERTER) {
      clips[clips.length - 1] = `${letzter} ${teil}`;
    } else {
      clips.push(teil);
    }
  }
  return clips.map((text) => ({ text, sekunden: dauerFuer(text) }));
}
