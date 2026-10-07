import { describe, it, expect } from "vitest";
import {
  CLOSING_DIREKT_ABSCHNITTE,
  DIREKT_PAKETE,
  DIREKT_FALL_KAUFPREIS_EUR,
  DIREKT_FALL_PROVISION_EUR,
  DIREKT_JAHR_PROVISION_EUR,
  LEAD_QUALIFIZIERUNG_BUCHUNGSLINK,
  baueClosingDirektKiDaten,
  closingDirektStatusSprung,
  followUpStatusZiel,
  getClosingDirektAbschnitt,
  istClosingDirektAktiv,
  istClosingDirektErledigt,
  istClosingDirektKomplett,
  passendeAbschlussVarianten,
  type ClosingDirektVariante,
} from "./closingDirektSkript";
import { PROVISION_PROZENT, BEISPIEL_PROVISION_EUR } from "./assessmentSkript";
import {
  GESTELLT_ZUSATZ_KURZ, LEAD_PAKET_PREIS, LEAD_PAKET_ANZAHL, LEAD_EINZELPREIS,
} from "./lizenzPakete";

const fmt = (n: number) => n.toLocaleString("de-DE");

/** Alle Texte eines Abschnitts (Sprechtexte, Varianten, Hinweis, Felder). */
const alleTexte = (key: string): string => {
  const a = getClosingDirektAbschnitt(key);
  if (!a) return "";
  return [
    ...a.sprechtexte,
    ...(a.varianten ?? []).flatMap((v) => [v.titel, v.sprechtext]),
    a.hinweis ?? "",
    ...(a.einwaende ?? []).flatMap((e) => [e.einwand, e.antwort]),
    ...(a.felder ?? []).flatMap((f) => [f.label, f.placeholder ?? ""]),
  ].join(" ");
};

const gesamtText = CLOSING_DIREKT_ABSCHNITTE.map((a) => alleTexte(a.key)).join(" ");

describe("closingDirektSkript: Schalter", () => {
  it("ist standardmäßig AUS, nur ein ausdrückliches true schaltet ein", () => {
    expect(istClosingDirektAktiv(undefined)).toBe(false);
    expect(istClosingDirektAktiv(null)).toBe(false);
    expect(istClosingDirektAktiv({})).toBe(false);
    expect(istClosingDirektAktiv({ aktiv: false })).toBe(false);
    expect(istClosingDirektAktiv({ aktiv: true })).toBe(true);
  });
});

