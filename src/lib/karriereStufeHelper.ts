import { cacheGet } from "./dataCache";
import { kennungZuName, nameMehrdeutig } from "./beraterNamensabgleich";
import { OVERHEAD_AKTIV } from "./lizenzPakete";

/**
 * Karrierestufen-Definitionen und Override-Helfer.
 * Andere Module importieren diese für konsistente Stufen-Definitionen.
 */
export interface KarriereStufeInfo {
  id: "tippgeber" | "vertriebspartner" | "manager" | "vertriebsfirma";
  titel: string;
  emoji: string;
  rate: number;
  schwelle: number;
  /** Junior-Override in Prozentpunkten (nur Team Lead / Lizenzpartner) */
  juniorOverride?: number;
  /**
   * Stufe existiert nur noch für Bestandsnutzer. Sie bleibt in der Liste,
   * damit gespeicherte Overrides weiterhin auf Titel und Satz aufgelöst
   * werden (getKarriereStufe liefert sie unverändert). Neu vergeben wird sie
   * nicht mehr: alle Neuvergabe-Auswahlen und Vergleichs-Anzeigen filtern
   * über NEUVERGABE_KARRIERE_STUFEN.
   */
  nurBestand?: boolean;
}

/**
 * Neues Konditionsmodell (Etappe 1 Bewerbermanagement-Umbau): Alle neuen
 * Partner starten einheitlich mit 4 % (id "vertriebspartner", Titel
 * "Vertriebspartner"). Die alte 3-%-Stufe heißt jetzt "Vertriebspartner
 * (Alt)", Manager und Vertriebsfirma bleiben als reine Bestandsstufen
 * erhalten. Bestandspartner sind über ihre in der Nutzerverwaltung
 * festgeschriebenen custom_provision_rate-Sätze abgesichert (Provisions-
 * Sanierung), die Stufe ist für sie nur noch Anzeige und Fallback.
 */
export const KARRIERE_STUFEN: KarriereStufeInfo[] = [
  { id: "tippgeber", titel: "Vertriebspartner (Alt)", emoji: "🌱", rate: 3, schwelle: 0, nurBestand: true },
  { id: "vertriebspartner", titel: "Vertriebspartner", emoji: "🔥", rate: 4, schwelle: 10 },
  // Der Junior-Override hängt am zentralen Overhead-Schalter: ohne aktive
  // Overhead-Provision führt keine Stufe einen Override-Satz.
  { id: "manager", titel: "Team Lead", emoji: "🏆", rate: 4.5, schwelle: 30, ...(OVERHEAD_AKTIV ? { juniorOverride: 1.5 } : {}), nurBestand: true },
  { id: "vertriebsfirma", titel: "Lizenzpartner", emoji: "👑", rate: 5, schwelle: 50, ...(OVERHEAD_AKTIV ? { juniorOverride: 2 } : {}), nurBestand: true },
];

/**
 * Stufen, die bei Neuvergabe (Einladung, Aktivierung, Karriere-Auswahl) zur
 * Wahl stehen und die in Vergleichs-Anzeigen als Zielbild gezeigt werden.
 * Aktuell ist das genau die einheitliche 4-%-Stufe.
 */
export const NEUVERGABE_KARRIERE_STUFEN = KARRIERE_STUFEN.filter((s) => !s.nurBestand);

export type KarriereStufe = typeof KARRIERE_STUFEN[number]["titel"];

/** Formatiert einen Satz deutsch fuer die Anzeige, z. B. 4.5 wird zu "4,5 %". */
export function formatSatzProzent(rate: number): string {
  return `${String(rate).replace(".", ",")} %`;
}

/**
 * Anzeige-Text einer Stufe inklusive Junior-Override, z. B.
 * "4,5 % + 1,5 % Junior-Override" fuer Team Lead. Wird u. a. in der
 * Nutzerverwaltung angezeigt; so bleibt der Satz je Stufe an einer Stelle.
 */
export function formatStufenProvision(stufe: KarriereStufeInfo): string {
  const satz = formatSatzProzent(stufe.rate);
  return stufe.juniorOverride
    ? `${satz} + ${formatSatzProzent(stufe.juniorOverride)} Junior-Override`
    : satz;
}

const normalizeKarriereValue = (value?: string | null) => (value ?? "").trim().toLowerCase();

