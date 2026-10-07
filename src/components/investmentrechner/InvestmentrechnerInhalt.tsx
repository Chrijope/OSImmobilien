import { useLiveVersion } from "@/hooks/useLiveData";
import { automatischeObjektwerte, automatischeUnterlagenwerte, ergaenzeUnterlagen, leseObjektUnterlagen, type ObjektUnterlagenQuelle } from "@/lib/investmentrechner/objektUnterlagen";
import { vorbelegungAusInvestment } from "@/lib/investmentrechner/investmentVorbelegung";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Calculator,
  ChartColumn,
  Check,
  CopyPlus,
  FileDown,
  FileSearch,
  ImagePlus,
  Landmark,
  ReceiptText,
  RotateCcw,
  Save,
  Scale,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { abfrageDialog } from "@/lib/confirm";
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
import { kundenschritt, kundenUebernahmeFuer, type Kundenschritt } from "@/lib/investmentrechner/kundenUebernahme";
import {
  berechneInvestment,
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
import { Bereichsknopf } from "@/components/investmentrechner/Felder";
import { KundeUndInvestment, type KundenwahlKunde } from "@/components/investmentrechner/KundeUndInvestment";
import type { KiAuslesung } from "@/components/investmentrechner/UnterlagenUebernahme";
import {
  EingabeErtrag,
  EingabeExpose,
  EingabeFinanzierung,
  EingabeKunde,
  EingabeObjekt,
  EingabeSteuer,
  EingabeUnterlagen,
} from "@/components/investmentrechner/Eingabebereiche";
import { Analyse } from "@/components/investmentrechner/Analyse";
import { ExposeDokument, ExposeVergleichsdokument, type ExposeObjekt } from "@/components/investmentrechner/ExposeDokument";
import { ExposeVorschau } from "@/components/investmentrechner/ExposeVorschau";
import { DeckblattWahl } from "@/components/investmentrechner/Deckblatt";
import {
  gemerkteDeckblattVariante,
  merkeDeckblattVariante,
  type DeckblattVariante,
} from "@/lib/investmentrechner/deckblattWerte";
import { useKundenSprache } from "@/lib/kundenSprache";
import { ObjektHinzufuegen, Objektleiste, Vergleichsansicht } from "@/components/investmentrechner/Objektvergleich";
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

type Eingabebereich = "kunde" | "objekt" | "unterlagen" | "finanzierung" | "ertrag" | "steuer" | "expose";
type Ansicht = "analyse" | "vergleich" | "expose";

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
}

