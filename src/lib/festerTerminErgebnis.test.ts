/**
 * Ergebnis fester Termine am Kontakt (Auftrag vom 29.09.2026).
 *
 * Bewacht werden drei Zusagen:
 *   1. Das Beratungsgespraech hat dieselbe Nachfrage wie das Erstgespraech,
 *      mit der passenden NoShow-Stufe und dem passenden naechsten Schritt.
 *   2. Die Rueckfrage am Haken bietet bei einem vergangenen Termin
 *      "Nicht stattgefunden" an; das nimmt den Termin aus der Liste, ohne die
 *      Pipeline vorzuruecken.
 *   3. Ein No-Show gibt nichts an eine Setterin zurueck: Zustaendigkeit und
 *      Setter bleiben unberuehrt, Glocke und Aufgaben gehen nur an den
 *      aktuell zustaendigen Partner.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({
  kontakt: null as Record<string, unknown> | null,
  investments: [] as Array<{ id: string; pipelineStufe: string }>,
  zustaendig: "vp-1" as string | undefined,
  merge: vi.fn(),
  update: vi.fn(),
  invUpdate: vi.fn(),
  aktivitaet: vi.fn(),
  aufgabe: vi.fn(),
  glocke: vi.fn(),
  buchungen: [] as Array<Record<string, unknown>>,
  meetings: [] as Array<Record<string, unknown>>,
  buchungStatus: vi.fn(),
  meetingErledigt: vi.fn(),
  abgesagt: vi.fn(),
}));

vi.mock("./buchungStore", async (orig) => ({
  ...(await orig<typeof import("./buchungStore")>()),
  ladeBuchungen: async () => t.buchungen,
  ladeLinks: async () => [],
  setzeBuchungStatus: async (...a: unknown[]) => { t.buchungStatus(...a); return { ok: true, fehler: null }; },
}));
vi.mock("./aufgabenStore", async (orig) => ({
  ...(await orig<typeof import("./aufgabenStore")>()),
  findeAufgabeZuAktivitaet: (_k: string, _b: unknown, _f: unknown, aktivitaetId: string) => ({ id: `aufgabe-${aktivitaetId}` }),
  sageAufgabeAb: async (...a: unknown[]) => { t.abgesagt(...a); },
  erledigeAufgabe: async () => { throw new Error("Ein No-Show darf keine Aufgabe erledigen"); },
}));

vi.mock("./kundenStore", async (orig) => ({
  ...(await orig<typeof import("./kundenStore")>()),
  mergeKontaktMetaMitGrund: (...a: unknown[]) => t.merge(...a),
  updateKontakt: (id: string, patch: Record<string, unknown>) => {
    t.update(id, patch);
    if (t.kontakt) t.kontakt = { ...t.kontakt, ...patch };
    return Promise.resolve(true);
  },
  getKontaktById: () => t.kontakt,
}));
vi.mock("./investmentsStore", async (orig) => ({
  ...(await orig<typeof import("./investmentsStore")>()),
  getInvestmentsByKontakt: () => t.investments,
  updateInvestment: (...a: unknown[]) => t.invUpdate(...a),
}));
vi.mock("./kontaktPipeline", async (orig) => ({
  ...(await orig<typeof import("./kontaktPipeline")>()),
  getEffectivePipelineStufe: (k: { pipelineStufe?: string }) => k.pipelineStufe,
}));
vi.mock("./aktivitaetenStore", async (orig) => ({
  ...(await orig<typeof import("./aktivitaetenStore")>()),
  addAktivitaet: (...a: unknown[]) => t.aktivitaet(...a),
  addGeteilteAufgabe: (...a: unknown[]) => { t.aufgabe(...a); return Promise.resolve(true); },
  getAktivitaeten: () => t.meetings,
  setzeAktivitaetErledigt: async (...a: unknown[]) => { t.meetingErledigt(...a); },
}));
vi.mock("./bellNotifications", async (orig) => ({
  ...(await orig<typeof import("./bellNotifications")>()),
  aktuellerZustaendiger: () => t.zustaendig,
  notifyUser: (...a: unknown[]) => t.glocke(...a),
}));

const f = await import("./festerTerminErgebnis");
const { getNextSteps } = await import("./nextStepsGuide");
const { festeTermine, offenerSetterTerminSchluessel } = await import("./kontaktTermine");
const { baueGeplanteAktionen, neuerGespraechsterminNachNoShow, noShowListe } = await import("./kundenNaechsteAktion");

function kunde(teil: Record<string, unknown> = {}) {
  t.kontakt = {
    id: "k-1",
    vorname: "Test",
    nachname: "Kunde",
    berater: "Partner A",
    zustaendig_id: "vp-1",
    setter: "Setterin S",
    setterTerminDatum: "2026-09-20",
    setterTerminUhrzeit: "10:00",
    meta: {},
    ...teil,
  };
  return t.kontakt as never;
}

const meldungen: Array<{ title: string; description?: string }> = [];
const ctx = (k: never) => ({ kunde: k, userName: "Admin X", melde: (m: { title: string; description?: string }) => { meldungen.push(m); } });

/** Alles, was ein Nutzer zu sehen bekommt, in einem Text. */
function sichtbareTexte(): string {
  return JSON.stringify([t.aktivitaet.mock.calls, t.aufgabe.mock.calls, t.glocke.mock.calls, meldungen]);
}

