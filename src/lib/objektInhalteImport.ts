/**
 * „Objektinhalte einspielen“ (Christian, 16.10.2026): die reine Logik, ohne
 * Datenbank und ohne Speicher. Geschrieben wird erst im Dialog
 * `ObjektInhalteDialog`, nach Bestätigung.
 *
 * TEXTE
 *
 * Die Inhalte aus `src/data/objektInhalte.ts` werden per Adresse dem Objekt
 * zugeordnet (Adresse oder Titel, wie bei „Exposés zuordnen“). Je Feld gibt
 * es eine Vorschau vorher / nachher. Steht in einem Feld ein von Hand
 * gepflegter, abweichender Text, braucht das Objekt einen ausdrücklichen
 * Haken, sonst bleibt es unverändert.
 *
 * BILDER
 *
 * Ordner „Objektbilder Import/<Objekt>/<Unterordner>/<Datei>“:
 *   Objekt     Unterordner „Objekt“: Objektbilder des Objekts, dessen
 *              Adresse im Objektordner steht.
 *   WEnn       Unterordner „WE05“ und ähnlich: die Einheit mit dieser Nummer
 *              im Objekt des Objektordners.
 *   Haus       jeder andere Unterordner (Zossen: „Agnesstraße 29“): Einheit
 *              oder Objekt per Adresse, Regel wie `exposeZuordnen`.
 * Reihenfolge nach Dateiname. Ein Bild gilt als schon da, wenn am Ziel ein
 * Bild mit demselben Ablagenamen hängt; es wird übersprungen.
 */
import { adresseAusDateiname, adressSchluessel, exposeZuordnen, type ZuordnungsObjekt } from "@/lib/exposeZuordnung";
import { anzuzeigendeObjektTexte } from "@/lib/objektTexteKi";
import { HAND_HIGHLIGHTS_SCHLUESSEL, handHighlights } from "@/lib/interneHighlights";
import type { ObjektInhalt } from "@/data/objektInhalte";
import type { ObjektData } from "@/lib/objekteStore";

type Adresse = { strasse: string; hausnummer: string };

/**
 * Nennt der Text diese Straße mit dieser Hausnummer? „38“ passt zu „38 a“,
 * nicht zu „381“. Gleiche Regel wie das nicht exportierte `nenntAdresse` in
 * `exposeZuordnung.ts` (die Datei gehört dem Exposé-Strang).
 */
function nenntAdresse(text: string, a: Adresse): boolean {
  const nummer = a.hausnummer.replace(/[a-z]$/, "");
  return new RegExp(`(?:^| )${a.strasse} ${nummer}(?![0-9])`).test(adressSchluessel(text));
}

function objekteMitAdresse<T extends { adresse: string; titel: string }>(objekte: T[], adresseText: string): T[] {
  const a = adresseAusDateiname(adresseText);
  if (!a) return [];
  return objekte.filter((o) => nenntAdresse(o.adresse, a) || nenntAdresse(o.titel, a));
}

/* ----------------------------------------------------------------- Texte */

export type TextFeld = "kurzbeschreibung" | "standortargumente" | typeof HAND_HIGHLIGHTS_SCHLUESSEL;

export const FELD_NAME: Record<TextFeld, string> = {
  kurzbeschreibung: "Beschreibung",
  standortargumente: "Standort",
  interneHighlightsHand: "Interne Highlights",
};

export interface FeldVorschau {
  feld: TextFeld;
  vorher: string[];
  nachher: string[];
  /** Vorher und nachher sind gleich, es gibt nichts zu schreiben. */
  gleich: boolean;
  /** Vorher steht ein von Hand gepflegter, abweichender Text. Überschreiben nur mit Haken. */
  gepflegt: boolean;
}

export type TextVorschau =
  | { art: "bereit"; inhalt: ObjektInhalt; objektId: string; objektTitel: string; felder: FeldVorschau[]; brauchtHaken: boolean }
  | { art: "unklar"; inhalt: ObjektInhalt; grund: string };

type TextObjekt = Pick<ObjektData, "id" | "titel" | "adresse" | "meta" | "globalDaten">;

