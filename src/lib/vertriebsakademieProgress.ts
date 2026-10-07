// Vertriebsakademie – Fortschritt & Gamification
//
// Der Fortschritt liegt in der Datenbank (`va_fortschritt`), der lokale
// Speicher ist nur noch Zwischenspeicher für den sofortigen Seitenaufbau.
//
// Vorher war es umgekehrt: Der lokale Speicher war die Wahrheit, in die
// Datenbank gingen nur Zusammenfassungen je Kapitel, und gelesen wurde von
// dort nie. Wer am Handy lernte und danach am Rechner weitermachte, fing bei
// null an, und nach sieben Tagen ohne Nutzung räumte Safari den Stand ohnehin
// weg.
//
// Der Fortschrittsbalken zählt Lektionen und Kapitel, nicht einzelne Haken:
// Alle Lektionen und alle Kapitel abgeschlossen sind 100 Prozent. Ein Kapitel,
// das jemand als abgeschlossen markiert, gilt dabei als ganz erledigt, auch
// wenn er nicht jede einzelne Übung abgehakt hat.

import { useSyncExternalStore } from "react";
import {
  VERTRIEBSAKADEMIE_KAPITEL,
  aufgabenFuerPfad,
  type AkademieKapitel,
  type AkademieSection,
} from "@/lib/vertriebsakademieContent";
import {
  abschnittHatInhalt,
  getZielgruppe,
  showAdvancedUebung,
  type AkademieZielgruppe,
} from "@/lib/vertriebsakademieZielgruppe";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "vertriebsakademie_progress_v1";

/** Ergebnis einer prüfbaren Aufgabe (Quiz, Sortieren, Zuordnen, Rechnen, Szenario). */
export interface VaAufgabenErgebnis {
  versuche: number;
  geloest: boolean;
  /** Punkte, die tatsächlich vergeben wurden. Erster Versuch zählt voll. */
  punkte: number;
  /** Zeitstempel des letzten Versuchs, ISO. */
  zuletzt?: string;
}

export interface VaProgressState {
  checks: Record<string, boolean>;       // key: `${slug}::${sectionId}::${index}`
  uebungen: Record<string, boolean>;      // key: `${slug}::${uebungId}`
  kapitelDone: Record<string, boolean>;   // key: slug
  /** Abgeschlossene Lektionen. key: `${slug}::${sectionId}` */
  sectionsDone: Record<string, boolean>;
  answers: Record<string, string>;        // key: `${slug}::${uebungId}` → Antworttext
  aufgaben: Record<string, VaAufgabenErgebnis>; // key: `${slug}::${aufgabeId}`
  /** Gewählter Weg im Abwägungsfall. key: `${slug}::${fallId}` → Weg-ID */
  abwaegung: Record<string, string>;
  /**
   * Tage mit mindestens einer richtig gelösten Aufgabe, als "JJJJ-MM-TT".
   *
   * Bewusst die Tage selbst und nicht eine fertige Zählerzahl: Nur so lässt
   * sich die Serie beim Gerätewechsel sauber zusammenführen (Vereinigung
   * zweier Mengen) und jederzeit neu berechnen.
   */
  aktiveTage: string[];
  /**
   * Kapitel, für die das Konfetti schon lief. key: slug, dazu `__akademie`
   * für die große Feier am Ende. Optional, damit ältere Stände und Tests
   * ohne das Feld weiter gültig sind. Liegt wie alles andere im JSONB-Stand
   * von `va_fortschritt`, braucht also keine Migration.
   */
  gefeiert?: Record<string, boolean>;
}

/** Schlüssel in `gefeiert` für die Feier, wenn alle Kapitel durch sind. */
export const GEFEIERT_AKADEMIE = "__akademie";

const empty = (): VaProgressState => ({
  checks: {}, uebungen: {}, kapitelDone: {}, sectionsDone: {},
  answers: {}, aufgaben: {}, abwaegung: {}, aktiveTage: [], gefeiert: {},
});

// ── Die Serie ─────────────────────────────────────────────────────────────
//
// Die Serie zählt Tage in Folge, an denen mindestens eine Aufgabe richtig
// gelöst wurde. Ausdrücklich nicht: Seitenaufrufe, Scrollen, angeklickte
// Haken oder ein umgedrehte Karteikarte. Eine Serie, die schon vom Öffnen
// der Seite hochzählt, sagt nichts über Können und ist damit wertlos.
//
// Sie bestraft auch nicht. Wer aussetzt, verliert die Serie, aber keine
// Punkte, keine XP und keinen Kapitelfortschritt. Die Serie ist ein
// zusätzlicher Grund wiederzukommen, kein Pfand.

/** Höchstzahl gespeicherter Tage. Reicht für jede sinnvolle Serie und hält den Stand klein. */
export const SERIE_MAX_TAGE = 180;

/** Tagesschlüssel "JJJJ-MM-TT" nach Ortszeit, damit der Tageswechsel dort liegt, wo der Partner ihn erlebt. */
export function tagesSchluessel(datum: Date = new Date()): string {
  const m = String(datum.getMonth() + 1).padStart(2, "0");
  const t = String(datum.getDate()).padStart(2, "0");
  return `${datum.getFullYear()}-${m}-${t}`;
}

