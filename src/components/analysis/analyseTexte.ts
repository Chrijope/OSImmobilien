/**
 * Alle sichtbaren Texte des Analysetools auf Deutsch und Englisch.
 *
 * Gilt für die öffentliche Seite (`/analyse`, `/analyse/:slug`) und für die
 * Bausteine unter `src/components/analysis/`. Dieselben Bausteine laufen auch
 * intern auf `/analysetool`. Dort gibt es keinen `SeitenSpracheProvider`,
 * `useSeitenTexte` liefert also Deutsch, und es ändert sich nichts.
 *
 * Aufbau (Plan Kundensprache, Etappe 6):
 * - `**Wort**` wird fett gesetzt, siehe `fettText.tsx`.
 * - Texte mit Zahlen sind Funktionen und formatieren selbst in ihrer Sprache.
 * - Texte aus Rechenkern, Objekttypen und Bundesländern stehen NICHT hier,
 *   sondern in `analyseRechenkernTexte.ts`, weil sie deutsch ins CRM gehen.
 * - Gespeicherte Antwortwerte (`angestellt`, `50k_80k` …) bleiben unverändert,
 *   übersetzt werden nur die Beschriftungen, Schlüssel ist der Wert.
 * - Der Berater heißt im Englischen nie „advisor“, sondern „your contact
 *   person at OS Immobilien“ bzw. „your contact“ (Entscheidung 16).
 * - Keine Gedankenstriche, in keiner der beiden Sprachen.
 */
import { SPRACH_LOCALE, euroText, type FormatSprache } from "@/lib/sprachFormat";

/** Zahl mit bis zu zwei Nachkommastellen, „3,5“ oder „3.5“, ganze Zahlen ohne Komma. */
const z = (n: number, spr: FormatSprache) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(SPRACH_LOCALE[spr], { maximumFractionDigits: 2 });
const eDe = (n: number) => euroText(Math.round(n), "de");
const eEn = (n: number) => euroText(Math.round(n), "en");

/* ══════════════════════════════════════════════════════════════
   Deutsch
   ══════════════════════════════════════════════════════════════ */

