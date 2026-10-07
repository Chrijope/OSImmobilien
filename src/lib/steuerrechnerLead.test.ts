/**
 * Der Weg vom Steuerrechner zum Lead.
 *
 * Die beiden Punkte, an denen alles haengt, stehen ganz oben in den Tests:
 * die Quelle, die `herkunftBezeichnung` als Steuerrechner erkennen muss, und
 * die geprueffte Partnerkennung, ohne die der Lead in der Lead-Verwaltung statt
 * beim Partner landet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STEUERRECHNER_QUELLE, leadNotiz, sendeSteuerLead } from "@/lib/steuerrechnerLead";
import { berechne } from "@/lib/steuerRechner";
import { standardAntworten, zuEingaben, type SteuerAntworten } from "@/lib/steuerrechnerStrecke";
import { herkunftBezeichnung } from "../../supabase/functions/_shared/lead-zuordnung";
import { _kampagneVergessen, kampagneErfassen } from "@/lib/kampagnenKennung";
import { istOffenerPoolLead } from "@/lib/leadPool";
import type { KundeData } from "@/lib/kundenStore";
import type { BeraterInfo } from "@/pages/AnalysePublic";

const ANTWORTEN: SteuerAntworten = {
  ...standardAntworten(),
  jahresbrutto: 85000,
  kinder: 1,
  bundesland: "by",
  startzeitpunkt: "sofort",
};
const ERGEBNIS = berechne(zuEingaben(ANTWORTEN));

const EINGABE = {
  vorname: " Max ",
  nachname: "Mustermann",
  email: " max@example.com ",
  telefon: "0170 1234567",
};

const BERATER: BeraterInfo = {
  name: "Christian Peetz",
  telefon: "0171 1111111",
  email: "os@os-immobilien.com",
  userId: "11111111-2222-3333-4444-555555555555",
};

let letzterAufruf: { url: string; body: Record<string, unknown> } | null = null;

beforeEach(() => {
  letzterAufruf = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      letzterAufruf = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ kontaktId: "kontakt-1" }) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Die Quelle", () => {
  it("wird vom Server als Steuerrechner erkannt", () => {
    // Die Function ist quellenunabhaengig, aber die Glocke des Partners soll
    // den richtigen Weg nennen. Das Muster steht in lead-zuordnung.ts.
    expect(herkunftBezeichnung(STEUERRECHNER_QUELLE)).toBe("den Steuerrechner");
  });

  it("geht genau so mit dem Lead raus", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS, BERATER);
    expect(letzterAufruf?.body.quelle).toBe(STEUERRECHNER_QUELLE);
    expect(letzterAufruf?.url).toContain("/functions/v1/submit-lead");
  });
});

describe("Die Partnerkennung", () => {
  it("geht mit, sonst landet der Lead in der Lead-Verwaltung statt beim Partner", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS, BERATER);
    expect(letzterAufruf?.body.beraterUserId).toBe(BERATER.userId);
    expect(letzterAufruf?.body.beraterName).toBe(BERATER.name);
  });

  it("bleibt leer, wenn es keinen Partner gibt, statt einen zu erfinden", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS);
    expect(letzterAufruf?.body.beraterUserId).toBe("");
    expect(letzterAufruf?.body.beraterSlug).toBe("");
  });

  /* Seit dem 24.09.2026 ermittelt der Server den Partner aus dem Kuerzel.
     Mit Kuerzel geht deshalb keine Kennung mehr mit, sie wuerde ohnehin
     nichts entscheiden. */
  it("schickt beim Link mit Kuerzel das Kuerzel und keine Kennung", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS, { ...BERATER, slug: "christian-peetz" });
    expect(letzterAufruf?.body.beraterSlug).toBe("christian-peetz");
    expect(letzterAufruf?.body.beraterUserId).toBe("");
  });

  it("schickt das Kuerzel auch, wenn die Seite den Partner nicht aufloesen konnte", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS, {
      name: "",
      telefon: "",
      email: "",
      slug: "gibt-es-nicht",
    });
    expect(letzterAufruf?.body.beraterSlug).toBe("gibt-es-nicht");
    expect(letzterAufruf?.body.beraterUserId).toBe("");
  });

  it("gibt keine Pipelinestufe vor, die entscheidet der Server", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS, BERATER);
    const meta = letzterAufruf?.body.meta as Record<string, unknown>;
    expect(meta.pipelineStufe).toBeUndefined();
  });

  /**
   * Wo landet ein Lead ohne Partner?
   *
   * Nicht im Nichts, sondern in der Lead-Verwaltung. Genau das ist der
   * Unterschied zum EXPATS Calculator: Dort bleiben die Beraterfelder immer
   * leer, hier gehen sie mit, sobald der Besucher ueber den persoenlichen Link
   * eines Partners kommt. Wer ohne Partnerbezug kommt, etwa ueber eine Anzeige
   * des Hauses, bleibt sichtbar und wird von Hand verteilt.
   */
  it("laesst einen Lead ohne Partner in der Lead-Verwaltung auftauchen, statt ihn zu verlieren", () => {
    /* So legt `submit-lead` ihn an: ohne `zustaendig_id`. `leadTyp` ist dort
       woertlich "standard", was der Typ `KundeData` nicht kennt, daher die
       Umdeutung. */
    const lead = {
      id: "1",
      leadTyp: "standard",
      quelle: STEUERRECHNER_QUELLE,
      status: "neu",
    } as unknown as Partial<KundeData>;
    expect(istOffenerPoolLead(lead, { rolle: "admin", benutzerId: "egal" })).toBe(true);
    // Mit Zustaendigem gehoert er dem Partner und steht nicht mehr im Pool.
    expect(
      istOffenerPoolLead(
        { ...lead, zustaendig_id: BERATER.userId },
        { rolle: "admin", benutzerId: "egal" },
      ),
    ).toBe(false);
  });
});

