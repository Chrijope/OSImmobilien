import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDatum } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Eye, ExternalLink, RefreshCw, Maximize2, Minimize2, MapPin, XCircle, FileSignature, Pencil, Home, ChevronLeft, ChevronRight } from "lucide-react";
import { getObjekte } from "@/lib/objekteStore";
import { einheitImAngebot } from "@/lib/objektKennzahlen";
import { resolveImageUrl } from "@/lib/objekteImages";
import type { Investment } from "@/lib/investmentsStore";
import type { KundeData } from "@/lib/kundenStore";
import { TerminseiteKnopf } from "@/components/kunden/TerminseiteKnopf";
import {
  vorhandeneObjektDaten, objektDatenFehlen, hatBestandsWohnung,
  objektDatenStandAus, BESTANDSWOHNUNG_AKTIV,
  objektVerlauf, objektBezeichnung, objektEingetragenAm, weNrAnzeige, bilderListe,
  type ObjektVerlaufEintrag,
} from "@/lib/objektDatenPflicht";
import { objektKarteDaten, type ObjektKarteDaten } from "@/lib/objektKarte";
import { stufeErreicht } from "@/lib/pipelineStufen";
import { ObjektDatenDialog } from "@/components/kunden/ObjektDatenDialog";
import { InvestmentBerechnungen } from "@/components/kunden/InvestmentBerechnungen";
import { KundenprofilAbschnitt } from "@/components/kunden/profil/KundenprofilAbschnitt";
import { ObjektEmpfehlungen } from "@/components/kunden/ObjektEmpfehlungen";
import { siehtEmpfehlungen } from "@/lib/einheitEmpfehlung";
import { siehtObjekteMenue } from "@/lib/sidebarNavigation";
import { useUser } from "@/contexts/UserContext";

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

/**
 * Was am Investment über das Objekt bekannt ist, in einer Übersicht.
 *
 * Vorher stand hier eine Textzeile mit Preis, Fläche und Zimmern. Sie sagte
 * nicht, was fehlt, und schon gar nicht, was deshalb nicht funktioniert. Wer
 * wissen wollte, warum das Steuer-Cockpit seines Kunden leer ist, musste es
 * raten.
 *
 * Die Zeile mit den Zählern unten ist eine Anzeige, keine Sperre. Sie sagt,
 * wie viel Arbeit später noch anfällt, und zwingt zu nichts.
 *
 * Die Angaben kommen von außen und werden hier nicht mehr selbst gelesen.
 * Sonst zählte die Übersicht bei einer Wohnung aus dem eigenen Bestand alles
 * als "nicht erfasst", obwohl es am Objekt sauber gepflegt ist.
 */
