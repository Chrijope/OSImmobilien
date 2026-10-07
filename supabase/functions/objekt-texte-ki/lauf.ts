/**
 * Der Lauf für ein einzelnes Objekt: messen, Tatsachen sammeln, Unterlagen
 * laden, das Modell fragen, prüfen, ablegen.
 *
 * WARUM EINE EIGENE DATEI
 *
 * `index.ts` startet beim Laden sofort einen Server (`Deno.serve`) und lässt
 * sich deshalb in keinem Test laden. Hier steht der Lauf ohne Server, und
 * alles, was nach außen geht, lässt sich austauschen: der Abruf beim Gateway
 * (`abruf`), die Messung der Umgebung (`messe`), der Schlüssel. So prüft
 * `src/lib/objektTexteLauf.test.ts` das Verhalten selbst, nicht nur den
 * Quelltext: den zweiten Versuch ohne Unterlagen, den Weiterlauf nach einer
 * gescheiterten Messung, das Überspringen einer unlesbaren Unterlage und den
 * Fehlervermerk am Objekt.
 *
 * Deshalb steht hier nichts, was nur Deno kennt: kein `Deno.env`, kein
 * Import über eine Adresse. Den Schlüssel reicht `index.ts` herein.
 */

import {
  baueLeereObjektTexte,
  baueObjektTexte,
  genugQuellen,
  letztenFehlerInMeta,
  objektQuellen,
  objektTexteAnweisung,
  objektTexteInMeta,
  OBJEKT_TEXTE_WERKZEUG,
  pruefeObjektTexte,
  standortQuellen,
  texteInGepflegteFelder,
  type ObjektTexte,
  type ObjektTexteQuellen,
  type UmgebungStand,
} from "../_shared/objekt-texte.ts";
import {
  genauigkeitsRang,
  type Genauigkeit,
  istGemessen,
  koordinatenAusInvestagon,
  koordinatenInMeta,
  type LageTreffer,
  messeStandort,
  standortAdresseGeaendert,
  standortInMeta,
} from "../_shared/standort-messung.ts";
import {
  beginntWiePdf,
  dokumentAblage as ablage,
  investagonKategorien,
  MAX_BYTES_GESAMT,
  MAX_BYTES_JE_UNTERLAGE,
  MAX_UNTERLAGEN,
  ordneUnterlagen,
  type UnterlagenKandidat,
} from "../_shared/objekt-texte-unterlagen.ts";
import {
  AUSZUG_SCHEMA_FASSUNG,
  type Einordnung,
  FAKTENAUSZUG_MODELL,
  gespeicherteEinordnung,
  NUR_EINORDNUNG,
  unterlageEinordnen,
  GESPERRT_ART,
  vorabGesperrt,
  vorabRot,
} from "../_shared/lotse-faktenauszug.ts";
import { ablageKennung, auszugSchluessel, auszugVorsilbe, dokumentVersionen, einordnungMerken, sha256Hex } from "../_shared/lotse-unterlagen.ts";
import {
  baueObjektTexteEn,
  OBJEKT_TEXTE_EN_SYSTEM,
  OBJEKT_TEXTE_EN_WERKZEUG,
  objektTexteEnInMeta,
  type ObjektTexteEn,
  type ObjektTexteQuelle,
  pruefeUebersetzung,
  uebersetzungsQuelle,
  uebersetzungsAuftrag,
} from "../_shared/objekt-texte-en.ts";
import {
  findeMarktStandorte,
  marktQuellen,
  waehleMarktStandort,
  type MarktArbeitgeber,
  type MarktKennzahl,
  type MarktStandort,
} from "../_shared/objekt-texte-markt.ts";

export const MODELL = "google/gemini-2.5-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/**
 * Höchstwartezeit für den KI-Aufruf mit Unterlagen.
 *
 * Meist antwortet das Modell in zehn bis dreißig Sekunden, mit mehreren PDFs
 * eher am oberen Ende. Die Grenze schützt die Laufzeit der Function: Ein
 * hängender Aufruf darf sie nicht allein aufbrauchen, der zweite Versuch ohne
 * Unterlagen braucht auch noch Zeit.
 */
export const KI_FRIST_MS = 45_000;

/** Höchstwartezeit für den zweiten Versuch ohne Unterlagen. Nur Text geht schneller. */
export const KI_FRIST_OHNE_UNTERLAGEN_MS = 30_000;

/** Unter so viel Restzeit beginnt kein KI-Aufruf mehr, er käme ohnehin nicht zurück. */
export const KI_MINDESTZEIT_MS = 12_000;

/**
 * Höchstdauer der Messung, samt aller Rückfälle und Wiederholungen.
 *
 * Seit dem 23.09.2026 abends versucht die Messung mehr (Nominatim,
 * Postleitzahl, Ortsmitte, zweiter Overpass-Versuch, erweiterter Umkreis).
 * Das darf den KI-Aufruf nicht verdrängen: Die Messung endet spätestens
 * `KI_RESERVE_MS` vor dem Ende des Zeitbudgets.
 */
export const MESS_BUDGET_MS = 50_000;

/** So viel Zeit bleibt nach der Messung mindestens für Unterlagen und KI. */
export const KI_RESERVE_MS = KI_FRIST_MS + 15_000;

/** Unter so viel Messzeit wird gar nicht erst gemessen. */
export const MESS_MINDESTZEIT_MS = 8_000;

/**
 * Das Zeitbudget eines Aufrufs, vom Eingang der Anfrage an.
 *
 * Eine Edge Function hat höchstens 150 Sekunden, dann bricht die Plattform
 * ab, und zwar ohne Antwort und ohne Vermerk. Im schlimmsten Fall braucht ein
 * Objekt Adresssuche (8 s), Overpass (25 s), Unterlagen, KI mit Unterlagen
 * (45 s) und KI ohne (30 s). Mit 140 Sekunden Budget wird der zweite Versuch
 * nur gestartet, wenn er noch hineinpasst.
 */
export const ZEITBUDGET_MS = 140_000;

/**
 * Höchstwartezeit für die Übersetzung ins Englische (Plan Kundensprache,
 * Entscheidung 12). Nur Text, ohne Unterlagen, deshalb kurz. Reicht die
 * Restzeit nicht, entsteht die englische Fassung beim nächsten Aufruf mit
 * `nurEnglisch`; der deutsche Text ist davon nie betroffen.
 */
