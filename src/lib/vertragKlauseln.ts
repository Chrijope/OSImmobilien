// Der Text des Handelsvertretervertrags samt Anlagen, an einer Stelle.
//
// Gesamt-PDF (vertragGenerator.ts) und Einzeldokumente (einzelDokumentePdf.ts)
// rufen dieselben Funktionen auf und geben nur ihre eigenen Zeichenwerkzeuge
// mit. So kann der Bewerber nie zwei verschiedene Verträge mit demselben
// Namen bekommen.
//
// Seit dem 2. September 2026 gibt es zwei Textfassungen, die Weiche steht in
// vertragKonditionen.ts (vertragsFassungVon):
//
// - "neu", die kompakte Fassung: Hauptvertrag mit 14 Paragraphen, Anlage 1
//   Konditionenblatt (die einzige Stelle für Paket, Sätze, Leadpaket,
//   Wettbewerbsfassung und erklärte Nebentätigkeiten), Anlage 2 AVV samt
//   Verschwiegenheitserklärung, Anlage 3 Leadpaket-Vereinbarung nur bei
//   gebuchtem Leadpaket. AGB, Leistungs- und Preisvereinbarung,
//   Provisionsordnung, CRM-Bedingungen und Compliance sind im Hauptvertrag
//   und im Konditionenblatt aufgegangen. Diese Fassung steht hier.
// - "alt", die lange Fassung für Bestandspartner: unverändert in
//   vertragKlauselnAlt.ts.
//
// Fassung 2026-09-10: § 12 hat mit Absatz 1a einen Taetigkeitsmassstab
// bekommen. Mindestens eine ueber die Gesellschaft vermittelte notarielle
// Beurkundung in zwei aufeinanderfolgenden Kalenderquartalen, sonst kann die
// Gesellschaft ordentlich nach Absatz 1 kuendigen. Der Absatz steht in § 12
// und nicht in § 6, weil er keine Pflicht begruendet, sondern sagt, wann die
// Gesellschaft von ihrem ordentlichen Kuendigungsrecht Gebrauch macht;
// § 6 Absatz 1 verweist nur darauf. Absatz 1 bleibt unveraendert, ein
// Massstab ist keine Mindestlaufzeit. Gezaehlt wird nichts automatisch, der
// Vertrag beschreibt den Massstab allein in Worten.
//
// Fassung 2026-09-07: Die Servicevereinbarung (vom 04.09. bis 06.09.2026
// Anlage 3, 150 Euro brutto im Monat, zwölf Monate Mindestlaufzeit) ist
// ersatzlos entfallen. Ihre sechs Leistungen stellt die Gesellschaft seither
// unentgeltlich; § 3 Absatz 1 zählt sie neben CRM, Objektzugängen und
// Pflichtschulungen auf. Damit hat § 3 wieder vier Absätze wie vor dem
// 04.09.2026, und die Verweise auf § 3 Absatz 2 (Nutzungsrecht) und Absatz 4
// (kein Mengenanspruch) in § 5, § 7, § 8 und § 11 stimmen wieder. Ein
// laufendes Entgelt und eine Mindestlaufzeit gibt es in dieser Fassung
// nirgends mehr.
//
// Fassung 2026-09-29 (Freigabe vom 29.09.2026): Der Betrag eines
// Leadpakets heißt Paketpreis und ist Entgelt für Gewinnung und
// Vorqualifizierung (§ 5 Absatz 4). Anlage 3 § 1a regelt Einsatz binnen eines
// Monats, Zuteilung nach Eingang, Nachlieferung und die Erstattung nicht
// gelieferter Leads bei Vertragsende; § 3 Absatz 4, § 5 Absatz 2 und § 12
// Absatz 3 sind darauf abgestimmt. Ältere Kennungen behalten ihren Text
// (fassungHatPaketpreisRegel).
//
// Rechtlicher Hinweis für den Code: Die Klauseln zu Eigentum an Kontakten
// (§ 7), Wettbewerb (§ 8), Vertragsstrafe (§ 10), Haftung (§ 11) und die AVV
// (Anlage 2) sind nach dem Stand der BGH-Rechtsprechung formuliert, aber
// nicht anwaltlich geprüft. Änderungen daran bitte nur mit dem Anwalt.
//
// Fassung 2026-09-04 (Christians Entscheidungen vom 04.09.2026):
// - § 1 Absatz 3 bis 3d: Der Vertrag sagt klar, dass die Erlaubnis nach
//   § 34c GewO erforderlich ist, soweit die Tätigkeit sie erfordert. Ein
//   Haftungsdach war zwischenzeitlich erwogen und wurde am 04.09.2026 wieder
//   verworfen: Es gibt es bei § 34c GewO nicht (anders als § 2 Absatz 10
//   KWG), die Erlaubnis ist personenbezogen, und ein Vertrag kann von einer
//   gesetzlichen Pflicht nicht befreien. Was ohne Erlaubnis wirklich trägt,
//   ist die erlaubnisfreie Tippgebertätigkeit; Absatz 3a grenzt sie ab.
//   Absatz 3b macht die Finanzierungsvermittlung zur Sache der
//   Finanzierungsabteilung, als Zuständigkeitsregel ohne Haftungswirkung.
// - Eine Nachweispflicht mit Frist nach den ersten Kunden stand kurzzeitig in
//   einem Absatz 3c und ist am 04.09.2026 wieder gestrichen: Der Vertrag sagt
//   in Absatz 3, dass die Erlaubnis vorhanden sein muss. Dass ein Partner
//   zunächst ohne sie starten kann, ist eine persönliche Absprache und gehört
//   nicht in den Vertragstext.
// - § 4 Absatz 3 bis 3b: keine monatliche Abrechnung mehr, abschlussbezogen
//   nach Provisionseingang. Zum Eigengeschäft sagt der Vertrag bewusst
//   nichts mehr: Die Klausel stand kurzzeitig als Absatz 4a bis 4d im Text
//   (erst mit Ermessen, dann als Kaufpreisminderung) und ist am 04.09.2026
//   ersatzlos gestrichen. Eigengeschäfte werden im Einzelfall besprochen.
// - § 5 Absatz 4: Leadentgelt ist Nutzungsentgelt, gekaufte Leads bleiben bei
//   der Gesellschaft; keine Einmalgebühren.
// - Nur bei der Individualfassung des § 8: § 5 Absatz 5 und § 7 Absatz 8a und
//   8b trennen Leads der Gesellschaft von eigenen Kunden des Partners. Die
//   Freiheit hängt ausdrücklich an der Individualfassung, damit sie bei
//   aktivem Wettbewerbsverbot nicht greift.

import {
  LEAD_EINZELPREIS,
  LEAD_PAKET_ANZAHL,
  LEAD_PAKET_PREIS,
  PAKETE_MIT_VERTRAGSSCHALTERN,
  formatPreis,
  type LizenzPaketId,
} from "./lizenzPakete";
import {
  ERSATZLEAD_FRIST_TAGE,
  ERSATZLEAD_UNERREICHBAR,
  GESTELLTE_ZUSATZLEISTUNGEN,
  VERTRAGS_FASSUNG,
  anlagenBereichText,
  fassungAus,
  fassungHatPaketpreisRegel,
  hatLeadpaketAnlage,
  hatMetaPixelAnlage,
  konditionenAusKontext,
  leadpaketAnlageNummer,
  leadpaketKonditionText,
  type KlauselKontext,
  type KlauselTools,
  type LeadPaketDaten,
  type VertragsAnlage,
  type VertragsFassung,
  type VertragsKonditionen,
} from "./vertragKonditionen";
import {
  akzeptanzHinweisTextAlt,
  anlageKopfAlt,
  renderAnlageNachNummerAlt,
  renderHauptvertragAlt,
  renderLeadpaketAnlageAlt,
  vertragsAnlagenAlt,
} from "./vertragKlauselnAlt";
import { ANLAGE_4_TITEL, renderAnlage4MetaPixel } from "./vertragAnlage4";

// Die gemeinsamen Helfer liegen in vertragKonditionen.ts. Re-Export, damit
// bestehende Aufrufer weiter von hier importieren können.
export {
  AKZEPTANZ_HINWEIS,
  ERSATZLEAD_FRIST_TAGE,
  ERSATZLEAD_KANAELE,
  GESTELLTE_ZUSATZLEISTUNGEN,
  ERSATZLEAD_KONTAKTVERSUCHE,
  SCHUTZFRIST_MONATE,
  SCHUTZFRIST_MONATE_PARTNER,
  VERTRAGSSTRAFE_MAX_EINZEL,
  VERTRAGSSTRAFE_MAX_SYSTEMATISCH,
  VERTRAGS_FASSUNG,
  VERTRAGS_FASSUNG_ALT,
  anlagenBereichText,
  bewerberMitFassungAusAnfrage,
  erstelleVertragsKontext,
  featuresMitProvisionsSaetzen,
  hatLeadpaketAnlage,
  hatMetaPixelAnlage,
  konditionenAus,
  leadpaketAnlageNummer,
  paketMitAltfassungsGebuehr,
  paketMitVertragsSchaltern,
  paketOhneCrmGebuehr,
  provisionsSaetze,
  rechnungsAnschriftZeilen,
  vertragLaufzeitOffen,
  vertragsAnschriftZeilen,
  vertragsDokumentKennung,
  fassungDesHinterlegtenVertrags,
  vertragsFassungKennung,
  vertragsFassungVon,
  type KlauselKontext,
  type KlauselTools,
  type LeadPaketDaten,
  type VereinbarteSaetze,
  type VertragsAnlage,
  type VertragsFassung,
  type VertragsKonditionen,
} from "./vertragKonditionen";
export { ANLAGE_TITEL_ALT } from "./vertragKlauselnAlt";

/* ── Feste Titel der kompakten Fassung ────────────────────────────────── */

/**
 * Titel der Anlagen, an einer Stelle für Anlagenverzeichnis (§ 14),
 * Anhangliste im Vertrags-Tab, Kopfzeilen der PDFs und Einzeldokumente.
 */
export const ANLAGE_TITEL: Record<number, string> = {
  1: "Konditionenblatt",
  2: "DSGVO-Auftragsverarbeitungsvereinbarung (AVV) inkl. Verschwiegenheitserklärung",
  3: "Leadpaket-Vereinbarung",
  4: ANLAGE_4_TITEL,
};

/**
 * Nummer und Titel der optionalen Leadpaket-Vereinbarung in der kompakten
 * Fassung. In der Altfassung heißt sie Anlage 9 (leadpaketAnlageNummer).
 */
export const LEADPAKET_ANLAGE_NUMMER = leadpaketAnlageNummer("neu");
export const LEADPAKET_ANLAGE_TITEL = ANLAGE_TITEL[3];

/**
 * Die Qualitätszusage der Gesellschaft für entgeltlich erworbene Leads. Eine
 * Quelle für § 5 des Hauptvertrags und für Anlage 3 § 2, damit die Zusage
 * nicht auseinanderläuft, wenn ein Partner einzelne Leads ohne Paket kauft.
 */
export const LEAD_QUALITAETSZUSAGE: string[] = [
  "Der Lead ist durch die Gesellschaft vorqualifiziert und hat echtes Interesse an einer Kapitalanlageimmobilie.",
  "Der Lead verfügt über ein Nettoeinkommen von mindestens 3.000 Euro monatlich und über Eigenkapital.",
];

/**
 * Lead-Klauseln je Paket für § 5 (4) des Hauptvertrags. Die Beträge stehen
 * nur im Konditionenblatt; hier wird darauf verwiesen.
 */
export const LEAD_KLAUSELN: Record<LizenzPaketId, string[]> = {
  junior: [
    "Im Paket Vertriebspartner ist kein festes Start-Leadkontingent enthalten.",
    "Der Vertriebspartner kann jederzeit ein Leadpaket zu den in Anlage 1 ausgewiesenen Modellkonditionen erwerben; Einzel-Leads sind erst nach der ersten Paketbuchung möglich.",
    `Ist ein Leadpaket vereinbart, weist Anlage 1 es aus, und es gilt ergänzend die Leadpaket-Vereinbarung (${LEADPAKET_ANLAGE_NUMMER}) mit Qualitätszusage und Ersatzlead-Regelung.`,
    `Eine Verrechnung von Leadkosten mit Provisionen findet nicht statt; ein Leadpaket wird gesondert nach ${LEADPAKET_ANLAGE_NUMMER} abgerechnet.`,
  ],
  lead_berater: [
    "Im Paket Lead-Berater stellt die Gesellschaft dem Vertriebspartner Leads zur Unterstützung seiner eigenen Akquisition bereit.",
    "Die Bereitstellung erfolgt nach Verfügbarkeit und billigem Ermessen der Gesellschaft, ohne definierte Stückzahl. Ein Anspruch auf eine bestimmte Lead-Menge, auf eine regelmäßige Zuteilung oder auf Leads bestimmter Herkunft besteht ausdrücklich nicht.",
    "Ein entgeltlicher Erwerb von Leadpaketen oder Einzel-Leads ist in diesem Paket nicht vorgesehen; Leadkosten fallen nicht an, eine Leadpaket-Vereinbarung wird nicht geschlossen.",
  ],
  // Die Altpakete werden in der kompakten Fassung nicht erzeugt (Weiche in
  // vertragsFassungVon); die Einträge halten nur den Typ vollständig.
  lead: [],
  team_builder: [],
  enterprise: [],
  partner_2: [],
  tippgeber: [],
};

/**
 * Die Leadklauseln für § 5 Absatz 2, passend zur tatsächlichen Lage.
 *
 * LEAD_KLAUSELN beschreibt das Regelmodell und nennt dabei die
 * Leadpaket-Vereinbarung. Ohne gebuchtes Leadpaket gibt es diese Anlage aber
 * gar nicht: Der Vertrag verwies dann auf eine Anlage, die er nicht enthält,
 * und rechnete mit einem Leadpaket ab, das niemand gebucht hat. Deshalb hier
 * die Auswahl je nach Lage; das Regelmodell bleibt Wort für Wort erhalten,
 * sobald ein Leadpaket vereinbart ist.
 */
