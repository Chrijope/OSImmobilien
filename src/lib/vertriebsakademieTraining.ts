/**
 * Karteikarten, Tagesimpuls und Profi-Impuls der Woche.
 *
 * Alles hier ist reine Auswahl aus vorhandenem Material. Es gibt keinen
 * Zufallsgenerator: Die Auswahl hängt am Datum, damit alle Partner am selben
 * Tag denselben Impuls sehen und ein Neuladen der Seite nichts verschiebt.
 */

import lexikon from "@/data/lexikon.json";
import {
  VERTRIEBSAKADEMIE_KAPITEL,
  type AkademieAufgabe,
} from "@/lib/vertriebsakademieContent";

// ── Karteikarten ──────────────────────────────────────────────────────────

export interface Karteikarte {
  id: string;
  vorderseite: string;
  rueckseite: string;
  quelle: "lexikon" | "zahlen";
}

const LEXIKON = lexikon as { term: string; definition: string }[];

/** Definitionen sind teils sehr lang. Für eine Karte reicht der erste Satz. */
function ersterSatz(text: string, maxLaenge = 320): string {
  const sauber = text.replace(/\s+/g, " ").trim();
  if (sauber.length <= maxLaenge) return sauber;
  const punkt = sauber.indexOf(". ");
  if (punkt > 40 && punkt < maxLaenge) return sauber.slice(0, punkt + 1);
  return sauber.slice(0, maxLaenge).trimEnd() + " …";
}

export function alleKarteikarten(): Karteikarte[] {
  const ausLexikon: Karteikarte[] = LEXIKON.map((e, i) => ({
    id: `lex-${i}`,
    vorderseite: e.term,
    rueckseite: ersterSatz(e.definition),
    quelle: "lexikon",
  }));

  // Kapitel R trägt die Zahlen, die im Kundengespräch abrufbar sein müssen.
  const zahlenKapitel = VERTRIEBSAKADEMIE_KAPITEL.find((k) => k.slug === "glossar-zahlen");
  const ausZahlen: Karteikarte[] = [];
  zahlenKapitel?.sections.forEach((sec) => {
    (sec.bullets ?? []).forEach((b, i) => {
      // Bullets der Form "Begriff: Wert" lassen sich als Karte lesen.
      const trenner = b.indexOf(":");
      if (trenner > 3 && trenner < 70) {
        ausZahlen.push({
          id: `zahl-${sec.id}-${i}`,
          vorderseite: b.slice(0, trenner).trim(),
          rueckseite: b.slice(trenner + 1).trim(),
          quelle: "zahlen",
        });
      }
    });
  });

  return [...ausZahlen, ...ausLexikon];
}

// ── Tagesauswahl ──────────────────────────────────────────────────────────

/** Tagesnummer seit 1970, als stabile Saat für die Auswahl. */
export function tagesnummer(datum = new Date()): number {
  return Math.floor(
    Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()) / 86400000,
  );
}

export function wochennummer(datum = new Date()): number {
  return Math.floor(tagesnummer(datum) / 7);
}

/** Wählt n Einträge, abhängig von der Saat, ohne Wiederholung innerhalb der Auswahl. */
export function waehleFuerSaat<T>(items: T[], anzahl: number, saat: number): T[] {
  if (items.length === 0) return [];
  const gewaehlt: T[] = [];
  const benutzt = new Set<number>();
  let x = saat * 2654435761 % 2147483647;
  while (gewaehlt.length < Math.min(anzahl, items.length)) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const idx = Math.abs(x) % items.length;
    if (!benutzt.has(idx)) {
      benutzt.add(idx);
      gewaehlt.push(items[idx]);
    }
  }
  return gewaehlt;
}

// ── Tagesimpuls ───────────────────────────────────────────────────────────

export interface ImpulsAufgabe {
  slug: string;
  kapitelTitel: string;
  aufgabe: AkademieAufgabe;
}

/** Alle Aufgaben, die im gewählten Pfad sichtbar sind, kapitelübergreifend. */
export function aufgabenPool(
  zielgruppe: "alle" | "quereinsteiger" | "profi",
  typen?: AkademieAufgabe["typ"][],
): ImpulsAufgabe[] {
  const pool: ImpulsAufgabe[] = [];
  for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
    for (const sec of kap.sections) {
      for (const a of sec.aufgaben ?? []) {
        const pfad = a.pfad ?? "beide";
        const sichtbar = pfad === "beide" || zielgruppe === "alle" || pfad === zielgruppe;
        if (!sichtbar) continue;
        if (typen && !typen.includes(a.typ)) continue;
        pool.push({ slug: kap.slug, kapitelTitel: kap.titel, aufgabe: a });
      }
    }
  }
  return pool;
}

/** Drei Aufgaben für den heutigen Tag, kurz gehalten. */
export function tagesimpuls(
  zielgruppe: "alle" | "quereinsteiger" | "profi",
  datum = new Date(),
): ImpulsAufgabe[] {
  const pool = aufgabenPool(zielgruppe, ["quiz", "zuordnen", "rechnen"]);
  // Lange Quizreihen taugen nicht für sechzig Sekunden.
  const kurz = pool.filter((p) => p.aufgabe.typ !== "quiz" || p.aufgabe.fragen.length <= 2);
  return waehleFuerSaat(kurz, 3, tagesnummer(datum));
}

// ── Profi-Impuls der Woche ────────────────────────────────────────────────

export interface ProfiImpuls {
  slug: string;
  kapitelNummer: string;
  kapitelTitel: string;
  abschnittId: string;
  abschnitt: string;
  text: string;
}

/** Alle Profi-Tipps der Akademie, kapitelübergreifend. */
export function alleProfiImpulse(): ProfiImpuls[] {
  const liste: ProfiImpuls[] = [];
  for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
    for (const sec of kap.sections) {
      if (sec.profiTipp) {
        liste.push({
          slug: kap.slug,
          kapitelNummer: kap.nummer,
          kapitelTitel: kap.titel,
          abschnittId: sec.id,
          abschnitt: sec.ueberschrift,
          text: sec.profiTipp,
        });
      }
    }
  }
  return liste;
}

/**
 * Der Impuls dieser Woche.
 *
 * Die Profi-Tipps liegen heute verteilt in den Kapiteln und werden nur
 * gefunden, wenn jemand das Kapitel öffnet. Genau das tut ein erfahrener
 * Partner aber nicht. Also wird einer pro Woche nach vorne geholt.
 */
export function profiImpulsDerWoche(datum = new Date()): ProfiImpuls | null {
  const alle = alleProfiImpulse();
  if (!alle.length) return null;
  return alle[wochennummer(datum) % alle.length];
}
