import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  anlageklassePflege,
  anlageklasseZumSchalter,
  istGlobalAnlageklasse,
  istGlobalobjekt,
  objektStruktur,
  portfolioKennzahlen,
} from "@/lib/objektKlassen";
import { springtInDieEinheit } from "@/lib/objektseiteDaten";
import { hausKnopfStand, uebersichtsBelegung } from "@/lib/objektBelegung";
import {
  globalSchalterNachImport,
  hausImCrmGebunden,
} from "../../supabase/functions/_shared/globalobjekt";
import { anlageklasseNachImport } from "../../supabase/functions/investagon-import/mapping";

/**
 * Globalobjekt: EINE Wahrheit, der Schalter `global_objekt` (Christian,
 * 23.09.2026). Anlageklasse „Globalobjekt“ und Schalter stimmen immer überein,
 * in der Objektanlage, im Import und an allen Lesestellen.
 */

const obj = (o: Record<string, unknown> = {}) =>
  ({ id: "o-1", titel: "Haus", wohnungen: [], meta: {}, ...o }) as never;
const we = (id: string) => ({ id, weNr: id, status: "frei", vkGesamt: 100000 }) as never;

describe("Anlageklasse „Globalobjekt“ erkennen", () => {
  it("toleriert Schreibweisen", () => {
    for (const k of ["Globalobjekt", "globalobjekt", "Global-Objekt", "global objekt", " Globalobjekt ", "Globalobjekte", "GLOBAL_OBJEKT"]) {
      expect(istGlobalAnlageklasse(k), k).toBe(true);
    }
  });

  it("verwechselt nichts Ähnliches", () => {
    for (const k of ["Mehrfamilienhaus", "Globalverkauf", "Global", "Objekt", "Eigentumswohnung", "", undefined, null, 5]) {
      expect(istGlobalAnlageklasse(k), String(k)).toBe(false);
    }
  });
});

describe("Die eine Frage: ist es ein Globalobjekt?", () => {
  it("liest nur den Schalter, nie die Anlageklasse", () => {
    expect(istGlobalobjekt({ globalObjekt: true })).toBe(true);
    expect(istGlobalobjekt({ global_objekt: true })).toBe(true);
    expect(istGlobalobjekt({ globalObjekt: false })).toBe(false);
    expect(istGlobalobjekt(obj({ meta: { anlageklasse: "Globalobjekt" } }))).toBe(false);
    expect(istGlobalobjekt(undefined)).toBe(false);
    expect(istGlobalobjekt(null)).toBe(false);
  });

  it("alle Lesestellen folgen dem Schalter, auch beim Altfall mit Klasse ohne Schalter", () => {
    // Der Altfall aus der Portfoliokachel: Klasse „Globalobjekt“, Schalter aus.
    const altfall = obj({ meta: { anlageklasse: "Globalobjekt" }, wohnungen: [we("1")] });
    expect(objektStruktur(altfall)).toBe("einzelwohnung");
    expect(springtInDieEinheit(altfall)).toBe(true);
    expect(hausKnopfStand(altfall, { darfReservieren: true })).toBe("keiner");

    // Nach dem Angleichen: Schalter an, alle Stellen sagen Globalobjekt.
    const angeglichen = obj({ globalObjekt: true, belegung: "frei", meta: { anlageklasse: "Globalobjekt" }, wohnungen: [we("1")] });
    expect(objektStruktur(angeglichen)).toBe("globalobjekt");
    expect(springtInDieEinheit(angeglichen)).toBe(false);
    expect(hausKnopfStand(angeglichen, { darfReservieren: true })).toBe("reservierbar");
    expect(uebersichtsBelegung({ ...(angeglichen as object), belegung: "reserviert" } as never).aufdruck).toBe("Reserviert");
  });

  it("die Portfoliokachel zählt danach unter Anlageklassen und Vermarktungsart gleich", () => {
    const k = portfolioKennzahlen([
      obj({ id: "a", globalObjekt: true, meta: { anlageklasse: "Globalobjekt" }, wohnungen: [we("1"), we("2")] }),
      obj({ id: "b", globalObjekt: true, meta: { anlageklasse: "Globalobjekt" }, wohnungen: [we("3")] }),
      obj({ id: "c", meta: { anlageklasse: "WG-Wohnung" }, wohnungen: [we("4")] }),
    ]);
    expect(k.struktur.globalobjekt).toBe(2);
    expect(k.anlageklassen).toContainEqual(["Globalobjekt", 2]);
  });
});

