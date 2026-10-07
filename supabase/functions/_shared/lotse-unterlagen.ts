/**
 * Gespeicherte Unterlagenauszüge des MORE Lotsen (`lotse_unterlagen_auszug`),
 * gemeinsam für `objekt-lotse` und `investmentrechner-unterlagen`.
 *
 * Seit dem 28.09.2026, zweite Runde:
 *   - Der Schlüssel eines Auszugs bildet den Dateiinhalt ab (Befund
 *     LOTSE-003): Eimer, Pfad und eine Version aus den Storage-Metadaten
 *     (eTag, Änderungszeit, Größe). Überschreibt der Investagon-Import eine
 *     Datei per upsert, ändert sich die Version und es entsteht ein neuer
 *     Auszug. Die Version kommt aus einer Ordnerliste, ohne Download.
 *   - Ein gespeicherter Auszug gilt nur, wenn Ampel, Art und Schema-Fassung
 *     zur heutigen Einordnung passen (Befund LOTSE-004).
 *
 * Geprüft in `src/lib/lotseFaktenauszug.test.ts`.
 */
import {
  AUSZUG_SCHEMA_FASSUNG,
  DATEI_NICHT_AUSWERTBAR,
  type FaktenArt,
  gespeicherteEinordnung,
  GESPERRT_ART,
  lotseAnsichtAusZeile,
  LOTSE_UNGELESEN_ART,
} from "./lotse-faktenauszug.ts";

/** Als was eine Unterlage mit einem bestimmten Auszug gilt. */
export type AuszugAnsicht = { ampel: "gruen" | "rot"; art: string; roteArt?: FaktenArt };

// deno-lint-ignore no-explicit-any
type Db = any;

export interface Ablage {
  eimer: string;
  pfad: string;
}

/** So viele Einträge liefert eine Ordnerliste höchstens je Abruf. */
const JE_SEITE = 1000;
/** Höchstens so viele Seiten je Ordner, danach bleibt der Rest ohne Version. */
const MAX_SEITEN = 5;

export const ablageKennung = (a: Ablage) => `${a.eimer}/${a.pfad}`;

/** Was der Lotse über eine Unterlage weiß, bevor er einen gespeicherten Auszug verwendet. */
export interface AuszugKandidat {
  ampel: "gruen" | "rot";
  art: string;
  roteArt?: FaktenArt;
  /** Noch nicht eingeordnet: Nur eine Zeile, die ihre Einordnung selbst trägt, passt. */
  inhaltPruefen?: boolean;
  /**
   * Gelbe Unterlage vor der Inhaltseinordnung des Lotsen (05.10.2026): Als was
   * sie gilt, sagt allein eine Zeile aus dieser Einordnung (`lotseAnsichtAusZeile`).
   */
  lotsePruefen?: boolean;
  gesperrt?: boolean;
}

/**
 * Passt ein gespeicherter Auszug? Ohne Seiteneffekt (LOTSE-R8-002): Der
 * Kandidat bleibt unverändert, zurück kommt nur, als was er mit diesem Auszug
 * gilt. Erst der Aufrufer übernimmt das, und nur für die Zeile, deren Auszug
 * er tatsächlich verwendet. Vermerke zur Einordnung und Fehlversuche sind
 * kein Auszug.
 */
