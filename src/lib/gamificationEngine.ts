/**
 * Live Gamification Engine
 * Berechnet XP, Meilensteine und Abschluss-Boni aus echten DB-Daten pro Nutzer.
 */
import { getKontakte, type KundeData } from "./kundenStore";
import { getInvestments, type Investment } from "./investmentsStore";
import { loadMeilensteine, type MeilensteinData } from "./auswertungenStore";
import { istAbschluss, istQualifiziert } from "./abschlussDefinition";
import { istZustaendig } from "./kontaktOwnership";

// ── XP-Werte pro Aktion ──
export const XP_VALUES = {
  leadAngelegt: 5,            // nur manuell angelegte Leads
  interessentQualifiziert: 25, // qualifizierte selbst angelegte Leads
  systemLeadQualifiziert: 5,   // qualifizierte System-Leads
  reservierungAbgeschlossen: 60,
  kapitalanlageVerkauft: 150,
  tagesStreak: 3,
  top3Ranking: 30,
} as const;

// ── Abschluss-Bonus-Stufen ──
export const ABSCHLUSS_BONUS_STUFEN = [
  { count: 5, bonus: 25, label: "+25 €" },
  { count: 10, bonus: 50, label: "+50 €" },
  { count: 15, bonus: 75, label: "+75 €" },
  { count: 25, bonus: 150, label: "+150 €" },
  { count: 50, bonus: 400, label: "+400 €" },
];

export interface GamificationResult {
  totalXP: number;
  leadsAngelegt: number;
  qualifiziert: number;
  reservierungen: number;
  abschluesse: number;
  streakTage: number;
  meilensteinXP: number;
  meilensteinBonusEuro: number;
  abschlussBonusStufen: { count: number; bonus: number; label: string; done: boolean }[];
  abschlussBonusGesamt: number;
  milestonesAutoStatus: Record<string, boolean>;
}

/**
 * Berechne alle Gamification-Daten für den aktuellen Nutzer.
 * Optional: userId und beraterName für nutzerspezifische Filterung.
 */
export function berechneGamification(
  userId?: string,
  beraterName?: string
): GamificationResult {
  const alleKontakte = getKontakte();
  const alleInvestments = getInvestments();

  // Leads die diesem Nutzer zugeordnet sind (über zustaendig_id oder berater-Name)
  const meineKontakte = filterKontakteFuerNutzer(alleKontakte, userId, beraterName);
  const meineInvestments = filterInvestmentsFuerNutzer(alleInvestments, meineKontakte);

  // ── Zähler – unterscheide manuell vs. System-Leads ──
  const manuellAngelegt = meineKontakte.filter(k => k.leadTyp === "manuell");
  const systemAngelegt = meineKontakte.filter(k => k.leadTyp !== "manuell");
  const leadsAngelegt = manuellAngelegt.length; // nur manuell = XP

  // Qualifiziert und Abschluss sind projektweit in abschlussDefinition
  // festgelegt. Vorher standen hier eigene Listen mit Stufennamen, die es in
  // der Pipeline nicht gibt ("beratung", "bonitaet"), und ein Abschluss zaehlte
  // erst ab "faelligkeit", waehrend die Abrechnung schon ab "notar" zaehlte.
  const qualifiziertManuell = manuellAngelegt.filter(istQualifiziert).length;
  const qualifiziertSystem = systemAngelegt.filter(istQualifiziert).length;
  const qualifiziert = qualifiziertManuell + qualifiziertSystem;

  const reservierungen = meineInvestments.filter(
    (inv) => inv.pipelineStufe === "reservierung"
  ).length;
  const abschluesse = meineInvestments.filter((inv) =>
    istAbschluss(inv.pipelineStufe)
  ).length;

  // ── Streak berechnen (basierend auf Kontakt-Aktivität der letzten Tage) ──
  const streakTage = berechneStreak(meineKontakte);

  // ── Meilensteine automatisch erkennen ──
  const milestonesAutoStatus = erkenneMeilensteine(
    leadsAngelegt,
    qualifiziert,
    reservierungen,
    abschluesse,
    streakTage
  );

  // ── Meilenstein-XP und Bonus ──
  const meilensteine = loadMeilensteine();
  let meilensteinXP = 0;
  let meilensteinBonusEuro = 0;
  for (const m of meilensteine) {
    const isDone = milestonesAutoStatus[m.id] || m.done;
    if (isDone) {
      const xpVal = parseInt((m.xp || "0").replace(/[^0-9]/g, ""));
      if (!isNaN(xpVal)) meilensteinXP += xpVal;
      if (m.bonus) {
        const bonusVal = parseFloat(
          (m.bonus || "0").replace(/[^0-9.,]/g, "").replace(",", ".")
        );
        if (!isNaN(bonusVal)) meilensteinBonusEuro += bonusVal;
      }
    }
  }

  // ── Abschluss-Bonus Stufen ──
  const abschlussBonusStufen = ABSCHLUSS_BONUS_STUFEN.map((s) => ({
    ...s,
    done: abschluesse >= s.count,
  }));
  const abschlussBonusGesamt = abschlussBonusStufen
    .filter((s) => s.done)
    .reduce((sum, s) => sum + s.bonus, 0);

  // ── Gesamt-XP ──
  const totalXP =
    leadsAngelegt * XP_VALUES.leadAngelegt +
    qualifiziertManuell * XP_VALUES.interessentQualifiziert +
    qualifiziertSystem * XP_VALUES.systemLeadQualifiziert +
    reservierungen * XP_VALUES.reservierungAbgeschlossen +
    abschluesse * XP_VALUES.kapitalanlageVerkauft +
    streakTage * XP_VALUES.tagesStreak +
    meilensteinXP;

  return {
    totalXP,
    leadsAngelegt,
    qualifiziert,
    reservierungen,
    abschluesse,
    streakTage,
    meilensteinXP,
    meilensteinBonusEuro,
    abschlussBonusStufen,
    abschlussBonusGesamt,
    milestonesAutoStatus,
  };
}

