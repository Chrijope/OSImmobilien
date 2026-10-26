/**
 * Die vier Bereiche der Tableiste am Handy (B1, 26.10.2026).
 *
 * Nie fest verdrahtet: Gewählt wird aus den Einträgen, die die Seitenleiste
 * für diese Rolle und diese Rechte ohnehin zeigt. Belegung nach Christian
 * (26.10.2026):
 *   - Vertrieb: Start, Kontakte, Pipeline, Aufgaben
 *   - Admin, Inhaber, Vertriebsleitung: Start, Kontakte, Objekte, Inbox
 *   - übrige Rollen: Start, Inbox und ihre nächsten Menüpunkte
 * Fehlt ein Wunsch-Eintrag, rückt der nächste erlaubte Menüpunkt nach.
 * Dazu kommt immer „Mehr“, das die Seitenleiste öffnet.
 */
import type { NavItem } from "./sidebarNavigation";

export const TABLEISTE_ANZAHL = 4;

const FUEHRUNG = ["admin", "inhaber", "vertriebsleiter"];
const VERTRIEB = ["vertriebspartner", "setterin"];

export function tableisteWunsch(rolle: string): string[] {
  if (FUEHRUNG.includes(rolle)) return ["/", "/alle-kontakte", "/objekte", "/inbox"];
  if (VERTRIEB.includes(rolle)) return ["/", "/alle-kontakte", "/pipeline", "/inbox"];
  return ["/", "/inbox"];
}

export interface TabEintrag {
  url: string;
  titel: string;
  item: NavItem;
}

/** Kurze Beschriftung unter dem Symbol. */
function kurztitel(item: NavItem, rolle: string): string {
  if (item.url === "/") return "Start";
  if (item.url === "/alle-kontakte") return "Kontakte";
  if (item.url === "/inbox" && VERTRIEB.includes(rolle)) return "Aufgaben";
  return item.title;
}

/** `erlaubt`: alle Einträge, die die Seitenleiste für diese Rolle zeigt, in ihrer Reihenfolge. */
export function tableisteEintraege(erlaubt: NavItem[], rolle: string): TabEintrag[] {
  const nachUrl = new Map<string, NavItem>();
  for (const item of erlaubt) if (!nachUrl.has(item.url)) nachUrl.set(item.url, item);
  const gewaehlt: NavItem[] = [];
  for (const url of tableisteWunsch(rolle)) {
    const item = nachUrl.get(url);
    if (item) gewaehlt.push(item);
  }
  for (const item of nachUrl.values()) {
    if (gewaehlt.length >= TABLEISTE_ANZAHL) break;
    if (!gewaehlt.includes(item)) gewaehlt.push(item);
  }
  return gewaehlt.slice(0, TABLEISTE_ANZAHL).map((item) => ({ url: item.url, titel: kurztitel(item, rolle), item }));
}