describe("closingDirektSkript: Abschnitte folgen der Präsentation Folie für Folie", () => {
  it("deckt die 15 sichtbaren Folien in der Reihenfolge des Decks ab, plus den Gesprächsabschluss", () => {
    // Die Folie "zahlen" fehlt bewusst: Sie erscheint auch im Deck nur mit
    // gepflegten Kennzahlen (closingPraesentationZahlen.ts), und dort ist
    // nichts gepflegt. Der Gesprächsabschluss gehört fachlich noch zur
    // Abschluss-Folie (Willkommensmoment), deshalb dieselbe folieId.
    expect(CLOSING_DIREKT_ABSCHNITTE.map((a) => a.folieId)).toEqual([
      "cover",
      "chaos",
      "vision",
      "werte",
      "system",
      "objekte-standorte",
      "dealprozess",
      "partnerstimmen",
      "echter-fall",
      "rechner",
      "zwei-wege",
      "preis",
      "selbstcheck",
      "start",
      "abschluss",
      "abschluss",
    ]);
  });

  it("jeder Abschnitt hat ausformulierte Sprechtexte, keine Stichpunkte", () => {
    for (const a of CLOSING_DIREKT_ABSCHNITTE) {
      const texte = [...a.sprechtexte, ...(a.varianten ?? []).map((v) => v.sprechtext)];
      expect(texte.length).toBeGreaterThan(0);
      for (const t of texte) {
        // Ausformulierte wörtliche Rede ist deutlich länger als ein Stichpunkt.
        expect(t.length).toBeGreaterThan(120);
      }
    }
  });

  it("der Gesprächsabschluss steht als letzter Abschnitt mit Varianten für Ja, Unterlagen, Bedenkzeit und Nein", () => {
    const a = CLOSING_DIREKT_ABSCHNITTE[CLOSING_DIREKT_ABSCHNITTE.length - 1];
    expect(a.key).toBe("gespraechsabschluss");
    expect(a.spezial).toBe("gespraechsabschluss");
    expect((a.varianten ?? []).map((v) => v.key)).toEqual(["ja", "unterlagen", "bedenkzeit", "nein"]);
    // Die Ja-Variante leitet ehrlich auf Vertragserstellung und Mail-Versand über.
    const ja = a.varianten!.find((v) => v.key === "ja")!;
    expect(ja.sprechtext).toContain("sende ihn dir per Mail");
    expect(ja.sprechtext).toContain("unterschreibst digital");
    expect(ja.sprechtext).toContain("Onboarding");
    // Die Unterlagen-Variante kündigt die Zusammenfassung an und bindet an den Rückruf.
    const unterlagen = a.varianten!.find((v) => v.key === "unterlagen")!;
    expect(unterlagen.sprechtext).toContain("Startfahrplan");
    expect(unterlagen.sprechtext).toContain("Telefontermin fest vereinbart");
    // Die Bedenkzeit-Variante bindet an den festen Rückruftermin.
    expect(a.varianten!.find((v) => v.key === "bedenkzeit")!.sprechtext).toContain("Rückruftermin");
    expect((a.felder ?? []).map((f) => f.key)).toContain("abschlussNotiz");
  });

  it("der Direktvorschlag spricht nicht mehr vom persönlichen Gespräch", () => {
    const text = alleTexte("einstieg");
    expect(text).not.toContain("Persönliches Gespräch");
    expect(text).toContain("im Detail und in der Tiefe miteinander durch");
    expect(text).toContain("wie die Reise bei uns weitergeht");
  });

  it("der Rechner fragt nur noch nach dem Abschlusstempo, der Kaufpreis ist ein begründeter Beispielwert", () => {
    const a = getClosingDirektAbschnitt("rechner")!;
    // Kein Erfassungsfeld mehr für den Kaufpreis.
    expect((a.felder ?? []).map((f) => f.key)).not.toContain("rechnerKaufpreis");
    expect((a.felder ?? []).map((f) => f.key)).toContain("rechnerAbschluesse");
    const text = alleTexte("rechner");
    expect(text).not.toContain("mit welchem durchschnittlichen Kaufpreis");
    expect(text).toContain("Bonität deines Kunden");
    expect(text).toContain("Beispielwert");
  });

  it("der Leadkauf steht jedem Partner offen, ohne Qualifizierungs-Hürde im Sprechtext", () => {
    // Die alte strenge Formulierung (Königsdisziplin, vorbehalten, erst
    // beweisen) ist raus: Jeder Partner kann Leads kaufen, ohne Call.
    const wege = alleTexte("zweiWege");
    expect(wege).not.toContain("Königsdisziplin");
    expect(wege).not.toContain("vorbehalten");
    expect(wege).not.toContain("beweist sich zuerst intern");
    expect(wege).toContain("jederzeit qualifizierte Leads dazukaufen");
    const preis = alleTexte("preis");
    expect(preis).not.toContain("Königsdisziplin");
    expect(preis).toContain("Jeder Partner kann bei uns Leads kaufen");
    expect(preis).toContain("optionalen Beschleuniger");
    // Der Sprechtext an den Bewerber macht den Kauf nicht mehr von einem
    // Folge-Call abhängig.
    const preisSprechtexte = getClosingDirektAbschnitt("preis")!.sprechtexte.join(" ");
    expect(preisSprechtexte).not.toContain("Folge-Call");
  });

  it("der Folge-Call steht als Regie-Hinweis für gestellte Leads nach Abstimmung mit dem Geschäftsführer", () => {
    const preis = getClosingDirektAbschnitt("preis")!;
    expect(preis.hinweis).toContain("keinen Call und keine Freigabe");
    expect(preis.hinweis).toContain("Ermessenssache");
    expect(preis.hinweis).toContain("Folge-Call bei Geschäftsführer Christian");
    expect(preis.hinweis).toContain("Leads gestellt bekommt, ohne dafür zu zahlen");
    const wege = getClosingDirektAbschnitt("zweiWege")!;
    expect(wege.hinweis).toContain("Leads gestellt bekommt, ohne dafür zu zahlen");
    const abschluss = getClosingDirektAbschnitt("gespraechsabschluss")!;
    expect(abschluss.hinweis).toContain("Folge-Call bei Christian");
    expect(abschluss.hinweis).toContain("Leads gestellt bekommt, ohne dafür zu zahlen");
  });

  it("der Startfahrplan-Abschnitt ist weicher formuliert und trägt die Weiche", () => {
    const a = getClosingDirektAbschnitt("start")!;
    expect(a.spezial).toBe("startWeiche");
    const text = alleTexte("start");
    expect(text).not.toContain("Heute triffst du deine Entscheidung");
    expect(text).toContain("Zusammenfassung von allem, was wir gemeinsam besprochen haben");
  });

  it("jeder Abschnitt hat Erfassungsfelder oder einen Spezialblock", () => {
    for (const a of CLOSING_DIREKT_ABSCHNITTE) {
      expect((a.felder ?? []).length > 0 || !!a.spezial).toBe(true);
    }
  });

  it("Paketwahl liegt an der Preisfolie, die Entscheidung an der Abschlussfolie", () => {
    expect(getClosingDirektAbschnitt("preis")?.spezial).toBe("paketwahl");
    expect(getClosingDirektAbschnitt("entscheidung")?.spezial).toBe("entscheidung");
  });

  it("die Erwartungsfolie erfasst seine Ziele in seinen Worten", () => {
    const felder = (getClosingDirektAbschnitt("erwartungen")?.felder ?? []).map((f) => f.key);
    expect(felder).toContain("erwartungenZiele");
  });
});

