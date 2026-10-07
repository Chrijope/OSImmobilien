import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prueft, dass die Meeting-Einladung je nach Weg (Videoraum, vor Ort,
 * Telefon) die richtigen Angaben an die Mail-Vorlage uebergibt. Die
 * Formulierungen selbst liegen in der Edge-Function-Vorlage, hier geht es
 * darum, dass Modus, Treffpunkt, Telefonnummer, Dauer und Kalender-Ort
 * korrekt ankommen. Genau diese Uebergabe war die Luecke, als die Einladung
 * immer mit 60 Minuten und "Online" rechnete.
 */

const invokeMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));
/**
 * Die Nutzerliste ist veraenderbar, damit einzelne Tests einen zweiten
 * gleichnamigen Nutzer einsetzen oder die Liste leeren koennen.
 */
const nutzerliste: Array<Record<string, unknown>> = [];
const STANDARD_NUTZER = {
  id: "u-1",
  name: "Christian Peetz",
  rollen: ["vertriebspartner"],
  email: "c.peetz@more.immo",
  telefon: "+49 1515 0275108",
  bildUrl:
    "https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/avatars/u-1/avatar.jpg?t=1",
};
vi.mock("./loadAllUsers", () => ({ loadAllUsers: () => nutzerliste }));

/** Der Verlaufseintrag, den ein nicht gefundener Berater ausloest. */
const verlaufMock = vi.fn();
vi.mock("./aktivitaetenStore", () => ({ addAktivitaet: (e: unknown) => verlaufMock(e) }));

import { versendeMeetingEinladung, versendeGastEinladungen } from "./meetingEinladung";

const basis = {
  kundeId: "k-1",
  kundeName: "Otto Hans",
  kundeEmail: "otto@example.com",
  berater: "Christian Peetz",
  titel: "Beratungsgespräch",
  datum: "2026-09-02",
  uhrzeit: "14:00",
};

function letzterAufruf() {
  const [, options] = invokeMock.mock.calls.at(-1) as [string, { body: Record<string, any> }];
  return options.body;
}

beforeEach(() => {
  invokeMock.mockClear();
  verlaufMock.mockClear();
  nutzerliste.splice(0, nutzerliste.length, { ...STANDARD_NUTZER });
});