export const UEBERSETZUNG_FRIST_MS = 25_000;

/** Unter so viel Restzeit beginnt keine Übersetzung mehr. */
export const UEBERSETZUNG_MINDESTZEIT_MS = 8_000;

/**
 * Der Datenbank-Client, mit Nutzertoken oder Dienstrolle.
 *
 * Bewusst ohne den Typ aus supabase-js: Der käme über eine Adresse, und die
 * kennen die Tests im Browser-Teil nicht. Gelesen wird ohnehin nur roh.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore no-explicit-any
export type Db = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Was von außen hereinkommt und sich im Test austauschen lässt. */
export interface LaufUmgebung {
  /** Der Schlüssel für den Lovable AI Gateway (`LOVABLE_API_KEY`). Leer heißt: nicht eingerichtet. */
  schluessel: string;
  /**
   * Womit `meta` am Objekt geschrieben wird. Im normalen Aufruf die
   * Dienstrolle, nachdem der Nutzer das Objekt mit seinem Token lesen konnte:
   * Seit dem 30.09.2026 schreiben nur Admin und Inhaber direkt in `objekte`,
   * erzeugen dürfen die Texte aber alle, die das Objekt sehen. Ohne Angabe
   * schreibt `db` (Sammelmodus, Tests).
   */
  schreibDb?: Db;
  /** Bis zu diesem Zeitpunkt (ms) muss alles fertig sein, siehe `ZEITBUDGET_MS`. */
  frist: number;
  /** Der Abruf beim Gateway. In Betrieb `fetch`. */
  abruf?: typeof fetch;
  /** Die Messung der Umgebung. In Betrieb `messeStandort`. */
  messe?: typeof messeStandort;
  /**
   * Die Einordnung einer Unterlage vor dem Anhängen (LOTSE-R6-003). In
   * Betrieb `unterlageEinordnen` über denselben Gateway; die Tests setzen sie
   * fest, damit sie keine Antwort des Modells verbraucht.
   */
  einordnen?: (pdf: string) => Promise<Einordnung>;
  /**
   * Die Umgebung auch dann neu messen, wenn schon eine passende Messung
   * vorliegt. Nur für Admin und Inhaber, über den Knopf „Erneut versuchen“
   * an der Karte; `index.ts` prüft die Rolle.
   */
  neuMessen?: boolean;
  /**
   * Zusätzlich die englische Fassung erzeugen und unter
   * `meta.objekttexteKiEn` ablegen. `index.ts` setzt das immer; ohne Angabe
   * bleibt es beim deutschen Lauf, so prüfen die Tests den Lauf für sich.
   */
  englisch?: boolean;
}

const alsObjekt =(v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function alsBase64(bytes: Uint8Array): string {
  let binaer = "";
  const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + block));
  }
  return btoa(binaer);
}

/** Das `meta` eines Objekts frisch aus der Datenbank, sonst der mitgegebene Stand. */
/**
 * `meta` am Objekt schreiben, mit `schreibDb`, sonst mit `db`. Geschrieben
 * wird immer das frisch gelesene `meta` samt den eigenen Schlüsseln, der Rest
 * bleibt unverändert.
 */
function metaSchreiben(db: Db, schreibDb: Db | undefined, objektId: string, metaNeu: Record<string, unknown>) {
  return (schreibDb ?? db).from("objekte").update({ meta: metaNeu } as never).eq("id", objektId);
}

export async function frischesMeta(db: Db, objektId: string, ersatz: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await db.from("objekte").select("meta").eq("id", objektId).maybeSingle();
  return ((data as { meta?: Record<string, unknown> | null } | null)?.meta || ersatz) as Record<string, unknown>;
}

/** Was ein Lauf für ein Objekt ergeben hat. */
export type Ergebnis =
  | { art: "erzeugt"; texte: ObjektTexte; gespeichert: boolean }
  | { art: "vermerk"; texte: ObjektTexte; gespeichert: boolean }
  | { art: "fehler"; status: number; meldung: string; zusatz?: Record<string, unknown> };

/**
 * Was ein einzelner KI-Aufruf ergeben hat.
 *
 * Bewusst eine flache Form statt einer Vereinigung über `ok`: Der Browser-Teil
 * prüft ohne `strict`, und dort engt TypeScript eine solche Vereinigung nicht
 * ein (dieselbe Lage wie in `standort-messung.ts`).
 */
type KiVersuch = { ok: boolean; roh?: unknown; status: number; meldung: string };

/**
 * Das Wichtigste aus einer Ablehnung des Gateways, kurz genug für eine Meldung.
 *
 * Der Gateway antwortet wie die OpenAI-Schnittstelle mit
 * `{ error: { message } }`. Steht dort nichts Lesbares, bleibt der Anfang
 * des Rumpfs, ohne HTML.
 */
function gatewayGrund(rumpf: string): string {
  try {
    const gelesen = JSON.parse(rumpf);
    const fehler = gelesen?.error;
    const text = typeof fehler === "string" ? fehler : typeof fehler?.message === "string" ? fehler.message : gelesen?.message;
    if (typeof text === "string" && text.trim()) return text.trim().slice(0, 200);
  } catch {
    // Kein JSON, dann der Rumpf selbst.
  }
  const roh = rumpf.trim();
  return roh.startsWith("<") ? "" : roh.slice(0, 200);
}