describe("Die Einwilligung", () => {
  it("geht mit Wortlaut und Zeitpunkt mit", async () => {
    await sendeSteuerLead({ ...EINGABE, einwilligung: true }, ANTWORTEN, ERGEBNIS);
    const nachweis = letzterAufruf?.body.dsgvo_consent as Record<string, unknown>;
    expect(nachweis?.erteilt).toBe(true);
    expect(String(nachweis?.text)).toContain("OS Immobilien");
    expect(nachweis?.am).toBeTruthy();
    expect(nachweis?.werbung).toBeUndefined();
  });

  it("fuehrt die freiwillige Werbeeinwilligung getrennt", async () => {
    await sendeSteuerLead(
      { ...EINGABE, einwilligung: true, werbeeinwilligung: true },
      ANTWORTEN,
      ERGEBNIS,
    );
    const nachweis = letzterAufruf?.body.dsgvo_consent as Record<string, any>;
    expect(nachweis?.werbung?.erteilt).toBe(true);
    expect(nachweis.werbung.text).not.toBe(nachweis.text);
  });

  it("schickt ohne Pflichthaken keinen erfundenen Nachweis mit", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS);
    expect(letzterAufruf?.body.dsgvo_consent).toBeNull();
  });
});

describe("Was der Partner im Kontakt sieht", () => {
  it("trimmt die Eingaben", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS);
    expect(letzterAufruf?.body.vorname).toBe("Max");
    expect(letzterAufruf?.body.email).toBe("max@example.com");
  });

  it("schreibt die Ausgangslage in ganzen Saetzen in die Notiz", () => {
    const notiz = leadNotiz(ANTWORTEN, ERGEBNIS);
    expect(notiz).toContain("Steuerrechner");
    expect(notiz).toContain("Steuerklasse I");
    expect(notiz).toContain("1 Kind");
    expect(notiz).toContain("So bald wie möglich");
  });

  it("nennt in der Notiz die Spanne und keine einzelne Zahl", () => {
    // Der Partner soll im Gespraech genau das sagen koennen, was auf dem
    // Bildschirm stand. Eine Punktzahl waere ein anderer Wert als die Seite.
    const notiz = leadNotiz(ANTWORTEN, ERGEBNIS);
    expect(notiz).toContain("Spanne");
    expect(notiz).toContain("Gutachten");
    expect(notiz).not.toContain("Neubau");
  });

  it("haengt den Schnappschuss der Rechnung an", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS, BERATER);
    const meta = letzterAufruf?.body.meta as Record<string, any>;
    expect(meta.leadQuality).toBe("hoch");
    expect(meta.steuerSnapshot.jahresbrutto).toBe(85000);
    expect(meta.steuerSnapshot.steuerklasse).toBe("I");
    expect(meta.steuerSnapshot.ersparnisJahrVon).toBe(Math.round(ERGEBNIS.spanne.jahr1.von));
    expect(meta.steuerSnapshot.ersparnisJahrBis).toBe(Math.round(ERGEBNIS.spanne.jahr1.bis));
    expect(meta.steuerSnapshot.ersparnis10JVon).toBe(Math.round(ERGEBNIS.spanne.zehnJahre.von));
    expect(meta.steuerSnapshot.ersparnis10JBis).toBe(Math.round(ERGEBNIS.spanne.zehnJahre.bis));
    expect(meta.steuerSnapshot.objektpreis).toBe(ERGEBNIS.spanne.objekt.preis);
  });

  it("legt das Datum mit ab, sonst ist die Angabe spaeter nichts mehr wert", async () => {
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS, BERATER);
    const meta = letzterAufruf?.body.meta as Record<string, any>;
    expect(Number.isNaN(Date.parse(meta.steuerSnapshot.erfasstAm))).toBe(false);
  });

  it("legt alle Angaben ab, die im Rechner gemacht wurden", async () => {
    // Was der Interessent ausgefuellt hat, soll der Partner im Kundenprofil
    // lesen koennen. Fehlt hier ein Feld, fehlt es dort auch.
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS, BERATER);
    const snap = (letzterAufruf?.body.meta as Record<string, any>).steuerSnapshot;
    for (const feld of [
      "jahresbrutto",
      "steuerklasse",
      "beschaeftigung",
      "kinder",
      "bundesland",
      "bestehendeImmobilien",
      "startzeitpunkt",
      "steuerlastHeute",
    ]) {
      expect(snap[feld]).not.toBeUndefined();
    }
  });

  /* Die Kirchensteuer verraet die Religionszugehoerigkeit. Sie dient nur der
     Rechnung im Browser und darf nirgends gespeichert werden: nicht im
     Snapshot, nicht in der Notiz, nicht in steuerNachricht. Geprueft wird der
     gesamte Rumpf, damit auch ein neues Feld sie nicht wieder hinaustraegt. */
  it.each([true, false])("schickt die Kirchensteuer nirgends mit (angehakt: %s)", async (kirchensteuer) => {
    const antworten = { ...ANTWORTEN, kirchensteuer };
    await sendeSteuerLead(EINGABE, antworten, berechne(zuEingaben(antworten)), BERATER);
    const meta = letzterAufruf?.body.meta as Record<string, any>;
    expect(meta.steuerSnapshot).not.toHaveProperty("kirchensteuer");
    expect(JSON.stringify(letzterAufruf?.body)).not.toMatch(/kirche/i);
    expect(leadNotiz(antworten, berechne(zuEingaben(antworten)))).not.toMatch(/kirche/i);
  });

  it("stuft den blossen Neugierigen niedriger ein als den, der starten will", async () => {
    await sendeSteuerLead(EINGABE, { ...ANTWORTEN, startzeitpunkt: "neugier" }, ERGEBNIS);
    expect((letzterAufruf?.body.meta as Record<string, unknown>).leadQuality).toBe("niedrig");
  });
});

