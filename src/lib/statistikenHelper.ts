/**
 * Hilfsfunktionen für die erweiterten Statistiken (Finanz-, ROI-, Setter- und VP-KPIs).
 *
 * Sichtbarkeits-Konvention:
 *  - Admin / Inhaber / Vertriebsleiter: alle Personen
 *  - Vertriebspartner: nur eigene Zahlen
 *  - Setterin: nur eigene Zahlen
 *
 * ROI-Definition (vereinfacht, nur Provisionsbasis):
 *  ratio = generierter Umsatz / ausgezahlte Provision
 *  -> Je höher das Verhältnis, desto effizienter generiert die Person Umsatz
 *     im Verhältnis zu ihrer Vergütung.
 */

import { wahrscheinlichkeitFuerStufe } from "@/lib/kontaktPipeline";

import { cacheGet } from "./dataCache";
import { istZustaendig } from "./kontaktOwnership";
import { istPerson } from "./beraterNamensabgleich";
import { getEffectiveRateForKontakt } from "./karriereStufeHelper";

export interface PersonRow {
  user_id: string;
  name: string;
  rolle: string;
}

export interface ROIRow {
  user_id: string;
  name: string;
  rolle: string;
  abschluesse: number;
  umsatz: number;
  provision: number;
  ratio: number; // Umsatz / Provision
  /** Abschlüsse, für die kein Provisionssatz gepflegt ist (gehen mit 0 in die Summe ein) */
  ohneSatz: number;
}

export interface FinanzKPIs {
  pipelineVolumen: number;
  pipelineGewichtet: number;
  realisierterUmsatz: number;
  provisionssumme: number;
  avgDealGroesse: number;
  avgAbschlussdauerTage: number;
  abgeschlosseneDeals: number;
}

export interface SetterErweiterteKPIs {
  showRate: number;       // Termine besucht / (besucht + no-show)
  noShowRate: number;
  closingRate: number;    // Setter-Leads -> abgeschlossen
  avgErstkontaktStunden: number;
  generierterUmsatz: number;
  setterLeads: number;
  setterTermine: number;
  setterAbschluesse: number;
}

export interface VPErweiterteKPIs {
  eigenumsatz: number;
  pipelineVolumen: number;
  empfehlungsquote: number;     // Empfehlungen / Bestandskunden
  avgKundenbewertung: number;
  reaktivierungsquote: number;  // wieder aktivierte verlorene Leads
  abschluesse: number;
}

/**
 * Pipeline-Stufen-Gewichtung (geschätzte Abschlusswahrscheinlichkeit) für
 * gewichtetes Pipeline-Volumen.
 */

const ABGESCHLOSSEN_STUFEN = new Set(["faelligkeit", "abrechnung", "abgeschlossen"]);

function parseDateLoose(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === "string") {
    if (d.includes("T") || d.includes("-")) return new Date(d);
    const parts = d.split(".");
    if (parts.length === 3) return new Date(+parts[2], +parts[1] - 1, +parts[0]);
  }
  return null;
}

function normStufe(s: string | null | undefined): string {
  if (!s) return "neuer_lead";
  if (s === "bedarfsanalyse") return "vermoegensaufbau";
  if (s === "after_sales" || s === "aftersales") return "faelligkeit";
  return s;
}

/**
 * Liefert alle internen Personen mit ihrer aktiven Rolle (für ROI-Tabelle).
 */
export function getAllInternalPersons(): PersonRow[] {
  const profiles: any[] = cacheGet("profiles");
  const roles: any[] = cacheGet("user_roles");
  const INTERNAL = new Set([
    "vertriebspartner", "vertriebsleiter", "setterin",
    "admin", "inhaber",
  ]);
  const userIdToRole = new Map<string, string>();
  roles.forEach(r => {
    if (INTERNAL.has(r.role) && !userIdToRole.has(r.user_id)) {
      userIdToRole.set(r.user_id, r.role);
    }
  });
  return profiles
    .filter(p => userIdToRole.has(p.id) && !p.gesperrt && !p.geloescht && !p.deleted_at)
    .map(p => ({
      user_id: p.id,
      name: p.name || p.email || "Unbekannt",
      rolle: userIdToRole.get(p.id) || "",
    }));
}

