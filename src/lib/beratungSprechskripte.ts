// Sprechskripte zur Beratungspräsentation MOREImmo.
//
// Eine Quelle für zwei Ansichten: das Trainings-Cockpit in der
// Vertriebsakademie (Präsentation links, Skript rechts, scrollsynchron)
// und den Trainer-Modus in der Präsentation selbst (?trainer=1).
// Die Schlüssel entsprechen den Section-IDs der Präsentation, damit beide
// Ansichten die aktive Station eindeutig zuordnen können.
//
// Der rote Faden hinter fast jedem Skript: geistige Brandstiftung, sauber
// eingesetzt. Nicht wir überzeugen den Kunden, der Kunde überzeugt sich
// selbst: Er zieht die Schlussfolgerung beim Preis des Nichtstuns, er gibt
// die Antworten in Station 03, er zieht den Regler auf null. Was er selbst
// gesagt und bedient hat, verteidigt er später.

export interface BeratungSprechskript {
  /** Section-ID in der Beratungspräsentation MOREImmo (BeratungspraesentationHV.tsx) */
  id: string;
  /** Anzeigename der Station */
  station: string;
  /** Überleitung, die VOR dieser Station gesprochen wird */
  ueberleitung?: string;
  /** Überleitung in Du-Form. Fehlt sie, ist die Sie-Fassung ohne Anrede und gilt für beide. */
  ueberleitungDu?: string;
  /** Das Sprechskript, sinngemäß sprechen, nicht ablesen */
  skript: string;
  /** Sprechskript in Du-Form. Fehlt es, ist die Sie-Fassung ohne Anrede und gilt für beide. */
  skriptDu?: string;
  /** Verkaufspsychologie: warum das so aufgebaut ist. Richtet sich an den Berater, nicht an den Kunden. */
  warum: string;
}

/**
 * Liefert das Skript in der gewünschten Kundenanrede.
 *
 * Die Wahl kommt aus dem Erstgesprächsskript (meta.setterSkript.anrede).
 * Ohne Du-Fassung bleibt die Sie-Fassung stehen, sie enthält dann keine
 * direkte Anrede. Das PDF (beratungSkriptPdf.ts) nutzt die Du-Fassung.
 */
export function sprechskriptFuerAnrede(
  s: BeratungSprechskript,
  anrede: "sie" | "du",
): BeratungSprechskript {
  if (anrede !== "du") return s;
  return {
    ...s,
    ueberleitung: s.ueberleitungDu ?? s.ueberleitung,
    skript: s.skriptDu ?? s.skript,
  };
}

