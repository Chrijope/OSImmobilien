/** Pure reporting model. Scope before aggregation; stock never uses a creation-date filter. */
import { PIPELINE_STUFEN, stufenFilterLabel, wahrscheinlichkeitFuerStufe } from "./pipelineStufen";
import { normalizeStufe } from "./statistikTrichter";
import { isKontaktStatsExcluded } from "./statsExclusion";
import type { Datensicht } from "./datenSicht";
import { OHNE_KAMPAGNE, kampagneAusKontakt, kampagnenName } from "./kampagnenKennung";

// Raw cache rows have extensible JSON metadata.
export type Row = {
  id: string;
  meta?: Record<string, any>;
  [key: string]: any;
};
export type Period = { start: Date; end: Date };
export const DAY = 86400000;
export function timestamp(value: unknown): number | null {
  if (!value) return null;
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    !(value instanceof Date)
  )
    return null;
  const match =
    typeof value === "string" && /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  const iso =
    typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  if (match || iso) {
    const year = Number(match ? match[3] : iso![1]);
    const month = Number(match ? match[2] : iso![2]);
    const day = Number(match ? match[1] : iso![3]);
    const calendar = new Date(year, month - 1, day);
    if (
      calendar.getFullYear() !== year ||
      calendar.getMonth() !== month - 1 ||
      calendar.getDate() !== day
    )
      return null;
  }
  const n = match
    ? new Date(+match[3], +match[2] - 1, +match[1]).getTime()
    : new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}
export const inPeriod = (value: unknown, p: Period) => {
  const n = timestamp(value);
  return n !== null && n >= +p.start && n < +p.end;
};
export const amount = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
export const ratio = (numerator: number, denominator: number) =>
  denominator > 0 ? (numerator / denominator) * 100 : null;
export const unique = (rows: Row[]) => [
  ...new Map(rows.filter((r) => r.id).map((r) => [r.id, r])).values(),
];
export const stage = (r: Row) =>
  normalizeStufe(
    r.meta?.pipelineStufe ||
      r.pipelineStufe ||
      (r.status === "verloren" ? "verloren" : null),
  );
export const lost = (r: Row) =>
  r.status === "verloren" || stage(r) === "verloren";
export const cancelled = (r: Row) =>
  !!(
    isKontaktStatsExcluded(r) ||
    r.meta?.geloescht ||
    r.geloescht ||
    r.storniert ||
    r.storno ||
    r.meta?.storniert ||
    ["storniert", "geloescht"].includes(r.status)
  );
export const closed = (r: Row) =>
  ["faelligkeit", "abrechnung", "abgeschlossen", "bestandsimport"].includes(
    stage(r),
  ) || timestamp(r.kaufdatum) !== null;
export const openContact = (r: Row) =>
  !cancelled(r) &&
  !r.archiviert &&
  !lost(r) &&
  stage(r) !== "archiviert" &&
  !closed(r);
export const price = (r: Row) => {
  const m = r.meta || {};
  return amount(
    m.kaufpreis ??
      m.rvVirtualWohnung?.kaufpreis ??
      m.wohnungSnapshot?.kaufpreis ??
      m.wohnungSnapshot?.vkGesamt ??
      m.wohnungSnapshot?.vk_gesamt ??
      r.kaufpreis ??
      m.objektSnapshot?.kaufpreis,
  );
};
export const closingDate = (r: Row) =>
  r.kaufdatum ||
  (closed(r) ? r.meta?.notarTermin || r.meta?.notarData?.datum : null);
export const nameOf = (r: Row) =>
  `${r.vorname || ""} ${r.nachname || ""}`.trim() ||
  r.name ||
  r.objekt ||
  "Ohne Namen";