describe("closingDirektSkript: ehrliche Zahlen aus den Konstanten", () => {
  it("nennt den einheitlichen Satz für beide Wege", () => {
    expect(alleTexte("zweiWege")).toContain(`${PROVISION_PROZENT} Prozent auf jeden Abschluss`);
    expect(alleTexte("zweiWege")).toContain("beide Wege derselbe Satz");
  });

  it("der echte Fall rechnet mit abgeleiteten Beträgen", () => {
    expect(DIREKT_FALL_PROVISION_EUR).toBe(Math.round((DIREKT_FALL_KAUFPREIS_EUR * PROVISION_PROZENT) / 100));
    expect(alleTexte("echterFall")).toContain(`${fmt(DIREKT_FALL_KAUFPREIS_EUR)} Euro`);
    expect(alleTexte("echterFall")).toContain(`${fmt(DIREKT_FALL_PROVISION_EUR)} Euro`);
  });

  // Bis zum 06.09.2026 nannte die Preisfolie die Servicevereinbarung mit 150
  // Euro im Monat und 12 Monaten Mindestlaufzeit. Seit dem 07.09.2026 wird
  // alles gestellt; die Folie darf weder Gebühr noch Laufzeit mehr nennen.
  it("die Preisfolie nennt erst das Unentgeltliche, dann die gestellten Leistungen und den Leadkanal", () => {
    const text = alleTexte("preis");
    // Der stärkste Satz zuerst: Was zum Arbeiten nötig ist, kostet nichts.
    expect(text).toContain("Für alles, was du zum Arbeiten brauchst, zahlst du nichts");
    expect(text).toContain(`Auch ${GESTELLT_ZUSATZ_KURZ} stellen wir dir`);
    expect(text).toContain("kein laufendes Entgelt, keinen Einmalbetrag und keine Mindestlaufzeit");
    expect(text).not.toMatch(/Servicevereinbarung|Serviceentgelt|Euro im Monat|Monate Mindestlaufzeit/);
    expect(text).toContain(`${fmt(LEAD_PAKET_PREIS)} Euro netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads`);
    expect(text).toContain(`${fmt(LEAD_EINZELPREIS)} Euro pro Stück`);
    expect(text).toContain("dein eigenes Netzwerk reicht völlig für den Start");
  });

  it("der Preis-Abschnitt beantwortet die Einwände zum fehlenden Haken und zur Laufzeit", () => {
    const einwaende = getClosingDirektAbschnitt("preis")?.einwaende ?? [];
    expect(einwaende.map((e) => e.einwand)).toEqual([
      "Wo ist der Haken? Andere Vertriebe verlangen eine Systemgebühr, ihr nicht.",
      "Gibt es eine Laufzeit oder eine Mindestbindung?",
    ]);
    expect(einwaende[0].antwort).toContain("Es gibt keinen");
    expect(einwaende[0].antwort).toContain("wir verdienen mit dir am Abschluss");
    const laufzeit = einwaende[1].antwort;
    // Weder der Vertrag noch irgendeine Gebühr hat eine Laufzeit.
    expect(laufzeit).toContain("Der Handelsvertretervertrag hat keine Mindestlaufzeit");
    expect(laufzeit).toContain("keine Gebühr, an die eine Laufzeit hängen könnte");
    expect(laufzeit).toContain("drei bis dreieinhalb Monate");
    expect(laufzeit).toContain("komplette Infrastruktur");
    expect(laufzeit).toContain("langfristige Partnerschaften");
    expect(laufzeit).toContain("Erfolg unserer Partner ist unser gesamter Erfolg");
  });

  it("weitere Einwände sitzen an den passenden Abschnitten", () => {
    expect((getClosingDirektAbschnitt("rechner")?.einwaende ?? []).map((e) => e.einwand))
      .toContain("Was ist, wenn ich in den ersten Monaten keinen Abschluss mache?");
    expect((getClosingDirektAbschnitt("start")?.einwaende ?? []).map((e) => e.einwand))
      .toContain("Schaffe ich das überhaupt neben meinem Hauptjob?");
    expect((getClosingDirektAbschnitt("entscheidung")?.einwaende ?? []).map((e) => e.einwand))
      .toContain("Ich bin noch bei einem anderen Vertrieb. Geht das überhaupt?");
  });

  it("der Vertriebs-Einwand an der Entscheidung verweist auf den Exklusiv-Regler und die Individualfassung", () => {
    const einwand = (getClosingDirektAbschnitt("entscheidung")?.einwaende ?? [])
      .find((e) => e.einwand.includes("anderen Vertrieb"));
    expect(einwand).toBeTruthy();
    expect(einwand!.antwort).toContain("schalten wir direkt hier den Regler");
    expect(einwand!.antwort).toContain("tragen die Vertriebe ein");
    expect(einwand!.antwort).toContain("Individualfassung");
  });

  it("der Folge-Call nutzt den bestehenden Buchungslink von Christian Kurz", () => {
    expect(LEAD_QUALIFIZIERUNG_BUCHUNGSLINK).toBe(
      "https://calendly.com/office-more/vertriebspartnerschaft-more-immo",
    );
  });

  it("die Jahresrechnung im Rechner leitet sich aus der Beispielprovision ab", () => {
    expect(DIREKT_JAHR_PROVISION_EUR).toBe(BEISPIEL_PROVISION_EUR * 12);
    expect(alleTexte("rechner")).toContain(`${fmt(DIREKT_JAHR_PROVISION_EUR)} Euro`);
  });

  it("Beispielrechnungen werden als solche gekennzeichnet, kein Einkommensversprechen", () => {
    expect(alleTexte("echterFall")).toContain("Kein Einkommensversprechen");
    expect(alleTexte("rechner")).toContain("kein Einkommensversprechen");
  });
});

