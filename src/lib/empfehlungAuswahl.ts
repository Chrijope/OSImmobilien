import type { ObjektData } from "@/lib/objekteStore";
import { objekteTestFreigabe, siehtObjektUndEinheitenseite } from "@/lib/sidebarPermissions";
import { zielRouteFuerObjekt } from "@/lib/objektseiteDaten";
import { getEigeneSaData, getInvestmentById } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import { calculateFinanzierbarkeitFromSaData } from "@/lib/finanzierbarkeitUtils";
import { gepflegterKaufnebenkostenSatz, kaufnebenkostenPct } from "@/lib/kaufnebenkosten";
import type { ZugangsNutzer } from "@/lib/objektZugang";
import {
  empfehlungsKandidaten, finanzierungsrahmen, kaufpreisRahmen, type Rahmen,
} from "@/lib/einheitEmpfehlung";
import { istInternerPfad } from "@/lib/reservierungRueckweg";

/**
 * Wohin die Objektauswahl im Kundenprofil führt, und was die Objektseite
 * daraus liest.
 *
 * ZWEI WEGE, JE NACH ROLLE
 *
 * Admin, Inhaber und Vertriebsleitung sehen die neue Objekt- und Einheitsseite. Sie bekommen
 * `?empfehlung=<Investment>`: Die Einheitsseite wählt damit beim Reservieren
 * Kunde und Investment vor, die Objektseite zeigt oben die Leiste „Auswahl
 * für …".
 *
 * Alle anderen Rollen leitet `ObjektseiteZugang` ohnehin auf die alte
 * Verwaltungsansicht um. Für sie geht der Link gleich dorthin, mit den
 * Parametern, die der alte Reservierungsweg liest: `kundeId` und
 * `investmentId` (siehe `ObjektDetail.tsx` und `WohnungDetail.tsx`).
 *
 * In keiner Adresse stehen Namen oder Beträge, nur Kennungen. Adressen landen
 * im Verlauf, in Lesezeichen und in Fehlertickets (Vorfall vom 16.09.2026).
 */

export const EMPFEHLUNG_PARAMETER = "empfehlung";

export interface KundenBezug {
  rolle: string;
  kundeId: string;
  investmentId: string;
  /** Die eigene Kennung, nur für die Testfreischaltung `objekteTestFreigabe`. */
  benutzerId?: string | null;
}

/**
 * Ob diese Rolle die neue Objekt- und Einheitsseite sieht. Dieselbe Regel wie
 * `ObjektseiteZugang` mit `mitVertriebsleitung`: Admin, Inhaber und seit dem
 * 04.10.2026 die Vertriebsleitung, dazu die per Testfreischaltung geöffneten
 * Vertriebspartner-Konten. Sonst schickte die Objektauswahl gerade diese in
 * die alte Verwaltungsansicht.
 */
export function nutztNeueObjektseiten(rolle: string, benutzerId?: string | null): boolean {
  return siehtObjektUndEinheitenseite(rolle) || objekteTestFreigabe(rolle, benutzerId);
}

function mitParametern(pfad: string, parameter: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parameter)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${pfad}?${s}` : pfad;
}

/** Hängt `?empfehlung=<Investment>` an, ohne vorhandene Parameter zu verlieren. */
export function mitEmpfehlung(pfad: string, investmentId: string | null | undefined): string {
  if (!investmentId) return pfad;
  const [basis, suche = ""] = pfad.split("?");
  const p = new URLSearchParams(suche);
  p.set(EMPFEHLUNG_PARAMETER, investmentId);
  return `${basis}?${p.toString()}`;
}

/** Die Investment-Kennung aus der Adresse, sonst null. */
export function empfehlungAusSuche(suche: string): string | null {
  const wert = new URLSearchParams(suche).get(EMPFEHLUNG_PARAMETER);
  return wert && wert.trim() ? wert.trim() : null;
}

/** Dieselbe Suche ohne `empfehlung`, für „Auswahl beenden". Leer oder mit führendem Fragezeichen. */
export function ohneEmpfehlung(suche: string): string {
  const p = new URLSearchParams(suche);
  p.delete(EMPFEHLUNG_PARAMETER);
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ── Der Rückweg ins Kundenprofil ────────────────────────────────────────

/*
 * Wer aus dem Kundenprofil eine Einheit oder ein Objekt öffnet, soll auch
 * wieder zum Kunden zurückfinden, und zwar in das Investment, aus dem er kam.
 * Bis zum 24.09.2026 kannte die Einheitenseite nur den Weg zum Objekt.
 *
 * Gelöst wie in der Reservierung (`reservierungRueckweg.ts`): Der Parameter
 * `zurueck` trägt einen Pfad innerhalb der Anwendung, und nur ein solcher
 * wird angenommen. Der Wert steht in der Adresszeile und ist damit von außen
 * setzbar, eine fremde Adresse darin wäre eine offene Weiterleitung.
 */
export const ZURUECK_PARAMETER = "zurueck";

/**
 * Das Kundenprofil, geöffnet im Reiter „Investments" beim richtigen
 * Investment und dort am Abschnitt „Objektauswahl", aus dem der Weg kam
 * (Anker `#objektauswahl`, siehe den Ankersprung in `KundenDetail.tsx`).
 */
