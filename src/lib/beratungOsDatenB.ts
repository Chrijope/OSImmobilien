/**
 * Beratungspräsentation B (Route `/beratungspraesentation-osimmobilien-b`).
 *
 * Eine Vergleichsfassung für die Geschäftsleitung. Sie nutzt dieselbe Seite
 * (`BeratungspraesentationHV.tsx`, Prop `variante="b"`) und dieselben Zahlen
 * wie Fassung A; hier stehen nur die Texte, die in B anders lauten.
 *
 * Ziel der Texte: Nutzen aus Kundensicht, Zukunftsbilder, Verlust heute
 * gegen Aufbau mit OS, Ja-Fragen, kurze Sätze. Zahlen, Fußnoten und
 * Risikohinweise bleiben wörtlich wie in A.
 */
import { OS_TEXTE, type KonzeptOs } from "@/lib/beratungOsDaten";

const A = OS_TEXTE;

export const OS_TEXTE_B: typeof OS_TEXTE = {
  ...A,

  heute: {
    ...A.heute,
    text: "Heute unterschreibst du nichts. Wir prüfen gemeinsam, ob eine vermietete Immobilie dich deinen Zielen näher bringt. Mit deinen Zahlen, vor und nach Steuern.",
    punkte: [
      { titel: "Deine Ziele", text: "Was dir wichtig ist." },
      { titel: "Das Konzept", text: "Wie Mieter und Steuer für dich mitzahlen." },
      { titel: "Echte Objekte", text: "Geprüft, mit den Zahlen aus unseren Exposés." },
      { titel: "Deine Entscheidung", text: "Passt es? Dann gehen wir den nächsten Schritt." },
    ],
  },

  ziele: {
    ...A.ziele,
    nachfrage: "Stimmt das so? Möchtest du etwas ergänzen?",
  },

  luecke: {
    ...A.luecke,
    frage: "Stell dir vor, diese Lücke ist geschlossen. Wäre das ein gutes Gefühl?",
  },

  nichtstun: {
    ...A.nichtstun,
    karten: [
      { kopf: "Heute auf dem Konto", wert: "50.000 €", text: "Tagesgeld zu 2 % Zinsen" },
      { kopf: "Kontostand in 10 Jahren", wert: "60.950 €", text: "Sieht nach mehr aus." },
      { kopf: "Was das Geld dann noch kauft", wert: "47.615 €", text: "Rund 2.400 € weniger als heute. Das ist der Verlust.", warnung: true },
    ],
    satz: "Heute verliert dein Erspartes leise an Wert. Mit einer vermieteten Immobilie tragen Mieter und Steuerwirkung einen großen Teil der Rate, und mit jeder Tilgung wächst dein Vermögen.",
  },

  werWirSind: {
    ...A.werWirSind,
    text: "Wir finden geprüfte, vermietete Wohnungen in Berlin und Brandenburg, die zu deinen Zielen passen. Und wir begleiten dich vom ersten Gespräch bis zur Kaufpreiszahlung.",
    karten: [
      { titel: "Geprüfte Objekte", text: "Du siehst nur, was wir vorher geprüft haben: Lage, Miete, Zustand, Unterlagen." },
      { titel: "Deine Zahlen", text: "Jede Rechnung mit deinem Einkommen. Vor und nach Steuern, mit Stresstest." },
      { titel: "Ein Ansprechpartner", text: "Einer für alles: Konzept, Bank, Notar, Übergabe." },
      // Pflichthinweis, wörtlich wie in A.
      A.werWirSind.karten[3],
    ],
  },

  konzept: {
    ...A.konzept,
    karten: {
      zusatzrente: {
        ...A.konzept.karten.zusatzrente,
        text: "Stell dir vor: Du gehst in Rente, die Wohnung gehört dir, und die Miete kommt jeden Monat als zweite Rente dazu. Bis dahin tragen Mieter und Steuer den größten Teil.",
      },
      steuer: {
        ...A.konzept.karten.steuer,
        text: "Heute geht ein Teil deines Gehalts ans Finanzamt und ist weg. Mit diesem Konzept fließt ein Teil davon in dein eigenes Vermögen. Für Einkommen mit hohem Steuersatz.",
      },
    },
  },

  schritt: {
    ...A.schritt,
    text: "Dafür brauchen wir deine Selbstauskunft. Wir füllen sie jetzt zusammen aus, in etwa 15 Minuten. Bis zur Objektvorstellung in einer Woche fehlen dann nur noch Ausweis und letzte Gehaltsabrechnung.",
  },
};

/** Abschnitt 04 in B: die Balkengrafik zur Kaufkraft. Werte wie in den Karten. */
export const KAUFKRAFT_B = {
  vorspann: "Ein einfaches Beispiel: 50.000 € auf dem Tagesgeld, 2 % Zinsen, 2,5 % Inflation.",
  grafikTitel: "Kaufkraft heute und in 10 Jahren",
  balken: [
    { label: "Heute", wert: 50_000, ton: "neutral" },
    { label: "Kontostand in 10 Jahren", wert: 60_950, ton: "papier" },
    { label: "Kaufkraft in 10 Jahren", wert: 47_615, ton: "verlust" },
  ] as ReadonlyArray<{ label: string; wert: number; ton: "neutral" | "papier" | "verlust" }>,
};

/** Vertriebsdokumente in B, je Konzept. Liegen unter public/vertriebsunterlagen/. */
export const DOKUMENTE_B: Record<KonzeptOs, { knopf: string; href: string }> = {
  steuer: { knopf: "Dokument öffnen: Steuerersparnis", href: "/vertriebsunterlagen/steuerersparnis-mit-immobilien.pdf" },
  zusatzrente: { knopf: "Dokument öffnen: Altersvorsorge", href: "/vertriebsunterlagen/arbeitsleistung-und-immobilienvermoegen.pdf" },
};