describe("closingDirektSkript: was NICHT vorkommt", () => {
  it("Tippgeber, Overhead-Provision und Altpakete kommen im Direktweg nicht vor", () => {
    expect(gesamtText).not.toContain("Tippgeber");
    expect(gesamtText).not.toContain("Overhead");
    expect(gesamtText).not.toContain("Lead Partner");
    expect(gesamtText).not.toContain("Team Lead");
    expect(gesamtText).not.toContain("Lizenzpartner");
    expect(gesamtText).not.toContain("Partner-Vertrag");
  });

  it("zur Wahl stehen nur Vertriebspartner und Lead-Berater", () => {
    expect(DIREKT_PAKETE.map((p) => p.id)).toEqual(["junior", "lead_berater"]);
  });

  it("Sprechtexte enthalten keine Gedankenstriche", () => {
    expect(gesamtText).not.toMatch(/[–—]/);
  });
});

describe("closingDirektSkript: Teil 2 komplett (Fassungswahl des Startfahrplans)", () => {
  const alleKeys = CLOSING_DIREKT_ABSCHNITTE.map((a) => a.key);

  it("ist nie komplett, solange der Direktweg aus ist", () => {
    expect(istClosingDirektKomplett(undefined, "ja", "junior")).toBe(false);
    expect(istClosingDirektKomplett({ aktiv: false, abgehakt: alleKeys }, "ja", "junior")).toBe(false);
  });

  it("zählt die Entscheidung Ja plus Paket als komplett", () => {
    expect(istClosingDirektKomplett({ aktiv: true }, "ja", "junior")).toBe(true);
    expect(istClosingDirektKomplett({ aktiv: true }, "ja", "")).toBe(false);
    expect(istClosingDirektKomplett({ aktiv: true }, "bedenkzeit", "junior")).toBe(false);
  });

  it("zählt die Unterlagen-Weiche als komplett, auch ohne Entscheidung", () => {
    expect(istClosingDirektKomplett({ aktiv: true, startWeiche: "unterlagen" }, "", "")).toBe(true);
    expect(istClosingDirektKomplett({ aktiv: true, startWeiche: "direkt" }, "", "")).toBe(false);
    expect(istClosingDirektKomplett({ aktiv: true, startWeiche: "" }, "", "")).toBe(false);
  });

  it("zählt alle abgehakten Abschnitte als komplett, teilweise Abhaken reicht nicht", () => {
    expect(istClosingDirektKomplett({ aktiv: true, abgehakt: alleKeys }, "", "")).toBe(true);
    expect(istClosingDirektKomplett({ aktiv: true, abgehakt: alleKeys.slice(0, -1) }, "", "")).toBe(false);
    expect(istClosingDirektKomplett({ aktiv: true, abgehakt: [] }, "", "")).toBe(false);
  });
});