export function scopeIds(
  role: string,
  userId: string,
  view: Datensicht,
  team: Set<string>,
  person = "alle",
): Set<string> | null {
  if (!userId) return new Set();
  const house = ["admin", "inhaber", "testaccount"].includes(role);
  const leader = role === "vertriebsleiter";
  const allowed =
    house && view === "haus"
      ? null
      : new Set([
          userId,
          ...((house || leader) && view !== "eigene" ? team : []),
        ]);
  if (person !== "alle")
    return allowed === null || allowed.has(person)
      ? new Set([person])
      : new Set();
  return allowed;
}
export function belongs(
  r: Row,
  ids: Set<string> | null,
  profiles: Row[],
  role: string,
): boolean {
  if (ids === null) return true;
  if (!ids.size) return false;
  const setter = role === "setterin";
  const id = setter
    ? r.meta?.setterId || r.meta?.setter_id || r.setterId
    : r.zustaendig_id;
  if (id) return ids.has(id); // IDs take precedence over stale names.
  const name = setter ? r.meta?.setter || r.setter : r.berater;
  if (!name) return false;
  const matching = profiles.filter((p) => p.name === name);
  return matching.length === 1 && ids.has(matching[0].id);
}

export function pipeline(
  kontakte: Row[],
  investments: Row[],
  now = Date.now(),
) {
  const invMap = new Map<string, Row[]>();
  for (const inv of unique(investments).filter(
    (i) =>
      !cancelled(i) && !lost(i) && !i.archiviert && stage(i) !== "archiviert",
  )) {
    invMap.set(inv.kunde_id, [...(invMap.get(inv.kunde_id) || []), inv]);
  }
  const open = kontakte.filter(
    (k) =>
      !cancelled(k) &&
      !lost(k) &&
      !k.archiviert &&
      stage(k) !== "archiviert" &&
      ((invMap.get(k.id) || []).length
        ? (invMap.get(k.id) || []).some((i) => !closed(i))
        : openContact(k)),
  );
  const rows = PIPELINE_STUFEN.filter(
    (s) => normalizeStufe(s.key) === s.key,
  ).map((s) => ({
    key: s.key as string,
    label: stufenFilterLabel(s.key),
    count: 0,
    volume: 0,
    weighted: 0,
    contacts: [] as Row[],
  }));
  rows.push({
    key: "unbekannt",
    label: "Stufe ungeklärt",
    count: 0,
    volume: 0,
    weighted: 0,
    contacts: [],
  });
  for (const k of kontakte) {
    const target =
      rows.find((r) => r.key === (k.archiviert ? "archiviert" : stage(k))) ||
      rows[rows.length - 1];
    target.count++;
    target.contacts.push(k);
  }
  let budget = 0;
  for (const k of open) {
    const invs = (invMap.get(k.id) || []).filter((i) => !closed(i));
    if (!invs.length) {
      budget += amount(k.budget);
      continue;
    }
    for (const inv of invs) {
      const target =
        rows.find((r) => r.key === stage(inv)) || rows[rows.length - 1];
      target.volume += price(inv);
      target.weighted +=
        price(inv) *
        (target.key === "unbekannt"
          ? 0
          : wahrscheinlichkeitFuerStufe(target.key));
    }
  }
  const sla: Record<string, number> = {
    neuer_lead: 3,
    nicht_erreicht: 5,
    erreicht: 7,
    follow_up: 7,
    erstgespraech_geplant: 7,
    eg_noshow: 3,
    beratungsgespraech: 7,
    bg_noshow: 3,
    selbstauskunft: 14,
    objektauswahl: 21,
    follow_up_objekt: 14,
    reservierung: 14,
    bonitaetsunterlagen: 14,
    finanzierung: 30,
    notar: 14,
  };
  /**
   * Der Stufeneintritt steht am Investment, nicht am Kontakt.
   *
   * Geschrieben wird `meta.pipelineSeit` ausschliesslich in
   * `investmentsStore.updateInvestment` beim Stufenwechsel eines Investments.
   * Diese Auswertung las das Feld frueher am Kontakt und fand deshalb nie
   * einen Zeitstempel: Die Liste "Stufenfrist ueberschritten" blieb dauerhaft
   * leer, die Gegenprobe "ohne Stufeneintritt" traf dagegen auf jeden Vorgang.
   *
   * Gezaehlt wird eine Zeile je Kontakt, nicht je Investment: Die Kachel steht
   * neben "Offene Verkaufschancen", die ebenfalls Kontakte zaehlt, und die
   * Frage lautet "wen muss ich anrufen". Ein Kunde mit zwei haengenden
   * Investments soll deshalb nur einmal auf der Liste stehen. Massgeblich ist
   * die Frist der jeweiligen Investmentstufe, nicht die Stufe am Kontakt.
   */
  const offeneInvestments = (k: Row) =>
    (invMap.get(k.id) || []).filter((i) => !closed(i));
  const stale = open.filter((k) =>
    offeneInvestments(k).some((inv) => {
      const t = timestamp(inv.meta?.pipelineSeit);
      const frist = sla[stage(inv)];
      return t !== null && frist !== undefined && (now - t) / DAY >= frist;
    }),
  );
  /**
   * Gegenprobe fuer die Datenqualitaet: offene Investments, bei denen der
   * Stufeneintritt fehlt. Kontakte ganz ohne Investment bleiben aussen vor,
   * bei ihnen gibt es keine Stelle, an der der Zeitstempel stehen koennte.
   */
  const ohneStufeneintritt = open.filter((k) =>
    offeneInvestments(k).some(
      (inv) => timestamp(inv.meta?.pipelineSeit) === null,
    ),
  );
  const upcoming: Row[] = [],
    overdue: Row[] = [],
    unscheduled: Row[] = [];
  for (const k of open) {
    const near = (invMap.get(k.id) || []).filter(
      (i) =>
        !closed(i) &&
        [
          "reservierung",
          "bonitaetsunterlagen",
          "finanzierung",
          "notar",
        ].includes(stage(i)),
    );
    if (
      !near.length &&
      !["reservierung", "finanzierung", "notar"].includes(stage(k))
    )
      continue;
    const dates = near
      .map((i) => timestamp(i.meta?.notarTermin || i.meta?.notarData?.datum))
      .filter((n): n is number => n !== null);
    if (!dates.length) unscheduled.push(k);
    else {
      if (dates.some((t) => t < now)) overdue.push(k);
      if (dates.some((t) => t >= now && t < now + 30 * DAY)) upcoming.push(k);
    }
  }
  return {
    rows,
    open,
    budget,
    stale,
    ohneStufeneintritt,
    upcoming,
    overdue,
    unscheduled,
    volume: rows.reduce((s, r) => s + r.volume, 0),
    weighted: rows.reduce((s, r) => s + r.weighted, 0),
  };
}

