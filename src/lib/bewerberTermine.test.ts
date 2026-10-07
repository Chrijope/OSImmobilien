import { describe, it, expect } from "vitest";
import {
  anstehendeTermine,
  closingGespraechTermin,
  deutscheTerminTeile,
  terminIstVergangen,
} from "./bewerberTermine";
import type { Bewerber } from "./bewerbungStore";

// Fester Bezugspunkt, damit die Tests nicht vom echten Datum abhängen.
// Als UTC-Zeitpunkt notiert, damit die Tests in jeder Zeitzone gleich laufen:
// 19.08.2026, 12:00 Uhr deutscher Sommerzeit ist 10:00 Uhr UTC.
const JETZT = new Date("2026-08-19T10:00:00Z");

function bewerber(patch: Partial<Bewerber>): Bewerber {
  return {
    id: patch.id || "b1",
    vorname: "Max", nachname: "Mustermann", email: "", telefon: "", ort: "", quelle: "",
    beworben: "", stelleId: "", stelleTitel: "", status: "Eingang", bewertung: 0,
    erstelltAm: "", typ: "", typLabel: "", typBeschreibung: "", typEignung: "", erfahrung: "",
    motivation: "", notizen: "", ziele: "", beschaeftigungsart: "", onboardingTerminId: "",
    lebenslaufUrl: "", dokumente: [], vertragStatus: "nicht_gesendet", vertragDatum: "",
    benachrichtigungen: [], chatVerknuepft: false,
    ausgangslage: "", zielBest: "", wieStarten: "", notizenLog: [], adresse: "",
    rechnungsAdresse: "", closingTerminDatum: "", closingTerminUhrzeit: "",
    erstgespraechSkript: {
      ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
      einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtAm: "", durchgefuehrtVon: "",
    },
    paketwahl: "", zahlungsweise: "", vertragPdfUrl: "", vertragSignedPdfUrl: "",
    vertragSignedAt: "", vertragHrName: "", vertragVersion: 0, rechnungNr: "",
    rechnungPdfUrl: "", rechnungErstelltAm: "", rechnungBezahltBestaetigungen: [],
    rechnungBezahltAm: "", userAccountId: "", userInviteSentAt: "", karriereStufe: "",
    onboardingChecklist: [], academyPflichtModule: [], aktivAm: "",
    geworbenVonUserId: "", geworbenVonName: "",
    ...patch,
  };
}

describe("anstehendeTermine", () => {
  it("liefert nur Termine ab heute, aufsteigend sortiert", () => {
    const liste = [
      bewerber({ id: "a", vorname: "Alt", erstgespraechDatum: "10.08.2026", erstgespraechUhrzeit: "09:00" }),
      bewerber({ id: "b", vorname: "Beate", closingTerminDatum: "21.08.2026", closingTerminUhrzeit: "14:00" }),
      bewerber({ id: "c", vorname: "Carl", erstgespraechDatum: "20.08.2026", erstgespraechUhrzeit: "10:00" }),
    ];
    const t = anstehendeTermine(liste, 5, JETZT);
    expect(t.map(x => x.bewerberId)).toEqual(["c", "b"]);
    expect(t[0].art).toBe("Erstgespräch");
    expect(t[1].art).toBe("Closing");
  });

  it("behält Termine von heute auch nach ihrer Uhrzeit", () => {
    const liste = [
      bewerber({ id: "a", erstgespraechDatum: "19.08.2026", erstgespraechUhrzeit: "08:00" }),
    ];
    const t = anstehendeTermine(liste, 5, JETZT);
    expect(t).toHaveLength(1);
  });

  it("berücksichtigt alle vier Terminarten eines Bewerbers", () => {
    const liste = [
      bewerber({
        id: "a",
        erstgespraechDatum: "20.08.2026", erstgespraechUhrzeit: "09:00",
        closingTerminDatum: "22.08.2026", closingTerminUhrzeit: "10:00",
        followUpDatum: "25.08.2026", followUpUhrzeit: "11:00",
        onboardingTerminDatum: "28.08.2026", onboardingTerminUhrzeit: "12:00",
      }),
    ];
    const t = anstehendeTermine(liste, 10, JETZT);
    expect(t.map(x => x.art)).toEqual(["Erstgespräch", "Closing", "Follow-Up", "Onboarding"]);
  });

  it("begrenzt auf die nächsten fünf Termine", () => {
    const liste = Array.from({ length: 8 }, (_, i) =>
      bewerber({ id: `b${i}`, erstgespraechDatum: `2${i}.08.2026`, erstgespraechUhrzeit: "09:00" }),
    );
    expect(anstehendeTermine(liste, 5, JETZT)).toHaveLength(5);
  });

  it("überspringt abgelehnte Bewerber und leere sowie unlesbare Daten", () => {
    const liste = [
      bewerber({ id: "a", status: "Abgelehnt", erstgespraechDatum: "20.08.2026", erstgespraechUhrzeit: "09:00" }),
      bewerber({ id: "b", status: "KeinInteresse", closingTerminDatum: "21.08.2026" }),
      bewerber({ id: "c", erstgespraechDatum: "irgendwann" }),
      bewerber({ id: "d" }),
    ];
    expect(anstehendeTermine(liste, 5, JETZT)).toHaveLength(0);
  });

  it("versteht auch ISO-Daten (JJJJ-MM-TT)", () => {
    const liste = [bewerber({ id: "a", followUpDatum: "2026-08-30", followUpUhrzeit: "" })];
    const t = anstehendeTermine(liste, 5, JETZT);
    expect(t).toHaveLength(1);
    expect(t[0].art).toBe("Follow-Up");
  });

  it("sortiert am selben Tag nach Uhrzeit", () => {
    const liste = [
      bewerber({ id: "spaet", erstgespraechDatum: "20.08.2026", erstgespraechUhrzeit: "15:00" }),
      bewerber({ id: "frueh", closingTerminDatum: "20.08.2026", closingTerminUhrzeit: "08:30" }),
    ];
    const t = anstehendeTermine(liste, 5, JETZT);
    expect(t.map(x => x.bewerberId)).toEqual(["frueh", "spaet"]);
  });
});

