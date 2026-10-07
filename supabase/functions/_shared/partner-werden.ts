/**
 * Die öffentliche Seite „Partner werden“ (/partner-werden): Wege, Bereiche,
 * Fragen je Weg, Einwilligung und die Prüfung einer Anfrage.
 *
 * Eine Datei für Browser und Server, wie `handbuch-funnel.ts`: Der Wizard
 * zeigt genau diese Fragen, und `submit-partner-werden` nimmt genau diese
 * Antworten an. Was hier nicht steht, lehnt der Server ab. So kann niemand
 * über einen selbst gebauten Aufruf beliebige Felder in die Bewerberakte
 * schreiben.
 *
 * Christian am 30.09.2026: „Neuer Lead, keine Automatik.“ Ein Eintrag über
 * diese Seite legt einen Bewerber im Eingang an, mit Glocke an die HR-Rolle,
 * aber ohne Mail an den Bewerber, ohne Kennenlernbogen und ohne
 * Erinnerungskette. Das Kennzeichen dafür ist `meta.partnerWerden`.
 *
 * Wortwahl: Du-Form, keine Begriffe mit Statusrisiko (Weisung, Anstellung,
 * Arbeitszeit und Ähnliches), keine Einkommens- oder Renditeversprechen.
 */

export type PartnerRolle = "finanzberater" | "versicherungsmakler" | "vertriebler" | "immobilienvertrieb";

/**
 * Die drei Wege (Rechtsbefund R1, Christian am 30.09.2026):
 *   - Tippgeber gibt nur Kontakte weiter, die Vergütung wird einzeln vereinbart,
 *   - Vertriebspartner begleitet seine Kunden selbst, als Handelsvertreter,
 *     mit Erlaubnis nach § 34c GewO, sofern die Tätigkeit sie erfordert,
 *   - Portfolio-Partner ist ein Immobilienvertrieb mit eigenem Team.
 * Finanzberatung, Versicherung und Vertrieb können Tippgeber oder
 * Vertriebspartner werden, der Portfolio-Weg ist dem Immobilienvertrieb vorbehalten.
 */
export type PartnerWeg = "tippgeber" | "vertriebspartner" | "portfolio";

/** Geschlechtsneutrale Bereichsnamen (Rechtsbefund G7). */
export const PARTNER_ROLLEN: ReadonlyArray<{ id: PartnerRolle; text: string }> = [
  { id: "finanzberater", text: "Finanzberatung" },
  { id: "versicherungsmakler", text: "Versicherung" },
  { id: "vertriebler", text: "Vertrieb" },
  { id: "immobilienvertrieb", text: "Immobilienvertrieb" },
];

export const PARTNER_WEGE: ReadonlyArray<{ id: PartnerWeg; text: string; kurz: string; rollen: PartnerRolle[] }> = [
  {
    id: "tippgeber",
    text: "Tippgeber",
    kurz: "Du gibst Kontakte weiter, deine Vergütung vereinbaren wir einzeln.",
    rollen: ["finanzberater", "versicherungsmakler", "vertriebler"],
  },
  {
    id: "vertriebspartner",
    text: "Vertriebspartner",
    kurz: "Du begleitest deine Kunden selbst, als selbstständiger Handelsvertreter.",
    rollen: ["finanzberater", "versicherungsmakler", "vertriebler"],
  },
  {
    id: "portfolio",
    text: "Portfolio-Partner",
    kurz: "Dein Immobilienvertrieb arbeitet mit unserem Objektangebot.",
    rollen: ["immobilienvertrieb"],
  },
];

export const PARTNER_WEG_TEXT: Record<PartnerWeg, string> = {
  tippgeber: "Tippgeber",
  vertriebspartner: "Vertriebspartner",
  portfolio: "Portfolio-Partner",
};

export interface PartnerAntwort {
  id: string;
  text: string;
}

export interface PartnerFrage {
  schluessel: string;
  frage: string;
  /** Ein Satz, warum wir fragen. */
  warum: string;
  antworten: PartnerAntwort[];
}

/* ─── Die Fragen, einmal geschrieben und je Weg zusammengestellt ─────── */

