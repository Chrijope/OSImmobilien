/**
 * Die Objektbefunde des Nachtwächters lesen und aufbereiten.
 *
 * Seit Migration 20260924170000 schreibt `nachtpruefung_objektdaten` jede
 * Nacht fünfzehn Befunde zu Unstimmigkeiten in den Objektdaten, jeder mit
 * einem Bereich (OBJ, FIN, AS) und je Objekt einem Treffer in `beispiele`.
 * Diese Datei macht daraus zwei Ansichten:
 *
 *   objektdatenFuerMail()   je Bereich die NEUEN Treffer einzeln und die
 *                           bestehenden nur als Zahl, für die Morgenmail
 *   objektdatenJeObjekt()   alle Treffer je Objekt, für /nachtpruefung
 *
 * Reine Funktionen ohne Importe: Die Edge Function `nachtpruefung-morgenmail`
 * liest sie aus Deno, die Seite `src/pages/Nachtpruefung.tsx` aus dem
 * Browser. So sagen Mail und Seite dasselbe. Geprüft in
 * `src/lib/nachtpruefungObjektdaten.test.ts`.
 *
 * Alles hier ist gegen fehlende Felder gebaut: Ohne die Migration gibt es
 * schlicht keine Objektbefunde, und jede Funktion liefert eine leere Liste.
 *
 * DATENSCHUTZ: Die Treffer tragen nur Objekttitel, Einheitennummern und
 * Feldangaben. Personen stehen weder in der Datenbank noch hier.
 */

/** Präfix aller Objektprüfungen in `nachtpruefung_befunde.pruefung`. */
export const OBJEKTDATEN_PRAEFIX = "objektdaten_";

export type ObjektdatenBereich = "OBJ" | "FIN" | "AS";

/** Die drei Bereiche in der Reihenfolge der Ausgabe, mit Abteilung und Persona. */
export const OBJEKTDATEN_BEREICHE: ReadonlyArray<{
  bereich: ObjektdatenBereich;
  abteilung: string;
  persona: string;
}> = [
  { bereich: "OBJ", abteilung: "Objektmanagement", persona: "Tobias Ammann" },
  { bereich: "FIN", abteilung: "Finanzierung", persona: "Fabian Kortmann" },
  { bereich: "AS", abteilung: "Aftersales", persona: "Sophie Lindner" },
];

/** Überschriften der fünfzehn Regeln, gleichlautend mit dem `_was` der Migration. */
export const OBJEKTDATEN_TITEL: Record<string, string> = {
  objektdaten_adresse: "Adresse unvollständig",
  objektdaten_plz: "PLZ fehlt oder ist nicht fünfstellig",
  objektdaten_titel_plz: "PLZ im Titel weicht vom Feld ab",
  objektdaten_titel_ort: "Ort im Titel weicht vom Feld ab",
  objektdaten_baujahr: "Baujahr fehlt oder ist unplausibel",
  objektdaten_einheit_kerndaten: "Einheiten ohne Fläche oder Kaufpreis",
  objektdaten_einheit_miete: "Einheiten zum Verkauf ohne Miete",
  objektdaten_rendite: "Rendite fehlt oder ist unplausibel",
  objektdaten_preisspanne: "Preisspanne am Objekt passt nicht zu den Einheiten",
  objektdaten_hausgeld: "Hausgeld fehlt",
  objektdaten_ruecklage: "Rücklage fehlt",
  objektdaten_unterlagen: "Pflichtunterlagen für die Bank fehlen",
  objektdaten_verkauft_ohne_miete: "Verkaufte Einheiten ohne Miete",
  objektdaten_vermietet_ohne_miete: "Vermietet, aber ohne Miete",
  objektdaten_verwaltung: "Verwaltung fehlt",
};

/** Wie viele neue Treffer die Mail je Bereich einzeln nennt. Der Rest steht als Zahl da. */
export const MAIL_NEU_HOECHSTENS = 10;

/** Eine Zeile aus `nachtpruefung_befunde`, soweit sie hier gebraucht wird. */
export interface BefundRoh {
  pruefung: string;
  schwere: string;
  anzahl: number;
  meldung: string;
  beispiele: unknown;
  /** Seit Migration 20260924170000. Fehlt die Spalte, ist das Feld undefiniert. */
  bereich?: string | null;
}

