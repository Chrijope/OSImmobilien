import { useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Loader2, WifiOff, Minimize2, Settings2, X,
  ChevronDown, ChevronUp, Users,
} from "lucide-react";
import logoImg from "@/assets/moreimmo-logo.png";
import type { Gegenstelle, Verbindung, VerbindungsZustand } from "@/lib/videoraumVerbindung";
import { bestimmeBuehne, merkeTeilende, type GeteilterInhalt } from "@/lib/videoraumBuehne";
import { spiegeltVorschau, type HintergrundArt } from "@/lib/videocallEinstellungen";
import {
  BildHinweis, FORMAT_QUER, KACHEL_FARBE, KACHEL_GRUND, KACHEL_IM_FORMAT, KachelFuss, KachelMenue, KameraAus,
  VideoFlaeche, menueRegie, useBildstand, type GastRegie, type KachelRegie,
} from "./Kachel";
import {
  STAND_AN, entferneAbwesende, uebernehmeStand, type Stand,
} from "@/lib/videoraumStaende";
import { ladeKachelreihe, merkeKachelreihe } from "@/lib/videoraumKachelreihe";
import { useNebenfenster } from "./Nebenfenster";
import { useIsMobile } from "@/hooks/use-mobile";
import { mitWerten } from "@/lib/videoraumAnrede";
import { videoraumGastTexte, type VideoraumGastTexte } from "@/lib/videoraumGastTexte";
import type { Sprache } from "@/lib/seitenSprache";

/** Die festen Texte der Gespraechsansicht, siehe `videoraumGastTexte`. */
type GespraechTexte = VideoraumGastTexte["gespraech"];

/*
 * Die Bausteine einer Kachel liegen seit dem 18.09.2026 in `Kachel.tsx`, das
 * Merken von Ton und Kamera der anderen in `videoraumStaende`. Beides wird
 * jetzt auch ausserhalb des Gespraechs gebraucht, in der Leiste oben und im
 * schwebenden Fenster auf dem Schreibtisch. Der Inhalt ist unveraendert.
 */
export type { Stand };

/**
 * Die Gespraechsansicht. Beide Seiten nutzen dieselbe Komponente, der
 * Gastgeber blendet ueber `seitenSpalte` zusaetzlich seine Arbeitsflaeche ein.
 *
 * Bis zu drei Gegenstellen: eine einzelne bekommt wie bisher die ganze
 * Flaeche, ab zwei wird ein Raster daraus, jede Kachel mit Namen.
 */

interface GespraechProps {
  lokalerStream: MediaStream | null;
  /** Alle Gegenstellen im Netz. Leer, solange noch niemand da ist. */
  gegenstellen: Gegenstelle[];
  zustand: VerbindungsZustand;
  /** Name fuers Warten, solange noch keine Gegenstelle da ist. */
  gegenName: string;
  verbindung: Verbindung | null;
  aufBeenden: () => void;
  titel: string;
  seitenSpalte?: React.ReactNode;
  /** Hinweis in der Kopfzeile, etwa "Transkription laeuft". */
  kopfHinweis?: React.ReactNode;
  /**
   * Streifen unter der Kopfzeile, ueber die ganze Breite. Fuer alles, was
   * niemand uebersehen darf, etwa den Hinweis auf das stummgeschaltete Mikrofon.
   */
  banner?: React.ReactNode;
  /**
   * Bildschirmteilen gesperrt. Der Gast darf erst teilen, wenn der Gastgeber
   * es freigibt. `teilenHinweis` steht dann am Knopf.
   */
  teilenGesperrt?: boolean;
  teilenHinweis?: string;
  /**
   * Der Satz am Rahmen des eigenen geteilten Bildschirms. Beim Gastgeber
   * sitzt am anderen Ende ein Kunde, beim Gast sein Ansprechpartner, deshalb
   * kommt der Wortlaut von aussen.
   */
  teilenBeschriftung?: string;
  /**
   * Noch im Klickpfad des Teilen-Knopfes, bevor der Browser seine Auswahl
   * zeigt.
   *
   * Dahinter steht das schwebende Fenster auf dem Schreibtisch, siehe
   * `schwebendesFenster`: Es geht nur nach einer echten Nutzergeste auf, und
   * nach der Auswahl des Bildschirms ist die Geste verbraucht. Es muss also
   * vorher aufgehen. Kommt das Teilen dann doch nicht zustande, weil der
   * Nutzer die Auswahl abbricht, nimmt die zurueckgegebene Funktion es wieder
   * zurueck.
   */
  vorTeilen?: () => Promise<(() => void) | undefined>;
  /**
   * Gespraech kleiner machen und im CRM weiterarbeiten. Nur der Gastgeber
   * bekommt das, der Kunde soll im Gespraech bleiben.
   */
  aufMinimieren?: () => void;
  /** Von aussen gesteuerte Schalter, wenn das Gespraech oberhalb der Seite lebt. */
  tonAn?: boolean;
  bildAn?: boolean;
  /**
   * Umschalter dazu. Wer `tonAn` von aussen setzt, muss auch das Umschalten
   * uebernehmen, sonst haette der Knopf keine Wirkung mehr.
   */
  wechsleTon?: () => void;
  wechsleBild?: () => void;
  /** Beginn des Gespraechs. Fehlt er, zaehlt die Ansicht ab dem Einhaengen. */
  startZeit?: number;
  /** Eigenbild spiegeln, Vorgabe an. Wirkt nur auf die eigene Vorschau. */
  spiegelEigenbild?: boolean;
  /**
   * Welcher Video-Hintergrund gerade laeuft.
   *
   * Gebraucht wird davon nur der eine Fall "bild", und zwar fuer die
   * Spiegelung: Gespiegelt wird die ganze Videospur, also auch ein
   * eingesetztes Hintergrundbild. Christian am 18.09.2026: Sein Firmenlogo
   * stand seitenverkehrt im Bild, lesbar als „ommlE".
   *
   * Das Bild vorgespiegelt in die Leinwand zu zeichnen hilft nicht: Dieselbe
   * Leinwand geht ueber `ersetzeSenderSpur` an die Gegenstellen, dort stuende
   * die Schrift dann verkehrt. Es gibt nur eine Leinwand fuer beide Seiten,
   * und die bleibt richtig herum. Aussetzen kann also nur die Spiegelung der
   * eigenen Vorschau, und nur solange wirklich ein Bild laeuft: Beim
   * Weichzeichnen und ohne Hintergrund gibt es keine Schrift, die verkehrt
   * stehen koennte.
   */
  hintergrundArt?: HintergrundArt;
  /**
   * Die rohe Kamera fuer die eigene Kachel waehrend des Bildschirmteilens.
   *
   * Laeuft ein Video-Hintergrund, steckt im `lokalerStream` nicht die Kamera,
   * sondern die Leinwand, auf der Person und Hintergrund zusammengesetzt
   * werden. Beim Teilen ruht diese Rechnerei, und zwar mit Absicht: Hinaus
   * geht der Bildschirm, nicht das Gesicht. Die Leinwand steht damit aber
   * still, und der Gastgeber sah sich selbst als Standbild. Christian am
   * 18.09.2026: „beim anderen ist das bild eingefroren, warum?"
   *
   * Deshalb eine Funktion und kein Wert: Sie wird bei jedem Zeichnen gefragt
   * und ist damit immer aktuell, auch wenn das Teilen hier drin beginnt und
   * die Seite darueber gar nicht neu zeichnet. Gibt sie nichts zurueck, laeuft
   * ohnehin keine Komposition und der lokale Strom friert nicht ein.
   */
  eigeneVorschau?: () => MediaStream | null;
  /** Gewaehlter Lautsprecher fuer die Gegenstellen, wo der Browser es kann. */
  lautsprecherId?: string | null;
  /**
   * Inhalt fuer das Einstellungs-Fenster (Geraete, Hintergrund), meist der
   * GeraeteSchnellzugriff. Nur wenn gesetzt, erscheint der Knopf dazu.
   */
  schnellEinstellungen?: React.ReactNode;
  /**
   * Woran sich die Hoehe bemisst.
   *
   * "fenster" ist die Vorgabe und fuellt das Browserfenster. So steht der
   * Raum beim Gast, dessen Seite allein im Fenster liegt.
   *
   * "flaeche" fuellt den Platz, den der Elternteil uebrig laesst. So steht er
   * im CRM: Dort sitzt die Kopfzeile darueber und die Seitenleiste daneben,
   * und eine Fensterhoehe waere genau um die Kopfzeile zu viel. Der Raum ragte
   * dann unter den Fensterrand, die Bedienleiste mit Auflegen war erst nach
   * dem Scrollen zu sehen.
   */
  rahmen?: "fenster" | "flaeche";
  /**
   * Die Gastregie fuer das Dreipunktmenue an den Gastkacheln.
   *
   * Nur der Gastgeber gibt sie herein, und damit ist die Frage „darf ein Gast
   * jemanden stummschalten?" nicht eine Sache des Ausblendens, sondern des
   * Bauplans: Die Gastseite reicht nichts herein, also gibt es dort kein
   * Menue. Der Befehl selbst bleibt ohnehin beim Gastgeber, ein fremder
   * Browser gehorcht nur ihm.
   *
   * `stand` und die beiden Funktionen kommen aus derselben Quelle wie die
   * Knoepfe in der Spalte. Das Menue ist der naehere Weg, kein zweiter.
   */
  gastRegie?: GastRegie;
  /**
   * Sitze ich als Gastgeber hier?
   *
   * Nur fuer die Reihenfolge beim Stapeln auf dem Telefon, siehe
   * `bestimmeBuehne`: Oben steht der Gastgeber, auf beiden Seiten. Alles
   * andere haengt nicht daran, Rechte schon gar nicht.
   */
  istGastgeber?: boolean;
  /**
   * Der Kundenlink zum Weitergeben. Steht unter „Teilnehmer" zum Kopieren.
   *
   * Nur der Gastgeber reicht ihn herein. Ein Gast soll den Zugang zum Raum
   * nicht weiterverteilen koennen; die Liste der Anwesenden sieht er sehr
   * wohl. Siehe `TeilnehmerListe`.
   */
  einladungsLink?: string;
  /**
   * Sprache der festen Texte (Kundensprache, Etappe 3). Nur die Gastseite
   * reicht sie herein, beim Gastgeber im CRM bleibt es bei Deutsch.
   */
  sprache?: Sprache;
}

