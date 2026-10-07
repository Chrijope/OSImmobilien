import type { AkademieSection } from "./vertriebsakademieContent";
export const AKADEMIE_NEU = "/vertriebsakademie";
export function akademieZiel(to: string, _pathname: string) {
  return to.replace(/^\/vertriebsakademie-neu(?=\/|\?|#|$)/, AKADEMIE_NEU);
}
/** Presentation only: keep every original field and ID; never duplicate progress. */
export function teileLektion(section: AkademieSection) {
  const { aufgaben, uebungen, checkliste, ...wissen } = section;
  return {
    wissen,
    praxis: {
      id: section.id,
      ueberschrift: section.ueberschrift,
      aufgaben,
      uebungen,
      checkliste,
    } as AkademieSection,
  };
}
export interface VaLesestelle {
  slug: string;
  section: string;
}
const key = (userId: string) => `va-lesestelle:${userId}`;
export function leseLesestelle(userId?: string): VaLesestelle | null {
  if (!userId) return null;
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) || "null");
    return v && typeof v.slug === "string" && typeof v.section === "string"
      ? v
      : null;
  } catch {
    return null;
  }
}
export function merkeLesestelle(
  userId: string | undefined,
  value: VaLesestelle,
) {
  if (!userId) return;
  try {
    localStorage.setItem(key(userId), JSON.stringify(value));
  } catch {
    /* Reading remains available when storage is disabled. */
  }
}
