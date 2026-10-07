import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Die Ergebnis-Karte im Kundenprofil, mit der ein Termin auf Erschienen oder
 * No-Show gesetzt wird.
 *
 * Zwei Dinge werden hier bewacht:
 *
 *   1. Ein selbst gebuchtes Erstgespraech bekommt eine Karte. Bis 09/2026 war
 *      der Anlass "erstgespraech" ausgeschlossen, und damit gab es fuer genau
 *      diesen Termin keine Knoepfe. Von Hand angelegte Erstgespraeche hatten
 *      sie laengst, selbst gebuchte nicht.
 *   2. Ein No-Show fuehrt auf die richtige NoShow-Stufe. Erstgespraech auf
 *      "EG NoShow", Beratungsgespraech auf "BG NoShow", und beides niemals
 *      rueckwaerts an einem Kunden, der schon weiter ist.
 */

const buchungen: Array<Record<string, unknown>> = [];
const kontakt: Record<string, unknown> = { id: "k-1", pipelineStufe: "erstgespraech_geplant" };
const gesetzteStufen: Array<{ id: string; stufe: unknown }> = [];
const gesetzteStatus: Array<{ id: string; status: string }> = [];
const folgeaufgaben: unknown[] = [];
const abgesagteAufgaben: string[] = [];
const erledigteAktivitaeten: string[] = [];
let statusAntwort: { ok: boolean; fehler: unknown; ersatzweg?: boolean } = { ok: true, fehler: null };

vi.mock("@/lib/buchungStore", () => ({
  ladeBuchungen: async () => buchungen,
  ladeLinks: async () => [],
  setzeBuchungStatus: async (id: string, status: string) => {
    gesetzteStatus.push({ id, status });
    return statusAntwort;
  },
  verschiebeBuchungIntern: async () => true,
}));

vi.mock("@/lib/aktivitaetenStore", () => ({
  addAktivitaet: () => {},
  addGeteilteAufgabe: async (a: unknown) => { folgeaufgaben.push(a); },
  getAktivitaeten: () => [],
  setzeAktivitaetErledigt: async (id: string) => { erledigteAktivitaeten.push(id); },
  verschiebeAktivitaetTermin: async () => {},
  loescheAktivitaet: async () => true,
}));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentsByKontakt: () => [],
  getSaSigned: () => false,
  getRvSigned: () => false,
  getSaSignaturePending: () => false,
}));

vi.mock("@/lib/dataCache", () => ({
  onCacheChange: () => () => {},
  cacheGet: () => [],
  // Der Kontakt aus dem Zwischenspeicher, fuer den Bestandsfall mit meta.
  cacheGetById: () => kontakt,
}));

vi.mock("@/lib/terminAnzeige", () => ({
  gaesteNamenAusDetails: () => [],
  investmentAusDetails: () => null,
  TERMINE_AKTUALISIERT_EVENT: "termine-aktualisiert",
}));

vi.mock("@/lib/meetingEinladung", () => ({ versendeMeetingEinladung: async () => true }));
vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [] }));
vi.mock("@/lib/oeffentlicheBasis", () => ({ oeffentlicheAdresse: (p: string) => `https://example.test${p}` }));
vi.mock("@/lib/videoraumStore", () => ({ beendeRaumMitToken: async () => true }));
vi.mock("@/lib/aufgabenStore", () => ({
  getAufgabenFuerKunde: () => [],
  erledigeAufgabe: async () => {},
  // Die echte Aufgabe hinter einem von Hand angelegten Meeting wird beim
  // Abschliessen mitgezogen; hier gibt es keine.
  findeAufgabeZuAktivitaet: () => ({ id: "aufgabe-1" }),
  sageAufgabeAb: async (id: string) => { abgesagteAufgaben.push(id); },
  updateAufgabe: async () => true,
}));
vi.mock("@/lib/confirm", () => ({ confirmDialog: async () => true }));
vi.mock("@/lib/kundenSprache", () => ({ stelleKundenspracheSicher: async () => {} }));
vi.mock("@/components/kunden/KundenspracheHinweis", () => ({ KundenspracheHinweis: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: () => kontakt,
  updateKontakt: (id: string, updates: Record<string, unknown>) => {
    gesetzteStufen.push({ id, stufe: updates.pipelineStufe });
    Object.assign(kontakt, updates);
  },
  mergeKontaktMetaMitGrund: async (_id: string, patch: Record<string, unknown>) => {
    kontakt.meta = { ...((kontakt.meta as object) || {}), ...patch };
    return { ok: true };
  },
}));

