import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  gleicheDatei, kontaktKennung, konfliktName, verschiebeKontaktDateien, zielPfad,
  type Eintrag, type Speicher,
} from "../../supabase/functions/_shared/kontaktDateienVerschieben";

/**
 * Dateien beim Zusammenführen mitverschieben (26.09.2026). Kopieren, dann
 * Verweise umschreiben, dann erst die alten Dateien löschen. Geht etwas
 * schief, geht nichts verloren, und ein zweiter Lauf macht dort weiter.
 */

const VON = "00000000-0000-4000-8000-00000000000b"; // aufgelöst (neuer)
const NACH = "00000000-0000-4000-8000-00000000000a"; // behalten (älter)

/** Speicher im Arbeitsspeicher: Pfad → Datei (Größe, eTag). */
function fakeSpeicher(start: Record<string, { size: number; etag: string }>, opts: {
  kopierFehler?: (von: string) => boolean;
  loeschFehler?: boolean;
} = {}) {
  const dateien = new Map(Object.entries(start));
  const aufrufe = { kopiert: [] as [string, string][], geloescht: [] as string[] };
  const speicher: Speicher = {
    async liste(ordner) {
      const vorne = `${ordner}/`;
      const namen = new Map<string, Eintrag>();
      for (const [pfad, d] of dateien) {
        if (!pfad.startsWith(vorne)) continue;
        const rest = pfad.slice(vorne.length);
        const teil = rest.split("/")[0];
        namen.set(teil, rest.includes("/") ? { name: teil, istOrdner: true } : { name: teil, istOrdner: false, ...d });
      }
      return [...namen.values()];
    },
    async kopiere(von, nach) {
      if (opts.kopierFehler?.(von)) throw new Error("Netzwerk weg");
      if (dateien.has(nach)) throw new Error("The resource already exists");
      dateien.set(nach, { ...dateien.get(von)! });
      aufrufe.kopiert.push([von, nach]);
    },
    async loesche(pfade) {
      if (opts.loeschFehler) return pfade;
      for (const p of pfade) { dateien.delete(p); aufrufe.geloescht.push(p); }
      return [];
    },
  };
  return { speicher, dateien, aufrufe };
}

function umschreiber(fehler?: string) {
  const aufrufe: Record<string, string>[] = [];
  return {
    aufrufe,
    umschreiben: async (abbildung: Record<string, string>) => {
      aufrufe.push(abbildung);
      if (fehler) throw new Error(fehler);
    },
  };
}

describe("Pfadumrechnung", () => {
  it("ersetzt genau den Ordnerabschnitt mit der alten Kennung", () => {
    expect(zielPfad(`kundenordner/${VON}/inv1/sa.pdf`, VON, NACH)).toBe(`kundenordner/${NACH}/inv1/sa.pdf`);
    expect(zielPfad(`${VON}/inv1/x.pdf`, VON, NACH)).toBe(`${NACH}/inv1/x.pdf`);
    expect(zielPfad(`finanzierung/eigen/${VON}/inv1/a.jpg`, VON, NACH)).toBe(`finanzierung/eigen/${NACH}/inv1/a.jpg`);
  });

  it("fasst eine Kennung im Dateinamen nicht an und meldet fehlenden Ordner", () => {
    expect(zielPfad(`kundenordner/andere/${VON}.pdf`, VON, NACH)).toBeNull();
  });
});

describe("Konflikt-Suffix", () => {
  it("hängt die MORE-Nummer vor der Endung an", () => {
    expect(konfliktName("kundenordner/x/inv/vertrag.pdf", "MI-00042")).toBe("kundenordner/x/inv/vertrag_aus-MI-00042.pdf");
    expect(konfliktName("a/b/ohne-endung", "MI-00042")).toBe("a/b/ohne-endung_aus-MI-00042");
    expect(konfliktName("a/b/vertrag.pdf", "MI-00042", 2)).toBe("a/b/vertrag_aus-MI-00042-2.pdf");
  });

  it("nimmt die MORE-Nummer, sonst den Anfang der Kennung", () => {
    expect(kontaktKennung(VON, { moreId: 42 })).toBe("MI-00042");
    expect(kontaktKennung(VON, { kundenNr: "17" })).toBe("MI-00017");
    expect(kontaktKennung(VON, {})).toBe("00000000");
  });

  it("hält Dateien nur bei gleicher Größe und gleichem eTag für dieselbe", () => {
    const a = { name: "x", istOrdner: false, size: 10, etag: "e1" };
    expect(gleicheDatei(a, { ...a })).toBe(true);
    expect(gleicheDatei(a, { ...a, etag: "e2" })).toBe(false);
    expect(gleicheDatei(a, { ...a, etag: null })).toBe(false);
  });
});

