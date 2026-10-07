import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BEWERBER_TERMIN_ANLASS,
  VORGANG_TEXTE,
  deuteBewerberTerminFehler,
  hatOffenenTermin,
  leseZugang,
  terminZeile,
} from "./bewerberTermin";

/**
 * Die Terminbuchung des Bewerbers.
 *
 * Der wichtigste Teil steht ganz unten: Ein Bewerber darf **kein Lead** werden
 * und **keine Pipelinestufe** bekommen. Diese Zusage liegt in SQL, und geprüft
 * wird sie deshalb am Text der Migration. Dieselbe Technik wie in
 * `terminartenStandardsatz.test.ts`, aus demselben Grund: Die Tests laufen ohne
 * Supabase, eine Datenbank gibt es hier nicht.
 */

const MIGRATION = "20260906120000_bewerber_terminbuchung.sql";
const ORDNER = resolve(__dirname, "../../supabase/migrations");
const SQL = readFileSync(resolve(ORDNER, MIGRATION), "utf8");

/** Der Rumpf einer Funktion aus der Migration, ohne Kommentarzeilen. */
function funktionsRumpf(name: string): string {
  const anfang = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(anfang, `${name} fehlt in der Migration`).toBeGreaterThanOrEqual(0);
  const ende = SQL.indexOf("\n$$;", anfang);
  expect(ende, `${name} ist nicht abgeschlossen`).toBeGreaterThan(anfang);
  return SQL.slice(anfang, ende)
    .split("\n")
    .filter((zeile) => !zeile.trimStart().startsWith("--"))
    .join("\n");
}

// ───────────────────────── Die Zusage: kein Lead ──────────────────────────

describe("Buchen macht aus einem Bewerber keinen Lead", () => {
  const rumpf = funktionsRumpf("bewerber_termin_buchen");

  it("legt keinen Kontakt an", () => {
    expect(rumpf).not.toMatch(/INSERT\s+INTO\s+public\.kontakte/i);
    expect(rumpf).not.toMatch(/UPDATE\s+public\.kontakte/i);
  });

  it("setzt keine Pipelinestufe", () => {
    expect(rumpf).not.toContain("pipelineStufe");
    expect(rumpf).not.toContain("erstgespraech_geplant");
    expect(rumpf).not.toContain("beratungsgespraech");
    expect(rumpf).not.toContain("neuer_lead");
  });

  it("legt keinen Termin in der Kundenakte an", () => {
    expect(rumpf).not.toMatch(/INSERT\s+INTO\s+public\.aktivitaeten/i);
  });

  it("ruft niemals buchung_anlegen, das genau dieses tun wuerde", () => {
    expect(SQL).not.toContain("buchung_anlegen(");
  });

  it("schreibt den Termin an den Bewerber und laesst kontakt_id leer", () => {
    expect(rumpf).toContain("bewerbung_id");
    // In der Spaltenliste steht kontakt_id, in der Werteliste dahinter NULL.
    expect(rumpf).toMatch(/quelle,\s*kontakt_id,\s*bewerbung_id/);
    expect(rumpf).toMatch(/'persoenlich',\s*NULL,\s*_f\.bewerbung_id/);
  });

  it("der Videoraum bekommt ebenfalls keinen Kontakt", () => {
    const anfang = rumpf.indexOf("INSERT INTO public.videoraeume");
    expect(anfang).toBeGreaterThan(0);
    // Nur diese eine Anweisung, bis zu ihrem Semikolon.
    const raum = rumpf.slice(anfang, rumpf.indexOf(";", anfang));
    expect(raum).toContain("gastgeber_id");
    expect(raum).not.toContain("kontakt_id");
  });
});

describe("Auch der Store nimmt nur den Bewerberweg", () => {
  const store = readFileSync(resolve(__dirname, "bewerberTerminStore.ts"), "utf8");
  const ohneKommentare = store
    .split("\n")
    .filter((z) => !z.trimStart().startsWith("*") && !z.trimStart().startsWith("//") && !z.trimStart().startsWith("/*"))
    .join("\n");

  it("ruft bewerber_termin_buchen und nicht buchung_anlegen", () => {
    expect(ohneKommentare).toContain("bewerber_termin_buchen");
    expect(ohneKommentare).not.toContain('"buchung_anlegen"');
  });
});

// ───────────────────────── Die Migration selbst ───────────────────────────