function Knopf({
  an,
  gefahr = false,
  gesperrt = false,
  titel,
  label,
  onClick,
  children,
}: {
  an?: boolean;
  gefahr?: boolean;
  gesperrt?: boolean;
  titel?: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const grund = gefahr
    ? "bg-[#E5372B] border-[#E5372B] text-white"
    : an
      ? "bg-[#30E19E]/15 border-[#30E19E]/35 text-[#30E19E]"
      : "bg-white/[0.07] border-white/10 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={gesperrt}
      title={titel}
      aria-label={label}
      className={`flex h-[62px] ${gefahr ? "w-[86px]" : "w-16"} flex-col items-center justify-center gap-1.5 rounded-2xl border transition-colors enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${grund}`}
    >
      {children}
      <span className="text-[8.5px] font-semibold uppercase tracking-[0.05em] opacity-80">{label}</span>
    </button>
  );
}

/** Eine Kachel je Gegenstelle: Bild oder Hinweis, dazu der Name. */
function TeilnehmerKachel({
  gegenstelle,
  stand = STAND_AN,
  sinkId,
  imFormat = false,
  fuellend = false,
  klein = false,
  regie,
  sprache = "de",
}: {
  gegenstelle: Gegenstelle;
  stand?: Stand;
  sinkId?: string | null;
  /** Die Kachel nimmt das Seitenverhaeltnis der ankommenden Spur an. */
  imFormat?: boolean;
  /**
   * Gestapelt, aber ueber die volle Breite: die Lage auf dem Telefon.
   *
   * Dasselbe Geruest wie `imFormat`, nur ohne die Formatrechnerei. Die Kachel
   * fuellt ihre Haelfte ganz aus, das Bild liegt mit `object-contain` darin,
   * und was frei bleibt, ist der Kachelgrund.
   */
  fuellend?: boolean;
  /** Kleine Kachel in der Reihe beim Teilen: engere Beschriftung. */
  klein?: boolean;
  /** Nur beim Gastgeber gesetzt: das Dreipunktmenue an dieser Gastkachel. */
  regie?: KachelRegie;
  sprache?: Sprache;
}) {
  const t = videoraumGastTexte(sprache).gespraech;
  const [verhaeltnis, setVerhaeltnis] = useState(FORMAT_QUER);
  /*
   * Meldung und Wirklichkeit zusammen. Die Meldung allein hat den Gastgeber im
   * Stich gelassen: Der Laptop meldete „Kamera an", es kam aber nichts an, und
   * die Kachel blieb wortlos schwarz.
   */
  const { aufBildfluss, bildstand } = useBildstand(stand.bildAn, gegenstelle.zustand);
  const kasten = (
    <div
      data-pruefung="teilnehmer-kachel"
      data-format={imFormat ? verhaeltnis.toFixed(4) : undefined}
      data-lage={imFormat ? "format" : fuellend ? "fuellend" : "raster"}
      style={imFormat ? { aspectRatio: String(verhaeltnis) } : undefined}
      className={`${KACHEL_GRUND} ${imFormat ? KACHEL_IM_FORMAT : "relative h-full w-full"}`}
    >
      {gegenstelle.stream ? (
        <>
          {/*
            Eingepasst, nicht beschnitten. Christian am 18.09.2026: „das bild
            soll also nie angepasst werden, sondern es muss sich das format an
            die ansicht anpassen." Was frei bleibt, ist der dunkle Grund der
            Kachel, kein Weiss und kein Loch.
          */}
          <VideoFlaeche
            stream={gegenstelle.stream}
            stumm={false}
            einpassen
            sinkId={sinkId}
            aufFormat={setVerhaeltnis}
            aufBildfluss={aufBildfluss}
          />
          {bildstand !== "laeuft" && <BildHinweis art={bildstand} klein={klein} sprache={sprache} />}
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
          <Loader2 className={klein ? "h-4 w-4 animate-spin text-white/40" : "h-6 w-6 animate-spin text-white/40"} />
          <p className={klein ? "text-[10.5px] leading-tight text-white/60" : "text-[13px] text-white/60"}>
            {mitWerten(t.warteAuf, { name: gegenstelle.name })}
          </p>
        </div>
      )}
      {gegenstelle.stream && <KachelFuss name={gegenstelle.name} tonAn={stand.tonAn} klein={klein} sprache={sprache} />}
      {/*
        Das Menue steht auch dann schon da, wenn das Bild noch fehlt: Das
        Teilen laesst sich freigeben, bevor man einander sieht.
      */}
      {regie && <KachelMenue name={gegenstelle.name} regie={regie} klein={klein} />}
    </div>
  );
  // Im Stapel braucht die Kachel einen Elternteil mit fester Hoehe, sonst hat
  // weder das Format noch die volle Hoehe etwas, worauf es sich bezieht.
  if (!imFormat && !fuellend) return kasten;
  return <div className="relative min-h-0 w-full flex-1">{kasten}</div>;
}

