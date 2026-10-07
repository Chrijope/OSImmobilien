import { describe, expect, it } from "vitest";
import type { VersandAuftrag } from "../../supabase/functions/send-kunden-expose/auftrag";
import {
  auswahlSpeichern, versandVermerk, zeileFuerVersand, type ZeilenClient,
} from "../../supabase/functions/send-kunden-expose/zeile";

/**
 * Welche Zeile `send-kunden-expose` nimmt (Christian, 23.09.2026):
 *   - Objektübersicht: genau eine lebende Zeile je Kunde, Investment und
 *     Objekt; erneut senden verlängert und setzt den Einstieg neu.
 *   - Exposé: eine Zeile je Einheit, wie bisher.
 *   - Zurückziehen ist endgültig.
 *
 * Geprüft gegen eine kleine Attrappe der Tabelle `objekt_exposes`, die die
 * Filter der Function wirklich auswertet und den eindeutigen Index der
 * Migration 20260923171000 nachbildet.
 */

type Zeile = Record<string, unknown>;

function attrappe(zeilen: Zeile[] = []) {
  const eingefuegt: Zeile[] = [];
  let nr = 0;
  // Bildet den Auslöser objekt_exposes_touch nach: jede Änderung setzt aktualisiert_am neu.
  let stand = 0;
  const client = {
    from: (_tabelle: string) => {
      const baue = (art: "select" | "insert" | "update", werte?: Zeile) => {
        const filter: Array<(z: Zeile) => boolean> = [];
        let sortierung: { feld: string; aufsteigend: boolean } | null = null;
        let anzahl = Number.POSITIVE_INFINITY;
        let einzeln = false;
        const ausfuehren = () => {
          if (art === "insert") {
            eingefuegt.push({ ...werte });
            nr += 1;
            const neu: Zeile = {
              id: `z${nr}`, token: `t${nr}`, erstellt_am: new Date(Date.UTC(2026, 8, 23, 10, nr)).toISOString(),
              gesendet_am: null, zurueckgezogen_am: null, art: "expose", einstieg_wohnung_id: null, aktualisiert_am: "a0", ...werte,
            };
            const doppelt = neu.art === "objektuebersicht" && zeilen.some((z) =>
              z.art === "objektuebersicht" && !z.zurueckgezogen_am
              && z.kontakt_id === neu.kontakt_id && z.investment_id === neu.investment_id && z.objekt_id === neu.objekt_id);
            if (doppelt) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            zeilen.push(neu);
            return { data: einzeln ? neu : [neu], error: null };
          }
          let treffer = zeilen.filter((z) => filter.every((f) => f(z)));
          if (art === "update") {
            for (const z of treffer) Object.assign(z, werte, { aktualisiert_am: `a${++stand}` });
            return { data: treffer, error: null };
          }
          if (sortierung) {
            const { feld, aufsteigend } = sortierung;
            treffer = [...treffer].sort((a, b) => String(a[feld] ?? "").localeCompare(String(b[feld] ?? "")) * (aufsteigend ? 1 : -1));
          }
          return { data: treffer.slice(0, anzahl), error: null };
        };
        const q: Record<string, unknown> = {
          eq: (feld: string, wert: unknown) => { filter.push((z) => z[feld] === wert); return q; },
          is: (feld: string, wert: null) => { filter.push((z) => (z[feld] ?? null) === wert); return q; },
          not: (feld: string, _op: string, wert: unknown) => { filter.push((z) => (z[feld] ?? null) !== wert); return q; },
          order: (feld: string, o: { ascending: boolean }) => { sortierung = { feld, aufsteigend: o.ascending }; return q; },
          limit: (n: number) => { anzahl = n; return q; },
          select: () => q,
          single: () => { einzeln = true; return q; },
          then: (ok: (v: unknown) => unknown, fehler?: (e: unknown) => unknown) => Promise.resolve(ausfuehren()).then(ok, fehler),
        };
        return q;
      };
      return {
        select: () => baue("select"),
        insert: (werte: Zeile) => baue("insert", werte),
        update: (werte: Zeile) => baue("update", werte),
      };
    },
  };
  return { db: client as unknown as ZeilenClient, zeilen, eingefuegt };
}

const K = "k1";
const I = "i1";
const O = "o1";

