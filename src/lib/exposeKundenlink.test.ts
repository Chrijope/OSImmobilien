import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aufrufZaehlen,
  glockenEmpfaenger,
  glockenText,
  glockenTitel,
  LINK_SPALTEN,
  LINK_SPALTEN_ALT,
  linkBereich,
  linkZustand,
  passtZumAufruf,
  type ExposeLinkZeile,
  type ZaehlClient,
  type ZaehlFilter,
} from "../../supabase/functions/_shared/expose-kundenlink";

/**
 * Der persönliche Kundenlink eines Exposés (`get-expose`).
 *
 * Die Prüflinge liegen in `supabase/functions/`, dorthin schaut Vitest nicht;
 * deshalb liegt der Test hier, wie `exposeOeffentlich.test.ts`.
 *
 * Entscheidungen von Christian vom 23.09.2026: zurückgezogen gilt wie
 * abgelaufen, gezählt werden nur Anzahl und Zeitpunkt, die Glocke kommt
 * genau einmal.
 */

const JETZT = Date.parse("2026-09-23T12:00:00Z");

describe("passt der Token zu diesem Aufruf?", () => {
  it("verlangt dasselbe Objekt und dieselbe Einheit", () => {
    expect(passtZumAufruf({ objekt_id: "o1", wohnung_id: "w7" }, "o1", "w7")).toBe(true);
    expect(passtZumAufruf({ objekt_id: "o1", wohnung_id: "w7" }, "o2", "w7")).toBe(false);
    expect(passtZumAufruf({ objekt_id: "o1", wohnung_id: "w7" }, "o1", "w8")).toBe(false);
  });

  it("lässt den Link einer Einheit nicht für das ganze Objekt gelten und umgekehrt", () => {
    expect(passtZumAufruf({ objekt_id: "o1", wohnung_id: "w7" }, "o1", null)).toBe(false);
    expect(passtZumAufruf({ objekt_id: "o1", wohnung_id: null }, "o1", "w7")).toBe(false);
    expect(passtZumAufruf({ objekt_id: "o1", wohnung_id: null }, "o1", null)).toBe(true);
    expect(passtZumAufruf({ objekt_id: "o1", wohnung_id: null }, "o1", "")).toBe(true);
  });
});

/*
 * Seit dem 25.09.2026 (Christian): Der Link zum ganzen Objekt öffnet auch die
 * Einheiten DESSELBEN Objekts, damit „Ansehen“ in der Einheitentabelle den
 * Kunden mit Partner und Sprache in die Einheit bringt. Nur mit geladener
 * Einheitenzeile, nie mit einer Kennung allein.
 */
describe("Objekt-Link auf einer Einheitsseite", () => {
  const objektLink = { objekt_id: "o1", wohnung_id: null };

  it("öffnet eine Einheit desselben Objekts, wenn ihre Zeile an diesem Objekt hängt", () => {
    expect(linkBereich(objektLink, "o1", "w7", { id: "w7", objekt_id: "o1" })).toEqual({ objekt_id: "o1", wohnung_id: "w7" });
    expect(passtZumAufruf(objektLink, "o1", "w7", { id: "w7", objekt_id: "o1" })).toBe(true);
  });

  it("öffnet nichts ohne geladene Zeile, mit einer erfundenen Kennung oder mit einer Einheit eines fremden Objekts", () => {
    expect(linkBereich(objektLink, "o1", "w7")).toBeNull();
    expect(linkBereich(objektLink, "o1", "w7", null)).toBeNull();
    expect(linkBereich(objektLink, "o1", "erfunden", { id: "w7", objekt_id: "o1" })).toBeNull();
    expect(linkBereich(objektLink, "o1", "w7", { id: "w7", objekt_id: "o2" })).toBeNull();
    // Fremdes Objekt in der Adresse: nie, auch nicht mit einer Einheit von dort.
    expect(linkBereich(objektLink, "o2", "w7", { id: "w7", objekt_id: "o2" })).toBeNull();
  });

  it("der Link einer Einheit öffnet keine andere Einheit, auch nicht mit geladener Zeile", () => {
    expect(linkBereich({ objekt_id: "o1", wohnung_id: "w7" }, "o1", "w8", { id: "w8", objekt_id: "o1" })).toBeNull();
    expect(linkBereich({ objekt_id: "o1", wohnung_id: "w7" }, "o1", "w7")).toEqual({ objekt_id: "o1", wohnung_id: "w7" });
    expect(linkBereich({ objekt_id: "o1", wohnung_id: "w7" }, "o1", null)).toBeNull();
  });

  it("get-expose prüft mit der geladenen Einheit dieses Objekts und gibt Grundrisse nur zum geprüften Bereich", () => {
    const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/get-expose/index.ts"), "utf8");
    const laden = quelle.slice(quelle.indexOf("async function ladeEinheit"), quelle.indexOf("async function istExposeLink"));
    expect(laden).toContain('.from("wohnungen").select("id, objekt_id").eq("id", wohnungId).eq("objekt_id", objektId).maybeSingle()');
    const pruefung = quelle.slice(quelle.indexOf("async function pruefeKundenlink"), quelle.indexOf("async function glockeLaeuten"));
    expect(pruefung).toContain("const bereich = linkBereich(zeile, objektId, wohnungId, einheit);");
    expect(pruefung).toContain("if (!bereich) return OHNE;");
    expect(quelle).not.toContain("passtZumAufruf(");
    // Datei und Liste richten sich nach dem geprüften Bereich, nicht nach der Adresse.
    expect(quelle).toContain("const wohnungId = link.bereich.wohnung_id;");
    expect(quelle).toContain("link: link.bereich,");
    expect(quelle).toContain("grundrisseZumLink({ link: kundenlink.bereich,");
  });
});

