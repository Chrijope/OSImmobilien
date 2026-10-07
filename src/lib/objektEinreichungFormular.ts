// Reine Logik zum Objektakquise-Formular (offener Link /objekt-akquise).
//
// Die zusaetzlichen Ankaufspruefungs-Felder liegen gesammelt in der
// jsonb-Spalte objekt_einreichungen.details (Migration
// 20260831180000_objektakquise_offener_link.sql). Dieses Modul definiert die
// Struktur, die Auswahllisten, die Pflichtfeld-Pruefung und den Text-Rueckfall
// fuer den Fall, dass die Migration noch nicht ausgefuehrt wurde.
// Genutzt von src/pages/ObjektAkquise.tsx und src/pages/ObjektEinreichungDetail.tsx.

export interface AuswahlOption {
  value: string;
  label: string;
}

export const OBJEKTTYP_OPTIONEN: AuswahlOption[] = [
  { value: "mehrfamilienhaus", label: "Mehrfamilienhaus" },
  { value: "wohnanlage_portfolio", label: "Wohnanlage / Portfolio" },
  { value: "wohn_geschaeftshaus", label: "Wohn- und Geschäftshaus" },
  { value: "sonstiges", label: "Sonstiges" },
];

export const ZUSTAND_OPTIONEN: AuswahlOption[] = [
  { value: "unsaniert", label: "Unsaniert" },
  { value: "teilsaniert", label: "Teilsaniert" },
  { value: "saniert", label: "Saniert" },
  { value: "kernsaniert", label: "Kernsaniert" },
];

export const JA_NEIN_UNBEKANNT_OPTIONEN: AuswahlOption[] = [
  { value: "ja", label: "Ja" },
  { value: "nein", label: "Nein" },
  { value: "unbekannt", label: "Unbekannt" },
];

export const JA_NEIN_OPTIONEN: AuswahlOption[] = [
  { value: "ja", label: "Ja" },
  { value: "nein", label: "Nein" },
];

export const VERHAELTNIS_OPTIONEN: AuswahlOption[] = [
  { value: "selbst_eigentuemer", label: "Ich bin selbst Eigentümer" },
  { value: "direkter_kontakt", label: "Direkter Kontakt zum Eigentümer" },
  { value: "ueber_dritte", label: "Kontakt über Dritte" },
];

export const UNTERLAGEN_OPTIONEN: AuswahlOption[] = [
  { value: "expose", label: "Exposé" },
  { value: "mietaufstellung", label: "Mietaufstellung" },
  { value: "grundrisse", label: "Grundrisse" },
  { value: "teilungserklaerung", label: "Teilungserklärung" },
  { value: "energieausweis", label: "Energieausweis" },
  { value: "nebenkostenaufstellung", label: "Nebenkostenaufstellung" },
];

export function labelFuer(optionen: AuswahlOption[], value: string | undefined | null): string {
  if (!value) return "";
  return optionen.find(o => o.value === value)?.label ?? value;
}

/** Zusaetzliche Ankaufsfelder, abgelegt in objekt_einreichungen.details (jsonb). */
export interface EinreichungDetails {
  // Objekt
  objekttyp: string;
  gewerbeeinheiten: number | null;
  gewerbeflaeche_qm: number | null;
  grundstuecksflaeche_qm: number | null;
  letzte_sanierungen: string;
  zustand_gesamt: string;
  denkmalschutz: string;
  erbbaurecht: string;
  weg_aufteilung: string;
  stellplaetze: number | null;
  heizungsart: string;
  heizung_baujahr: string;
  energieausweis_vorhanden: string;
  // Wirtschaftlichkeit
  jahresnettokaltmiete_ist: number | null;
  mietsteigerungspotenzial: string;
  leerstand: string;
  nicht_umlagefaehige_kosten: number | null;
  rueckstaende_besonderheiten: string;
  // Eigentuemer und Prozess
  verhaeltnis_eigentuemer: string;
  verkaufsgrund: string;
  zeithorizont: string;
  makler_beauftragt: string;
  makler_details: string;
  anderweitig_angeboten: string;
  // Unterlagen
  unterlagen: string[];
  // Einreicher
  einreicher_telefon: string;
  einreicher_email: string;
  bemerkungen: string;
}

