/**
 * Die Beschriftungen des Kennenlernens, für den Mailversand in Deno.
 *
 * ## Warum es diese Datei gibt
 *
 * Der Überblick auf der vorletzten Ansicht zeigt dem Bewerber seine eigenen Angaben,
 * geordnet und lesbar. Genau derselbe Überblick geht ihm nach dem Absenden per
 * Mail zu (Moment 4 der Abstimmungsfassung). Verschickt wird sie aus
 * `submit-bewerber-formular`, und das ist eine Edge Function: Sie läuft in Deno
 * und kann `src/lib/bewerberKennenlernen.ts` nicht erreichen.
 *
 * In der Datenbank steht `zeitProWoche: "10_bis_20"`. Vor die Augen eines
 * Menschen gehört „10 bis 20 Stunden, das ist mir wichtig". Also braucht die
 * Function die Beschriftungen, und sie stehen deshalb hier ein zweites Mal.
 * Dasselbe Vorgehen und dieselbe Begründung wie bei `THEMEN_LABELS` in
 * `send-bewerber-termin/index.ts`.
 *
 * ## Was das Auseinanderlaufen verhindert
 *
 * Eine zweite Fassung derselben Liste läuft irgendwann auseinander, und
 * bemerkt wird es zuerst vom Bewerber, in dessen Mail ein Kürzel statt einer
 * Antwort steht. Deshalb bewacht `src/lib/kennenlernenUeberblickMail.test.ts`
 * diese Datei gegen den Katalog in `src/lib/bewerberKennenlernen.ts`: Jede
 * Frage, jede Option und jede Gruppe wird verglichen. Wer dort etwas ändert
 * und hier nicht, bekommt einen roten Test und keine stille Lücke.
 *
 * Maßgeblich bleibt `src/lib/bewerberKennenlernen.ts`. Diese Datei ist die
 * Kopie, nicht die Quelle.
 */

/** Eine Frage, so weit die Mail sie braucht. */
export type UeberblickFrage = {
  /** Die Kurzform, wie sie im Überblick links steht. */
  kurz: string;
  /** Wert zu Beschriftung. Fehlt bei freien Texten. */
  optionen?: Record<string, string>;
};

/** Eine Zeile des Überblicks: links die Frage, rechts seine Antwort. */
export type UeberblickZeile = { label: string; wert: string };

/** Eine der drei Gruppen des Überblicks. */
export type UeberblickGruppe = { titel: string; zeilen: UeberblickZeile[] };

/**
 * Die drei Gruppen und ihre Reihenfolge.
 *
 * Wortgleich mit `kennenlernenUeberblick` in `src/lib/bewerberKennenlernen.ts`.
 */
export const UEBERBLICK_GRUPPEN: Array<{ titel: string; keys: string[] }> = [
  {
    titel: "So möchtest du starten",
    keys: ["zeitProWoche", "perspektive", "leadPraeferenz", "einkommensziel", "startzeitpunkt"],
  },
  {
    titel: "Das bringst du mit",
    keys: [
      "weg",
      "wegAntwort1",
      "wegAntwort1Frei",
      "wegAntwort2",
      "wegAntwort2Frei",
      "wegAntwort3",
      "passung",
      "leadErfahrung",
      "leadQuote",
    ],
  },
  {
    titel: "Das klären wir im Gespräch",
    keys: [
      "verstaendnisFixum",
      "verstaendnisProvision",
      "arbeitsform",
      "gewerbe",
      "erlaubnis34c",
      "erlaubnis34cBegruendung",
      "themen",
      "eigeneFrage",
    ],
  },
];