/**
 * Die grosse Flaeche mit dem geteilten Bildschirm.
 *
 * Der Rahmen ist kein Schmuck. Er beantwortet die Frage, die sich beim Teilen
 * immer stellt: Was davon geht gerade hinaus? Beim eigenen Bildschirm ist er
 * deshalb deutlich, in der Farbe der Marke, mit einem Satz darueber. Bei einem
 * fremden genuegt der Name.
 *
 * Der Browser zeigt daneben sein eigenes Band ("Sie teilen Ihren Bildschirm")
 * und faerbt den Rand des geteilten Fensters. Das laesst sich weder
 * abschalten noch gestalten, und es ist in jedem Browser anders. Dieser
 * Rahmen hier liegt in der Anwendung und steht ueberall gleich.
 */
function BildschirmFlaeche({
  geteilt,
  beschriftung,
  sinkId,
  className = "",
  t,
}: {
  geteilt: GeteilterInhalt;
  /** Der Satz ueber dem eigenen Bildschirm, etwa "Das sieht dein Kunde gerade". */
  beschriftung: string;
  sinkId?: string | null;
  className?: string;
  t: GespraechTexte;
}) {
  const eigen = geteilt.eigen;
  return (
    <div
      data-pruefung="bildschirm-flaeche"
      className={`relative overflow-hidden rounded-2xl bg-black ${
        eigen ? "border-2 border-[#30E19E] shadow-[0_0_0_4px_rgba(48,225,158,.12)]" : "border border-white/[0.07]"
      } ${className}`}
    >
      {geteilt.stream ? (
        <VideoFlaeche stream={geteilt.stream} stumm={geteilt.stumm} einpassen sinkId={eigen ? undefined : sinkId} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          <p className="text-[13px] text-white/60">{t.vorschauAufbau}</p>
        </div>
      )}
      <div
        className={`absolute left-3 top-3 flex items-center gap-2 rounded-xl px-2.5 py-1 text-[12.5px] backdrop-blur ${
          eigen ? "bg-[#30E19E]/20 font-semibold text-[#AEF3D9]" : "bg-[#0B1119]/70 text-white/80"
        }`}
      >
        <MonitorUp className="h-3.5 w-3.5 shrink-0" />
        <span>{eigen ? beschriftung : mitWerten(t.bildschirmVon, { name: geteilt.name })}</span>
      </div>
    </div>
  );
}

/**
 * Das eigene Kamerabild. In der Ecke, waehrend des Teilens in der Reihe.
 *
 * Die Lage kommt als Wort herein und bestimmt die Positionierung gleich mit.
 * Das ist keine Umstaendlichkeit, sondern die Lehre aus einem Fehler, den man
 * im Quelltext nicht sieht: Vorher brachte dieser Kasten `relative` fest mit,
 * und die Ecke reichte von aussen `absolute` nach. Beides sind Positionen
 * gleichen Gewichts, und im fertigen Stylesheet steht `relative` hinter
 * `absolute`. Also gewann `relative`, das kleine Bild blieb im Textfluss und
 * rutschte unter das grosse Video, bei beiden Seiten gleichermassen. Auf einem
 * Fenster von 896 Pixeln Hoehe lag es 153 Pixel unterhalb des sichtbaren
 * Bereichs: vorhanden, richtig beschriftet, nur nirgends zu sehen.
 *
 * Mit einer einzigen Angabe je Lage kann sich das nicht wiederholen.
 */