beforeEach(() => {
  for (const fn of [t.merge, t.update, t.invUpdate, t.aktivitaet, t.aufgabe, t.glocke, t.buchungStatus, t.meetingErledigt, t.abgesagt]) fn.mockReset();
  t.buchungen = [];
  t.meetings = [];
  t.merge.mockResolvedValue({ ok: true });
  t.investments = [];
  t.zustaendig = "vp-1";
  meldungen.length = 0;
});

describe("No-Show beim Erstgespräch: der Lead bleibt beim Partner", () => {
  it("setzt EG NoShow, fasst Zuständigkeit und Setter nicht an und nennt keine Setterin", async () => {
    const k = kunde({ pipelineStufe: "erstgespraech_geplant" });
    t.investments = [
      { id: "inv-frueh", pipelineStufe: "erstgespraech_geplant" },
      { id: "inv-weit", pipelineStufe: "reservierung" },
    ];
    const ok = await f.festerTerminNichtStattgefunden(
      { titel: "Erstgespräch", datum: "2026-09-20", uhrzeit: "10:00", setterTermin: true },
      ctx(k),
    );
    expect(ok).toBe(true);

    // Aus der Liste der nächsten Aktionen, aber nicht als erledigt.
    expect(t.merge).toHaveBeenCalledWith("k-1", {
      erledigteTermine: ["2026-09-20 10:00"],
      noShowTermine: ["2026-09-20 10:00"],
    });
    const patches = t.update.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(patches.some((p) => p.pipelineStufe === "eg_noshow")).toBe(true);
    expect(patches.some((p) => p.pipelineStufe === "bg_noshow")).toBe(false);
    expect(patches.some((p) => p.terminErgebnis === "noshow")).toBe(true);
    for (const p of patches) {
      for (const feld of ["zustaendig_id", "berater", "setter", "setterId"]) expect(p).not.toHaveProperty(feld);
    }

    // Nächster Schritt: die Kachel liest die Investment-Stufe.
    expect(t.invUpdate).toHaveBeenCalledWith("inv-frueh", { pipelineStufe: "eg_noshow" });
    expect(t.invUpdate).not.toHaveBeenCalledWith("inv-weit", expect.anything());
    expect(getNextSteps("eg_noshow", false)?.titel).toBe("Neuen Erstgesprächstermin vereinbaren");

    // Glocke und Aufgaben nur an den Zuständigen.
    expect(t.glocke).toHaveBeenCalledTimes(1);
    expect(t.glocke.mock.calls[0][0]).toBe("vp-1");
    expect(t.aufgabe).toHaveBeenCalledTimes(3);
    for (const [aufgabe] of t.aufgabe.mock.calls) {
      expect(aufgabe.zugewiesenAn).toBe("vp-1");
      expect(aufgabe.titel).toContain("neuen Erstgesprächstermin vereinbaren");
    }

    const texte = sichtbareTexte();
    expect(texte).not.toMatch(/setter/i);
    expect(texte).not.toContain("zurückgegeben");
    expect(texte).not.toContain(" – ");
    expect(meldungen.at(-1)?.description).toContain("Der Lead bleibt bei Partner A");
    expect(meldungen.at(-1)?.description).toContain("Neuen Erstgesprächstermin vereinbaren");
  });

  it("schickt ohne Zuständigen keine Glocke an irgendwen", async () => {
    t.zustaendig = undefined;
    const k = kunde({ pipelineStufe: "erstgespraech_geplant", zustaendig_id: null });
    await f.festerTerminNichtStattgefunden({ titel: "Erstgespräch", datum: "2026-09-20", uhrzeit: "10:00" }, ctx(k));
    expect(t.glocke).not.toHaveBeenCalled();
  });
});