const gleicheListe = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function textVorschau(inhalt: ObjektInhalt, objekte: TextObjekt[]): TextVorschau {
  const treffer = objekteMitAdresse(objekte, inhalt.adresse);
  if (treffer.length === 0) return { art: "unklar", inhalt, grund: `Kein Objekt mit der Adresse „${inhalt.adresse}“ gefunden` };
  if (treffer.length > 1) return { art: "unklar", inhalt, grund: `${treffer.length} Objekte mit der Adresse „${inhalt.adresse}“` };
  const o = treffer[0];
  const angezeigt = anzuzeigendeObjektTexte(o);
  const feld = (f: TextFeld, vorher: string[], nachher: string[], vonHand: boolean): FeldVorschau => {
    const gleich = gleicheListe(vorher, nachher);
    return { feld: f, vorher, nachher, gleich, gepflegt: vonHand && !gleich && vorher.length > 0 };
  };
  const felder = [
    feld("kurzbeschreibung", angezeigt.kurzbeschreibung ? [angezeigt.kurzbeschreibung] : [], [inhalt.kurzbeschreibung],
      angezeigt.kurzbeschreibungHerkunft === "gepflegt"),
    feld("standortargumente", angezeigt.standortargumente, inhalt.standortargumente,
      angezeigt.standortargumenteHerkunft === "gepflegt"),
    // Dieses Feld füllt nur der Mensch (oder dieser Import), es gilt immer als gepflegt.
    feld(HAND_HIGHLIGHTS_SCHLUESSEL, handHighlights(o), inhalt.interneHighlights, true),
  ];
  return { art: "bereit", inhalt, objektId: o.id, objektTitel: o.titel, felder, brauchtHaken: felder.some((f) => f.gepflegt) };
}

export function textVorschauAlle(inhalte: ObjektInhalt[], objekte: TextObjekt[]): TextVorschau[] {
  return inhalte.map((i) => textVorschau(i, objekte));
}

/** Was in `meta` geschrieben wird: nur die Felder, die sich ändern. Leer heißt: nichts zu tun. */
export function metaPatch(v: Extract<TextVorschau, { art: "bereit" }>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const f of v.felder) {
    if (f.gleich) continue;
    patch[f.feld] = f.feld === "kurzbeschreibung" ? f.nachher[0] : f.nachher;
  }
  return patch;
}

/** Darf dieses Objekt geschrieben werden? Mit gepflegtem Text nur mit Haken. */
export function darfSchreiben(v: TextVorschau, haken: boolean): boolean {
  if (v.art !== "bereit") return false;
  if (Object.keys(metaPatch(v)).length === 0) return false;
  return !v.brauchtHaken || haken;
}

/* ----------------------------------------------------------------- Bilder */

export interface BildDatei {
  /** Pfad im gewählten Ordner, etwa „Objektbilder Import/Hauffstraße 38/Objekt/01.jpg“. */
  pfad: string;
  name: string;
}

type BildObjekt = ZuordnungsObjekt & {
  bildUrl?: string;
  bilder?: Array<{ url: string }>;
  wohnungen: Array<ZuordnungsObjekt["wohnungen"][number] & { bilder?: Array<{ url: string }> }>;
};

interface BildZielBasis {
  datei: BildDatei;
  objektId: string;
  objektTitel: string;
  /** Ablagename ohne Endung, daran wird „schon da“ erkannt. */
  ablageName: string;
  schonDa: boolean;
  /** Platz in der Galerie des Ziels, ab der Zahl der vorhandenen Bilder. */
  reihenfolge: number;
  /** Erstes neues Bild eines Objekts ohne Titelbild. */
  titelbild: boolean;
}

export type BildZuordnung =
  | (BildZielBasis & { art: "objekt" })
  | (BildZielBasis & { art: "einheit"; wohnungId: string; weNr: string })
  | { art: "unklar"; datei: BildDatei; grund: string }
  | { art: "ignoriert"; datei: BildDatei; grund: string };

export type HochladbaresBild = Extract<BildZuordnung, { art: "objekt" | "einheit" }>;

const BILD_ENDUNG = /\.(jpe?g|png|webp|heic|heif)$/i;
const WE_ORDNER = /^(?:we|whg|wohnung)[\s._-]*\d+[a-z]?$/i;

/** Der Ablagename: klein, ohne Umlaute, nur Buchstaben, Ziffern, Bindestriche; Endung als Teil des Namens. */
export function bildAblageName(name: string): string {
  const s = name.normalize("NFC").toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `import-${s || "bild"}`;
}