describe("terminIstVergangen", () => {
  // Der Fehlerfall aus dem Bewerbermanagement: 31.08.2026, 09:30 Uhr
  // deutscher Zeit (07:30 UTC), der Closing-Termin um 10:00 lag noch in der
  // Zukunft.
  const NEUN_UHR_DREISSIG = new Date("2026-08-31T07:30:00Z");

  it("Termin heute in 30 Minuten ist nicht vergangen", () => {
    expect(terminIstVergangen("31.08.2026", "10:00", NEUN_UHR_DREISSIG)).toBe(false);
  });

  it("Termin heute vor einer Stunde ist vergangen", () => {
    expect(terminIstVergangen("31.08.2026", "08:30", NEUN_UHR_DREISSIG)).toBe(true);
  });

  it("Termin ohne Uhrzeit heute ist nicht vergangen", () => {
    expect(terminIstVergangen("31.08.2026", undefined, NEUN_UHR_DREISSIG)).toBe(false);
    expect(terminIstVergangen("31.08.2026", "", NEUN_UHR_DREISSIG)).toBe(false);
  });

  it("Termin ohne Uhrzeit gestern ist vergangen", () => {
    expect(terminIstVergangen("30.08.2026", undefined, NEUN_UHR_DREISSIG)).toBe(true);
  });

  it("versteht auch ISO-Daten", () => {
    expect(terminIstVergangen("2026-08-31", "10:00", NEUN_UHR_DREISSIG)).toBe(false);
    expect(terminIstVergangen("2026-08-30", "10:00", NEUN_UHR_DREISSIG)).toBe(true);
  });

  it("unlesbare Uhrzeit zählt wie fehlende Uhrzeit", () => {
    expect(terminIstVergangen("31.08.2026", "irgendwann", NEUN_UHR_DREISSIG)).toBe(false);
    expect(terminIstVergangen("30.08.2026", "irgendwann", NEUN_UHR_DREISSIG)).toBe(true);
  });

  it("fehlendes oder unlesbares Datum ist nie vergangen", () => {
    expect(terminIstVergangen(undefined, "10:00", NEUN_UHR_DREISSIG)).toBe(false);
    expect(terminIstVergangen("bald", "10:00", NEUN_UHR_DREISSIG)).toBe(false);
  });
});

