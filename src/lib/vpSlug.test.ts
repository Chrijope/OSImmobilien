/**
 * Das Kuerzel im persoenlichen Link eines Partners.
 *
 * Die Logik liegt in `supabase/functions/_shared/vp-slug.ts`, weil
 * `ensure-vp-slug` in Deno laeuft. Getestet wird von hier, wie bei
 * `lead-zuordnung`.
 *
 * Der wichtigste Test ist der erste: Ein vergebenes Kuerzel bleibt, auch wenn
 * sich der Name aendert. Frueher wurde es dann neu vergeben, und jeder bereits
 * verschickte Link lief ins Leere.
 */
import { describe, expect, it } from "vitest";
import {
  SLUG_MAX_VERSUCHE,
  slugBasis,
  slugEntscheidung,
  slugKandidat,
  slugify,
  vergibVpSlug,
} from "../../supabase/functions/_shared/vp-slug.ts";

const KENNUNG = "27ccfbab-f949-4484-90b1-7dffca6a65c9";

describe("Ein vergebenes Kuerzel", () => {
  it("bleibt bei einer Namensaenderung gleich", () => {
    const e = slugEntscheidung({ aktuellerSlug: "maria-muster", name: "Maria Beispiel", userId: KENNUNG });
    expect(e).toEqual({ art: "bestehend", slug: "maria-muster" });
  });

  it("bleibt auch mit Zaehler gleich, obwohl der Name laengst anders heisst", () => {
    const e = slugEntscheidung({ aktuellerSlug: "timo-blum-2", name: "Timo Blumenthal", userId: KENNUNG });
    expect(e).toEqual({ art: "bestehend", slug: "timo-blum-2" });
  });

  it("bleibt, wenn es frueher mit einem fehlenden Buchstaben vergeben wurde", () => {
    // Genau diesen Fall hat die alte Selbstheilung "repariert" und damit den
    // verschickten Link getoetet.
    const e = slugEntscheidung({ aktuellerSlug: "jurgen-wei", name: "Jürgen Weiß", userId: KENNUNG });
    expect(e).toEqual({ art: "bestehend", slug: "jurgen-wei" });
  });
});

describe("Wer noch kein Kuerzel hat", () => {
  it("bekommt eins aus dem Namen", () => {
    expect(slugEntscheidung({ aktuellerSlug: null, name: "Jürgen Weiß", userId: KENNUNG })).toEqual({
      art: "neu",
      basis: "jurgen-weiss",
    });
  });

  it("bekommt eins auch mit leerem Feld statt null", () => {
    expect(slugEntscheidung({ aktuellerSlug: "  ", name: "Timo Blum", userId: KENNUNG })).toEqual({
      art: "neu",
      basis: "timo-blum",
    });
  });

  it("bekommt ohne brauchbaren Namen eins aus der Kennung", () => {
    expect(slugBasis("", KENNUNG)).toBe("vp-27ccfbab");
    expect(slugBasis("!!!", KENNUNG)).toBe("vp-27ccfbab");
    expect(slugBasis(null, KENNUNG)).toBe("vp-27ccfbab");
  });
});

describe("Die Eindeutigkeit bei der Erstvergabe", () => {
  it("probiert erst den Stamm, dann mit Zaehler", () => {
    expect(slugKandidat("timo-blum", 1, KENNUNG)).toBe("timo-blum");
    expect(slugKandidat("timo-blum", 2, KENNUNG)).toBe("timo-blum-2");
    expect(slugKandidat("timo-blum", 3, KENNUNG)).toBe("timo-blum-3");
  });

  it("haengt nach allen Zaehlern die Kennung an", () => {
    expect(slugKandidat("timo-blum", SLUG_MAX_VERSUCHE + 1, KENNUNG)).toBe("timo-blum-27ccfb");
  });
});

describe("slugify", () => {
  it("macht aus Umlauten, Akzenten und Leerzeichen ein Kuerzel", () => {
    expect(slugify("Jürgen Weiß")).toBe("jurgen-weiss");
    expect(slugify("  Anne-Marie  Lefèvre ")).toBe("anne-marie-lefevre");
  });
});