/** Das Modell einmal fragen, mit fester Höchstdauer. */
async function frageModell(
  schluessel: string,
  quellen: ObjektTexteQuellen,
  anhaenge: Array<{ name: string; datenAdresse: string }>,
  fristMs: number,
  abruf: typeof fetch,
): Promise<KiVersuch> {
  const inhalt: Array<Record<string, unknown>> = anhaenge.map((a) => ({
    type: "image_url",
    image_url: { url: a.datenAdresse },
  }));
  inhalt.push({ type: "text", text: objektTexteAnweisung(quellen) });

  const steuerung = new AbortController();
  const uhr = setTimeout(() => steuerung.abort(), fristMs);
  try {
    const kiAntwort = await abruf(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${schluessel}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELL,
        messages: [
          {
            role: "system",
            content:
              "Du schreibst verkaufsstarke, aber ehrliche Texte zu Immobilien für Kapitalanleger. Du hältst dich streng an die genannten Tatsachen und Unterlagen und erfindest nichts. Du machst keine Zusagen zu Rendite, Wertsteigerung, Mieteinnahmen oder Steuern und sagst keine Entwicklung voraus. Für die internen Highlights übernimmst du belegte Zahlen genau, ohne zu runden oder zu schätzen. Du antwortest ausschließlich über den Werkzeugaufruf.",
          },
          { role: "user", content: inhalt },
        ],
        tools: [OBJEKT_TEXTE_WERKZEUG],
        tool_choice: { type: "function", function: { name: "objekt_texte" } },
      }),
      signal: steuerung.signal,
    });

    if (!kiAntwort.ok) {
      const rumpf = await kiAntwort.text().catch(() => "");
      // Für die Logs in Lovable: Status, Zahl der Anhänge und der Anfang der Antwort.
      console.error(
        `objekt-texte-ki: Gateway ${kiAntwort.status}, ${anhaenge.length} Unterlagen, Antwort:`,
        rumpf.slice(0, 800),
      );
      const grund = gatewayGrund(rumpf);
      if (kiAntwort.status === 429) {
        return { ok: false, status: 429, meldung: "Die KI-Schnittstelle bremst gerade. Bitte in einer Minute erneut versuchen." };
      }
      if (kiAntwort.status === 402) {
        return { ok: false, status: 402, meldung: "Das KI-Guthaben ist aufgebraucht." };
      }
      return {
        ok: false,
        status: 502,
        meldung: `Die KI-Schnittstelle hat die Anfrage abgelehnt (Status ${kiAntwort.status}${grund ? `: ${grund}` : ""}).`,
      };
    }

    const daten = (await kiAntwort.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: unknown } }> } }>;
    } | null;
    const werkzeug = daten?.choices?.[0]?.message?.tool_calls?.[0];
    if (!werkzeug?.function?.arguments) {
      console.error("objekt-texte-ki: keine Werkzeugantwort", JSON.stringify(daten).slice(0, 800));
      return { ok: false, status: 502, meldung: "Die KI hat keine verwertbare Antwort geliefert." };
    }
    try {
      const roh = typeof werkzeug.function.arguments === "string"
        ? JSON.parse(werkzeug.function.arguments)
        : werkzeug.function.arguments;
      return { ok: true, roh, status: 200, meldung: "" };
    } catch (e) {
      console.error("objekt-texte-ki: Antwort nicht lesbar", (e as Error).message);
      return { ok: false, status: 502, meldung: "Die KI-Antwort war nicht lesbar." };
    }
  } catch (e) {
    const abgelaufen = steuerung.signal.aborted;
    console.error("objekt-texte-ki: KI-Aufruf", abgelaufen ? "Zeitgrenze" : e);
    return abgelaufen
      ? { ok: false, status: 504, meldung: `Die KI hat nicht innerhalb von ${Math.round(fristMs / 1000)} Sekunden geantwortet.` }
      : { ok: false, status: 502, meldung: `Die KI-Schnittstelle war nicht erreichbar (${e instanceof Error ? e.message : "unbekannt"}).` };
  } finally {
    clearTimeout(uhr);
  }
}

/**
 * Die automatisch erzeugten Texte ins Englische übersetzen lassen.
 *
 * Plan Kundensprache, Entscheidung 12. Nur der Wortlaut geht an das Modell,
 * keine Unterlagen und keine Personendaten. Jeder Fehler heißt: keine
 * englische Fassung, der Grund steht in den Logs. Der deutsche Text ist davon
 * nie betroffen.
 */
export async function uebersetzeObjektTexte(
  schluessel: string,
  quelle: ObjektTexteQuelle,
  fristMs: number,
  abruf: typeof fetch,
  jetzt = new Date(),
): Promise<ObjektTexteEn | undefined> {
  const hatText = !!quelle.kurzbeschreibung || quelle.standortargumente.length > 0 || quelle.marktargumente.length > 0;
  if (!hatText || !schluessel) return undefined;
  const steuerung = new AbortController();
  const uhr = setTimeout(() => steuerung.abort(), fristMs);
  try {
    const antwort = await abruf(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${schluessel}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELL,
        messages: [
          { role: "system", content: OBJEKT_TEXTE_EN_SYSTEM },
          { role: "user", content: [{ type: "text", text: uebersetzungsAuftrag(quelle) }] },
        ],
        tools: [OBJEKT_TEXTE_EN_WERKZEUG],
        tool_choice: { type: "function", function: { name: "objekt_texte_englisch" } },
      }),
      signal: steuerung.signal,
    });
    if (!antwort.ok) {
      const rumpf = await antwort.text().catch(() => "");
      console.warn(`objekt-texte-ki: Übersetzung, Gateway ${antwort.status}`, gatewayGrund(rumpf));
      return undefined;
    }
    const daten = (await antwort.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: unknown } }> } }>;
    } | null;
    const argumente = daten?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const roh = typeof argumente === "string" ? JSON.parse(argumente) : argumente;
    const geprueft = pruefeUebersetzung(roh, quelle);
    if (!geprueft.ok || !geprueft.texte) {
      console.warn("objekt-texte-ki: Übersetzung verworfen", geprueft.grund);
      return undefined;
    }
    return baueObjektTexteEn(quelle, geprueft.texte, MODELL, jetzt);
  } catch (e) {
    console.warn("objekt-texte-ki: Übersetzung", steuerung.signal.aborted ? "Zeitgrenze" : e);
    return undefined;
  } finally {
    clearTimeout(uhr);
  }
}

/**
 * Nur die englische Fassung zu einem vorhandenen Stand nachholen, ohne die
 * deutschen Texte neu zu erzeugen (Aufruf mit `nurEnglisch`). Für Objekte,
 * deren Texte vor dem 25.09.2026 entstanden.
 */