export function kundenRueckweg(kundeId: string, investmentId?: string | null): string {
  const p = new URLSearchParams({ tab: "investments" });
  if (investmentId) p.set("investment", investmentId);
  return `/kunden/${encodeURIComponent(kundeId)}?${p.toString()}#objektauswahl`;
}

/**
 * Der Zurück-Knopf des Browsers, vor dem Wegnavigieren aus der Objektauswahl.
 *
 * Der Verlaufseintrag des Kundenprofils trug bis zum 27.09.2026 nur
 * `?investment=`. Zurück landete man damit im Investment, aber oben, und
 * musste die Objektauswahl wieder suchen. Jetzt wird die aktuelle Adresse
 * vorher auf `kundenRueckweg` gesetzt, also dieselbe, die auch der
 * Zurück-Link der Objektseite nimmt. Den Rest erledigt der vorhandene
 * Ankersprung in `KundenDetail.tsx`: Investment wählen, hinscrollen,
 * `markiereProfilAbschnitt`.
 *
 * Der Zustand des Routers (`history.state`) bleibt erhalten, getauscht wird
 * nur die Adresse. Außerhalb des Kundenprofils passiert nichts.
 */
export function rueckwegImVerlaufMerken(kundeId: string, investmentId: string | null | undefined): void {
  if (typeof window === "undefined" || !kundeId) return;
  if (window.location.pathname !== `/kunden/${encodeURIComponent(kundeId)}`) return;
  window.history.replaceState(window.history.state, "", kundenRueckweg(kundeId, investmentId));
}

/** Hängt `?zurueck=<Pfad>` an, aber nur einen internen Pfad. */
export function mitRueckweg(pfad: string, ziel: string | null | undefined): string {
  if (!istInternerPfad(ziel)) return pfad;
  const [basis, suche = ""] = pfad.split("?");
  const p = new URLSearchParams(suche);
  p.set(ZURUECK_PARAMETER, ziel as string);
  return `${basis}?${p.toString()}`;
}