/**
 * Berechnet die Finanz-KPIs für einen vorgefilterten Kontakte-Set + Investments im Zeitraum.
 */
export function computeFinanzKPIs(
  kontakte: any[],
  investments: any[],
  zeitraumStart: Date,
  zeitraumEnd: Date,
): FinanzKPIs {
  // Pipeline-Volumen: alle nicht-abgeschlossenen, nicht-verlorenen Kontakte mit Kaufpreis/Budget
  let pipelineVolumen = 0;
  let pipelineGewichtet = 0;
  kontakte.forEach(k => {
    const stufe = normStufe(k.meta?.pipelineStufe);
    if (stufe === "verloren" || ABGESCHLOSSEN_STUFEN.has(stufe)) return;
    const wert = Number(k.kaufpreis) || Number(k.budget) || 0;
    pipelineVolumen += wert;
    pipelineGewichtet += wert * wahrscheinlichkeitFuerStufe(stufe);
  });

  // Realisierter Umsatz aus Investments mit Kaufdatum im Zeitraum.
  //
  // Wichtig: Es zaehlen nur Investments, deren Kunde in der uebergebenen
  // Kontaktliste steht. Genau diese Einschraenkung fehlte, weshalb ein
  // Vertriebspartner unter der Ueberschrift "eigene Zahlen" den Umsatz des
  // ganzen Hauses sah.
  const kontaktById = new Map(kontakte.map(k => [String(k.id), k]));
  const investmentsImZeitraum = investments.filter(i => {
    if (i.status === "storniert" || i.status === "geloescht") return false;
    if (!kontaktById.has(String(i.kunde_id))) return false;
    const d = parseDateLoose(i.kaufdatum) || parseDateLoose(i.erstellt_am);
    return d && d >= zeitraumStart && d < zeitraumEnd;
  });

  const realisierterUmsatz = investmentsImZeitraum.reduce(
    (sum, i) => sum + (Number(i.kaufpreis) || 0), 0
  );

  // Provisionssumme: pro Investment, basierend auf zugeordnetem Vertriebspartner/Kontakt
  let provisionssumme = 0;
  investmentsImZeitraum.forEach(i => {
    const kontakt = kontaktById.get(String(i.kunde_id));
    if (!kontakt) return;
    const lockedRate = i.meta?.lockedProvisionRate ?? null;
    const rate = getEffectiveRateForKontakt(kontakt.zustaendig_id, kontakt, lockedRate);
    provisionssumme += (Number(i.kaufpreis) || 0) * (rate / 100);
  });

  const abgeschlosseneDeals = investmentsImZeitraum.length;
  const avgDealGroesse = abgeschlosseneDeals > 0 ? realisierterUmsatz / abgeschlosseneDeals : 0;

  // ø Abschlussdauer: Tage zwischen kontakt.erstellt_am und investment.kaufdatum
  let dauerSummeTage = 0;
  let dauerCount = 0;
  investmentsImZeitraum.forEach(i => {
    const kontakt = kontaktById.get(String(i.kunde_id));
    if (!kontakt) return;
    const start = parseDateLoose(kontakt.erstellt_am);
    const end = parseDateLoose(i.kaufdatum) || parseDateLoose(i.erstellt_am);
    if (start && end && end > start) {
      dauerSummeTage += (end.getTime() - start.getTime()) / 86400000;
      dauerCount++;
    }
  });
  const avgAbschlussdauerTage = dauerCount > 0 ? Math.round(dauerSummeTage / dauerCount) : 0;

  return {
    pipelineVolumen,
    pipelineGewichtet,
    realisierterUmsatz,
    provisionssumme,
    avgDealGroesse,
    avgAbschlussdauerTage,
    abgeschlosseneDeals,
  };
}

