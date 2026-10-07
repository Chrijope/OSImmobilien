// Shared Zielplanung state persisted in user_settings DB

import { supabase } from "@/integrations/supabase/client";
import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { isTestAccount } from "./dbStoreHelper";
import { KARRIERE_STUFEN } from "./karriereStufeHelper";

export type ZielplanungModus = "volumen" | "anzahl";

export interface ZielplanungConfig {
  modus: ZielplanungModus;
  karrierestufe: string;
  /**
   * Wird nicht mehr gelesen. Gerechnet wird überall mit der Konstanten
   * `DURCHSCHNITTSKAUFPREIS`. Das Feld bleibt nur erhalten, damit die
   * gespeicherten Werte der Partner nicht verloren gehen.
   */
  durchschnittskaufpreis: number;
  verkaufsvolumen: number[];
  verkaufsAnzahl: number[];
  /**
   * Anteil der Abschlüsse, die aus selbst gewonnenen Kontakten kommen sollen,
   * in Prozent. Der Rest sind zugewiesene Leads.
   *
   * Ohne diese Angabe rechnete die Zielplanung mit einem einzigen flachen Satz,
   * und zwar dem aus dem Feld "Individueller Satz". Wer nur Eigen- und
   * Lead-Satz gepflegt hat, bekam damit eine Zielprovision, die mit dem
   * Karrierestufen-Satz gerechnet war und entsprechend danebenlag.
   */
  anteilEigenPct?: number;
  /** Wenn true: Vom Admin festgeschrieben. VP kann nicht mehr selbst bearbeiten. */
  lockedByAdmin?: boolean;
  /** Zeitpunkt der Admin-Sperre (ISO) */
  lockedAt?: string;
  /** Name/ID des Admins, der gesperrt hat */
  lockedBy?: string;
}

const SETTINGS_KEY = "zielplanung";
const LS_KEY = "mi_zielplanung";

/**
 * Fester Durchschnittskaufpreis für die gesamte Zielplanung.
 *
 * Das war früher ein Eingabefeld mit dem Vorgabewert 150.000. Christian hat
 * entschieden, dass immer mit 250.000 Euro gerechnet wird, damit alle Partner
 * dieselbe Grundlage haben. Das Feld ist deshalb aus der Oberfläche
 * verschwunden, und jede Rechnung nimmt diese Konstante.
 *
 * `ZielplanungConfig.durchschnittskaufpreis` bleibt trotzdem im Datenmodell
 * stehen und die gespeicherten Werte bleiben unangetastet. Sie werden nur
 * nicht mehr gelesen. Sollte die Entscheidung einmal zurückgenommen werden,
 * sind die alten Angaben dann noch vorhanden.
 */
export const DURCHSCHNITTSKAUFPREIS = 250000;

const DEFAULT_CONFIG: ZielplanungConfig = {
  modus: "volumen",
  karrierestufe: "tippgeber",
  durchschnittskaufpreis: DURCHSCHNITTSKAUFPREIS,
  verkaufsvolumen: Array(12).fill(0),
  verkaufsAnzahl: Array(12).fill(0),
  lockedByAdmin: false,
};

/** Load own Zielplanung (for current user) */
export function loadZielplanung(): ZielplanungConfig {
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_CONFIG };
  }
  const saved = getUserSetting<ZielplanungConfig | null>(SETTINGS_KEY, null);
  return saved ? { ...DEFAULT_CONFIG, ...saved } : { ...DEFAULT_CONFIG };
}

/** Save own Zielplanung */
export function saveZielplanung(config: ZielplanungConfig) {
  if (isTestAccount()) {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
    return;
  }
  setUserSetting(SETTINGS_KEY, config);
}

/** Load Zielplanung for a specific VP (admin use) – reads from that user's user_settings row */
export async function loadZielplanungForUser(userId: string): Promise<ZielplanungConfig> {
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem(`${LS_KEY}_${userId}`);
      if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_CONFIG };
  }

  try {
    const { data } = await (supabase as any)
      .from("user_settings")
      .select("einstellungen")
      .eq("user_id", userId)
      .maybeSingle();

    if (data?.einstellungen?.[SETTINGS_KEY]) {
      return { ...DEFAULT_CONFIG, ...data.einstellungen[SETTINGS_KEY] };
    }
  } catch (err) {
    console.error("loadZielplanungForUser:", err);
  }

  return { ...DEFAULT_CONFIG };
}

/** Save Zielplanung for a specific VP (admin use) – writes to that user's user_settings row */
export async function saveZielplanungForUser(userId: string, config: ZielplanungConfig): Promise<void> {
  if (isTestAccount()) {
    localStorage.setItem(`${LS_KEY}_${userId}`, JSON.stringify(config));
    return;
  }

  try {
    // Atomic merge via RPC – prevents race conditions
    const { error } = await supabase.rpc("merge_user_settings" as any, {
      _user_id: userId,
      _patch: { [SETTINGS_KEY]: config },
    });
    if (error) {
      throw error;
    }
  } catch (err) {
    console.error("saveZielplanungForUser:", err);
  }
}

// Abgeleitet aus der kanonischen Stufen-Definition, damit die Saetze je Stufe
// im Frontend nur an einer Stelle stehen.
export const KARRIERESTUFEN = KARRIERE_STUFEN.map((stufe) => ({
  id: stufe.id,
  label: stufe.titel,
  rate: stufe.rate,
}));
