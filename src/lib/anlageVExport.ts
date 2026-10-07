/**
 * Anlage-V-Export (Stufe 3 der Kundenportal-Sanierung).
 *
 * Baut aus einem Investment (eigenes ODER ueber den kundePortalInvestment-
 * Adapter abgebildetes MOREImmo-Investment) plus Steuerjahr eine strukturierte
 * Aufstellung zur Vorbereitung der Anlage V: Objektangaben, Einnahmen,
 * Werbungskosten, Ergebnis und die Liste der fehlenden Angaben.
 *
 * Grundsaetze:
 *  - Es wird NICHTS doppelt gerechnet. Alle Betraege kommen aus berechneSteuer
 *    beziehungsweise erhaltungsaufwandAusBelegen in
 *    eigeneInvestmentBerechnungen.ts.
 *  - Keine stillen Schaetzwerte: fehlende Posten erscheinen ausdruecklich als
 *    "Angabe fehlt" und stehen zusaetzlich in `fehlendeAngaben`.
 *  - Jede Zeile nennt die Rechtsgrundlage (Paragraf) und die Datenherkunft.
 *  - Kein ELSTER-Zeilen-Mapping: Die Gliederung folgt der Anlage-V-Struktur
 *    (Einnahmen / Werbungskosten / Ergebnis) ohne amtliche Zeilennummern.
 */

import {
  berechneSteuer,
  erhaltungsaufwandAusBelegen,
  leseAnlageV,
  ERHALTUNG_TYP_REGEX,
  type ExternesInvestment,
} from "@/lib/eigeneInvestmentBerechnungen";

export type AnlageVHerkunft = "eigen" | "moreimmo";

/** Investment mit optionalen Adressfeldern (eigene Tabelle und Adapter haben sie). */
export type AnlageVInvestment = ExternesInvestment & {
  adresse?: string | null;
  plz?: string | null;
  ort?: string | null;
};

export interface AnlageVZeile {
  posten: string;
  /** null = Angabe fehlt, der Posten wurde nicht gerechnet. */
  betrag: number | null;
  typ: "einnahme" | "werbungskosten";
  /** Datenherkunft, z. B. "erfasst vom Kunden" oder "Beleg vom 12.03.2026". */
  quelle: string;
  /** Rechtsgrundlage, z. B. "§ 21 Abs. 1 EStG". Leer, wenn keine passt. */
  rechtsgrundlage: string;
  fehlt: boolean;
}

export interface AnlageVBeleg {
  titel: string;
  /** Belegdatum formatiert als TT.MM.JJJJ, oder leer wenn unbekannt. */
  datum: string;
  betrag: number;
}

export interface AnlageVAufstellung {
  bezeichnung: string;
  jahr: number;
  /** Erstellungsdatum als TT.MM.JJJJ. */
  erstelltAm: string;
  herkunft: AnlageVHerkunft;
  /** Objektangaben fuers Deckblatt und den Kopfteil. */
  objekt: Array<{ label: string; wert: string; fehlt?: boolean }>;
  einnahmen: AnlageVZeile[];
  werbungskosten: AnlageVZeile[];
  /** Erhaltungsaufwand als Einzelbelege des Steuerjahres. */
  erhaltungsBelege: AnlageVBeleg[];
  summeEinnahmen: number;
  summeWerbungskosten: number;
  /** Einnahmen minus Werbungskosten, bei Miteigentum bereits anteilig. */
  ueberschussVerlust: number;
  /** Miteigentumsanteil in %, mit dem alle Posten skaliert sind. */
  miteigentumsanteilP: number;
  vermieteteMonate: number;
  /** true = 12 Monate mangels erster Mieteinnahme nur angenommen. */
  vermieteteMonateAngenommen: boolean;
  sonderAfaHinweis: string;
  fehlendeAngaben: string[];
  unvollstaendig: boolean;
}

export interface AnlageVOptionen {
  jahr: number;
  herkunft: AnlageVHerkunft;
  /** Bodenwert-Anteil in % aus dem Cockpit, falls kein Gebaeudeanteil erfasst ist. */
  bodenwertAnteil?: number | null;
  /** Verwaltungsanteil des Hausgelds in %, falls kein Euro-Betrag erfasst ist. */
  hausgeldNichtUmlagefaehigProzent?: number | null;
  sonderAfA7b?: boolean;
}