describe("Beratungsgespräch: dieselbe Nachfrage wie beim Erstgespräch", () => {
  it("No-Show setzt BG NoShow und plant einen neuen Beratungstermin", async () => {
    const k = kunde({ pipelineStufe: "beratungsgespraech", setterTerminDatum: "" });
    await f.festerTerminNichtStattgefunden({ titel: "Beratungsgespräch", datum: "2026-06-24", uhrzeit: "14:00" }, ctx(k));
    const patches = t.update.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(patches).toContainEqual({ pipelineStufe: "bg_noshow" });
    // Kein Setter-Feld: Ergebnis und Historie am Kontakt bleiben unberührt.
    expect(patches.some((p) => "terminErgebnis" in p || "noShowHistorie" in p)).toBe(false);
    expect(t.aufgabe.mock.calls[0][0].titel).toContain("neuen Beratungstermin vereinbaren");
    expect(getNextSteps("bg_noshow", false)?.titel).toBe(f.neuerTerminSchritt("Beratungsgespräch"));
  });

  it("wirft einen weiter gediehenen Vorgang nicht zurück", async () => {
    const k = kunde({ pipelineStufe: "selbstauskunft", setterTerminDatum: "" });
    await f.festerTerminNichtStattgefunden({ titel: "Beratungsgespräch", datum: "2026-06-24", uhrzeit: "14:00" }, ctx(k));
    expect(t.update.mock.calls.some((c) => "pipelineStufe" in (c[1] as object))).toBe(false);
  });

  it("Stattgefunden hebt BG NoShow wieder auf Beratungsgespräch", async () => {
    const k = kunde({ pipelineStufe: "bg_noshow", setterTerminDatum: "" });
    await f.festerTerminStattgefunden({ titel: "Beratungsgespräch", datum: "2026-06-24", uhrzeit: "14:00" }, ctx(k));
    expect(t.update).toHaveBeenCalledWith("k-1", { pipelineStufe: "beratungsgespraech" });
    expect(t.aktivitaet.mock.calls[0][0].beschreibung).toBe("Beratungsgespräch stattgefunden ✓");
  });

  it("speichert nichts weiter, wenn der Termin nicht aus der Liste genommen werden konnte", async () => {
    t.merge.mockResolvedValue({ ok: false, grund: "keine Rechte" });
    const k = kunde({ pipelineStufe: "beratungsgespraech" });
    const ok = await f.festerTerminNichtStattgefunden({ titel: "Beratungsgespräch", datum: "2026-06-24" }, ctx(k));
    expect(ok).toBe(false);
    expect(t.update).not.toHaveBeenCalled();
    expect(t.aufgabe).not.toHaveBeenCalled();
  });
});

/** Termin der Terminseite: Buchung mit Meeting und Aufgabe zum selben Zeitpunkt. */
function buchungUm(id: string, datum: string, uhrzeit: string, anlass = "beratung") {
  const start = new Date(`${datum}T${uhrzeit}:00`).toISOString();
  t.buchungen.push({ id, anlass, status: "offen", start_at: start, created_at: start, aktivitaet_id: `akt-${id}`, dauer_minuten: 45 });
}