const KUNDEN: PartnerFrage = {
  schluessel: "kunden",
  frage: "Wie viele Kunden betreust du heute?",
  warum: "So sehen wir, wie oft bei dir das Thema Immobilie überhaupt aufkommen kann.",
  antworten: [
    { id: "unter_100", text: "Unter 100" },
    { id: "100_500", text: "100 bis 500" },
    { id: "ueber_500", text: "Über 500" },
  ],
};

const NACHFRAGE: PartnerFrage = {
  schluessel: "nachfrage",
  frage: "Wie oft fragen dich Kunden nach Immobilien?",
  warum: "Du musst dafür nichts verkaufen. Es geht nur darum, wie oft das Thema bei dir ohnehin aufkommt.",
  antworten: [
    { id: "oft", text: "Oft" },
    { id: "ab_und_zu", text: "Ab und zu" },
    { id: "selten", text: "Selten" },
  ],
};

// Geschützte Leerzeichen, damit „§“ nicht allein am Zeilenende steht.
const ERLAUBNIS_34C: PartnerFrage = {
  schluessel: "erlaubnis34c",
  frage: "Hast du eine Erlaubnis nach §\u00a034c GewO?",
  warum: "Als Vertriebspartner brauchst du sie, sofern deine Tätigkeit sie erfordert. Wo die Grenze liegt, klären wir im Gespräch.",
  antworten: [
    { id: "ja", text: "Ja" },
    { id: "nein", text: "Nein" },
    { id: "vorbereitung", text: "In Vorbereitung" },
  ],
};

const VERMITTLUNG: PartnerFrage = {
  schluessel: "vermittlung",
  frage: "Wie viel Erfahrung hast du in der Immobilienvermittlung?",
  warum: "So wissen wir, wo wir im Gespräch anfangen.",
  antworten: [
    { id: "mehrjaehrig", text: "Mehrere Jahre" },
    { id: "erste", text: "Erste Erfahrungen" },
    { id: "keine", text: "Noch keine" },
  ],
};

const UMFANG: PartnerFrage = {
  schluessel: "umfang",
  frage: "Welchen Raum soll die Immobilienvermittlung neben deinem Geschäft einnehmen?",
  warum: "Du bestimmst selbst, wie viel du machst. Wir wollen nur wissen, womit du planst.",
  antworten: [
    { id: "baustein", text: "Ein Baustein von mehreren" },
    { id: "schwerpunkt", text: "Ein fester Schwerpunkt" },
    { id: "offen", text: "Noch offen" },
  ],
};

const REGION: PartnerFrage = {
  schluessel: "region",
  frage: "Wo sind deine Kunden überwiegend zu Hause?",
  warum: "Unser Schwerpunkt liegt in Bayern, wir arbeiten aber mit Objekten in mehreren Regionen.",
  antworten: [
    { id: "bayern", text: "In Bayern" },
    { id: "andere", text: "In einem anderen Bundesland" },
    { id: "bundesweit", text: "Bundesweit verteilt" },
  ],
};

const TEAM: PartnerFrage = {
  schluessel: "team",
  frage: "Wie viele Vertriebler sind bei euch aktiv?",
  warum: "Danach richten wir aus, wie wir den Portfolio-Zugang für euch aufsetzen.",
  antworten: [
    { id: "allein", text: "Nur ich" },
    { id: "2_5", text: "2 bis 5" },
    { id: "6_20", text: "6 bis 20" },
    { id: "ueber_20", text: "Mehr als 20" },
  ],
};

const EINHEITEN: PartnerFrage = {
  schluessel: "einheiten",
  frage: "Wie viele Einheiten vermittelt ihr ungefähr im Jahr?",
  warum: "So wissen wir, welche Menge an Objekten für euch sinnvoll ist.",
  antworten: [
    { id: "unter_10", text: "Unter 10" },
    { id: "10_50", text: "10 bis 50" },
    { id: "ueber_50", text: "Mehr als 50" },
  ],
};

const ERLAUBNIS_HAUS: PartnerFrage = {
  schluessel: "erlaubnis34c",
  frage: "Liegt bei euch im Haus eine Erlaubnis nach §\u00a034c GewO vor?",
  warum: "Danach richten wir aus, wie die Zusammenarbeit mit eurem Team aussehen kann.",
  antworten: ERLAUBNIS_34C.antworten,
};