function ObjektUebersicht({ karte }: { karte: ObjektKarteDaten }) {
  const d = karte.daten;
  const stand = objektDatenStandAus(d);
  const vk = d.verkaeufer || {};
  const gb = d.grundbuch || {};

  const wohnungsZeile = [
    d.wohnflaeche ? `${d.wohnflaeche} m²` : "",
    d.zimmer ? `${d.zimmer} Zimmer` : "",
    d.etage || "",
    d.baujahr ? `Baujahr ${d.baujahr}` : "",
  ].filter(Boolean).join(" · ");

  const grundbuchVollstaendig = !!(gb.amtsgericht && gb.gemarkung && gb.blatt && gb.flurstueck);

  const zeilen: { name: string; wert: string; fehlt?: boolean }[] = [
    {
      name: "Objekt",
      wert: [d.strasse, [d.plz, d.ort].filter(Boolean).join(" "), weNrAnzeige(d.weNr)]
        .filter(Boolean).join(", "),
    },
    {
      /*
       * Der Preis je Quadratmeter steht hinter dem Kaufpreis, nicht mehr in
       * einer eigenen grauen Kachel. Er gehört zum Preis und rechnet ihn nur
       * um, eine eigene Zeile wäre eine zweite Preiszeile.
       */
      name: "Kaufpreis",
      wert: d.kaufpreis && d.kaufpreis > 0
        ? `${fmt(d.kaufpreis)}${karte.preisJeQm ? ` · ${karte.preisJeQm} je m²` : ""}`
        : "",
    },
    {
      name: "Wohnung",
      wert: wohnungsZeile || "Fläche, Zimmer, Etage und Baujahr nicht erfasst",
      fehlt: !wohnungsZeile,
    },
    {
      name: "Miete und Rendite",
      wert: d.miete
        ? `${fmt(d.miete)} kalt${karte.rendite ? ` · ${karte.rendite}` : ""}`
        : "Ohne Kaltmiete zeigt das Portal weder Rendite noch Liquidität",
      fehlt: !d.miete,
    },
    {
      /*
       * Das Hausgeld hatte bisher nur eine graue Kachel und wäre mit ihr aus
       * der Karte verschwunden. Eine eigene Zeile, weil es eine laufende
       * Belastung ist und nicht zum Zuschnitt der Wohnung gehört, und weil es
       * so wie die übrigen Zeilen sagen kann, was ohne es leer bleibt.
       */
      name: "Hausgeld",
      // Der nicht umlagefähige Teil in derselben Zeile (05.10.2026): Nur er
      // belastet den Eigentümer dauerhaft und zählt als Werbungskosten.
      wert: d.hausgeld
        ? `${fmt(d.hausgeld)} je Monat${d.hausgeldNichtUmlage ? `, davon nicht umlagefähig ${fmt(d.hausgeldNichtUmlage)}` : ""}`
        : "fehlt, deshalb rechnen Liquidität, Steuer-Cockpit und Anlage V nicht",
      fehlt: !d.hausgeld,
    },
    {
      name: "Verkäufer",
      wert: vk.name
        ? [vk.name, vk.ort].filter(Boolean).join(", ")
        : "fehlt, die Reservierungsvereinbarung fragt ihn dann selbst ab",
      fehlt: !vk.name,
    },
    {
      name: "Grundbuch",
      wert: grundbuchVollstaendig
        ? [gb.amtsgericht, gb.gemarkung, `Blatt ${gb.blatt}`, gb.flurstueck].filter(Boolean).join(" · ")
        : "noch offen, spätestens zum Notartermin",
      fehlt: !grundbuchVollstaendig,
    },
    {
      name: "Grundstücksanteil",
      wert: d.grundstueckAnteil
        ? `${String(d.grundstueckAnteil).replace(".", ",")} %`
        : "fehlt, deshalb rechnet das Steuer-Cockpit keine Abschreibung",
      fehlt: !d.grundstueckAnteil,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="divide-y rounded-lg border">
        {zeilen.map((z) => (
          <div key={z.name} className="flex items-start justify-between gap-3 px-3 py-1.5 text-xs">
            <span className={z.fehlt ? "text-muted-foreground/70" : "text-muted-foreground"}>{z.name}</span>
            <span className={`text-right ${z.fehlt ? "text-[hsl(var(--warning))]" : "font-medium text-foreground"}`}>
              {z.wert || "–"}
            </span>
          </div>
        ))}
      </div>
      <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Kundenportal:</span>{" "}
        {stand.portalGefuellt} von {stand.portalGesamt} Kacheln ·{" "}
        <span className="font-semibold text-foreground">Reservierung:</span>{" "}
        {stand.reservierungGefuellt === stand.reservierungGesamt
          ? "vollständig vorausgefüllt"
          : `${stand.reservierungGefuellt} von ${stand.reservierungGesamt} Pflichtfeldern`} ·{" "}
        <span className="font-semibold text-foreground">Notarbogen:</span>{" "}
        {stand.notarGefuellt} von {stand.notarGesamt} Objektfeldern
      </p>
    </div>
  );
}

/**
 * Die eine Darstellung eines Objekts, gleich für jeden Kunden.
 *
 * Vorher gab es zwei. Eine Wohnung aus dem eigenen Bestand bekam Bild,
 * Eckdaten und drei graue Kacheln, ein von Hand eingetragenes Objekt bekam
 * stattdessen eine Liste mit Zeilen. Wer beide Kunden nebeneinander ansah,
 * musste zweimal hinschauen, um dieselbe Frage zu beantworten.
 *
 * Jetzt kommt alles aus `objektKarteDaten`, und diese Ansicht weiß gar nicht
 * mehr, woher die Angaben stammen. Sie gibt aus, was da ist. Was fehlt,
 * erzeugt keinen Eintrag: Eine fehlende Kachel ist besser als eine leere,
 * denn eine leere sieht aus wie ein Fehler.
 */
/*
  Für den Test der Bildleiste ausgeführt, siehe `ObjektKarteBilder.test.tsx`.
  Die Karte selbst hängt an Stores und Kundendaten, das Blättern gehört aber
  ihr allein und lässt sich so ohne diesen Ballast prüfen.
*/
export function ObjektKarteBlock({
  karte, investagon, investagonRef, aktionen,
}: {
  karte: ObjektKarteDaten;
  investagon: boolean;
  investagonRef?: string;
  aktionen: ReactNode;
}) {
  /*
    Die Bilder zum Durchblättern. `bilder` führt seit dem 22.09.2026 alle, für
    ältere Vorgänge bleibt `bildUrl` als einziges übrig. Beides zusammen, damit
    die Karte in jedem Fall etwas zeigt.
  */
  const bilder = karte.bilder?.length ? karte.bilder : karte.bildUrl ? [karte.bildUrl] : [];
  const [bildNr, setBildNr] = useState(0);
  // Wird ein Bild entfernt, während die Karte offen ist, zeigt der Rest weiter.
  const aktuell = bilder[Math.min(bildNr, bilder.length - 1)] || "";
  const blaettern = (richtung: 1 | -1) =>
    setBildNr((nr) => (bilder.length ? (nr + richtung + bilder.length) % bilder.length : 0));

  return (
    <div className="border-2 border-primary/40 rounded-xl overflow-hidden bg-card shadow-sm" data-testid="objektkarte">
      {/*
        Der Bildkopf steht immer, auch ohne Bild.

        Vorher entfiel er beim Bestandsobjekt ganz, wenn kein Foto hinterlegt
        war. Dann rutschten Kennzeichen, Bezeichnung und Einheit weg und die
        Karte sah bei zwei Kunden verschieden aus, obwohl beide dasselbe
        hinterlegt hatten.
      */}
      <div className="relative h-40 w-full overflow-hidden bg-muted flex items-center justify-center">
        {aktuell ? (
          <img src={aktuell} alt={karte.titel || "Objekt"} className="w-full h-full object-cover" />
        ) : (
          <Building2 className="h-12 w-12 text-muted-foreground/30" />
        )}
        {/*
          Pfeile und Punkte nur, wenn es wirklich mehr als ein Bild gibt. Ein
          Pfeil, der nichts weiterblättert, sieht nach einem Fehler aus.
        */}
        {bilder.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Vorheriges Bild"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow backdrop-blur hover:bg-background"
              onClick={() => blaettern(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Nächstes Bild"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow backdrop-blur hover:bg-background"
              onClick={() => blaettern(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
              {bilder.map((bild, i) => (
                <button
                  key={bild}
                  type="button"
                  aria-label={`Bild ${i + 1} von ${bilder.length}`}
                  aria-current={i === bildNr}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === bildNr ? "bg-background" : "bg-background/50"
                  }`}
                  onClick={() => setBildNr(i)}
                />
              ))}
            </div>
          </>
        )}
        <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1.5">
          <Badge className="bg-primary text-primary-foreground text-[10px] font-semibold shadow">
            {karte.zustand}
          </Badge>
          {karte.zeitpunkt && (
            <Badge variant="outline" className="bg-background/80 backdrop-blur text-[10px] font-medium shadow">
              {karte.zeitpunkt}
            </Badge>
          )}
          {investagon && (
            <Badge variant="outline" className="bg-background/80 backdrop-blur text-[10px] font-medium shadow border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]">
              Objektdaten via Investagon
            </Badge>
          )}
          {/*
            Die Nutzungsart stand bis 09/2026 hinter den Eckdaten. Die Zeile
            ist entfallen, weil Kaufpreis, Flaeche und Zimmer eins darunter in
            der Liste stehen. Die Nutzungsart steht dort aber nicht, sie waere
            mit der Zeile verschwunden, deshalb hier oben zu den uebrigen
            Kennzeichen.

            Sie kommt aus beiden Quellen: beim eigenen Bestand vom Objekt,
            beim Handeintrag aus der in Schritt 2 gewaehlten Objektart. Wer
            beides hat, sieht den Badge des Objekts, siehe `objektKarte.ts`.
            Leer bleibt das Kennzeichen nur bei Vorgaengen, in denen noch
            niemand gewaehlt hat.
          */}
          {karte.nutzungsart && (
            <Badge variant="outline" className="bg-background/80 backdrop-blur text-[10px] font-medium shadow">
              {karte.nutzungsart}
            </Badge>
          )}
        </div>
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent h-16" />
        <div className="absolute bottom-2 left-3 right-3 flex justify-between items-end gap-3">
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-white drop-shadow truncate">{karte.titel || "Objekt"}</h4>
            {karte.ortszeile && <p className="text-[11px] text-white/80">{karte.ortszeile}</p>}
          </div>
          {/*
            Hier stand die Einheit als aufgefüllte Zahl mit dem Zusatz
            "WE reserviert", also etwa "80 WE reserviert". Das las sich wie
            achtzig reservierte Wohneinheiten, gemeint war Einheit Nummer 80.
          */}
          {karte.einheit && (
            <span className="shrink-0 text-xl font-bold text-white drop-shadow">{karte.einheit}</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/*
          Hier stand die Eckdatenzeile "280.000,00 € · 62 m² · 2 Zimmer".
          Alle drei Angaben stehen in der Liste darunter, der Kaufpreis in
          seiner eigenen Zeile, Flaeche und Zimmer in der Zeile "Wohnung".
          Die Nutzungsart ist zu den Kennzeichen im Bildkopf gewandert, sonst
          waere sie mit der Zeile verschwunden.
        */}

        {/*
          Die grauen Kacheln, was von ihnen übrig ist.

          Sechs Objektkacheln standen hier: Miete, Rendite, Preis je m²,
          Hausgeld, Etage und Baujahr. Vier davon wiederholten wortgleich, was
          die Liste darunter ohnehin zeigt, die beiden anderen sind in die
          Liste gewandert. Übrig bleiben allein Zuzahlung und Cashflow aus der
          Berechnung des Vorgangs. Die stehen nirgends sonst, und heute füllt
          sie nichts, also bleibt die Zeile leer und wird gar nicht gezeichnet.
        */}
        {karte.kacheln.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {karte.kacheln.map((k) => (
              <div key={k.name} className="bg-muted/50 rounded px-2 py-1.5">
                <span className="text-muted-foreground block text-[10px]">{k.name}</span>
                <span
                  className={`font-medium ${
                    k.ton === "gut" ? "text-[hsl(var(--success))]" : k.ton === "schlecht" ? "text-destructive" : ""
                  }`}
                >
                  {k.wert}
                </span>
              </div>
            ))}
          </div>
        )}

        <ObjektUebersicht karte={karte} />

        {/* Nur echte https-Adressen, der Wert ist frei beschreibbar. */}
        {investagonRef && /^https:\/\//i.test(investagonRef.trim()) && (
          <a href={investagonRef} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Investagon-Objekt öffnen
          </a>
        )}
        {/*
          Der Hinweis gilt nur für Wohnungen, die über eine
          Investagon-Reservierung entstanden sind. Ein von Hand eingetragenes
          Objekt ist nicht eingefroren, es wird genau hier gepflegt.
        */}
        {investagon && (
          <p className="text-[11px] text-muted-foreground italic">
            Diese Wohnung wurde via Investagon-Reservierung angelegt und ist eingefroren. Änderungen erfolgen ausschließlich über eine neue Reservierungsvereinbarung.
          </p>
        )}

        {aktionen}
      </div>
    </div>
  );
}

/**
 * Von wann bis wann ein Objekt ausgewählt war, in einer Zeile.
 *
 * Das „bis“ ist der Zeitpunkt des Wechsels und steht schon immer im Verlauf.
 * Das „von“ wird erst seit 09/2026 mitgeschrieben, ältere Einträge haben es
 * nicht. Dann steht dort nur das „bis“ und keine halbe Klammer.
 */
function zeitraum(von: string | undefined, bis: string): string {
  const vonText = von ? formatDatum(von) : "";
  const bisText = bis ? formatDatum(bis) : "";
  if (vonText && bisText) return `vom ${vonText} bis ${bisText}`;
  if (bisText) return `ersetzt am ${bisText}`;
  if (vonText) return `seit dem ${vonText}`;
  return "";
}

/**
 * Die Zeitachse der Objektauswahl: welches Objekt wann an diesem Investment
 * stand.
 *
 * Oben das gerade gültige Objekt, darunter zurückgenommen die vorherigen.
 * Durchgestrichen und in Grau, damit auf einen Blick klar ist, dass sie
 * vergangen sind und nicht etwa weitere Objekte.
 *
 * Vorher stand hier nur der Zeitpunkt des Wechsels, also allein das Ende.
 * Wie lange ein Objekt tatsächlich ausgewählt war, ließ sich daraus nicht
 * ablesen, und beim ersten Eintrag schon gar nicht.
 *
 * Bestehende Investments haben keinen Verlauf. Dort erscheint der Bereich gar
 * nicht, statt eine Zeitachse mit einem einzigen Punkt zu zeichnen: Was oben
 * in der Karte steht, muss darunter nicht noch einmal stehen.
 */
function ObjektVerlaufListe({
  verlauf, aktuell,
}: {
  verlauf: ObjektVerlaufEintrag[];
  /**
   * Das gerade gültige Objekt, der jüngste Punkt der Zeitachse. Es hat ein
   * „von“, aber noch kein „bis“, deshalb steht dort „seit dem“.
   */
  aktuell?: { bezeichnung: string; kaufpreis: number; seit: string } | null;
}) {
  if (verlauf.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Zeitachse der Objektauswahl
      </p>
      <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5">
        <ol className="space-y-3 border-l border-muted-foreground/30 pl-4">
          {aktuell && (
            <li className="relative flex items-start justify-between gap-3 text-xs">
              <span className="absolute left-[calc(-1rem_-_4.5px)] top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
              <div className="min-w-0">
                <p className="font-medium text-foreground">{aktuell.bezeichnung || "ohne Adresse"}</p>
                <p className="text-[11px] text-muted-foreground/80">
                  {aktuell.seit ? `seit dem ${formatDatum(aktuell.seit)}` : "aktuell ausgewählt"}
                </p>
              </div>
              {aktuell.kaufpreis > 0 && (
                <span className="shrink-0 font-medium text-foreground">{fmt(aktuell.kaufpreis)}</span>
              )}
            </li>
          )}
          {verlauf.map((e, i) => (
            <li
              key={`${e.gewechseltAm}-${e.weNr}-${i}`}
              className="relative flex items-start justify-between gap-3 text-xs"
            >
              <span className="absolute left-[calc(-1rem_-_4.5px)] top-1 h-2 w-2 rounded-full bg-muted-foreground/40 ring-2 ring-background" />
              <div className="min-w-0">
                <p className="text-muted-foreground line-through decoration-muted-foreground/50">
                  {objektBezeichnung(e) || "ohne Adresse"}
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  {zeitraum(e.eingetragenAm, e.gewechseltAm)}
                  {e.gewechseltVon ? ` · ersetzt von ${e.gewechseltVon}` : ""}
                </p>
              </div>
              {e.kaufpreis > 0 && (
                <span className="shrink-0 text-muted-foreground line-through decoration-muted-foreground/50">
                  {fmt(e.kaufpreis)}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

interface FreieWohnungenCardProps {
  kunde: KundeData;
  inv: Investment;
  minRahmen: number;
  maxRahmen: number;
  allDocsApproved: boolean;
  canSwitchObjekt: boolean;
  canSwitchObjektDirect: boolean;
  userRole: string;
  /** Name des angemeldeten Nutzers, für den Verlauf beim Objektwechsel. */
  userName?: string;
  onSwitchObjekt: (objektId: string, wohnungId: string) => void;
  onCancelReservation?: (objektId: string, wohnungId: string) => void;
  onNavigate: (path: string) => void;
  /** Nach dem Speichern der Objektdaten, damit die Seite den neuen Stand liest. */
  onObjektGespeichert?: () => void;
  /**
   * „Gesendete Links“, direkt unter dem Terminknopf (seit dem 05.10.2026).
   * Vorher ein eigener Kasten unter der Karte.
   */
  gesendeteLinks?: ReactNode;
}

export function FreieWohnungenCard({
  kunde, inv, minRahmen, maxRahmen, allDocsApproved,
  canSwitchObjekt, canSwitchObjektDirect, userRole, userName, onSwitchObjekt, onCancelReservation, onNavigate,
  onObjektGespeichert, gesendeteLinks,
}: FreieWohnungenCardProps) {
  const [_expandedObjekt, _setExpandedObjekt] = useState<string | null>(null);
  const [objektDialogOffen, setObjektDialogOffen] = useState(false);
  // Die Kennung braucht die Testfreischaltung „Objekte“ (`objekteTestFreigabe`),
  // ohne sie sähe ein freigeschalteter Vertriebspartner hier nur „Objekt eintragen“.
  const { authUser } = useUser();

  const allObjekte = getObjekte().filter(o => o.sichtbar);
  /*
   * Steht fest, um welche Wohnung es geht?
   *
   * Vorher stand hier eine handgepflegte Stufenliste, in der
   * "bonitaetsunterlagen" und "faelligkeit" fehlten. Ein Kunde in einer dieser
   * beiden Stufen bekam wieder alle freien Wohnungen zu sehen, obwohl sein
   * Objekt längst gesetzt war, und in der Pipeline stand es daneben korrekt.
   *
   * Jetzt zählt die eine Rangfolge aus `pipelineStufen` plus die einfache
   * Frage, ob überhaupt Objektdaten hinterlegt sind. Damit erscheint das
   * Objekt auch schon in der Objektauswahl selbst, sobald die Adresse
   * eingetragen wurde, und die Liste verschwindet genau dann, wenn sie nichts
   * mehr zu entscheiden hat.
   */
  const abReservierung = stufeErreicht(inv.pipelineStufe, "reservierung");
  const objektStehtFest = abReservierung || !objektDatenFehlen(inv.id);
  const isSetter = userRole === "setterin";
  // Bei einer Wohnung aus dem eigenen Bestand kommen die Objektdaten aus dem
  // Objekt und werden dort gepflegt. Von Hand geändert wird nur, was auch von
  // Hand eingetragen wurde, sonst stünden zwei Fassungen nebeneinander.
  // Solange der Bestandsweg aus ist, trifft das auf jedes Objekt zu.
  const objektVonHand = !hatBestandsWohnung(inv.id);
  // Die am Investment gepflegten Angaben. Einmal lesen, mehrfach gebraucht.
  const eigeneDaten = vorhandeneObjektDaten(inv.id);
  // Das am Investment hinterlegte Foto, für Objekte außerhalb des Bestands.
  const eigenesBild = resolveImageUrl(eigeneDaten.bildUrl || "");
  // Alle am Investment hinterlegten Bilder, zum Durchblättern in der Karte.
  const eigeneBilder = bilderListe(eigeneDaten.bilder, eigeneDaten.bildUrl).map((u) => resolveImageUrl(u));
  const darfObjektPflegen = !isSetter && ["admin", "inhaber", "vertriebsleiter", "vertriebspartner"].includes(userRole);

  /*
   * Ein bereits gespeicherter Verweis auf eine Wohnung aus dem eigenen
   * Bestand.
   *
   * Bewusst nicht am Schalter `BESTANDSWOHNUNG_AKTIV`: Hier wird nichts neu
   * verknüpft, hier wird nur gelesen und angezeigt. Gäbe es doch irgendwo ein
   * Investment mit einer verknüpften Bestandswohnung, soll es weiter zu sehen
   * sein und nicht plötzlich als „kein Objekt zugewiesen“ dastehen. Dasselbe
   * gilt für die beiden Rückfälle darunter.
   */
  let gesetztWohnung = inv.wohnungId ? allObjekte.flatMap(o => o.wohnungen).find(w => w.id === inv.wohnungId) : null;
  let parentObjekt = gesetztWohnung ? allObjekte.find(o => o.wohnungen.some(w => w.id === inv.wohnungId)) : null;

  /*
   * Rückfall über die Kunden-Kennung an der Wohnung, für Altvorgänge ohne
   * `wohnungId` am Investment.
   *
   * Er greift bewusst nur ab der Reservierung UND nur, solange am Investment
   * selbst keine Objektdaten liegen. Beides ist nötig: Sucht man breiter,
   * zeigt ein zweites Investment die Wohnung des ersten an, weil die Wohnung
   * nur den Kunden kennt und nicht den Vorgang. Genau dagegen stand hier schon
   * immer eine Einschränkung, und sie muss enger werden, seit die Anzeige auch
   * in der Objektauswahl greift.
   */
  const eigeneObjektDatenFehlen = objektDatenFehlen(inv.id);
  if (!gesetztWohnung && abReservierung && eigeneObjektDatenFehlen) {
    for (const obj of allObjekte) {
      const w = obj.wohnungen.find(w => w.kundeId === kunde.id && w.status === "reserviert");
      if (w) { gesetztWohnung = w; parentObjekt = obj; break; }
    }
  }

  /*
   * Rückfall über den Namensabgleich, ebenfalls nur für Altvorgänge.
   *
   * Er rät anhand des Titels, welches Objekt aus dem Bestand gemeint sein
   * könnte. Seit der Titel bei von Hand eingetragenen Objekten die Adresse
   * ist, würde er sonst irgendein ähnlich benanntes Bestandsobjekt samt Bild
   * anzeigen. Deshalb nur, wenn am Investment gar keine Objektdaten liegen.
   */
  if (!parentObjekt && abReservierung && eigeneObjektDatenFehlen) {
    const searchText = (inv.objektTitel || kunde.objekt || "").toLowerCase();
    if (searchText) {
      for (const obj of allObjekte) {
        if (searchText.includes(obj.titel.toLowerCase()) || obj.titel.toLowerCase().includes(searchText.split(" WE")[0].trim().toLowerCase())) {
          parentObjekt = obj;
          const weMatch = searchText.match(/we\s*(\d+)/i);
          if (weMatch) {
            const matchedW = obj.wohnungen.find(w => w.weNr === weMatch[1]);
            if (matchedW) gesetztWohnung = matchedW;
          }
          break;
        }
      }
    }
  }

  // Group free units by object — alle Objekte mit freien Einheiten anzeigen
  // (kein Bonitätsrahmen-Filter mehr, damit der VP zum Scrollen alle Optionen sieht)
  //
  // Solange der Bestandsweg aus ist, gibt es keine freien Wohnungen zum
  // Auswählen und die Liste bleibt leer. Die Berechnung steht vollständig da
  // und läuft wieder, sobald `BESTANDSWOHNUNG_AKTIV` auf an steht.
  const objekteMitFreienWohnungen = (BESTANDSWOHNUNG_AKTIV ? allObjekte : [])
    .map(obj => {
      // Nur was im Angebot steht. Die gesetzte oder reservierte Wohnung des
      // Kunden weiter oben sucht bewusst in allen Einheiten, sein Kauf muss
      // sichtbar bleiben (Christians Regel vom 23.09.2026).
      const freie = obj.wohnungen.filter(w => w.status === "frei" && einheitImAngebot(w));
      if (freie.length === 0) return null;
      const preise = freie.map(w => w.vkGesamt).filter(Boolean);
      const renditen = freie.map(w => w.rendite).filter(Boolean) as number[];
      return {
        obj,
        freie,
        preisVon: Math.min(...preise),
        preisBis: Math.max(...preise),
        renditeVon: renditen.length > 0 ? Math.min(...renditen) : 0,
        renditeBis: renditen.length > 0 ? Math.max(...renditen) : 0,
      };
    })
    .filter(Boolean) as {
      obj: typeof allObjekte[0];
      freie: typeof allObjekte[0]["wohnungen"];
      preisVon: number;
      preisBis: number;
      renditeVon: number;
      renditeBis: number;
    }[];

  const totalFreie = objekteMitFreienWohnungen.reduce((s, o) => s + o.freie.length, 0);

  const objImg = parentObjekt ? resolveImageUrl(parentObjekt.bildUrl || parentObjekt.bilder?.[0]?.url || "") : "";
  const invMeta = (inv as any).meta || {};
  const virtualWohnung = invMeta.rvVirtualWohnung;
  const isInvestagonInv = invMeta.quelle === "investagon";

  /*
   * Hier stand ein dritter Weg in die Reservierungsvereinbarung, eigens für
   * Investagon-Objekte. Er war gebaut, aber an keinem Knopf angeschlossen, und
   * er hätte die Kundendaten ohne eine einzige Objektangabe weitergereicht.
   * Die Reservierung wird jetzt an einer Stelle gestartet, in der Karte
   * "Reservierung", und die nimmt die Objektdaten von hier mit.
   */

  /*
   * Die eine Zusammenstellung, aus der die Karte lebt.
   *
   * Sie führt beide Quellen zusammen: die Wohnung aus dem eigenen Bestand,
   * falls eine verknüpft ist, und die am Investment gepflegten Angaben. Was
   * danach fehlt, gibt es schlicht nicht, und die Karte lässt es weg.
   */
  const karte = objektKarteDaten({
    investment: eigeneDaten,
    wohnung: gesetztWohnung,
    objekt: parentObjekt
      ? {
          titel: parentObjekt.titel,
          adresse: parentObjekt.adresse,
          plz: parentObjekt.plz,
          ort: parentObjekt.ort,
          bildUrl: objImg,
          badge: parentObjekt.badge,
          globalDaten: parentObjekt.globalDaten,
          verkaeuferDaten: parentObjekt.verkaeuferDaten,
        }
      : null,
    meta: invMeta,
    eigenesBild,
    eigeneBilder,
    investmentTitel: inv.objektTitel,
    kontaktObjekt: kunde.objekt,
    erstelltAm: inv.erstellt_am,
    reserviert: abReservierung,
  });

  /*
   * Wann die Objektkarte erscheint und wann die Aufforderung, eines
   * einzutragen.
   *
   * `gesetztWohnung` zählt mit: Eine reservierte Bestandswohnung vor der
   * Stufe "Reservierung" hatte bisher eine eigene, dritte Darstellung. Jetzt
   * geht auch sie durch dieselbe Karte.
   */
  const zeigtObjekt = objektStehtFest || !!gesetztWohnung;
  const hatObjektAngaben = !!(
    parentObjekt || gesetztWohnung || virtualWohnung || inv.objektTitel || kunde.objekt
  );

  /*
   * Der eine Knopf je Fall, unten in der Karte.
   *
   * "Details ansehen" und "Kundenansicht" sind weg. Beide führten aus dem
   * Kundenprofil heraus und gab es nur beim eigenen Bestand, also genau in
   * dem Fall, den es heute kaum gibt.
   *
   * "Objektdaten ändern" stand vorher oben in der Überschriftenzeile und
   * damit woanders als "Einheit wechseln" unten in der Karte. Beide ändern
   * dasselbe Objekt, deshalb stehen sie jetzt im selben Knopfstreifen.
   *
   * Geblieben ist der eine Weg, der das Objekt tatsächlich ändert, und der
   * heißt in beiden Fällen anders, weil er anderes tut: Bei einer
   * Bestandswohnung wird die Reservierung aufgehoben und der Vorgang geht
   * zurück auf die Objektauswahl, deshalb "Einheit wechseln". Bei einem von
   * Hand eingetragenen Objekt gibt es keine Einheit zu wechseln, dort werden
   * die Angaben im Fenster geändert, und dasselbe Fenster dient der Korrektur
   * eines Tippfehlers, deshalb "Objektdaten ändern". Beide legen das
   * bisherige Objekt in den Verlauf.
   */
  /*
   * Der Bonitätsrahmen wird nur genannt, wenn es einen gibt.
   *
   * Er kommt aus der Selbstauskunft dieses Investments. Solange sie fehlt,
   * stehen hier null Euro, und "Bonitätsrahmen: 0 € – 0 €" wäre eine Aussage,
   * die niemand treffen wollte. Dann bleibt der Zusatz einfach weg.
   */
  const rahmenText = maxRahmen > 0 ? ` · Bonitätsrahmen: ${fmt(minRahmen)} – ${fmt(maxRahmen)}` : "";

  const darfEinheitWechseln = !!(canSwitchObjekt && gesetztWohnung && parentObjekt);
  const darfObjektAendern = darfObjektPflegen && objektVonHand;
  // Die Setterin darf weder das eine noch das andere. Ohne diese Frage bliebe
  // unter ihrer Karte ein leerer Knopfstreifen stehen.
  const objektAktionen = !darfEinheitWechseln && !darfObjektAendern ? null : (
    <div className="flex gap-2 flex-wrap">
      {darfEinheitWechseln && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-8 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 hover:bg-[hsl(var(--warning))]/10"
          onClick={() => onSwitchObjekt(parentObjekt!.id, gesetztWohnung!.id)}
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Einheit wechseln
        </Button>
      )}
      {darfObjektAendern && (
        <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setObjektDialogOffen(true)}>
          <Pencil className="h-3 w-3 mr-1" /> Objektdaten ändern
        </Button>
      )}
    </div>
  );

  /*
    Zwei Rollen, zwei Namen, und das ist Absicht.

    Der Vertrieb wählt hier aus und trägt hier ein, für ihn heißt der Bereich
    "Objektauswahl", genau wie die Pipelinestufe, auf die das Eintragen den
    Vorgang hebt. Die Setterin darf nur ansehen und trifft keine Auswahl;
    "Zugewiesene Wohnung" beschreibt für sie, was sie sieht. Bitte nicht
    vereinheitlichen.
  */
  const abschnittTitel = isSetter ? "Zugewiesene Wohnung" : "Objektauswahl";

  /*
    Der Weg zum Objektgespraech, direkt hier.

    Christian am 21.09.2026: An der Stelle, an der das Objekt steht, soll auch
    der Termin dazu entstehen koennen. Der Knopf oeffnet die eigene Terminseite
    mit dem hinterlegten Kalender und legt die Adresse zum Verschicken in die
    Zwischenablage.

    Seit dem 23.09.2026 steht er immer unter der Ueberschrift statt daneben,
    siehe `KundenprofilAbschnitt`.

    Nicht fuer die Setterin: Sie waehlt hier nichts aus und terminiert kein
    Objektgespraech.
  */
  return (
    <Card className="p-6">
      <div className="w-8 h-1 bg-primary mb-3" />
      <KundenprofilAbschnitt
        kopf={<h3 className="font-bold mb-4">{abschnittTitel}</h3>}
        kopfZusatz={(!isSetter && kunde?.id) || gesendeteLinks ? (
          <>
            {!isSetter && kunde?.id && (
              <TerminseiteKnopf
                kontaktId={kunde.id}
                kontaktName={`${kunde.vorname || ""} ${kunde.nachname || ""}`.trim()}
                kontaktEmail={kunde.email}
                investmentId={inv?.id}
                anlass="objektvorstellung"
                beschriftung="Objektvorstellungsgespräch vereinbaren"
                className="text-xs h-7 shrink-0"
              />
            )}
            {/* Eigene Zeile unter dem Knopf; bleibt die Liste leer, faellt auch die Zeile weg. */}
            {gesendeteLinks && <div className="w-full empty:hidden">{gesendeteLinks}</div>}
          </>
        ) : null}
      >
      <p className="text-xs text-muted-foreground mb-3">
        {isSetter
          ? (gesetztWohnung ? "Der Kunde ist auf folgende Wohnung reserviert" : "Der Kunde wurde noch nicht auf eine Wohnung reserviert.")
          : objektStehtFest
            ? (objektVonHand
                ? "Objekt für dieses Investment. Adresse und Kaufpreis werden hier gepflegt."
                : "Zugewiesenes Objekt für dieses Investment")
            : BESTANDSWOHNUNG_AKTIV
              ? `${totalFreie} freie Wohnungen in ${objekteMitFreienWohnungen.length} Objekten${rahmenText}`
              : `Noch kein Objekt eingetragen${rahmenText}`
        }
      </p>

      {/*
        Die Objektkarte, gleich für jeden Kunden.

        Vorher standen hier drei Zweige nebeneinander: eine Karte für die
        Wohnung aus dem eigenen Bestand, eine schmalere für eine reservierte
        Einheit vor der Reservierungsstufe und weiter unten eine dritte für
        das von Hand eingetragene Objekt. Jetzt ist es eine, und woher die
        Angaben kommen, entscheidet `objektKarteDaten`.
      */}
      {zeigtObjekt && hatObjektAngaben ? (
        <ObjektKarteBlock
          karte={karte}
          investagon={isInvestagonInv}
          investagonRef={invMeta.investagonRef}
          aktionen={objektAktionen}
        />
      ) : zeigtObjekt ? (
        <div className="py-2 space-y-2">
          <p className="text-sm text-muted-foreground">Kein Objekt zugewiesen.</p>
          {darfObjektPflegen && (
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setObjektDialogOffen(true)}>
              <Home className="h-3 w-3 mr-1" /> Objekt eintragen
            </Button>
          )}
        </div>
      ) : null}

      {/* ── Setter: hint when no unit assigned ── */}
      {isSetter && !gesetztWohnung && !objektStehtFest && (
        <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md px-3 py-3">
          &#8505;&#65039; Die Wohnungszuweisung erfolgt durch den zust&auml;ndigen Vertriebspartner. Sobald der Kunde auf eine Wohnung reserviert wurde, wird sie hier angezeigt.
        </div>
      )}

      {/* ── Objektliste, solange noch kein Objekt feststeht (nicht für Setter) ── */}
      {!objektStehtFest && !gesetztWohnung && !isSetter && (
        <div className="space-y-3">
          {/*
            Die eine Eingabestelle für das Objekt eines Investments.

            Ohne sie ließe sich ein Objekt nur beim Ziehen in der Pipeline
            eintragen, und dort fragt seit dem Umbau nichts mehr danach. Wer
            eine Adresse einträgt, hebt den Vorgang zugleich auf die Stufe
            "Objektauswahl", sofern er noch davor steht.
          */}
          {darfObjektPflegen && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Adresse, Einheit und Kaufpreis des Objekts hier eintragen.
              </p>
              <Button size="sm" variant="outline" className="text-xs h-7 shrink-0" onClick={() => setObjektDialogOffen(true)}>
                <Home className="h-3 w-3 mr-1" /> Objekt eintragen
              </Button>
            </div>
          )}
          {invMeta.einheitGewechseltAm && (
            <div className="rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-3 py-2 text-xs text-[hsl(var(--warning))] flex items-start gap-2">
              <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold">Reservierung aufgehoben, bitte neue Einheit auswählen</p>
                <p className="text-[11px] text-muted-foreground">
                  Die vorherige Reservierung wurde aufgehoben, eine unterschriebene Vereinbarung liegt archiviert im Kundenordner. Sobald eine neue Einheit reserviert ist, wartet die Reservierungsvereinbarung erneut auf die Unterschrift des Kunden.
                </p>
              </div>
            </div>
          )}
          {/*
            Hier stand bis zum 16.09.2026 der Hinweis, die Selbstauskunft
            muesse erst unterschrieben sein, bevor reserviert werden kann.
            Er ist doppelt ueberholt:

            1. Diese Karte ist ueberhaupt nur bedienbar, wenn entweder die
               Selbstauskunft vorliegt oder der Vermerk "Kunde finanziert
               selbst" gesetzt ist. Sonst steht an ihrer Stelle eine gesperrte
               Kachel. Der Hinweis konnte also nur noch in Faellen erscheinen,
               in denen er falsch war, zuletzt gemeldet von Christian am
               Schalter fuer den Selbstfinanzierer.
            2. Die Reservierung haengt seit dem 16.09.2026 am gesetzten Objekt,
               nicht mehr an der Selbstauskunft. Worauf sie wartet, sagt die
               gesperrte Reservierungskachel selbst.
          */}
          {/*
            Empfehlungen und alle freien Objekte, seit dem 23.09.2026.

            Oben die fünf Einheiten, die zum Rahmen und zum Wohnort am besten
            passen, darunter alle Objekte mit freien, angebotenen Einheiten.
            Das Eintragen von Hand darüber bleibt, wie es war. Nur für die
            Rollen in `EMPFEHLUNG_ROLLEN`, alle anderen sehen die Karte wie
            bisher. Die Regeln stehen in `einheitEmpfehlung.ts`.

            Seit dem 29.09.2026 zusätzlich nur, wenn die aktive Rolle den
            Eintrag „Objekte" in der Seitenleiste sieht (Christian: erst mit
            dessen Freischaltung, bis dahin nur „Objekt eintragen").
          */}
          {siehtEmpfehlungen(userRole) && siehtObjekteMenue({ rolle: userRole, identitaet: { userId: authUser?.id, email: authUser?.email } }) && (
            <ObjektEmpfehlungen
              kunde={kunde}
              inv={inv}
              minRahmen={minRahmen}
              maxRahmen={maxRahmen}
              userRole={userRole}
              userName={userName}
              onNavigate={onNavigate}
            />
          )}
          {/*
            Die Auswahlliste aus dem eigenen Bestand.

            Sie hängt am Schalter `BESTANDSWOHNUNG_AKTIV` und ist deshalb
            zurzeit nicht zu sehen. Ohne eigenen Bestand wäre sie ohnehin leer
            und stünde nur als "Keine freien Wohnungen verfügbar" im Weg. Die
            Karte zeigt jetzt entweder das Objekt oder die Aufforderung, eines
            einzutragen. Sobald es eigene Objekte gibt, kommt sie unverändert
            zurück.
          */}
          {!BESTANDSWOHNUNG_AKTIV ? null : objekteMitFreienWohnungen.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Keine freien Wohnungen verfügbar.</p>
          ) : (
            <div className="space-y-2 max-h-[296px] overflow-y-auto pr-1">
              {objekteMitFreienWohnungen.map(({ obj, freie, preisVon, preisBis, renditeVon, renditeBis }) => {
                const oImg = resolveImageUrl(obj.bildUrl || obj.bilder?.[0]?.url || "");
                const kundenansichtUrl = `/kundenansicht/objekt/${obj.id}?kunde=${encodeURIComponent(`${kunde.vorname} ${kunde.nachname}`)}&kundeId=${kunde.id}&investmentId=${inv.id}&minRahmen=${minRahmen}&maxRahmen=${maxRahmen}`;
                return (
                  <div key={obj.id} className="border rounded-xl overflow-hidden transition-all">
                    <button
                       className="w-full text-left flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
                       onClick={() => window.open(kundenansichtUrl, "_blank", "noopener,noreferrer")}
                     >
                      {oImg ? (
                        <img src={oImg} alt={obj.titel} className="w-14 h-10 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-14 h-10 bg-muted rounded shrink-0 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{obj.titel}</p>
                          {obj.badge && <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">{obj.badge}</Badge>}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span>{obj.plz} {obj.ort}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 mr-1">
                        <div className="flex items-center gap-1.5 justify-end">
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                            {freie.length} frei
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {fmt(preisVon)}{preisVon !== preisBis ? ` – ${fmt(preisBis)}` : ""}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {renditeVon.toFixed(2)}%{renditeVon !== renditeBis ? ` – ${renditeBis.toFixed(2)}%` : ""} Rendite
                        </p>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/*
        Die Zeitachse steht unter der Karte des aktuellen Objekts, nicht darin.

        Sie gehört zu beiden Darstellungen, der Bestandswohnung oben und dem
        von Hand eingetragenen Objekt darunter. An einer Stelle steht sie
        einmal, statt in jedem der Zweige noch einmal.

        Das aktuelle Objekt bekommt sie mit, damit die Achse nicht mitten in
        der Vergangenheit endet: Es ist der jüngste Punkt, mit „von“, aber noch
        ohne „bis“.
      */}
      <ObjektVerlaufListe
        verlauf={objektVerlauf(inv.id)}
        aktuell={
          zeigtObjekt && hatObjektAngaben
            ? {
                bezeichnung: objektBezeichnung(karte.daten) || karte.titel,
                kaufpreis: karte.daten.kaufpreis || 0,
                seit: objektEingetragenAm(inv.id),
              }
            : null
        }
      />

      {/*
        Die gespeicherten Berechnungen des Investmentrechners.

        Sie stehen hier und nicht in einer eigenen Karte, weil die Frage
        dieselbe ist wie oben: Welches Objekt, und rechnet es sich? Wer das
        Objekt einträgt, rechnet es im selben Zug durch.
      */}
      <InvestmentBerechnungen
        investmentId={inv.id}
        darfPflegen={darfObjektPflegen}
        onNavigate={onNavigate}
      />


      {objektDialogOffen && (
        <ObjektDatenDialog
          offen
          investmentId={inv.id}
          gewechseltVon={userName}
          onAbbrechen={() => setObjektDialogOffen(false)}
          onGespeichert={() => {
            setObjektDialogOffen(false);
            onObjektGespeichert?.();
          }}
        />
      )}
      </KundenprofilAbschnitt>
    </Card>
  );
}