describe("No-Show schliesst den geplanten Termin (Punkt 1 und 2)", () => {
  it("schließt Buchung, Meeting und Aufgabe zum selben Zeitpunkt als nicht stattgefunden", async () => {
    buchungUm("b-gleich", "2026-06-24", "14:00");
    buchungUm("b-anders", "2026-06-25", "14:00");
    t.meetings.push({ id: "m-1", art: "meeting", beschreibung: "Beratungsgespräch", faelligAm: "2026-06-24", uhrzeit: "14:00" });
    const k = kunde({ pipelineStufe: "beratungsgespraech", setterTerminDatum: "" });
    await f.festerTerminNichtStattgefunden({ titel: "Beratungsgespräch", datum: "2026-06-24", uhrzeit: "14:00" }, ctx(k));

    expect(t.buchungStatus.mock.calls).toEqual([["b-gleich", "nicht_erschienen"]]);
    expect(t.meetingErledigt.mock.calls.map((c) => c[0])).toEqual(["m-1"]);
    // Abgesagt, nicht erledigt: zählt nicht als geführtes Gespräch.
    expect(t.abgesagt.mock.calls.map((c) => c[0]).sort()).toEqual(["aufgabe-akt-b-gleich", "aufgabe-m-1"]);
    // Kein Vorrücken: nur die NoShow-Stufe.
    const stufen = t.update.mock.calls.map((c) => (c[1] as { pipelineStufe?: string }).pipelineStufe).filter(Boolean);
    expect(stufen).toEqual(["bg_noshow"]);
  });

  it("der Kasten zum Setter-Termin verschwindet nach dem No-Show", async () => {
    const k = kunde({ pipelineStufe: "erstgespraech_geplant" });
    expect(offenerSetterTerminSchluessel(k)).toBe("2026-09-20 10:00");
    await f.festerTerminNichtStattgefunden(
      { titel: "Erstgespräch", datum: "2026-09-20", uhrzeit: "10:00", setterTermin: true },
      ctx(k),
    );
    expect(offenerSetterTerminSchluessel(t.kontakt as never)).toBeNull();
  });
});

describe("Neuer Termin nach einem No-Show (Punkt 5)", () => {
  it("bekommt wieder einen Kasten, auch wenn am Kontakt noch noshow steht", () => {
    const k = kunde({
      terminErgebnis: "noshow",
      setterTerminDatum: "2026-10-02",
      setterTerminUhrzeit: "11:00",
      meta: { noShowTermine: ["2026-09-20 10:00"], erledigteTermine: ["2026-09-20 10:00"] },
    });
    expect(offenerSetterTerminSchluessel(k)).toBe("2026-10-02 11:00");
    const titel = festeTermine(k).map((x) => `${x.bezeichnung} ${x.datum}`);
    expect(titel).toContain("Erstgespräch 2026-10-02");
  });

  it("ein verschobener Termin bleibt in der Liste", () => {
    const k = kunde({ terminErgebnis: "verschoben", setterTerminDatum: "2026-10-05", setterTerminUhrzeit: "09:00" });
    expect(offenerSetterTerminSchluessel(k)).toBe("2026-10-05 09:00");
    expect(festeTermine(k).some((x) => x.datum === "2026-10-05")).toBe(true);
  });

  it("nach Stattgefunden bleibt der Kasten weg", () => {
    const k = kunde({ terminErgebnis: "erschienen" });
    expect(offenerSetterTerminSchluessel(k)).toBeNull();
  });
});

