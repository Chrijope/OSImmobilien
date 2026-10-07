/**
 * Durchsuchbare Ziele der globalen Suche.
 *
 * Seiten: Seit dem 28.09.2026 gibt es dafür keine eigene Liste mehr. Die
 * Treffer entstehen aus den Einträgen der Seitenleiste (`sidebarNavigation.ts`),
 * gefiltert mit denselben Prüfungen wie dort. Was die aktive Rolle in der
 * Leiste nicht sieht, findet sie auch hier nicht, und jeder neue Menüpunkt ist
 * ohne weiteres Zutun suchbar. Die frühere Liste `SUCHE_SEITEN` kannte Seiten,
 * die die Leiste längst nicht mehr zeigt, und ihr fehlten neue.
 *
 * Dazu kommen Reiter mit eigener Adresse, jeweils aus der Quelle, die auch die
 * Seite selbst liest: die Reiter der Statistiken (`statistikenTabs.ts`) und
 * die Bereiche der Einstellungen (`einstellungenBereiche.ts`, dieselbe Liste
 * wie im Zahnradmenü).
 *
 * Suchbegriffe: Niemand tippt „Einwand-Bibliothek". Getippt wird „einwand",
 * „zu teuer" oder „widerspruch". Diese Begriffe stehen am Menüpunkt selbst im
 * Feld `suchbegriffe`.
 */
import type { ComponentType } from "react";
import { Settings } from "lucide-react";
import type { UserRole } from "@/types/user";
import {
  navigationsGruppen, darfNavEintrag, entwurfGesperrt, EINSTELLUNGEN_SUCHBEGRIFFE,
  type NavItem, type NavKontext,
} from "@/lib/sidebarNavigation";
import { isKundeRole } from "@/lib/sidebarPermissions";
import { STATISTIK_TABS, getVisibleStatistikTabs } from "@/lib/statistikenTabs";
import { einstellungenBereiche } from "@/lib/einstellungenBereiche";

/** Eine Seite oder ein Reiter als Suchtreffer. */
export interface SeitenZiel {
  /** Anzeigename. Bei Reitern mit Pfad, etwa „Statistiken > Umsatz & Provisionen". */
  titel: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  /** Die Gruppe der Seitenleiste, etwa „Auswertung". */
  gruppe?: string;
  /** Wonach Menschen außer dem Titel suchen. Klein geschrieben. */
  begriffe: string[];
}

/**
 * Alle Seiten und Reiter, die die aktive Rolle öffnen darf, in der
 * Reihenfolge der Seitenleiste.
 *
 * Entwürfe, die die Rolle nur ausgegraut sieht, fehlen: Ein Treffer, der
 * beim Klick nichts tut, wäre schlechter als keiner.
 */
export function seitenFuerSuche(ctx: NavKontext): SeitenZiel[] {
  const ziele: SeitenZiel[] = [];
  const gesehen = new Set<string>();
  const dazu = (ziel: SeitenZiel) => {
    if (gesehen.has(ziel.url)) return;
    gesehen.add(ziel.url);
    ziele.push(ziel);
  };
  const sichtbar = (item: NavItem) => darfNavEintrag(item, ctx) && !entwurfGesperrt(item, String(ctx.rolle));

  for (const gruppe of navigationsGruppen(ctx)) {
    const gruppenName = gruppe.label || undefined;
    for (const item of gruppe.items) {
      if (!sichtbar(item)) continue;
      // Ein Eintrag mit Unterpunkten ist in der Leiste nur ein Aufklapper.
      if (item.children?.length) {
        for (const kind of item.children.filter(sichtbar)) {
          dazu({
            titel: `${item.title} > ${kind.title}`,
            url: kind.url,
            icon: kind.icon,
            gruppe: gruppenName,
            begriffe: [...(kind.suchbegriffe || []), ...(item.suchbegriffe || [])],
          });
        }
        continue;
      }
      dazu({ titel: item.title, url: item.url, icon: item.icon, gruppe: gruppenName, begriffe: item.suchbegriffe || [] });

      if (item.url === "/statistiken") {
        // Dieselbe Rechnung wie auf der Seite selbst, siehe `Statistiken.tsx`.
        const reiter = getVisibleStatistikTabs(ctx.rolle as UserRole, ctx.customPermissions || []);
        for (const tab of STATISTIK_TABS.filter((t) => reiter.includes(t.id))) {
          dazu({
            titel: `${item.title} > ${tab.label}`,
            url: `/statistiken?tab=${tab.id}`,
            icon: item.icon,
            gruppe: gruppenName,
            begriffe: [tab.id],
          });
        }
      }
    }
  }

  /*
   * Die Einstellungen stehen im Zahnradmenü der Kopfleiste, nicht in der
   * Seitenleiste. Der Routenschutz lässt `/einstellungen` für jede Rolle
   * durch, nur Kunden werden auf ihre eigene Seite umgeleitet. Die Bereiche
   * kommen aus derselben Liste wie das Zahnradmenü; gesperrte Entwürfe fehlen.
   */
  if (!isKundeRole(ctx.rolle as UserRole)) {
    dazu({ titel: "Einstellungen", url: "/einstellungen", icon: Settings, begriffe: EINSTELLUNGEN_SUCHBEGRIFFE });
    for (const bereich of einstellungenBereiche(String(ctx.rolle)).filter((b) => b.offen)) {
      dazu({
        titel: `Einstellungen > ${bereich.titel}`,
        url: `/einstellungen?tab=${bereich.slug}`,
        icon: Settings,
        begriffe: bereich.suchbegriffe || [],
      });
    }
  }
  return ziele;
}