const { BuchungErgebnisKarten } = await import("@/components/kunden/BuchungErgebnisKarten");
// Die Regel selbst wohnt im gemeinsamen Modul, aus dem auch die Karte schreibt.
const { darfNoShowStufeSetzen, terminNoShow, terminErschienen, lokalesDatum, lokaleUhrzeit } = await import("@/lib/terminErgebnis");

/** Eine offene Buchung, deren Termin schon vorbei ist. */
function buchung(anlass: string, bezeichnung: string) {
  const vorbei = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return {
    id: `b-${anlass}`,
    mitarbeiter_id: "u-1",
    kontakt_id: "k-1",
    name: "Spiros Tsiepas",
    bezeichnung,
    anlass,
    status: "offen",
    start_at: vorbei,
    created_at: vorbei,
    dauer_minuten: 60,
  };
}

function zeige() {
  return render(
    <BuchungErgebnisKarten
      kundeId="k-1"
      kundeName="Spiros Tsiepas"
      beraterName="Christian Peetz"
      canSet
      userName="Christian Peetz"
    />,
  );
}

beforeEach(() => {
  buchungen.length = 0;
  gesetzteStufen.length = 0;
  gesetzteStatus.length = 0;
  folgeaufgaben.length = 0;
  abgesagteAufgaben.length = 0;
  erledigteAktivitaeten.length = 0;
  statusAntwort = { ok: true, fehler: null };
  for (const k of Object.keys(kontakt)) delete kontakt[k];
  Object.assign(kontakt, { id: "k-1", pipelineStufe: "erstgespraech_geplant" });
});

describe("Karte fuer das selbst gebuchte Erstgespraech", () => {
  it("erscheint mit Stattgefunden und Nicht erschienen", async () => {
    buchungen.push(buchung("erstgespraech", "Telefonisches Erstgespräch"));
    zeige();
    expect(await screen.findByText("Telefonisches Erstgespräch: Ergebnis")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Stattgefunden/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Nicht erschienen/ })).not.toBeDisabled();
  });

  it("bietet auch Verschoben und Löschen an", async () => {
    buchungen.push(buchung("erstgespraech", "Telefonisches Erstgespräch"));
    zeige();
    expect(await screen.findByRole("button", { name: /Verschoben/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Löschen/ })).toBeTruthy();
  });

  it("setzt beim No-Show die Stufe EG NoShow", async () => {
    buchungen.push(buchung("erstgespraech", "Telefonisches Erstgespräch"));
    zeige();
    fireEvent.click(await screen.findByRole("button", { name: /Nicht erschienen/ }));
    await waitFor(() => expect(gesetzteStufen).toEqual([{ id: "k-1", stufe: "eg_noshow" }]));
    expect(gesetzteStatus).toEqual([{ id: "b-erstgespraech", status: "nicht_erschienen" }]);
  });

  it("verwechselt die beiden NoShow-Stufen nicht", async () => {
    kontakt.pipelineStufe = "beratungsgespraech";
    buchungen.push(buchung("beratung", "Beratungsgespräch"));
    zeige();
    fireEvent.click(await screen.findByRole("button", { name: /Nicht erschienen/ }));
    await waitFor(() => expect(gesetzteStufen).toEqual([{ id: "k-1", stufe: "bg_noshow" }]));
  });

  it("laesst die Stufe in Ruhe, wo es keine NoShow-Stufe gibt", async () => {
    buchungen.push(buchung("objektvorstellung", "Objektvorstellung"));
    zeige();
    fireEvent.click(await screen.findByRole("button", { name: /Nicht erschienen/ }));
    await waitFor(() => expect(gesetzteStatus.length).toBe(1));
    expect(gesetzteStufen).toEqual([]);
  });

  it("zeigt weiterhin keine Karte fuer sonstige Termine", async () => {
    buchungen.push(buchung("sonstiges", "Kurzer Rückruf"));
    const { container } = zeige();
    await waitFor(() => expect(container.querySelector("h3")).toBeNull());
  });
});