export function leadKlauselnFuerVertrag(
  paketId: LizenzPaketId | string,
  hatLeadPaket: boolean,
): string[] {
  const basis = LEAD_KLAUSELN[paketId as LizenzPaketId] ?? [];
  if (paketId !== "junior" || hatLeadPaket) return basis;
  return [
    basis[0],
    basis[1],
    // Statt auf die nicht vorhandene Anlage 3 zu verweisen: der Hinweis, was
    // bei einer späteren Buchung gilt.
    "Wird später ein Leadpaket vereinbart, weist Anlage 1 es aus, und es gilt ergänzend eine gesonderte Leadpaket-Vereinbarung mit Qualitätszusage und Ersatzlead-Regelung; für diesen Vertrag ist kein Leadpaket vereinbart, eine solche Anlage besteht nicht.",
    "Eine Verrechnung von Leadkosten mit Provisionen findet nicht statt.",
  ].filter(Boolean);
}

/* ── Anlagenverzeichnis ───────────────────────────────────────────────── */

/**
 * Welche Anlagen gehören zu einem Vertrag? Die eine Quelle für § 14, den
 * Hinweiskasten vor der Unterschrift, die gedruckten Anlagen des Gesamt-PDFs
 * und die Anhangliste im Vertrags-Tab (getVertragsAnhaenge).
 *
 * Die Altpakete kennen nur die lange Fassung; für sie zählt der Parameter
 * `fassung` nicht. `mitMetaPixelAnlage` entspricht
 * hatMetaPixelAnlage(bewerber): Anlage 4 gibt es erst ab Fassung 2026-09-26,
 * und sie behält ihre Nummer auch ohne Leadpaket.
 */
export function vertragsAnlagen(
  paketId: LizenzPaketId | string | "",
  individuelleVertragsFassung: boolean = false,
  hatLeadPaket: boolean = false,
  fassung: VertragsFassung = "neu",
  mitMetaPixelAnlage: boolean = false,
): VertragsAnlage[] {
  if (paketId === "tippgeber") {
    return [
      { nummer: 1, titel: "DSGVO-Auftragsverarbeitungsvereinbarung (AVV) inkl. Verschwiegenheitserklärung" },
      { nummer: 2, titel: "Portal- & Qualitätsrichtlinie (Tippgeberportal)" },
    ];
  }
  if (fassung === "alt" || !(PAKETE_MIT_VERTRAGSSCHALTERN as string[]).includes(paketId)) {
    return vertragsAnlagenAlt(paketId, individuelleVertragsFassung, hatLeadPaket);
  }
  const liste: VertragsAnlage[] = [
    { nummer: 1, titel: ANLAGE_TITEL[1] },
    { nummer: 2, titel: ANLAGE_TITEL[2] },
  ];
  if (hatLeadPaket) liste.push({ nummer: 3, titel: ANLAGE_TITEL[3] });
  if (mitMetaPixelAnlage) liste.push({ nummer: 4, titel: ANLAGE_TITEL[4] });
  return liste;
}

/**
 * Das Anlagenverzeichnis zu einem Vertragskontext. Eine Quelle für das
 * Verzeichnis in § 14, den Hinweiskasten, die Deckblätter der Einzeldokumente
 * und die Anhangliste im Vertrags-Tab. Trüge ein Deckblatt eine andere Nummer
 * als das Verzeichnis, wäre das schlimmer als gar keines.
 */
export function vertragsAnlagenAusKontext(ctx: KlauselKontext): VertragsAnlage[] {
  return vertragsAnlagen(
    ctx.paket.id,
    !!ctx.bewerber.individuelleVertragsFassung,
    hatLeadpaketAnlage(ctx.bewerber, ctx.paket.id),
    fassungAus(ctx),
    hatMetaPixelAnlage(ctx.bewerber, ctx.paket.id),
  );
}

/**
 * Voller Titel einer Anlage, so wie ihn das Verzeichnis führt. Wirft, wenn die
 * Nummer im Verzeichnis dieses Vertrages gar nicht vorkommt; ein Deckblatt für
 * eine Anlage, die es nicht gibt, darf nicht entstehen.
 */
export function anlageVollTitel(nummer: number, ctx: KlauselKontext): string {
  const eintrag = vertragsAnlagenAusKontext(ctx).find((a) => a.nummer === nummer);
  if (!eintrag) {
    throw new Error(`Anlage ${nummer} steht nicht im Anlagenverzeichnis dieses Vertrages.`);
  }
  return eintrag.titel;
}

/** Text des Hinweiskastens vor der Unterschrift des Hauptvertrags. */
export function akzeptanzHinweisText(ctx: KlauselKontext): string {
  if (fassungAus(ctx) === "alt") return akzeptanzHinweisTextAlt(ctx);
  const anlagen = vertragsAnlagenAusKontext(ctx);
  const bereich = anlagenBereichText(anlagen.map((a) => a.nummer));
  return `Mit Unterzeichnung dieses Hauptvertrages bestätigt der Vertriebspartner, sämtliche Anlagen ${bereich} erhalten, vollständig gelesen, verstanden und uneingeschränkt akzeptiert zu haben (§ 14); eine gesonderte Unterschrift unter den Anlagen ist nicht erforderlich.`;
}

/** Kopfzeile einer Anlage im PDF: Titel und Untertitel. */
export function anlageKopf(nummer: number, ctx: KlauselKontext): { titel: string; untertitel: string } {
  if (fassungAus(ctx) === "alt") return anlageKopfAlt(nummer, ctx);
  const k = konditionenAusKontext(ctx);
  const titel = `Anlage ${nummer}`;
  switch (nummer) {
    case 1: return { titel, untertitel: `Konditionenblatt · Vereinbarte Konditionen für ${k.partnerName}` };
    case 2: return { titel, untertitel: "AVV · DSGVO-Auftragsverarbeitungsvereinbarung gemäß Art. 28 DSGVO inkl. Verschwiegenheitserklärung" };
    case 3: return {
      titel,
      untertitel: k.leadPaket
        ? `${LEADPAKET_ANLAGE_TITEL} · ${formatPreis(k.leadPaket.betrag)} netto für ${k.leadPaket.anzahl} qualifizierte Leads`
        : LEADPAKET_ANLAGE_TITEL,
    };
    case 4: return { titel, untertitel: "Vereinbarung nach Art. 26 DSGVO · Meta Pixel und Conversions API auf Partnerseiten" };
    default: return { titel, untertitel: "" };
  }
}

/** Rendert den Inhalt einer Anlage anhand ihrer Nummer. */
export function renderAnlageNachNummer(nummer: number, t: KlauselTools, ctx: KlauselKontext): void {
  if (fassungAus(ctx) === "alt") return renderAnlageNachNummerAlt(nummer, t, ctx);
  switch (nummer) {
    case 1: return renderAnlage1Konditionen(t, ctx);
    case 2: return renderAnlage2Avv(t, ctx);
    case 3: {
      const k = konditionenAusKontext(ctx);
      if (!k.leadPaket) throw new Error("Für die Leadpaket-Vereinbarung muss am Bewerber ein Leadpaket hinterlegt sein.");
      return renderLeadpaketAnlage(t, k.leadPaket, "neu", k.fassungKennung);
    }
    case 4: {
      // Nur ab Fassung 2026-09-26. Ein älterer Vertrag darf sie auch beim
      // Neuaufbau zur Gegenzeichnung nicht bekommen.
      if (!hatMetaPixelAnlage(ctx.bewerber, ctx.paket.id)) {
        throw new Error("Anlage 4 gehört erst zur Vertragsfassung ab 2026-09-26.");
      }
      return renderAnlage4MetaPixel(t);
    }
    default: throw new Error(`Unbekannte Anlage ${nummer}`);
  }
}

/**
 * Rendert den Hauptvertrag. Unterschriften, Kopfzeilen und Anlagen bleiben
 * Sache des jeweiligen Erzeugers.
 */
export function renderHauptvertrag(t: KlauselTools, ctx: KlauselKontext): void {
  if (fassungAus(ctx) === "alt") return renderHauptvertragAlt(t, ctx);
  renderHauptvertragKompakt(t, ctx);
}

/**
 * Leadpaket-Vereinbarung je Fassung. Aufrufer, die den alten Text brauchen,
 * geben die Fassung mit; ohne Angabe gilt die kompakte Fassung. Die Kennung
 * entscheidet innerhalb der kompakten Fassung, ob § 1a (ab 2026-09-29) gilt;
 * ohne Angabe die aktuelle.
 */
export function renderLeadpaketAnlage(
  t: Pick<KlauselTools, "h1" | "p" | "bullet">,
  leadPaket: LeadPaketDaten,
  fassung: VertragsFassung = "neu",
  kennung: string = VERTRAGS_FASSUNG,
): void {
  if (fassung === "alt") return renderLeadpaketAnlageAlt(t, leadPaket);
  renderLeadpaketAnlageKompakt(t, leadPaket, fassungHatPaketpreisRegel(kennung));
}

/**
 * Erstattung je nicht geliefertem Lead: Paketpreis geteilt durch die Zahl
 * der Leads, auf Cent gerundet. Beim Regelpaket 125 Euro.
 */
export function leadpaketPreisJeLead(leadPaket: LeadPaketDaten): number {
  if (!(leadPaket.anzahl > 0)) return 0;
  return Math.round((leadPaket.betrag / leadPaket.anzahl) * 100) / 100;
}

/** Wie formatPreis, zeigt aber Cent, sobald der Betrag welche hat. */
function formatPreisGenau(betrag: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(betrag) ? 0 : 2, maximumFractionDigits: 2 }).format(betrag);
}

/* ── Anlage 1: Konditionenblatt ───────────────────────────────────────── */

/** Die Zeilen des Konditionenblatts, für PDF und Tests aus derselben Quelle. */
export function konditionenblattZeilen(k: VertragsKonditionen): { label: string; wert: string }[] {
  const zeilen: { label: string; wert: string }[] = [];
  zeilen.push({ label: "Vertriebspartner", wert: [k.partnerName, ...k.vertragsAnschrift].join(", ") });
  zeilen.push({ label: "Rechnungsanschrift", wert: k.rechnungsAnschrift.length > 0 ? k.rechnungsAnschrift.join(", ") : "wie Vertragsanschrift" });
  zeilen.push({ label: "Paket", wert: k.paketTitel });
  // Die wichtigste Zeile des Blatts: Alles wird gestellt, nichts kostet
  // laufend etwas, und das steht dort, wo Christian und der Partner zuerst
  // hinschauen.
  zeilen.push({
    label: "Leistungen der Gesellschaft",
    wert: `Unentgeltlich: das CRM-System einschließlich aller Funktionen, die der Vertrag verlangt, Objektzugänge, Exposés, Preislisten, Skripte und Pflichtschulungen sowie ${GESTELLTE_ZUSATZLEISTUNGEN.map((z) => z.titel).join(", ")} (§ 3 Absatz 1, § 86a Absatz 1 HGB)`,
  });
  zeilen.push({
    label: "Laufendes Entgelt",
    wert: "Keines. Kein Einmalbetrag, keine Monatsgebühr, keine Mindestlaufzeit (§ 2 Absatz 2)",
  });
  zeilen.push({
    label: "Laufzeit des Vertrages",
    wert: "Unbestimmte Zeit, keine Mindestlaufzeit. Kündigungsfristen nach § 89 Absatz 1 HGB: 1 Monat im ersten Jahr, 2 im zweiten, 3 im dritten bis fünften, 6 ab dem sechsten Jahr, je zum Monatsende (§ 12 Absatz 1)",
  });
  if (k.hasOverride) {
    zeilen.push({ label: "Provision", wert: `Individuell vereinbart: ${k.saetzeListe.join(" · ")}. Alle Sätze brutto inkl. USt. auf den notariellen Kaufpreis (§ 4). Abgerechnet wird nicht monatlich, sondern nach Provisionseingang; Auszahlung 14 Tage nach Rechnungsstellung (§ 4 Absatz 3 bis 3b).` });
    zeilen.push({ label: "Rangfolge der Sätze", wert: k.anwendungsregel });
  } else {
    zeilen.push({ label: "Provision", wert: `${k.standardSatz} % des notariellen Kaufpreises, brutto inkl. USt., einheitlich für Lead- und Eigenkontakte (Standardsatz des Pakets, § 4). Abgerechnet wird nicht monatlich, sondern nach Provisionseingang; Auszahlung 14 Tage nach Rechnungsstellung (§ 4 Absatz 3 bis 3b).` });
  }
  // Der Stand der 34c-Erlaubnis gehoert ins Konditionenblatt, damit Christian
  // ihn sieht, ohne den Hauptvertrag aufzuschlagen. Der Abrechnungsrhythmus
  // steht in der Provisionszeile darueber.
  zeilen.push({
    label: "Erlaubnis nach § 34c GewO",
    wert: "Erforderlich, soweit die Tätigkeit sie erfordert, und vor Aufnahme der erlaubnispflichtigen Tätigkeit nachzuweisen; ohne sie ist allein die Tippgebertätigkeit zulässig (§ 1 Absatz 3, 3a).",
  });
  zeilen.push({ label: k.leadModell === "gestellt" ? "Leads" : "Leadpaket", wert: leadpaketKonditionText(k) });
  zeilen.push({
    label: "Wettbewerb (§ 8)",
    wert: k.wettbewerbsfassung === "individuell"
      ? "Individualfassung: kein Wettbewerbsverbot, Tätigkeit für andere Unternehmen zulässig (Anzeigepflicht). Leads der Gesellschaft nur über sie, eigene Kunden frei (§ 5 Absatz 5, § 7 Absatz 8a); §§ 7, 9, 10 unverändert"
      : "Standardfassung: Wettbewerbsverbot während der Laufzeit; danach keines, es gelten Eigentum an Kontakten sowie Daten- und Geheimnisschutz (§§ 7, 9)",
  });
  zeilen.push({
    label: "Erklärte andere Vertriebe",
    wert: k.wettbewerbsfassung === "individuell"
      ? (k.andereVertriebe.length > 0
          ? `Der Vertriebspartner erklärt, bei Vertragsbeginn für folgende Unternehmen im Bereich Vermittlung oder Vertrieb tätig zu sein: ${k.andereVertriebe.join("; ")}. Änderungen zeigt er nach § 8 Absatz 1 in Textform an.`
          : "Der Vertriebspartner erklärt, bei Vertragsbeginn für kein weiteres Unternehmen im Bereich Vermittlung oder Vertrieb tätig zu sein. Änderungen zeigt er nach § 8 Absatz 1 in Textform an.")
      : "entfällt (Standardfassung); bestehende Tätigkeiten sind nach § 8 Absatz 2 offenzulegen",
  });
  zeilen.push({
    label: "Zahlungsweise",
    wert: "Keine laufenden Entgelte, Leadpaket nach Rechnung. Keine Einmal-, Einstiegs-, Onboarding- oder Eintrittsgebühr (§ 2 Absatz 2)",
  });
  // Die Kennung dieses Dokuments, nicht die aktuelle: Ein älterer Vertrag,
  // der zur Gegenzeichnung neu aufgebaut wird, nennt weiter seine eigene.
  zeilen.push({ label: "Vertragsfassung", wert: `Vertragstext ${k.fassungKennung}; Bestandteile: Hauptvertrag, Anlage 1, Anlage 2${k.leadPaket ? `, ${LEADPAKET_ANLAGE_NUMMER}` : ""}${k.metaPixelAnlage ? ", Anlage 4" : ""}` });
  return zeilen;
}

