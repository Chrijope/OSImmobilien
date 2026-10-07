/**
 * Vor- und Nachname für die Selbstauskunft eines anonymen Besuchers.
 *
 * Ohne Anmeldung kann die Seite den Kontakt nicht lesen, sie kennt nur den
 * Link (`get_sa_fill_token`). Bis zum 26.09.2026 wurde dessen Anzeigename am
 * ersten Leerzeichen zerlegt, aus „Anna Maria Müller“ wurde Vorname „Anna“,
 * Nachname „Maria Müller“, und das Abschließen schrieb es an den Kontakt
 * zurück. Seitdem stehen die Namensteile getrennt in der Vorbelegung des
 * Links. Nur wenn sie dort fehlen (alte Links), wird der Anzeigename benutzt,
 * und auch das nur, wenn er genau zwei Wörter hat. Sonst bleibt das Feld leer
 * und der Kunde tippt es selbst.
 */
export function nameAusLink(vorbelegung: unknown, anzeigename: unknown): { vorname: string; nachname: string } {
  const v = (vorbelegung && typeof vorbelegung === "object" ? vorbelegung : {}) as Record<string, unknown>;
  const vorname = typeof v.vorname === "string" ? v.vorname.trim() : "";
  const nachname = typeof v.nachname === "string" ? v.nachname.trim() : "";
  if (vorname || nachname) return { vorname, nachname };
  const teile = String(anzeigename ?? "").trim().split(/\s+/).filter(Boolean);
  return teile.length === 2 ? { vorname: teile[0], nachname: teile[1] } : { vorname: "", nachname: "" };
}
