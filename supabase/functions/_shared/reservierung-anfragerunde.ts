/**
 * Welche Unterschriften zur Reservierung gerade zählen (seit 05.10.2026).
 *
 * Wird eine Reservierungsvereinbarung erneut verschickt, entsteht eine neue
 * Anfragerunde. Bis zum 05.10.2026 blieben die unterschriebenen Anfragen der
 * alten Runde stehen, und `finalize-reservierung` nahm je Käufer bevorzugt
 * eine unterschriebene. Eine Unterschrift unter der alten Fassung, etwa für
 * eine andere Einheit nach dem Aufheben, zählte damit für die neue mit. Live
 * gab es am 05.10.2026 zwei Investments mit mehrfach unterschriebener
 * Reservierung; an ihnen wurde nichts geändert.
 *
 * Jetzt gilt:
 *   - `send-reservation-signature` markiert beim Neuversand die schon
 *     unterschriebenen Anfragen desselben Investments als überholt
 *     (`meta.rvUeberholtAm`). Status, Unterschrift und Zeitpunkt bleiben als
 *     Nachweis unverändert stehen.
 *   - `finalize-reservierung` zählt je Käufer nur die jüngste, nicht
 *     überholte Anfrage. Der Neuversand löscht die offenen Anfragen vorher,
 *     eine jüngere offene Anfrage heißt also immer: neue Runde, noch nicht
 *     unterschrieben.
 *   - Ist die Reservierung schon vollständig unterschrieben und nicht
 *     entfallen, lehnt der Neuversand ab. Erst aufheben, dann neu senden.
 */

/** Schlüssel in `signature_requests.meta` für eine überholte Anfrage. */
export const RV_UEBERHOLT_SCHLUESSEL = "rvUeberholtAm";

export const RV_BEREITS_UNTERSCHRIEBEN =
  "Die Reservierung ist bereits unterschrieben, bitte zuerst aufheben.";

export const RV_VERSAND_NICHT_ERLAUBT =
  "Reservierungen versenden nur Vertrieb, Backoffice, Admin und Inhaber.";

/**
 * Wer eine Reservierungsvereinbarung zur Unterschrift schicken darf.
 *
 * `darf_reservieren` (Einheit reservieren) kennt Admin, Inhaber,
 * Vertriebsleitung und Vertriebspartner. Den Versand macht heute zusätzlich
 * das Backoffice (Seite /reservierung und „Neuen Link senden“ im
 * Kundenprofil), deshalb steht es hier mit. Welche Kunden, entscheidet danach
 * `pruefeKontaktZugriff`.
 */
export const RV_VERSAND_ROLLEN = ["admin", "inhaber", "vertriebsleiter", "vertriebspartner", "backoffice"] as const;

export function darfReservierungVersenden(rollen: readonly unknown[] | null | undefined): boolean {
  return (rollen ?? []).some((r) => typeof r === "string" && (RV_VERSAND_ROLLEN as readonly string[]).includes(r));
}

function alsObjekt(wert: unknown): Record<string, unknown> {
  return wert && typeof wert === "object" && !Array.isArray(wert) ? (wert as Record<string, unknown>) : {};
}

/**
 * Die Käufer, die unterschreiben müssen, aus den Vertragsdaten (`rvData`):
 * Käufer 1 immer, Käufer 2 mit `hatPerson2`. So entscheidet der Server und
 * nicht die Liste im Aufruf.
 */
export function erwarteteRvKaeufer(rvData: unknown): string[] {
  return alsObjekt(rvData).hatPerson2 === true ? ["kaeufer1", "kaeufer2"] : ["kaeufer1"];
}

/**
 * Vollständig heißt: jede Anfrage der Runde und jeder erwartete Käufer
 * (`rv_kaeufer1`, `rv_kaeufer2`) hat unterschrieben.
 */
export function rundeVollstaendig(runde: readonly RvAnfrage[], rvData: unknown): boolean {
  if (runde.length === 0 || !runde.every((r) => r.status === "signed")) return false;
  return erwarteteRvKaeufer(rvData).every((k) => runde.some((r) => r.person_type === `rv_${k}`));
}

/** Meldung, wenn ein Link zu einer aufgehobenen Reservierung gehört (Sie-Form). */
export const RV_AUFGEHOBEN = {
  de: "Diese Reservierung wurde aufgehoben, der Link ist nicht mehr gültig.",
  en: "This reservation has been cancelled, the link is no longer valid.",
} as const;

/**
 * Liegt die Anfrage vor dem letzten Aufheben (`meta.rvZuletztAufgehobenAm`
 * am Investment, gesetzt vom Knopf „Reservierung aufheben“)? Dieselbe Regel
 * wie `rv_anfrage_aufgehoben` in der Datenbank (20261005130000).
 */
export function vorLetztemAufheben(anfrage: { created_at?: string | null }, investmentMeta: unknown): boolean {
  const am = Date.parse(String(alsObjekt(investmentMeta).rvZuletztAufgehobenAm ?? ""));
  const angelegt = Date.parse(String(anfrage.created_at ?? ""));
  return !Number.isNaN(am) && !Number.isNaN(angelegt) && angelegt < am;
}

/** Vollständig unterschrieben und nicht entfallen (Einheit bei der Unterschrift vergeben). */
export function reservierungVollstaendigUnterschrieben(investmentMeta: unknown): boolean {
  const m = alsObjekt(investmentMeta);
  return m.rvSigned === true && !m.rvReservierungEntfallenAm;
}

export interface RvAnfrage {
  person_type: string;
  status: string;
  created_at?: string | null;
  meta?: unknown;
}

export function rvAnfrageUeberholt(anfrage: { meta?: unknown }): boolean {
  const wert = alsObjekt(anfrage.meta)[RV_UEBERHOLT_SCHLUESSEL];
  return typeof wert === "string" && wert.trim() !== "";
}

function zeit(wert: string | null | undefined): number {
  const t = wert ? Date.parse(wert) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Die Anfragen der aktuellen Runde: je Käufer die jüngste, nicht überholte.
 * Bei gleichem Zeitpunkt gewinnt die unterschriebene, dann die spätere in der Liste.
 */
export function aktuelleRvAnfragen<T extends RvAnfrage>(anfragen: readonly T[] | null | undefined): T[] {
  const jeKaeufer = new Map<string, T>();
  for (const a of anfragen ?? []) {
    if (rvAnfrageUeberholt(a)) continue;
    const bisher = jeKaeufer.get(a.person_type);
    if (!bisher) {
      jeKaeufer.set(a.person_type, a);
      continue;
    }
    const neu = zeit(a.created_at), alt = zeit(bisher.created_at);
    if (neu > alt || (neu === alt && (a.status === "signed" || bisher.status !== "signed"))) {
      jeKaeufer.set(a.person_type, a);
    }
  }
  return [...jeKaeufer.values()];
}