describe("Knoepfe sind jederzeit klickbar, auch vor dem Termin", () => {
  // Bis 01.10.2026 waren Stattgefunden und Nicht erschienen bis zum
  // Terminbeginn gesperrt. Christian will alle Knoepfe jederzeit.
  it("sperrt bei einem kuenftigen Termin keinen Knopf", async () => {
    const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    buchungen.push({ ...buchung("erstgespraech", "Erstgespräch"), start_at: morgen });
    render(
      <BuchungErgebnisKarten
        kundeId="k-1"
        kundeName="Kunde"
        kundeEmail="kunde@example.test"
        beraterName="Christian Peetz"
        canSet
        userName="Christian Peetz"
      />,
    );
    expect(await screen.findByText("Erstgespräch: Ergebnis")).toBeTruthy();
    for (const name of [/Stattgefunden/, /Nicht erschienen/, /Verschoben/, /Einladung erneut senden/, /Löschen/]) {
      expect(screen.getByRole("button", { name })).not.toBeDisabled();
    }
    fireEvent.click(screen.getByRole("button", { name: /Stattgefunden/ }));
    await waitFor(() => expect(gesetzteStatus).toEqual([{ id: "b-erstgespraech", status: "wahrgenommen" }]));
  });
});

describe("No-Show schliesst den Termin, ohne ihn als gefuehrt zu zaehlen", () => {
  it("sagt die Aufgabe zum Termin ab und merkt den No-Show je Termin", async () => {
    // Die Aufgabe haengt ueber das Meeting der Buchung am Termin.
    const b = { ...buchung("erstgespraech", "Erstgespräch"), aktivitaet_id: "akt-1" };
    buchungen.push(b);
    zeige();
    fireEvent.click(await screen.findByRole("button", { name: /Nicht erschienen/ }));
    await waitFor(() => expect(abgesagteAufgaben).toEqual(["aufgabe-1"]));
    const start = new Date(b.start_at);
    expect((kontakt.meta as { noShowTermine?: string[] }).noShowTermine)
      .toEqual([`${lokalesDatum(start)} ${lokaleUhrzeit(start)}`]);
    expect(folgeaufgaben).toHaveLength(1);
  });
});

describe("Bestandsfall: No-Show zu diesem Termin schon erfasst", () => {
  function erfasst(b: { start_at: string }) {
    const start = new Date(b.start_at);
    kontakt.meta = { noShowTermine: [`${lokalesDatum(start)} ${lokaleUhrzeit(start)}`] };
  }

  it("zeigt keinen Ergebnis-Kasten mehr", async () => {
    const b = buchung("beratung", "Beratungsgespräch");
    buchungen.push(b);
    erfasst(b);
    const { container } = zeige();
    await waitFor(() => expect(gesetzteStatus).toEqual([]));
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector("h3")).toBeNull();
  });

  it("schliesst den alten Termin am Haken ohne zweite Folgekette", async () => {
    const b = buchung("beratung", "Beratungsgespräch");
    erfasst(b);
    kontakt.pipelineStufe = "bg_noshow";
    const meldungen: string[] = [];
    const ok = await terminNoShow(
      { key: `bu-${b.id}`, quelle: "buchung", buchung: b as never, titel: b.bezeichnung, startAt: new Date(b.start_at) },
      { kundeId: "k-1", kundeName: "Kunde", userName: "Admin", melde: (m) => { meldungen.push(m.title); } },
    );
    expect(ok).toBe(true);
    expect(gesetzteStatus).toEqual([{ id: "b-beratung", status: "nicht_erschienen" }]);
    expect(folgeaufgaben).toEqual([]);
    expect(gesetzteStufen).toEqual([]);
    expect(meldungen).toEqual(["Termin geschlossen"]);
  });
});

