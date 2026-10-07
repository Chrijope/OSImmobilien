/**
 * Wer darf Kunden sehen? Die Rollenmatrix vom 16.09.2026 (Audit-Befund F06).
 *
 * Christian hat am 16.09.2026 entschieden, welche Rolle Kontakte,
 * Kundenprofile, Investments und Finanzierungen sehen darf. Die Entscheidung
 * steht in genau einer Datenbankfunktion, `public.darf_alle_kunden_sehen`,
 * angelegt in `supabase/migrations/20260916190000_kundenzugriff_rollenentscheidung.sql`.
 *
 * Dieser Test liest den Quellstand der Migration. SQL laeuft nicht im
 * Vitest-Prozess, geprueft wird deshalb der Wortlaut. Das reicht fuer den
 * Fehler, um den es hier geht: Jemand traegt eine Rolle nach oder streicht
 * eine, und niemand bemerkt, dass damit eine Abteilung entweder alle
 * Kundendaten sieht oder gar keine mehr. Dieser Test faellt dann um und nennt
 * den Unterschied beim Namen.
 *
 * Vorbild: `src/lib/automatikSchutz.test.ts` und
 * `src/lib/wettbewerbRechte.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONEN = join(process.cwd(), "supabase", "migrations");

const ENTSCHEIDUNG = "20260916190000_kundenzugriff_rollenentscheidung.sql";
const INVESTMENTS = "20260916191000_investments_zeilenweise.sql";
const INVESTMENT_RPCS = "20260916192000_investment_rpcs_zeilenweise.sql";

/** Vollzugriff auf Kontakte, Kundenprofile, Investments und Finanzierungen. */
const VOLLZUGRIFF = [
  "admin",
  "inhaber",
  "vertriebsleiter",
  "backoffice",
  "finanzierungspartner",
  "buchhaltung",
  "setterin",
  // Unveraendert wie bisher, deshalb ebenfalls Vollzugriff.
  "individuell",
  "testaccount",
];

/** Nur die eigenen zugewiesenen Kunden und deren Investments. */
const NUR_EIGENE = ["vertriebspartner"];

/** Gar kein Zugriff auf Kunden, Kundenprofile und Investments. */
const KEIN_ZUGRIFF = [
  "objektpartner",
  "hausverwaltung",
  "marketing",
  "hr",
  "versicherungsexperte",
];

/**
 * Die fuenfzehn Rollen aus `is_internal_role` (Stand 20260403110042). Sie
 * beantwortet eine andere Frage, naemlich ob jemand zum Haus gehoert, und
 * darf fuer den Kundenschutz nicht enger gemacht werden. Sie steht in weit
 * ueber hundert Regeln, unter anderem fuer Objekte, Wohnungen und Unterlagen.
 */
const INTERNE_ROLLEN = [
  "admin",
  "inhaber",
  "vertriebspartner",
  "hausverwaltung",
  "buchhaltung",
  "setterin",
  "objektpartner",
  "finanzierungspartner",
  "individuell",
  "testaccount",
  "marketing",
  "hr",
  "backoffice",
  "vertriebsleiter",
  "versicherungsexperte",
];

/** Migrationen in Laufreihenfolge, ohne die iCloud-Kopien ("... 2.sql"). */
function alleMigrationen(): string[] {
  return readdirSync(MIGRATIONEN)
    .filter((n) => n.endsWith(".sql"))
    .filter((n) => !/ \d+\.sql$/.test(n))
    .sort();
}

function lies(name: string): string {
  return readFileSync(join(MIGRATIONEN, name), "utf8");
}

/**
 * Der Rumpf der zeitlich letzten Fassung einer SQL-Funktion.
 *
 * Wichtig ist das "zeitlich letzte": Wer die erste gefundene Fassung nimmt,
 * liest eine Regel, die laengst ersetzt ist. Genau diesen Fehler beschreibt
 * `wettbewerbRechte.test.ts`.
 */
