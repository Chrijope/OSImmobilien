/**
 * Eigenfinanzierungs-Modus pro Investment.
 *
 * Speichert in investment.meta.eigenfinanzierung:
 *  - aktiv: boolean
 *  - aktiviertVon / aktiviertAm
 *  - kundenAngebot: vom Kunden hochgeladene Bankzusage (Storage-Pfad)
 *  - kundenDarlehensvertraege: alle unterschriebenen Darlehensverträge
 *  - vpBestaetigt: VP hat die Bankzusage bestätigt → Pipeline → Notar
 *
 * Das Finanzierungsangebot bleibt bei genau einem, am Ende gibt es nur eines.
 * Darlehensverträge können mehrere sein, etwa bei mehreren Darlehen oder einer
 * nachgereichten Fassung.
 *
 * ZWEI SCHREIBWEGE, UND WARUM
 *
 * Der Zustand liegt als JSON in `investments.meta`. Der übliche Weg dorthin
 * ist `merge_investment_meta`, und diese Datenbankfunktion lässt für einen
 * Kunden nur `marktwertHistorie` und `steuerCockpit` durch. Ein Upload des
 * Kunden landete deshalb im Speicher, der Vermerk am Investment aber nie, und
 * zwar ohne Fehlermeldung.
 *
 * Deshalb gehen die Unterlagen des Kunden über die eigene, eng gefasste
 * Funktion `eigenfinanzierung_kunde_unterlage` (Migration 20260921270000).
 * Sie darf ausschließlich das Finanzierungsangebot und die Darlehensverträge
 * anfassen, niemals `aktiv` oder `vpBestaetigt`. Solange die Migration nicht
 * gelaufen ist, fällt der Code auf den alten Weg zurück; für interne Rollen
 * funktioniert der weiterhin, für den Kunden nicht, und die Oberfläche sagt
 * das dann auch.
 *
 * Additive Schicht — bestehende Finanzierungs-Logik bleibt unberührt.
 */
import {
  getInvestmentMeta,
  setInvestmentMeta,
  setInvestmentMetaNurLokal,
  getInvestmentMetaField,
  setInvestmentMetaFields,
} from "./investmentsStore";

export interface EigenfinanzierungAngebot {
  fileName: string;
  storagePath: string;
  uploadedAt: string;
  uploadedByName: string;
  uploadedByRole: string;
  hinweis?: string;
}

export interface EigenfinanzierungBestaetigung {
  datum: string;
  vonName: string;
  vonId?: string;
}

export interface EigenfinanzierungState {
  aktiv: boolean;
  aktiviertVonName?: string;
  aktiviertVonId?: string;
  aktiviertAm?: string;
  aktiviertVonRolle?: string;
  hinweis?: string;
  kundenAngebot?: EigenfinanzierungAngebot;
  gegenAngebot?: EigenfinanzierungAngebot; // CK/Finanzierer-Gegenangebot (Hybrid)
  /**
   * Altfeld, seit 21.09.2026 der zuletzt hochgeladene Darlehensvertrag.
   *
   * Es bleibt bewusst stehen und wird weiter mitgeschrieben. Zwei Gruende:
   * Bestehende Investments tragen ihren einzigen Vertrag nur hier, und in
   * Lovable wird parallel gearbeitet, fremder Code darf also weiter auf das
   * Einzelfeld schauen, ohne einen leeren Platz zu sehen. Massgeblich fuer
   * die Anzeige ist trotzdem `kundenDarlehensvertraege`, gelesen ueber
   * `alleKundenDarlehensvertraege`.
   */
  kundenDarlehensvertrag?: EigenfinanzierungAngebot;
  /** Alle vom Kunden hochgeladenen unterschriebenen Darlehensvertraege. */
  kundenDarlehensvertraege?: EigenfinanzierungAngebot[];
  gegenDarlehensvertrag?: EigenfinanzierungAngebot;  // Gegenangebot more.immo: Darlehensvertrag
  vpBestaetigt?: EigenfinanzierungBestaetigung;
  deaktiviertAm?: string;
  deaktiviertVonName?: string;
}

const KEY = "eigenfinanzierung";
const DEFAULT: EigenfinanzierungState = { aktiv: false };

export function getEigenfinanzierung(investmentId: string): EigenfinanzierungState {
  return getInvestmentMeta<EigenfinanzierungState>(investmentId, KEY, DEFAULT) || DEFAULT;
}

export function setEigenfinanzierung(investmentId: string, next: EigenfinanzierungState) {
  setInvestmentMeta(investmentId, KEY, next);
  try { window.dispatchEvent(new CustomEvent("eigenfinanzierung-updated", { detail: { investmentId } })); } catch {}
}