function EigenesBild({
  stream,
  spiegeln,
  lage,
  stand = STAND_AN,
  sprache = "de",
}: {
  stream: MediaStream | null;
  spiegeln: boolean;
  /**
   * "kachel" steht gleichberechtigt unter dem Gegenueber, "ecke" schwebt ueber
   * der grossen Flaeche, "reihe" steht in der Kachelreihe beim Teilen.
   *
   * "voll" ist das Gegenstueck zu "kachel" auf dem Telefon: dieselbe Haelfte,
   * nur ueber die ganze Breite statt in der Form des eigenen Bildes. "raster"
   * ist ein Viertel der Flaeche, ebenfalls nur auf dem Telefon, ab drei
   * Personen.
   */
  lage: "ecke" | "reihe" | "kachel" | "voll" | "raster";
  /** Der eigene Stand. Wer die Kamera ausschaltet, soll es auch selbst sehen. */
  stand?: Stand;
  sprache?: Sprache;
}) {
  const t = videoraumGastTexte(sprache).gespraech;
  const [verhaeltnis, setVerhaeltnis] = useState(FORMAT_QUER);
  const kachel = lage === "kachel";
  // Die drei grossen Lagen tragen die groessere Beschriftung.
  const gross = kachel || lage === "voll" || lage === "raster";
  // Nur im Stapel braucht es den Elternteil mit der halben Hoehe.
  const imStapel = kachel || lage === "voll";
  /*
   * Die Ecke liegt ueber dem Video, aber unter dem Einstellungs-Fenster (z-20).
   * Auf dem Telefon ist sie schmaler: 128 Pixel auf einer rund 350 Pixel
   * breiten Flaeche, also gut ein Drittel der Breite und ein Siebtel der Hoehe.
   * Die Knopfleiste liegt ausserhalb dieser Flaeche und bleibt unberuehrt, der
   * Name des Gegenuebers sitzt unten links.
   */
  const lageKlassen = {
    ecke: "absolute bottom-4 right-4 z-10 aspect-[4/3] w-[128px] rounded-xl shadow-[0_18px_40px_-18px_rgba(0,0,0,.8)] sm:w-[196px]",
    reihe: "relative aspect-[4/3] h-full shrink-0 rounded-xl",
    kachel: `${KACHEL_IM_FORMAT} rounded-2xl`,
    voll: "relative h-full w-full rounded-2xl",
    raster: "relative h-full w-full rounded-2xl",
  }[lage];
  const kasten = (
    <div
      data-pruefung="eigenes-bild"
      data-lage={lage}
      data-format={kachel ? verhaeltnis.toFixed(4) : undefined}
      data-gross={gross || undefined}
      style={kachel ? { aspectRatio: String(verhaeltnis) } : undefined}
      /*
        Derselbe Kachelgrund wie bei den fremden Kacheln, kein eigenes Schwarz.
        Sonst stehen im Stapel zwei verschiedene Dunkeltoene uebereinander, und
        genau dort, wo ein Bild nicht ganz fuellt, faellt das auf.
      */
      className={`overflow-hidden border border-white/15 ${KACHEL_FARBE} ${lageKlassen}`}
    >
      <VideoFlaeche stream={stream} stumm spiegeln={spiegeln} einpassen aufFormat={setVerhaeltnis} />
      {/*
        Der eigene Stand kommt aus `tonAn` und `bildAn` des Gespraechs, nicht
        aus der Meldungstabelle der anderen. Sich selbst meldet man dort
        niemandem, ein fehlender Eintrag laese sich als „stumm" lesen, und in
        der eigenen Kachel stuende dann ein Zeichen, das nicht stimmt.
      */}
      {!stand.bildAn && <KameraAus text={t.deineKameraAus} klein={!gross} />}
      {/* Auch hier der Name, nicht nur in den fremden Kacheln: „in jeder kamerasicht". */}
      <KachelFuss name={t.du} tonAn={stand.tonAn} klein={!gross} sprache={sprache} />
    </div>
  );
  if (!imStapel) return kasten;
  return <div className="relative min-h-0 w-full flex-1">{kasten}</div>;
}

/**
 * Der Schalter, der die Kachelreihe waehrend des Teilens wegnimmt.
 *
 * Christian am 18.09.2026: „er soll aber am Handy selbst entscheiden, ob er
 * meine Kachel einklappt oder ausgeklappt lässt." Auf einem Telefon ist die
 * Flaeche knapp, und wer eine Tabelle oder ein Exposé ansieht, will
 * moeglicherweise jeden Punkt davon.
 *
 * 44 mal 44 Pixel, und zwar in festen Pixeln. Die Wurzelschrift steht in
 * `index.css` auf 90 Prozent, aus einem `h-11` wuerden dort 40 Pixel: unter
 * der Groesse, die eine Fingerkuppe zuverlaessig trifft.
 */
function ReiheEinklappen({ onClick, t }: { onClick: () => void; t: GespraechTexte }) {
  return (
    <button
      type="button"
      data-pruefung="kachelreihe-einklappen"
      onClick={onClick}
      aria-label={t.einklappen}
      aria-expanded
      title={t.einklappen}
      className="flex h-[44px] w-[44px] shrink-0 items-center justify-center self-center rounded-xl border border-white/10 bg-white/[0.07] text-white transition-colors hover:bg-white/[0.14]"
    >
      <ChevronDown className="h-[18px] w-[18px]" />
    </button>
  );
}

/**
 * Was an der Stelle der Kachelreihe steht, solange sie eingeklappt ist.
 *
 * Ein Streifen, kein Verschwinden. Waere die Reihe spurlos weg, wuesste
 * niemand mehr, dass es sie gibt, und erst recht nicht, wie er sie
 * zurueckholt. Deshalb steht hier, wie viele Kacheln warten, und daneben der
 * Knopf, der sie zurueckbringt.
 */
function ReiheEingeklappt({ zahl, onZeigen, t }: { zahl: number; onZeigen: () => void; t: GespraechTexte }) {
  return (
    <div
      data-pruefung="kachelreihe-eingeklappt"
      className="flex h-[52px] shrink-0 items-center gap-2 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#22303f] to-[#141d28] py-1 pl-3 pr-1"
    >
      <Users aria-hidden className="h-4 w-4 shrink-0 text-white/45" />
      <p className="min-w-0 flex-1 truncate text-[12px] leading-tight text-white/70">
        {zahl === 1 ? t.eingeklapptEins : mitWerten(t.eingeklapptMehr, { zahl })}
      </p>
      <button
        type="button"
        data-pruefung="kachelreihe-zeigen"
        onClick={onZeigen}
        aria-label={t.kamerasZeigen}
        aria-expanded={false}
        className="flex h-[44px] min-w-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-white/[0.14]"
      >
        <ChevronUp aria-hidden className="h-4 w-4" />
        {t.zeigen}
      </button>
    </div>
  );
}

function dauerText(startMs: number, jetztMs: number): string {
  const s = Math.max(0, Math.floor((jetztMs - startMs) / 1000));
  const std = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sek = s % 60;
  return `${String(std).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sek).padStart(2, "0")}`;
}

