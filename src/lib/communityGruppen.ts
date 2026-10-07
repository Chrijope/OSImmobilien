import type { UserRole } from "@/types/user";

/**
 * Spickzettel fuer die WhatsApp-Community: welche Untergruppen eine Rolle
 * bekommt. Christian laedt die Partner aktiv ein und fuegt sie den Gruppen
 * direkt hinzu, die Liste hier ist seine Gedaechtnisstuetze im Onboarding.
 *
 * Rollen ohne Eintrag sind noch nicht festgelegt, die Auswahl zeigt dann
 * einen Hinweis statt einer Liste.
 */
export const COMMUNITY_GRUPPEN: Partial<Record<UserRole, string[]>> = {
  vertriebsleiter: [
    "Vertriebsleitung",
    "Objekte und Investments",
    "Allgemeiner Austausch",
    "Ankündigungen und News",
    "Ideen und Innovationen",
    "Erfolge und Abschlüsse",
    "Finanzierung",
    "Vertriebspartner",
    "Technik und Bugs",
    "Lead Partner",
  ],
  vertriebspartner: [
    "Objekte und Investments",
    "Allgemeiner Austausch",
    "Ankündigungen und News",
    "Erfolge und Abschlüsse",
    "Vertriebspartner",
    "Technik und Bugs",
  ],
};