export function aktiviereEigenfinanzierung(investmentId: string, vonName: string, vonId: string | undefined, rolle: string, hinweis?: string) {
  const next: EigenfinanzierungState = {
    aktiv: true,
    aktiviertVonName: vonName,
    aktiviertVonId: vonId,
    aktiviertVonRolle: rolle,
    aktiviertAm: new Date().toISOString(),
    hinweis: hinweis || undefined,
  };
  setEigenfinanzierung(investmentId, next);
  return next;
}

export function deaktiviereEigenfinanzierung(investmentId: string, vonName: string) {
  const cur = getEigenfinanzierung(investmentId);
  const next: EigenfinanzierungState = {
    ...cur,
    aktiv: false,
    deaktiviertAm: new Date().toISOString(),
    deaktiviertVonName: vonName,
  };
  setEigenfinanzierung(investmentId, next);
}

/**
 * Zeitpunkt festhalten, wenn er noch nicht gesetzt ist.
 *
 * Die Auswertung im Dashboard misst Zeitspannen zwischen diesen Marken. Ein
 * spaeteres Ersetzen des Dokuments darf die Messung nicht zuruecksetzen,
 * deshalb gewinnt immer der erste Zeitpunkt.
 */
function stempelEinmalig(investmentId: string, feld: string) {
  try {
    const vorhanden = getInvestmentMetaField<string>(investmentId, feld, "");
    if (!vorhanden) {
      setInvestmentMetaFields(investmentId, { [feld]: new Date().toISOString() });
    }
  } catch (e) {
    console.warn(`Zeitstempel ${feld} nicht gesetzt`, e);
  }
}

export function setKundenAngebot(investmentId: string, angebot: EigenfinanzierungAngebot) {
  const cur = getEigenfinanzierung(investmentId);
  setEigenfinanzierung(investmentId, { ...cur, kundenAngebot: angebot });
  stempelEinmalig(investmentId, "finanzierungAngebotGesendetAm");
}

export function setGegenAngebot(investmentId: string, angebot: EigenfinanzierungAngebot) {
  const cur = getEigenfinanzierung(investmentId);
  setEigenfinanzierung(investmentId, { ...cur, gegenAngebot: angebot });
  stempelEinmalig(investmentId, "finanzierungAngebotGesendetAm");
}

/**
 * Alle Darlehensvertraege des Kunden, Altbestand eingeschlossen.
 *
 * Gelesen wird zusammengefuehrt statt umgeschrieben: Wer nur das alte
 * Einzelfeld hat, sieht seinen Vertrag weiter, ohne dass irgendwo eine
 * Umstellung laufen muss. Das Einzelfeld wird nur dann zusaetzlich
 * angehaengt, wenn sein Pfad nicht ohnehin schon in der Liste steht. Damit
 * bleibt die Anzeige auch dann richtig, wenn eine aeltere Fassung des Codes
 * parallel nur das Einzelfeld beschreibt.
 */
export function alleKundenDarlehensvertraege(state: EigenfinanzierungState): EigenfinanzierungAngebot[] {
  const liste = Array.isArray(state.kundenDarlehensvertraege) ? [...state.kundenDarlehensvertraege] : [];
  const alt = state.kundenDarlehensvertrag;
  if (alt && !liste.some((v) => v && v.storagePath === alt.storagePath)) liste.push(alt);
  return liste;
}

/**
 * Einen weiteren Darlehensvertrag des Kunden ablegen.
 *
 * Der Kundenordner hat fuer den Darlehensvertrag genau einen Platz. Gespiegelt
 * wird deshalb immer der zuletzt hochgeladene. Alle Vertraege stehen
 * vollstaendig in der Eigenfinanzierung, der Spiegel ist nur die Abkuerzung
 * fuer den Kundenordner.
 */
export function fuegeKundenDarlehensvertragHinzu(investmentId: string, angebot: EigenfinanzierungAngebot) {
  const cur = getEigenfinanzierung(investmentId);
  const liste = [...alleKundenDarlehensvertraege(cur), angebot];
  setEigenfinanzierung(investmentId, {
    ...cur,
    kundenDarlehensvertraege: liste,
    kundenDarlehensvertrag: angebot,
  });
  // Spiegel in den Kundenordner: docFileUrls.Darlehensvertrag + docStatuses.Darlehensvertrag = "signed"
  try {
    const curUrls = getInvestmentMetaField<Record<string, string>>(investmentId, "docFileUrls", {}) || {};
    const curStatuses = getInvestmentMetaField<Record<string, string>>(investmentId, "docStatuses", {}) || {};
    setInvestmentMetaFields(investmentId, {
      docFileUrls: { ...curUrls, Darlehensvertrag: angebot.storagePath },
      docStatuses: { ...curStatuses, Darlehensvertrag: "signed" },
    });
  } catch (e) { console.warn("Kundenordner-Spiegel Darlehensvertrag fehlgeschlagen", e); }
  stempelEinmalig(investmentId, "darlehensvertragUploadedAm");
}