const START: PartnerFrage = {
  schluessel: "start",
  frage: "Wann passt dir ein erstes Gespräch?",
  warum: "Damit wir uns zum richtigen Zeitpunkt bei dir melden.",
  antworten: [
    { id: "sofort", text: "Gerne sofort" },
    { id: "wochen", text: "In den nächsten Wochen" },
    { id: "informieren", text: "Ich informiere mich erst" },
  ],
};

/**
 * Die Fragen je Weg, in dieser Reihenfolge nach der Wahl von Weg und Bereich.
 * Je Weg statt je Rolle: Was wir vor dem Gespräch wissen wollen, hängt davon
 * ab, wie jemand mit uns arbeiten will, nicht davon, woher er kommt. Der
 * Tippgeber wird bewusst nicht nach einer Erlaubnis gefragt.
 */
export const PARTNER_FRAGEN: Record<PartnerWeg, PartnerFrage[]> = {
  tippgeber: [KUNDEN, NACHFRAGE, START],
  vertriebspartner: [ERLAUBNIS_34C, VERMITTLUNG, KUNDEN, UMFANG, REGION, START],
  portfolio: [TEAM, EINHEITEN, ERLAUBNIS_HAUS, REGION, START],
};

/** Der Hinweis beim Tippgeber (Rechtsbefund G1). */
export const TIPPGEBER_ERLAUBNIS_HINWEIS =
  "Für die reine Weitergabe eines Kontakts ist in der Regel keine Erlaubnis nötig. Wo die Grenze liegt, erklären wir dir im Gespräch.";

export function istPartnerRolle(wert: unknown): wert is PartnerRolle {
  return typeof wert === "string" && PARTNER_ROLLEN.some((r) => r.id === wert);
}

export function istPartnerWeg(wert: unknown): wert is PartnerWeg {
  return typeof wert === "string" && PARTNER_WEGE.some((w) => w.id === wert);
}

export function rolleText(rolle: PartnerRolle): string {
  return PARTNER_ROLLEN.find((r) => r.id === rolle)?.text ?? rolle;
}

/** Welche Bereiche zu einem Weg passen. */
export function rollenFuerWeg(weg: PartnerWeg): PartnerRolle[] {
  return PARTNER_WEGE.find((w) => w.id === weg)?.rollen ?? [];
}

/** Sind alle Fragen des Wegs mit einer bekannten Antwort beantwortet? */
export function antwortenVollstaendig(weg: PartnerWeg, antworten: Record<string, string>): boolean {
  return PARTNER_FRAGEN[weg].every((f) => f.antworten.some((a) => a.id === antworten[f.schluessel]));
}

/** Die Antworten zum Lesen in der Bewerberakte: Frage und gewählter Text. */
export function lesbareAntworten(weg: PartnerWeg, antworten: Record<string, string>): Array<{ frage: string; antwort: string }> {
  return PARTNER_FRAGEN[weg].map((f) => ({
    frage: f.frage,
    antwort: f.antworten.find((a) => a.id === antworten[f.schluessel])?.text ?? "",
  }));
}

/* ─── Einwilligung ───────────────────────────────────────────────────── */

/**
 * Eigener Wortlaut und eigene Fassung, weil der Zweck ein anderer ist als bei
 * den Kundenformularen: Es geht um eine mögliche Zusammenarbeit, nicht um eine
 * Auswertung. Wer den Wortlaut ändert, hebt die Fassung an. Der Server nimmt
 * nur genau diese Fassung mit genau diesem Text an.
 *
 * HINWEIS: Wie die übrigen Einwilligungstexte noch nicht anwaltlich geprüft.
 */
export const PARTNER_EINWILLIGUNG_VERSION = "2026-09-partner-v2";

const EINWILLIGUNG_V1_TEXT =
  "Ich möchte mit MOREImmo über eine Zusammenarbeit als Partner sprechen. MOREImmo darf meine " +
  "Angaben speichern und verwenden, um meine Anfrage zu bearbeiten und mich dazu per E-Mail oder " +
  "Telefon zu kontaktieren. Ich kann mein Einverständnis jederzeit formlos widerrufen, zum " +
  "Beispiel per Mail an datenschutz@more.immo.";

/**
 * Fassung v2 (Rechtsbefund G6): mit Speicherdauer. Die Monatszahl klärt die
 * Geschäftsführung, bis dahin steht sie als gelber Platzhalter im Text, und
 * so wird sie auch gespeichert: Gespeichert wird genau, was der Besucher sah.
 */
