export type UserRole =
  | "inhaber"
  | "admin"
  | "vertriebsleiter"
  | "vertriebspartner"
  | "buchhaltung"
  | "backoffice"
  | "hr"
  | "individuell"
  | "objektpartner"
  | "finanzierungspartner"
  | "hausverwaltung"
  | "setterin"
  | "versicherungsexperte"
  | "kunde"
  | "tippgeber"
  | "marketing"
  | "bewerber"
  | "testaccount";

export interface RoleConfig {
  id: UserRole;
  label: string;
  color: string;
  badgeCount?: number;
}

/**
 * Alle Rollen des Aufzaehlungstyps `app_role` aus der Datenbank.
 *
 * Achtung, die Reihenfolge ist nicht nur Anzeige. Aus ihr leiten
 * `src/lib/userRoles.ts` und `src/pages/Teampartner.tsx` ab, welche Rolle als
 * Hauptrolle einer Person gilt, und `Teampartner.tsx` sortiert damit auch die
 * Auswahlliste. Neue Rollen gehoeren deshalb ans Ende, sonst verdraengen sie
 * bei Personen mit mehreren Rollen die bisherige Hauptrolle.
 */
export const ROLES: RoleConfig[] = [
  { id: "inhaber", label: "Inhaber", color: "hsl(142, 70%, 45%)", badgeCount: 15 },
  { id: "admin", label: "Admin", color: "hsl(0, 84%, 60%)", badgeCount: 15 },
  { id: "vertriebsleiter", label: "Vertriebsleiter", color: "hsl(157, 60%, 29%)", badgeCount: 15 },
  { id: "vertriebspartner", label: "Vertriebspartner", color: "hsl(262, 60%, 50%)", badgeCount: 15 },
  { id: "objektpartner", label: "Objektpartner", color: "hsl(30, 80%, 50%)", badgeCount: 15 },
  { id: "finanzierungspartner", label: "Finanzierungspartner", color: "hsl(157, 52%, 43%)", badgeCount: 15 },
  { id: "hausverwaltung", label: "Hausverwaltung", color: "hsl(35, 70%, 50%)", badgeCount: 15 },
  { id: "buchhaltung", label: "Buchhaltung", color: "hsl(220, 10%, 46%)" },
  { id: "backoffice", label: "Backoffice", color: "hsl(170, 60%, 40%)", badgeCount: 15 },
  { id: "hr", label: "HR", color: "hsl(330, 70%, 50%)", badgeCount: 15 },
  { id: "setterin", label: "Setter", color: "hsl(280, 70%, 55%)", badgeCount: 15 },
  { id: "versicherungsexperte", label: "Versicherungsexperte", color: "hsl(190, 70%, 45%)", badgeCount: 15 },
  { id: "kunde", label: "Kunde", color: "hsl(160, 60%, 45%)", badgeCount: 15 },
  { id: "tippgeber", label: "Tippgeber", color: "hsl(45, 90%, 50%)" },
  // Ans Ende gehaengt, damit die bisherige Hauptrolle bestehender Nutzer
  // unveraendert bleibt. "testaccount" steht bewusst ganz zuletzt.
  { id: "individuell", label: "Individuell", color: "hsl(240, 60%, 58%)" },
  { id: "marketing", label: "Marketing", color: "hsl(310, 65%, 50%)" },
  { id: "bewerber", label: "Bewerber", color: "hsl(95, 45%, 42%)" },
  { id: "testaccount", label: "Testaccount", color: "hsl(215, 12%, 65%)" },
];

export interface UserProfile {
  name: string;
  role: UserRole;
  /**
   * Anzeige-Variante aus profiles.rollen_variante ('lead_berater' oder leer).
   * Aendert nur den Anzeigenamen (siehe src/lib/rollenLabel.ts) und die
   * Weekly-Call-Zeit, nie Rechte.
   */
  rollenVariante?: string;
  avatar?: string;
  moreId: string;
  /**
   * Die Adresse aus den Einstellungen (profiles.email), nicht die
   * Anmeldeadresse. Beides kann auseinanderfallen: angemeldet wird oft mit
   * einer privaten oder alten Adresse, gegenueber Kunden soll aber die
   * Firmenadresse stehen. Ueberall, wo ein Ansprechpartner gezeigt oder in
   * eine Mail geschrieben wird, gilt diese hier.
   */
  email?: string;
}