describe("gilt der Link noch?", () => {
  it("gilt bis zur Frist", () => {
    expect(linkZustand({ gueltig_bis: "2026-11-22T12:00:00Z", zurueckgezogen_am: null }, JETZT)).toBe("gueltig");
  });

  it("ist nach der Frist abgelaufen", () => {
    expect(linkZustand({ gueltig_bis: "2026-09-01T00:00:00Z", zurueckgezogen_am: null }, JETZT)).toBe("abgelaufen");
  });

  it("behandelt einen zurückgezogenen Link wie einen abgelaufenen, auch vor der Frist", () => {
    expect(linkZustand({ gueltig_bis: "2026-11-22T12:00:00Z", zurueckgezogen_am: "2026-09-20T10:00:00Z" }, JETZT)).toBe("abgelaufen");
  });

  it("lässt ein intern gespeichertes Exposé ohne Frist gelten", () => {
    expect(linkZustand({ gueltig_bis: null, zurueckgezogen_am: null }, JETZT)).toBe("gueltig");
  });

  it("wertet ein unlesbares Datum als abgelaufen, im Zweifel zu", () => {
    expect(linkZustand({ gueltig_bis: "kein Datum", zurueckgezogen_am: null }, JETZT)).toBe("abgelaufen");
  });
});

/** Eine Attrappe des Supabase-Clients, die jedes Update mitschreibt. */
function attrappe(erstmalsSchonGesetzt = false) {
  const updates: Array<{ werte: Record<string, unknown>; filter: Array<[string, string, unknown]> }> = [];
  let erstmals = erstmalsSchonGesetzt;
  const client: ZaehlClient = {
    from: () => ({
      update: (werte) => {
        const eintrag = { werte, filter: [] as Array<[string, string, unknown]> };
        updates.push(eintrag);
        const filter: ZaehlFilter = {
          eq: (feld: string, wert: unknown) => { eintrag.filter.push(["eq", feld, wert]); return filter; },
          is: (feld: string, wert: null) => { eintrag.filter.push(["is", feld, wert]); return filter; },
          select: () => {
            // Die Bedingung „nur solange leer“ trifft genau einmal.
            const trifft = "erstmals_aufgerufen_am" in werte && !erstmals;
            if (trifft) erstmals = true;
            return Promise.resolve({ data: trifft ? [{ id: "e1" }] : [], error: null });
          },
          // Ein echtes Versprechen dahinter, damit die Attrappe die volle
          // `then`-Signatur von PromiseLike erfüllt.
          then: (erfuellt, abgelehnt) => Promise.resolve({ data: null, error: null }).then(erfuellt, abgelehnt),
        };
        return filter;
      },
    }),
  };
  return { client, updates };
}

const zeile = (extra: Partial<ExposeLinkZeile> = {}): ExposeLinkZeile => ({
  id: "e1", objekt_id: "o1", wohnung_id: "w7", kontakt_id: "k1", erstellt_von: "u1",
  gueltig_bis: "2026-11-22T12:00:00Z", aufrufe: 2, gesendet_von: "u1", zurueckgezogen_am: null, erstmals_aufgerufen_am: null,
  ...extra,
});

