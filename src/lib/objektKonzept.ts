/**
 * Das Konzept eines Objekts und der Schwerpunkt des Kunden (16.10.2026).
 *
 * Das Konzept steht in der Spalte `objekte.konzept` (Migration
 * 20261016130000). Der Schwerpunkt des Kunden kommt aus dem
 * Erstgesprächsskript, `investments.meta.setterSkript.antworten.schwerpunkt`.
 * Beides wird tolerant gelesen: Fehlt es, gibt es keinen Filter.
 *
 * Reine Funktionen, keine Datenbank.
 */

export type ObjektKonzept = "zusatzrente" | "steuer" | "beides";

export const KONZEPTE: { wert: ObjektKonzept; label: string }[] = [
  { wert: "zusatzrente", label: "Zusatzrente" },
  { wert: "steuer", label: "Steuer" },
  { wert: "beides", label: "Zusatzrente und Steuer" },
];

export function konzeptLabel(k: ObjektKonzept | undefined | null): string {
  return KONZEPTE.find((x) => x.wert === k)?.label ?? "";
}

/** Der gespeicherte Wert, oder undefined, wenn er fehlt oder unbekannt ist. */
export function konzeptLesen(wert: unknown): ObjektKonzept | undefined {
  return wert === "zusatzrente" || wert === "steuer" || wert === "beides" ? wert : undefined;
}

/**
 * Der Schwerpunkt aus einer freien Angabe. Erkannt werden die drei Werte
 * selbst und Wörter wie „Rente“, „Vorsorge“, „Steuern sparen“, „beide“.
 * Eine Liste („rente“ und „steuer“) ergibt „beides“.
 */
export function schwerpunktLesen(wert: unknown): ObjektKonzept | undefined {
  const texte = (Array.isArray(wert) ? wert : [wert]).filter((v): v is string => typeof v === "string");
  let rente = false;
  let steuer = false;
  for (const t of texte) {
    const klein = t.toLowerCase();
    if (/beid/.test(klein)) return "beides";
    if (/rente|vorsorge|zusatz|vermögen|vermoegen/.test(klein)) rente = true;
    if (/steuer/.test(klein)) steuer = true;
  }
  if (rente && steuer) return "beides";
  if (rente) return "zusatzrente";
  if (steuer) return "steuer";
  return undefined;
}

/** Der Schwerpunkt aus dem gespeicherten Erstgesprächsskript eines Investments. */
export function schwerpunktAusSkript(setterSkript: unknown): ObjektKonzept | undefined {
  if (!setterSkript || typeof setterSkript !== "object") return undefined;
  const antworten = (setterSkript as { antworten?: unknown }).antworten;
  if (!antworten || typeof antworten !== "object") return undefined;
  return schwerpunktLesen((antworten as { schwerpunkt?: unknown }).schwerpunkt);
}

/**
 * Wie gut ein Objektkonzept zum Schwerpunkt passt, kleiner ist besser.
 *   0  genau passend
 *   1  teilweise passend („beides“ zu einem Schwerpunkt, oder umgekehrt)
 *   2  Konzept nicht gepflegt
 *   3  passt nicht
 */
export function konzeptRang(konzept: ObjektKonzept | undefined, schwerpunkt: ObjektKonzept | undefined): number {
  if (!schwerpunkt) return 0;
  if (!konzept) return 2;
  if (konzept === schwerpunkt) return 0;
  if (konzept === "beides" || schwerpunkt === "beides") return 1;
  return 3;
}

/** „Nur passendes Konzept“: genau oder teilweise passend. Ungepflegte fallen dabei heraus. */
export function konzeptPasst(konzept: ObjektKonzept | undefined, schwerpunkt: ObjektKonzept | undefined): boolean {
  return konzeptRang(konzept, schwerpunkt) <= 1;
}

export type KonzeptModus = "aus" | "zuerst" | "nur";

/**
 * Eine Liste nach dem Konzept ordnen oder filtern, sonst unverändert.
 * Stabil: Innerhalb eines Rangs bleibt die bisherige Reihenfolge.
 */
export function nachKonzept<T>(
  liste: T[],
  konzeptVon: (eintrag: T) => ObjektKonzept | undefined,
  schwerpunkt: ObjektKonzept | undefined,
  modus: KonzeptModus,
): T[] {
  if (!schwerpunkt || modus === "aus") return liste;
  if (modus === "nur") return liste.filter((e) => konzeptPasst(konzeptVon(e), schwerpunkt));
  return liste
    .map((e, i) => ({ e, i, r: konzeptRang(konzeptVon(e), schwerpunkt) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.e);
}
