import { describe, expect, it } from "vitest";
import {
  timestamp,
  activityData,
  activePeople,
  financingData,
  incomeOf,
  belongs,
  closed,
  conversion,
  outcomes,
  pipeline,
  previousPeriod,
  scopeIds,
  timeSeries,
  type Row,
} from "./statistikController";
import { getVisibleStatistikTabs } from "./statistikenTabs";
const p = {
  start: new Date("2026-09-01T00:00:00"),
  end: new Date("2026-10-01T00:00:00"),
};
const contact = (id: string, extra = {}): Row => ({
  id,
  erstellt_am: "2026-01-01",
  meta: { pipelineStufe: "neuer_lead" },
  ...extra,
});
const deal = (id: string, kunde_id: string, extra = {}): Row => ({
  id,
  kunde_id,
  kaufpreis: 200000,
  kaufdatum: "2026-09-05",
  meta: { pipelineStufe: "abgeschlossen" },
  ...extra,
});
describe("Statistik: Rollen und Datenbereich", () => {
  it("begrenzt Vertriebsleitung auch bei manipulierter Haussicht auf das Team", () => {
    expect([
      ...scopeIds("vertriebsleiter", "me", "haus", new Set(["team"]))!,
    ]).toEqual(["me", "team"]);
    expect(
      scopeIds("vertriebsleiter", "me", "haus", new Set(["team"]), "other")
        ?.size,
    ).toBe(0);
  });
  it("öffnet leere Auswahl und fehlende Identität niemals auf alle Daten", () => {
    expect(scopeIds("admin", "", "haus", new Set())).toEqual(new Set());
    expect(
      activityData(
        [{ id: "a", kunde_id: "other", datum: "2026-09-03" }],
        [],
        p,
      ),
    ).toEqual([]);
  });
  it("gibt IDs Vorrang vor alten Namen und verwirft mehrdeutige Namen", () => {
    const profiles = [
      { id: "me", name: "Alex" },
      { id: "other", name: "Alex" },
    ];
    expect(
      belongs(
        contact("k", { zustaendig_id: "other", berater: "Alex" }),
        new Set(["me"]),
        profiles,
        "vertriebspartner",
      ),
    ).toBe(false);
    expect(
      belongs(
        contact("k", { berater: "Alex" }),
        new Set(["me"]),
        profiles,
        "vertriebspartner",
      ),
    ).toBe(false);
    expect(
      belongs(
        contact("k", { meta: { setterId: "me" } }),
        new Set(["me"]),
        profiles,
        "setterin",
      ),
    ).toBe(true);
  });
  it("verweigert unbekannte Rollen und benötigt explizite individuelle Reiter", () => {
    expect(getVisibleStatistikTabs("kunde")).toEqual([]);
    expect(getVisibleStatistikTabs("individuell")).toEqual([]);
    expect(
      getVisibleStatistikTabs("individuell", ["/statistiken?tab=activity"]),
    ).toEqual(["activity"]);
    expect(getVisibleStatistikTabs("hr")).toEqual(["recruiting"]);
  });
});
describe("Perioden, Abschlüsse und Mehrfachinvestments", () => {
  it("zählt Septemberabschluss eines Januar-Kontakts, aber kein bloß angelegtes Investment", () => {
    const result = outcomes(
      [contact("k")],
      [
        deal("d", "k"),
        deal("draft", "k", {
          kaufdatum: null,
          erstellt_am: "2026-09-05",
          meta: { pipelineStufe: "reservierung" },
        }),
      ],
      p,
    );
    expect(result.deals).toHaveLength(1);
    expect(result.volume).toBe(200000);
    expect(result.newContacts).toHaveLength(0);
  });
  it("zählt Investment-IDs einmal und Kunden bei Kohortenquoten einmal", () => {
    const d = deal("d", "k");
    const result = outcomes(
      [contact("k", { erstellt_am: "2026-09-01" })],
      [d, d, deal("d2", "k")],
      p,
    );
    expect(result.deals).toHaveLength(2);
    expect(result.customers.size).toBe(1);
    expect(result.cohortRate).toBe(100);
  });
  it("nimmt ohne Abschlussdatum kein Erstellungsdatum als Ersatz", () => {
    const result = outcomes(
      [contact("k")],
      [deal("d", "k", { kaufdatum: null, erstellt_am: "2026-09-05" })],
      p,
    );
    expect(result.deals).toHaveLength(0);
    expect(result.missingClosingDate).toHaveLength(1);
    expect(
      closed(
        deal("plan", "k", {
          kaufdatum: null,
          meta: { pipelineStufe: "notar", notarTermin: "2099-09-09" },
        }),
      ),
    ).toBe(false);
  });
  it("schließt Stornos aus und verwendet exklusive Periodenobergrenzen", () => {
    const result = outcomes(
      [contact("k")],
      [
        deal("s", "k", { status: "storniert" }),
        deal("end", "k", { kaufdatum: "2026-10-01T00:00:00" }),
      ],
      p,
    );
    expect(result.deals).toHaveLength(0);
    expect(+previousPeriod(p).end).toBe(+p.start);
  });
  it("zeigt Nullzeiträume im Verlauf und verwendet dieselbe Datumsgrenze", () => {
    const rows = timeSeries([deal("d", "k")], p, (r) => r.kaufdatum);
    expect(rows).toHaveLength(30);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(1);
  });
});
describe("Pipeline und Quoten", () => {
  // Frühere Erwartung: 37 Kontakte mit `meta.pipelineSeit` am KONTAKT galten
  // als überfällig. Das war falsch, denn geschrieben wird der Stufeneintritt
  // nur am Investment (investmentsStore.updateInvestment). Der Zeitstempel am
  // Kontakt entsteht nirgends, der Test hat also eine Struktur festgehalten,
  // die es im echten Datenbestand nicht gibt.
  it("berechnet echte Gesamtzahl über Listenlimits und liest den Stufeneintritt am Investment", () => {
    const contacts = Array.from({ length: 37 }, (_, i) => contact(`${i}`));
    const invs = contacts.map((k) =>
      deal(`i-${k.id}`, k.id, {
        kaufdatum: null,
        meta: { pipelineStufe: "neuer_lead", pipelineSeit: "2026-08-01" },
      }),
    );
    expect(
      pipeline(contacts, invs, +new Date("2026-09-09")).stale,
    ).toHaveLength(37);
  });
  it("meldet einen Kontakt nur einmal, auch wenn zwei Investments hängen", () => {
    const contacts = [contact("k")];
    const invs = [
      deal("i1", "k", {
        kaufdatum: null,
        meta: { pipelineStufe: "neuer_lead", pipelineSeit: "2026-08-01" },
      }),
      deal("i2", "k", {
        kaufdatum: null,
        meta: { pipelineStufe: "reservierung", pipelineSeit: "2026-08-01" },
      }),
    ];
    const result = pipeline(contacts, invs, +new Date("2026-09-09"));
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0].id).toBe("k");
  });
  it("zählt einen Kontakt nicht als überfällig, solange ein Investment in der Frist liegt", () => {
    const contacts = [contact("k")];
    const invs = [
      deal("i1", "k", {
        kaufdatum: null,
        // Frist für "neuer_lead" sind 3 Tage, hier ist erst ein Tag vergangen.
        meta: { pipelineStufe: "neuer_lead", pipelineSeit: "2026-09-08" },
      }),
    ];
    const result = pipeline(contacts, invs, +new Date("2026-09-09"));
    expect(result.stale).toHaveLength(0);
    expect(result.ohneStufeneintritt).toHaveLength(0);
  });
  it("meldet fehlende Stufeneintritte nur bei vorhandenen Investments", () => {
    const contacts = [contact("mit"), contact("ohne")];
    const invs = [
      deal("i", "mit", {
        kaufdatum: null,
        meta: { pipelineStufe: "reservierung" },
      }),
    ];
    const result = pipeline(contacts, invs, +new Date("2026-09-09"));
    expect(result.ohneStufeneintritt.map((k) => k.id)).toEqual(["mit"]);
    // Ein Kontakt ganz ohne Investment hat keine Stelle, an der der
    // Zeitstempel stehen könnte, und ist deshalb kein Datenfehler.
    expect(result.stale).toHaveLength(0);
  });
  it("trennt abgeschlossenen Bestand, offenes Volumen und unverbindliche Budgets", () => {
    const contacts = [
      contact("open", { budget: 900000 }),
      contact("done", { meta: { pipelineStufe: "abgeschlossen" } }),
      contact("budget", { budget: 100000 }),
    ];
    const result = pipeline(contacts, [
      deal("d", "done"),
      deal("o", "open", {
        kaufdatum: null,
        meta: { pipelineStufe: "reservierung" },
      }),
    ]);
    expect(result.open).toHaveLength(2);
    expect(result.volume).toBe(200000);
    expect(result.budget).toBe(100000);
    expect(result.rows.reduce((s, r) => s + r.count, 0)).toBe(3);
  });
  it("trennt künftige, vergangene und fehlende Notartermine", () => {
    const contacts = ["a", "b", "c"].map((id) =>
      contact(id, { meta: { pipelineStufe: "notar" } }),
    );
    const invs = contacts.map((k, i) =>
      deal(k.id, k.id, {
        kaufdatum: null,
        meta: {
          pipelineStufe: "notar",
          notarTermin: ["2026-09-12", "2026-09-01", null][i],
        },
      }),
    );
    const result = pipeline(contacts, invs, +new Date("2026-09-09"));
    expect(result.upcoming).toHaveLength(1);
    expect(result.overdue).toHaveLength(1);
    expect(result.unscheduled).toHaveLength(1);
  });
  it("berechnet Nachweisübergänge mit gemeinsamer Bezugsmenge und zeigt Lücken", () => {
    const rows = conversion(
      [contact("a"), contact("b")],
      [deal("a", "a", { meta: { rvSigned: true } })],
    );
    expect(
      rows.find((r) => r.label === "Reservierung unterschrieben")
        ?.missingPrevious,
    ).toBe(1);
    expect(rows.every((r) => r.rate === null || r.rate <= 100)).toBe(true);
    expect(conversion([], []).every((r) => r.rate === null)).toBe(true);
  });
});

