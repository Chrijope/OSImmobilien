/**
 * Namensabgleich gegen die Profile, fuer die Anwendung nutzbar gemacht.
 *
 * Die Logik selbst liegt unter `supabase/functions/_shared/`, weil die Edge
 * Function sie braucht und aus Deno heraus nicht in `src` greifen kann. Hier
 * wird sie nur weitergereicht, damit die Anwendung nicht eine zweite, leicht
 * abweichende Fassung derselben Regel pflegt. Genau daran hing der Fehler, den
 * das behebt: Das Setter-Skript verglich Namen auf eigene Faust und schrieb bei
 * einem Treffer nur den Namen, nicht die Nutzer-ID.
 */
import {
  findeBeraterNachName,
  normalisiereBeraterName,
  type BeraterProfil,
} from "../../supabase/functions/_shared/berater-namensabgleich";
import { loadAllUsers } from "./loadAllUsers";

export { findeBeraterNachName, normalisiereBeraterName };
export type {
  BeraterProfil,
  BeraterTreffer,
} from "../../supabase/functions/_shared/berater-namensabgleich";

/*
 * Seit dem 22.10.2026 sehen Vertriebspartner nur die Profile ihrer Struktur
 * (Migration 20261022122000). Ein unsichtbarer Namensvetter darf einen Namen
 * trotzdem nicht eindeutig machen: Sonst zaehlte ein alter Datensatz ohne
 * Kennung, der dem Namensvetter gehoert, als eigener. Die Datenbank nennt
 * deshalb die Namen, die unter allen Profilen mehrfach vorkommen, ohne die
 * Personen dahinter. Sie werden einmal geladen und als verdeckte Eintraege
 * an die Liste gehaengt.
 */
let mehrfacheNamen: Set<string> | null = null;
let mehrfacheNamenLaden: Promise<void> | null = null;

export function mehrfacheNamenVorladen(): Promise<void> {
  if (mehrfacheNamenLaden) return mehrfacheNamenLaden;
  mehrfacheNamenLaden = (async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await (supabase as unknown as {
        rpc: (n: string) => Promise<{ data: string[] | null; error: unknown }>;
      }).rpc("mehrfache_beraternamen");
      if (!error && Array.isArray(data)) mehrfacheNamen = new Set(data.map((n) => normalisiereBeraterName(n)));
    } catch {
      // Ohne die Funktion (Migration fehlt, Test) bleibt es beim sichtbaren Bestand.
    }
  })();
  return mehrfacheNamenLaden;
}

/** Haengt fuer mehrfach vorkommende Namen einen verdeckten Eintrag an, falls der Namensvetter unsichtbar ist. */
export function mitVerdecktenNamensvettern(liste: BeraterProfil[], mehrfach: ReadonlySet<string> | null = mehrfacheNamen): BeraterProfil[] {
  if (!mehrfach || mehrfach.size === 0) return liste;
  const anzahl = new Map<string, number>();
  for (const u of liste) {
    const n = normalisiereBeraterName(u.name);
    anzahl.set(n, (anzahl.get(n) || 0) + 1);
  }
  const verdeckt = [...mehrfach]
    .filter((n) => (anzahl.get(n) || 0) === 1)
    .map((n) => ({ id: `verdeckt:${n}`, name: n }));
  return verdeckt.length ? [...liste, ...verdeckt] : liste;
}

/** Die Nutzerliste, falls der Aufrufer keine mitgibt. Leer, wenn sie nicht lesbar ist. */
function nutzerListe(nutzer?: BeraterProfil[]): BeraterProfil[] {
  if (nutzer) return nutzer;
  if (typeof window !== "undefined") void mehrfacheNamenVorladen();
  try {
    return mitVerdecktenNamensvettern(loadAllUsers().map((u) => ({ id: u.id, name: u.name })));
  } catch {
    return [];
  }
}

/**
 * Die Kennung zu einem Namen, nur bei genau einem Treffer.
 *
 * Rueckfall fuer Stellen, an denen nur ein Name vorliegt (alte Datensaetze,
 * Freitextfelder). Zwei Gleichnamige heissen: keine Kennung. Geraten wird
 * nicht, stattdessen steht eine Warnung im Log.
 */