/** Der Tag davor, rein auf dem Schlüssel gerechnet. UTC vermeidet Sommerzeitsprünge. */
export function tagDavor(tag: string): string {
  const [j, m, t] = tag.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t) - 86400000);
  return tagesSchluessel(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Sortiert, entdoppelt und auf die jüngsten `SERIE_MAX_TAGE` begrenzt. */
function normalisiereTage(tage: readonly string[]): string[] {
  return [...new Set(tage.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t)))]
    .sort()
    .slice(-SERIE_MAX_TAGE);
}

function vereinigeTage(a: readonly string[] = [], b: readonly string[] = []): string[] {
  return normalisiereTage([...a, ...b]);
}

/**
 * Fügt einen Tag hinzu. Steht er schon drin und ist die Liste in Ordnung,
 * kommt sie unverändert zurück, damit React nicht ohne Grund neu rendert.
 */
export function mitAktivemTag(tage: readonly string[], tag: string): string[] {
  if (tage.includes(tag) && tage.length <= SERIE_MAX_TAGE) return tage as string[];
  return normalisiereTage([...tage, tag]);
}

export interface VaSerie {
  /** Tage in Folge bis heute (oder bis gestern, solange heute noch offen ist). */
  laenge: number;
  /** Längste je erreichte Serie. Sie bleibt auch nach einem Abbruch stehen. */
  laengste: number;
  /** Wurde heute schon etwas gelöst? */
  heuteAktiv: boolean;
  /** Die letzten sieben Tage, ältester zuerst, für die Punktreihe in der Anzeige. */
  letzteTage: { tag: string; aktiv: boolean }[];
}

/**
 * Berechnet die Serie aus den aktiven Tagen.
 *
 * Lebendig ist eine Serie, solange der letzte aktive Tag heute oder gestern
 * war. Gestern zählt mit, weil der heutige Tag noch nicht vorbei ist: Wer
 * morgens die Akademie öffnet, soll seine Serie sehen und nicht erst
 * verdienen. Erst wenn ein ganzer Tag ohne Lösung vergangen ist, steht sie
 * wieder auf null.
 */
export function berechneSerie(
  tage: readonly string[] = [],
  heute: string = tagesSchluessel(),
): VaSerie {
  const menge = new Set(normalisiereTage(tage));
  const heuteAktiv = menge.has(heute);

  // Aktuelle Serie: vom jüngsten zählenden Tag aus rückwärts.
  let laenge = 0;
  let zeiger = heuteAktiv ? heute : tagDavor(heute);
  while (menge.has(zeiger)) {
    laenge++;
    zeiger = tagDavor(zeiger);
  }

  // Längste Serie: der längste Lauf aufeinanderfolgender Tage überhaupt.
  let laengste = 0;
  let lauf = 0;
  let vorheriger: string | null = null;
  for (const tag of [...menge].sort()) {
    lauf = vorheriger !== null && tagDavor(tag) === vorheriger ? lauf + 1 : 1;
    vorheriger = tag;
    if (lauf > laengste) laengste = lauf;
  }

  const letzteTage: { tag: string; aktiv: boolean }[] = [];
  let tag = heute;
  for (let i = 0; i < 7; i++) {
    letzteTage.unshift({ tag, aktiv: menge.has(tag) });
    tag = tagDavor(tag);
  }

  return { laenge, laengste: Math.max(laengste, laenge), heuteAktiv, letzteTage };
}

function read(): VaProgressState {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw);
    return {
      checks: p.checks || {},
      uebungen: p.uebungen || {},
      kapitelDone: p.kapitelDone || {},
      sectionsDone: p.sectionsDone || {},
      answers: p.answers || {},
      aufgaben: p.aufgaben || {},
      abwaegung: p.abwaegung || {},
      aktiveTage: Array.isArray(p.aktiveTage) ? p.aktiveTage : [],
      gefeiert: p.gefeiert || {},
    };
  } catch { return empty(); }
}

let state: VaProgressState = read();
const listeners = new Set<() => void>();

function emit() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  listeners.forEach((l) => l());
  planeCloudSicherung();
}

// ── Der vollständige Stand in der Datenbank ───────────────────────────────
//
// Der lokale Speicher ist nur noch Zwischenspeicher, damit die Seite sofort
// etwas anzeigen kann. Die Wahrheit steht in `va_fortschritt`.

