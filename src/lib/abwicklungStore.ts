/**
 * Abwicklungsdaten eines Investments: Kaufpreisfälligkeit bis Übergabe.
 *
 * Warum es diese Datei gibt: Diese Angaben lagen bisher in
 * `user_settings.einstellungen` des Nutzers, der sie eingetragen hat. Damit
 * sah niemand sonst sie. Trug das Backoffice die Kaufpreisfälligkeit ein,
 * zeigte die Pipeline dem Vertriebspartner einen Strich, und die vier Haken
 * standen für ihn dauerhaft auf offen. Genau derselbe Fehler war bei den
 * Aufgaben schon einmal behoben worden, hier war er geblieben.
 *
 * Jetzt hängen sie am Investment und sind damit für alle sichtbar, die das
 * Investment sehen dürfen. Es gibt außerdem nur noch diese eine Fassung:
 * Vorher existierte dieselbe Lesefunktion dreimal, in `KundenDetail`, in
 * `Pipeline` und in `Kundenprofilseite`.
 *
 * Altbestand wird bewusst NICHT übernommen. Werte in fremden
 * Nutzereinstellungen sind vom Browser aus ohnehin nicht lesbar, und ein
 * halber Übernahmelauf wäre schlechter als ein klarer Schnitt. Offene Fälle
 * werden einmal neu erfasst.
 */
import { getInvestmentMetaField, setInvestmentMetaNurLokal } from "./investmentsStore";
import { cacheMetaZusammenfuehren, gleicherWert } from "./dataCache";
import { isTestAccount } from "./dbStoreHelper";
import { AktionVerweigert, abwicklungSpeichernMitStand } from "./investmentGepruefteWege";
import { toast } from "@/hooks/use-toast";

export interface AbwicklungDaten {
  kaufpreisfaelligkeitDatum?: string;
  kaufpreisEingegangen?: boolean;
  kaufpreisEingegangenDatum?: string;
  grundbuchDatum?: string;
  grundbuchEingetragen?: boolean;
  provisionsRechnungGestellt?: boolean;
  provisionsRechnungDatum?: string;
  auszahlungDatum?: string;
  auszahlungBestaetigt?: boolean;
  uebergabeDatum?: string;
  anmerkungen?: string;
}

const META_KEY = "abwicklung";

/** Wer die Abwicklungskarte ab dem Notartermin sieht und pflegt. */
export const ABWICKLUNG_ROLLEN: readonly string[] = ["admin", "inhaber", "backoffice", "vertriebspartner"];

/**
 * Kaufpreiseingang, Provisionsrechnung und Auszahlung setzen nur Admin,
 * Inhaber und Backoffice (Christians Entscheidung vom 30.09.2026). Der Partner
 * sieht die Werte, ändert sie aber nicht. Dieselbe Regel prüft
 * `investment_abwicklung_speichern` in der Datenbank.
 */
export const ABWICKLUNG_GELD_ROLLEN: readonly string[] = ["admin", "inhaber", "backoffice"];
/** Hinweis, wenn jemand ohne Freigabe auf „Abrechnung“, „Abgeschlossen“ oder heraus stellen will. */
export const ABSCHLUSS_HINWEIS = "Abrechnung und Abschluss setzen Backoffice und Buchhaltung, nach Provisionsrechnung und Auszahlung.";

/** Stufen, die nur Admin, Inhaber, Backoffice und Buchhaltung setzen oder verlassen. */
export const ABSCHLUSS_STUFEN: readonly string[] = ["abrechnung", "abgeschlossen"];
const BACKOFFICE_STUFEN = ABSCHLUSS_STUFEN;

/**
 * Rollen, die in Kundenprofil und Pipeline nur diese beiden Stufen setzen und
 * dafür die Vorgänge des ganzen Hauses sehen (seit 04.10.2026).
 */
export const ABSCHLUSS_NUR_ROLLEN: readonly string[] = ["backoffice", "buchhaltung"];

/**
 * Wer auf „Abrechnung“ oder „Abgeschlossen“ und wieder heraus stellen darf
 * (Abgeschlossen: Christians Entscheidung vom 29.09.2026, Abrechnung und die
 * Buchhaltung seit 01.10.2026). Die Buchhaltung setzt nur die Stufe, die
 * Geldfelder der Abwicklungskarte bleiben bei ABWICKLUNG_GELD_ROLLEN.
 * Dieselbe Regel prüft der Trigger trg_absicherung_pipeline_abschluss.
 */
export const ABSCHLUSS_STUFE_ROLLEN: readonly string[] = [...ABWICKLUNG_GELD_ROLLEN, "buchhaltung"];

export function darfAbschlussStufeWechseln(rolle: string, von: string | null | undefined, nach: string): boolean {
  if (von === nach) return true;
  if (!BACKOFFICE_STUFEN.includes(von || "") && !BACKOFFICE_STUFEN.includes(nach)) return true;
  return ABSCHLUSS_STUFE_ROLLEN.includes(rolle);
}

export const ABWICKLUNG_GELD_FELDER = [
  "kaufpreisEingegangen", "kaufpreisEingegangenDatum",
  "provisionsRechnungGestellt", "provisionsRechnungDatum",
  "auszahlungBestaetigt", "auszahlungDatum",
] as const;