function auftrag(extra: Partial<VersandAuftrag> = {}): VersandAuftrag {
  return { modus: "mail", art: "objektuebersicht", kontaktId: K, investmentId: I, objektId: O, wohnungId: "w7", ...extra };
}

/** Ein Versand, wie `index.ts` ihn macht: Zeile holen, nach der Mail vermerken. */
async function senden(db: ZeilenClient, a: VersandAuftrag, jetzt: Date, mitArt = true, mitAuswahl = false) {
  const gueltigBis = new Date(jetzt.getTime() + 60 * 86400000);
  const { zeile, neu } = await zeileFuerVersand(db, a, { erstelltVon: "u1", gueltigBis, mitArt, mitAuswahl });
  // Wie index.ts: die Auswahl einer bestehenden Zeile vor der Mail, dann der Vermerk.
  if (!neu && mitAuswahl && a.art === "objektuebersicht") expect(await auswahlSpeichern(db, zeile, a.wohnungAuswahl)).not.toBe("geaendert");
  await db.from("objekt_exposes").update(versandVermerk(a, { jetzt, gueltigBis, gesendetVon: "u1" })).eq("id", zeile.id);
  return { zeile, neu, gueltigBis };
}

const TAG1 = new Date("2026-09-23T10:00:00Z");
const TAG30 = new Date("2026-10-23T10:00:00Z");

describe("Objektübersicht: eine Zeile je Kunde, Investment und Objekt", () => {
  it("legt beim ersten Senden eine Zeile ohne Einheit an, Einstieg bei der Wohnung", async () => {
    const { db, zeilen } = attrappe();
    const erg = await senden(db, auftrag(), TAG1);
    expect(erg.neu).toBe(true);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({
      art: "objektuebersicht", objekt_id: O, kontakt_id: K, investment_id: I,
      wohnung_id: null, einstieg_wohnung_id: "w7", annahmen: {}, versandweg: "mail",
    });
  });

  it("nimmt beim erneuten Senden aus einer anderen Wohnung dieselbe Zeile, setzt den Einstieg neu und verlängert", async () => {
    const { db, zeilen } = attrappe();
    const erst = await senden(db, auftrag(), TAG1);
    const zweit = await senden(db, auftrag({ wohnungId: "w9", modus: "link" }), TAG30);
    expect(zweit.neu).toBe(false);
    expect(zweit.zeile).toEqual(erst.zeile);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].einstieg_wohnung_id).toBe("w9");
    expect(zeilen[0].gueltig_bis).toBe(zweit.gueltigBis.toISOString());
    expect(Date.parse(String(zeilen[0].gueltig_bis))).toBeGreaterThan(erst.gueltigBis.getTime());
    expect(zeilen[0].versandweg).toBe("link");
  });

  it("nimmt auch eine abgelaufene, nicht zurückgezogene Zeile und gibt ihr eine neue Frist", async () => {
    const { db, zeilen } = attrappe([{
      id: "alt", token: "tok", art: "objektuebersicht", objekt_id: O, kontakt_id: K, investment_id: I,
      wohnung_id: null, einstieg_wohnung_id: "w3", gueltig_bis: "2026-01-01T00:00:00Z",
      gesendet_am: "2025-11-01T00:00:00Z", zurueckgezogen_am: null, erstellt_am: "2025-11-01T00:00:00Z",
    }]);
    const erg = await senden(db, auftrag({ wohnungId: "w7" }), TAG1);
    expect(erg.zeile).toEqual({ id: "alt", token: "tok" });
    expect(zeilen[0]).toMatchObject({ einstieg_wohnung_id: "w7", gueltig_bis: erg.gueltigBis.toISOString() });
  });

  it("legt für ein anderes Investment desselben Kunden eine eigene Zeile an", async () => {
    const { db, zeilen } = attrappe();
    await senden(db, auftrag(), TAG1);
    await senden(db, auftrag({ investmentId: "i2" }), TAG1);
    expect(zeilen).toHaveLength(2);
  });

  it("bekommt nach dem Zurückziehen einen neuen Link, der alte bleibt tot", async () => {
    const { db, zeilen } = attrappe();
    const erst = await senden(db, auftrag(), TAG1);
    zeilen[0].zurueckgezogen_am = "2026-09-24T08:00:00Z";
    const zweit = await senden(db, auftrag(), TAG30);
    expect(zweit.neu).toBe(true);
    expect(zweit.zeile.token).not.toBe(erst.zeile.token);
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0].zurueckgezogen_am).toBe("2026-09-24T08:00:00Z");
  });

  it("nimmt bei zwei gleichzeitigen Klicks die Zeile, die der eindeutige Index durchgelassen hat", async () => {
    const { db, zeilen } = attrappe();
    // Der erste Blick findet nichts, dazwischen legt der andere Klick an.
    const echt = db.from.bind(db);
    let erstesLesen = true;
    const zwischen = {
      from: (t: string) => {
        const tabelle = echt(t);
        return {
          ...tabelle,
          select: (s: string) => {
            if (!erstesLesen) return tabelle.select(s);
            erstesLesen = false;
            zeilen.push({ id: "andere", token: "tok2", art: "objektuebersicht", objekt_id: O, kontakt_id: K, investment_id: I, wohnung_id: null, zurueckgezogen_am: null, gesendet_am: null, erstellt_am: "2026-09-23T09:59:00Z" });
            return tabelle.select(s).eq("id", "gibt-es-nicht");
          },
        };
      },
    } as unknown as ZeilenClient;
    const { zeile, neu } = await zeileFuerVersand(zwischen, auftrag(), { erstelltVon: "u1", gueltigBis: TAG30, mitArt: true });
    expect(zeile).toEqual({ id: "andere", token: "tok2" });
    expect(neu).toBe(false);
    expect(zeilen).toHaveLength(1);
  });
});