/** Der Rückweg aus der Adresse, nur wenn er ins Kundenprofil führt, sonst null. */
export function kundenRueckwegAusSuche(suche: string): string | null {
  const wert = new URLSearchParams(suche).get(ZURUECK_PARAMETER);
  if (!wert || !istInternerPfad(wert)) return null;
  return /^\/kunden\/[^/?#]+/.test(wert) ? wert : null;
}

/**
 * Trägt die Adresse irgendeinen Kundenkontext? Anders als
 * `kundenbezugAusSuche` zählt schon das Vorhandensein der Parameter, auch wenn
 * der Kontakt (noch) nicht im Zwischenspeicher steht. Für den MORE Lotsen: Mit
 * Kundenkontext geht nur die kundenfreie Standardrechnung hinaus (Runde 6).
 */
export function hatKundenParameter(suche: string): boolean {
  const p = new URLSearchParams(suche);
  const gesetzt = (name: string) => !!p.get(name)?.trim();
  return gesetzt(EMPFEHLUNG_PARAMETER) || gesetzt("kundeId") || gesetzt("kunde") || gesetzt("investmentId")
    || /^\/kunden(\/|$|\?)/.test(p.get(ZURUECK_PARAMETER)?.trim() ?? "");
}

/** Die Kontaktkennung aus einem Rückweg ins Kundenprofil. */
export function kundeIdAusRueckweg(ziel: string): string | null {
  const treffer = /^\/kunden\/([^/?#]+)/.exec(ziel);
  return treffer ? decodeURIComponent(treffer[1]) : null;
}

/**
 * Der Kunde, für den eine Seite gerade gilt, aus der Adresse.
 *
 * Christians Entscheidung vom 25.09.2026: Wer über Kundenprofil,
 * Investment, Objektauswahl zur Einheit kommt, arbeitet im Kundenbezug.
 * Dann gelten „Exposé anzeigen" und „Kundenlink senden" für diesen Kunden,
 * und das Exposé folgt seiner Sprache aus dem Kundenprofil. Über die
 * Seitenleiste „Objekte" gibt es keinen Kundenbezug.
 *
 * Die Adresse trägt nur Kennungen (`?empfehlung=` und `?zurueck=`), sie
 * übersteht also ein Neuladen. Angenommen wird ein Kunde nur, wenn er im
 * Zwischenspeicher steht, also nur, was die Zeilensicherheit diesem Nutzer
 * ohnehin zeigt. Eine von Hand gesetzte fremde Kennung ergibt `null`.
 */
export interface Kundenbezug {
  kontaktId: string;
  investmentId: string | null;
}

export function kundenbezugAusSuche(suche: string): Kundenbezug | null {
  const investmentId = empfehlungAusSuche(suche);
  const investment = investmentId ? getInvestmentById(investmentId) : undefined;
  if (investment?.kontaktId && getKontaktById(investment.kontaktId)) {
    return { kontaktId: investment.kontaktId, investmentId };
  }
  const rueck = kundenRueckwegAusSuche(suche);
  const kundeId = rueck ? kundeIdAusRueckweg(rueck) : null;
  if (kundeId && getKontaktById(kundeId)) return { kontaktId: kundeId, investmentId: null };
  return null;
}

/** „Einheit öffnen": neue Einheitsseite oder alte Wohnungsansicht, je nach Rolle. */
export function einheitOeffnenLink(objektId: string, wohnungId: string, bezug: KundenBezug): string {
  if (nutztNeueObjektseiten(bezug.rolle, bezug.benutzerId)) {
    return mitRueckweg(
      mitEmpfehlung(`/objekte/${objektId}/einheiten/${wohnungId}`, bezug.investmentId),
      bezug.kundeId ? kundenRueckweg(bezug.kundeId, bezug.investmentId) : null,
    );
  }
  return mitParametern(`/objekte/${objektId}/wohnung/${wohnungId}`, {
    kundeId: bezug.kundeId,
    investmentId: bezug.investmentId,
  });
}

/**
 * „Objekt öffnen". Für Admin und Inhaber dorthin, wohin auch die Objektliste
 * führt (`zielRouteFuerObjekt`, ein Einzelobjekt direkt in seine Einheit),
 * für alle anderen in die Verwaltungsansicht mit der Einheitenliste und dem
 * Knopf „Reservieren".
 */
export function objektOeffnenLink(
  objekt: Parameters<typeof zielRouteFuerObjekt>[0],
  bezug: KundenBezug,
): string {
  if (nutztNeueObjektseiten(bezug.rolle, bezug.benutzerId)) {
    return mitRueckweg(
      mitEmpfehlung(zielRouteFuerObjekt(objekt), bezug.investmentId),
      bezug.kundeId ? kundenRueckweg(bezug.kundeId, bezug.investmentId) : null,
    );
  }
  return mitParametern(`/objekte/${objekt.id}/verwaltung`, {
    kundeId: bezug.kundeId,
    investmentId: bezug.investmentId,
  });
}

// ── Die Leiste auf der Objektseite ──────────────────────────────────────

export interface EmpfehlungsAuswahl {
  investmentId: string;
  kontaktId: string;
  /** Nur der Vorname, leer wenn keiner hinterlegt ist. */
  vorname: string;
  rahmen: Rahmen | null;
  /** Der Rahmen in Kaufpreisen, mit dem Nebenkostensatz dieses Objekts. */
  kaufpreisRahmen: Rahmen | null;
  nebenkostenProzent: number;
  /** Die passenden Einheiten dieses Objekts, für das Abzeichen in der Tabelle. */
  empfohleneIds: string[];
  /** Beim Globalobjekt: Passt das ganze Haus in den Rahmen? */
  gesamtobjektPasst: boolean;
}

/**
 * Was die Objektseite zur Auswahl anzeigt.
 *
 * Gelesen wird ausschließlich aus dem Zwischenspeicher, also nur, was die
 * Zeilensicherheit diesem Nutzer ohnehin gibt. Ist das Investment dort nicht,
 * darf er den Kunden nicht sehen, und es kommt `null` zurück: keine Leiste,
 * kein Name.
 */
export function empfehlungsAuswahlFuerObjekt(
  investmentId: string,
  objekt: ObjektData,
  nutzer: ZugangsNutzer,
  jetzt = new Date(),
): EmpfehlungsAuswahl | null {
  const investment = getInvestmentById(investmentId);
  if (!investment) return null;
  const kontakt = getKontaktById(investment.kontaktId);
  if (!kontakt) return null;

  const sa = getEigeneSaData(investmentId);
  const fin = sa ? calculateFinanzierbarkeitFromSaData(sa) : null;
  const rahmen = fin ? finanzierungsrahmen(fin.minRahmen, fin.maxRahmen) : null;
  const nk = kaufnebenkostenPct({ plz: objekt.plz, metaPct: gepflegterKaufnebenkostenSatz(objekt) });

  const kandidaten = rahmen
    ? empfehlungsKandidaten([objekt], {
        nutzer,
        kundeId: kontakt.id,
        rahmen,
        wohnort: null,
        objektKoordinate: () => null,
        jetzt,
      })
    : [];

  return {
    investmentId,
    kontaktId: kontakt.id,
    vorname: (kontakt.vorname || "").trim(),
    rahmen,
    kaufpreisRahmen: rahmen ? kaufpreisRahmen(rahmen, nk) : null,
    nebenkostenProzent: nk,
    empfohleneIds: kandidaten.filter((k) => k.passt && k.wohnungId).map((k) => k.wohnungId as string),
    gesamtobjektPasst: kandidaten.some((k) => k.global && k.passt),
  };
}
