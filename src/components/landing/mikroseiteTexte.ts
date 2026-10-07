/**
 * Sichtbare Texte der Berater-Mikroseite (`/vp/:slug`), erster Teil, auf
 * Deutsch und auf Englisch.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 6 (anonyme Seiten). Hier stehen
 * die Texte der Abschnitte von oben bis zu den Referenzen: Hero, Leistungen,
 * Steuer- und Eignungscheck, Problem (Schere), Investmentkonzepte,
 * Steuervorteile, Musterrechnung Neubau samt Diagrammen, Investorenprofile
 * und „Warum MOREImmo“. Die Referenzen selbst stehen in
 * `src/lib/referenzenTexte.ts`, die übrigen Abschnitte in eigenen Dateien.
 *
 * Aufbau:
 * - Texte mit Zahlen sind Funktionen und formatieren selbst über
 *   `sprachFormat.ts`. Beträge bleiben immer in Euro.
 * - Die Anlageklassen des Rechenkerns (`ASSETKLASSEN` in
 *   `src/lib/steuerRechner.ts`) liefern weiter deutsche Titel. Die Anzeige
 *   holt sich die Übersetzung hier über die Kennung (`neubau`, `bestand`,
 *   `wg`). Das Deutsche kommt direkt aus dem Rechenkern, damit es nur eine
 *   Quelle gibt.
 * - Englisch ist britisch, Fachbegriffe nach `kundenspracheGlossar.ts`,
 *   deutsche Steuerbegriffe beim ersten Auftreten mit dem deutschen Wort in
 *   Klammern. Der Berater heißt nie „advisor“, sondern „your contact person
 *   at MOREImmo“, kurz „your contact“.
 * - Keine Gedankenstriche, in keiner der beiden Sprachen.
 *
 * Ohne `SeitenSpracheProvider` (CRM, Vorschau) gilt immer Deutsch.
 */
import { BERUF_IMMOBILIENBERATER } from "@/lib/berufsbezeichnung";
import { ASSETKLASSEN, type AssetklassenId, type Hebelziel, type Steuerklasse } from "@/lib/steuerRechner";
import { euroText, prozentText, SPRACH_LOCALE, zahlText, type FormatSprache } from "@/lib/sprachFormat";

const eDe = (n: number) => euroText(n, "de");
const eEn = (n: number) => euroText(n, "en");

/** Zahl mit höchstens `max` Nachkommastellen, ohne unnötige Nullen („4“, „1,5“). */
function zahlFrei(n: number, sprache: FormatSprache, max: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString(SPRACH_LOCALE[sprache], { maximumFractionDigits: max });
}

/** Anteil (0,04) als Prozentangabe: „4 Prozent“ beziehungsweise „4%“. */
const prozDe = (anteil: number) => `${zahlFrei(anteil * 100, "de", 2)} Prozent`;
const prozEn = (anteil: number) => `${zahlFrei(anteil * 100, "en", 2)}%`;

/** Tausenderbeträge für Diagrammachsen: „456 T€“ beziehungsweise „€456k“. */
const tausendDe = (n: number) => `${zahlText(Math.round(n / 1000), "de")} T€`;
const tausendEn = (n: number) => `€${zahlText(Math.round(n / 1000), "en")}k`;

/** Grundlage der Steuerrechnung im Ergebnis des Rechners, Schritt 1. */
export interface RechnerGrundlage {
  splitting: boolean;
  brutto: number;
  partnerBrutto: number;
  kinderfreibetrag: number;
  zvE: number;
  /** Als Anteil, 0,42 für 42 Prozent. */
  grenzsteuersatz: number;
}

/* ══════════════════════════════════════════════════════════════
   Deutsch
   ══════════════════════════════════════════════════════════════ */

