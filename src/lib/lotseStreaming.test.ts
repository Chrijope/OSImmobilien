/**
 * Blockweises Streaming des OS Lotsen (28.09.2026).
 *
 * Bewiesen wird: Der Server gibt nur Blöcke frei, die dieselbe Prüfung wie
 * die fertige Antwort bestanden haben, und erst, wenn der Folgeblock da ist.
 * Was freigegeben wurde, steht so auch in der fertigen, geprüften Antwort,
 * an jeder Stückgrenze. Eine Provisionsangabe erscheint nie, auch nicht kurz.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { antwortGanzLesen, antwortOhneVerguetung, freigabeBloecke, lotseErgebnis, baueLotsePrompt } = await import(
  "../../supabase/functions/_shared/lotse-regeln"
);
const { inArbeit, IN_ARBEIT_ART, IN_ARBEIT_MS, auszugAnsicht } = await import("../../supabase/functions/_shared/lotse-unterlagen");
const { lotseStromLesen } = await import("@/lib/lotseStore");

const QUELLEN = "QUELLEN: Objektdaten, Stand 28.09.2026";

/** Den Text in Stücken der Länge `schnitt` durch die Freigabe schicken, wie der Server es tut. */
function streame(roh: string, schnitt: number): string[] {
  const frei: string[] = [];
  let zahl = 0;
  for (let ende = schnitt; ; ende += schnitt) {
    const f = freigabeBloecke(roh.slice(0, Math.min(ende, roh.length)), zahl);
    zahl = f.frei;
    frei.push(...f.bloecke);
    if (ende >= roh.length) return frei;
  }
}

const SCHNITTE = [1, 2, 3, 5, 7, 11, 16, 64, 4096];

/** Kein freigegebener Block trägt etwas, das die fertige Prüfung entfernt. */
function pruefeTeilmenge(roh: string) {
  const fertig = antwortOhneVerguetung(roh);
  for (const schnitt of SCHNITTE) {
    for (const block of streame(roh, schnitt)) expect(fertig, `${JSON.stringify(roh)} bei ${schnitt}`).toContain(block);
  }
}