describe("versendeMeetingEinladung", () => {
  beforeEach(() => invokeMock.mockClear());

  it("übergibt beim Videoraum Modus, Link und Ereignis-Dauer", async () => {
    const ok = await versendeMeetingEinladung({
      ...basis,
      meetingLink: "https://crm.more.immo/raum/abc",
      dauerMinuten: 90,
      modus: "video",
    });
    expect(ok).toBe(true);
    const body = letzterAufruf();
    expect(body.templateName).toBe("zoom-meeting-einladung");
    expect(body.templateData.terminModus).toBe("video");
    expect(body.templateData.zoomJoinUrl).toBe("https://crm.more.immo/raum/abc");
    expect(body.templateData.terminDauer).toBe(90);
    // Kalenderdateien tragen den Link als Ort.
    expect(body.templateData.icsUrl).toContain(encodeURIComponent("https://crm.more.immo/raum/abc"));
  });

  it("übergibt beim Treffen vor Ort den Treffpunkt als Kalender-Ort", async () => {
    await versendeMeetingEinladung({
      ...basis,
      modus: "vor_ort",
      treffpunkt: "Wendelsteinstraße 19, 83075 Bad Feilnbach",
    });
    const body = letzterAufruf();
    expect(body.templateData.terminModus).toBe("vor_ort");
    expect(body.templateData.treffpunkt).toBe("Wendelsteinstraße 19, 83075 Bad Feilnbach");
    expect(body.templateData.zoomJoinUrl).toBeUndefined();
    expect(body.templateData.icsUrl).toContain(encodeURIComponent("Wendelsteinstraße 19, 83075 Bad Feilnbach"));
    expect(body.templateData.googleCalendarUrl).toContain(encodeURIComponent("Wendelsteinstraße 19, 83075 Bad Feilnbach"));
  });

  it("übergibt beim Telefontermin die Kundennummer und keinen Link", async () => {
    await versendeMeetingEinladung({
      ...basis,
      modus: "telefon",
      kundeTelefon: "+49 170 1234567",
    });
    const body = letzterAufruf();
    expect(body.templateData.terminModus).toBe("telefon");
    expect(body.templateData.kundeTelefon).toBe("+49 170 1234567");
    expect(body.templateData.zoomJoinUrl).toBeUndefined();
    expect(body.templateData.icsUrl).toContain(encodeURIComponent("Telefontermin"));
  });

  it("reicht ohne Modus den Link unverändert an die Vorlage", async () => {
    await versendeMeetingEinladung({
      ...basis,
      meetingLink: "https://crm.more.immo/raum/xyz",
      dauerMinuten: 60,
    });
    const body = letzterAufruf();
    expect(body.templateData.terminModus).toBeUndefined();
    expect(body.templateData.zoomJoinUrl).toBe("https://crm.more.immo/raum/xyz");
  });

  it("verhindert Doppelversand über denselben Idempotenzschlüssel", async () => {
    await versendeMeetingEinladung({ ...basis, modus: "telefon" });
    await versendeMeetingEinladung({ ...basis, modus: "telefon" });
    const [erster, zweiter] = invokeMock.mock.calls.slice(-2).map(
      ([, o]: [string, { body: Record<string, any> }]) => o.body.idempotencyKey,
    );
    expect(erster).toBe("meeting-k-1-2026-09-02-14:00");
    expect(zweiter).toBe(erster);
  });

  it("meldet false ohne Kundenadresse und versendet nichts", async () => {
    const ok = await versendeMeetingEinladung({ ...basis, kundeEmail: "" });
    expect(ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("versendeGastEinladungen", () => {
  beforeEach(() => invokeMock.mockClear());

  const gastBasis = {
    kundeId: "k-1",
    berater: "Christian Peetz",
    titel: "Beratungsgespräch",
    datum: "2026-09-02",
    uhrzeit: "14:00",
    modus: "video" as const,
    meetingLink: "https://crm.more.immo/raum/abc",
  };

  it("versendet je Gast eine eigene Mail mit persönlicher Anrede und eigenem Schlüssel", async () => {
    const ergebnis = await versendeGastEinladungen(
      [
        { name: "Anna Hans", email: "anna@example.com" },
        { name: "", email: "steuer@example.com" },
      ],
      gastBasis,
    );
    expect(ergebnis.gesendet).toHaveLength(2);
    expect(ergebnis.fehlgeschlagen).toHaveLength(0);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    const koerper = invokeMock.mock.calls.map(
      ([, o]: [string, { body: Record<string, any> }]) => o.body,
    );
    expect(koerper[0].templateData.kundeName).toBe("Anna Hans");
    expect(koerper[0].recipientEmail).toBe("anna@example.com");
    // Ohne Namen wird die Adresse zur Anrede, nie ein leerer Gruß.
    expect(koerper[1].templateData.kundeName).toBe("steuer@example.com");
    // Jeder Gast hat seinen eigenen Doppelversand-Schutz.
    expect(koerper[0].idempotencyKey).not.toBe(koerper[1].idempotencyKey);
    expect(koerper[0].idempotencyKey).toContain("gast-anna@example.com");
  });

  it("überspringt Zeilen ohne E-Mail-Adresse", async () => {
    const ergebnis = await versendeGastEinladungen(
      [{ name: "Ohne Mail", email: "  " }],
      gastBasis,
    );
    expect(ergebnis.gesendet).toHaveLength(0);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("meldet gescheiterte Gäste einzeln zurück", async () => {
    invokeMock.mockResolvedValueOnce({ error: null });
    invokeMock.mockResolvedValueOnce({ error: new Error("kaputt") });
    const ergebnis = await versendeGastEinladungen(
      [
        { name: "A", email: "a@example.com" },
        { name: "B", email: "b@example.com" },
      ],
      gastBasis,
    );
    expect(ergebnis.gesendet.map((g) => g.email)).toEqual(["a@example.com"]);
    expect(ergebnis.fehlgeschlagen.map((g) => g.email)).toEqual(["b@example.com"]);
  });
});


it("meldet unterdrückte E-Mails nicht als versendet", async () => {
  invokeMock.mockResolvedValueOnce({error:null,data:{success:false,reason:"email_suppressed"}});
  expect(await versendeMeetingEinladung(basis)).toBe(false);
});

/**
 * Wie der Berater gefunden wird, der unter der Mail steht.
 *
 * Der Namensvergleich war der eigentliche Fehler: Fand er nichts, blieben
 * Adresse, Bezeichnung und Bild leer, und die Vorlage unterschrieb mit der
 * allgemeinen Firmenadresse. Aufgefallen ist es erst, als in einer Einladung
 * "Ansprechpartner bei MOREImmo" und office@more.immo standen.
 */
describe("Berater in der Einladung", () => {
  it("findet den Berater über die Kennung, auch wenn der Name abweicht", async () => {
    await versendeMeetingEinladung({ ...basis, berater: "Christian Peez", beraterId: "u-1" });
    const daten = letzterAufruf().templateData;
    expect(daten.beraterUserId).toBe("u-1");
    expect(daten.beraterName).toBe("Christian Peetz");
    expect(daten.beraterEmail).toBe("c.peetz@more.immo");
    expect(daten.beraterPosition).toBe("Immobilienberater");
    expect(daten.berater.bildUrl).toContain("/avatars/u-1/avatar.jpg");
    expect(verlaufMock).not.toHaveBeenCalled();
  });

  it("findet den Berater ohne Kennung auch bei abweichender Schreibweise", async () => {
    await versendeMeetingEinladung({ ...basis, berater: "  christian peetz " });
    const daten = letzterAufruf().templateData;
    expect(daten.beraterUserId).toBe("u-1");
    expect(daten.beraterName).toBe("Christian Peetz");
    expect(daten.beraterTelefon).toBe("+49 1515 0275108");
    expect(daten.berater.rolle).toBe("Immobilienberater");
  });

  it("übergibt Bild und Bezeichnung im verschachtelten Feld, damit die Edge Function das Bild signiert", async () => {
    await versendeMeetingEinladung({ ...basis, beraterId: "u-1" });
    const daten = letzterAufruf().templateData;
    expect(daten.berater).toEqual({
      name: "Christian Peetz",
      rolle: "Immobilienberater",
      telefon: "+49 1515 0275108",
      email: "c.peetz@more.immo",
      bildUrl: STANDARD_NUTZER.bildUrl,
    });
    // Flach darf die Bildadresse nicht reisen: dort bliebe sie ungezeichnet.
    expect(daten.beraterBild).toBeUndefined();
  });

  it("bleibt nicht still, wenn der Berater nicht gefunden wird", async () => {
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => {});
    await versendeMeetingEinladung({
      ...basis,
      kundeId: "k-ohne-berater",
      berater: "Hermann Vogel",
    });
    const daten = letzterAufruf().templateData;
    expect(daten.beraterEmail).toBe("");
    expect(daten.berater).toBeUndefined();
    expect(warnung).toHaveBeenCalled();
    // Der Verlaufseintrag wird nachgeladen, deshalb einen Durchlauf warten.
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(verlaufMock).toHaveBeenCalledTimes(1);
    expect(verlaufMock.mock.calls[0][0]).toMatchObject({
      kundeId: "k-ohne-berater",
      art: "email",
      beschreibung: "Einladung ohne Beraterangaben verschickt",
    });
    warnung.mockRestore();
  });

  it("greift bei zwei gleichnamigen Nutzern lieber nicht daneben", async () => {
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => {});
    nutzerliste.push({ ...STANDARD_NUTZER, id: "u-2", email: "zweiter@more.immo" });
    await versendeMeetingEinladung({ ...basis, kundeId: "k-doppelt" });
    const daten = letzterAufruf().templateData;
    expect(daten.beraterEmail).toBe("");
    expect(daten.berater).toBeUndefined();
    expect(warnung).toHaveBeenCalled();
    warnung.mockRestore();
  });
});
