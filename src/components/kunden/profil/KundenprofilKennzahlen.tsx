import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowRight, Check, CheckCheck, ChevronDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { faelligkeitText, quelleLabel, type KundenAufgabe } from "@/lib/kundenAufgabenListe";
import {
  aktionArtLabel,
  aktionFaelligkeitText,
  naechsteAktion,
  type GeplanteAktion,
} from "@/lib/kundenNaechsteAktion";
import { abschlussWeg, zeigeSammelweg } from "@/lib/aktionAbschluss";
import type { AmpelTon } from "@/lib/inaktivitaetsAmpel";
import { AMPEL_PUNKT_KLASSEN } from "@/components/kunden/ampelPunkt";

/** Verbindet die Kacheln mit den Listen darunter, für Vorleseprogramme. */
const LISTEN_ID = "kundenprofil-offene-aufgaben";
const AKTIONEN_LISTEN_ID = "kundenprofil-geplante-aktionen";

/** Welche Dialoge "Aktion erstellen" öffnen kann. Beide gibt es schon im Profil. */
export type AktionErstellenArt = "aufgabe" | "meeting";

/** Die Ampel, so wie `berechneInaktivitaetsAmpel` sie liefert. Nur was die Kachel braucht. */
export interface KachelAmpel {
  ton: AmpelTon;
  titel: string;
  kurztext: string | null;
}

interface Props {
  schritt: { titel: string } | null;
  investmentNummer?: number;
  letzter?: { artLabel: string; datum: string };
  aufgabenAnzahl: number;
  ueberfaellig: number;
  onUebersicht: () => void;
  /**
   * Springt in das Investment und hebt dort den Abschnitt "Nächste Schritte"
   * hervor, orange umrandet wie jeder andere Sprung im Profil. Fehlt, solange
   * es kein Investment gibt; dann bleibt es beim Wechsel in die Übersicht.
   */
  onNaechsteSchritte?: () => void;
  onVerlauf: () => void;
  onAufgaben: () => void;
  /** Die offenen Vorgänge dieses Kunden, bereits sortiert. */
  aufgaben: KundenAufgabe[];
  listeOffen: boolean;
  onListeUmschalten: () => void;
  /** Fehlt bei Rollen, die hier nur lesen dürfen. Dann gibt es kein Häkchen. */
  onErledigen?: (eintrag: KundenAufgabe) => void | Promise<void>;
  /** Fehlt, wenn die Rolle keine Aufgabe anlegen darf. */
  onAufgabeAnlegen?: () => void;

  /** Die geplanten Aktionen dieses Kunden, chronologisch, das Nächste zuerst. */
  aktionen?: GeplanteAktion[];
  /** Dieselbe Ampel wie hinter dem Namen im Seitenkopf. */
  ampel?: KachelAmpel;
  aktionenOffen?: boolean;
  onAktionenUmschalten?: () => void;
  /** Führt dorthin, wo die Aktion im Profil liegt, und rahmt sie orange. */
  onAktionSpringen?: (aktion: GeplanteAktion) => void;
  /** Öffnet den vorhandenen Dialog für Aufgabe oder Meeting. Fehlt bei Rollen, die nichts anlegen dürfen. */
  onAktionErstellen?: (art: AktionErstellenArt) => void;
  /** Beschriftung und Sinnbild der Einträge im Menü, dieselben wie in der Schnellaktionsleiste. */
  aktionArten?: Array<{ art: AktionErstellenArt; label: string; icon?: ReactNode }>;
  /** Alle Aufgaben und Termine im Verlauf, ungefiltert. */
  onAktionenVerlauf?: () => void;
  /**
   * Schliesst einen Eintrag der Aktionsliste ab. Was dabei geschieht, hängt
   * an der Art: Aufgabe und Follow-up sind mit einem Klick erledigt, ein
   * Termin führt in die Rückfrage mit den drei Antworten. Fehlt, wenn die
   * Rolle nichts abschließen darf.
   */
  onAktionAbschliessen?: (aktion: GeplanteAktion) => void | Promise<void>;
  /**
   * Darf dieser Nutzer genau diesen Eintrag abschließen? Ein fremder Termin
   * gehört nicht jedem. Ohne Angabe gilt: alles, wofür es den Behandler gibt.
   */
  darfAktionAbschliessen?: (aktion: GeplanteAktion) => boolean;
  /** Der Sammelweg: alle überfälligen Aufgaben und Follow-ups auf einmal. */
  onAlleAufgabenErledigen?: () => void | Promise<void>;
  /**
   * Die Ergebnis-Kästen zu gebuchten Terminen, in voller Breite unter den
   * vier Kacheln. Sie standen früher im Reiter Stammdaten und waren damit
   * unsichtbar, sobald jemand im Investment arbeitete.
   */
  termine?: ReactNode;
}