export async function englischNachholen(
  db: Db,
  objekt: Record<string, unknown>,
  texte: ObjektTexte,
  optionen: LaufUmgebung,
): Promise<{ englisch?: ObjektTexteEn; gespeichert: boolean }> {
  const objektId = String(objekt.id || "");
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const restzeit = optionen.frist - Date.now();
  if (restzeit < UEBERSETZUNG_MINDESTZEIT_MS) return { gespeichert: false };
  const englisch = await uebersetzeObjektTexte(
    optionen.schluessel,
    uebersetzungsQuelle(meta, texte),
    Math.min(UEBERSETZUNG_FRIST_MS, restzeit - 3_000),
    optionen.abruf ?? fetch,
  );
  if (!englisch) return { gespeichert: false };
  const metaNeu = objektTexteEnInMeta(await frischesMeta(db, objektId, meta), englisch);
  const { error } = await metaSchreiben(db, optionen.schreibDb, objektId, metaNeu);
  if (error) console.warn("objekt-texte-ki: englische Fassung nicht gespeichert", error.message);
  return { englisch, gespeichert: !error };
}

/**
 * Einen gescheiterten Lauf am Objekt vermerken.
 *
 * Nur `meta.objekttexteKi.letzterFehler`, ein vorhandener Text bleibt. Scheitert
 * auch das, steht es wenigstens in den Logs; der Aufruf selbst meldet den
 * Fehler ohnehin.
 */
export async function vermerkeFehler(
  db: Db,
  objektId: string,
  ersatz: Record<string, unknown>,
  fehler: { meldung: string; status: number },
  schreibDb?: Db,
): Promise<void> {
  try {
    const metaNeu = letztenFehlerInMeta(await frischesMeta(db, objektId, ersatz), {
      grund: fehler.meldung,
      status: fehler.status,
    });
    const { error } = await metaSchreiben(db, schreibDb, objektId, metaNeu);
    if (error) console.warn("objekt-texte-ki: Fehlervermerk nicht gespeichert", error.message);
  } catch (e) {
    console.warn("objekt-texte-ki: Fehlervermerk nicht gespeichert", e);
  }
}

/**
 * Der eigentliche Lauf für ein Objekt, für beide Wege derselbe.
 *
 * `db` ist im normalen Aufruf der Client mit dem Nutzertoken, im Sammelmodus
 * der mit der Dienstrolle. `frist` ist der Zeitpunkt, bis zu dem alles fertig
 * sein muss (`ZEITBUDGET_MS`), der Rest steht in `LaufUmgebung`.
 *
 * Nichts außer dem KI-Aufruf selbst kann den Lauf beenden: Eine gescheiterte
 * Messung heißt „ohne Umgebungsdaten weiter“ (mit Vermerk `umgebung`, nicht
 * als Beanstandung), eine nicht lesbare Unterlage wird übersprungen, fehlende
 * Marktdaten heißen „keine Marktargumente“.
 */
