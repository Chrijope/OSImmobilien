import type { KundeData } from "@/lib/kundenStore";
import { findeGrund } from "@/lib/uebergabeGrund";
import type { BeraterHistorieEintrag } from "@/lib/beraterHistorie";
import type { Umhaengung } from "@/lib/leadZuweisungStatistik";

/**
 * Leads, die ein Vertriebspartner an uns zurückgegeben hat.
 *
 * WARUM ES DAS GIBT
 *
 * Bis zum 21.09.2026 konnte ein Vertriebspartner seine Leads direkt an einen
 * anderen Partner weitergeben. Christian hat das umgestellt: Der Partner gibt
 * zurück an uns, wir prüfen und verteilen neu. Damit liegt die Entscheidung,
 * wer einen schwierigen Lead als Nächstes anruft, wieder bei der Zentrale.
 *
 * WORAN MAN EINEN RÜCKLÄUFER ERKENNT
 *
 * An der Verlaufsspur, nicht an einem neuen Feld. Ein zurückgegebener Lead hat
 * keinen Zuständigen mehr, aber in seiner Beraterhistorie steht ein
 * abgeschlossener Eintrag. Ein Lead, der noch nie jemandem gehörte, hat
 * überhaupt keine Historie. Das unterscheidet die beiden sauber, ohne dass
 * eine Spalte dazukommt.
 */

/** Was ein Rückläufer über seine Rückgabe erzählt. */
export interface RueckgabeInfo {
  /** Wer ihn zurückgegeben hat. */
  vonName: string;
  /**
   * Kennung des Partners, der ihn zurückgegeben hat. Seit dem 30.09.2026
   * immer mitgeschrieben; bei älteren Einträgen leer, dann hilft
   * `kennungAusProtokoll`.
   */
  vonId?: string;
  /** Wie oft der Lead insgesamt an uns zurückgegeben wurde. */
  anzahl: number;
  /** Alle Rückgaben, älteste zuerst, für den Tooltip. */
  verlauf: Array<{ name: string; am: string }>;
  /** Wann, als ISO-Zeitstempel. */
  am: string;
  /** Der Grund im Klartext, leer wenn keiner erfasst wurde. */
  grundText: string;
  /** Wie oft der Kunde bis dahin nicht erreicht wurde. */
  nichtErreicht: number;
}

function historie(k: Partial<KundeData> | null | undefined): BeraterHistorieEintrag[] {
  const roh = (k as any)?.beraterHistorie;
  return Array.isArray(roh) ? (roh as BeraterHistorieEintrag[]) : [];
}

function hatZustaendigen(k: Partial<KundeData> | null | undefined): boolean {
  return !!String((k as any)?.zustaendig_id || "").trim();
}

/**
 * Ist dieser Lead an uns zurückgegeben worden?
 *
 * Drei Bedingungen, alle nötig: kein Zuständiger, mindestens ein
 * abgeschlossener Eintrag in der Historie, und kein offener. Der offene
 * Eintrag wäre der Widerspruch: Dann gehört der Lead noch jemandem, und die
 * leere Zuständigkeit wäre nur ein halb gespeicherter Zustand.
 */
export function istRuecklaeufer(k: Partial<KundeData> | null | undefined): boolean {
  if (!k) return false;
  if (hatZustaendigen(k)) return false;
  const eintraege = historie(k);
  if (eintraege.length === 0) return false;
  if (eintraege.some((e) => e && e.name && !e.bis)) return false;
  return eintraege.some((e) => e && e.name && e.bis);
}

/**
 * Die Angaben zur letzten Rückgabe, für die Anzeige in der Lead-Verwaltung.
 *
 * `null`, wenn es kein Rückläufer ist. Der Grund kommt aus derselben Liste,
 * aus der ihn der Partner ausgewählt hat, damit in der Lead-Verwaltung
 * derselbe Wortlaut steht wie im Dialog.
 */
export function rueckgabeInfo(k: Partial<KundeData> | null | undefined): RueckgabeInfo | null {
  if (!istRuecklaeufer(k)) return null;
  const eintraege = historie(k);
  const abgeschlossen = eintraege.filter((e) => e && e.name && e.bis);
  /*
   * Rückgaben sind die abgeschlossenen Einträge, an die kein anderer
   * Eintrag nahtlos anschließt. Beim Umhängen A an B schreibt
   * `reassignBerater` dasselbe `now` in A.bis und B.von; das ist eine
   * Übergabe, keine Rückgabe.
   */
  const anfaenge = new Set(eintraege.map((e) => e?.von).filter(Boolean));
  const rueckgaben = abgeschlossen
    .filter((e) => !anfaenge.has(e.bis))
    .sort((a, b) => Date.parse(a.bis || "") - Date.parse(b.bis || ""));
  // Der zuletzt beendete Eintrag ist die Rückgabe, um die es geht.
  const letzter = abgeschlossen.reduce((a, b) =>
    Date.parse(b.bis || "") >= Date.parse(a.bis || "") ? b : a,
  );

  const option = findeGrund(letzter.grund);
  const zusatz = (letzter.grundText || "").trim();
  const grundText = option
    ? zusatz
      ? `${option.label}: ${zusatz}`
      : option.label
    : zusatz;

  return {
    vonName: letzter.name,
    vonId: (letzter.id || "").trim() || undefined,
    am: letzter.bis || "",
    anzahl: Math.max(rueckgaben.length, 1),
    verlauf: (rueckgaben.length ? rueckgaben : [letzter]).map((e) => ({ name: e.name, am: e.bis || "" })),
    grundText,
    nichtErreicht: Number((k as any)?.nichtErreichtCount || 0),
  };
}

/** Wie weit Protokollzeile und Verlaufsspur zeitlich auseinander liegen dürfen. */
const PROTOKOLL_TOLERANZ_MS = 10 * 60 * 1000;

/**
 * Kennung des zurückgebenden Partners für Altfälle aus dem Protokoll.
 *
 * Vor dem 30.09.2026 stand in der Verlaufsspur bei einer Rückgabe oft nur
 * der Name. Das Protokoll (`activity_log`, `kontakt_reassigned`) hält aber
 * jeden Wechsel mit alter und neuer Kennung fest. Gesucht wird der Wechsel
 * auf „niemand“ an diesem Kontakt, der der Rückgabe zeitlich am nächsten
 * liegt, höchstens zehn Minuten daneben. Kein Namensvergleich.
 */
export function kennungAusProtokoll(
  kontaktId: string,
  am: string,
  umhaengungen: Umhaengung[],
): string | undefined {
  const ziel = Date.parse(am);
  if (!kontaktId || isNaN(ziel)) return undefined;
  let beste: { id: string; abstand: number } | undefined;
  for (const u of umhaengungen) {
    if (u.kontaktId !== kontaktId || u.neu || !u.alt) continue;
    const abstand = Math.abs(Date.parse(u.am) - ziel);
    if (!(abstand <= PROTOKOLL_TOLERANZ_MS)) continue;
    if (!beste || abstand < beste.abstand) beste = { id: u.alt, abstand };
  }
  return beste?.id;
}