describe("Bestandsfall: No-Show schon erfasst (Punkt 6)", () => {
  function altfall() {
    // Alter Setter-No-Show: Feld geleert, Historie gefuehrt, meta-Termin
    // zum selben Zeitpunkt noch da. Nichts davon wurde nachgetragen.
    return kunde({
      pipelineStufe: "bg_noshow",
      terminErgebnis: "noshow",
      setterTerminDatum: "",
      noShowHistorie: [{ datum: "2026-06-24", uhrzeit: "14:00", berater: "Partner A", gemeldetAm: "2026-06-24T15:00:00Z" }],
      meta: { beratungsgespraechAm: "2026-06-24", beratungsgespraechUhrzeit: "14:00" },
    });
  }

  it("zeigt weder Kasten noch Eintrag zum festen Termin", () => {
    const k = altfall();
    expect(offenerSetterTerminSchluessel(k)).toBeNull();
    expect(festeTermine(k).some((x) => x.datum === "2026-06-24")).toBe(false);
  });

  it("Nicht stattgefunden schließt den alten Termin ohne doppelte Folgeaufgaben", async () => {
    buchungUm("b-alt", "2026-06-24", "14:00");
    const k = altfall();
    const ok = await f.festerTerminNichtStattgefunden({ titel: "Beratungsgespräch", datum: "2026-06-24", uhrzeit: "14:00" }, ctx(k));
    expect(ok).toBe(true);
    expect(t.buchungStatus.mock.calls).toEqual([["b-alt", "nicht_erschienen"]]);
    expect(t.aufgabe).not.toHaveBeenCalled();
    expect(t.glocke).not.toHaveBeenCalled();
    expect(t.update).not.toHaveBeenCalled();
    expect(meldungen.at(-1)?.title).toBe("Termin geschlossen");
  });

  it("ein zweiter Klick auf No-Show legt keine zweiten Folgeaufgaben an", async () => {
    const k = kunde({ pipelineStufe: "beratungsgespraech", setterTerminDatum: "" });
    const termin = { titel: "Beratungsgespräch", datum: "2026-06-24", uhrzeit: "14:00" };
    await f.festerTerminNichtStattgefunden(termin, ctx(k));
    expect(t.aufgabe).toHaveBeenCalledTimes(3);
    // Der Kontakt traegt jetzt den No-Show; so kommt er beim naechsten Laden.
    const merged = t.merge.mock.calls[0][1] as Record<string, unknown>;
    const k2 = kunde({ pipelineStufe: "bg_noshow", setterTerminDatum: "", meta: merged });
    await f.festerTerminNichtStattgefunden(termin, ctx(k2));
    expect(t.aufgabe).toHaveBeenCalledTimes(3);
  });
});