export async function erzeugeFuerObjekt(
  db: Db,
  objekt: Record<string, unknown>,
  optionen: { vorhanden?: ObjektTexte } & LaufUmgebung,
): Promise<Ergebnis> {
  const objektId = String(objekt.id || "");
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  /** Was am Ende als Beanstandung am Text steht. */
  const hinweise: string[] = [];

  // ── 1. Die Umgebung, gemessen und nicht erfunden ──
  const { analyse, umgebung } = await sorgeFuerMessung(db, objekt, meta, optionen);

  // ── 2. Die Einheiten, nur die Pfade, die gebraucht werden ──
  // Das ganze `meta` jeder Wohnung trüge den kompletten Investagon-Datensatz
  // mit, bei vierzig Einheiten ein Vielfaches dessen, was hier gelesen wird.
  // Die Dateiliste braucht die Auswahl der Unterlagen für die Kategorien.
  const { data: wohnungen, error: wohnungsFehler } = await db
    .from("wohnungen")
    .select(
      "id, we_nr, groesse, zimmer, vermietet, sanierungsjahr:meta->sanierungsjahr, renovierungsjahr:meta->investagonRaw->object_renovation_year, investagon_dateien:meta->investagonRaw->files",
    )
    .eq("objekt_id", objektId);
  if (wohnungsFehler) console.warn("objekt-texte-ki: Einheiten nicht lesbar", wohnungsFehler.message);
  const einheiten = (wohnungen || []) as Array<Record<string, unknown>>;

  // ── 3. Marktdaten und Unterlagen, beide dürfen fehlen ──
  const markt = await leseMarktdaten(db, objekt, analyse);
  if (markt.hinweis) hinweise.push(markt.hinweis);
  const einordnen = optionen.einordnen
    ?? ((pdf: string) => unterlageEinordnen(optionen.schluessel, { pdf }, optionen.abruf ?? fetch));
  const unterlagen = await ladeUnterlagen(db, objekt, einheiten, einordnen);
  if (unterlagen.nichtGelesen.length > 0) {
    hinweise.push(`Nicht mitgelesen wurden: ${unterlagen.nichtGelesen.join(", ")}.`);
  }
  const anhaenge = unterlagen.anhaenge;

  let quellen: ObjektTexteQuellen = {
    objekt: objektQuellen(objekt, einheiten),
    standort: standortQuellen(analyse),
    markt: markt.zeilen,
    unterlagen: anhaenge.map((a) => a.name),
  };

  const grundlage = genugQuellen(quellen);
  if (!grundlage.ok) {
    /*
     * Ein Vermerk statt eines Fehlschlags, aber nur wenn noch nichts da ist.
     *
     * Ohne ihn liefe der selbsttätige Start bei jedem Seitenaufruf erneut an
     * und käme jedes Mal bis hierher. Ein vorhandener Stand wird dabei
     * ausdrücklich nicht überschrieben: Sonst löschte ein Knopfdruck bei
     * fehlender Grundlage einen brauchbaren Text weg.
     */
    if (!optionen.vorhanden) {
      const vermerk = baueLeereObjektTexte({ grund: grundlage.grund, quellen, umgebung });
      const metaNeu = objektTexteInMeta(await frischesMeta(db, objektId, meta), vermerk);
      const { error: vermerkFehler } = await metaSchreiben(db, optionen.schreibDb, objektId, metaNeu);
      return { art: "vermerk", texte: vermerk, gespeichert: !vermerkFehler };
    }
    return { art: "fehler", status: 422, meldung: grundlage.grund, zusatz: { quellen: quellen.objekt } };
  }

  const LOVABLE_API_KEY = optionen.schluessel;
  if (!LOVABLE_API_KEY) {
    console.error("objekt-texte-ki: LOVABLE_API_KEY fehlt");
    return { art: "fehler", status: 500, meldung: "Die KI-Anbindung ist nicht eingerichtet (LOVABLE_API_KEY fehlt)." };
  }

  // ── 4. Das Modell fragen, notfalls ein zweites Mal ohne Unterlagen ──
  const restzeit = () => optionen.frist - Date.now();
  if (restzeit() < KI_MINDESTZEIT_MS) {
    return { art: "fehler", status: 504, meldung: "Für den KI-Aufruf blieb keine Zeit mehr. Bitte erneut versuchen." };
  }
  const abruf = optionen.abruf ?? fetch;
  let versuch = await frageModell(LOVABLE_API_KEY, quellen, anhaenge, Math.min(KI_FRIST_MS, restzeit() - 3_000), abruf);
  if (!versuch.ok && anhaenge.length > 0 && versuch.status !== 429 && versuch.status !== 402) {
    /*
     * Ob der Gateway PDFs als `image_url` annimmt und wie groß eine Anfrage
     * sein darf, ist nicht dokumentiert. Andere Functions im Projekt schicken
     * PDFs genauso, aber einzeln. Scheitert es hier, soll der Text trotzdem
     * entstehen: ohne Unterlagen, aus den übrigen Tatsachen, mit Vermerk.
     */
    const ersterGrund = versuch.meldung;
    if (restzeit() >= KI_MINDESTZEIT_MS) {
      console.warn(`objekt-texte-ki: Aufruf mit ${anhaenge.length} Unterlagen gescheitert (${ersterGrund}), zweiter Versuch ohne`);
      quellen = { ...quellen, unterlagen: [] };
      anhaenge.length = 0;
      versuch = await frageModell(
        LOVABLE_API_KEY,
        quellen,
        [],
        Math.min(KI_FRIST_OHNE_UNTERLAGEN_MS, restzeit() - 3_000),
        abruf,
      );
      if (versuch.ok) {
        hinweise.push(`Die Unterlagen ließen sich nicht mitlesen (${ersterGrund}). Der Text entstand ohne sie.`);
      }
    }
  }
  if (!versuch.ok) return { art: "fehler", status: versuch.status, meldung: versuch.meldung };

  // ── 5. Prüfen und ablegen ──
  const geprueft = pruefeObjektTexte(versuch.roh, quellen);
  geprueft.beanstandungen.push(...hinweise);
  const texte = baueObjektTexte({ geprueft, quellen, modell: MODELL, umgebung });

  // ── 6. Die englische Fassung (Plan Kundensprache, Entscheidung 12) ──
  // Nur mit `englisch`, und nur wenn die Zeit reicht. Scheitert sie, bleibt
  // der deutsche Text, und die Seite zeigt ihn mit Hinweis.
  let englisch: ObjektTexteEn | undefined;
  if (optionen.englisch && restzeit() >= UEBERSETZUNG_MINDESTZEIT_MS) {
    englisch = await uebersetzeObjektTexte(
      LOVABLE_API_KEY,
      uebersetzungsQuelle(meta, texte),
      Math.min(UEBERSETZUNG_FRIST_MS, restzeit() - 3_000),
      abruf,
    );
  }

  // Das `meta` unmittelbar vor dem Schreiben noch einmal lesen. In Lovable
  // wird parallel gearbeitet, und zwischen dem ersten Lesen und hier liegt
  // ein kompletter KI-Aufruf. Geschrieben werden nur die eigenen Schlüssel:
  // der Stand selbst und die gepflegten Felder, soweit sie leer sind oder den
  // vorigen automatischen Text tragen. Nur so steht der Text auch im
  // öffentlichen Exposé.
  const metaVorher = await frischesMeta(db, objektId, meta);
  let metaNeu = objektTexteInMeta(texteInGepflegteFelder(metaVorher, texte), texte);
  // Eine ältere Übersetzung passt nicht mehr zum neuen Wortlaut: ersetzen
  // oder, ohne neue, entfernen. Ohne `englisch` bleibt `meta` hier unberührt.
  if (optionen.englisch) metaNeu = objektTexteEnInMeta(metaNeu, englisch);
  const { error: schreibFehler } = await metaSchreiben(db, optionen.schreibDb, objektId, metaNeu);
  if (schreibFehler) {
    console.error("objekt-texte-ki: Speichern fehlgeschlagen", schreibFehler.message);
    return { art: "erzeugt", texte, gespeichert: false };
  }
  return { art: "erzeugt", texte, gespeichert: true };
}

/** Trägt die Analyse die Adresse ihrer Messung? Analysen vor dem 23.09.2026 abends nicht. */
function hatGemesseneAdresse(analyse: unknown): boolean {
  const g = alsObjekt(analyse).gemessene_adresse;
  return !!g && typeof g === "object" && !Array.isArray(g);
}

/** Der Vermerk zu einer gemessenen Analyse. */
function umgebungAusAnalyse(analyse: unknown): UmgebungStand {
  const a = alsObjekt(analyse);
  const genauigkeit = typeof a.genauigkeit === "string" ? a.genauigkeit : "";
  return {
    gemessen: true,
    ...(["adresse", "strasse", "plz", "ort"].includes(genauigkeit) ? { genauigkeit: genauigkeit as Genauigkeit } : {}),
    ...(typeof a.gemessen_am === "string" ? { gemessenAm: a.gemessen_am } : {}),
  };
}

