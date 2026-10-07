import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  VORSTELLUNG_POOL_VERMERK,
  VORSTELLUNG_TITEL,
  planeVorstellungsAufgabe,
  schliesseVorstellungsAufgabe,
  stelleVorstellungsAufgabeSicher,
  vorstellungBeschreibung,
} from "../../../supabase/functions/_shared/handbuch-vorstellung.ts";
import { hatGeplantenTermin, naechsterKontakt } from "../naechsterKontakt";
import { bewertePipelineKachel } from "../pipelineAmpel";

type Zeile = Record<string, unknown>;

/** Nachgebaute Datenbank: gerade so viel Supabase-Kette, wie das Modul braucht. */
function fakeDb(stand: { kontakt: Zeile | null; investments: Zeile[]; aufgaben: Zeile[]; insertFehler?: { code: string } }) {
  const log = { inserts: [] as Zeile[], updates: [] as Array<{ id: string; patch: Zeile }> };
  const db = {
    from(tabelle: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: stand.kontakt, error: null }),
        then: (ok: any, nein: any) =>
          Promise.resolve({ data: tabelle === "investments" ? stand.investments : stand.aufgaben, error: null }).then(ok, nein),
        insert: async (row: Zeile) => {
          log.inserts.push(row);
          return { error: stand.insertFehler ?? null };
        },
        update: (patch: Zeile) => ({
          eq: async (_spalte: string, id: string) => {
            log.updates.push({ id, patch });
            return { error: null };
          },
        }),
      };
      return q;
    },
  };
  return { db, log };
}

