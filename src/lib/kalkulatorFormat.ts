/** Formatierungen für die Beispiel-Kalkulatoren. Getrennt von den Komponenten,
 *  damit Fast Refresh sauber arbeitet. */

export const eur = (v: number, nachkomma = 0) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: nachkomma,
    maximumFractionDigits: nachkomma,
  });

/** Mit Vorzeichen, für Beträge, bei denen die Richtung die Aussage ist. */
export const eurSigned = (v: number) =>
  (v >= 0 ? "+" : "−") +
  Math.abs(Math.round(v)).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Prozentwert mit Komma. `locale` nur für die englische Portalansicht. */
export const prozent = (v: number, nachkomma = 1, locale = "de-DE") =>
  (Number.isFinite(v) ? v : 0).toLocaleString(locale, {
    minimumFractionDigits: nachkomma,
    maximumFractionDigits: nachkomma,
  }) + " %";

/** Farbklasse nach Vorzeichen, mit kleiner Totzone um die Null. */
export const tonKlasse = (v: number) =>
  v >= 0.5 ? "text-[hsl(var(--success))]" : v <= -0.5 ? "text-destructive" : "text-foreground";

/** Kurzform für Achsenbeschriftungen: 350k, 1,2 Mio. */
export const kurzBetrag = (v: number) =>
  Math.abs(v) >= 1e6
    ? (v / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Mio"
    : Math.round(v / 1000).toLocaleString("de-DE") + "k";
