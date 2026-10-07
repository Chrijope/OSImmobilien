export type Verwaltungsart =
  | "keine"
  | "WEG"
  | "SEV"
  | "WEG+SEV"
  | "Mietpool"
  | "Betreiber";

// Legacy: "beides" === "WEG+SEV"
export function normalizeVerwaltungsart(v: any): Verwaltungsart | "" {
  if (!v) return "";
  if (v === "beides") return "WEG+SEV";
  return v as Verwaltungsart;
}

export function verwaltungsartLabel(v: any): string {
  const n = normalizeVerwaltungsart(v);
  if (n === "keine") return "Keine Verwaltung";
  return n || "";
}

export const VERWALTUNGSART_OPTIONS: { value: Verwaltungsart; label: string }[] = [
  { value: "keine", label: "Keine Verwaltung" },
  { value: "WEG", label: "WEG-Verwaltung" },
  { value: "SEV", label: "Sondereigentumsverwaltung (SEV)" },
  { value: "WEG+SEV", label: "WEG + SEV" },
  { value: "Mietpool", label: "Mietpool" },
  { value: "Betreiber", label: "Betreiber (Sorglos-Paket)" },
];

export const VERWALTUNGSART_TOOLTIP =
  "WEG = Verwaltung nach Wohnungseigentumsgesetz. Die Hausverwaltung übernimmt die Verwaltung und Instandhaltungsmaßnahmen der Gemeinschaftsflächen. Du als Vermieter bist für alles in deiner Einheit zuständig (inkl. Mieterwechsel). Hohe Rendite | Voller Aufwand.\n\n" +
  "SEV = Wie WEG, nur dass eine beauftragte Sondereigentumsverwaltung viele Tätigkeiten des Vermieters übernimmt (inkl. Mieterwechsel) für einen monatlichen Fixbetrag oder einen %-Satz an den Einnahmen. Zuverlässigkeit der SEV & Vertrauen ist hier ausschlaggebend. Mittlere Rendite | Geringer Aufwand.\n\n" +
  "Mietpool = Ähnlich zu SEV, nur dass die am Mietpool teilnehmenden Miteigentümer ihrer Mieteinnahmen poolen. Leerstand bei Mieterwechsel wird auf alle Eigentümer verteilt — Risiko reduziert. Mittlere Rendite | Geringer Aufwand.\n\n" +
  "Betreiber = Das Rundum-Sorglos-Paket. Eine Betreibergesellschaft pachtet das gesamte Gebäude und zahlt eine fixe, steigende Pacht für meist 20-25 Jahre. Hier fällt der geringste Aufwand für den Eigentümer und alle regelmäßigen Risiken werden vom Betreiber übernommen. Vor Kauf Betreiber- und Pachtvertrag prüfen. Geringere Rendite | Kaum Aufwand.";

export const SEV_KOSTEN_TOOLTIP =
  "Für dieses Objekt gibt es eine Sondereigentumsverwaltung (SEV) oder einen Mietpool. Dadurch ersparst du dir Aufwand für die Mietersuche und damit verbundenen Leerstand (für einen kleinen monatlichen Betrag an die Verwaltung). Es geht dabei nicht um die Hausverwaltung/WEG-Verwaltung, welche über das Hausgeld verrechnet wird.";

export const VERWALTUNG_HAUSGELD_TOOLTIP =
  "Die Kosten der normalen WEG-Verwaltung sind in den nicht umlegbaren Nebenkosten (Hausgeld) bereits enthalten.";

/** Returns monatliche Verwaltungskosten, die ZUSÄTZLICH zum Hausgeld anfallen (SEV/Mietpool/Betreiber). */
export function getZusatzVerwaltungMonat(meta: any): number {
  if (!meta) return 0;
  const art = normalizeVerwaltungsart(meta.verwaltungsart);
  if (art === "SEV" || art === "WEG+SEV") return Number(meta.verwaltungskostenSev || 0);
  if (art === "Mietpool" || art === "Betreiber") return Number(meta.verwaltungskostenSonstige || 0);
  return 0;
}