export function auszugAnsicht(
  zeile: Record<string, unknown> | undefined,
  k: AuszugKandidat,
): AuszugAnsicht | null {
  const a = zeile?.auszug && typeof zeile.auszug === "object" ? (zeile.auszug as Record<string, unknown>) : {};
  if (k.gesperrt || a.nur_einordnung === true || typeof a.fehlversuch === "string" || a.in_arbeit === true) return null;
  if (k.lotsePruefen) return lotseAnsichtAusZeile(zeile);
  let ansicht: AuszugAnsicht = { ampel: k.ampel, art: k.art, roteArt: k.roteArt };
  /*
   * „Nicht auswertbar“ (größer als 8 MB, kein PDF) gilt als vorhanden, auch
   * ohne Einordnung (Runde 3): Sonst würde die Datei bei jeder Frage neu
   * geladen. In den Prompt geht davon nur der Grund, nie ein Inhalt.
   */
  const nichtAuswertbar = typeof a.nicht_auswertbar === "string" && (DATEI_NICHT_AUSWERTBAR as readonly string[]).includes(a.nicht_auswertbar);
  if (k.inhaltPruefen && !nichtAuswertbar) {
    const einordnung = gespeicherteEinordnung(zeile);
    if (!einordnung || einordnung.ergebnis === "gesperrt") return null;
    if (einordnung.ergebnis === "rot") ansicht = { ampel: "rot", art: einordnung.art, roteArt: einordnung.art };
    // Seit Stufe 2: gelbe Faktenart oder „ungelesen“ aus der Inhaltseinordnung des Lotsen, nie frei.
    if (einordnung.ergebnis === "gelb") ansicht = { ampel: "rot", art: einordnung.art, roteArt: einordnung.art };
    if (einordnung.ergebnis === "ausgeschlossen") ansicht = { ampel: "rot", art: LOTSE_UNGELESEN_ART };
  }
  return auszugPasst(zeile, ansicht) ? ansicht : null;
}

/**
 * Der Schlüssel eines Auszugs besteht seit dem 28.09.2026 aus drei Teilen
 * (Befund LOTSE-R7-001): Ablage, Version aus den Storage-Metadaten und
 * SHA-256 der tatsächlich geladenen Bytes. Die Version dient nur als
 * Vorfilter (`auszugVorsilbe`), ohne Download. Wer Bytes an ein Modell gibt,
 * braucht die Zeile mit genau deren Hash (`auszugSchluessel`): Ersetzt der
 * Import die Datei zwischen Metadaten und Download, gilt keine alte
 * Einordnung für die neuen Bytes.
 */
export const auszugVorsilbe = (a: Ablage, version: string) => `${ablageKennung(a)}#${version}#`;
export const auszugSchluessel = (vorsilbe: string, hash: string) => `${vorsilbe}sha256:${hash}`;
/** Schlüssel für einen Fehlversuch, bei dem keine Bytes geladen werden konnten. */
export const fehlversuchSchluessel = (vorsilbe: string) => `${vorsilbe}fehlversuch`;

/** SHA-256 der geladenen Bytes als Hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Die Zeilen mit dieser Vorsilbe, die neueste zuerst. */
export function zeilenMitVorsilbe(zeilen: Iterable<Record<string, unknown>>, vorsilbe: string): Array<Record<string, unknown>> {
  return [...zeilen]
    .filter((z) => String(z.dokument_schluessel ?? "").startsWith(vorsilbe))
    .sort((a, b) => String(b.erstellt_am ?? "").localeCompare(String(a.erstellt_am ?? "")));
}

/** Ein Fehlversuch sperrt so lange, bevor er erneut versucht wird (LOTSE-R7-003). */
export const FEHLVERSUCH_SPERRE_MS = 24 * 60 * 60 * 1000;

/** Ist eine Zeile ein Fehlversuch, und von wann? */
export function fehlversuchVon(zeile: Record<string, unknown> | undefined): number | null {
  const a = zeile?.auszug as { fehlversuch?: unknown; am?: unknown } | undefined;
  if (!a || typeof a !== "object" || typeof a.fehlversuch !== "string") return null;
  const am = Date.parse(String(a.am ?? zeile?.erstellt_am ?? ""));
  return Number.isFinite(am) ? am : 0;
}

/*
 * Sperrvermerk, solange eine Unterlage ausgewertet wird (28.09.2026): Das
 * Vorbereiten beim Öffnen des Lotsen und eine Frage sollen dieselbe
 * Unterlage nicht doppelt an das Modell geben. Die Zeile trägt Ampel rot und
 * `art` „in_arbeit“, gilt also nie als Auszug, Einordnung oder Fehlversuch,
 * und alle Leser schlagen sonst nur mit dem vollen Schlüssel nach.
 */
export const IN_ARBEIT_ART = "in_arbeit";
/** So lange gilt ein Sperrvermerk, danach darf die Unterlage erneut versucht werden (Laufzeitgrenze der Function). */
export const IN_ARBEIT_MS = 5 * 60 * 1000;
export const inArbeitSchluessel = (vorsilbe: string) => `${vorsilbe}in_arbeit`;

