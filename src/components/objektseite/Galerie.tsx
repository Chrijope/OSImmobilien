import { useEffect, useRef, useState } from "react";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { OBJEKTSEITE_KUNDEN_TEXTE } from "@/components/objektseite/objektseiteKundenTexte";
import { Building2, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LazyImage } from "@/components/ui/lazy-image";
import { useReduzierteBewegung } from "@/hooks/useReduzierteBewegung";
import { resolveImageUrl } from "@/lib/objekteImages";
import type { ObjektBild } from "@/lib/objekteStore";
import {
  bildBeschriftung, galerieAufteilung, naechsterIndex, vorherigerIndex, wechseltVonAllein, FESTE_KACHELN,
} from "@/lib/objektGalerie";
import { cn } from "@/lib/utils";
import { Hinweis } from "./Bausteine";
import { GalerieVollbild } from "./GalerieVollbild";

/**
 * Die Bildergalerie auf Objekt- und Einheiten-Seite.
 *
 * Oben die Adresse mit Ortssymbol, darunter fünf Bildfelder: links eins groß,
 * rechts vier kleine. Das Feld rechts unten wechselt von allein durch die
 * Bilder, die sonst kein Feld bekommen haben, und trägt deren Zahl. Ein Klick
 * auf ein Feld öffnet die Vollbildansicht bei genau diesem Bild. Im großen
 * Feld blättern Pfeile, Wischen und die Pfeiltasten durch alle Bilder.
 *
 * Seit dem 01.10.2026 hat die Galerie keine Reiter mehr: Dokumente und Karte
 * liegen in der Reiterleiste der Seite (Christians Vorgabe), die Fotos sind
 * immer sichtbar und brauchen keinen eigenen Reiter.
 *
 * ## Warum der Wechsel so vorsichtig läuft
 *
 * Ein Bild, das sich von allein austauscht, ist Bewegung. Deshalb gilt:
 * Wer im Betriebssystem „Bewegung reduzieren" eingestellt hat, bekommt gar
 * keinen Wechsel, sondern ein festes Bild mit der Zahl. Der Wechsel hält
 * außerdem an, solange die Maus auf dem Feld steht oder es den Tastaturfokus
 * hat, und solange die Vollbildansicht offen ist. Und er läuft nicht weiter,
 * wenn der Tab im Hintergrund liegt: Ein Zeitgeber, der unsichtbar weiterläuft,
 * kostet nur Strom. Das Muster dafür steht auch in `useVorabScores`.
 *
 * Zur Karte, die bis zum 01.10.2026 hier im dritten Reiter lag:
 *
 * Bis zum 16.09.2026 stand davor ein Knopf „Karte laden" mit dem Hinweis, die
 * Karte lade erst nach Zustimmung. Diese Zustimmung war zu dem Zeitpunkt
 * längst hinfällig: Die Objektübersicht schickt beim Öffnen die Adressen aller
 * Objekte an Photon und Overpass, um die Umgebung vorzuladen
 * (`umgebungVorladen` in `src/pages/Objekte.tsx`). Wer diese Seite überhaupt
 * erreicht, dessen Objektadresse ist also schon draußen. Der Knopf hielt nur
 * noch die Kartenbilder zurück und fragte nach einer Erlaubnis, die er gar
 * nicht mehr erteilen konnte.
 *
 * Ein Zustimmungshinweis, der nichts verhindert, ist schlechter als keiner: Er
 * behauptet einen Schutz, den es nicht gibt. Deshalb lädt die Karte jetzt
 * sofort, und der Hinweis nennt schlicht die Herkunft. Es geht dabei um
 * Objektadressen, nicht um Kundendaten; sie stehen ohnehin im Exposé.
 *
 * Seit dem 23.09.2026 geht gar keine Adresse mehr hinaus: Die Karte zeigt nur
 * die am Objekt gespeicherte Lage und Analyse (`UmgebungsKarte`), und das
 * Vorladen in der Objektübersicht ist entfallen.
 */

/** So lange steht ein Bild im Wechselfeld, bevor das nächste kommt. */
const WECHSEL_MS = 3000;

