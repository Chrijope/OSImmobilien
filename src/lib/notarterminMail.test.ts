import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const gesendet: Array<{ vorlage: string; empfaenger: string; idempotenzSchluessel: string; felder: Record<string, unknown> }> = [];

vi.mock("@/lib/mailVersand", () => ({
  sendeVorlagenMail: vi.fn(async (auftrag: any) => {
    gesendet.push(auftrag);
    return { ok: true };
  }),
}));

import {
  NOTAR_MAIL_STAND_FELD,
  freigabeRueckmeldung,
  interneNotarEmpfaenger,
  kundeKenntTerminSchon,
  lesbaresNotarDatum,
  notarMailAnlass,
  notarterminBestaetigungIntern,
  notarterminFreigabeMails,
  notarterminMailsVersenden,
  notarterminStandSchluessel,
  type NotarterminEintrag,
} from "./notarterminMail";
import { sendeVorlagenMail } from "@/lib/mailVersand";

const eintrag = (extra: Partial<NotarterminEintrag> = {}): NotarterminEintrag => ({
  investmentId: "inv-1",
  kundeName: "Max Mustermann",
  kundeEmail: "max@example.com",
  datum: "2026-10-15",
  uhrzeit: "10:30",
  notarName: "Notariat Dr. Berger",
  notarAdresse: "Königstraße 4, 90402 Nürnberg",
  notarEmail: "berger@notariat.example",
  objektName: "Breitscheidstraße 18",
  wohnungName: "WE 12",
  portalUrl: "https://osimmobilien.netlify.app/kunde/investments",
  vp: { userId: "vp-1", name: "Julia Partner", email: "julia@example.com" },
  bestaetigterTermin: null,
  ...extra,
});

beforeEach(() => {
  gesendet.length = 0;
});

describe("lesbaresNotarDatum", () => {
  it("macht aus dem Datumsfeld ein lesbares Datum", () => {
    expect(lesbaresNotarDatum("2026-10-15")).toBe("Donnerstag, 15. Oktober 2026");
  });
  it("lässt andere Schreibweisen unverändert", () => {
    expect(lesbaresNotarDatum("15.10.2026")).toBe("15.10.2026");
    expect(lesbaresNotarDatum("")).toBe("");
  });
});

describe("interneNotarEmpfaenger", () => {
  it("nennt Vertriebspartner und Büro", () => {
    expect(interneNotarEmpfaenger("julia@example.com", "max@example.com")).toEqual(["julia@example.com", "os@os-immobilien.com"]);
  });
  it("führt das Büro nur einmal, auch wenn der Partner dieselbe Adresse hat", () => {
    expect(interneNotarEmpfaenger("os@os-immobilien.com", "max@example.com")).toEqual(["os@os-immobilien.com"]);
  });
  it("schickt die interne Meldung nie an den Kunden", () => {
    expect(interneNotarEmpfaenger("max@example.com", "MAX@example.com")).toEqual(["os@os-immobilien.com"]);
  });
  it("kommt ohne Partner mit dem Büro aus", () => {
    expect(interneNotarEmpfaenger(undefined, undefined)).toEqual(["os@os-immobilien.com"]);
  });
});