/**
 * Anlage 1, das Konditionenblatt: eine Seite, auf der alles steht, was für
 * diesen Vertriebspartner individuell vereinbart ist. Hauptvertrag und
 * Anlagen verweisen bei Beträgen, Sätzen und Fristen hierher.
 */
export function renderAnlage1Konditionen(t: KlauselTools, ctx: KlauselKontext): void {
  const k = konditionenAusKontext(ctx);
  const zeile = t.zeile ?? ((label: string, wert: string) => t.p(`${label}: ${wert}`));
  t.h1("Vereinbarte Konditionen");
  for (const z of konditionenblattZeilen(k)) zeile(z.label, z.wert);
  t.spacer(2);
  t.p("Einzige Stelle des Vertragswerks für Paket, Provisionssätze, Leadpaket, Fassung des § 8 und Anschriften; ein Wert \"laut Anlage 1\" gilt wie hier ausgewiesen (§ 2). Wird mit dem Hauptvertrag unterzeichnet (§ 14) und geht ihm bei Widersprüchen vor; Änderungen nur einvernehmlich in Textform (§ 4 Absatz 7).", { size: 8.5 });
}

/* ── Hauptvertrag (14 Paragraphen) ────────────────────────────────────── */

function renderHauptvertragKompakt(t: KlauselTools, ctx: KlauselKontext): void {
  const { h1, p, bullet, spacer, ensure } = t;
  const k = konditionenAusKontext(ctx);
  const { bewerber, paket } = ctx;
  const leadAnlage = LEADPAKET_ANLAGE_NUMMER;
  // Fassung 2026-09-29: Paketpreis, Anspruch aus dem Leadpaket, Erstattung
  // nicht gelieferter Leads. Ältere Kennungen behalten ihren Text.
  const paketpreisRegel = fassungHatPaketpreisRegel(k.fassungKennung);

  // ─── § 1 ───
  h1("§ 1 Vertragsgegenstand und Stellung des Vertriebspartners");
  p("(1) Die Gesellschaft vertreibt Kapitalanlageimmobilien (sanierte Bestandsimmobilien, WG- und Co-Living-Konzepte, KfW40- und QNG-Neubauprojekte, steueroptimierte Immobilieninvestments). Gegenstand dieses Vertrages ist die Vermittlung von und die Zuführung von Interessenten für Kapitalanlageimmobilien der Gesellschaft.");
  p("(2) Der Vertriebspartner wird als selbstständiger Handelsvertreter gemäß §§ 84 ff. HGB tätig. Er handelt eigenverantwortlich, trägt Steuern, Sozialabgaben, Versicherungen und Betriebskosten selbst, ist weder Arbeitnehmer noch Franchisenehmer der Gesellschaft und gibt rechtsverbindliche Erklärungen in ihrem Namen nur mit schriftlicher Vollmacht ab.");
  // § 34c GewO: Der Vertrag sagt klar, dass die Erlaubnis erforderlich ist,
  // wenn die Taetigkeit sie erfordert. Kein Haftungsdach, keine Aufsichts-
  // konstruktion: Die Erlaubnis ist personenbezogen, und ein Vertrag kann von
  // einer gesetzlichen Erlaubnispflicht nicht befreien. Was ohne Erlaubnis
  // wirklich traegt, ist die erlaubnisfreie Tippgebertaetigkeit; sie steht
  // deshalb in Absatz 3a mit einer klaren Abgrenzung. Alles Weitere klaert
  // Christian im Gespraech, nicht im Vertragstext.
  p("(3) Soweit die Tätigkeit des Vertriebspartners eine Erlaubnis nach § 34c Absatz 1 GewO erfordert, muss er diese Erlaubnis besitzen; er weist sie der Gesellschaft vor Aufnahme der erlaubnispflichtigen Tätigkeit nach. Ob und ab wann die Erlaubnis erforderlich ist, richtet sich allein nach dem Gewerberecht. Dieser Vertrag befreit nicht von der Erlaubnispflicht; eine Erlaubnis der Gesellschaft ersetzt die eigene Erlaubnis des Vertriebspartners nicht.");
  p("(3a) Ohne eigene Erlaubnis ist dem Vertriebspartner allein die erlaubnisfreie Tippgebertätigkeit gestattet. Sie umfasst das Herstellen des Kontakts zwischen einem Interessenten und der Gesellschaft, also das Benennen von Interessenten, die Weitergabe ihrer Kontaktdaten mit deren Einverständnis, den allgemeinen Hinweis auf das Leistungsangebot der Gesellschaft und die Vereinbarung eines Termins mit ihr. Nicht dazu gehören insbesondere die Beratung des Interessenten, Objekt- und Verkaufsgespräche, das Vorstellen oder Erläutern konkreter Objekte, Angaben zu Kaufpreisen, Renditen, Mieten oder steuerlichen Wirkungen, Verhandlungen über Kaufpreis oder Vertragsinhalte, die Begleitung zu Notarterminen, die Entgegennahme von Reservierungen sowie jede sonstige Mitwirkung an der Kaufentscheidung. Sobald der Vertriebspartner eine dieser Tätigkeiten ausübt, wird er erlaubnispflichtig tätig und Absatz 3 gilt uneingeschränkt.");
  p("(3b) Eine Finanzierungsvermittlung nimmt der Vertriebspartner in keinem Fall selbst vor. Sie ist ausschließlich Aufgabe der Finanzierungsabteilung der Gesellschaft oder der von ihr eingesetzten Partner; diese sind an jedem Finanzierungsgespräch beteiligt. Diese Zuständigkeitsregel ersetzt keine Erlaubnis, die das Gewerberecht vom Vertriebspartner verlangt (§§ 34c, 34i GewO).");
  p("(3c) Für die Einhaltung der für ihn geltenden gewerbe- und aufsichtsrechtlichen Vorgaben haftet der Vertriebspartner selbst; § 11 Absatz 1 bleibt unberührt.");
  p("(4) Ein Gebietsschutz besteht nicht; die Gesellschaft darf mehrere Vertriebspartner parallel in denselben Regionen und Zielgruppen einsetzen, der Vertriebspartner darf bundesweit akquirieren. Die Zuordnung einzelner Kontakte richtet sich allein nach § 7.");

  // ─── § 2 ───
  h1("§ 2 Konditionen (Anlage 1)");
  p("(1) Die vereinbarten Konditionen stehen abschließend im Konditionenblatt (Anlage 1): Paket, Provisionssätze samt Rangfolge, Leadpaket, die geltende Fassung des § 8 mit den erklärten Tätigkeiten für andere Vertriebe sowie Vertrags- und Rechnungsanschrift. Nennt dieser Vertrag einen Wert \"laut Anlage 1\", gilt der dort ausgewiesene; bei Widersprüchen geht Anlage 1 vor.");
  p("(2) Die Vergütung des Vertriebspartners erfolgt ausschließlich erfolgsabhängig über Provisionen (§ 4). Ein Einmalbetrag für den Einstieg wird nicht geschuldet; Einmal-, Einstiegs-, Onboarding- oder Eintrittsgebühren werden in diesem Vertrag nicht erhoben. Für die Leistungen nach § 3 Absatz 1 schuldet der Vertriebspartner kein Entgelt (§ 86a Absatz 1 und 3 HGB); ein laufendes Entgelt entsteht aus diesem Vertrag nicht. Rechnungen gehen an die Rechnungsanschrift laut Anlage 1.");

  // ─── § 3 ───
  h1("§ 3 Leistungen der Gesellschaft, CRM-Nutzung und geistiges Eigentum");
  // § 86a Absatz 1 HGB verlangt die unentgeltliche Ueberlassung der zur
  // Ausuebung erforderlichen Unterlagen, Absatz 3 macht Abweichungen
  // unwirksam. Die Rechtsprechung zaehlt Vertriebssoftware dazu. Deshalb ist
  // das CRM seit der Fassung 2026-09-04 unentgeltlich. Seit dem 07.09.2026
  // stellt die Gesellschaft auch die sechs Leistungen unentgeltlich, die bis
  // dahin ein eigener Vertrag mit Monatsentgelt waren; sie stehen hier in
  // Absatz 1 gleichrangig neben CRM, Objektzugaengen und Pflichtschulungen.
  p(`(1) Die Gesellschaft stellt dem Vertriebspartner für die Dauer dieses Vertrages unentgeltlich alles zur Verfügung, was er zur Ausübung seiner Vermittlungstätigkeit benötigt (§ 86a Absatz 1 HGB): das CRM-System osimmobilien.netlify.app mit allen Funktionen, die dieser Vertrag von ihm verlangt, insbesondere Erfassung und Dokumentation von Kontakten, Dublettenprüfung, Zuordnung nach § 7 und Provisionsabrechnung nach § 4; die Objektzugänge mit Exposés, Preis- und Objektlisten, Kalkulationen und Vertriebsunterlagen; Muster, Skripte, Leitfäden, Präsentationen und Geschäftsbedingungen; die Schulungen, die nach diesem Vertrag oder nach dem Aufsichtsrecht verpflichtend sind; die Zuweisung und Übergabe von Leads sowie die Auskünfte nach § 86a Absatz 2 HGB. Für diese Leistungen schuldet der Vertriebspartner kein Entgelt; eine abweichende Vereinbarung wäre nach § 86a Absatz 3 HGB unwirksam. Darüber hinaus stellt die Gesellschaft dem Vertriebspartner ebenfalls unentgeltlich und ohne gesonderte Vereinbarung zur Verfügung: ${GESTELLTE_ZUSATZLEISTUNGEN.map((z) => `${z.titel} (${z.beschreibung})`).join("; ")}. Auch für diese Leistungen schuldet der Vertriebspartner kein Entgelt. Die Gesellschaft erbringt sie nach billigem Ermessen in der jeweils angebotenen Form; ein Anspruch auf eine bestimmte Anzahl von Terminen, Inhalten oder Veranstaltungen besteht nicht, eine Teilnahmepflicht ebenfalls nicht.`);
  p("(2) Der Vertriebspartner erhält ein nicht ausschließliches, nicht übertragbares, widerrufliches Nutzungsrecht am CRM-System. Zugänge sind personenbezogen; Weitergabe von Zugangsdaten, Mehrfachnutzung, Kopieren von Schulungen, Skripten und Vorlagen, Reverse Engineering sowie jeder Einsatz der Inhalte, Vorlagen, Systeme und Objektdaten der Gesellschaft außerhalb dieses Vertragsverhältnisses sind untersagt; bei Verstößen kann die Gesellschaft Zugänge sofort sperren. Alle Inhalte, Marken, Prozesse, Software und Schulungsinhalte bleiben Eigentum der Gesellschaft; die Marke \"OS Immobilien\" darf nur während der Laufzeit für vertragsgemäße Zwecke genutzt werden. Dieser Absatz beschränkt nicht die nach § 8 zulässige Tätigkeit des Vertriebspartners für andere Unternehmen, sondern allein den Einsatz von Mitteln der Gesellschaft dabei.");
  p("(3) Die Gesellschaft darf CRM-Aktivitäten (Logins, Exporte, Kommunikation, Leadbewegungen) zur Qualitätskontrolle, Sicherheit und Vertragsdurchführung technisch protokollieren, nicht zur Leistungs- oder Verhaltenskontrolle im arbeitsrechtlichen Sinne.");
  p(paketpreisRegel
    ? "(4) Ein Anspruch auf bestimmte Lead-, Objekt- oder Schulungsmengen besteht nur, soweit dieser Vertrag ihn ausdrücklich begründet (§ 5). Ein Anspruch auf bestimmte Umsätze, Abschlüsse oder ein bestimmtes Provisionsaufkommen besteht nicht; die Gesellschaft garantiert keine Umsätze, steuerlichen Vorteile, Finanzierungszusagen, Wertentwicklungen oder wirtschaftlichen Ergebnisse. Mit Vertragsende enden alle Nutzungsrechte, Zugänge werden deaktiviert; Kopien, Exporte und Sicherungen sind zu vernichten (§ 9 Absatz 6)."
    : "(4) Ein Anspruch auf bestimmte Lead-, Objekt- oder Schulungsmengen, Umsätze, Abschlüsse oder Provisionen besteht nicht; die Gesellschaft garantiert keine Umsätze, steuerlichen Vorteile, Finanzierungszusagen, Wertentwicklungen oder wirtschaftlichen Ergebnisse. Mit Vertragsende enden alle Nutzungsrechte, Zugänge werden deaktiviert; Kopien, Exporte und Sicherungen sind zu vernichten (§ 9 Absatz 6).");

  // ─── § 4 ───
  h1("§ 4 Provision");
  p("(1) Für jede wirksam vermittelte Kapitalanlageimmobilie erhält der Vertriebspartner eine erfolgsabhängige Provision auf den notariell beurkundeten Kaufpreis; Nebenkosten (Grunderwerbsteuer, Notar, Grundbuch, Makler) zählen nicht dazu. Alle Provisionssätze verstehen sich brutto einschließlich Umsatzsteuer.");
  // Drei Lagen, damit § 4 und Anlage 1 dasselbe sagen: keine individuellen
  // Sätze, individuelle Sätze für jeden Abschluss, oder individuelle Sätze mit
  // einem Rest, für den der Paketsatz fortgilt. Der Vorrang gilt dann nur für
  // die Abschlüsse, die ein individueller Satz wirklich erfasst; sonst
  // widerspräche § 4 der Rangfolge im Konditionenblatt.
  p(!k.hasOverride
    ? "(2) Es gilt der in Anlage 1 ausgewiesene Standardsatz des Pakets, einheitlich für Lead- und Eigenkontakte. Individuelle Provisionssätze sind nicht vereinbart."
    : k.hatRestfall
      ? "(2) Die geltenden Provisionssätze sind in Anlage 1 individuell vereinbart; die dort ausgewiesene Rangfolge bestimmt, welcher Satz für welchen Abschluss gilt. Für die Abschlüsse, die sie erfassen, gehen sie dem Standardsatz des Pakets und jeder anderen Provisionsangabe vor. Für alle übrigen Abschlüsse gilt der Standardsatz des Pakets nach Anlage 1 fort; er ist dort ausdrücklich ausgewiesen."
      : "(2) Die geltenden Provisionssätze sind in Anlage 1 individuell vereinbart; die dort ausgewiesene Rangfolge bestimmt, welcher Satz für welchen Abschluss gilt. Sie gehen dem Standardsatz des Pakets und jeder anderen Provisionsangabe vor und erfassen jeden Abschluss des Vertriebspartners.");
  // Keine monatliche Abrechnung mehr: Die Provision fliesst erst, wenn der
  // Bautraeger gezahlt hat, und das haengt an der Kaufpreisfaelligkeit. Der
  // Zyklus ist damit der Abschluss, nicht der Kalendermonat. Absatz 3a regelt,
  // wie der Partner vom Zahlungseingang erfaehrt; ohne diese Mitteilung
  // koennte er seine Rechnung gar nicht stellen.
  p("(3) Der Provisionsanspruch des Vertriebspartners entsteht, sobald der Kaufvertrag notariell beurkundet ist und die Gesellschaft die auf diesen Abschluss entfallende Provision vom Bauträger oder Verkäufer erhalten hat (§ 87a Absatz 1 Satz 2 HGB). Die Provision des Bauträgers oder Verkäufers wird regelmäßig mit Fälligkeit des Kaufpreises zur Zahlung fällig; erst nach ihrem Eingang bei der Gesellschaft kann diese den auf den Vertriebspartner entfallenden Anteil weiterleiten. Eine zeitabhängige, insbesondere monatliche Abrechnung findet nicht statt; abgerechnet wird abschlussbezogen nach Provisionseingang. § 87a Absatz 3 HGB bleibt unberührt.");
  p("(3a) Die Gesellschaft teilt dem Vertriebspartner den Eingang der Provision und die Höhe des auf ihn entfallenden Anteils unverzüglich, spätestens innerhalb von zehn Tagen nach Zahlungseingang, in Textform mit (Abrechnungsmitteilung). Der Vertriebspartner stellt daraufhin seine Rechnung. Die Auszahlung erfolgt innerhalb von 14 Tagen nach Zugang einer ordnungsgemäßen Rechnung des Vertriebspartners.");
  p("(3b) Erhält die Gesellschaft die Provision nur teilweise, insbesondere bei Ratenzahlung oder Zahlung nach Baufortschritt, wird der Anteil des Vertriebspartners anteilig im Verhältnis der eingegangenen zur insgesamt geschuldeten Provision fällig; Absatz 3a gilt für jede Teilzahlung entsprechend. Bleibt die Zahlung des Bauträgers oder Verkäufers endgültig aus oder wird der Kaufvertrag rückabgewickelt, gilt Absatz 4.");
  p("(4) Bei Rückabwicklung, Nichtzahlung oder falschen Angaben des Kunden oder einem Vertragsverstoß des Vertriebspartners entfällt der Anspruch; ausgezahlte Provisionen sind zurückzuzahlen oder werden verrechnet.");
  p("(5) Provisionsansprüche verjähren nach den gesetzlichen Vorschriften (§§ 195, 199 BGB); eine vertragliche Ausschlussfrist wird nicht vereinbart. Der Anspruch auf Abrechnung und Buchauszug (§ 87c HGB) bleibt unberührt.");
  p("(6) Der Kaufpreis eines Objekts kann nach Freigabe der Gesellschaft in Textform innerhalb des vom Verkäufer freigegebenen Preiskorridors angepasst werden, um dem Vertriebspartner eine zusätzliche Marge zu ermöglichen, sofern die Anpassung für den Endkunden marktgerecht ist. Ein Mehrerlös wird gesondert vereinbart; Ansprüche des Endkunden bleiben unberührt.");
  // Absolut: keine einseitige Änderung, auch nicht redaktionell. Vorher
  // durfte die Gesellschaft die Provisionsordnung mit drei Monaten Vorlauf
  // anpassen, zuletzt blieben "redaktionelle" Anpassungen ausgenommen.
  p("(7) Eine Änderung der Provisionssätze, der Rangfolge oder sonstiger wirtschaftlicher Kernkonditionen ist ausschließlich einvernehmlich in Textform möglich. Eine einseitige Änderung durch die Gesellschaft ist ausgeschlossen, auch für redaktionelle oder klarstellende Anpassungen. Die vereinbarten Sätze gelten unverändert fort, bis die Parteien etwas anderes vereinbaren; bereits entstandene Ansprüche bleiben in jedem Fall unberührt.");

  // ─── § 5 ───
  h1("§ 5 Leads");
  p("(1) Leads (Interessentenanfragen über Website, Funnel oder Anzeigen, Terminbuchungen, Kontakte aus dem Bestand der Gesellschaft, Empfehlungen, Social-Media-, Event- und Finanzierungsanfragen) sind Gesellschaftskontakte und bleiben Eigentum der Gesellschaft (§ 7); die Zuweisung erfolgt ausschließlich durch die Gesellschaft oder das CRM-System. Sie dürfen nur zur Vermittlung von Kapitalanlageimmobilien über die Gesellschaft genutzt werden; Weitergabe, Verkauf, private Nutzung, die Einreichung, Vermittlung oder sonstige Verwertung bei oder über andere Vertriebe, Vermittler, Plattformen oder Bauträger, die Speicherung außerhalb freigegebener Systeme und der Export ohne Genehmigung sind untersagt. Der Vertriebspartner kontaktiert Leads zeitnah und pflegt Status, Notizen, Termine und Folgeaktionen im CRM.");
  // Ohne den Schalter "Einzelne Leads erwerbbar" steht hier Wort für Wort
  // derselbe Satz wie vor dem 04.09.2026. Mit Schalter tritt an die Stelle des
  // Paketverweises der Einzelkauf, und Absatz 2a beschreibt ihn.
  // Ab Fassung 2026-09-29 nennt der letzte Halbsatz den Anspruch, den ein
  // gebuchtes Leadpaket oder ein bezahlter Einzelkauf tatsächlich begründet.
  // Ohne beides bleibt er Wort für Wort wie bisher.
  const anspruchSatz = !paketpreisRegel
    ? "Eigenakquise und Empfehlungsgeschäft werden empfohlen; ein Anspruch auf Leadzuteilung besteht nicht."
    : k.leadPaket
      ? `Eigenakquise und Empfehlungsgeschäft werden empfohlen. Einen Anspruch auf Zuteilung von Leads hat der Vertriebspartner allein aus dem vereinbarten Leadpaket nach Maßgabe der Leadpaket-Vereinbarung (${leadAnlage}); darüber hinaus besteht kein Anspruch auf Leadzuteilung.`
      : k.leadEinzelkauf
        ? "Eigenakquise und Empfehlungsgeschäft werden empfohlen; ein Anspruch auf Leadzuteilung besteht nur für Einzel-Leads, die der Vertriebspartner nach Absatz 2a erworben und bezahlt hat."
        : "Eigenakquise und Empfehlungsgeschäft werden empfohlen; ein Anspruch auf Leadzuteilung besteht nicht.";
  p(k.leadEinzelkauf
    ? `(2) Leadmodell laut Anlage 1: Im Paket Vertriebspartner ist kein festes Start-Leadkontingent enthalten; der Bezug von Leads ist freiwillig. Abweichend vom Regelmodell ist für diesen Vertrag der Einzelkauf einzelner Leads vereinbart (Absatz 2a). Eine Verrechnung von Leadkosten mit Provisionen findet nicht statt. ${anspruchSatz}`
    : `(2) Leadmodell laut Anlage 1: ${leadKlauselnFuerVertrag(paket.id, !!k.leadPaket).join(" ")} ${anspruchSatz}`);
  if (k.leadEinzelkauf) {
    // Die Beträge bleiben im Konditionenblatt: Anlage 1 ist die einzige Stelle
    // des Vertragswerks für Zahlen (§ 2).
    // Ab Fassung 2026-09-29 mit Erstattung offener Einzel-Leads (Dr. Hellwig).
    p(`(2a) Einzelne Leads sind jederzeit und in beliebiger Zahl zum Stückpreis laut Anlage 1 erwerbbar, zuzüglich der jeweils gültigen Umsatzsteuer. Eine vorherige oder gleichzeitige Buchung eines Leadpakets ist dafür nicht erforderlich. Der Vertriebspartner schuldet weder die Abnahme einer Mindestmenge noch den Erwerb von Leads überhaupt. Abgerechnet wird jeder Einzelkauf gesondert nach Rechnung, zahlbar per Überweisung.${paketpreisRegel ? " Bezahlte, bei Vertragsende noch nicht zugewiesene Einzel-Leads erstattet die Gesellschaft zum Stückpreis." : ""}`);
  }
  p(`(3) Ein Lead gilt als geliefert, sobald er im CRM-System zugewiesen ist. Ersetzt wird ein Lead bei nachweislichem Fake-Kontakt, falschen Kontaktdaten, Dublette, versehentlicher oder widerrufener Eintragung${k.leadModell === "gestellt" ? "" : ", bei Verfehlen der Qualitätszusage nach Absatz 3a"} oder wenn gilt: ${ERSATZLEAD_UNERREICHBAR} Maßgeblich ist das Kontaktprotokoll im CRM-System; die Reklamation ist binnen ${ERSATZLEAD_FRIST_TAGE} Tagen nach Zuweisung in Textform zu erklären. Fehlende Rückmeldung, Terminabsagen, mangelndes Kaufinteresse oder ein Nichtabschluss begründen keinen Ersatz; die Gesellschaft schuldet qualifizierte Leads, keinen Vermittlungserfolg.`);
  // Die Qualitaetszusage stand bis zum 04.09.2026 nur in der
  // Leadpaket-Vereinbarung (Anlage 3 § 2) und fehlte damit jedem, der Leads
  // einzeln kauft. Christian hat sie am 04.09.2026 fuer den Hauptvertrag
  // freigegeben: Sie gilt jetzt fuer jeden bezahlten Lead, in allen Vertraegen.
  // Anlage 3 speist sich aus derselben Konstante, damit beide nicht
  // auseinanderlaufen.
  // Nur wo Leads überhaupt gekauft werden können. Beim Lead-Berater sind alle
  // Leads gestellt; dort sagte der Absatz erst eine Qualität zu und nahm sie im
  // letzten Satz vollständig wieder zurück.
  if (k.leadModell !== "gestellt") {
    p(`(3a) Für jeden entgeltlich erworbenen Lead, gleich ob einzeln erworben oder aus einem Leadpaket, sichert die Gesellschaft zu: ${LEAD_QUALITAETSZUSAGE.join(" ")}${k.leadPaket ? ` Für das vereinbarte Leadpaket wiederholt ${leadAnlage} § 2 diese Zusage.` : ""} Für unentgeltlich gestellte Leads gilt diese Zusage nicht; für sie gilt § 3 Absatz 4.`);
  }
  // Ein bezahltes Leadpaket kauft die Bearbeitung, nicht den Kontakt. Das
  // stand bisher nur zwischen den Zeilen (§ 7 Absatz 2) und ist jetzt
  // ausdruecklich geregelt. Beim Lead-Berater gibt es keinen Leadkauf.
  p(k.leadModell === "gestellt"
    ? "(4) Die von der Gesellschaft gestellten Leads werden dem Vertriebspartner unentgeltlich zur Bearbeitung überlassen; ein Entgelt fällt für sie nicht an. Sie sind und bleiben Gesellschaftskontakte im Sinne des § 7 Absatz 2 und damit Eigentum und Geschäftsgeheimnis der Gesellschaft, während der Vertragslaufzeit und nach Vertragsende. Einmal-, Einstiegs-, Onboarding- oder Eintrittsgebühren werden in diesem Vertrag nicht erhoben (§ 2 Absatz 2)."
    : paketpreisRegel
      // Fassung 2026-09-29: Der Betrag heißt Paketpreis und ist Entgelt für
      // Gewinnung und Vorqualifizierung, nicht mehr Nutzungsentgelt. Der Rest
      // des Absatzes ist unverändert bis auf den Eigentumssatz, der beide
      // Preise ausdrücklich nennt (Prüfung Dr. Hellwig, 29.09.2026).
      ? "(4) Der Paketpreis eines Leadpakets und der Stückpreis von Einzel-Leads sind Entgelt für die Gewinnung und Vorqualifizierung der vereinbarten Zahl qualifizierter Leads; sie werden für eine freiwillig gebuchte Zusatzleistung geschuldet, die Leistungen nach § 3 Absatz 1 bleiben unentgeltlich. Die Gesellschaft setzt den Paketpreis für eigene Werbemaßnahmen ein; diese sind Marketingmaßnahmen der Gesellschaft und keine Marketingmaßnahmen des Vertriebspartners. Weder Paketpreis noch Stückpreis begründen Eigentum oder ein sonstiges Recht an den Kontakten oder ihren Daten. Auch bezahlte Leads verbleiben bei der Gesellschaft: Sie sind und bleiben Gesellschaftskontakte im Sinne des § 7 Absatz 2 und damit Eigentum und Geschäftsgeheimnis der Gesellschaft, während der Vertragslaufzeit und nach Vertragsende. Einmal-, Einstiegs-, Onboarding- oder Eintrittsgebühren werden in diesem Vertrag nicht erhoben (§ 2 Absatz 2)."
      : "(4) Ein Entgelt für ein Leadpaket oder für Einzel-Leads ist ein Nutzungsentgelt für die Bereitstellung dieser Leads und ihre Bearbeitung im Rahmen dieses Vertrages. Es begründet weder Eigentum noch ein sonstiges Recht an den Kontakten oder ihren Daten. Auch bezahlte Leads verbleiben bei der Gesellschaft: Sie sind und bleiben Gesellschaftskontakte im Sinne des § 7 Absatz 2 und damit Eigentum und Geschäftsgeheimnis der Gesellschaft, während der Vertragslaufzeit und nach Vertragsende. Einmal-, Einstiegs-, Onboarding- oder Eintrittsgebühren werden in diesem Vertrag nicht erhoben (§ 2 Absatz 2).");
  // Reichweite nur bei der Individualfassung: Ohne Wettbewerbsverbot muss im
  // Text stehen, dass dieser Paragraph allein die Leads der Gesellschaft
  // betrifft und nicht die eigenen Kunden des Partners. Bei der
  // Standardfassung bleibt es beim Wettbewerbsverbot des § 8.
  if (k.wettbewerbsfassung === "individuell") {
    p("(5) Reichweite dieses Paragraphen: Die Absätze 1 bis 4 gelten ausschließlich für Leads und sonstige Gesellschaftskontakte im Sinne des § 7 Absatz 2, also für Kontakte, die der Vertriebspartner über die Gesellschaft bezieht. Für seine Eigenkontakte im Sinne des § 7 Absatz 3, insbesondere seine bei Vertragsbeginn vorhandenen Bestandskunden und die von ihm selbst durch eigene Akquisition oder eigene Marketingmaßnahmen gewonnenen Interessenten, gelten sie nicht. Diese darf der Vertriebspartner auch außerhalb der Gesellschaft und im Rahmen seiner Tätigkeit für andere Unternehmen betreuen, beraten, vermitteln und einreichen; ein Wettbewerbsverbot besteht nicht (§ 8 Absatz 1 und 3). Die Abgrenzung im Einzelfall richtet sich nach § 7 Absatz 8a und 8b.");
  }

  // ─── § 6 ───
  h1("§ 6 Pflichten des Vertriebspartners und Compliance");
  p("(1) Der Vertriebspartner wahrt die Interessen der Gesellschaft, macht nur wahrheitsgemäße Angaben, hält Gesetze und Datenschutz ein, erstellt keine eigenen Exposés ohne Freigabe und hält § 8 in der für diesen Vertrag geltenden Fassung ein. Er berät nicht steuerlich (§ 2 StBerG), verspricht keine Garantien zu Wertentwicklung oder Mietrendite, stellt keine unrealistischen Renditen dar, macht keine Falschaussagen zu Objekt, Lage, Zustand oder Vermietung und vermittelt keine Finanzierungen oder Versicherungen ohne Erlaubnis (§§ 34i, 34d GewO). Der Maßstab einer aktiven Tätigkeit und die Folgen ausbleibender Tätigkeit ergeben sich aus § 12 Absatz 1a.");
  p("(2) Kunden sind in jeder Beratung auf die Risiken von Immobilieninvestments (Marktrisiko, Mietausfall, Sanierungsbedarf), die Prüfung steuerlicher Vorteile durch einen Steuerberater und die Bankabhängigkeit von Finanzierungen hinzuweisen sowie darauf, dass vergangene Wertentwicklungen keine Garantie für die Zukunft sind. Jede Beratung über die Gesellschaft wird im CRM dokumentiert (Datum, Inhalt, gezeigte Objekte, Risikohinweise, Folgeaktionen). Diese Pflichten gelten, soweit der Vertriebspartner nach § 1 Absatz 3 beraten darf; ohne die dort genannte Erlaubnis beschränkt er sich auf die Tippgebertätigkeit nach § 1 Absatz 3a und berät nicht.");
  p("(3) Werbeaussagen müssen sachlich richtig und nachprüfbar sein (§§ 3, 5 UWG); \"garantierte Rendite\", \"risikofrei\", \"steuerfrei\" oder \"sichere Gewinne\" sind unzulässig. Werbematerial, Posts und Anzeigen zum OS Immobilien-System, zu Objekten der Gesellschaft oder zu Provisionen bedürfen der vorherigen schriftlichen Freigabe; eigene Werbung des Vertriebspartners ohne Bezug zur Gesellschaft, ihren Objekten oder ihrem System ist davon nicht erfasst. Der Vertriebspartner unterstützt die Gesellschaft bei ihren Pflichten nach dem Geldwäschegesetz (Identifizierung, Mittelherkunft, PEP-Prüfung) und meldet Auffälligkeiten unverzüglich.");
  p("(4) Bei Verstößen kann die Gesellschaft abmahnen, Provisionen bis zur Klärung einbehalten, Zugänge sperren oder außerordentlich kündigen; eine Vertragsstrafe folgt allein aus § 10.");

  // ─── § 7 (Kern des Vertrags: Eigentum an Kontakten, inhaltlich wie §§ 9a bis 9d der Altfassung) ───
  h1("§ 7 Kunden-, Bauträger- und Geschäftschancenschutz, Eigentum an Kontakten");
  p("(1) Dieser Vertrag unterscheidet zwischen Gesellschaftskontakten und Eigenkontakten des Vertriebspartners. Die Zuordnung richtet sich nach der Herkunft des Kontakts, wie sie im CRM-System der Gesellschaft festgehalten ist.");
  p("(2) Gesellschaftskontakte sind alle Kunden, Interessenten, Leads und Kontakte, die der Vertriebspartner nicht selbst im Sinne von Absatz 3 angelegt hat, insbesondere von der Gesellschaft zugewiesene Kontakte, Kontakte aus einem erworbenen oder gestellten Leadpaket, aus dem Bestand oder Netzwerk der Gesellschaft, aus ihren Marketingmaßnahmen, Landingpages, Kampagnen, Empfehlungsprogrammen oder Veranstaltungen sowie Kontakte, die im CRM-System bereits erfasst waren. Gesellschaftskontakte sind und bleiben mit sämtlichen zugehörigen Daten Eigentum und Geschäftsgeheimnis der Gesellschaft im Sinne des § 90 HGB und des GeschGehG, während der Vertragslaufzeit und nach Vertragsende.");
  p("(3) Eigenkontakte sind Kunden und Interessenten, die der Vertriebspartner selbst im CRM-System der Gesellschaft anlegt, manuell oder per Datei-Import (CSV), und die zu diesem Zeitpunkt dort noch nicht erfasst sind. Das CRM-System hält fest, ob ein Kontakt vom Vertriebspartner angelegt oder von der Gesellschaft zugewiesen wurde; diese Herkunft ist maßgeblich. Eigenkontakte sind und bleiben Eigentum des Vertriebspartners, auch nach Vertragsende. Sie gehen weder während der Vertragslaufzeit noch mit Vertragsende auf die Gesellschaft über; der Vertriebspartner darf sie nach Vertragsende frei nutzen. Vor Vertragsbeginn bestehende Kunden kann er bei Vertragsbeginn per Datei-Import als Eigenkontakte anlegen.");
  p("(4) Legt der Vertriebspartner einen Kontakt selbst an, der aus Leads, Marketingmaßnahmen, Daten oder sonstigen Mitteln der Gesellschaft im Sinne von Absatz 2 stammt, bleibt er Gesellschaftskontakt. War ein Kontakt bei seiner Anlage bereits im CRM-System erfasst, ist er Gesellschaftskontakt; eine Kennzeichnung als Eigenkontakt ist dann ausgeschlossen.");
  p("(5) Der Vertriebspartner erfasst sämtliche Kontakte, die er über die Gesellschaft berät oder vermittelt, vollständig im CRM-System, dokumentiert Kommunikation, Termine, Statusänderungen und Ergebnisse nachvollziehbar und führt vor der Bearbeitung eines neuen Kontakts eine Dublettenprüfung durch. Das gilt für Eigenkontakte gleichermaßen, solange sie über die Gesellschaft vermittelt werden; die Pflicht dient der Provisionsabrechnung, der Dublettenvermeidung und den aufsichts- und datenschutzrechtlichen Nachweispflichten und begründet keine Zuordnung des Kontakts zur Gesellschaft. Eine Pflicht, Eigenkontakte zu erfassen, die der Vertriebspartner nicht über die Gesellschaft bearbeitet, besteht nicht.");
  p("(6) Kunden- und Leaddaten der Gesellschaft dürfen während der Vertragslaufzeit nicht außerhalb der freigegebenen Systeme genutzt, weitergegeben, gespeichert oder bearbeitet werden; ein Export aus dem CRM-System ist unzulässig. Die ihm zu seinen Eigenkontakten ohnehin vorliegenden eigenen Kontaktdaten darf der Vertriebspartner weiter nutzen.");
  p("(7) Geschäftsbeziehungen zu Bauträgern, Projektentwicklern, Objektanbietern, Maklern, Asset Managern und vergleichbaren Lieferanten von Kapitalanlageobjekten, die im Rahmen der Tätigkeit für die Gesellschaft entstehen, ausgebaut oder gepflegt werden, sind Geschäftsbeziehungen der Gesellschaft, insbesondere bei Bauträgern und Projekten, die der Vertriebspartner über die Gesellschaft, ihr Netzwerk, ihr CRM oder ihre Bestandsbeziehungen kennengelernt oder für sie betreut hat. Vor Vertragsbeginn bereits bestehende eigene Geschäftsbeziehungen des Vertriebspartners zu Bauträgern und Objektanbietern werden hiervon nicht erfasst; er benennt sie der Gesellschaft bei Vertragsbeginn in Textform. Die zugehörigen Daten (Kontakte, Konditionen, Einkaufspreise, Margenstrukturen, Reservierungs- und Objektlisten, Projektpipelines) sind Eigentum und Geschäftsgeheimnis der Gesellschaft im Sinne des § 90 HGB und des GeschGehG und ausschließlich in ihren Systemen zu dokumentieren.");
  p("(8) Während der Vertragslaufzeit darf der Vertriebspartner Gesellschaftskontakte sowie Empfehlungsgeber, Bauträger, Objektzuträger und Tippgeber der Gesellschaft nicht für eigene Zwecke oder für Dritte abwerben, vermitteln, beraten oder nutzen, soweit dies in sachlichem Zusammenhang mit dem Geschäftsbereich der Gesellschaft (Vertrieb von Kapitalanlageimmobilien samt Beratung und Vermittlung) steht. Mit Bauträgern und Objektanbietern nach Absatz 7 darf er außerhalb des Systems der Gesellschaft keine Geschäfte über Kapitalanlageimmobilien anbahnen, abwickeln oder vermitteln und keine Bauträger- oder Projektbeziehungen in eine andere Struktur übernehmen. Geschäftschancen, die aus einem Gesellschaftskontakt oder aus der Tätigkeit für die Gesellschaft hervorgehen (konkrete Vermittlungs-, Reservierungs- oder Abschlussgelegenheiten, fortgeschrittene Beratungs- und Finanzierungsprozesse), sind ausschließlich über die Gesellschaft zu realisieren. Dies folgt aus § 86 Absatz 1 HGB und gilt neben § 8. Die Reichweite dieses Absatzes bestimmt Absatz 8a.");
  // Der Kern der Individualfassung: zwei Welten sauber trennen. Was ueber die
  // Gesellschaft hereinkommt, laeuft ueber die Gesellschaft. Eigene
  // Bestandskunden und selbst gewonnene Interessenten bleiben frei. Die
  // Freiheit haengt ausdruecklich an der Individualfassung des § 8, damit die
  // Klausel bei aktivem Wettbewerbsverbot nicht zu viel erlaubt.
  p(k.wettbewerbsfassung === "individuell"
    ? "(8a) Da für diesen Vertrag die Individualfassung des § 8 gilt (Anlage 1), erfasst Absatz 8 ausschließlich Gesellschaftskontakte im Sinne von Absatz 2, also Leads und Kontakte, die der Vertriebspartner über die Gesellschaft bezieht, sowie die Geschäftsbeziehungen nach Absatz 7 und die Geschäftschancen, die aus ihnen hervorgehen. Diese sind ausschließlich über die Gesellschaft abzuwickeln und dürfen nicht außerhalb der Gesellschaft eingereicht oder verwertet werden. Seine Eigenkontakte im Sinne von Absatz 3, insbesondere seine bei Vertragsbeginn vorhandenen Bestandskunden und die von ihm selbst durch eigene Akquisition oder eigene Marketingmaßnahmen gewonnenen Interessenten, darf der Vertriebspartner dagegen auch außerhalb der Gesellschaft und für andere Unternehmen beraten, vermitteln und einreichen; Absatz 8 gilt für sie nicht. Diese Freiheit besteht, weil und solange für diesen Vertrag die Individualfassung des § 8 gilt."
    : "(8a) Für diesen Vertrag gilt die Standardfassung des § 8 (Anlage 1). Absatz 8 gilt daher in vollem Umfang; während der Vertragslaufzeit besteht zusätzlich das Wettbewerbsverbot des § 8. Für Eigenkontakte im Sinne von Absatz 3 gilt Absatz 10.");
  p("(8b) Für die Abgrenzung nach Absatz 8a gilt ergänzend: (a) Maßgeblich ist allein die im CRM-System festgehaltene Herkunft nach den Absätzen 3, 4 und 11. Stammt ein Kontakt aus Leads, Marketingmaßnahmen, Daten oder sonstigen Mitteln der Gesellschaft oder war er bei seiner Anlage dort bereits erfasst, ist und bleibt er Gesellschaftskontakt, auch wenn der Vertriebspartner ihn selbst angelegt hat (Absatz 4). (b) Ein Eigenkontakt verliert seine Eigenschaft als Eigenkontakt nicht dadurch, dass der Vertriebspartner ihn im CRM-System erfasst, ihn dort dokumentiert oder ihm Objekte der Gesellschaft vorstellt (Absatz 5). (c) Führt der Vertriebspartner einen Eigenkontakt über die Gesellschaft bis zu einer konkreten Reservierung, einem erteilten Notarauftrag oder einer Beurkundung, ist dieser einzelne Vorgang über die Gesellschaft zu Ende zu führen und nach § 4 abzurechnen; die weitere Betreuung desselben Kontakts bleibt davon unberührt. (d) Bearbeitet der Vertriebspartner einen Eigenkontakt außerhalb der Gesellschaft, darf er dabei keine Objekte, Projekte, Exposés, Konditionen, Kalkulationen, Unterlagen oder Geschäftspartner der Gesellschaft einsetzen (Absatz 7, § 3 Absatz 2, § 9). (e) Lässt sich die Herkunft im Streitfall nicht klären, entscheidet die zeitlich erste, vollständige und nachvollziehbare Erfassung im CRM-System (Absatz 11).");
  // Bezugspunkt sind Daten, nicht Personen. Ein Verbot, bestimmte Personen
  // anzusprechen, ist eine Wettbewerbsabrede nach § 90a HGB und ohne
  // Karenzentschaedigung angreifbar (BGH VII ZR 100/15); der Zusatz "soweit
  // gesetzlich zulaessig" rettet sie nicht, weil AGB nicht auf das zulaessige
  // Mass zurueckgeschnitten werden. Das Verbot, fremde Datenbestaende zu
  // verwenden, traegt dagegen aus § 90 HGB und dem GeschGehG, ohne
  // Entschaedigung und ohne Zeitgrenze fuer echte Geschaeftsgeheimnisse.
  p("(9) Nach Vertragsende besteht kein Wettbewerbsverbot. Dem Vertriebspartner ist es weder untersagt, für andere Unternehmen tätig zu werden, noch Personen anzusprechen, zu beraten oder für sie tätig zu werden, die er während der Vertragslaufzeit kennengelernt hat, auch wenn es sich um Gesellschaftskontakte, Empfehlungsgeber, Bauträger, Objektzuträger oder Tippgeber der Gesellschaft handelt. Eine Kundenschutz- oder Wettbewerbsabrede für die Zeit nach Vertragsende wird nicht vereinbart.");
  p(`(9a) Geschützt sind allein die Daten und Unterlagen der Gesellschaft. Sämtliche Datenbestände, Listen, Exporte, Auswertungen, Auszüge, Kopien, Bildschirmaufnahmen, Abschriften und sonstigen Aufzeichnungen, die Daten von Gesellschaftskontakten (Absatz 2) oder die Angaben nach Absatz 7 enthalten, sind bei Vertragsende nach § 9 Absatz 6 herauszugeben und nachweislich zu löschen. Sie dürfen danach weder genutzt noch weitergegeben noch verwertet werden, insbesondere nicht, um daraus Namen, Anschriften, Telefonnummern, Bedarfe, Vermögensverhältnisse, Konditionen, Einkaufspreise, Margen oder Objektzuordnungen zu entnehmen. Für Geschäftsgeheimnisse im Sinne des GeschGehG gilt dieses Verbot ohne zeitliche Begrenzung (§ 90 HGB); für sonstige vertrauliche Informationen gilt es für ${k.schutzfristMonate} Monate nach Vertragsende.`);
  p("(9b) Nicht erfasst ist das Wissen, das der Vertriebspartner ohne Rückgriff auf solche Aufzeichnungen im Gedächtnis behalten hat. Nutzt er dieses Wissen, sind Kontaktaufnahme, Beratung und Vermittlung uneingeschränkt zulässig, auch für andere Unternehmen und auf eigene Rechnung. Die Darlegungs- und Beweislast dafür, dass der Vertriebspartner Daten oder Unterlagen der Gesellschaft verwendet hat, trägt die Gesellschaft. Die Gesellschaft darf gegenüber einem Bauträger jederzeit klarstellen, dass der Kontakt im Rahmen der Tätigkeit für sie entstanden ist. Für Geschäftsgeheimnisse gilt ergänzend § 9.");
  p("(10) Für Eigenkontakte im Sinne von Absatz 3 gelten die Absätze 8, 9a und 9b nicht; während der Vertragslaufzeit gilt dies nach Maßgabe der Absätze 8a und 8b. Der Vertriebspartner darf sie während der Vertragslaufzeit und nach Vertragsende frei betreuen, beraten und vermitteln; § 8 bleibt für die Vertragslaufzeit unberührt. Ausgenommen sind allein Vorgänge, die bei Vertragsende bereits konkret angebahnt sind, insbesondere laufende Reservierungen und Fälle mit erteiltem Notarauftrag; sie werden über die Gesellschaft zu Ende geführt und nach § 4 abgerechnet, für Gesellschafts- und Eigenkontakte gleichermaßen. Im Übrigen unterliegen Geschäftschancen nach Vertragsende keiner Beschränkung.");
  p("(11) Maßgeblich für die Zuordnung von Kunden, Interessenten, Bauträgern und Objektzuträgern ist ausschließlich die Erfassung im CRM-System der Gesellschaft; es gilt das Prioritätsprinzip der erstmaligen, vollständigen und nachvollziehbaren Erfassung. Mündliche, parallele oder externe Aufzeichnungen (private Tools, Listen, E-Mail-Postfächer, Notizen, Drittsysteme) begründen keinen vorrangigen Anspruch. Bei Dubletten oder Mehrfachzuordnungen entscheidet die Gesellschaft anhand der CRM-Daten und der dokumentierten Kontakthistorie; die Entscheidung ist dem Vertriebspartner in Textform zu begründen und im Streitfall gerichtlich überprüfbar. Eine Anfechtung ist insbesondere bei nachweislich falscher oder unvollständiger CRM-Dokumentation möglich.");
  p("(12) Dieser Paragraph begründet kein nachvertragliches Wettbewerbsverbot und keine Beschränkung der beruflichen Tätigkeit des Vertriebspartners nach Vertragsende. Er regelt, wem Kontakte und Daten gehören, und schützt die Daten und Geschäftsgeheimnisse der Gesellschaft (§ 90 HGB, GeschGehG) ebenso wie die Eigenkontakte des Vertriebspartners als sein Eigentum.");

  // ─── § 8 ───
  if (k.wettbewerbsfassung === "individuell") {
    h1("§ 8 Nebentätigkeit, Kunden- und Partnerschutz (Individualfassung laut Anlage 1)");
    p("(1) Für den Vertriebspartner besteht weder während noch nach Beendigung dieses Vertrages ein allgemeines Wettbewerbsverbot. Er darf parallel für andere Unternehmen, auch im Bereich Kapitalanlage-Immobilien, tätig sein, soweit die Erfüllung dieses Vertrages nicht beeinträchtigt wird. Die bei Vertragsbeginn bestehenden Tätigkeiten für andere Vertriebe oder Bauträger sind in Anlage 1 erklärt; spätere Aufnahme oder Beendigung zeigt er der Gesellschaft vorab in Textform an (Anzeigepflicht, keine Zustimmungspflicht).");
    p("(2) § 7 gilt uneingeschränkt, einschließlich der Eigentums-, Daten- und Geheimnisschutzregeln für die Zeit nach Vertragsende (§ 7 Absatz 9a, § 9). Von der Gesellschaft bezogene Leads und Gesellschaftskontakte dürfen ausschließlich über die Gesellschaft beraten, bearbeitet und eingereicht werden; ihre Vermittlung oder Verwertung bei anderen Vertrieben, Vermittlern, Plattformen oder Bauträgern ist untersagt (§ 5 Absatz 1 und 5, § 7 Absatz 8a).");
    p("(3) Eigenkontakte im Sinne von § 7 Absatz 3, insbesondere die bei Vertragsbeginn selbst angelegten Bestandskunden und die vom Vertriebspartner durch eigene Akquisition oder eigene Marketingmaßnahmen gewonnenen Interessenten, darf der Vertriebspartner auch für andere Unternehmen frei betreuen, vermitteln und dort einreichen; Objekte, Projekte, Konditionen, Unterlagen und Geschäftspartner der Gesellschaft darf er dabei nicht einsetzen (§ 7 Absatz 7 und 8b, § 3 Absatz 2, § 9). Systeme, Unterlagen und Kommunikationswege hält er strikt getrennt (§ 9 Absatz 3). Für Verstöße gegen die Absätze 2 und 3 gilt ausschließlich § 10.");
    p("(4) Diese Individualfassung ist in Anlage 1 ausdrücklich vereinbart und ersetzt die Standardfassung des § 8 vollständig. Alle Klauseln dieses Vertrages, die auf die geltende Fassung des § 8 Bezug nehmen, insbesondere § 3 Absatz 2, § 5 Absatz 5, § 6 Absatz 1 und § 7 Absatz 8a, sind nach dieser Individualfassung auszulegen.");
  } else {
    h1("§ 8 Wettbewerbsverbot während der Vertragslaufzeit (Standardfassung laut Anlage 1)");
    p("(1) Während der Vertragslaufzeit darf der Vertriebspartner keine konkurrierenden Immobilienvertriebe mit identischem Geschäftsmodell aktiv vertreiben oder aufbauen (§ 86 Absatz 1 HGB). Erfasst sind Geschäftsmodelle im Bereich der Kapitalanlage-Immobilien und damit zusammenhängender Vertriebs-, Vermittlungs- und Beratungsleistungen (steueroptimierte Kapitalanlageimmobilien, möblierte WG- und Co-Living-Konzepte, Neubau-Kapitalanlagen, Bauträgervertriebe für Kapitalanleger, datenbasierte Investmentberatung für Wohnimmobilien als Kapitalanlage). Eine darüber hinausgehende Berufsausübung (selbstgenutzte Immobilien, Gewerbeimmobilien, andere Branchen) wird nicht beschränkt.");
    p("(2) Bereits bestehende Tätigkeiten sind der Gesellschaft in Textform offenzulegen.");
    p("(3) Nach Vertragsende besteht kein Wettbewerbsverbot und keine Beschränkung der Ansprache von Kunden. Es gelten allein die Eigentums-, Daten- und Geheimnisschutzregeln der §§ 7 und 9: Eigenkontakte bleiben Eigentum des Vertriebspartners; zugewiesene Leads, Gesellschaftskontakte sowie Bauträger- und Geschäftspartnerdaten bleiben Eigentum und Geschäftsgeheimnis der Gesellschaft, sind herauszugeben und zu löschen und dürfen danach nicht genutzt, weitergegeben oder verwertet werden.");
  }

  // ─── § 9 ───
  h1("§ 9 Geheimhaltung, Datenschutz, Auskunft, Herausgabe und Löschung");
  p("(1) Sämtliche internen Informationen der Gesellschaft sind vertraulich zu behandeln, insbesondere Objektlisten und Projektpipelines, Bauträgerkontakte samt Konditionen, Einkaufspreisen, Margen und Kalkulationen, CRM-, Kunden- und Leaddaten, Prozessstrukturen, Skripte, Schulungsunterlagen, Vorlagen, Preislisten, strategische Pläne und alle Geschäftsgeheimnisse im Sinne des GeschGehG.");
  p(`(2) Diese Pflicht gilt während der Vertragslaufzeit und danach fort: für Geschäftsgeheimnisse im Sinne des § 2 Nummer 1 GeschGehG zeitlich unbeschränkt, für die übrigen in Absatz 1 einzeln benannten vertraulichen Informationen für ${k.schutzfristMonate} Monate nach Vertragsende, soweit die Information nicht ohne Verschulden des Vertriebspartners öffentlich bekannt geworden ist. Die Pflicht erfasst nur die in Absatz 1 benannten Informationen; eine darüber hinausgehende allgemeine Verschwiegenheit über innere Angelegenheiten der Gesellschaft wird nicht vereinbart. Eine Nutzung dieser Informationen zugunsten konkurrierender Geschäftsmodelle oder Strukturen ist im gesamten Zeitraum untersagt; die nach § 8 zulässige Tätigkeit des Vertriebspartners für andere Unternehmen wird dadurch nicht beschränkt, solange er dabei keine Informationen der Gesellschaft einsetzt.`);
  p("(3) Ist der Vertriebspartner zulässigerweise für andere Unternehmen tätig, gelten diese und ihre Mitarbeiter als Dritte. Untersagt sind insbesondere Einblicke in das CRM-System (auch durch Bildschirmübertragung, Demonstration oder Mitbenutzung des Zugangs), die Übernahme, Nachbildung oder Weitergabe von Prozessen, Skripten, Vorlagen, Kalkulationen oder Schulungsinhalten an fremde Strukturen und jede Speicherung von Daten der Gesellschaft in Systemen Dritter. Systeme, Unterlagen und Kommunikationswege sind strikt getrennt zu halten.");
  // Der letzte Satz erst ab Fassung 2026-09-26 (Anlage 4).
  p(`(4) Beide Parteien halten die DSGVO ein; personenbezogene Daten werden nur zur Vertragsdurchführung verarbeitet. Rollen, Weisungen, technische und organisatorische Maßnahmen, Unterauftragsverhältnisse, Löschung und die Verschwiegenheitserklärung regelt die Auftragsverarbeitungsvereinbarung (Anlage 2).${k.metaPixelAnlage ? " Für den Einsatz eines eigenen Meta Pixels auf den Partnerseiten gilt Anlage 4." : ""}`);
  p("(5) Der Vertriebspartner erteilt der Gesellschaft auf Verlangen jederzeit, insbesondere bei Vertragsende oder bei begründetem Verdacht eines Verstoßes, vollständige und wahrheitsgemäße Auskunft über alle von ihm über die Gesellschaft bearbeiteten Kunden, Leads, Bauträger, Projekte und Geschäftschancen. Eine Auskunftspflicht über seine außerhalb der Gesellschaft bearbeiteten Eigenkontakte und über seine Tätigkeit für andere Unternehmen besteht nicht; unberührt bleibt die Anzeigepflicht nach § 8 Absatz 1.");
  p("(6) Sämtliche Kunden-, Lead-, Bauträger-, Objekt- und Projektdaten, Listen, Auswertungen, Unterlagen, Korrespondenzen und Aufzeichnungen aus der Tätigkeit für die Gesellschaft sind ihr Eigentum. Sie sind bei Vertragsende unverzüglich und vollständig herauszugeben und auf allen eigenen Systemen, Geräten und Speichermedien nachweislich und unwiderruflich zu löschen; die Löschung ist auf Verlangen in Textform zu bestätigen. Eigenkontakte (§ 7 Absatz 3) und die eigenen Kontaktdaten des Vertriebspartners zu ihnen bleiben sein Eigentum.");

  // ─── § 10 (das einzige Strafregime des Vertragswerks) ───
  h1("§ 10 Vertragsstrafe, Auskunft und Schadensersatz");
  p(k.wettbewerbsfassung === "individuell"
    ? "(1) Für jeden schuldhaften Verstoß gegen die Pflichten während der Vertragslaufzeit nach § 7 Absatz 8 in Verbindung mit Absatz 8a und § 8 Absatz 2 und 3, gegen die Daten- und Geheimnisschutzpflichten nach § 7 Absätze 6 und 9a, § 9 Absätze 1 bis 3 und 6 sowie gegen die Verschwiegenheitserklärung (Anlage 2 Teil II) kann die Gesellschaft eine Vertragsstrafe verlangen. Dies ist das einzige Vertragsstrafenversprechen dieses Vertragswerks; die Anlagen verweisen hierauf und begründen keine weiteren Vertragsstrafen. Die nach § 7 Absatz 8a und § 8 zulässige Betreuung von Eigenkontakten und die zulässige Tätigkeit für andere Unternehmen lösen keine Vertragsstrafe aus. Eine Vertragsstrafe wegen eines Verstoßes gegen § 7 Absatz 9a setzt voraus, dass der Vertriebspartner Daten oder Unterlagen der Gesellschaft im Sinne jener Vorschrift verwendet hat; eine Kontaktaufnahme, Beratung oder Vermittlung, die sich nicht auf solche Daten oder Unterlagen stützt, löst keine Vertragsstrafe aus (§ 7 Absatz 9b)."
    : "(1) Für jeden schuldhaften Verstoß gegen die Pflichten während der Vertragslaufzeit nach § 7 Absatz 8 und § 8, gegen die Daten- und Geheimnisschutzpflichten nach § 7 Absätze 6 und 9a, § 9 Absätze 1 bis 3 und 6 sowie gegen die Verschwiegenheitserklärung (Anlage 2 Teil II) kann die Gesellschaft eine Vertragsstrafe verlangen. Dies ist das einzige Vertragsstrafenversprechen dieses Vertragswerks; die Anlagen verweisen hierauf und begründen keine weiteren Vertragsstrafen. Eine Vertragsstrafe wegen eines Verstoßes gegen § 7 Absatz 9a setzt voraus, dass der Vertriebspartner Daten oder Unterlagen der Gesellschaft verwendet hat (§ 7 Absatz 9b).");
  p(`(2) Die Höhe der Vertragsstrafe bestimmt die Gesellschaft nach billigem Ermessen (§ 315 BGB) unter Berücksichtigung von Art, Umfang, Dauer und Schwere des Verstoßes, des Grades des Verschuldens sowie des Werts des betroffenen Kontakts, Geschäftspartners, Datenbestands oder der betroffenen Geschäftschance. Sie beträgt höchstens ${formatPreis(k.vertragsstrafeMaxEinzel)} je Verstoß; bei systematischer Abwerbung mehrerer Kontakte oder Geschäftspartner während der Vertragslaufzeit sowie bei Nutzung, Weitergabe oder Export ganzer Datenbestände höchstens ${formatPreis(k.vertragsstrafeMaxSystematisch)} je Verstoß. Die Angemessenheit der festgesetzten Vertragsstrafe kann im Streitfall durch das zuständige Gericht überprüft werden.`);
  p("(3) Jeder Verstoß kann gesondert sanktioniert werden; mehrere Handlungen aus einem einheitlichen Entschluss, die denselben Kontakt, Geschäftspartner oder dieselbe Geschäftschance betreffen, gelten als ein Verstoß. Bloße Verstöße gegen Dokumentations- und Formpflichten (§ 7 Absatz 5) lösen keine Vertragsstrafe aus.");
  p("(4) Weitergehende Schadensersatz- und Unterlassungsansprüche sowie Ansprüche auf Herausgabe entgangenen Gewinns bleiben unberührt; eine gezahlte Vertragsstrafe wird auf einen darüber hinausgehenden Schadensersatz angerechnet. Im Eilfall darf die Gesellschaft eine einstweilige Verfügung ohne vorherige Abmahnung beantragen.");

  // ─── § 11 ───
  h1("§ 11 Haftung");
  p("(1) Der Vertriebspartner haftet für eigene Beratungsfehler, Falschaussagen, Pflichtverletzungen, Datenschutzverstöße und Gesetzesverstöße selbst; seine berufs- oder aufsichtsrechtliche Eigenhaftung gegenüber Kunden oder Behörden (§§ 34c, 34f, 34i GewO, MaBV) bleibt unberührt.");
  p("(2) Die Gesellschaft haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit. Bei einfacher Fahrlässigkeit haftet sie nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten), also solcher Pflichten, deren Erfüllung die ordnungsgemäße Durchführung dieses Vertrages überhaupt erst ermöglicht und auf deren Einhaltung der Vertriebspartner regelmäßig vertrauen darf, und dann begrenzt auf den vorhersehbaren, vertragstypischen Schaden.");
  p("(3) Im Übrigen ist die Haftung der Gesellschaft bei einfacher Fahrlässigkeit ausgeschlossen. Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt. Für wirtschaftliche Ergebnisse oder steuerliche Auswirkungen der vermittelten Investments wird keine Haftung übernommen (§ 3 Absatz 4).");

  // ─── § 12 (eine Laufzeit für Vertrag und CRM) ───
  h1("§ 12 Laufzeit und Kündigung");
  // § 89 HGB staffelt die Kuendigungsfrist nach der Vertragsdauer und laesst
  // eine Verkuerzung nicht zu (Absatz 2 Satz 1). Der pauschale eine Monat, der
  // hier bis zur Fassung 2026-09-04 stand, war ab dem zweiten Jahr unwirksam.
  p("(1) Der Vertrag beginnt mit Unterzeichnung und läuft auf unbestimmte Zeit. Jede Partei kann ihn ordentlich in Textform (§ 126b BGB, zum Beispiel per E-Mail an os@os-immobilien.com) kündigen. Es gelten die gesetzlichen Fristen des § 89 Absatz 1 HGB: im ersten Vertragsjahr ein Monat, im zweiten Jahr zwei Monate, im dritten bis fünften Jahr drei Monate und ab dem sechsten Jahr sechs Monate, jeweils zum Ende eines Kalendermonats. Diese Fristen gelten für beide Parteien gleich und dürfen nicht verkürzt werden (§ 89 Absatz 2 HGB). Eine Mindestlaufzeit für diesen Vertrag besteht nicht; eine automatische Verlängerung um feste Zeiträume findet nicht statt.");
  // Taetigkeitsmassstab, seit der Fassung 2026-09-10. Er steht bewusst hier
  // und nicht in § 6: Ein Abschluss ist ein Erfolg und kein Verhalten, und
  // nach § 86 Absatz 1 HGB schuldet der Handelsvertreter das Bemuehen, nicht
  // den Erfolg. Als Pflicht formuliert verlangte die Klausel etwas, das der
  // Partner nicht allein herbeifuehren kann. Deshalb ist die Zahl der
  // Massstab dafuer, wann die Gesellschaft von ihrem ohnehin bestehenden
  // ordentlichen Kuendigungsrecht nach Absatz 1 Gebrauch macht. Das schafft
  // keine neue Befugnis, es macht die vorhandene sichtbar. Absatz 1 bleibt
  // dabei unveraendert: Ein Taetigkeitsmassstab ist keine Mindestlaufzeit.
  p("(1a) Tätigkeitsmaßstab und Kündigung wegen Inaktivität. Der Vertriebspartner bemüht sich fortlaufend um die Vermittlung von Immobilienkaufverträgen (§ 86 Absatz 1 HGB). Als Maßstab einer aktiven Tätigkeit gilt mindestens ein über die Gesellschaft vermittelter und notariell beurkundeter Immobilienkaufvertrag innerhalb von zwei aufeinanderfolgenden Kalenderquartalen. Wird dieser Maßstab nicht erreicht, kann die Gesellschaft den Vertrag wegen Inaktivität ordentlich nach Absatz 1 kündigen; die dortigen gesetzlichen Fristen gelten unverändert. Vor einer solchen Kündigung weist die Gesellschaft in Textform auf die ausbleibende Tätigkeit hin und gibt dem Vertriebspartner Gelegenheit zur Stellungnahme innerhalb von zwei Wochen. Das bei Vertragsbeginn laufende Quartal bleibt außer Betracht. Ebenfalls außer Betracht bleiben Zeiten nachgewiesener Arbeitsunfähigkeit, des Mutterschutzes, der Elternzeit oder einer vergleichbaren Verhinderung. Ansprüche auf bereits verdiente Provisionen und der Ausgleichsanspruch nach § 89b HGB bleiben unberührt.");
  p("(2) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund (§ 314 BGB, § 89a HGB) bleibt für beide Parteien unberührt.");
  // Ab Fassung 2026-09-29 gilt die Erstattungsregel der Leadpaket-Vereinbarung;
  // ohne gebuchtes Paket entfällt der zweite Satz.
  const absatz3Satz1 = "(3) Die Nutzung des CRM-Systems und der übrigen Leistungen nach § 3 Absatz 1 besteht für die Dauer dieses Vertrages und endet mit ihm (§ 9 Absatz 6); sie ist unentgeltlich und kann nicht gesondert gekündigt werden.";
  p(!paketpreisRegel
    ? `${absatz3Satz1} Der Betrag eines Leadpakets wird bei Kündigung nicht anteilig erstattet.`
    : k.leadPaket
      ? `${absatz3Satz1} Für ein bei Vertragsende nicht vollständig geliefertes Leadpaket gilt die Erstattungsregel der Leadpaket-Vereinbarung (${leadAnlage} § 1a Absatz 5).`
      : absatz3Satz1);
  // Ohne monatliche Abrechnung kann der Zahlungseingang beim Bautraeger nach
  // dem Vertragsende liegen. Ohne diesen Absatz haenge der Anspruch in der Luft.
  p("(4) Provisionsansprüche aus Abschlüssen, die bis zum Vertragsende notariell beurkundet oder nach § 7 Absatz 10 über die Gesellschaft zu Ende geführt werden, bleiben von der Beendigung unberührt; für sie gelten § 4 Absatz 3 bis 3b auch nach Vertragsende fort.");

  // ─── § 13 ───
  h1("§ 13 Unternehmerstatus, kein Widerrufsrecht");
  p("(1) Der Vertriebspartner handelt ausschließlich als Unternehmer (§ 14 BGB) im Rahmen seiner gewerblichen bzw. selbstständigen Tätigkeit; Verbraucher (§ 13 BGB) sind ausgeschlossen, ein gesetzliches Widerrufsrecht besteht nicht.");
  p("(2) Der Vertrag kommt durch Unterzeichnung oder digitale Zustimmung (elektronische Signatur oder Textform mit Token-Bestätigung) zustande; die Gesellschaft kann Bewerbungen ohne Angabe von Gründen ablehnen.");

  // ─── § 14 (Anlagen aus derselben Quelle wie die gedruckten Anlagen) ───
  spacer(2);
  ensure(60);
  h1("§ 14 Schlussbestimmungen und Vertragsbestandteile");
  p("(1) Folgende Anlagen sind verbindlicher Bestandteil dieses Vertrages und dem Vertriebspartner vor Unterzeichnung vollständig zur Kenntnis gebracht worden. Sie liegen als eigenständige Dokumente vor und sind gleichrangiger Bestandteil dieses Vertrages; die Trennung in einzelne Dateien dient allein der Übersicht:");
  const anlagen = vertragsAnlagen(paket.id, !!bewerber.individuelleVertragsFassung, hatLeadpaketAnlage(bewerber, paket.id), "neu", k.metaPixelAnlage);
  bullet(anlagen.map((a) => `Anlage ${a.nummer} - ${a.titel}${a.nummer === 3 ? " (optionales Leadpaket)" : ""}`));
  p("(2) Mit seiner Unterschrift bestätigt der Vertriebspartner, sämtliche Anlagen vor Unterzeichnung erhalten, vollständig gelesen, verstanden und als rechtsverbindlichen Bestandteil dieses Vertrages akzeptiert zu haben; eine gesonderte Unterschrift unter den Anlagen ist nicht erforderlich. Bei Widersprüchen geht Anlage 1 diesem Hauptvertrag vor (§ 2), im Übrigen der Hauptvertrag den Anlagen, soweit eine Anlage nicht ausdrücklich Abweichendes regelt.");
  p(`(3) Änderungen dieses Vertrages bedürfen der Schriftform, soweit er nicht ausdrücklich Textform genügen lässt (§ 4 Absatz 7, § 12${k.metaPixelAnlage ? ", Anlage 4 § 11 Absatz 3" : ""}); das gilt auch für die Aufhebung dieses Erfordernisses. Sollten einzelne Bestimmungen unwirksam sein, bleibt der übrige Vertrag wirksam. Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts; Gerichtsstand ist, soweit zulässig, der Sitz der Gesellschaft (Mittenwalde).`);
}