/** Wird eine Unterlage mit diesen Zeilen gerade ausgewertet? */
export function inArbeit(zeilen: Iterable<Record<string, unknown>>, jetzt: number): boolean {
  for (const z of zeilen) {
    if (z.art !== IN_ARBEIT_ART) continue;
    const am = Date.parse(String((z.auszug as { am?: unknown } | null)?.am ?? z.erstellt_am ?? ""));
    if (Number.isFinite(am) && jetzt - am < IN_ARBEIT_MS) return true;
  }
  return false;
}

/**
 * Welche fehlenden Auszüge jetzt erzeugt werden (LOTSE-R7-003): nie ein
 * Kandidat, dessen Fehlversuch jünger als 24 Stunden ist; ältere Fehlversuche
 * erst nach allen anderen. So blockiert eine immer wieder scheiternde
 * Unterlage nicht dauerhaft die übrigen.
 */
export function neueAuswaehlen<K>(
  kandidaten: K[],
  letzterFehlversuch: (k: K) => number | null,
  jetzt: number,
  hoechstens: number,
): K[] {
  const bereit = kandidaten.filter((k) => {
    const am = letzterFehlversuch(k);
    return am === null || jetzt - am >= FEHLVERSUCH_SPERRE_MS;
  });
  const ohne = bereit.filter((k) => letzterFehlversuch(k) === null);
  const mit = bereit.filter((k) => letzterFehlversuch(k) !== null);
  return [...ohne, ...mit].slice(0, hoechstens);
}

/**
 * Die Version jeder Datei aus den Storage-Metadaten, je Ordner eine Liste.
 * Fehlt eine Datei in der Liste, fehlt sie auch in der Rückgabe: Dann wird
 * sie nicht geladen.
 */
export async function dokumentVersionen(db: Db, ablagen: Ablage[]): Promise<Map<string, string>> {
  const versionen = new Map<string, string>();
  const ordner = new Map<string, { eimer: string; ordner: string; namen: Set<string> }>();
  for (const a of ablagen) {
    const schnitt = a.pfad.lastIndexOf("/");
    const pfadOrdner = schnitt >= 0 ? a.pfad.slice(0, schnitt) : "";
    const name = a.pfad.slice(schnitt + 1);
    const kennung = `${a.eimer}/${pfadOrdner}`;
    const eintrag = ordner.get(kennung) ?? { eimer: a.eimer, ordner: pfadOrdner, namen: new Set<string>() };
    eintrag.namen.add(name);
    ordner.set(kennung, eintrag);
  }
  await Promise.all([...ordner.values()].map(async ({ eimer, ordner: pfadOrdner, namen }) => {
    for (let seite = 0; seite < MAX_SEITEN; seite++) {
      const { data, error } = await db.storage.from(eimer).list(pfadOrdner, { limit: JE_SEITE, offset: seite * JE_SEITE });
      if (error || !Array.isArray(data)) {
        if (error) console.warn(`lotse: Ordner ${eimer} nicht lesbar`, error.message);
        return;
      }
      for (const d of data as Array<{ name?: string; updated_at?: string; metadata?: { eTag?: string; size?: number } | null }>) {
        if (!d?.name || !namen.has(d.name)) continue;
        const version = [d.metadata?.eTag, d.updated_at, d.metadata?.size]
          .filter((teil) => teil !== undefined && teil !== null && teil !== "")
          .join("|");
        if (version) versionen.set(ablageKennung({ eimer, pfad: pfadOrdner ? `${pfadOrdner}/${d.name}` : d.name }), version);
      }
      if (data.length < JE_SEITE) return;
    }
  }));
  return versionen;
}

/** Passt ein gespeicherter Auszug zur heutigen Einordnung und Schema-Fassung? */
export function auszugPasst(
  zeile: { ampel?: unknown; art?: unknown; schema_fassung?: unknown } | null | undefined,
  erwartet: { ampel: string; art: string },
): boolean {
  return !!zeile && zeile.ampel === erwartet.ampel && zeile.art === erwartet.art
    && Number(zeile.schema_fassung) === AUSZUG_SCHEMA_FASSUNG;
}

