/**
 * Die Kampagnenkennungen aus der Adresse.
 *
 * Drei Dinge muessen sitzen, alles andere haengt daran:
 *   1. Ohne Kennung darf nichts kaputtgehen. Das ist der Normalfall beim
 *      persoenlichen Partnerlink.
 *   2. Die Werte kommen von aussen. Laenge und Zeichenvorrat sind begrenzt.
 *   3. Die erste Kennung der Sitzung ueberlebt bis zum Absenden.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OHNE_KAMPAGNE,
  _kampagneVergessen,
  darfKampagneSehen,
  istLeer,
  kampagneAusKontakt,
  kampagneErfassen,
  kampagneFuerLead,
  kampagnenName,
  leseKampagneAusAdresse,
} from "@/lib/kampagnenKennung";
import { _einwilligungVergessen, speichereCookieEinwilligung } from "@/lib/cookieEinwilligung";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";

beforeEach(() => {
  _kampagneVergessen();
});

afterEach(() => {
  _kampagneVergessen();
});

describe("Ohne Kampagne", () => {
  it("liefert ein leeres Objekt statt zu scheitern", () => {
    expect(leseKampagneAusAdresse("")).toEqual({});
    expect(istLeer(leseKampagneAusAdresse(""))).toBe(true);
  });

  it("stoert sich nicht an fremden Parametern", () => {
    // Der Partnerlink traegt ein "b" mit den Beraterdaten. Es geht uns nichts an.
    expect(leseKampagneAusAdresse("?b=eyJuYW1lIjoiWCJ9")).toEqual({});
  });

  it("setzt kein Feld am Lead", () => {
    expect(kampagneFuerLead("")).toBeUndefined();
  });

  it("heisst in der Auswertung ehrlich so", () => {
    expect(kampagnenName(undefined)).toBe(OHNE_KAMPAGNE);
    expect(kampagnenName({})).toBe(OHNE_KAMPAGNE);
  });
});

describe("Die sieben Kennungen", () => {
  it("werden vollstaendig gelesen", () => {
    const k = leseKampagneAusAdresse(
      "?utm_source=meta&utm_medium=cpc&utm_campaign=Steuer_Muenchen&utm_content=Bild_A&utm_term=steuern+sparen&gclid=ABC-123&fbclid=IwAR_9",
    );
    expect(k).toEqual({
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "Steuer_Muenchen",
      utmContent: "Bild_A",
      utmTerm: "steuern sparen",
      gclid: "ABC-123",
      fbclid: "IwAR_9",
    });
  });

  it("gruppieren nach utm_campaign", () => {
    expect(kampagnenName({ utmSource: "meta", utmMedium: "cpc", utmCampaign: "Nuernberg_09" }))
      .toBe("Nuernberg_09");
  });

  it("fallen ohne utm_campaign auf Quelle und Medium zurueck", () => {
    // Ein halb gesetzter Link soll nicht in der Sammelzeile verschwinden.
    expect(kampagnenName({ utmSource: "meta", utmMedium: "cpc" })).toBe("meta / cpc");
    expect(kampagnenName({ fbclid: "IwAR_9" })).toBe("Meta Ads (ohne utm_campaign)");
    expect(kampagnenName({ gclid: "ABC" })).toBe("Google Ads (ohne utm_campaign)");
  });
});

describe("Die Begrenzung gegen Missbrauch", () => {
  it("kappt einen UTM-Wert bei 120 Zeichen", () => {
    const lang = "a".repeat(500);
    const k = leseKampagneAusAdresse(`?utm_campaign=${lang}`);
    expect(k.utmCampaign).toHaveLength(120);
  });

  it("kappt eine Klickkennung bei 255 Zeichen", () => {
    const lang = "b".repeat(900);
    const k = leseKampagneAusAdresse(`?fbclid=${lang}`);
    expect(k.fbclid).toHaveLength(255);
  });

  it("wirft verbotene Zeichen weg", () => {
    const k = leseKampagneAusAdresse(
      `?utm_campaign=${encodeURIComponent('<script>alert("x")</script>Muenchen')}`,
    );
    expect(k.utmCampaign).not.toContain("<");
    expect(k.utmCampaign).not.toContain(">");
    expect(k.utmCampaign).not.toContain('"');
    expect(k.utmCampaign).toContain("Muenchen");
  });

  it("laesst Umlaute und uebliche Satzzeichen stehen", () => {
    const k = leseKampagneAusAdresse(`?utm_campaign=${encodeURIComponent("München | Herbst-2026 (A/B)")}`);
    expect(k.utmCampaign).toBe("München | Herbst-2026 (A/B)");
  });

  it("laesst eine Klickkennung nur aus Buchstaben, Ziffern, Punkt, Strich und Unterstrich zu", () => {
    const k = leseKampagneAusAdresse(`?gclid=${encodeURIComponent("A B<>C_1.2-3")}`);
    expect(k.gclid).toBe("ABC_1.2-3");
  });

  it("uebernimmt einen Wert nicht, wenn nach dem Saeubern nichts bleibt", () => {
    const k = leseKampagneAusAdresse(`?utm_source=${encodeURIComponent("<<>>")}`);
    expect(k.utmSource).toBeUndefined();
    expect(istLeer(k)).toBe(true);
  });
});

describe("Wie lange die Kennung lebt", () => {
  it("ueberlebt den Weg bis zum Absenden, auch ohne Kennung in der Adresse", () => {
    const beimAnkommen = kampagneErfassen("?utm_campaign=Herbst");
    expect(beimAnkommen.utmCampaign).toBe("Herbst");
    expect(beimAnkommen.erfasstAm).toBeTruthy();

    // Spaeter, die Adresse traegt nichts mehr.
    const beimAbsenden = kampagneErfassen("");
    expect(beimAbsenden.utmCampaign).toBe("Herbst");
  });

  it("laesst die erste Kennung der Sitzung stehen", () => {
    kampagneErfassen("?utm_campaign=Erste");
    expect(kampagneErfassen("?utm_campaign=Zweite").utmCampaign).toBe("Erste");
  });

  it("faengt ohne gesicherten Stand mit einem leeren Objekt an", () => {
    expect(kampagneErfassen("")).toEqual({});
  });
});

describe("Der Kontakt in der Auswertung", () => {
  it("liefert die Kennung aus meta", () => {
    const kontakt = { meta: { kampagne: { utmCampaign: "Hof_09" } } };
    expect(kampagnenName(kampagneAusKontakt(kontakt))).toBe("Hof_09");
  });

  it("stellt alte Leads ohne Kennung in die Sammelzeile", () => {
    expect(kampagneAusKontakt({ meta: { leadQuality: "hoch" } })).toBeUndefined();
    expect(kampagneAusKontakt({})).toBeUndefined();
    expect(kampagneAusKontakt(null)).toBeUndefined();
    expect(kampagnenName(kampagneAusKontakt({}))).toBe(OHNE_KAMPAGNE);
  });
});

describe("Die Gruppierung in der Statistik", () => {
  /**
   * Genau die Zuordnung, die "Conversion je Kampagne" in
   * `StatistikConversion.tsx` vornimmt. Sie steht hier, damit der Fall der
   * alten Leads festgehalten ist: Sie tragen keine Kennung und gehoeren
   * sichtbar in eine eigene Zeile, nicht unter den Tisch.
   */
  function gruppiere(kontakte: unknown[]): Record<string, number> {
    const zaehler: Record<string, number> = {};
    for (const k of kontakte) {
      const name = kampagnenName(kampagneAusKontakt(k));
      zaehler[name] = (zaehler[name] || 0) + 1;
    }
    return zaehler;
  }

  it("stellt Leads mit Kennung je Kampagne und alle anderen in die Sammelzeile", () => {
    const zaehler = gruppiere([
      { quelle: "Steuerrechner", meta: { kampagne: { utmCampaign: "Hof_09" } } },
      { quelle: "Steuerrechner", meta: { kampagne: { utmCampaign: "Hof_09" } } },
      { quelle: "Steuerrechner", meta: { kampagne: { utmCampaign: "Nuernberg_09" } } },
      // Ein alter Lead von vor der Einfuehrung der Kennungen.
      { quelle: "Steuerrechner", meta: { leadQuality: "hoch" } },
      // Ein Lead ueber den persoenlichen Partnerlink, der Normalfall.
      { quelle: "Analysetool", meta: {} },
    ]);
    expect(zaehler).toEqual({
      Hof_09: 2,
      Nuernberg_09: 1,
      [OHNE_KAMPAGNE]: 2,
    });
  });

  it("verliert keinen Lead", () => {
    const kontakte = [{ meta: {} }, { meta: { kampagne: { utmCampaign: "A" } } }, {}];
    const summe = Object.values(gruppiere(kontakte)).reduce((a, b) => a + b, 0);
    expect(summe).toBe(kontakte.length);
  });
});

