import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Info, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { KartenTitel } from "@/components/objektseite/Bausteine";
import { BelegZeile } from "@/components/objektseite/BelegLinks";
import { ObjektTexteDialog } from "@/components/objektseite/ObjektTexteDialog";
import type { ObjektData } from "@/lib/objekteStore";
import {
  ANZAHL_MARKTARGUMENTE,
  ANZAHL_STANDORTARGUMENTE,
  anzuzeigendeObjektTexte,
  brauchtObjektTexte,
  erzeugeObjektTexte,
  letzterFehlerAusMeta,
  OBJEKT_TEXTE_META_SCHLUESSEL,
  objektTexte,
  objektTexteInMeta,
  objektTexteStand,
  starteObjektTexteBeiBedarf,
  texteInGepflegteFelder,
  type ObjektTexte,
  type TextHerkunft,
} from "@/lib/objektTexteKi";
import { cn } from "@/lib/utils";

/**
 * Kurzbeschreibung und fünf Standortargumente zu einem Objekt.
 *
 * Die Karte zeigt, was auf Objektseite, Einheitenseite und im Exposé steht.
 * Sie ist bewusst eine eigene Datei: Die Seiten hängen sie ein, sie selbst
 * weiß nichts über deren Aufbau.
 *
 * SEIT DEM 22.09.2026 OHNE FREIGABE
 *
 * Ein erzeugter Text ist sofort überall zu sehen. Was die Prüfung beanstandet
 * hat, steht im internen Vermerk. Seit dem 24.09.2026 trägt ein automatisch
 * erstellter Text keine Kennzeichnung mehr, weder Chip noch Datum noch den
 * Satz „Automatisch erstellt …“. Nur „Von Hand“ und „Aus Investagon“ bleiben.
 *
 * DER LAUF STARTET VON SELBST, ABER NUR EINMAL
 *
 * Beim ersten Aufbau prüft die Karte im Browser, ob ein aktueller Stand fehlt.
 * Nur dann ruft sie die Function. Das Ergebnis wird gespeichert, und beim
 * nächsten Mal kommt die Prüfung nicht mehr dazu. Der Aufbau wartet auf
 * nichts davon.
 *
 * SEIT DEM 23.09.2026 BIS 1000 ZEICHEN, UND NUR NOCH EIN STIFT
 *
 * Die Beschreibung darf doppelt so lang sein wie vorher. Beschreibung und
 * Argumente stehen deshalb untereinander, und der Absatz ist auf eine
 * lesbare Zeilenlänge begrenzt, statt über die volle Kartenbreite zu laufen.
 *
 * Die Knöpfe zum Erzeugen, Neuerzeugen, Selbstschreiben und Wiederherstellen
 * sind entfallen (Christians Vorgabe vom 23.09.2026): Die Texte sind immer
 * automatisch vorausgefüllt. Ändern kann sie nur der Admin, über den Stift
 * oben rechts und den Dialog `ObjektTexteDialog`. Wer das ist, entscheidet
 * die Seite über `darfBearbeiten`. Durchgesetzt wird es damit nicht, das
 * leistet nur die Zeilensicherheit auf `objekte`.
 *
 * SEIT FASSUNG 3 (23.09.2026) MIT MARKTARGUMENTEN
 *
 * Unter den fünf Standortargumenten steht der Block „Markt und Standort“ mit
 * bis zu drei Argumenten aus der Marktanalyse, jedes mit Quelle und Stand.
 * Gibt es zum Ort keine erhobenen Kennzahlen, sagt die Karte das, statt eine
 * leere Überschrift zu zeigen.
 *
 * SEIT FASSUNG 4 (23.09.2026 SPÄT) KEIN WARNKASTEN MEHR
 *
 * Bis dahin stand über dem Text ein gelber Kasten „Bitte ansehen“, sichtbar
 * für jeden, meist mit „Die Umgebung ließ sich nicht messen …“. Christian:
 * kein Warnkasten für Vertrieb oder Kunden. Was die Prüfung findet, ob die
 * Umgebung gemessen wurde und woran der letzte Lauf scheiterte, steht jetzt
 * als unaufdringlicher „Interner Vermerk“ am Fuß der Karte, eingeklappt und
 * nur für Admin und Inhaber (`darfBearbeiten`). Dort gibt es auch den Knopf
 * „Erneut versuchen“, der Texte und Messung neu anstößt.
 */