describe("Die Migration bleibt vertraeglich", () => {
  it("traegt die Terminart nur ein, wenn sie fehlt, und ueberschreibt nichts", () => {
    const ohneKommentare = SQL.split("\n").filter((z) => !z.trimStart().startsWith("--")).join("\n");
    expect(ohneKommentare).toMatch(/INSERT INTO public\.buchung_terminarten/);
    expect(ohneKommentare).toContain("NOT EXISTS");
    expect(ohneKommentare).not.toMatch(/UPDATE\s+public\.buchung_terminarten/i);
    expect(ohneKommentare).not.toMatch(/DELETE\s+FROM\s+public\.buchung_terminarten/i);
  });

  it("haelt die Terminart aus dem offenen Buchungslink heraus", () => {
    const einfuegen = SQL.slice(SQL.indexOf("INSERT INTO public.buchung_terminarten"));
    // aktiv = true, oeffentlich = false. Ein Kunde soll sie nie zu sehen bekommen.
    expect(einfuegen).toMatch(/true,\s*false,\s*'bewerbergespraech'/);
  });

  it("erweitert alle drei Pruefregeln um den neuen Anlass", () => {
    for (const regel of ["buchung_terminarten_anlass_chk", "buchungen_anlass_chk", "videoraeume_art_chk"]) {
      const stelle = SQL.indexOf(`ADD CONSTRAINT ${regel}`);
      expect(stelle, `${regel} wird nicht erweitert`).toBeGreaterThan(0);
      expect(SQL.slice(stelle, stelle + 400)).toContain(BEWERBER_TERMIN_ANLASS);
    }
  });

  it("verliert dabei keinen der bisherigen Werte", () => {
    for (const regel of ["buchung_terminarten_anlass_chk", "buchungen_anlass_chk", "videoraeume_art_chk"]) {
      const stelle = SQL.indexOf(`ADD CONSTRAINT ${regel}`);
      const block = SQL.slice(stelle, stelle + 400);
      for (const wert of ["erstgespraech", "beratung", "objektvorstellung", "finanzierungsgespraech", "sonstiges"]) {
        expect(block, `${wert} fehlt in ${regel}`).toContain(wert);
      }
    }
  });

  it("gibt den Absagetoken nicht an den Bewerber heraus", () => {
    expect(funktionsRumpf("bewerber_termin_zugang")).not.toContain("absage_token");
  });

  /*
   * Geprüft wird die maßgebliche Historie, nicht der Eingangskorb.
   *
   * Der Korb ist eine Merkliste dessen, was in Supabase noch nicht gelaufen
   * ist, und wird geleert, sobald es gelaufen ist. Diese Migration lief am
   * 07.09.2026, deshalb prüft der Test seitdem supabase/migrations/.
   */
  it("liegt in der maßgeblichen Historie", () => {
    const historie = resolve(__dirname, "../../supabase/migrations");
    expect(readdirSync(historie)).toContain(MIGRATION);
  });
});

describe("Die Dauer folgt derselben Regel wie im Browser", () => {
  const rumpf = funktionsRumpf("bewerber_termin_dauer");

  it("nimmt die lange Fassung bei Themen oder eigener Frage", () => {
    expect(rumpf).toContain("'themen'");
    expect(rumpf).toContain("'eigeneFrage'");
  });

  it("faellt sonst auf dreissig Minuten zurueck, wie DAUER_KURZ_MINUTEN", () => {
    expect(rumpf).toContain("LEAST(_lang, 30)");
  });
});

// ────────────────────────────── Die Anzeige ───────────────────────────────

const ROH = {
  gastgeber: { name: "Sarah Kaiser-Thom", email: "s@more.immo", telefon: "+49 1", bild: "", position: "HR" },
  zeitzone: "Europe/Berlin",
  dauer_minuten: 45,
  bezeichnung: "Bewerbergespräch",
  beschreibung: "Wir sprechen über deine Themen.",
  vorausschau_tage: 30,
  buchbar: true,
  buchung: null,
};