describe("Erster und letzter Kontakt", () => {
  it("schickt den ersten Kontakt und den abweichenden letzten unter 'zuletzt'", () => {
    kampagneErfassen("?utm_source=facebook&utm_campaign=meta_herbst_steuer_video2");
    kampagneErfassen("?utm_source=google&utm_campaign=google_suche_steuer");
    const lead = kampagneFuerLead("");
    expect(lead?.utmCampaign).toBe("meta_herbst_steuer_video2");
    expect(lead?.utmSource).toBe("facebook");
    expect(lead?.zuletzt?.utmCampaign).toBe("google_suche_steuer");
  });

  it("laesst 'zuletzt' weg, wenn es nur einen Kontakt gab", () => {
    kampagneErfassen("?utm_campaign=A");
    kampagneErfassen("?utm_campaign=A");
    expect(kampagneFuerLead("")?.zuletzt).toBeUndefined();
  });
});

describe("Wo die Kennung liegt", () => {
  let speicher: Map<string, string>;
  let sitzung: Map<string, string>;

  beforeEach(() => {
    speicher = setzeSpeicherAttrappe();
    sitzung = setzeSpeicherAttrappe("sessionStorage");
    _einwilligungVergessen();
    _kampagneVergessen();
  });

  afterEach(() => {
    _einwilligungVergessen();
  });

  it("ohne Statistik-Einwilligung nur im Arbeitsspeicher, nichts im Browser", () => {
    kampagneErfassen("?utm_campaign=Herbst");
    expect(speicher.size).toBe(0);
    expect(sitzung.size).toBe(0);
    // Innerhalb der geoeffneten Seite bleibt sie trotzdem bis zum Absenden.
    expect(kampagneFuerLead("")?.utmCampaign).toBe("Herbst");
  });

  it("mit Statistik-Einwilligung 30 Tage im localStorage", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: false });
    kampagneErfassen("?utm_campaign=Herbst");
    const roh = [...speicher.entries()].find(([k]) => k.startsWith("moreimmo.kampagne"));
    expect(roh).toBeTruthy();
    const gelesen = JSON.parse(roh![1]);
    expect(gelesen.erster.utmCampaign).toBe("Herbst");
    const tage = (gelesen.ablauf - Date.now()) / 86_400_000;
    expect(tage).toBeGreaterThan(29);
    expect(tage).toBeLessThanOrEqual(30);
  });

  it("legt den Stand nachtraeglich ab, wenn die Einwilligung spaeter kommt", () => {
    kampagneErfassen("?utm_campaign=Herbst");
    expect(speicher.size).toBe(0);
    speichereCookieEinwilligung({ statistik: true, marketing: false });
    expect([...speicher.keys()].some((k) => k.startsWith("moreimmo.kampagne"))).toBe(true);
  });

  it("loescht den Stand, wenn die Einwilligung zurueckgenommen wird", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: false });
    kampagneErfassen("?utm_campaign=Herbst");
    speichereCookieEinwilligung({ statistik: false, marketing: false });
    expect([...speicher.keys()].some((k) => k.startsWith("moreimmo.kampagne"))).toBe(false);
  });

  it("entfernt die alte Ablage in der sessionStorage", () => {
    sitzung.set("moreimmo.kampagne", JSON.stringify({ utmCampaign: "Alt" }));
    kampagneErfassen("");
    expect(sitzung.has("moreimmo.kampagne")).toBe(false);
  });

  it("verwirft einen abgelaufenen Stand", () => {
    speichereCookieEinwilligung({ statistik: true, marketing: false });
    speicher.set(
      "moreimmo.kampagne.v2",
      JSON.stringify({ erster: { utmCampaign: "Uralt" }, letzter: { utmCampaign: "Uralt" }, ablauf: Date.now() - 1 }),
    );
    expect(kampagneErfassen("")).toEqual({});
  });
});

describe("Wer die Kennung sieht", () => {
  it("Admin, Inhaber, Vertriebsleitung und Marketing", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter", "marketing"]) {
      expect(darfKampagneSehen(rolle)).toBe(true);
    }
  });

  it("nicht der Vertriebspartner, nicht der Kunde", () => {
    for (const rolle of ["vertriebspartner", "setterin", "kunde", "tippgeber", "", null, undefined]) {
      expect(darfKampagneSehen(rolle)).toBe(false);
    }
  });
});