/** Filter Kontakte für einen bestimmten Nutzer */
function filterKontakteFuerNutzer(
  kontakte: KundeData[],
  userId?: string,
  beraterName?: string
): KundeData[] {
  if (!userId && !beraterName) return kontakte;
  // Kennung zuerst, der Name nur fuer Altbestand ohne Kennung und nur eindeutig.
  return kontakte.filter((k) => istZustaendig(k, { userId, userName: beraterName }));
}

/** Filter Investments für Kontakte des Nutzers */
function filterInvestmentsFuerNutzer(
  investments: Investment[],
  meineKontakte: KundeData[]
): Investment[] {
  const kontaktIds = new Set(meineKontakte.map((k) => k.id));
  return investments.filter((inv) => kontaktIds.has(inv.kontaktId));
}

/** Berechne Streak basierend auf Kontakt-Erstellungsdaten */
function berechneStreak(kontakte: KundeData[]): number {
  if (kontakte.length === 0) return 0;

  // Sammle alle relevanten Daten (erstellt_am, aktualisiert_am)
  const aktivDaten = new Set<string>();
  for (const k of kontakte) {
    if (k.erstellt_am) aktivDaten.add(k.erstellt_am.substring(0, 10));
    if (k.aktualisiert_am) aktivDaten.add(k.aktualisiert_am.substring(0, 10));
  }

  // Sortiere absteigend
  const sortiert = Array.from(aktivDaten).sort().reverse();
  if (sortiert.length === 0) return 0;

  const heute = new Date().toISOString().substring(0, 10);
  // Streak nur zählen wenn heute oder gestern aktiv
  const letztesAktiv = sortiert[0];
  const diffTage = Math.floor(
    (new Date(heute).getTime() - new Date(letztesAktiv).getTime()) / 86400000
  );
  if (diffTage > 1) return 0;

  let streak = 1;
  for (let i = 1; i < sortiert.length; i++) {
    const current = new Date(sortiert[i - 1]);
    const prev = new Date(sortiert[i]);
    const diff = Math.floor(
      (current.getTime() - prev.getTime()) / 86400000
    );
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/** Automatische Meilenstein-Erkennung basierend auf echten Zahlen */
function erkenneMeilensteine(
  leads: number,
  qualifiziert: number,
  reservierungen: number,
  abschluesse: number,
  streak: number
): Record<string, boolean> {
  return {
    m1: leads >= 10, // Erste 10 Leads
    m2: leads >= 50, // 50er Club
    m3: reservierungen >= 1, // Erste Reservierung
    m4: abschluesse >= 5, // 5 Abschlüsse
    m5: streak >= 7, // 7-Tage-Streak
    m6: false, // Top 3 Platzierung - manuell
    m7: streak >= 30, // 30-Tage-Streak
    m8: false, // Millionär - wird separat geprüft
    m9: false, // Top-Performer - manuell
  };
}

/**
 * Berechne den Millionär-Meilenstein separat (braucht Kaufpreise)
 */
export function pruefeMillionaer(kontakte: KundeData[]): boolean {
  const gesamtVolumen = kontakte
    .filter(
      (k) =>
        k.status === "kunde" ||
        (k.pipelineStufe &&
          ["faelligkeit", "abrechnung", "abgeschlossen"].includes(k.pipelineStufe))
    )
    .reduce((sum, k) => sum + (k.kaufpreis || 0), 0);
  return gesamtVolumen >= 1000000;
}