describe("leseZugang", () => {
  it("liest die Antwort der Datenbank", () => {
    const z = leseZugang(ROH)!;
    expect(z.gastgeber.name).toBe("Sarah Kaiser-Thom");
    expect(z.dauerMinuten).toBe(45);
    expect(z.buchbar).toBe(true);
    expect(z.buchung).toBeNull();
  });

  it("ergibt null, wenn nichts Brauchbares kommt", () => {
    expect(leseZugang(null)).toBeNull();
    expect(leseZugang("kaputt")).toBeNull();
  });

  it("faellt auf vernuenftige Werte zurueck, wenn Felder fehlen", () => {
    const z = leseZugang({})!;
    expect(z.zeitzone).toBe("Europe/Berlin");
    expect(z.bezeichnung).toBe("Bewerbergespräch");
    expect(z.dauerMinuten).toBe(45);
    // Ohne ausdrückliches `true` wird nicht gebucht.
    expect(z.buchbar).toBe(false);
  });

  it("liest einen gebuchten Termin samt Raumzugang", () => {
    const z = leseZugang({
      ...ROH,
      buchung: {
        id: "b1",
        start_at: "2026-09-07T08:00:00Z",
        ende_at: "2026-09-07T08:45:00Z",
        dauer_minuten: 45,
        status: "offen",
        bezeichnung: "Bewerbergespräch",
        raum_token: "abc",
      },
    })!;
    expect(z.buchung?.raumToken).toBe("abc");
    expect(hatOffenenTermin(z)).toBe(true);
  });

  it("haelt eine halbe Buchung fuer keine", () => {
    const z = leseZugang({ ...ROH, buchung: { status: "offen" } })!;
    expect(z.buchung).toBeNull();
    expect(hatOffenenTermin(z)).toBe(false);
  });
});

describe("terminZeile", () => {
  it("schreibt Datum, Spanne und Dauer in der Zone der Gastgeberin", () => {
    const zeile = terminZeile(
      {
        id: "b1",
        startAt: "2026-09-07T08:00:00Z",
        endeAt: "2026-09-07T08:45:00Z",
        dauerMinuten: 45,
        status: "offen",
        bezeichnung: null,
        raumToken: null,
      },
      "Europe/Berlin",
    );
    expect(zeile).toBe("Montag, 7. September 2026, 10:00 bis 10:45 Uhr (45 Minuten)");
  });

  it("rechnet das Ende notfalls aus der Dauer", () => {
    const zeile = terminZeile(
      { id: "b1", startAt: "2026-09-07T08:00:00Z", endeAt: "", dauerMinuten: 30, status: "offen", bezeichnung: null, raumToken: null },
      "Europe/Berlin",
    );
    expect(zeile).toContain("10:00 bis 10:30 Uhr");
  });
});

describe("deuteBewerberTerminFehler", () => {
  it("duzt den Bewerber, so wie der ganze Bogen", () => {
    for (const meldung of [
      "Diese Zeit ist inzwischen vergeben",
      "Dieser Termin liegt zu kurzfristig",
      "Bitte sende zuerst deine Angaben ab",
      "Du hast bereits einen Termin. Verschiebe ihn oder sage ihn ab.",
      "irgendetwas Unerwartetes",
    ]) {
      const { text } = deuteBewerberTerminFehler(new Error(meldung));
      expect(text, meldung).not.toMatch(/\bSie\b|\bIhre[nrms]?\b/);
    }
  });

  it("laesst die Zeiten neu holen, wenn jemand schneller war", () => {
    expect(deuteBewerberTerminFehler(new Error("Diese Zeit ist inzwischen vergeben")).neuLaden).toBe(true);
  });

  it("holt nichts neu, wenn der Bogen noch nicht abgesendet ist", () => {
    const { text, neuLaden } = deuteBewerberTerminFehler(new Error("Bitte sende zuerst deine Angaben ab"));
    expect(neuLaden).toBe(false);
    expect(text).toContain("Angaben");
  });

  it("nennt den Weg, wenn gerade kein Kalender bereitsteht", () => {
    const { text } = deuteBewerberTerminFehler(new Error("Zurzeit ist keine Terminbuchung moeglich"));
    expect(text).toContain("Mail");
  });

  it("kommt auch mit einer Supabase-Antwort statt eines Fehlers zurecht", () => {
    expect(deuteBewerberTerminFehler({ message: "Diese Zeit ist inzwischen vergeben" }).neuLaden).toBe(true);
  });
});

describe("Die drei Vorgaenge", () => {
  it("haben je einen Satz fuer die Meldung an HR", () => {
    expect(Object.keys(VORGANG_TEXTE).sort()).toEqual(["abgesagt", "gebucht", "verschoben"]);
    for (const satz of Object.values(VORGANG_TEXTE)) expect(satz.length).toBeGreaterThan(5);
  });
});
