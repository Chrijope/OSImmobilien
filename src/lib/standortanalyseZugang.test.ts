import { describe, it, expect, vi, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { entscheideZugang, istIntern } from "../../supabase/functions/generate-standortanalyse/regeln";
import { ladeStandortanalyse } from "./standortanalyse";

/**
 * `generate-standortanalyse` seit dem 23.09.2026 abends: Messen nur für
 * angemeldete Admin und Inhaber, alle anderen internen Nutzer lesen nur, und
 * der Browser ruft die Function nie ohne Anmeldung auf.
 */

const basis = { angemeldet: true, sichtbar: true, gemessen: false, adresseGeaendert: true, neuMessen: false };

describe("Wer darf messen", () => {
  it("lehnt ohne Anmeldung mit 401 ab", () => {
    expect(entscheideZugang({ ...basis, angemeldet: false, rollen: ["admin"] })).toMatchObject({ art: "abgelehnt", status: 401 });
  });

  it("lehnt Kunden, Bewerber und Nutzer ohne Rolle mit 403 ab", () => {
    for (const rollen of [["kunde"], ["bewerber"], [], null]) {
      expect(entscheideZugang({ ...basis, rollen }), JSON.stringify(rollen)).toMatchObject({ art: "abgelehnt", status: 403 });
    }
    expect(istIntern(["kunde", "vertriebspartner"])).toBe(true);
  });

  it("lässt Vertriebspartner nie messen, sie bekommen nur die gespeicherte Analyse", () => {
    for (const rollen of [["vertriebspartner"], ["backoffice"], ["vertriebsleiter"]]) {
      expect(entscheideZugang({ ...basis, rollen, neuMessen: true }), rollen[0]).toEqual({ art: "gespeichert" });
    }
  });

  it("lässt Admin und Inhaber messen, wenn die Analyse fehlt oder die Adresse sich geändert hat", () => {
    expect(entscheideZugang({ ...basis, rollen: ["admin"] })).toEqual({ art: "messen" });
    expect(entscheideZugang({ ...basis, rollen: ["inhaber"], gemessen: true, adresseGeaendert: true })).toEqual({ art: "messen" });
  });

  it("misst eine feste Analyse nicht erneut, außer auf ausdrücklichen Wunsch", () => {
    const fest = { ...basis, rollen: ["admin"], gemessen: true, adresseGeaendert: false };
    expect(entscheideZugang(fest)).toEqual({ art: "gespeichert" });
    expect(entscheideZugang({ ...fest, neuMessen: true })).toEqual({ art: "messen" });
  });

  it("zeigt ein ausgeblendetes Objekt nur Admin und Inhaber", () => {
    expect(entscheideZugang({ ...basis, rollen: ["vertriebspartner"], sichtbar: false })).toMatchObject({ art: "abgelehnt", status: 404 });
    expect(entscheideZugang({ ...basis, rollen: ["inhaber"], sichtbar: false })).toEqual({ art: "messen" });
  });
});

describe("Der Browser ruft die Messung nie ohne Anmeldung auf", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("liest ohne ausdrücklichen Wunsch nur die gespeicherte Analyse und fragt niemanden", async () => {
    const fetchAttrappe = vi.fn();
    vi.stubGlobal("fetch", fetchAttrappe);
    const gespeichert = { schema: 2, objekt_koordinaten: { lat: 1, lng: 2 }, mikrolage: {} };
    expect(await ladeStandortanalyse("o1", { standortanalyse: gespeichert })).toBe(gespeichert);
    expect(await ladeStandortanalyse("o1", {})).toBeUndefined();
    expect(await ladeStandortanalyse("o1", { standortanalyse: { mikrolage: {} } })).toBeUndefined();
    expect(fetchAttrappe).not.toHaveBeenCalled();
  });

  it("enthält im ganzen Browsercode keinen direkten Aufruf der Function, nur `functions.invoke` mit Anmeldung", () => {
    const wurzel = resolve(__dirname, "../..");
    const dateien: string[] = [];
    const sammeln = (ordner: string) => {
      for (const name of readdirSync(ordner)) {
        const pfad = join(ordner, name);
        if (statSync(pfad).isDirectory()) sammeln(pfad);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) dateien.push(pfad);
      }
    };
    sammeln(resolve(wurzel, "src"));
    const treffer = dateien.filter((d) => readFileSync(d, "utf-8").includes("generate-standortanalyse")).map((d) => relative(wurzel, d));
    for (const d of dateien) {
      expect(readFileSync(d, "utf-8"), relative(wurzel, d)).not.toMatch(/functions\/v1\/generate-standortanalyse/);
    }
    // Der einzige Aufruf steht in `ladeStandortanalyse`, hinter `messen: true`.
    const aufrufer = treffer.filter((d) => /functions\.invoke\(\s*"generate-standortanalyse"/.test(readFileSync(resolve(wurzel, d), "utf-8")));
    expect(aufrufer).toEqual(["src/lib/standortanalyse.ts"]);
  });

  it("lässt öffentliche Seiten nie messen", () => {
    const wurzel = resolve(__dirname, "../..");
    const oeffentlich = [
      "src/pages/ExposePublic.tsx", "src/pages/KundenansichtPublic.tsx", "src/pages/KundenansichtObjekt.tsx",
      "src/pages/KundenansichtWohnung.tsx", "src/lib/exposePublicDaten.ts", "src/lib/kundenansichtDaten.ts",
      ...readdirSync(resolve(wurzel, "src/components/kundenansicht")).filter((d) => /\.tsx?$/.test(d) && !/\.test\./.test(d)).map((d) => `src/components/kundenansicht/${d}`),
      ...readdirSync(resolve(wurzel, "src/components/expose")).filter((d) => /\.tsx?$/.test(d) && !/\.test\./.test(d)).map((d) => `src/components/expose/${d}`),
    ];
    for (const d of oeffentlich) {
      const code = readFileSync(resolve(wurzel, d), "utf-8");
      expect(code, d).not.toMatch(/generate-standortanalyse|ladeStandortanalyse|messeStandort/);
    }
  });
});