/**
 * Legacy-Aliase: alte Titel, die noch in user_settings.karriere_override gespeichert
 * sein können, werden auf die aktuelle Stufen-ID gemappt.
 *
 * "lead partner" war bis zur Vereinheitlichung auf 4 % der Titel der Stufe
 * "vertriebspartner". Der nackte Titel "Vertriebspartner" löst seit der
 * Umbenennung über den Titel-Durchlauf auf die 4-%-Stufe auf (vorher 3 %);
 * Alt-Bestand mit diesem gespeicherten Wert ist über die festgeschriebenen
 * custom_provision_rate-Sätze abgesichert und rutscht nicht auf 4 % hoch.
 */
const LEGACY_KARRIERE_ALIASES: Record<string, KarriereStufeInfo["id"]> = {
  "junior berater": "tippgeber",
  "berater": "vertriebspartner",
  "lead berater": "vertriebspartner",
  "lead partner": "vertriebspartner",
  "team berater": "manager",
  "senior berater": "vertriebsfirma",
};

export function getKarriereOverrideForUser(userId?: string | null): string | null {
  if (!userId) return null;
  const allSettings = cacheGet<any>("user_settings");
  const override = allSettings.find((row: any) => row.user_id === userId)?.einstellungen?.karriere_override;
  return typeof override === "string" && override.trim().length > 0 ? override : null;
}