/**
 * Die Umgebung messen, falls nötig, und alles Gefundene gleich ablegen.
 *
 * Christians Entscheidung vom 23.09.2026: Eine gemessene Analyse gilt
 * dauerhaft. Gemessen wird nur, wenn keine vorliegt, wenn sie nicht zur
 * heutigen Adresse passt (`standortAdresseGeaendert`, das gilt auch für eine
 * Analyse ohne `gemessene_adresse`) oder wenn Admin oder Inhaber ausdrücklich neu
 * messen lassen. Eine ältere gemessene Analyse bleibt der Rückfall, wenn die
 * neue Messung scheitert. Beim ausdrücklichen Neumessen derselben Adresse
 * bleibt sie auch dann stehen, wenn die neue nur gröber gelingt (etwa ab der
 * Postleitzahl statt ab dem Haus).
 *
 * Abgelegt wird sofort, nicht erst mit den Texten: die Analyse unter
 * `meta.standortanalyse` und die Koordinate des Hauses unter
 * `meta.koordinaten`, die Karte im Exposé liest beides. Die Koordinate auch
 * dann, wenn danach Overpass ausfällt. Eine Koordinate aus Investagon hat
 * Vorrang: Sie wird nicht überschrieben, und gemessen wird ab ihr.
 *
 * Scheitert die Messung, ist das kein Fehler des Laufs und keine Beanstandung
 * am Text. Der Grund steht im Vermerk `umgebung`, den nur Admin und Inhaber
 * an der Karte sehen.
 */
async function sorgeFuerMessung(
  db: Db,
  objekt: Record<string, unknown>,
  meta: Record<string, unknown>,
  optionen: LaufUmgebung,
): Promise<{ analyse: unknown; umgebung: UmgebungStand }> {
  const objektId = String(objekt.id || "");
  const teile = { adresse: objekt.adresse, plz: objekt.plz, ort: objekt.ort, titel: objekt.titel };
  const vorhanden = istGemessen(meta.standortanalyse) ? meta.standortanalyse : undefined;
  const passt = !!vorhanden && !standortAdresseGeaendert(vorhanden, teile);
  if (passt && !optionen.neuMessen) {
    return { analyse: vorhanden, umgebung: umgebungAusAnalyse(vorhanden) };
  }

  const bis = Math.min(Date.now() + MESS_BUDGET_MS, optionen.frist - KI_RESERVE_MS);
  let grund = "";
  let art: "adresse" | "dienst" = "dienst";
  let neu: unknown;
  let gefunden: LageTreffer | undefined;

  if (bis - Date.now() < MESS_MINDESTZEIT_MS) {
    grund = "Für die Messung blieb in diesem Lauf keine Zeit.";
  } else {
    try {
      const investagon = koordinatenAusInvestagon(meta);
      const messung = await (optionen.messe ?? messeStandort)(
        teile,
        { bis, ...(investagon ? { koordinate: { lat: investagon.lat, lng: investagon.lng, quelle: "investagon" as const } } : {}) },
      );
      // Ausdrücklich ausgepackt, wie in `standort-messung.ts`: Ohne `strict`
      // engt TypeScript die Vereinigung über `ok` nicht ein.
      const m = messung as { ok: boolean; analyse?: unknown; lage?: LageTreffer; art?: "adresse" | "dienst"; grund?: string };
      gefunden = m.lage;
      if (m.ok) {
        neu = m.analyse;
      } else {
        grund = m.grund || "Die Messung ist gescheitert.";
        art = m.art === "adresse" ? "adresse" : "dienst";
        console.warn(`objekt-texte-ki: Messung für ${objektId} gescheitert (${art})`, grund);
      }
    } catch (e) {
      grund = `Die Messung brach ab (${e instanceof Error ? e.message : "unbekannt"}).`;
      console.warn(`objekt-texte-ki: Messung für ${objektId} abgebrochen`, e);
    }
  }

  // Eine gröbere Messung ersetzt keine genauere, aber nur bei derselben
  // Adresse. Hat sich die Adresse geändert, gilt die alte Analyse nicht mehr.
  const neuGilt = !!neu && (!passt ||
    genauigkeitsRang(alsObjekt(neu).genauigkeit) <= genauigkeitsRang(alsObjekt(vorhanden).genauigkeit));
  if (neuGilt || gefunden) {
    try {
      const metaVorher = await frischesMeta(db, objektId, meta);
      let metaNeu = neuGilt ? standortInMeta(metaVorher, neu as Parameters<typeof standortInMeta>[1]) : metaVorher;
      if (gefunden) metaNeu = koordinatenInMeta(metaNeu, gefunden);
      if (metaNeu !== metaVorher) {
        const { error } = await metaSchreiben(db, optionen.schreibDb, objektId, metaNeu);
        if (error) console.warn("objekt-texte-ki: Standortanalyse nicht gespeichert", error.message);
      }
    } catch (e) {
      console.warn("objekt-texte-ki: Standortanalyse nicht gespeichert", e);
    }
  }

  // Scheitert die Messung für eine geänderte Adresse, taugt die alte Analyse
  // nicht als Rückfall: Sie beschriebe die Umgebung eines anderen Hauses. Eine
  // Analyse ohne Adressstempel dagegen schon, sie stammt fast immer von
  // derselben Adresse.
  const alteTaugt = !!vorhanden && (passt || !hatGemesseneAdresse(vorhanden));
  const analyse = neuGilt ? neu : alteTaugt ? vorhanden : undefined;
  if (analyse) return { analyse, umgebung: umgebungAusAnalyse(analyse) };
  return { analyse: undefined, umgebung: { gemessen: false, grund, art } };
}

/**
 * Die Marktdaten zum Ort des Objekts, als Tatsachenzeilen.
 *
 * Fehlt der Ort in der Marktanalyse, gibt es keine Zeilen und keinen Hinweis:
 * Das ist der Normalfall für kleinere Gemeinden. Ein Hinweis entsteht nur,
 * wenn das Lesen selbst scheitert.
 */