describe("Blockfreigabe (freigabeBloecke)", () => {
  const roh = `Das Hausgeld liegt bei 210 €.\n\nDie Kaltmiete beträgt 850 €.\n\nBaujahr 2020, Lift vorhanden.\n${QUELLEN}`;

  it("gibt einen Block erst frei, wenn die erste Zeile des Folgeblocks steht, an jeder Stückgrenze gleich", () => {
    expect(freigabeBloecke("Das Hausgeld liegt bei 210 €.\n\n", 0)).toEqual({ bloecke: [], frei: 0 });
    expect(freigabeBloecke("Das Hausgeld liegt bei 210 €.\n\nDie Kaltmiete beträgt 850", 0)).toEqual({ bloecke: [], frei: 0 });
    expect(freigabeBloecke("Das Hausgeld liegt bei 210 €.\n\nDie Kaltmiete beträgt 850 €.\n", 0))
      .toEqual({ bloecke: ["Das Hausgeld liegt bei 210 €."], frei: 1 });
    expect(freigabeBloecke("Das Hausgeld liegt bei 210 €.\n\nDie Kaltmiete beträgt 850 €.\n\nLift", 1)).toEqual({ bloecke: [], frei: 1 });
    for (const schnitt of SCHNITTE) {
      // Der letzte Block mit der Quellenzeile kommt nie vorab, nur mit der fertigen Antwort.
      expect(streame(roh, schnitt), String(schnitt)).toEqual(["Das Hausgeld liegt bei 210 €.", "Die Kaltmiete beträgt 850 €."]);
    }
    expect(antwortOhneVerguetung(roh).startsWith(streame(roh, 7).join("\n\n"))).toBe(true);
  });

  it("eine Überschrift mit Doppelpunkt wartet auf ihren Folgeblock und fällt mit ihm", () => {
    const text = `Baujahr 2020.\n\nInnenprovision:\n\nOS Immobilien: 6 % vom Kaufpreis.\n\nLift vorhanden.\n\nDas Hausgeld liegt bei 210 €.\n${QUELLEN}`;
    for (const schnitt of SCHNITTE) {
      const frei = streame(text, schnitt);
      expect(frei).toEqual(["Baujahr 2020.", "Lift vorhanden."]);
      expect(frei.join(" ")).not.toMatch(/provision|6 %/i);
    }
    // Die Überschrift wartet auf den ganzen Folgeblock, auch wenn dessen erste Zeile schon steht.
    expect(freigabeBloecke("Baujahr 2020.\n\nInnenprovision:\n\n", 0).bloecke).toEqual(["Baujahr 2020."]);
    expect(freigabeBloecke("Baujahr 2020.\n\nInnenprovision:\n\nOS Immobilien: 6 % vom Kaufpreis.\n", 1)).toEqual({ bloecke: [], frei: 1 });
    expect(freigabeBloecke("Baujahr 2020.\n\nKosten:\n\nDas Hausgeld liegt bei 210 €.\n", 1)).toEqual({ bloecke: [], frei: 1 });
    expect(freigabeBloecke("Baujahr 2020.\n\nKosten:\n\nDas Hausgeld liegt bei 210 €.\n\n", 1)).toEqual({ bloecke: ["Kosten:"], frei: 2 });
    pruefeTeilmenge(text);
  });

  it("der Betrag vor dem Wort Provision wird nicht vorab gezeigt (Folgeblock nimmt ihn mit)", () => {
    const text = `Baujahr 2020.\n\n6 % vom Kaufpreis.\n\nDas ist die Innenprovision.\n\nLift vorhanden.\n\nDas Hausgeld liegt bei 210 €.\n${QUELLEN}`;
    for (const schnitt of SCHNITTE) expect(streame(text, schnitt)).toEqual(["Baujahr 2020.", "Lift vorhanden."]);
    pruefeTeilmenge(text);
  });

  it("nach einem gefallenen Block wird der Folgeblock mitgeprüft (Rückbezug und Betrag)", () => {
    const text = `Die Innenprovision beträgt 6 %.\n\nSie wird beim Notartermin fällig. Das sind rund 17.340 €.\n\nLift vorhanden.\n\nBaujahr 2020.\n${QUELLEN}`;
    expect(antwortOhneVerguetung(text)).toBe(`Lift vorhanden.\n\nBaujahr 2020.\n${QUELLEN}`);
    for (const schnitt of SCHNITTE) {
      const frei = streame(text, schnitt);
      expect(frei).toEqual(["Lift vorhanden."]);
      expect(frei.join(" ")).not.toContain("17.340");
    }
    // Eine echte Kostenangabe danach bleibt stehen.
    const kosten = "Die Innenprovision beträgt 6 %.\n\nDas Hausgeld liegt bei 210 €.\n\nLift vorhanden.";
    expect(antwortOhneVerguetung(kosten)).toBe("Das Hausgeld liegt bei 210 €.\n\nLift vorhanden.");
  });

  it("jede freigegebene Stelle steht auch in der fertigen Antwort, für bekannte Provisionsfälle", () => {
    for (const text of [
      "Das Hausgeld liegt bei 210 €.\n\nDer Bauträger zahlt 6 % Provision an OS Immobilien.\n\nDie Kaltmiete beträgt 850 €.\n\nLift vorhanden.",
      "Die Innenprovision ist vereinbart.\n\nSie beträgt 6 % vom Kaufpreis.\n\nLift vorhanden.\n\nBaujahr 2020.",
      "Das Hausgeld liegt bei 210 €.\n\nInnenprovision:\n| Empfänger | Anteil |\n| --- | --- |\n| OS Immobilien | 6 % |\n\nLift vorhanden.\n\nBaujahr 2020.",
      "Baujahr 2020.\n\n**Vergütung Vertrieb**\n- Anteil Bauträger\n- 6 % vom Kaufpreis\n\nLift vorhanden.\n\nKeller vorhanden.",
      "Baujahr 2020.\n\n## Innenprovision\n\nOS Immobilien: 6 %, Vertrieb: 4 %.\n\nLift vorhanden.\n\nKeller vorhanden.",
      "Zur Provision liegt keine Angabe vor.\n\nDie SEV-Vergütung beträgt 35 € monatlich.\n\nLift vorhanden.",
      "\n\n  Baujahr 2020.\r\n\r\nDie Courtage liegt bei drei Prozent.\r\n\r\nLift vorhanden.\r\n\r\nKeller.",
    ]) {
      pruefeTeilmenge(text);
      for (const schnitt of SCHNITTE) expect(streame(text, schnitt).join(" ")).not.toMatch(/6 %|4 %|drei prozent/i);
    }
  });
});