/** Zusammenführen zweier Stände. Es wird nur ergänzt, nie etwas entfernt. */
function vereinige(a: VaProgressState, b: VaProgressState): VaProgressState {
  const flaggen = (x: Record<string, boolean>, y: Record<string, boolean>) => {
    const out: Record<string, boolean> = { ...x };
    for (const [k, v] of Object.entries(y)) if (v) out[k] = true;
    return out;
  };
  const aufgaben: Record<string, VaAufgabenErgebnis> = { ...a.aufgaben };
  for (const [k, v] of Object.entries(b.aufgaben)) {
    const bisher = aufgaben[k];
    // Bei zwei Ständen gewinnt der bessere: gelöst schlägt ungelöst, sonst
    // die höhere Punktzahl. Versuche werden nicht addiert, sonst würde ein
    // Gerätewechsel die Zählung aufblähen.
    if (!bisher) { aufgaben[k] = v; continue; }
    aufgaben[k] = {
      versuche: Math.max(bisher.versuche, v.versuche),
      geloest: bisher.geloest || v.geloest,
      punkte: Math.max(bisher.punkte, v.punkte),
      zuletzt: (v.zuletzt ?? "") > (bisher.zuletzt ?? "") ? v.zuletzt : bisher.zuletzt,
    };
  }
  return {
    checks: flaggen(a.checks, b.checks),
    uebungen: flaggen(a.uebungen, b.uebungen),
    kapitelDone: flaggen(a.kapitelDone, b.kapitelDone),
    sectionsDone: flaggen(a.sectionsDone, b.sectionsDone),
    // Freitextantworten: die nicht leere gewinnt, bei zweien die aus der Wolke.
    answers: { ...a.answers, ...Object.fromEntries(Object.entries(b.answers).filter(([, v]) => v)) },
    abwaegung: { ...a.abwaegung, ...b.abwaegung },
    aufgaben,
    // Die aktiven Tage sind eine Menge. Wer morgens am Handy und abends am
    // Rechner arbeitet, soll nicht zwei halbe Serien haben.
    aktiveTage: vereinigeTage(a.aktiveTage, b.aktiveTage),
    // Einmal gefeiert bleibt gefeiert, sonst gäbe es das Konfetti auf jedem Gerät neu.
    gefeiert: flaggen(a.gefeiert ?? {}, b.gefeiert ?? {}),
  };
}

let sicherungGeplant: ReturnType<typeof setTimeout> | null = null;

/**
 * Sichert den Stand gebündelt. Ohne die kurze Verzögerung würde jeder einzelne
 * Haken eine eigene Schreiboperation auslösen.
 */
function planeCloudSicherung() {
  if (typeof window === "undefined") return;
  if (sicherungGeplant) clearTimeout(sicherungGeplant);
  sicherungGeplant = setTimeout(() => { void sichereStand(); }, 800);
}

async function sichereStand(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("va_fortschritt")
      .upsert({ user_id: user.id, state: state as never }, { onConflict: "user_id" });
    if (error) throw error;
  } catch (e) {
    // Nicht stumm: Genau der verschluckte Fehler war der Grund, warum niemand
    // gemerkt hat, dass der Fortschritt nie ankam.
    console.error("Vertriebsakademie: Fortschritt konnte nicht gesichert werden.", e);
  }
}

let ladenLaeuft: Promise<void> | null = null;
let bereitsGeladen = false;

// Ob der erste Abgleich mit der Datenbank durch ist. Wer auf Übergänge im
// Stand reagiert (das Konfetti), darf erst danach hinsehen, sonst feiert er
// den Sprung, den der geladene Stand beim Ankommen macht.
let fortschrittGeladen = false;
const geladenListeners = new Set<() => void>();
function markiereGeladen() {
  if (fortschrittGeladen) return;
  fortschrittGeladen = true;
  geladenListeners.forEach((l) => l());
}

/**
 * Holt den Stand aus der Datenbank und führt ihn mit dem lokalen zusammen.
 * Genau dieser Rückweg fehlte bisher vollständig.
 */
export function ladeVaFortschritt(): Promise<void> {
  if (ladenLaeuft) return ladenLaeuft;
  ladenLaeuft = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("va_fortschritt")
        .select("state")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;

      const ausDb = data?.state as Partial<VaProgressState> | undefined;
      const vorher = JSON.stringify(state);
      state = vereinige(state, { ...empty(), ...(ausDb ?? {}) });

      if (JSON.stringify(state) !== vorher) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Speicher voll oder gesperrt */ }
        listeners.forEach((l) => l());
      }
      // Was nur lokal vorlag, wandert jetzt hinauf.
      await sichereStand();
    } catch (e) {
      console.error("Vertriebsakademie: Fortschritt konnte nicht geladen werden.", e);
    } finally {
      ladenLaeuft = null;
      markiereGeladen();
    }
  })();
  return ladenLaeuft;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) { state = read(); listeners.forEach((l) => l()); }
  });
}

// ── Cloud-Sync (async, non-blocking) ──────────────────────────────────────
async function cloudUpsertAnswer(slug: string, uebungId: string, titel: string, antwort: string, erledigt: boolean, xp: number) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("va_partner_antworten").upsert({
      user_id: user.id,
      kapitel_slug: slug,
      uebung_id: uebungId,
      uebung_titel: titel,
      antwort,
      erledigt,
      xp,
    }, { onConflict: "user_id,kapitel_slug,uebung_id" });
  } catch { /* silent */ }
}