const fmtEuro = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

const fmtDatum = (d: string | null | undefined): string => {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/**
 * Erhaltungsaufwand-Belege des Steuerjahres als Liste. Gleiche Kriterien wie
 * erhaltungsaufwandAusBelegen: nur Belege mit erfasstem Betrag und passendem
 * Typ oder gesetzter steuer_relevant-Markierung, Belegdatum im Steuerjahr.
 */
export function erhaltungsBelegeDesJahres(
  dokumente: Array<Record<string, unknown>> | null | undefined,
  jahr: number,
): AnlageVBeleg[] {
  const belege: AnlageVBeleg[] = [];
  for (const d of dokumente || []) {
    const betrag = Number(d?.betrag);
    if (!Number.isFinite(betrag) || betrag <= 0) continue;
    const relevant = d?.steuer_relevant === true || ERHALTUNG_TYP_REGEX.test(String(d?.typ || ""));
    if (!relevant) continue;
    const datum = new Date(String(d?.datum || ""));
    if (Number.isNaN(datum.getTime()) || datum.getFullYear() !== jahr) continue;
    belege.push({
      titel: String(d?.titel || d?.name || "Beleg"),
      datum: fmtDatum(String(d?.datum || "")),
      betrag,
    });
  }
  return belege;
}

/** Dateiname des PDF-Exports: anlage-v-vorbereitung_<bezeichnung>_<jahr>.pdf */
export function anlageVDateiname(bezeichnung: string, jahr: number): string {
  const sauber = (bezeichnung || "investment")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "investment";
  return `anlage-v-vorbereitung_${sauber}_${jahr}.pdf`;
}

export function baueAnlageVAufstellung(
  inv: AnlageVInvestment,
  opt: AnlageVOptionen,
): AnlageVAufstellung {
  const jahr = opt.jahr;
  const anlageV = leseAnlageV(inv);
  const erhaltung = erhaltungsaufwandAusBelegen(inv.dokumente, jahr);
  const belege = erhaltungsBelegeDesJahres(inv.dokumente, jahr);

  // Steuersatz absichtlich NICHT gesetzt: Die Anlage V endet beim Ueberschuss
  // beziehungsweise Verlust, ein Steuereffekt gehoert nicht hinein. Der
  // dadurch entstehende Eintrag "Steuersatz fehlt" wird unten gefiltert.
  const ergebnis = berechneSteuer(inv, {
    bodenwertAnteil: opt.bodenwertAnteil ?? null,
    hausgeldNichtUmlagefaehig: opt.hausgeldNichtUmlagefaehigProzent ?? null,
    sonderAfA7b: !!opt.sonderAfA7b,
    erhaltungsaufwandJahr: erhaltung.summe,
    grenzsteuersatz: null,
    betrachtungsjahr: jahr,
  });

  const fehlendeAngaben = ergebnis.fehlendeAngaben.filter(
    (f) => !f.startsWith("Steuersatz fehlt"),
  );

  // Datenherkunft: eigene Investments erfasst der Kunde selbst, bei
  // MOREImmo-Investments kommen die Werte aus dem CRM-Datensatz.
  const eigen = opt.herkunft === "eigen";
  const qErfasst = eigen ? "erfasst vom Kunden" : "aus dem MOREImmo-Investment";
  const qSteuerangaben = eigen
    ? "aus den Steuerangaben des Investments"
    : "aus dem MOREImmo-Investment";
  const qFinanzierung = eigen
    ? "berechnet aus Restschuld und Zinssatz, erfasst vom Kunden"
    : "berechnet aus Restschuld und Zinssatz des Finanzierungsangebots";

  /* ── Einnahmen ── */
  const mieteErfasst = Number(inv.mieteinnahmen_kalt || 0) > 0;
  if (!mieteErfasst) {
    fehlendeAngaben.push("Kaltmiete fehlt, Mieteinnahmen nicht berechnet");
  }
  const einnahmen: AnlageVZeile[] = [
    {
      posten: mieteErfasst
        ? `Mieteinnahmen (Kaltmiete, ${ergebnis.vermieteteMonate} vermietete Monate)`
        : "Mieteinnahmen (Kaltmiete)",
      betrag: mieteErfasst ? ergebnis.mietEinnahmenJahr : null,
      typ: "einnahme",
      quelle: qErfasst,
      rechtsgrundlage: "§ 21 Abs. 1 EStG",
      fehlt: !mieteErfasst,
    },
    {
      posten: anlageV.umlagenMonat != null
        ? `Vereinnahmte Umlagen (${ergebnis.vermieteteMonate} Monate)`
        : "Vereinnahmte Umlagen (Nebenkosten-Vorauszahlungen des Mieters)",
      betrag: anlageV.umlagenMonat != null ? ergebnis.umlagenJahr : null,
      typ: "einnahme",
      quelle: qSteuerangaben,
      rechtsgrundlage: "§ 21 Abs. 1 EStG",
      fehlt: anlageV.umlagenMonat == null,
    },
  ];

  /* ── Werbungskosten ── */
  const restschuld = Number(inv.offene_tilgung || inv.darlehenssumme || 0);
  const zinsFehlt = restschuld > 0 && !(Number(inv.zinssatz || 0) > 0);
  if (zinsFehlt) {
    fehlendeAngaben.push("Zinssatz fehlt, Schuldzinsen nicht berechnet");
  }

  const afaFehlt = ergebnis.afaBemessungsgrundlage <= 0;
  const afaAnteilig = ergebnis.afaMonate < 12 ? `, ${ergebnis.afaMonate}/12 anteilig im Kaufjahr` : "";
  const hausgeldRelevant = Number(inv.hausgeld || 0) > 0;
  const hausgeldAngabeFehlt = hausgeldRelevant
    && anlageV.hausgeldNichtUmlageMonat == null
    && opt.hausgeldNichtUmlagefaehigProzent == null;

  const werbungskosten: AnlageVZeile[] = [
    {
      posten: "Schuldzinsen",
      betrag: zinsFehlt ? null : ergebnis.schuldzinsenJahr,
      typ: "werbungskosten",
      quelle: qFinanzierung,
      rechtsgrundlage: "§ 9 Abs. 1 Satz 3 Nr. 1 EStG",
      fehlt: zinsFehlt,
    },
    {
      posten: afaFehlt
        ? "AfA Gebäude"
        : `AfA Gebäude, ${ergebnis.afaSatzP.toLocaleString("de-DE", { maximumFractionDigits: 2 })} % von ${fmtEuro(ergebnis.afaBemessungsgrundlage)}${afaAnteilig}`,
      betrag: afaFehlt ? null : ergebnis.afaJahr,
      typ: "werbungskosten",
      quelle: afaFehlt
        ? "Gebäudeanteil, Baujahr oder AfA-Satz nicht erfasst"
        : "berechnet aus Kaufpreis, erfassten Kaufnebenkosten und Gebäudeanteil",
      rechtsgrundlage: ergebnis.afaParagraf || "§ 7 Abs. 4 EStG",
      fehlt: afaFehlt,
    },
    ...(ergebnis.sonderAfaJahr > 0
      ? [{
          posten: "Sonderabschreibung Mietwohnungsneubau",
          betrag: ergebnis.sonderAfaJahr,
          typ: "werbungskosten" as const,
          quelle: "berechnet aus der AfA-Bemessungsgrundlage",
          rechtsgrundlage: "§ 7b EStG",
          fehlt: false,
        }]
      : []),
    ...(hausgeldRelevant
      ? [{
          posten: "Hausgeld, nicht umlagefähiger Anteil (ohne Rücklagenzuführung)",
          betrag: hausgeldAngabeFehlt ? null : ergebnis.hausgeldAbsetzbarJahr,
          typ: "werbungskosten" as const,
          quelle: anlageV.hausgeldNichtUmlageMonat != null
            ? qSteuerangaben
            : hausgeldAngabeFehlt
              ? "Verwaltungsanteil nicht erfasst"
              : "abgeleitet aus dem Verwaltungsanteil im Steuer-Cockpit",
          rechtsgrundlage: "§ 9 Abs. 1 EStG",
          fehlt: hausgeldAngabeFehlt,
        }]
      : []),
    ...(hausgeldRelevant && !hausgeldAngabeFehlt
      ? [{
          posten: anlageV.umlagenMonat != null
            ? "Umlagefähige Betriebskosten (Hausgeld abzüglich nicht umlagefähiger Anteil)"
            : "Umlagefähige Betriebskosten, nicht angesetzt, weil die vereinnahmten Umlagen fehlen",
          betrag: anlageV.umlagenMonat != null ? ergebnis.hausgeldUmlagefaehigJahr : null,
          typ: "werbungskosten" as const,
          quelle: "berechnet aus Hausgeld und nicht umlagefähigem Anteil",
          rechtsgrundlage: "§ 9 Abs. 1 EStG",
          fehlt: anlageV.umlagenMonat == null,
        }]
      : []),
    {
      posten: "Grundsteuer",
      betrag: anlageV.grundsteuerJahr != null ? ergebnis.grundsteuerJahr : null,
      typ: "werbungskosten",
      quelle: qSteuerangaben,
      rechtsgrundlage: "§ 9 Abs. 1 EStG",
      fehlt: anlageV.grundsteuerJahr == null,
    },
    {
      posten: "Versicherungen (Gebäude und Haftpflicht)",
      betrag: anlageV.versicherungJahr != null ? ergebnis.versicherungJahr : null,
      typ: "werbungskosten",
      quelle: qSteuerangaben,
      rechtsgrundlage: "§ 9 Abs. 1 EStG",
      fehlt: anlageV.versicherungJahr == null,
    },
    {
      posten: "Verwaltungskosten (Verwaltervergütung, Kontoführung)",
      betrag: anlageV.verwaltungskostenJahr != null ? ergebnis.verwaltungskostenJahr : null,
      typ: "werbungskosten",
      quelle: qSteuerangaben,
      rechtsgrundlage: "§ 9 Abs. 1 EStG",
      fehlt: anlageV.verwaltungskostenJahr == null,
    },
    {
      posten: `Erhaltungsaufwand (${belege.length} ${belege.length === 1 ? "Beleg" : "Belege"} im Jahr ${jahr})`,
      betrag: ergebnis.erhaltungsaufwandJahr,
      typ: "werbungskosten",
      quelle: belege.length > 0
        ? "Summe erfasster Belege mit Betrag, Einzelliste unten"
        : "keine Belege mit Betrag im Steuerjahr erfasst",
      rechtsgrundlage: "§ 9 Abs. 1 EStG",
      fehlt: false,
    },
  ];

  /* ── Objektangaben ── */
  const adresse = [inv.adresse, [inv.plz, inv.ort].filter(Boolean).join(" ")]
    .filter((t) => t && String(t).trim())
    .join(", ");
  const objekt: AnlageVAufstellung["objekt"] = [
    { label: "Bezeichnung", wert: inv.bezeichnung || "Angabe fehlt", fehlt: !inv.bezeichnung },
    { label: "Adresse", wert: adresse || "Angabe fehlt", fehlt: !adresse },
    {
      label: "Wohnfläche",
      wert: inv.wohnflaeche ? `${inv.wohnflaeche} m²` : "Angabe fehlt",
      fehlt: !inv.wohnflaeche,
    },
    {
      label: "Baujahr",
      wert: inv.baujahr ? String(inv.baujahr) : "Angabe fehlt",
      fehlt: !inv.baujahr,
    },
    {
      label: "Kaufdatum",
      wert: fmtDatum(inv.kaufdatum) || "Angabe fehlt",
      fehlt: !fmtDatum(inv.kaufdatum),
    },
    {
      label: "Miteigentumsanteil",
      wert: anlageV.miteigentumsanteilProzent != null
        ? `${anlageV.miteigentumsanteilProzent.toLocaleString("de-DE", { maximumFractionDigits: 4 })} %`
        : "100 % (keine abweichende Angabe)",
    },
  ];

  return {
    bezeichnung: inv.bezeichnung || "Investment",
    jahr,
    erstelltAm: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
    herkunft: opt.herkunft,
    objekt,
    einnahmen,
    werbungskosten,
    erhaltungsBelege: belege,
    summeEinnahmen: ergebnis.einnahmenJahr,
    summeWerbungskosten: ergebnis.werbungskostenSumme,
    ueberschussVerlust: ergebnis.ueberschussVerlust,
    miteigentumsanteilP: ergebnis.miteigentumsanteilP,
    vermieteteMonate: ergebnis.vermieteteMonate,
    vermieteteMonateAngenommen: ergebnis.vermieteteMonateAngenommen,
    sonderAfaHinweis: ergebnis.sonderAfaHinweis,
    fehlendeAngaben,
    unvollstaendig: fehlendeAngaben.length > 0,
  };
}