/** Die Fragen, die auf jedem Weg dieselben sind. */
export const UEBERBLICK_FRAGEN: Record<string, UeberblickFrage> = {
  zeitProWoche: {
    kurz: "Zeit pro Woche",
    optionen: {
      unter_10: "Weniger als 10 Stunden, erst einmal nebenher",
      "10_bis_20": "10 bis 20 Stunden, das ist mir wichtig",
      vollzeit: "Vollzeit, ich will das hauptberuflich machen",
    },
  },
  perspektive: {
    kurz: "Perspektive",
    optionen: {
      dauerhaft_neben: "Dauerhaft nebenberuflich, als zweites Standbein",
      spaeter_haupt: "Nebenberuflich starten, perspektivisch hauptberuflich",
      sofort_haupt: "Von Anfang an hauptberuflich",
      unklar: "Das will ich erst einmal schauen",
    },
  },
  leadPraeferenz: {
    kurz: "Womit er startet",
    optionen: {
      eigen: "Ich habe ein eigenes Netzwerk oder Bestandskunden, damit fange ich an",
      leads: "Ich bin grundsätzlich offen für Leads von euch",
      beides: "Beides: Ich fange im eigenen Netzwerk an und bin für Leads offen",
      unklar: "Das weiß ich noch nicht",
    },
  },
  // Die dritte Tür auf den Wegen 1 bis 4, beides freie Texte. Die erste Frage
  // steht im Bogen in zwei Fassungen, beide mit derselben Kurzform.
  leadErfahrung: { kurz: "Bisherige Arbeit mit Leads" },
  leadQuote: { kurz: "Abschlüsse aus zehn Leads" },
  einkommensziel: {
    kurz: "Einkommensziel",
    optionen: {
      bis_2000: "Bis 2.000 Euro",
      "2000_5000": "2.000 bis 5.000 Euro",
      "5000_10000": "5.000 bis 10.000 Euro",
      ueber_10000: "Mehr als 10.000 Euro",
      unklar: "Weiß ich noch nicht",
    },
  },
  startzeitpunkt: {
    kurz: "Start",
    optionen: {
      sofort: "Sofort",
      vier_wochen: "In den nächsten vier Wochen",
      zwei_drei_monate: "In zwei bis drei Monaten",
      umschauen: "Ich schaue mich erst einmal um",
    },
  },
  weg: {
    kurz: "Der gewählte Weg",
    optionen: {
      weg1: "Ich verkaufe schon Immobilien",
      weg2: "Ich berate zu Geld, aber nicht zu Immobilien",
      weg3: "Ich bin im Vertrieb, mit einem anderen Produkt",
      weg4: "Ich kenne Immobilien, aber nicht aus dem Verkauf",
      weg5: "Beides ist neu für mich",
    },
  },
  hintergrund: {
    kurz: "Hintergrund",
    optionen: {
      immo: "Ich arbeite oder arbeitete in der Immobilienbranche",
      immo_umfeld: "Ich kenne Immobilien, aber nicht aus dem Verkauf",
      findi: "Ich bin in der Finanz- oder Versicherungsberatung unterwegs",
      vertrieb: "Ich habe Vertriebserfahrung in einer anderen Branche",
      quereinsteiger: "Vertrieb ist für mich neu, ich will es lernen",
    },
  },
  passung: {
    kurz: "Grundsätzliche Passung",
    optionen: {
      selbststaendig: "Selbstständig arbeiten passt für mich",
      variabel: "Schwankende Einnahmen kann ich tragen",
      akquise: "Ich bin bereit, selbst Kunden zu gewinnen",
      zeitplan: "Mein Zeitplan trägt das",
    },
  },
  gewerbe: {
    kurz: "Gewerbe",
    optionen: {
      ja: "Ja, habe ich",
      beantragt: "Ist beantragt",
      nein: "Noch nicht",
      unklar: "Das möchte ich im Gespräch klären",
    },
  },
  erlaubnis34c: {
    kurz: "Erlaubnis 34c",
    optionen: {
      ja: "Ja, habe ich",
      beantragt: "Ist beantragt",
      nein: "Noch nicht vorhanden",
      will_nicht: "Möchte ich grundsätzlich nicht",
      unklar: "Das möchte ich im Gespräch klären",
    },
  },
  themen: {
    kurz: "Eigene Themen",
    optionen: {
      verdienst: "Verdienst und Rechenwege",
      kosten: "Leads und Kosten",
      zeit: "Zeit und Vereinbarkeit",
      einstieg: "Einstieg, Training und Begleitung",
      objekte: "Objekte und Standorte",
      formales: "Gewerbe, Erlaubnis, Formales",
      leads: "Leads und Kundengewinnung",
    },
  },
  eigeneFrage: {
    kurz: "Eigene Frage",
  },
  /*
   * Die Frage ist am 08.09.2026 aus dem Bogen entfallen und steht deshalb in
   * keiner Gruppe mehr. Die Beschriftung bleibt hier stehen: Sollte je eine
   * ältere Einreichung erneut vermailt werden, stünde sonst ein Kürzel darin.
   */
  erreichbarkeit: {
    kurz: "Erreichbar",
    optionen: {
      vormittags: "Vormittags bis 12 Uhr",
      mittags: "Mittags 12 bis 14 Uhr",
      nachmittags: "Nachmittags 14 bis 18 Uhr",
      abends: "Abends ab 18 Uhr",
    },
  },
  verstaendnisFixum: {
    kurz: "Verständnis Fixum",
    optionen: { ja: "Ja", nein: "Nein" },
  },
  verstaendnisProvision: {
    kurz: "Verständnis Provision",
    optionen: { ja: "Ja", nein: "Nein" },
  },
  arbeitsform: {
    kurz: "Wie er heute arbeitet",
    optionen: {
      angestellt: "Ich bin angestellt",
      selbststaendig: "Ich bin selbstständig",
      beides: "Beides nebeneinander",
      keins: "Zurzeit keins von beidem",
    },
  },
  // Freier Text, deshalb ohne Optionen.
  erlaubnis34cBegruendung: { kurz: "Warum keine Erlaubnis" },
};

