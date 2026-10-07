// Staffelung der Wartezeiten zwischen Kontaktversuchen.
// Schritte 1..MAX_KONTAKTVERSUCHE; nach MAX → Lead wird auf "verloren" gesetzt.
//
//  1. Versuch  → 4h Pause
//  2./3./4.    → jeweils bis zum nächsten Tag 09:00
//  5.–10.      → 48h Pause
// 11.–14.      → 72h Pause
// 15.          → Lead verloren
export const MAX_KONTAKTVERSUCHE = 15;

/**
 * Liefert ISO-Timestamp, bis zu dem der Lead nach dem `versuch`-ten
 * "Nicht erreicht"-Klick aus der Ansicht ausgeblendet werden soll.
 * Für `versuch >= MAX_KONTAKTVERSUCHE` wird `null` zurückgegeben –
 * der Aufrufer soll dann den Lead auf "verloren" setzen.
 */
export function getVerstecktBisForVersuch(versuch: number, now: Date = new Date()): string | null {
  if (versuch >= MAX_KONTAKTVERSUCHE) return null;

  // 1. Versuch → +4h
  if (versuch === 1) {
    return new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
  }
  // 2./3./4. Versuch → nächster Tag 09:00 (lokal)
  if (versuch >= 2 && versuch <= 4) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    // Sicherheitsnetz – mindestens 1h in der Zukunft
    if (next.getTime() - now.getTime() < 60 * 60 * 1000) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }
  // 5.–10. Versuch → +48h
  if (versuch >= 5 && versuch <= 10) {
    return new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  }
  // 11.–14. Versuch → +72h
  return new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
}

/** Menschlich lesbares Label der Wartezeit ("4 Stunden", "morgen 09:00", "48 Stunden", …). */
export function getWartezeitLabel(versuch: number): string {
  if (versuch >= MAX_KONTAKTVERSUCHE) return "–";
  if (versuch === 1) return "4 Stunden";
  if (versuch >= 2 && versuch <= 4) return "bis morgen 09:00 Uhr";
  if (versuch >= 5 && versuch <= 10) return "48 Stunden";
  return "72 Stunden";
}

/**
 * Laeuft fuer diesen Lead gerade die Wartezeit nach „Nicht erreicht“?
 *
 * Gerechnet wird ueber den Zeitpunkt und nicht ueber einen Textvergleich der
 * ISO-Zeichenkette. Der Textvergleich stimmt nur, solange beide Seiten exakt
 * dasselbe Format haben; ein Wert mit „+00:00“ statt „Z“ wuerde sonst falsch
 * einsortiert. Fehlt der Wert oder ist er unlesbar, laeuft keine Wartezeit:
 * Ein kaputtes Datum darf einen Lead nicht festhalten.
 *
 * Die Wartezeit regelt nur das Anrufen. Zurueckgeben an die Zentrale haengt
 * nicht an ihr (siehe AlleKontakte, 28.09.2026).
 */
export function istInWartezeit(verstecktBis: unknown, now: Date = new Date()): boolean {
  if (typeof verstecktBis !== "string" || !verstecktBis.trim()) return false;
  const bis = Date.parse(verstecktBis);
  return Number.isFinite(bis) && bis > now.getTime();
}

/** „29.09.2026, 09:00“ fuer die Anzeige, in der Ortszeit des Browsers. */
export function wartezeitEndeText(verstecktBis: string): string {
  return new Date(verstecktBis).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}