/**
 * Die Unterlagen, die der Aufrufer mit SEINEM Token sehen darf, je
 * gespeichertem Wert mit ihrer Ebene (Befund LOTSE-R3-001).
 *
 * Erst wenn Objekt und Einheit für ihn sichtbar sind, die Einheit zu diesem
 * Objekt gehört und die Unterlage in den Dokumentzeilen steht, die er selbst
 * lesen darf, nutzt die Function den Dienstschlüssel für Download und
 * Speicher. Die Zeilenregeln auf `objekt_dokumente` und `wohnungs_dokumente`
 * lassen nur interne Rollen lesen, ein Kundenkonto bekommt hier nichts. Eine
 * Adresse aus der Anfrage allein öffnet nichts. Von Hand hochgeladene
 * Einheitsunterlagen (nur in `wohnungen.meta.dokumente`) zählen bewusst nicht
 * dazu, sie gehen den Weg über den Browserinhalt.
 */
export async function freigegebeneUnterlagen(
  alsNutzer: Db,
  bezug: { objektId: string; wohnungId: string },
): Promise<Map<string, "objekt" | "einheit">> {
  const frei = new Map<string, "objekt" | "einheit">();
  const [objekt, einheit] = await Promise.all([
    alsNutzer.from("objekte").select("id").eq("id", bezug.objektId).maybeSingle(),
    alsNutzer.from("wohnungen").select("id").eq("id", bezug.wohnungId).eq("objekt_id", bezug.objektId).maybeSingle(),
  ]);
  if (!objekt.data || !einheit.data) return frei;
  const [objektDoks, einheitDoks] = await Promise.all([
    alsNutzer.from("objekt_dokumente").select("url, kategorie").eq("objekt_id", bezug.objektId),
    alsNutzer.from("wohnungs_dokumente").select("url, kategorie").eq("wohnung_id", bezug.wohnungId),
  ]);
  // Interne Unterlagen gehen nie in den Rechner, auch nicht für Admin und Inhaber (wie `objektUnterlagen.ts` im Browser).
  const lesbar = (z: { url?: unknown; kategorie?: unknown }) => typeof z.url === "string" && !!z.url && z.kategorie !== "intern";
  for (const z of (objektDoks.data || []) as Array<{ url?: unknown; kategorie?: unknown }>) if (lesbar(z)) frei.set(z.url as string, "objekt");
  for (const z of (einheitDoks.data || []) as Array<{ url?: unknown; kategorie?: unknown }>) if (lesbar(z)) frei.set(z.url as string, "einheit");
  return frei;
}

/* ------------------------------------------------------------------ */
/* Gespeicherte Auszüge zuordnen, fehlende wählen                     */
/* ------------------------------------------------------------------ */

/** Eine Unterlage des Lotsen mit Ablage und Version (`vorsilbe`, ohne Download aus den Storage-Metadaten). */
export interface LotseKandidat extends AuszugKandidat {
  ablage: Ablage | null;
  vorsilbe?: string;
  /** Wird gerade von einem anderen Aufruf ausgewertet (Sperrvermerk). */
  inArbeit?: boolean;
}

export type OffenerKandidat<K> = K & { ablage: Ablage; vorsilbe: string };

/**
 * Die gespeicherten Auszüge den Unterlagen zuordnen, nur aus den Zeilen der
 * Tabelle und der Version, ohne Download und ohne Modell. Die Zeilen gehören
 * zu Objekt und Einheit, nicht zu einem Nutzer: Was einmal ausgewertet ist,
 * dient jedem, der die Einheit sehen darf. Ein Auszug gilt nur für genau
 * diese Dateiversion (`vorsilbe`) und die aktuelle Schema-Fassung
 * (`auszugAnsicht`). `uebernehmen` übernimmt eine abweichende Einordnung aus
 * dem Auszug: rot statt grün, oder bei gelben Unterlagen die Art aus der
 * Inhaltseinordnung des Lotsen.
 */