/**
 * Einen Darlehensvertrag des Kunden wieder entfernen.
 *
 * Der Spiegel im Kundenordner wird nur angefasst, wenn er genau auf die
 * entfernte Datei zeigt. Zeigt er auf etwas anderes, stammt er aus der
 * regulaeren Finanzierung, und die darf ein Loeschen hier nicht abraeumen.
 */
export function entferneKundenDarlehensvertrag(investmentId: string, storagePath: string) {
  const cur = getEigenfinanzierung(investmentId);
  const rest = alleKundenDarlehensvertraege(cur).filter((v) => v.storagePath !== storagePath);
  const letzter = rest.length > 0 ? rest[rest.length - 1] : undefined;
  setEigenfinanzierung(investmentId, {
    ...cur,
    kundenDarlehensvertraege: rest,
    kundenDarlehensvertrag: letzter,
  });
  try {
    const curUrls = getInvestmentMetaField<Record<string, string>>(investmentId, "docFileUrls", {}) || {};
    const curStatuses = getInvestmentMetaField<Record<string, string>>(investmentId, "docStatuses", {}) || {};
    if (curUrls.Darlehensvertrag !== storagePath) return;
    const naechsteUrls = { ...curUrls };
    const naechsteStatuses = { ...curStatuses };
    if (letzter) {
      naechsteUrls.Darlehensvertrag = letzter.storagePath;
    } else {
      delete naechsteUrls.Darlehensvertrag;
      delete naechsteStatuses.Darlehensvertrag;
    }
    setInvestmentMetaFields(investmentId, { docFileUrls: naechsteUrls, docStatuses: naechsteStatuses });
  } catch (e) { console.warn("Kundenordner-Spiegel Darlehensvertrag nicht nachgefuehrt", e); }
}

export function setGegenDarlehensvertrag(investmentId: string, angebot: EigenfinanzierungAngebot) {
  const cur = getEigenfinanzierung(investmentId);
  setEigenfinanzierung(investmentId, { ...cur, gegenDarlehensvertrag: angebot });
  stempelEinmalig(investmentId, "darlehensvertragUploadedAm");
}

export function bestaetigeVP(investmentId: string, vonName: string, vonId?: string) {
  const cur = getEigenfinanzierung(investmentId);
  setEigenfinanzierung(investmentId, {
    ...cur,
    vpBestaetigt: { datum: new Date().toISOString(), vonName, vonId },
  });
}
/* ──────────────────────────────────────────────────────────────────────────
 * Unterlagen des Kunden über die eigene Datenbankfunktion
 * ────────────────────────────────────────────────────────────────────────── */

/** Ergebnis eines Schreibversuchs. `fehler` ist bereits deutsch und lesbar. */
export interface UnterlagenErgebnis {
  ok: boolean;
  fehler?: string;
  /** Wahr, wenn die Migration 20260921270000 noch nicht gelaufen ist. */
  migrationFehlt?: boolean;
}

type KundenAktion = "angebot" | "vertrag_hinzufuegen" | "vertrag_entfernen";

/**
 * Erkennt, dass die Datenbankfunktion noch gar nicht existiert.
 *
 * PostgREST meldet das als `PGRST202`, Postgres selbst als `42883`. Beides
 * heißt: Die Migration ist noch nicht gelaufen. Alles andere ist ein echter
 * Fehler und darf nicht stillschweigend auf den alten Weg ausweichen.
 */
function funktionFehlt(fehler: unknown): boolean {
  const code = String((fehler as { code?: string })?.code || "");
  const text = String((fehler as { message?: string })?.message || "");
  return code === "PGRST202" || code === "42883" || /could not find the function|does not exist/i.test(text);
}