describe("Wenn es nicht klappt", () => {
  it("meldet einen Serverfehler verstaendlich zurueck", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    const r = await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS);
    expect(r.ok).toBe(false);
    expect(r.fehler).toMatch(/nicht geklappt/);
  });

  it("meldet einen Netzfehler verstaendlich zurueck", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const r = await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS);
    expect(r.ok).toBe(false);
    expect(r.fehler).toMatch(/Internetverbindung/);
  });
});

describe("Die Kampagnenkennungen am Lead", () => {
  beforeEach(() => {
    _kampagneVergessen();
    window.history.replaceState({}, "", "/steuer");
  });

  afterEach(() => {
    _kampagneVergessen();
    window.history.replaceState({}, "", "/steuer");
  });

  it("gehen aus der Adresse mit in die meta", async () => {
    window.history.replaceState(
      {},
      "",
      "/steuer?utm_source=meta&utm_medium=cpc&utm_campaign=Steuer_Nuernberg",
    );
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS);
    const kampagne = (letzterAufruf?.body.meta as Record<string, any>).kampagne;
    expect(kampagne).toEqual({
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "Steuer_Nuernberg",
      erfasstAm: expect.any(String),
    });
  });

  it("fehlen ganz, wenn der Rechner ohne Kampagne aufgerufen wurde", async () => {
    // Der Normalfall beim persoenlichen Partnerlink. Nichts darf kaputtgehen,
    // und ein leeres Objekt soll auch nicht in der meta herumliegen.
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS, BERATER);
    const meta = letzterAufruf?.body.meta as Record<string, unknown>;
    expect(meta.kampagne).toBeUndefined();
    expect("kampagne" in meta).toBe(false);
    // Und der Rest des Leads steht unveraendert.
    expect(letzterAufruf?.body.beraterUserId).toBe(BERATER.userId);
    expect(meta.leadQuality).toBe("hoch");
  });

  it("kommen gekappt an, wenn jemand den Link aufblaeht", async () => {
    window.history.replaceState({}, "", `/steuer?utm_campaign=${"x".repeat(400)}`);
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS);
    const kampagne = (letzterAufruf?.body.meta as Record<string, any>).kampagne;
    expect(kampagne.utmCampaign).toHaveLength(120);
  });

  it("ueberleben bis zum Absenden, auch wenn die Adresse sie verliert", async () => {
    window.history.replaceState({}, "", "/steuer?utm_campaign=Herbst_2026");
    // Der Rechner wechselt die Adresse zwar nicht, aber ein Neuladen oder ein
    // spaeter ergaenzter Zwischenschritt darf die Kennung nicht kosten.
    kampagneErfassen();
    window.history.replaceState({}, "", "/steuer");
    await sendeSteuerLead(EINGABE, ANTWORTEN, ERGEBNIS);
    const kampagne = (letzterAufruf?.body.meta as Record<string, any>).kampagne;
    expect(kampagne.utmCampaign).toBe("Herbst_2026");
  });
});