/* ── Anlage 2: AVV inkl. Verschwiegenheitserklärung ───────────────────── */

export function renderAnlage2Avv(t: KlauselTools, ctx: KlauselKontext): void {
  const { h1, p, spacer } = t;
  const k = konditionenAusKontext(ctx);

  h1("§ 1 Gegenstand, Dauer und Rollenverteilung");
  p("(1) Die Parteien schließen diese Vereinbarung gemäß Art. 28 DSGVO. Gegenstand ist die Verarbeitung von Interessenten-, Kunden- und Investmentdaten zur Vermittlung von Kapitalanlageimmobilien und zur Nutzung des CRM-Systems der Gesellschaft. Die Vereinbarung läuft, solange der Handelsvertretervertrag besteht, und endet mit ihm.");
  p("(2) Für Gesellschaftskontakte (§ 7 Absatz 2 des Hauptvertrages) ist die Gesellschaft Verantwortliche und der Vertriebspartner Auftragsverarbeiter; diese Vereinbarung gilt für sie in vollem Umfang. Für seine Eigenkontakte (§ 7 Absatz 3 des Hauptvertrages) ist der Vertriebspartner selbst Verantwortlicher im Sinne des Art. 4 Nr. 7 DSGVO und trägt allein die Verantwortung für Rechtsgrundlage, Information der Betroffenen (Art. 13 und 14 DSGVO) und Betroffenenrechte. Soweit Eigenkontakte im CRM-System gespeichert werden, stellt die Gesellschaft das System als technische Plattform bereit; die Maßnahmen nach § 4 gelten auch für diese Daten.");
  if (k.wettbewerbsfassung === "individuell") {
    p("(3) Daten, die der Vertriebspartner im Rahmen seiner nach § 8 des Hauptvertrages zulässigen Tätigkeit für andere Unternehmen außerhalb des CRM-Systems verarbeitet, sind nicht Gegenstand dieser Vereinbarung; für sie ist er allein Verantwortlicher. Eine Vermischung dieser Daten mit Daten der Gesellschaft ist unzulässig (§ 9 Absatz 3 des Hauptvertrages).");
  }

  h1("§ 2 Art, Zweck und Umfang der Verarbeitung");
  p("Zwecke: Kundenberatung, Immobilienvermittlung, Finanzierungsvorprüfung, CRM-Nutzung, Leadbearbeitung und Pipeline-Pflege, Kommunikation per E-Mail, Telefon und Chat. Datenarten: Stammdaten (Name, Anschrift, Geburtsdatum, Kontaktdaten), Vertragsdaten (Investmentdaten, Kaufpreise, Notarunterlagen), Bonitätsdaten (Einkommen, Beschäftigung, SCHUFA) und Kommunikationsdaten (E-Mails, Chatverläufe, Anrufnotizen). Betroffene: Interessenten und Leads, Kunden und Käufer, Empfehlungsgeber.");

  h1("§ 3 Pflichten des Auftragsverarbeiters, Unterauftragsverhältnisse");
  p("(1) Der Vertriebspartner verarbeitet Daten ausschließlich auf dokumentierte Weisung der Verantwortlichen, behandelt sie vertraulich und gibt sie nicht unbefugt weiter, verwendet nur DSGVO-konforme Systeme, hält die Maßnahmen nach § 4 ein, unterstützt bei Betroffenenrechten (Auskunft, Berichtigung, Löschung) und meldet Datenpannen innerhalb von 24 Stunden an die Gesellschaft.");
  p("(2) Unterauftragsverarbeiter dürfen nur mit vorheriger schriftlicher Zustimmung der Gesellschaft eingesetzt werden. Die von der Gesellschaft selbst eingesetzten Plattform-Dienstleister (Hosting und Datenbank in der EU) werden dem Vertriebspartner auf Anfrage benannt.");

  h1("§ 4 Technische und organisatorische Maßnahmen");
  p("Zugangskontrolle über E-Mail und Passwort, optional Zwei-Faktor-Authentifizierung; Zugriffskontrolle über rollenbasierte Berechtigungen und Row-Level-Security; Übertragungskontrolle über TLS 1.2 oder höher für alle Verbindungen; Eingabekontrolle durch Protokollierung relevanter Änderungen im Audit-Log; Verfügbarkeit durch tägliche Backups mit 30 Tagen Aufbewahrung und Point-in-Time-Recovery; Verschlüsselung der Daten in Ruhe, sensible Dokumente nur über signierte URLs.");

  h1("§ 5 Löschung, Rückgabe und Kontrolle");
  p("Nach Beendigung sind sämtliche personenbezogenen Daten der Gesellschaft unverzüglich zu löschen oder, nach Wahl der Verantwortlichen, zurückzugeben; Sicherungskopien werden binnen 30 Tagen vernichtet, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen. Die Löschung ist auf Verlangen schriftlich zu bestätigen. Eigenkontakte des Vertriebspartners (§ 7 Absatz 3 des Hauptvertrages) sind ausgenommen; sie bleiben sein Eigentum und in seiner datenschutzrechtlichen Verantwortung. Die Gesellschaft darf die vereinbarten Maßnahmen kontrollieren, im Regelfall durch Anforderung aktueller Nachweise.");

  spacer(2);
  h1("Teil II: Verschwiegenheitserklärung");
  p(`Verpflichtete Person: ${k.partnerName}`);

  h1("§ 6 Verpflichtung zur Verschwiegenheit, Folgen von Verstößen");
  p("(1) Die verpflichtete Person bewahrt über sämtliche im Rahmen der Tätigkeit für die OS Immobilien bekannt gewordenen Informationen Stillschweigen, insbesondere über personenbezogene Daten von Kunden, Interessenten, Mitarbeitenden und Empfehlungsgebern, Betriebs- und Geschäftsgeheimnisse, Geschäftsstrategien, Konditionen, Provisionsstrukturen, Objektpipelines, Eigentümerdaten, Kalkulationen, CRM-Inhalte sowie Schulungs- und Vertriebsunterlagen.");
  p("(2) Die Verpflichtung gilt für Geschäftsgeheimnisse zeitlich unbeschränkt und besteht nach Beendigung der Tätigkeit fort; im Übrigen gilt § 9 Absatz 2 des Hauptvertrages. Eine Weitergabe an Dritte, auch innerhalb derselben Unternehmensgruppe oder an Familienangehörige, ist ohne vorherige schriftliche Zustimmung der Gesellschaft untersagt. Als Dritte gelten auch die Unternehmen, für die der Vertriebspartner nach § 8 des Hauptvertrages zulässigerweise tätig ist.");
  p("(3) Die verpflichtete Person bewahrt vertrauliche Dokumente sicher auf, erstellt keine Kopien, Fotos, Screenshots oder Exporte außerhalb genehmigter Systeme, hält Zugangsdaten geheim, meldet Verlust oder Diebstahl von Daten oder Geräten unverzüglich und vernichtet nach Vertragsende sämtliche Unterlagen und Kopien oder gibt sie zurück.");
  p("(4) Für schuldhafte Verstöße gegen diesen Paragraphen gilt ausschließlich die Vertragsstrafenregelung des § 10 des Hauptvertrages; diese Anlage begründet keine weitere oder abweichende Vertragsstrafe. Unterlassungs- und Beseitigungsansprüche sowie strafrechtliche Schritte (insbesondere § 23 GeschGehG, §§ 202a ff., 203 StGB, Art. 83 DSGVO) bleiben vorbehalten.");
  p("(5) Änderungen dieser Anlage bedürfen der Schriftform, auch die Aufhebung dieses Erfordernisses. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt; im Übrigen gilt § 14 des Hauptvertrages.");
}