/** Das Raster der kleinen Felder, je nachdem wie viele es gibt. Nie ein leeres Feld. */
const KACHEL_RASTER: Record<number, string> = {
  1: "grid-cols-1 sm:grid-cols-1 sm:grid-rows-1",
  2: "grid-cols-2 sm:grid-cols-1 sm:grid-rows-2",
  3: "grid-cols-3 sm:grid-cols-2 sm:grid-rows-2",
  4: "grid-cols-4 sm:grid-cols-2 sm:grid-rows-2",
};

/** Ab so vielen Pixeln waagrecht gilt eine Fingerbewegung als Wischen. */
const WISCH_PX = 40;

/**
 * Die Größe des großen Fotos. Auf dem Handy im Seitenverhältnis 4:3, also
 * eine große Kachel über die ganze Breite (bei 360 px etwa 310 × 232 px),
 * ab sm eine feste Höhe neben den kleinen Feldern.
 *
 * Christian am 23.09.2026: Auf dem Handy war das Foto nur ein schmaler
 * Streifen. Die Ursache stand in index.css (`[class*="h-8"]` traf auch
 * `sm:h-80`), behoben ist sie dort; das Seitenverhältnis hier sorgt dafür,
 * dass das Foto auf jeder Handybreite gleich wirkt statt mit fester Höhe
 * mal quer, mal fast quadratisch. Die Objektseite gibt dieselbe Angabe mit
 * einer Stufe für sehr breite Bildschirme als `hoehe` mit.
 */
const GALERIE_HOEHE = "aspect-[4/3] sm:aspect-auto sm:h-80 lg:h-96";