const ANTWORTEN = { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" };
const HANDBUCH = { quelle: "Konfigurator", meta: { handbuchFunnel: { antworten: ANTWORTEN } } };
const SA_FERTIG = { id: "inv1", erstellt_am: "2026-09-26", meta: { saSigned: true, pipelineStufe: "objektauswahl" } };

describe("Objekt-Vorstellungstermin für Handbuch-Leads", () => {
  it("Auslöser b: Selbstauskunft fertig, Lead gehört schon einem Partner → Aufgabe für ihn", async () => {
    const { db, log } = fakeDb({ kontakt: HANDBUCH, investments: [SA_FERTIG], aufgaben: [] });
    const plan = await stelleVorstellungsAufgabeSicher(db, "k1", "partner1");
    expect(plan.aktion).toBe("anlegen");
    expect(log.inserts).toHaveLength(1);
    expect(log.inserts[0]).toMatchObject({
      titel: VORSTELLUNG_TITEL,
      benutzer_id: "partner1",
      zugewiesen_an: "partner1",
      kontakt_id: "k1",
      investment_id: "inv1",
      status: "offen",
      ausloeser_schluessel: "objekt_vorstellung:k1",
    });
    expect(String(log.inserts[0].faellig_am)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(log.inserts[0].beschreibung)).toContain("Rahmen laut Konfigurator: 158.000 bis 222.000 €");
  });

  it("Auslöser a: Zuweisung, Selbstauskunft liegt schon vor → Aufgabe für den Partner, angelegt vom Zuweisenden", async () => {
    const { db, log } = fakeDb({ kontakt: HANDBUCH, investments: [SA_FERTIG], aufgaben: [] });
    await stelleVorstellungsAufgabeSicher(db, "k1", "partner1", "leitung1");
    expect(log.inserts[0]).toMatchObject({ benutzer_id: "leitung1", zugewiesen_an: "partner1" });
  });

  it("ohne unterschriebene Selbstauskunft entsteht noch nichts", async () => {
    const { db, log } = fakeDb({
      kontakt: HANDBUCH,
      investments: [{ id: "inv1", meta: { saSigned: false, pipelineStufe: "selbstauskunft" } }],
      aufgaben: [],
    });
    expect((await stelleVorstellungsAufgabeSicher(db, "k1", "partner1")).aktion).toBe("nichts");
    expect(log.inserts).toHaveLength(0);
  });

  it("keine Doppelten: offene Aufgabe beim selben Partner bleibt allein", async () => {
    const { db, log } = fakeDb({
      kontakt: HANDBUCH,
      investments: [SA_FERTIG],
      aufgaben: [{ id: "a1", status: "offen", zugewiesen_an: "partner1" }],
    });
    expect((await stelleVorstellungsAufgabeSicher(db, "k1", "partner1")).aktion).toBe("nichts");
    expect(log.inserts).toHaveLength(0);
    expect(log.updates).toHaveLength(0);
  });

  it("Neuzuweisung: offene Aufgabe wird auf den neuen Partner umgehängt", async () => {
    const { db, log } = fakeDb({
      kontakt: HANDBUCH,
      investments: [SA_FERTIG],
      aufgaben: [{ id: "a1", status: "offen", zugewiesen_an: "partner1" }],
    });
    expect((await stelleVorstellungsAufgabeSicher(db, "k1", "partner2")).aktion).toBe("umhaengen");
    expect(log.updates).toEqual([{ id: "a1", patch: { zugewiesen_an: "partner2" } }]);
    expect(log.inserts).toHaveLength(0);
  });

  it("schon abgehakt: auch nach einem Partnerwechsel keine neue", () => {
    const plan = planeVorstellungsAufgabe({
      quelle: "Konfigurator",
      partnerId: "partner2",
      investments: [SA_FERTIG],
      vorhandene: [{ id: "a1", status: "erledigt", zugewiesen_an: "partner1" }],
    });
    expect(plan.aktion).toBe("nichts");
  });

  it("andere Quellen bleiben unberührt, die alte Quelle „Handbuch-Seite“ zählt mit", async () => {
    const meta = { quelle: "Meta Ads", meta: {} };
    const { db, log } = fakeDb({ kontakt: meta, investments: [SA_FERTIG], aufgaben: [] });
    expect((await stelleVorstellungsAufgabeSicher(db, "k1", "partner1")).aktion).toBe("nichts");
    expect(log.inserts).toHaveLength(0);

    const alt = planeVorstellungsAufgabe({ quelle: "Handbuch-Seite", partnerId: "p", investments: [SA_FERTIG], vorhandene: [] });
    expect(alt.aktion).toBe("anlegen");
  });

  it("nur solange der nächste Schritt „Passende Wohnung vorschlagen“ ist", () => {
    const reserviert = { id: "inv1", meta: { saSigned: true, pipelineStufe: "reservierung" } };
    expect(planeVorstellungsAufgabe({ quelle: "Konfigurator", partnerId: "p", investments: [reserviert], vorhandene: [] }).aktion).toBe("nichts");
  });

  it("ohne Partner entsteht nichts", () => {
    expect(planeVorstellungsAufgabe({ quelle: "Konfigurator", partnerId: "", investments: [SA_FERTIG], vorhandene: [] }).aktion).toBe("nichts");
  });

  it("ein gleichzeitiger Lauf (eindeutiger Index) gilt nicht als Fehler", async () => {
    const { db } = fakeDb({ kontakt: HANDBUCH, investments: [SA_FERTIG], aufgaben: [], insertFehler: { code: "23505" } });
    expect((await stelleVorstellungsAufgabeSicher(db, "k1", "partner1")).aktion).toBe("anlegen");
  });

  it("Rückgabe in den Pool: offene Aufgabe wird abgesagt, mit Vermerk; erledigte bleibt", async () => {
    const { db, log } = fakeDb({
      kontakt: HANDBUCH,
      investments: [],
      aufgaben: [
        { id: "a1", status: "offen", beschreibung: "Selbstauskunft liegt vor." },
        { id: "a0", status: "erledigt", beschreibung: "alt" },
      ],
    });
    expect(await schliesseVorstellungsAufgabe(db, "k1")).toBe(1);
    expect(log.updates).toEqual([
      { id: "a1", patch: { status: "abgesagt", beschreibung: `Selbstauskunft liegt vor.\n\n${VORSTELLUNG_POOL_VERMERK}` } },
    ]);
  });

  it("nach der Rückgabe entsteht die Aufgabe bei der Neuzuteilung neu, auch für denselben Partner", () => {
    const abgesagt = [{ id: "a1", status: "abgesagt", zugewiesen_an: "partner1" }];
    for (const partnerId of ["partner2", "partner1"]) {
      const plan = planeVorstellungsAufgabe({ quelle: "Konfigurator", partnerId, investments: [SA_FERTIG], vorhandene: abgesagt });
      expect(plan).toEqual({ aktion: "anlegen", investmentId: "inv1" });
    }
  });

  it("nach Rückgabe und Neuzuteilung weiterhin nur eine offene", () => {
    const plan = planeVorstellungsAufgabe({
      quelle: "Konfigurator",
      partnerId: "partner2",
      investments: [SA_FERTIG],
      vorhandene: [
        { id: "a1", status: "abgesagt", zugewiesen_an: "partner1" },
        { id: "a2", status: "offen", zugewiesen_an: "partner2" },
      ],
    });
    expect(plan.aktion).toBe("nichts");
  });

  it("offene Selbstauskunft ohne Konfigurator: Text ohne Rahmen", () => {
    expect(vorstellungBeschreibung({})).toBe(
      "Selbstauskunft liegt vor. Vereinbare einen Termin, um passende Wohnungen vorzustellen.",
    );
  });
});

const supabaseFrom = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => supabaseFrom(t) } }));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));