export function outcomes(kontakte: Row[], investments: Row[], p: Period) {
  const ids = new Set(kontakte.map((k) => k.id));
  const valid = unique(investments).filter(
    (i) => ids.has(i.kunde_id) && !cancelled(i) && !lost(i),
  );
  const deals = valid.filter(
    (i) =>
      closed(i) &&
      inPeriod(closingDate(i), p) &&
      timestamp(closingDate(i))! <= Date.now(),
  );
  const customers = new Set(deals.map((i) => i.kunde_id));
  const newContacts = kontakte.filter((k) => inPeriod(k.erstellt_am, p));
  const cohortIds = new Set(newContacts.map((k) => k.id));
  const cohortWon = new Set(
    valid
      .filter(
        (i) =>
          closed(i) &&
          timestamp(closingDate(i)) !== null &&
          timestamp(closingDate(i))! < +p.end &&
          timestamp(closingDate(i))! <= Date.now() &&
          cohortIds.has(i.kunde_id),
      )
      .map((i) => i.kunde_id),
  );
  const losses = kontakte.filter(
    (k) => lost(k) && inPeriod(k.meta?.verlorenAm, p),
  );
  const durations = deals
    .flatMap((i) => {
      const k = kontakte.find((k) => k.id === i.kunde_id);
      const start = timestamp(k?.erstellt_am),
        end = timestamp(closingDate(i));
      return start !== null && end !== null && end >= start
        ? [(end - start) / DAY]
        : [];
    })
    .sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const medianDays = durations.length
    ? durations.length % 2
      ? durations[mid]
      : (durations[mid - 1] + durations[mid]) / 2
    : null;
  return {
    deals,
    customers,
    newContacts,
    losses,
    cohortWon,
    cohortRate: ratio(cohortWon.size, newContacts.length),
    volume: deals.reduce((s, i) => s + price(i), 0),
    medianDays,
    durationCount: durations.length,
    missingClosingDate: valid.filter(
      (i) => closed(i) && timestamp(closingDate(i)) === null,
    ),
  };
}