export function Galerie({
  bilder, adresse, titel, hoehe = GALERIE_HOEHE, hinweis, titelbildObjektId, titelbildUrl,
  kundenModus = false,
}: {
  bilder: ObjektBild[];
  titelbildObjektId?: string;
  titelbildUrl?: string;
  adresse: string;
  titel: string;
  hoehe?: string;
  hinweis?: string;
  /** Die Fassung für die Kundenansicht: Leertext für Kunden, ohne Hinweis auf die Objektanlage. */
  kundenModus?: boolean;
}) {
  const [grossIdx, setGrossIdx] = useState(0);
  const wischStart = useRef<number | null>(null);
  const gewischt = useRef(false);
  const [wechselIdx, setWechselIdx] = useState(0);
  const [angehalten, setAngehalten] = useState(false);
  const [vollbild, setVollbild] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [sichtbar, setSichtbar] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const oeffner = useRef<HTMLButtonElement | null>(null);
  const reduzierteBewegung = useReduzierteBewegung();

  const a = galerieAufteilung(bilder);
  const gesamt = a.alle.length;
  const kachelAnzahl = a.feste.length + (a.wechsel.length > 0 ? 1 : 0);
  const laeuft = wechseltVonAllein(a);
  const wechselBild = a.wechsel[Math.min(wechselIdx, Math.max(0, a.wechsel.length - 1))];
  // Kommen weniger Bilder nach (Objektwechsel), bleibt der Index im Rahmen.
  const grossAktuell = Math.min(grossIdx, Math.max(0, gesamt - 1));
  const grossBild = a.alle[grossAktuell];
  const blaettern = (schritt: 1 | -1) =>
    setGrossIdx((i) => {
      const jetzt = Math.min(i, gesamt - 1);
      return schritt === 1 ? naechsterIndex(jetzt, gesamt) : vorherigerIndex(jetzt, gesamt);
    });

  // Ein Zeitgeber im Hintergrundtab bringt niemandem etwas.
  useEffect(() => {
    const beiWechsel = () => setSichtbar(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", beiWechsel);
    return () => document.removeEventListener("visibilitychange", beiWechsel);
  }, []);

  useEffect(() => {
    if (!laeuft || reduzierteBewegung || angehalten || vollbild || !sichtbar) return;
    const zeitgeber = window.setInterval(
      () => setWechselIdx((i) => naechsterIndex(i, a.wechsel.length)),
      WECHSEL_MS,
    );
    return () => window.clearInterval(zeitgeber);
  }, [laeuft, reduzierteBewegung, angehalten, vollbild, sichtbar, a.wechsel.length]);

  const oeffneVollbild = (index: number, knopf: HTMLButtonElement | null) => {
    oeffner.current = knopf;
    setStartIndex(index);
    setVollbild(true);
  };

  // Kundensprache, Etappe 3: im Kundenmodus die Sprache der Seite, im CRM Deutsch.
  const sprache = useAnzeigeSprache();
  const gt = OBJEKTSEITE_KUNDEN_TEXTE[sprache].galerie;
  const vt = OBJEKTSEITE_KUNDEN_TEXTE[sprache].vollbild;
  const beschrift = (b: ObjektBild | undefined, i: number) => bildBeschriftung(b, adresse, i, gesamt, sprache);
  const strasse = adresse.split(",")[0]?.trim() || titel || "Objekt";

  /*
   * Die Pfeile erscheinen am Rechner erst, wenn die Maus auf dem Bild steht
   * oder ein Pfeil den Fokus hat. Auf Geräten ohne Mauszeiger (hover: none)
   * stehen sie immer da, dort gibt es kein Darüberfahren.
   */
  const pfeilKlasse = cn(
    "absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-opacity",
    "opacity-0 group-hover/gross:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [@media(hover:none)]:opacity-100",
  );

  /** Ein kleines Feld rechts, das immer dasselbe Bild zeigt. */
  const festeKachel = (bild: ObjektBild, i: number) => {
    const index = i + 1;
    const beschriftung = beschrift(bild, index);
    return (
      <button
        key={bild.id || bild.url}
        type="button"
        onClick={(e) => oeffneVollbild(index, e.currentTarget)}
        aria-label={gt.vollbildOeffnen(beschriftung)}
        className={cn(
          "group relative overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          // Bei drei kleinen Feldern liegt das dritte unten über die ganze Breite,
          // damit kein Feld leer bleibt.
          kachelAnzahl === 3 && i === 2 && "sm:col-span-2",
        )}
      >
        {/*
          Sofort laden, nicht erst beim Scrollen.

          Christian am 22.09.2026: Beim Öffnen der Objektseite sah man die
          Bilder kurz nachladen. Das grosse Bild kam schon sofort, diese Felder
          daneben aber verzögert mit Platzhalter und Einblenden. Sie stehen
          beim Öffnen im Sichtfeld, da bringt Nachladen nichts ausser einem
          Flackern. Die Bilder der Vollbildansicht bleiben faul.
        */}
        <LazyImage
          src={resolveImageUrl(bild.url)}
          alt={beschriftung}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          wrapperClassName="absolute inset-0 h-full w-full"
          priority
        />
      </button>
    );
  };

  return (
    <div data-ui={kundenModus ? undefined : "card"} className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex items-start gap-2">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-tight text-foreground">{strasse}</div>
          {adresse && <div className="truncate text-xs text-muted-foreground">{adresse}</div>}
        </div>
      </div>

      {gesamt === 0 ? (
          <EmptyState
            icon={Building2}
            title={gt.leerTitel}
            description={kundenModus
              ? gt.leerKunde
              : 'Sobald Bilder in der Objektanlage oder aus Investagon vorliegen, erscheinen sie hier. Hochladen geht über „Objekt bearbeiten".'}
          />
        ) : (
          <div className={cn("grid gap-2", kachelAnzahl > 0 && "sm:grid-cols-2")}>
            {grossBild && (
              <div className="group/gross relative min-w-0" data-testid="galerie-gross">
                <button
                  type="button"
                  onClick={(e) => {
                    // Ein Wischen endet auf manchen Geräten mit einem Klick, der soll nichts öffnen.
                    if (gewischt.current) { gewischt.current = false; return; }
                    oeffneVollbild(grossAktuell, e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    if (gesamt < 2) return;
                    if (e.key === "ArrowRight") { e.preventDefault(); blaettern(1); }
                    if (e.key === "ArrowLeft") { e.preventDefault(); blaettern(-1); }
                  }}
                  onTouchStart={(e) => { wischStart.current = e.touches[0]?.clientX ?? null; gewischt.current = false; }}
                  onTouchEnd={(e) => {
                    const start = wischStart.current;
                    wischStart.current = null;
                    const ende = e.changedTouches[0]?.clientX;
                    if (start === null || ende === undefined || gesamt < 2) return;
                    const dx = ende - start;
                    if (Math.abs(dx) < WISCH_PX) return;
                    gewischt.current = true;
                    blaettern(dx < 0 ? 1 : -1);
                  }}
                  aria-label={gt.vollbildOeffnen(beschrift(grossBild, grossAktuell))}
                  className={cn(
                    "group relative block w-full touch-pan-y overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    hoehe,
                  )}
                >
                  <LazyImage
                    key={grossBild.id || grossBild.url}
                    src={resolveImageUrl(grossBild.url)}
                    alt={beschrift(grossBild, grossAktuell)}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    wrapperClassName="h-full w-full"
                    priority
                  />
                </button>
                {gesamt > 1 && (
                  <>
                    <button type="button" aria-label={vt.vorheriges} onClick={() => blaettern(-1)} className={cn(pfeilKlasse, "left-2")}>
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button type="button" aria-label={vt.naechstes} onClick={() => blaettern(1)} className={cn(pfeilKlasse, "right-2")}>
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <span aria-hidden="true" className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-foreground/55 px-2 py-0.5 text-xs font-medium tabular-nums text-background">
                      {grossAktuell + 1} / {gesamt}
                    </span>
                  </>
                )}
              </div>
            )}

            {/*
              Auf dem Handy ein flacher Streifen unter dem großen Bild, ab sm
              die zweite Spalte daneben. Die Höhe kommt dort aus der
              Rasterzeile, die das große Bild vorgibt. Damit das aufgeht,
              liegen die Bilder in den kleinen Feldern absolut: Sonst gäbe ihre
              eigene Größe die Zeilenhöhe vor, und die Spalte ragte neben dem
              großen Bild hinaus.
            */}
            {kachelAnzahl > 0 && (
              <div className={cn("grid h-20 gap-2 sm:h-auto", KACHEL_RASTER[kachelAnzahl])}>
                {a.feste.map(festeKachel)}

                {a.wechsel.length > 0 && wechselBild && (
                  <button
                    type="button"
                    onClick={(e) => oeffneVollbild(1 + FESTE_KACHELN + wechselIdx, e.currentTarget)}
                    onMouseEnter={() => setAngehalten(true)}
                    onMouseLeave={() => setAngehalten(false)}
                    onFocus={() => setAngehalten(true)}
                    onBlur={() => setAngehalten(false)}
                    aria-label={
                      a.weitere > 0
                        ? gt.alleFotos(gesamt, a.weitere)
                        : gt.vollbildOeffnen(beschrift(wechselBild, 1 + FESTE_KACHELN + wechselIdx))
                    }
                    className="group relative overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {/*
                      Für den sanften Übergang liegen drei Bilder übereinander:
                      das vorige, das aktuelle und das nächste. Das vorige blendet
                      aus, während das aktuelle einblendet, und das nächste ist
                      schon geladen, wenn es dran ist. Mehr wird nicht geladen,
                      sonst zöge ein Objekt mit dreißig Fotos alle dreißig.
                    */}
                    {a.wechsel.map((b, i) => {
                      const nah =
                        i === wechselIdx ||
                        i === naechsterIndex(wechselIdx, a.wechsel.length) ||
                        i === vorherigerIndex(wechselIdx, a.wechsel.length);
                      if (!nah) return null;
                      return (
                        <img
                          key={b.id || b.url}
                          src={resolveImageUrl(b.url)}
                          alt={i === wechselIdx ? beschrift(b, 1 + FESTE_KACHELN + i) : ""}
                          aria-hidden={i === wechselIdx ? undefined : true}
                          // Das gerade gezeigte Bild steht im Sichtfeld und wird
                          // sofort geladen, die beiden Nachbarn dürfen warten.
                          loading={i === wechselIdx ? "eager" : "lazy"}
                          decoding={i === wechselIdx ? "sync" : "async"}
                          className={cn(
                            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
                            i === wechselIdx ? "opacity-100" : "opacity-0",
                          )}
                        />
                      );
                    })}
                    {a.weitere > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center bg-foreground/45 text-base font-semibold text-background sm:text-lg">
                        +{a.weitere}
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
      )}

      {hinweis && <Hinweis>{hinweis}</Hinweis>}

      <GalerieVollbild
        offen={vollbild}
        onOpenChange={setVollbild}
        bilder={a.alle}
        adresse={adresse}
        startIndex={startIndex}
        titelbildObjektId={titelbildObjektId}
        titelbildUrl={titelbildUrl}
        beimSchliessen={() => oeffner.current?.focus()}
      />
    </div>
  );
}