async function leseMarktdaten(
  db: Db,
  objekt: Record<string, unknown>,
  analyse: unknown,
): Promise<{ zeilen: string[]; hinweis?: string }> {
  try {
    const { data: standorte, error } = await db.from("standorte").select("id, name, bundesland, lat, lng");
    if (error) {
      console.warn("objekt-texte-ki: Standorte der Marktanalyse nicht lesbar", error.message);
      return { zeilen: [], hinweis: "Die Marktdaten ließen sich nicht lesen, es gibt deshalb keine Marktargumente." };
    }
    // Die gemessene Lage des Objekts, falls es eine gibt. Ohne sie zählt nur der Ortsname.
    const k = alsObjekt(alsObjekt(analyse).objekt_koordinaten);
    const koordinate = typeof k.lat === "number" && typeof k.lng === "number" && Number.isFinite(k.lat) && Number.isFinite(k.lng)
      ? { lat: k.lat, lng: k.lng }
      : null;
    const zuordnung = findeMarktStandorte((standorte || []) as MarktStandort[], { ort: objekt.ort }, koordinate);
    if (!zuordnung) return { zeilen: [] };

    const ids = zuordnung.kandidaten.map((s) => s.id);
    const [kennzahlen, arbeitgeber] = await Promise.all([
      db.from("standort_kennzahlen").select("standort_id, kennzahl, wert, stand, quelle_id, meta").in("standort_id", ids),
      db.from("standort_arbeitgeber").select("standort_id, name, branche, mitarbeiter, quelle, quelle_id, rang").in("standort_id", ids),
    ]);
    if (kennzahlen.error) console.warn("objekt-texte-ki: Kennzahlen nicht lesbar", kennzahlen.error.message);
    if (arbeitgeber.error) console.warn("objekt-texte-ki: Arbeitgeber nicht lesbar", arbeitgeber.error.message);
    const zahlen = (kennzahlen.data || []) as MarktKennzahl[];
    const standort = waehleMarktStandort(zuordnung, zahlen);
    return {
      zeilen: marktQuellen({
        standort,
        zuordnung,
        kennzahlen: zahlen,
        arbeitgeber: (arbeitgeber.data || []) as MarktArbeitgeber[],
      }),
    };
  } catch (e) {
    console.warn("objekt-texte-ki: Marktdaten abgebrochen", e);
    return { zeilen: [], hinweis: "Die Marktdaten ließen sich nicht lesen, es gibt deshalb keine Marktargumente." };
  }
}

/**
 * Eine neue Einordnung für Lotse und Rechner merken. Scheitert das (etwa ohne
 * Migration), bleibt es beim Lauf. Ein vollständiger Auszug unter demselben
 * Schlüssel wird nie überschrieben (`einordnungMerken`, Runde 2).
 */
async function merkeEinordnung(
  db: Db,
  objektId: string,
  dok: UnterlagenKandidat,
  dokumentSchluessel: string,
  einordnung: Exclude<Einordnung, { ergebnis: "unklar" }>,
  bestehend: Record<string, unknown> | undefined,
): Promise<void> {
  try {
    const rot = einordnung.ergebnis === "rot";
    const gesperrt = einordnung.ergebnis === "gesperrt";
    const ergebnis = await einordnungMerken(db, {
      objekt_id: objektId,
      wohnung_id: dok.herkunft === "einheit" ? dok.wohnungId || null : null,
      dokument_schluessel: dokumentSchluessel,
      dokument_name: rot
        ? `${einordnung.art === "grundbuch" ? "Grundbuchauszug" : "Mietvertrag"}${dok.herkunft === "einheit" ? " der Einheit" : " zum Objekt"}`
        : gesperrt ? "Nicht auswertbare Unterlage" : "Unterlage, eingeordnet",
      ampel: rot || gesperrt ? "rot" : "gruen",
      art: rot ? einordnung.art : gesperrt ? GESPERRT_ART : "sonstiges",
      schema_fassung: AUSZUG_SCHEMA_FASSUNG,
      auszug: NUR_EINORDNUNG,
      modell: FAKTENAUSZUG_MODELL,
    }, bestehend);
    if (ergebnis === "fehler") console.warn("objekt-texte-ki: Einordnung nicht gemerkt");
  } catch (e) {
    console.warn("objekt-texte-ki: Einordnung nicht gemerkt", (e as Error)?.message);
  }
}

/**
 * Die Unterlagen von Objekt und Einheiten laden, die besten zuerst.
 *
 * Auswahl und Ausschluss stehen in `_shared/objekt-texte-unterlagen.ts`. Hier
 * wird nur geladen, geprüft und umgewandelt. Eine Unterlage, die sich nicht
 * laden lässt, zu groß ist oder doch kein PDF, wird übersprungen, und die
 * nächste rückt nach, bis `MAX_UNTERLAGEN` beisammen sind.
 *
 * Seit dem 28.09.2026 läuft vor dem Anhängen dieselbe Einordnung wie im
 * MORE Lotsen (LOTSE-R6-003): Name und Kategorie nur Richtung rot, angehängt
 * wird nur, was der Einordnungsaufruf als „sonstiges“ meldet. Rot und unklar
 * bleiben draußen. Eine gespeicherte Einordnung derselben Dateiversion
 * (`lotse_unterlagen_auszug`) gilt, eine neue wird gemerkt. Schon erzeugte
 * Objekttexte bleiben unberührt.
 */