/** Transition denominators contain only contacts with evidence of the preceding step. */
export function conversion(kontakte: Row[], investments: Row[]) {
  const evidence = kontakte.map((k) => {
    const invs = investments.filter(
      (i) => i.kunde_id === k.id && !cancelled(i) && !lost(i),
    );
    return [
      true,
      !!(
        k.meta?.erstgespraechTermin ||
        k.meta?.erstgespraechAt ||
        k.meta?.setterTerminGebucht
      ),
      invs.some((i) => i.meta?.saSigned === true),
      invs.some((i) => i.meta?.rvSigned === true),
      invs.some((i) => closed(i)),
    ];
  });
  const labels = [
    "Kontakt angelegt",
    "Erstgespräch vereinbart",
    "Selbstauskunft unterschrieben",
    "Reservierung unterschrieben",
    "Abschluss belegt",
  ];
  return labels.map((label, index) => {
    const denominator = index
      ? evidence.filter((e) => e[index - 1]).length
      : evidence.length;
    const numerator = evidence.filter(
      (e) => e[index] && (!index || e[index - 1]),
    ).length;
    const missingPrevious = index
      ? evidence.filter((e) => e[index] && !e[index - 1]).length
      : 0;
    return {
      label,
      denominator,
      numerator,
      rate: ratio(numerator, denominator),
      missingPrevious,
    };
  });
}

export interface KampagnenAuswertungZeile {
  kampagne: string;
  leads: number;
  termine: number;
  reservierungen: number;
  abschluesse: number;
  /** Abschlüsse je Lead in Prozent, `null` ohne Leads. */
  abschlussquote: number | null;
  items: Row[];
}

/**
 * Leads, Termine, Reservierungen und Abschlüsse je Kampagne.
 *
 * Gruppiert nach dem Kampagnennamen aus `meta.kampagne` (erster Kontakt, siehe
 * `kampagnenKennung.ts`). Die Stufen zählen mit denselben Nachweisen wie
 * `conversion` oben, damit beide Auswertungen zusammenpassen:
 *   Termin        Erstgespräch vereinbart oder vom Setter gebucht
 *   Reservierung  eine Reservierung unterschrieben
 *   Abschluss     ein Investment in Fälligkeit, Abrechnung oder abgeschlossen
 * Stornierte und verlorene Investments zählen nicht.
 *
 * Leads ohne Kennung verschwinden nicht, sie stehen gesammelt unter
 * `OHNE_KAMPAGNE`, immer als letzte Zeile.
 */