describe("notarterminMailsVersenden", () => {
  it("schickt dem Kunden die Kundenvorlage mit Datum und Uhrzeit unter den richtigen Feldnamen", async () => {
    await notarterminMailsVersenden(eintrag());
    const kunde = gesendet.filter((m) => m.empfaenger === "max@example.com");
    expect(kunde).toHaveLength(1);
    expect(kunde[0].vorlage).toBe("notartermin-geplant");
    expect(kunde[0].felder).toMatchObject({
      kundeName: "Max Mustermann",
      datum: "Donnerstag, 15. Oktober 2026",
      uhrzeit: "10:30",
      notarName: "Notariat Dr. Berger",
      notarAdresse: "Königstraße 4, 90402 Nürnberg",
      beraterUserId: "vp-1",
    });
    // Die alten, falschen Namen dürfen nicht mehr auftauchen.
    expect(kunde[0].felder).not.toHaveProperty("terminDatum");
    expect(kunde[0].felder).not.toHaveProperty("terminUhrzeit");
  });

  it("schickt Partner und Büro die interne Meldung, dem Kunden nicht", async () => {
    await notarterminMailsVersenden(eintrag());
    const intern = gesendet.filter((m) => m.vorlage === "notartermin-benachrichtigung");
    expect(intern.map((m) => m.empfaenger)).toEqual(["julia@example.com", "os@os-immobilien.com"]);
    expect(intern[0].felder).toMatchObject({ terminDatum: "Donnerstag, 15. Oktober 2026", terminUhrzeit: "10:30", vertriebspartner: "Julia Partner" });
    expect(gesendet).toHaveLength(3);
  });

  it("verschickt keine zweite Kundenmail, wenn der Kunde genau diesen Termin im Portal bestätigt hat", async () => {
    await notarterminMailsVersenden(eintrag({ bestaetigterTermin: { datum: "2026-10-15" } }));
    expect(gesendet.some((m) => m.vorlage === "notartermin-geplant")).toBe(false);
    expect(gesendet.filter((m) => m.vorlage === "notartermin-benachrichtigung")).toHaveLength(2);
  });

  it("schickt die Kundenmail, wenn der bestätigte Termin ein anderer war", async () => {
    await notarterminMailsVersenden(eintrag({ bestaetigterTermin: { datum: "2026-10-01" } }));
    expect(gesendet.filter((m) => m.vorlage === "notartermin-geplant")).toHaveLength(1);
  });

  it("nimmt stabile Schlüssel je Terminstand, damit ein zweites Auslösen für denselben Stand nichts neu verschickt", async () => {
    await notarterminMailsVersenden(eintrag());
    const stand = notarterminStandSchluessel(eintrag());
    expect(stand).toMatch(/^2026-10-15:[0-9a-f]{8}$/);
    expect(gesendet.map((m) => m.idempotenzSchluessel)).toEqual([
      `notartermin-geplant:inv-1:${stand}`,
      `notartermin-intern:inv-1:${stand}:julia@example.com`,
      `notartermin-intern:inv-1:${stand}:os@os-immobilien.com`,
    ]);
  });

  it("setzt den Änderungshinweis nur, wenn er verlangt ist", async () => {
    await notarterminMailsVersenden(eintrag());
    expect(gesendet.every((m) => !("geaendert" in m.felder))).toBe(true);
    gesendet.length = 0;
    await notarterminMailsVersenden(eintrag(), { geaendert: true });
    expect(gesendet).toHaveLength(3);
    expect(gesendet.every((m) => m.felder.geaendert === true)).toBe(true);
  });

  it("kommt ohne Kundenadresse aus", async () => {
    await notarterminMailsVersenden(eintrag({ kundeEmail: "" }));
    expect(gesendet.every((m) => m.vorlage === "notartermin-benachrichtigung")).toBe(true);
  });
});

describe("notarterminStandSchluessel", () => {
  it("bleibt gleich bei gleichem Termin, auch mit anderem Leerraum oder Groß- und Kleinschreibung", () => {
    const a = notarterminStandSchluessel(eintrag());
    const b = notarterminStandSchluessel(eintrag({ notarName: "  notariat  dr. berger ", notarAdresse: "Königstraße 4,  90402 Nürnberg" }));
    expect(b).toBe(a);
  });

  it("ändert sich mit Datum, Uhrzeit, Notar oder Adresse", () => {
    const basis = notarterminStandSchluessel(eintrag());
    for (const extra of [
      { datum: "2026-10-16" },
      { uhrzeit: "11:00" },
      { notarName: "Notariat Dr. Huber" },
      { notarAdresse: "Hauptmarkt 1, 90403 Nürnberg" },
    ]) {
      expect(notarterminStandSchluessel(eintrag(extra))).not.toBe(basis);
    }
  });

  it("hängt nicht an Angaben, die nicht zum Termin gehören", () => {
    const basis = notarterminStandSchluessel(eintrag());
    expect(notarterminStandSchluessel(eintrag({ notarEmail: "neu@notariat.example", objektName: "Anderes Objekt" }))).toBe(basis);
  });
});

