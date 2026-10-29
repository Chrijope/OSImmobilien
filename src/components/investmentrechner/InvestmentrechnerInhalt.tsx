import { useLiveVersion } from "@/hooks/useLiveData";
import { automatischeObjektwerte, automatischeUnterlagenwerte, ergaenzeUnterlagen, leseObjektUnterlagen, type ObjektUnterlagenQuelle } from "@/lib/investmentrechner/objektUnterlagen";
import { vorbelegungAusInvestment } from "@/lib/investmentrechner/investmentVorbelegung";
import { stellplatzmieteTrennen } from "@/lib/investmentrechner/objektVorbelegung";
import type { FormatSprache } from "@/lib/sprachFormat";
import { RechnerSpracheContext } from "./RechnerSprache";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SetStateAction } from "react";
import { useMaskeBisUnten } from "./useMaskeBisUnten";
import { createPortal } from "react-dom";
import {
  Banknote,
  Building2,
  Calculator,
  ChartColumn,
  Check,
  CopyPlus,
  FileDown,
  FileSearch,
  ArrowRight,
  FileText,
  Languages,
  ImagePlus,
  Landmark,
  ReceiptText,
  RotateCcw,
  Save,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { abfrageDialog, auswahlDialog, confirmDialog } from "@/lib/confirm";
import { entwurfLaden, entwurfLoeschen, entwurfSpeichern } from "@/lib/investmentrechner/entwurfAblage";
// Im CRM rollt der Inhaltskasten, nicht das Fenster. Siehe lib/rollen.ts.
import { rolleSeiteNachOben } from "@/lib/rollen";
import { getCurrentUserId } from "@/lib/currentUser";
import { getInvestmentById, getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { investmentBezugZurEinheit, vorwahlFuerEinheit } from "@/lib/investmentAuswahl";
import {
  aktualisiereBerechnung,
  berechnungsnameVorschlag,
  kennzahlenAus,
  speichereBerechnung,
  BERECHNUNGEN_MIGRATION_HINWEIS,
  type InvestmentBerechnung,
} from "@/lib/investmentBerechnungenStore";
import { aufEigenSetzen, ohneAutomatik, setzeHerkunft, type Herkunft, type Herkunftseintrag } from "@/lib/investmentrechner/herkunft";
import { kundenschritt, kundenUebernahmeFuer, selbstauskunftAus, type Kundenschritt } from "@/lib/investmentrechner/kundenUebernahme";
import {
  berechneInvestment,
  mitRuecklagenVorgabe,
  standardEingabe,
  type InvestmentEingabe,
  type InvestmentErgebnis,
  type TextFeld,
  type ZahlenFeld,
} from "@/lib/investmentrechner/rechenkern";
import { GEMEINSAME_FELDER, objektMarke } from "@/lib/investmentrechner/objektvergleich";
import {
  saetzeFuerBundesland,
  standardKaufnebenkostenauswahl,
  type Kaufnebenkostenauswahl,
} from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import {
  erkenneKategorie,
  leereUnterlagenDaten,
  pdfTextAuslesen,
  unterlagenAuslesen,
  unterlagenDatenAus,
  type UnterlagenDaten,
  type UnterlagenDokument,
} from "@/lib/investmentrechner/unterlagenAuslesen";
import {
  enthaeltKnkSaetze,
  abgleichListe,
  automatikZeilen,
  kiHinweise,
  uebernahmeAnwenden,
  type AuslesbaresFeld,
} from "@/lib/investmentrechner/unterlagenKiFelder";
import { felderAusUnterlagenAuslesen, UnterlagenKiFehler } from "@/lib/investmentrechner/unterlagenKiAufruf";
import { ladeRechnerBilder, MAX_RECHNER_BILDER } from "@/lib/investmentrechner/rechnerBilder";
import { Bereichsknopf, FeldetikettKontext, Neu, VorschauKontext } from "@/components/investmentrechner/Felder";
import { AmpelKontext, type AmpelEinstellung } from "@/components/investmentrechner/Auswertungen";
import { bankunterlagenAusSa, bankunterlagenZusammenfuehren, hatManuelleBankunterlagen } from "@/lib/investmentrechner/bankunterlagen";
import {
  AMPEL_CONFIG_SCHLUESSEL,
  AMPEL_SCHWELLEN,
  darfAmpelSchwellenBearbeiten,
  schwellenAusConfig,
  schwellenFuerConfig,
} from "@/lib/investmentrechner/ampel";
import { getAppConfig, setAppConfig } from "@/lib/appConfigStore";
import { useOptionalUser } from "@/contexts/UserContext";
import { formatStand, loadKundenkontext } from "@/lib/kundenkontextHelper";
import { KundeUndInvestment, type KundenwahlKunde } from "@/components/investmentrechner/KundeUndInvestment";
import type { KiAuslesung } from "@/components/investmentrechner/UnterlagenUebernahme";
import {
  EingabeBankunterlagen,
  EingabeErtrag,
  EingabeExpose,
  EingabeFinanzierung,
  EingabeKunde,
  EingabeObjekt,
  EingabeSteuer,
  EingabeUnterlagen,
  UnterlagenUpload,
} from "@/components/investmentrechner/Eingabebereiche";
import { ExposeVorschau } from "@/components/investmentrechner/ExposeVorschau";
import { useKundenSprache } from "@/lib/kundenSprache";
import { ObjektHinzufuegen, Objektleiste } from "@/components/investmentrechner/Objektvergleich";
import { EingabeAusfuehrlich, EingabeAusgangslage } from "@/components/investmentrechner/EingabeAusfuehrlich";
// Fest eingebunden: In der Ein-Datei-Fassung (Artefakt) scheitert das Nachladen an `__VITE_PRELOAD__`.
import { erzeugeBerechnungsansichtPdf } from "@/lib/investmentrechner/berechnungAnsichtPdf";
import { EinhauserAnalyse, KundenObjektvergleichDokument } from "@/components/investmentrechner/kundenvergleich/KundenObjektvergleichDokument";
import { ausfuehrlichVorgaben, berechnungAusRechner, type AusfuehrlichAngaben } from "@/lib/investmentrechner/ausfuehrlicheBerechnung";
import { vergleichDateiname, type VergleichKunde } from "@/lib/investmentrechner/kundenObjektvergleich";
import { kundeAus } from "@/lib/investmentrechner/kundenObjektvergleichVorbelegung";
import { getKontaktById } from "@/lib/kundenStore";
import { getObjekte } from "@/lib/objekteStore";
import "@/styles/investmentrechner.css";

/*
 * Investmentrechner: Kopie der Web-App „OS Immobilien Investmentrechner" im CRM.
 * Aufbau, Felder, Texte und Berechnungen entsprechen dem Original, nur
 * Farben, Schrift und Logo folgen dem CI des CRM. Die Topbar des Originals
 * ist hier der PageHeader mit denselben Aktionen. Alles ist lokaler
 * React-Zustand, es wird nichts gespeichert oder hochgeladen.
 *
 * Seit dem Objektvergleich hält die Seite bis zu zwei vollständige Objekte.
 * Welche Felder dabei für beide Objekte gelten, steht in GEMEINSAME_FELDER in
 * src/lib/investmentrechner/objektvergleich.ts.
 */

type Eingabebereich = "kunde" | "objekt" | "unterlagen" | "finanzierung" | "ertrag" | "steuer" | "ausfuehrlich" | "expose" | "bankunterlagen";

/** Bankgespräch und Bankunterlagen, seit dem 29.10.2026 ausgeblendet (Christian); siehe `bankModus`. */
const BANKUNTERLAGEN_SICHTBAR = false;

/** Der Hinweis, wenn etwas in der lokalen Vorschau ohne Datenbank nicht geht. */
export const VORSCHAU_NICHT_VERFUEGBAR = "In der Vorschau nicht verfügbar";
/** `ausfuehrlich`: die zwölfseitige Berechnung für den Kunden, seit dem 22.10.2026 auch im CRM. */
/*
 * Seit dem 29.10.2026 nur noch Analyse und ausführliche Berechnung (Christian):
 * „Berechnung“ mit ihren drei Deckblättern und „Vergleich“ sind entfernt.
 */
type Ansicht = "analyse" | "ausfuehrlich";

/** Klasse am body, solange die Seite offen ist. Nur dann greifen die Druckregeln. */
const DRUCK_KLASSE = "investmentrechner-druck";

/** Mehr als zwei Objekte sind bewusst nicht vorgesehen. */
const MAX_OBJEKTE = 2;

/** Ein Objekt mit allem, was nur zu ihm gehört. */
interface Objektzustand {
  eingabe: InvestmentEingabe;
  photos: string[];
  documents: UnterlagenDokument[];
  documentData: UnterlagenDaten;
  /**
   * Weg zu den Kaufnebenkosten und gewähltes Bundesland. Gehört bewusst zum
   * einzelnen Objekt und nicht in GEMEINSAME_FELDER: im Vergleich können zwei
   * Wohnungen in verschiedenen Bundesländern liegen.
   */
  knk: Kaufnebenkostenauswahl;
  /**
   * Woher die einzelnen Werte stammen. Gehört zum Objekt und nicht zur Seite,
   * weil im Vergleich zwei Wohnungen verschiedene Unterlagen haben. Die Felder
   * des Kunden stehen in GEMEINSAME_FELDER und werden deshalb ohnehin in
   * beiden Objekten gleich gesetzt.
   */
  herkunft: Herkunft;
  /**
   * Ein über „Objekt hinzufügen“ angelegtes Vergleichsobjekt, nicht die
   * Einheit, mit der der Rechner gestartet ist. Nur deren Berechnung geht an
   * den OS Lotsen (`onErgebnis`, Befund LOTSE-R3-002).
   */
  vergleich?: boolean;
}

/**
 * Die Berechnung des eigenen Objekts, nie die eines Vergleichsobjekts. Ist das
 * eigene Objekt entfernt worden, gibt es keine, und der zuletzt gemeldete
 * Stand bleibt gültig.
 */
export function eigeneBerechnung<E, R>(
  objekte: ReadonlyArray<{ eingabe: E; vergleich?: boolean }>,
  ergebnisse: readonly R[],
): { eingabe: E; ergebnis: R } | null {
  const index = objekte.findIndex((o) => !o.vergleich);
  return index >= 0 && ergebnisse[index] !== undefined ? { eingabe: objekte[index].eingabe, ergebnis: ergebnisse[index] } : null;
}

const leeresObjekt: Objektzustand = {
  eingabe: standardEingabe,
  photos: [],
  documents: [],
  documentData: leereUnterlagenDaten,
  knk: standardKaufnebenkostenauswahl,
  herkunft: {},
};

/**
 * Womit ein Objekt startet: leer wie bisher, oder mit den Zahlen aus einer
 * Einheit. Fotos und Unterlagen bleiben in beiden Fällen leer, sie liegen im
 * Rechner nur im Arbeitsspeicher. Die Fotos aus der Objektanlage müssen erst
 * geladen werden und kommen deshalb danach, siehe `startBilderKey`.
 *
 * Bewusst eine eigene Funktion und kein Ausdruck im useState: So lässt sich im
 * Test nachweisen, dass die Seite in der Seitenleiste ohne Vorbelegung
 * unverändert auf `standardEingabe` startet.
 */
export function startZustand(vorbelegung?: Rechnervorbelegung): Objektzustand {
  if (!vorbelegung) return leeresObjekt;
  return {
    ...leeresObjekt,
    eingabe: vorbelegung.eingabe,
    knk: vorbelegung.knk,
    documentData: vorbelegung.unterlagen ?? leereUnterlagenDaten,
    herkunft: vorbelegung.herkunft ?? {},
  };
}

/**
 * Vorgaben, die aus anderen Feldern folgen, nach jeder Änderung: die
 * Rücklage im Hausgeld aus der Wohnfläche, solange sie keine Herkunft hat
 * (siehe `mitRuecklagenVorgabe`). Unveränderte Objekte bleiben dieselben.
 */
export function mitVorgaben<T extends { eingabe: InvestmentEingabe; herkunft: Herkunft }>(objekte: T[]): T[] {
  let geaendert = false;
  const neu = objekte.map((objekt) => {
    const eingabe = mitRuecklagenVorgabe(objekt.eingabe, !!objekt.herkunft.monthlyReserveContribution);
    if (eingabe === objekt.eingabe) return objekt;
    geaendert = true;
    return { ...objekt, eingabe };
  });
  return geaendert ? neu : objekte;
}

/**
 * Eine Änderung auf die Objekte verteilen: Felder aus GEMEINSAME_FELDER gehen
 * an alle Objekte, alles andere nur an das gerade gewählte.
 */
function verteileAenderung(
  objekte: Objektzustand[],
  aktivIndex: number,
  aenderung: Partial<InvestmentEingabe>,
): Objektzustand[] {
  const gemeinsam: Partial<InvestmentEingabe> = {};
  const eigen: Partial<InvestmentEingabe> = {};
  for (const feld of Object.keys(aenderung) as (keyof InvestmentEingabe)[]) {
    Object.assign(GEMEINSAME_FELDER.includes(feld) ? gemeinsam : eigen, { [feld]: aenderung[feld] });
  }
  return objekte.map((objekt, index) => {
    const geaendert = [
      ...(Object.keys(gemeinsam) as (keyof InvestmentEingabe)[]),
      ...(index === aktivIndex ? (Object.keys(eigen) as (keyof InvestmentEingabe)[]) : []),
    ];
    return {
      ...objekt,
      eingabe: { ...objekt.eingabe, ...gemeinsam, ...(index === aktivIndex ? eigen : {}) },
      // Von Hand geändert heißt: der Herkunftshinweis unter dem Feld geht weg.
      herkunft: aufEigenSetzen(objekt.herkunft, geaendert),
    };
  });
}

/** Ein einzelnes Feld setzen, gemeinsame Felder erreichen dabei beide Objekte. */
function setzeFeld(objekte: Objektzustand[], aktivIndex: number, feld: keyof InvestmentEingabe, wert: unknown) {
  const fuerAlle = GEMEINSAME_FELDER.includes(feld);
  return objekte.map((objekt, index) =>
    fuerAlle || index === aktivIndex
      ? {
          ...objekt,
          eingabe: { ...objekt.eingabe, [feld]: wert },
          herkunft: aufEigenSetzen(objekt.herkunft, [feld]),
        }
      : objekt,
  );
}

/**
 * Werte aus einer fremden Quelle übernehmen: die Zahlen setzen und zugleich
 * vermerken, woher sie kommen. Bewusst getrennt von `verteileAenderung`, denn
 * dort gilt das Gegenteil: Wer selbst tippt, löscht die Herkunft.
 */
function uebernimmFelder(
  objekte: Objektzustand[],
  aktivIndex: number,
  aenderung: Partial<InvestmentEingabe>,
  eintrag: Herkunftseintrag,
): Objektzustand[] {
  const gemeinsam: Partial<InvestmentEingabe> = {};
  const eigen: Partial<InvestmentEingabe> = {};
  for (const feld of Object.keys(aenderung) as (keyof InvestmentEingabe)[]) {
    Object.assign(GEMEINSAME_FELDER.includes(feld) ? gemeinsam : eigen, { [feld]: aenderung[feld] });
  }
  return objekte.map((objekt, index) => {
    const gesetzt = [
      ...(Object.keys(gemeinsam) as (keyof InvestmentEingabe)[]),
      ...(index === aktivIndex ? (Object.keys(eigen) as (keyof InvestmentEingabe)[]) : []),
    ];
    return {
      ...objekt,
      eingabe: { ...objekt.eingabe, ...gemeinsam, ...(index === aktivIndex ? eigen : {}) },
      herkunft: setzeHerkunft(objekt.herkunft, gesetzt, eintrag),
    };
  });
}

/** Startwerte für den Rechner, siehe `objektVorbelegung.ts`. */
export interface Rechnervorbelegung {
  quellen?: ObjektUnterlagenQuelle;
  eingabe: InvestmentEingabe;
  knk: Kaufnebenkostenauswahl;
  /** Energieausweis, Rücklage und Sanierungen aus der Objektanlage. */
  unterlagen?: UnterlagenDaten;
  /** Woher die vorbelegten Werte stammen, für die Zeile unter dem Feld. */
  herkunft?: Herkunft;
  /**
   * Adressen der Fotos aus der Objektanlage, siehe `rechnerBilder.ts`. Bis zu
   * sechs davon landen im Bereich „Bilder", solange dort noch nichts liegt.
   */
  bilder?: string[];
}

/**
 * Womit der Rechner an Kunde und Investment anknüpft.
 *
 * Alles freiwillig: Ohne diese Angaben verhält sich der Rechner genau wie
 * vorher, er kann dann nur nichts speichern.
 */
export interface Rechnerstart {
  kundeId?: string | null;
  kundeName?: string;
  investmentId?: string | null;
  /** Eine gespeicherte Berechnung, die geladen weitergeführt wird. */
  berechnung?: InvestmentBerechnung | null;
}

export interface InvestmentrechnerInhaltProps {
  /**
   * Zahlen, mit denen der Rechner startet. Ohne Angabe startet er leer, genau
   * wie die Seite `/investmentrechner` in der Seitenleiste es immer getan hat.
   */
  vorbelegung?: Rechnervorbelegung;
  /**
   * Eigene Überschrift mit dem blauen Balken. Auf der Seite in der
   * Seitenleiste ja, im Reiter der Einheitenseite nein: dort trägt die Seite
   * schon eine Überschrift, und zwei davon untereinander lesen sich falsch.
   * Die Aktionen bleiben in beiden Fällen dieselben.
   */
  mitUeberschrift?: boolean;
  /** Kunde, Investment und gegebenenfalls die geladene Berechnung. */
  start?: Rechnerstart;
  /**
   * Meldet Eingabe und Ergebnis des eigenen Objekts (nicht eines
   * Vergleichsobjekts) nach jeder Änderung nach oben. Der OS Lotse auf der
   * Einheitenseite zitiert damit dieselben Zahlen (seit dem 28.09.2026).
   * `kundenbezogen`: ein Kunde ist gewählt oder Zahlen aus seiner
   * Selbstauskunft sind übernommen. Dann nimmt der Lotse diese Rechnung nicht.
   */
  onErgebnis?: (stand: { eingabe: InvestmentEingabe; ergebnis: InvestmentErgebnis; kundenbezogen: boolean }) => void;
  /**
   * Ist der Rechner gerade zu sehen? Auf der Einheitenseite bleibt er beim
   * Reiterwechsel eingehängt, damit nichts verloren geht. Die Druckklasse am
   * `body` gilt nur, solange er sichtbar ist, sonst druckten die anderen
   * Reiter ein leeres Blatt. Ohne Angabe: sichtbar.
   */
  sichtbar?: boolean;
  /**
   * Mit eingeschaltetem Schalter „Bankgespräch & Bankunterlagen“ starten.
   * Seit dem 11.10.2026 ersetzt der Schalter die eigene Seite
   * „Investmentkalkulation Plus“; deren alte Adresse leitet mit diesem
   * Start hierher. Eine geladene Berechnung bringt ihren Schalter selbst mit.
   */
  bankgespraechStart?: boolean;
  /**
   * Lokale Vorschau ohne Anmeldung und ohne Datenbank, seit dem 11.10.2026
   * (/vorschau/investmentrechner, nur im Entwicklungsmodus). Speichern und
   * KI melden dann „In der Vorschau nicht verfügbar“, alles Neue trägt das
   * Etikett „NEU“. `selbstauskunft` ist die Selbstauskunft eines
   * verbundenen Beispielkunden, `stand` ihr Stand (ein neuer Stand zeigt den
   * Ablauf „Neu aus Selbstauskunft laden“).
   */
  vorschau?: { selbstauskunft?: unknown; stand?: string };
  /**
   * Feste Sprache der rechten Seite und der PDFs, seit dem 22.10.2026; ohne Angabe die Kundensprache oder die sichtbare Wahl.
   * Die eigenständige Artefaktfassung hat keinen Kunden und lässt sie wählen;
   * ohne Angabe gilt wie bisher die Sprache des gewählten Kunden.
   */
  dokumentSprache?: FormatSprache;
  /** Name auf dem Titelblatt der ausführlichen Berechnung („Erstellt von …“). */
  erstelltVon?: string;
  /**
   * „Zurücksetzen“ leert alles statt auf die Vorbelegung zurückzugehen, seit
   * dem 23.10.2026. Für die Artefaktfassung, deren Vorbelegung nur
   * Beispielzahlen fürs erste Öffnen sind. Ohne Angabe: zurück auf die
   * Vorbelegung, auf der Einheitenseite also auf die Daten der Einheit.
   */
  leerZuruecksetzen?: boolean;
  /**
   * Kundenangaben der Seite „Ihre Ausgangslage“ von Hand, im Bereich „Kunde &
   * Einkommen“. Für die Artefaktfassung ohne Selbstauskunft, seit dem 29.10.2026.
   */
  kundeVonHand?: boolean;
  /** Ohne „Am Investment speichern“, für die Artefaktfassung (29.10.2026). */
  ohneSpeichern?: boolean;
}

/**
 * Unter welchem Schlüssel der Entwurf im Browser liegt (siehe
 * entwurfAblage.ts): je geladener Berechnung, je Einheit, je Investment oder
 * Kunde aus dem Aufruf, sonst einer für den freien Rechner.
 */
export function entwurfKontext(vorbelegung: Rechnervorbelegung | undefined, start: Rechnerstart | undefined): string {
  if (start?.berechnung) return `berechnung:${start.berechnung.id}`;
  if (vorbelegung?.quellen) return `einheit:${vorbelegung.quellen.wohnungId ?? vorbelegung.quellen.objektId}`;
  if (start?.investmentId) return `investment:${start.investmentId}`;
  if (start?.kundeId) return `kunde:${start.kundeId}`;
  return "frei";
}

export function InvestmentrechnerInhalt({
  vorbelegung,
  mitUeberschrift = true,
  start,
  onErgebnis,
  sichtbar = true,
  bankgespraechStart = false,
  vorschau,
  dokumentSprache,
  erstelltVon = "",
  leerZuruecksetzen = false,
  kundeVonHand = false,
  ohneSpeichern = false,
}: InvestmentrechnerInhaltProps = {}) {
  // Die fixierte Eingabemaske reicht bis zum Fensterrand, siehe useMaskeBisUnten.
  const maskeRef = useRef<HTMLElement>(null);
  useMaskeBisUnten(maskeRef);
  /*
    Autospeichern, seit dem 23.10.2026: Ein Entwurf aus diesem Browser hat
    Vorrang vor der Vorbelegung, denn er ist der zuletzt gesehene Stand.
    „Zurücksetzen“ löscht ihn.
  */
  const kontext = entwurfKontext(vorbelegung, start);
  const [entwurf] = useState(() => entwurfLaden(kontext));
  const [objekte, setObjekteRoh] = useState<Objektzustand[]>(() => {
    if (entwurf) return mitVorgaben(entwurf.objekte.map((o) => ({ ...leeresObjekt, ...o })));
    const mitSchalter = (liste: Objektzustand[]) =>
      bankgespraechStart && !start?.berechnung
        ? liste.map((o) => ({ ...o, eingabe: { ...o.eingabe, bankgespraechAktiv: true } }))
        : liste;
    return mitVorgaben(mitSchalter(startObjekte()));
  });
  // Jede Änderung läuft durch die Vorgaben, auch die aus Unterlagen, Objektdaten und Selbstauskunft.
  const setObjekte = useCallback(
    (neu: SetStateAction<Objektzustand[]>) =>
      setObjekteRoh((bisher) => mitVorgaben(typeof neu === "function" ? neu(bisher) : neu)),
    [],
  );
  function startObjekte(): Objektzustand[] {
    if (start?.berechnung) {
      // Ein Stand von vor dem 22.10.2026 hat die Stellplatzmiete noch in der Kaltmiete; getrennt wird nur, was die Einheit belegt.
      const getrennt = stellplatzmieteTrennen(
        start.berechnung.eingabe,
        start.berechnung.herkunft ?? {},
        vorbelegung ?? vorbelegungAusInvestment(start.berechnung.investment_id),
      );
      return [
        startZustand({
          eingabe: getrennt.eingabe,
          knk: start.berechnung.knk,
          unterlagen: start.berechnung.unterlagen ?? undefined,
          herkunft: getrennt.herkunft,
        }),
      ];
    }
    const zustand = startZustand(vorbelegung);
    // Ein von außen mitgegebener Kunde steht sofort im Feld „Kundenname“. Das
    // ist keine übernommene Zahl, sondern die Beschriftung der Berechnung,
    // deshalb bekommt es keinen Herkunftshinweis.
    if (!start?.kundeName) return [zustand];
    return [{ ...zustand, eingabe: { ...zustand.eingabe, clientName: start.kundeName } }];
  }
  const [aktivIndex, setAktivIndex] = useState(entwurf?.aktivIndex ?? 0);
  /* ── Kunde, Investment und die gespeicherte Berechnung ── */
  const [kundeId, setKundeId] = useState<string | null>(
    entwurf ? entwurf.kundeId : start?.berechnung?.kontakt_id ?? start?.kundeId ?? null,
  );
  const [investmentId, setInvestmentId] = useState<string | null>(
    entwurf ? entwurf.investmentId : start?.berechnung?.investment_id ?? start?.investmentId ?? null,
  );
  const [berechnungId, setBerechnungId] = useState<string | null>(entwurf ? entwurf.berechnungId : start?.berechnung?.id ?? null);
  const [berechnungName, setBerechnungName] = useState(entwurf ? entwurf.berechnungName : start?.berechnung?.name ?? "");
  /**
   * Was im Kundenbereich gerade zu sagen ist: erst das Investment wählen,
   * dann entweder die Rückfrage zur Selbstauskunft oder der Hinweis, dass
   * keine vorliegt.
   */
  const [schritt, setSchritt] = useState<Kundenschritt>({ art: "still" });
  const [speichertGerade, setSpeichertGerade] = useState(false);
  /** Ruhiger Hinweis, wenn das Speichern nicht ging. Kein Browser-Dialog. */
  const [speicherhinweis, setSpeicherhinweis] = useState("");
  const [bereich, setBereich] = useState<Eingabebereich>("kunde");
  const [ansicht, setAnsicht] = useState<Ansicht>("analyse");
  const [isReading, setIsReading] = useState(false);
  /**
   * Stand der KI-Auslesung, gebunden an das Objekt, für das sie lief. Beim
   * Wechsel auf ein anderes Objekt ist sie nicht sichtbar, die Vorschläge
   * gehören ja zu dessen Unterlagen.
   */
  const [automatischeAntwort, setAutomatischeAntwort] = useState<import("@/lib/investmentrechner/unterlagenKiFelder").KiAntwort | null>(null);
  const [quellenStatus, setQuellenStatus] = useState<{ laedt: boolean; hinweise: string[]; fertig: boolean }>({ laedt: false, hinweise: [], fertig: false });
  const [quellenVersuch, setQuellenVersuch] = useState(0);
  // Aus dem Entwurf: von Hand geänderte Unterlagenangaben bleiben nach dem Neuladen geschützt.
  const unterlagenManuell = useRef(entwurf?.unterlagenManuell ?? false);
  const automatischeAnfrage = useRef<{ key: string; promise: ReturnType<typeof leseObjektUnterlagen> } | null>(null);
  useLiveVersion(["objekte", "wohnungen", "objekt_dokumente", "wohnungs_dokumente"]);
  const aktuelleVorbelegung = vorbelegung ?? vorbelegungAusInvestment(investmentId);
  const quellen = aktuelleVorbelegung?.quellen;
  /** Die Einheit, wenn der Rechner auf einer Einheitenseite steht. */
  const einheit = vorbelegung?.quellen
    ? { objektId: vorbelegung.quellen.objektId, wohnungId: vorbelegung.quellen.wohnungId }
    : null;
  const objektDatenKey = JSON.stringify(aktuelleVorbelegung ?? null);
  const quellenKey = JSON.stringify(quellen ?? null);
  /*
   * Das Ergebnis der manuellen Auslesung. Gespeichert wird die Antwort, die
   * Liste entsteht immer aus dem aktuellen Stand des Zielobjekts
   * (`kiAnzeige`), nicht aus dem Stand vor dem Warten (LOTSE-R5-006).
   */
  const [kiAuslesung, setKiAuslesung] = useState<(KiAuslesung & { objektIndex: number; antwort?: import("@/lib/investmentrechner/unterlagenKiFelder").KiAntwort }) | null>(null);
  /*
   * Fotos aus der Objektanlage für den Bereich „Bilder".
   *
   * Sie kommen nur in einen leeren Bereich und nur, solange niemand dort
   * etwas getan hat. Wer ein Bild hinzufügt, verschiebt oder entfernt, hat
   * die Auswahl übernommen, und eine später eintreffende Vorbelegung bleibt
   * draußen. „Auf Objektdaten zurücksetzen" holt sie wieder herein.
   */
  const startBilderKey = (vorbelegung?.bilder ?? []).join("\n");
  const bilderAnfrage = useRef<{ key: string; promise: Promise<string[]> } | null>(null);
  const fotosAngefasst = useRef(false);
  const fotosVorbelegt = useRef(false);
  const [bilderVersuch, setBilderVersuch] = useState(0);
  const [fotoStand, setFotoStand] = useState<"still" | "laedt" | "vorbelegt" | "fehlgeschlagen">("still");

  const ergebnisse = useMemo(() => objekte.map((objekt) => berechneInvestment(objekt.eingabe)), [objekte]);
  /*
   * Die Übernahmeliste des automatischen Wegs beim Öffnen (seit dem
   * 28.09.2026). Dieselbe Abgleichslogik und dieselbe Anzeige wie beim
   * manuellen Auslesen: automatisch Übernommenes mit „Zurücknehmen“,
   * Bestätigtes als Bestätigung, Abweichungen nicht ausgewählt.
   */
  const [autoListeZu, setAutoListeZu] = useState(false);
  /* Das eigene Objekt, erkannt an der Kennung, nicht an der Position (LOTSE-R5-004). */
  const eigenerIndex = objekte.findIndex((objekt) => !objekt.vergleich);
  const autoAuslesung = useMemo<KiAuslesung | null>(() => {
    const eigenes = objekte.find((objekt) => !objekt.vergleich);
    if (autoListeZu || !eigenes) return null;
    /*
     * Automatisch Übernommenes steht immer da, aus der Herkunft, auch in einer
     * geladenen Berechnung ohne neue Auslesung (LOTSE-R6-004). Die Antwort
     * der Auslesung ergänzt Bestätigungen und Abweichungen.
     */
    const ausAntwort = automatischeAntwort ? abgleichListe(automatischeAntwort, eigenes.eingabe, eigenes.herkunft) : [];
    const vorschlaege = [
      ...ausAntwort,
      ...automatikZeilen(eigenes.eingabe, eigenes.herkunft).filter((z) => !ausAntwort.some((v) => v.feld === z.feld)),
    ];
    return vorschlaege.length ? { status: "fertig", vorschlaege, hinweise: [], fehler: "", uebernommen: 0 } : null;
  }, [automatischeAntwort, autoListeZu, objekte]);
  const kiAnzeige = useMemo(() => {
    const ziel = kiAuslesung ? objekte[kiAuslesung.objektIndex] : undefined;
    if (!kiAuslesung?.antwort || kiAuslesung.status !== "fertig" || !ziel) return kiAuslesung;
    return { ...kiAuslesung, vorschlaege: abgleichListe(kiAuslesung.antwort, ziel.eingabe, ziel.herkunft) };
  }, [kiAuslesung, objekte]);
  const sicherIndex = Math.min(aktivIndex, objekte.length - 1);
  const aktiv = objekte[sicherIndex];
  const { eingabe: input, photos, documents, documentData } = aktiv;
  const result = ergebnisse[sicherIndex];
  const vergleichAktiv = objekte.length > 1;

  const eigene = eigeneBerechnung(objekte, ergebnisse);
  /*
   * Klebrig (REVIEW-001): Nach „Kunden entfernen“ stehen Eigenkapital, Anteil
   * und Finanzierung des Kunden noch da. Einmal kundenbezogen, bleibt die
   * Rechnung es, bis sie ganz auf die Vorbelegung zurückgesetzt wird
   * (`neuStarten`) oder die Einheit wechselt (neue Instanz).
   */
  const kundeBeruehrt = useRef(false);
  if (kundeId || Object.values(objekte.find((o) => !o.vergleich)?.herkunft ?? {}).some((h) => h?.quelle === "selbstauskunft")) {
    kundeBeruehrt.current = true;
  }
  const kundenbezogen = kundeBeruehrt.current;
  useEffect(() => {
    if (eigene) onErgebnis?.({ ...eigene, kundenbezogen });
    // Nur bei neuer Eingabe, neuem Ergebnis oder anderem Kundenbezug des eigenen Objekts melden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eigene?.eingabe, eigene?.ergebnis, kundenbezogen, onErgebnis]);

  useEffect(() => {
    if (!sichtbar) return;
    document.body.classList.add(DRUCK_KLASSE);
    return () => document.body.classList.remove(DRUCK_KLASSE);
  }, [sichtbar]);

  useEffect(() => {
    if (start?.berechnung) return;
    const vor = JSON.parse(objektDatenKey) as Rechnervorbelegung | null;
    if (!vor) return;
    setObjekte(bisher => bisher.map((o, index) => {
      if (index !== 0) return o;
      const eingabe = { ...o.eingabe };
      const herkunft = { ...o.herkunft };
      for (const [feld, quelle] of Object.entries(vor.herkunft ?? {})) {
        const f = feld as keyof InvestmentEingabe;
        if (herkunft[f]?.quelle === "eigen" || herkunft[f]?.quelle === "selbstauskunft") continue;
        Object.assign(eingabe, { [f]: vor.eingabe[f] }); herkunft[f] = quelle;
      }
      return { ...o, eingabe, herkunft, documentData: unterlagenManuell.current ? o.documentData : ergaenzeUnterlagen(vor.unterlagen ?? leereUnterlagenDaten, o.documentData) };
    }));
  }, [objektDatenKey, start?.berechnung]);

  useEffect(() => {
    const quelle = JSON.parse(quellenKey) as ObjektUnterlagenQuelle | null;
    setAutomatischeAntwort(null);
    if (!quelle) { setQuellenStatus({ laedt: false, hinweise: [], fertig: false }); return; }
    let aktiv = true;
    setQuellenStatus({ laedt: true, hinweise: [], fertig: false });
    const key = `${quellenKey}:${quellenVersuch}`;
    if (automatischeAnfrage.current?.key !== key) {
      automatischeAnfrage.current = { key, promise: leseObjektUnterlagen(quelle) };
    }
    void automatischeAnfrage.current.promise.then(({ documents, antwort }) => {
      if (!aktiv) return;
      setObjekte(bisher => bisher.map((objekt) => {
        // Nur das eigene Objekt, nie ein Vergleichsobjekt.
        if (objekt.vergleich) return objekt;
        // Gespeicherte Varianten sind Momentaufnahmen. Ihre Werte bleiben erhalten.
        const geschuetzt = start?.berechnung
          ? Object.fromEntries(Object.keys(standardEingabe).map(f => [f, { quelle: "eigen", text: "" }])) as Herkunft
          : objekt.herkunft;
        const werte = automatischeObjektwerte(antwort, objekt.eingabe, geschuetzt);
        const unterlagen = automatischeUnterlagenwerte(antwort, objekt.documentData);
        return {
          ...objekt,
          documents: [...documents, ...objekt.documents.filter(d => !documents.some(n => n.id === d.id))],
          eingabe: { ...objekt.eingabe, ...werte.aenderung },
          herkunft: { ...objekt.herkunft, ...werte.herkunft },
          documentData: unterlagenManuell.current || start?.berechnung ? objekt.documentData : unterlagen.daten,
          knk: enthaeltKnkSaetze(werte.aenderung) ? { ...objekt.knk, weg: "manuell" } : objekt.knk,
        };
      }));
      setAutomatischeAntwort(antwort);
      setAutoListeZu(false);
      setQuellenStatus({ laedt: false, hinweise: antwort.hinweise, fertig: true });
    }).catch(e => {
      if (aktiv) setQuellenStatus({ laedt: false, hinweise: [e instanceof Error ? e.message : "Objektunterlagen konnten nicht geladen werden."], fertig: true });
    });
    return () => { aktiv = false; };
  }, [quellenKey, quellenVersuch, start?.berechnung]);

  useEffect(() => {
    const adressen = startBilderKey ? startBilderKey.split("\n") : [];
    if (adressen.length === 0 || fotosAngefasst.current || fotosVorbelegt.current) return;
    // Eine Anfrage je Bildauswahl. Im StrictMode läuft der Effekt doppelt,
    // und „Auf Objektdaten zurücksetzen" soll nicht alles neu herunterladen.
    if (bilderAnfrage.current?.key !== startBilderKey) {
      bilderAnfrage.current = { key: startBilderKey, promise: ladeRechnerBilder(adressen) };
    }
    let aktiv = true;
    setFotoStand("laedt");
    bilderAnfrage.current.promise
      .then((bilder) => {
        if (!aktiv) return;
        if (fotosAngefasst.current) {
          setFotoStand("still");
          return;
        }
        if (bilder.length === 0) {
          setFotoStand("fehlgeschlagen");
          return;
        }
        fotosVorbelegt.current = true;
        // Nur das erste Objekt ist diese Einheit, und nur ein leerer Bereich
        // wird gefüllt. So entstehen keine Dubletten neben eigenen Bildern.
        setObjekte((bisher) =>
          bisher.map((objekt, index) =>
            index === 0 && objekt.photos.length === 0 ? { ...objekt, photos: bilder.slice(0, MAX_RECHNER_BILDER) } : objekt,
          ),
        );
        setFotoStand("vorbelegt");
      })
      .catch(() => {
        if (aktiv) setFotoStand("fehlgeschlagen");
      });
    return () => {
      aktiv = false;
    };
  }, [startBilderKey, bilderVersuch]);

  useEffect(() => {
    if (start?.berechnung || !kundeId || !investmentId) return;
    setSchritt(kundenschritt(investmentId, getInvestmentsByKontakt(kundeId).length, kundenUebernahmeFuer(kundeId, investmentId)));
  }, [kundeId, investmentId, start?.berechnung]);

  // Nach jeder Änderung in den Browser schreiben. Bilder nur, wenn sie sich geändert haben.
  const letzteBilder = useRef<string[][]>([]);
  useEffect(() => {
    const fotos = objekte.map((o) => o.photos);
    const mitBildern = fotos.length !== letzteBilder.current.length || fotos.some((f, i) => f !== letzteBilder.current[i]);
    letzteBilder.current = fotos;
    entwurfSpeichern(
      kontext,
      {
        objekte: objekte.map(({ eingabe, knk, herkunft, documentData, photos: bilder, vergleich }) => ({
          eingabe, knk, herkunft, documentData, photos: bilder, ...(vergleich ? { vergleich } : {}),
        })),
        kundeId,
        investmentId,
        berechnungId,
        berechnungName,
        aktivIndex: sicherIndex,
        unterlagenManuell: unterlagenManuell.current,
      },
      mitBildern,
    );
  }, [objekte, kundeId, investmentId, berechnungId, berechnungName, sicherIndex, kontext]);

  const setzeZahl = (feld: ZahlenFeld, wert: number) => {
    setObjekte((bisher) => setzeFeld(bisher, sicherIndex, feld, wert));
  };
  const setzeText = (feld: TextFeld, wert: string) => {
    setObjekte((bisher) => setzeFeld(bisher, sicherIndex, feld, wert));
  };
  const aendere = (aenderung: Partial<InvestmentEingabe>) => {
    setObjekte((bisher) => verteileAenderung(bisher, sicherIndex, aenderung));
  };

  /**
   * Weg oder Bundesland der Kaufnebenkosten setzen.
   *
   * Beim Weg über das Bundesland werden Grunderwerbsteuer, Notar und Grundbuch
   * aus der Auswahl in die Eingabe geschrieben. Ohne gewähltes Land und beim
   * Wechsel auf die eigene Eingabe bleiben die zuletzt gesetzten Sätze stehen,
   * sie dienen dann als Startwert.
   */
  const setzeKnk = (auswahl: Kaufnebenkostenauswahl) => {
    setObjekte((bisher) =>
      bisher.map((objekt, index) => {
        if (index !== sicherIndex) return objekt;
        const saetze = auswahl.weg === "bundesland" ? saetzeFuerBundesland(auswahl.bundesland) : null;
        return {
          ...objekt,
          knk: auswahl,
          eingabe: saetze ? { ...objekt.eingabe, ...saetze } : objekt.eingabe,
          herkunft: aufEigenSetzen(objekt.herkunft, ["transferTaxRate", "notaryRate", "landRegisterRate"]),
        };
      }),
    );
  };

  /** Nur das gewählte Objekt verändern, etwa Fotos oder Unterlagen. */
  const setzeAktivesObjekt = (aenderung: (objekt: Objektzustand) => Objektzustand) => {
    setObjekte((bisher) => bisher.map((objekt, index) => (index === sicherIndex ? aenderung(objekt) : objekt)));
  };

  const neuStarten = () => {
    // Zurück auf den Anfang, also auf einer Einheitenseite zurück auf die
    // Zahlen der Einheit, sonst auf ein leeres Formular für eine neue Berechnung.
    entwurfLoeschen(kontext);
    unterlagenManuell.current = false;
    setAutomatischeAntwort(null);
    setQuellenVersuch(v => v + 1);
    // Zurück auf die Objektdaten heißt auch: zurück auf deren Fotos.
    fotosAngefasst.current = false;
    fotosVorbelegt.current = false;
    setFotoStand("still");
    setBilderVersuch(v => v + 1);
    setObjekte([startZustand(leerZuruecksetzen ? undefined : vorbelegung)]);
    setKundeId(start?.kundeId ?? null);
    setInvestmentId(start?.investmentId ?? null);
    setBerechnungId(null);
    setBerechnungName("");
    setSchritt({ art: "still" });
    setSpeicherhinweis("");
    // Ganz zurück: nur ein vom Aufruf mitgegebener Kunde hält den Kundenbezug.
    kundeBeruehrt.current = !!start?.kundeId;
    setAktivIndex(0);
    setBereich("kunde");
    setAnsicht("analyse");
  };

  /** Knopf „Zurücksetzen“ oben rechts, mit kurzer Rückfrage im Stil des Projekts. */
  const zuruecksetzen = async () => {
    const ja = await confirmDialog({
      title: "Berechnung zurücksetzen?",
      description: vorbelegung && !leerZuruecksetzen
        ? "Alle Eingaben gehen zurück auf die Objektdaten. Am Investment gespeicherte Berechnungen bleiben erhalten."
        : "Alle Eingaben werden geleert, für eine neue Berechnung. Am Investment gespeicherte Berechnungen bleiben erhalten.",
      confirmText: "Zurücksetzen",
      cancelText: "Abbrechen",
      variant: "destructive",
    });
    if (ja) neuStarten();
  };

  const objektHinzufuegen = () => {
    setObjekte((bisher) => {
      if (bisher.length >= MAX_OBJEKTE) return bisher;
      const vorlage = bisher[Math.min(aktivIndex, bisher.length - 1)];
      const marke = objektMarke(bisher.length);
      return [
        ...bisher,
        {
          ...vorlage,
          // Kopie des aktiven Objekts, damit nur die Unterschiede einzutragen
          // sind. Der Titel bekommt einen erkennbaren Zusatz, solange keine
          // eigene Bezeichnung eingetragen wird.
          eingabe: {
            ...vorlage.eingabe,
            propertyTitle: vorlage.eingabe.propertyTitle ? `${vorlage.eingabe.propertyTitle} (${marke})` : "",
          },
          photos: [...vorlage.photos],
          documents: [...vorlage.documents],
          // Im Vergleichsobjekt gelten die Werte als übernommen, nicht als automatisch gesetzt.
          herkunft: ohneAutomatik(vorlage.herkunft),
          vergleich: true,
        },
      ];
    });
    setAktivIndex(objekte.length);
  };

  const objektEntfernen = (index: number) => {
    if (objekte.length <= 1) return;
    setObjekte((bisher) => bisher.filter((_, i) => i !== index));
    // Nach dem Entfernen bleibt genau ein Objekt übrig, es wird das aktive.
    setAktivIndex(0);
  };

  /**
   * Nimmt Bilder auf, aus dem Dateidialog wie aus dem Ziehen ins Feld.
   *
   * Beide Wege landen hier, damit sie sich gleich verhalten. Was nicht
   * hineinpasst, wird gemeldet: Beim Ziehen greift man schnell den ganzen
   * Ordner, und ein PDF oder das siebte Bild würde sonst stillschweigend
   * verschwinden.
   */
  const fotosAufnehmen = (dateien: File[]) => {
    const bilder = dateien.filter((datei) => datei.type.startsWith("image/"));
    if (bilder.length > 0) fotosAngefasst.current = true;
    const platz = Math.max(0, 6 - photos.length);
    bilder.slice(0, platz).forEach((datei) => {
      const leser = new FileReader();
      leser.onload = () => {
        if (typeof leser.result === "string") {
          const bild = leser.result;
          setzeAktivesObjekt((objekt) => ({ ...objekt, photos: [...objekt.photos, bild].slice(0, 6) }));
        }
      };
      leser.readAsDataURL(datei);
    });
    if (bilder.length < dateien.length) {
      toast({
        title: "Nur Bilder",
        description: "Die Berechnung nimmt hier Fotos auf. Unterlagen gehören in den Bereich „Objektunterlagen“.",
      });
    } else if (bilder.length > platz) {
      toast({
        title: platz === 0 ? "Sechs Bilder sind das Maximum" : `Es war noch Platz für ${platz}`,
        description: "Die Berechnung zeigt bis zu sechs Objektfotos. Entferne eines, um ein anderes aufzunehmen.",
      });
    }
  };

  const fotosHochladen = (event: ChangeEvent<HTMLInputElement>) => {
    fotosAufnehmen(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  /**
   * Schiebt ein Bild an eine andere Stelle.
   *
   * Verschieben, nicht tauschen: Wer das dritte Bild nach vorne zieht, will es
   * als Titelbild und erwartet, dass die anderen nachrücken. Ein Tausch würde
   * das bisherige Titelbild an die dritte Stelle werfen.
   */
  const fotosUmsortieren = (von: number, nach: number) => {
    fotosAngefasst.current = true;
    setzeAktivesObjekt((objekt) => {
      if (von === nach || von < 0 || nach < 0 || von >= objekt.photos.length || nach >= objekt.photos.length) {
        return objekt;
      }
      const sortiert = [...objekt.photos];
      const [bild] = sortiert.splice(von, 1);
      sortiert.splice(nach, 0, bild);
      return { ...objekt, photos: sortiert };
    });
  };

  const unterlagenHochladen = async (event: ChangeEvent<HTMLInputElement>) => {
    const dateien = Array.from(event.target.files ?? []).slice(0, Math.max(0, 12 - documents.length));
    event.target.value = "";
    if (dateien.length === 0) return;
    const neue: UnterlagenDokument[] = dateien.map((datei, index) => ({
      id: `${Date.now()}-${index}-${datei.name}`,
      name: datei.name,
      category: "Wird erkannt",
      pages: 0,
      status: "reading",
      detail: "Text wird lokal ausgelesen …",
      text: "",
    }));
    setzeAktivesObjekt((objekt) => ({ ...objekt, documents: [...objekt.documents, ...neue] }));
    setIsReading(true);
    const fertig: UnterlagenDokument[] = [];
    for (let index = 0; index < dateien.length; index += 1) {
      const datei = dateien[index];
      const eintrag = neue[index];
      try {
        if (datei.size > 25 * 1024 * 1024) throw Error("Die Datei ist größer als 25 MB");
        const gelesen =
          datei.type === "application/pdf" || datei.name.toLowerCase().endsWith(".pdf")
            ? await pdfTextAuslesen(datei)
            : await datei.text().then((text) => ({ text, pages: 1, seiten: [text] }));
        const lesbar = gelesen.text.trim().length >= 80;
        fertig.push({
          ...eintrag,
          category: erkenneKategorie(datei.name, gelesen.text),
          pages: gelesen.pages,
          status: lesbar ? "done" : "manual",
          detail: lesbar
            ? `${gelesen.pages} Seite${gelesen.pages === 1 ? "" : "n"} ausgewertet`
            : "Kein auslesbarer Text, die KI-Auslesung liest die PDF direkt",
          text: gelesen.text,
          seiten: gelesen.seiten,
          // Die Datei bleibt im Arbeitsspeicher, damit die KI-Auslesung einen
          // Scan ohne Textebene als PDF mitschicken kann.
          datei,
        });
      } catch (fehler) {
        fertig.push({
          ...eintrag,
          category: "Objektunterlage",
          status: "error",
          detail: fehler instanceof Error ? fehler.message : "Dokument konnte nicht gelesen werden",
          text: "",
        });
      }
      const aktuell = fertig[fertig.length - 1];
      setzeAktivesObjekt((objekt) => ({
        ...objekt,
        documents: objekt.documents.map((dokument) => (dokument.id === aktuell.id ? aktuell : dokument)),
      }));
    }
    const auslesung = unterlagenAuslesen(
      [...documents, ...fertig]
        .map((dokument) => dokument.text)
        .filter(Boolean)
        .join("\n"),
    );
    setzeAktivesObjekt((objekt) => ({ ...objekt, documentData: ergaenzeUnterlagen(objekt.documentData, unterlagenDatenAus(auslesung)) }));
    setIsReading(false);
  };

  const unterlageEntfernen = (id: string) => {
    setzeAktivesObjekt((objekt) => {
      const rest = objekt.documents.filter((dokument) => dokument.id !== id);
      const auslesung = unterlagenAuslesen(
        rest
          .map((dokument) => dokument.text)
          .filter(Boolean)
          .join("\n"),
      );
      return { ...objekt, documents: rest, documentData: ergaenzeUnterlagen(objekt.documentData, unterlagenDatenAus(auslesung)) };
    });
  };

  /** Die Rechnerfelder per KI aus den Unterlagen des aktiven Objekts holen. */
  const felderAuslesen = async () => {
    if (vorschau) {
      toast({ title: VORSCHAU_NICHT_VERFUEGBAR, description: "Die KI-Auslesung braucht die Datenbank und eine Anmeldung." });
      return;
    }
    const objektIndex = sicherIndex;
    setKiAuslesung({ objektIndex, status: "laedt", vorschlaege: [], hinweise: [], fehler: "", uebernommen: 0 });
    try {
      const antwort = await felderAusUnterlagenAuslesen(documents, sicherIndex === 0 ? quellen : undefined);
      setObjekte(bisher => bisher.map((o, i) => i === objektIndex ? { ...o, documentData: automatischeUnterlagenwerte(antwort, o.documentData).daten } : o));
      setKiAuslesung({
        objektIndex,
        status: "fertig",
        antwort,
        vorschlaege: [],
        hinweise: kiHinweise(antwort),
        fehler: "",
        uebernommen: 0,
      });
    } catch (fehler) {
      const meldung =
        fehler instanceof UnterlagenKiFehler
          ? fehler.message
          : "Die Unterlagen konnten nicht ausgelesen werden. Bitte später erneut versuchen.";
      setKiAuslesung({ objektIndex, status: "fehler", vorschlaege: [], hinweise: [], fehler: meldung, uebernommen: 0 });
    }
  };

  /** Die angehakten Vorschläge in die Eingabe schreiben. Nur die, nichts sonst. */
  const felderUebernehmen = (felder: Set<AuslesbaresFeld>) => {
    // Aus der manuellen Liste, sonst aus der des automatischen Wegs (nur das eigene Objekt).
    const manuell = kiAnzeige && kiAnzeige.objektIndex === sicherIndex ? kiAnzeige : null;
    const liste = manuell ?? (sicherIndex === eigenerIndex ? autoAuslesung : null);
    if (!liste) return;
    /*
     * Beide Listen entstehen aus dem aktuellen Stand. Übernommen wird nur, was
     * dort noch zur Auswahl steht: nichts Unverändertes und nichts, was schon
     * automatisch gesetzt ist.
     */
    const waehlbar = liste.vorschlaege.filter((vorschlag) => !vorschlag.unveraendert && !vorschlag.automatisch);
    felder = new Set([...felder].filter((feld) => waehlbar.some((vorschlag) => vorschlag.feld === feld)));
    const aenderung = uebernahmeAnwenden(waehlbar, felder);
    const anzahl = Object.keys(aenderung).length;
    if (anzahl === 0) return;
    // Je Feld die Quelle, die die KI genannt hat, etwa „Preisliste.pdf, Seite 2".
    // Sie steht künftig unter dem Feld und nicht mehr nur in dieser Liste.
    setObjekte((bisher) => {
      let naechste = bisher;
      for (const vorschlag of waehlbar) {
        if (!felder.has(vorschlag.feld)) continue;
        naechste = uebernimmFelder(naechste, sicherIndex, { [vorschlag.feld]: vorschlag.wert }, {
          quelle: "unterlagen",
          text: vorschlag.quelle ? `Aus ${vorschlag.quelle}` : "Aus den Objektunterlagen",
        });
      }
      return naechste;
    });
    // Ein ausgelesener Grunderwerbsteuer-, Notar- oder Grundbuchsatz wäre
    // beim Weg über das Bundesland nicht sichtbar und würde beim nächsten
    // Landwechsel überschrieben. Deshalb wechselt der Rechner auf die
    // manuelle Eingabe, dort bleiben die übernommenen Sätze stehen.
    if (enthaeltKnkSaetze(aenderung)) setzeKnk({ ...aktiv.knk, weg: "manuell" });
    if (manuell && kiAuslesung) setKiAuslesung({ ...kiAuslesung, status: "uebernommen", uebernommen: anzahl });
  };

  /**
   * Einen beim Öffnen automatisch übernommenen Wert zurücknehmen: der Wert
   * davor kommt zurück, und das Feld gilt ab jetzt als bewusst entschieden
   * („eigen“). Die Liste zeigt den Wert aus der Unterlage dann als nicht
   * ausgewählte Abweichung.
   */
  const zuruecknehmen = (feld: AuslesbaresFeld) => {
    setObjekte((bisher) => bisher.map((o) => {
      const eintrag = o.herkunft[feld];
      // Nur am eigenen Objekt, an das die Liste gebunden ist, nie an einem Vergleichsobjekt.
      if (o.vergleich || !eintrag?.automatisch) return o;
      return {
        ...o,
        eingabe: { ...o.eingabe, [feld]: eintrag.vorher ?? standardEingabe[feld] },
        herkunft: { ...o.herkunft, [feld]: { quelle: "eigen", text: "" } },
      };
    }));
  };

  /* ── Kunde wählen und die Zahlen aus seiner Selbstauskunft übernehmen ── */

  /** Werte aus einer fremden Quelle setzen und die Herkunft dazu vermerken. */
  const uebernimm = (aenderung: Partial<InvestmentEingabe>, eintrag: Herkunftseintrag) => {
    if (Object.keys(aenderung).length === 0) return;
    setObjekte((bisher) => uebernimmFelder(bisher, sicherIndex, aenderung, eintrag));
  };

  /**
   * Den nächsten Schritt bestimmen, sobald Kunde oder Investment wechseln.
   *
   * Die Frage nach der Übernahme gibt es erst mit gewähltem Investment und
   * nur, wenn dazu wirklich eine Selbstauskunft vorliegt. Eine Selbstauskunft
   * gehört zu einem Investment, ohne dieses wüsste der Rechner nicht, welche
   * er meint.
   */
  const schrittBestimmen = (kunde: string, investment: string | null, anzahlInvestments: number) => {
    const vorschlag = investment ? kundenUebernahmeFuer(kunde, investment) : null;
    setSchritt(kundenschritt(investment, anzahlInvestments, vorschlag));
  };

  const kundeWaehlen = (kunde: KundenwahlKunde | null) => {
    setSchritt({ art: "still" });
    setSpeicherhinweis("");
    if (kunde?.id !== kundeId) {
      setObjekte(bisher => bisher.map(o => {
        const eingabe = { ...o.eingabe };
        const herkunft = { ...o.herkunft };
        for (const f of ["annualGrossIncome", "taxableIncomeCustomer", "taxableIncomeSpouse", "taxClass", "jointAssessment"] as const) {
          Object.assign(eingabe, { [f]: standardEingabe[f] }); delete herkunft[f];
        }
        return { ...o, eingabe, herkunft };
      }));
    }
    if (!kunde) {
      setKundeId(null);
      setInvestmentId(null);
      setBerechnungId(null);
      setBerechnungName("");
      return;
    }
    setKundeId(kunde.id);
    setzeText("clientName", kunde.name);
    // Eine andere Person heißt: Die geladene Berechnung gehört nicht mehr
    // hierher. Sie wird nicht überschrieben, es entsteht beim Speichern eine
    // neue am neuen Investment.
    setBerechnungId(null);
    setBerechnungName("");
    // Hat der Kunde genau ein Investment, ist die Wahl eindeutig und wird
    // gleich getroffen. Sonst wählt er selbst, und bis dahin wird nicht
    // gefragt.
    // Auf der Einheitenseite zählen Investments dieser Wohnung und solche
    // ohne Objekt. Die einer anderen Einheit bleiben gesperrt, siehe
    // `investmentBezugZurEinheit`.
    const investments = getInvestmentsByKontakt(kunde.id).filter(i => investmentBezugZurEinheit(i, einheit) !== "andereEinheit");
    const eines = einheit ? vorwahlFuerEinheit(investments, einheit) : investments.length === 1 ? investments[0].id : null;
    if (!vorbelegung?.quellen && eines) {
      const vor = vorbelegungAusInvestment(eines);
      if (vor) setObjekte([{ ...startZustand(vor), eingabe: { ...vor.eingabe, clientName: kunde.name } }]);
    }
    setInvestmentId(eines);
    schrittBestimmen(kunde.id, eines, investments.length);
  };

  const uebernahmeAnnehmen = () => {
    if (schritt.art !== "frage") return;
    const uebernahme = schritt.uebernahme;
    uebernimm(uebernahme.aenderung, uebernahme.hinweis);
    setSchritt({ art: "still" });
    toast({
      title: "Zahlen übernommen",
      description: "Unter jedem Feld steht jetzt, woher der Wert kommt. Wer ihn ändert, lässt den Hinweis verschwinden.",
    });
  };

  /*
   * Haushaltsrechnung und Vermögensaufstellung aus der Selbstauskunft des
   * gewählten Investments, seit dem 11.10.2026. Dieselbe Quelle wie die
   * Übernahme von Einkommen und Steuerklasse (`selbstauskunftAus`).
   *
   * Mit verbundenem Kunden und eingeschaltetem Schalter füllt der Rechner sie
   * selbst, ohne Klick. Ist der Kunde, das Investment oder der Stand der
   * Selbstauskunft ein anderer als bei der letzten Übernahme
   * (`bankunterlagenStand`), steht „Neu aus Selbstauskunft laden“ bereit; von
   * Hand geänderte Werte werden nur nach Rückfrage überschrieben, nie automatisch.
   */
  const saVersion = useLiveVersion(["investments", "kontakte"]);
  const saQuelle = useMemo(() => {
    if (vorschau?.selbstauskunft) {
      return {
        sa: vorschau.selbstauskunft,
        herkunft: "Aus der Selbstauskunft (Beispielkunde der Vorschau)",
        stand: `vorschau|${vorschau.stand ?? "1"}`,
      };
    }
    if (!kundeId || !investmentId) return null;
    const sa = selbstauskunftAus(kundeId, investmentId);
    if (!sa) return null;
    const datum = loadKundenkontext(kundeId, investmentId)?.saDatum;
    const stand = formatStand(datum);
    return {
      sa,
      herkunft: stand ? `Aus der Selbstauskunft vom ${stand}` : "Aus der Selbstauskunft",
      stand: `${kundeId}|${investmentId}|${datum ?? ""}`,
    };
    // saVersion: neu lesen, sobald Investments oder Kontakte im Zwischenspeicher wechseln.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorschau?.selbstauskunft, vorschau?.stand, kundeId, investmentId, saVersion]);

  const bankunterlagenLaden = async (automatisch: boolean) => {
    if (!saQuelle) {
      toast({ title: "Erst Kunde und Investment wählen", description: "Die Selbstauskunft gehört zum Investment, im Bereich „Kunde & Einkommen“." });
      return;
    }
    const neu = bankunterlagenAusSa(saQuelle.sa, saQuelle.herkunft);
    if (!neu) {
      if (!automatisch) toast({ title: "Nichts zu übernehmen", description: "Die Selbstauskunft dieses Investments enthält keine Einkünfte, Ausgaben oder Vermögenswerte." });
      return;
    }
    const bisher = { haushalt: input.haushalt, vermoegen: input.vermoegen };
    let ueberschreiben = true;
    if (hatManuelleBankunterlagen(bisher)) {
      if (automatisch) return;
      const wahl = await auswahlDialog({
        title: "Von Hand geänderte Werte überschreiben?",
        description: "Einige Posten sind von Hand eingetragen oder geändert. Sie können stehen bleiben, oder die Selbstauskunft ersetzt alles.",
        optionen: [
          { wert: "behalten", text: "Handwerte behalten" },
          { wert: "ueberschreiben", text: "Alles aus der Selbstauskunft" },
        ],
      });
      if (!wahl) return;
      ueberschreiben = wahl === "ueberschreiben";
    }
    aendere({ ...bankunterlagenZusammenfuehren(bisher, neu, ueberschreiben), bankunterlagenStand: saQuelle.stand });
    toast({
      title: automatisch ? "Aus der Selbstauskunft vorbefüllt" : "Aus der Selbstauskunft übernommen",
      description: "Haushalt und Vermögen tragen das Etikett „Kunden-SA“. Wer einen Betrag ändert, macht ihn zum Handwert.",
    });
  };

  /*
   * Bankgespräch und Bankunterlagen sind seit dem 29.10.2026 ausgeblendet
   * (Christian), im CRM wie auf der Einheitenseite. Die gespeicherten Werte
   * bleiben in der Eingabe; `true` hier holt Schalter und Bereich zurück.
   */
  const bankModus = BANKUNTERLAGEN_SICHTBAR && input.bankgespraechAktiv === true;
  const saNeuerStand = !!saQuelle && saQuelle.stand !== input.bankunterlagenStand;
  useEffect(() => {
    if (!bankModus || !saNeuerStand) return;
    if (hatManuelleBankunterlagen({ haushalt: input.haushalt, vermoegen: input.vermoegen })) return;
    void bankunterlagenLaden(true);
    // Nur bei neuem Stand der Quelle oder beim Einschalten, nicht bei jeder Eingabe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankModus, saQuelle?.stand, input.bankunterlagenStand]);

  /* ── Ampel-Schwellen aus der Admin-Konfiguration ── */
  const benutzer = useOptionalUser();
  const configVersion = useLiveVersion(["app_config"]);
  const [vorschauSchwellen, setVorschauSchwellen] = useState<AmpelEinstellung["schwellen"] | null>(null);
  const ampelEinstellung = useMemo<AmpelEinstellung>(
    () =>
      vorschau
        ? {
            schwellen: vorschauSchwellen ?? AMPEL_SCHWELLEN,
            darfBearbeiten: true,
            hinweis: "Vorschau: Die Schwellen gelten nur in diesem Fenster. Im CRM speichern Admin und Inhaber sie unternehmensweit.",
            speichern: async (neu) => {
              setVorschauSchwellen(neu);
              toast({ title: "Nur lokal gespeichert", description: "In der Vorschau gibt es keine Datenbank. Die Schwellen gelten bis zum Neuladen." });
              return true;
            },
          }
        : {
            schwellen: schwellenAusConfig(getAppConfig(AMPEL_CONFIG_SCHLUESSEL, null)),
            darfBearbeiten: darfAmpelSchwellenBearbeiten(benutzer?.user?.role),
            speichern: async (neu) => {
              const ok = await setAppConfig(AMPEL_CONFIG_SCHLUESSEL, schwellenFuerConfig(neu));
              if (ok) toast({ title: "Ampel-Schwellen gespeichert", description: "Sie gelten ab sofort für alle Berechnungen." });
              return ok;
            },
          },
    // configVersion: neu lesen, wenn app_config sich ändert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vorschau, vorschauSchwellen, benutzer?.user?.role, configVersion],
  );

  /* ── Am Investment speichern ── */

  const investment = investmentId ? getInvestmentById(investmentId) : undefined;

  const speichere = async (alsNeue: boolean) => {
    if (vorschau) {
      toast({ title: VORSCHAU_NICHT_VERFUEGBAR, description: "Speichern braucht die Datenbank. In der Vorschau bleibt alles nur in diesem Fenster." });
      return;
    }
    if (!investmentId || !kundeId || speichertGerade) return;
    /*
     * Speichern legt nur eine Berechnung am Investment an. Das Investment
     * selbst bleibt unverändert, ihm wird also keine Wohnung zugeordnet. Bei
     * einem Investment ohne Objekt merkt sich die Berechnung deshalb die
     * Wohnung, für die gerechnet wurde (Spalte `wohnung_id`, „die Einheit,
     * falls die Berechnung zu einer gehört"). Gesperrt bleibt nur ein
     * Investment, das schon zu einer anderen Einheit gehört.
     */
    const bezug = quellen && investment ? investmentBezugZurEinheit(investment, quellen) : "passend";
    if (quellen && (!investment || bezug === "andereEinheit")) {
      setSpeicherhinweis("Das gewählte Investment gehört schon zu einer anderen Einheit. Wähle ein Investment dieser Wohnung oder eines ohne Objekt.");
      return;
    }
    setSpeicherhinweis("");
    let name = berechnungName;
    if (alsNeue || !berechnungId || !name.trim()) {
      const eingegeben = await abfrageDialog({
        title: alsNeue ? "Neue Berechnung benennen" : "Berechnung benennen",
        description:
          "Unter diesem Namen steht die Berechnung im Kundenprofil unter Objektauswahl. Gut sind Name des Objekts und der Einheit, oder wofür die Variante steht.",
        defaultValue: name.trim() || berechnungsnameVorschlag(input.propertyTitle || investment?.objektTitel, investment?.weNr),
        confirmText: "Speichern",
      });
      if (!eingegeben) return;
      name = eingegeben;
    }

    setSpeichertGerade(true);
    const daten = {
      investmentId,
      kontaktId: kundeId,
      wohnungId: bezug === "ohneObjekt" ? quellen?.wohnungId ?? null : investment?.wohnungId ?? null,
      name,
      eingabe: input,
      knk: aktiv.knk,
      unterlagen: documentData,
      kennzahlen: kennzahlenAus(input, result),
      herkunft: aktiv.herkunft,
      erstelltVon: getCurrentUserId(),
    };
    const ergebnis =
      berechnungId && !alsNeue ? await aktualisiereBerechnung(berechnungId, daten) : await speichereBerechnung(daten);
    setSpeichertGerade(false);

    if (ergebnis.migrationFehlt) {
      setSpeicherhinweis(BERECHNUNGEN_MIGRATION_HINWEIS);
      return;
    }
    if (ergebnis.fehler || !ergebnis.berechnung) {
      setSpeicherhinweis(
        ergebnis.fehler || "Die Berechnung wurde nicht gespeichert. Vielleicht darfst du diesen Kunden nicht bearbeiten.",
      );
      return;
    }
    setBerechnungId(ergebnis.berechnung.id);
    setBerechnungName(ergebnis.berechnung.name);
    toast({
      title: berechnungId && !alsNeue ? "Änderungen gespeichert" : "Berechnung gespeichert",
      description: `„${ergebnis.berechnung.name}“ steht jetzt im Kundenprofil unter Objektauswahl.`,
    });
  };

  const kundenbereich = (
    <>
      <KundeUndInvestment
        kundeId={kundeId}
        investmentId={investmentId}
        onKundeWaehlen={kundeWaehlen}
        einheit={einheit}
        onInvestmentWaehlen={(id) => {
          const gewaehlt = id ? getInvestmentById(id) : undefined;
          if (gewaehlt && investmentBezugZurEinheit(gewaehlt, einheit) === "andereEinheit") {
            setSpeicherhinweis("Dieses Investment gehört schon zu einer anderen Einheit und ist hier gesperrt. Wähle ein Investment dieser Wohnung oder eines ohne Objekt.");
            return;
          }
          if (!vorbelegung?.quellen && id) {
            const vor = vorbelegungAusInvestment(id);
            if (vor) setObjekte(bisher => [{ ...startZustand(vor), eingabe: { ...vor.eingabe, clientName: bisher[0].eingabe.clientName } }]);
          }
          setInvestmentId(id);
          // Ein anderes Investment ist ein anderer Vorgang. Die geladene
          // Berechnung bleibt, wo sie ist, hier entsteht eine neue.
          setBerechnungId(null);
          setBerechnungName("");
          setSpeicherhinweis("");
          // Und ein anderes Investment kann eine eigene Selbstauskunft haben.
          if (kundeId) schrittBestimmen(kundeId, id, getInvestmentsByKontakt(kundeId).filter(i => investmentBezugZurEinheit(i, einheit) !== "andereEinheit").length);
        }}
      />
      {schritt.art === "investmentWaehlen" && (
        <Alert className="ki-alert">
          <UserRound size={16} />
          <AlertTitle>Jetzt das Investment wählen</AlertTitle>
          <AlertDescription>
            <p>
              Die Selbstauskunft gehört zum Investment. Sobald du eines gewählt hast, sagt der Rechner, ob dazu eine
              vorliegt und welche Zahlen er übernehmen würde.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {schritt.art === "ohneSelbstauskunft" && (
        <Alert className="ki-alert">
          <UserRound size={16} />
          <AlertTitle>Keine Selbstauskunft zu diesem Investment</AlertTitle>
          <AlertDescription>
            <p>
              Zu diesem Investment liegt keine Selbstauskunft vor. Die Zahlen sind von Hand einzutragen.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {schritt.art === "frage" && (
        <Alert className="ki-alert">
          <UserRound size={16} />
          <AlertTitle>Zahlen aus der Selbstauskunft übernehmen?</AlertTitle>
          <AlertDescription>
            <p>Das würde gesetzt:</p>
            <ul className="rechner-uebernahme-posten">
              {schritt.uebernahme.posten.map((posten) => (
                <li key={posten.feld}>
                  {posten.feld}: <b>{posten.wert}</b>
                  {posten.hinweis && <span> · {posten.hinweis}</span>}
                </li>
              ))}
            </ul>
            <div className="rechner-uebernahme-knoepfe">
              <button type="button" className="button button-primary" onClick={uebernahmeAnnehmen}>
                <Check size={14} /> Zahlen übernehmen
              </button>
              <button type="button" className="text-button" onClick={() => setSchritt({ art: "still" })}>
                Nicht übernehmen
              </button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {speicherhinweis && (
        <Alert className="ki-alert">
          <Save size={16} />
          <AlertTitle>Noch nicht gespeichert</AlertTitle>
          <AlertDescription>
            <p>{speicherhinweis}</p>
          </AlertDescription>
        </Alert>
      )}
    </>
  );

  const autoHinweise = automatischeAntwort ? [
    ...quellenStatus.hinweise,
    ...automatischeObjektwerte(automatischeAntwort, objekte[0].eingabe, objekte[0].herkunft).hinweise,
    ...automatischeUnterlagenwerte(automatischeAntwort, objekte[0].documentData).hinweise,
  ] : quellenStatus.hinweise;

  const eingabeProps = { input, result, setzeZahl, setzeText, aendere, herkunft: aktiv.herkunft };
  /*
   * Der Satz über den Bildern, woher sie kommen. Nur beim ersten Objekt, denn
   * nur das ist die Einheit, und nur solange er stimmt: Sind alle Fotos
   * entfernt, ist „vorbelegt" keine Auskunft mehr.
   */
  const fotoHinweis =
    sicherIndex !== 0
      ? undefined
      : fotoStand === "laedt" && photos.length === 0
        ? "Die Fotos aus der Objektanlage werden geladen …"
        : fotoStand === "vorbelegt" && photos.length > 0
          ? "Vorbelegt mit den Fotos aus der Objektanlage, erst die der Einheit, dann die des Objekts. Du kannst sie umsortieren, entfernen oder eigene ergänzen."
          : fotoStand === "fehlgeschlagen" && photos.length === 0
            ? "Die Fotos aus der Objektanlage ließen sich nicht laden. Füge sie bei Bedarf hier selbst hinzu."
            : undefined;
  /** Vermerk am Bereichsknopf, für wen der Bereich gilt. Nur im Vergleich sichtbar. */
  const objektVermerk = vergleichAktiv ? objektMarke(sicherIndex) : undefined;
  const alleVermerk = vergleichAktiv ? "alle Objekte" : undefined;

  // Der Druck geht an den Kunden und folgt deshalb seiner Sprache aus dem Profil (Plan Kundensprache, D15).
  const { sprache: spracheDesKunden } = useKundenSprache(kundeId);
  /*
    Sprache der rechten Seite und der PDFs, seit dem 22.10.2026: mit Kunde die
    Kundensprache aus seinem Profil, ohne Kunde (etwa über die Seitenleiste
    geöffnet) eine sichtbare Wahl Deutsch oder Englisch. Die Eingabemaske
    links bleibt immer Deutsch.
  */
  const [spracheOhneKunde, setSpracheOhneKunde] = useState<FormatSprache>("de");
  const kundenSprache: FormatSprache = dokumentSprache ?? (kundeId ? spracheDesKunden : spracheOhneKunde);
  const en = kundenSprache === "en";
  /*
   * Ausführliche Berechnung im Einhauser-Aufbau (29.10.2026): Vorgaben aus
   * Objekt und Wohnung der Einheit und aus der Selbstauskunft; was der
   * Berater links einträgt, hat Vorrang (ausfuehrlicheBerechnung.ts).
   */
  const kundeVorgabe = useMemo<Partial<VergleichKunde>>(() => {
    if (!saQuelle) return {};
    const kontakt = kundeId ? ((getKontaktById(kundeId) as Parameters<typeof kundeAus>[0]) ?? null) : null;
    const datum = (kundeId && loadKundenkontext(kundeId, investmentId)?.saDatum) || "";
    return kundeAus(kontakt, saQuelle.sa, datum);
  }, [saQuelle, kundeId, investmentId]);
  const objektVorgabe = useMemo<Partial<AusfuehrlichAngaben>>(() => {
    if (!quellen) return {};
    try {
      const objekt = getObjekte().find((o) => o.id === quellen.objektId);
      const wohnung = objekt?.wohnungen.find((w) => w.id === quellen.wohnungId);
      return objekt && wohnung ? ausfuehrlichVorgaben(objekt, wohnung) : {};
    } catch {
      return {};
    }
    // objektDatenKey: neu, sobald sich Objekt oder Einheit im Zwischenspeicher ändern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quellenKey, objektDatenKey]);
  const vorgabenFuer = (index: number): Partial<AusfuehrlichAngaben> => ({
    ...(index === eigenerIndex ? objektVorgabe : {}),
    kunde: kundeVorgabe,
  });
  const ausfuehrlichDok = useMemo(() => {
    const d = berechnungAusRechner(objekte.slice(0, 2).map((o, i) => ({ input: o.eingabe, result: ergebnisse[i], vorgaben: vorgabenFuer(i), foto: o.photos[0] })));
    return d.v.dokument && erstelltVon ? { ...d, v: { ...d.v, dokument: { ...d.v.dokument, erstelltVon } } } : d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objekte, ergebnisse, objektVorgabe, kundeVorgabe, eigenerIndex, erstelltVon]);
  const ausfuehrlichRef = useRef<HTMLDivElement>(null);


  const druckdokumentRef = useRef<HTMLDivElement>(null);
  const [pdfEntsteht, setPdfEntsteht] = useState(false);

  /** PDF der ausführlichen Berechnung, aus dem verborgenen Abdruck unten (wie beim Objektvergleich). */
  const ausfuehrlichHerunterladen = async () => {
    setPdfEntsteht(true);
    const abdruck = ausfuehrlichRef.current;
    try {
      if (!abdruck) throw new Error("Die Seiten der ausführlichen Berechnung sind nicht verfügbar");
      abdruck.classList.add("kov-export");
      const doc = await erzeugeBerechnungsansichtPdf(abdruck);
      const v = ausfuehrlichDok.v;
      doc.save(vergleichDateiname(v, v.stand.split("-").reverse().join(".")).replace(/^Objekt(rechnung|vergleich)/, en ? "Investment calculation" : "Investmentberechnung"));
    } catch (fehler) {
      console.error("[Investmentrechner] PDF der ausführlichen Berechnung fehlgeschlagen", fehler);
      toast({
        title: "PDF konnte nicht erstellt werden",
        description: "Bitte versuch es noch einmal. Bleibt der Fehler, melde ihn bitte mit einem Screenshot.",
        variant: "destructive",
      });
    } finally {
      abdruck?.classList.remove("kov-export");
      setPdfEntsteht(false);
    }
  };

  /** Reihenfolge der Bereiche wie in der Leiste; Bankunterlagen nur mit `bankModus`. */
  const bereichsfolge: Eingabebereich[] = ["kunde", "objekt", "unterlagen", "finanzierung", "ertrag", "steuer", "ausfuehrlich", ...(bankModus ? ["bankunterlagen" as const] : [])];
  const naechsterBereich = bereichsfolge[bereichsfolge.indexOf(bereich) + 1];

  // Dieselben Aktionen in beiden Fällen, damit der Reiter nichts anderes kann
  // als die Seite in der Seitenleiste.
  const aktionen = (
    <>
      <span className="inline-flex items-center gap-2 mr-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
        <i className="h-[7px] w-[7px] rounded-full bg-success shadow-[0_0_0_4px_hsl(var(--success)/0.12)]" />
        Live-Berechnung
      </span>
      {/* Der Schalter „Bankgespräch & Bankunterlagen“ ist seit dem 29.10.2026 ausgeblendet, siehe `bankModus`. */}
      {bankModus && (
        <label className="rechner-modus" data-testid="schalter-bankgespraech">
          <input
            type="checkbox"
            checked={bankModus}
            onChange={(e) => {
              aendere({ bankgespraechAktiv: e.target.checked });
              if (!e.target.checked && bereich === "bankunterlagen") setBereich("kunde");
            }}
          />
          Bankgespräch &amp; Bankunterlagen
          <Neu />
        </label>
      )}
      {/*
        Speichern gibt es nur mit gewähltem Investment, denn dort landet die
        Berechnung. Der Knopf ist deshalb nicht versteckt, sondern gesperrt und
        sagt im Tooltip, was fehlt. Die eigentliche Sperre steht ohnehin in der
        Datenbank: Wer den Kunden nicht bearbeiten darf, kommt an der RLS nicht
        vorbei, auch nicht mit einem sichtbaren Knopf.
      */}
      {/* Im Artefakt gibt es kein Investment, also kein Speichern (Christian, 29.10.2026). */}
      {!ohneSpeichern && (berechnungId ? (
          <>
            <Button variant="outline" className="gap-2" disabled={speichertGerade} onClick={() => void speichere(false)}>
              <Save size={16} /> Änderungen speichern
            </Button>
            <Button variant="outline" className="gap-2" disabled={speichertGerade} onClick={() => void speichere(true)}>
              <CopyPlus size={16} /> Als neue Berechnung speichern
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            className="btn-brand-umriss gap-2"
            disabled={(!investmentId && !vorschau) || speichertGerade}
            title={investmentId || vorschau ? undefined : "Erst Kunde und Investment im Bereich „Kunde & Einkommen“ wählen"}
            onClick={() => void speichere(false)}
          >
            <Save size={16} /> Am Investment speichern
          </Button>
        ))}
      {/*
        Der Abschluss der Seite: gefuellt orange, daneben das Speichern nur
         umrandet. Die Berechnungsseiten werden direkt aus der gleichen Ansicht
         wie in der Vorschau ins PDF übernommen, mit einem zusätzlichen CI-Deckblatt.

        "Berechnung" statt "Expose", entschieden von Christian am 22.09.2026:
        Am Objekt haengt ein eigenes Expose, und zwei Papiere mit demselben
        Namen verwechselt man im Kundengespraech.
      */}
      {/* Seit dem 29.10.2026 die ausführliche Berechnung, in der Sprache für Kunde und PDF. */}
      <Button variant="brand" className="gap-2" disabled={pdfEntsteht} onClick={() => void ausfuehrlichHerunterladen()}>
        <FileDown size={16} /> {pdfEntsteht ? "PDF wird erstellt …" : "Berechnung herunterladen"}
      </Button>
    </>
  );

  return (
    <VorschauKontext.Provider value={!!vorschau}>
    <AmpelKontext.Provider value={ampelEinstellung}>
    <FeldetikettKontext.Provider value={bankModus}>
      <div className="space-y-6 w-full">
        {mitUeberschrift ? (
          <PageHeader title="Investmentkalkulation">{aktionen}</PageHeader>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">{aktionen}</div>
        )}

        {/* „Angaben aus Objekt und Unterlagen“ seit dem 29.10.2026 ausgeblendet (Christian); die Herkunft steht weiter unter den Feldern. */}
        <div className="investmentrechner">
          <div className="workspace">
            <aside className="input-panel" ref={maskeRef}>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Kalkulationsbasis</span>
                  <h1>Investment modellieren</h1>
                </div>
              </div>
              {vergleichAktiv && (
                <Objektleiste
                  titel={objekte.map((objekt) => objekt.eingabe.propertyTitle)}
                  aktivIndex={sicherIndex}
                  onWaehlen={setAktivIndex}
                  onEntfernen={objektEntfernen}
                />
              )}
              <nav className="section-nav" aria-label="Eingabebereiche">
                <Bereichsknopf
                  active={bereich === "kunde"}
                  icon={<UserRound size={17} />}
                  label="Kunde & Einkommen"
                  vermerk={alleVermerk}
                  vermerkFuerAlle
                  onClick={() => setBereich("kunde")}
                />
                <Bereichsknopf
                  active={bereich === "objekt"}
                  icon={<Building2 size={17} />}
                  label="Objekt & Kaufpreis"
                  vermerk={objektVermerk}
                  onClick={() => setBereich("objekt")}
                />
                <Bereichsknopf
                  active={bereich === "unterlagen"}
                  icon={<FileSearch size={17} />}
                  label="Objektunterlagen"
                  vermerk={objektVermerk}
                  onClick={() => setBereich("unterlagen")}
                />
                <Bereichsknopf
                  active={bereich === "finanzierung"}
                  icon={<Landmark size={17} />}
                  label="Finanzierung"
                  vermerk={objektVermerk}
                  onClick={() => setBereich("finanzierung")}
                />
                <Bereichsknopf
                  active={bereich === "ertrag"}
                  icon={<ChartColumn size={17} />}
                  label="Miete & Entwicklung"
                  vermerk={objektVermerk}
                  onClick={() => setBereich("ertrag")}
                />
                <Bereichsknopf
                  active={bereich === "steuer"}
                  icon={<ReceiptText size={17} />}
                  label="Steuer & AfA"
                  vermerk={objektVermerk}
                  onClick={() => setBereich("steuer")}
                />
                <Bereichsknopf
                  active={bereich === "ausfuehrlich"}
                  icon={<FileText size={17} />}
                  label="Ausführliche Berechnung"
                  vermerk={objektVermerk}
                  onClick={() => setBereich("ausfuehrlich")}
                />
                {bankModus && (
                  <Bereichsknopf
                    active={bereich === "bankunterlagen"}
                    icon={<Banknote size={17} />}
                    label="Bankunterlagen"
                    vermerk={alleVermerk}
                    vermerkFuerAlle
                    neu
                    onClick={() => setBereich("bankunterlagen")}
                  />
                )}
                {!vergleichAktiv && <ObjektHinzufuegen onClick={objektHinzufuegen} />}
              </nav>
              <div className="input-content">
                {bankModus && (
                  <p className="feldetikett-legende" data-testid="feldetikett-legende">
                    <span className="feldetikett feldetikett-objekt">Objekt</span> aus Objektanlage oder Unterlagen
                    <span className="feldetikett feldetikett-selbstauskunft">Kunden-SA</span> aus der Selbstauskunft
                    <span className="feldetikett feldetikett-manuell">Manuell</span> selbst eintragen
                  </p>
                )}
                {bereich === "kunde" && (
                  <EingabeKunde
                    {...eingabeProps}
                    kundenbereich={kundenbereich}
                    zusatzAngaben={kundeVonHand ? <EingabeAusgangslage input={input} aendere={aendere} vorgaben={vorgabenFuer(sicherIndex)} /> : undefined}
                  />
                )}
                {bereich === "objekt" && (
                  <EingabeObjekt
                    {...eingabeProps}
                    knk={aktiv.knk}
                    setzeKnk={setzeKnk}
                    unterlagen={
                      <UnterlagenUpload
                        documents={documents}
                        isReading={isReading}
                        onUpload={unterlagenHochladen}
                        onRemove={unterlageEntfernen}
                        kiAuslesung={kiAnzeige?.objektIndex === sicherIndex ? kiAnzeige : sicherIndex === eigenerIndex ? autoAuslesung : null}
                        onFelderAuslesen={felderAuslesen}
                        onFelderUebernehmen={felderUebernehmen}
                        onKiSchliessen={() => { setKiAuslesung(null); setAutoListeZu(true); }}
                        onZuruecknehmen={zuruecknehmen}
                      />
                    }
                  />
                )}
                {bereich === "unterlagen" && (
                  <EingabeUnterlagen
                    documentData={documentData}
                    setDocumentData={(aktualisierer) =>
                      { unterlagenManuell.current = true; setzeAktivesObjekt((objekt) => ({ ...objekt, documentData: aktualisierer(objekt.documentData) })); }
                    }
                  />
                )}
                {bereich === "finanzierung" && <EingabeFinanzierung {...eingabeProps} />}
                {bereich === "ertrag" && <EingabeErtrag {...eingabeProps} />}
                {bereich === "steuer" && <EingabeSteuer {...eingabeProps} />}
                {bereich === "ausfuehrlich" && (
                  <EingabeAusfuehrlich input={input} aendere={aendere} vorgaben={vorgabenFuer(sicherIndex)} nummer="07" />
                )}
                {bereich === "bankunterlagen" && bankModus && (
                  <EingabeBankunterlagen
                    {...eingabeProps}
                    onAusSelbstauskunft={() => void bankunterlagenLaden(false)}
                    saStatus={{ verbunden: !!saQuelle, neuerStand: saNeuerStand, vorschau: !!vorschau }}
                  />
                )}
                {/*
                  Den Bereich „Bilder“ gibt es seit dem 29.10.2026 nicht mehr (Christian):
                  Die ausführliche Berechnung zeigt keine Fotos, Bilder stehen im Exposé.
                */}
                {/* Unten in jedem Bereich außer dem letzten: weiter zum nächsten (Christian, 29.10.2026). */}
                {naechsterBereich && (
                  <div className="flex justify-end pt-4">
                    <Button variant="brand" className="gap-2" data-testid="bereich-weiter" onClick={() => {
                      setBereich(naechsterBereich);
                      maskeRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
                    }}>
                      Weiter <ArrowRight size={16} />
                    </Button>
                  </div>
                )}
              </div>
            </aside>

            {/* Die rechte Seite bleibt Deutsch; die Sprachwahl gilt seit dem 29.10.2026 nur für das PDF. */}
            <section className="result-panel" lang="de">
            <RechnerSpracheContext.Provider value="de">
              {/*
                Kopfbereich, seit dem 23.10.2026 in drei Ebenen (Christian):
                oben Kunde und Objekt mit „Zurücksetzen“, darunter die
                Hauptnavigation der Ansichten, darunter die Sprache.
              */}
              <div className="result-header">
                <div className="result-kopf">
                  <div>
                    <span className="eyebrow">
                      {input.clientName || "Kundenberechnung"}
                      {vergleichAktiv ? ` · ${objektMarke(sicherIndex)}` : ""}
                    </span>
                    <h2>{input.propertyTitle || "Neue Investmentkalkulation"}</h2>
                    <p>{input.address || "Adresse ergänzen"}</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2 rechner-zuruecksetzen" onClick={() => void zuruecksetzen()} data-testid="rechner-zuruecksetzen">
                    <RotateCcw size={15} /> Zurücksetzen
                  </Button>
                </div>
                {/*
                  Seit dem 29.10.2026 nur Analyse und ausführliche Berechnung
                  (Christian). „Berechnung“ mit den drei Deckblättern und
                  „Vergleich“ sind entfernt; zwei Objekte vergleicht die
                  ausführliche Berechnung selbst.
                */}
                <div className="view-toggle hauptansichten" role="tablist" aria-label="Ansicht wählen">
                  <button className={ansicht === "analyse" ? "active" : ""} onClick={() => setAnsicht("analyse")}>
                    <Calculator size={16} /> Analyse
                  </button>
                  <button className={ansicht === "ausfuehrlich" ? "active" : ""} onClick={() => setAnsicht("ausfuehrlich")} id="ansicht-ausfuehrlich">
                    <FileText size={16} /> Ausführlich (PDF)
                  </button>
                </div>
                <div className="result-optionen">
                  {/* Ohne Kunde eine sichtbare Wahl; mit Kunde gilt seine Sprache aus dem Profil. */}
                  {dokumentSprache === undefined && (
                    <div className="sprache-wahl" data-testid={kundeId ? "sprache-kunde" : "sprache-wahl"}>
                      <span>
                        <Languages size={14} /> Sprache des PDF
                      </span>
                      <div className="sprache-schalter" role="radiogroup" aria-label="Sprache des PDF">
                        {(["de", "en"] as const).map((sprache) => (
                          <button
                            key={sprache}
                            type="button"
                            role="radio"
                            aria-checked={kundenSprache === sprache}
                            className={kundenSprache === sprache ? "active" : ""}
                            disabled={!!kundeId}
                            onClick={() => setSpracheOhneKunde(sprache)}
                          >
                            {sprache.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      {kundeId && <small>Aus dem Kundenprofil</small>}
                    </div>
                  )}
                </div>
              </div>
              {/*
                Analyse und „Ausführlich“ zeigen seit dem 29.10.2026 die Rechnung im
                Aufbau des Einhauser-Vergleichs (Christian): Karten bzw. A4-Seiten,
                dieselben Zahlen. Die Analyse ist immer Deutsch, das PDF folgt der Sprache.
              */}
              {ansicht === "analyse" && (
                <>
                  {/* Ohne Einkommen rechnet die ausführliche Berechnung wie das Exposé pauschal (steuerAus). */}
                  {input.taxCalculationMode === "tariff" && ausfuehrlichDok.v.annahmen.steuerArt === "pauschal" && (
                    <p className="kachel-hinweis" data-testid="hinweis-ohne-steuerwirkung">
                      Ohne zu versteuerndes Einkommen rechnet die Analyse pauschal mit {Math.round(ausfuehrlichDok.v.annahmen.steuer * 100)} % wie im Exposé.
                      Bitte das zu versteuernde Einkommen unter „Kunde &amp; Einkommen“ eintragen, dann gilt der persönliche Steuersatz.
                    </p>
                  )}
                  <EinhauserAnalyse {...ausfuehrlichDok} />
                </>
              )}
              {ansicht === "ausfuehrlich" && (
                <div className="expose-preview-wrap" data-testid="ausfuehrlich-einhauser">
                  <ExposeVorschau>
                    <div className="expose-document"><KundenObjektvergleichDokument {...ausfuehrlichDok} sprache={kundenSprache} /></div>
                  </ExposeVorschau>
                </div>
              )}
            </RechnerSpracheContext.Provider>
            </section>
          </div>
        </div>
      </div>

      {/*
        Druckdokument: Die App wird beim Drucken ausgeblendet, gedruckt wird
        dieses Portal direkt im body. Seit dem 29.10.2026 die ausführliche Berechnung.
      */}
      {createPortal(
        <div ref={druckdokumentRef} className="investmentrechner investmentrechner-print print-only">
          <style>{"@page { size: A4 portrait; margin: 0; }"}</style>
          <div className="expose-document"><KundenObjektvergleichDokument {...ausfuehrlichDok} sprache={kundenSprache} /></div>
        </div>,
        document.body,
      )}
      {/* Abdruck der ausführlichen Berechnung für den Download, außerhalb des Bildschirms. */}
      {createPortal(
        <div ref={ausfuehrlichRef} aria-hidden style={{ position: "fixed", left: -20000, top: 0, width: "210mm" }}>
          <KundenObjektvergleichDokument {...ausfuehrlichDok} sprache={kundenSprache} />
        </div>,
        document.body,
      )}
    </FeldetikettKontext.Provider>
    </AmpelKontext.Provider>
    </VorschauKontext.Provider>
  );
}
