/**
 * Liegengebliebene Kontakte, an einer Stelle gerechnet (seit 24.10.2026).
 *
 * Zwei Fragen, die Startseite und „Alle Kontakte“ gleich beantworten müssen,
 * sonst verspricht die Kachel eine Zahl, die die Liste dahinter nicht zeigt:
 *
 *   - Nie kontaktiert: neuer Lead, kein Versuch, kein Termin, keine Wartezeit.
 *     Die Regel stand bisher nur in AlleKontakte.tsx.
 *   - Ohne nächsten Schritt: weder ein geplanter Termin, eine Aufgabe oder
 *     ein Follow-up in der Zukunft noch eine Wartezeit nach „nicht erreicht“.
 *     Das betraf am 24.10.2026 rund zwei Drittel der offenen Vorgänge.
 *
 * Abgelegte Kontakte (archiviert, verloren) zählen bei beiden nicht.
 */
import type { KundeData } from "./kundenStore";

export interface LiegengebliebenPruefung {
  /** Gibt es einen geplanten Schritt in der Zukunft? Wartephase zählt nicht. */
  hatTermin: (k: KundeData) => boolean;
  /** Steht der Kontakt in der Wartezeit nach „nicht erreicht“? */
  inWartezeit: (k: KundeData) => boolean;
  /** Die wirksame Pipelinestufe. */
  stufe: (k: KundeData) => string;
}

export function istAbgelegt(k: KundeData, stufe: string): boolean {
  return !!k.archiviert || stufe === "verloren" || stufe === "archiviert";
}

export function istNieKontaktiert(k: KundeData, p: LiegengebliebenPruefung): boolean {
  const meta = ((k as { meta?: Record<string, unknown> }).meta || {}) as Record<string, unknown>;
  const versuche = Number(meta.nichtErreichtCount || (k as { nichtErreichtCount?: number }).nichtErreichtCount || 0);
  return versuche === 0 && !p.hatTermin(k) && !p.inWartezeit(k) && p.stufe(k) === "neuer_lead";
}

export function istOhneNaechstenSchritt(k: KundeData, p: LiegengebliebenPruefung): boolean {
  const stufe = p.stufe(k);
  return !istAbgelegt(k, stufe) && !p.hatTermin(k) && !p.inWartezeit(k);
}
