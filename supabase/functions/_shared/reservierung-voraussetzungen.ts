/**
 * Wann darf eine Reservierungsvereinbarung zur Unterschrift hinaus?
 * (seit 29.09.2026)
 *
 * Der Ablauf ist: erst die Selbstauskunft unterschrieben, dann ein Objekt
 * eingetragen, dann die Reservierung. Bis zum 29.09.2026 stand das nur in der
 * Oberfläche. `send-reservation-signature` prüfte allein, ob der Nutzer für
 * den Kontakt handeln darf, und schrieb dann in jedes Investment, dessen
 * Kennung im Aufruf stand, auch in ein fremdes.
 *
 * Diese Datei ist die eine Stelle für die Regel. Die Function liest sie
 * ebenso wie die Oberfläche (`darfAufObjektauswahl`, der Knopf „Jetzt
 * reservieren“ im Kundenprofil, `objektDatenFehlen`), damit Server und
 * Anzeige nie auseinanderlaufen.
 *
 * Bewusst NICHT hier: die Handeingabe der Stufe in der Fortschrittsleiste.
 * Sie bleibt ein ausdrücklicher Override für Admin und Inhaber. Sie verschickt
 * aber auch keine Vereinbarung.
 */
import { saNeueUnterschriftAusstehend } from "./selbstauskunft-geltende-unterschrift.ts";
import { ZUGRIFF_ABGELEHNT } from "./kontakt-signatur-zugriff.ts";

function nichtLeer(wert: unknown): boolean {
  return typeof wert === "string" && wert.trim() !== "";
}

function alsObjekt(wert: unknown): Record<string, unknown> {
  return wert && typeof wert === "object" && !Array.isArray(wert) ? (wert as Record<string, unknown>) : {};
}

/**
 * Schlüssel des Vermerks „Kunde finanziert selbst“ in `investments.meta`.
 * Wortgleich mit `SA_ENTFAELLT_SCHLUESSEL` in `src/lib/selbstauskunftEntfaellt.ts`,
 * ein Test hält beide zusammen.
 */
export const SA_ENTFAELLT_META_SCHLUESSEL = "selbstauskunftEntfaellt";

/**
 * Ist die Selbstauskunft erledigt?
 *
 * Ja, wenn eine der drei Bedingungen gilt:
 *   - unterschrieben (`saSigned === true`, ein Text „true“ zählt nicht),
 *   - ein fertiges `saPdf`, auf das keine neue Unterschrift wartet. Nach einer
 *     Korrektur ab dem 26.09.2026 zählt das PDF der alten Fassung nicht mehr,
 *     siehe `saNeueUnterschriftAusstehend`,
 *   - der Vermerk „Kunde finanziert selbst“ ist gesetzt.
 */
export function selbstauskunftErledigt(meta: unknown): boolean {
  const m = alsObjekt(meta);
  if (m.saSigned === true) return true;
  if (nichtLeer(m.saPdf) && !saNeueUnterschriftAusstehend(m)) return true;
  return alsObjekt(m[SA_ENTFAELLT_META_SCHLUESSEL]).aktiv === true;
}

/** Die Angaben, an denen „Objekt eingetragen“ hängt. */
export interface ObjektAngaben {
  /** Wohnung oder Haus aus der Objektseite (`meta.objektId`). */
  objektId?: string | null;
  strasse?: string | null;
  ort?: string | null;
  weNr?: string | null;
  kaufpreis?: number | null;
}

/**
 * Ist am Investment ein Objekt eingetragen?
 *
 * Entweder hängt ein Objekt aus der Objektseite dran (`objektId`, auch das
 * ganze Haus ohne Wohneinheit), oder die vier Pflichtangaben aus „Objekt
 * eintragen“ stehen: Straße, Ort, Wohneinheit und ein Kaufpreis über null.
 * Dieselben vier wie in `objektDatenFehlen`.
 */
export function objektEingetragen(a: ObjektAngaben): boolean {
  if (nichtLeer(a.objektId)) return true;
  const kaufpreis = Number(a.kaufpreis);
  return nichtLeer(a.strasse) && nichtLeer(a.ort) && nichtLeer(a.weNr) && isFinite(kaufpreis) && kaufpreis > 0;
}

