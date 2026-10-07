import { describe, it, expect } from "vitest";
import { vertragsKonditionenStempel, vertragsZusammenfassung } from "./vertragsZusammenfassung";
import { formatPreis } from "./lizenzPakete";
import { VERTRAGS_FASSUNG_ALT } from "./vertragKonditionen";
import type { Bewerber } from "./bewerbungStore";

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

/** Sucht die Zeile mit dem Label und liefert ihren Wert. */
function wert(zeilen: ReturnType<typeof vertragsZusammenfassung>, label: string): string | undefined {
  return zeilen?.find((z) => z.label === label)?.wert;
}

describe("vertragsZusammenfassung", () => {
  it("liefert null ohne (bekanntes) Paket", () => {
    expect(vertragsZusammenfassung(bewerber({}))).toBeNull();
    expect(vertragsZusammenfassung(bewerber({ paketwahl: "gibtsnicht" }))).toBeNull();
  });

  // Bis zum 06.09.2026 standen hier 150 Euro Servicevereinbarung und 12 Monate
  // Mindestlaufzeit. Seit dem 07.09.2026 wird alles gestellt.
  it("Standard-Vertriebspartner: alles gestellt, kein laufendes Entgelt, einheitlich 4 Prozent", () => {
    const z = vertragsZusammenfassung(bewerber({ paketwahl: "junior" }));
    expect(wert(z, "Paket")).toBe("Vertriebspartner");
    expect(wert(z, "Leistungen")).toMatch(/^Unentgeltlich gestellt: CRM, Objektzugänge/);
    expect(wert(z, "Leistungen")).toContain("Coaching und Vertriebsbegleitung");
    expect(wert(z, "Laufendes Entgelt")).toBe("Keines. Kein Einmalbetrag, keine Monatsgebühr, keine Mindestlaufzeit");
    expect(wert(z, "Laufzeit Vertrag")).toContain("§ 89 HGB");
    expect(z?.find((x) => x.label === "Servicevereinbarung")).toBeUndefined();
    expect(z?.find((x) => /Mindestlaufzeit/.test(x.label))).toBeUndefined();
    expect(wert(z, "Provision")).toBe("Einheitlich 4 %");
    expect(wert(z, "Leadpaket")).toBe("Kein Leadpaket, optional jederzeit buchbar");
    expect(wert(z, "Kontakte")).toBe(
      "Eigenkontakte bleiben Eigentum des Partners, auch nach Vertragsende; zugewiesene Leads und Gesellschaftskontakte bleiben Eigentum der Gesellschaft (§ 7)",
    );
    expect(wert(z, "Wettbewerbsverbot")).toBe("Nur während der Laufzeit (§ 8, exklusive Zusammenarbeit); nach Vertragsende keines, es gelten nur Daten- und Geheimnisschutz");
    expect(wert(z, "Unterschrift")).toBe("Nicht gesendet");
    // Vertriebspartner-Paket hat keinen Einmalbetrag.
    expect(wert(z, "Onboardinggebühr")).toBeUndefined();
    // Nichts individuell vereinbart, also keine Markierung.
    expect(z?.some((x) => x.individuell)).toBe(false);
  });

  it("die Altwerte ohneCrmGebuehr und laufzeitOffen ändern die Anzeige nicht mehr", () => {
    // Bis zum 06.09.2026 markierten die beiden Schalter "Nicht gebucht" und
    // "Keine Mindestlaufzeit" als individuell. Seit dem 07.09.2026 gibt es
    // weder Gebühr noch Mindestlaufzeit, also auch nichts zu markieren.
    const z = vertragsZusammenfassung(
      bewerber({ paketwahl: "junior", ohneCrmGebuehr: true, laufzeitOffen: true }),
    );
    expect(z).toEqual(vertragsZusammenfassung(bewerber({ paketwahl: "junior" })));
    expect(z?.some((x) => x.individuell)).toBe(false);
  });

  it("die Altwerte bleiben im Stempel, damit bereits erzeugte Verträge gültig bleiben", () => {
    const z = vertragsZusammenfassung(bewerber({ paketwahl: "junior", ohneCrmGebuehr: true }));
    expect(z?.find((x) => /Mindestlaufzeit/.test(x.label))).toBeUndefined();
    // Der Stempel ist derselbe wie mit beiden Schaltern, weil im Vertrag
    // dasselbe steht; er weicht vom Standardvertrag ab.
    expect(vertragsKonditionenStempel(bewerber({ paketwahl: "junior", ohneCrmGebuehr: true })))
      .toBe(vertragsKonditionenStempel(bewerber({ paketwahl: "junior", ohneCrmGebuehr: true, laufzeitOffen: true })));
    expect(vertragsKonditionenStempel(bewerber({ paketwahl: "junior", ohneCrmGebuehr: true })))
      .not.toBe(vertragsKonditionenStempel(bewerber({ paketwahl: "junior" })));
  });

  it("individuelle Sätze und Leadpaket: derselbe Satztext wie im Vertrag, Anlage 3 genannt", () => {
    const z = vertragsZusammenfassung(
      bewerber({
        paketwahl: "junior",
        satzLead: "3",
        satzEigen: "5",
        leadPaket: { betrag: 2500, anzahl: 20 },
      }),
    );
    // Wortgleich mit provisionsSaetze() aus vertragKlauseln.ts (§ 8 (1a)).
    expect(wert(z, "Provision")).toBe(
      "Lead-Satz 3% (bei über MOREImmo zugewiesenen Leads) · Eigen-Satz 5% (bei eigenem Netzwerk / eigenen Kontakten)",
    );
    expect(z?.find((x) => x.label === "Provision")?.individuell).toBe(true);
    // Seit Fassung 2026-09-29 mit Paketpreis, Einsatz und Nachlieferung.
    expect(wert(z, "Leadpaket")).toBe(
      `${formatPreis(2500)} netto Paketpreis für 20 qualifizierte Leads; die Gesellschaft setzt den Paketpreis innerhalb eines Monats ab Zahlungseingang, frühestens ab Freischaltung des CRM-Zugangs, für ihre Werbemaßnahmen ein, weist die Leads nach Eingang zu und liefert fehlende nach; nicht gelieferte Leads werden bei Vertragsende anteilig erstattet; Einzelheiten in Anlage 3.`,
    );
  });

  it("Altfassung (gesendeter Vertrag ohne Kennzeichen): Anlage 9, § 9a und § 10 wie im langen Text", () => {
    const z = vertragsZusammenfassung(
      bewerber({ paketwahl: "junior", vertragStatus: "gesendet", leadPaket: { betrag: 2500, anzahl: 20 } }),
    );
    expect(wert(z, "Leadpaket")).toBe(
      `${formatPreis(2500)} netto für 20 qualifizierte Leads vereinbart, Einzelheiten in Anlage 9`,
    );
    expect(wert(z, "Kontakte")).toContain("(§ 9a)");
    expect(wert(z, "Wettbewerbsverbot")).toContain("(§ 10,");
  });

  it("Lead-Berater: Leads-Zeile statt Leadpaket-Zeile, Schalter wie beim Vertriebspartner", () => {
    const z = vertragsZusammenfassung(bewerber({ paketwahl: "lead_berater" }));
    expect(wert(z, "Paket")).toBe("Lead-Berater");
    expect(wert(z, "Laufendes Entgelt")).toBe("Keines. Kein Einmalbetrag, keine Monatsgebühr, keine Mindestlaufzeit");
    expect(z?.find((x) => x.label === "Servicevereinbarung")).toBeUndefined();
    expect(wert(z, "Provision")).toBe("Einheitlich 4 %");
    expect(wert(z, "Leads")).toBe(
      "Leads werden zur Unterstützung gestellt, keine definierte Stückzahl, kein Anspruch auf eine bestimmte Menge",
    );
    expect(wert(z, "Leadpaket")).toBeUndefined();

    // Die Altwerte der früheren Schalter wirken auch hier nicht mehr.
    const zOhne = vertragsZusammenfassung(
      bewerber({ paketwahl: "lead_berater", ohneCrmGebuehr: true, laufzeitOffen: true }),
    );
    expect(zOhne).toEqual(z);
  });

  it("Individualfassung § 8 nennt die erklärten anderen Vertriebe", () => {
    const z = vertragsZusammenfassung(
      bewerber({
        paketwahl: "junior",
        individuelleVertragsFassung: true,
        andereVertriebe: "Vertrieb A\nVertrieb B\n",
      }),
    );
    expect(wert(z, "Wettbewerbsverbot")).toBe(
      "Gelockert: Individualfassung § 8, kein Wettbewerbsverbot; Eigentums-, Daten- und Geheimnisschutz gilt unverändert · Erklärte andere Vertriebe: Vertrieb A, Vertrieb B",
    );
    expect(z?.find((x) => x.label === "Wettbewerbsverbot")?.individuell).toBe(true);
  });

  it("Bestandspaket mit Einmalbetrag zeigt Onboardinggebühr und Zahlungsweise", () => {
    const z = vertragsZusammenfassung(
      bewerber({ paketwahl: "lead", zahlungsweise: "raten_2" }),
    );
    expect(wert(z, "Onboardinggebühr")).toBe(`${formatPreis(5000)} netto · 2 Raten`);
  });

  it("Tippgeber: keine Gebühren, Vergütung aus dem hinterlegten Modell", () => {
    const z = vertragsZusammenfassung(
      bewerber({
        paketwahl: "tippgeber",
        tippgeberProvisionsModell: "euro",
        tippgeberProvisionsBetrag: "500",
      }),
    );
    expect(wert(z, "Paket")).toBe("Tippgeber");
    expect(wert(z, "Laufendes Entgelt")).toBe("Keines. Kein Einmalbetrag, keine Monatsgebühr, keine Mindestlaufzeit");
    expect(wert(z, "Leistungen")).toBeUndefined();
    expect(wert(z, "Vergütung")).toBe(`${formatPreis(500)} pro vermitteltem Abschluss`);
    expect(wert(z, "Leadpaket")).toBeUndefined();
    expect(wert(z, "Kontakte")).toBeUndefined();
    expect(wert(z, "Wettbewerbsverbot")).toBeUndefined();
  });

  it("Konditionen-Stempel ändert sich mit den Sätzen und Schaltern, sonst nicht", () => {
    const basis = bewerber({ paketwahl: "junior" });
    expect(vertragsKonditionenStempel(basis)).toBe(vertragsKonditionenStempel(bewerber({ paketwahl: "junior" })));
    expect(vertragsKonditionenStempel(bewerber({ paketwahl: "junior", satzLead: "3", satzEigen: "5" })))
      .not.toBe(vertragsKonditionenStempel(basis));
    expect(vertragsKonditionenStempel(bewerber({ paketwahl: "junior", laufzeitOffen: true })))
      .not.toBe(vertragsKonditionenStempel(basis));
    // Unerhebliches (z. B. Notizen) ändert den Stempel nicht.
    expect(vertragsKonditionenStempel(bewerber({ paketwahl: "junior", notizen: "x" })))
      .toBe(vertragsKonditionenStempel(basis));
  });

  it("Konditionen-Stempel: die Tippgeber-Vergütung zählt nur beim Tippgeber, andere Stempel bleiben unverändert", () => {
    const tippgeber = bewerber({ paketwahl: "tippgeber", tippgeberProvisionsModell: "euro", tippgeberProvisionsBetrag: "500" });
    expect(vertragsKonditionenStempel(bewerber({ ...tippgeber, tippgeberProvisionsBetrag: "750" })))
      .not.toBe(vertragsKonditionenStempel(tippgeber));
    expect(vertragsKonditionenStempel(bewerber({ ...tippgeber, tippgeberProvisionsModell: "prozent" })))
      .not.toBe(vertragsKonditionenStempel(tippgeber));
    expect(JSON.parse(vertragsKonditionenStempel(tippgeber)).tippgeber).toEqual(["euro", "500"]);
    // Beim Vertriebspartner steht der Schlüssel nicht im Stempel, alte Stempel gelten weiter.
    const partner = vertragsKonditionenStempel(bewerber({ paketwahl: "junior", tippgeberProvisionsBetrag: "500" }));
    expect(JSON.parse(partner)).not.toHaveProperty("tippgeber");
    expect(partner).toBe(vertragsKonditionenStempel(bewerber({ paketwahl: "junior" })));
  });

  it("unterschriebener Vertrag zeigt Status samt Datum", () => {
    const z = vertragsZusammenfassung(
      bewerber({
        paketwahl: "junior",
        vertragStatus: "unterschrieben",
        vertragSignedAt: "2026-08-15T10:30:00.000Z",
      }),
    );
    expect(wert(z, "Unterschrift")).toBe("Unterschrieben am 15.8.2026");
  });
});

