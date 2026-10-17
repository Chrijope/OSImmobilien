/**
 * Die 15 häufigsten Einwände aus dem Handbuch „Einwandbehandlung“ von
 * OS Real Estate (Stand 15.10.2026, Drive). Gekürzt auf das, was im Gespräch
 * gebraucht wird: Kernsatz, Nachfrage, Belege, Zustimmungsfrage und was wir
 * nie sagen. Quelle für Seite und PDF des Leitfadens.
 *
 * Keine Steuer-, Rechts- oder Finanzierungsberatung; alle Zahlen sind
 * Beispiele. Rechtsstand §§ 556d, 558, 559 BGB; § 7 Abs. 4, Abs. 5a EStG.
 */

export interface OsEinwand {
  nr: number;
  thema: string;
  einwand: string;
  kernsatz: string;
  nachfrage: string;
  belege: string[];
  zustimmung: string;
  nie: string[];
}

export const OS_FUENF_SCHRITTE: { schritt: string; ziel: string }[] = [
  { schritt: "Anerkennen", ziel: "Den Kunden bestätigen, nicht den Einwand widerlegen." },
  { schritt: "Nachfragen", ziel: "Die eigentliche Sorge finden." },
  { schritt: "Einordnen", ziel: "Den Einwand isolieren und in die Gesamtrechnung stellen." },
  { schritt: "Belegen", ziel: "Mit Zahlen, Unterlagen oder ehrlicher Unsicherheit antworten." },
  { schritt: "Zustimmung", ziel: "Prüfen, ob der Punkt geklärt ist, dann schweigen und warten." },
];

export const OS_VORWAND_TEST =
  "Darf ich offen fragen: Wenn dieser Punkt geklärt wäre, gäbe es dann noch etwas, das dich zurückhält?";

export const OS_GRENZEN: { thema: string; verweis: string }[] = [
  { thema: "Steuern", verweis: "Steuerberatung des Kunden" },
  { thema: "Recht", verweis: "Notar, Anwalt des Kunden" },
  { thema: "Finanzierung", verweis: "Bank, Finanzierungspartner" },
  { thema: "Zukunft", verweis: "Niemand. Szenarien nur mit genannten Annahmen." },
];