async function cloudUpsertFortschritt(slug: string, stats: { doneChecks: number; doneUebungen: number; xp: number; pct: number; kapitelDone: boolean }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("va_partner_fortschritt").upsert({
      user_id: user.id,
      kapitel_slug: slug,
      checks_done: stats.doneChecks,
      uebungen_done: stats.doneUebungen,
      xp_total: stats.xp,
      pct: stats.pct,
      kapitel_abgeschlossen: stats.kapitelDone,
    }, { onConflict: "user_id,kapitel_slug" });
  } catch { /* silent */ }
}

async function cloudUpsertAufgabe(slug: string, aufgabeId: string, e: VaAufgabenErgebnis) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("va_aufgaben_ergebnisse" as never).upsert({
      user_id: user.id,
      kapitel_slug: slug,
      aufgabe_id: aufgabeId,
      versuche: e.versuche,
      geloest: e.geloest,
      punkte: e.punkte,
    } as never, { onConflict: "user_id,kapitel_slug,aufgabe_id" });
  } catch { /* silent */ }
}

async function cloudUpsertAbwaegung(slug: string, fallId: string, wegId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("va_abwaegung_antworten" as never).upsert({
      user_id: user.id,
      kapitel_slug: slug,
      fall_id: fallId,
      weg_id: wegId,
    } as never, { onConflict: "user_id,kapitel_slug,fall_id" });
  } catch { /* silent */ }
}

// ── Einmalige Reparatur verfälschter Versuchszähler ───────────────────────
//
// Anlass: In AkademieQuiz.tsx hing der Melde-Effekt an der Identität von
// onFertig und lief deshalb endlos (React-Fehler 185, behoben in fbbc374b).
// Jeder Durchlauf hat setAufgabe mit korrekt = false aufgerufen. Gemessen
// wurden 51 Versuche für eine Aufgabe, die niemand angefasst hatte. Sichtbare
// Folgen: die Versuchsanzeige im Aufgabenrahmen, halbe Punkte ab dem zweiten
// Versuch und das dauerhaft unerreichbare Abzeichen "Fehlerfrei".
//
// Zeitpunkt: Die Reparatur läuft beim ersten Laden dieses Moduls nach dem
// Einspielen der Korrektur, genau einmal je Browser, gemerkt über einen
// eigenen Schlüssel im localStorage.
//
// Gelöste Aufgaben bleiben ausdrücklich unberührt. Bei ihnen steckt echter
// Fortschritt in geloest und punkte, und beides lässt sich nicht mehr sauber
// von den Schleifenzahlen trennen. Ein zu hoch stehender Zähler ist harmlos,
// ein verlorener Fortschritt nicht. Bei einer nicht gelösten Aufgabe stehen
// die Punkte ohnehin immer auf 0, dort ist das Zurücksetzen verlustfrei.
//
// Diese Reparatur darf nach einigen Monaten wieder entfernt werden, sobald
// alle Partner die Akademie einmal geöffnet haben.
const REPARATUR_KEY = "vertriebsakademie_reparatur_versuche_v1";

/**
 * Ab dieser Zahl gilt ein Versuchszähler als Schleifenschaden.
 *
 * Zehn Fehlversuche an derselben Aufgabe kommen von Hand praktisch nicht vor,
 * die Schleife hat 51 geschafft. Wer wirklich zehnmal falsch geantwortet hat,
 * verliert nichts: Ohne Lösung gibt es keine Punkte, zurückgesetzt wird allein
 * der Zähler.
 */
export const SCHLEIFEN_SCHWELLE = 10;

/**
 * Setzt den Versuchszähler unplausibel oft "versuchter", aber nicht gelöster
 * Aufgaben auf 0. Rein rechnend, damit es sich prüfen lässt.
 */
export function bereinigeSchleifenZaehler(
  s: VaProgressState,
): { next: VaProgressState; bereinigt: string[] } {
  const bereinigt: string[] = [];
  const aufgaben: Record<string, VaAufgabenErgebnis> = { ...s.aufgaben };
  for (const [key, e] of Object.entries(s.aufgaben)) {
    if (!e || e.geloest) continue;                      // harte Grenze: Gelöstes bleibt
    if ((e.versuche ?? 0) < SCHLEIFEN_SCHWELLE) continue;
    aufgaben[key] = { ...e, versuche: 0 };
    bereinigt.push(key);
  }
  if (bereinigt.length === 0) return { next: s, bereinigt };
  return { next: { ...s, aufgaben }, bereinigt };
}

/**
 * Führt die Reparatur genau einmal je Browser aus und schreibt das Ergebnis in
 * die Datenbank zurück, damit die Auswertung der Leitung mitzieht.
 * Gibt die bereinigten Schlüssel zurück, leere Liste heißt: nichts zu tun.
 */