/**
 * Die Angaben aus einer Zeile von `investments`, für den Server.
 *
 * Dieselbe Reihenfolge der Quellen wie `vorhandeneObjektDaten` in
 * `src/lib/objektDatenPflicht.ts`, ohne den abgeschalteten eigenen Bestand.
 * Ein Test vergleicht beide.
 */
export function objektAngabenAusInvestment(zeile: { meta?: unknown; wohnung?: unknown } | null | undefined): ObjektAngaben {
  const meta = alsObjekt(zeile?.meta);
  const virt = alsObjekt(meta.rvVirtualWohnung);
  const schnapp = alsObjekt(meta.wohnungSnapshot);
  const objSchnapp = alsObjekt(meta.objektSnapshot);
  const text = (...werte: unknown[]) => {
    for (const w of werte) if (nichtLeer(w)) return (w as string).trim();
    return "";
  };
  const zahl = (...werte: unknown[]) => {
    for (const w of werte) {
      const n = Number(w);
      if (isFinite(n) && n > 0) return n;
    }
    return 0;
  };
  return {
    objektId: text(meta.objektId) || null,
    strasse: text(virt.objAdresse, objSchnapp.strasse, objSchnapp.adresse),
    ort: text(virt.objOrt, objSchnapp.ort),
    // `meta.weNr` oder die Spalte `wohnung`, wie `fromDb` im investmentsStore.
    weNr: text(virt.weNr, meta.weNr, zeile?.wohnung, schnapp.weNr),
    kaufpreis: zahl(meta.kaufpreis, virt.kaufpreis, schnapp.kaufpreis, schnapp.vkGesamt),
  };
}

/** Meldungen an die Oberfläche. Sie stehen dort wörtlich im Hinweis. */
export const RV_OHNE_INVESTMENT =
  "Zu dieser Reservierung fehlt das Investment. Bitte starte sie aus dem Kundenprofil.";
export const RV_SA_FEHLT = "Die Selbstauskunft ist noch nicht unterschrieben.";
export const RV_SA_NEU_AUSSTEHEND =
  "Die korrigierte Selbstauskunft ist noch nicht neu unterschrieben. Die Reservierung geht erst danach.";
export const RV_OBJEKT_FEHLT = "Es ist noch kein Objekt eingetragen.";
export const RV_ALLGEMEINER_FEHLER =
  "Die Reservierung konnte nicht versendet werden. Bitte versuche es erneut.";

export type RvPruefung =
  | { ok: true }
  | { ok: false; status: number; fehler: string };

/**
 * Die ganze Prüfung der Function, ohne Datenbank.
 *
 * `investment` ist die geladene Zeile oder `null`, wenn es sie nicht gibt.
 * Ein fremdes und ein fehlendes Investment bekommen dieselbe neutrale
 * Ablehnung wie ein fremder Kontakt, sonst verriete die Antwort, welche
 * Kennungen es gibt.
 *
 * Status 409 für die beiden Ablaufregeln, nicht 403: Die Oberfläche setzt bei
 * 403 ihren eigenen Text zur fehlenden Berechtigung ein
 * (`signaturErneutSenden`), und die Meldung hier soll ankommen.
 */
export function pruefeReservierungsVoraussetzungen(
  kontaktId: string,
  investment: { kunde_id?: unknown; meta?: unknown; wohnung?: unknown } | null | undefined,
): RvPruefung {
  // uuid gegen uuid, beide als Text aus der Datenbank bzw. dem Aufruf.
  if (!investment || !nichtLeer(kontaktId) || String(investment.kunde_id ?? "") !== kontaktId) {
    return { ok: false, status: 403, fehler: ZUGRIFF_ABGELEHNT };
  }
  const meta = alsObjekt(investment.meta);
  if (!selbstauskunftErledigt(meta)) {
    const fehler = saNeueUnterschriftAusstehend(meta) ? RV_SA_NEU_AUSSTEHEND : RV_SA_FEHLT;
    return { ok: false, status: 409, fehler };
  }
  if (!objektEingetragen(objektAngabenAusInvestment(investment))) {
    return { ok: false, status: 409, fehler: RV_OBJEKT_FEHLT };
  }
  return { ok: true };
}
