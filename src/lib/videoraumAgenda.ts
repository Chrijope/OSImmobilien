import type { AgendaPunkt, VideoraumArt } from "@/lib/videoraumStore";

/**
 * Standardagenda je Anlass.
 *
 * Sie lag bisher nur in der Raumuebersicht und wurde beim Anlegen von Hand
 * mitgespeichert. Ein Raum, der aus einer Buchung entsteht, bekam deshalb gar
 * keine Agenda: Im Warteraum stand dann nur "Ihr Ansprechpartner geht das
 * Gespraech gleich mit Ihnen durch."
 *
 * Deshalb steht sie jetzt hier, an einer Stelle, und der Warteraum greift
 * darauf zurueck, wenn am Raum nichts gepflegt ist. Wer eine eigene Agenda
 * hinterlegt, ueberschreibt sie damit weiterhin.
 */
export const STANDARD_AGENDA: Record<VideoraumArt, AgendaPunkt[]> = {
  erstgespraech: [
    { titel: "Kurz kennenlernen", text: "Wer wir sind und wie wir arbeiten.", minuten: 5 },
    { titel: "Deine Situation", text: "Wo du heute stehst und was du erreichen willst.", minuten: 10 },
    { titel: "Passt das zusammen?", text: "Ehrlich und ohne Verkaufsdruck.", minuten: 10 },
    { titel: "Nächster Schritt", text: "Du entscheidest, ob ein ausführliches Gespräch folgt.", minuten: 5 },
  ],
  beratung: [
    { titel: "Deine Ausgangslage", text: "Einkommen, Steuerlast, was du bisher aufgebaut hast.", minuten: 10 },
    { titel: "Was rechnerisch möglich ist", text: "Wir rechnen deinen Rahmen gemeinsam durch.", minuten: 15 },
    { titel: "Passende Objekte", text: "Zwei bis drei konkrete Beispiele aus dem Bestand.", minuten: 15 },
    {
      titel: "Selbstauskunft ausfüllen",
      text: "Wir gehen sie gemeinsam durch. Danach wissen wir verbindlich, welcher Rahmen für dich machbar ist.",
      minuten: 15,
    },
    { titel: "Deine Fragen und nächster Schritt", text: "Du entscheidest, ob und wie es weitergeht.", minuten: 5 },
  ],
  objektvorstellung: [
    { titel: "Das Objekt im Überblick", text: "Lage, Zustand, Ausstattung.", minuten: 15 },
    { titel: "Deine Berechnung", text: "Zeile für Zeile gemeinsam durch.", minuten: 20 },
    { titel: "Vermietung und Verwaltung", text: "Wer sich worum kümmert.", minuten: 10 },
    { titel: "Deine Fragen", text: "Alles, was offen ist.", minuten: 15 },
  ],
  /*
   * Das Bewerbergespräch. Anrede Du, wie im ganzen Kennenlernen, und keine
   * Kundensprache: Hier wird nichts verkauft. Seit dem 15.09.2026 duzen auch
   * die drei Kundenfassungen oben, das ganze Projekt spricht per Du.
   *
   * Alle Fassungen sind wortgleich mit `videoraum_standard_agenda`, zuletzt in
   * der Migration 20260915121000. Ein Raum, der ohne Browser entsteht, holt
   * sich die Agenda von dort. Wer hier etwas ändert, ändert es auch dort.
   *
   * Die Summe ist seit dem 08.09.2026 35 statt 45 Minuten: Die Arbeitsprobe
   * ist aus dem Gespräch heraus. Sie muss zur langen Fassung in
   * `DAUER_LANG_MINUTEN` passen, sonst verspricht der Warteraum mehr Zeit, als
   * der Kalender blockt.
   */
  bewerbergespraech: [
    {
      titel: "Ankommen",
      text: "Kurz gegenseitig vorstellen. Was du im Kennenlernen geschrieben hast, ist gelesen.",
      minuten: 5,
    },
    { titel: "Deine Themen", text: "Was du markiert hast, und deine eigene Frage.", minuten: 13 },
    {
      titel: "Wie die Zusammenarbeit läuft",
      text: "Vergütung, was das Haus stellt, Gewerbe und Erlaubnis.",
      minuten: 12,
    },
    {
      titel: "Wie es weitergeht",
      text: "Du entscheidest, ob du starten möchtest. Ein Vertrag kommt erst danach.",
      minuten: 5,
    },
  ],
  sonstiges: [],
};

/** Die gepflegte Agenda, sonst die Standardagenda des Anlasses. */
export function agendaFuer(art: VideoraumArt, eigene?: AgendaPunkt[] | null): AgendaPunkt[] {
  if (Array.isArray(eigene) && eigene.length > 0) return eigene;
  return STANDARD_AGENDA[art] ?? [];
}
