import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Kennzahlenverlauf: Verhalten ohne Migration, Umrechnung einer Zeile,
 * die Veraenderung samt ihrer beiden Sonderfaelle, die Gruppierung und der
 * vorlesbare Satz.
 */

const db = vi.hoisted(() => ({
  antwort: { data: null as unknown, error: null as null | { code?: string; message?: string } },
  aufrufe: [] as Array<{ name: string; args: unknown }>,
  wirft: false as boolean,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => {
      db.aufrufe.push({ name, args });
      if (db.wirft) return Promise.reject(new Error("Netz weg"));
      return Promise.resolve(db.antwort);
    },
  },
}));

const {
  ladeKennzahlenVerlauf, gruppiereNachBereich, verlaufSatz, istMigrationFehlend,
  KENNZAHLEN_BEREICHE, KENNZAHL_LABEL, BEREICH_LABEL, KENNZAHLEN_MIGRATION_HINWEIS,
} = await import("@/lib/kennzahlenVerlauf");

function zeile(over: Record<string, unknown> = {}) {
  return {
    bereich: "VL",
    kennzahl: "neue_leads",
    stichtag_heute: "2026-09-08",
    wert_heute: 42,
    stichtag_vorwoche: "2026-09-01",
    wert_vorwoche: 61,
    veraenderung: -19,
    ...over,
  };
}

beforeEach(() => {
  db.antwort = { data: [], error: null };
  db.aufrufe = [];
  db.wirft = false;
});