export const BERATUNG_SPRECHSKRIPTE: BeratungSprechskript[] = [
  {
    id: "hero",
    station: "Begrüßung",
    skript:
      "Herzlich willkommen. Schön, dass Sie sich die Zeit nehmen. Bevor wir starten: Haben Sie alles, Wasser, Kaffee? Dann schauen wir uns in Ruhe an, was in Ihrer Situation möglich ist.",
    skriptDu:
      "Herzlich willkommen. Schön, dass du dir die Zeit nimmst. Bevor wir starten: Hast du alles, Wasser, Kaffee? Dann schauen wir uns in Ruhe an, was in deiner Situation möglich ist.",
    warum:
      "Ankommen lassen. Der Hero zeigt den Kundennamen, wenn die Präsentation aus dem Kundenprofil geöffnet wurde. Hier noch keine Inhalte, nur Atmosphäre und Sicherheit.",
  },
  {
    id: "heute",
    station: "Station 01: Was machen wir heute?",
    skript:
      "Bevor wir über Immobilien sprechen, eine Sache vorweg: Heute fällt keine Kaufentscheidung. Heute geht es darum, dass Sie am Ende dieses Gesprächs verstehen, was in Ihrer Situation möglich ist. Wir schauen uns Ihre Ziele an, wie eine Kapitalanlageimmobilie funktioniert, welche Konzepte es gibt, welches zu Ihnen passt und wie der weitere Ablauf aussieht.",
    skriptDu:
      "Bevor wir über Immobilien sprechen, eine Sache vorweg: Heute fällt keine Kaufentscheidung. Heute geht es darum, dass du am Ende dieses Gesprächs verstehst, was in deiner Situation möglich ist. Wir schauen uns deine Ziele an, wie eine Kapitalanlageimmobilie funktioniert, welche Konzepte es gibt, welches zu dir passt und wie der weitere Ablauf aussieht.",
    warum:
      "Der Druck muss zuerst raus. Wer glaubt, er müsse heute unterschreiben, hört nicht zu, sondern verteidigt sich. Das Tagesziel ist die Selbstauskunft in Station 14, nicht der Kauf.",
  },
  {
    id: "nichtstun",
    station: "Einschub: Der Preis des Nichtstuns",
    ueberleitung:
      "Bevor wir über Immobilien reden, eine Frage: Was passiert eigentlich, wenn Sie gar nichts tun?",
    ueberleitungDu:
      "Bevor wir über Immobilien reden, eine Frage: Was passiert eigentlich, wenn du gar nichts tust?",
    skript:
      "Kein Weltuntergang, nur Mathematik. Nehmen wir 50.000 Euro auf einem gut verzinsten Tagesgeldkonto, zwei Prozent Zinsen, zweieinhalb Prozent Geldentwertung. Auf dem Papier werden daraus in zehn Jahren 60.950 Euro. Im Einkaufskorb sind es noch 47.615 Euro, rund 2.400 Euro weniger als heute. Die Zinsen holen die Geldentwertung nicht ein. Was macht Ihr Erspartes gerade?",
    skriptDu:
      "Kein Weltuntergang, nur Mathematik. Nehmen wir 50.000 Euro auf einem gut verzinsten Tagesgeldkonto, zwei Prozent Zinsen, zweieinhalb Prozent Geldentwertung. Auf dem Papier werden daraus in zehn Jahren 60.950 Euro. Im Einkaufskorb sind es noch 47.615 Euro, rund 2.400 Euro weniger als heute. Die Zinsen holen die Geldentwertung nicht ein. Was macht dein Erspartes gerade?",
    warum:
      "Geistige Brandstiftung in Reinform, aber entdramatisiert: Das Feuer legt die Rechnung, nicht du. Der Abschnitt endet mit einer Frage, damit der Kunde die Schlussfolgerung selbst zieht. Danach Pause machen und aushalten.",
  },
  {
    id: "ueberuns",
    station: "Station 02: MORE Immo in einem Satz",
    ueberleitung:
      "Damit Sie einschätzen können, ob unsere Arbeitsweise zu Ihnen passt, kurz wer hier eigentlich vor Ihnen sitzt.",
    ueberleitungDu:
      "Damit du einschätzen kannst, ob unsere Arbeitsweise zu dir passt, kurz wer hier eigentlich vor dir sitzt.",
    skript:
      "Wir begleiten Kunden beim strategischen Vermögensaufbau mit Immobilien. Nicht bei einem Kauf, sondern beim Aufbau: Strategie, geprüfte Objekte, Finanzierung, Steuer, Kaufbegleitung, Vermietung und Verwaltung. Und das bin ich. Sie haben ab heute einen festen Ansprechpartner, keine Hotline. Vom Erstgespräch bis lange nach dem Notartermin.",
    skriptDu:
      "Wir begleiten Kunden beim strategischen Vermögensaufbau mit Immobilien. Nicht bei einem Kauf, sondern beim Aufbau: Strategie, geprüfte Objekte, Finanzierung, Steuer, Kaufbegleitung, Vermietung und Verwaltung. Und das bin ich. Du hast ab heute einen festen Ansprechpartner, keine Hotline. Vom Erstgespräch bis lange nach dem Notartermin.",
    warum:
      "Vertrauensübertragung von der Marke auf die Person. Die Karte zeigt dich mit Foto und Kontakt, direkt anklickbar. Deshalb vorher das Profil in den Einstellungen pflegen.",
  },
  {
    id: "arbeitsweise",
    station: "Station 03: Die sechs Fragen",
    ueberleitung:
      "Unser Motto! Erst Ihre Ziele. Dann die passende Immobilie. Nicht umgekehrt.",
    ueberleitungDu:
      "Unser Motto! Erst deine Ziele. Dann die passende Immobilie. Nicht umgekehrt.",
    skript:
      "Sechs Dinge müssen wir wissen, bevor wir über eine konkrete Wohnung reden, und ich schreibe Ihre Antworten gleich hier mit. Erstens: Was ist Ihre Erwartungshaltung an das heutige Gespräch? Sagen Sie es ruhig konkret, am Ende gleichen wir gemeinsam ab, ob wir sie erfüllt haben. Zweitens: Welche Erfahrungen haben Sie bisher mit Immobilien gemacht? Drittens: Welche Ziele sind Ihnen besonders wichtig? Wählen Sie bis zu drei aus der Liste, das zuerst gewählte führt. Viertens: Welcher monatliche Eigenaufwand ist für Sie gut darstellbar? Fünftens: Welche Finanzierung ist realistisch? Das schätzen wir nicht, das rechnen wir, aus Ihren Einnahmen, Ihren Ausgaben und Ihrem Eigenkapital, mit 80 Prozent Ihres Überschusses als tragbarer Rate und 6 Prozent Annuität. Und sechstens: Was ist Ihnen bei einem Immobilieninvestment besonders wichtig? Sagen Sie es ruhig deutlich, daran messen wir jedes Angebot, das ich Ihnen später zeige.",
    skriptDu:
      "Sechs Dinge müssen wir wissen, bevor wir über eine konkrete Wohnung reden, und ich schreibe deine Antworten gleich hier mit. Erstens: Was ist deine Erwartungshaltung an das heutige Gespräch? Sag es ruhig konkret, am Ende gleichen wir gemeinsam ab, ob wir sie erfüllt haben. Zweitens: Welche Erfahrungen hast du bisher mit Immobilien gemacht? Drittens: Welche Ziele sind dir besonders wichtig? Wähl bis zu drei aus der Liste, das zuerst gewählte führt. Viertens: Welcher monatliche Eigenaufwand ist für dich gut darstellbar? Fünftens: Welche Finanzierung ist realistisch? Das schätzen wir nicht, das rechnen wir, aus deinen Einnahmen, deinen Ausgaben und deinem Eigenkapital, mit 80 Prozent deines Überschusses als tragbarer Rate und 6 Prozent Annuität. Und sechstens: Was ist dir bei einem Immobilieninvestment besonders wichtig? Sag es ruhig deutlich, daran messen wir jedes Angebot, das ich dir später zeige.",
    warum:
      "Der wichtigste Eingriff der Präsentation: Was der Kunde selbst beantwortet, verteidigt er später. Die Erwartungshaltung wörtlich mitschreiben, sie kommt in der Rückspiegelung als Erfüllungs-Check zurück: Sagt der Kunde dort Ja, hat er das Gespräch selbst für gelungen erklärt. Die neun Ziele sind dieselben wie in der Selbstauskunft, seine Wahl wandert dorthin mit und ist schon angehakt. Pflicht sind Ziel, Monatsbeitrag und Haushaltsrechnung, offene Felder bleiben orange umrandet. Das Konzept leitet die Präsentation still aus dem Hauptziel ab, es steht nicht als eigenes Kästchen im Fragenblock und auch nicht in der Rückspiegelung: Dort stehen nur die Worte des Kunden, nicht unsere Folgerung. Frage sechs ebenfalls wörtlich mitschreiben, sie ist der Maßstab, an dem er jedes Angebot misst.",
  },
  {
    id: "prozess",
    station: "Station 04: Der gemeinsame Weg",
    skript:
      "Sechs Schritte. Sie wissen jederzeit, wo Sie stehen und was als Nächstes kommt. Heute machen wir Schritt eins und zwei: dieses Gespräch und am Ende die Selbstauskunft. Danach entwickeln wir im Hintergrund Ihre Strategie, beim nächsten Termin sehen Sie einen konkreten Objektvorschlag mit vollständiger Rechnung. Schritt fünf heißt bewusst: nur wenn Sie Ja sagen. Wir stehen heute bei Schritt eins, am Ende dieses Gesprächs bei Schritt zwei.",
    skriptDu:
      "Sechs Schritte. Du weißt jederzeit, wo du stehst und was als Nächstes kommt. Heute machen wir Schritt eins und zwei: dieses Gespräch und am Ende die Selbstauskunft. Danach entwickeln wir im Hintergrund deine Strategie, beim nächsten Termin siehst du einen konkreten Objektvorschlag mit vollständiger Rechnung. Schritt fünf heißt bewusst: nur wenn du Ja sagst. Wir stehen heute bei Schritt eins, am Ende dieses Gesprächs bei Schritt zwei.",
    warum:
      "Orientierung senkt Kaufangst: Zwischen heute und einer Unterschrift liegen sichtbar noch vier Schritte. Gleichzeitig setzt du unmissverständlich das Tagesziel Selbstauskunft.",
  },
  {
    id: "funktion",
    station: "Station 05: Vier Bausteine",
    ueberleitung:
      "Bevor wir über Konzepte sprechen: Werfen wir einen Blick darauf, wie eine Immobilie Vermögen aufbaut.",
    skript:
      "Vier Dinge arbeiten gleichzeitig für Sie: Der Mieter bezahlt einen großen Teil der Finanzierung, die Steuer kann Ihre Steuerlast senken, mit jeder Rate gehört Ihnen ein Stück mehr, und die Wertentwicklung kann dazukommen, garantiert ist sie nicht. Und jetzt die entscheidende Frage: Wer trägt eigentlich Ihre monatliche Rate? Nehmen wir die Wohnung, die wir gleich durchrechnen: Die Rate beträgt 1.604 Euro. Davon trägt der Mieter 1.250 Euro, das sind 78 Prozent. Das Finanzamt trägt 126 Euro, das sind 8 Prozent. Und bei Ihnen bleiben 228 Euro, also 14 Prozent. Den größten Teil trägt nicht Ihr Konto. Das kann eine Kapitalanlageimmobilie, und ein Sparplan kann es nicht.",
    skriptDu:
      "Vier Dinge arbeiten gleichzeitig für dich: Der Mieter bezahlt einen großen Teil der Finanzierung, die Steuer kann deine Steuerlast senken, mit jeder Rate gehört dir ein Stück mehr, und die Wertentwicklung kann dazukommen, garantiert ist sie nicht. Und jetzt die entscheidende Frage: Wer trägt eigentlich deine monatliche Rate? Nehmen wir die Wohnung, die wir gleich durchrechnen: Die Rate beträgt 1.604 Euro. Davon trägt der Mieter 1.250 Euro, das sind 78 Prozent. Das Finanzamt trägt 126 Euro, das sind 8 Prozent. Und bei dir bleiben 228 Euro, also 14 Prozent. Den größten Teil trägt nicht dein Konto. Das kann eine Kapitalanlageimmobilie, und ein Sparplan kann es nicht.",
    warum:
      "Der Ring mit dem kleinen Rest ist der Aha-Moment, den der Kunde zu Hause weitererzählt. Die Wertsteigerung sofort selbst relativieren, das macht die drei starken Bausteine glaubwürdig. Wichtig sind die Zahlen selbst: Der Mieteranteil ist die Kaltmiete von 1.400 Euro abzüglich der 150 Euro nicht umlagefähigen Kosten, der Anteil des Finanzamts ist die Steuerentlastung ab dem zweiten Jahr, der Rest ist der eigene Beitrag. Die drei summieren sich genau auf die Rate, damit hältst du jeder Nachfrage stand. Gerechnet wird bewusst mit dem Dauerzustand ab dem zweiten Jahr, nicht mit dem ersten: Da trägt das Finanzamt 826 Euro und damit über die Hälfte, und diese Aufteilung hält nur zwölf Monate.",
  },
  {
    id: "vergleich",
    station: "Station 06: Immobilie, Aktien, Tagesgeld",
    ueberleitung:
      "Und die Frage, die sich hier jeder stellt: Warum dann nicht einfach sparen oder Aktien kaufen?",
    skript:
      "Ein ehrlicher Vergleich: Immobilien sind nicht grundsätzlich besser. Aktien sind schneller verfügbar, Tagesgeld schwankt kaum. Immobilien können nur eines, was die anderen beiden nicht können: mit Bankkapital einen großen Sachwert erwerben, während der Mieter mitfinanziert. Für ein Aktiendepot leiht Ihnen keine Bank 350.000 Euro. Und ehrlich dazu: Wer in zwei Jahren an sein Geld muss, ist woanders besser aufgehoben.",
    skriptDu:
      "Ein ehrlicher Vergleich: Immobilien sind nicht grundsätzlich besser. Aktien sind schneller verfügbar, Tagesgeld schwankt kaum. Immobilien können nur eines, was die anderen beiden nicht können: mit Bankkapital einen großen Sachwert erwerben, während der Mieter mitfinanziert. Für ein Aktiendepot leiht dir keine Bank 350.000 Euro. Und ehrlich dazu: Wer in zwei Jahren an sein Geld muss, ist woanders besser aufgehoben.",
    warum:
      "Zweiseitige Argumentation: Das offene Zugeben der Nachteile kauft Glaubwürdigkeit für das Hebel-Argument. Eine Einschränkung, die du selbst nennst, kann dir später niemand entgegenhalten.",
  },
  {
    id: "konzepte",
    station: "Station 07: Drei Konzepte, drei Ziele",
    ueberleitung:
      "Wenn das für Sie passt, bleibt nur noch eine Frage: Welches der drei Konzepte passt zu Ihrem Ziel?",
    ueberleitungDu:
      "Wenn das für dich passt, bleibt nur noch eine Frage: Welches der drei Konzepte passt zu deinem Ziel?",
    skript:
      "Wir arbeiten mit drei Konzepten. Sie unterscheiden sich nicht in der Qualität, sondern darin, was sie für Sie leisten sollen: Sanierter Bestand für etablierte Lagen und starken Steuereffekt, WG und Co-Living für höhere Mieteinnahmen und Rendite, KfW 40 QNG für Neubau, Förderung und Planbarkeit. Schauen wir uns zuerst das an, das zu Ihrem Ziel passt.",
    skriptDu:
      "Wir arbeiten mit drei Konzepten. Sie unterscheiden sich nicht in der Qualität, sondern darin, was sie für dich leisten sollen: Sanierter Bestand für etablierte Lagen und starken Steuereffekt, WG und Co-Living für höhere Mieteinnahmen und Rendite, KfW 40 QNG für Neubau, Förderung und Planbarkeit. Schauen wir uns zuerst das an, das zu deinem Ziel passt.",
    warum:
      "Mit dem abgeleiteten Konzept beginnen: Das bestätigt die eigene Zielwahl des Kunden. Die anderen beiden kurz zeigen, das beweist Auswahl statt Einheitsprodukt.",
  },
  {
    id: "konzept-detail",
    station: "Station 08: Konzept im Detail",
    skript:
      "Bestand: ausgewählte Bestandswohnungen in etablierten Lagen, direkte Vermietbarkeit, reguläre AfA, unter Umständen sofort abzugsfähiger Erhaltungsaufwand. WG: möblierte Zimmer einzeln vermietet, deutlich mehr Miete je Quadratmeter, Standorte München und Nürnberg. KfW 40 QNG: energieeffizienter Neubau, Förderkredite, Sonderabschreibung, wenig Sanierungsbedarf. Gleich danach rechnen wir jedes dieser Konzepte an einem echten Objekt durch.",
    warum:
      "Je Konzept 30 Sekunden Prinzip statt fünf Minuten Detail. Alle drei Reiter tragen dieselbe Nummer 08, du bleibst also im selben Abschnitt und der Gesprächsfaden reißt nicht. Vertieft wird nicht hier, sondern in der Musterrechnung mit echten Zahlen.",
  },
  {
    id: "beispielkunde",
    station: "Station 09: Drei Objekte, Zahl für Zahl",
    ueberleitung:
      "Klingt das bis hierhin nach Ihrer Situation? Dann rechnen wir es Zahl für Zahl durch.",
    ueberleitungDu:
      "Klingt das bis hierhin nach deiner Situation? Dann rechnen wir es Zahl für Zahl durch.",
    skript:
      "Kein Idealfall, sondern ein typischer Fall: 4.600 Euro netto, 42 Prozent Grenzsteuersatz, Ziel langfristiger Vermögensaufbau, Eigenkapital in Höhe der Kaufnebenkosten. Beim sanierten Bestand sind das 350.000 Euro Kaufpreis, 100 Quadratmeter, 1.400 Euro Kaltmiete und 19.250 Euro Eigenkapital. Alle drei Konzepte rechnen wir durch, damit Sie den Unterschied sehen und nicht glauben müssen.",
    skriptDu:
      "Kein Idealfall, sondern ein typischer Fall: 4.600 Euro netto, 42 Prozent Grenzsteuersatz, Ziel langfristiger Vermögensaufbau, Eigenkapital in Höhe der Kaufnebenkosten. Beim sanierten Bestand sind das 350.000 Euro Kaufpreis, 100 Quadratmeter, 1.400 Euro Kaltmiete und 19.250 Euro Eigenkapital. Alle drei Konzepte rechnen wir durch, damit du den Unterschied siehst und nicht glauben musst.",
    warum:
      "Ein typischer Fall erzeugt Wiedererkennung, ein Idealfall Misstrauen. Der Umschalter ist mit dem Konzept vorbelegt, das zum Ziel des Kunden passt, das darfst du aussprechen. Es sind echte Objekte mit Adresse und Bildern aus den Unterlagen, und der Kasten Woher diese Zahlen kommen sagt offen, was aus den Unterlagen stammt und was hergeleitet ist. Genau diese Offenheit trägt die ganze Zahlenstrecke.",
  },
  {
    id: "rechnung",
    station: "Station 10: Die Rechnung Zeile für Zeile",
    skript:
      "1.400 Euro Miete rein, 1.604 Euro Zins und Tilgung raus, 150 Euro nicht umlagefähige Kosten. Bleiben rund 354 Euro, die Sie vor Steuer selbst beitragen. Die andere Seite: 826 Euro Steuerentlastung im Monat im ersten Jahr, 525 Euro Tilgung im Monatsschnitt, das ist kein Aufwand, das ist Ihr Vermögen. Und jetzt das Wichtigste: Ziehen Sie den Regler ruhig selbst auf null. Selbst ohne jede Wertsteigerung bleiben 63.032 Euro, weil die Tilgung unabhängig vom Markt läuft. Alles darüber ist Zugabe, nicht Grundlage.",
    skriptDu:
      "1.400 Euro Miete rein, 1.604 Euro Zins und Tilgung raus, 150 Euro nicht umlagefähige Kosten. Bleiben rund 354 Euro, die du vor Steuer selbst beiträgst. Die andere Seite: 826 Euro Steuerentlastung im Monat im ersten Jahr, 525 Euro Tilgung im Monatsschnitt, das ist kein Aufwand, das ist dein Vermögen. Und jetzt das Wichtigste: Zieh den Regler ruhig selbst auf null. Selbst ohne jede Wertsteigerung bleiben 63.032 Euro, weil die Tilgung unabhängig vom Markt läuft. Alles darüber ist Zugabe, nicht Grundlage.",
    warum:
      "Belastung zuerst, dann Entlastung, dann Tilgung: Diese Reihenfolge klingt nach Rechnung, nicht nach Schönrechnen. Der Regler ist der stärkste Moment: Der Kunde entkräftet seinen eigenen Haupteinwand, mit seiner eigenen Hand. Gib ihm die Maus.",
  },
  {
    id: "rendite",
    station: "Station 11: Was ein Sparplan leisten müsste",
    ueberleitung:
      "Und jetzt drehen wir die Rechnung einmal um: Was müsste ein Sparplan leisten, um in zehn Jahren dasselbe aufzubauen?",
    skript:
      "Ihr Einsatz sind genau zwei Dinge: das Eigenkapital für die Kaufnebenkosten, beim sanierten Bestand 19.250 Euro, und Ihr monatlicher Cashflow nach Steuer über 120 Monate. Daraus entsteht bis zum zehnten Jahr genau das Vermögen, das Sie eben in der Schere gesehen haben. Und rechts steht, welche Rendite ein Sparplan Jahr für Jahr abwerfen müsste, um mit demselben Einsatz genau dort anzukommen. Netto steuerfrei, denn ein Verkauf nach mehr als zehn Jahren ist im Privatvermögen nach Paragraf 23 steuerfrei. Vor Steuer müsste ein Sparplan also noch mehr bringen. Und ziehen Sie den Regler im Abschnitt davor gern noch einmal auf null, diese Zahl rechnet live mit.",
    skriptDu:
      "Dein Einsatz sind genau zwei Dinge: das Eigenkapital für die Kaufnebenkosten, beim sanierten Bestand 19.250 Euro, und dein monatlicher Cashflow nach Steuer über 120 Monate. Daraus entsteht bis zum zehnten Jahr genau das Vermögen, das du eben in der Schere gesehen hast. Und rechts steht, welche Rendite ein Sparplan Jahr für Jahr abwerfen müsste, um mit demselben Einsatz genau dort anzukommen. Netto steuerfrei, denn ein Verkauf nach mehr als zehn Jahren ist im Privatvermögen nach Paragraf 23 steuerfrei. Vor Steuer müsste ein Sparplan also noch mehr bringen. Und zieh den Regler im Abschnitt davor gern noch einmal auf null, diese Zahl rechnet live mit.",
    warum:
      "Hier wird aus vielen Einzelzahlen eine einzige, die der Kunde selbst einordnen kann: Er weiß ungefähr, was sein Depot oder sein Tagesgeld bringt. Genau deshalb ist der Vergleich mit dem Sparplan der Moment, in dem die Rechnung greifbar wird. Der Regler auf null zeigt, dass auch ohne jede Wertsteigerung eine Rendite bleibt. Wichtig: nicht übertreiben. Das ist eine Vergleichsrechnung und keine Zusage, und je höher die angenommene Wertsteigerung, desto größer die Zahl. Sag das selbst, sonst denkt es der Kunde.",
  },
  {
    id: "steuer",
    station: "Station 12: Die Steuerwirkung",
    ueberleitung:
      "Was zahlen Sie eigentlich im Jahr an Steuern, und was bleibt davon bei Ihnen? Genau hier wird es interessant.",
    ueberleitungDu:
      "Was zahlst du eigentlich im Jahr an Steuern, und was bleibt davon bei dir? Genau hier wird es interessant.",
    skript:
      "Was Sie ohnehin an Steuern zahlen, floss bisher ab. Mit einer vermieteten Immobilie ändert sich, wohin ein Teil davon geht. Beim Bestand: steuerliches Ergebnis minus 23.588 Euro, bei 42 Prozent sind das 9.907 Euro im Jahr, rund 826 Euro im Monat. Und wichtig: Der große Effekt des ersten Jahres kommt genau einmal, wegen des einmaligen Erhaltungsaufwands. Ab dem zweiten Jahr sind es rund 126 Euro im Monat. Wer Ihnen etwas anderes verspricht, rechnet Ihnen etwas vor.",
    skriptDu:
      "Was du ohnehin an Steuern zahlst, floss bisher ab. Mit einer vermieteten Immobilie ändert sich, wohin ein Teil davon geht. Beim Bestand: steuerliches Ergebnis minus 23.588 Euro, bei 42 Prozent sind das 9.907 Euro im Jahr, rund 826 Euro im Monat. Und wichtig: Der große Effekt des ersten Jahres kommt genau einmal, wegen des einmaligen Erhaltungsaufwands. Ab dem zweiten Jahr sind es rund 126 Euro im Monat. Wer dir etwas anderes verspricht, rechnet dir etwas vor.",
    warum:
      "Das zweite Jahr ungefragt nennen ist der Unterschied zwischen Abschluss und Empfehlung. Der bernsteinfarbene Ehrlichkeitskasten entwertet die Zahl nicht, er beglaubigt sie. Ein Punkt, den du kennen musst, aber nicht versprechen darfst: Bei Bestand und WG kann die Gebäude-AfA mit einem Restnutzungsdauergutachten in vielen Fällen deutlich höher ausfallen, was den steuerlichen Effekt verstärkt. Der Hinweis steht auf der Folie, entschieden wird es vom Finanzamt.",
  },
  {
    id: "referenzen",
    station: "Einschub: Referenzen",
    ueberleitung: "Und wie sieht so etwas am Ende wirklich aus? Sehen Sie selbst.",
    ueberleitungDu: "Und wie sieht so etwas am Ende wirklich aus? Schau selbst.",
    skript:
      "Hier sehen Sie Projekte, die genau so umgesetzt wurden, vorher und nachher. Schauen Sie in Ruhe. Das sind keine Renderings, das ist gebaut und vermietet.",
    skriptDu:
      "Hier siehst du Projekte, die genau so umgesetzt wurden, vorher und nachher. Schau in Ruhe. Das sind keine Renderings, das ist gebaut und vermietet.",
    warum:
      "Der Kunde hat gerade verstanden, was möglich ist, und fragt sich zum ersten Mal, wie das in der Wirklichkeit aussieht. Bilder sprechen lassen, sparsam kommentieren.",
  },
  {
    id: "pruefung",
    station: "Station 13: Was wir bei jedem Objekt prüfen",
    skript:
      "Diese Liste ist der Grund, warum wir Ihnen nicht jede Wohnung zeigen, die auf den Markt kommt. Zehn Punkte, vom Standort über die Rücklagen der Eigentümergemeinschaft bis zur Wiederverkaufbarkeit. Eine zu dünne Rücklage ist für uns ein Grund, ein Objekt gar nicht erst anzubieten.",
    skriptDu:
      "Diese Liste ist der Grund, warum wir dir nicht jede Wohnung zeigen, die auf den Markt kommt. Zehn Punkte, vom Standort über die Rücklagen der Eigentümergemeinschaft bis zur Wiederverkaufbarkeit. Eine zu dünne Rücklage ist für uns ein Grund, ein Objekt gar nicht erst anzubieten.",
    warum:
      "Knappheit durch Auswahl statt durch Fristen. Der Kunde versteht: Ein Vorschlag von uns ist bereits ein Filterergebnis. Das wertet den Objektvorschlag auf, bevor er existiert.",
  },
  {
    id: "rueckblick",
    station: "Einschub: Was du heute gesagt hast",
    ueberleitung:
      "Alles, was wir bis hier besprochen haben, war allgemein. Ab jetzt geht es um Sie.",
    ueberleitungDu:
      "Alles, was wir bis hier besprochen haben, war allgemein. Ab jetzt geht es um dich.",
    skript:
      "Kurz zusammengefasst, damit wir beide sicher sind, dass ich Sie richtig verstanden habe: Ihre Ziele, Ihr Finanzierungsrahmen, Ihr Monatsbeitrag, daraus folgt das Konzept, dazu Ihre Erfahrung und Ihre Sicht auf Immobilien. Und ganz am Anfang haben Sie mir Ihre Erwartung an dieses Gespräch genannt. Die gleichen wir jetzt offen ab: Haben wir diese Erwartung im heutigen Gespräch erfüllt? Alles, was Sie heute gesagt haben, ist die halbe Selbstauskunft. Den Rest füllen wir gleich gemeinsam aus, dann rechnet der nächste Termin mit Ihren Zahlen statt mit einem Beispiel.",
    skriptDu:
      "Kurz zusammengefasst, damit wir beide sicher sind, dass ich dich richtig verstanden habe: deine Ziele, dein Finanzierungsrahmen, dein Monatsbeitrag, daraus folgt das Konzept, dazu deine Erfahrung und deine Sicht auf Immobilien. Und ganz am Anfang hast du mir deine Erwartung an dieses Gespräch genannt. Die gleichen wir jetzt offen ab: Haben wir diese Erwartung im heutigen Gespräch erfüllt? Alles, was du heute gesagt hast, ist die halbe Selbstauskunft. Den Rest füllen wir gleich gemeinsam aus, dann rechnet der nächste Termin mit deinen Zahlen statt mit einem Beispiel.",
    warum:
      "Wenn ein Mensch seine eigenen Worte hört, ist die Schlussfolgerung seine und nicht deine. Der Erfüllungs-Check zur Erwartung ist ein Commitment-Moment: Die Frage wirklich stellen und die Antwort abwarten, ein Ja des Kunden trägt den Rest des Gesprächs. Die halbe Selbstauskunft macht aus einem neuen Formular die Fortsetzung eines begonnenen Vorgangs.",
  },
  {
    id: "schritt",
    station: "Station 14: Die Selbstauskunft",
    skript:
      "Wir füllen Ihre Selbstauskunft direkt hier im Termin zusammen aus. Nicht als Hausaufgabe, nicht per Mail hinterher, sondern jetzt, solange ich Ihre Fragen sofort beantworten kann. Ohne diese Angaben ist jeder Objektvorschlag geraten. Und ganz wichtig: Die Selbstauskunft ist ausdrücklich noch keine Kaufentscheidung und verpflichtet Sie zu nichts.",
    skriptDu:
      "Wir füllen deine Selbstauskunft direkt hier im Termin zusammen aus. Nicht als Hausaufgabe, nicht per Mail hinterher, sondern jetzt, solange ich deine Fragen sofort beantworten kann. Ohne diese Angaben ist jeder Objektvorschlag geraten. Und ganz wichtig: Die Selbstauskunft ist ausdrücklich noch keine Kaufentscheidung und verpflichtet dich zu nichts.",
    warum:
      "Das Ziel des gesamten Gesprächs, als gemeinsame Arbeitshandlung gerahmt statt als Verpflichtung. Die doppelte Unverbindlichkeit ist kein Weichmacher, sie ist die Bedingung fürs Mitmachen.",
  },
  {
    id: "termin",
    station: "Station 15: Der nächste Termin",
    skript:
      "Ihre Selbstauskunft ist die Grundlage, mit der wir uns intern gezielt auf Sie vorbereiten. Wenn wir uns wiedersehen, liegen Ihre persönliche Strategie, passende Objekte und die durchgerechneten Zahlen bereits fertig auf dem Tisch. Konkret bekommen Sie beim nächsten Termin, auf Ihre Zahlen gerechnet: Objektvorschlag, Wirtschaftlichkeitsberechnung, persönliche Cashflow-Berechnung, Steuerwirkung, Finanzierungsvorschlag und eine klare Chancen- und Risikoanalyse. Danach entscheiden Sie in Ruhe: Passt dieses Objekt, oder suchen wir weiter? Beides ist ein gutes Ergebnis. Ein Nein zum falschen Objekt ist uns lieber als ein Ja, das Sie in zwei Jahren bereuen.",
    skriptDu:
      "Deine Selbstauskunft ist die Grundlage, mit der wir uns intern gezielt auf dich vorbereiten. Wenn wir uns wiedersehen, liegen deine persönliche Strategie, passende Objekte und die durchgerechneten Zahlen bereits fertig auf dem Tisch. Konkret bekommst du beim nächsten Termin, auf deine Zahlen gerechnet: Objektvorschlag, Wirtschaftlichkeitsberechnung, persönliche Cashflow-Berechnung, Steuerwirkung, Finanzierungsvorschlag und eine klare Chancen- und Risikoanalyse. Danach entscheidest du in Ruhe: Passt dieses Objekt, oder suchen wir weiter? Beides ist ein gutes Ergebnis. Ein Nein zum falschen Objekt ist uns lieber als ein Ja, das du in zwei Jahren bereust.",
    warum:
      "Der ausdrücklich erlaubte Ausstieg senkt den Widerstand gegen den einzigen Schritt, der heute verlangt wird. Wer weiter suchen darf, fürchtet die Selbstauskunft nicht.",
  },
];

/** Nachschlagen per Section-ID, für Cockpit und Trainer-Modus. */
export const SPRECHSKRIPT_NACH_ID: Record<string, BeratungSprechskript> = Object.fromEntries(
  BERATUNG_SPRECHSKRIPTE.map((s) => [s.id, s]),
);