/** Aktionen, die sich direkt aus der Suche starten lassen. */
export interface SucheAktion {
  titel: string;
  url: string;
  begriffe: string[];
}

export const SUCHE_AKTIONEN: SucheAktion[] = [
  { titel: "Neuen Kontakt anlegen", url: "/alle-kontakte?neu=1", begriffe: ["neuer kunde", "kontakt anlegen", "lead anlegen", "hinzufuegen"] },
  { titel: "Neues Objekt anlegen", url: "/objekte/neu", begriffe: ["objekt anlegen", "immobilie anlegen", "neues haus"] },
  { titel: "Beratungspräsentation öffnen", url: "/beratungspraesentation-moreimmo", begriffe: ["praesentation starten", "beratung", "termin"] },
];

/**
 * Unscharfer Vergleich.
 *
 * Erlaubt Tippfehler und Abkürzungen, indem die Buchstaben der Suche in der
 * richtigen Reihenfolge im Ziel vorkommen müssen, aber nicht zusammenhängend.
 * "ott hns" findet damit "Otto Hans". Ein Volltreffer am Wortanfang wiegt
 * schwerer, damit die naheliegenden Ergebnisse oben stehen.
 *
 * Die Kontakt- und Objektsuche nutzt diese Funktion unverändert.
 */
export function trefferWert(suche: string, ziel: string): number {
  const s = suche.toLowerCase().trim();
  const z = ziel.toLowerCase();
  if (!s) return 0;
  if (z === s) return 1000;
  if (z.startsWith(s)) return 800;
  const idx = z.indexOf(s);
  if (idx === 0) return 700;
  if (idx > 0) return 500 - Math.min(idx, 100);

  // Buchstaben der Reihe nach suchen
  let pos = 0;
  let luecken = 0;
  for (const zeichen of s) {
    if (zeichen === " ") continue;
    const gefunden = z.indexOf(zeichen, pos);
    if (gefunden < 0) return 0;
    luecken += gefunden - pos;
    pos = gefunden + 1;
  }
  return Math.max(1, 200 - luecken);
}

/** Bester Treffer über Titel und alle Suchbegriffe. */
export function zielWert(suche: string, titel: string, begriffe: string[] = []): number {
  let bester = trefferWert(suche, titel);
  for (const b of begriffe) {
    // Begriffe zaehlen etwas weniger als der echte Titel, damit bei
    // Gleichstand der Menuepunkt gewinnt, unter dem der Nutzer ihn kennt.
    bester = Math.max(bester, trefferWert(suche, b) * 0.9);
  }
  return bester;
}

/**
 * Schreibweise angleichen: klein, ohne Akzente, Umlaute und ihre Umschrift
 * gleich. „Übersicht", „uebersicht" und „ubersicht" werden alle zu
 * „ubersicht". Beide Seiten des Vergleichs laufen hier durch, deshalb darf
 * das Ergebnis kein echtes Wort sein.
 */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u");
}

/**
 * Abstand zweier Wörter in Tippfehlern: ein Buchstabe zu viel, zu wenig,
 * falsch oder zwei vertauscht zählen je als einer.
 */
function tippAbstand(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + kosten);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Ein kleiner Tippfehler am Wortanfang, etwa „statsitik" für „Statistiken".
 * Erst ab vier Buchstaben, sonst passt fast alles zu allem.
 */
function tippfehlerWert(suche: string, ziel: string): number {
  if (suche.length < 4 || suche.includes(" ")) return 0;
  const passt = ziel
    .split(/[^a-z0-9]+/)
    .some((wort) => wort.length >= suche.length - 1 && tippAbstand(suche, wort.slice(0, suche.length)) <= 1);
  return passt ? 100 : 0;
}

function seitenTrefferWert(suche: string, ziel: string): number {
  const s = normalisiere(suche.trim());
  const z = normalisiere(ziel);
  return trefferWert(s, z) || tippfehlerWert(s, z);
}

/**
 * Wie gut passt die Suche zu einer Seite? Wie `zielWert`, aber tolerant bei
 * Umlauten, Groß- und Kleinschreibung und einem kleinen Tippfehler.
 */
export function seitenWert(suche: string, titel: string, begriffe: string[] = []): number {
  let bester = seitenTrefferWert(suche, titel);
  for (const b of begriffe) bester = Math.max(bester, seitenTrefferWert(suche, b) * 0.9);
  return bester;
}
