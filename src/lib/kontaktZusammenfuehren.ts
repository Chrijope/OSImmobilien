import { supabase } from "@/integrations/supabase/client";
import { isTestAccount } from "./dbStoreHelper";
import { emailSchluessel, isPlaceholderEmail, telefonSchluessel } from "./duplikatCheck";

/*
 * Zwei Kontakte zu einem zusammenführen. Regel von Christian (26.09.2026):
 *
 *   - Es bleibt immer der ÄLTERE Kontakt (früheres `erstellt_am`; bei
 *     Gleichstand die kleinere MORE-Nummer, weil sie beim Anlegen hochgezählt
 *     wird und damit die Reihenfolge des Anlegens zeigt; zuletzt die Kennung,
 *     damit die Wahl nie vom Zufall abhängt).
 *   - Leere Felder des älteren werden aus dem neueren gefüllt. Bei Widerspruch
 *     bleibt der Wert des älteren, der abweichende Wert des neueren steht als
 *     Notiz im Verlauf und vollständig in `meta.zusammenfuehrungen`.
 *   - Alle Verknüpfungen des neueren wandern zum älteren, der neuere geht in
 *     den Papierkorb. Das erledigt die Datenbankfunktion
 *     `kontakte_zusammenfuehren` in EINEM Schritt (Migration 20260926230000),
 *     damit ein Fehler mittendrin keine halb umgehängten Daten hinterlässt.
 *   - Danach wandern seine Dateien in die Ordner des älteren
 *     (`zusammengefuehrteDateienVerschieben`, Migration 20260927000000).
 *
 * Dieses Modul rechnet den neuen Stand des älteren Kontakts aus
 * (`planeZusammenfuehrung`, rein und getestet) und übergibt ihn der Funktion.
 */

/** Rohzeile aus `kontakte`, so wie Supabase sie liefert. */
export interface KontaktZeile {
  id: string;
  erstellt_am?: string | null;
  aktualisiert_am?: string | null;
  meta?: Record<string, any> | null;
  [spalte: string]: any;
}

/** Spalten, die beim Zusammenführen verglichen werden, mit ihrer Beschriftung. */
const VERGLICHENE_SPALTEN: { spalte: string; label: string }[] = [
  { spalte: "anrede", label: "Anrede" },
  { spalte: "vorname", label: "Vorname" },
  { spalte: "nachname", label: "Nachname" },
  { spalte: "email", label: "E-Mail" },
  { spalte: "telefon", label: "Telefon" },
  { spalte: "firma", label: "Firma" },
  { spalte: "position", label: "Position" },
  { spalte: "strasse", label: "Straße" },
  { spalte: "hausnummer", label: "Hausnummer" },
  { spalte: "plz", label: "PLZ" },
  { spalte: "ort", label: "Ort" },
  { spalte: "land", label: "Land" },
  { spalte: "budget", label: "Budget" },
  { spalte: "kaufpreis", label: "Kaufpreis" },
  { spalte: "finanzierbarkeit", label: "Finanzierbarkeit" },
  { spalte: "objekt", label: "Objekt" },
  { spalte: "quelle", label: "Quelle" },
];

/**
 * meta-Schlüssel, die nie vom neueren übernommen werden: die eigene Nummer,
 * Löschanträge (sonst erbt der ältere einen DSGVO-Auftrag) und die
 * Zusammenführungs-Vermerke des neueren selbst.
 */
const NIE_UEBERNEHMEN = new Set([
  "moreId", "kundenNr",
  "deleteRequested", "deleteRequestedBy", "deleteRequestedAt", "deleteGrund", "deleteDsgvo",
  "deletionRequest",
  "zusammengefuehrtIn", "zusammengefuehrtAm",
]);

/** Was zum Altersvergleich nötig ist: Rohzeile (meta) oder KundeData (moreId). */
type AlterAngaben = { id: string; erstellt_am?: string | null; meta?: Record<string, any> | null; moreId?: number };