export const PARTNER_EINWILLIGUNG_TEXT =
  EINWILLIGUNG_V1_TEXT +
  " Wir speichern deine Angaben in unserem Bewerber- und Partnerbereich, bis die Zusammenarbeit " +
  "geklärt ist, höchstens [ZAHL PRÜFEN: 12 Monate]. Mehr in unserer Datenschutzerklärung.";

/**
 * Welche Fassungen der Server annimmt, je mit genau ihrem Wortlaut. v1 bleibt,
 * solange noch Seiten mit der alten Fassung im Browser offen sind.
 */
const PARTNER_EINWILLIGUNG_FASSUNGEN: Record<string, string> = {
  "2026-09-partner-v1": EINWILLIGUNG_V1_TEXT,
  [PARTNER_EINWILLIGUNG_VERSION]: PARTNER_EINWILLIGUNG_TEXT,
};

export const PARTNER_EINWILLIGUNG_KURZ =
  "Ja, MOREImmo darf mich zu meiner Anfrage per E-Mail oder Telefon kontaktieren. Jederzeit widerrufbar.";

export const PARTNER_EINWILLIGUNG_FEHLT =
  "Bitte bestätige die Einwilligung, sonst dürfen wir deine Anfrage nicht speichern.";

/* ─── Prüfung einer Anfrage ──────────────────────────────────────────── */

/** Wer schneller durch den ganzen Wizard klickt, ist kein Mensch. */
export const PARTNER_MIN_DAUER_MS = 3000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function istPlausibleHandynummer(wert: unknown): boolean {
  if (typeof wert !== "string") return false;
  const kompakt = wert.trim().replace(/[\s()\-/.]/g, "");
  return /^(\+|00)?\d{7,15}$/.test(kompakt);
}

export interface PartnerKontakt {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  firma: string;
}

/** Prüft die Kontaktfelder. Leeres Ergebnis heißt: alles in Ordnung. */
export function pruefeKontakt(k: Partial<PartnerKontakt>): Partial<Record<keyof PartnerKontakt, string>> {
  const f: Partial<Record<keyof PartnerKontakt, string>> = {};
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (!text(k.vorname)) f.vorname = "Bitte gib deinen Vornamen an.";
  else if (text(k.vorname).length > 100) f.vorname = "Der Vorname ist zu lang.";
  if (!text(k.nachname)) f.nachname = "Bitte gib deinen Nachnamen an.";
  else if (text(k.nachname).length > 100) f.nachname = "Der Nachname ist zu lang.";
  if (!EMAIL.test(text(k.email)) || text(k.email).length > 255) f.email = "Bitte gib eine gültige E-Mail-Adresse an.";
  if (!text(k.telefon)) f.telefon = "Bitte gib deine Handynummer an, damit wir dich anrufen können.";
  else if (!istPlausibleHandynummer(k.telefon)) f.telefon = "Bitte prüfe deine Handynummer, zum Beispiel 0171 1234567.";
  if (text(k.firma).length > 120) f.firma = "Der Firmenname ist zu lang.";
  return f;
}

export function einwilligungGueltig(roh: unknown): boolean {
  if (!roh || typeof roh !== "object") return false;
  const o = roh as Record<string, unknown>;
  return (
    o.erteilt === true &&
    typeof o.version === "string" &&
    Object.prototype.hasOwnProperty.call(PARTNER_EINWILLIGUNG_FASSUNGEN, o.version) &&
    o.text === PARTNER_EINWILLIGUNG_FASSUNGEN[o.version]
  );
}

/**
 * Honigtopf gefüllt oder in unter drei Sekunden durchgeklickt: Der Server
 * antwortet freundlich mit „ok“, schreibt aber nichts. Ein Bot lernt so
 * nicht, woran er gescheitert ist.
 */
export function istStilleAblehnung(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  if (typeof o.hp === "string" && o.hp.length > 0) return true;
  const dauer = Number(o.dauerMs);
  return Number.isFinite(dauer) && dauer >= 0 && dauer < PARTNER_MIN_DAUER_MS;
}

export interface GepruefteAnfrage {
  weg: PartnerWeg;
  rolle: PartnerRolle;
  antworten: Record<string, string>;
  kontakt: PartnerKontakt;
  einwilligung: { erteiltAm: string; version: string; wortlaut: string };
}

export type PruefErgebnis = { ok: true; anfrage: GepruefteAnfrage } | { ok: false; fehler: string };