/**
 * Die Function selbst.
 *
 * Sie laeuft in Deno und laesst sich hier nicht aufrufen. Geprueft wird
 * deshalb am Quelltext, dass sie die Regel oben benutzt und ein Kuerzel nur
 * schreibt, solange noch keins gesetzt ist. Die alte Selbstheilung verglich
 * das Kuerzel mit dem Namen und schrieb es sonst neu.
 */
describe("ensure-vp-slug und get-tippgeber-vp-slug", () => {
  const lies = async (pfad: string) => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    return readFileSync(join(process.cwd(), pfad), "utf8");
  };

  it("gibt ein bestehendes Kuerzel zurueck und ueberschreibt nie eins", async () => {
    const quelle = await lies("supabase/functions/ensure-vp-slug/index.ts");
    expect(quelle).toContain("vergibVpSlug(");
    expect(quelle).not.toContain("startsWith(`${expectedBase}-`)");
    expect(quelle).toContain("hatBeraterRolle(");
    const gemeinsam = await lies("supabase/functions/_shared/vp-slug.ts");
    expect(gemeinsam).toContain("slugEntscheidung(args)");
    expect(gemeinsam).toContain('.or("vp_slug.is.null,vp_slug.eq.")');
  });

  it("HB-013: der Tippgeber-Weg nutzt dieselbe Vergabe statt einer eigenen Kopie", async () => {
    const quelle = await lies("supabase/functions/get-tippgeber-vp-slug/index.ts");
    expect(quelle).toContain("vergibVpSlug(");
    expect(quelle).not.toContain("function slugify");
  });
});

/** Kleine Ersatz-Datenbank: vergebene Kuerzel und was geschrieben wurde. */
function ersatzProfile(vergeben: Record<string, string>) {
  const geschrieben: string[] = [];
  const db = {
    from() {
      let gesucht = "";
      let neu = "";
      const kette: Record<string, unknown> = {
        select: () => kette,
        or: () => kette,
        eq: (spalte: string, wert: string) => {
          if (spalte === "vp_slug") gesucht = wert;
          return kette;
        },
        update: (zeile: { vp_slug: string }) => {
          neu = zeile.vp_slug;
          return kette;
        },
        maybeSingle: () => Promise.resolve({ data: vergeben[gesucht] ? { id: vergeben[gesucht] } : null, error: null }),
        then: (ok: (a: unknown) => unknown) => {
          geschrieben.push(neu);
          return Promise.resolve({ data: [{ vp_slug: neu }], error: null }).then(ok);
        },
      };
      return kette;
    },
  };
  return { db, geschrieben };
}

describe("vergibVpSlug", () => {
  it("vergibt nie ein gesperrtes Kuerzel", async () => {
    for (const name of ["Konfigurator", "Selbstauskunft", "Ergebnis"]) {
      const { db, geschrieben } = ersatzProfile({});
      const slug = await vergibVpSlug(db, { userId: KENNUNG, aktuellerSlug: null, name });
      expect(slug).toBe(`${name.toLowerCase()}-berater`);
      expect(geschrieben).toEqual([slug]);
    }
  });

  it("weicht bei einem vergebenen Kuerzel auf den Zaehler aus", async () => {
    const { db } = ersatzProfile({ "timo-blum": "jemand-anderes" });
    expect(await vergibVpSlug(db, { userId: KENNUNG, aktuellerSlug: null, name: "Timo Blum" })).toBe("timo-blum-2");
  });

  it("laesst ein vorhandenes Kuerzel stehen und schreibt nichts", async () => {
    const { db, geschrieben } = ersatzProfile({});
    expect(await vergibVpSlug(db, { userId: KENNUNG, aktuellerSlug: "maria-muster", name: "Maria Beispiel" })).toBe("maria-muster");
    expect(geschrieben).toEqual([]);
  });
});