describe("Objektanlage: Anlageklasse passend zum Schalter", () => {
  it("Schalter an heißt Klasse „Globalobjekt“", () => {
    expect(anlageklasseZumSchalter("", true)).toBe("Globalobjekt");
    expect(anlageklasseZumSchalter("Mehrfamilienhaus", true)).toBe("Globalobjekt");
  });

  it("Schalter aus lässt keine Klasse „Globalobjekt“ stehen, jede andere bleibt", () => {
    expect(anlageklasseZumSchalter("Globalobjekt", false)).toBe("");
    expect(anlageklasseZumSchalter("global-objekt", false)).toBe("");
    expect(anlageklasseZumSchalter("WG-Wohnung", false)).toBe("WG-Wohnung");
    expect(anlageklasseZumSchalter(undefined, false)).toBe("");
  });
});

describe("Objektanlage: wer die Anlageklasse pflegen darf", () => {
  it("sperrt sie bei Investagon-Objekten", () => {
    expect(anlageklassePflege(obj({ meta: { investagonSlug: "proj-1", anlageklasse: "WG-Wohnung" } }))).toBe("investagon");
    // Auch ein reserviertes Investagon-Haus: Investagon führt, der Import schützt die Reservierung.
    expect(anlageklassePflege(obj({ globalObjekt: true, belegung: "reserviert", meta: { investagonSlug: "p" } }))).toBe("investagon");
  });

  it("hält ein reserviertes oder vorgemerktes Haus als Globalobjekt fest", () => {
    expect(anlageklassePflege(obj({ globalObjekt: true, belegung: "reserviert", belegungKundeId: "k-1" }))).toBe("haus_gebunden");
    expect(anlageklassePflege(obj({ globalObjekt: true, belegung: "verkauft" }))).toBe("haus_gebunden");
    const bald = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    expect(anlageklassePflege(obj({ globalObjekt: true, belegung: "frei", vorgemerktBis: bald }))).toBe("haus_gebunden");
  });

  it("lässt sie sonst frei wählen", () => {
    expect(anlageklassePflege(obj())).toBe("frei");
    expect(anlageklassePflege(obj({ globalObjekt: true, belegung: "frei" }))).toBe("frei");
    // Ohne Migration der Hausreservierung fehlt `belegung` ganz.
    expect(anlageklassePflege(obj({ globalObjekt: true }))).toBe("frei");
    expect(anlageklassePflege(undefined)).toBe("frei");
  });
});

