/**
 * Die Anzeige der festen Auswahlwerte des Steuerrechners, Deutsch und Englisch.
 *
 * Plan Kundensprache, Etappe 6. Der Rechenkern (`steuerRechner.ts`) und die
 * Strecke (`steuerrechnerStrecke.ts`) liefern ihre Titel weiter deutsch, denn
 * dieselben Werte gehen als Notiz und Schnappschuss ins CRM. Dort darf sich
 * nichts aendern. Die englische Anzeige holt sich die Oberflaeche und das PDF
 * deshalb hier, ueber die Kennung (id) und nie ueber den deutschen Text.
 *
 * Die deutschen Eintraege verweisen auf die Quellen im Rechenkern und in der
 * Strecke. Es gibt also keinen zweiten deutschen Wortlaut, der auseinanderlaufen
 * koennte.
 *
 * Liegt in `src/lib`, weil ihn beide brauchen: die Bausteine unter
 * `src/components/steuerrechner` und `steuerrechnerPdf.ts`.
 */
import { BESCHAEFTIGUNGEN, type BeschaeftigungId } from "@/lib/steuerRechner";
import { STARTZEITPUNKTE, type StartzeitpunktId } from "@/lib/steuerrechnerStrecke";

interface BeschaeftigungAnzeige {
  titel: string;
  unterzeile: string;
  /** Wie die Bank dieses Einkommen sieht. */
  einschaetzung: string;
  /** Was zusaetzlich verlangt wird. */
  unterlagen: string;
}

interface StartzeitpunktAnzeige {
  titel: string;
  unterzeile: string;
}

function beschaeftigungDe(id: BeschaeftigungId): BeschaeftigungAnzeige {
  const b = BESCHAEFTIGUNGEN[id];
  return { titel: b.titel, unterzeile: b.unterzeile, einschaetzung: b.einschaetzung, unterlagen: b.unterlagen };
}

function startzeitpunktDe(id: StartzeitpunktId): StartzeitpunktAnzeige {
  const s = STARTZEITPUNKTE.find((z) => z.id === id);
  return { titel: s?.titel ?? "", unterzeile: s?.unterzeile ?? "" };
}

/**
 * Die Begruendungen des gesetzlichen AfA-Satzes aus `afaSaetze.ts`, englisch
 * ueber den deutschen Wortlaut zugeordnet. Die Liste ist dort abschliessend,
 * ein unbekannter Grund bleibt deutsch stehen, statt zu verschwinden.
 */
const AFA_GRUND_EN: Record<string, string> = {
  "Betriebsgebäude im Betriebsvermögen": "commercial building held as business assets",
  "Baujahr unbekannt, Regelsatz": "year of construction unknown, standard rate",
  "Fertigstellung vor 1925": "completed before 1925",
  "Fertigstellung ab 2023": "completed in 2023 or later",
  "Fertigstellung 1925 bis 2022": "completed between 1925 and 2022",
};

const de = {
  beschaeftigung: {
    angestellt: beschaeftigungDe("angestellt"),
    freiberuflich: beschaeftigungDe("freiberuflich"),
    selbststaendig: beschaeftigungDe("selbststaendig"),
    gmbh_gf: beschaeftigungDe("gmbh_gf"),
    beamter: beschaeftigungDe("beamter"),
  } as Record<BeschaeftigungId, BeschaeftigungAnzeige>,
  startzeitpunkt: {
    sofort: startzeitpunktDe("sofort"),
    zwoelf_monate: startzeitpunktDe("zwoelf_monate"),
    irgendwann: startzeitpunktDe("irgendwann"),
    neugier: startzeitpunktDe("neugier"),
  } as Record<StartzeitpunktId, StartzeitpunktAnzeige>,
  /** Der deutsche Grund bleibt, wie er ist. */
  afaGrund: (grund: string) => String(grund),
};

export type SteuerKennungTexte = typeof de;

const en: SteuerKennungTexte = {
  beschaeftigung: {
    angestellt: {
      titel: "Employed, permanent contract",
      unterzeile: "A permanent job without a fixed end date.",
      einschaetzung:
        "Your income counts as secure. It is the standard case banks base their terms on.",
      unterlagen: "Your last three payslips and your employment contract are usually enough.",
    },
    freiberuflich: {
      titel: "Freelance professional",
      unterzeile: "For example doctor, lawyer, consultant or engineer.",
      einschaetzung:
        "Banks average your profit over several years. Weak years pull the average down, so they calculate more cautiously than for an employee.",
      unterlagen:
        "Income statements (Einnahmenüberschussrechnung) and tax assessments for the last two to three years, plus the current business analysis (BWA).",
    },
    selbststaendig: {
      titel: "Self-employed",
      unterzeile: "Trade business or sole proprietorship.",
      einschaetzung:
        "Banks see the greatest risk of fluctuation here. They do not recognise part of the profit and often ask for more equity.",
      unterlagen:
        "Balance sheets or income statements and tax assessments for the last two to three years, plus the current business analysis (BWA).",
    },
    gmbh_gf: {
      titel: "Managing director of a GmbH",
      unterzeile: "Holding more than 50 percent of the shares.",
      einschaetzung:
        "With a majority of the shares, the bank treats you as self-employed, not as an employee. Your salary as managing director alone is not enough proof for the bank.",
      unterlagen:
        "The company's annual financial statements and your tax assessments for the last two to three years, plus your managing director's contract.",
    },
    beamter: {
      titel: "Civil servant (Beamter)",
      unterzeile: "Public sector, with civil servant status.",
      einschaetzung:
        "The most secure income a bank knows. You get the longest terms and the best interest rates, so the same salary goes a little further.",
      unterlagen: "Your last three salary statements and your certificate of appointment are usually enough.",
    },
  },
  startzeitpunkt: {
    sofort: {
      titel: "As soon as possible",
      unterzeile: "You want to tackle this now and are looking for a contact person.",
    },
    zwoelf_monate: {
      titel: "Within the next twelve months",
      unterzeile: "The decision is made, the timing is not.",
    },
    irgendwann: {
      titel: "At some point",
      unterzeile: "You're gathering knowledge and first want to understand what it's about.",
    },
    neugier: {
      titel: "Just out of curiosity",
      unterzeile: "You want to see the figure, nothing more for now.",
    },
  },
  afaGrund: (grund: string) => AFA_GRUND_EN[String(grund)] ?? String(grund),
};

export const STEUER_KENNUNG_TEXTE = { de, en };