function letzterFunktionsrumpf(funktion: string): string {
  let gefunden = "";
  const muster = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(?:public\\.)?${funktion}\\s*\\([^)]*\\)([\\s\\S]*?)\\$\\$;`,
    "gi",
  );
  for (const name of alleMigrationen()) {
    const text = lies(name);
    let treffer: RegExpExecArray | null;
    muster.lastIndex = 0;
    while ((treffer = muster.exec(text)) !== null) {
      gefunden = treffer[1];
    }
  }
  return gefunden;
}

/** Die Rollennamen, die in einem SQL-Stueck in Hochkommata stehen. */
function rollenIn(sql: string): string[] {
  const alle = new Set([...VOLLZUGRIFF, ...NUR_EIGENE, ...KEIN_ZUGRIFF, "kunde", "bewerber", "tippgeber"]);
  const treffer = sql.match(/'([a-z]+)'/g) ?? [];
  return [...new Set(treffer.map((t) => t.slice(1, -1)).filter((r) => alle.has(r)))].sort();
}

describe("darf_alle_kunden_sehen traegt genau die Entscheidung vom 16.09.2026", () => {
  const rumpf = letzterFunktionsrumpf("darf_alle_kunden_sehen");

  it("ist ueberhaupt angelegt", () => {
    expect(rumpf).not.toBe("");
  });

  it("nennt genau die neun Rollen mit Vollzugriff, keine mehr und keine weniger", () => {
    expect(rollenIn(rumpf)).toEqual([...VOLLZUGRIFF].sort());
  });

  it.each(KEIN_ZUGRIFF)("schliesst %s aus", (rolle) => {
    expect(rumpf).not.toContain(`'${rolle}'`);
  });

  it("schliesst den Vertriebspartner aus, er sieht nur seine eigenen Kunden", () => {
    expect(rumpf).not.toContain("'vertriebspartner'");
  });

  it("faengt die dreiwertige Logik ab, eine Sperre auf NULL greift sonst nicht", () => {
    expect(rumpf).toMatch(/COALESCE\(/i);
    expect(rumpf).toMatch(/false\s*\)/i);
  });
});

describe("is_internal_role bleibt unangetastet", () => {
  /**
   * Sie enger zu machen waere der naheliegende, aber falsche Weg: Das
   * Objektmanagement verloere damit nicht die Kunden, sondern seine Objekte.
   */
  it("zaehlt weiterhin alle fuenfzehn internen Rollen auf", () => {
    const rumpf = letzterFunktionsrumpf("is_internal_role");
    expect(rumpf).not.toBe("");
    for (const rolle of INTERNE_ROLLEN) {
      expect(rumpf).toContain(`'${rolle}'`);
    }
  });
});

describe("hat_breiten_kontaktzugriff traegt keine zweite Rollenliste mehr", () => {
  /**
   * Bis zum 16.09.2026 stand dort eine eigene, kuerzere Liste (admin,
   * inhaber, hausverwaltung, buchhaltung, backoffice, vertriebsleiter). Sie
   * entschied ueber Aktivitaeten, Follow-ups, Kommunikation und das
   * Aenderungsprotokoll. Zwei Listen fuer dieselbe Frage laufen auseinander,
   * deshalb verweist die Funktion jetzt auf die eine Entscheidung.
   */
  const rumpf = letzterFunktionsrumpf("hat_breiten_kontaktzugriff");

  it("verweist auf darf_alle_kunden_sehen", () => {
    expect(rumpf).toContain("darf_alle_kunden_sehen");
  });

  it("nennt selbst keine einzige Rolle mehr", () => {
    expect(rollenIn(rumpf)).toEqual([]);
  });
});

describe("die Regeln auf kontakte fragen die neue Funktion", () => {
  const text = lies(ENTSCHEIDUNG);

  it.each([
    ["Admin und interne Rollen sehen Kontakte", "SELECT"],
    ["Admin und interne Rollen bearbeiten Kontakte", "UPDATE"],
    ["Admin und interne Rollen loeschen Kontakte", "DELETE"],
    ["Interne erstellen Kontakte", "INSERT"],
  ])("%s wird neu angelegt und nutzt darf_alle_kunden_sehen", (name) => {
    const muster = new RegExp(
      `CREATE POLICY "${name}"[\\s\\S]*?;`,
      "i",
    );
    const treffer = text.match(muster);
    expect(treffer, `Regel "${name}" fehlt`).not.toBeNull();
    expect(treffer![0]).toContain("darf_alle_kunden_sehen");
  });

  it("wirft jede Regel vorher weg, damit die Migration wiederholbar ist", () => {
    for (const name of [
      "Admin und interne Rollen sehen Kontakte",
      "Admin und interne Rollen bearbeiten Kontakte",
      "Admin und interne Rollen loeschen Kontakte",
      "Interne erstellen Kontakte",
    ]) {
      expect(text).toContain(`DROP POLICY IF EXISTS "${name}" ON public.kontakte;`);
    }
  });

  it("laesst den Vertriebspartner weiterhin Kontakte anlegen", () => {
    const einfuegen = text.match(/CREATE POLICY "Interne erstellen Kontakte"[\s\S]*?;/i);
    expect(einfuegen![0]).toContain("'vertriebspartner'");
  });
});

describe("die Nebentabellen mit Kundendaten haengen an derselben Regel", () => {
  const text = lies(ENTSCHEIDUNG);

  /**
   * Eine Regel, die nur `kontakte` schliesst, waehrend Aufgaben, Pipeline,
   * Anrufe und die uebrigen Nebentabellen offen bleiben, ist keine Regel.
   */
  it.each([
    "aufgaben",
    "pipeline",
    "anrufe",
    "sa_fill_tokens",
    "empfehlungen",
    "kunden_bewertungen",
    "sales_coach_aufnahmen",
    "kommunikation",
  ])("%s wird umgestellt", (tabelle) => {
    expect(text).toContain(`ON public.${tabelle}`);
  });

  /**
   * Die Tabelle `kommunikation` traegt Kunden- UND Mieterkommunikation. Ohne
   * den ausdruecklichen Zweig fuer Zeilen ohne `kunde_id` waere die Seite
   * `/hv-kommunikation` fuer die Hausverwaltung ab dem Lauf leer.
   */
  it("laesst der Hausverwaltung ihre Mieterkommunikation", () => {
    const regeln = text.match(/CREATE POLICY "Interne (sehen|bearbeiten) Kommunikation \(scoped\)"[\s\S]*?;\n/g) ?? [];
    expect(regeln.length).toBe(2);
    for (const regel of regeln) {
      expect(regel).toContain("'hausverwaltung'");
      expect(regel).toContain("IS NULL");
    }
  });

  it("prueft in jeder neuen Regel entweder den breiten Zugriff oder den eigenen Kontakt", () => {
    const regeln = text.match(/CREATE POLICY[\s\S]*?;\n/g) ?? [];
    expect(regeln.length).toBeGreaterThan(0);
    for (const regel of regeln) {
      const passt =
        regel.includes("darf_alle_kunden_sehen") || regel.includes("ist_eigener_kontakt");
      expect(passt, `Regel ohne Kundenpruefung: ${regel.slice(0, 120)}`).toBe(true);
    }
  });
});

describe("Investments und Finanzierungen folgen derselben Regel", () => {
  it("die Investment-Migration kennt die alte Sonderfunktion nicht mehr", () => {
    const text = lies(INVESTMENTS);
    expect(text).not.toMatch(/CREATE OR REPLACE FUNCTION public\.hat_breiten_investmentzugriff/i);
    expect(text).toContain("darf_alle_kunden_sehen");
  });

  it("die RPC-Migration fragt ebenfalls die gemeinsame Regel", () => {
    const text = lies(INVESTMENT_RPCS);
    expect(text).toMatch(/public\.darf_alle_kunden_sehen\(_user_id\)/);
  });

  it("laeuft nach der Entscheidung, sonst gilt am Ende die alte Regel", () => {
    const reihenfolge = alleMigrationen();
    const a = reihenfolge.indexOf(ENTSCHEIDUNG);
    const b = reihenfolge.indexOf(INVESTMENTS);
    const c = reihenfolge.indexOf(INVESTMENT_RPCS);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