export function reparaturEinmalAusfuehren(): string[] {
  if (typeof window === "undefined") return [];
  try {
    if (localStorage.getItem(REPARATUR_KEY)) return [];
    // Merker sofort setzen, damit die Reparatur auch dann nicht erneut läuft,
    // wenn es gar nichts zu bereinigen gab.
    localStorage.setItem(REPARATUR_KEY, new Date().toISOString());
  } catch {
    return [];
  }
  const { next, bereinigt } = bereinigeSchleifenZaehler(state);
  if (bereinigt.length === 0) return [];
  state = next;
  emit();
  for (const key of bereinigt) {
    const trenner = key.indexOf("::");
    if (trenner < 0) continue;
    cloudUpsertAufgabe(key.slice(0, trenner), key.slice(trenner + 2), state.aufgaben[key]);
  }
  return bereinigt;
}

if (typeof window !== "undefined") reparaturEinmalAusfuehren();

function syncKapitelToCloud(slug: string) {
  const kap = VERTRIEBSAKADEMIE_KAPITEL.find((k) => k.slug === slug);
  if (!kap) return;
  const stats = computeKapitelStats(kap, state);
  cloudUpsertFortschritt(slug, {
    doneChecks: stats.doneChecks,
    doneUebungen: stats.doneUebungen,
    xp: stats.xp,
    pct: stats.pct,
    kapitelDone: stats.isDone,
  });
}

// ── Bremse gegen Zählerschleifen ──────────────────────────────────────────
/** Zeitpunkt des zuletzt gezählten Versuchs je Aufgabenschlüssel, nur im Arbeitsspeicher. */
const letzterVersuchMs: Record<string, number> = {};
const VERSUCH_MINDESTABSTAND_MS = 1000;
let unterdrueckteVersuche = 0;

/** Wie oft die Bremse gegriffen hat. Nur zur Diagnose, jeder Wert über 0 ist ein Fehlerzeichen. */
export function unterdrueckteVersucheGesamt(): number { return unterdrueckteVersuche; }

export const vaProgress = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    // Beim ersten Anmelden einer Ansicht den Stand aus der Datenbank holen.
    // Bewusst hier und nicht in jeder der zwanzig Ansichten einzeln: So kann
    // niemand den Abgleich versehentlich vergessen, und mehrfaches Anmelden
    // loest nur einen Ladevorgang aus.
    if (!bereitsGeladen) {
      bereitsGeladen = true;
      void ladeVaFortschritt();
    }
    return () => listeners.delete(fn);
  },
  get(): VaProgressState { return state; },
  toggleCheck(slug: string, sectionId: string, idx: number) {
    const key = `${slug}::${sectionId}::${idx}`;
    state = { ...state, checks: { ...state.checks, [key]: !state.checks[key] } };
    emit();
    syncKapitelToCloud(slug);
  },
  toggleUebung(slug: string, uebungId: string) {
    const key = `${slug}::${uebungId}`;
    state = { ...state, uebungen: { ...state.uebungen, [key]: !state.uebungen[key] } };
    emit();
    const kap = VERTRIEBSAKADEMIE_KAPITEL.find((k) => k.slug === slug);
    const u = kap?.sections.flatMap(s => s.uebungen || []).find(x => x.id === uebungId);
    const answer = state.answers[key] || "";
    cloudUpsertAnswer(slug, uebungId, u?.titel || uebungId, answer, !!state.uebungen[key], u?.xp ?? 20);
    syncKapitelToCloud(slug);
  },
  setAnswer(slug: string, uebungId: string, antwort: string) {
    const key = `${slug}::${uebungId}`;
    state = { ...state, answers: { ...state.answers, [key]: antwort } };
    emit();
    // Auto-erledigt sobald Mindest-Zeichen erreicht
    const kap = VERTRIEBSAKADEMIE_KAPITEL.find((k) => k.slug === slug);
    const u = kap?.sections.flatMap(s => s.uebungen || []).find(x => x.id === uebungId);
    if (u) {
      const need = u.mindestZeichen ?? 20;
      const shouldBeDone = antwort.trim().length >= need;
      if (shouldBeDone !== !!state.uebungen[key]) {
        state = { ...state, uebungen: { ...state.uebungen, [key]: shouldBeDone } };
        emit();
      }
      cloudUpsertAnswer(slug, uebungId, u.titel, antwort, shouldBeDone, u.xp ?? 20);
      syncKapitelToCloud(slug);
    }
  },
  /**
   * Ergebnis einer prüfbaren Aufgabe festhalten.
   *
   * Punkte gibt es nur für eine richtige Lösung, im ersten Versuch voll, danach
   * zur Hälfte. Ein einmal gelöstes Ergebnis wird nicht wieder auf ungelöst
   * zurückgesetzt, wenn jemand die Aufgabe erneut öffnet und abbricht.
   *
   * Die Bremse unten begrenzt den Schaden, falls je wieder ein Effekt in einer
   * Schleife meldet: Derselbe Aufgabenschlüssel zählt höchstens einmal pro
   * Sekunde. Von Hand ist das nicht zu erreichen, dafür braucht es Auswahl und
   * Klick. Das Ergebnis selbst wird trotzdem gespeichert, gebremst wird allein
   * der Zähler.
   */
  setAufgabe(slug: string, aufgabeId: string, korrekt: boolean, punkteBasis = PUNKTE_STANDARD) {
    const key = `${slug}::${aufgabeId}`;
    const bisher = state.aufgaben[key];
    const jetzt = Date.now();
    const zuletztGezaehlt = letzterVersuchMs[key];
    const zaehltAlsVersuch =
      zuletztGezaehlt === undefined || jetzt - zuletztGezaehlt >= VERSUCH_MINDESTABSTAND_MS;
    if (zaehltAlsVersuch) letzterVersuchMs[key] = jetzt;
    else unterdrueckteVersuche++;
    const bisherigeVersuche = bisher?.versuche ?? 0;
    const versuche = zaehltAlsVersuch ? bisherigeVersuche + 1 : Math.max(bisherigeVersuche, 1);
    const schonGeloest = !!bisher?.geloest;
    const punkte = schonGeloest
      ? bisher!.punkte
      : korrekt
        ? (versuche === 1 ? punkteBasis : Math.round(punkteBasis / 2))
        : 0;
    const ergebnis: VaAufgabenErgebnis = {
      versuche,
      geloest: schonGeloest || korrekt,
      punkte,
      zuletzt: new Date().toISOString(),
    };
    // Der heutige Tag zählt für die Serie nur bei einer richtigen Lösung.
    // Ein Fehlversuch, ein Seitenaufruf oder ein gesetzter Haken zählen nicht.
    const aktiveTage = korrekt ? mitAktivemTag(state.aktiveTage, tagesSchluessel()) : state.aktiveTage;
    state = { ...state, aufgaben: { ...state.aufgaben, [key]: ergebnis }, aktiveTage };
    emit();
    cloudUpsertAufgabe(slug, aufgabeId, ergebnis);
    syncKapitelToCloud(slug);
  },
  setAbwaegung(slug: string, fallId: string, wegId: string) {
    const key = `${slug}::${fallId}`;
    state = { ...state, abwaegung: { ...state.abwaegung, [key]: wegId } };
    emit();
    cloudUpsertAbwaegung(slug, fallId, wegId);
  },
  /** Eine Lektion (Abschnitt eines Kapitels) als abgeschlossen markieren. */
  toggleSectionDone(slug: string, sectionId: string) {
    const key = `${slug}::${sectionId}`;
    state = { ...state, sectionsDone: { ...state.sectionsDone, [key]: !state.sectionsDone[key] } };
    emit();
    syncKapitelToCloud(slug);
  },
  setSectionDone(slug: string, sectionId: string, done: boolean) {
    const key = `${slug}::${sectionId}`;
    state = { ...state, sectionsDone: { ...state.sectionsDone, [key]: done } };
    emit();
    syncKapitelToCloud(slug);
  },
  /** Merkt, dass das Konfetti für ein Kapitel (oder die ganze Akademie) gelaufen ist. */
  setGefeiert(key: string) {
    if (state.gefeiert?.[key]) return;
    state = { ...state, gefeiert: { ...(state.gefeiert ?? {}), [key]: true } };
    emit();
  },
  setKapitelDone(slug: string, done: boolean) {
    state = { ...state, kapitelDone: { ...state.kapitelDone, [slug]: done } };
    emit();
    syncKapitelToCloud(slug);
  },
  reset() {
    state = empty();
    for (const k of Object.keys(letzterVersuchMs)) delete letzterVersuchMs[k];
    unterdrueckteVersuche = 0;
    emit();
  },
};