const de = {
  seite: {
    ladeBerater: "Vertriebspartner wird geladen …",
    bereitgestelltVon: (name: string) => `Bereitgestellt von ${name}`,
    erinnerungHinweis:
      "Vorbereitung für dein Erstgespräch, die ausführlichen Finanzierungs- und Steuer-Details besprechen wir gemeinsam im Termin.",
  },

  fortschritt: {
    schritt: (nr: number, gesamt: number) => `Schritt ${nr} von ${gesamt}`,
  },

  frage: {
    standardValidierung: "Bitte fülle alle Felder aus, damit wir Deine Analyse präzise berechnen können.",
    zurueck: "← Zurück",
    weiter: "Weiter →",
    tipp: "Tipp",
    hinweisSchliessen: "Hinweis schließen",
  },

  wizard: {
    schritte: ["Beruf und Einkommen", "Was monatlich bleibt", "Steuer und Ziele", "Zur Person"],
    start: {
      titelZeile1: "Immobilien-",
      titelAkzent: "Investmentanalyse",
      einleitung:
        "Finde heraus, ob ein Immobilieninvestment zu Deiner aktuellen Lebenssituation passt. Und was es Dir nach 10 Jahren bringen kann.",
      kurz: "Kostenlose Analyse. Vertraulich. In wenigen Minuten.",
      erwartung:
        "Die Auswertung beruht auf Deinen Angaben und gibt Dir eine erste Einordnung, was in Deiner Situation möglich ist. Die genaue Berechnung machen wir gemeinsam im persönlichen Termin.",
      bereitgestelltVon: "Bereitgestellt von",
      starten: "Analyse starten →",
      datenFett: "Deine Daten werden nicht gespeichert.",
      datenText: "Diese Analyse dient ausschließlich Deiner persönlichen Ersteinschätzung.",
      fusszeile: "Vertraulich · Keine Registrierung erforderlich · DSGVO-konform",
    },
    jahre: "Jahre",
    stueck: "Stk.",
    pflicht: "*",
    beruf: {
      titel: "Beruf und Einkommen",
      untertitel: "Womit verdienst Du Dein Geld?",
      hilfeTitel: "Warum das zuerst kommt",
      hilfe: [
        "Banken bewerten Deine **Einkommensstabilität** je nach Berufsgruppe unterschiedlich.",
        "**Beamte und Angestellte** mit unbefristetem Vertrag bekommen meist die besten Konditionen.",
        "Aus dem **Nettoeinkommen** entsteht der Rahmen, in dem sich eine Finanzierung bewegt.",
      ],
      validierung: "Bitte Berufsstatus, die Angaben dazu und Dein Nettoeinkommen ausfüllen.",
      statusLabel: "Berufsstatus *",
      status: {
        angestellt: { label: "Angestellt", beschreibung: "Festanstellung in einem Unternehmen" },
        selbststaendig: { label: "Selbstständig / Unternehmer", beschreibung: "Eigenes Gewerbe oder Unternehmen" },
        freiberufler: { label: "Freiberufler", beschreibung: "Katalogberuf oder ähnliche Tätigkeit" },
        beamter: { label: "Beamter", beschreibung: "Öffentlicher Dienst mit Beamtenstatus" },
        arbeitslos: { label: "Aktuell arbeitssuchend", beschreibung: "Derzeit ohne festes Beschäftigungsverhältnis" },
      },
      netto: "Monatliches Nettoeinkommen *",
      zusatz: "Zusätzliches Einkommen (monatlich)",
    },
    details: {
      vertragsart: "Vertragsart *",
      vertrag: { unbefristet: "Unbefristet", befristet: "Befristet" },
      dauerAngestellt: "Wie lange bist Du schon in Deinem aktuellen Job angestellt? *",
      dauerAngestelltHinweis:
        "Banken bewerten die Dauer Deiner Anstellung als Stabilitätsfaktor. Je länger, desto besser für die Finanzierung.",
      dauerSelbststaendig: "Dauer der Selbstständigkeit *",
      dauerFreiberuflich: "Dauer der freiberuflichen Tätigkeit *",
      durchschnitt: "Durchschn. Einkommen (letzte 2 bis 3 Jahre, monatlich netto) *",
      schwankungLabel: "Einkommensschwankungen *",
      schwankung: {
        gering: "Gering, relativ stabil",
        mittel: "Mittel, saisonale Schwankungen",
        hoch: "Hoch, stark schwankend",
      },
      nachweisHinweis:
        "Banken verlangen meist zwei bis drei Jahre Tätigkeitsnachweis und betriebswirtschaftliche Auswertungen.",
      dienstLabel: "Dienstverhältnis *",
      dienst: { probe: "Beamter auf Probe", lebenszeit: "Beamter auf Lebenszeit" },
      beamterHinweis: "Als Beamter auf Lebenszeit bekommst Du in der Regel die besten Zinskonditionen am Markt.",
    },
    monat: {
      titel: "Was monatlich bleibt",
      untertitel: "Deine Ausgaben, Rücklagen und laufenden Verpflichtungen",
      hilfeTitel: "Auch ohne Eigenkapital möglich",
      hilfe: [
        "Was nach den **Fixkosten** übrig bleibt, ist für die Bank die wichtigste Kennzahl. Miete, Versicherungen und Abos gehören dazu.",
        "Eine Immobilie ist auch **ohne Eigenkapital** finanzierbar. Mit Eigenkapital wird der Zins günstiger.",
        "Die **Liquiditätsreserve** sollte drei bis sechs Monatsausgaben abdecken.",
      ],
      validierung: "Die monatlichen Fixkosten sind eine Pflichtangabe.",
      fixkosten: "Monatliche Fixkosten (Miete, Versicherungen etc.) *",
      kredite: "Laufende Kreditraten (monatlich)",
      sparrate: "Monatliche Sparrate",
      eigenkapital: "Eigenkapital / Ersparnisse",
      reserve: "Liquiditätsreserve (sofort verfügbar)",
    },
    steuer: {
      titel: "Steuer und Ziele",
      untertitel: "Wo Du steuerlich stehst und was Du erreichen willst",
      hilfeTitel: "Höhere Steuerlast, größerer Hebel",
      hilfe: [
        "Je höher Dein Jahresbrutto, desto **größer die steuerliche Wirkung** einer vermieteten Immobilie.",
        "Über **Abschreibung und Zinsabzug** holst Du jedes Jahr einen Teil Deiner Steuer zurück.",
        "Dein **Alter** bestimmt mit, wie lange die Finanzierung laufen kann.",
      ],
      validierung: "Bitte Alter, Einkommensklasse und mindestens ein Ziel angeben.",
      alter: "Alter *",
      bruttoLabel: "Jährliches Bruttoeinkommen *",
      einkommensklasse: {
        unter_30k: "Unter 30.000 €",
        "30k_50k": "30.000 bis 50.000 €",
        "50k_80k": "50.000 bis 80.000 €",
        "80k_120k": "80.000 bis 120.000 €",
        ueber_120k: "Über 120.000 €",
      },
      bruttoHinweis:
        "Bestimmt den Steuersatz in Deiner Beispielrechnung. Bei gemeinsamer Veranlagung das Haushaltsbrutto.",
      interesseLabel: "Interesse an steuerlichen Optimierungsmöglichkeiten?",
      interesse: { ja: "Ja, sehr interessiert", nein: "Eher weniger" },
      zieleLabel: "Deine Ziele * (Mehrfachauswahl)",
      ziele: {
        vermoegensaufbau: "Vermögensaufbau",
        altersvorsorge: "Altersvorsorge",
        steuerersparnis: "Steuerersparnis",
        passives_einkommen: "Passives Einkommen",
        inflationsschutz: "Inflationsschutz",
        diversifikation: "Diversifikation",
      },
    },
    person: {
      titel: "Zur Person",
      untertitel: "Die letzten Angaben, dann steht Deine Auswertung",
      hilfeTitel: "Warum diese Fragen?",
      hilfe: [
        "Das **Bundesland** bestimmt die Grunderwerbsteuer und damit die Kaufnebenkosten in Deiner Beispielrechnung.",
        "Deine **Erfahrung** fließt in die Bewertung ein. Die meisten unserer Kunden starten ohne Vorerfahrung, das ist kein Nachteil.",
      ],
      validierung: "Bitte Familienstand, Wohnsituation, Bundesland und die beiden Erfahrungsfragen ausfüllen.",
      familienstandLabel: "Familienstand *",
      familienstand: { ledig: "Ledig", verheiratet: "Verheiratet", geschieden: "Geschieden", verwitwet: "Verwitwet" },
      wohnsituationLabel: "Wohnsituation *",
      wohnsituation: { miete: "Zur Miete", eigentum: "Eigentum" },
      bundeslandLabel: "Bundesland *",
      bitteWaehlen: "Bitte wählen",
      bundeslandOption: (name: string, satz: number) => `${name} · ${z(satz, "de")} % Grunderwerbsteuer`,
      bundeslandHinweis: "Bestimmt die Kaufnebenkosten in Deiner Beispielrechnung.",
      immobilien: "Bereits vorhandene Immobilien",
      erfahrungAnlagen: "Erfahrung mit Kapitalanlagen *",
      erfahrungImmobilien: "Erfahrung mit Immobilien *",
      erfahrung: { keine: "Keine", wenig: "Wenig", mittel: "Mittel", viel: "Umfangreich" },
    },
  },

  formular: {
    vorname: "Vorname *",
    nachname: "Nachname *",
    email: "E-Mail *",
    strasse: "Straße, Nr.",
    plz: "PLZ",
    ort: "Ort",
    nachricht: "Nachricht (optional)",
    fehlerAllgemein: "Das hat nicht geklappt.",
  },

  einwilligung: {
    datenschutzLink: "Mehr dazu in der Datenschutzerklärung",
  },

  freischalten: {
    auswertungSteht: "Deine Auswertung steht",
    kennzahlRahmen: "Dein Finanzierungsrahmen",
    kennzahlTyp: "Passender Immobilientyp",
    kennzahlZuzahlung: "Zuzahlung im Beispiel",
    nochEinSchritt: "Noch ein Schritt bis zur vollständigen Auswertung",
    titel: "Wohin dürfen wir das Ergebnis schicken?",
    text: "Trag Dich einmal ein, dann siehst Du sofort die vollständige Auswertung mit allen Zahlen.",
    mehrZeigen: "Weitere Angaben (freiwillig)",
    mehrAusblenden: "Weitere Angaben ausblenden",
    laeuft: "Einen Moment",
    absenden: "Auswertung ansehen",
    meldetSichName: (name: string) => `${name} meldet sich bei Dir`,
    meldetSichAllgemein: "Dein Ansprechpartner meldet sich bei Dir",
    datenschutzRest:
      ", um die Auswertung mit Dir durchzugehen. Deine Angaben werden dafür gespeichert und außerhalb von OS Immobilien und Deinem Ansprechpartner an niemanden weitergegeben. Du kannst der Nutzung jederzeit widersprechen.",
  },

  ergebnis: {
    eyebrow: "OS Immobilien · Analyse",
    titel: "Deine Analyse­ergebnisse.",
    untertitel: "Ein klarer Blick auf Dein persönliches Vermögens­szenario: transparent berechnet, individuell für Dich.",
    hinweisTitel: "Hinweis · Beispielergebnis",
    hinweisVor:
      "Diese Zahlen beruhen auf Deinen Angaben und zeigen die Größenordnung, nicht Dein konkretes Investment. Wie es sich für Dich genau rechnet, hängt vom Objekt, den Konditionen Deiner Bank und Deiner persönlichen Steuersituation ab. In den meisten Fällen lässt es sich mit der passenden Objektauswahl und Finanzierungsstruktur ",
    hinweisBetont: "deutlich besser",
    hinweisNach: " rechnen. Das gehen wir im Termin gemeinsam Position für Position durch.",
    ohneEinkommenText:
      "Wir wünschen Dir alles Gute für Deine berufliche Zukunft. Sobald Du ein regelmäßiges Einkommen beziehst, stehen wir Dir gerne zur Verfügung.",
    neueAnalyseStarten: "Neue Analyse starten",
    vermoegenNach10: "Dein Vermögen nach 10 Jahren",
    steuerfreiHero: "Steuerfrei realisierbar nach §23 EStG",
    machbarTitel: "Was ist für Dich machbar?",
    passtTitel: "Passt das zu Dir?",
    gesamt: {
      gruen: "Alle Ampeln auf Grün: Kaufen!",
      orange: "Gute Basis, einige Punkte zu prüfen",
      rot: "Aktuell schwierig, Optimierung nötig",
    },
    wieWirRechnen: "Wie wir rechnen",
    wieWirRechnenText: "Zinssatz, Tilgung, Wertentwicklung, Abschreibung und Kaufnebenkosten. Alle Annahmen offen.",
    afaTitel: (satz: number) => `Abschreibung: ${z(satz, "de")} % auf den Gebäudeanteil`,
    afaText: (satzMitGutachten: number) =>
      `Gerechnet wird mit dem gesetzlichen Satz nach § 7 Abs. 4 EStG. Für Objekte mit einem Restnutzungsdauergutachten sind ${z(satzMitGutachten, "de")} % möglich. Der höhere Satz gilt objektbezogen und braucht das Gutachten als Nachweis.`,
    afaMitGutachten: "Mit Gutachten",
    afaMitGutachtenRechnen: "Mit Gutachten rechnen",
    transparenz: {
      titel: "Wie rechnen wir? Transparenz",
      annahmen: "Annahmen",
      zins: (p: number) => `Zinssatz: **${z(p, "de")} %** (Beispielwert, individuell verhandelbar)`,
      tilgung: (p: number) => `Anfangstilgung: **${z(p, "de")} %**`,
      wertsteigerung: (p: number) => `Wertsteigerung: **${z(p, "de")} % p.a.** (konservative Schätzung)`,
      kaufnebenkosten: (p: number, betrag: number, gesamt: number) =>
        `Kaufnebenkosten: **${z(p, "de")} %** (${eDe(betrag)}), Gesamtinvestition ${eDe(gesamt)}`,
      mietrendite: (p: number) => `Mietrendite: **${z(p, "de")} %** vom Kaufpreis`,
      gebaeudeanteil: (p: number) => `Gebäudeanteil: **${z(p, "de")} %**, nur dieser Teil ist abschreibbar`,
      afa: (p: number) => `AfA: **${z(p, "de")} % auf den Gebäudeanteil**`,
      afaGutachten: " (setzt ein objektbezogenes Restnutzungsdauergutachten voraus)",
      afaGesetz: " (gesetzlicher Satz nach § 7 Abs. 4 EStG)",
      verkaufskosten: (p: number) => `Verkaufsnebenkosten nach zehn Jahren: **${z(p, "de")} %**`,
      steuerfrei:
        "Wer im Privatvermögen erst nach mehr als zehn Jahren verkauft, kann den Gewinn nach § 23 EStG steuerfrei vereinnahmen",
      zuzahlungTitel: "So rechnen wir Deine echte Zuzahlung",
      zuzahlungFormel:
        "Monatsrate (Zins + Tilgung) − Kaltmiete − Steuervorteil/Monat (AfA + Schuldzinsen + Werbungskosten × Steuersatz) = **Deine Netto-Zuzahlung**.",
      vorbehalt:
        "Alle Werte sind Beispielrechnungen auf Basis Deiner Angaben und der oben genannten Annahmen. Sie ersetzen keine steuerliche oder finanzielle Beratung. Das mögliche Finanzierungsvolumen entsteht aus einer Faustformel über Einkommen und Berufsgruppe und ersetzt keine Haushaltsrechnung der Bank. Die tatsächlichen Zahlen hängen vom konkreten Objekt, den Konditionen der Bank und Deiner persönlichen Steuersituation ab und werden im persönlichen Termin gemeinsam ermittelt.",
    },
    detailbewertung: "Detailbewertung",
    punkte: {
      income: "Einkommen",
      stability: "Stabilität",
      equity: "Eigenkapital",
      cashflow: "Cashflow",
      creditworthiness: "Bonität",
      goalAlignment: "Zielausrichtung",
      taxBenefit: "Steuervorteil",
    },
    staerken: "Deine Stärken",
    steuerHinweise: "Steuerliche Hinweise",
    naechsterSchritt: "Nächster Schritt",
    bereitTitel: "Bereit für Deinen Vermögensaufbau?",
    bereitMitRechnung:
      "Die Musterrechnung oben zeigt die Größenordnung. Im Erstgespräch rechnen wir sie auf Deine Zahlen um: Dein Objekt, Deine Konditionen, Deine Steuersituation.",
    bereitOhneRechnung: "Lass uns gemeinsam besprechen, was in Deiner Situation möglich ist.",
    kostenlos: "Das Gespräch ist kostenlos und unverbindlich.",
    persoenlicherVertriebspartner: "Dein persönlicher Vertriebspartner",
    persoenlicherAnsprechpartner: "Dein persönlicher Ansprechpartner",
    erstgespraech: "Erstgespräch vereinbaren",
    anrufen: "Anrufen",
    email: "E-Mail",
    interesseTitel: "Ich habe Interesse",
    interesseText: "Trag Dich ein und Dein persönlicher Vertriebspartner meldet sich.",
    absenden: "Absenden",
    vertraulich: "Deine Daten werden vertraulich behandelt.",
    dankeTitel: "Vielen Dank!",
    dankeText: "Dein Vertriebspartner meldet sich in Kürze.",
    neueAnalyse: "Neue Analyse",
    fusszeile: "Unverbindlich · Kostenlos · Persönlich",
    erinnerungTitel: "Bestens vorbereitet für Dein Erstgespräch",
    erinnerungText:
      "Du hast jetzt einen ersten Überblick über Deine Ausgangslage. Im Erstgespräch besprechen wir gemeinsam die individuellen Details: von der passenden Finanzierungsstrategie bis zu den steuerlichen Vorteilen für Deine Situation.",
    erinnerungFreude: "Wir freuen uns auf das Gespräch mit Dir.",
    erneutDurchgehen: "Analyse erneut durchgehen",
    leadQualitaet: (q: string) => `Lead-Qualität: ${q}`,
  },

  muster: {
    rahmenTitel: "Dein Rahmen",
    rahmen: (von: number, bis: number) => `${eDe(von)} bis ${eDe(bis)}`,
    rahmenText:
      "In dieser Spanne liegt eine Kapitalanlage, die zu Deinem Einkommen, Deinen laufenden Belastungen und Deinem Eigenkapital passt. Nicht das Maximum, das eine Bank gerade noch machen würde, sondern was tragfähig ist.",
    zuzahlungGrenze: (betrag: number) => `Deine monatliche Zuzahlung liegt dabei bei höchstens ${eDe(betrag)}`,
    typTitel: "Welcher Objekttyp passt zu Dir?",
    typText: "Wähle einen Typ, die Rechnung darunter passt sich an.",
    zuzahlungImBeispiel: "Zuzahlung im Beispiel",
    proMonat: "pro Monat",
    musterTitel: (name: string) => `Musterrechnung: ${name}`,
    derKauf: "Der Kauf",
    kaufpreis: "Kaufpreis Beispielobjekt",
    kaufnebenkosten: (land: string, prozent: number) => `Kaufnebenkosten ${land} ${z(prozent, "de")} %`,
    mittelwert: "Mittelwert",
    ausEigenkapital: "davon zahlst Du aus Eigenkapital",
    darlehen: "Darlehen",
    monatFuerMonat: "Monat für Monat",
    kaltmiete: "Kaltmiete",
    rate: "Rate bei 3,8 % Zins und 2 % Tilgung",
    nichtUmlagefaehig: "nicht umlagefähige Kosten",
    erhaltungsaufwandWg: "Erhaltungsaufwand WG-Konzept",
    zwischenstand: "Zwischenstand aus eigener Tasche",
    finanzamt: "Was das Finanzamt trägt",
    abschreibungGebaeude: (satz: number) => `Abschreibung Gebäude ${z(satz, "de")} %`,
    sonderAfa: "Sonderabschreibung § 7b (Jahre 1 bis 4)",
    schuldzinsen: "Schuldzinsen im ersten Jahr",
    mieteinnahmenDagegen: "Mieteinnahmen dagegen",
    steuerlichesErgebnis: "steuerliches Ergebnis",
    steuerwirkung: (satz: number) => `Steuerwirkung bei ${z(satz, "de")} %`,
    imJahr: (betrag: number) => `${eDe(betrag)} im Jahr`,
    deineZuzahlung: "Deine Zuzahlung",
    ueberGrenze: (betrag: number) =>
      `Bei diesem Typ liegt selbst das kleinste Beispielobjekt über ${eDe(betrag)}. Ein anderer Typ passt hier besser.`,
    sonderAfaText:
      "Die Sonderabschreibung nach § 7b läuft vier Jahre. Danach steigt die Zuzahlung entsprechend, dafür sinkt sie über die Jahre wieder durch steigende Mieten.",
    immobilienwert10: "Immobilienwert nach 10 Jahren",
    restschuld10: "Restschuld dann",
    vermoegen10: "Dein Vermögen",
    steuerfrei:
      "Wer im Privatvermögen erst nach mehr als zehn Jahren verkauft, kann den Gewinn nach § 23 EStG steuerfrei vereinnahmen. Ob am Ende ein Gewinn steht, hängt von Lage, Objekt und Marktentwicklung ab.",
    hinweisFett: "Musterrechnung zur Veranschaulichung.",
    hinweisMitLand: (min: number, max: number, satz: number, land: string) =>
      `Wir haben ein Beispielobjekt gewählt, das zu Deiner Situation passt. Es ist nicht Dein Objekt. Die Grunderwerbsteuer liegt je nach Bundesland zwischen ${z(min, "de")} und ${z(max, "de")} Prozent, hier gerechnet mit ${z(satz, "de")} % für ${land}. Welches Objekt aus unserem Bestand zu Dir passt und wie sich Deine Zahlen genau rechnen, sehen wir uns im Termin gemeinsam an.`,
    hinweisOhneLand: (min: number, max: number) =>
      `Wir haben ein Beispielobjekt gewählt, das zu Deiner Situation passt. Es ist nicht Dein Objekt. Die Grunderwerbsteuer liegt je nach Bundesland zwischen ${z(min, "de")} und ${z(max, "de")} Prozent, hier gerechnet mit dem Mittelwert. Welches Objekt aus unserem Bestand zu Dir passt und wie sich Deine Zahlen genau rechnen, sehen wir uns im Termin gemeinsam an.`,
    terminKnopf: "Termin vereinbaren und mein Objekt finden",
  },

  szenario: {
    pessimistisch: "Pessimistisch",
    realistisch: "Realistisch",
    optimistisch: "Optimistisch",
    wertsteigerung: (p: number) => `${z(p, "de")} % Wertsteigerung p.a.`,
    vermoegen: "Dein Vermögen nach 10 Jahren",
    szenario: "Szenario:",
  },
};