const de = {
  allgemein: {
    erstberatung: "Kostenlose Erstberatung vereinbaren",
  },

  hero: {
    titelVor: "Aus Steuerlast wird",
    titelVarianten: ["nachhaltiges Immobilienvermögen.", "nachhaltiges Privatvermögen.", "Eigentum, das dir gehört."],
    unterzeile:
      "Wer in Deutschland gut verdient, zahlt bis zu 42 % Grenzsteuer. Ein Teil davon lässt sich legal in dein eigenes Portfolio umlenken, statt ihn abzuführen.",
    zielgruppe:
      "Für Unternehmer, Führungskräfte, Selbstständige und Angestellte. Geprüfte Objekte, steueroptimierte Konzepte und Finanzierung aus einer Hand.",
    punkte: [
      "Geprüfte Kapitalanlage-Immobilien in deutschen Top-Lagen",
      "Steueroptimierte Investmentkonzepte",
      "Strategischer Portfolio-Aufbau über 10 bis 15 Jahre",
      "Finanzierung & Umsetzung aus einer Hand",
    ],
    kennzahlen: ["350+ betreute Investoren", "450+ vermittelte Einheiten", "700+ Bankpartner", "20+ Berater & Mitarbeiter"],
    rechnerLink: "Meine Steuerersparnis berechnen",
    gebaeudeAlt: "Moderne Wohnimmobilie",
    portraetUeber: "Dein persönlicher Ansprechpartner",
    beruf: BERUF_IMMOBILIENBERATER,
    weiter: "Weiter",
  },

  bento: {
    kicker: "Was du bekommst",
    titelZeile1: "Alles, was du für dein",
    titelZeile2: "erstes Investment brauchst.",
    text: "Geprüfte Objekte, steueroptimierte Konzepte und ein Berater, der dich über Jahre hinweg begleitet. Aus einer Hand.",
    objekte: {
      eyebrow: "Objekte",
      titel: "Geprüfte Kapitalanlagen in deutschen Top-Lagen.",
      text: "Jede Immobilie durchläuft eine bauliche, rechtliche und steuerliche Prüfung, bevor sie dir vorgelegt wird.",
    },
    steuern: {
      eyebrow: "Steuern",
      titel: "AfA, Sonder-AfA, Erhaltungsaufwand.",
      text: "Maximiere deine Steuerersparnis.",
    },
    finanzierung: {
      eyebrow: "Finanzierung",
      titel: "700+ Bankpartner.",
      text: "Wir holen die Konditionen, die zu deiner Situation passen.",
    },
    strategie: {
      eyebrow: "Strategie",
      titel: "Portfolio-Aufbau über 10 bis 15 Jahre.",
      text: "Klarer Plan statt Einzeldeal, Schritt für Schritt zur finanziellen Freiheit.",
    },
    betreuung: {
      eyebrow: "Betreuung",
      titel: "Ein Ansprechpartner. Über Jahre.",
      text: "Kein Call-Center, kein Hand-Off. Du sprichst immer mit derselben Person.",
    },
  },

  rechner: {
    badge: "Steuer- & Eignungs-Check",
    titelZeile1: "Wie viel Steuer zahlst du,",
    titelZeile2: "und wie viel davon geht auch anders?",
    intro:
      "Wenige Angaben genügen. Du siehst in drei Schritten, was du heute abführst, wie stark eine Immobilie das senkt und was daraus an Privatvermögen entsteht. Ohne Anmeldung.",

    einkommenTitel: "Dein Einkommen",
    einkommenIntro:
      "Je mehr du verdienst, desto härter greift das Finanzamt zu, und desto größer ist der Hebel. Wir rechnen zuerst aus, wie viel du heute abgibst.",
    bruttoLabel: "Jahresbrutto (€)",
    bruttoHinweis:
      "Das Bruttogehalt vor allen Abzügen, so wie es im Arbeitsvertrag steht. Bei monatlicher Zahlung: Brutto pro Monat × 12, plus Weihnachts- und Urlaubsgeld.",
    beispiel: (n: number) => `z. B. ${zahlText(n, "de")}`,
    steuerklasseLabel: "Steuerklasse",
    steuerklasseHinweis:
      "Steht auf deiner Gehaltsabrechnung. Die Klasse bestimmt nur den monatlichen Lohnsteuerabzug. Für die Jahressteuer zählt, ob du einzeln veranlagt wirst (I und II) oder gemeinsam mit deinem Partner (III, IV und V, Ehegattensplitting).",
    steuerklassen: {
      I: "I, Ledig",
      II: "II, Alleinerziehend",
      III: "III, Verheiratet, ich verdiene mehr",
      IV: "IV, Verheiratet, beide ähnlich",
      V: "V, Verheiratet, Partner verdient mehr",
    } satisfies Record<Steuerklasse, string>,
    partnerLabel: "Jahresbrutto deines Partners (€)",
    partnerHinweis:
      "Beim Ehegattensplitting wird die Steuer für euch beide zusammen berechnet, deshalb brauchen wir beide Gehälter. Vorbelegt ist die übliche Aufteilung deiner Steuerklasse, bitte trag den echten Wert ein.",

    familieTitel: "Deine Familie",
    familieIntro: "Kinder, Bundesland und Kirchensteuerpflicht verändern deine Steuerlast direkt.",
    kinderLabel: "Kinder",
    kinderHinweisGemeinsam: (freibetrag: number) =>
      `Bei gemeinsamer Veranlagung steht dir der volle Kinderfreibetrag von ${eDe(freibetrag)} je Kind zu.`,
    kinderHinweisEinzeln: (halberFreibetrag: number) =>
      `Einzeln veranlagt steht dir der halbe Kinderfreibetrag zu, also ${eDe(halberFreibetrag)} je Kind. Die andere Hälfte gehört dem anderen Elternteil, solange sie nicht übertragen wurde.`,
    kinderOptionen: ["Keine Kinder", "1 Kind", "2 Kinder", "3 Kinder", "4 oder mehr"],
    bestehendeLabel: "Bestehende Immobilien",
    bestehendeHinweis:
      "Wenn du bereits Objekte hältst, sind deren Steuervorteile schon genutzt, wir ziehen sie ab. Als Erstinvestor wählst du „Noch keine“.",
    bestehendeOptionen: ["Noch keine, Erstinvestor", "1 Objekt", "2 Objekte", "3 oder mehr"],
    bundeslandLabel: "Bundesland",
    bundeslandHinweis:
      "Es bestimmt zweierlei: den Kirchensteuersatz (8 % in Bayern und Baden-Württemberg, sonst 9 %) und die Grunderwerbsteuer, die zwischen 3,5 und 6,5 Prozent liegt und damit die Kaufnebenkosten. Ohne Angabe rechnen wir mit dem Bundesdurchschnitt.",
    bundeslandOhne: "Keine Angabe, Bundesdurchschnitt",
    kircheTitel: "Kirchensteuer",
    kircheUnter: "Der Satz ergibt sich aus dem Bundesland oben",
    kircheHinweis: "Kirchensteuerpflichtig bist du als Kirchenmitglied, das steht ebenfalls auf deiner Gehaltsabrechnung.",

    zielTitel: "Dein Ziel",
    zielIntro:
      "Wie groß soll dein Hebel sein? Für den Anfang zeigen wir gern das volle Potenzial, so siehst du, wie viel Investitionskapital tatsächlich in deiner Steuerlast steckt.",
    hebelLabel: "Wie groß soll dein steuerlicher Hebel sein?",
    hebelHinweis:
      "„Maximal“ zeigt den vollen Hebel. Umsetzen musst du das nicht auf einmal, die meisten starten mit einem Objekt.",
    hebelOptionen: {
      maximal: "Maximal, mein volles Potenzial zeigen",
      ausgewogen: "Ausgewogen, etwa die Hälfte",
      vorsichtig: "Vorsichtig, ein erster Schritt",
    } satisfies Record<Hebelziel, string>,

    berechnen: "Steuerlast und Potenzial berechnen",
    ungueltig: (min: number, max: number) =>
      `Bitte ein Jahresbrutto zwischen ${eDe(min)} und ${eDe(max)} eintragen.`,

    leerTitel: "Dein Ergebnis erscheint hier",
    leerText:
      "Trag links deine Eckdaten ein. Du siehst dann deine heutige Steuerlast, wie stark sie mit einer Immobilie sinkt und was daraus über zehn Jahre an Privatvermögen wird.",

    schritt1: "Schritt 1 · Das zahlst du heute an Steuern",
    schritt1Paar: ", du und dein Partner zusammen",
    proJahr: " / Jahr",
    einkommensteuer: (n: number) => `Einkommensteuer ${eDe(n)}`,
    soli: (n: number) => `Solidaritätszuschlag ${eDe(n)}`,
    kirchensteuer: (n: number) => `Kirchensteuer ${eDe(n)}`,
    grundlage: (g: RechnerGrundlage) =>
      `Gerechnet mit ${
        g.splitting
          ? `Zusammenveranlagung (Ehegattensplitting), deinem Brutto von ${eDe(g.brutto)} und ${eDe(g.partnerBrutto)} für deinen Partner`
          : `Einzelveranlagung (Grundtarif) und einem Brutto von ${eDe(g.brutto)}`
      }${g.kinderfreibetrag > 0 ? `, Kinderfreibetrag ${eDe(g.kinderfreibetrag)}` : ""}. Zu versteuerndes Einkommen ${eDe(g.zvE)}, Grenzsteuersatz ${zahlFrei(g.grenzsteuersatz * 100, "de", 1)} Prozent.`,
    zehnJahre: "In den nächsten zehn Jahren:",
    geldWeg:
      "Dieses Geld ist weg, sobald es abgeführt ist. Es baut kein Vermögen auf, für niemanden außer den Staat.",

    schritt2: "Schritt 2 · So sinkt deine Steuer mit einer Wohnung",
    schritt2Text:
      "Eine vermietete Wohnung kostet in den ersten Jahren mehr, als sie einbringt: Abschreibung, Zinsen und laufende Kosten übersteigen die Miete. Dieses Minus ziehst du von deinem Einkommen ab, bevor das Finanzamt rechnet. Dein zu versteuerndes Einkommen sinkt, und damit deine Steuer.",
    heute: "heute",
    mitWohnung: "mit einer Wohnung",
    ersparnisProJahr: "Ersparnis pro Jahr",
    gerechnetMit: "Gerechnet mit:",
    wohnungSenkt: (n: number) => `Eine solche Wohnung senkt deine Steuer um ${eDe(n)} im Jahr.`,
    mehrereWohnungen: (anzahl: number) =>
      `Für dein gewähltes Ziel wären es ${zahlText(anzahl, "de")} solcher Wohnungen, aufgebaut über mehrere Jahre.`,

    schritt3: "Schritt 3 · So wird daraus dein Privatvermögen",
    schritt3Text:
      "Drei Größen, die man auseinanderhalten muss: Dein Anteil an der Wohnung wächst, die gesparte Steuer deckt die Lücke zwischen Miete und Rate, und was danach noch fehlt, zahlst du zu. Erst alle drei zusammen ergeben, was nach zehn Jahren übrig bleibt.",
    anteilTitel: "Dein Anteil an der Wohnung",
    anteilText: (tilgung: number, wertzuwachs: number, restschuld: number) =>
      `${eDe(tilgung)} Schulden sind getilgt, bezahlt überwiegend aus der Miete deines Mieters, dazu ${eDe(wertzuwachs)} angenommener Wertzuwachs. Offen bleiben dann noch ${eDe(restschuld)} Restschuld. Bei einem Verkauf nach mehr als zehn Jahren bliebe dir nach Ablösung des Darlehens ungefähr dieser Betrag, ohne Steuer auf den Gewinn, aber vor Verkaufskosten. Der Wertzuwachs ist eine Modellannahme und keine Zusage.`,
    gespartTitel: "Gesparte Steuer in zehn Jahren",
    gespartText: (fuerRaten: number) =>
      `Dieses Geld fließt zu dir zurück, über die Steuererklärung oder monatlich über einen Freibetrag auf der Lohnabrechnung. Ehrlich dazu gehört, wohin es geht: ${eDe(fuerRaten)} davon gehen in die Lücke zwischen Miete und Rate.`,
    zuzahlungVor: "Sie reicht dafür nicht ganz, über zehn Jahre bleibt eine Zuzahlung von",
    zuzahlungNach: (ersterMonat: number) =>
      `, das sind ${eDe(ersterMonat)} im ersten Monat. Kein verlorenes Geld: Der größte Teil davon ist Tilgung und steht oben wieder als dein Anteil an der Wohnung.`,
    freiVor: "Danach bleiben",
    freiNach: "frei verfügbar.",
    einsatzTitel: "Dein eigener Einsatz",
    einsatzText: (nebenkostenProzent: number, mitBundesland: boolean) =>
      `Das sind die Kaufnebenkosten von ${zahlFrei(nebenkostenProzent, "de", 1)} Prozent, also Grunderwerbsteuer ${
        mitBundesland ? "deines Bundeslandes" : "im Bundesdurchschnitt"
      } plus Notar und Grundbuch. Der Kaufpreis selbst wird finanziert.`,
    zuwachsTitel: "Dein Vermögenszuwachs nach zehn Jahren",
    zuwachsText: (anteil: number, zuzahlung: number, einsatz: number, steuer10J: number) =>
      `${eDe(anteil)} Vermögensaufbau, abzüglich ${eDe(zuzahlung)} Zuzahlung über zehn Jahre und ${eDe(einsatz)} Einsatz beim Kauf. Ohne Immobilie hättest du in denselben zehn Jahren ${eDe(steuer10J)} Steuern abgeführt und besäßest dafür nichts.`,

    wegTitel: "Dein Weg dorthin",
    detailrechnung: "Detailrechnung anfordern",

    dazuTitel: "Was dazugehört:",
    sonder7b: (erstesJahr: number, fuenftesJahr: number) =>
      `Die volle Wirkung entsteht in den ersten vier Jahren: Im ersten Jahr sind es ${eDe(erstesJahr)}, ab dem fünften nur noch ${eDe(fuenftesJahr)}, weil die Sonderabschreibung nach § 7b EStG ausläuft. Sie setzt außerdem voraus, dass du mindestens zehn Jahre durchgehend vermietest.`,
    ohne7b: (erstesJahr: number, letztesJahr: number) =>
      `Die Ersparnis fällt über die Jahre leicht, von ${eDe(erstesJahr)} im ersten auf ${eDe(letztesJahr)} im zehnten Jahr, weil der abziehbare Zins mit der Tilgung sinkt.`,
    finanzTitel: "Finanzierung und laufende Kosten:",
    finanzText: (zins: number, tilgung: number, kosten: number) =>
      `Gerechnet ist mit ${prozDe(zins)} Sollzins und ${prozDe(tilgung)} anfänglicher Tilgung, der Kaufpreis wird voll finanziert. Vom Mietsoll gehen zwei Prozent Mietausfallwagnis ab (§ 29 II. BV), dazu ${eDe(kosten)} im Jahr für Verwaltung und Instandhaltungsrücklage, die du nicht auf den Mieter umlegen kannst.`,
    haftung:
      "Vereinfachte Modellrechnung nach § 32a EStG, Stand 2026, mit typisierten Annahmen zu Sozialabgaben, Objektwert, Zins und Abschreibung. Angesetzt sind die Pauschbeträge für Werbungskosten und Sonderausgaben sowie die abziehbaren Vorsorgeaufwendungen. Kindergeld und die Günstigerprüfung dazu bleiben außen vor. Deine tatsächlichen Werte können hiervon abweichen. Ersetzt keine individuelle Steuer- oder Anlageberatung.",

    /** Anzeige der Anlageklassen aus dem Rechenkern, nach Kennung. */
    klassen: {
      neubau: {
        titel: ASSETKLASSEN.neubau.titel,
        kurz: ASSETKLASSEN.neubau.kurz,
        erklaerung: ASSETKLASSEN.neubau.erklaerung,
      },
      bestand: {
        titel: ASSETKLASSEN.bestand.titel,
        kurz: ASSETKLASSEN.bestand.kurz,
        erklaerung: ASSETKLASSEN.bestand.erklaerung,
      },
      wg: {
        titel: ASSETKLASSEN.wg.titel,
        kurz: ASSETKLASSEN.wg.kurz,
        erklaerung: ASSETKLASSEN.wg.erklaerung,
      },
    } satisfies Record<AssetklassenId, { titel: string; kurz: string; erklaerung: string }>,
  },

  steuerlast: {
    punkte: [
      {
        titel: "Steuern sind dein größter Ausgabeposten.",
        text: "Wer überdurchschnittlich verdient, führt über ein Berufsleben mehr Einkommensteuer ab, als eine Eigentumswohnung kostet. Dieses Geld baut Vermögen auf, nur nicht deins.",
      },
      {
        titel: "Deine Rentenlücke steht heute schon fest.",
        text: "Die Beitragsbemessungsgrenze deckelt deine Ansprüche, deinen Lebensstandard deckelt sie nicht. Je besser du verdienst, desto größer der Abstand zwischen dem, was du gewohnt bist, und dem, was später kommt.",
      },
      {
        titel: "Sparen ist der teuerste Umweg.",
        text: "Guthaben auf dem Konto verliert bei rund 2 % Inflation in zehn Jahren etwa ein Fünftel seiner Kaufkraft. Du machst nichts falsch und wirst trotzdem ärmer.",
      },
    ],
    kicker: "Das Problem · Über zehn Jahre",
    titelVor: "Die Rechnung, die",
    titelBetont: "niemand aufmacht",
    intro:
      "Drei Zahlen, die für gut verdienende Menschen in Deutschland gelten. Keine davon ist neu. Über keine davon spricht jemand gern.",
    lueckeText: "Sie entsteht nicht dadurch, dass du zu wenig verdienst.",
    schlussSatz:
      "Alle drei Zahlen verschlechtern sich, während du diese Seite liest. Nicht dramatisch, nicht plötzlich, aber jedes Jahr ein Stück.",
    schlussText:
      "Deshalb ist „erst mal nichts entscheiden“ keine neutrale Option. Es ist die Entscheidung, dass alles so bleibt. Wer heute viel Steuern zahlt, hat dagegen einen Hebel, den die meisten ungenutzt lassen: Ein Teil dieser Steuerlast lässt sich legal in privates Immobilienvermögen umwandeln.",
  },

  /** Die Schere in `charts/LueckenZeitachse.tsx`, dazu ihre Legende auf dem Handy. */
  zeitachse: {
    ariaLabel:
      "Schematische Zeitachse über zehn Jahre. Das Einkommen steigt stärker als der Anteil, der daraus Vermögen wird. Dazwischen liegt die Lücke.",
    luecke: "Die Lücke",
    heute: "Heute",
    inZehnJahren: "In zehn Jahren",
    einkommen: "Dein Einkommen",
    vermoegen: "Was davon Vermögen wird",
    hinweis: "Schematische Darstellung, keine Prognose.",
  },

  investmentwelten: {
    kicker: "Unsere Investmentkonzepte",
    titelVor: "Drei Wege,",
    titelBetont: "dasselbe Ziel",
    intro:
      "Es gibt nicht die eine richtige Kapitalanlage. Es gibt die richtige für deine Steuerlast, deine Bonität und deinen Zeithorizont. Welcher Weg das ist, entscheidet deine Situation, nicht unser Angebot.",
    steuerhebel: "Steuerhebel",
    passtZu: "Passt zu",
    schluss:
      "Du musst dich jetzt nicht entscheiden. Der Steuer- und Eignungscheck auf dieser Seite schlägt dir vor, welcher Weg rechnerisch zu dir passt.",
    welten: [
      {
        clipAlt: "Rundgang durch das Neubauprojekt, von außen nach innen",
        label: "Neubau",
        claim: "Für die höchste Steuerlast.",
        text: "Erstbezug, volle Gewährleistung, keine Instandhaltungsüberraschungen. Der stärkste Abschreibungshebel in den ersten Jahren und die geringste Arbeit für dich.",
        hebel: "5 % Sonderabschreibung nach § 7b zusätzlich zur degressiven AfA",
        passt: "Hohe Steuerlast, langer Horizont, wenig Zeit",
      },
      {
        clipAlt: "Drohnenanflug über die sanierte Wohnanlage",
        label: "Sanierter Bestand",
        claim: "Der bewährte Einstieg.",
        text: "Gewachsene Lage, vorhandene Mieterstruktur, planbare Mieten und meist der attraktivere Quadratmeterpreis. Kernsaniert, also technisch neuwertig bei Bestandsvorteilen.",
        hebel: "Laufende AfA plus sofort absetzbarer Erhaltungsaufwand",
        passt: "Solider Start mit überschaubarem Risiko",
      },
      {
        clipAlt: "Rundgang durch die möblierte Wohnung",
        label: "WG- & Co-Living",
        claim: "Für die höchste Mietrendite.",
        text: "Eine Wohnung, mehrere möblierte Einheiten, all-inclusive vermietet und professionell verwaltet. Deutlich höhere Rendite pro Quadratmeter bei aktiverem Konzept.",
        hebel: "AfA auf Gebäude und Möblierung, höherer Mietüberschuss",
        passt: "Renditeorientiert, offen für moderne Konzepte",
      },
    ],
  },

  steuervorteile: {
    kicker: "Steuervorteile",
    titelVor: "Warum der Staat deine Immobilie",
    titelVarianten: ["mitfinanziert", "mitträgt", "mit aufbaut"],
    intro:
      "Vermietete Immobilien sind die einzige Anlageklasse in Deutschland, bei der dir der Gesetzgeber vier Hebel gleichzeitig in die Hand gibt.",
    /** Nachsatz der Hochzähl-Prozente in der AfA-Karte. */
    prozentZeichen: " %",
    afaTitel: "AfA",
    afaVor:
      "Der Staat unterstellt, dass dein Gebäude an Wert verliert, und lässt dich diesen Verlust absetzen, während die Immobilie real meist zulegt. Neubau ab 2023:",
    afaMitte: "pro Jahr, Bestand ab Baujahr 1925:",
    afaEnde: ".",
    zinsenTitel: "Zinsen",
    zinsenText:
      "Finanzierungszinsen sind bei vermieteten Immobilien voll absetzbar. Genau deshalb ist viel Eigenkapital bei einer Kapitalanlage oft die schlechtere Wahl als wenig.",
    werbungskostenTitel: "Werbungskosten",
    werbungskostenText:
      "Verwaltung, Instandhaltung, Fahrtkosten, Kontoführung, Steuerberatung für die Anlage V. Was mit der Vermietung zu tun hat, mindert deine Steuerlast.",
    verlustTitel: "Verlustverrechnung",
    verlustText:
      "Übersteigen die Kosten anfangs die Miete, mindert das dein zu versteuerndes Einkommen. Bei Angestellten oft monatlich spürbar, nicht erst mit dem Steuerbescheid.",
    steuerfreiTitel: "Und nach zehn Jahren: steuerfrei.",
    steuerfreiText:
      "Verkaufst du eine vermietete Immobilie nach Ablauf der Spekulationsfrist von zehn Jahren, bleibt der Gewinn für dich steuerfrei. Diese Kombination aus laufenden Steuerersparnissen über die gesamte Haltedauer und ein steuerfreier Verkaufsgewinn am Ende bietet dir in Deutschland keine andere Anlageklasse.",
    hinweis: "Vereinfachte Darstellung geltenden Steuerrechts, Stand 2026. Ersetzt keine individuelle Steuerberatung.",
  },

  neubau: {
    kicker: "Musterrechnung Neubau",
    titelVor: "Ein Rechenbeispiel, das den",
    titelBetont: "Unterschied zeigt",
    intro:
      "Neubau-Wohnung, 83 m², Fertigstellung 2027. Käufer: ledig, 120.000 € zu versteuerndes Einkommen. Alle Zahlen aus einer tatsächlich gerechneten Kalkulation.",
    objektTitel: "Das Objekt",
    kaufpreis: "Kaufpreis",
    nebenkosten: (prozent: number) => `Erwerbsnebenkosten (${prozentText(prozent, "de", 0)})`,
    eigenkapital: "Eigenkapital",
    finanzierung: "Finanzierung",
    kaltmiete: "Kaltmiete",
    objektText:
      "Eingesetzt wird nur der Betrag für die Kaufnebenkosten. Der Kaufpreis selbst wird über ein Bankdarlehen zu 3,80 % und ein KfW-Förderdarlehen zu 2,68 % finanziert.",
    steuerTitel: "Der Steuerhebel",
    abschreibungJahr1: "Abschreibung im 1. vollen Jahr",
    steuerVorher: "Steuerlast vorher",
    steuerNachher: "Steuerlast nachher",
    ersparnisJahr1: "Ersparnis Jahr 1",
    ersparnis10: "Ersparnis über 10 Jahre",
    steuerText:
      "Möglich wird das durch 5 % Sonderabschreibung nach § 7b EStG zusätzlich zur degressiven Abschreibung von 5 %, zusammen 10 % im ersten Jahr.",
    monatTitel: "Was monatlich passiert",
    monatJahr1: "1. volles Jahr, nach Tilgung",
    monatSchnitt: "Durchschnitt über 10 Jahre",
    monatAb6: "Ab dem 6. Jahr",
    monatText:
      "In den ersten Jahren zahlt die Wohnung Geld aus, statt zu kosten. Wenn die Sonderabschreibung nach vier Jahren ausläuft, dreht sich das um.",
    zehnTitel: "Nach zehn Jahren",
    objektwert: "Objektwert bei 2 % p. a.",
    restschuld: "Restschuld",
    getilgt: "davon getilgt",
    verkaufserloes: "Verkaufserlös",
    zehnText: (eigenkapital: number) =>
      `Aus ${eDe(eigenkapital)} eingesetztem Eigenkapital. Nach Ablauf der Spekulationsfrist bleibt ein Verkaufsgewinn steuerfrei.`,
    proMonat: (n: number) => `${eDe(n)} / Monat`,
    proJahr: (n: number) => `${eDe(n)} / Jahr`,
    plusProMonat: (n: number) => `+ ${eDe(n)} / Monat`,
    minusSpanneProMonat: (von: number, bis: number) => `− ${zahlText(von, "de")} bis − ${eDe(bis)} / Monat`,
    kernTitel: "Was hier eigentlich passiert",
    kernVor: "Ohne diese Immobilie zahlt der Käufer in zehn Jahren rund",
    kernOhne: "456.000 € Steuern",
    kernMitte: ". Mit ihr sind es",
    kernMit: "387.000 €",
    kernNach:
      ". Die Differenz von 68.227 € bleibt nicht einfach auf seinem Konto liegen, sie finanziert eine Wohnung mit, die ihm gehört. Nach zehn Jahren steht deren Wert bei rund 536.000 €, die Restschuld bei 371.000 €.",
    kernSchluss:
      "Das ist der ganze Gedanke: Steuer ist Geld, das du ohnehin zahlst. Die einzige offene Frage ist, ob es im Bundeshaushalt landet, oder in deinem Eigentum.",
    ehrlichTitel: "Was wir ehrlich dazusagen",
    ehrlichPunkte: [
      "Die Steuerersparnis ist in den ersten vier Jahren am höchsten, danach läuft die Sonderabschreibung aus und der Effekt sinkt deutlich.",
      "Ab dem sechsten Jahr kostet die Wohnung rund 200 € im Monat, statt auszuzahlen.",
      "Die Sonderabschreibung setzt voraus, dass du mindestens zehn Jahre durchgehend vermietest. Eigennutzung oder ein früherer Verkauf lassen den Vorteil entfallen.",
      "Wertsteigerung und Mietentwicklung sind Annahmen, keine Zusagen. Gerechnet wurde bewusst mit konservativen 2 % pro Jahr.",
    ],
    befristetTitel: "Zeitlich begrenzt:",
    befristetText:
      "Die Kombination aus Sonderabschreibung nach § 7b EStG und degressiver Abschreibung gilt für Bauanträge bis zum 30.09.2029. Voraussetzung sind unter anderem eine Baukostenobergrenze von 5.200 € je m² und der Effizienzhaus-40-Standard mit QNG-Siegel. Diese Frist setzt der Gesetzgeber, nicht wir.",
    hinweis:
      "Unverbindliches Musterbeispiel auf Basis einer realen Kalkulation, Stand 2026. Die Übertragbarkeit auf deine persönliche Situation kann nicht garantiert werden. Ersetzt keine individuelle Steuer- oder Anlageberatung.",
  },

  steuerVergleich: {
    titel: "Zehn Jahre Steuern, dieselbe Summe, zwei Verwendungen",
    text: "Beide Säulen sind gleich hoch. Der Unterschied liegt nicht darin, wie viel Geld fließt, sondern wohin.",
    abgefuehrt: "An das Finanzamt abgeführt",
    umgewandelt: "In dein Eigentum umgewandelt",
    ohneImmobilie: "Ohne Immobilie",
    mitImmobilie: "Mit Immobilie",
    tausend: tausendDe,
    eigentumPlus: (n: number) => `+ ${tausendDe(n)} Eigentum`,
    fussnote:
      "Zehn Jahre kumuliert, Musterfall dieser Seite. 455.659 € gegenüber 387.431 € Steuer zuzüglich 68.227 €, die in die Finanzierung der eigenen Wohnung fließen.",
  },

  vermoegensaufbau: {
    titel: (erloes: number) => `Woraus die ${eDe(erloes)} entstehen`,
    text: "Dein Mieter tilgt, der Markt legt zu. Beides zusammen ergibt am Ende den Verkaufserlös.",
    getilgt: "Getilgte Schulden",
    wertsteigerung: "Wertsteigerung",
    wertsteigerungLegende: "Wertsteigerung (2 % p. a.)",
    zusammen: "Zusammen",
    eigenkapitalLinie: (n: number) => `Eigenkapital ${eDe(n)}`,
    tausend: tausendDe,
    voll: eDe,
    fussnote:
      "Die Steuerersparnis ist hier bewusst nicht mitgezählt, sie fließt bereits in die laufende Liquidität und würde die Summe doppelt ausweisen. Wertsteigerung ist eine konservative Annahme, keine Zusage.",
  },

  investoren: {
    kicker: "Für wen wir passen",
    titelVor: "Vier Investoren-Profile,",
    titelVarianten: ["ein klares Konzept", "eine klare Strategie", "ein klarer Plan"],
    intro:
      "Es gibt nicht die eine richtige Kapitalanlage. Es gibt die richtige für deine Steuerlast, deine Bonität und deinen Zeithorizont. Welcher Weg das ist, entscheidet deine Situation, nicht unser Angebot.",
    bahnLabel: "Vier Investoren-Profile, seitlich blätterbar",
    profile: [
      {
        kicker: "Unternehmer",
        titel: "Du führst dein eigenes Unternehmen.",
        text: "Du erzielst regelmäßig starke Gewinne und möchtest nicht dein gesamtes Vermögen im Unternehmen binden. Mit der richtigen Immobilienstrategie schaffst du planbare Sachwerte, Steuereffekte und Vermögenswachstum außerhalb des operativen Geschäfts.",
        punkte: [
          "GmbH- oder Holding-Strukturen sinnvoll einbinden",
          "Steuerliche Gestaltungspotenziale strategisch nutzen",
          "Privatvermögen außerhalb des Unternehmens aufbauen",
        ],
        hinweis: "Geeignet ab ca. 8.000 € Gewinn pro Monat",
      },
      {
        kicker: "Gutverdiener",
        titel: "Du verdienst überdurchschnittlich.",
        text: "Du arbeitest erfolgreich, zahlst hohe Steuern und hast wenig Zeit, dich selbst um Objektauswahl, Finanzierung und Strategie zu kümmern. MOREImmo hilft dir, deine Bonität gezielt für ein Immobilienportfolio einzusetzen.",
        punkte: [
          "Starke Bonität als Investmentvorteil nutzen",
          "Immobilienstrategie mit Steuerfokus entwickeln",
          "Einstiegsoptionen auch ohne großes Eigenkapital prüfen",
        ],
        hinweis: "Geeignet ab ca. 4.500 € netto pro Monat",
      },
      {
        kicker: "Selbstständige",
        titel: "Du bist selbstständig oder Freiberufler.",
        text: "Dein Einkommen ist stark, aber nicht immer gleichmäßig. Viele Banken bewerten Selbstständige zu pauschal. Wir strukturieren deine Unterlagen professionell und prüfen Finanzierungen mit Partnern, die unternehmerische Einkommenssituationen verstehen.",
        punkte: [
          "Finanzierungspartner mit Erfahrung bei Selbstständigen",
          "Professionelle Aufbereitung deines Bonitätsprofils",
          "Schritt für Schritt zu einem robusten Portfolio",
        ],
        hinweis: "Geeignet ab ca. 3 Jahren Selbstständigkeit",
      },
      {
        kicker: "Angestellte",
        titel: "Du bist festangestellt und willst strukturiert starten.",
        text: "Stabiles Einkommen und gute Bonität sind ideale Voraussetzungen für den Einstieg in deine erste Kapitalanlage-Immobilie. MOREImmo hilft dir, Finanzierung sauber zu planen und Steuervorteile sinnvoll zu nutzen.",
        punkte: [
          "Erste Kapitalanlage sicher und planbar angehen",
          "Einkommen und Bonität gezielt einsetzen",
          "Steuervorteile beim Immobilien-Vermögensaufbau nutzen",
        ],
        hinweis: "Geeignet ab ca. 2.800 € netto pro Monat",
      },
    ],
  },

  unternehmen: {
    kicker: "Warum MOREImmo",
    titelVor: "Strategisches Immobilienwachstum mit Struktur,",
    titelBetont: "Substanz und System",
    intro:
      "MOREImmo verbindet langjährige Markterfahrung, geprüfte Investmentstrategien und ein starkes Partnernetzwerk für anspruchsvolle Investoren.",
    vorteile: [
      {
        titel: "Fokus Bayern + Top-Lagen",
        text: "Schwerpunkt München, Nürnberg, Regensburg, Augsburg, plus geprüfte A- und B-Lagen bundesweit.",
      },
      {
        titel: "Geprüfte Investmentobjekte",
        text: "Vom Bauträger, Off-Market oder Bestand, jedes Objekt durchläuft unseren Prüfprozess.",
      },
      {
        titel: "Drei Investmentkonzepte",
        text: "Co-Living, KfW-40 Neubau und sanierte Bestandsimmobilien, je nach Bonität und Zielsetzung.",
      },
      {
        titel: "Full-Service-Ansatz",
        text: "Strategie, Finanzierung, Kauf, Vermietung und Verwaltung aus einer Hand.",
      },
      {
        titel: "Erfahrenes Team",
        text: "20+ Berater und Mitarbeiter, die deine Ziele, Zahlen und Langfriststrategie im Blick behalten.",
      },
    ],
    bilanzTitel: "Belastbare Bilanz",
    /** Nach der hochgezählten 350. */
    bilanzInvestoren: "+ betreute Investoren,",
    /** Nach der hochgezählten 450. */
    bilanzEinheiten: "+ vermittelte Einheiten, 9-stelliges Finanzierungsvolumen.",
  },
};