export function auszuegeZuordnen<K extends LotseKandidat>(
  kandidaten: K[],
  alleZeilen: Array<Record<string, unknown>>,
  uebernehmen: (k: K, ansicht: AuszugAnsicht) => void,
): { zeilenJe: Map<K, Array<Record<string, unknown>>>; auszuege: Map<string, { auszug: unknown; stand: string }> } {
  const zeilenJe = new Map(kandidaten.map((k) => [k, k.vorsilbe ? zeilenMitVorsilbe(alleZeilen, k.vorsilbe) : []]));
  const auszuege = new Map<string, { auszug: unknown; stand: string }>();
  for (const k of kandidaten) {
    const zeilen = zeilenJe.get(k) ?? [];
    // Als Vertriebsvereinbarung eingeordnet (aktuelle Fassung), bleibt die Unterlage draußen, gleich welche Bytes.
    if (zeilen.some((z) => z.art === GESPERRT_ART && Number(z.schema_fassung) === AUSZUG_SCHEMA_FASSUNG)) k.gesperrt = true;
    const passend = zeilen.find((z) => auszugAnsicht(z, k));
    const ansicht = passend ? auszugAnsicht(passend, k) : null;
    if (k.vorsilbe && passend && ansicht) {
      // Nur der verwendete Auszug bestimmt, als was die Unterlage gilt. Sie wird dann nicht neu geladen.
      if (ansicht.ampel !== k.ampel || ansicht.art !== k.art || ansicht.roteArt !== k.roteArt) uebernehmen(k, ansicht);
      k.inhaltPruefen = false;
      k.lotsePruefen = false;
      auszuege.set(k.vorsilbe, { auszug: passend.auszug, stand: typeof passend.erstellt_am === "string" ? passend.erstellt_am : "" });
    }
  }
  return { zeilenJe, auszuege };
}

/**
 * Welche Unterlagen jetzt ausgewertet werden müssen: nur mit Ablage und
 * Version, nicht gesperrt, ohne passenden Auszug, nicht gerade in Arbeit,
 * Fehlversuche erst nach 24 Stunden (`neueAuswaehlen`). Ist alles schon
 * ausgewertet, ist die Liste leer, und niemand lädt oder fragt ein Modell.
 * Markiert Unterlagen in Arbeit, damit der Prompt sie als „wird noch
 * ausgewertet“ nennt.
 */
export function fehlendeAuszuege<K extends LotseKandidat>(
  kandidaten: K[],
  zeilenJe: Map<K, Array<Record<string, unknown>>>,
  auszuege: Map<string, unknown>,
  hoechstens: number,
  jetzt: number,
): OffenerKandidat<K>[] {
  const offen = kandidaten.filter((x): x is OffenerKandidat<K> => !!x.ablage && !!x.vorsilbe && !x.gesperrt && !auszuege.has(x.vorsilbe));
  for (const x of offen) if (inArbeit(zeilenJe.get(x) ?? [], jetzt)) x.inArbeit = true;
  const letzterFehlversuch = (x: K) => {
    const zeiten = (zeilenJe.get(x) ?? []).map(fehlversuchVon).filter((am): am is number => am !== null);
    return zeiten.length ? Math.max(...zeiten) : null;
  };
  return neueAuswaehlen<OffenerKandidat<K>>(offen.filter((x) => !x.inArbeit), letzterFehlversuch, jetzt, hoechstens);
}

/* ------------------------------------------------------------------ */
/* Sperren und Kostenbremse (Runde 2, 28.09.2026)                     */
/* ------------------------------------------------------------------ */

const TABELLE = "lotse_unterlagen_auszug";
/** Postgres: eindeutiger Schlüssel schon vergeben. */
const SCHON_DA = "23505";

export type SperrErgebnis = "gewonnen" | "belegt" | "fehler";

/**
 * Einen Vermerk per INSERT gewinnen (nie upsert): Der eindeutige
 * `dokument_schluessel` lässt genau einen Aufruf durch. Steht schon ein
 * Vermerk da, der älter als `gueltigMs` ist, übernimmt ihn genau ein Aufruf
 * über ein bedingtes UPDATE auf `erstellt_am`. Jeder andere Fehler ergibt
 * „fehler“, der Aufrufer wertet dann nicht aus (fail closed).
 */