const KARTE = "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";

/*
 * Die Schlüssel in `meta`, die ein Lauf oder das Speichern der Texte
 * verändert. Nur sie trägt die Karte selbst nach, alles andere kommt immer
 * von der Seite.
 */
const TEXT_SCHLUESSEL = ["kurzbeschreibung", "standortargumente", "marktargumente", OBJEKT_TEXTE_META_SCHLUESSEL] as const;

function textStand(meta: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(TEXT_SCHLUESSEL.map((k) => [k, meta[k]]));
}

/** Das `meta` der Seite mit dem eigenen Textstand darüber. Fehlt ein Schlüssel im Stand, fehlt er auch hier. */
function mitTextStand(meta: Record<string, unknown>, stand: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!stand) return meta;
  const neu = { ...meta };
  for (const k of TEXT_SCHLUESSEL) {
    if (stand[k] === undefined) delete neu[k];
    else neu[k] = stand[k];
  }
  return neu;
}

function zeitpunkt(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Woher der gezeigte Text stammt, als Chip in den Farben des Projekts. */
function HerkunftChip({ herkunft }: { herkunft: TextHerkunft }) {
  if (herkunft === "gepflegt") {
    return (
      <Badge variant="outline" className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
        <Pencil className="mr-1 h-3 w-3" /> Von Hand
      </Badge>
    );
  }
  // Automatisch erstellte Texte tragen seit dem 24.09.2026 keine Kennzeichnung
  // mehr (Christians Vorgabe): kein Chip, kein Datum, kein Hinweissatz.
  if (herkunft === "automatisch") return null;
  if (herkunft === "investagon") {
    return <Badge variant="outline" className="border-border bg-muted text-muted-foreground">Aus Investagon</Badge>;
  }
  return <Badge variant="outline" className="border-border bg-muted text-muted-foreground">Noch kein Text</Badge>;
}

/** Die Genauigkeit der Messung in Worten, für den internen Vermerk. */
const GENAUIGKEIT_SATZ: Record<string, string> = {
  strasse: "Die Umgebung ist ab der Straße gemessen, die Hausnummer kennt OpenStreetMap nicht. Die Entfernungen stimmen deshalb nur ungefähr.",
  plz: "Die Umgebung ist nur ab dem Postleitzahlgebiet gemessen, weil OpenStreetMap die Adresse nicht findet. Bitte die Adresse am Objekt prüfen und dann erneut versuchen.",
  ort: "Die Umgebung ist nur ab der Ortsmitte gemessen, weil OpenStreetMap die Adresse nicht findet. Bitte die Adresse am Objekt prüfen und dann erneut versuchen.",
};

/**
 * Was Admin und Inhaber zu diesem Stand wissen sollten, und ob ein neuer
 * Versuch etwas ändern kann.
 */
function interneVermerke(
  vorschlag: ObjektTexte | undefined,
  meta: unknown,
  beanstandungen: string[],
): { zeilen: string[]; erneut: boolean } {
  const zeilen: string[] = [];
  let erneut = false;
  const umgebung = vorschlag?.umgebung;
  if (umgebung && !umgebung.gemessen) {
    zeilen.push(
      `Die Umgebung ließ sich nicht messen${umgebung.grund ? `: ${umgebung.grund}` : "."} Die Standortargumente stützen sich deshalb auf Unterlagen und Beschreibungen.`,
    );
    erneut = true;
  } else if (umgebung?.genauigkeit && GENAUIGKEIT_SATZ[umgebung.genauigkeit]) {
    zeilen.push(GENAUIGKEIT_SATZ[umgebung.genauigkeit]);
    if (umgebung.genauigkeit !== "strasse") erneut = true;
  }
  const fehler = letzterFehlerAusMeta(meta);
  if (fehler) {
    const am = zeitpunkt(fehler.zeitpunkt);
    zeilen.push(`Der letzte Lauf${am ? ` am ${am}` : ""} ist gescheitert: ${fehler.grund}`);
    erneut = true;
  }
  zeilen.push(...beanstandungen);
  return { zeilen, erneut };
}

export function ObjektTexteKarte({ objekt, darfBearbeiten = false, onGeaendert, className }: {
  objekt: ObjektData;
  /**
   * Ob dieser Nutzer den Bearbeiten-Stift sieht. Gedacht für Admin und
   * Inhaber, siehe `siehtAdminOnlyNavigation`. Ohne Angabe gibt es keinen
   * Stift, damit eine neue Seite ihn nicht versehentlich jedem zeigt.
   */
  darfBearbeiten?: boolean;
  /** Wird nach jeder gespeicherten Änderung gerufen, damit die Seite neu lädt. */
  onGeaendert?: () => void;
  className?: string;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [bearbeitenOffen, setBearbeitenOffen] = useState(false);
  const [quellenOffen, setQuellenOffen] = useState(false);
  /*
   * Der eben geschriebene Textstand, bis die Seite ihr Objekt neu geladen hat.
   *
   * Ohne ihn zeigte die Karte nach einem Lauf noch das Alte: Geschrieben wird
   * in der Datenbank, das Objekt in den Eigenschaften stammt aber aus dem
   * Zwischenspeicher der Seite. Zurückgesetzt wird er nur beim Wechsel auf ein
   * anderes Objekt. Ihn bei jedem neuen Objekt-Verweis zu verwerfen wäre
   * falsch: Die Seite zeichnet oft neu, und der frische Stand wäre sofort
   * wieder weg.
   *
   * Er hält seit dem 23.09.2026 nur noch die drei Textschlüssel, nicht mehr
   * das ganze `meta`. Vorher legte er beim Speichern das alte `meta` der Karte
   * über die Datenbank. Was inzwischen über den Stift an den Objektdetails
   * gepflegt worden war, etwa ein Energieausweis, wäre damit wieder verloren
   * gegangen. Seit beide Stifte auf derselben Seite stehen, liegt das nahe.
   */
  const [eigenerStand, setEigenerStand] = useState<Record<string, unknown> | undefined>(undefined);

  const gezeigtesObjekt = useMemo(
    () => (eigenerStand ? { ...objekt, meta: mitTextStand((objekt.meta || {}) as Record<string, unknown>, eigenerStand) } : objekt),
    [objekt, eigenerStand],
  );
  const anzeige = useMemo(() => anzuzeigendeObjektTexte(gezeigtesObjekt), [gezeigtesObjekt]);
  const vorschlag = useMemo(() => objektTexte(gezeigtesObjekt), [gezeigtesObjekt]);
  const stand = useMemo(() => objektTexteStand(gezeigtesObjekt), [gezeigtesObjekt]);

  /*
   * Der selbsttätige Start.
   *
   * Er hängt bewusst an der Kennung des Objekts und nicht am ganzen Objekt:
   * Sonst liefe er bei jedem erneuten Zeichnen erneut los. Die Karte wartet
   * nicht auf ihn, der Seitenaufbau merkt nichts davon.
   */
  useEffect(() => {
    let abgemeldet = false;
    setBearbeitenOffen(false);
    setEigenerStand(undefined);
    // Sichtbar machen, dass von selbst etwas läuft. Sonst stand während des
    // Laufs dieselbe Zeile da wie bei einem Objekt, für das nie etwas kommt.
    const laeuftVonSelbst = brauchtObjektTexte(objekt);
    if (laeuftVonSelbst) setLaeuft(true);
    void starteObjektTexteBeiBedarf(objekt).then((ergebnis) => {
      if (laeuftVonSelbst && !abgemeldet) setLaeuft(false);
      if (abgemeldet || !ergebnis?.texte) return;
      if (ergebnis.fehler) {
        console.warn("[objekt-texte] selbsttätiger Lauf fehlgeschlagen:", ergebnis.fehler);
        return;
      }
      // Dieselbe Reihenfolge wie im Serverlauf: erst die gepflegten Felder
      // füllen, wo nichts oder der vorige automatische Text steht, dann den
      // neuen Stand ablegen. Sonst zeigte die Karte bis zum Neuladen den
      // alten Wortlaut, und der Bearbeiten-Dialog wäre damit vorbelegt.
      const vorher = (objekt.meta || {}) as Record<string, unknown>;
      setEigenerStand(textStand(objektTexteInMeta(texteInGepflegteFelder(vorher, ergebnis.texte), ergebnis.texte)));
      onGeaendert?.();
    });
    return () => {
      abgemeldet = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objekt.id]);

  const gespeichert = (meta: Record<string, unknown>) => {
    setEigenerStand(textStand(meta));
    onGeaendert?.();
  };

  const [vermerkOffen, setVermerkOffen] = useState(false);
  const vermerk = useMemo(
    () => interneVermerke(vorschlag, gezeigtesObjekt.meta, anzeige.beanstandungen),
    [vorschlag, gezeigtesObjekt.meta, anzeige.beanstandungen],
  );

  /*
   * Texte und Messung neu anstoßen, nur aus dem internen Vermerk.
   *
   * Mit `neuMessen`, damit eine grobe oder gescheiterte Messung wirklich neu
   * läuft, etwa nachdem jemand die Adresse am Objekt korrigiert hat. Von Hand
   * gepflegte Texte bleiben dabei stehen, das regelt die Function.
   */
  const erneutVersuchen = async () => {
    setLaeuft(true);
    try {
      const ergebnis = await erzeugeObjektTexte(objekt.id, { neuErzeugen: true, neuMessen: true });
      if (ergebnis.fehler || !ergebnis.texte) {
        toast.error(ergebnis.fehler || "Die Texte konnten nicht neu erstellt werden.");
        return;
      }
      const vorher = (gezeigtesObjekt.meta || {}) as Record<string, unknown>;
      setEigenerStand(textStand(objektTexteInMeta(texteInGepflegteFelder(vorher, ergebnis.texte), ergebnis.texte)));
      onGeaendert?.();
      toast.success("Die Texte sind neu erstellt.");
    } finally {
      setLaeuft(false);
    }
  };

  const leer = !anzeige.kurzbeschreibung && anzeige.standortargumente.length === 0;
  const anzahl = anzeige.standortargumente.length;

  return (
    <section className={cn(KARTE, className)} data-testid="objekt-texte-karte">
      <KartenTitel
        rechts={
          <div className="flex flex-wrap items-center gap-2">
            <HerkunftChip herkunft={anzeige.kurzbeschreibungHerkunft} />
            {darfBearbeiten && (
              /*
               * Gesperrt, solange der selbsttätige Lauf unterwegs ist. Er
               * schreibt kurz darauf in dieselben Felder, und ein eben
               * gespeicherter Text stünde gegen ihn.
               */
              <Button
                variant="ghost"
                size="icon"
                className="h-[40px] w-[40px] sm:h-7 sm:w-7"
                aria-label="Beschreibung und Standort bearbeiten"
                title={laeuft ? "Die Texte werden gerade erstellt" : "Beschreibung und Standort bearbeiten"}
                onClick={() => setBearbeitenOffen(true)}
                disabled={laeuft}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        }
      >
        Beschreibung und Standort
      </KartenTitel>

      {leer ? (
        <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
          {/*
            Sagen, warum hier nichts steht, ruhig und ohne Knopf.

            Christian am 23.09.2026 sah bei jedem Objekt nur "Noch kein Text"
            und wusste nicht, ob gerade etwas läuft, gleich etwas kommt oder
            nie etwas kommen wird. Die drei Fälle klingen jetzt verschieden.
            Einen Knopf zum Erzeugen gibt es nicht mehr: Der Serverlauf füllt
            jedes Objekt von selbst.
          */}
          <p>
            {vorschlag?.ohneErgebnis && stand !== "offen"
              ? vorschlag.ohneErgebnis
              : stand === "grundlage-fehlt"
                ? "Für einen Text fehlt die Grundlage. Gebraucht werden Objektangaben wie Titel, Adresse oder eine Beschreibung."
                : laeuft
                  ? "Die Texte werden gerade erstellt. Das dauert meist unter einer Minute."
                  : `Beschreibung und ${ANZAHL_STANDORTARGUMENTE} Standortargumente werden automatisch erstellt, aus den Objektangaben, den Investagon-Daten, der gemessenen Umgebung und den Unterlagen. Sie erscheinen hier, sobald sie fertig sind.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Kurzbeschreibung</Label>
            <p className="mt-1 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-foreground">
              {anzeige.kurzbeschreibung || <span className="text-muted-foreground">Noch keine Kurzbeschreibung.</span>}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">
                Standortargumente{anzahl !== ANZAHL_STANDORTARGUMENTE ? ` (${anzahl} statt ${ANZAHL_STANDORTARGUMENTE})` : ""}
              </Label>
              {anzeige.standortargumenteHerkunft !== anzeige.kurzbeschreibungHerkunft && (
                <HerkunftChip herkunft={anzeige.standortargumenteHerkunft} />
              )}
            </div>
            <ol className="mt-1 max-w-3xl space-y-1.5">
              {anzeige.standortargumente.map((a, i) => (
                <li key={i} className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
                  <p className="text-sm leading-snug text-foreground">{a}</p>
                </li>
              ))}
            </ol>
          </div>

          {anzeige.marktargumente.length > 0 ? (
            <div data-testid="markt-und-standort">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Markt und Standort</Label>
                {anzeige.marktargumenteHerkunft !== anzeige.kurzbeschreibungHerkunft && (
                  <HerkunftChip herkunft={anzeige.marktargumenteHerkunft} />
                )}
              </div>
              <ol className="mt-1 max-w-3xl space-y-1.5">
                {anzeige.marktargumente.slice(0, ANZAHL_MARKTARGUMENTE).map((a, i) => (
                  <li key={i} className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
                    <p className="text-sm leading-snug text-foreground">{a}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            vorschlag && !vorschlag.ohneErgebnis && (
              <div>
                <Label className="text-xs">Markt und Standort</Label>
                <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                  Zu diesem Ort gibt es in der Marktanalyse keine erhobenen Kennzahlen, deshalb keine Marktargumente.
                </p>
              </div>
            )
          )}

          {anzeige.automatisch && (vorschlag?.quellen.length ?? 0) > 0 && (
            <Collapsible open={quellenOffen} onOpenChange={setQuellenOffen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", quellenOffen && "rotate-180")} />
                Grundlage ansehen, {vorschlag!.quellen.length} Angaben
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] leading-snug text-muted-foreground">
                  {vorschlag!.quellen.map((q, i) => <li key={i}><BelegZeile beleg={q} ohneVorsilbe /></li>)}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}

        </div>
      )}

      {darfBearbeiten && vermerk.zeilen.length > 0 && (
        <Collapsible open={vermerkOffen} onOpenChange={setVermerkOffen} className="mt-4 border-t border-border/40 pt-2">
          <CollapsibleTrigger
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            data-testid="interner-vermerk"
          >
            <Info className="h-3 w-3" />
            Interner Vermerk, nur für Admin und Inhaber ({vermerk.zeilen.length})
            <ChevronDown className={cn("h-3 w-3 transition-transform", vermerkOffen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] leading-snug text-muted-foreground">
              {vermerk.zeilen.map((z, i) => <li key={i}>{z}</li>)}
            </ul>
            {vermerk.erneut && (
              <Button variant="outline" size="sm" className="mt-2 h-[40px] sm:h-7" onClick={erneutVersuchen} disabled={laeuft}>
                {laeuft ? "Läuft..." : "Erneut versuchen"}
              </Button>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {darfBearbeiten && bearbeitenOffen && (
        <ObjektTexteDialog objekt={gezeigtesObjekt} onOpenChange={setBearbeitenOffen} onGespeichert={gespeichert} />
      )}
    </section>
  );
}