describe("notarMailAnlass", () => {
  it("unterscheidet erstmals, geändert und unverändert", () => {
    expect(notarMailAnlass("", "2026-10-15:aaaa0000")).toBe("erstmals");
    expect(notarMailAnlass(undefined, "2026-10-15:aaaa0000")).toBe("erstmals");
    expect(notarMailAnlass("2026-10-15:aaaa0000", "2026-10-15:aaaa0000")).toBe("unveraendert");
    expect(notarMailAnlass("2026-10-15:aaaa0000", "2026-10-15:bbbb0000")).toBe("geaendert");
  });
});

describe("notarterminFreigabeMails: Versand bei der Freigabe", () => {
  it("verschickt bei der ersten Freigabe Kundenmail und interne Meldung und merkt sich den Stand", async () => {
    const ergebnis = await notarterminFreigabeMails(eintrag(), "");
    expect(ergebnis.anlass).toBe("erstmals");
    expect(gesendet.map((m) => [m.vorlage, m.empfaenger])).toEqual([
      ["notartermin-geplant", "max@example.com"],
      ["notartermin-benachrichtigung", "julia@example.com"],
      ["notartermin-benachrichtigung", "os@os-immobilien.com"],
    ]);
    expect(gesendet.every((m) => !("geaendert" in m.felder))).toBe(true);
    expect(ergebnis.merken).toBe(notarterminStandSchluessel(eintrag()));
  });

  it("verschickt bei unveränderter erneuter Freigabe nichts", async () => {
    const erste = await notarterminFreigabeMails(eintrag(), "");
    gesendet.length = 0;
    const zweite = await notarterminFreigabeMails(eintrag(), erste.merken);
    expect(zweite.anlass).toBe("unveraendert");
    expect(zweite.versand).toBeNull();
    expect(zweite.merken).toBeNull();
    expect(gesendet).toHaveLength(0);
  });

  it("verschickt nach einer Änderung genau eine Änderungsmail je Empfänger mit neuem Schlüssel", async () => {
    const erste = await notarterminFreigabeMails(eintrag(), "");
    const alteSchluessel = gesendet.map((m) => m.idempotenzSchluessel);
    gesendet.length = 0;
    const geaendert = eintrag({ uhrzeit: "14:00" });
    const zweite = await notarterminFreigabeMails(geaendert, erste.merken);
    expect(zweite.anlass).toBe("geaendert");
    expect(gesendet.map((m) => m.empfaenger)).toEqual(["max@example.com", "julia@example.com", "os@os-immobilien.com"]);
    expect(gesendet.every((m) => m.felder.geaendert === true)).toBe(true);
    expect(gesendet[0].felder).toMatchObject({ uhrzeit: "14:00" });
    for (const m of gesendet) expect(alteSchluessel).not.toContain(m.idempotenzSchluessel);
    expect(zweite.merken).toBe(notarterminStandSchluessel(geaendert));
  });

  it("verschickt ohne Datum nichts", async () => {
    const ergebnis = await notarterminFreigabeMails(eintrag({ datum: "" }), "");
    expect(ergebnis.anlass).toBe("ohne-datum");
    expect(gesendet).toHaveLength(0);
  });

  it("merkt sich den Stand nicht, wenn eine Mail nicht hinausging, damit eine erneute Freigabe nachschickt", async () => {
    vi.mocked(sendeVorlagenMail).mockImplementationOnce(async (auftrag: any) => {
      gesendet.push(auftrag);
      return { ok: false, grund: "Adresse steht auf der Sperrliste" };
    });
    const ergebnis = await notarterminFreigabeMails(eintrag(), "");
    expect(ergebnis.merken).toBeNull();
    expect(freigabeRueckmeldung(ergebnis)).toMatchObject({ problem: true });
    expect(freigabeRueckmeldung(ergebnis).text).toContain("Kunde");
  });

  it("merkt sich den Stand unter einem festen Meta-Feld", () => {
    expect(NOTAR_MAIL_STAND_FELD).toBe("notarTerminMailStand");
  });
});