describe("Exposé: weiterhin eine Zeile je Einheit", () => {
  it("legt je Einheit eine Zeile an und nimmt beim erneuten Senden dieselbe", async () => {
    const { db, zeilen } = attrappe();
    await senden(db, auftrag({ art: "expose", wohnungId: "w7" }), TAG1);
    await senden(db, auftrag({ art: "expose", wohnungId: "w9" }), TAG1);
    const nochmal = await senden(db, auftrag({ art: "expose", wohnungId: "w7" }), TAG30);
    expect(nochmal.neu).toBe(false);
    expect(zeilen).toHaveLength(2);
    expect(zeilen.map((z) => z.wohnung_id)).toEqual(["w7", "w9"]);
    expect(zeilen.every((z) => z.art === "expose" && z.einstieg_wohnung_id === null)).toBe(true);
  });

  it("verwechselt Exposé und Objektübersicht nicht, auch nicht beim ganzen Objekt", async () => {
    const { db, zeilen } = attrappe();
    await senden(db, auftrag({ art: "objektuebersicht", wohnungId: null }), TAG1);
    const expose = await senden(db, auftrag({ art: "expose", wohnungId: null }), TAG1);
    expect(expose.neu).toBe(true);
    expect(zeilen.map((z) => z.art)).toEqual(["objektuebersicht", "expose"]);
  });

  it("lässt ein nur intern gespeichertes Exposé (nie gesendet) unangetastet", async () => {
    const { db, zeilen } = attrappe([{
      id: "intern", token: "ti", art: "expose", objekt_id: O, kontakt_id: K, investment_id: I, wohnung_id: "w7",
      gesendet_am: null, zurueckgezogen_am: null, annahmen: { eigenkapital: 1 },
    }]);
    const erg = await senden(db, auftrag({ art: "expose", wohnungId: "w7" }), TAG1);
    expect(erg.neu).toBe(true);
    expect(zeilen[0]).toMatchObject({ id: "intern", gesendet_am: null, annahmen: { eigenkapital: 1 } });
  });

  it("schreibt ohne die Migration 20260923171000 weder Art noch Einstieg", async () => {
    const { db, eingefuegt } = attrappe();
    await senden(db, auftrag({ art: "expose", wohnungId: "w7" }), TAG1, false);
    expect(eingefuegt).toHaveLength(1);
    expect(Object.keys(eingefuegt[0])).not.toContain("art");
    expect(Object.keys(eingefuegt[0])).not.toContain("einstieg_wohnung_id");
    expect(Object.keys(versandVermerk(auftrag({ art: "expose" }), { jetzt: TAG1, gueltigBis: TAG30, gesendetVon: "u1" }))).not.toContain("einstieg_wohnung_id");
  });
});