export function leereDetails(): EinreichungDetails {
  return {
    objekttyp: "",
    gewerbeeinheiten: null,
    gewerbeflaeche_qm: null,
    grundstuecksflaeche_qm: null,
    letzte_sanierungen: "",
    zustand_gesamt: "",
    denkmalschutz: "",
    erbbaurecht: "",
    weg_aufteilung: "",
    stellplaetze: null,
    heizungsart: "",
    heizung_baujahr: "",
    energieausweis_vorhanden: "",
    jahresnettokaltmiete_ist: null,
    mietsteigerungspotenzial: "",
    leerstand: "",
    nicht_umlagefaehige_kosten: null,
    rueckstaende_besonderheiten: "",
    verhaeltnis_eigentuemer: "",
    verkaufsgrund: "",
    zeithorizont: "",
    makler_beauftragt: "",
    makler_details: "",
    anderweitig_angeboten: "",
    unterlagen: [],
    einreicher_telefon: "",
    einreicher_email: "",
    bemerkungen: "",
  };
}

/**
 * Entfernt leere Werte (leere Strings, null, leere Arrays), damit in der
 * Datenbank nur tatsaechlich ausgefuellte Felder liegen.
 */
export function bereinigeDetails(details: EinreichungDetails): Record<string, string | number | string[]> {
  const ergebnis: Record<string, string | number | string[]> = {};
  for (const [schluessel, wert] of Object.entries(details)) {
    if (wert === null || wert === undefined) continue;
    if (typeof wert === "string" && wert.trim() === "") continue;
    if (Array.isArray(wert) && wert.length === 0) continue;
    ergebnis[schluessel] = typeof wert === "string" ? wert.trim() : (wert as number | string[]);
  }
  return ergebnis;
}

export interface PflichtfeldEingaben {
  strasse: string;
  plz: string;
  ort: string;
  objekttyp: string;
  wohneinheiten: number | "";
  kaufpreis: number;
  jahresnettokaltmiete: number;
  leerstand: string;
  einreicherName: string;
  einreicherTelefon: string;
  einreicherEmail: string;
}

/**
 * Prueft die Pflichtfelder des Akquiseformulars und liefert verstaendliche
 * Meldungen. Eine leere Liste bedeutet: alles vollstaendig.
 *
 * Sonderfall Miete: 0 ist erlaubt, wenn der Leerstand beschrieben ist
 * (Vollleerstand kommt bei Ankaufsobjekten vor).
 */
export function pruefePflichtfelder(e: PflichtfeldEingaben): string[] {
  const fehler: string[] = [];
  if (!e.strasse.trim() || !e.plz.trim() || !e.ort.trim()) {
    fehler.push("Bitte gib die vollständige Adresse an (Straße, PLZ und Ort).");
  }
  if (!e.objekttyp) {
    fehler.push("Bitte wähle den Objekttyp aus.");
  }
  if (e.wohneinheiten === "" || Number(e.wohneinheiten) < 1) {
    fehler.push("Bitte gib die Anzahl der Wohneinheiten an.");
  }
  if (!(e.kaufpreis > 0)) {
    fehler.push("Bitte gib die Kaufpreisvorstellung des Eigentümers an.");
  }
  if (!(e.jahresnettokaltmiete > 0) && !e.leerstand.trim()) {
    fehler.push("Bitte gib die Jahresnettokaltmiete (Ist) an, bei Leerstand eine kurze Beschreibung im Feld Leerstand.");
  }
  if (!e.einreicherName.trim()) {
    fehler.push("Bitte gib deinen Namen an, damit wir dich erreichen können.");
  }
  if (!e.einreicherTelefon.trim() && !e.einreicherEmail.trim()) {
    fehler.push("Bitte gib deine Telefonnummer oder E-Mail-Adresse für Rückfragen an.");
  }
  return fehler;
}

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/**
 * Stellt die Details als lesbaren Text dar. Rueckfall fuer den Fall, dass die
 * Spalte details noch nicht existiert (Migration offen): der Inhalt wandert
 * dann in sonstige_infos, damit nichts verloren geht.
 */
