import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { OBJEKTSEITE_KUNDEN_TEXTE, type ObjektseiteKundenTexte } from "@/components/objektseite/objektseiteKundenTexte";
import { ChevronDown, Download, ExternalLink, FileArchive, FileText, FolderArchive, Image as ImageIcon, Loader2, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useOptionalUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useReduzierteBewegung } from "@/hooks/useReduzierteBewegung";
import { useUnterlagenZip, type ZipLauf } from "@/hooks/useUnterlagenZip";
import { confirmDialog } from "@/lib/confirm";
import { dateiArt, dateiEndung, downloadDateiname, gruppiereDokumente, liegtAufFremdemServer } from "@/lib/dokumentGruppen";
import { darfDokumentFreigeben } from "@/lib/dokumentFreigabeRollen";
import { FREIGABE_MIGRATION, setzeKundenFreigabe } from "@/lib/dokumentFreigabeStore";
import { freigabeVonEintrag, type EinheitUnterlage } from "@/lib/objektUnterlagenRegeln";
import { adresseHerunterladen, resolveUnterlagenUrl, unterlageHerunterladen } from "@/lib/storage";
import { siehtAdminOnlyNavigation } from "@/lib/sidebarPermissions";
import { darfUnterlagenAlsZip, wohnungsNummer, zipDateiname, zipDateienAusBereichen } from "@/lib/unterlagenZip";
import { cn } from "@/lib/utils";
import { darfZumKunden, dokumentAmpel, type Ampel } from "../../../supabase/functions/_shared/dokument-freigabe";
import { GrundrissAusPdfDialog, type GrundrissUebernahme } from "./GrundrissAusPdfDialog";

/**
 * Der Reiter „Dokumente" auf Objekt- und Einheitsseite.
 *
 * Christians Vorgabe vom 23.09.2026: links oben der Umschalter zwischen den
 * Dokumenten zum Objekt und denen zur Wohnung, darunter die Liste nach
 * Oberbegriffen in aufklappbaren Gruppen, rechts die Vorschau. Ein Klick auf
 * ein Dokument zeigt es rechts sofort, und rechts ist nie leer: Beim Öffnen
 * ist das erste Dokument der ersten Gruppe ausgewählt. Nur diese erste Gruppe
 * ist aufgeklappt, sie zeigt, woher die Vorschau kommt; die übrigen stehen
 * zugeklappt mit ihrer Anzahl darunter, so passt auch ein Haus mit dreißig
 * Dateien auf einen Blick.
 *
 * Gibt es nur einen Bereich (die Objektseite, oder eine Wohnung ohne eigene
 * Dateien), steht statt des Umschalters nur seine Überschrift. Ein Regler mit
 * einem einzigen Eintrag wäre ein Knopf, der nichts tut.
 *
 * Wie die Vorschau an die Datei kommt: Objekt- und Wohnungsunterlagen liegen
 * in geschützten Eimern, gespeichert ist nur ein Zeiger. Erst beim Auswählen
 * entsteht über `resolveUnterlagenUrl` eine befristete Adresse, genau wie
 * früher beim Klick auf „Ansehen". Eine PDF steht dann in einem `iframe`, ein
 * Bild als Bild. `object` und `embed` scheiden aus, die sperrt die
 * Sicherheitsrichtlinie der Seite (`object-src 'none'`).
 *
 * Die Dokumenten-Ampel (Christian, 23.09.2026): Wer freigeben darf, sieht
 * unter der Vorschau je Dokument „Für Kunden: frei / gesperrt", bei
 * Mietvertrag und Grundbuch zusätzlich „geschwärzt geprüft", dazu die
 * Ampelfarbe. Wer darf, sagt `darfDokumentFreigeben`: Admin und Inhaber
 * immer, dazu die in der Nutzerverwaltung gewählten Rollen. Geschrieben wird
 * über `dokumentFreigabeStore`, maßgeblich sind die Datenbankfunktion und ihr
 * Auslöser, nicht dieser Schalter.
 *
 * Im Kundenmodus (Kundenansicht) fällt alles Interne weg: keine Kennzeichen,
 * kein Sammelordner, keine Schalter, nur was `darfZumKunden` erlaubt. Die
 * Adressen holt die Komponente dann ausschließlich über `adresseLaden`, nie
 * über die Anmeldung des Betrachters.
 */

export interface DokumentBereich {
  schluessel: string;
  /** Beschriftung im Umschalter, etwa „Dokumente zum Objekt". */
  titel: string;
  eintraege: EinheitUnterlage[];
  /** Ein gepflegter Sammelordner, falls es einen gibt. Im Kundenmodus nie gezeigt. */
  link?: string;
  linkLabel?: string;
  /**
   * Nur im Kundenmodus: Es gibt in diesem Bereich rote Unterlagen
   * (Mietvertrag, Grundbuch), die nicht hinausgehen. Der Server muss sie dafür
   * nicht mitschicken, nicht einmal mit Namen; dieses Kennzeichen genügt für
   * den Hinweissatz. Liegen gesperrte rote Einträge in `eintraege`, erscheint
   * der Satz auch ohne dieses Kennzeichen.
   */
  rotZurueckgehalten?: boolean;
}