export function useVaProgress(): VaProgressState {
  return useSyncExternalStore(vaProgress.subscribe, vaProgress.get, vaProgress.get);
}

function subscribeGeladen(fn: () => void) {
  geladenListeners.add(fn);
  return () => geladenListeners.delete(fn);
}
function leseGeladen() { return fortschrittGeladen; }

/** Ist der erste Abgleich mit der Datenbank durch (auch bei Fehler oder ohne Anmeldung)? */
export function useVaFortschrittGeladen(): boolean {
  return useSyncExternalStore(subscribeGeladen, leseGeladen, leseGeladen);
}

/** Die Serie des angemeldeten Partners, aus dem Fortschritt gerechnet. */
export function useVaSerie(): VaSerie {
  return berechneSerie(useVaProgress().aktiveTage);
}

// ── XP & Level ────────────────────────────────────────────────────────────
export const XP_PER_CHECK = 5;
export const XP_KAPITEL_DONE = 100;

/**
 * Punkte für prüfbare Aufgaben.
 *
 * Bewusst getrennt von den alten XP: XP zählen Häkchen und Textlänge, diese
 * Punkte zählen ausschließlich richtige Lösungen. Angezeigt werden sie dem
 * Partner nicht, sie sind die belastbare Zahl für die Leitungsansicht.
 */
export const PUNKTE_STANDARD = 10;

export interface VaLevel { name: string; min: number; next?: number; }
export const VA_LEVELS: VaLevel[] = [
  { name: "Rookie", min: 0 },
  { name: "Starter", min: 150 },
  { name: "Aktiv", min: 400 },
  { name: "Profi", min: 800 },
  { name: "Elite", min: 1500 },
  { name: "Champion", min: 2500 },
];