/**
 * ROI-Tabelle pro Person (alle internen Rollen).
 * Filterbar via personFilter (user_id) oder null = alle.
 */
export function computeROIRows(
  kontakte: any[],
  investments: any[],
  zeitraumStart: Date,
  zeitraumEnd: Date,
  personFilter: string | null = null,
): ROIRow[] {
  const persons = getAllInternalPersons();
  const filteredPersons = personFilter
    ? persons.filter(p => p.user_id === personFilter)
    : persons;

  const kontaktById = new Map(kontakte.map(k => [String(k.id), k]));
  const investmentsImZeitraum = investments.filter(i => {
    if (i.status === "storniert" || i.status === "geloescht") return false;
    const d = parseDateLoose(i.kaufdatum) || parseDateLoose(i.erstellt_am);
    return d && d >= zeitraumStart && d < zeitraumEnd;
  });

  const rows: ROIRow[] = filteredPersons.map(person => {
    // VP/Closer: Zuordnung über kontakt.zustaendig_id, der Name nur ohne Kennung und eindeutig
    // Setterin: Zuordnung über kontakt.setter === person.name
    const isSetter = person.rolle === "setterin";

    const personInvestments = investmentsImZeitraum.filter(i => {
      const k = kontaktById.get(String(i.kunde_id));
      if (!k) return false;
      if (isSetter) {
        return istPerson(k.meta?.setterId || k.meta?.setter_id, k.setter || k.meta?.setter, { userId: person.user_id, userName: person.name });
      }
      return istZustaendig(k, { userId: person.user_id, userName: person.name });
    });

    const umsatz = personInvestments.reduce((s, i) => s + (Number(i.kaufpreis) || 0), 0);
    let provision = 0;
    // Setter ohne gepflegten Satz: Früher wurde hier stillschweigend mit 1 %
    // gerechnet. Jetzt geht ein solcher Abschluss ehrlich mit 0 in die Summe
    // ein und wird gezählt, damit die Anzeige ihn als "Satz nicht gepflegt"
    // ausweisen kann statt einen erfundenen Betrag zu zeigen.
    let ohneSatz = 0;
    personInvestments.forEach(i => {
      const k = kontaktById.get(String(i.kunde_id));
      if (!k) return;
      const lockedRate = i.meta?.lockedProvisionRate ?? null;
      const rate: number | null = isSetter
        ? (typeof k.meta?.setterProvisionRate === "number" ? k.meta.setterProvisionRate : null)
        : getEffectiveRateForKontakt(person.user_id, k, lockedRate);
      if (rate === null) {
        ohneSatz += 1;
        return;
      }
      provision += (Number(i.kaufpreis) || 0) * (rate / 100);
    });

    const ratio = provision > 0 ? umsatz / provision : 0;

    return {
      user_id: person.user_id,
      name: person.name,
      rolle: person.rolle,
      abschluesse: personInvestments.length,
      umsatz,
      provision,
      ratio,
      ohneSatz,
    };
  });

  return rows.sort((a, b) => b.umsatz - a.umsatz);
}

/**
 * Erweiterte Setter-KPIs (Show-Rate, Closing-Rate, Erstkontakt-Zeit).
 */