describe("Objektübersicht: Wohnungsauswahl (05.10.2026)", () => {
  it("speichert die Auswahl schon beim Anlegen", async () => {
    const { db, eingefuegt, zeilen } = attrappe();
    await senden(db, auftrag({ wohnungAuswahl: ["w7", "w8"] }), TAG1, true, true);
    expect(eingefuegt[0].wohnung_auswahl).toEqual(["w7", "w8"]);
    expect(zeilen[0].wohnung_auswahl).toEqual(["w7", "w8"]);
  });

  it("ersetzt die Auswahl beim erneuten Senden, `null` heißt wieder alle freien", async () => {
    const { db, zeilen } = attrappe();
    await senden(db, auftrag({ wohnungAuswahl: ["w7"] }), TAG1, true, true);
    await senden(db, auftrag({ wohnungId: "w9", wohnungAuswahl: ["w8", "w9"] }), TAG30, true, true);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].wohnung_auswahl).toEqual(["w8", "w9"]);
    await senden(db, auftrag({ wohnungAuswahl: null }), TAG30, true, true);
    expect(zeilen[0].wohnung_auswahl).toBeNull();
  });

  it("lässt die Auswahl stehen, wenn der Auftrag keine nennt (Erneut senden aus dem Kundenprofil)", async () => {
    const { db, zeilen } = attrappe();
    await senden(db, auftrag({ wohnungAuswahl: ["w7"] }), TAG1, true, true);
    await senden(db, auftrag(), TAG30, true, true);
    expect(zeilen[0].wohnung_auswahl).toEqual(["w7"]);
  });

  it("schreibt ohne die Migration 20261005100000 keine Auswahl, und der Vermerk nach der Mail nie", async () => {
    const { db, eingefuegt } = attrappe();
    await senden(db, auftrag({ wohnungAuswahl: ["w7"] }), TAG1, true, false);
    expect(Object.keys(eingefuegt[0])).not.toContain("wohnung_auswahl");
    expect(Object.keys(versandVermerk(auftrag({ wohnungAuswahl: ["w7"] }), { jetzt: TAG1, gueltigBis: TAG30, gesendetVon: "u1" }))).not.toContain("wohnung_auswahl");
  });

  it("speichert vor der Mail nur, wenn die Zeile noch so ist wie gelesen", async () => {
    const { db, zeilen } = attrappe();
    await senden(db, auftrag({ wohnungAuswahl: ["w7"] }), TAG1, true, true);
    // Zwei Sendungen lesen dieselbe Zeile.
    const a = auftrag({ wohnungAuswahl: ["w7", "w8"] });
    const erste = (await zeileFuerVersand(db, a, { erstelltVon: "u1", gueltigBis: TAG30, mitArt: true, mitAuswahl: true })).zeile;
    const zweite = (await zeileFuerVersand(db, auftrag({ wohnungAuswahl: null }), { erstelltVon: "u1", gueltigBis: TAG30, mitArt: true, mitAuswahl: true })).zeile;
    expect(erste.wohnungAuswahl).toEqual(["w7"]);
    expect(await auswahlSpeichern(db, erste, ["w7", "w8"])).toBe("gespeichert");
    // Die zweite kam zu spät: kein stilles Überschreiben, schon gar nicht mit „alle freien“.
    expect(await auswahlSpeichern(db, zweite, null)).toBe("geaendert");
    expect(zeilen[0].wohnung_auswahl).toEqual(["w7", "w8"]);
  });

  it("schreibt nichts, wenn die Auswahl gleich bleibt oder der Auftrag keine nennt", async () => {
    const { db, zeilen } = attrappe();
    await senden(db, auftrag({ wohnungAuswahl: ["w7"] }), TAG1, true, true);
    const zeile = (await zeileFuerVersand(db, auftrag(), { erstelltVon: "u1", gueltigBis: TAG30, mitArt: true, mitAuswahl: true })).zeile;
    const vorher = zeilen[0].aktualisiert_am;
    expect(await auswahlSpeichern(db, zeile, ["w7"])).toBe("unveraendert");
    expect(await auswahlSpeichern(db, zeile, undefined)).toBe("unveraendert");
    expect(zeilen[0].aktualisiert_am).toBe(vorher);
  });
});