/**
 * Die drei Vertiefungen, je gewähltem Weg.
 *
 * `wegAntwort1` bis `wegAntwort3` sind dieselben Schlüssel auf allen fünf
 * Wegen und tragen trotzdem je Weg eine andere Frage. Ohne den Weg lässt sich
 * die Antwort deshalb nicht beschriften, und genauso hält es der Überblick auf
 * dem Bildschirm.
 */
export const UEBERBLICK_WEG_FRAGEN: Record<string, Record<string, UeberblickFrage>> = {
  weg1: {
    wegAntwort1: {
      kurz: "Abschlüsse im letzten Jahr",
      optionen: {
        keine: "Noch keinen",
        "1_bis_3": "1 bis 3",
        "4_bis_10": "4 bis 10",
        ueber_10: "Mehr als 10",
      },
    },
    wegAntwort2: {
      kurz: "Zeitfresser heute",
      optionen: {
        objektsuche: "Objekte suchen und prüfen",
        unterlagen: "Unterlagen und Exposés bauen",
        finanzierung: "Finanzierung organisieren",
        abwicklung: "Abwicklung bis zum Notar",
        akquise: "Kunden überhaupt erst finden",
        verwaltung: "Verwaltung und Nachhalten",
      },
    },
    wegAntwort3: {
      kurz: "Käufertyp heute",
      optionen: {
        eigennutzer: "Eigennutzer, die einziehen wollen",
        anleger: "Kapitalanleger",
        gemischt: "Beides gemischt",
      },
    },
  },
  weg2: {
    wegAntwort1: {
      kurz: "Beratungsschwerpunkte",
      optionen: {
        baufi: "Baufinanzierung",
        vorsorge: "Altersvorsorge",
        kapitalanlage: "Kapitalanlage und Wertpapiere",
        versicherung: "Versicherungen",
        steuern: "Steuern und Vermögensplanung",
        sonstiges: "Etwas anderes",
      },
    },
    // Freier Text hinter „Etwas anderes", deshalb ohne Optionen.
    wegAntwort1Frei: { kurz: "Etwas anderes, und zwar" },
    wegAntwort2: {
      kurz: "Eigene Kundengewinnung",
      optionen: {
        empfehlung: "Vor allem über Empfehlungen",
        bestand: "Aus einem eigenen Bestand",
        firma: "Die Kunden kommen von der Firma",
        marketing: "Über eigenes Marketing",
        gemischt: "Gemischt",
      },
    },
    wegAntwort3: {
      kurz: "Immobilie in der Beratung",
      optionen: {
        regelmaessig: "Ja, regelmäßig",
        gelegentlich: "Gelegentlich",
        nie_frage_kommt: "Noch nie, aber die Frage kommt",
        nie: "Noch nie",
      },
    },
  },
  weg3: {
    // Freier Text, deshalb ohne Optionen.
    wegAntwort1: { kurz: "Was er heute verkauft" },
    wegAntwort2: {
      kurz: "Länge des Verkaufszyklus",
      optionen: {
        tag: "Am selben Tag",
        wochen: "Ein paar Wochen",
        monate: "Zwei bis drei Monate",
        laenger: "Länger als drei Monate",
      },
    },
    wegAntwort3: {
      kurz: "Herkunft der Kunden",
      optionen: {
        firma: "Die Firma stellt sie",
        selbst: "Ich gewinne sie selbst",
        gemischt: "Gemischt",
      },
    },
  },
  weg4: {
    wegAntwort1: {
      kurz: "Berührung mit Immobilien",
      optionen: {
        verwaltung: "Verwaltung und Bewirtschaftung",
        bau: "Bau und Sanierung",
        bewertung: "Bewertung und Gutachten",
        vermietung: "Vermietung",
        finanzierung: "Finanzierung",
        eigenbestand: "Eigener Bestand",
      },
    },
    wegAntwort2: {
      kurz: "Verkaufserfahrung",
      optionen: {
        nichts: "Verkauft habe ich noch nichts",
        gelegentlich: "Gelegentlich, nebenbei",
        beraten: "Beraten ja, abgeschlossen selten",
        regelmaessig: "Regelmäßig, nur nicht mit Immobilien",
      },
    },
    wegAntwort3: {
      kurz: "Was bisher bremste",
      optionen: {
        nicht_gebraucht: "Ich habe es schlicht nicht gebraucht",
        zutrauen: "Ich traue es mir noch nicht zu",
        gelegenheit: "Es fehlte die Gelegenheit",
        jetzt: "Nichts, ich will es jetzt",
      },
    },
  },
  weg5: {
    /*
     * Die Frage nach dem Start, in den Worten des Quereinsteigers. Derselbe
     * Schlüssel und dieselben vier Werte wie in der gemeinsamen Liste, nur
     * andere Beschriftungen; die Fassung im Bogen steht in
     * `src/lib/bewerberKennenlernen.ts` auf der Ansicht „Deine ersten Kunden
     * und dein Ziel".
     */
    leadPraeferenz: {
      kurz: "Womit er startet",
      optionen: {
        eigen: "Erst einmal im Bekanntenkreis, bei Familie, Freunden und Kollegen",
        leads: "Lieber mit Leads von euch, außerhalb meines Umfelds",
        beides: "Beides: im Bekanntenkreis anfangen und dazu Leads",
        unklar: "Das weiß ich noch nicht",
      },
    },
    wegAntwort1: {
      kurz: "Was ihn reizt",
      optionen: {
        selbststaendig: "Selbst bestimmen, wie viel ich arbeite",
        verdienst: "Was ich verdienen kann",
        menschen: "Menschen bei einer großen Entscheidung begleiten",
        thema: "Das Thema Immobilien selbst",
        aufbau: "Etwas Eigenes aufbauen",
      },
    },
    wegAntwort2: {
      kurz: "Zeitliche Reserve",
      optionen: {
        unter_3: "Weniger als 3 Monate",
        "3_bis_6": "3 bis 6 Monate",
        "6_bis_12": "6 bis 12 Monate",
        egal: "Das spielt bei mir keine Rolle",
        sonstiges: "Bei mir liegt es anders",
      },
    },
    // Freier Text hinter „Bei mir liegt es anders", deshalb ohne Optionen.
    wegAntwort2Frei: { kurz: "Zeitliche Reserve, und zwar" },
    wegAntwort3: {
      kurz: "Lernweise",
      optionen: {
        zuschauen: "Zuschauen bei echten Gesprächen",
        ausprobieren: "Selbst ausprobieren, mit Rückmeldung",
        lesen: "Erst lesen, dann machen",
        gemischt: "Gemischt",
      },
    },
  },
};