describe("Der Lead übernimmt die Seitensprache (Plan Kundensprache, Etappe 6)", () => {
  const MIT_EINWILLIGUNG = { ...EINGABE, einwilligung: true };

  it("Englisch: `sprache` geht mit, die Einwilligung trägt den englischen Wortlaut", async () => {
    await sendeSteuerLead(MIT_EINWILLIGUNG, ANTWORTEN, ERGEBNIS, BERATER, "en");
    expect(letzterAufruf?.body.sprache).toBe("en");
    const einwilligung = letzterAufruf?.body.dsgvo_consent as { version: string; text: string };
    expect(einwilligung.version).toBe("2026-09-v1-en");
    expect(einwilligung.text).toMatch(/^I agree/);
  });

  it("ohne Angabe Deutsch, mit deutscher Einwilligung", async () => {
    await sendeSteuerLead(MIT_EINWILLIGUNG, ANTWORTEN, ERGEBNIS, BERATER);
    expect(letzterAufruf?.body.sprache).toBe("de");
    expect((letzterAufruf?.body.dsgvo_consent as { version: string }).version).toBe("2026-09-v1");
  });

  it("die Notiz an den Partner bleibt auch bei Englisch deutsch", async () => {
    await sendeSteuerLead(MIT_EINWILLIGUNG, ANTWORTEN, ERGEBNIS, BERATER, "en");
    expect(letzterAufruf?.body.notizen).toMatch(/^Steuerrechner: Jahresbrutto/);
  });
});