export function kampagnenAuswertung(kontakte: Row[], investments: Row[]): KampagnenAuswertungZeile[] {
  const jeKontakt = new Map<string, Row[]>();
  for (const i of investments) {
    if (cancelled(i) || lost(i)) continue;
    const liste = jeKontakt.get(i.kunde_id) || [];
    liste.push(i);
    jeKontakt.set(i.kunde_id, liste);
  }
  const map = new Map<string, KampagnenAuswertungZeile>();
  for (const k of kontakte) {
    const name = kampagnenName(kampagneAusKontakt(k));
    const zeile =
      map.get(name) ||
      { kampagne: name, leads: 0, termine: 0, reservierungen: 0, abschluesse: 0, abschlussquote: null, items: [] };
    const invs = jeKontakt.get(k.id) || [];
    zeile.leads += 1;
    zeile.items.push(k);
    if (k.meta?.erstgespraechTermin || k.meta?.erstgespraechAt || k.meta?.setterTerminGebucht) zeile.termine += 1;
    if (invs.some((i) => i.meta?.rvSigned === true)) zeile.reservierungen += 1;
    if (invs.some((i) => closed(i))) zeile.abschluesse += 1;
    map.set(name, zeile);
  }
  return [...map.values()]
    .map((z) => ({ ...z, abschlussquote: ratio(z.abschluesse, z.leads) }))
    .sort((a, b) =>
      a.kampagne === OHNE_KAMPAGNE ? 1 : b.kampagne === OHNE_KAMPAGNE ? -1 : b.leads - a.leads,
    );
}

export function activityData(activities: Row[], kontakte: Row[], p: Period) {
  const ids = new Set(kontakte.map((k) => k.id));
  return unique(activities).filter(
    (a) => ids.has(a.kunde_id) && inPeriod(a.datum, p),
  );
}
export function previousPeriod(p: Period): Period {
  return { start: new Date(+p.start - (+p.end - +p.start)), end: p.start };
}
export function groupRows(rows: Row[], key: (r: Row) => string) {
  const map = new Map<string, Row[]>();
  rows.forEach((r) => {
    const name = key(r) || "Keine Angabe";
    map.set(name, [...(map.get(name) || []), r]);
  });
  return [...map]
    .map(([label, items]) => ({ label, count: items.length, items }))
    .sort((a, b) => b.count - a.count);
}
export function timeSeries(
  rows: Row[],
  p: Period,
  date: (r: Row) => unknown,
  value: (r: Row) => number = () => 1,
) {
  const monthly = (+p.end - +p.start) / DAY > 93;
  const key = (d: Date) =>
    monthly
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const map = new Map<string, number>();
  const d = new Date(p.start);
  d.setHours(0, 0, 0, 0);
  if (monthly) d.setDate(1);
  while (d < p.end) {
    map.set(key(d), 0);
    if (monthly) d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 1);
  }
  rows.forEach((r) => {
    if (!inPeriod(date(r), p)) return;
    const k = key(new Date(timestamp(date(r))!));
    map.set(k, (map.get(k) || 0) + value(r));
  });
  return [...map].map(([label, count]) => ({ label, count }));
}