export function Gespraech({
  lokalerStream,
  gegenstellen,
  zustand,
  gegenName,
  verbindung,
  aufBeenden,
  titel,
  seitenSpalte,
  kopfHinweis,
  banner,
  teilenGesperrt = false,
  teilenHinweis,
  teilenBeschriftung,
  vorTeilen,
  aufMinimieren,
  tonAn: tonVonAussen,
  bildAn: bildVonAussen,
  wechsleTon,
  wechsleBild,
  startZeit,
  spiegelEigenbild = true,
  hintergrundArt = "aus",
  eigeneVorschau,
  lautsprecherId,
  schnellEinstellungen,
  rahmen = "fenster",
  gastRegie,
  istGastgeber = false,
  einladungsLink,
  sprache = "de",
}: GespraechProps) {
  const t = videoraumGastTexte(sprache).gespraech;
  // Wenn das Gespraech oberhalb der Seite lebt, gibt der Zusammenhang den
  // Stand vor. Sonst verwaltet die Ansicht ihn selbst.
  const [tonIntern, setTonIntern] = useState(true);
  const [bildIntern, setBildIntern] = useState(true);
  const tonAn = tonVonAussen ?? tonIntern;
  const bildAn = bildVonAussen ?? bildIntern;
  const [teilt, setTeilt] = useState(false);
  // Der eigene Bildschirm fuer die eigene Vorschau, siehe beobachteTeilen.
  const [eigenerBildschirm, setEigenerBildschirm] = useState<MediaStream | null>(null);
  // Wer von den Gegenstellen gerade teilt, aus dem Regiebefehl "bildschirm".
  const [teilendeGegenstellen, setTeilendeGegenstellen] = useState<string[]>([]);
  // Ton und Kamera je Gegenstelle, aus "tonstand" und "bildstand".
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  /*
   * Der eigene Stand als Ref, damit die Antwort auf eine Standfrage immer den
   * aktuellen Wert nimmt. Haenge der Beobachter an `tonAn` und `bildAn`,
   * meldete er sich bei jedem Umschalten neu an, und eine Frage, die genau
   * dazwischen kaeme, ginge verloren.
   */
  const standRef = useRef<Stand>({ tonAn: true, bildAn: true });
  const [einstellungenOffen, setEinstellungenOffen] = useState(false);
  /*
   * Ob die Kachelreihe waehrend des Teilens ausgeklappt ist. Die Wahl gilt
   * fuer das ganze Gespraech, siehe `videoraumKachelreihe`: Wer sie am Telefon
   * einmal weggenommen hat, soll sie nicht bei jeder neuen Freigabe wieder
   * wegnehmen muessen.
   */
  const [reiheOffen, setReiheOffen] = useState(ladeKachelreihe);
  // Ohne den Beginn von aussen fienge die Dauer nach jedem Minimieren wieder
  // bei null an, waehrend die Leiste weiterzaehlt.
  const [eigenerStart] = useState(() => Date.now());
  const start = startZeit ?? eigenerStart;
  const [jetzt, setJetzt] = useState(() => Date.now());

  const schalteTon = () => {
    if (wechsleTon) { wechsleTon(); return; }
    const neu = !tonIntern;
    setTonIntern(neu);
    verbindung?.setzeSpur("audio", neu);
  };

  const wechsleReihe = () => {
    const neu = !reiheOffen;
    setReiheOffen(neu);
    merkeKachelreihe(neu);
  };

  const schalteBild = () => {
    if (wechsleBild) { wechsleBild(); return; }
    const neu = !bildIntern;
    setBildIntern(neu);
    verbindung?.setzeSpur("video", neu);
  };

  useEffect(() => {
    const takt = window.setInterval(() => setJetzt(Date.now()), 1000);
    return () => window.clearInterval(takt);
  }, []);

  /*
   * Das Teilen kann auch von aussen enden: Der Browser zeigt waehrenddessen
   * ein eigenes Banner mit "Freigabe beenden". Wer dort klickt, loest keinen
   * Klick in unserer Leiste aus, und der Knopf blieb aktiv stehen, obwohl
   * laengst wieder die Kamera lief.
   */
  useEffect(() => {
    if (!verbindung?.beobachteTeilen) return;
    return verbindung.beobachteTeilen((an, bildschirm) => {
      setTeilt(an);
      // Beim Beenden ausdruecklich auf null. Sonst stuende die letzte
      // Vorschau noch in der Flaeche, waehrend laengst die Kamera hinausgeht.
      setEigenerBildschirm(an ? bildschirm ?? null : null);
    });
  }, [verbindung]);

  /*
   * Die Gegenseite sagt Bescheid, wenn in ihrer Videospur ab jetzt ein
   * Bildschirm steckt. Ohne diese Meldung liesse sich das nicht erkennen: Es
   * bleibt derselbe Strom, nur mit anderem Inhalt.
   */
  const kennungen = gegenstellen.map((g) => g.kennung).join("|");
  useEffect(() => {
    if (!verbindung?.beobachteRegie) return;
    return verbindung.beobachteRegie((befehl, von) => {
      if (befehl.art !== "bildschirm") return;
      setTeilendeGegenstellen((bisher) => merkeTeilende(bisher, von, befehl.an, kennungen.split("|")));
    });
  }, [verbindung, kennungen]);

  /*
   * Wer den Raum verlaesst, sagt nicht eigens Bescheid, dass er nicht mehr
   * teilt. Seine Kennung muss also mit ihm verschwinden, sonst bliebe die
   * Buehne auf einen Teilnehmer eingestellt, den es nicht mehr gibt.
   */
  useEffect(() => {
    const vorhandene = kennungen ? kennungen.split("|") : [];
    setTeilendeGegenstellen((bisher) => {
      const gefiltert = bisher.filter((k) => vorhandene.includes(k));
      return gefiltert.length === bisher.length ? bisher : gefiltert;
    });
  }, [kennungen]);

  /*
   * Ton und Kamera der Gegenstellen.
   *
   * Der Anlass, Christian am 18.09.2026: „auch wenn der gastgeber seine kamera
   * ausschaltet muss es bei dem gegenueber angezeigt werden, da passiert noch
   * nichts. wenn der gast die kamera ausmacht, ist nur schwarz beim
   * gastgeber." Eine abgeschaltete Spur ist auf der Leitung nicht von einer
   * schweigenden Leitung zu unterscheiden, also sagt es jeder ausdruecklich.
   *
   * Das steht hier und nicht in den beiden Seiten, weil beide Seiten dieselbe
   * Ansicht benutzen. Sonst haette es zweimal gebaut werden muessen, und genau
   * daran lag der Fehler: Bisher meldete nur der Gast seinen Tonstand, der
   * Gastgeber niemandem etwas.
   */
  useEffect(() => {
    if (!verbindung?.beobachteRegie) return;
    return verbindung.beobachteRegie((befehl, von) => {
      if (befehl.art === "standfrage") {
        // Gezielt zurueck an den Frager, nicht in die Runde: Die anderen
        // kennen den Stand schon.
        verbindung.sendeRegie({ art: "tonstand", an: standRef.current.tonAn }, von);
        verbindung.sendeRegie({ art: "bildstand", an: standRef.current.bildAn }, von);
        return;
      }
      if (befehl.art !== "tonstand" && befehl.art !== "bildstand") return;
      setStaende((bisher) => uebernehmeStand(bisher, von, befehl.art, befehl.an));
    });
  }, [verbindung]);

  /*
   * Den eigenen Stand melden, an alle.
   *
   * Drei Anlaesse in einer Zeile: beim Umschalten, weil sich `tonAn` oder
   * `bildAn` aendert; beim Stummschalten durch den Gastgeber, weil auch das
   * denselben Wert aendert; und sobald jemand dazukommt, weil sich dann die
   * Kennungen aendern. Der letzte Fall ist der leicht zu uebersehende: Der
   * Signalkanal merkt sich nichts, wer spaeter kommt, bekommt nichts
   * nachgereicht und saehe sonst dauerhaft den falschen Hinweis.
   */
  useEffect(() => {
    if (!verbindung || !kennungen) return;
    verbindung.sendeRegie({ art: "tonstand", an: tonAn });
    verbindung.sendeRegie({ art: "bildstand", an: bildAn });
  }, [verbindung, kennungen, tonAn, bildAn]);

  /*
   * Und einmal nachfragen, wie es bei den anderen steht.
   *
   * Melden allein genuegt nicht. Wer seine Ansicht neu aufbaut, weiss danach
   * nichts mehr: Der Gastgeber macht das Gespraech im CRM kleiner und wieder
   * gross, und in der Kachel stuende wieder „Kamera an", obwohl der Gast sie
   * laengst abgeschaltet hat. Der Kanal merkt sich nichts, also wird gefragt.
   * Auf die Antwort folgt keine neue Frage, es kann also nicht hin und her
   * gehen.
   */
  useEffect(() => {
    if (!verbindung || !kennungen) return;
    verbindung.sendeRegie({ art: "standfrage" });
  }, [verbindung, kennungen]);

  // Wer weg ist, hinterlaesst keinen Stand. Sonst stuende beim naechsten
  // Teilnehmer mit derselben Kennung ein alter Hinweis.
  useEffect(() => {
    const vorhandene = kennungen ? kennungen.split("|") : [];
    setStaende((bisher) => entferneAbwesende(bisher, vorhandene));
  }, [kennungen]);

  /*
   * Die schmale Ansicht, also ein Telefon. Sie aendert nur die Anordnung, nicht
   * den Inhalt: zu zweit zwei Haelften ueber die volle Breite, ab drei ein
   * Viertelraster mit dem eigenen Bild darin. Am Rechner bleibt alles, wie es
   * ist, und waehrend des Bildschirmteilens ebenfalls.
   */
  const schmal = useIsMobile();
  const buehne = bestimmeBuehne({
    gegenstellen, teilendeGegenstellen, eigenesTeilen: teilt, eigenerBildschirm, schmal, istGastgeber,
  });
  const alleine = gegenstellen.length === 0;
  // Derselbe Stand, den die anderen gemeldet bekommen. Wer seine Kamera
  // ausschaltet, soll nicht ins Schwarze starren, sondern den Grund lesen.
  const eigenerStand: Stand = { tonAn, bildAn };
  standRef.current = eigenerStand;
  // Teilnehmerliste und Chat, siehe `Nebenfenster`: zwei Knoepfe fuer die
  // Leiste und eine Flaeche ueber dem Bild.
  const nebenfenster = useNebenfenster({
    verbindung, gegenstellen, staende, eigenerStand, einladungsLink,
    // Dieselbe Funktion wie im Dreipunktmenue und in der Spalte. Sie kommt nur
    // vom Gastgeber, beim Gast bleibt die Liste eine Liste.
    aufStumm: gastRegie?.aufStumm,
    sprache,
  });
  /*
   * Was in der eigenen Kachel steht. Waehrend des Teilens die rohe Kamera,
   * weil die Leinwand des Video-Hintergrunds dann ruht und sonst als
   * Standbild dastuende. Sonst der gewohnte lokale Strom.
   */
  const eigenesBildStrom = (teilt ? eigeneVorschau?.() : null) ?? lokalerStream;
  /*
   * Spiegeln oder nicht, an einer einzigen Stelle entschieden.
   *
   * Das eigene Bild steht an drei Stellen (Ecke, Reihe beim Teilen, Kachel bei
   * zweien im Raum). Die Regel dahinter ist ueberall dieselbe, deshalb steht
   * sie auch nur einmal hier und nicht dreimal im Baum. Der Schalter „Eigene
   * Vorschau spiegeln" behaelt seine Bedeutung, er ruht nur, solange ein
   * Hintergrundbild laeuft, siehe `hintergrundArt`. Die Regel selbst liegt in
   * `spiegeltVorschau`: Seit dem 18.09.2026 zeigen auch die Leiste und das
   * schwebende Fenster das eigene Bild, und dort muss dasselbe gelten.
   */
  const spiegeltEigenbild = spiegeltVorschau(spiegelEigenbild, hintergrundArt);

  /*
   * Das Menue je Gastkachel, oder nichts.
   *
   * In der kleinen Reihe waehrend des Teilens gibt es keins: Dort ist eine
   * Kachel rund 149 Pixel breit, und eine Trefferflaeche von 44 Pixeln legte
   * sich ueber ein Drittel des Gesichts. Die Spalte steht daneben und kann
   * dasselbe.
   */
  const menueFuer = (g: Gegenstelle) => menueRegie(g.kennung, gastRegie);

  return (
    /*
       * Feste Hoehe, nicht nur eine Mindesthoehe.
       *
       * Mit `min-h` wuchs die Seite, sobald die Seitenspalte laenger wurde als
       * das Fenster: Die Bedienknoepfe rutschten unter den Rand, und man musste
       * scrollen, um aufzulegen. Alles gehoert auf einen Blick auf den
       * Bildschirm, gescrollt wird hoechstens innerhalb der Spalte.
       *
       * Woran die Hoehe haengt, sagt `rahmen`. Im CRM ist es die Flaeche, die
       * der Elternteil uebrig laesst, sonst das Fenster. Eine feste
       * Fensterhoehe im CRM rechnete an der Kopfzeile vorbei.
       */
      <div
        className={`flex ${rahmen === "flaeche" ? "h-full" : "h-[100dvh]"} min-h-0 flex-col overflow-hidden bg-[#0B1119] text-white`}
      >
      <header className="flex h-[62px] shrink-0 items-center gap-4 border-b border-white/[0.07] bg-[#0F1621]/70 px-4 sm:px-6">
        <img src={logoImg} alt="OS Immobilien" className="h-[22px] object-contain brightness-0 invert" />
        <span className="hidden text-[13px] text-white/60 sm:inline">{titel}</span>
        {kopfHinweis}
        {/* `shrink-0`: Ein langer Hinweis daneben darf die Uhr nicht zerquetschen. */}
        <span className="ml-auto shrink-0 text-[13px] tabular-nums text-white/60">{dauerText(start, jetzt)}</span>
      </header>

      {banner && <div className="shrink-0">{banner}</div>}

      <div className={`flex min-h-0 flex-1 flex-col ${seitenSpalte ? "lg:flex-row" : ""}`}>
        <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl">
            {buehne.art === "teilen" && buehne.geteilt ? (
              /*
                Solange jemand teilt, gilt dieselbe Anordnung auf beiden
                Seiten: der geteilte Inhalt gross, alle Kamerabilder klein in
                einer Reihe darunter. Vorher war das zufaellig: Beim Gast
                fuellte der Bildschirm die Flaeche nur deshalb, weil dort eine
                einzige Gegenstelle stand, und beim Gastgeber war er gar nicht
                zu sehen.
              */
              <div className="flex h-full min-h-0 w-full flex-col gap-2.5">
                <BildschirmFlaeche
                  geteilt={buehne.geteilt}
                  beschriftung={teilenBeschriftung ?? t.teilenStandard}
                  sinkId={lautsprecherId}
                  className="min-h-0 flex-1"
                  t={t}
                />
                {/*
                  Die Kachelreihe laesst sich wegnehmen. Der Ton bleibt davon
                  unberuehrt: Er kommt aus den Kacheln der Gegenstellen, und
                  eine eingeklappte Reihe waere ein stummgeschaltetes
                  Gespraech. Deshalb bleiben die Kacheln im Baum stehen und
                  werden nur unsichtbar gemacht.
                */}
                <div
                  data-pruefung="kachelreihe"
                  data-offen={reiheOffen}
                  className={`flex shrink-0 items-stretch gap-2.5 ${
                    reiheOffen ? "h-[84px] sm:h-[112px]" : "pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
                  }`}
                  aria-hidden={!reiheOffen}
                >
                  {/*
                    Der Schalter steht vorn, nicht hinten. Bei vier Personen
                    im Raum ist die Reihe breiter als ein Telefon; was hinten
                    steht, liegt dann ausserhalb und laesst sich nicht mehr
                    antippen. Vorn kann ihm das nicht passieren.
                  */}
                  {reiheOffen && <ReiheEinklappen onClick={wechsleReihe} t={t} />}
                  <EigenesBild
                    stream={eigenesBildStrom}
                    spiegeln={spiegeltEigenbild}
                    lage="reihe"
                    stand={eigenerStand}
                    sprache={sprache}
                  />
                  {buehne.kameras.map((g) => (
                    <div key={g.kennung} className="aspect-[4/3] h-full shrink-0">
                      <TeilnehmerKachel gegenstelle={g} stand={staende[g.kennung]} sinkId={lautsprecherId} klein sprache={sprache} />
                    </div>
                  ))}
                  {/*
                    Wer schon teilt, bevor jemand da ist, soll den Wartehinweis
                    nicht verlieren. Er stand sonst nur auf der grossen Flaeche,
                    und die ist jetzt vom geteilten Inhalt belegt.
                  */}
                  {alleine && (
                    <div className="flex aspect-[4/3] h-full shrink-0 items-center justify-center rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#22303f] to-[#141d28] px-3 text-center">
                      <p className="text-[11.5px] leading-tight text-white/60">{mitWerten(t.warteAuf, { name: gegenName })}</p>
                    </div>
                  )}
                </div>
                {!reiheOffen && (
                  <ReiheEingeklappt zahl={buehne.kameras.length + 1} onZeigen={wechsleReihe} t={t} />
                )}
              </div>
            ) : alleine ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#22303f] to-[#141d28] px-6 text-center">
                {zustand === "gescheitert" ? (
                  <>
                    <WifiOff className="h-7 w-7 text-white/40" />
                    <p className="text-sm text-white/60">
                      {t.verbindungGescheitert}
                    </p>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-7 w-7 animate-spin text-white/40" />
                    <p className="text-sm text-white/60">
                      {zustand === "getrennt" ? t.gegenstelleWeg : mitWerten(t.warteAuf, { name: gegenName })}
                    </p>
                  </>
                )}
              </div>
            ) : buehne.art === "gestapelt" ? (
              /*
                Genau zwei im Raum: beide Bilder gleich gross uebereinander,
                das Gegenueber oben. Christian am 18.09.2026: „kannst du wenn
                nur zwei im videoraum sind, dann in der gastgebersicht diese
                beide untereinander anzeigen, so dass immer das breite
                gesamtbild sichtbar ist."

                Die beiden Haelften bekommen dieselbe Hoehe (`flex-1` mit
                `min-h-0`). Am Rechner richtet sich ihre Breite nach dem Format
                der jeweiligen Kamera, sie duerfen also verschieden breit sein:
                Ein Gast am Telefon schickt hochkant, ein Gast im Browser quer,
                und beide sollen vollstaendig zu sehen sein.

                Auf dem Telefon nehmen beide die ganze Breite und der Gastgeber
                steht oben, siehe `fuellend` und `eigenesOben` in der Regie.
              */
              <div data-pruefung="stapel" className="flex h-full min-h-0 w-full flex-col gap-2.5">
                {/*
                  Auf dem Telefon steht der Gastgeber oben, auf beiden Seiten.
                  Christian am 18.09.2026: „oben ist gastgeber und unten ueber
                  die breite ist gast." Fuer ihn heisst das, er sieht sich
                  selbst oben. Am Rechner bleibt es beim Gewohnten, dort steht
                  das Gegenueber oben und das eigene Bild darunter.
                */}
                {buehne.eigenesOben && (
                  <EigenesBild
                    stream={eigenesBildStrom}
                    spiegeln={spiegeltEigenbild}
                    lage={buehne.fuellend ? "voll" : "kachel"}
                    stand={eigenerStand}
                    sprache={sprache}
                  />
                )}
                <TeilnehmerKachel
                  gegenstelle={buehne.kameras[0]}
                  stand={staende[buehne.kameras[0].kennung]}
                  sinkId={lautsprecherId}
                  imFormat={!buehne.fuellend}
                  fuellend={buehne.fuellend}
                  regie={menueFuer(buehne.kameras[0])}
                  sprache={sprache}
                />
                {!buehne.eigenesOben && (
                  <EigenesBild
                    stream={eigenesBildStrom}
                    spiegeln={spiegeltEigenbild}
                    lage={buehne.fuellend ? "voll" : "kachel"}
                    stand={eigenerStand}
                    sprache={sprache}
                  />
                )}
              </div>
            ) : (
              /*
                Ab drei Personen ein Raster. Zwei Gegenstellen stehen
                nebeneinander, drei fuellen ein Vierfeld. `auto-rows-fr` gibt
                jeder Zeile dieselbe Hoehe, sonst haette die zweite Reihe keine.

                Am Rechner schwebt das eigene Bild daneben in der Ecke, auf dem
                Telefon ist es eines der Viertel: Dort deckte die Ecke sonst ein
                ganzes Viertel zu.
              */
              <div data-pruefung="raster" className="grid h-full w-full auto-rows-fr grid-cols-2 gap-2.5">
                {gegenstellen.map((g) => (
                  <TeilnehmerKachel
                    key={g.kennung}
                    gegenstelle={g}
                    stand={staende[g.kennung]}
                    sinkId={lautsprecherId}
                    regie={menueFuer(g)}
                    sprache={sprache}
                  />
                ))}
                {/*
                  Auf dem Telefon ist das eigene Bild eines der vier Viertel,
                  nicht das kleine Fenster in der Ecke: Die Ecke deckte auf
                  einem schmalen Schirm ein ganzes Viertel zu. Bei dreien im
                  Raum bleibt das letzte Viertel frei.
                */}
                {buehne.eigenesBild === "raster" && (
                  <EigenesBild
                    stream={eigenesBildStrom}
                    spiegeln={spiegeltEigenbild}
                    lage="raster"
                    stand={eigenerStand}
                    sprache={sprache}
                  />
                )}
              </div>
            )}

            {/*
              Die Ecke bleibt fuer die Faelle, in denen das eigene Bild keine
              eigene Kachel bekommt: allein im Raum, und ab drei Personen, wo
              das Raster den Platz schon aufteilt. Sie schwebt ueber der
              Flaeche und zaehlt fuer die Hoehe der Seite nicht mit, kann sie
              also nicht laenger machen. Welcher Fall gilt, sagt die Regie,
              nicht diese Ansicht.
            */}
            {buehne.eigenesBild === "ecke" && (
              <EigenesBild
                stream={eigenesBildStrom}
                spiegeln={spiegeltEigenbild}
                lage="ecke"
                stand={eigenerStand}
                sprache={sprache}
              />
            )}

            {/* Teilnehmerliste oder Chat, siehe `Nebenfenster`. */}
            {nebenfenster.flaeche}

            {/*
              Das Einstellungs-Fenster liegt ueber dem Videobild, nicht in der
              Leiste: Dort waere kein Platz, und hier bleibt der Blick auf die
              eigenen Aenderungen (etwa den Hintergrund) frei.
            */}
            {schnellEinstellungen && einstellungenOffen && (
              <div className="absolute bottom-4 left-1/2 z-20 max-h-[calc(100%-2rem)] w-[330px] max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-[#0F1621]/95 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)] backdrop-blur">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">{t.geraeteTitel}</p>
                  <button
                    type="button"
                    onClick={() => setEinstellungenOffen(false)}
                    aria-label={t.einstellungenSchliessen}
                    className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {schnellEinstellungen}
              </div>
            )}
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-2.5">
            <Knopf an={tonAn} label={t.ton} onClick={schalteTon}>
              {tonAn ? <Mic className="h-[18px] w-[18px]" /> : <MicOff className="h-[18px] w-[18px]" />}
            </Knopf>

            <Knopf an={bildAn} label={t.bild} onClick={schalteBild}>
              {bildAn ? <Video className="h-[18px] w-[18px]" /> : <VideoOff className="h-[18px] w-[18px]" />}
            </Knopf>

            <Knopf
              an={teilt}
              label={t.teilen}
              gesperrt={teilenGesperrt && !teilt}
              titel={teilenGesperrt && !teilt ? teilenHinweis : undefined}
              onClick={async () => {
                // Zuerst das schwebende Fenster, denn die Nutzergeste dieses
                // Klicks ist nach der Bildschirmauswahl verbraucht.
                const zuruecknahme = teilt ? undefined : await vorTeilen?.();
                const an = (await verbindung?.teileBildschirm(!teilt)) ?? false;
                setTeilt(an);
                if (!an) zuruecknahme?.();
              }}
            >
              <MonitorUp className="h-[18px] w-[18px]" />
            </Knopf>

            {/* Teilnehmer und Chat, siehe `Nebenfenster`. */}
            {nebenfenster.knoepfe}

            {schnellEinstellungen && (
              <Knopf an={einstellungenOffen} label={t.geraete} onClick={() => setEinstellungenOffen((v) => !v)}>
                <Settings2 className="h-[18px] w-[18px]" />
              </Knopf>
            )}

            {aufMinimieren && (
              <Knopf label={t.kleiner} onClick={aufMinimieren}>
                <Minimize2 className="h-[18px] w-[18px]" />
              </Knopf>
            )}

            <div aria-hidden className="mx-1.5 h-8 w-px bg-white/10" />

            <Knopf gefahr label={t.auflegen} onClick={aufBeenden}>
              <PhoneOff className="h-[18px] w-[18px]" />
            </Knopf>
          </div>
        </div>

        {/*
          Die Spalte bekommt eine feste Hoehe, nicht nur eine obere Schranke.

          Mit `max-h` allein blieb ihre Hoehe fuer den Browser "automatisch".
          Alles darin, was sich auf die volle Hoehe bezog, hatte damit nichts,
          worauf es sich beziehen konnte: Auf dem Handy lagen Mitschrift,
          Gastregie und Warteliste uebereinander, lesbar war nichts davon.
        */}
        {seitenSpalte && (
          <aside className="flex h-[52%] w-full min-h-0 shrink-0 flex-col overflow-hidden border-t border-white/[0.07] bg-[#0F1621]/55 lg:h-auto lg:w-[340px] lg:border-l lg:border-t-0">
            {seitenSpalte}
          </aside>
        )}
      </div>
    </div>
  );
}