/** Übersetzt die Meldungen der Datenbankfunktion in Sätze für die Oberfläche. */
function lesbarerFehler(fehler: unknown): string {
  const text = String((fehler as { message?: string })?.message || "");
  if (/Finanzierungsangebot liegt bereits vor/i.test(text)) {
    return "Es liegt bereits ein Finanzierungsangebot vor. Mehr als eines ist nicht vorgesehen.";
  }
  if (/Eigenfinanzierung nicht aktiv/i.test(text)) {
    return "Für diesen Kauf ist die Eigenfinanzierung nicht eingeschaltet.";
  }
  if (/Darlehensvertrag nicht gefunden/i.test(text)) {
    return "Dieser Darlehensvertrag steht nicht mehr an diesem Kauf.";
  }
  if (/Speicherpfad gehoert nicht/i.test(text)) {
    return "Die Datei gehört nicht zu diesem Kauf.";
  }
  if (/Not allowed/i.test(text)) {
    return "Für diesen Kauf fehlt dir die Berechtigung.";
  }
  return text || "Speichern fehlgeschlagen.";
}

async function ruftKundenUnterlage(
  investmentId: string,
  aktion: KundenAktion,
  datei: Partial<EigenfinanzierungAngebot>,
): Promise<UnterlagenErgebnis> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await (supabase as any).rpc("eigenfinanzierung_kunde_unterlage", {
      _investment_id: investmentId,
      _aktion: aktion,
      _datei: datei,
    });
    if (error) {
      if (funktionFehlt(error)) return { ok: false, migrationFehlt: true, fehler: lesbarerFehler(error) };
      console.error("eigenfinanzierung_kunde_unterlage:", error);
      return { ok: false, fehler: lesbarerFehler(error) };
    }
    /*
     * Die Datenbank hat geschrieben. Hier wird nur noch die Anzeige
     * nachgezogen, ohne einen zweiten Schreibauftrag: Der ginge über
     * `merge_investment_meta`, und die Funktion verwirft für einen Kunden
     * ohnehin alles außer zwei Schlüsseln.
     */
    if (data && typeof data === "object") {
      setInvestmentMetaNurLokal(investmentId, KEY, data as EigenfinanzierungState);
      try { window.dispatchEvent(new CustomEvent("eigenfinanzierung-updated", { detail: { investmentId } })); } catch { /* kein Fenster, etwa im Test */ }
    }
    return { ok: true };
  } catch (e) {
    if (funktionFehlt(e)) return { ok: false, migrationFehlt: true, fehler: lesbarerFehler(e) };
    console.error("eigenfinanzierung_kunde_unterlage:", e);
    return { ok: false, fehler: lesbarerFehler(e) };
  }
}

/**
 * Das Finanzierungsangebot des Kunden ablegen. Genau eines ist erlaubt.
 *
 * `erlaubeRueckfall` gilt für interne Rollen: Solange die Migration noch nicht
 * gelaufen ist, schreiben sie wie bisher über `merge_investment_meta`. Für den
 * Kunden gibt es diesen Rückfall bewusst nicht, dort würde er still ins Leere
 * schreiben und einen Erfolg vortäuschen.
 */
export async function speichereKundenAngebot(
  investmentId: string,
  angebot: EigenfinanzierungAngebot,
  erlaubeRueckfall = false,
): Promise<UnterlagenErgebnis> {
  const ergebnis = await ruftKundenUnterlage(investmentId, "angebot", angebot);
  if (ergebnis.ok) return ergebnis;
  if (ergebnis.migrationFehlt && erlaubeRueckfall) {
    setKundenAngebot(investmentId, angebot);
    return { ok: true };
  }
  return ergebnis;
}

/** Einen weiteren Darlehensvertrag des Kunden anhängen. */
export async function speichereKundenDarlehensvertrag(
  investmentId: string,
  angebot: EigenfinanzierungAngebot,
  erlaubeRueckfall = false,
): Promise<UnterlagenErgebnis> {
  const ergebnis = await ruftKundenUnterlage(investmentId, "vertrag_hinzufuegen", angebot);
  if (ergebnis.ok) return ergebnis;
  if (ergebnis.migrationFehlt && erlaubeRueckfall) {
    fuegeKundenDarlehensvertragHinzu(investmentId, angebot);
    return { ok: true };
  }
  return ergebnis;
}

/** Einen Darlehensvertrag des Kunden wieder entfernen. */
export async function loescheKundenDarlehensvertrag(
  investmentId: string,
  storagePath: string,
  erlaubeRueckfall = false,
): Promise<UnterlagenErgebnis> {
  const ergebnis = await ruftKundenUnterlage(investmentId, "vertrag_entfernen", { storagePath });
  if (ergebnis.ok) return ergebnis;
  if (ergebnis.migrationFehlt && erlaubeRueckfall) {
    entferneKundenDarlehensvertrag(investmentId, storagePath);
    return { ok: true };
  }
  return ergebnis;
}