describe("Strom mit Abbruch", () => {
  const zeile = (inhalt: string | null, grund?: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: inhalt === null ? {} : { content: inhalt }, finish_reason: grund ?? null }] })}\n`;
  function strom(roh: string, schnitt: number, fehlerAm?: number): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(roh);
    let pos = 0;
    return new ReadableStream({
      pull(steuerung) {
        if (fehlerAm !== undefined && pos >= fehlerAm) return steuerung.error(new DOMException("abgebrochen", "AbortError"));
        if (pos >= bytes.length) return steuerung.close();
        steuerung.enqueue(bytes.slice(pos, pos + schnitt));
        pos += schnitt;
      },
    });
  }

  it("bricht der Strom ab, bleiben die geprüften Blöcke und das Ergebnis ist unvollständig", async () => {
    const teile = ["Das Hausgeld liegt bei 210 €.\n\n", "Die Kaltmiete beträgt 850 €.\n\n", "Lift vorhanden.\n", QUELLEN];
    const roh = teile.map((t) => zeile(t)).join("") + zeile(null, "stop") + "data: [DONE]\n";
    // In Bytes, nicht in Zeichen: „€“ sind drei Bytes.
    const abbruchNach = new TextEncoder().encode(teile.slice(0, 3).map((t) => zeile(t)).join("")).length;
    for (const schnitt of [3, 17, 256]) {
      let frei = 0;
      const gezeigt: string[] = [];
      const stand = await antwortGanzLesen(strom(roh, schnitt, abbruchNach), (text) => {
        const f = freigabeBloecke(text, frei);
        frei = f.frei;
        gezeigt.push(...f.bloecke);
      });
      expect(gezeigt).toEqual(["Das Hausgeld liegt bei 210 €.", "Die Kaltmiete beträgt 850 €."]);
      expect(lotseErgebnis(stand, "Was bleibt monatlich?")).toEqual({ art: "unvollstaendig" });
    }
  });
});

describe("Browser liest den Ereignisstrom (lotseStromLesen)", () => {
  const ereignisse = (liste: Array<Record<string, unknown>>, schnitt: number) => {
    const bytes = new TextEncoder().encode(liste.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));
    let pos = 0;
    return new ReadableStream<Uint8Array>({
      pull(steuerung) {
        if (pos >= bytes.length) return steuerung.close();
        steuerung.enqueue(bytes.slice(pos, pos + schnitt));
        pos += schnitt;
      },
    });
  };

  it("meldet Stufen und Blöcke und liefert die fertige Antwort", async () => {
    for (const schnitt of [1, 9, 4096]) {
      const stufen: string[] = [];
      const bloecke: string[] = [];
      const antwort = await lotseStromLesen(ereignisse([
        { stufe: "liest" }, { stufe: "formuliert" }, { block: "Das Hausgeld liegt bei 210 €." }, { antwort: `Das Hausgeld liegt bei 210 €.\n\nLift.\n${QUELLEN}`, zeiten: { gesamt: 1 } },
      ], schnitt), { beiStufe: (s) => stufen.push(s), beiBlock: (b) => bloecke.push(b) });
      expect(stufen).toEqual(["liest", "formuliert"]);
      expect(bloecke).toEqual(["Das Hausgeld liegt bei 210 €."]);
      expect(antwort).toEqual({ ok: true, text: `Das Hausgeld liegt bei 210 €.\n\nLift.\n${QUELLEN}` });
    }
  });

  it("Provision, Fehler und ein Strom ohne Ergebnis", async () => {
    expect(await lotseStromLesen(ereignisse([{ code: "provision", error: "x" }], 5), {}))
      .toEqual({ ok: false, code: "provision", meldung: "Zu Provisionen gibt der Lotse keine Auskunft.", text: "" });
    expect(await lotseStromLesen(ereignisse([{ code: "ki_bremst", error: "Die KI ist gerade ausgelastet." }], 5), {}))
      .toMatchObject({ ok: false, code: "ki_bremst", meldung: "Die KI ist gerade ausgelastet." });
    expect(await lotseStromLesen(ereignisse([{ stufe: "liest" }, { block: "Teil" }], 5), {}))
      .toMatchObject({ ok: false, code: "unvollstaendig" });
  });
});

describe("Vorbereiten: Sperrvermerk und Prompt", () => {
  const jetzt = Date.parse("2026-09-28T12:00:00Z");
  const vermerk = (vor: number) => ({ art: IN_ARBEIT_ART, ampel: "rot", auszug: { in_arbeit: true, am: new Date(jetzt - vor).toISOString() } });

  it("ein junger Sperrvermerk gilt, ein alter nicht, und er ist nie ein Auszug", () => {
    expect(inArbeit([vermerk(60_000)], jetzt)).toBe(true);
    expect(inArbeit([vermerk(IN_ARBEIT_MS + 1)], jetzt)).toBe(false);
    expect(inArbeit([{ art: "expose", auszug: { text: "x" } }], jetzt)).toBe(false);
    expect(auszugAnsicht({ ...vermerk(0), schema_fassung: 6 }, { ampel: "rot", art: IN_ARBEIT_ART })).toBeNull();
    expect(auszugAnsicht({ ...vermerk(0), schema_fassung: 6 }, { ampel: "gruen", art: "expose", inhaltPruefen: true })).toBeNull();
  });

  it("der Prompt nennt Unterlagen in Arbeit als „wird noch ausgewertet“", () => {
    const prompt = baueLotsePrompt({
      heute: "2026-09-28T10:00:00Z", objekt: { id: "o1" }, kalkulation: null, nichtGelesen: {},
      unterlagen: [{ bezeichnung: "Exposé.pdf", ampel: "gruen", inArbeit: true }, { bezeichnung: "Plan.pdf", ampel: "gruen" }],
    });
    expect(prompt).toContain("Exposé.pdf: vorhanden, wird noch ausgewertet.");
    expect(prompt).toContain("Plan.pdf: vorhanden, noch nicht ausgewertet.");
  });
});