/**
 * Stammen diese Antworten aus dem neuen Kennenlernen?
 *
 * Beide Bögen schreiben in dieselbe Spalte `bewerber_formular.antworten`. Den
 * gewählten Weg gibt es nur hier, er ist deshalb das Erkennungsmerkmal.
 * Zweite Fassung von `istKennenlernen` in `src/lib/bewerberKennenlernen.ts`.
 */
export function istKennenlernen(antworten: Record<string, unknown> | null | undefined): boolean {
  const weg = antworten?.weg;
  return typeof weg === "string" && !!UEBERBLICK_FRAGEN.weg.optionen?.[weg];
}

/**
 * Die Frage zu einem Schlüssel, den gewählten Weg berücksichtigt.
 *
 * Der Weg geht vor: `wegAntwort1` bis `wegAntwort3` tragen je Weg eine andere
 * Frage, und seit dem 08.09.2026 gilt dasselbe für `leadPraeferenz`, das auf
 * Weg 5 in eigenen Worten gefragt wird. Findet sich für den Weg nichts, gilt
 * die gemeinsame Liste. Nur die Vertiefungen haben dort nichts zu suchen: Ohne
 * bekannten Weg lässt sich ihre Antwort nicht beschriften.
 */
export function frageZu(key: string, weg: string): UeberblickFrage | undefined {
  const jeWeg = UEBERBLICK_WEG_FRAGEN[weg]?.[key];
  if (jeWeg) return jeWeg;
  if (key.startsWith("wegAntwort")) return undefined;
  return UEBERBLICK_FRAGEN[key];
}