function moreIdVon(k: AlterAngaben): number {
  const roh = k.meta?.moreId ?? k.meta?.kundenNr ?? k.moreId;
  const n = typeof roh === "number" ? roh : Number.parseInt(String(roh ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

/** Sortierregel: älterer Kontakt zuerst. Siehe Kopf der Datei. */
export function vergleicheAlter(a: AlterAngaben, b: AlterAngaben): number {
  const ta = Date.parse(a.erstellt_am || "");
  const tb = Date.parse(b.erstellt_am || "");
  const za = Number.isFinite(ta) ? ta : Number.POSITIVE_INFINITY;
  const zb = Number.isFinite(tb) ? tb : Number.POSITIVE_INFINITY;
  if (za !== zb) return za < zb ? -1 : 1;
  const ma = moreIdVon(a);
  const mb = moreIdVon(b);
  if (ma !== mb) return ma < mb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function formatMoreId(k: Omit<AlterAngaben, "id">): string {
  const n = moreIdVon(k as AlterAngaben);
  return Number.isFinite(n) ? `MI-${String(n).padStart(5, "0")}` : "ohne Nummer";
}

export function formatDatum(iso?: string | null): string {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "unbekannt";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
}

function istLeer(wert: unknown, spalte?: string): boolean {
  if (wert === null || wert === undefined) return true;
  if (typeof wert === "string") {
    if (spalte === "email") return isPlaceholderEmail(wert);
    return wert.trim() === "";
  }
  if (typeof wert === "number") return spalte === "budget" || spalte === "kaufpreis" ? wert === 0 : false;
  if (Array.isArray(wert)) return wert.length === 0;
  if (typeof wert === "object") return Object.keys(wert as object).length === 0;
  return false;
}

/** JSON mit sortierten Schlüsseln, damit {a,b} und {b,a} gleich sind. */
function stabil(wert: unknown): string {
  if (Array.isArray(wert)) return `[${wert.map(stabil).join(",")}]`;
  if (wert && typeof wert === "object") {
    return `{${Object.keys(wert as object).sort()
      .map((k) => `${JSON.stringify(k)}:${stabil((wert as any)[k])}`).join(",")}}`;
  }
  return JSON.stringify(wert);
}

function spaltenGleich(spalte: string, a: unknown, b: unknown): boolean {
  if (spalte === "email") return emailSchluessel(String(a)) === emailSchluessel(String(b));
  if (spalte === "telefon") {
    const norm = (x: unknown) => telefonSchluessel(String(x)) || String(x).replace(/\s+/g, "");
    return norm(a) === norm(b);
  }
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  if (spalte === "budget" || spalte === "kaufpreis") return Number(a) === Number(b);
  return stabil(a) === stabil(b);
}

/** Beide Listen vereinigt, Reihenfolge: erst die des älteren, doppelte nur einmal. */
function vereinige(alt: unknown[], neu: unknown[]): unknown[] {
  const gesehen = new Set(alt.map(stabil));
  const ergebnis = [...alt];
  for (const eintrag of neu) {
    const s = stabil(eintrag);
    if (!gesehen.has(s)) { gesehen.add(s); ergebnis.push(eintrag); }
  }
  return ergebnis;
}

export interface ZusammenfuehrungsPlan {
  behaltenId: string;
  aufloesenId: string;
  /** Nur die Spalten des älteren, die sich ändern. */
  felder: Record<string, unknown>;
  /** Vollständiges neues meta des älteren. */
  meta: Record<string, any>;
  /** Text für den Verlaufseintrag am älteren Kontakt. */
  notiz: string;
  /** Beide Kontakte haben einen eigenen, verschiedenen Portalzugang. */
  portalKonflikt: boolean;
  /** Abweichende Werte des neueren, die nicht übernommen wurden. */
  abweichend: Record<string, unknown>;
}

/**
 * Rechnet aus, wie der ältere Kontakt nach dem Zusammenführen aussieht. Die
 * Richtung ergibt sich allein aus dem Alter, nicht aus der Reihenfolge der
 * Argumente.
 */
export function planeZusammenfuehrung(x: KontaktZeile, y: KontaktZeile, jetzt: Date = new Date()): ZusammenfuehrungsPlan {
  const [alt, neu] = vergleicheAlter(x, y) <= 0 ? [x, y] : [y, x];
  const heute = formatDatum(jetzt.toISOString());
  const neuNr = formatMoreId(neu);

  const felder: Record<string, unknown> = {};
  const abweichend: Record<string, unknown> = {};
  const notizZeilen: string[] = [];

  for (const { spalte, label } of VERGLICHENE_SPALTEN) {
    const a = alt[spalte];
    const b = neu[spalte];
    if (istLeer(b, spalte)) continue;
    if (istLeer(a, spalte)) { felder[spalte] = b; continue; }
    if (!spaltenGleich(spalte, a, b)) {
      abweichend[spalte] = b;
      notizZeilen.push(`${label}: ${String(b)}`);
    }
  }

  // Notizfeld: nichts verwerfen, sondern anhängen.
  const altNotiz = String(alt.notizen ?? "").trim();
  const neuNotiz = String(neu.notizen ?? "").trim();
  if (neuNotiz && !altNotiz) felder.notizen = neuNotiz;
  else if (neuNotiz && altNotiz !== neuNotiz) {
    felder.notizen = `${altNotiz}\n\nAus ${neuNr} übernommen:\n${neuNotiz}`;
  }

  // Zuständigkeit: bleibt beim älteren; nur wenn er keine hat, gilt die des neueren.
  if (!alt.zustaendig_id && neu.zustaendig_id) {
    felder.zustaendig_id = neu.zustaendig_id;
    felder.berater = neu.berater ?? null;
  } else if (alt.zustaendig_id && neu.zustaendig_id && alt.zustaendig_id !== neu.zustaendig_id) {
    abweichend.zustaendig_id = neu.zustaendig_id;
    notizZeilen.push(`Zuständig: ${neu.berater || "anderer Partner"}`);
  }

  // meta: Werte des älteren gewinnen, Listen werden vereinigt, fehlende ergänzt.
  const altMeta: Record<string, any> = { ...(alt.meta || {}) };
  const neuMeta: Record<string, any> = neu.meta || {};
  const meta: Record<string, any> = { ...altMeta };
  const metaAbweichend: Record<string, unknown> = {};
  for (const [schluessel, wert] of Object.entries(neuMeta)) {
    if (NIE_UEBERNEHMEN.has(schluessel) || istLeer(wert)) continue;
    const bisher = altMeta[schluessel];
    if (istLeer(bisher)) meta[schluessel] = wert;
    else if (Array.isArray(bisher) && Array.isArray(wert)) meta[schluessel] = vereinige(bisher, wert);
    else if (stabil(bisher) !== stabil(wert)) metaAbweichend[schluessel] = wert;
  }

  const zugang = (m: Record<string, any>) => (typeof m.authUserId === "string" && m.authUserId) || null;
  const zugang2 = (m: Record<string, any>) => (typeof m.person2?.authUserId === "string" && m.person2.authUserId) || null;
  const portalKonflikt =
    (!!zugang(altMeta) && !!zugang(neuMeta) && zugang(altMeta) !== zugang(neuMeta))
    || (!!zugang2(altMeta) && !!zugang2(neuMeta) && zugang2(altMeta) !== zugang2(neuMeta));
  if (portalKonflikt) {
    notizZeilen.push("Kundenportal: Beide Kontakte haben einen eigenen Zugang. Der Zugang des neueren Kontakts wurde NICHT übernommen und muss von Hand geklärt werden.");
  }

  const anzahlMeta = Object.keys(metaAbweichend).length;
  if (anzahlMeta > 0) {
    notizZeilen.push(`${anzahlMeta} weitere abweichende Zusatzangabe${anzahlMeta === 1 ? "" : "n"} am Kontakt gesichert.`);
  }

  Object.assign(abweichend, metaAbweichend);
  const vermerk = {
    am: jetzt.toISOString(),
    ausKontaktId: neu.id,
    ausMoreId: neuNr,
    ausAngelegtAm: neu.erstellt_am ?? null,
    abweichend,
  };
  meta.zusammenfuehrungen = [...(Array.isArray(altMeta.zusammenfuehrungen) ? altMeta.zusammenfuehrungen : []), vermerk];

  const kopf = `Kontakt ${neuNr} (angelegt am ${formatDatum(neu.erstellt_am)}) wurde am ${heute} hierher zusammengeführt und liegt jetzt im Papierkorb.`;
  const notiz = notizZeilen.length > 0
    ? `${kopf}\nBeim Zusammenführen am ${heute} abweichend beim neueren Kontakt, hier nicht übernommen:\n${notizZeilen.join("\n")}`
    : kopf;

  return { behaltenId: alt.id, aufloesenId: neu.id, felder, meta, notiz, portalKonflikt, abweichend };
}

/** Die Datenbankfunktion fehlt: Migration 20260926230000 ist noch nicht gelaufen. */
export class ZusammenfuehrenMigrationFehlt extends Error {
  constructor() {
    super("Die Datenbankfunktion kontakte_zusammenfuehren fehlt noch (Migration 20260926230000).");
    this.name = "ZusammenfuehrenMigrationFehlt";
  }
}

export interface ZusammenfuehrungsErgebnis {
  behaltenId: string;
  aufgeloestId: string;
  portalKonflikt: boolean;
  /** Verknüpfungen, die wegen einer Eindeutigkeitsregel beim neueren blieben. */
  nichtUmgehaengt: string[];
  /** null: Dateien sind mitgewandert. Sonst, was nicht geklappt hat. */
  dateienProblem: string | null;
}

/**
 * Verschiebt die Dateien des aufgelösten Kontakts in die Ordner des
 * behaltenen (Edge Function kontakte-zusammenfuehren-dateien). Wiederholbar.
 * Wirft nie: Das Zusammenführen selbst ist dann schon gelungen, und was nicht
 * verschoben wurde, bleibt unverändert am alten Ort.
 * Rückgabe: null, wenn alles verschoben ist, sonst ein Satz für den Hinweis.
 */
export async function zusammengefuehrteDateienVerschieben(behaltenId: string, aufgeloestId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("kontakte-zusammenfuehren-dateien", {
      body: { behaltenId, aufgeloestId },
    });
    if (error) return "Der Dienst zum Verschieben hat nicht geantwortet.";
    if (data?.migrationFehlt) return "Die Datenbank-Erweiterung dafür ist noch nicht eingespielt (Migration 20260927000000).";
    const offen = Array.isArray(data?.nichtVerschoben) ? data.nichtVerschoben.length : 0;
    if (offen > 0) return `${offen} Datei${offen > 1 ? "en liegen" : " liegt"} noch am alten Ort.`;
    return null;
  } catch {
    return "Der Dienst zum Verschieben hat nicht geantwortet.";
  }
}

function fehlendeFunktion(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883"
    || /could not find the function|does not exist/i.test(error.message || "");
}

/**
 * Führt zwei Kontakte zusammen. Welche Kennung zuerst steht, ist egal: Es
 * bleibt immer der ältere. Liest beide Zeilen frisch aus der Datenbank, damit
 * kein veralteter Zwischenstand überschrieben wird; die Datenbankfunktion
 * prüft das zusätzlich über `aktualisiert_am`.
 */
export async function kontakteZusammenfuehren(idA: string, idB: string): Promise<ZusammenfuehrungsErgebnis> {
  if (idA === idB) throw new Error("Ein Kontakt kann nicht mit sich selbst zusammengeführt werden.");
  if (isTestAccount()) throw new Error("Im Testkonto lassen sich Kontakte nicht zusammenführen.");

  const { data, error } = await supabase.from("kontakte").select("*").in("id", [idA, idB]);
  if (error) throw new Error(error.message);
  const zeilen = (data || []) as KontaktZeile[];
  const a = zeilen.find((z) => z.id === idA);
  const b = zeilen.find((z) => z.id === idB);
  if (!a || !b) throw new Error("Einer der beiden Kontakte ist nicht mehr vorhanden.");
  if (a.geloescht || b.geloescht) throw new Error("Einer der beiden Kontakte liegt schon im Papierkorb.");

  const plan = planeZusammenfuehrung(a, b);
  const { data: antwort, error: rpcFehler } = await (supabase.rpc as any)("kontakte_zusammenfuehren", {
    _behalten: plan.behaltenId,
    _aufloesen: plan.aufloesenId,
    _felder: plan.felder,
    _meta: plan.meta,
    _notiz: plan.notiz,
    _stand: { [a.id]: a.aktualisiert_am ?? null, [b.id]: b.aktualisiert_am ?? null },
  });
  if (fehlendeFunktion(rpcFehler)) throw new ZusammenfuehrenMigrationFehlt();
  if (rpcFehler) throw new Error(rpcFehler.message);

  return {
    behaltenId: plan.behaltenId,
    aufgeloestId: plan.aufloesenId,
    portalKonflikt: !!antwort?.portal_konflikt || plan.portalKonflikt,
    nichtUmgehaengt: Array.isArray(antwort?.nicht_umgehaengt) ? antwort.nicht_umgehaengt : [],
    // Erst jetzt: Die Funktion prüft, dass der neuere wirklich in den älteren
    // zusammengeführt wurde, bevor sie eine Datei anfasst.
    dateienProblem: await zusammengefuehrteDateienVerschieben(plan.behaltenId, plan.aufloesenId),
  };
}