describe("ohne Migration", () => {
  it("meldet die unbekannte Funktion ruhig", async () => {
    db.antwort = {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.kennzahlen_verlauf" },
    };
    const erg = await ladeKennzahlenVerlauf();
    expect(erg).toEqual({ kennzahlen: [], migrationFehlt: true, fehler: null });
    expect(KENNZAHLEN_MIGRATION_HINWEIS).toContain("20260908180000_kennzahlen_tagesstand.sql");
  });

  it("erkennt auch die Postgres-Fassung derselben Luecke", async () => {
    db.antwort = { data: null, error: { code: "42883", message: "function does not exist" } };
    expect((await ladeKennzahlenVerlauf()).migrationFehlt).toBe(true);
  });

  it("erkennt die fehlende Tabelle", async () => {
    db.antwort = { data: null, error: { code: "42P01", message: 'relation "kennzahlen_tagesstand" does not exist' } };
    expect((await ladeKennzahlenVerlauf()).migrationFehlt).toBe(true);
  });

  it("haelt einen echten Fehler auseinander von einer fehlenden Migration", async () => {
    db.antwort = { data: null, error: { code: "42501", message: "permission denied" } };
    const erg = await ladeKennzahlenVerlauf();
    expect(erg.migrationFehlt).toBe(false);
    expect(erg.fehler).toBe("permission denied");
    expect(erg.kennzahlen).toEqual([]);
  });

  it("faellt auch bei einem geworfenen Fehler nicht um", async () => {
    db.wirft = true;
    const erg = await ladeKennzahlenVerlauf();
    expect(erg.kennzahlen).toEqual([]);
    expect(erg.fehler).toBe("Netz weg");
  });

  it("istMigrationFehlend sagt bei fehlendem Fehler nein", () => {
    expect(istMigrationFehlend(null)).toBe(false);
    expect(istMigrationFehlend({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});

describe("Umrechnung einer Zeile", () => {
  it("liefert heutigen Wert, Vorwochenwert und Veraenderung", async () => {
    db.antwort = { data: [zeile()], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(kennzahlen).toHaveLength(1);
    expect(kennzahlen[0]).toMatchObject({
      bereich: "VL",
      kennzahl: "neue_leads",
      label: "Neue Leads",
      stichtag: "2026-09-08",
      wert: 42,
      stichtagVorwoche: "2026-09-01",
      wertVorwoche: 61,
      veraenderung: -19,
    });
    // -19 von 61 sind gerundet 31 Prozent weniger.
    expect(kennzahlen[0].veraenderungProzent).toBe(-31);
  });

  it("rechnet die Veraenderung selbst und uebernimmt sie nicht ungeprueft", async () => {
    // Die Datenbank liefert hier absichtlich eine falsche Veraenderung.
    db.antwort = { data: [zeile({ wert_heute: 10, wert_vorwoche: 4, veraenderung: 999 })], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(kennzahlen[0].veraenderung).toBe(6);
  });

  it("laesst den Vergleich weg, solange es keinen Vorwochenwert gibt", async () => {
    db.antwort = { data: [zeile({ stichtag_vorwoche: null, wert_vorwoche: null, veraenderung: null })], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(kennzahlen[0].wertVorwoche).toBeNull();
    expect(kennzahlen[0].veraenderung).toBeNull();
    expect(kennzahlen[0].veraenderungProzent).toBeNull();
  });

  it("nennt keine Prozente, wenn die Vorwoche null war", async () => {
    db.antwort = { data: [zeile({ wert_heute: 10, wert_vorwoche: 0 })], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(kennzahlen[0].veraenderung).toBe(10);
    expect(kennzahlen[0].veraenderungProzent).toBeNull();
  });

  it("liest eine Zahl auch dann, wenn sie als Text ankommt", async () => {
    db.antwort = { data: [zeile({ wert_heute: "42", wert_vorwoche: "61" })], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(kennzahlen[0].wert).toBe(42);
    expect(kennzahlen[0].veraenderung).toBe(-19);
  });

  it("zeigt den Kurznamen, wenn eine Kennzahl noch keinen Klartextnamen hat", async () => {
    db.antwort = { data: [zeile({ kennzahl: "brandneue_zahl" })], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(kennzahlen[0].label).toBe("brandneue_zahl");
  });

  it("wirft Zeilen mit unbekanntem Bereich oder ohne Wert weg", async () => {
    db.antwort = {
      data: [
        zeile(),
        zeile({ bereich: "XXX" }),
        zeile({ kennzahl: "" }),
        zeile({ wert_heute: null }),
      ],
      error: null,
    };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(kennzahlen).toHaveLength(1);
  });

  it("vertraegt eine Antwort, die gar keine Liste ist", async () => {
    db.antwort = { data: { unsinn: true }, error: null };
    const erg = await ladeKennzahlenVerlauf();
    expect(erg.kennzahlen).toEqual([]);
    expect(erg.fehler).toBeNull();
  });
});

describe("Abfrage", () => {
  it("fragt ohne Bereich nach allen", async () => {
    await ladeKennzahlenVerlauf();
    expect(db.aufrufe[0]).toEqual({ name: "kennzahlen_verlauf", args: { p_bereich: null } });
  });

  it("reicht den gewuenschten Bereich durch", async () => {
    await ladeKennzahlenVerlauf("OPS");
    expect(db.aufrufe[0].args).toEqual({ p_bereich: "OPS" });
  });
});

describe("Gruppierung", () => {
  it("legt jeden der elf Bereiche an, auch die leeren", async () => {
    db.antwort = { data: [zeile(), zeile({ bereich: "OPS", kennzahl: "aufgaben_offen" })], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    const gruppen = gruppiereNachBereich(kennzahlen);
    expect(Object.keys(gruppen).sort()).toEqual([...KENNZAHLEN_BEREICHE].sort());
    expect(gruppen.VL).toHaveLength(1);
    expect(gruppen.OPS).toHaveLength(1);
    expect(gruppen.HR).toEqual([]);
  });

  it("jeder Bereich hat einen Klartextnamen", () => {
    for (const bereich of KENNZAHLEN_BEREICHE) {
      expect(BEREICH_LABEL[bereich]).toBeTruthy();
    }
  });
});

describe("vorlesbarer Satz", () => {
  it("nennt heute und die Vorwoche", async () => {
    db.antwort = { data: [zeile()], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(verlaufSatz(kennzahlen[0])).toBe("42 Neue Leads, vor einer Woche 61");
  });

  it("sagt es, wenn der Vergleich fehlt, statt eine Null zu behaupten", async () => {
    db.antwort = { data: [zeile({ stichtag_vorwoche: null, wert_vorwoche: null })], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(verlaufSatz(kennzahlen[0])).toBe("42 Neue Leads, kein Vergleichswert von vor einer Woche");
  });

  it("benutzt keine Gedankenstriche", async () => {
    db.antwort = { data: [zeile()], error: null };
    const { kennzahlen } = await ladeKennzahlenVerlauf();
    expect(verlaufSatz(kennzahlen[0])).not.toMatch(/[–—]/);
  });
});

describe("Klartextnamen", () => {
  it("kennt die Kennzahlen, die der Nachtlauf schreibt", () => {
    // Stichproben aus allen elf Bereichen. Faellt eine Umbenennung in der
    // Migration hier durch, zeigt die Oberflaeche wieder Kurznamen.
    for (const kennzahl of [
      "kontakte_aktiv", "follow_ups_ueberfaellig", "neue_leads", "bewerber_im_prozess",
      "leads_mit_kampagne", "wohneinheiten_frei", "tickets_offen", "signaturen_offen",
      "empfehlungen_neu", "kapitel_abgeschlossen", "abrechnungen_offen",
    ]) {
      expect(KENNZAHL_LABEL[kennzahl]).toBeTruthy();
    }
  });
});