/** Financing rows use investment IDs in the historically named kunde_id column. */
export function financingData(investments: Row[], financings: Row[]) {
  const data = unique(investments).filter(
    (i) =>
      !cancelled(i) && !lost(i) && !i.archiviert && stage(i) !== "archiviert",
  );
  const byInvestment = new Map(financings.map((f) => [f.kunde_id, f]));
  const rows = data.flatMap((i) => {
    const f = byInvestment.get(i.id);
    if (
      !f &&
      ![
        "reservierung",
        "bonitaetsunterlagen",
        "finanzierung",
        "notar",
      ].includes(stage(i))
    )
      return [];
    const offers = Array.isArray(f?.angebote) ? f.angebote : [];
    const chosen = offers.filter(
      (a: any) => a.akzeptiert || a.id === f?.akzeptiertes_angebot_id,
    );
    const offer = chosen.length === 1 ? chosen[0] : null;
    const signed =
      offer?.dokumente?.some(
        (d: any) => d.name === "Darlehensvertrag" && d.status === "signed",
      ) === true;
    const finalized = !!offer?.bankFinal;
    const state =
      chosen.length > 1
        ? "Angebotszuordnung ungeklärt"
        : signed
          ? "Darlehensvertrag unterschrieben"
          : finalized
            ? "Bankfinales Angebot"
            : offer
              ? "Angebot ausgewählt"
              : offers.length
                ? "Angebote vorhanden"
                : "Angebot fehlt";
    return [
      {
        ...i,
        financeState: state,
        loanAmount: offer ? amount(offer.summe) : null,
        signed,
        finalized,
        offerMissing: !offer,
      },
    ];
  });
  const confirmed = rows.filter((r) => r.signed);
  const duration = (a: string, b: string) =>
    rows.flatMap((i) => {
      const start = timestamp(i.meta?.[a]),
        end = timestamp(i.meta?.[b]);
      return start !== null && end !== null && end >= start
        ? [(end - start) / DAY]
        : [];
    });
  const rvOffer = duration("reserviertAm", "finanzierungAngebotGesendetAm");
  const offerContract = duration(
    "finanzierungAngebotGesendetAm",
    "darlehensvertragUploadedAm",
  );
  return {
    rows,
    confirmed,
    volume: confirmed.reduce((s, r) => s + (r.loanAmount || 0), 0),
    missingAmount: confirmed.filter((r) => !r.loanAmount),
    rvOffer,
    offerContract,
  };
}
/**
 * Das monatliche Einkommen aus einer Selbstauskunft.
 *
 * Erwartet die Selbstauskunft eines Investments (`meta.saData`), nicht mehr
 * einen Kontakt. Zahlen sind immer investmentbezogen (Entscheidung Christian,
 * 10.09.2026), die frueher am Kontakt liegende Kopie gibt es nicht mehr.
 *
 * Gezaehlt werden Gehalt, Selbstaendigkeit, Rente und Mieteinnahmen. Fehlen
 * alle vier, kommt `null` zurueck: Das unterscheidet "keine Angabe" von
 * "null Euro".
 */
export function incomeOf(saData: Record<string, any> | null | undefined): number | null {
  if (!saData) return null;
  const income = saData.einkommen as Record<string, unknown> | undefined;
  // Neue Selbstauskunft: `einkommen.netto`. Aeltere Form: flache Felder.
  const quellen: [string, unknown][] = income
    ? [
        ["gehalt", income.netto],
        ["selbstaendig", income.gewerbe],
        ["renten", income.rente],
        ["mieteinnahmen", income.miet],
      ]
    : [
        ["gehalt", saData.gehalt],
        ["selbstaendig", saData.selbstaendig],
        ["renten", saData.renten],
        ["mieteinnahmen", saData.mieteinnahmen],
      ];
  if (!quellen.some(([, v]) => v !== undefined && v !== null && v !== "")) return null;
  const parse = (v: unknown) =>
    typeof v === "number"
      ? v
      : Number(
          String(v || 0)
            .replace(/\./g, "")
            .replace(",", "."),
        );
  const values = quellen.map(([, v]) => parse(v));
  return values.every(Number.isFinite)
    ? values.reduce((s, n) => s + n, 0)
    : null;
}

export function activePeople(activities: Row[], profiles: Row[]) {
  const grouped = new Map<string, { label: string; count: number }>();
  let unassigned = 0;
  for (const a of activities) {
    const names = profiles.filter((p) => p.name === a.von);
    const id = a.benutzer_id || (names.length === 1 ? names[0].id : null);
    if (!id) {
      unassigned++;
      continue;
    }
    const person = profiles.find((p) => p.id === id);
    const label = person?.name || a.von || "Name fehlt";
    const previous = grouped.get(id);
    grouped.set(id, { label, count: (previous?.count || 0) + 1 });
  }
  const rows = [...grouped.values()].sort((a, b) => b.count - a.count);
  return {
    count: grouped.size,
    unassigned,
    rows: rows.map((r, index) => ({
      ...r,
      label:
        rows.filter((other) => other.label === r.label).length > 1
          ? `${r.label} (${index + 1})`
          : r.label,
    })),
  };
}
