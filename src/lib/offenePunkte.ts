/**
 * Offene Follow-Ups und offene Aufgaben, nach einer einzigen Regel gezählt.
 *
 * Vorher rechnete das jede Stelle für sich: die Inbox, die Sidebar, die
 * Kennzahl oben und die Karte auf dem Dashboard. Vier Rechnungen, vier
 * Ergebnisse. Hier steht die Regel genau einmal.
 *
 * Zwei Dinge werden bewusst getrennt gehalten:
 *
 * Follow-Ups und Aufgaben sind unterschiedliche Arbeit. Ein Follow-Up ist ein
 * vereinbarter Kontakt, eine Aufgabe ist etwas zu erledigen. Sie in eine Zahl
 * zu werfen verwischt genau die Unterscheidung, nach der man handelt.
 *
 * Und der Umfang: Wessen Punkte gezählt werden, entscheidet die Sicht. Eigen
 * heißt meine Kunden, Team heißt zusätzlich meine Downline, Firma heißt alles.
 */

import { istUeberfaellig, type Sicht } from "./dashboardKpis";

/**
 * Dieselben Arten, nach denen auch die Inbox filtert. Die Kachel auf dem
 * Dashboard und der Filter in der Inbox müssen dieselbe Einteilung benutzen,
 * sonst stehen zwei Zahlen für dieselbe Liste.
 */
export type PunktArt = "anruf" | "meeting" | "follow_up" | "aufgabe" | "deadline";

export interface OffenerPunkt {
  id: string;
  art: PunktArt;
  titel: string;
  kundeId: string;
  kundeName: string;
  faelligAm: string;
  uhrzeit?: string;
  /** Nutzer, der ihn abarbeiten soll. Leer bei Altbestand ohne Zuordnung. */
  zustaendigId?: string;
}

export interface RohFollowUp {
  id: string;
  kundeId: string;
  kundeName?: string;
  titel?: string;
  faelligAm?: string;
  status?: string;
  /** Nutzer-ID, falls gepflegt. */
  benutzerId?: string;
}

const ARTEN: PunktArt[] = ["anruf", "meeting", "follow_up", "aufgabe", "deadline"];

function leseArt(typ?: string): PunktArt {
  const t = (typ || "").toLowerCase() as PunktArt;
  return ARTEN.includes(t) ? t : "aufgabe";
}

export interface RohAufgabe {
  id: string;
  kontaktId?: string;
  typ?: string;
  titel?: string;
  faelligAm?: string;
  uhrzeit?: string;
  status?: string;
  zugewiesenAn?: string;
  benutzerId?: string;
}

/** Aufgaben aus der alten persönlichen Liste. Sie gehören immer dem Betrachter. */
export interface RohAltAufgabe {
  id: string;
  kundeId?: string;
  kundeName?: string;
  typ?: string;
  titel?: string;
  faelligAm?: string;
  uhrzeit?: string;
  erledigt?: boolean;
}

export interface PunkteEingabe {
  followUps: RohFollowUp[];
  aufgaben: RohAufgabe[];
  alteAufgaben?: RohAltAufgabe[];
  /**
   * Follow-Ups aus dem Bewerbermanagement. Sie hängen nicht an einem Kunden,
   * werden in der Inbox aber als Follow-Ups gezählt. Nur für Admin/Inhaber
   * übergeben, sonst leer lassen.
   */
  bewerberFollowUps?: Array<{
    id: string;
    titel?: string;
    faelligAm?: string;
    uhrzeit?: string;
    kundeId?: string;
    kundeName?: string;
  }>;
  /**
   * IDs, die der Nutzer in der Inbox bereits abgehakt hat (lokaler Zustand).
   * Wird abgezogen, damit Dashboard und Inbox exakt dieselbe Zahl zeigen.
   * Die Präfixe entsprechen denen aus der Inbox: Follow-Up `fu-`, Aufgabe
   * ohne Präfix, alte persönliche Liste ohne Präfix, Bewerber `bw-`.
   */
  erledigteIds?: Set<string>;
  /** Kunden, die mir gehören. */
  meineKundenIds: Set<string>;
  /** Kunden meiner Downline. Für die Sicht "team". */
  teamKundenIds?: Set<string>;
  /** Namen der Kunden, nur für die Anzeige. */
  kundenNamen?: Map<string, string>;
  sicht: Sicht;
  userId?: string;
}

function imUmfang(
  kundeId: string | undefined,
  e: PunkteEingabe,
): boolean {
  if (e.sicht === "firma") return true;
  if (!kundeId) return false;
  if (e.meineKundenIds.has(kundeId)) return true;
  if (e.sicht === "team") return !!e.teamKundenIds?.has(kundeId);
  return false;
}