describe("freigabeRueckmeldung", () => {
  it("nennt Erstversand, Änderung, unveränderten Stand und fehlendes Datum", async () => {
    const erste = await notarterminFreigabeMails(eintrag(), "");
    expect(freigabeRueckmeldung(erste)).toEqual({ text: "Kunde, Vertriebspartner und Büro haben eine E-Mail bekommen.", problem: false });
    const zweite = await notarterminFreigabeMails(eintrag({ datum: "2026-10-20" }), erste.merken);
    expect(freigabeRueckmeldung(zweite).text).toContain("die Änderung per E-Mail");
    const dritte = await notarterminFreigabeMails(eintrag({ datum: "2026-10-20" }), zweite.merken);
    expect(freigabeRueckmeldung(dritte).text).toContain("unverändert");
    expect(freigabeRueckmeldung(await notarterminFreigabeMails(eintrag({ datum: "" }), "")).problem).toBe(true);
  });
});

describe("notarterminBestaetigungIntern: Kunde bestätigt im Portal", () => {
  const bestaetigung = (extra: Record<string, unknown> = {}) => ({
    investmentId: "inv-1",
    kundeName: "Max Mustermann",
    kundeEmail: "max@example.com",
    datum: "2026-10-15",
    uhrzeit: "10:30",
    vpName: "Julia Partner",
    vpEmail: "julia@example.com",
    kundeLink: "https://osimmobilien.netlify.app/kunden/k-1",
    ...extra,
  });

  it("schickt Vertriebspartner und Büro je eine Meldung", async () => {
    await notarterminBestaetigungIntern(bestaetigung());
    expect(gesendet.map((m) => [m.vorlage, m.empfaenger])).toEqual([
      ["notartermin-bestaetigt", "julia@example.com"],
      ["notartermin-bestaetigt", "os@os-immobilien.com"],
    ]);
    expect(gesendet[0].felder).toMatchObject({ vpName: "Julia Partner", datum: "Donnerstag, 15. Oktober 2026", uhrzeit: "10:30" });
    // Das Büro bekommt keine Anrede mit dem Vornamen des Partners.
    expect(gesendet[1].felder).not.toHaveProperty("vpName");
  });

  it("schickt dem Büro die Meldung auch ohne zuständigen Partner", async () => {
    await notarterminBestaetigungIntern(bestaetigung({ vpName: "", vpEmail: undefined }));
    expect(gesendet.map((m) => m.empfaenger)).toEqual(["os@os-immobilien.com"]);
  });

  it("schickt jeder Adresse die Meldung nur einmal je Termin", async () => {
    await notarterminBestaetigungIntern(bestaetigung({ vpEmail: "os@os-immobilien.com" }));
    expect(gesendet.map((m) => m.empfaenger)).toEqual(["os@os-immobilien.com"]);
    gesendet.length = 0;
    await notarterminBestaetigungIntern(bestaetigung());
    expect(gesendet.map((m) => m.idempotenzSchluessel)).toEqual([
      "notartermin-bestaetigt:inv-1:2026-10-15:10:30:julia@example.com",
      "notartermin-bestaetigt:inv-1:2026-10-15:10:30:os@os-immobilien.com",
    ]);
  });
});