describe("Import: der Schalter folgt Investagon", () => {
  const jetzt = new Date("2026-09-23T12:00:00Z");

  it("setzt ihn, wenn Investagon „Globalobjekt“ liefert", () => {
    expect(globalSchalterNachImport({ anlageklasse: "Globalobjekt", bisher: false, hausGebunden: false })).toBe(true);
    expect(globalSchalterNachImport({ anlageklasse: "Global-Objekt", bisher: true, hausGebunden: false })).toBe(true);
  });

  it("nimmt ihn zurück, wenn Investagon etwas anderes liefert", () => {
    expect(globalSchalterNachImport({ anlageklasse: "Eigentumswohnung", bisher: true, hausGebunden: false })).toBe(false);
    expect(globalSchalterNachImport({ anlageklasse: "Eigentumswohnung", bisher: false, hausGebunden: false })).toBe(false);
  });

  it("nimmt ihn NICHT zurück, solange am Haus im CRM ein Kunde hängt", () => {
    expect(globalSchalterNachImport({ anlageklasse: "Eigentumswohnung", bisher: true, hausGebunden: true })).toBe(true);
    // Ein gebundenes Haus macht aber aus einem Nicht-Globalobjekt keines.
    expect(globalSchalterNachImport({ anlageklasse: "Eigentumswohnung", bisher: false, hausGebunden: true })).toBe(false);
  });

  it("ein leerer Investagon-Wert lässt ein Globalobjekt Globalobjekt bleiben", () => {
    const klasse = anlageklasseNachImport("", "Globalobjekt");
    expect(klasse).toBe("Globalobjekt");
    expect(globalSchalterNachImport({ anlageklasse: klasse, bisher: true, hausGebunden: false })).toBe(true);
  });

  it("erkennt die Hausreservierung an der Tabellenzeile", () => {
    expect(hausImCrmGebunden({ belegung: "reserviert" }, jetzt)).toBe(true);
    expect(hausImCrmGebunden({ belegung: "verkauft" }, jetzt)).toBe(true);
    expect(hausImCrmGebunden({ belegung: "frei", belegung_kunde_id: "k-1" }, jetzt)).toBe(true);
    expect(hausImCrmGebunden({ belegung: "frei", vorgemerkt_bis: "2026-09-23T12:30:00Z" }, jetzt)).toBe(true);
    expect(hausImCrmGebunden({ belegung: "frei", vorgemerkt_bis: "2026-09-23T11:30:00Z" }, jetzt)).toBe(false);
    expect(hausImCrmGebunden({ belegung: "frei" }, jetzt)).toBe(false);
    // Ohne Migration fehlen die Spalten: keine Hausreservierung.
    expect(hausImCrmGebunden({ id: "o-1", global_objekt: true } as never, jetzt)).toBe(false);
    expect(hausImCrmGebunden(null, jetzt)).toBe(false);
  });
});

/*
 * Wächter: Wer im Browser wissen will, ob ein Objekt ein Globalobjekt ist,
 * fragt `istGlobalobjekt`. Direkt am Schalter lesen nur die Stellen unten,
 * jede mit Grund. Eine neue direkte Lesestelle fällt hier auf.
 */
const DIREKT_ERLAUBT: Record<string, string> = {
  "src/lib/objekteStore.ts": "übersetzt Tabellenzeile und Objekt, das ist der Schalter selbst",
  "src/pages/KundenDetail.tsx": "liest das Kennzeichen am Investment, nicht den Schalter am Objekt",
  "src/lib/exposePublicDaten.ts": "Exposé-Bereich, am 23.09.2026 in anderer Bearbeitung; liest den Schalter unverändert",
  "src/lib/exposePdf.ts": "Exposé-Bereich, am 23.09.2026 in anderer Bearbeitung; liest den Schalter unverändert",
  "src/lib/einheitEmpfehlung.ts": "Empfehlungen, am 23.09.2026 in anderer Bearbeitung; liest den Schalter unverändert",
};

function quelldateien(ordner: string): string[] {
  const aus: string[] = [];
  for (const name of readdirSync(ordner)) {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) aus.push(...quelldateien(pfad));
    // Kopien eines Dateisyncs ("Datei 2.ts") liest niemand.
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/ \d\.tsx?$/.test(name)) aus.push(pfad);
  }
  return aus;
}

describe("Wächter: eine Globalobjekt-Frage", () => {
  it("liest den Schalter außerhalb der erlaubten Stellen nur über istGlobalobjekt", () => {
    const wurzel = resolve(process.cwd());
    const funde: string[] = [];
    for (const datei of quelldateien(join(wurzel, "src"))) {
      const rel = relative(wurzel, datei);
      if (DIREKT_ERLAUBT[rel]) continue;
      const zeilen = readFileSync(datei, "utf8").split("\n");
      zeilen.forEach((zeile, i) => {
        const code = zeile.replace(/\/\/.*$/, "");
        if (/^\s*\*/.test(code)) return; // Kommentarblock
        // Lesen, nicht Zuweisen: `x.globalObjekt = true` setzt ein Feld am Investment.
        if (/\.(globalObjekt|global_objekt)\b(?!\s*=[^=])/.test(code)) funde.push(`${rel}:${i + 1}: ${zeile.trim()}`);
      });
    }
    expect(funde, funde.join("\n")).toEqual([]);
  });
});