export async function sperreGewinnen(
  db: Db,
  zeile: Record<string, unknown> & { dokument_schluessel: string },
  gueltigMs: number,
  jetzt = Date.now(),
): Promise<SperrErgebnis> {
  const am = new Date(jetzt).toISOString();
  try {
    const { error } = await db.from(TABELLE).insert({ ...zeile, erstellt_am: am });
    if (!error) return "gewonnen";
    if (error.code !== SCHON_DA) {
      console.warn("lotse: Sperrvermerk nicht geschrieben", error.message);
      return "fehler";
    }
    const { data, error: uebernahme } = await db.from(TABELLE)
      .update({ erstellt_am: am, auszug: zeile.auszug })
      .eq("dokument_schluessel", zeile.dokument_schluessel)
      .lt("erstellt_am", new Date(jetzt - gueltigMs).toISOString())
      .select("dokument_schluessel");
    if (uebernahme) {
      console.warn("lotse: Sperrvermerk nicht übernommen", uebernahme.message);
      return "fehler";
    }
    return Array.isArray(data) && data.length ? "gewonnen" : "belegt";
  } catch (e) {
    console.warn("lotse: Sperrvermerk", (e as Error)?.message);
    return "fehler";
  }
}

/** Nur die Kandidaten, deren Sperrvermerk dieser Aufruf gewonnen hat. Wer verliert oder nicht schreiben kann, wertet nicht aus. */
export async function gewonneneSperren<K>(
  db: Db,
  kandidaten: K[],
  zeileFuer: (k: K) => Record<string, unknown> & { dokument_schluessel: string },
  jetzt = Date.now(),
): Promise<{ gewonnen: K[]; belegt: K[] }> {
  const ergebnisse = await Promise.all(kandidaten.map((k) => sperreGewinnen(db, zeileFuer(k), IN_ARBEIT_MS, jetzt)));
  return {
    gewonnen: kandidaten.filter((_, i) => ergebnisse[i] === "gewonnen"),
    belegt: kandidaten.filter((_, i) => ergebnisse[i] === "belegt"),
  };
}

/** Art der Vermerke für Vorbereitungsläufe. Nie ein Auszug: Kein Leser findet sie über eine Vorsilbe. */
export const VORBEREITEN_ART = "vorbereiten_lauf";
/** Je Einheit höchstens ein Vorbereitungslauf in diesem Abstand. */
export const VORBEREITEN_EINHEIT_MS = 10 * 60 * 1000;
/** Je Nutzer und Tag (deutsche Zeit) höchstens so viele Vorbereitungsläufe. */
export const VORBEREITEN_JE_TAG = 30;

const berlinerTag = (jetzt: number) => new Date(jetzt).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/**
 * Darf ein Vorbereitungslauf starten? Serverseitig, damit auch direkte
 * Aufrufe gebremst sind: erst die Einheit (ein Lauf je 10 Minuten), dann ein
 * Tagesplatz des Nutzers. Beides per INSERT auf den eindeutigen Schlüssel
 * gewonnen, ohne Migration als Vermerkzeilen in `lotse_unterlagen_auszug`
 * (die Kontingenttabelle kennt nur Nutzer und Tag, einen zweiten Zähler
 * gäbe es nur mit Migration).
 */
