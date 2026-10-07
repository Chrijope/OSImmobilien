/**
 * Aufbau des Strukturbaums der Teampartner.
 *
 * Bewusst als eigene Datei ohne React, damit der Baum ohne Oberflaeche
 * geprueft werden kann. Benutzt wird sie nur von `src/pages/Teampartner.tsx`
 * und den Tests daneben.
 */
import { cacheGet } from "@/lib/dataCache";

export interface TeamMitglied {
  id: string;
  vorname: string;
  nachname: string;
  imonduId: string;
  /** Anzeigename der Hauptrolle (kann "Lead-Berater" sein). NIE vergleichen, dafuer gibt es rolleId. */
  rolle: string;
  /** Kennung der Hauptrolle, z. B. "vertriebspartner". Massgeblich fuer Filter und Farben. */
  rolleId?: string;
  /** Anzeige-Variante aus profiles.rollen_variante ('lead_berater' oder leer). */
  rollenVariante?: string;
  rolleColor: string;
  alleRollen?: { label: string; color: string }[];
  email: string;
  telefon: string;
  status: "aktiv" | "ausstehend" | "inaktiv";
  avatarUrl?: string;
  zugeordnet?: string;
  zugeordnetId?: string;
  istTippgeber?: boolean;
  provisionstyp?: "euro" | "prozent";
  provisionswert?: string;
  portalAktiv?: boolean;
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
  land?: string;
  notizen?: string;
  children?: TeamMitglied[];
  /**
   * Gesetzt, wenn jemand nur deshalb direkt unter der Wurzel haengt, weil ihm
   * ein erreichbarer Teamleiter fehlt. Die Oberflaeche sammelt diese Personen
   * in einem eigenen Feld, damit die fehlende Zuordnung auffaellt und nicht
   * wie eine gewollte Zuordnung zum Inhaber aussieht.
   */
  ohneTeamleiter?: boolean;
  /**
   * Technische Rollenbezeichner aus `user_roles`, zum Beispiel
   * "vertriebspartner". Anders als `rolle` sind das keine Anzeigenamen und sie
   * aendern sich nicht, wenn ein Label in `src/types/user.ts` umbenannt wird.
   */
  _userRoles?: string[];
}

export type Strukturknoten = TeamMitglied & { children?: Strukturknoten[] };

/**
 * Rollen, die zusammen die C-Level-Ebene bilden, also die feste zweite Ebene
 * direkt unter dem Inhaber. Es gibt keine Rolle "c-level" in der Datenbank,
 * die Ebene wird allein ueber diese Liste bestimmt.
 *
 * Die Liste wird sich aendern, deshalb steht sie an genau dieser einen Stelle.
 * Wer eine Rolle daraus traegt, steht auf der C-Level-Ebene und nicht
 * zusaetzlich weiter unten, auch wenn er eine Teamleiter-Zuordnung hat.
 *
 * Bewusst die technischen Bezeichner aus `user_roles` und nicht die
 * Anzeigenamen: wird ein Label in `src/types/user.ts` umbenannt, faellt die
 * betroffene Rolle sonst stillschweigend heraus.
 */
export const C_LEVEL_ROLLEN = [
  "admin",
  "vertriebsleiter",
  "hr",
  "buchhaltung",
  "finanzierungspartner",
  "objektpartner",
];

/** Traegt die Person mindestens eine der C-Level-Rollen? */
export function istCLevel(mitglied: TeamMitglied): boolean {
  return (mitglied._userRoles || []).some(r => C_LEVEL_ROLLEN.includes(r));
}

