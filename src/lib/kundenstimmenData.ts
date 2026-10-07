// 5 ausführliche Kundenstimmen + 30 kurze Bewertungen
// Vorname + Nachname-Erstbuchstabe (DSGVO-konform)

export interface KundenstimmeFull {
  id: string;
  name: string; // "Vorname N."
  alter: number;
  beruf: string;
  ort: string;
  vorher: string;
  nachher: string;
  hilfe: string; // "Wie hat MOREImmo geholfen"
  rating: number; // 1-5
}

export interface KundenstimmeKurz {
  id: string;
  name: string; // "Vorname N."
  text: string;
  rating: number;
}

export const KUNDENSTIMMEN_FULL: KundenstimmeFull[] = [
  {
    id: "k1",
    name: "Markus B.",
    alter: 41,
    beruf: "Software-Architekt",
    ort: "München",
    vorher:
      "Ich hatte 80.000 € auf dem Tagesgeldkonto liegen und wusste, dass die Inflation mein Geld auffrisst. Aktien waren mir zu volatil, eine eigene Immobilie schien unerreichbar.",
    nachher:
      "Heute besitze ich zwei vermietete Wohnungen in Memmingen mit zusammen 145 m². Die Mieten decken die Finanzierung komplett, ich baue jeden Monat steuerbegünstigt Vermögen auf.",
    hilfe:
      "MOREImmo hat mir gezeigt, dass die Kaufnebenkosten (rund 9 %) immer aus Eigenkapital kommen müssen – das war für mich neu. Mit den restlichen 65.000 € konnten wir die Investition optimal hebeln. Die Bonitätsprüfung war in zwei Wochen durch.",
    rating: 5,
  },
  {
    id: "k2",
    name: "Sabine K.",
    alter: 52,
    beruf: "Selbstständige Steuerberaterin",
    ort: "Stuttgart",
    vorher:
      "Als Selbstständige habe ich keine gesetzliche Rente. Mein Steuerberater riet zu einer Denkmalimmobilie wegen der AfA, aber niemand konnte mir konkrete Objekte mit echten Zahlen zeigen.",
    nachher:
      "Ich habe ein 92-m²-Apartment in einem denkmalgeschützten Stadthaus gekauft. Allein die Sonder-AfA spart mir die ersten acht Jahre über 7.000 € Steuern – pro Jahr.",
    hilfe:
      "Was mich überzeugt hat: MOREImmo hat mir die Sanierungskosten transparent aufgeschlüsselt und das Finanzamt-Anerkennungsschreiben der Denkmalbehörde **vor** dem Kauf vorgelegt. Die Kaufnebenkosten habe ich aus meinem Eigenkapital gezahlt – das war von Anfang an klar kommuniziert.",
    rating: 5,
  },
  {
    id: "k3",
    name: "Daniel & Eva H.",
    alter: 36,
    beruf: "Zahnärzte-Ehepaar",
    ort: "Hamburg",
    vorher:
      "Wir hatten gemeinsam ein gutes Einkommen, aber kein Konzept für unser Geld. ETF-Sparpläne liefen, doch wir wollten Substanzwerte – etwas, das unsere Kinder einmal erben.",
    nachher:
      "Drei vermietete Wohnungen in unserem Portfolio, alle in B-Lagen mit guten Mietsteigerungen. Cashflow-positiv ab Jahr 4, wir planen Wohnung Nr. 4 für 2027.",
    hilfe:
      "MOREImmo hat uns einen Stufenplan über 10 Jahre erstellt – inklusive der jeweils benötigten Eigenkapital-Tranchen für die Kaufnebenkosten. Ohne diese klare Roadmap hätten wir uns nie an Wohnung Nr. 2 getraut.",
    rating: 5,
  },
  {
    id: "k4",
    name: "Robert M.",
    alter: 58,
    beruf: "Abteilungsleiter Maschinenbau",
    ort: "Augsburg",
    vorher:
      "Ich war misstrauisch gegenüber Vermögensberatern. Zu oft hatte ich Bekannten zugehört, die mit Schrottimmobilien aus den 90ern reingelegt wurden. Ich wollte echte Substanz, keine Steuersparmodelle ohne Hand und Fuß.",
    nachher:
      "Ich besitze eine vollvermietete 3-Zimmer-Wohnung in Sanierungsqualität A++. Die Bank hat 100 % des Kaufpreises finanziert, ich habe nur die Kaufnebenkosten beigesteuert.",
    hilfe:
      "Was den Unterschied macht: MOREImmo hat mir den Standort persönlich gezeigt, alle Mietverträge offengelegt und ein unabhängiges Wertgutachten eingeholt. Die Eigenkapitalquote für die Nebenkosten wurde von Anfang an realistisch kommuniziert.",
    rating: 5,
  },
  {
    id: "k5",
    name: "Lena F.",
    alter: 33,
    beruf: "Marketing Director",
    ort: "Berlin",
    vorher:
      "Als Frau in einer Single-Haushalt-Situation hatte ich Sorge, dass mich Banken bei einer Immobilienfinanzierung nicht ernst nehmen. Außerdem hatte ich ehrlich gesagt keinen Plan, wie das Ganze überhaupt funktioniert.",
    nachher:
      "Ich habe meine erste Eigentumswohnung – vermietet, 68 m², in einem B-Standort mit 7,2 % Bruttorendite. Mein monatlicher Aufwand nach Steuern: 90 €. Dafür baue ich Eigenkapital auf.",
    hilfe:
      "MOREImmo hat mich Schritt für Schritt durch den Prozess geführt. Besonders wichtig war die ehrliche Aufklärung: 'Du brauchst rund 28.000 € Eigenkapital für die Kaufnebenkosten – die kommen nie aus der Bankfinanzierung.' Diese Klarheit hat mir geholfen, gezielt zu sparen.",
    rating: 5,
  },
];