describe("Verdrahtung in Kundenakte und Portal", () => {
  const quelle = (pfad: string) => readFileSync(resolve(__dirname, "..", pfad), "utf8");
  const kundenDetail = quelle("pages/KundenDetail.tsx");

  it("verschickt beim Ausfüllen des Datumsfelds keine Mail", () => {
    const start = kundenDetail.indexOf("const saveNotarField = async");
    const ende = kundenDetail.indexOf("const handleNotarSenden", start);
    expect(start).toBeGreaterThan(0);
    expect(ende).toBeGreaterThan(start);
    const rumpf = kundenDetail.slice(start, ende);
    expect(rumpf).not.toMatch(/notartermin(Mails|Freigabe)|sendeVorlagenMail|send-transactional-email/);
  });

  it("verschickt die Terminmails beim Klick auf Freigeben und merkt sich den Stand", () => {
    const start = kundenDetail.indexOf("freigebenNotarTerminPortal(inv.id, {");
    const ende = kundenDetail.indexOf("FREIGEBEN", start);
    expect(start).toBeGreaterThan(0);
    const rumpf = kundenDetail.slice(start, ende);
    expect(rumpf).toContain("notarterminFreigabeMails(");
    expect(rumpf).toContain("NOTAR_MAIL_STAND_FELD");
  });

  it("meldet die Bestätigung im Portal über den Helfer, also auch ans Büro", () => {
    const karte = quelle("components/kunde/NotarterminAuswahlCard.tsx");
    expect(karte).toContain("notarterminBestaetigungIntern(");
    expect(karte).not.toContain('templateName: "notartermin-bestaetigt"');
  });
});

describe("kundeKenntTerminSchon", () => {
  it("vergleicht nur das Datum", () => {
    expect(kundeKenntTerminSchon({ datum: "2026-10-15", bestaetigterTermin: { datum: "2026-10-15" } })).toBe(true);
    expect(kundeKenntTerminSchon({ datum: "2026-10-15", bestaetigterTermin: null })).toBe(false);
  });
});

describe("Vorlagen passen zu ihrem Einsatz", () => {
  const vorlage = (name: string) =>
    readFileSync(resolve(__dirname, `../../supabase/functions/_shared/transactional-email-templates/${name}.tsx`), "utf8");

  it("die Kundenvorlage spricht den Kunden in der Sie-Form an und ist nicht intern", () => {
    const quelle = vorlage("notartermin-geplant");
    // Die Anrede baut `foermlich` aus _anrede.ts: "Guten Tag …," bzw. "Dear Mr …,".
    expect(quelle).toContain("anrede={foermlich(kundeName, sprache, kundeAnrede)}");
    expect(quelle).toContain("Ihr Notartermin");
    expect(quelle).not.toMatch(/^\s*intern\s*$/m);
    expect(quelle).toContain("MailFelder['notartermin-geplant']");
  });

  it("die interne Vorlage bleibt intern und nutzt die gemeinsame Feldliste", () => {
    const quelle = vorlage("notartermin-benachrichtigung");
    expect(quelle).toMatch(/^\s*intern\s*$/m);
    expect(quelle).toContain("MailFelder['notartermin-benachrichtigung']");
  });

  it("beide Terminvorlagen kennen den Änderungshinweis, auch im Betreff", () => {
    for (const name of ["notartermin-geplant", "notartermin-benachrichtigung"]) {
      const quelle = vorlage(name);
      expect(quelle).toMatch(/geaendert\s*\?/);
      expect(quelle).toContain("data?.geaendert");
    }
  });

  it("die Bestätigungsmeldung bleibt intern und nutzt die gemeinsame Feldliste", () => {
    const quelle = vorlage("notartermin-bestaetigt");
    expect(quelle).toMatch(/^\s*intern\s*$/m);
    expect(quelle).toContain("MailFelder['notartermin-bestaetigt']");
  });
});