export function detailsAlsText(details: EinreichungDetails): string {
  const zeilen: string[] = [];
  const z = (label: string, wert: string | number | null | undefined) => {
    if (wert === null || wert === undefined) return;
    const text = typeof wert === "number" ? String(wert) : wert.trim();
    if (text !== "") zeilen.push(`${label}: ${text}`);
  };
  z("Objekttyp", labelFuer(OBJEKTTYP_OPTIONEN, details.objekttyp));
  z("Gewerbeeinheiten", details.gewerbeeinheiten);
  z("Gewerbefläche (m²)", details.gewerbeflaeche_qm);
  z("Grundstücksfläche (m²)", details.grundstuecksflaeche_qm);
  z("Letzte Sanierungen", details.letzte_sanierungen);
  z("Zustand gesamt", labelFuer(ZUSTAND_OPTIONEN, details.zustand_gesamt));
  z("Denkmalschutz", labelFuer(JA_NEIN_UNBEKANNT_OPTIONEN, details.denkmalschutz));
  z("Erbbaurecht", labelFuer(JA_NEIN_UNBEKANNT_OPTIONEN, details.erbbaurecht));
  z("WEG-Aufteilung erfolgt", labelFuer(JA_NEIN_UNBEKANNT_OPTIONEN, details.weg_aufteilung));
  z("Stellplätze/Garagen", details.stellplaetze);
  z("Heizungsart", details.heizungsart);
  z("Baujahr Heizung", details.heizung_baujahr);
  z("Energieausweis vorhanden", labelFuer(JA_NEIN_OPTIONEN, details.energieausweis_vorhanden));
  z("Jahresnettokaltmiete Ist", details.jahresnettokaltmiete_ist !== null ? EURO.format(details.jahresnettokaltmiete_ist) : null);
  z("Mietsteigerungspotenzial", details.mietsteigerungspotenzial);
  z("Leerstand", details.leerstand);
  z("Nicht umlagefähige Kosten p.a.", details.nicht_umlagefaehige_kosten !== null ? EURO.format(details.nicht_umlagefaehige_kosten) : null);
  z("Rückstände/Besonderheiten", details.rueckstaende_besonderheiten);
  z("Verhältnis zum Eigentümer", labelFuer(VERHAELTNIS_OPTIONEN, details.verhaeltnis_eigentuemer));
  z("Verkaufsgrund", details.verkaufsgrund);
  z("Zeithorizont", details.zeithorizont);
  z("Makler beauftragt", labelFuer(JA_NEIN_OPTIONEN, details.makler_beauftragt));
  z("Makler/Provision", details.makler_details);
  z("Anderweitig angeboten", labelFuer(JA_NEIN_OPTIONEN, details.anderweitig_angeboten));
  z("Vorhandene Unterlagen", details.unterlagen.map(u => labelFuer(UNTERLAGEN_OPTIONEN, u)).join(", "));
  z("Einreicher Telefon", details.einreicher_telefon);
  z("Einreicher E-Mail", details.einreicher_email);
  z("Bemerkungen", details.bemerkungen);
  if (zeilen.length === 0) return "";
  return ["--- Weitere Angaben aus dem Akquiseformular ---", ...zeilen].join("\n");
}

interface DatenbankFehler {
  code?: string;
  message?: string;
}

/**
 * Erkennt den PostgREST-Fehler "Spalte details existiert nicht" (Migration
 * noch nicht ausgefuehrt). Dann wird ohne details-Spalte erneut gespeichert.
 */
export function istFehlendeDetailsSpalte(fehler: DatenbankFehler | null): boolean {
  if (!fehler) return false;
  const meldung = fehler.message ?? "";
  return fehler.code === "PGRST204" && meldung.includes("details");
}

/** Erkennt einen RLS-/Berechtigungsfehler (z. B. anon-Policy fehlt noch). */
export function istBerechtigungsFehler(fehler: DatenbankFehler | null): boolean {
  if (!fehler) return false;
  const meldung = (fehler.message ?? "").toLowerCase();
  return fehler.code === "42501" || meldung.includes("row-level security") || meldung.includes("permission denied");
}