export type AnalyseTexte = typeof de;

/* ══════════════════════════════════════════════════════════════
   English
   ══════════════════════════════════════════════════════════════ */

const en: AnalyseTexte = {
  seite: {
    ladeBerater: "Loading your contact …",
    bereitgestelltVon: (name: string) => `Provided by ${name}`,
    erinnerungHinweis:
      "Preparation for your first meeting. We'll go through the detailed financing and tax points together at the appointment.",
  },

  fortschritt: {
    schritt: (nr: number, gesamt: number) => `Step ${nr} of ${gesamt}`,
  },

  frage: {
    standardValidierung: "Please fill in all fields so that we can calculate your analysis accurately.",
    zurueck: "← Back",
    weiter: "Next →",
    tipp: "Tip",
    hinweisSchliessen: "Close note",
  },

  wizard: {
    schritte: ["Job and income", "What's left each month", "Tax and goals", "About you"],
    start: {
      titelZeile1: "Property",
      titelAkzent: "investment analysis",
      einleitung:
        "Find out whether a property investment suits your current situation in life. And what it could do for you after 10 years.",
      kurz: "Free analysis. Confidential. In just a few minutes.",
      erwartung:
        "The result is based on your details and gives you a first idea of what's possible in your situation. We'll do the exact calculation together at a personal appointment.",
      bereitgestelltVon: "Provided by",
      starten: "Start analysis →",
      datenFett: "Your data is not stored.",
      datenText: "This analysis is purely for your own initial assessment.",
      fusszeile: "Confidential · No registration required · GDPR compliant",
    },
    jahre: "years",
    stueck: "units",
    pflicht: "*",
    beruf: {
      titel: "Job and income",
      untertitel: "How do you earn your money?",
      hilfeTitel: "Why this comes first",
      hilfe: [
        "Banks assess your **income stability** differently depending on your occupational group.",
        "**Civil servants and employees** with a permanent contract usually get the best terms.",
        "Your **net income** sets the range within which financing can move.",
      ],
      validierung: "Please fill in your employment status, the related details and your net income.",
      statusLabel: "Employment status *",
      status: {
        angestellt: { label: "Employed", beschreibung: "Permanent position with a company" },
        selbststaendig: { label: "Self-employed / business owner", beschreibung: "Your own trade or company" },
        freiberufler: { label: "Freelancer", beschreibung: "Liberal profession or similar activity" },
        beamter: { label: "Civil servant (Beamter)", beschreibung: "Public service with civil servant status" },
        arbeitslos: { label: "Currently looking for work", beschreibung: "No permanent employment at the moment" },
      },
      netto: "Monthly net income *",
      zusatz: "Additional income (monthly)",
    },
    details: {
      vertragsart: "Type of contract *",
      vertrag: { unbefristet: "Permanent", befristet: "Fixed-term" },
      dauerAngestellt: "How long have you been employed in your current job? *",
      dauerAngestelltHinweis:
        "Banks see the length of your employment as a stability factor. The longer, the better for your financing.",
      dauerSelbststaendig: "Years of self-employment *",
      dauerFreiberuflich: "Years of freelance work *",
      durchschnitt: "Average income (last 2 to 3 years, monthly net) *",
      schwankungLabel: "Income fluctuation *",
      schwankung: {
        gering: "Low, fairly stable",
        mittel: "Medium, seasonal fluctuation",
        hoch: "High, fluctuates strongly",
      },
      nachweisHinweis:
        "Banks usually ask for two to three years of proof of activity and business management reports.",
      dienstLabel: "Civil service status *",
      dienst: { probe: "Civil servant on probation", lebenszeit: "Civil servant for life" },
      beamterHinweis: "As a civil servant for life, you usually get the best interest terms on the market.",
    },
    monat: {
      titel: "What's left each month",
      untertitel: "Your expenses, savings and ongoing commitments",
      hilfeTitel: "Possible without equity, too",
      hilfe: [
        "What's left after your **fixed costs** is the most important figure for the bank. Rent, insurance and subscriptions all count.",
        "A property can be financed **without equity**, too. With equity, the interest rate is lower.",
        "Your **cash reserve** should cover three to six months of expenses.",
      ],
      validierung: "Your monthly fixed costs are required.",
      fixkosten: "Monthly fixed costs (rent, insurance etc.) *",
      kredite: "Current loan repayments (monthly)",
      sparrate: "Monthly savings",
      eigenkapital: "Equity / savings",
      reserve: "Cash reserve (available immediately)",
    },
    steuer: {
      titel: "Tax and goals",
      untertitel: "Where you stand on tax and what you want to achieve",
      hilfeTitel: "Higher tax burden, bigger lever",
      hilfe: [
        "The higher your gross annual income, the **greater the tax effect** of a let property.",
        "Through **depreciation and interest deductions**, you get part of your tax back every year.",
        "Your **age** helps determine how long the financing can run.",
      ],
      validierung: "Please enter your age, income bracket and at least one goal.",
      alter: "Age *",
      bruttoLabel: "Gross annual income *",
      einkommensklasse: {
        unter_30k: "Under €30,000",
        "30k_50k": "€30,000 to €50,000",
        "50k_80k": "€50,000 to €80,000",
        "80k_120k": "€80,000 to €120,000",
        ueber_120k: "Over €120,000",
      },
      bruttoHinweis:
        "Determines the tax rate in your sample calculation. For joint assessment, use the household's gross income.",
      interesseLabel: "Interested in ways to optimise your taxes?",
      interesse: { ja: "Yes, very interested", nein: "Not really" },
      zieleLabel: "Your goals * (select all that apply)",
      ziele: {
        vermoegensaufbau: "Building wealth",
        altersvorsorge: "Retirement provision",
        steuerersparnis: "Tax relief",
        passives_einkommen: "Passive income",
        inflationsschutz: "Protection against inflation",
        diversifikation: "Diversification",
      },
    },
    person: {
      titel: "About you",
      untertitel: "The last few details, then your result is ready",
      hilfeTitel: "Why these questions?",
      hilfe: [
        "Your **federal state** determines the real estate transfer tax (Grunderwerbsteuer) and therefore the incidental purchase costs in your sample calculation.",
        "Your **experience** is part of the assessment. Most of our clients start without any previous experience, and that's no disadvantage.",
      ],
      validierung: "Please fill in your marital status, living situation, federal state and both experience questions.",
      familienstandLabel: "Marital status *",
      familienstand: { ledig: "Single", verheiratet: "Married", geschieden: "Divorced", verwitwet: "Widowed" },
      wohnsituationLabel: "Living situation *",
      wohnsituation: { miete: "Renting", eigentum: "Owner-occupied" },
      bundeslandLabel: "Federal state *",
      bitteWaehlen: "Please select",
      bundeslandOption: (name: string, satz: number) => `${name} · ${z(satz, "en")}% real estate transfer tax`,
      bundeslandHinweis: "Determines the incidental purchase costs in your sample calculation.",
      immobilien: "Properties you already own",
      erfahrungAnlagen: "Experience with investments *",
      erfahrungImmobilien: "Experience with property *",
      erfahrung: { keine: "None", wenig: "Little", mittel: "Some", viel: "Extensive" },
    },
  },

  formular: {
    vorname: "First name *",
    nachname: "Last name *",
    email: "Email *",
    strasse: "Street, no.",
    plz: "Postcode",
    ort: "Town",
    nachricht: "Message (optional)",
    fehlerAllgemein: "That didn't work.",
  },

  einwilligung: {
    datenschutzLink: "More in the privacy policy",
  },

  freischalten: {
    auswertungSteht: "Your result is ready",
    kennzahlRahmen: "Your financing range",
    kennzahlTyp: "Suitable property type",
    kennzahlZuzahlung: "Top-up in the example",
    nochEinSchritt: "One more step to the full result",
    titel: "Where should we send your result?",
    text: "Enter your details once and you'll see the full result with all the figures straight away.",
    mehrZeigen: "More details (optional)",
    mehrAusblenden: "Hide more details",
    laeuft: "One moment",
    absenden: "View result",
    meldetSichName: (name: string) => `${name} will get in touch with you`,
    meldetSichAllgemein: "Your contact person at OS Immobilien will get in touch with you",
    datenschutzRest:
      " to go through the result with you. Your details are stored for this purpose and are not passed on to anyone outside OS Immobilien and your contact. You can object to their use at any time.",
  },

  ergebnis: {
    eyebrow: "OS Immobilien · Analysis",
    titel: "Your analysis results.",
    untertitel: "A clear view of your personal wealth scenario: transparently calculated, individually for you.",
    hinweisTitel: "Note · Sample result",
    hinweisVor:
      "These figures are based on your details and show the order of magnitude, not your actual investment. How it works out for you exactly depends on the property, your bank's terms and your personal tax situation. In most cases, with the right choice of property and financing structure, it works out ",
    hinweisBetont: "considerably better",
    hinweisNach: ". We'll go through it together, item by item, at the appointment.",
    ohneEinkommenText:
      "We wish you all the best for your professional future. As soon as you have a regular income, we'll be happy to help.",
    neueAnalyseStarten: "Start a new analysis",
    vermoegenNach10: "Your wealth after 10 years",
    steuerfreiHero: "Can be realised tax-free under Section 23 EStG",
    machbarTitel: "What's feasible for you?",
    passtTitel: "Is this right for you?",
    gesamt: {
      gruen: "All lights on green: go for it!",
      orange: "Good basis, a few points to check",
      rot: "Difficult at the moment, optimisation needed",
    },
    wieWirRechnen: "How we calculate",
    wieWirRechnenText: "Interest rate, repayment, value growth, depreciation and incidental purchase costs. All assumptions disclosed.",
    afaTitel: (satz: number) => `Depreciation: ${z(satz, "en")}% on the building share`,
    afaText: (satzMitGutachten: number) =>
      `We calculate with the statutory rate under Section 7(4) EStG. For properties with a remaining useful life appraisal (Restnutzungsdauergutachten), ${z(satzMitGutachten, "en")}% is possible. The higher rate applies to the specific property and requires the appraisal as proof.`,
    afaMitGutachten: "With appraisal",
    afaMitGutachtenRechnen: "Calculate with appraisal",
    transparenz: {
      titel: "How do we calculate? Full transparency",
      annahmen: "Assumptions",
      zins: (p: number) => `Interest rate: **${z(p, "en")}%** (example value, individually negotiable)`,
      tilgung: (p: number) => `Initial repayment: **${z(p, "en")}%**`,
      wertsteigerung: (p: number) => `Increase in value: **${z(p, "en")}% p.a.** (conservative estimate)`,
      kaufnebenkosten: (p: number, betrag: number, gesamt: number) =>
        `Incidental purchase costs: **${z(p, "en")}%** (${eEn(betrag)}), total investment ${eEn(gesamt)}`,
      mietrendite: (p: number) => `Rental yield: **${z(p, "en")}%** of the purchase price`,
      gebaeudeanteil: (p: number) => `Building share: **${z(p, "en")}%**, only this part can be depreciated`,
      afa: (p: number) => `Building depreciation (AfA): **${z(p, "en")}% on the building share**`,
      afaGutachten: " (requires a property-specific remaining useful life appraisal)",
      afaGesetz: " (statutory rate under Section 7(4) EStG)",
      verkaufskosten: (p: number) => `Selling costs after ten years: **${z(p, "en")}%**`,
      steuerfrei:
        "If you hold the property as private assets (Privatvermögen) and sell only after more than ten years, the gain is tax-free under Section 23 EStG",
      zuzahlungTitel: "How we calculate your real top-up",
      zuzahlungFormel:
        "Monthly instalment (interest + repayment) − net cold rent (Kaltmiete) − tax relief per month (depreciation + loan interest + income-related expenses × tax rate) = **your net top-up**.",
      vorbehalt:
        "All figures are sample calculations based on your details and the assumptions above. They do not replace tax or financial advice. The possible financing volume comes from a rule of thumb based on income and occupational group and does not replace the bank's household budget calculation. The actual figures depend on the specific property, the bank's terms and your personal tax situation, and we'll work them out together at a personal appointment.",
    },
    detailbewertung: "Detailed assessment",
    punkte: {
      income: "Income",
      stability: "Stability",
      equity: "Equity",
      cashflow: "Cash flow",
      creditworthiness: "Creditworthiness",
      goalAlignment: "Goal alignment",
      taxBenefit: "Tax benefit",
    },
    staerken: "Your strengths",
    steuerHinweise: "Tax notes",
    naechsterSchritt: "Next step",
    bereitTitel: "Ready to start building your wealth?",
    bereitMitRechnung:
      "The sample calculation above shows the order of magnitude. At the first meeting, we'll convert it to your figures: your property, your terms, your tax situation.",
    bereitOhneRechnung: "Let's talk together about what's possible in your situation.",
    kostenlos: "The meeting is free of charge and without obligation.",
    persoenlicherVertriebspartner: "Your contact person at OS Immobilien",
    persoenlicherAnsprechpartner: "Your contact person at OS Immobilien",
    erstgespraech: "Book a first meeting",
    anrufen: "Call",
    email: "Email",
    interesseTitel: "I'm interested",
    interesseText: "Enter your details and your contact person at OS Immobilien will get in touch.",
    absenden: "Send",
    vertraulich: "Your data is treated confidentially.",
    dankeTitel: "Thank you!",
    dankeText: "Your contact will be in touch shortly.",
    neueAnalyse: "New analysis",
    fusszeile: "No obligation · Free of charge · Personal",
    erinnerungTitel: "Well prepared for your first meeting",
    erinnerungText:
      "You now have a first overview of your starting position. At the first meeting, we'll go through the individual details together: from the right financing strategy to the tax advantages for your situation.",
    erinnerungFreude: "We look forward to talking to you.",
    erneutDurchgehen: "Go through the analysis again",
    leadQualitaet: (q: string) => `Lead quality: ${q}`,
  },

  muster: {
    rahmenTitel: "Your range",
    rahmen: (von: number, bis: number) => `${eEn(von)} to ${eEn(bis)}`,
    rahmenText:
      "Within this range lies an investment property that suits your income, your ongoing commitments and your equity. Not the maximum a bank would just about approve, but what's sustainable.",
    zuzahlungGrenze: (betrag: number) => `Your monthly top-up stays at ${eEn(betrag)} at most`,
    typTitel: "Which property type suits you?",
    typText: "Choose a type and the calculation below will adjust.",
    zuzahlungImBeispiel: "Top-up in the example",
    proMonat: "per month",
    musterTitel: (name: string) => `Sample calculation: ${name}`,
    derKauf: "The purchase",
    kaufpreis: "Purchase price of sample property",
    kaufnebenkosten: (land: string, prozent: number) => `Incidental purchase costs ${land} ${z(prozent, "en")}%`,
    mittelwert: "average",
    ausEigenkapital: "of which you pay from equity",
    darlehen: "Loan",
    monatFuerMonat: "Month by month",
    kaltmiete: "Net cold rent (Kaltmiete)",
    rate: "Instalment at 3.8% interest and 2% repayment",
    nichtUmlagefaehig: "non-recoverable costs",
    erhaltungsaufwandWg: "Maintenance expenses, flat-share concept",
    zwischenstand: "Subtotal out of your own pocket",
    finanzamt: "What the tax office covers",
    abschreibungGebaeude: (satz: number) => `Building depreciation (AfA) ${z(satz, "en")}%`,
    sonderAfa: "Special depreciation (Section 7b EStG), years 1 to 4",
    schuldzinsen: "Loan interest in the first year",
    mieteinnahmenDagegen: "Less rental income",
    steuerlichesErgebnis: "taxable result",
    steuerwirkung: (satz: number) => `Tax effect at ${z(satz, "en")}%`,
    imJahr: (betrag: number) => `${eEn(betrag)} a year`,
    deineZuzahlung: "Your top-up",
    ueberGrenze: (betrag: number) =>
      `For this type, even the smallest sample property is above ${eEn(betrag)}. Another type is a better fit here.`,
    sonderAfaText:
      "The special depreciation under Section 7b runs for four years. After that, the top-up rises accordingly, but it falls again over the years as rents increase.",
    immobilienwert10: "Property value after 10 years",
    restschuld10: "Remaining debt then",
    vermoegen10: "Your wealth",
    steuerfrei:
      "If you hold the property as private assets (Privatvermögen) and sell only after more than ten years, the gain is tax-free under Section 23 EStG. Whether there is a gain in the end depends on the location, the property and how the market develops.",
    hinweisFett: "Sample calculation for illustration.",
    hinweisMitLand: (min: number, max: number, satz: number, land: string) =>
      `We have chosen a sample property that suits your situation. It is not your property. Depending on the federal state, the real estate transfer tax (Grunderwerbsteuer) is between ${z(min, "en")} and ${z(max, "en")} percent, calculated here with ${z(satz, "en")}% for ${land}. We'll look together at the appointment at which property from our portfolio suits you and how your figures work out exactly.`,
    hinweisOhneLand: (min: number, max: number) =>
      `We have chosen a sample property that suits your situation. It is not your property. Depending on the federal state, the real estate transfer tax (Grunderwerbsteuer) is between ${z(min, "en")} and ${z(max, "en")} percent, calculated here with the average. We'll look together at the appointment at which property from our portfolio suits you and how your figures work out exactly.`,
    terminKnopf: "Book an appointment and find my property",
  },

  szenario: {
    pessimistisch: "Pessimistic",
    realistisch: "Realistic",
    optimistisch: "Optimistic",
    wertsteigerung: (p: number) => `${z(p, "en")}% increase in value p.a.`,
    vermoegen: "Your wealth after 10 years",
    szenario: "Scenario:",
  },
};

export const ANALYSE_TEXTE = { de, en };