export function xpForLevel(xp: number): { level: VaLevel; nextLevel?: VaLevel; progressPct: number } {
  let level = VA_LEVELS[0];
  for (const l of VA_LEVELS) if (xp >= l.min) level = l;
  const idx = VA_LEVELS.indexOf(level);
  const nextLevel = VA_LEVELS[idx + 1];
  const span = nextLevel ? nextLevel.min - level.min : 1;
  const done = Math.min(xp - level.min, span);
  const progressPct = nextLevel ? Math.round((done / span) * 100) : 100;
  return { level, nextLevel, progressPct };
}

// ── Aggregation ───────────────────────────────────────────────────────────

/**
 * Übungen, die im aktuellen Lernpfad tatsächlich sichtbar sind.
 *
 * Wichtig: Advanced-Übungen werden im Quereinsteiger-Pfad ausgeblendet. Wenn
 * sie trotzdem mitgezählt werden, kann ein Quereinsteiger den Fortschritt nie
 * auf 100 Prozent bringen (Deckel lag bei 88 Prozent, in Kapitel 15 und 16 bei
 * 25 Prozent). Zähler und Anzeige müssen deshalb dieselbe Filterung benutzen.
 */
export function sichtbareUebungen(sec: AkademieSection, z: AkademieZielgruppe) {
  const zeigeAdvanced = showAdvancedUebung(z);
  return (sec.uebungen ?? []).filter((u) => zeigeAdvanced || !u.advanced);
}

export interface KapitelStats {
  slug: string;
  totalChecks: number;
  doneChecks: number;
  totalUebungen: number;
  doneUebungen: number;
  totalAufgaben: number;
  doneAufgaben: number;
  /** Lektionen des Kapitels, also Abschnitte mit Inhalt für diese Zielgruppe. */
  totalLektionen: number;
  doneLektionen: number;
  isDone: boolean;
  pct: number; // 0..100
  xp: number;
  /** Punkte aus richtig gelösten Aufgaben. */
  punkte: number;
}

export function computeKapitelStats(
  kap: AkademieKapitel,
  s: VaProgressState = state,
  z: AkademieZielgruppe = getZielgruppe(),
): KapitelStats {
  let totalChecks = 0, doneChecks = 0, totalUeb = 0, doneUeb = 0, xp = 0;
  let totalAufg = 0, doneAufg = 0, punkte = 0;
  for (const sec of kap.sections) {
    (sec.checkliste || []).forEach((_c, i) => {
      totalChecks++;
      if (s.checks[`${kap.slug}::${sec.id}::${i}`]) { doneChecks++; xp += XP_PER_CHECK; }
    });
    sichtbareUebungen(sec, z).forEach((u) => {
      totalUeb++;
      if (s.uebungen[`${kap.slug}::${u.id}`]) { doneUeb++; xp += (u.xp ?? 20); }
    });
    aufgabenFuerPfad(sec, z).forEach((a) => {
      totalAufg++;
      const e = s.aufgaben[`${kap.slug}::${a.id}`];
      if (e?.geloest) { doneAufg++; punkte += e.punkte; }
    });
  }
  const isDone = !!s.kapitelDone[kap.slug];
  if (isDone) xp += XP_KAPITEL_DONE;

  // Der Balken zählt Lektionen und den Kapitelabschluss, nicht einzelne Haken.
  // Vorher wog jede Checklistenzeile gleich viel wie ein ganzes Kapitel: Wer
  // alle 18 Kapitel abschloss, ohne jede Übung einzeln abzuhaken, stand bei
  // sieben Prozent. Das war für niemanden nachvollziehbar.
  const lektionen = kap.sections.filter((sec) => abschnittHatInhalt(sec, z));
  const totalLektionen = lektionen.length;
  // Ein abgeschlossenes Kapitel gilt als ganz erledigt. Wer den Haken setzt,
  // sagt damit "ich bin durch", und genau das soll der Balken zeigen.
  const doneLektionen = isDone
    ? totalLektionen
    : lektionen.filter((sec) => !!s.sectionsDone[`${kap.slug}::${sec.id}`]).length;

  const total = totalLektionen + 1; // die Lektionen plus das Kapitel selbst
  const done = doneLektionen + (isDone ? 1 : 0);
  const pct = isDone ? 100 : (total > 0 ? Math.round((done / total) * 100) : 0);
  return {
    slug: kap.slug, totalChecks, doneChecks,
    totalUebungen: totalUeb, doneUebungen: doneUeb,
    totalAufgaben: totalAufg, doneAufgaben: doneAufg,
    totalLektionen, doneLektionen,
    isDone, pct, xp, punkte,
  };
}

export interface GlobalStats {
  totalXp: number;
  totalKapitel: number;
  doneKapitel: number;
  totalUebungen: number;
  doneUebungen: number;
  totalChecks: number;
  doneChecks: number;
  totalAufgaben: number;
  doneAufgaben: number;
  totalLektionen: number;
  doneLektionen: number;
  /** Punkte aus richtig geloesten Aufgaben, ueber alle Kapitel. */
  punkte: number;
  overallPct: number;
}