describe("Fachliche Finanzierungs- und Einkommensdaten", () => {
  it("ordnet Angebote über Investment-ID zu, zählt einen ausgewählten Vertrag und keinen Kaufpreis als Darlehen", () => {
    const result = financingData(
      [deal("one", "customer"), deal("two", "customer")],
      [
        {
          id: "f",
          kunde_id: "one",
          angebote: [
            {
              id: "a",
              akzeptiert: true,
              summe: 150000,
              dokumente: [{ name: "Darlehensvertrag", status: "signed" }],
            },
          ],
        },
      ],
    );
    expect(result.confirmed).toHaveLength(1);
    expect(result.volume).toBe(150000);
  });
  it("rechnet bei mehrdeutiger Angebotsauswahl kein Volumen", () => {
    const result = financingData(
      [deal("one", "customer")],
      [
        {
          id: "f",
          kunde_id: "one",
          angebote: [
            { id: "a", akzeptiert: true, summe: 150000 },
            { id: "b", akzeptiert: true, summe: 250000 },
          ],
        },
      ],
    );
    expect(result.rows[0].financeState).toBe("Angebotszuordnung ungeklärt");
    expect(result.volume).toBe(0);
  });
  it("berücksichtigt ausschließlich Renten- und Mieteinkünfte und trennt fehlende Angaben von Null", () => {
    // Gelesen wird die Selbstauskunft eines Investments, nicht mehr der
    // Kontakt (Entscheidung Christian, 10.09.2026).
    expect(incomeOf({ einkommen: { rente: 2000, miet: 500 } })).toBe(2500);
    expect(incomeOf({ einkommen: { netto: 0 } })).toBe(0);
    expect(incomeOf(null)).toBeNull();
    expect(incomeOf({})).toBeNull();
    // Aeltere Selbstauskuenfte tragen die Werte flach.
    expect(incomeOf({ renten: 2000, mieteinnahmen: 500 })).toBe(2500);
  });
});

describe("Personenzählung unabhängig von Ranglisten", () => {
  it("zählt auch mehr als zehn Personen und trennt namensgleiche Nutzer", () => {
    const profiles = Array.from({ length: 17 }, (_, i) => ({
      id: String(i),
      name: "Alex",
    }));
    const acts = profiles.map((p) => ({
      id: `a${p.id}`,
      benutzer_id: p.id,
      von: "Alex",
    }));
    expect(activePeople(acts, profiles).count).toBe(17);
    expect(
      activePeople([{ id: "old", von: "Alex" }], profiles).unassigned,
    ).toBe(1);
  });
});

describe("Datenlücken und veraltete Kontaktstufen", () => {
  it("verschiebt ungültige Kalendertage nicht unbemerkt in den nächsten Monat", () => {
    expect(timestamp("31.02.2026")).toBeNull();
    expect(timestamp("2026-02-30")).toBeNull();
  });
  it("zählt einen Kontakt mit ausschließlich abgeschlossenen Investments nicht weiter als offen", () => {
    expect(pipeline([contact("k")], [deal("i", "k")]).open).toHaveLength(0);
  });
});