/** Ein Treffer, wie ihn `nachtpruefung_objektdaten_eintrag` schreibt, geprüft. */
export interface ObjektdatenTreffer {
  objektId: string;
  titel: string;
  quelle: "investagon" | "crm";
  detail: string;
  einheiten: string[];
  einheitenWeitere: number;
  aktion: string;
  neu: boolean;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function istBereich(v: unknown): v is ObjektdatenBereich {
  return v === "OBJ" || v === "FIN" || v === "AS";
}

/**
 * Gehört der Befund zu den Objektprüfungen?
 *
 * Ein Ausfall einer Regel (Schwere "fehler") zählt NICHT dazu: Der ist ein
 * technischer Fehler und gehört in der Mail zu "Kaputt", nicht in die
 * Objektliste eines Bereichs.
 */
export function istObjektdatenBefund(zeile: Pick<BefundRoh, "pruefung" | "schwere" | "bereich">): boolean {
  return (
    typeof zeile.pruefung === "string" &&
    zeile.pruefung.startsWith(OBJEKTDATEN_PRAEFIX) &&
    istBereich(zeile.bereich) &&
    zeile.schwere !== "fehler"
  );
}

/** Die Treffer eines Befunds, jeder Eintrag geprüft. Unbrauchbares fällt weg. */
export function leseTreffer(beispiele: unknown): ObjektdatenTreffer[] {
  if (!Array.isArray(beispiele)) return [];
  const treffer: ObjektdatenTreffer[] = [];
  for (const roh of beispiele) {
    if (!roh || typeof roh !== "object" || Array.isArray(roh)) continue;
    const e = roh as Record<string, unknown>;
    const objektId = text(e.objekt_id);
    if (!objektId) continue;
    const einheiten = Array.isArray(e.einheiten)
      ? e.einheiten.map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : "")).filter(Boolean)
      : [];
    const weitere = typeof e.einheiten_weitere === "number" && e.einheiten_weitere > 0 ? Math.floor(e.einheiten_weitere) : 0;
    treffer.push({
      objektId,
      titel: text(e.titel) || "Objekt ohne Titel",
      quelle: e.quelle === "investagon" ? "investagon" : "crm",
      detail: text(e.detail),
      einheiten,
      einheitenWeitere: weitere,
      aktion: text(e.aktion),
      neu: e.neu === true,
    });
  }
  return treffer;
}

/**
 * "Einheiten 3, 5, 7 und 2 weitere", oder leer, wenn keine Einheit genannt
 * ist. Bewusst nicht "WE 3": Manche Nummern tragen das "WE" schon selbst.
 */
export function einheitenText(t: Pick<ObjektdatenTreffer, "einheiten" | "einheitenWeitere">): string {
  if (t.einheiten.length === 0) return "";
  const mehrere = t.einheiten.length + t.einheitenWeitere > 1;
  const liste = `${mehrere ? "Einheiten" : "Einheit"} ${t.einheiten.join(", ")}`;
  return t.einheitenWeitere > 0 ? `${liste} und ${t.einheitenWeitere} weitere` : liste;
}

/** Eine Zeile wie "Titel nennt PLZ 82210, im Feld steht 82110 (WE 1, 2)". */
export function trefferText(t: ObjektdatenTreffer): string {
  const einheiten = einheitenText(t);
  return einheiten ? `${t.detail} (${einheiten})` : t.detail;
}

/** Die Adresse der Objektseite im CRM. */
export function objektLink(objektId: string, basis = "https://osimmobilien.netlify.app"): string {
  return `${basis.replace(/\/+$/, "")}/objekte/${encodeURIComponent(objektId)}`;
}

// ── Die Morgenmail ────────────────────────────────────────────────────────

export interface MailObjektdatenZeile {
  /** Objekttitel und Regel. */
  text: string;
  /** Was genau, und was zu tun ist. */
  unter: string;
  href: string;
}

export interface MailObjektdatenBereich {
  bereich: ObjektdatenBereich;
  /** "Objektmanagement (Tobias Ammann)" */
  titel: string;
  /** Die neuen Treffer, höchstens `MAIL_NEU_HOECHSTENS`. */
  neu: MailObjektdatenZeile[];
  /** Neue Treffer, die über die Höchstzahl hinausgehen. */
  neuWeitere: number;
  /** Treffer, die schon beim letzten Lauf da waren. */
  bestehend: number;
  /** Sammelbefunde als ganzer Satz, je einer. */
  sammel: string[];
}

/**
 * Die Objektbefunde eines Laufs für die Morgenmail.
 *
 * Nur Bereiche mit etwas zu sagen kommen vor. Neue Treffer stehen einzeln da,
 * bestehende nur als Zahl: Sonst ginge jeden Morgen dieselbe lange Liste
 * hinaus und würde nicht mehr gelesen.
 */
