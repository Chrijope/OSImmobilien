/**
 * Wohin „Kundenansicht“ im CRM führt, je nach Rolle.
 *
 * Bauplan Kundenansicht, Frage 11 (Freigabe von Christian am 23.09.2026):
 *   - Die alte Kundenansicht (`/kundenansicht/objekt/…`) wird abgelöst. Ihre
 *     Adressen leiten weiter, siehe `pages/KundenansichtObjekt.tsx`.
 *   - Admin und Inhaber sehen die neue interne Vorschau der Objektübersicht
 *     (`/objekte/:id/kundenansicht` und
 *     `/objekte/:id/einheiten/:weId/kundenansicht`). Das ist dieselbe Seite,
 *     die der Kunde über seinen Link bekommt, nur ohne Link, ohne Zähler und
 *     ohne Glocke.
 *   - Alle anderen, auch die Vertriebspartner, landen bis zu Christians
 *     Freigabe auf dem Online-Exposé (`/expose/:id`). Die spätere Freigabe
 *     ändert nur `darfKundenansichtVorschau`.
 *
 * Die Regel für Admin und Inhaber ist dieselbe wie für die Objektseite
 * (`siehtAdminOnlyNavigation`): Die Vorschau liegt hinter demselben Riegel
 * (`ObjektseiteZugang`), ein anderer Weg würde dort ohnehin umgeleitet.
 */
import { siehtAdminOnlyNavigation } from "@/lib/sidebarPermissions";

/** Darf diese Rolle die interne Vorschau der Objektübersicht öffnen? */
export function darfKundenansichtVorschau(rolle: string | null | undefined): boolean {
  return siehtAdminOnlyNavigation(rolle || "");
}

/**
 * Die interne Vorschau der Objektübersicht. Mit Wohnung öffnet sie dort,
 * ohne Wohnung beim Haus.
 *
 * `investmentId` ist das Investment eines Kunden, wenn man aus seiner
 * Objektauswahl oder dem Fenster „Kundenlink senden“ kommt. Daraus bestimmt
 * `get-kundenansicht` den Kunden: Dann steht dessen zuständiger Partner im
 * Kasten „Dein Ansprechpartner“, und „für dich reserviert“ gilt für ihn.
 * Derselbe Name wie in den alten Adressen und im Aufruf der Function. Nie
 * der Name des Kunden, der gehört nicht in Adressen.
 *
 * `wohnungAuswahl` (05.10.2026): die im Fenster „Kundenlink senden“
 * gewählten Wohnungen, als `?wohnungen=`. Dann zeigt die Vorschau nur sie,
 * wie später der Link.
 */
export function kundenansichtVorschauPfad(
  objektId: string, wohnungId?: string | null, investmentId?: string | null, wohnungAuswahl?: string[] | null,
): string {
  const basis = wohnungId
    ? `/objekte/${encodeURIComponent(objektId)}/einheiten/${encodeURIComponent(wohnungId)}/kundenansicht`
    : `/objekte/${encodeURIComponent(objektId)}/kundenansicht`;
  const suche = new URLSearchParams();
  if (investmentId) suche.set("investmentId", investmentId);
  if (wohnungAuswahl && wohnungAuswahl.length > 0) suche.set(VORSCHAU_AUSWAHL_PARAM, wohnungAuswahl.join(","));
  const text = suche.toString();
  return text ? `${basis}?${text}` : basis;
}

/** Der Name der Wohnungsauswahl in der Adresse der Vorschau. */
export const VORSCHAU_AUSWAHL_PARAM = "wohnungen";

/** Die Wohnungsauswahl aus der Adresse der Vorschau, `null` ohne Angabe. */
export function vorschauAuswahlAusSuche(suche: URLSearchParams): string[] | null {
  const wert = suche.get(VORSCHAU_AUSWAHL_PARAM);
  if (!wert) return null;
  const liste = wert.split(",").map((t) => t.trim()).filter(Boolean);
  return liste.length > 0 ? liste : null;
}

/**
 * Das öffentliche Online-Exposé, ohne Kundenschlüssel. `berater` nennt den
 * Ansprechpartner, wie beim Knopf „Online-Exposé“ in der Verwaltungsansicht.
 */
export function onlineExposePfad(objektId: string, wohnungId?: string | null, beraterId?: string | null): string {
  const basis = wohnungId
    ? `/expose/${encodeURIComponent(objektId)}/wohnung/${encodeURIComponent(wohnungId)}`
    : `/expose/${encodeURIComponent(objektId)}`;
  return beraterId ? `${basis}?berater=${encodeURIComponent(beraterId)}` : basis;
}

export interface KundenansichtZielEingabe {
  rolle: string | null | undefined;
  objektId: string;
  wohnungId?: string | null;
  /** Nur für die interne Vorschau: das Investment des Kunden, aus dessen Objektauswahl man kommt. */
  investmentId?: string | null;
  /** Nur für das Online-Exposé. */
  beraterId?: string | null;
}

/** Das Ziel des Knopfs „Kundenansicht“ für diese Rolle. */
export function kundenansichtZiel(e: KundenansichtZielEingabe): string {
  return darfKundenansichtVorschau(e.rolle)
    ? kundenansichtVorschauPfad(e.objektId, e.wohnungId, e.investmentId)
    : onlineExposePfad(e.objektId, e.wohnungId, e.beraterId);
}