/** Die Tabelle, aus der ein Eintrag stammt. */
export type DokumentTabelle = "objekt_dokumente" | "wohnungs_dokumente";

/**
 * Holt im Kundenmodus die befristete Adresse einer Datei, etwa über
 * `get-kundenansicht`. `null` heißt: gibt es nicht (mehr).
 */
export type DokumentAdresseLaden = (eintrag: { id: string; tabelle: DokumentTabelle }) => Promise<string | null>;

export interface DokumenteAnsichtProps {
  bereiche: DokumentBereich[];
  /**
   * Die Einheitsseite hat die ganze Breite, dort reicht `lg`. Auf der
   * Objektseite steht die Ansicht in der Galerie neben der Seitenleiste und
   * braucht mehr Platz, bevor sich zwei Spalten lohnen.
   */
  nebeneinanderAb?: "lg" | "xl";
  /** Für die Kundenansicht: nichts Internes, nur freigegebene Unterlagen. */
  kundenModus?: boolean;
  /** Im Kundenmodus der einzige Weg zu Vorschau- und Download-Adresse. */
  adresseLaden?: DokumentAdresseLaden;
  /**
   * Objekt und Einheiten für „Grundriss aus PDF übernehmen“. Ohne Angabe
   * (etwa in der Kundenansicht) gibt es den Knopf nicht.
   */
  grundrissUebernahme?: GrundrissUebernahme;
  /**
   * Für „Als ZIP herunterladen“: Objekttitel und, auf der Einheitsseite, die
   * Wohnungsnummer für Dateinamen und Ordner. Ohne Angabe gibt es die Knöpfe
   * nicht, im Kundenmodus nie.
   */
  zip?: { objektTitel: string; weNr?: string | number | null };
}

/** Der Satz, wenn Mietvertrag oder Grundbuch zurückgehalten werden. */
export const ROT_HINWEIS = OBJEKTSEITE_KUNDEN_TEXTE.de.dokumente.rotHinweis;

type Entscheidung = { kundenFreigabe: "frei" | "gesperrt" | null; geschwaerzt: boolean };

function tabelleVon(d: EinheitUnterlage, bereichSchluessel: string): DokumentTabelle {
  return d.tabelle ?? (bereichSchluessel === "wohnung" ? "wohnungs_dokumente" : "objekt_dokumente");
}

/** Im Kundenmodus: Darf der Eintrag gezeigt werden? Beide Angaben müssen es erlauben. */
function kundeDarf(d: EinheitUnterlage): boolean {
  return d.kundeSieht === true && darfZumKunden(freigabeVonEintrag(d));
}

function rotGesperrt(d: EinheitUnterlage): boolean {
  const f = freigabeVonEintrag(d);
  return dokumentAmpel(f) === "rot" && !darfZumKunden(f);
}

/** Ab welcher Breite Liste und Vorschau nebeneinander stehen. Feste Klassen, sonst findet Tailwind sie nicht. */
const RASTER = {
  lg: "lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]",
  xl: "xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]",
} as const;

/** Dieselbe Grenze als Medienabfrage: darunter liegt die Vorschau unter der Liste. */
const UNTEREINANDER = {
  lg: "(max-width: 1023px)",
  xl: "(max-width: 1279px)",
} as const;

type Vorschau =
  | { fuer: string; status: "bereit"; url: string }
  | { fuer: string; status: "fehler" };