export function sammleOffenePunkte(e: PunkteEingabe): OffenerPunkt[] {
  const out: OffenerPunkt[] = [];
  const name = (id?: string) => (id && e.kundenNamen?.get(id)) || "";
  const erledigt = e.erledigteIds || new Set<string>();

  for (const f of e.followUps) {
    if (f.status === "erledigt") continue;
    // Ein Follow-Up ohne Datum zählt trotzdem als offen. Die Inbox listet es
    // auch, und wer es aus der Zahl herauslässt, erklärt die Abweichung nicht
    // mehr.
    if (!imUmfang(f.kundeId, e)) continue;
    if (erledigt.has(`fu-${f.id}`)) continue;
    out.push({
      id: `fu-${f.id}`,
      art: "follow_up",
      titel: f.titel || "Follow-Up",
      kundeId: f.kundeId,
      kundeName: f.kundeName || name(f.kundeId) || "Unbekannt",
      faelligAm: f.faelligAm || "",
      zustaendigId: f.benutzerId,
    });
  }

  for (const a of e.aufgaben) {
    if (a.status === "erledigt" || a.status === "abgesagt") continue;
    const zustaendig = a.zugewiesenAn || a.benutzerId;

    // Eine Aufgabe gehört dem, der sie abarbeiten soll. In der eigenen Sicht
    // zählt deshalb ausschließlich, was mir zugewiesen ist, auch wenn der
    // Kunde jemand anderem gehört. Genau so rechnet auch die Inbox, sonst
    // stünden auf Dashboard und Inbox wieder zwei verschiedene Zahlen.
    const mir = !!e.userId && zustaendig === e.userId;
    if (e.sicht === "eigen") {
      if (!mir) continue;
    } else if (!mir && !imUmfang(a.kontaktId, e)) {
      continue;
    }
    if (erledigt.has(`ag-${a.id}`)) continue;

    out.push({
      id: `ag-${a.id}`,
      art: leseArt(a.typ),
      titel: a.titel || "Aufgabe",
      kundeId: a.kontaktId || "",
      kundeName: name(a.kontaktId) || "Ohne Kunde",
      faelligAm: a.faelligAm || "",
      uhrzeit: a.uhrzeit,
      zustaendigId: zustaendig,
    });
  }

  // Die alte persönliche Liste liegt beim Betrachter und lässt sich niemandem
  // sonst zuordnen. Sie zählt deshalb nur in der eigenen Sicht mit.
  for (const t of e.alteAufgaben || []) {
    if (t.erledigt) continue;
    if (erledigt.has(t.id)) continue;
    out.push({
      id: `alt-${t.id}`,
      art: leseArt(t.typ),
      titel: t.titel || "Aufgabe",
      kundeId: t.kundeId || "",
      kundeName: t.kundeName || name(t.kundeId) || "Ohne Kunde",
      faelligAm: t.faelligAm || "",
      uhrzeit: t.uhrzeit,
      zustaendigId: e.userId,
    });
  }

  // Bewerber-Follow-Ups sind reine Admin-Arbeit. Die Inbox listet sie unter
  // Follow-Ups, also müssen sie hier ebenfalls als Follow-Up zählen.
  for (const b of e.bewerberFollowUps || []) {
    if (erledigt.has(b.id)) continue;
    out.push({
      id: b.id,
      art: "follow_up",
      titel: b.titel || "Bewerber-Follow-Up",
      kundeId: b.kundeId || "",
      kundeName: b.kundeName || "Bewerber",
      faelligAm: b.faelligAm || "",
      uhrzeit: b.uhrzeit,
      zustaendigId: e.userId,
    });
  }

  return out.sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
}

export interface PunkteZaehler {
  followUpsOffen: number;
  followUpsUeberfaellig: number;
  aufgabenOffen: number;
  aufgabenUeberfaellig: number;
  /** Anrufe, Meetings und Deadlines. In der Inbox eigene Filter. */
  sonstigeOffen: number;
  sonstigeUeberfaellig: number;
}

export function zaehleOffenePunkte(
  punkte: OffenerPunkt[],
  jetzt: Date = new Date(),
): PunkteZaehler {
  let followUpsOffen = 0;
  let followUpsUeberfaellig = 0;
  let aufgabenOffen = 0;
  let aufgabenUeberfaellig = 0;
  let sonstigeOffen = 0;
  let sonstigeUeberfaellig = 0;

  for (const p of punkte) {
    const spaet = istUeberfaellig(p.faelligAm, p.uhrzeit, jetzt);
    if (p.art === "follow_up") {
      followUpsOffen += 1;
      if (spaet) followUpsUeberfaellig += 1;
    } else if (p.art === "aufgabe") {
      aufgabenOffen += 1;
      if (spaet) aufgabenUeberfaellig += 1;
    } else {
      // Anrufe, Meetings und Deadlines sind in der Inbox eigene Filter und
      // gehören deshalb in keine der beiden Zahlen.
      sonstigeOffen += 1;
      if (spaet) sonstigeUeberfaellig += 1;
    }
  }

  return {
    followUpsOffen,
    followUpsUeberfaellig,
    aufgabenOffen,
    aufgabenUeberfaellig,
    sonstigeOffen,
    sonstigeUeberfaellig,
  };
}