export function computeSetterKPIs(
  alleKontakte: any[],
  investments: any[],
  setterName: string | null,
  zeitraumStart: Date,
  zeitraumEnd: Date,
): SetterErweiterteKPIs {
  // Setter-Leads: Kontakte mit setter === setterName (oder alle, wenn null)
  const setterLeads = alleKontakte.filter(k => {
    const matchSetter = setterName ? (k.setter || k.meta?.setter) === setterName : !!(k.setter || k.meta?.setter);
    if (!matchSetter) return false;
    const d = parseDateLoose(k.erstellt_am);
    return !d || (d >= zeitraumStart && d < zeitraumEnd);
  });

  const setterTermine = setterLeads.filter(k => k.setterTerminGebucht || k.meta?.setterTerminGebucht).length;

  // Show-Rate: aus noShowHistorie ableiten
  // No-Show-Einträge zählen
  const noShowEintraege = setterLeads.reduce((sum, k) => {
    const hist = (k.noShowHistorie || k.meta?.noShowHistorie || []) as any[];
    return sum + hist.length;
  }, 0);
  // Termine, die stattgefunden haben = gebuchte Termine (deren Datum vorbei ist) - no-shows
  const now = new Date();
  const vergangeneTermine = setterLeads.filter(k => {
    if (!(k.setterTerminGebucht || k.meta?.setterTerminGebucht)) return false;
    const dt = k.setterTerminDatum || k.meta?.setterTerminDatum;
    const d = parseDateLoose(dt);
    return d && d < now;
  }).length;
  const besucht = Math.max(0, vergangeneTermine - noShowEintraege);
  const showBasis = besucht + noShowEintraege;
  const showRate = showBasis > 0 ? (besucht / showBasis) * 100 : 0;
  const noShowRate = showBasis > 0 ? (noShowEintraege / showBasis) * 100 : 0;

  // Closing-Rate: Setter-Leads -> Abschluss
  const setterLeadIds = new Set(setterLeads.map(k => String(k.id)));
  const setterAbschluesse = investments.filter(i => {
    if (i.status === "storniert" || i.status === "geloescht") return false;
    return setterLeadIds.has(String(i.kunde_id));
  }).length;
  const closingRate = setterLeads.length > 0 ? (setterAbschluesse / setterLeads.length) * 100 : 0;

  // ø Erstkontakt-Zeit: zwischen erstellt_am und ersten Anruf/Aktivität
  const anrufe: any[] = cacheGet("anrufe");
  let erstkontaktSummeStunden = 0;
  let erstkontaktCount = 0;
  setterLeads.forEach(k => {
    const erstellt = parseDateLoose(k.erstellt_am);
    if (!erstellt) return;
    const ersterAnruf = anrufe
      .filter(a => a.kontakt_id === k.id)
      .map(a => parseDateLoose(a.angerufen_am))
      .filter(Boolean)
      .sort((a, b) => (a as Date).getTime() - (b as Date).getTime())[0] as Date | undefined;
    if (ersterAnruf && ersterAnruf >= erstellt) {
      erstkontaktSummeStunden += (ersterAnruf.getTime() - erstellt.getTime()) / 3600000;
      erstkontaktCount++;
    }
  });
  const avgErstkontaktStunden = erstkontaktCount > 0
    ? Math.round((erstkontaktSummeStunden / erstkontaktCount) * 10) / 10
    : 0;

  // Generierter Umsatz aus Setter-Leads
  const generierterUmsatz = investments
    .filter(i => setterLeadIds.has(String(i.kunde_id)) && i.status !== "storniert" && i.status !== "geloescht")
    .reduce((s, i) => s + (Number(i.kaufpreis) || 0), 0);

  return {
    showRate: Math.round(showRate),
    noShowRate: Math.round(noShowRate),
    closingRate: Math.round(closingRate * 10) / 10,
    avgErstkontaktStunden,
    generierterUmsatz,
    setterLeads: setterLeads.length,
    setterTermine,
    setterAbschluesse,
  };
}

/**
 * Erweiterte VP-KPIs (Eigenumsatz, Empfehlungsquote, Bewertung, Reaktivierung).
 */
