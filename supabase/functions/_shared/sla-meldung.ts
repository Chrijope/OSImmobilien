/**
 * Glockenmeldung für rote SLA-Verstöße (`send-sla-inactivity-nudges`).
 *
 * Bis zum 31.10.2026 stand in jeder Meldung `link: "/"`. Der Klick öffnete
 * das Dashboard, und dort ist die Liste der vernachlässigten Leads nur für
 * die Setterin eingeblendet. Wer einen Lead kontaktieren sollte, fand ihn
 * nicht. Jetzt führt ein einzelner Lead direkt zum Kontakt, mehrere zur
 * Pipeline, und die Kennungen stehen in `meta`.
 *
 * Eigene Datei, damit Text und Ziel mit vitest prüfbar sind.
 */

export interface SlaVerstoss {
  kontakt_id: string;
  vorname?: string | null;
  nachname?: string | null;
  days_inactive?: number | null;
}

export interface SlaMeldung {
  titel: string;
  nachricht: string;
  link: string;
  meta: { notif_type: "sla_verstoss"; kontakt_ids: string[] };
}

export function slaMeldung(rot: SlaVerstoss[]): SlaMeldung {
  const anzahl = rot.length;
  const meta = { notif_type: "sla_verstoss" as const, kontakt_ids: rot.map((v) => v.kontakt_id) };

  if (anzahl === 1) {
    const v = rot[0];
    const name = [v.vorname, v.nachname].filter(Boolean).join(" ").trim() || "Ein Lead";
    const tage = v.days_inactive ? `seit ${v.days_inactive} Tagen` : "seit über der SLA-Schwelle";
    return {
      titel: "⚠️ SLA-Verstoß: 1 Lead vernachlässigt",
      nachricht: `${name} hat ${tage} keine Aktivität. Bitte zeitnah kontaktieren.`,
      link: `/kunden/${v.kontakt_id}`,
      meta,
    };
  }

  return {
    titel: `⚠️ SLA-Verstoß: ${anzahl} Leads vernachlässigt`,
    nachricht: `Du hast ${anzahl} Leads, die seit über der SLA-Schwelle keine Aktivität haben. Bitte zeitnah kontaktieren.`,
    link: "/pipeline",
    meta,
  };
}

/**
 * Ältere SLA-Meldungen tragen noch `link: "/"` und keine Kennungen. Die
 * Glocke schickt sie zur Pipeline statt aufs Dashboard.
 */
export function altesSlaZiel(titel: string, link: string | null | undefined): string | null {
  const ohneZiel = !link || link === "/";
  return ohneZiel && titel.includes("SLA-Verstoß") ? "/pipeline" : null;
}