describe("darfNoShowStufeSetzen", () => {
  it("setzt am selben Kaestchen der Fortschrittsleiste", () => {
    expect(darfNoShowStufeSetzen("erstgespraech_geplant", "eg_noshow")).toBe(true);
    expect(darfNoShowStufeSetzen("beratungsgespraech", "bg_noshow")).toBe(true);
  });

  it("holt einen frueheren Stand nach vorn auf den geplatzten Termin", () => {
    expect(darfNoShowStufeSetzen("neuer_lead", "eg_noshow")).toBe(true);
    expect(darfNoShowStufeSetzen("erstgespraech_geplant", "bg_noshow")).toBe(true);
  });

  it("wirft einen weiter fortgeschrittenen Vorgang nicht zurueck", () => {
    expect(darfNoShowStufeSetzen("selbstauskunft", "eg_noshow")).toBe(false);
    expect(darfNoShowStufeSetzen("finanzierung", "bg_noshow")).toBe(false);
    expect(darfNoShowStufeSetzen("beratungsgespraech", "eg_noshow")).toBe(false);
  });

  it("fasst Endzustaende und den eigenen Stand nicht an", () => {
    expect(darfNoShowStufeSetzen("verloren", "eg_noshow")).toBe(false);
    expect(darfNoShowStufeSetzen("archiviert", "bg_noshow")).toBe(false);
    expect(darfNoShowStufeSetzen("eg_noshow", "eg_noshow")).toBe(false);
  });
});

describe("Stattgefunden: Fehler sichtbar, Ersatzweg hakt die Termin-Zeile ab (01.10.2026)", () => {
  const termin = () => {
    const b = { ...buchung("erstgespraech", "Erstgespräch"), aktivitaet_id: "akt-9" };
    return { key: `bu-${b.id}`, quelle: "buchung" as const, buchung: b as never, titel: b.bezeichnung, startAt: new Date(b.start_at) };
  };
  const ctx = (meldungen: Array<{ title: string; description?: string }>) =>
    ({ kundeId: "k-1", kundeName: "Kunde", userName: "Admin", melde: (m: { title: string; description?: string }) => { meldungen.push(m); } });

  it("zeigt die echte Meldung der Datenbank", async () => {
    statusAntwort = { ok: false, fehler: { message: "Keine Berechtigung fuer diese Buchung" } };
    const meldungen: Array<{ title: string; description?: string }> = [];
    expect(await terminErschienen(termin(), ctx(meldungen))).toBe(false);
    expect(meldungen[0]).toMatchObject({
      title: "Der Status konnte nicht gespeichert werden",
      description: "Keine Berechtigung fuer diese Buchung",
    });
  });

  it("hakt nach dem Ersatzweg die Termin-Zeile selbst ab", async () => {
    statusAntwort = { ok: true, fehler: { message: "Folgefehler" }, ersatzweg: true };
    const meldungen: Array<{ title: string; description?: string }> = [];
    expect(await terminErschienen(termin(), ctx(meldungen))).toBe(true);
    expect(erledigteAktivitaeten).toEqual(["akt-9"]);
  });

  it("laesst die Termin-Zeile der Datenbank, wenn die Funktion lief", async () => {
    expect(await terminErschienen(termin(), ctx([]))).toBe(true);
    expect(erledigteAktivitaeten).toEqual([]);
  });
});