export async function vorbereitenFreigeben(
  db: Db,
  a: { userId: string; objektId: string; wohnungId: string | null },
  jetzt = Date.now(),
): Promise<"frei" | "einheit_kuerzlich" | "tageslimit" | "fehler"> {
  const am = new Date(jetzt).toISOString();
  const vermerk = (schluessel: string) => ({
    objekt_id: a.objektId, wohnung_id: a.wohnungId, dokument_schluessel: schluessel, dokument_name: "Vermerk Vorbereiten",
    ampel: "rot", art: VORBEREITEN_ART, schema_fassung: AUSZUG_SCHEMA_FASSUNG, auszug: { vorbereiten: true, am },
  });
  const einheit = await sperreGewinnen(db, vermerk(`lotse-vorbereiten:${a.objektId}:${a.wohnungId ?? "objekt"}`), VORBEREITEN_EINHEIT_MS, jetzt);
  if (einheit !== "gewonnen") return einheit === "belegt" ? "einheit_kuerzlich" : "fehler";
  const praefix = `lotse-vorbereiten-tag:${a.userId}:${berlinerTag(jetzt)}:`;
  try {
    const { count, error } = await db.from(TABELLE).select("dokument_schluessel", { count: "exact", head: true })
      .like("dokument_schluessel", `${praefix}%`);
    if (error) return "fehler";
    // Die Plätze sind nummeriert; der eindeutige Schlüssel vergibt jeden Platz nur einmal.
    for (let platz = (count ?? 0) + 1; platz <= VORBEREITEN_JE_TAG; platz++) {
      const { error: belegt } = await db.from(TABELLE).insert({ ...vermerk(`${praefix}${platz}`), erstellt_am: am });
      if (!belegt) return "frei";
      if (belegt.code !== SCHON_DA) return "fehler";
    }
    return "tageslimit";
  } catch {
    return "fehler";
  }
}

/**
 * Steht nach `einordnungMerken` die Einschränkung auf diese Faktenart sicher
 * in der Tabelle? „geschrieben“ ja; „uebersprungen“ nur, wenn die vorhandene
 * Zeile schon genau diese Einschränkung trägt (Codex Runde 3). Sonst muss der
 * Aufrufer sie ersetzen oder darf keinen Auszug anfordern.
 */
export function einschraenkungGesichert(
  gemerkt: "geschrieben" | "uebersprungen" | "fehler",
  bestehend: Record<string, unknown> | null | undefined,
  art: string,
): boolean {
  if (gemerkt === "geschrieben") return true;
  if (gemerkt === "fehler") return false;
  const g = gespeicherteEinordnung(bestehend);
  return !!g && (g.ergebnis === "gelb" || g.ergebnis === "rot") && g.art === art;
}

/** Trägt die Zeile einen vollständigen Auszug der aktuellen Fassung (nicht nur Einordnung, Fehlversuch oder Sperre)? */
export function hatVollenAuszug(z: Record<string, unknown> | null | undefined): boolean {
  if (!z || Number(z.schema_fassung) !== AUSZUG_SCHEMA_FASSUNG) return false;
  const a = z.auszug as Record<string, unknown> | null | undefined;
  if (!a || typeof a !== "object") return false;
  return a.nur_einordnung !== true && typeof a.fehlversuch !== "string" && a.in_arbeit !== true;
}

/**
 * Einen reinen Einordnungsvermerk speichern, ohne je einen vollständigen
 * Auszug zu überschreiben (Runde 2). `bestehend` ist die vorher gelesene
 * Zeile mit genau diesem Schlüssel (mit `erstellt_am`). Fehlt sie, nur
 * INSERT; hat inzwischen jemand geschrieben, bleibt dessen Zeile. Sonst nur,
 * wenn die Zeile seit dem Lesen unverändert ist.
 */
export async function einordnungMerken(
  db: Db,
  zeile: Record<string, unknown> & { dokument_schluessel: string },
  bestehend: Record<string, unknown> | null | undefined,
): Promise<"geschrieben" | "uebersprungen" | "fehler"> {
  if (hatVollenAuszug(bestehend)) return "uebersprungen";
  const neu = { ...zeile, erstellt_am: new Date().toISOString() };
  try {
    if (!bestehend) {
      const { error } = await db.from(TABELLE).insert(neu);
      if (!error) return "geschrieben";
      return error.code === SCHON_DA ? "uebersprungen" : "fehler";
    }
    if (typeof bestehend.erstellt_am !== "string") return "uebersprungen";
    const { data, error } = await db.from(TABELLE).update(neu)
      .eq("dokument_schluessel", zeile.dokument_schluessel).eq("erstellt_am", bestehend.erstellt_am)
      .select("dokument_schluessel");
    if (error) return "fehler";
    return Array.isArray(data) && data.length ? "geschrieben" : "uebersprungen";
  } catch {
    return "fehler";
  }
}