export function getAbwicklungDaten(investmentId: string): AbwicklungDaten {
  if (!investmentId) return {};
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem(`mi_abwicklung_${investmentId}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  return getInvestmentMetaField<AbwicklungDaten>(investmentId, META_KEY, {}) || {};
}

/**
 * Der Datensatz samt den fünf flach gespiegelten Feldern, die das
 * Kundenportal direkt aus dem Meta liest. Früher liefen das zwei getrennte
 * Schreibvorgänge auf dasselbe meta-Objekt, die sich gegenseitig überholen
 * konnten.
 */
function abwicklungFelder(daten: AbwicklungDaten): Record<string, unknown> {
  return {
    [META_KEY]: daten,
    kaufpreisfaelligkeitDatum: daten.kaufpreisfaelligkeitDatum,
    grundbuchDatum: daten.grundbuchDatum,
    kaufpreisEingegangen: daten.kaufpreisEingegangen,
    kaufpreisEingegangenDatum: daten.kaufpreisEingegangenDatum,
    grundbuchEingetragen: daten.grundbuchEingetragen,
  };
}

const SPEICHER_VERZOEGERUNG_MS = 300;
const wartend = new Map<string, { daten: AbwicklungDaten; timer: ReturnType<typeof setTimeout> }>();
const laufend = new Map<string, Promise<boolean>>();

/**
 * Schickt den letzten Stand eines Investments an die Datenbank. Je
 * Investment läuft immer nur ein Aufruf, der nächste wartet auf ihn, damit
 * ein älterer Stand einen neueren nie überholt.
 */
function senden(investmentId: string): Promise<boolean> {
  const eintrag = wartend.get(investmentId);
  if (!eintrag) return laufend.get(investmentId) ?? Promise.resolve(true);
  wartend.delete(investmentId);
  const lauf = (laufend.get(investmentId) ?? Promise.resolve(true)).then(async () => {
    try {
      const gesendet = eintrag.daten as Record<string, unknown>;
      const { weg, meta } = await abwicklungSpeichernMitStand(investmentId, gesendet);
      // Ohne Migration der alte Weg, abgewartet (Prüfung Codex).
      const dbMeta = weg === "alterWeg"
        ? await cacheMetaZusammenfuehren("investments", investmentId, abwicklungFelder(eintrag.daten), { silent: true })
        : meta;
      // Verglichen wird mit der Rückgabe der Datenbank, nicht mit dem schon
      // sofort angezeigten Stand: Die Funktion verwirft Geldfelder ohne Recht still.
      const gespeichert = (dbMeta?.[META_KEY] && typeof dbMeta[META_KEY] === "object" ? dbMeta[META_KEY] : null) as Record<string, unknown> | null;
      const nichtUebernommen = Object.entries(gesendet)
        .filter(([k, v]) => v !== undefined && !gleicherWert(v, gespeichert?.[k]))
        .map(([k]) => k);
      if (!gespeichert || nichtUebernommen.length > 0) {
        if (gespeichert) {
          for (const [schluessel, wert] of Object.entries(abwicklungFelder(gespeichert as AbwicklungDaten))) {
            setInvestmentMetaNurLokal(investmentId, schluessel, wert);
          }
        }
        toast({
          title: "Teilweise gespeichert",
          description: gespeichert
            ? `Nicht übernommen: ${nichtUebernommen.join(", ")}. Diese Felder setzen Admin, Inhaber und Backoffice.`
            : "Die Datenbank hat keinen Stand zurückgegeben. Bitte lade die Seite neu und prüfe die Abwicklung.",
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch (fehler) {
      console.error("Abwicklung speichern fehlgeschlagen:", fehler);
      toast({
        title: "Abwicklung nicht gespeichert",
        description: fehler instanceof AktionVerweigert ? fehler.message : "Bitte erneut versuchen.",
        variant: "destructive",
      });
      return false;
    }
  });
  laufend.set(investmentId, lauf);
  return lauf;
}

/**
 * Speichert die Abwicklung über `investment_abwicklung_speichern` (seit
 * 30.09.2026). Kaufpreiseingang, Provisionsrechnung und Auszahlung setzen nur
 * Admin, Inhaber und Backoffice; die übrigen Felder auch der zuständige
 * Partner ab dem Notartermin. Das prüft jetzt die Datenbank. Die Anzeige zieht sofort nach, geschrieben wird kurz
 * verzögert, damit das Anmerkungsfeld nicht je Tastendruck einen Aufruf
 * auslöst. Ohne die Migration läuft der alte Weg.
 */
export function saveAbwicklungDaten(investmentId: string, daten: AbwicklungDaten) {
  if (!investmentId) return;
  if (isTestAccount()) {
    localStorage.setItem(`mi_abwicklung_${investmentId}`, JSON.stringify(daten));
    return;
  }
  for (const [schluessel, wert] of Object.entries(abwicklungFelder(daten))) {
    setInvestmentMetaNurLokal(investmentId, schluessel, wert);
  }
  const vorher = wartend.get(investmentId);
  if (vorher) clearTimeout(vorher.timer);
  wartend.set(investmentId, {
    daten,
    timer: setTimeout(() => { void senden(investmentId); }, SPEICHER_VERZOEGERUNG_MS),
  });
}

/** Schickt einen wartenden Stand sofort und wartet auf das Ergebnis: `true`, wenn gespeichert. */
export function abwicklungGespeichert(investmentId: string): Promise<boolean> {
  const eintrag = wartend.get(investmentId);
  if (eintrag) clearTimeout(eintrag.timer);
  return senden(investmentId);
}

/**
 * Liest die Abwicklungsdaten direkt aus einer bereits geladenen Investment-Zeile.
 *
 * Die Pipeline hat alle Investments ohnehin im Speicher und würde sonst je
 * Zeile einen Einzelzugriff machen.
 */
export function abwicklungAusMeta(meta: Record<string, any> | null | undefined): AbwicklungDaten {
  return (meta?.[META_KEY] as AbwicklungDaten) || {};
}