describe("closingDirektSkript: Status-Sprung bei Ja plus Paket", () => {
  it("erkennt das erledigte Closing nur bei Ja plus Paket", () => {
    expect(istClosingDirektErledigt("ja", "junior")).toBe(true);
    expect(istClosingDirektErledigt("ja", "lead_berater")).toBe(true);
    expect(istClosingDirektErledigt("ja", "")).toBe(false);
    expect(istClosingDirektErledigt("ja", undefined)).toBe(false);
    expect(istClosingDirektErledigt("bedenkzeit", "junior")).toBe(false);
    expect(istClosingDirektErledigt("nein", "junior")).toBe(false);
    expect(istClosingDirektErledigt("", "junior")).toBe(false);
    expect(istClosingDirektErledigt(undefined, "junior")).toBe(false);
  });

  it("springt aus Eingang, Erstgespräch und Closing auf Paketwahl", () => {
    expect(closingDirektStatusSprung("Eingang", "ja", "junior")).toBe("Paketwahl");
    expect(closingDirektStatusSprung("Erstgespraech", "ja", "junior")).toBe("Paketwahl");
    expect(closingDirektStatusSprung("Closing", "ja", "lead_berater")).toBe("Paketwahl");
  });

  it("springt nicht ohne Ja, ohne Paket oder aus fremden Stufen", () => {
    expect(closingDirektStatusSprung("Erstgespraech", "ja", "")).toBeNull();
    expect(closingDirektStatusSprung("Erstgespraech", "bedenkzeit", "junior")).toBeNull();
    expect(closingDirektStatusSprung("Erstgespraech", "nein", "junior")).toBeNull();
    expect(closingDirektStatusSprung("Paketwahl", "ja", "junior")).toBeNull();
    expect(closingDirektStatusSprung("Vertrag", "ja", "junior")).toBeNull();
    expect(closingDirektStatusSprung("Aktiv", "ja", "junior")).toBeNull();
    expect(closingDirektStatusSprung("Abgelehnt", "ja", "junior")).toBeNull();
  });
});