/** Returns a custom provision rate if manually set for a user, or null to use the standard stufe rate */
export function getCustomProvisionRate(userId?: string | null): number | null {
  if (!userId) return null;
  const allSettings = cacheGet<any>("user_settings");
  const rate = allSettings.find((row: any) => row.user_id === userId)?.einstellungen?.custom_provision_rate;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

/** Returns the rate Michael (or any user) earns when a Setterin assigned the lead */
export function getCustomProvisionRateSetter(userId?: string | null): number | null {
  if (!userId) return null;
  const allSettings = cacheGet<any>("user_settings");
  const rate = allSettings.find((row: any) => row.user_id === userId)?.einstellungen?.custom_provision_rate_setter;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

/** Returns the rate for self-acquired contacts */
export function getCustomProvisionRateEigen(userId?: string | null): number | null {
  if (!userId) return null;
  const allSettings = cacheGet<any>("user_settings");
  const rate = allSettings.find((row: any) => row.user_id === userId)?.einstellungen?.custom_provision_rate_eigen;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

/**
 * Sind die Provisionssätze dieses Partners in der Nutzerverwaltung
 * festgeschrieben? Gesetzt wird das Flag im Teampartner-Profil, geprüft
 * serverseitig von `merge_user_settings`. Hier wird es gelesen, damit die
 * Festschreibung auch in Anzeige und Rechnung wirkt und nicht nur beim
 * Speichern.
 */
export function istProvisionFestgeschrieben(userId?: string | null): boolean {
  if (!userId) return false;
  const allSettings = cacheGet<any>("user_settings");
  return allSettings.find((row: any) => row.user_id === userId)?.einstellungen?.provision_locked === true;
}

/** Returns the effective provision rate for a user (custom rate > stufe rate) */
export function getEffectiveRate(userId?: string | null, fallbackStufe?: KarriereStufeInfo): number {
  const customRate = getCustomProvisionRate(userId);
  if (customRate !== null) return customRate;
  if (fallbackStufe) return fallbackStufe.rate;
  const override = getKarriereOverrideForUser(userId);
  const stufe = override ? getKarriereStufe(0, override) : KARRIERE_STUFEN[0];
  return stufe.rate;
}

/**
 * Determines the effective provision rate for a user with respect to a specific contact.
 * Priority:
 *  1. Locked rate on the kontakt/investment (e.g. invMeta.lockedProvisionRate or kontakt.meta.lockedProvisionRate)
 *  2. Zugewiesener Lead → custom_provision_rate_setter (falls gesetzt)
 *  3. Eigener Kontakt → custom_provision_rate_eigen (falls gesetzt)
 *  4. Fallback → getEffectiveRate (custom_provision_rate / Karrierestufe)
 *
 * Was ein eigener Kontakt ist, entschied bisher allein das Feld `setter`, also
 * der Name einer Setterin. Bei MOREImmo gibt es aber keine Setterinnen: die
 * Leads werden den Vertriebspartnern zugewiesen, und die setten selbst im
 * Erstgespräch. Das Feld blieb deshalb praktisch immer leer, womit rechnerisch
 * jeder Kontakt als eigener galt und der Lead-Satz nie zur Anwendung kam.
 *
 * Massgeblich ist jetzt, wer den Kontakt angelegt hat:
 *
 *   eigen        der Vertriebspartner selbst, von Hand oder über einen
 *                CSV-Import, den er selbst hochgeladen hat. `addKontakt`
 *                trägt dabei automatisch `erstelltVonId` ein.
 *   zugewiesen   alles andere: vom Büro angelegt, über eine Kampagne
 *                eingegangen, aus einem fremden Import verteilt.
 *
 * Ein eingetragener Setter zählt weiterhin als zugewiesen. So bleiben alte
 * Datensätze richtig eingeordnet.
 */

export type Satzart = "eigen" | "zugewiesen" | "locked" | "stufe" | "nutzerverwaltung";

export const SATZART_LABEL: Record<Satzart, string> = {
  eigen: "Eigen",
  zugewiesen: "Zugewiesen",
  locked: "Festgeschrieben",
  stufe: "Karrierestufe",
  nutzerverwaltung: "Nutzerverwaltung",
};

export const SATZART_ERKLAERUNG: Record<Satzart, string> = {
  eigen: "Der Vertriebspartner hat diesen Kontakt selbst angelegt. Es gilt sein Eigen-Satz.",
  zugewiesen: "Dieser Lead wurde dem Vertriebspartner zugewiesen. Es gilt sein Lead-Satz.",
  locked:
    "Der Satz wurde beim Anlegen des Vorgangs festgeschrieben. Eine spätere Änderung am Partner wirkt sich auf diesen Vorgang nicht mehr aus.",
  stufe: "Für diesen Fall ist kein eigener Satz gepflegt. Es gilt der Satz der Karrierestufe.",
  nutzerverwaltung:
    "Die Sätze dieses Partners sind in der Nutzerverwaltung festgeschrieben. Der dort hinterlegte Satz gilt vor allem anderen, auch vor einem am Vorgang eingefrorenen Satz.",
};

/**
 * Hat der Vertriebspartner diesen Kontakt selbst angelegt?
 *
 * `erstelltVonId` wird von `addKontakt` automatisch gesetzt, auch beim
 * CSV-Import. Ältere Datensätze haben das Feld nicht; sie fallen dann über den
 * Namen zurück, und wenn auch der fehlt, gelten sie als zugewiesen. Das ist die
 * vorsichtigere Annahme, weil der Lead-Satz üblicherweise der niedrigere ist.
 */
export function istEigenKontakt(userId: string | null | undefined, kontakt: any): boolean {
  if (!kontakt) return false;
  // Ein eingetragener Setter bedeutet immer: nicht selbst gewonnen.
  if (kontakt.setter && String(kontakt.setter).trim().length > 0) return false;

  const erstellerId = kontakt.erstelltVonId ?? kontakt.meta?.erstelltVonId ?? null;
  if (erstellerId && userId) return String(erstellerId) === String(userId);

  // Kein Ersteller hinterlegt: über den Namen versuchen.
  const erstellerName = String(kontakt.erstelltVonName ?? kontakt.meta?.erstelltVonName ?? "").trim();
  const beraterName = String(kontakt.berater ?? "").trim();
  if (erstellerName && beraterName) {
    // Traegt ein zweiter Nutzer denselben Namen, ist nicht klar, wer gemeint
    // ist. Dann gilt die vorsichtigere Annahme "zugewiesen", wie ohne Namen.
    if (nameMehrdeutig(erstellerName)) return false;
    // Wie im Trigger `investments_provisionssatz_festschreiben`: Meint der
    // Name eindeutig jemand anderen als diesen Partner, ist es nicht eigen.
    const erstellerKennung = kennungZuName(erstellerName);
    if (userId && erstellerKennung && erstellerKennung !== userId) return false;
    return erstellerName.toLowerCase() === beraterName.toLowerCase();
  }
  return false;
}

export function getEffectiveRateForKontakt(
  userId: string | null | undefined,
  kontakt: any,
  lockedRate?: number | null,
): number {
  return getEffectiveRateInfoForKontakt(userId, kontakt, lockedRate).rate;
}

/**
 * Schalter fuer Abrechnungen und Provisionsabrechnung (29.09.2026).
 *
 * Christian hat Variante a entschieden: Es gilt der beim Anlegen
 * festgeschriebene Satz. Scharf geschaltet wird erst, wenn zwei Dinge geklaert
 * sind: Die Festschreibung in der Datenbank hat vom 18.08. bis 28.09.2026 nichts
 * geschrieben (Trigger-Reparatur nie angekommen, Leads beim Anlegen oft noch
 * ohne Partner), und 12 vom Browser im Juni geschriebene Saetze (5 %) weichen
 * vom heutigen Satz (3 %) ab. Bis dahin rechnen beide Seiten wie bisher mit dem
 * aktuellen Satz. Statistik und Dashboard lesen den Satz unabhaengig davon.
 */
export const FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG = false;

/**
 * Der am Investment festgeschriebene Satz (`meta.lockedProvisionRate`), sonst
 * `null`. Nur eine Zahl größer null zählt, alles andere ist kein Satz.
 */
export function festgeschriebenerSatz(meta: Record<string, unknown> | null | undefined): number | null {
  if (!FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG) return null;
  const satz = meta?.lockedProvisionRate;
  return typeof satz === "number" && satz > 0 ? satz : null;
}

/**
 * Liefert zusätzlich zum effektiven Satz die Satzart, damit in Abrechnung,
 * Auswertung und Zielplanung sichtbar wird, warum genau dieser Prozentsatz
 * gerechnet wurde.
 *
 * Prioritätskette:
 *  1. Festschreibung in der Nutzerverwaltung (provision_locked): Es gelten die
 *     dort gepflegten Sätze (_eigen/_setter, sonst der allgemeine Satz), und
 *     zwar VOR einem am Investment eingefrorenen Satz. Fehlt trotz
 *     Festschreibung der passende Satz, gilt der Stufensatz (Kennung zuerst
 *     über findKarriereStufe) und wird als "stufe" gekennzeichnet.
 *  2. Am Investment eingefrorener Satz (lockedProvisionRate).
 *  3. Eigen- bzw. Lead-Satz des Partners.
 *  4. Karrierestufe.
 */
export function getEffectiveRateInfoForKontakt(
  userId: string | null | undefined,
  kontakt: any,
  lockedRate?: number | null,
): {
  rate: number;
  quelle: Satzart;
  setterName?: string;
  /** Der Satz, der heute gelten würde. Nur bei "locked" gefüllt und nur, wenn er abweicht. */
  heutigerSatz?: number;
} {
  const eigen = istEigenKontakt(userId, kontakt);
  const setterName = kontakt?.setter ? String(kontakt.setter).trim() : "";

  // Der Satz, der ohne Festschreibung am Investment gelten würde.
  // `istCustomSatz` unterscheidet gepflegte Sätze vom Stufen-Fallback, damit
  // die Festschreibung aus der Nutzerverwaltung korrekt gekennzeichnet wird.
  const aktuell = ((): { rate: number; quelle: Satzart; istCustomSatz: boolean } => {
    if (eigen) {
      const r = getCustomProvisionRateEigen(userId);
      if (r !== null) return { rate: r, quelle: "eigen", istCustomSatz: true };
    } else {
      const r = getCustomProvisionRateSetter(userId);
      if (r !== null) return { rate: r, quelle: "zugewiesen", istCustomSatz: true };
    }
    const allgemein = getCustomProvisionRate(userId);
    if (allgemein !== null) return { rate: allgemein, quelle: "stufe", istCustomSatz: true };
    const override = getKarriereOverrideForUser(userId);
    const stufe = override ? getKarriereStufe(0, override) : KARRIERE_STUFEN[0];
    return { rate: stufe.rate, quelle: "stufe", istCustomSatz: false };
  })();

  // 1. Festschreibung aus der Nutzerverwaltung: schlägt auch den am Investment
  // eingefrorenen Satz. So kann ein falsch eingefrorener Wert (z. B. 3 % durch
  // fehlende Leserechte beim Anlegen) die Zusage aus der Nutzerverwaltung
  // nicht mehr aushebeln.
  if (istProvisionFestgeschrieben(userId)) {
    return {
      rate: aktuell.rate,
      quelle: aktuell.istCustomSatz ? "nutzerverwaltung" : "stufe",
      setterName: setterName || undefined,
    };
  }

  // 2. Ein am Investment festgeschriebener Satz. Er entsteht beim Anlegen des
  // Investments und schützt den Partner davor, dass eine spätere Änderung an
  // seinen Konditionen eine bereits zugesagte Provision nachträglich verschiebt.
  const festgeschrieben =
    typeof lockedRate === "number" && lockedRate > 0
      ? lockedRate
      : ((kontakt?.meta?.lockedProvisionRate ?? kontakt?.lockedProvisionRate) as number | undefined);

  if (typeof festgeschrieben === "number" && festgeschrieben > 0) {
    return {
      rate: festgeschrieben,
      quelle: "locked",
      setterName: setterName || undefined,
      heutigerSatz:
        Math.abs(festgeschrieben - aktuell.rate) > 0.001 ? aktuell.rate : undefined,
    };
  }

  return { rate: aktuell.rate, quelle: aktuell.quelle, setterName: setterName || undefined };
}

export function getKarriereStufeById(id?: string | null): KarriereStufeInfo {
  const normalizedId = normalizeKarriereValue(id);
  return KARRIERE_STUFEN.find((stufe) => stufe.id === normalizedId) ?? KARRIERE_STUFEN[0];
}

/**
 * Löst einen gespeicherten Karriere-Wert (Kennung, Titel oder Legacy-Alias)
 * auf die passende Stufe auf.
 *
 * Die Kennungen laufen dabei in einem eigenen, kompletten Durchlauf VOR den
 * Titeln (Kennung-zuerst-Logik). Historischer Grund: Bis zur Vereinheitlichung
 * auf 4 % trug die ERSTE Stufe den Titel "Vertriebspartner", während
 * "vertriebspartner" die Kennung der zweiten war; ein kombinierter Vergleich
 * löste die Kennung fälschlich auf 3 % auf. Seit der Umbenennung gehören
 * Titel "Vertriebspartner" und Kennung "vertriebspartner" zur selben
 * 4-%-Stufe, der nackte Alt-Titel "Vertriebspartner" landet damit bewusst
 * auf 4 %. Bestandspartner aus der 3-%-Zeit sind über die in der
 * Nutzerverwaltung festgeschriebenen custom_provision_rate-Sätze
 * (Provisions-Sanierung) abgesichert; ihre alte Stufe existiert weiter als
 * "Vertriebspartner (Alt)".
 */
export function findKarriereStufe(value?: string | null): KarriereStufeInfo | undefined {
  const raw = (value ?? "").trim();
  const normalized = normalizeKarriereValue(value);
  if (!normalized) return undefined;

  // 1. Exakte Kennung (so schreiben Nutzerverwaltung und Aktivierung den Wert).
  const byId = KARRIERE_STUFEN.find((stufe) => stufe.id === raw);
  if (byId) return byId;

  // 2. Titel, für Altbestand wie "Lead Partner" oder "Vertriebspartner".
  const byTitel = KARRIERE_STUFEN.find(
    (stufe) => normalizeKarriereValue(stufe.titel) === normalized,
  );
  if (byTitel) return byTitel;

  // 3. Kennung in abweichender Schreibweise (z. B. "MANAGER").
  const byIdNormalized = KARRIERE_STUFEN.find((stufe) => stufe.id === normalized);
  if (byIdNormalized) return byIdNormalized;

  // 4. Legacy-Aliase aus alten Datenbeständen.
  const aliasId = LEGACY_KARRIERE_ALIASES[normalized];
  if (aliasId) {
    return KARRIERE_STUFEN.find((s) => s.id === aliasId);
  }
  return undefined;
}

/**
 * Berechnet die Karrierestufe basierend auf Abschlüssen,
 * aber ein manueller Override hat immer Vorrang.
 */
export function getKarriereStufe(abschluesse: number, override?: string | null): KarriereStufeInfo {
  const overrideStufe = findKarriereStufe(override);
  if (overrideStufe) return overrideStufe;

  let result = KARRIERE_STUFEN[0];
  for (const stufe of KARRIERE_STUFEN) {
    if (abschluesse >= stufe.schwelle) result = stufe;
  }
  return result;
}