describe("terminIstVergangen rechnet in deutscher Zeit, nicht in der des Browsers", () => {
  // Der Fehlerfall aus Thailand: Die HR-Managerin sitzt sechs Stunden voraus.
  // Um 09:00 Uhr in Bangkok ist es in Deutschland erst 04:00 Uhr (02:00 UTC),
  // der Closing-Termin um 08:30 deutscher Zeit steht also noch bevor.
  const VIER_UHR_DEUTSCH = new Date("2026-09-03T02:00:00Z");

  it("Termin um 08:30 deutscher Zeit ist um 04:00 deutscher Zeit nicht vergangen", () => {
    expect(terminIstVergangen("03.09.2026", "08:30", VIER_UHR_DEUTSCH)).toBe(false);
  });

  it("derselbe Termin ist um 08:31 deutscher Zeit vergangen", () => {
    expect(terminIstVergangen("03.09.2026", "08:30", new Date("2026-09-03T06:31:00Z"))).toBe(true);
  });

  it("ohne Uhrzeit zählt der deutsche Tageswechsel, nicht der des Browsers", () => {
    // 23:30 Uhr deutscher Zeit am 03.09. ist in Bangkok schon der 04.09.
    expect(terminIstVergangen("03.09.2026", "", new Date("2026-09-03T21:30:00Z"))).toBe(false);
    // 00:00 Uhr deutscher Zeit am 04.09. (22:00 UTC am 03.09.)
    expect(terminIstVergangen("03.09.2026", "", new Date("2026-09-03T22:00:00Z"))).toBe(true);
  });

  it("gilt auch im Winter mit einer Stunde Versatz zu UTC", () => {
    // 10:00 Uhr deutscher Winterzeit ist 09:00 UTC.
    expect(terminIstVergangen("15.12.2026", "10:00", new Date("2026-12-15T08:59:00Z"))).toBe(false);
    expect(terminIstVergangen("15.12.2026", "10:00", new Date("2026-12-15T09:01:00Z"))).toBe(true);
  });

  it("anstehende Termine nehmen den deutschen Kalendertag als heute", () => {
    // 23:30 Uhr deutscher Zeit am 19.08.: In Bangkok ist bereits der 20.08.,
    // der Termin vom 19.08. muss trotzdem noch als heutiger Termin erscheinen.
    const spaet = new Date("2026-08-19T21:30:00Z");
    const liste = [bewerber({ id: "a", erstgespraechDatum: "19.08.2026", erstgespraechUhrzeit: "08:00" })];
    expect(anstehendeTermine(liste, 5, spaet)).toHaveLength(1);
  });
});

describe("closingGespraechTermin", () => {
  it("ohne jeden Termin bleibt alles leer", () => {
    const t = closingGespraechTermin(bewerber({}));
    expect(t).toEqual({ datum: "", uhrzeit: "", quelle: "", abgesagt: false });
  });

  it("nimmt den selbst gebuchten Termin, wenn im CRM keiner gepflegt ist", () => {
    // Genau der Fall Berat Kilapia: gebucht über die Einladungsmail, deshalb
    // steht der Termin nur in den Erstgespräch-Feldern.
    const t = closingGespraechTermin(bewerber({
      erstgespraechDatum: "2026-09-21",
      erstgespraechUhrzeit: "10:30",
    }));
    expect(t).toEqual({ datum: "2026-09-21", uhrzeit: "10:30", quelle: "selbstGebucht", abgesagt: false });
  });

  it("der im CRM gepflegte Termin hat Vorrang vor der Kopie in der Akte", () => {
    const t = closingGespraechTermin(bewerber({
      closingTerminDatum: "22.09.2026",
      closingTerminUhrzeit: "14:00",
      erstgespraechDatum: "2026-09-21",
      erstgespraechUhrzeit: "10:30",
    }));
    expect(t).toEqual({ datum: "22.09.2026", uhrzeit: "14:00", quelle: "closing", abgesagt: false });
  });

  it("ein Termin ohne Uhrzeit zählt trotzdem", () => {
    const t = closingGespraechTermin(bewerber({ erstgespraechDatum: "2026-09-21" }));
    expect(t).toEqual({ datum: "2026-09-21", uhrzeit: "", quelle: "selbstGebucht", abgesagt: false });
  });

  it("der gefundene Termin lässt sich auf vergangen prüfen", () => {
    const t = closingGespraechTermin(bewerber({
      erstgespraechDatum: "2026-08-18",
      erstgespraechUhrzeit: "09:00",
    }));
    expect(terminIstVergangen(t.datum, t.uhrzeit, JETZT)).toBe(true);
  });
});

describe("closingGespraechTermin liest die Buchung", () => {
  // 09:30 Uhr deutscher Sommerzeit ist 07:30 Uhr UTC.
  const OFFEN = { startAt: "2026-09-21T07:30:00.000Z", status: "offen" };

  it("zeigt den Termin, obwohl die Akte leer ist", () => {
    // Der Fall Berat Kilapia: Die Buchung steht, `meta` ist leer, weil ein
    // Speichern aus dem CRM sie überschrieben hat.
    const t = closingGespraechTermin(bewerber({}), OFFEN);
    expect(t).toEqual({ datum: "2026-09-21", uhrzeit: "09:30", quelle: "buchung", abgesagt: false });
  });

  it("die Buchung schlägt den von Hand gepflegten Termin", () => {
    const t = closingGespraechTermin(
      bewerber({ closingTerminDatum: "01.09.2026", closingTerminUhrzeit: "08:00" }),
      OFFEN,
    );
    expect(t.quelle).toBe("buchung");
    expect(t.datum).toBe("2026-09-21");
  });

  it("die Buchung schlägt auch die Kopie in der Akte", () => {
    const t = closingGespraechTermin(
      bewerber({ erstgespraechDatum: "2026-08-01", erstgespraechUhrzeit: "08:00" }),
      OFFEN,
    );
    expect(t.datum).toBe("2026-09-21");
  });

  it("ohne Buchung bleibt es beim bisherigen Weg", () => {
    const t = closingGespraechTermin(
      bewerber({ erstgespraechDatum: "2026-09-21", erstgespraechUhrzeit: "10:30" }),
      null,
    );
    expect(t.quelle).toBe("selbstGebucht");
  });

  it("eine unlesbare Startzeit erfindet keine Uhrzeit", () => {
    const t = closingGespraechTermin(bewerber({}), { startAt: "kaputt", status: "offen" });
    expect(t).toEqual({ datum: "", uhrzeit: "", quelle: "", abgesagt: false });
  });
});