export function buildTree(
  nutzer: TeamMitglied[],
  tippgeber: TeamMitglied[],
  rootId: string | "all",
  settingsRows: any[] = [],
): Strukturknoten {
  // Teamleiter-Zuordnung direkt aus den frisch geladenen user_settings nutzen.
  // Der globale Cache kann nach Profiländerungen kurz veraltet sein.
  const allSettings = settingsRows.length > 0 ? settingsRows : cacheGet<any>("user_settings");
  const teamleaderMap = new Map<string, string>(); // userId -> teamleaderId
  allSettings.forEach((s: any) => {
    const tlId = s.einstellungen?.teamleader_id;
    if (tlId) teamleaderMap.set(s.user_id, tlId);
  });

  // Wurzel: der Inhaber, ersatzweise der erste Eintrag. Bewusst ueber die
  // Rollen-Kennung und nicht den Anzeigenamen, der kann abweichen
  // (z. B. "Lead-Berater").
  const inhaber = nutzer.find(n => (n._userRoles || []).includes("inhaber")) || nutzer[0];
  if (!inhaber) return { id: "0", vorname: "—", nachname: "", imonduId: "", rolle: "—", rolleColor: "", email: "", telefon: "", status: "aktiv" };

  /**
   * Baut die Untergebenen eines Knotens auf.
   *
   * `visited` verhindert, dass eine zirkulaere Teamleiter-Zuordnung
   * (A fuehrt B, B fuehrt A) die Seite aufhaengt, und sorgt zugleich dafuer,
   * dass niemand zweimal im Baum steht.
   *
   * `uebersprungen` sind Personen, die schon woanders haengen. Beim vollen
   * Baum ist das die C-Level-Ebene: ihre Mitglieder stehen fest unter der
   * Wurzel und duerfen nicht zusaetzlich als Untergebene auftauchen.
   */
  function getChildren(parentId: string, visited: Set<string>, uebersprungen: Set<string>): Strukturknoten[] {
    if (visited.has(parentId)) return [];
    visited.add(parentId);
    const directReports = nutzer.filter(
      n => teamleaderMap.get(n.id) === parentId && n.id !== parentId && !uebersprungen.has(n.id),
    );
    return directReports.map(dr => baueKnoten(dr, visited, uebersprungen));
  }

  /** Eine Person samt ihren Untergebenen und ihren Tippgebern. */
  function baueKnoten(person: TeamMitglied, visited: Set<string>, uebersprungen: Set<string>): Strukturknoten {
    const subChildren = getChildren(person.id, visited, uebersprungen);
    const tpChildren = tippgeber.filter(t => t.zugeordnetId === person.id);
    const allChildren = [...subChildren, ...tpChildren];
    return { ...person, children: allChildren.length > 0 ? allChildren : undefined };
  }

  // Einzelne Person gewaehlt: nur ihr Teilbaum, ohne die C-Level-Ebene
  // darueber. Innerhalb des Teilbaums gilt allein die Teamleiter-Zuordnung.
  if (rootId !== "all") {
    const partner = nutzer.find(n => n.id === rootId);
    if (partner) {
      return baueKnoten(partner, new Set<string>(), new Set<string>());
    }
  }

  // Voller Baum. Die C-Level-Ebene wird zuerst gesetzt, damit die Teams
  // darunter haengen und niemand doppelt vorkommt. Der Inhaber bleibt die
  // Wurzel, auch wenn er selbst eine C-Level-Rolle traegt.
  const cLevelIds = new Set(nutzer.filter(n => n.id !== inhaber.id && istCLevel(n)).map(n => n.id));
  // Wurzel und C-Level-Ebene stehen fest. Beide duerfen nirgends sonst als
  // Untergebene auftauchen, sonst stuende jemand zweimal im Baum.
  const festPlatziert = new Set<string>([inhaber.id, ...cLevelIds]);

  const visited = new Set<string>();
  const cLevelKnoten = nutzer
    .filter(n => cLevelIds.has(n.id))
    .map(n => baueKnoten(n, visited, festPlatziert));

  const inhaberChildren = getChildren(inhaber.id, visited, festPlatziert);

  // Wem der Teamleiter fehlt oder wessen Teamleiter gar nicht in der Liste
  // steht, der haengt weiterhin direkt unter der Wurzel, statt zu
  // verschwinden. Bewusst nicht unter irgendeine C-Level-Person: eine
  // Zuordnung, die niemand getroffen hat, waere frei erfunden.
  const nutzerIds = new Set(nutzer.map(n => n.id));
  const orphans = nutzer.filter(n => {
    if (n.id === inhaber.id) return false;
    if (visited.has(n.id)) return false;
    const tl = teamleaderMap.get(n.id);
    return !tl || !nutzerIds.has(tl);
  });
  const orphanNodes = orphans.map(u => ({
    ...baueKnoten(u, visited, festPlatziert),
    ohneTeamleiter: true,
  }));

  const rootChildren = [
    ...cLevelKnoten,
    ...inhaberChildren,
    ...orphanNodes,
    ...tippgeber.filter(t => t.zugeordnetId === inhaber.id),
  ];

  return {
    ...inhaber,
    children: rootChildren.length > 0 ? rootChildren : undefined,
  };
}
