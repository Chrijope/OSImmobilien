/**
 * Partnerstimmen: die eine Wahrheit für alle Stellen, die sozialen Beweis
 * zeigen. Gelesen von der Partnerstimmen-Folie des alten Decks
 * (src/pages/ClosingPraesentationEntwurf.tsx), das die Übung unter
 * /praesentation-uebung zeigt. Die Closing-Seite, die sie ebenfalls las, ist
 * seit dem 23.09.2026 entfernt.
 *
 * WICHTIG: Hier stehen NUR ECHTE Stimmen von echten Partnern, die ihr
 * Einverständnis gegeben haben. Keine erfundenen Namen, keine geschönten
 * Zitate, erfundener sozialer Beweis wäre Gift für die Glaubwürdigkeit.
 * Ist die Liste leer, überspringt die Präsentation die Folie komplett.
 */
import test1Bild from "@/assets/vp-testimonial-1.jpg";
import test2Bild from "@/assets/vp-testimonial-2.jpg";
import test3Bild from "@/assets/vp-testimonial-3.jpg";
import danielBild from "@/assets/vp-testimonial-daniel.jpg";

export interface Partnerstimme {
  /** Foto des Partners (Import aus src/assets). */
  bild: string;
  name: string;
  /** Rolle samt Startjahr, z. B. "Vertriebspartner seit 2024". */
  rolle: string;
  /** Die Ausgangslage, beginnt mit "Vorher:". */
  vorher: string;
  /** Der heutige Stand, beginnt mit "Heute:". */
  jetzt: string;
}

export const PARTNERSTIMMEN: Partnerstimme[] = [
  {
    bild: danielBild,
    name: "Daniel B.",
    rolle: "Vertriebspartner seit 2024",
    vorher: "Vorher: Versicherungsmakler, viele Produkte, wenig Substanz. Provisionen oft Wochen hinterhergerannt.",
    jetzt: "Heute: Fokus auf Immobilien-Kapitalanlage. 6-stelliger Jahresumsatz, geprüfte Objekte, Provision punktgenau nach Notar.",
  },
  {
    bild: test1Bild,
    name: "Marco S.",
    rolle: "Vertriebspartner seit 2025",
    vorher: "Vorher: Quereinsteiger aus dem Außendienst. Null Plan vom Immobilienvertrieb, dafür Lust auf was Echtes.",
    jetzt: "Heute: Erster Abschluss nach 4 Monaten, zweiter folgte im selben Quartal. Academy + Mentor haben mich getragen.",
  },
  {
    bild: test2Bild,
    name: "Julia W.",
    rolle: "Vertriebspartnerin seit 2024",
    vorher: "Vorher: Bankberaterin in der Filiale, eingesperrt in Produktkataloge und Quartalsziele.",
    jetzt: "Heute: Eigene Pipeline, geprüfte Objekte vom Bauträger, faires Provisionsmodell. Endlich Vertrieb mit gutem Gewissen.",
  },
  {
    bild: test3Bild,
    name: "Dr. Stefan K.",
    rolle: "Senior Partner seit 2023",
    vorher: "Vorher: 20 Jahre Bankenvertrieb, am Ende ausgebrannt und desillusioniert. Wollte alles hinwerfen.",
    jetzt: "Heute: OS Immobilien ist mein Hauptstandbein. Qualität der Objekte und die Kultur im Team haben mich zurückgeholt.",
  },
];