/** Die Antwort als lesbarer Text. Mehrfachauswahl mit Komma getrennt. */
export function antwortText(frage: UeberblickFrage, wert: unknown): string {
  const label = (v: string) => frage.optionen?.[v] ?? v;
  if (Array.isArray(wert)) return wert.map((v) => label(String(v))).join(", ");
  if (typeof wert !== "string") return "";
  if (!wert.trim()) return "";
  return frage.optionen ? label(wert) : wert;
}

/**
 * Der Überblick, wie er in die Mail geht.
 *
 * Leere Zeilen und leere Gruppen fallen weg, genau wie im Bogen selbst. Wer
 * eine Frage übersprungen hat, sieht in der Mail keine leere Zeile darüber.
 */
export function ueberblickFuerMail(antworten: Record<string, unknown>): UeberblickGruppe[] {
  const weg = typeof antworten.weg === "string" ? antworten.weg : "";

  return UEBERBLICK_GRUPPEN.map((gruppe) => ({
    titel: gruppe.titel,
    zeilen: gruppe.keys
      .map((key) => {
        const frage = frageZu(key, weg);
        if (!frage) return null;
        const wert = antwortText(frage, antworten[key]);
        return wert ? { label: frage.kurz, wert } : null;
      })
      .filter((z): z is UeberblickZeile => z !== null),
  })).filter((g) => g.zeilen.length > 0);
}

/**
 * Schonendere Wörter für die Mail, seit dem 26.09.2026.
 *
 * Die Zusammenfassung zeigt dem Bewerber seine Antworten mit denselben
 * Beschriftungen wie der Bogen, und das prüft `kennenlernenUeberblickMail.test.ts`
 * Wort für Wort. Drei dieser Beschriftungen sprechen aber vom Verdienen oder von
 * Provision, und genau solche Wörter zählen Spamfilter zu den Geldversprechen.
 * Deshalb werden sie erst beim Darstellen in der Mail ersetzt, nicht im
 * Überblick selbst: Bogen und CRM behalten ihren Wortlaut.
 */
export const MAIL_WORTWAHL: ReadonlyArray<readonly [string, string]> = [
  ["Verdienst und Rechenwege", "Vergütung und Rechenwege"],
  ["Was ich verdienen kann", "Die Vergütung"],
  ["Verständnis Provision", "Verständnis erfolgsabhängige Vergütung"],
];

/** Ersetzt die Wörter aus `MAIL_WORTWAHL` in einem Mailtext. */
export function mailWortwahl(text: string): string {
  let ergebnis = text;
  for (const [alt, neu] of MAIL_WORTWAHL) ergebnis = ergebnis.split(alt).join(neu);
  return ergebnis;
}

/**
 * Die Dauer des Videocalls in Minuten.
 *
 * Zweite Fassung von `gespraechsDauerMinuten` aus
 * `src/lib/bewerberKennenlernen.ts`, aus demselben Grund wie alles hier. Der
 * Test vergleicht beide.
 */
export const DAUER_KURZ_MINUTEN = 25;
export const DAUER_LANG_MINUTEN = 35;

export function dauerMinuten(antworten: Record<string, unknown>): number {
  const themen = antworten.themen;
  const hatThemen = Array.isArray(themen) && themen.length > 0;
  const frage = antworten.eigeneFrage;
  const hatFrage = typeof frage === "string" && frage.trim() !== "";
  return hatThemen || hatFrage ? DAUER_LANG_MINUTEN : DAUER_KURZ_MINUTEN;
}