/* ── Anlage 3: Leadpaket-Vereinbarung ─────────────────────────────────── */

function renderLeadpaketAnlageKompakt(
  t: Pick<KlauselTools, "h1" | "p" | "bullet">,
  leadPaket: LeadPaketDaten,
  paketpreisRegel: boolean,
): void {
  const { h1, p, bullet } = t;

  h1("§ 1 Gegenstand und Erwerb");
  if (paketpreisRegel) {
    // Fassung 2026-09-29 (Freigabe vom 29.09.2026): Paketpreis statt
    // Werbebudget, Pflicht zur Zuweisung nach § 1a, keine Absage an jede
    // Erstattung mehr.
    p(`(1) Der Vertriebspartner bucht das in Anlage 1 ausgewiesene Leadpaket. Die Gesellschaft verpflichtet sich, ihm ${leadPaket.anzahl} qualifizierte Leads nach Maßgabe des § 1a zuzuweisen. Der Paketpreis beträgt ${formatPreis(leadPaket.betrag)} netto zuzüglich der jeweils gültigen Umsatzsteuer und ist nach Rechnung per Überweisung zu zahlen; er ist Entgelt im Sinne von § 5 Absatz 4 des Hauptvertrages. Die zugewiesenen Leads sind Gesellschaftskontakte im Sinne von § 7 Absatz 2 des Hauptvertrages.`);
    p(`(2) Es gilt das Leadmodell der Gesellschaft: Der Paketpreis eines Leadpakets beträgt ${formatPreis(LEAD_PAKET_PREIS)} netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads; weitere Pakete können jederzeit erneut gebucht werden. Der Einzelkauf weiterer Leads zu ${formatPreis(LEAD_EINZELPREIS)} netto je Lead ist erst nach der ersten Paketbuchung möglich.`);

    h1("§ 1a Einsatz des Paketpreises, Zuteilung und Nachlieferung");
    p("(1) Die Gesellschaft weist die Leads in der Reihenfolge ihres Eingangs zu, sobald sie vorqualifiziert sind, bis die vereinbarte Zahl erreicht ist. Eine bestimmte Menge je Woche oder je Monat ist nicht geschuldet. Hat die Gesellschaft mehreren Vertriebspartnern Leadpakete zugesagt, verteilt sie die eingehenden Leads nach billigem Ermessen (§ 315 BGB).");
    p("(2) Die Gesellschaft setzt den Paketpreis innerhalb eines Monats ab Zahlungseingang für ihre Werbemaßnahmen ein, jedoch nicht vor Freischaltung des CRM-Zugangs des Vertriebspartners; die Frist beginnt in diesem Fall mit der Freischaltung. Ein Lead gilt als geliefert, sobald er dem Vertriebspartner im CRM-System zugewiesen ist. Die Gesellschaft schaltet den CRM-Zugang unverzüglich frei, sobald der Vertriebspartner die dafür erforderlichen Angaben gemacht hat.");
    p("(3) Reklamierte Leads, die nach § 5 Absatz 3 des Hauptvertrages zu ersetzen sind, zählen nicht auf die vereinbarte Zahl. Ersatzleads zählen auf die vereinbarte Zahl.");
    p("(4) Reichen die mit dem Paketpreis gewonnenen Leads nicht aus, um die vereinbarte Zahl zu erreichen, liefert die Gesellschaft die fehlenden Leads nach, bis die vereinbarte Zahl erreicht ist.");
    p(`(5) Endet der Hauptvertrag vor vollständiger Lieferung, gleich aus welchem Grund, erstattet die Gesellschaft für jeden nicht gelieferten Lead den Paketpreis geteilt durch die vereinbarte Zahl der Leads, bei diesem Paket ${formatPreisGenau(leadpaketPreisJeLead(leadPaket))} netto, zuzüglich der darauf entfallenden Umsatzsteuer. Die Erstattung ist binnen 14 Tagen nach Vertragsende fällig. Die Gesellschaft kann mit fälligen Gegenforderungen aufrechnen, auch mit Rückforderungen nach § 4 Absatz 4; ein Abzug von Leadkosten von Provisionen findet weiterhin nicht statt.`);
    p("(6) Soweit § 3 Absatz 4, § 5 Absatz 2 oder § 12 Absatz 3 des Hauptvertrages einen Anspruch auf Leads oder eine Erstattung ausschließen, geht diese Vereinbarung vor.");
  } else {
    p(`(1) Der Vertriebspartner erwirbt das in Anlage 1 ausgewiesene Leadpaket. Das Paket umfasst ${leadPaket.anzahl} qualifizierte Leads zum Preis von ${formatPreis(leadPaket.betrag)} netto zzgl. der jeweils gültigen Umsatzsteuer, zahlbar nach Rechnung per Überweisung. Der Betrag wird von der Gesellschaft als Werbebudget für die Gewinnung der Leads eingesetzt und bei einer Kündigung nicht anteilig erstattet.`);
    p(`(2) Es gilt das Leadmodell der Gesellschaft: Ein Leadpaket kostet ${formatPreis(LEAD_PAKET_PREIS)} netto und umfasst ${LEAD_PAKET_ANZAHL} qualifizierte Leads; weitere Pakete können jederzeit erneut gebucht werden. Der Einzelkauf weiterer Leads zu ${formatPreis(LEAD_EINZELPREIS)} netto je Lead ist erst nach der ersten Paketbuchung möglich.`);
  }

  h1("§ 2 Qualitätszusage");
  p("Die Gesellschaft sichert für jeden zugeteilten Lead zu:");
  bullet([...LEAD_QUALITAETSZUSAGE]);

  h1("§ 3 Ersatzleads, Zweckbindung und Qualitätskontrolle");
  p(`(1) Ob und wann ein Lead ersetzt wird, regelt § 5 Absatz 3 des Hauptvertrages einheitlich für alle Leads: Ersatz bei Fake-Kontakt, falschen Kontaktdaten, Dublette, versehentlicher oder widerrufener Eintragung, bei Verfehlen der Qualitätszusage nach § 2 und bei Nichterreichbarkeit (${ERSATZLEAD_UNERREICHBAR.replace(/\.$/, "")}). Maßgeblich ist das Kontaktprotokoll im CRM-System; die Reklamation ist binnen ${ERSATZLEAD_FRIST_TAGE} Tagen nach Zuteilung in Textform zu erklären.`);
  p("(2) Ein Anspruch auf Ersatzleads oder Erstattung besteht nicht, wenn ein Lead trotz erfüllter Qualitätszusage nicht zu einem Abschluss führt. Die Gesellschaft schuldet qualifizierte Leads, keinen Vermittlungserfolg.");
  p("(3) Die zugeteilten Leads dürfen ausschließlich für die Vermittlung von Kapitalanlageimmobilien über die Gesellschaft eingesetzt werden; eine anderweitige Nutzung oder Weitergabe ist untersagt, ergänzend gelten §§ 5 und 7 des Hauptvertrages. Die Gesellschaft darf stichprobenartig Qualitätscheck-Anrufe bei zugeteilten Leads durchführen.");
}