describe("vorstellungsAufgabeNachZuweisung (Browser)", () => {
  beforeEach(() => supabaseFrom.mockReset());

  it("fragt bei Leads anderer Quellen nicht einmal die Datenbank", async () => {
    const { vorstellungsAufgabeNachZuweisung } = await import("./vorstellungsAufgabe");
    await vorstellungsAufgabeNachZuweisung({ id: "k1", quelle: "Empfehlung" }, "partner1", "leitung1");
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it("Rückgabe in den Pool: bei anderen Quellen keine Abfrage, beim Handbuch-Lead wird geschlossen", async () => {
    const { vorstellungsAufgabeNachPoolRueckgabe } = await import("./vorstellungsAufgabe");
    await vorstellungsAufgabeNachPoolRueckgabe({ id: "k1", quelle: "Empfehlung" });
    expect(supabaseFrom).not.toHaveBeenCalled();

    const { db, log } = fakeDb({ kontakt: HANDBUCH, investments: [], aufgaben: [{ id: "a1", status: "offen" }] });
    supabaseFrom.mockImplementation((t: string) => db.from(t));
    await vorstellungsAufgabeNachPoolRueckgabe({ id: "k1", quelle: "Konfigurator" });
    expect(log.updates[0]).toMatchObject({ id: "a1", patch: { status: "abgesagt" } });
  });

  it("legt bei einem Handbuch-Lead über den Client des Zuweisenden an", async () => {
    const { db, log } = fakeDb({ kontakt: HANDBUCH, investments: [SA_FERTIG], aufgaben: [] });
    supabaseFrom.mockImplementation((t: string) => db.from(t));
    const { vorstellungsAufgabeNachZuweisung } = await import("./vorstellungsAufgabe");
    await vorstellungsAufgabeNachZuweisung({ id: "k1", quelle: "Konfigurator" }, "partner1", "leitung1");
    expect(log.inserts[0]).toMatchObject({ zugewiesen_an: "partner1", benutzer_id: "leitung1" });
  });
});

describe("Ampel: Objekt-Vorstellungstermin zählt als direkt fällig", () => {
  // Samstag, 26.09.2026, 10 Uhr Ortszeit; fällig heute.
  const jetzt = new Date(2026, 8, 26, 10, 0).getTime();
  const ampel = (sofortFaellig: boolean) => {
    const quellen = { aufgaben: [{ titel: VORSTELLUNG_TITEL, faelligAm: "2026-09-26", sofortFaellig }] };
    const naechster = naechsterKontakt(quellen, jetzt)!;
    return bewertePipelineKachel({
      stufe: "objektauswahl",
      tageSeitAenderung: 0,
      naechsterKontakt: {
        zeitpunkt: naechster.zeitpunkt,
        ueberfaellig: naechster.ueberfaellig,
        quelle: naechster.quelle,
        bezeichnung: naechster.titel,
      },
      hatZukuenftigenTermin: hatGeplantenTermin(quellen, jetzt),
      jetzt,
    });
  };

  it("Handlungsbedarf statt „Aufgabe geplant“", () => {
    const r = ampel(true);
    expect(r.farbe).toBe("red");
    expect(r.text).toContain(VORSTELLUNG_TITEL);
  });

  it("gewöhnliche Aufgaben für heute bleiben unverändert „geplant“", () => {
    expect(ampel(false)).toMatchObject({ farbe: null, text: "Aufgabe geplant" });
  });
});