describe("closingDirektSkript: Unterlagen-Weiche", () => {
  it("Follow-up wechselt den Status nur aus frühen Stufen, wie die FollowUpCard", () => {
    expect(followUpStatusZiel("Eingang")).toBe("FollowUp");
    expect(followUpStatusZiel("Erstgespraech")).toBe("FollowUp");
    expect(followUpStatusZiel("Closing")).toBe("FollowUp");
    expect(followUpStatusZiel("Bedenkzeit")).toBe("FollowUp");
    expect(followUpStatusZiel("FollowUp")).toBeNull();
    expect(followUpStatusZiel("Paketwahl")).toBeNull();
    expect(followUpStatusZiel("Vertrag")).toBeNull();
    expect(followUpStatusZiel("Aktiv")).toBeNull();
    expect(followUpStatusZiel("Abgelehnt")).toBeNull();
    expect(followUpStatusZiel("KeinInteresse")).toBeNull();
  });

  it("passendeAbschlussVarianten: Entscheidung vor Weiche, sonst alle", () => {
    const varianten = (CLOSING_DIREKT_ABSCHNITTE[CLOSING_DIREKT_ABSCHNITTE.length - 1]
      .varianten ?? []) as ClosingDirektVariante[];
    expect(passendeAbschlussVarianten(varianten, "ja", "unterlagen").map((v) => v.key)).toEqual(["ja"]);
    expect(passendeAbschlussVarianten(varianten, "", "unterlagen").map((v) => v.key)).toEqual(["unterlagen"]);
    expect(passendeAbschlussVarianten(varianten, undefined, "unterlagen").map((v) => v.key)).toEqual(["unterlagen"]);
    expect(passendeAbschlussVarianten(varianten, "bedenkzeit", "").map((v) => v.key)).toEqual(["bedenkzeit"]);
    expect(passendeAbschlussVarianten(varianten, "", "direkt")).toHaveLength(varianten.length);
    expect(passendeAbschlussVarianten(varianten, "", "")).toHaveLength(varianten.length);
  });
});

describe("closingDirektSkript: Daten für die KI-Zusammenfassung", () => {
  it("liefert bei leerem Teil 2 ein leeres Objekt, keine leeren Abschnitte", () => {
    expect(baueClosingDirektKiDaten({}, {})).toEqual({});
    expect(baueClosingDirektKiDaten({ aktiv: true }, {})).toEqual({});
    expect(baueClosingDirektKiDaten(
      { aktiv: true, notizen: { einstiegReaktion: "   " } },
      { closingEntscheidung: "", paketwahl: "", zahlungsweise: "", andereVertriebe: "  " },
    )).toEqual({});
  });

  it("nimmt nur besprochene Abschnitte und gefüllte Notizen auf, mit sprechenden Labels", () => {
    const daten = baueClosingDirektKiDaten(
      {
        aktiv: true,
        abgehakt: ["einstieg"],
        notizen: { rechnerAbschluesse: "1 bis 2", chaosNotiz: "" },
      },
      {},
    );
    const abschnitte = daten.abschnitte as { titel: string; besprochen: boolean; notizen?: Record<string, string> }[];
    expect(abschnitte.map((a) => a.titel)).toEqual([
      "Der Direktvorschlag",
      "Seine Zahlen und der Preis des Wartens",
    ]);
    expect(abschnitte[0].besprochen).toBe(true);
    expect(abschnitte[0].notizen).toBeUndefined();
    expect(abschnitte[1].besprochen).toBe(false);
    expect(abschnitte[1].notizen).toEqual({ "Seine Annahme: Abschlüsse pro Monat": "1 bis 2" });
  });

  it("übersetzt Weiche, Entscheidung, Paket und Zahlungsweise in Klartext", () => {
    const daten = baueClosingDirektKiDaten(
      { aktiv: true, startWeiche: "unterlagen", qualiCallAngeboten: true },
      {
        closingEntscheidung: "ja",
        paketwahl: "junior",
        zahlungsweise: "einmal",
        andereVertriebe: "XY Vertrieb GmbH",
      },
    );
    expect(daten.startfahrplanWeiche).toMatch(/Unterlagen/);
    expect(daten.entscheidung).toBe("Ja, will starten");
    expect(daten.paketwahl).toBe("Vertriebspartner");
    expect(daten.zahlungsweise).toBe("Einmalzahlung");
    expect(daten.andereVertriebe).toBe("XY Vertrieb GmbH");
    expect(daten.folgeCallGestellteLeadsAngeboten).toBe(true);
  });

  it("nimmt den veralteten Kaufpreis aus Bestandsdaten weiter mit", () => {
    const daten = baueClosingDirektKiDaten(
      { aktiv: true, notizen: { rechnerKaufpreis: "300.000" } },
      {},
    );
    expect(daten.rechnerKaufpreisAltesSkript).toBe("300.000");
    expect(daten.abschnitte).toBeUndefined();
  });
});