export function DokumenteAnsicht({ bereiche: roheBereiche, nebeneinanderAb = "lg", kundenModus = false, adresseLaden, grundrissUebernahme, zip }: DokumenteAnsichtProps) {
  // Kundensprache, Etappe 3: auf Kundenseiten in deren Sprache, im CRM Deutsch.
  const sprache = useAnzeigeSprache();
  const dt = OBJEKTSEITE_KUNDEN_TEXTE[sprache].dokumente;
  const reduzierteBewegung = useReduzierteBewegung();
  const nutzer = useOptionalUser();
  // Ändert jemand in der Nutzerverwaltung, wer freigeben darf, zeichnet die Ansicht neu.
  useLiveVersion(["app_config"]);
  // Admin und Inhaber immer, dazu die eingestellten Rollen. Nie im Kundenmodus.
  const darfFreigeben = !kundenModus && darfDokumentFreigeben(nutzer?.user?.role);
  /*
   * „Grundriss aus PDF übernehmen“ nur für Admin und Inhaber, dieselbe Regel
   * wie für die Pflege auf Objekt- und Einheitsseite. Speichern schützt
   * zusätzlich die Datenbank: Unterlagen anlegen dürfen nur interne Rollen,
   * einen alten Plan ersetzen (löschen) nur Admin und Inhaber.
   */
  const darfGrundrissUebernehmen = !kundenModus && !!grundrissUebernahme && siehtAdminOnlyNavigation(nutzer?.user?.role);
  const [grundrissAus, setGrundrissAus] = useState<{ name: string; url: string; wohnungId?: string } | null>(null);
  // Was hier gerade umgeschaltet wurde, bis die Seite neue Daten liefert.
  const [entscheidungen, setEntscheidungen] = useState<Record<string, Entscheidung>>({});
  const [arbeitetAn, setArbeitetAn] = useState<string | null>(null);

  const bereiche = roheBereiche.map((b) => {
    if (kundenModus) {
      return {
        ...b,
        link: undefined,
        eintraege: b.eintraege.filter(kundeDarf),
        rotHinweis: b.rotZurueckgehalten === true || b.eintraege.some(rotGesperrt),
      };
    }
    return {
      ...b,
      rotHinweis: false,
      eintraege: b.eintraege.map((e) => {
        const neu = entscheidungen[`${tabelleVon(e, b.schluessel)}:${e.id}`];
        if (!neu) return e;
        const mit = { ...e, ...neu };
        return { ...mit, kundeSieht: darfZumKunden(freigabeVonEintrag(mit)) };
      }),
    };
  });

  const [bereichSchluessel, setBereichSchluessel] = useState(bereiche[0]?.schluessel);
  // Verschwindet der gewählte Bereich (etwa nach dem Löschen der letzten Datei), springt die Ansicht zurück.
  const bereich = bereiche.find((b) => b.schluessel === bereichSchluessel) ?? bereiche[0];
  const gruppen = gruppiereDokumente(bereich?.eintraege ?? []);
  const alle = gruppen.flatMap((g) => g.eintraege);

  const [auswahlId, setAuswahlId] = useState<string>();
  // Ist das gewählte Dokument weg, gilt wieder das erste: rechts bleibt nie leer.
  const ausgewaehlt = alle.find((d) => d.id === auswahlId) ?? alle[0];

  // `null` heißt: noch niemand hat auf- oder zugeklappt, also ist die erste Gruppe offen.
  const [offen, setOffen] = useState<Set<string> | null>(null);
  const offeneGruppen = offen ?? new Set(gruppen[0] ? [gruppen[0].oberbegriff] : []);

  const [vorschau, setVorschau] = useState<Vorschau>();
  const [versuch, setVersuch] = useState(0);
  const [bildFehler, setBildFehler] = useState(false);
  const [laedtHerunter, setLaedtHerunter] = useState<string | null>(null);
  const vorschauRef = useRef<HTMLElement | null>(null);
  const { lauf: zipLauf, starten: zipStarten, abbrechen: zipAbbrechen } = useUnterlagenZip();

  /*
   * Woher die Adresse kommt: intern über die Anmeldung (`resolveUnterlagenUrl`),
   * im Kundenmodus ausschließlich über `adresseLaden`. Fehlt die Funktion
   * dort, gibt es keine Vorschau, statt still auf die Anmeldung auszuweichen.
   * Die Funktion steht in einer Ref, damit eine neue Funktion bei jedem
   * Zeichnen der Seite nicht jedes Mal neu lädt.
   */
  const adresseLadenRef = useRef(adresseLaden);
  adresseLadenRef.current = adresseLaden;
  const gewaehlteTabelle = ausgewaehlt && bereich ? tabelleVon(ausgewaehlt, bereich.schluessel) : undefined;
  const gewaehlteId = ausgewaehlt?.id;
  const auswahlUrl = ausgewaehlt?.url;
  const auswahlSchluessel = kundenModus
    ? (gewaehlteId && gewaehlteTabelle ? `${gewaehlteTabelle}:${gewaehlteId}` : undefined)
    : auswahlUrl;
  useEffect(() => {
    if (!auswahlSchluessel) return;
    let aktiv = true;
    setBildFehler(false);
    const laden = kundenModus
      ? (adresseLadenRef.current && gewaehlteId && gewaehlteTabelle
        ? adresseLadenRef.current({ id: gewaehlteId, tabelle: gewaehlteTabelle })
        : Promise.resolve(null))
      : resolveUnterlagenUrl(auswahlSchluessel);
    laden
      .then((url) => {
        if (aktiv) setVorschau(url ? { fuer: auswahlSchluessel, status: "bereit", url } : { fuer: auswahlSchluessel, status: "fehler" });
      })
      .catch(() => {
        if (aktiv) setVorschau({ fuer: auswahlSchluessel, status: "fehler" });
      });
    return () => { aktiv = false; };
  }, [auswahlSchluessel, gewaehlteId, gewaehlteTabelle, kundenModus, versuch]);

  if (!bereich) return null;

  // Eine Antwort für ein vorher gewähltes Dokument zählt nicht, bis die neue da ist.
  const aktuelleVorschau = vorschau && vorschau.fuer === auswahlSchluessel ? vorschau : undefined;
  // Die Adresse, an der Art und Herkunft der Datei hängen. Im Kundenmodus
  // kennt die Liste keine Adresse, dort zählt erst die geladene.
  const dateiAdresse = kundenModus ? (aktuelleVorschau?.status === "bereit" ? aktuelleVorschau.url : "") : (ausgewaehlt?.url ?? "");
  // Lässt sich die Datei einbetten, steht „In neuem Tab öffnen" oben am Kopf.
  // Sonst trägt ihn der Hinweis in der Vorschau, einmal genügt.
  const einbettbar = !!ausgewaehlt && !liegtAufFremdemServer(dateiAdresse)
    && (dateiArt(dateiAdresse, ausgewaehlt.name) === "pdf" || (dateiArt(dateiAdresse, ausgewaehlt.name) === "bild" && !bildFehler));

  const wechsleBereich = (schluessel: string) => {
    if (schluessel === bereich.schluessel) return;
    setBereichSchluessel(schluessel);
    setAuswahlId(undefined);
    setOffen(null);
  };

  const setzeOffen = (oberbegriff: string, auf: boolean) => {
    const neu = new Set(offeneGruppen);
    if (auf) neu.add(oberbegriff); else neu.delete(oberbegriff);
    setOffen(neu);
  };

  const waehle = (d: EinheitUnterlage) => {
    setAuswahlId(d.id);
    /*
     * Liegt die Vorschau unter der Liste (Handy, schmales Fenster), sähe man
     * nach dem Klick sonst gar nichts passieren. Nebeneinander steht sie
     * schon im Blick, dort wird nicht gescrollt.
     */
    const el = vorschauRef.current;
    const untereinander = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(UNTEREINANDER[nebeneinanderAb]).matches;
    if (el && untereinander && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: reduzierteBewegung ? "auto" : "smooth", block: "start" });
    }
  };

  const herunterladen = async (d: EinheitUnterlage) => {
    setLaedtHerunter(d.id);
    const fehler = dt.fehlerHerunterladen;
    try {
      let ok = false;
      if (kundenModus) {
        const url = adresseLaden ? await adresseLaden({ id: d.id, tabelle: tabelleVon(d, bereich.schluessel) }) : null;
        ok = !!url && await adresseHerunterladen(url, downloadDateiname(d.name, url));
      } else {
        ok = await unterlageHerunterladen(d.url, downloadDateiname(d.name, d.url));
      }
      if (!ok) toast.error(fehler);
    } catch {
      toast.error(fehler);
    } finally {
      setLaedtHerunter(null);
    }
  };

  const freigabeSetzen = async (d: EinheitUnterlage, freigabe: "frei" | "gesperrt" | null, geschwaerzt: boolean) => {
    if (!d.tabelle) return;
    const schluessel = `${d.tabelle}:${d.id}`;
    setArbeitetAn(schluessel);
    try {
      const ergebnis = await setzeKundenFreigabe(d.tabelle, d.id, freigabe, geschwaerzt);
      if (ergebnis.ok === false) {
        toast.error(ergebnis.text);
        return;
      }
      const neu: Entscheidung = { kundenFreigabe: ergebnis.kundenFreigabe, geschwaerzt: ergebnis.geschwaerzt };
      setEntscheidungen((alt) => ({ ...alt, [schluessel]: neu }));
      toast.success(darfZumKunden(freigabeVonEintrag({ ...d, ...neu })) ? "Kunden sehen diese Unterlage." : "Kunden sehen diese Unterlage nicht.");
    } finally {
      setArbeitetAn(null);
    }
  };

  const schwaerzungSetzen = async (d: EinheitUnterlage, geprueft: boolean) => {
    if (geprueft) {
      const bestaetigt = await confirmDialog({
        title: "Als geschwärzt geprüft markieren?",
        description: "Markiere nur eine Kopie, in der du selbst geprüft hast, dass Namen, Anschriften, Geburtsdaten und Kontodaten von Mietern und Eigentümern geschwärzt sind. Freigegeben ist sie damit noch nicht, das machst du danach mit „frei“.",
        confirmText: "Als geprüft markieren",
        cancelText: "Nicht markieren",
      });
      if (!bestaetigt) return;
    }
    await freigabeSetzen(d, d.kundenFreigabe ?? null, geprueft);
  };

  /*
   * Als ZIP herunterladen (Christian, 24.09.2026): für alle internen Rollen,
   * nie im Kundenmodus. Hinein kommt genau, was die Liste zeigt und einzeln
   * herunterladen lässt; die Dateien holt `useUnterlagenZip` über denselben
   * Weg wie den Einzeldownload. Der Knopf im Kopf gilt dem gerade gezeigten
   * Bereich. Gibt es zwei Bereiche (Einheitsseite), packt „Alles als ZIP“
   * beide in die Ordner „Objekt“ und „Wohnung <Nr>“.
   */
  const rolle = nutzer?.user?.role;
  const zipErlaubt = !kundenModus && !!zip && darfUnterlagenAlsZip(rolle);
  const weNr = wohnungsNummer(zip?.weNr);
  const zipBereichDateien = zipErlaubt ? zipDateienAusBereichen([bereich], rolle) : [];
  const zipAlleDateien = zipErlaubt && bereiche.length > 1
    ? zipDateienAusBereichen(bereiche, rolle, (s) => (s === "wohnung" ? (weNr ? `Wohnung ${weNr}` : "Wohnung") : "Objekt"))
    : [];
  const zipBereichLaden = () => {
    if (!zip) return;
    // Auf der Einheitsseite sagt der Name, welcher Teil darin ist.
    const zusatz = bereiche.length > 1 ? (bereich.schluessel === "wohnung" ? "Wohnung" : "Objekt") : undefined;
    void zipStarten("bereich", zipBereichDateien, zipDateiname({
      objektTitel: zip.objektTitel,
      weNr: bereich.schluessel === "wohnung" ? weNr : undefined,
      zusatz,
    }));
  };
  const zipAllesLaden = () => {
    if (!zip) return;
    void zipStarten("alles", zipAlleDateien, zipDateiname({ objektTitel: zip.objektTitel, weNr }));
  };

  const segmentKlasse = (aktiv: boolean) =>
    cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-center text-sm font-medium leading-tight transition-colors sm:flex-none",
      aktiv ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {bereiche.length > 1 ? (
          <div role="group" aria-label={dt.gruppe} className="flex w-full gap-1 rounded-xl bg-muted p-1 sm:w-auto">
            {bereiche.map((b) => {
              const aktiv = b.schluessel === bereich.schluessel;
              return (
                <button key={b.schluessel} type="button" aria-pressed={aktiv} className={segmentKlasse(aktiv)} onClick={() => wechsleBereich(b.schluessel)}>
                  {b.titel}
                  <span className="text-xs tabular-nums text-muted-foreground">{b.eintraege.length}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {bereich.titel}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{alle.length} {dt.datei(alle.length)}</span>
          </h3>
        )}
        {((!kundenModus && bereich.link) || zipErlaubt) && (
          <div className="flex flex-wrap gap-2">
            {!kundenModus && bereich.link && (
              <Button asChild size="sm" variant="outline" className="gap-1.5 max-md:min-h-[40px]">
                <a href={bereich.link} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> {bereich.linkLabel || "Sammelordner öffnen"}</a>
              </Button>
            )}
            {zipErlaubt && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5 max-md:min-h-[40px]"
                title={`${bereich.titel} als ZIP herunterladen`}
                disabled={!!zipLauf || zipBereichDateien.length === 0} onClick={zipBereichLaden}>
                {zipLauf?.art === "bereich" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />} Als ZIP herunterladen
              </Button>
            )}
            {zipErlaubt && bereiche.length > 1 && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5 max-md:min-h-[40px]"
                title={`Objekt und Wohnung${weNr ? ` ${weNr}` : ""} zusammen, in zwei Ordnern`}
                disabled={!!zipLauf || zipAlleDateien.length === 0} onClick={zipAllesLaden}>
                {zipLauf?.art === "alles" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderArchive className="h-3.5 w-3.5" />} Alles als ZIP
              </Button>
            )}
          </div>
        )}
      </div>

      {zipLauf && <ZipFortschrittsZeile lauf={zipLauf} onAbbrechen={zipAbbrechen} />}

      {alle.length === 0 || !ausgewaehlt ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
          {kundenModus ? dt.leerKunde : "Hier liegen keine einzelnen Dateien, nur der Sammelordner."}
        </p>
      ) : (
        <div className={cn("grid gap-4", RASTER[nebeneinanderAb])}>
          <nav aria-label={dt.liste} className="min-w-0 space-y-2">
            {gruppen.map((g) => (
              <Collapsible key={g.oberbegriff} open={offeneGruppen.has(g.oberbegriff)} onOpenChange={(auf) => setzeOffen(g.oberbegriff, auf)}
                className="overflow-hidden rounded-xl border border-border/60 bg-card">
                <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                  <span className="min-w-0 flex-1">{dt.oberbegriffe[g.oberbegriff] ?? g.oberbegriff}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{g.eintraege.length}</span>
                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="divide-y divide-border/60 border-t border-border/60">
                    {g.eintraege.map((d) => {
                      const aktiv = d.id === ausgewaehlt.id;
                      const DateiSymbol = dateiArt(d.url, d.name) === "bild" ? ImageIcon : FileText;
                      return (
                        <li key={d.id} className={cn("flex items-start gap-1 pr-1", aktiv && "bg-accent")}>
                          <button type="button" aria-current={aktiv ? "true" : undefined} onClick={() => waehle(d)}
                            className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                            <DateiSymbol aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className={cn("block break-words leading-snug", aktiv ? "font-semibold" : "font-medium")}>{d.name}</span>
                              {!kundenModus && <Kennzeichen d={d} mitAmpel={darfFreigeben} />}
                            </span>
                          </button>
                          <Button type="button" variant="ghost" size="icon" className="mt-1 h-[40px] w-[40px] shrink-0 text-muted-foreground hover:text-foreground sm:h-8 sm:w-8"
                            aria-label={dt.herunterladenVon(d.name)} title={dt.herunterladen} disabled={laedtHerunter === d.id}
                            onClick={() => void herunterladen(d)}>
                            {laedtHerunter === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </nav>

          <section data-ui={kundenModus ? undefined : "card"} ref={vorschauRef} aria-label={dt.vorschau} className="min-w-0 scroll-mt-20 overflow-hidden rounded-xl border border-border/60 bg-card">
            {/*
              Auf dem Handy steht der Dateiname oben über die ganze Breite, die
              Knöpfe darunter. Vorher hatte der Name nur `flex-1`, also eine
              Grundbreite von null: Die Zeile brach deshalb nie um, die Knöpfe
              nahmen den Platz, und ein langer Name wie „OdW_Stralsund_…“
              stand Buchstabe für Buchstabe untereinander (Christian,
              23.09.2026). `[overflow-wrap:anywhere]` bricht Namen ohne
              Leerzeichen an der Kante statt über sie hinaus.
            */}
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-3 py-2" data-testid="vorschau-kopf">
              <div className="min-w-0 flex-1 basis-full sm:basis-0" data-testid="vorschau-dateiname">
                <div className="text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{ausgewaehlt.name}</div>
                {!kundenModus && <Kennzeichen d={ausgewaehlt} mitAmpel={darfFreigeben} />}
              </div>
              <div className="flex flex-wrap gap-2">
                {aktuelleVorschau?.status === "bereit" && einbettbar && (
                  <Button asChild size="sm" variant="outline" className="gap-1.5 max-md:min-h-[40px]">
                    <a href={aktuelleVorschau.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> {dt.neuerTab}</a>
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" className="h-[40px] gap-1.5 sm:h-9" disabled={laedtHerunter === ausgewaehlt.id} onClick={() => void herunterladen(ausgewaehlt)}>
                  {laedtHerunter === ausgewaehlt.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {dt.herunterladen}
                </Button>
              </div>
            </div>
            {/*
              Eine eigene schmale Zeile statt eines dritten Knopfs im Kopf: Dort
              hätte er den Dateinamen bei mittlerer Breite auf wenige Buchstaben
              je Zeile zusammengedrückt. Nur bei einer PDF aus dem eigenen
              Speicher, eine Datei bei Investagon wird nie geladen.
            */}
            {darfGrundrissUebernehmen && dateiArt(ausgewaehlt.url, ausgewaehlt.name) === "pdf" && !liegtAufFremdemServer(ausgewaehlt.url) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-3 py-2">
                <Button type="button" size="sm" variant="outline" className="h-[40px] gap-1.5 sm:h-9" data-testid="grundriss-aus-pdf-knopf"
                  onClick={() => setGrundrissAus({ name: ausgewaehlt.name, url: ausgewaehlt.url, wohnungId: bereich.schluessel === "wohnung" ? grundrissUebernahme?.wohnungId : undefined })}>
                  <ImageIcon className="h-3.5 w-3.5" /> Grundriss aus PDF übernehmen
                </Button>
                <span className="text-[11px] leading-snug text-muted-foreground">Eine Seite dieser PDF als Grundriss einer Einheit oder des Hauses speichern.</span>
              </div>
            )}
            {darfFreigeben && (
              <FreigabeSteuerung
                d={ausgewaehlt}
                arbeitet={arbeitetAn === `${ausgewaehlt.tabelle}:${ausgewaehlt.id}`}
                onFreigabe={(freigabe) => void freigabeSetzen(ausgewaehlt, freigabe, ausgewaehlt.geschwaerzt === true)}
                onSchwaerzung={(geprueft) => void schwaerzungSetzen(ausgewaehlt, geprueft)}
              />
            )}
            <VorschauInhalt
              dokument={ausgewaehlt}
              dateiAdresse={dateiAdresse}
              vorschau={aktuelleVorschau}
              bildFehler={bildFehler}
              onBildFehler={() => setBildFehler(true)}
              onErneut={() => { setVorschau(undefined); setVersuch((n) => n + 1); }}
              dt={dt}
            />
          </section>
        </div>
      )}

      {kundenModus && bereich.rotHinweis && (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{dt.rotHinweis}</p>
      )}

      {darfGrundrissUebernehmen && grundrissUebernahme && grundrissAus && (
        <GrundrissAusPdfDialog
          offen
          onOpenChange={(auf) => { if (!auf) setGrundrissAus(null); }}
          quelle={grundrissAus}
          uebernahme={grundrissUebernahme}
          vorbelegteWohnungId={grundrissAus.wohnungId}
        />
      )}
    </div>
  );
}

/** Fortschritt und Abbrechen, solange eine ZIP-Datei entsteht. */
function ZipFortschrittsZeile({ lauf, onAbbrechen }: { lauf: ZipLauf; onAbbrechen: () => void }) {
  const packt = lauf.gesamt > 0 && lauf.fertig >= lauf.gesamt;
  const prozent = lauf.gesamt > 0 ? Math.round((lauf.fertig / lauf.gesamt) * 100) : 0;
  return (
    <div data-ui="card" data-testid="zip-fortschritt" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-card px-3 py-2">
      <span role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-medium tabular-nums text-foreground">
        <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        {packt ? "ZIP-Datei wird gepackt…" : `${lauf.fertig} von ${lauf.gesamt} Dateien`}
      </span>
      {/* Auf dem Handy liegt der Balken unter Zähler und Abbrechen, über die ganze Breite. */}
      <Progress value={prozent} aria-label="Fortschritt der ZIP-Datei" className="order-last h-1.5 basis-full sm:order-none sm:min-w-[120px] sm:flex-1 sm:basis-0" />
      <Button type="button" size="sm" variant="ghost" className="ml-auto gap-1.5 max-md:min-h-[40px]" onClick={onAbbrechen}>
        <X className="h-3.5 w-3.5" /> Abbrechen
      </Button>
    </div>
  );
}

/**
 * Wer die Unterlage sieht, klein unter dem Namen.
 *
 * Seit dem 24.09.2026 nur noch eine Aussage: „Für Kunden freigegeben“ oder
 * „Nur im CRM“. Vorher stand davor die Kategorie „Intern“, und bei Dateien
 * aus Investagon las sich das als „Intern · Kunde sieht“, ein Widerspruch in
 * einer Zeile. Die Kategorie sagt nicht, wer die Datei sieht, das tut allein
 * die Ampel (`darfZumKunden`).
 */
function Kennzeichen({ d, mitAmpel = false }: { d: EinheitUnterlage; mitAmpel?: boolean }) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] leading-tight text-muted-foreground">
      {mitAmpel && <AmpelPunkt ampel={d.ampel ?? dokumentAmpel(freigabeVonEintrag(d))} />}
      <span className={d.kundeSieht ? "text-[hsl(var(--success))]" : undefined}>{d.kundeSieht ? KENNZEICHEN_KUNDE : KENNZEICHEN_CRM}</span>
    </span>
  );
}

const KENNZEICHEN_KUNDE = "Für Kunden freigegeben";
const KENNZEICHEN_CRM = "Nur im CRM";

const AMPEL_TEXT: Record<Ampel, string> = { gruen: "grün", gelb: "gelb", rot: "rot" };
const AMPEL_FARBE: Record<Ampel, string> = {
  gruen: "bg-[hsl(var(--success))]",
  gelb: "bg-[hsl(var(--warning))]",
  rot: "bg-destructive",
};

/** Die Ampelfarbe als kleiner Punkt, mit Text für Screenreader. */
function AmpelPunkt({ ampel }: { ampel: Ampel }) {
  return (
    <span className="inline-flex items-center" title={`Ampel ${AMPEL_TEXT[ampel]}`}>
      <span aria-hidden="true" className={cn("inline-block h-2 w-2 shrink-0 rounded-full opacity-80", AMPEL_FARBE[ampel])} />
      <span className="sr-only">Ampel {AMPEL_TEXT[ampel]}</span>
    </span>
  );
}

/** Der Satz unter dem Schalter, je nach Lage. */
function freigabeErklaerung(d: EinheitUnterlage, ampel: Ampel): string {
  if (d.freigabeSchalter === "migration_fehlt") {
    return `Umschalten geht erst nach der Migration ${FREIGABE_MIGRATION}. Bis dahin gilt die Grundregel der Ampel.`;
  }
  if (d.freigabeSchalter !== "bereit") {
    return "Diese Datei hängt direkt an der Wohnung und steht nicht in der Dokumententabelle. Umschalten geht hier nicht, es gilt die Grundregel der Ampel.";
  }
  if (ampel === "rot") {
    return "Mietvertrag und Grundbuch gehen nie im Original hinaus. Freigeben lässt sich nur eine Kopie, die du als geschwärzt geprüft markiert hast.";
  }
  if (d.kundenFreigabe) return "Von dir entschieden. „Grundregel“ setzt die Ampel wieder ein.";
  return ampel === "gruen"
    ? "Grün: geht von selbst an Kunden, du kannst sperren."
    : "Gelb: geht erst nach deiner Freigabe an Kunden.";
}

/**
 * Der Schalter „Für Kunden: frei / gesperrt" unter dem Kopf der Vorschau,
 * nur für wen `darfDokumentFreigeben` gilt. Bei roten Unterlagen zusätzlich „geschwärzt
 * geprüft"; „frei" geht dort erst, wenn das gesetzt ist.
 */
function FreigabeSteuerung({ d, arbeitet, onFreigabe, onSchwaerzung }: {
  d: EinheitUnterlage;
  arbeitet: boolean;
  onFreigabe: (freigabe: "frei" | "gesperrt" | null) => void;
  onSchwaerzung: (geprueft: boolean) => void;
}) {
  const ampel = d.ampel ?? dokumentAmpel(freigabeVonEintrag(d));
  const bereit = d.freigabeSchalter === "bereit" && !!d.tabelle;
  const rot = ampel === "rot";
  const geschwaerzt = d.geschwaerzt === true;
  const knopf = (aktiv: boolean) => cn(
    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    aktiv ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
  return (
    <div className="space-y-1.5 border-b border-border/60 bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <AmpelPunkt ampel={ampel} /> Für Kunden:
        </span>
        <div role="group" aria-label="Für Kunden" className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
          <button type="button" aria-pressed={d.kundeSieht} className={knopf(d.kundeSieht)}
            disabled={!bereit || arbeitet || (rot && !geschwaerzt)} onClick={() => onFreigabe("frei")}>
            frei
          </button>
          <button type="button" aria-pressed={!d.kundeSieht} className={knopf(!d.kundeSieht)}
            disabled={!bereit || arbeitet} onClick={() => onFreigabe("gesperrt")}>
            gesperrt
          </button>
        </div>
        {rot && (
          <label className="flex items-center gap-1.5 text-xs text-foreground">
            <Checkbox checked={geschwaerzt} disabled={!bereit || arbeitet} onCheckedChange={(wert) => onSchwaerzung(wert === true)} />
            geschwärzt geprüft
          </label>
        )}
        {bereit && d.kundenFreigabe && (
          <button type="button" disabled={arbeitet} onClick={() => onFreigabe(null)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50">
            Grundregel
          </button>
        )}
        {arbeitet && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Wird gespeichert" />}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{freigabeErklaerung(d, ampel)}</p>
    </div>
  );
}

/** Die feste Höhe der Vorschau. Auf dem Handy etwas weniger, damit die Knöpfe darüber im Blick bleiben. */
const VORSCHAU_HOEHE = "h-[60vh] min-h-[320px] sm:h-[70vh] sm:min-h-[420px]";

function VorschauInhalt({ dokument, dateiAdresse, vorschau, bildFehler, onBildFehler, onErneut, dt }: {
  dokument: EinheitUnterlage;
  /** Die Adresse, an der Art und Herkunft der Datei hängen, siehe oben. */
  dateiAdresse: string;
  vorschau?: Vorschau;
  bildFehler: boolean;
  onBildFehler: () => void;
  onErneut: () => void;
  dt: ObjektseiteKundenTexte["dokumente"];
}) {
  if (!vorschau) {
    return (
      <div className={cn("flex items-center justify-center gap-2 text-sm text-muted-foreground", VORSCHAU_HOEHE)}>
        <Loader2 className="h-4 w-4 animate-spin" /> {dt.laedt}
      </div>
    );
  }
  if (vorschau.status === "fehler") {
    return (
      <KeineVorschau text={dt.ladeFehler}>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onErneut}><RotateCw className="h-3.5 w-3.5" /> {dt.erneut}</Button>
      </KeineVorschau>
    );
  }

  const neuerTab = (
    <Button asChild size="sm" variant="outline" className="gap-1.5 max-md:min-h-[40px]">
      <a href={vorschau.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> {dt.neuerTab}</a>
    </Button>
  );
  if (liegtAufFremdemServer(dateiAdresse)) {
    return <KeineVorschau text={dt.fremderServer}>{neuerTab}</KeineVorschau>;
  }
  const art = dateiArt(dateiAdresse, dokument.name);
  if (art === "pdf") {
    return (
      <>
        <iframe src={`${vorschau.url}#view=FitH`} title={dt.vorschauVon(dokument.name)} className={cn("block w-full border-0 bg-muted/30", VORSCHAU_HOEHE)} />
        <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground sm:hidden">
          {dt.handyHinweis}
        </p>
      </>
    );
  }
  if (art === "bild" && !bildFehler) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/30 p-2", VORSCHAU_HOEHE)}>
        <img src={vorschau.url} alt={dokument.name} onError={onBildFehler} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  const endung = (dateiEndung(dateiAdresse) || dateiEndung(dokument.name)).toUpperCase();
  return (
    <KeineVorschau text={bildFehler ? dt.bildFehler : dt.dateiart(endung)}>
      {neuerTab}
    </KeineVorschau>
  );
}

/** Der ruhige Hinweis, wenn sich eine Datei nicht einbetten lässt. Herunterladen steht ohnehin darüber. */
function KeineVorschau({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 text-center", VORSCHAU_HOEHE)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