describe("Aufrufe zählen", () => {
  it("zählt hoch und setzt den Zeitpunkt, sonst nichts", async () => {
    const { client, updates } = attrappe(true);
    const jetzt = new Date(JETZT);
    const erg = await aufrufZaehlen(client, zeile({ erstmals_aufgerufen_am: "2026-09-21T08:00:00Z" }), true, jetzt);
    expect(erg.ersterAufruf).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0].werte).toEqual({ aufrufe: 3, zuletzt_aufgerufen_am: jetzt.toISOString() });
    // Kein Cookie, keine IP, nichts über den Betrachter.
    expect(Object.keys(updates[0].werte).sort()).toEqual(["aufrufe", "zuletzt_aufgerufen_am"]);
  });

  it("meldet den ersten Aufruf genau einmal, auch bei zwei gleichzeitigen Anfragen", async () => {
    const { client, updates } = attrappe(false);
    const [a, b] = await Promise.all([
      aufrufZaehlen(client, zeile(), true),
      aufrufZaehlen(client, zeile(), true),
    ]);
    expect([a.ersterAufruf, b.ersterAufruf].filter(Boolean)).toHaveLength(1);
    const bedingt = updates.filter((u) => "erstmals_aufgerufen_am" in u.werte);
    expect(bedingt.length).toBeGreaterThan(0);
    for (const u of bedingt) expect(u.filter).toContainEqual(["is", "erstmals_aufgerufen_am", null]);
  });

  it("zählt ohne die Migration weiter, aber ohne Glocke", async () => {
    const { client, updates } = attrappe(false);
    const erg = await aufrufZaehlen(client, zeile({ erstmals_aufgerufen_am: undefined }), false);
    expect(erg.ersterAufruf).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0].werte).toHaveProperty("aufrufe", 3);
  });

  it("wirft nie, wenn der Zähler klemmt", async () => {
    const kaputt: ZaehlClient = { from: () => { throw new Error("weg"); } };
    await expect(aufrufZaehlen(kaputt, zeile(), true)).resolves.toEqual({ ersterAufruf: false });
  });
});

describe("die Glocke", () => {
  it("geht an den zuständigen Partner und, wenn ein anderer gesendet hat, auch an ihn, jeder einmal", () => {
    expect(glockenEmpfaenger("vp1", "vp1", "vp1")).toEqual(["vp1"]);
    expect(glockenEmpfaenger("vp1", "admin1", "vp1")).toEqual(["vp1", "admin1"]);
    expect(glockenEmpfaenger(null, null, "u1")).toEqual(["u1"]);
    expect(glockenEmpfaenger(null, null, null)).toEqual([]);
  });

  it("nennt den Vornamen des Kunden", () => {
    expect(glockenTitel("Martina", "Brandl")).toBe("Martina hat dein Exposé geöffnet");
    expect(glockenTitel("", "Brandl")).toBe("Brandl hat dein Exposé geöffnet");
    expect(glockenTitel(null, null)).toBe("Dein Kunde hat dein Exposé geöffnet");
    expect(glockenText("Wohnung 7, Parkstraße 8, Augsburg")).toBe("Das Exposé Wohnung 7, Parkstraße 8, Augsburg wurde zum ersten Mal aufgerufen.");
  });
});

describe("get-expose, was hinausgeht", () => {
  const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/get-expose/index.ts"), "utf8");

  it("liest für den Link nie die gespeicherten Annahmen", () => {
    // Der Kundenlink rechnet neutral. Was nicht gelesen wird, kann nicht hinausgehen.
    expect(LINK_SPALTEN).not.toMatch(/annahmen/);
    expect(LINK_SPALTEN_ALT).not.toMatch(/annahmen/);
    expect(quelle).not.toMatch(/annahmen/);
  });

  it("schickt bei abgelaufenem oder zurückgezogenem Link nur den Hinweis und den Partner aus der Positivliste", () => {
    const block = quelle.slice(quelle.indexOf('if (kundenlink.art === "abgelaufen")'), quelle.indexOf('if (kundenlink.art === "gueltig" && zaehlen)'));
    expect(block).toContain("abgelaufen: true");
    expect(block).toContain("kundenlink.ansprechpartner");
    // Kein Objekt, keine Bilder, keine Einheiten.
    expect(block).not.toMatch(/oeffentlichesObjekt|bilder|wohnungen|dokumente/);
    // Der Partner kommt ausschließlich über die Positivliste.
    expect(quelle).toContain("oeffentlicherAnsprechpartner(profil)");
  });

  it("zählt nur mit aufruf=1 und nie in der Vorschau des Partners", () => {
    expect(quelle).toMatch(/const zaehlen = url\.searchParams\.get\("aufruf"\) === "1" && url\.searchParams\.get\("vorschau"\) !== "1"/);
    expect(quelle).toMatch(/kundenlink\.art === "gueltig" && zaehlen/);
  });

  it("gibt vom Kunden nichts heraus, Vor- und Nachname nur für die Glocke", () => {
    /*
     * Seit Etappe 3 der Kundensprache wird auch `meta` gelesen, aber nur, um
     * daraus die Sprache zu bestimmen. `kontakt.meta` steht deshalb genau an
     * einer Stelle, in `spracheAusMeta`, und geht nie selbst hinaus.
     */
    // `geloescht` seit 29.09.2026: Ohne Kontakt keine Glocke an die Leitung.
    expect(quelle).toContain('select("vorname, nachname, zustaendig_id, meta, geloescht")');
    expect(quelle.match(/kontakt\??\.meta/g)).toEqual(["kontakt.meta"]);
    expect(quelle).toContain("const sprache = kontakt ? spracheAusMeta(kontakt.meta) : undefined;");
    const antwortTeil = quelle.slice(quelle.indexOf("return new Response(JSON.stringify({\n      objekt:"));
    expect(antwortTeil).not.toMatch(/kontakt|vorname|nachname/);
  });
});