export function InvestmentrechnerInhalt({
  vorbelegung,
  mitUeberschrift = true,
  start,
  onErgebnis,
  sichtbar = true,
}: InvestmentrechnerInhaltProps = {}) {
  const [objekte, setObjekte] = useState<Objektzustand[]>(() => {
    if (start?.berechnung) {
      return [
        startZustand({
          eingabe: start.berechnung.eingabe,
          knk: start.berechnung.knk,
          unterlagen: start.berechnung.unterlagen ?? undefined,
          herkunft: start.berechnung.herkunft,
        }),
      ];
    }
    const zustand = startZustand(vorbelegung);
    // Ein von außen mitgegebener Kunde steht sofort im Feld „Kundenname“. Das
    // ist keine übernommene Zahl, sondern die Beschriftung der Berechnung,
    // deshalb bekommt es keinen Herkunftshinweis.
    if (!start?.kundeName) return [zustand];
    return [{ ...zustand, eingabe: { ...zustand.eingabe, clientName: start.kundeName } }];
  });
  const [aktivIndex, setAktivIndex] = useState(0);
  /* ── Kunde, Investment und die gespeicherte Berechnung ── */
  const [kundeId, setKundeId] = useState<string | null>(start?.berechnung?.kontakt_id ?? start?.kundeId ?? null);
  const [investmentId, setInvestmentId] = useState<string | null>(
    start?.berechnung?.investment_id ?? start?.investmentId ?? null,
  );
  const [berechnungId, setBerechnungId] = useState<string | null>(start?.berechnung?.id ?? null);
  const [berechnungName, setBerechnungName] = useState(start?.berechnung?.name ?? "");
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
  const unterlagenManuell = useRef(false);
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
    // Zurück auf den Anfang, also bei einer Vorbelegung zurück auf die Zahlen
    // der Einheit und nicht auf ein leeres Formular.
    unterlagenManuell.current = false;
    setAutomatischeAntwort(null);
    setQuellenVersuch(v => v + 1);
    // Zurück auf die Objektdaten heißt auch: zurück auf deren Fotos.
    fotosAngefasst.current = false;
    fotosVorbelegt.current = false;
    setFotoStand("still");
    setBilderVersuch(v => v + 1);
    setObjekte([startZustand(vorbelegung)]);
    // Ganz zurück auf die Vorbelegung: nur ein noch gewählter Kunde hält den Kundenbezug.
    kundeBeruehrt.current = !!kundeId;
    setAktivIndex(0);
    setBereich("kunde");
    setAnsicht("analyse");
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
    setAnsicht((bisher) => (bisher === "vergleich" ? "analyse" : bisher));
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

  /* ── Am Investment speichern ── */

  const investment = investmentId ? getInvestmentById(investmentId) : undefined;

  const speichere = async (alsNeue: boolean) => {
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
  const { sprache: kundenSprache } = useKundenSprache(kundeId);
  const exposeObjekte: ExposeObjekt[] = objekte.map((objekt, index) => ({
    input: objekt.eingabe,
    result: ergebnisse[index],
    photos: objekt.photos,
    documents: objekt.documents,
    documentData: objekt.documentData,
  }));
  // Das Deckblatt wählt jeder Berater selbst, gemerkt in diesem Browser (07.10.2026).
  const [deckblatt, setDeckblatt] = useState<DeckblattVariante>(gemerkteDeckblattVariante);
  const waehleDeckblatt = (variante: DeckblattVariante) => {
    setDeckblatt(variante);
    merkeDeckblattVariante(variante);
  };
  const exposeInhalt = (printing: boolean) =>
    vergleichAktiv ? (
      <ExposeVergleichsdokument
        a={exposeObjekte[0]}
        b={exposeObjekte[1]}
        printing={printing}
        sprache={kundenSprache}
        deckblatt={deckblatt}
      />
    ) : (
      <ExposeDokument {...exposeObjekte[0]} printing={printing} sprache={kundenSprache} deckblatt={deckblatt} />
    );

  const druckdokumentRef = useRef<HTMLDivElement>(null);
  const [pdfEntsteht, setPdfEntsteht] = useState(false);
  const berechnungHerunterladen = async () => {
    setPdfEntsteht(true);
    try {
      const druckdokument = druckdokumentRef.current;
      if (!druckdokument) throw new Error("Die Berechnungsseiten sind nicht verfügbar");
      const { ladeBerechnungsansichtHerunter } = await import("@/lib/investmentrechner/berechnungAnsichtPdf");
      await ladeBerechnungsansichtHerunter(vergleichAktiv ? exposeObjekte.slice(0, 2) : [exposeObjekte[0]], kundenSprache, druckdokument);
    } catch (fehler) {
      console.error("[Investmentrechner] PDF fehlgeschlagen", fehler);
      toast({
        title: "PDF konnte nicht erstellt werden",
        description: "Bitte versuch es noch einmal. Bleibt der Fehler, melde ihn bitte mit einem Screenshot.",
        variant: "destructive",
      });
    } finally {
      setPdfEntsteht(false);
    }
  };

  // Dieselben Aktionen in beiden Fällen, damit der Reiter nichts anderes kann
  // als die Seite in der Seitenleiste.
  const aktionen = (
    <>
      <span className="inline-flex items-center gap-2 mr-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
        <i className="h-[7px] w-[7px] rounded-full bg-success shadow-[0_0_0_4px_hsl(var(--success)/0.12)]" />
        Live-Berechnung
      </span>
      <Button variant="outline" className="gap-2" onClick={neuStarten}>
        <RotateCcw size={16} /> {vorbelegung ? "Auf Objektdaten zurücksetzen" : "Neu starten"}
      </Button>
      {/*
        Speichern gibt es nur mit gewähltem Investment, denn dort landet die
        Berechnung. Der Knopf ist deshalb nicht versteckt, sondern gesperrt und
        sagt im Tooltip, was fehlt. Die eigentliche Sperre steht ohnehin in der
        Datenbank: Wer den Kunden nicht bearbeiten darf, kommt an der RLS nicht
        vorbei, auch nicht mit einem sichtbaren Knopf.
      */}
      {berechnungId ? (
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
          disabled={!investmentId || speichertGerade}
          title={investmentId ? undefined : "Erst Kunde und Investment im Bereich „Kunde & Einkommen“ wählen"}
          onClick={() => void speichere(false)}
        >
          <Save size={16} /> Am Investment speichern
        </Button>
      )}
      {/*
        Der Abschluss der Seite: gefuellt orange, daneben das Speichern nur
         umrandet. Die Berechnungsseiten werden direkt aus der gleichen Ansicht
         wie in der Vorschau ins PDF übernommen, mit einem zusätzlichen CI-Deckblatt.

        "Berechnung" statt "Expose", entschieden von Christian am 22.09.2026:
        Am Objekt haengt ein eigenes Expose, und zwei Papiere mit demselben
        Namen verwechselt man im Kundengespraech.
      */}
      <Button variant="brand" className="gap-2" disabled={pdfEntsteht} onClick={() => void berechnungHerunterladen()}>
        <FileDown size={16} /> {pdfEntsteht ? "PDF wird erstellt …" : "Berechnung herunterladen"}
      </Button>
    </>
  );

  return (
    <>
      <div className="space-y-6 w-full">
        {mitUeberschrift ? (
          <PageHeader title="Investmentkalkulation">{aktionen}</PageHeader>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">{aktionen}</div>
        )}

        {quellen && (
          <Alert>
            <AlertTitle>{quellenStatus.laedt ? "Objektunterlagen werden automatisch ausgelesen …" : "Angaben aus Objekt und Unterlagen"}</AlertTitle>
            <AlertDescription>
              <p>{quellen.dokumente.length} hinterlegte Dateien. Gepflegte Angaben haben Vorrang. Eindeutige Dokumentwerte ergänzen fehlende Objektfelder; weitere Angaben bitte manuell oder aus der Selbstauskunft ergänzen.</p>
              {start?.berechnung && <p>Gespeicherte Berechnung: Die gespeicherten Werte bleiben erhalten. Dokumente stehen zur Prüfung bereit.</p>}
              {autoHinweise.length > 0 && <ul className="mt-2 list-disc pl-5">{[...new Set(autoHinweise)].map((h, i) => <li key={i}>{h}</li>)}</ul>}
              <Button variant="link" disabled={quellenStatus.laedt} onClick={() => setQuellenVersuch(v => v + 1)}>Unterlagen erneut prüfen</Button>
            </AlertDescription>
          </Alert>
        )}
        <div className="investmentrechner">
          <div className="workspace">
            <aside className="input-panel">
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
                  active={bereich === "expose"}
                  icon={<ImagePlus size={17} />}
                  label="Bilder"
                  vermerk={objektVermerk}
                  onClick={() => setBereich("expose")}
                />
                {!vergleichAktiv && <ObjektHinzufuegen onClick={objektHinzufuegen} />}
              </nav>
              <div className="input-content">
                {bereich === "kunde" && <EingabeKunde {...eingabeProps} kundenbereich={kundenbereich} />}
                {bereich === "objekt" && <EingabeObjekt {...eingabeProps} knk={aktiv.knk} setzeKnk={setzeKnk} />}
                {bereich === "unterlagen" && (
                  <EingabeUnterlagen
                    documents={documents}
                    isReading={isReading}
                    documentData={documentData}
                    setDocumentData={(aktualisierer) =>
                      { unterlagenManuell.current = true; setzeAktivesObjekt((objekt) => ({ ...objekt, documentData: aktualisierer(objekt.documentData) })); }
                    }
                    onUpload={unterlagenHochladen}
                    onRemove={unterlageEntfernen}
                    kiAuslesung={kiAnzeige?.objektIndex === sicherIndex ? kiAnzeige : sicherIndex === eigenerIndex ? autoAuslesung : null}
                    onFelderAuslesen={felderAuslesen}
                    onFelderUebernehmen={felderUebernehmen}
                    onKiSchliessen={() => { setKiAuslesung(null); setAutoListeZu(true); }}
                    onZuruecknehmen={zuruecknehmen}
                  />
                )}
                {bereich === "finanzierung" && <EingabeFinanzierung {...eingabeProps} />}
                {bereich === "ertrag" && <EingabeErtrag {...eingabeProps} />}
                {bereich === "steuer" && <EingabeSteuer {...eingabeProps} />}
                {bereich === "expose" && (
                  <EingabeExpose
                    photos={photos}
                    onPhotoUpload={fotosHochladen}
                    onPhotoDateien={fotosAufnehmen}
                    onSortPhotos={fotosUmsortieren}
                    onRemovePhoto={(index) => {
                      fotosAngefasst.current = true;
                      setzeAktivesObjekt((objekt) => ({
                        ...objekt,
                        photos: objekt.photos.filter((_, i) => i !== index),
                      }));
                    }}
                    hinweis={fotoHinweis}
                    onOpenPreview={() => {
                      setAnsicht("expose");
                      rolleSeiteNachOben();
                    }}
                  />
                )}
              </div>
            </aside>

            <section className="result-panel">
              <div className="result-header">
                {ansicht === "vergleich" ? (
                  <div>
                    <span className="eyebrow">{input.clientName || "Kundenberechnung"}</span>
                    <h2>Zwei Objekte im Vergleich</h2>
                    <p>Gleiche Steuerbasis, gleiche Laufzeit von {input.forecastYears} Jahren</p>
                  </div>
                ) : (
                  <div>
                    <span className="eyebrow">
                      {input.clientName || "Kundenberechnung"}
                      {vergleichAktiv ? ` · ${objektMarke(sicherIndex)}` : ""}
                    </span>
                    <h2>{input.propertyTitle || "Neue Investmentkalkulation"}</h2>
                    <p>{input.address || "Adresse ergänzen"}</p>
                  </div>
                )}
                <div className="view-toggle" role="tablist" aria-label="Ansicht wählen">
                  <button className={ansicht === "analyse" ? "active" : ""} onClick={() => setAnsicht("analyse")}>
                    <Calculator size={16} /> Analyse
                  </button>
                  {vergleichAktiv && (
                    <button className={ansicht === "vergleich" ? "active" : ""} onClick={() => setAnsicht("vergleich")}>
                      <Scale size={16} /> Vergleich
                    </button>
                  )}
                  {/*
                    Heisst seit dem 22.09.2026 "Berechnung", siehe der Knopf
                    zum Herunterladen weiter oben. Der interne Name der Ansicht
                    bleibt "expose", er steht nirgends auf dem Bildschirm.
                  */}
                  <button className={ansicht === "expose" ? "active" : ""} onClick={() => setAnsicht("expose")}>
                    <ReceiptText size={16} /> Berechnung
                  </button>
                </div>
              </div>
              {ansicht === "analyse" && (
                <Analyse
                  input={input}
                  result={result}
                  documents={documents}
                  documentData={documentData}
                  onOpenDocuments={() => setBereich("unterlagen")}
                  deckblatt={deckblatt}
                  onDeckblatt={waehleDeckblatt}
                />
              )}
              {ansicht === "vergleich" && vergleichAktiv && (
                <Vergleichsansicht
                  a={{ eingabe: objekte[0].eingabe, ergebnis: ergebnisse[0] }}
                  b={{ eingabe: objekte[1].eingabe, ergebnis: ergebnisse[1] }}
                />
              )}
              {ansicht === "expose" && (
                <div className="expose-preview-wrap">
                  {/*
                    Hier stand eine Leiste "Druckfertige Vorschau" mit einem
                    zweiten Knopf "Als PDF speichern". Christian hat sie am
                    21.09.2026 entfernen lassen: Derselbe Befehl steht schon
                    oben in der Kopfzeile, und zwei Knoepfe fuer dieselbe Sache
                    auf einem Bildschirm lassen den Nutzer ueberlegen, ob sie
                    wirklich dasselbe tun.

                    Seit dem 07.10.2026 steht hier nur die Wahl des Deckblatts.
                    Sie gilt für die Vorschau und für den Knopf oben.
                  */}
                  <DeckblattWahl
                    wert={deckblatt}
                    onWahl={waehleDeckblatt}
                    hinweis="Gilt für die Vorschau, für „Berechnung herunterladen“ und für die Analyse. Die Seiten danach sind bei beiden gleich."
                  />
                  <ExposeVorschau>{exposeInhalt(false)}</ExposeVorschau>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/*
        Druckdokument: Das Original rendert ein verstecktes Exposé neben der
        App und blendet beim Drucken die App aus. Im CRM liegt es per Portal
        direkt im body, damit der Druck die Seitenleiste und den Rest der
        Oberfläche nicht mitnimmt. Bei zwei Objekten druckt es dieselben
        fünfzehn Seiten, die auch die Vorschau zeigt.
      */}
      {createPortal(
        <div ref={druckdokumentRef} className="investmentrechner investmentrechner-print print-only">
          <style>{"@page { size: A4 portrait; margin: 0; }"}</style>
          {exposeInhalt(true)}
        </div>,
        document.body,
      )}
    </>
  );
}