describe("verschiebeKontaktDateien", () => {
  it("kopiert alle Ordner, schreibt die Verweise um und löscht erst danach", async () => {
    const f = fakeSpeicher({
      [`kundenordner/${VON}/inv1/sa.pdf`]: { size: 1, etag: "a" },
      [`reservierung/${VON}/inv1/res.pdf`]: { size: 2, etag: "b" },
      [`${VON}/inv1/upload.pdf`]: { size: 3, etag: "c" },
      [`kundenordner/${VON}/.emptyFolderPlaceholder`]: { size: 0, etag: "p" },
    });
    const u = umschreiber();
    const erg = await verschiebeKontaktDateien({ speicher: f.speicher, umschreiben: u.umschreiben, vonId: VON, nachId: NACH, kennung: "MI-00042" });

    expect(erg).toMatchObject({ verschoben: 3, umbenannt: [], nichtVerschoben: [], alteNichtEntfernt: [] });
    expect(u.aufrufe).toEqual([{
      [`${VON}/inv1/upload.pdf`]: `${NACH}/inv1/upload.pdf`,
      [`kundenordner/${VON}/inv1/sa.pdf`]: `kundenordner/${NACH}/inv1/sa.pdf`,
      [`reservierung/${VON}/inv1/res.pdf`]: `reservierung/${NACH}/inv1/res.pdf`,
    }]);
    expect(f.dateien.has(`kundenordner/${NACH}/inv1/sa.pdf`)).toBe(true);
    expect(f.dateien.has(`kundenordner/${VON}/inv1/sa.pdf`)).toBe(false);
    expect(f.aufrufe.geloescht).not.toContain(`kundenordner/${VON}/.emptyFolderPlaceholder`);
  });

  it("überschreibt bei gleichem Namen nichts, sondern hängt ein Suffix an", async () => {
    const f = fakeSpeicher({
      [`kundenordner/${VON}/inv1/vertrag.pdf`]: { size: 5, etag: "neu" },
      [`kundenordner/${NACH}/inv1/vertrag.pdf`]: { size: 7, etag: "alt" },
    });
    const u = umschreiber();
    const erg = await verschiebeKontaktDateien({ speicher: f.speicher, umschreiben: u.umschreiben, vonId: VON, nachId: NACH, kennung: "MI-00042" });

    const ziel = `kundenordner/${NACH}/inv1/vertrag_aus-MI-00042.pdf`;
    expect(erg.umbenannt).toEqual([{ von: `kundenordner/${VON}/inv1/vertrag.pdf`, nach: ziel }]);
    expect(f.dateien.get(`kundenordner/${NACH}/inv1/vertrag.pdf`)).toEqual({ size: 7, etag: "alt" });
    expect(f.dateien.get(ziel)).toEqual({ size: 5, etag: "neu" });
  });

  it("ist wiederholbar: schon kopierte Dateien werden erkannt, nicht verdoppelt", async () => {
    // Stand nach einem Lauf, dessen Umschreiben scheiterte: Kopie liegt schon da.
    const f = fakeSpeicher({
      [`kundenordner/${VON}/inv1/sa.pdf`]: { size: 1, etag: "a" },
      [`kundenordner/${NACH}/inv1/sa.pdf`]: { size: 1, etag: "a" },
    });
    const u = umschreiber();
    const erg = await verschiebeKontaktDateien({ speicher: f.speicher, umschreiben: u.umschreiben, vonId: VON, nachId: NACH, kennung: "MI-00042" });

    expect(f.aufrufe.kopiert).toEqual([]);
    expect(erg.verschoben).toBe(1);
    expect(erg.umbenannt).toEqual([]);
    expect(f.dateien.has(`kundenordner/${VON}/inv1/sa.pdf`)).toBe(false);

    // Ein dritter Lauf findet nichts mehr und ändert nichts.
    const nochmal = await verschiebeKontaktDateien({ speicher: f.speicher, umschreiben: u.umschreiben, vonId: VON, nachId: NACH, kennung: "MI-00042" });
    expect(nochmal).toEqual({ verschoben: 0, umbenannt: [], nichtVerschoben: [], alteNichtEntfernt: [] });
    expect(u.aufrufe).toHaveLength(1);
  });

  it("lässt bei einem Kopierfehler genau diese Datei samt Verweis am alten Ort", async () => {
    const f = fakeSpeicher({
      [`kundenordner/${VON}/inv1/a.pdf`]: { size: 1, etag: "a" },
      [`kundenordner/${VON}/inv1/b.pdf`]: { size: 2, etag: "b" },
    }, { kopierFehler: (von) => von.endsWith("b.pdf") });
    const u = umschreiber();
    const erg = await verschiebeKontaktDateien({ speicher: f.speicher, umschreiben: u.umschreiben, vonId: VON, nachId: NACH, kennung: "MI-00042" });

    expect(erg.verschoben).toBe(1);
    expect(erg.nichtVerschoben).toEqual([{ pfad: `kundenordner/${VON}/inv1/b.pdf`, grund: "Kopieren fehlgeschlagen: Netzwerk weg" }]);
    expect(Object.keys(u.aufrufe[0])).toEqual([`kundenordner/${VON}/inv1/a.pdf`]);
    expect(f.dateien.has(`kundenordner/${VON}/inv1/b.pdf`)).toBe(true);
  });

  it("löscht nichts, wenn das Umschreiben der Verweise scheitert", async () => {
    const f = fakeSpeicher({ [`kundenordner/${VON}/inv1/a.pdf`]: { size: 1, etag: "a" } });
    const u = umschreiber("Zeitüberschreitung");
    const erg = await verschiebeKontaktDateien({ speicher: f.speicher, umschreiben: u.umschreiben, vonId: VON, nachId: NACH, kennung: "MI-00042" });

    expect(erg.verschoben).toBe(0);
    expect(erg.nichtVerschoben).toEqual([{ pfad: `kundenordner/${VON}/inv1/a.pdf`, grund: "Verweise nicht umgeschrieben: Zeitüberschreitung" }]);
    expect(f.aufrufe.geloescht).toEqual([]);
    expect(f.dateien.has(`kundenordner/${VON}/inv1/a.pdf`)).toBe(true);
  });

  it("meldet alte Kopien, die sich nicht löschen ließen, getrennt: verwiesen wird schon auf die neue", async () => {
    const f = fakeSpeicher({ [`kundenordner/${VON}/inv1/a.pdf`]: { size: 1, etag: "a" } }, { loeschFehler: true });
    const u = umschreiber();
    const erg = await verschiebeKontaktDateien({ speicher: f.speicher, umschreiben: u.umschreiben, vonId: VON, nachId: NACH, kennung: "MI-00042" });

    expect(erg.verschoben).toBe(1);
    expect(erg.nichtVerschoben).toEqual([]);
    expect(erg.alteNichtEntfernt).toEqual([`kundenordner/${VON}/inv1/a.pdf`]);
  });

  it("ruft das Umschreiben gar nicht erst auf, wenn es keine Dateien gibt", async () => {
    const f = fakeSpeicher({});
    const u = umschreiber();
    await verschiebeKontaktDateien({ speicher: f.speicher, umschreiben: u.umschreiben, vonId: VON, nachId: NACH, kennung: "MI-00042" });
    expect(u.aufrufe).toEqual([]);
  });
});

describe("Edge Function kontakte-zusammenfuehren-dateien", () => {
  const CODE = readFileSync("supabase/functions/kontakte-zusammenfuehren-dateien/index.ts", "utf8");

  it("prüft die Rechte über die Datenbank, bevor sie eine Datei anfasst", () => {
    const pruefung = CODE.indexOf("await umschreiben({})");
    expect(pruefung).toBeGreaterThan(0);
    expect(CODE.indexOf("verschiebeKontaktDateien({")).toBeGreaterThan(pruefung);
    expect(CODE).toContain("_aufrufer: aufrufer");
    expect(CODE).toMatch(/err\.code === "42501"\) return json\(\{ error: err\.message \}, 403\)/);
  });

  it("verlangt eine Anmeldung", () => {
    expect(CODE).toContain('return json({ error: "Unauthorized" }, 401)');
    expect(readFileSync("supabase/config.toml", "utf8")).toMatch(/\[functions\.kontakte-zusammenfuehren-dateien\]\nverify_jwt = true/);
  });
});
