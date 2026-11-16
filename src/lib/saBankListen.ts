/**
 * Auswahllisten der Selbstauskunft, die eine Bank so erwartet.
 *
 * Stand: Finanzierungsanfrage Baufi24 (Europace), November 2026. Gespeichert
 * wird der deutsche Text (`label`), wie überall in der Selbstauskunft. Der
 * `code` ist der Exportwert im Baufi24-Formular, damit es sich später ohne
 * Raten füllen lässt.
 */
export type BankListenEintrag = { code: string; label: string };

/** Branche des Arbeitgebers oder der eigenen Firma (Baufi24 lineOfBusiness). */
export const SA_BRANCHEN: BankListenEintrag[] = [
  { code: "Finanz", label: "Banken und Versicherungen" },
  { code: "Baugewerbe", label: "Baugewerbe" },
  { code: "Erziehung", label: "Bildung und Erziehung" },
  { code: "Energie", label: "Energieversorgung" },
  { code: "Erotik", label: "Erotikbranche" },
  { code: "Findienst", label: "Finanzdienstleistungen" },
  { code: "Gastro", label: "Gastronomie" },
  { code: "Gesundheit", label: "Gesundheitswesen" },
  { code: "Handel", label: "Groß- und Einzelhandel" },
  { code: "Handwerk", label: "Handwerk" },
  { code: "Hotel", label: "Hotelgewerbe" },
  { code: "Immover", label: "Immobilienvermittlung" },
  { code: "IT", label: "IT/Beratung" },
  { code: "KfzH", label: "Kfz-Händler" },
  { code: "KfzW", label: "Kfz-Werkstatt" },
  { code: "KirchSoz", label: "Kirchlicher Träger" },
  { code: "Kiosk", label: "Kiosk" },
  { code: "Kurier", label: "Kurierdienst" },
  { code: "Landwirt", label: "Landwirtschaft" },
  { code: "Oeffentl", label: "Öffentlicher Dienst" },
  { code: "Partner", label: "Partnervermittlung" },
  { code: "Industrie", label: "Produktion und Industrie" },
  { code: "Reise", label: "Reisebüro" },
  { code: "Sonnen", label: "Sonnen- und Fitnessstudio" },
  { code: "SonstigeD", label: "Sonstige Dienstleistungen" },
  { code: "Tank", label: "Tankstelle" },
  { code: "Taxi", label: "Taxiunternehmen" },
  { code: "Verkehr", label: "Transport" },
  { code: "Video", label: "Videothek" },
  { code: "Sonstige", label: "Sonstige" },
];

/**
 * Feinere Art der Tätigkeit (Baufi24 jobStatus), je nach Beschäftigungsart.
 *
 * `beschaeftigungsart` bleibt bewusst bei „angestellt“ und „selbstaendig“:
 * Daran hängen Pflichtunterlagen, Prüfungen und Freigaben an vielen Stellen.
 */
export const SA_TAETIGKEITEN: Record<"angestellt" | "selbstaendig", BankListenEintrag[]> = {
  angestellt: [
    { code: "Angest", label: "Angestellte/r" },
    { code: "Arbeiter", label: "Arbeiter/in" },
    { code: "Beamter", label: "Beamte/r" },
    { code: "Soldat", label: "Soldat/in" },
    { code: "Vorstand", label: "Vorstand" },
    { code: "GeringfBes", label: "Geringfügig beschäftigt" },
    { code: "Elternzeit", label: "In Elternzeit" },
  ],
  selbstaendig: [
    { code: "SelbstNB", label: "Selbstständig, nicht bilanzierend" },
    { code: "SelbstB", label: "Selbstständig, bilanzierend" },
    { code: "Freib", label: "Freiberufler/in" },
    { code: "GeschGes", label: "Geschäftsführende/r Gesellschafter/in" },
  ],
};

/** Exportcode zu einem gespeicherten Text, undefined wenn er in keiner Liste steht. */
export function bankCode(liste: BankListenEintrag[], label: string | undefined): string | undefined {
  const gesucht = (label || "").trim().toLowerCase();
  if (!gesucht) return undefined;
  return liste.find((e) => e.label.toLowerCase() === gesucht)?.code;
}