export function KundenprofilKennzahlen({
  schritt,
  investmentNummer,
  letzter,
  aufgabenAnzahl,
  ueberfaellig,
  onUebersicht,
  onNaechsteSchritte,
  onVerlauf,
  onAufgaben,
  aufgaben,
  listeOffen,
  onListeUmschalten,
  onErledigen,
  onAufgabeAnlegen,
  aktionen = [],
  ampel,
  aktionenOffen = false,
  onAktionenUmschalten,
  onAktionSpringen,
  onAktionErstellen,
  aktionArten = [],
  onAktionenVerlauf,
  onAktionAbschliessen,
  darfAktionAbschliessen,
  onAlleAufgabenErledigen,
  termine,
}: Props) {
  // Welcher Eintrag gerade gespeichert wird. Ein zweiter Klick auf dasselbe
  // Häkchen soll nicht zweimal schreiben.
  const [laeuft, setLaeuft] = useState<string | null>(null);
  // Getrennt vom Haken der Aufgabenliste: beide Listen koennen offen sein.
  const [laeuftAktion, setLaeuftAktion] = useState<string | null>(null);

  const aktionAbschliessen = async (aktion: GeplanteAktion) => {
    if (!onAktionAbschliessen || laeuftAktion) return;
    setLaeuftAktion(aktion.schluessel);
    try {
      await onAktionAbschliessen(aktion);
    } finally {
      setLaeuftAktion(null);
    }
  };

  const alleAufgabenErledigen = async () => {
    if (!onAlleAufgabenErledigen || laeuftAktion) return;
    setLaeuftAktion("sammelweg");
    try {
      await onAlleAufgabenErledigen();
    } finally {
      setLaeuftAktion(null);
    }
  };

  const erledigen = async (eintrag: KundenAufgabe) => {
    if (!onErledigen || laeuft) return;
    setLaeuft(eintrag.schluessel);
    try {
      await onErledigen(eintrag);
    } finally {
      setLaeuft(null);
    }
  };

  const naechste = naechsteAktion(aktionen);
  // "Nichts geplant" ist der Inaktivitätsfall und steht deshalb in Rot. Nur
  // während einer Wartephase ist das Nichts gewollt, dann bleibt es leise.
  const nichtsGeplantKlasse = ampel?.ton === "blau" ? "text-muted-foreground" : "text-destructive";

  return (
<div className="kundenprofil-kennzahlen">
      <Card className="kundenprofil-kennzahl border-t-2 border-t-primary">
        <h3>Nächster Schritt</h3>
        <p className="text-sm font-semibold mt-3">{schritt?.titel || (investmentNummer !== undefined ? "Keine nächsten Schritte hinterlegt" : "Noch kein Investment angelegt")}</p>
        {investmentNummer !== undefined && <p className="text-[11px] text-muted-foreground mt-1">Investment {investmentNummer}</p>}
        <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" onClick={() => (onNaechsteSchritte ?? onUebersicht)()}>Alle nächsten Schritte</Button>
      </Card>
      <Card className="kundenprofil-kennzahl">
        <h3>Letzter Kontakt</h3>
        <p className="text-sm font-semibold mt-3">{letzter ? letzter.artLabel : "Noch kein Protokoll"}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{letzter ? new Date(letzter.datum).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "Anruf, Meeting oder E-Mail"}</p>
        <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" onClick={() => { onVerlauf(); }}>Verlauf ansehen</Button>
      </Card>
      <Card className="kundenprofil-kennzahl">
        <h3>Offene Aufgaben</h3>
        {/* Die Zahl selbst ist der Schalter: der grösste Klickbereich der Kachel. */}
        <button
          type="button"
          onClick={onListeUmschalten}
          aria-expanded={listeOffen}
          aria-controls={LISTEN_ID}
          className="mt-3 flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-2xl font-semibold tabular-nums">{aufgabenAnzahl}</span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", listeOffen && "rotate-180")} />
        </button>
        <p className={cn("text-[11px] mt-1", ueberfaellig ? "text-destructive" : "text-muted-foreground")}>{ueberfaellig ? `${ueberfaellig} überfällig` : "Keine überfälligen Aufgaben"}</p>
        <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" onClick={onListeUmschalten}>
          {listeOffen ? "Liste ausblenden" : "Aufgaben anzeigen"}
        </Button>
      </Card>
      <Card className="kundenprofil-kennzahl">
        <div className="flex items-center justify-between gap-2">
          <h3>Nächste Aktion</h3>
          {ampel && (
            <span
              className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", AMPEL_PUNKT_KLASSEN[ampel.ton])}
              role="img"
              aria-label={`Status: ${ampel.titel}`}
              title={ampel.titel}
            />
          )}
        </div>
        {/* Der Eintrag selbst ist der Schalter, wie die Zahl bei den Aufgaben. */}
        <button
          type="button"
          onClick={onAktionenUmschalten}
          aria-expanded={aktionenOffen}
          aria-controls={AKTIONEN_LISTEN_ID}
          className="mt-3 flex w-full items-start justify-between gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            {naechste ? (
              <>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{aktionArtLabel(naechste.art)}</Badge>
                <span className="block text-sm font-semibold mt-1">{naechste.titel}</span>
              </>
            ) : (
              <span className={cn("block text-sm font-semibold", nichtsGeplantKlasse)}>Nichts geplant</span>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", aktionenOffen && "rotate-180")} />
        </button>
        <p className={cn("text-[11px] mt-1", naechste?.ueberfaellig ? "text-destructive font-medium" : "text-muted-foreground")}>
          {naechste ? aktionFaelligkeitText(naechste) : (ampel?.kurztext || "Termin, Follow-up oder Aufgabe anlegen")}
        </p>
        <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" onClick={onAktionenUmschalten}>
          {aktionenOffen ? "Aktionen ausblenden" : "Aktionen anzeigen"}
        </Button>
      </Card>

      {/* Die Termin-Kaesten liegen unter allen vier Kacheln und ueber den
          Listen, in voller Breite. Nachgemessen im Raster dieser Seite: Bei
          1280 Pixeln Fensterbreite ist eine Kachel 238 Pixel breit, bei 1440
          sind es 318. Titel, Zeitpunkt und drei Knoepfe passen dort nicht
          nebeneinander, und die Kachel zeigt ohnehin nur die eine naechste
          Aktion. Die Zeile darunter ist 486 beziehungsweise 646 Pixel breit
          und traegt jeden offenen Termin mit eigener Zeile. */}
      <div className="kundenprofil-terminkaesten">{termine}</div>

      {/* Beide Listen liegen unter allen vier Kacheln. Sind beide offen: erst die Aktionen, dann die Aufgaben. */}
      {aktionenOffen && (
        <Card id={AKTIONEN_LISTEN_ID} className="kundenprofil-aufgabenliste p-4">
          {aktionen.length === 0 ? (
            <p className="text-sm text-muted-foreground py-1">Nichts geplant.</p>
          ) : (
            <ul className="divide-y divide-border">
              {aktionen.map((aktion) => {
                // Der Haken steht nur da, wo der Nutzer den Eintrag auch
                // abschliessen darf. Massgeblich bleibt die Zugriffskontrolle
                // der Datenbank, das Ausblenden kommt zusaetzlich.
                const weg = abschlussWeg(aktion);
                const darf =
                  weg !== "hinweis" && !!onAktionAbschliessen && (darfAktionAbschliessen?.(aktion) ?? true);
                const hakenTitel =
                  weg === "direkt" ? "Erledigt"
                    : weg === "termin_dialog" ? "Ergebnis eintragen"
                    : "In den Stammdaten abschließen";
                return (
                  <li key={aktion.schluessel} className="flex items-start gap-3 py-2 first:pt-0">
                    {darf && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0 mt-0.5"
                        disabled={laeuftAktion !== null}
                        aria-label={`${aktion.titel} abschließen`}
                        title={hakenTitel}
                        onClick={() => { void aktionAbschliessen(aktion); }}
                      >
                        {laeuftAktion === aktion.schluessel
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Check className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAktionSpringen?.(aktion)}
                      title="Zur Aktion springen"
                      className="flex min-w-0 flex-1 items-start gap-3 text-left rounded-sm hover:bg-muted/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{aktion.titel}</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={cn(aktion.ueberfaellig && "text-destructive font-medium")}>
                            {aktionFaelligkeitText(aktion)}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                            {aktionArtLabel(aktion.art)}
                          </Badge>
                        </span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Der Sammelweg erscheint erst ab zwei ueberfaelligen Aufgaben. Bei
              einer einzigen genuegt der Haken daneben. */}
          {onAlleAufgabenErledigen && zeigeSammelweg(aktionen) && (
            <div className="mt-3 pt-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={laeuftAktion !== null}
                onClick={() => { void alleAufgabenErledigen(); }}
              >
                {laeuftAktion === "sammelweg"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCheck className="h-3.5 w-3.5" />}
                Alle überfälligen Aufgaben erledigen
              </Button>
              <p className="text-[11px] text-muted-foreground mt-1">
                Nur Aufgaben und Follow-ups. Termine und Videomeetings bleiben stehen.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-border">
            {onAktionErstellen && aktionArten.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Aktion erstellen
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {aktionArten.map((eintrag) => (
                    <DropdownMenuItem key={eintrag.art} onSelect={() => onAktionErstellen(eintrag.art)} className="gap-2">
                      {eintrag.icon}
                      <span>{eintrag.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : <span />}
            {onAktionenVerlauf && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onAktionenVerlauf}>
                Alle im Verlauf ansehen
              </Button>
            )}
          </div>
        </Card>
      )}

      {listeOffen && (
        <Card id={LISTEN_ID} className="kundenprofil-aufgabenliste p-4">
          {aufgaben.length === 0 ? (
            <p className="text-sm text-muted-foreground py-1">Nichts offen.</p>
          ) : (
            <ul className="divide-y divide-border">
              {aufgaben.map((eintrag) => (
                <li key={eintrag.schluessel} className="flex items-start gap-3 py-2 first:pt-0">
                  {onErledigen && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 shrink-0 mt-0.5"
                      disabled={laeuft !== null}
                      aria-label={`${eintrag.titel} als erledigt markieren`}
                      title="Erledigt"
                      onClick={() => { void erledigen(eintrag); }}
                    >
                      {laeuft === eintrag.schluessel
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Check className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{eintrag.titel}</p>
                    {/* Kein <p>: die Marke für die Priorität ist selbst ein Block. */}
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn(eintrag.ueberfaellig && "text-destructive font-medium")}>
                        {faelligkeitText(eintrag)}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        {eintrag.prioritaet.charAt(0).toUpperCase() + eintrag.prioritaet.slice(1)}
                      </Badge>
                      <span>{quelleLabel(eintrag.quelle)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-border">
            {onAufgabeAnlegen ? (
              <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs gap-1.5" onClick={onAufgabeAnlegen}>
                <Plus className="h-3.5 w-3.5" /> Aufgabe hinzufügen
              </Button>
            ) : <span />}
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => { onAufgaben(); }}>
              Alle im Verlauf ansehen
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