export function computeVPKPIs(
  alleKontakte: any[],
  investments: any[],
  vpUserId: string | null,
  vpName: string | null,
  zeitraumStart: Date,
  zeitraumEnd: Date,
): VPErweiterteKPIs {
  const vpKontakte = alleKontakte.filter(k => {
    if (!vpUserId && !vpName) return true;
    return istZustaendig(k, { userId: vpUserId, userName: vpName });
  });

  // Pipeline-Volumen (offen)
  let pipelineVolumen = 0;
  vpKontakte.forEach(k => {
    const stufe = normStufe(k.meta?.pipelineStufe);
    if (stufe === "verloren" || ABGESCHLOSSEN_STUFEN.has(stufe)) return;
    pipelineVolumen += Number(k.kaufpreis) || Number(k.budget) || 0;
  });

  // Eigenumsatz (Investments im Zeitraum)
  const vpKontaktIds = new Set(vpKontakte.map(k => String(k.id)));
  const vpInvestments = investments.filter(i => {
    if (i.status === "storniert" || i.status === "geloescht") return false;
    if (!vpKontaktIds.has(String(i.kunde_id))) return false;
    const d = parseDateLoose(i.kaufdatum) || parseDateLoose(i.erstellt_am);
    return d && d >= zeitraumStart && d < zeitraumEnd;
  });
  const eigenumsatz = vpInvestments.reduce((s, i) => s + (Number(i.kaufpreis) || 0), 0);

  // Empfehlungsquote: Empfehlungen aus VP-Bestandskunden / Bestandskunden
  const bestandskunden = vpKontakte.filter(k => {
    const stufe = normStufe(k.meta?.pipelineStufe);
    return ABGESCHLOSSEN_STUFEN.has(stufe);
  });
  const empfehlungen: any[] = cacheGet("empfehlungen");
  const empfehlungenAusVP = empfehlungen.filter(e => {
    const von = e.empfohlen_von || "";
    return bestandskunden.some(k => `${k.vorname} ${k.nachname}`.toLowerCase() === String(von).toLowerCase());
  }).length;
  const empfehlungsquote = bestandskunden.length > 0
    ? Math.round((empfehlungenAusVP / bestandskunden.length) * 100)
    : 0;

  // ø Kundenbewertung
  const bewertungen: any[] = cacheGet("kunden_bewertungen");
  const vpBewertungen = bewertungen.filter(b => b.berater_id === vpUserId);
  const avgKundenbewertung = vpBewertungen.length > 0
    ? Math.round((vpBewertungen.reduce((s, b) => s + (b.bewertung_gesamt || 0), 0) / vpBewertungen.length) * 10) / 10
    : 0;

  // Reaktivierungsquote: verlorene Leads, die wieder aktiv wurden (meta.reaktiviertAm gesetzt)
  const verloreneLeads = vpKontakte.filter(k => {
    const stufe = normStufe(k.meta?.pipelineStufe);
    return stufe === "verloren" || k.status === "verloren";
  });
  const reaktiviert = vpKontakte.filter(k => k.meta?.reaktiviertAm).length;
  const reaktivierungsquote = (verloreneLeads.length + reaktiviert) > 0
    ? Math.round((reaktiviert / (verloreneLeads.length + reaktiviert)) * 100)
    : 0;

  return {
    eigenumsatz,
    pipelineVolumen,
    empfehlungsquote,
    avgKundenbewertung,
    reaktivierungsquote,
    abschluesse: vpInvestments.length,
  };
}

/**
 * Liefert die letzten 12 Monate Umsatz-Daten für den Trend-Chart.
 */
export function computeUmsatzTrend12Monate(
  investments: any[],
): { monat: string; umsatz: number; deals: number }[] {
  const result: { monat: string; umsatz: number; deals: number }[] = [];
  const now = new Date();
  const MONATSNAMEN = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inMonth = investments.filter(inv => {
      if (inv.status === "storniert" || inv.status === "geloescht") return false;
      const d = parseDateLoose(inv.kaufdatum) || parseDateLoose(inv.erstellt_am);
      return d && d >= start && d < end;
    });
    result.push({
      monat: `${MONATSNAMEN[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`,
      umsatz: inMonth.reduce((s, i) => s + (Number(i.kaufpreis) || 0), 0),
      deals: inMonth.length,
    });
  }
  return result;
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
