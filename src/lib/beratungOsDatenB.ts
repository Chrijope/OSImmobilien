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

  // Agenda, Rentenlücke und Nichtstun seit dem 21.10.2026 wie in A (Texte der PDF-Präsentation).
  werWirSind: {
    ...A.werWirSind,
    text: "Wir finden geprüfte, vermietete Wohnungen in Berlin und Brandenburg, die zu Ihren Zielen passen. Und wir begleiten Sie vom ersten Gespräch bis zur Kaufpreiszahlung.",
    karten: [
      { titel: "Geprüfte Objekte", text: "Sie sehen nur, was wir vorher geprüft haben: Lage, Miete, Zustand, Unterlagen." },
      { titel: "Ihre Zahlen", text: "Jede Rechnung mit Ihrem Einkommen. Vor und nach Steuern, mit Stresstest." },
      { titel: "Ein Ansprechpartner", text: "Einer für alles: Konzept, Bank, Notar, Übergabe." },
      // „Offen gesagt …“ entfällt seit dem 21.10.2026 (Wunsch Christian), auch in A.
    ],
  },

  konzept: {
    ...A.konzept,
    karten: {
      zusatzrente: {
        ...A.konzept.karten.zusatzrente,
        text: "Stellen Sie sich vor: Sie gehen in Rente, die Wohnung gehört Ihnen, und die Miete kommt jeden Monat als zweite Rente dazu. Bis dahin tragen Mieter und Steuer den größten Teil.",
      },
      steuer: {
        ...A.konzept.karten.steuer,
        text: "Heute geht ein Teil Ihres Gehalts ans Finanzamt und ist weg. Mit diesem Konzept fließt ein Teil davon in Ihr eigenes Vermögen. Für Einkommen mit hohem Steuersatz.",
      },
    },
  },

  schritt: {
    ...A.schritt,
    text: "Dafür brauchen wir Ihre Selbstauskunft. Wir füllen sie jetzt zusammen aus, in etwa 15 Minuten. Bis zur Objektvorstellung in einer Woche fehlen dann nur noch Ausweis und letzte Gehaltsabrechnung.",
  },
};

/** Abschnitt 04 in B: der Satz über den Karten. Die Grafik ist dieselbe wie in A (KaufkraftJahre). */
export const KAUFKRAFT_B = {
  vorspann: "Ein einfaches Beispiel: 100.000 € auf dem Tagesgeld, 2 % Zinsen, 2,5 % Inflation, 25 Jahre lang.",
};

/** Vertriebsdokumente in B, je Konzept. Liegen unter public/vertriebsunterlagen/. */
export const DOKUMENTE_B: Record<KonzeptOs, { knopf: string; href: string }> = {
  steuer: { knopf: "Dokument öffnen: Steuerersparnis", href: "/vertriebsunterlagen/steuerersparnis-mit-immobilien.pdf" },
  zusatzrente: { knopf: "Dokument öffnen: Altersvorsorge", href: "/vertriebsunterlagen/arbeitsleistung-und-immobilienvermoegen.pdf" },
};