describe("Bestandspartner der Altfassung sehen ihren eigenen Vertrag", () => {
  it("nennt die CRM-Systemgebühr, nicht die Servicevereinbarung", () => {
    // Wer die lange Fassung unterschrieben hat, zahlt eine CRM-Systemgebühr.
    // Seine Zusammenfassung muss das sagen, sonst zeigt das CRM ihm einen
    // Vertrag an, den er nie geschlossen hat.
    const alt = vertragsZusammenfassung(bewerber({
      paketwahl: "junior",
      vertragFassung: VERTRAGS_FASSUNG_ALT,
    } as Partial<Bewerber>));
    expect(wert(alt, "CRM-Systemgebühr")).toBe(`${formatPreis(150)} brutto/Monat`);
    expect(alt?.find((z) => z.label === "Servicevereinbarung")).toBeUndefined();
    expect(alt?.find((z) => z.label === "Leistungen")).toBeUndefined();
    expect(alt?.find((z) => z.label === "Laufendes Entgelt")).toBeUndefined();
    expect(wert(alt, "Mindestlaufzeit")).toBe("12 Monate, danach monatlich kündbar");
    expect(alt?.find((z) => z.label === "Laufzeit Vertrag")).toBeUndefined();
  });

  it("die kompakte Fassung zeigt dagegen nur gestellte Leistungen und kein Entgelt", () => {
    const neu = vertragsZusammenfassung(bewerber({ paketwahl: "junior" }));
    expect(wert(neu, "Leistungen")).toContain("(§ 3 Absatz 1, § 86a HGB)");
    expect(wert(neu, "Laufendes Entgelt")).toMatch(/^Keines/);
    expect(neu?.find((z) => z.label === "CRM-Systemgebühr")).toBeUndefined();
    expect(JSON.stringify(neu)).not.toMatch(/Servicevereinbarung|150/);
  });
});