describe("Rotes No-Show-Banner (Entscheidung 30.09.2026)", () => {
  const jetzt = new Date("2026-09-30T12:00:00");
  /** Sichtbar, solange kein spaeteres Erst- oder Beratungsgespraech ansteht. */
  function sichtbar(k: never, eingabe: Parameters<typeof baueGeplanteAktionen>[0] = {}) {
    const liste = noShowListe(k);
    const aktionen = baueGeplanteAktionen({ termine: festeTermine(k), ...eingabe }, jetzt);
    return liste.length > 0 && !neuerGespraechsterminNachNoShow(liste[liste.length - 1], aktionen);
  }
  const nachNoShow = (teil: Record<string, unknown> = {}) => kunde({
    pipelineStufe: "eg_noshow",
    terminErgebnis: "noshow",
    setterTerminDatum: "",
    noShowHistorie: [{ datum: "2026-09-20", uhrzeit: "10:00", berater: "Partner A", gemeldetAm: "2026-09-20T11:00:00Z" }],
    meta: { noShowTermine: ["2026-09-20 10:00"], erledigteTermine: ["2026-09-20 10:00"] },
    ...teil,
  });

  it("steht nach dem No-Show, solange kein neuer Termin eingetragen ist", () => {
    expect(sichtbar(nachNoShow())).toBe(true);
  });

  it("verschwindet mit einem neuen Termin im Setter-Feld, auch ohne Buchungshaken", () => {
    expect(sichtbar(nachNoShow({ setterTerminDatum: "2026-10-02", setterTerminUhrzeit: "11:00", setterTerminGebucht: false }))).toBe(false);
  });

  it("verschwindet mit einem neuen Beratungstermin am Kontakt", () => {
    const k = nachNoShow({ meta: { noShowTermine: ["2026-09-20 10:00"], beratungsgespraechAm: "2026-10-03", beratungsgespraechUhrzeit: "15:00" } });
    expect(sichtbar(k)).toBe(false);
  });

  it("verschwindet mit einer Buchung über die Terminseite (Meeting mit Aufgabe)", () => {
    const k = nachNoShow();
    expect(sichtbar(k, {
      aktivitaeten: [{ id: "m-neu", kundeId: "k-1", art: "meeting", beschreibung: "Telefonisches Erstgespräch", datum: "2026-09-29", faelligAm: "2026-10-04", uhrzeit: "09:30", von: "Partner A" } as never],
      aufgaben: [{ id: "a-neu", kontaktId: "k-1", typ: "meeting", status: "offen", titel: "Telefonisches Erstgespräch mit Kunde", faelligAm: "2026-10-04", uhrzeit: "09:30", meetingAktivitaetId: "m-neu" } as never],
    })).toBe(false);
  });

  it("bleibt bei einem anderen Termin stehen, etwa einer Objektvorstellung", () => {
    const k = nachNoShow();
    expect(sichtbar(k, {
      aktivitaeten: [{ id: "m-ov", kundeId: "k-1", art: "meeting", beschreibung: "Objektvorstellung", datum: "2026-09-29", faelligAm: "2026-10-04", uhrzeit: "09:30", von: "Partner A" } as never],
    })).toBe(true);
  });

  it("kommt nach einem erneuten No-Show mit dem aktuellen Zähler wieder", () => {
    // Zweiter No-Show am neuen Termin, diesmal ueber den Kasten zum festen
    // Termin: er steht nur in meta.noShowTermine, nicht in der Historie.
    const k = nachNoShow({
      meta: {
        noShowTermine: ["2026-09-20 10:00", "2026-10-02 11:00"],
        erledigteTermine: ["2026-09-20 10:00", "2026-10-02 11:00"],
        erstgespraechAm: "2026-10-02",
        erstgespraechUhrzeit: "11:00",
      },
    });
    expect(noShowListe(k).map((e) => e.datum)).toEqual(["2026-09-20", "2026-10-02"]);
    expect(sichtbar(k)).toBe(true);
  });

  it("bleibt im Bestandsfall stehen, solange nur der alte Termin offen ist", () => {
    const k = nachNoShow({ meta: { noShowTermine: [], erstgespraechAm: "2026-09-20", erstgespraechUhrzeit: "10:00" } });
    expect(sichtbar(k, {
      aktivitaeten: [{ id: "m-alt", kundeId: "k-1", art: "meeting", beschreibung: "Erstgespräch", datum: "2026-09-10", faelligAm: "2026-09-20", uhrzeit: "10:00", von: "Partner A" } as never],
    })).toBe(true);
  });
});

describe("Verschoben bleibt wie bisher", () => {
  it("verschiebt den Termin und schließt nichts", async () => {
    buchungUm("b-1", "2026-06-24", "14:00");
    const k = kunde({ pipelineStufe: "bg_noshow", setterTerminDatum: "" });
    const ok = await f.festerTerminVerschieben({ titel: "Beratungsgespräch", datum: "2026-06-24", uhrzeit: "14:00" }, "2026-10-01", "15:00", ctx(k));
    expect(ok).toBe(true);
    expect(t.buchungStatus).not.toHaveBeenCalled();
    expect(t.abgesagt).not.toHaveBeenCalled();
    expect(t.merge.mock.calls[0][1]).toMatchObject({ beratungsgespraechAm: "2026-10-01", beratungsgespraechUhrzeit: "15:00" });
    expect(t.merge.mock.calls[0][1]).not.toHaveProperty("noShowTermine");
    expect(t.update).toHaveBeenCalledWith("k-1", { pipelineStufe: "beratungsgespraech" });
  });
});