async function ladeUnterlagen(
  db: Db,
  objekt: Record<string, unknown>,
  einheiten: Array<Record<string, unknown>>,
  einordnen: (pdf: string) => Promise<Einordnung>,
): Promise<{ anhaenge: Array<{ name: string; datenAdresse: string }>; nichtGelesen: string[] }> {
  const id = String(objekt.id || "");
  const anhaenge: Array<{ name: string; datenAdresse: string }> = [];
  const nichtGelesen: string[] = [];

  const einheitIds = einheiten.map((w) => String(w.id || "")).filter(Boolean);
  const [objektDoks, einheitDoks] = await Promise.all([
    db.from("objekt_dokumente").select("name, url, kategorie").eq("objekt_id", id),
    einheitIds.length > 0
      ? db.from("wohnungs_dokumente").select("name, url, wohnung_id, kategorie").in("wohnung_id", einheitIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (objektDoks.error) console.warn("objekt-texte-ki: Objektunterlagen nicht lesbar", objektDoks.error.message);
  if (einheitDoks.error) console.warn("objekt-texte-ki: Einheitsunterlagen nicht lesbar", einheitDoks.error.message);

  const kategorieAmObjekt = investagonKategorien(alsObjekt(alsObjekt(objekt.meta).investagonRaw));
  const kategorieJeEinheit = new Map(einheiten.map((w) => [String(w.id || ""), investagonKategorien(w.investagon_dateien)]));
  // Interne Unterlagen (Provision, Vertrieb) fließen nie in Texte, die Partner und Kunden lesen.
  const nichtIntern = (d: Record<string, unknown>) => d.kategorie !== "intern";
  const kandidaten: UnterlagenKandidat[] = [
    ...((objektDoks.data || []) as Array<Record<string, unknown>>).filter(nichtIntern).map((d) => ({
      name: String(d.name || ""),
      url: String(d.url || ""),
      herkunft: "objekt" as const,
      investagonKategorie: kategorieAmObjekt(String(d.name || "")),
    })),
    ...((einheitDoks.data || []) as Array<Record<string, unknown>>).filter(nichtIntern).map((d) => ({
      name: String(d.name || ""),
      url: String(d.url || ""),
      herkunft: "einheit" as const,
      wohnungId: String(d.wohnung_id || ""),
      investagonKategorie: kategorieJeEinheit.get(String(d.wohnung_id || ""))?.(String(d.name || "")),
    })),
  ];

  const { reihenfolge, ausgelassen } = ordneUnterlagen(kandidaten);
  if (ausgelassen.length > 0) {
    console.log(`objekt-texte-ki: ${ausgelassen.length} Unterlagen bewusst ausgelassen (Personendaten, Verträge, kein PDF)`);
  }

  /*
   * Gespeicherte Einordnungen. Die Version aus den Metadaten ist nur der
   * Vorfilter, gelten darf nur die Zeile mit dem Hash der geladenen Bytes
   * (LOTSE-R7-001). Fehlt etwas davon, wird eben neu eingeordnet.
   */
  const orte = reihenfolge.map((dok) => ablage(dok.url, { objektId: id, wohnungId: dok.wohnungId, ebene: dok.herkunft }));
  const vorsilben = new Map<string, string>();
  const zeilen = new Map<string, Record<string, unknown>>();
  try {
    const versionen = await dokumentVersionen(db, orte.filter((o): o is { eimer: string; pfad: string } => !!o));
    for (const o of orte) {
      const version = o ? versionen.get(ablageKennung(o)) : undefined;
      if (o && version) vorsilben.set(ablageKennung(o), auszugVorsilbe(o, version));
    }
    if (vorsilben.size) {
      const { data } = await db.from("lotse_unterlagen_auszug")
        .select("dokument_schluessel, ampel, art, schema_fassung, auszug, erstellt_am").eq("objekt_id", id);
      for (const z of (data || []) as Array<Record<string, unknown>>) zeilen.set(String(z.dokument_schluessel), z);
    }
  } catch (e) {
    console.warn("objekt-texte-ki: gespeicherte Einordnungen nicht lesbar", (e as Error)?.message);
  }

  let summeBytes = 0;
  for (const [position, dok] of reihenfolge.entries()) {
    if (anhaenge.length >= MAX_UNTERLAGEN) break;
    // Name und Kategorie nur Richtung rot. Der Name bleibt dann draußen, er kann eine Person nennen.
    if (vorabGesperrt({ name: dok.name })) {
      nichtGelesen.push("eine Vertriebsunterlage");
      continue;
    }
    if (vorabRot({ name: dok.name, investagonKategorie: dok.investagonKategorie ?? null })) {
      nichtGelesen.push("eine Unterlage mit Personendaten");
      continue;
    }
    // Nur Ablagen, die zu diesem Objekt beziehungsweise dieser Einheit gehören (LOTSE-001).
    const ort = orte[position];
    if (!ort) {
      nichtGelesen.push(`${dok.name} (Ablage unbekannt)`);
      continue;
    }
    try {
      const { data: datei, error: ladeFehler } = await db.storage.from(ort.eimer).download(ort.pfad);
      if (ladeFehler || !datei) {
        console.warn(`objekt-texte-ki: ${ort.eimer}/${ort.pfad} nicht lesbar`, ladeFehler?.message);
        nichtGelesen.push(`${dok.name} (nicht lesbar)`);
        continue;
      }
      if (datei.size > MAX_BYTES_JE_UNTERLAGE) {
        nichtGelesen.push(`${dok.name} (größer als ${Math.round(MAX_BYTES_JE_UNTERLAGE / 1024 / 1024)} MB)`);
        continue;
      }
      if (summeBytes + datei.size > MAX_BYTES_GESAMT) {
        nichtGelesen.push(`${dok.name} (Umfang je Lauf erreicht)`);
        continue;
      }
      const bytes = new Uint8Array(await datei.arrayBuffer());
      if (!beginntWiePdf(bytes)) {
        nichtGelesen.push(`${dok.name} (kein PDF)`);
        continue;
      }
      const datenAdresse = `data:application/pdf;base64,${alsBase64(bytes)}`;
      const vorsilbe = vorsilben.get(ablageKennung(ort));
      const dokumentSchluessel = vorsilbe ? auszugSchluessel(vorsilbe, await sha256Hex(bytes)) : undefined;
      const gespeichert = dokumentSchluessel ? gespeicherteEinordnung(zeilen.get(dokumentSchluessel)) : null;
      // Vom Lotsen nur als Faktenauszug gelesen oder ausgeschlossen: geht nie als Original in einen Text (Stufe 2, 05.10.2026).
      if (gespeichert?.ergebnis === "gelb" || gespeichert?.ergebnis === "ausgeschlossen") {
        nichtGelesen.push("eine Unterlage, die nicht in Objekttexte geht");
        continue;
      }
      const bekannt = gespeichert;
      const einordnung: Einordnung = bekannt ?? await einordnen(datenAdresse);
      if (!bekannt && dokumentSchluessel && einordnung.ergebnis !== "unklar") {
        await merkeEinordnung(db, id, dok, dokumentSchluessel, einordnung, zeilen.get(dokumentSchluessel));
      }
      if (einordnung.ergebnis !== "frei") {
        nichtGelesen.push(
          einordnung.ergebnis === "rot" ? "eine Unterlage mit Personendaten"
            : einordnung.ergebnis === "gesperrt" ? "eine Vertriebsunterlage"
            : `${dok.name} (nicht sicher eingeordnet)`,
        );
        continue;
      }
      summeBytes += bytes.length;
      anhaenge.push({ name: dok.name, datenAdresse });
    } catch (e) {
      console.warn(`objekt-texte-ki: ${ort.eimer}/${ort.pfad} abgebrochen`, e);
      nichtGelesen.push(`${dok.name} (nicht lesbar)`);
    }
  }
  return { anhaenge, nichtGelesen };
}