/**
 * Die ganze Prüfung einer Anfrage, wie sie der Server vornimmt. Nur bekannter
 * Weg, nur ein Bereich, der zu diesem Weg passt, nur die Fragen dieses Wegs, nur bekannte Antworten, gültige
 * Kontaktdaten und die Einwilligung in genau dieser Fassung.
 */
export function pruefePartnerAnfrage(body: unknown, jetzt: string = new Date().toISOString()): PruefErgebnis {
  if (!body || typeof body !== "object") return { ok: false, fehler: "Ungültige Anfrage." };
  const o = body as Record<string, unknown>;
  if (!istPartnerWeg(o.weg)) return { ok: false, fehler: "Bitte wähle aus, wie du mit uns arbeiten möchtest." };
  const weg = o.weg;
  if (!istPartnerRolle(o.rolle) || !rollenFuerWeg(weg).includes(o.rolle)) {
    return { ok: false, fehler: "Bitte wähle aus, aus welchem Bereich du kommst." };
  }
  const rolle = o.rolle;

  const roh = o.antworten && typeof o.antworten === "object" && !Array.isArray(o.antworten) ? (o.antworten as Record<string, unknown>) : {};
  const erlaubt = new Set(PARTNER_FRAGEN[weg].map((f) => f.schluessel));
  if (Object.keys(roh).some((s) => !erlaubt.has(s))) return { ok: false, fehler: "Ungültige Antworten." };
  const antworten: Record<string, string> = {};
  for (const f of PARTNER_FRAGEN[weg]) {
    const wert = roh[f.schluessel];
    if (typeof wert !== "string" || !f.antworten.some((a) => a.id === wert)) {
      return { ok: false, fehler: "Bitte beantworte alle Fragen." };
    }
    antworten[f.schluessel] = wert;
  }

  const k = (o.kontakt && typeof o.kontakt === "object" ? o.kontakt : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const kontakt: PartnerKontakt = {
    vorname: text(k.vorname),
    nachname: text(k.nachname),
    email: text(k.email).toLowerCase(),
    telefon: text(k.telefon),
    firma: text(k.firma),
  };
  const kontaktFehler = Object.values(pruefeKontakt(kontakt));
  if (kontaktFehler.length > 0) return { ok: false, fehler: kontaktFehler[0] as string };

  if (!einwilligungGueltig(o.einwilligung)) return { ok: false, fehler: PARTNER_EINWILLIGUNG_FEHLT };
  const ew = o.einwilligung as Record<string, unknown>;
  const version = ew.version as string;
  const am = ew.am;
  const erteiltAm = typeof am === "string" && !Number.isNaN(Date.parse(am)) ? new Date(am).toISOString() : jetzt;

  return {
    ok: true,
    anfrage: {
      weg,
      rolle,
      antworten,
      kontakt,
      einwilligung: { erteiltAm, version, wortlaut: PARTNER_EINWILLIGUNG_FASSUNGEN[version] },
    },
  };
}

/** Die Quelle in der Bewerberliste. HR filtert danach. */
export const PARTNER_WERDEN_QUELLE = "Partner werden";

/** Was HR in der Spalte „Stelle“ sieht, etwa „Partner werden: Vertriebspartner, Finanzberatung“. */
export function partnerStelleTitel(weg: PartnerWeg, rolle: PartnerRolle): string {
  return weg === "portfolio"
    ? `${PARTNER_WERDEN_QUELLE}: ${PARTNER_WEG_TEXT[weg]}`
    : `${PARTNER_WERDEN_QUELLE}: ${PARTNER_WEG_TEXT[weg]}, ${rolleText(rolle)}`;
}

/**
 * Der Block `meta.partnerWerden` am Bewerber. Die Bewerberakte liest ihn und
 * zeigt Rolle und Antworten. Die Nachfass-Auswahl erkennt daran, dass hier
 * keine Mail hinausgehen soll.
 */
export function partnerWerdenMeta(a: GepruefteAnfrage) {
  return {
    rolle: a.rolle,
    rolleText: rolleText(a.rolle),
    weg: a.weg,
    wegText: PARTNER_WEG_TEXT[a.weg],
    firma: a.kontakt.firma,
    antworten: a.antworten,
    lesbar: lesbareAntworten(a.weg, a.antworten),
  };
}