describe("Rückfrage am Haken eines festen Termins", () => {
  it("bietet „Nicht stattgefunden“ jederzeit an, auch vor dem Termin", () => {
    expect(f.rueckfrageOptionen().map((o) => o.text)).toEqual(["Stattgefunden", "Nicht stattgefunden", "Behalten"]);
  });

  it("hebt einen anderen festen Termin nur auf, ohne Stufe und ohne Aufgabe", async () => {
    const k = kunde({ pipelineStufe: "notar" });
    await f.festerTerminNichtStattgefunden(f.festerTerminAusSchluessel("Notartermin", "2026-09-01 09:30"), ctx(k));
    expect(t.merge).toHaveBeenCalledWith("k-1", { erledigteTermine: ["2026-09-01 09:30"] });
    expect(t.update).not.toHaveBeenCalled();
    expect(t.aufgabe).not.toHaveBeenCalled();
    expect(t.glocke).not.toHaveBeenCalled();
  });

  it("liest den Termin aus dem Listenschlüssel, auch ohne Uhrzeit", () => {
    expect(f.festerTerminAusSchluessel("Beratungsgespräch", "2026-06-24 14:00"))
      .toEqual({ titel: "Beratungsgespräch", datum: "2026-06-24", uhrzeit: "14:00" });
    expect(f.festerTerminAusSchluessel("Erstgespräch", "2026-06-24"))
      .toEqual({ titel: "Erstgespräch", datum: "2026-06-24", uhrzeit: undefined });
  });
});

describe("Stufenregeln der drei Antworten", () => {
  it("Stattgefunden: nie zurück, EG bleibt bis zum eingebuchten Beratungsgespräch", () => {
    expect(f.stufeNachStattgefunden("Beratungsgespräch", "erstgespraech_geplant")).toBe("beratungsgespraech");
    expect(f.stufeNachStattgefunden("Beratungsgespräch", "beratungsgespraech")).toBeNull();
    expect(f.stufeNachStattgefunden("Beratungsgespräch", "objektauswahl")).toBeNull();
    expect(f.stufeNachStattgefunden("Beratungsgespräch", "verloren")).toBeNull();
    expect(f.stufeNachStattgefunden("Erstgespräch", "eg_noshow")).toBe("erstgespraech_geplant");
    expect(f.stufeNachStattgefunden("Erstgespräch", "erstgespraech_geplant")).toBeNull();
    expect(f.stufeNachStattgefunden(null, "bg_noshow")).toBeNull();
  });

  it("Verschoben heilt nur die NoShow-Stufe des eigenen Termins", () => {
    expect(f.stufeNachVerschieben("Erstgespräch", "eg_noshow")).toBe("erstgespraech_geplant");
    expect(f.stufeNachVerschieben("Beratungsgespräch", "bg_noshow")).toBe("beratungsgespraech");
    expect(f.stufeNachVerschieben("Beratungsgespräch", "eg_noshow")).toBeNull();
  });
});

describe("Kundenprofil nutzt die gemeinsame Kette", () => {
  const quelle = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");

  it("nennt keine Rückgabe an die Setterin mehr", () => {
    expect(quelle).not.toContain("an die Setterin zur Neuterminierung");
    expect(quelle).not.toContain("Beratungsgespräch-Ergebnis</h3>");
  });

  it("zeigt nach dem No-Show keinen dauerhaften roten Hinweis (Punkt 3)", () => {
    expect(quelle).not.toContain("No-Show beim {nsArt}");
    expect(quelle).not.toMatch(/if \(ergebnis === "noshow"\)/);
    expect(quelle).toContain("if (!offenerSetterTerminSchluessel(kunde)) return null;");
  });

  it("fragt am Haken mit drei Antworten und schreibt nicht selbst", () => {
    expect(quelle).toContain("rueckfrageOptionen()");
    expect(quelle).toContain("festerTerminNichtStattgefunden(termin, ctx)");
    // Die alte Fassung der No-Show-Kette stand direkt im Profil.
    expect(quelle).not.toContain("No-Show-Erinnerung");
  });
});