describe("closingGespraechTermin und die Absage", () => {
  const ABGESAGT = { startAt: "2026-09-21T07:30:00.000Z", status: "abgesagt" };

  it("der abgesagte Termin bleibt sichtbar und ist als abgesagt gekennzeichnet", () => {
    // Die Absage räumt Datum und Uhrzeit in der Akte. Ohne die Buchungszeile
    // sähe der Bewerber aus wie einer, der nie gebucht hat.
    const t = closingGespraechTermin(bewerber({}), ABGESAGT);
    expect(t).toEqual({ datum: "2026-09-21", uhrzeit: "09:30", quelle: "buchung", abgesagt: true });
  });

  it("eine neue Buchung lässt das Abzeichen wieder verschwinden", () => {
    // Der Anschlussfall: abgesagt, dann neu gebucht. `ladeBewerberBuchungen`
    // liefert dann die stehende Buchung, und sie trägt kein Abzeichen.
    const neu = { startAt: "2026-09-28T08:00:00.000Z", status: "offen" };
    const t = closingGespraechTermin(bewerber({}), neu);
    expect(t.abgesagt).toBe(false);
    expect(t.datum).toBe("2026-09-28");
  });

  it("auch die Kopie in der Akte lässt das Abzeichen verschwinden", () => {
    // Doppelter Boden: Selbst wenn die abgesagte Zeile noch mitkäme, zeigt ein
    // frisch in die Akte geschriebener Termin, dass wieder einer steht.
    const t = closingGespraechTermin(
      bewerber({ closingTerminDatum: "28.09.2026", closingTerminUhrzeit: "10:00" }),
      ABGESAGT,
    );
    expect(t.abgesagt).toBe(false);
    expect(t.quelle).toBe("closing");
  });

  it("ein abgesagter Termin gilt nicht als vergangener Termin", () => {
    // Beide Kennzeichen nebeneinander sähen aus wie zwei Vorgänge. Die Anzeige
    // entscheidet sich für die Absage, hier nur die Grundlage dafür.
    const t = closingGespraechTermin(bewerber({}), ABGESAGT);
    expect(t.abgesagt).toBe(true);
    expect(terminIstVergangen(t.datum, t.uhrzeit, JETZT)).toBe(false);
  });
});

describe("deutscheTerminTeile", () => {
  it("rechnet in deutsche Sommerzeit um", () => {
    expect(deutscheTerminTeile("2026-09-21T07:30:00.000Z")).toEqual({ datum: "2026-09-21", uhrzeit: "09:30" });
  });

  it("rechnet im Winter mit einer Stunde Versatz", () => {
    expect(deutscheTerminTeile("2026-12-15T09:00:00.000Z")).toEqual({ datum: "2026-12-15", uhrzeit: "10:00" });
  });

  it("Mitternacht deutscher Zeit ist 00:00 und nicht 24:00", () => {
    // 22:00 UTC am 03.09. ist 00:00 deutscher Zeit am 04.09.
    expect(deutscheTerminTeile("2026-09-03T22:00:00.000Z")).toEqual({ datum: "2026-09-04", uhrzeit: "00:00" });
  });

  it("liefert nichts, wenn der Zeitpunkt fehlt oder unlesbar ist", () => {
    expect(deutscheTerminTeile("")).toEqual({ datum: "", uhrzeit: "" });
    expect(deutscheTerminTeile(null)).toEqual({ datum: "", uhrzeit: "" });
    expect(deutscheTerminTeile("kaputt")).toEqual({ datum: "", uhrzeit: "" });
  });

  it("das Ergebnis ist genau das Format, das die Anzeige erwartet", () => {
    const teile = deutscheTerminTeile("2026-08-18T07:00:00.000Z");
    expect(terminIstVergangen(teile.datum, teile.uhrzeit, JETZT)).toBe(true);
  });
});