/** Der Ablagepfad im Eimer `objekt-medien` (siehe `eimerFuerObjektDatei`), mit der Endung der hochgeladenen Datei. */
export function bildAblagePfad(z: HochladbaresBild, endung: string): string {
  const basis = z.art === "einheit" ? `objekte/${z.objektId}/wohnungen/${z.wohnungId}/bilder` : `objekte/${z.objektId}/bilder`;
  return `${basis}/${z.ablageName}.${endung}`;
}

const hatBild = (bilder: Array<{ url: string }> | undefined, ablageName: string) =>
  (bilder ?? []).some((b) => (b.url || "").includes(`/bilder/${ablageName}.`));

type Roh = { art: "objekt"; o: BildObjekt } | { art: "einheit"; o: BildObjekt; w: BildObjekt["wohnungen"][number] };

function ziel(datei: BildDatei, objekte: BildObjekt[]): Roh | { grund: string } | null {
  const teile = datei.pfad.split("/").filter(Boolean);
  if (teile.some((t) => t.startsWith("_") || t.startsWith("."))) return null;
  if (!BILD_ENDUNG.test(datei.name)) return null;
  const ordner = teile[teile.length - 2] ?? "";
  const objektOrdner = teile[teile.length - 3] ?? "";

  if (/^objekt$/i.test(ordner)) {
    const treffer = objekteMitAdresse(objekte, objektOrdner);
    if (treffer.length === 1) return { art: "objekt", o: treffer[0] };
    return { grund: treffer.length ? `${treffer.length} Objekte zu „${objektOrdner}“` : `Kein Objekt zu „${objektOrdner}“ gefunden` };
  }
  // WE-Ordner und Hausordner laufen über dieselbe Regel wie die Exposés,
  // mit einem gedachten Dateinamen aus den Ordnernamen.
  const gedacht = WE_ORDNER.test(ordner) ? `Exposé ${objektOrdner} ${ordner}.pdf` : `Exposé ${ordner}.pdf`;
  const z = exposeZuordnen({ pfad: gedacht, name: gedacht }, objekte);
  if (z.art === "einheit") {
    const o = objekte.find((x) => x.id === z.objektId)!;
    return { art: "einheit", o, w: o.wohnungen.find((w) => w.id === z.wohnungId)! };
  }
  if (z.art === "objekt") return { art: "objekt", o: objekte.find((x) => x.id === z.objektId)! };
  return { grund: z.art === "unklar" ? z.grund : "Ordner nicht erkannt" };
}

/** Alle Bilder, sortiert nach Pfad (Dateiname mit Zahlen natürlich sortiert). */
export function bilderZuordnen(dateien: BildDatei[], objekte: BildObjekt[]): BildZuordnung[] {
  const sortiert = [...dateien].sort((a, b) => a.pfad.localeCompare(b.pfad, "de", { numeric: true }));
  const naechster = new Map<string, number>();
  const ergebnis: BildZuordnung[] = sortiert.map((datei) => {
    const r = ziel(datei, objekte);
    if (r === null) return { art: "ignoriert", datei, grund: "kein Bild oder Hilfsdatei" };
    if ("grund" in r) return { art: "unklar", datei, grund: r.grund };
    const ablageName = bildAblageName(datei.name);
    const vorhanden = r.art === "einheit" ? r.w.bilder : r.o.bilder;
    const schluessel = r.art === "einheit" ? `w:${r.w.id}` : `o:${r.o.id}`;
    const schonDa = hatBild(vorhanden, ablageName);
    const reihenfolge = naechster.get(schluessel) ?? (vorhanden ?? []).length;
    if (!schonDa) naechster.set(schluessel, reihenfolge + 1);
    const basis = { datei, objektId: r.o.id, objektTitel: r.o.titel, ablageName, schonDa, reihenfolge, titelbild: false };
    return r.art === "einheit" ? { ...basis, art: "einheit", wohnungId: r.w.id, weNr: r.w.weNr } : { ...basis, art: "objekt" };
  });

  // Titelbild: je Objekt ohne Titelbild das erste neue Objektbild, sonst das erste neue Einheitenbild.
  const ohneTitelbild = new Set(objekte.filter((o) => !o.bildUrl && !(o.bilder ?? []).length).map((o) => o.id));
  for (const art of ["objekt", "einheit"] as const) {
    for (const z of ergebnis) {
      if (z.art !== art || z.schonDa || !ohneTitelbild.has(z.objektId)) continue;
      z.titelbild = true;
      ohneTitelbild.delete(z.objektId);
    }
  }
  return ergebnis;
}