export function computeGlobalStats(
  s: VaProgressState = state,
  z: AkademieZielgruppe = getZielgruppe(),
): GlobalStats {
  let stats: GlobalStats = {
    totalXp: 0, totalKapitel: 0, doneKapitel: 0,
    totalUebungen: 0, doneUebungen: 0,
    totalChecks: 0, doneChecks: 0,
    totalAufgaben: 0, doneAufgaben: 0,
    totalLektionen: 0, doneLektionen: 0, punkte: 0,
    overallPct: 0,
  };
  for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
    const k = computeKapitelStats(kap, s, z);
    stats.totalXp += k.xp;
    stats.totalKapitel += 1;
    stats.doneKapitel += k.isDone ? 1 : 0;
    stats.totalUebungen += k.totalUebungen;
    stats.doneUebungen += k.doneUebungen;
    stats.totalChecks += k.totalChecks;
    stats.doneChecks += k.doneChecks;
    stats.totalAufgaben += k.totalAufgaben;
    stats.doneAufgaben += k.doneAufgaben;
    stats.totalLektionen += k.totalLektionen;
    stats.doneLektionen += k.doneLektionen;
    stats.punkte += k.punkte;
  }
  // Gesamt wie im einzelnen Kapitel: Lektionen und Kapitel zählen, nicht die
  // einzelnen Haken. Alle Lektionen und alle Kapitel erledigt sind 100 Prozent.
  const tot = stats.totalLektionen + stats.totalKapitel;
  const done = stats.doneLektionen + stats.doneKapitel;
  stats.overallPct = tot > 0 ? Math.round((done / tot) * 100) : 0;
  return stats;
}

// ── Badges ────────────────────────────────────────────────────────────────
export interface VaBadge { id: string; name: string; beschreibung: string; erreicht: boolean; }
export function computeBadges(
  s: VaProgressState = state,
  z: AkademieZielgruppe = getZielgruppe(),
): VaBadge[] {
  const g = computeGlobalStats(s, z);
  const total = VERTRIEBSAKADEMIE_KAPITEL.length;
  const quarter = Math.max(1, Math.ceil(total * 0.25));
  const threeQuarter = Math.max(1, Math.ceil(total * 0.75));
  // Können statt Fleiß: Diese drei Siegel hängen nicht daran, wie viel jemand
  // angeklickt hat, sondern daran, dass Aufgaben richtig gelöst wurden.
  const kapitelOhneFehler = VERTRIEBSAKADEMIE_KAPITEL.some((kap) => {
    const aufgaben = kap.sections.flatMap((sec) => aufgabenFuerPfad(sec, z));
    if (aufgaben.length < 3) return false;
    return aufgaben.every((a) => {
      const e = s.aufgaben[`${kap.slug}::${a.id}`];
      return e?.geloest && e.versuche === 1;
    });
  });
  const alleAufgaben = VERTRIEBSAKADEMIE_KAPITEL.flatMap((kap) =>
    kap.sections.flatMap((sec) => aufgabenFuerPfad(sec, z).map((a) => `${kap.slug}::${a.id}`)),
  );
  const geloest = alleAufgaben.filter((k) => s.aufgaben[k]?.geloest).length;
  const testeBestanden = VERTRIEBSAKADEMIE_KAPITEL.filter(
    (kap) => kap.abschlusstest && s.aufgaben[`${kap.slug}::abschlusstest-${kap.slug}`]?.geloest,
  ).length;

  return [
    { id: "grundlagen-meister", name: "Grundlagen-Meister", beschreibung: "Grundlagen-Kapitel abgeschlossen", erreicht: !!s.kapitelDone["grundlagen"] },
    { id: "fehlerfrei", name: "Fehlerfrei", beschreibung: "Ein ganzes Kapitel im ersten Anlauf richtig gelöst", erreicht: kapitelOhneFehler },
    { id: "geuebt", name: "Geübt", beschreibung: "50 Aufgaben richtig gelöst", erreicht: geloest >= 50 },
    { id: "gepruef" + "t", name: "Geprüft", beschreibung: "5 Abschlusstests bestanden", erreicht: testeBestanden >= 5 },
    { id: "erste-schritte", name: "Erste Schritte", beschreibung: "1. Kapitel abgeschlossen", erreicht: g.doneKapitel >= 1 },
    { id: "netzwerker", name: "Netzwerker", beschreibung: "5 Übungen erledigt", erreicht: g.doneUebungen >= 5 },
    { id: "viertel", name: "Auf Kurs", beschreibung: `${quarter} Kapitel abgeschlossen`, erreicht: g.doneKapitel >= quarter },
    { id: "halbzeit", name: "Halbzeit", beschreibung: "50 % Gesamt-Fortschritt", erreicht: g.overallPct >= 50 },
    { id: "endspurt", name: "Endspurt", beschreibung: `${threeQuarter} Kapitel abgeschlossen`, erreicht: g.doneKapitel >= threeQuarter },
    { id: "champion", name: "Vollendet", beschreibung: "Alle Kapitel abgeschlossen", erreicht: g.doneKapitel >= total },
  ];
}