export function kennungZuName(name: string | null | undefined, nutzer?: BeraterProfil[]): string | undefined {
  const treffer = findeBeraterNachName(name, nutzerListe(nutzer));
  if (treffer.art === "mehrdeutig") {
    console.warn(`Name passt auf ${treffer.anzahl} Nutzer, deshalb keine Zuordnung. Bitte ueber die Kennung zuordnen.`);
  }
  return treffer.art === "eindeutig" ? treffer.id : undefined;
}

/**
 * Die Kennung, die zu Kennung und Name eines Datensatzes gehoert.
 *
 * Fuer Felder, deren Name sich aendern laesst, ohne dass die Kennung
 * mitzieht (etwa `setter` und `setterId`: Der Trigger trg_kontakt_zuordnung
 * setzt eine geaenderte setterId fuer Nicht-Admins still zurueck, der Name
 * aendert sich trotzdem). Die Kennung gilt nur, wenn der Name der Person
 * dahinter zum eingetragenen Namen passt. Passt er nicht, zaehlt der Name,
 * aber nur eindeutig; sonst keine Zuordnung. Ist die Person hinter der
 * Kennung nicht zu finden oder kein Name eingetragen, gilt die Kennung.
 */
export function kennungMitNamensprobe(
  kennung: string | null | undefined,
  name: string | null | undefined,
  nutzer?: BeraterProfil[],
): string | undefined {
  const liste = nutzerListe(nutzer);
  const id = (kennung || "").trim();
  const gesucht = normalisiereBeraterName(name);
  if (id) {
    const dahinter = liste.find((u) => u.id === id);
    if (!gesucht || !dahinter || normalisiereBeraterName(dahinter.name) === gesucht) return id;
    console.warn("Kennung und Name passen nicht zusammen, es zaehlt der eindeutige Name.");
  }
  return gesucht ? kennungZuName(name, liste) : undefined;
}

/**
 * Ist diese Person gemeint? Kennung mit Namensprobe, siehe
 * `kennungMitNamensprobe`. Ohne Kennung und ohne Nutzerliste bleibt es beim
 * bisherigen Namensvergleich.
 */
export function istPerson(
  kennung: string | null | undefined,
  name: string | null | undefined,
  person: { userId?: string | null; userName?: string | null },
  nutzer?: BeraterProfil[],
): boolean {
  const liste = nutzerListe(nutzer);
  const id = (kennung || "").trim();
  const dahinter = id ? liste.find((u) => u.id === id) : undefined;
  const passt = !!id && (!normalisiereBeraterName(name) || !dahinter
    || normalisiereBeraterName(dahinter.name) === normalisiereBeraterName(name));
  if (passt) return !!person.userId && id === person.userId;
  // Bewusst ohne Warnung: Das laeuft je Zeile einer Liste.
  return nameMeintNutzer(name, person, liste);
}

/** Kommt der Name unter den Nutzern mehrfach vor? Dann taugt er nicht zur Zuordnung. */
export function nameMehrdeutig(name: string | null | undefined, nutzer?: BeraterProfil[]): boolean {
  return findeBeraterNachName(name, nutzerListe(nutzer)).art === "mehrdeutig";
}

/**
 * Meint der Freitextname diesen Nutzer?
 *
 * Nur fuer Datensaetze ohne Kennung. Der Name muss zum Nutzer passen und darf
 * unter allen Nutzern nur einmal vorkommen. Ist die Nutzerliste leer oder der
 * Nutzer nicht darin (etwa im Test ohne geladene Profile), gilt der
 * Namensvergleich wie bisher, damit nichts verschwindet, was vorher da war.
 */
export function nameMeintNutzer(
  name: string | null | undefined,
  person: { userId?: string | null; userName?: string | null },
  nutzer?: BeraterProfil[],
): boolean {
  const gesucht = normalisiereBeraterName(name);
  if (!gesucht || gesucht !== normalisiereBeraterName(person.userName)) return false;
  const treffer = nutzerListe(nutzer).filter((u) => normalisiereBeraterName(u.name) === gesucht);
  if (treffer.length > 1) return false;
  if (treffer.length === 1 && person.userId) return treffer[0].id === person.userId;
  return true;
}