export type MikroseiteTexte = typeof de;

/* ══════════════════════════════════════════════════════════════
   Englisch
   ══════════════════════════════════════════════════════════════ */

const en: MikroseiteTexte = {
  allgemein: {
    erstberatung: "Book a free initial meeting",
  },

  hero: {
    titelVor: "Turn your tax burden into",
    titelVarianten: ["lasting property wealth.", "lasting private wealth.", "property that belongs to you."],
    unterzeile:
      "If you earn well in Germany, you pay a marginal tax rate of up to 42%. Part of that can legally be redirected into your own portfolio instead of being paid away.",
    zielgruppe:
      "For business owners, executives, the self-employed and employees. Vetted properties, tax-optimised concepts and financing from a single source.",
    punkte: [
      "Vetted investment properties in top German locations",
      "Tax-optimised investment concepts",
      "Strategic portfolio building over 10 to 15 years",
      "Financing & implementation from a single source",
    ],
    kennzahlen: ["350+ investors supported", "450+ units brokered", "700+ partner banks", "20+ sales partners & staff"],
    rechnerLink: "Calculate my tax relief",
    gebaeudeAlt: "Modern residential property",
    portraetUeber: "Your contact person at MOREImmo",
    beruf: "Sales partner",
    weiter: "Scroll",
  },

  bento: {
    kicker: "What you get",
    titelZeile1: "Everything you need for your",
    titelZeile2: "first investment.",
    text: "Vetted properties, tax-optimised concepts and one contact person who supports you for years. All from a single source.",
    objekte: {
      eyebrow: "Properties",
      titel: "Vetted investment properties in top German locations.",
      text: "Every property goes through a structural, legal and tax review before it is presented to you.",
    },
    steuern: {
      eyebrow: "Taxes",
      titel: "Building depreciation (AfA), special depreciation, maintenance expenses.",
      text: "Maximise your tax relief.",
    },
    finanzierung: {
      eyebrow: "Financing",
      titel: "700+ partner banks.",
      text: "We obtain the terms that suit your situation.",
    },
    strategie: {
      eyebrow: "Strategy",
      titel: "Portfolio building over 10 to 15 years.",
      text: "A clear plan instead of a one-off deal, step by step towards financial freedom.",
    },
    betreuung: {
      eyebrow: "Support",
      titel: "One contact person. For years.",
      text: "No call centre, no hand-offs. You always speak to the same person.",
    },
  },

  rechner: {
    badge: "Tax & suitability check",
    titelZeile1: "How much tax do you pay,",
    titelZeile2: "and how much of it could work for you instead?",
    intro:
      "A few details are enough. In three steps you'll see what you pay today, how much a property reduces it and how much private wealth that creates. No sign-up needed.",

    einkommenTitel: "Your income",
    einkommenIntro:
      "The more you earn, the bigger the tax office's share, and the bigger the lever. First, we work out how much you hand over today.",
    bruttoLabel: "Annual gross salary (€)",
    bruttoHinweis:
      "Your gross salary before all deductions, as stated in your employment contract. If you're paid monthly: gross per month × 12, plus Christmas and holiday bonuses.",
    beispiel: (n: number) => `e.g. ${zahlText(n, "en")}`,
    steuerklasseLabel: "Tax class (Steuerklasse)",
    steuerklasseHinweis:
      "You'll find it on your payslip. The class only determines the monthly wage tax deduction. For the annual tax, what counts is whether you're assessed individually (I and II) or jointly with your spouse (III, IV and V, known as Ehegattensplitting).",
    steuerklassen: {
      I: "I, single",
      II: "II, single parent",
      III: "III, married, I earn more",
      IV: "IV, married, similar incomes",
      V: "V, married, my spouse earns more",
    },
    partnerLabel: "Your spouse's annual gross salary (€)",
    partnerHinweis:
      "With joint assessment, tax is calculated for both of you together, so we need both salaries. It's prefilled with the usual split for your tax class; please enter the actual figure.",

    familieTitel: "Your family",
    familieIntro: "Children, your federal state (Bundesland) and church tax liability directly affect your tax burden.",
    kinderLabel: "Children",
    kinderHinweisGemeinsam: (freibetrag: number) =>
      `With joint assessment you're entitled to the full child allowance (Kinderfreibetrag) of ${eEn(freibetrag)} per child.`,
    kinderHinweisEinzeln: (halberFreibetrag: number) =>
      `With individual assessment you're entitled to half the child allowance (Kinderfreibetrag), i.e. ${eEn(halberFreibetrag)} per child. The other half belongs to the other parent unless it has been transferred.`,
    kinderOptionen: ["No children", "1 child", "2 children", "3 children", "4 or more"],
    bestehendeLabel: "Existing properties",
    bestehendeHinweis:
      "If you already own properties, their tax benefits are already in use, so we deduct them. As a first-time investor, choose “None yet”.",
    bestehendeOptionen: ["None yet, first-time investor", "1 property", "2 properties", "3 or more"],
    bundeslandLabel: "Federal state",
    bundeslandHinweis:
      "It determines two things: the church tax rate (8% in Bavaria and Baden-Württemberg, 9% elsewhere) and the real estate transfer tax (Grunderwerbsteuer), which ranges from 3.5 to 6.5 per cent and therefore drives the incidental purchase costs. Without a selection, we use the national average.",
    bundeslandOhne: "Not specified, national average",
    kircheTitel: "Church tax (Kirchensteuer)",
    kircheUnter: "The rate follows from the federal state above",
    kircheHinweis: "You're liable for church tax if you're a church member; this is also shown on your payslip.",

    zielTitel: "Your goal",
    zielIntro:
      "How big should your lever be? To start with, we like to show the full potential, so you can see how much investment capital is really hidden in your tax burden.",
    hebelLabel: "How big should your tax lever be?",
    hebelHinweis:
      "“Maximum” shows the full lever. You don't have to do it all at once; most people start with one property.",
    hebelOptionen: {
      maximal: "Maximum, show my full potential",
      ausgewogen: "Balanced, about half",
      vorsichtig: "Cautious, a first step",
    },

    berechnen: "Calculate tax burden and potential",
    ungueltig: (min: number, max: number) =>
      `Please enter an annual gross salary between ${eEn(min)} and ${eEn(max)}.`,

    leerTitel: "Your result will appear here",
    leerText:
      "Enter your key figures. You'll then see your current tax burden, how much it falls with a property and how much private wealth that builds over ten years.",

    schritt1: "Step 1 · What you pay in tax today",
    schritt1Paar: ", you and your spouse combined",
    proJahr: " / year",
    einkommensteuer: (n: number) => `Income tax ${eEn(n)}`,
    soli: (n: number) => `Solidarity surcharge ${eEn(n)}`,
    kirchensteuer: (n: number) => `Church tax ${eEn(n)}`,
    grundlage: (g: RechnerGrundlage) =>
      `Calculated with ${
        g.splitting
          ? `joint assessment (Ehegattensplitting), your gross salary of ${eEn(g.brutto)} and ${eEn(g.partnerBrutto)} for your spouse`
          : `individual assessment (basic tax table, Grundtabelle) and a gross salary of ${eEn(g.brutto)}`
      }${g.kinderfreibetrag > 0 ? `, child allowance ${eEn(g.kinderfreibetrag)}` : ""}. Taxable income ${eEn(g.zvE)}, marginal tax rate ${zahlFrei(g.grenzsteuersatz * 100, "en", 1)}%.`,
    zehnJahre: "Over the next ten years:",
    geldWeg: "Once paid, this money is gone. It builds no wealth for anyone except the state.",

    schritt2: "Step 2 · How your tax falls with one flat",
    schritt2Text:
      "In the first years, a let flat costs more than it brings in: depreciation, interest and running costs exceed the rent. You deduct this loss from your income before the tax office does its calculation. Your taxable income falls, and so does your tax.",
    heute: "today",
    mitWohnung: "with one flat",
    ersparnisProJahr: "Tax relief per year",
    gerechnetMit: "Calculated with:",
    wohnungSenkt: (n: number) => `A flat like this reduces your tax by ${eEn(n)} a year.`,
    mehrereWohnungen: (anzahl: number) =>
      `For your chosen goal, it would be ${zahlText(anzahl, "en")} such flats, built up over several years.`,

    schritt3: "Step 3 · How this becomes your private wealth",
    schritt3Text:
      "Three figures to keep apart: your share of the flat grows, the tax you save covers the gap between rent and loan instalment, and whatever is still missing, you top up. Only all three together show what's left after ten years.",
    anteilTitel: "Your share of the flat",
    anteilText: (tilgung: number, wertzuwachs: number, restschuld: number) =>
      `${eEn(tilgung)} of debt is repaid, mostly from your tenant's rent, plus ${eEn(wertzuwachs)} of assumed increase in value. That leaves ${eEn(restschuld)} of remaining debt. If you sell after more than ten years, roughly this amount would remain after repaying the loan, with no tax on the gain but before selling costs. The increase in value is a model assumption, not a promise.`,
    gespartTitel: "Tax saved over ten years",
    gespartText: (fuerRaten: number) =>
      `This money flows back to you, via your tax return or monthly through an allowance on your payslip. To be honest about where it goes: ${eEn(fuerRaten)} of it covers the gap between rent and loan instalment.`,
    zuzahlungVor: "It doesn't quite cover it; over ten years you top up",
    zuzahlungNach: (ersterMonat: number) =>
      `, which is ${eEn(ersterMonat)} in the first month. This isn't lost money: most of it is repayment and reappears above as your share of the flat.`,
    freiVor: "After that,",
    freiNach: "remains freely available.",
    einsatzTitel: "Your own contribution",
    einsatzText: (nebenkostenProzent: number, mitBundesland: boolean) =>
      `These are the incidental purchase costs of ${zahlFrei(nebenkostenProzent, "en", 1)}%, i.e. real estate transfer tax ${
        mitBundesland ? "in your federal state" : "at the national average"
      } plus notary and land register fees. The purchase price itself is financed.`,
    zuwachsTitel: "Your increase in wealth after ten years",
    zuwachsText: (anteil: number, zuzahlung: number, einsatz: number, steuer10J: number) =>
      `${eEn(anteil)} of wealth built, minus ${eEn(zuzahlung)} topped up over ten years and ${eEn(einsatz)} contributed at purchase. Without a property, you would have paid ${eEn(steuer10J)} in tax over the same ten years and would own nothing in return.`,

    wegTitel: "Your way there",
    detailrechnung: "Request a detailed calculation",

    dazuTitel: "What you should know:",
    sonder7b: (erstesJahr: number, fuenftesJahr: number) =>
      `The full effect comes in the first four years: ${eEn(erstesJahr)} in the first year, only ${eEn(fuenftesJahr)} from the fifth, because the special depreciation (Section 7b EStG) expires. It also requires you to let the property continuously for at least ten years.`,
    ohne7b: (erstesJahr: number, letztesJahr: number) =>
      `The tax relief falls slightly over the years, from ${eEn(erstesJahr)} in the first to ${eEn(letztesJahr)} in the tenth year, because the deductible interest falls as you repay.`,
    finanzTitel: "Financing and running costs:",
    finanzText: (zins: number, tilgung: number, kosten: number) =>
      `Calculated with a ${prozEn(zins)} borrowing rate and ${prozEn(tilgung)} initial repayment; the purchase price is fully financed. Two per cent of the target rent is deducted for rent loss risk (Mietausfallwagnis, Section 29 II. BV), plus ${eEn(kosten)} a year for management and the maintenance reserve (Instandhaltungsrücklage), which you cannot pass on to the tenant.`,
    haftung:
      "Simplified model calculation under Section 32a EStG, as of 2026, with standardised assumptions for social security contributions, property value, interest and depreciation. It includes the lump sums for income-related expenses (Werbungskosten) and special expenses (Sonderausgaben) as well as deductible pension and insurance contributions. Child benefit (Kindergeld) and the related comparison with the child allowance are not included. Your actual figures may differ. This does not replace individual tax or investment advice.",

    klassen: {
      neubau: {
        titel: "New build",
        kurz: "The strongest tax lever",
        erklaerung:
          "First occupancy with full warranty. In the first year you can write off 10 per cent of the building value, the biggest tax effect currently available.",
      },
      bestand: {
        titel: "Refurbished existing property",
        kurz: "The affordable way in",
        erklaerung:
          "Established location, existing tenants, smallest capital outlay. The tax effect is smaller than with a new build, but getting started is much easier.",
      },
      wg: {
        titel: "Shared flat & co-living concept",
        kurz: "The highest rent",
        erklaerung:
          "Several furnished rooms in one flat, let all-inclusive. It brings the highest rent, while the tax effect is smaller than with a new build.",
      },
    },
  },

  steuerlast: {
    punkte: [
      {
        titel: "Tax is your biggest expense.",
        text: "If you earn above average, you pay more income tax over your working life than a flat costs. That money builds wealth, just not yours.",
      },
      {
        titel: "Your pension gap is already fixed today.",
        text: "The contribution ceiling (Beitragsbemessungsgrenze) caps your pension entitlements, but not your standard of living. The more you earn, the wider the gap between what you're used to and what comes later.",
      },
      {
        titel: "Saving is the most expensive detour.",
        text: "At around 2% inflation, money in your account loses about a fifth of its purchasing power in ten years. You're doing nothing wrong and still getting poorer.",
      },
    ],
    kicker: "The problem · Over ten years",
    titelVor: "The maths",
    titelBetont: "nobody does",
    intro:
      "Three figures that apply to high earners in Germany. None of them is new. Nobody likes to talk about any of them.",
    lueckeText: "It doesn't come from earning too little.",
    schlussSatz:
      "All three figures get worse while you read this page. Not dramatically, not suddenly, but a little every year.",
    schlussText:
      "That's why “not deciding anything for now” isn't a neutral option. It's the decision that everything stays as it is. If you pay a lot of tax today, though, you have a lever that most people leave unused: part of that tax burden can legally be turned into private property wealth.",
  },

  zeitachse: {
    ariaLabel:
      "Schematic timeline over ten years. Income rises faster than the share of it that becomes wealth. The gap lies in between.",
    luecke: "The gap",
    heute: "Today",
    inZehnJahren: "In ten years",
    einkommen: "Your income",
    vermoegen: "What becomes wealth",
    hinweis: "Schematic illustration, not a forecast.",
  },

  investmentwelten: {
    kicker: "Our investment concepts",
    titelVor: "Three routes,",
    titelBetont: "one goal",
    intro:
      "There's no single right investment. There's the right one for your tax burden, your creditworthiness and your time horizon. Which route that is depends on your situation, not on what we offer.",
    steuerhebel: "Tax lever",
    passtZu: "Suits",
    schluss:
      "You don't have to decide now. The tax and suitability check on this page suggests which route fits you by the numbers.",
    welten: [
      {
        clipAlt: "Tour of the new-build project, from outside to inside",
        label: "New build",
        claim: "For the highest tax burden.",
        text: "First occupancy, full warranty, no maintenance surprises. The strongest depreciation lever in the early years and the least work for you.",
        hebel: "5% special depreciation (Section 7b EStG) on top of declining-balance depreciation (AfA)",
        passt: "High tax burden, long horizon, little time",
      },
      {
        clipAlt: "Drone approach over the refurbished residential complex",
        label: "Refurbished existing property",
        claim: "The proven way in.",
        text: "Established location, existing tenants, predictable rents and usually the more attractive price per square metre. Fully refurbished, so technically as good as new with the advantages of an existing building.",
        hebel: "Ongoing depreciation plus immediately deductible maintenance expenses (Erhaltungsaufwand)",
        passt: "A solid start with manageable risk",
      },
      {
        clipAlt: "Tour of the furnished flat",
        label: "Shared flat & co-living",
        claim: "For the highest rental yield.",
        text: "One flat, several furnished units, let all-inclusive and professionally managed. Significantly higher yield per square metre with a more active concept.",
        hebel: "Depreciation on the building and furnishings, higher rental surplus",
        passt: "Yield-focused investors open to modern concepts",
      },
    ],
  },

  steuervorteile: {
    kicker: "Tax advantages",
    titelVor: "Why the state",
    titelVarianten: ["co-finances your property", "shares your property's cost", "helps build your property"],
    intro:
      "Let property is the only asset class in Germany where the law hands you four levers at the same time.",
    prozentZeichen: "%",
    afaTitel: "Depreciation (AfA)",
    afaVor:
      "The state assumes your building loses value and lets you deduct that loss, while in reality the property usually gains value. New builds from 2023:",
    afaMitte: "a year, existing buildings from 1925:",
    afaEnde: ".",
    zinsenTitel: "Interest",
    zinsenText:
      "Financing interest on let property is fully deductible. That's exactly why a lot of equity is often the worse choice for an investment property than a little.",
    werbungskostenTitel: "Income-related expenses (Werbungskosten)",
    werbungskostenText:
      "Management, maintenance, travel costs, account fees, tax advice for the rental income form (Anlage V). Anything connected with letting reduces your tax burden.",
    verlustTitel: "Loss offsetting",
    verlustText:
      "If costs exceed the rent at first, this reduces your taxable income. Employees often feel it every month, not just when the tax assessment arrives.",
    steuerfreiTitel: "And after ten years: tax-free.",
    steuerfreiText:
      "If you sell a let property after the ten-year speculation period (Spekulationsfrist), the gain is tax-free for you. No other asset class in Germany offers this combination of ongoing tax relief throughout the holding period and a tax-free sale gain at the end.",
    hinweis: "Simplified summary of current tax law, as of 2026. This does not replace individual tax advice.",
  },

  neubau: {
    kicker: "Example calculation: new build",
    titelVor: "A worked example that",
    titelBetont: "shows the difference",
    intro:
      "New-build flat, 83 m², completion 2027. Buyer: single, €120,000 taxable income. All figures come from a calculation that was actually carried out.",
    objektTitel: "The property",
    kaufpreis: "Purchase price",
    nebenkosten: (prozent: number) => `Incidental purchase costs (${prozentText(prozent, "en", 0)})`,
    eigenkapital: "Equity",
    finanzierung: "Financing",
    kaltmiete: "Net cold rent (Kaltmiete)",
    objektText:
      "Only the incidental purchase costs are paid in. The purchase price itself is financed through a bank loan at 3.80% and a KfW development loan at 2.68%.",
    steuerTitel: "The tax lever",
    abschreibungJahr1: "Depreciation in the 1st full year",
    steuerVorher: "Tax burden before",
    steuerNachher: "Tax burden after",
    ersparnisJahr1: "Tax relief in year 1",
    ersparnis10: "Tax relief over 10 years",
    steuerText:
      "This is made possible by 5% special depreciation (Section 7b EStG) on top of 5% declining-balance depreciation, 10% in total in the first year.",
    monatTitel: "What happens each month",
    monatJahr1: "1st full year, after repayment",
    monatSchnitt: "Average over 10 years",
    monatAb6: "From year 6",
    monatText:
      "In the first years, the flat pays you money instead of costing you. When the special depreciation expires after four years, this reverses.",
    zehnTitel: "After ten years",
    objektwert: "Property value at 2% p.a.",
    restschuld: "Remaining debt",
    getilgt: "of which repaid",
    verkaufserloes: "Sale proceeds",
    zehnText: (eigenkapital: number) =>
      `From ${eEn(eigenkapital)} of equity invested. After the speculation period, a gain on sale is tax-free.`,
    proMonat: (n: number) => `${eEn(n)} / month`,
    proJahr: (n: number) => `${eEn(n)} / year`,
    plusProMonat: (n: number) => `+${eEn(n)} / month`,
    minusSpanneProMonat: (von: number, bis: number) => `−${eEn(von)} to −${eEn(bis)} / month`,
    kernTitel: "What's really happening here",
    kernVor: "Without this property, the buyer pays around",
    kernOhne: "€456,000 in tax",
    kernMitte: " over ten years. With it, it's",
    kernMit: "€387,000",
    kernNach:
      ". The difference of €68,227 doesn't just sit in his account; it helps finance a flat that belongs to him. After ten years its value stands at around €536,000, with remaining debt of €371,000.",
    kernSchluss:
      "That's the whole idea: tax is money you pay anyway. The only open question is whether it ends up in the federal budget or in your own property.",
    ehrlichTitel: "What we honestly add",
    ehrlichPunkte: [
      "The tax relief is highest in the first four years; after that the special depreciation expires and the effect drops significantly.",
      "From the sixth year, the flat costs around €200 a month instead of paying out.",
      "The special depreciation requires you to let the flat continuously for at least ten years. Living in it yourself or selling earlier cancels the benefit.",
      "Increase in value and rent development are assumptions, not promises. We deliberately used a conservative 2% a year.",
    ],
    befristetTitel: "Limited in time:",
    befristetText:
      "The combination of special depreciation (Section 7b EStG) and declining-balance depreciation applies to building applications submitted by 30 Sep 2029. Requirements include a construction cost cap of €5,200 per m² and the Efficiency House 40 standard with QNG certification. This deadline is set by the legislator, not by us.",
    hinweis:
      "Non-binding example based on a real calculation, as of 2026. We cannot guarantee that it applies to your personal situation. This does not replace individual tax or investment advice.",
  },

  steuerVergleich: {
    titel: "Ten years of tax, the same amount, two uses",
    text: "Both columns are the same height. The difference is not how much money flows, but where it goes.",
    abgefuehrt: "Paid to the tax office",
    umgewandelt: "Turned into your own property",
    ohneImmobilie: "Without property",
    mitImmobilie: "With property",
    tausend: tausendEn,
    eigentumPlus: (n: number) => `+${tausendEn(n)} ownership`,
    fussnote:
      "Ten years cumulative, example case on this page. €455,659 compared with €387,431 in tax plus €68,227 that goes into financing your own flat.",
  },

  vermoegensaufbau: {
    titel: (erloes: number) => `Where the ${eEn(erloes)} comes from`,
    text: "Your tenant repays, the market grows. Together they make up the sale proceeds at the end.",
    getilgt: "Debt repaid",
    wertsteigerung: "Increase in value",
    wertsteigerungLegende: "Increase in value (2% p.a.)",
    zusammen: "Total",
    eigenkapitalLinie: (n: number) => `Equity ${eEn(n)}`,
    tausend: tausendEn,
    voll: eEn,
    fussnote:
      "The tax relief is deliberately not included here; it already flows into ongoing cash flow and would be counted twice. The increase in value is a conservative assumption, not a promise.",
  },

  investoren: {
    kicker: "Who we're right for",
    titelVor: "Four investor profiles,",
    titelVarianten: ["one clear concept", "one clear strategy", "one clear plan"],
    intro:
      "There's no single right investment. There's the right one for your tax burden, your creditworthiness and your time horizon. Which route that is depends on your situation, not on what we offer.",
    bahnLabel: "Four investor profiles, swipe sideways",
    profile: [
      {
        kicker: "Business owners",
        titel: "You run your own company.",
        text: "You regularly make strong profits and don't want to tie up all your wealth in the business. With the right property strategy, you build predictable real assets, tax effects and wealth growth outside your operating business.",
        punkte: [
          "Integrate limited company (GmbH) or holding structures sensibly",
          "Use tax planning opportunities strategically",
          "Build private wealth outside the company",
        ],
        hinweis: "Suitable from approx. €8,000 profit per month",
      },
      {
        kicker: "High earners",
        titel: "You earn above average.",
        text: "You're successful at work, pay high taxes and have little time to handle property selection, financing and strategy yourself. MOREImmo helps you use your creditworthiness specifically for a property portfolio.",
        punkte: [
          "Use strong creditworthiness as an investment advantage",
          "Develop a property strategy with a tax focus",
          "Explore ways in even without much equity",
        ],
        hinweis: "Suitable from approx. €4,500 net per month",
      },
      {
        kicker: "Self-employed",
        titel: "You're self-employed or a freelancer.",
        text: "Your income is strong, but not always steady. Many banks assess the self-employed too broadly. We prepare your documents professionally and check financing with partners who understand entrepreneurial income.",
        punkte: [
          "Financing partners experienced with the self-employed",
          "Professional preparation of your credit profile",
          "Step by step to a robust portfolio",
        ],
        hinweis: "Suitable after approx. 3 years of self-employment",
      },
      {
        kicker: "Employees",
        titel: "You're permanently employed and want a structured start.",
        text: "A stable income and good creditworthiness are ideal for getting into your first investment property. MOREImmo helps you plan financing properly and use tax advantages sensibly.",
        punkte: [
          "Approach your first investment safely and predictably",
          "Use income and creditworthiness purposefully",
          "Use tax advantages when building wealth through property",
        ],
        hinweis: "Suitable from approx. €2,800 net per month",
      },
    ],
  },

  unternehmen: {
    kicker: "Why MOREImmo",
    titelVor: "Strategic property growth with structure,",
    titelBetont: "substance and system",
    intro:
      "MOREImmo combines many years of market experience, vetted investment strategies and a strong partner network for discerning investors.",
    vorteile: [
      {
        titel: "Focus on Bavaria + top locations",
        text: "Focus on Munich, Nuremberg, Regensburg and Augsburg, plus vetted A and B locations across Germany.",
      },
      {
        titel: "Vetted investment properties",
        text: "From developers, off-market or existing stock, every property goes through our review process.",
      },
      {
        titel: "Three investment concepts",
        text: "Co-living, KfW 40 new builds and refurbished existing properties, depending on creditworthiness and goals.",
      },
      {
        titel: "Full-service approach",
        text: "Strategy, financing, purchase, letting and management from a single source.",
      },
      {
        titel: "Experienced team",
        text: "20+ sales partners and staff who keep your goals, figures and long-term strategy in view.",
      },
    ],
    bilanzTitel: "A solid track record",
    bilanzInvestoren: "+ investors supported,",
    bilanzEinheiten: "+ units brokered, nine-figure financing volume.",
  },
};

export const MIKROSEITE_TEXTE = { de, en };