const VORNAMEN = [
  "Andreas", "Bettina", "Christoph", "Diana", "Erik", "Franziska", "Georg", "Hannah", "Ingo", "Julia",
  "Klaus", "Larissa", "Manuel", "Nina", "Oliver", "Petra", "Quentin", "Ramona", "Sebastian", "Tanja",
  "Ulrich", "Verena", "Werner", "Xenia", "Yvonne", "Zacharias", "Anton", "Birgit", "Carsten", "Dorothea",
];
const NACHNAME_INITIALEN = ["S.", "M.", "K.", "B.", "L.", "W.", "H.", "F.", "G.", "R.", "T.", "P.", "N.", "C.", "D."];
const KURZ_TEXTE = [
  "Endlich verstanden, wie Kapitalanlage wirklich funktioniert. Top Team!",
  "Transparente Beratung, keine versteckten Kosten. Kann ich nur empfehlen.",
  "Habe meine erste Wohnung gekauft – stressfrei dank MOREImmo.",
  "Beste Beratung seit Jahren. Hat mich aus der Niedrigzins-Falle geholt.",
  "Alle Zahlen wurden offen gelegt, auch die Kaufnebenkosten.",
  "Schnelle Bonitätsprüfung, klare Antworten – läuft.",
  "Mein Steuerberater war beeindruckt von der Denkmal-AfA-Konstruktion.",
  "Nach drei Jahren immer noch top betreut. Wie versprochen.",
  "Habe verglichen – MOREImmo war fairer als drei andere Anbieter.",
  "Realistische Renditeberechnungen, keine Schönrederei.",
  "Persönlicher Vertriebspartner, der wirklich erreichbar ist.",
  "Vom ersten Gespräch bis zum Notartermin perfekt durchgeplant.",
  "Klares Konzept, klare Sprache, klare Empfehlungen.",
  "Ich bin Wiederkäufer – sagt eigentlich alles.",
  "Top Standortauswahl, gute Mieter wurden direkt vorgestellt.",
  "Auch die Hausverwaltung läuft seit zwei Jahren reibungslos.",
  "Endlich ein Anbieter, der die Kaufnebenkosten von Anfang an erklärt.",
  "5 von 5 – würde sofort wieder zusagen.",
  "Habe lange gezögert, jetzt bin ich dankbar für die Geduld.",
  "Online-Portal mit allen Dokumenten – sehr modern.",
  "Vermögensaufbau ohne Stress, das war mein Ziel. Erreicht.",
  "Tolle Begleitung beim Erstgespräch, kein Druck.",
  "Steuerersparnis ist real – mein Vertriebspartner hat nicht zu viel versprochen.",
  "Auch komplexe Fragen werden geduldig erklärt.",
  "Mein Mann war skeptisch – jetzt ist auch er Fan.",
  "Vor allem die Aufrichtigkeit hat mich überzeugt.",
  "Selbst bei kleinen Investments fühlt man sich gut betreut.",
  "Klare Sache: nochmal jederzeit.",
  "Endlich verstehe ich meinen Steuerbescheid wieder.",
  "Vom Standort bis zur Bank alles aus einer Hand.",
];

export const KUNDENSTIMMEN_KURZ: KundenstimmeKurz[] = Array.from({ length: 30 }, (_, i) => ({
  id: `kk${i + 1}`,
  name: `${VORNAMEN[i]} ${NACHNAME_INITIALEN[i % NACHNAME_INITIALEN.length]}`,
  text: KURZ_TEXTE[i],
  rating: 5,
}));