export function objektdatenFuerMail(zeilen: BefundRoh[], basis?: string): MailObjektdatenBereich[] {
  const ergebnis: MailObjektdatenBereich[] = [];
  for (const { bereich, abteilung, persona } of OBJEKTDATEN_BEREICHE) {
    const befunde = zeilen.filter((z) => istObjektdatenBefund(z) && z.bereich === bereich && z.anzahl > 0);
    const neu: MailObjektdatenZeile[] = [];
    let neuGesamt = 0;
    let bestehend = 0;
    const sammel: string[] = [];
    for (const b of befunde) {
      const treffer = leseTreffer(b.beispiele);
      if (treffer.length === 0) {
        // Ein Sammelbefund: Das Feld wird offenbar gar nicht gepflegt.
        sammel.push(b.meldung);
        continue;
      }
      const regel = OBJEKTDATEN_TITEL[b.pruefung] ?? b.pruefung;
      for (const t of treffer) {
        if (!t.neu) {
          bestehend++;
          continue;
        }
        neuGesamt++;
        if (neu.length < MAIL_NEU_HOECHSTENS) {
          neu.push({
            text: `${t.titel}: ${regel}`,
            unter: [trefferText(t), t.aktion].filter(Boolean).join(". "),
            href: objektLink(t.objektId, basis),
          });
        }
      }
    }
    if (neuGesamt === 0 && bestehend === 0 && sammel.length === 0) continue;
    ergebnis.push({
      bereich,
      titel: `${abteilung} (${persona})`,
      neu,
      neuWeitere: neuGesamt - neu.length,
      bestehend,
      sammel,
    });
  }
  return ergebnis;
}

/** Gibt es in der Mail-Aufbereitung mindestens einen neuen Treffer? */
export function hatNeueObjektdaten(bereiche: MailObjektdatenBereich[]): boolean {
  return bereiche.some((b) => b.neu.length > 0 || b.neuWeitere > 0);
}

// ── Die Seite /nachtpruefung ──────────────────────────────────────────────

export interface ObjektPunkt {
  pruefung: string;
  regel: string;
  bereich: ObjektdatenBereich;
  schwere: string;
  text: string;
  aktion: string;
  neu: boolean;
}

export interface ObjektMitBefunden {
  objektId: string;
  titel: string;
  quelle: "investagon" | "crm";
  punkte: ObjektPunkt[];
  neu: number;
}

const SCHWERE_RANG: Record<string, number> = { fehler: 0, warnung: 1, hinweis: 2 };

/**
 * Alle Treffer eines Laufs je Objekt: Objekte mit neuen Punkten zuerst, dann
 * nach Zahl der Punkte, dann nach Titel. In jedem Objekt Warnungen vor
 * Hinweisen, dann in der Reihenfolge OBJ, FIN, AS.
 */
export function objektdatenJeObjekt(zeilen: BefundRoh[]): ObjektMitBefunden[] {
  const je = new Map<string, ObjektMitBefunden>();
  const bereichRang = (b: ObjektdatenBereich) => OBJEKTDATEN_BEREICHE.findIndex((x) => x.bereich === b);
  for (const b of zeilen) {
    if (!istObjektdatenBefund(b)) continue;
    const bereich = b.bereich as ObjektdatenBereich;
    for (const t of leseTreffer(b.beispiele)) {
      let objekt = je.get(t.objektId);
      if (!objekt) {
        objekt = { objektId: t.objektId, titel: t.titel, quelle: t.quelle, punkte: [], neu: 0 };
        je.set(t.objektId, objekt);
      }
      objekt.punkte.push({
        pruefung: b.pruefung,
        regel: OBJEKTDATEN_TITEL[b.pruefung] ?? b.pruefung,
        bereich,
        schwere: b.schwere,
        text: trefferText(t),
        aktion: t.aktion,
        neu: t.neu,
      });
      if (t.neu) objekt.neu++;
    }
  }
  const liste = [...je.values()];
  for (const o of liste) {
    o.punkte.sort(
      (a, b) =>
        (SCHWERE_RANG[a.schwere] ?? 3) - (SCHWERE_RANG[b.schwere] ?? 3) ||
        bereichRang(a.bereich) - bereichRang(b.bereich) ||
        a.regel.localeCompare(b.regel, "de"),
    );
  }
  return liste.sort(
    (a, b) =>
      Number(b.neu > 0) - Number(a.neu > 0) ||
      b.punkte.length - a.punkte.length ||
      a.titel.localeCompare(b.titel, "de", { numeric: true }),
  );
}

/** Die Sammelbefunde eines Laufs, je Bereich. Sie haben keine Einzelliste. */
export function objektdatenSammelbefunde(zeilen: BefundRoh[]): Array<{ bereich: ObjektdatenBereich; regel: string; meldung: string }> {
  return zeilen
    .filter((z) => istObjektdatenBefund(z) && z.anzahl > 0 && leseTreffer(z.beispiele).length === 0)
    .map((z) => ({
      bereich: z.bereich as ObjektdatenBereich,
      regel: OBJEKTDATEN_TITEL[z.pruefung] ?? z.pruefung,
      meldung: z.meldung,
    }));
}