export const OS_EINWAENDE: OsEinwand[] = [
  {
    nr: 1, thema: "Zinsen", einwand: "Die Zinsen sind heute viel zu hoch.",
    kernsatz: "Ist der Zinssatz dein Problem oder die Belastung, die am Ende übrig bleibt? Entscheidend ist die Gesamtrechnung.",
    nachfrage: "Stört dich der Zinssatz selbst oder die monatliche Belastung, die daraus entsteht?",
    belege: [
      "Schuldzinsen einer vermieteten Wohnung sind grundsätzlich Werbungskosten, die Tilgung nicht.",
      "Eine niedrigere Anfangstilgung senkt die Rate, lässt aber mehr Restschuld; das gehört in die Rechnung.",
      "Eine spätere Zinssenkung ist nur ein Bonus. Gerechnet wird mit dem heutigen Zins.",
    ],
    zustimmung: "Wenn die Gesamtrechnung für dich funktioniert, wäre der Zins dann noch ein Grund, nicht zu investieren?",
    nie: ["Die Zinsen fallen bald wieder.", "Das Finanzamt zahlt deine Zinsen.", "Jetzt noch schnell, bevor die Zinsen steigen."],
  },
  {
    nr: 2, thema: "Standort", einwand: "Berlin ist zu weit weg.",
    kernsatz: "Die Frage ist nicht, wie weit Berlin entfernt ist, sondern wo dein Kapital besser arbeitet.",
    nachfrage: "Was genau wäre für dich anders, wenn die Wohnung in deiner Nähe läge?",
    belege: [
      "Bei professioneller Verwaltung ist der Eigentümer Investor, nicht Hausmeister.",
      "Der Mikrostandort muss überzeugen: Mieter, marktübliche Miete, Nachfrage, Verhältnis Kaufpreis zu Miete.",
      "Wer den Standort sehen möchte, besichtigt vor der Entscheidung. Das bieten wir aktiv an.",
    ],
    zustimmung: "Wenn die Wohnung weiter weg wirtschaftlich attraktiver ist als eine vor deiner Haustür: Welche ist dann die bessere Kapitalanlage?",
    nie: ["In Berlin steigen die Preise immer.", "Um die Wohnung musst du dich nie kümmern."],
  },
  {
    nr: 3, thema: "Preis", einwand: "Das ist mir zu teuer.",
    kernsatz: "Meinst du den Kaufpreis oder die monatliche Belastung? Liegt sie über deiner Grenze, passt das Objekt nicht.",
    nachfrage: "Im Vergleich wozu wirkt der Preis für dich hoch?",
    belege: [
      "Wert: Preis je m² und Verhältnis zur Jahresnettokaltmiete mit vergleichbaren Angeboten der Lage zeigen.",
      "Belastung: zuerst vor Steuern, dann nach Steuern, dann das Stressszenario.",
      "Kaufnebenkosten offen nennen: Berlin rund 8,0 % (Grunderwerbsteuer 6 %), Brandenburg rund 8,5 % (Grunderwerbsteuer 6,5 %). Keine Maklerprovision, wir verkaufen als Bauträger selbst.",
    ],
    zustimmung: "Wenn die Belastung sicher innerhalb deiner Grenze bleibt: Wäre der Preis dann noch ein Hindernis?",
    nie: ["Das ist ein Schnäppchen.", "Billiger bekommst du das nirgends.", "Nach Steuern ist die Belastung fast null."],
  },
  {
    nr: 4, thema: "Zeit", einwand: "Dafür habe ich keine Zeit.",
    kernsatz: "Für den Alltag gibt es eine Verwaltung. Für die Entscheidung brauchen wir drei Termine.",
    nachfrage: "Wie viel Zeit möchtest du dir höchstens im Jahr für eine Kapitalanlage nehmen?",
    belege: [
      "Die WEG-Verwaltung kümmert sich um das Gemeinschaftseigentum, eine Mietverwaltung auf Wunsch um die Wohnung. Deren Kosten stehen in der Rechnung.",
      "Beim Eigentümer bleiben Eigentümerversammlung, Belege für die Steuer und der Blick auf die Abrechnungen.",
    ],
    zustimmung: "Wenn Verwaltung und Abrechnung organisiert sind und dein Aufwand bei wenigen Stunden im Jahr liegt: Passt das für dich?",
    nie: ["Du hast damit gar keine Arbeit.", "Das müssen wir heute erledigen, sonst ist die Wohnung weg."],
  },
  {
    nr: 5, thema: "Partner", einwand: "Das muss ich mit meinem Partner besprechen.",
    kernsatz: "Richtig so. Machen wir den nächsten Termin zu dritt.",
    nachfrage: "Wie stehst du persönlich zu dem Konzept, unabhängig von deinem Partner?",
    belege: [
      "Alle Entscheider sind im Konzeptgespräch und im Entscheidungstermin dabei. Das wird schon im Erstkontakt gefragt.",
      "Bei gemeinsamer Finanzierung prüft die Bank beide Einkommen.",
      "Mitgeben: Musterrechnung und kurze Zusammenfassung, keine Werbebroschüre.",
    ],
    zustimmung: "Passt euch beiden Dienstag um 19 Uhr oder Donnerstag um 18 Uhr besser für das gemeinsame Gespräch?",
    nie: ["Das kannst du doch auch allein entscheiden.", "Dein Partner muss das nicht verstehen."],
  },
  {
    nr: 6, thema: "Mietausfall", einwand: "Und wenn der Mieter nicht zahlt?",
    kernsatz: "Das kann passieren. Deshalb planen wir Reserve und Stresstest von Anfang an ein.",
    nachfrage: "Wie viele Monate ohne Miete müsstest du überbrücken können, um ruhig zu schlafen?",
    belege: [
      "Leerstand und Zahlungsausfall stehen in jedem Stressszenario, die Belastung ohne Miete wird beziffert.",
      "Eine Mietausfallversicherung leistet nur nach den Bedingungen der Police.",
      "Eine Mietgarantie gibt es nur schriftlich: wer garantiert, in welcher Höhe, wie lange.",
    ],
    zustimmung: "Wenn du weißt, dass du einen Leerstand von einigen Monaten aus deiner Reserve tragen kannst: Ist das Risiko dann vertretbar?",
    nie: ["Der Mietausfall ist versichert.", "In dieser Lage steht nie etwas leer.", "Die Miete ist garantiert. (ohne schriftliche Vereinbarung)"],
  },
  {
    nr: 7, thema: "Kosten", einwand: "Hausgeld und Sanierung fressen alles auf.",
    kernsatz: "Alle Kosten und Beschlüsse siehst du vorher, schwarz auf weiß.",
    nachfrage: "Welche Kosten machen dir am meisten Sorgen: die laufenden oder eine große Sanierung?",
    belege: [
      "Vor der Objektentscheidung: Wirtschaftsplan, Hausgeldabrechnung, Protokolle der letzten drei Jahre, Erhaltungsrücklage, Teilungserklärung, Energieausweis.",
      "Nicht umlagefähige Kosten werden getrennt ausgewiesen und eingerechnet.",
      "Modernisierung kann teilweise umgelegt werden, höchstens 8 % der Kosten pro Jahr (§ 559 BGB). Keine Garantie.",
    ],
    zustimmung: "Wenn du alle Kosten und Maßnahmen siehst und die Rechnung trotzdem trägt: Ist der Punkt dann geklärt?",
    nie: ["Da kommt nichts mehr.", "Sonderumlagen gibt es in diesem Haus nicht.", "Die Energieklasse spielt keine Rolle."],
  },
  {
    nr: 8, thema: "Markt", einwand: "Die Preise fallen doch noch. Ist das nicht eine Blase?",
    kernsatz: "Wir rechnen auch ohne Wertsteigerung. Die Tilgung baut trotzdem Vermögen auf.",
    nachfrage: "Geht es dir um einen Verkauf in wenigen Jahren oder um 20 Jahre und mehr?",
    belege: [
      "Ein Wertverlust auf dem Papier wird erst beim Verkauf real.",
      "Wichtigster Schutz ist ein vernünftiger Einkaufspreis im Verhältnis zu Miete und Lage.",
      "Wertszenarien immer mit Annahme nennen, etwa 0 % und 2 % pro Jahr.",
    ],
    zustimmung: "Wenn die Rechnung auch ohne Wertsteigerung aufgeht: Wäre ein schwankender Marktpreis dann noch ein Hindernis?",
    nie: ["Immobilien verlieren nie an Wert.", "Betongold ist sicher.", "In zehn Jahren ist die Wohnung das Doppelte wert."],
  },
  {
    nr: 9, thema: "Alternativen", einwand: "Ich lege mein Geld lieber in ETFs an.",
    kernsatz: "Ein guter Baustein. Die Immobilie ist eine Ergänzung, kein Ersatz.",
    nachfrage: "Was ist dir wichtiger: jederzeit verfügbar oder langfristig planbar Vermögen aufbauen?",
    belege: [
      "Immobilie: üblich mit Bankdarlehen, Miete als Einnahme, Kaufnebenkosten rund 8,0 % (Berlin) bzw. 8,5 % (Brandenburg), weniger flexibel.",
      "ETF: börsentäglich verfügbar, geringe Kosten, wenig Aufwand, Schwankung täglich sichtbar.",
    ],
    zustimmung: "Wäre es sinnvoll, beide Bausteine nebeneinander zu haben, wenn die Immobilie deine Sparrate nicht verdrängt?",
    nie: ["Aktien sind Zockerei.", "Immobilien schlagen jeden ETF.", "Lös dein Depot für das Eigenkapital auf."],
  },
  {
    nr: 10, thema: "Eigennutzung", einwand: "Dann kaufe ich lieber selbst eine Wohnung.",
    kernsatz: "Zwei verschiedene Aufgaben. Die Frage ist die Reihenfolge.",
    nachfrage: "Planst du ein Eigenheim in den nächsten Jahren konkret, mit Ort und Zeitpunkt?",
    belege: [
      "Bei Eigennutzung sind Zinsen und Abschreibung grundsätzlich keine Werbungskosten.",
      "Eine Kapitalanlage belegt Teile der Bonität. Ein geplantes Eigenheim vorher mit der Bank abstimmen.",
    ],
    zustimmung: "Wenn eine Kapitalanlage deinen Plan vom Eigenheim nicht blockiert: Wäre sie dann interessant?",
    nie: ["Selbst wohnen ist rausgeworfenes Geld.", "Die Bank finanziert dir später trotzdem alles."],
  },
  {
    nr: 11, thema: "Finanzierung", einwand: "Die Bank gibt mir nichts. Ich habe kein Eigenkapital.",
    kernsatz: "Das klären wir sachlich. Deine Reserve bleibt unangetastet.",
    nachfrage: "Wie viel Erspartes möchtest du auf jeden Fall als Reserve behalten?",
    belege: [
      "Kaufnebenkosten in der Regel aus Eigenkapital: bei 300.000 € Kaufpreis rund 24.000 € (Berlin) bis 25.500 € (Brandenburg).",
      "Die Finanzierung prüfen wir erst nach Konzept- und Objektentscheidung, mit Mandat und Unterlagen. Bis dahin Einschätzung, keine Zusage.",
    ],
    zustimmung: "Wenn Kaufnebenkosten und Reserve zusammen machbar sind: Möchtest du den nächsten Schritt gehen?",
    nie: ["110 % sind kein Problem.", "Die Zusage ist nur Formsache.", "Nimm deine Notreserve für die Nebenkosten."],
  },
  {
    nr: 12, thema: "Steuern", einwand: "Die Steuervorteile sind doch unsicher.",
    kernsatz: "Die Rechnung muss vor Steuern und mit regulärer AfA tragen. Alles darüber ist ein möglicher Bonus.",
    nachfrage: "Wie hoch dürfte deine monatliche Belastung höchstens sein, wenn es keinen Steuereffekt gäbe?",
    belege: [
      "Lineare AfA im Bestand: 2 % (ab 1925), 2,5 % (vor 1925); Neubau ab 2023: 3 %.",
      "Ein höherer Satz nur mit nachgewiesener kürzerer Restnutzungsdauer (§ 7 Abs. 4 Satz 2 EStG). Das Finanzamt kann das Gutachten ablehnen.",
      "Die Wirkung hängt vom persönlichen Steuersatz ab; das prüft die Steuerberatung.",
    ],
    zustimmung: "Wenn die Rechnung mit regulärer Abschreibung tragbar ist: Wäre das eine faire Grundlage?",
    nie: ["Das Finanzamt zahlt deine Wohnung.", "Das Gutachten wird immer anerkannt.", "Nach zehn Jahren ist alles steuerfrei."],
  },
  {
    nr: 13, thema: "Regulierung", einwand: "In Berlin wird doch alles reguliert.",
    kernsatz: "Wir rechnen mit der heutigen Miete und moderaten Erhöhungen im gesetzlichen Rahmen.",
    nachfrage: "Welche Regel genau macht dir Sorgen: Neuvermietung, Mieterhöhung oder etwas anderes?",
    belege: [
      "Mietpreisbremse (§ 556d BGB): bei Neuvermietung grundsätzlich höchstens 10 % über der ortsüblichen Vergleichsmiete, mit Ausnahmen.",
      "Kappungsgrenze (§ 558 BGB): in Berlin höchstens 15 % in drei Jahren.",
      "Vor jedem Gespräch den aktuellen Stand der Verordnungen prüfen.",
    ],
    zustimmung: "Wenn die Rechnung mit heutiger Miete und moderaten Erhöhungen aufgeht: Wäre die Regulierung dann noch ein Grund dagegen?",
    nie: ["Die Mietpreisbremse fällt bald.", "Die Miete kannst du problemlos verdoppeln.", "Enteignung kommt sowieso nicht."],
  },
  {
    nr: 14, thema: "Bedenkzeit", einwand: "Ich überlege es mir noch.",
    kernsatz: "Gern. Worüber genau? Dann klären wir genau diesen Punkt bis zu einem festen Termin.",
    nachfrage: "Welche Information oder welche Person fehlt dir noch für eine gute Entscheidung?",
    belege: [
      "Offenen Punkt wörtlich im CRM festhalten, mit Aufgabe, Verantwortlichem und Frist.",
      "Folgetermin mit Datum vereinbaren, nicht „Ich melde mich“.",
    ],
    zustimmung: "Ist es in Ordnung, wenn wir an einem festen Tag kurz sprechen? Bis dahin kläre ich den offenen Punkt.",
    nie: ["Das Angebot gilt nur bis heute.", "Morgen ist die Wohnung weg.", "Was gibt es da noch zu überlegen?"],
  },
  {
    nr: 15, thema: "Vertrauen", einwand: "Wer bist du überhaupt? Du willst mir doch nur etwas verkaufen.",
    kernsatz: "Ja, wir verkaufen Immobilien aus erster Hand vom Bauträger und verdienen daran. Gerade deshalb rechne ich mit echten Zahlen.",
    nachfrage: "Was müsstest du von uns sehen oder wissen, um uns zu vertrauen?",
    belege: [
      "Drei getrennte Termine, die Entscheidung liegt nach jedem Schritt beim Kunden.",
      "Alle Unterlagen vor der Entscheidung, jede Zahl darf die Steuerberatung und die Bank prüfen.",
      "Referenzen nur von echten Kunden mit Einverständnis.",
    ],
    zustimmung: "Wenn du alle Unterlagen vorab bekommst und jede Zahl prüfen lassen kannst: Ist das eine faire Grundlage?",
    nie: ["Wir verdienen daran gar nichts.", "Wir sind unabhängige Berater.", "Vertrau mir einfach."],
  },
];
