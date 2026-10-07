import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import L from "leaflet";
import { deutschlandMaskenRinge } from "@/lib/deutschlandMaske";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import "leaflet/dist/leaflet.css";
import { GERMANY_BOUNDS } from "@/lib/germanyBorder";

/**
 * Die Deutschlandkarte des Projekts an einer Stelle.
 *
 * Sie kennt weder Kontakte noch Objekte, sondern nur Punkte mit Koordinaten und
 * einer Kategorie. Die Marketingseite und die Kartenansicht der Objektseite
 * benutzen dieselbe Komponente, damit es die aufwendige Darstellung nur einmal
 * gibt und beide Seiten nicht auseinanderlaufen.
 */

/** Ein Punkt auf der Karte. Die Kategorie bestimmt Farbe und Gruppenbildung. */
export type KartenPunkt = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Freie Kennung der Kategorie, etwa "kunde" oder "objekt". */
  typ: string;
  /** Zweite Zeile im Fenster eines Punktes. */
  details?: string;
};

export type DeutschlandkarteBasisProps = {
  punkte: KartenPunkt[];
  /** Farbe je Kategorie. Jede gueltige CSS-Farbe, auch `hsl(var(--primary))`. */
  farben: Record<string, string>;
  /** Beschriftung je Kategorie im Hinweis einer Gruppe, etwa "3 Objekte". */
  bezeichnungen?: Record<string, string>;
  /**
   * Klick auf das Fenster eines Punktes. Ist er gesetzt, bekommt das Fenster
   * eine zusaetzliche Zeile mit `aktionText` und laesst sich anklicken.
   */
  onPunktKlick?: (punkt: KartenPunkt) => void;
  /** Beschriftung der Aktionszeile, etwa "Zum Objekt". */
  aktionText?: string;
  /**
   * Punkte auf genau derselben Koordinate bleiben auch in der groessten
   * Nahansicht zusammengefasst. Ohne das laegen sie dort unsichtbar
   * uebereinander. Fuer Objekte an derselben Adresse ist das der Normalfall.
   */
  immerGruppieren?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Liest einen Design-Token aus `index.css` und macht daraus eine gueltige CSS-Farbe. */
function token(name: string, deckkraft?: number): string {
  const wert = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "0 0% 50%";
  return deckkraft === undefined ? `hsl(${wert})` : `hsl(${wert} / ${deckkraft})`;
}

/**
 * Sanfter Uebergang beim Hervorheben. Leaflet setzt die Farben als
 * SVG-Attribute, eine CSS-Uebergangszeit auf dem Pfad macht daraus ein
 * ruhiges Aufblenden statt eines harten Umschaltens. Die Fuellstaerke
 * braucht laenger, sie geht gemeinsam mit den Kacheln auf und zu.
 */
const LAND_KLASSE = "[transition:fill_200ms_ease-out,fill-opacity_400ms_ease-out,stroke_200ms_ease-out]";

/**
 * Ruhige Flaeche der Bundeslaender.
 *
 * `mitKacheln` bedeutet: darunter liegt die Kachelkarte der Nahansicht. Dann
 * nimmt die Flaeche ihre Fuellung ganz zurueck, sonst waere von den Ortsnamen
 * und Strassen nichts zu sehen. Die Grenzlinie bleibt und wird eine Spur
 * kraeftiger, damit sie sich gegen die unruhigere Kachelkarte behauptet.
 */
function laenderStil(mitKacheln = false): L.PathOptions {
  return {
    className: LAND_KLASSE,
    color: token("--primary", mitKacheln ? 0.5 : 0.35),
    weight: mitKacheln ? 1.5 : 1,
    fillColor: token("--card"),
    fillOpacity: mitKacheln ? 0 : 1,
  };
}

/** Hervorhebung beim Ueberfahren mit der Maus. */
function laenderStilAktiv(mitKacheln = false): L.PathOptions {
  return {
    className: LAND_KLASSE,
    color: token("--primary", 0.9),
    weight: mitKacheln ? 2 : 1.5,
    // Ueber der Kachelkarte wird nur die Grenzlinie hervorgehoben. Eine
    // Fuellung wuerde die Ortsnamen zudecken, die dort ja gerade helfen sollen.
    fillColor: token("--accent"),
    fillOpacity: mitKacheln ? 0 : 1,
  };
}

/**
 * Gemeinsames Aussehen aller Beschriftungen auf der Karte, fuer den Namen des
 * Bundeslandes wie fuer den Namen eines Punktes. Bewusst ueber die
 * Tailwind-Klassen und damit ueber die Design-Tokens, dann stimmt auch die
 * dunkle Darstellung. Das Ausrufezeichen ist noetig, weil `leaflet.css` eigene
 * Werte fuer Hintergrund, Rahmen und Schatten mitbringt.
 */
const HINWEIS_KLASSE = [
  "!bg-card", "!text-foreground", "!border", "!border-border",
  "!rounded-md", "!px-2", "!py-1", "!text-[11px]", "!font-medium",
  "!shadow-sm", "!whitespace-nowrap",
].join(" ");

/** OpenStreetMap wird erst in der Nahansicht und hinter der Deutschlandmaske geladen. */
const KACHEL_SCHWELLE = 8;
const KACHEL_DECKKRAFT = 0.9;
const KACHEL_QUELLE =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const KACHEL_ADRESSE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Die 16 Landeshauptstaedte als feste Liste. `seite` bestimmt, wo die
 * Beschriftung am Ortspunkt sitzt. Sie ist von Hand gesetzt, damit sich die
 * Namen im dichten Suedwesten nicht ins Gehege kommen: Wiesbaden und Mainz
 * liegen nur rund zehn Kilometer auseinander, ebenso eng stehen Berlin und
 * Potsdam.
 */
const LANDESHAUPTSTAEDTE: { name: string; lat: number; lng: number; seite: "links" | "rechts" | "oben" | "unten" }[] = [
  { name: "Kiel", lat: 54.3233, lng: 10.1228, seite: "rechts" },
  { name: "Schwerin", lat: 53.6355, lng: 11.4012, seite: "rechts" },
  { name: "Hamburg", lat: 53.5511, lng: 9.9937, seite: "links" },
  { name: "Bremen", lat: 53.0793, lng: 8.8017, seite: "links" },
  { name: "Hannover", lat: 52.3759, lng: 9.7320, seite: "links" },
  { name: "Berlin", lat: 52.5200, lng: 13.4050, seite: "rechts" },
  { name: "Potsdam", lat: 52.3906, lng: 13.0645, seite: "links" },
  { name: "Magdeburg", lat: 52.1205, lng: 11.6276, seite: "rechts" },
  { name: "Düsseldorf", lat: 51.2277, lng: 6.7735, seite: "links" },
  { name: "Dresden", lat: 51.0504, lng: 13.7373, seite: "rechts" },
  { name: "Erfurt", lat: 50.9787, lng: 11.0328, seite: "unten" },
  { name: "Wiesbaden", lat: 50.0826, lng: 8.2400, seite: "oben" },
  { name: "Mainz", lat: 49.9929, lng: 8.2473, seite: "unten" },
  { name: "Saarbrücken", lat: 49.2402, lng: 6.9969, seite: "unten" },
  { name: "Stuttgart", lat: 48.7758, lng: 9.1829, seite: "unten" },
  { name: "München", lat: 48.1351, lng: 11.5820, seite: "rechts" },
];

/**
 * Ortsmarke einer Landeshauptstadt. Bewusst klein, neutral und ohne kraeftige
 * Farbe: sie dient der Orientierung und soll die farbigen Datenpunkte nicht
 * erschlagen. Der Ring in der Kartenfarbe und der weiche Textschimmer halten
 * die Beschriftung ueber der Landesflaeche lesbar, ohne einen harten Schatten.
 */
function hauptstadtIcon(stadt: (typeof LANDESHAUPTSTAEDTE)[number], mitNamen: boolean): L.DivIcon {
  const ton = token("--muted-foreground", 0.75);
  const grund = token("--card");
  const schimmer = `0 0 3px ${grund}, 0 0 3px ${grund}, 0 0 3px ${grund}`;
  const platz: Record<typeof stadt.seite, string> = {
    rechts: "left:7px;top:-8px;",
    links: "right:7px;top:-8px;",
    oben: "left:0;bottom:7px;transform:translateX(-50%);",
    unten: "left:0;top:7px;transform:translateX(-50%);",
  };
  const beschriftung = mitNamen
    ? `<span style="position:absolute;${platz[stadt.seite]}
         font-size:10px;line-height:1;font-weight:500;letter-spacing:0.02em;
         color:${ton};text-shadow:${schimmer};white-space:nowrap;">${stadt.name}</span>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative">
        <span style="position:absolute;left:-2.5px;top:-2.5px;width:5px;height:5px;
          border-radius:50%;background:${ton};box-shadow:0 0 0 2px ${grund};"></span>
        ${beschriftung}
      </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/**
 * Zusammenfassen dicht beieinanderliegender Punkte, ohne Zusatzpaket.
 *
 * Installiert ist nur `leaflet` selbst. Ein Paket wie `leaflet.markercluster`
 * kommt nicht in Frage: die Projektregel verbietet eine neue Abhaengigkeit,
 * wenn es mit vorhandenen Mitteln einfach geht, und das Paket braechte ein
 * eigenes, generisches Aussehen mit, das fuer das Erscheinungsbild dieser
 * Seite ohnehin vollstaendig ueberschrieben werden muesste. Bei rund fuenfzig
 * Punkten reicht eine einfache Rechnung im Bildraster.
 *
 * Gerechnet wird bewusst in Bildpunkten und nicht in Grad: `map.project`
 * liefert zu einer Zoomstufe die Lage im Kartenbild. Damit haengt die
 * Gruppierung an der Zoomstufe und loest sich beim Hineinzoomen von selbst
 * auf. Ein Mass in Grad waere fest und wuerde nie aufgehen.
 */
const GRUPPEN_ABSTAND_PX = 44;

/**
 * Ab dieser Stufe wird gar nicht mehr zusammengefasst. Stufe 16 zeigt einzelne
 * Strassenzuege. Was dort noch uebereinanderliegt, teilt sich buchstaeblich die
 * Koordinate, etwa weil zwei Kontakte nur ueber Ort und Postleitzahl verortet
 * sind. Weiter zusammenzufassen brachte da nichts mehr.
 */
const ZOOM_OHNE_GRUPPEN = 16;

/** Bis zu so vielen Mitgliedern zaehlt der Hinweis die Namen einzeln auf. */
const NAMEN_GRENZE = 5;

/** Eine Gruppe von Punkten derselben Kategorie. Ein einzelner Punkt ist eine Gruppe der Groesse eins. */
type Gruppe = {
  typ: string;
  lat: number;
  lng: number;
  punkte: KartenPunkt[];
  /** Engster Abstand zweier Mitglieder in Bildpunkten. Null, wenn zwei exakt aufeinanderliegen. */
  engster: number;
};

/**
 * Punkte je Kategorie getrennt zu Gruppen zusammenfassen.
 *
 * Die Trennung nach Kategorie ist die Kernregel: die Farbe traegt die
 * Bedeutung, ein gemeinsamer Kreis ueber Kunden und Objekte waere falsch.
 * Deshalb bekommt jede Kategorie einen eigenen Topf, und es wird ausschliesslich
 * innerhalb eines Topfes verglichen. Liegen an einem Ort drei Kunden und zwei
 * Objekte, entstehen dort zwei Kreise.
 *
 * `nurDeckungsgleich` gilt in der groessten Nahansicht: dort wird nur noch
 * zusammengefasst, was auf genau derselben Koordinate sitzt. Alles andere hat
 * dort genug Platz.
 */
function gruppiere(map: L.Map, standorte: KartenPunkt[], zoom: number, nurDeckungsgleich = false): Gruppe[] {
  const einzeln = (s: KartenPunkt): Gruppe => ({ typ: s.typ, lat: s.lat, lng: s.lng, punkte: [s], engster: Infinity });
  if (zoom >= ZOOM_OHNE_GRUPPEN && !nurDeckungsgleich) return standorte.map(einzeln);
  const abstand = nurDeckungsgleich && zoom >= ZOOM_OHNE_GRUPPEN ? 0 : GRUPPEN_ABSTAND_PX;

  const nachTyp = new Map<string, { s: KartenPunkt; x: number; y: number }[]>();
  for (const s of standorte) {
    const p = map.project(L.latLng(s.lat, s.lng), zoom);
    const topf = nachTyp.get(s.typ);
    if (topf) topf.push({ s, x: p.x, y: p.y });
    else nachTyp.set(s.typ, [{ s, x: p.x, y: p.y }]);
  }

  const gruppen: Gruppe[] = [];
  for (const [typ, liste] of nachTyp) {
    // Reihum: der erste noch freie Punkt bildet den Kern, alle freien Punkte in
    // seiner Naehe schliessen sich an. Bei dieser Menge ist der Vergleich jeder
    // mit jedem unbedenklich und liefert ruhigere Gruppen als ein festes
    // Gitter, bei dem zwei benachbarte Punkte an einer Gitterkante auseinander
    // fallen koennen.
    const offen = [...liste];
    while (offen.length > 0) {
      const kern = offen.shift()!;
      const mitglieder = [kern];
      for (let i = offen.length - 1; i >= 0; i--) {
        const k = offen[i];
        if (Math.hypot(k.x - kern.x, k.y - kern.y) <= abstand) {
          mitglieder.push(k);
          offen.splice(i, 1);
        }
      }
      if (mitglieder.length === 1) {
        gruppen.push(einzeln(kern.s));
        continue;
      }
      const mitte = map.unproject(
        L.point(
          mitglieder.reduce((n, m) => n + m.x, 0) / mitglieder.length,
          mitglieder.reduce((n, m) => n + m.y, 0) / mitglieder.length,
        ),
        zoom,
      );
      let engster = Infinity;
      for (let a = 0; a < mitglieder.length; a++) {
        for (let b = a + 1; b < mitglieder.length; b++) {
          engster = Math.min(engster, Math.hypot(mitglieder[a].x - mitglieder[b].x, mitglieder[a].y - mitglieder[b].y));
        }
      }
      gruppen.push({ typ, lat: mitte.lat, lng: mitte.lng, punkte: mitglieder.map(m => m.s), engster });
    }
  }
  return gruppen;
}

/**
 * Zoomstufe, bei der eine Gruppe auseinanderfaellt.
 *
 * Jede Stufe verdoppelt den Abstand im Bild. Aus dem engsten Paar laesst sich
 * deshalb direkt ausrechnen, wie viele Stufen noetig sind. Liegen Mitglieder
 * exakt aufeinander, geht die Gruppe nie auf, dann wird bis zu der Stufe
 * gezoomt, ab der ohnehin nicht mehr zusammengefasst wird.
 */
function zielZoom(gruppe: Gruppe, aktuell: number): number {
  const noetig =
    gruppe.engster > 0 && isFinite(gruppe.engster)
      ? aktuell + Math.ceil(Math.log2(GRUPPEN_ABSTAND_PX / gruppe.engster)) + 0.25
      : ZOOM_OHNE_GRUPPEN;
  // Ein Klick soll immer spuerbar naeher heranfuehren, aber nie ueber die
  // Stufe hinaus, ab der es nichts mehr zusammenzufassen gibt.
  return Math.min(ZOOM_OHNE_GRUPPEN, Math.max(aktuell + 1, noetig));
}

/**
 * Dunkle Tinte fuer die Zahl im Kreis.
 *
 * Die drei Kreisfarben sind in heller und dunkler Darstellung dieselben
 * mittelhellen Toene. Weiss darauf traegt nicht, am wenigsten auf dem Orange
 * der Objekte. Dunkle Tinte liest auf allen drei Farben deutlich, in beiden
 * Darstellungen. Sie kommt aus den Tokens: hell fuehrt `--foreground` die
 * dunkle Tinte, dunkel `--primary-foreground`. Beide Werte liegen sehr nah
 * beieinander, die Zahl sieht dadurch in beiden Darstellungen gleich aus.
 */
function zahlTinte(): string {
  const dunkel = document.documentElement.classList.contains("dark");
  return token(dunkel ? "--primary-foreground" : "--foreground");
}

/**
 * Sanftes Erscheinen nach dem Neuzeichnen. Kurz und einmalig, damit beim
 * Zoomen nichts aufblitzt. Kein dauerhaftes Pulsieren.
 */
const AUFBLENDEN = "animate-in fade-in duration-200";

/**
 * Der Kreis mit der Anzahl. Flach, in der Farbe der Kategorie und mit demselben
 * hellen Rand wie die Einzelpunkte, damit Kreis und Punkt sichtbar zusammen
 * gehoeren. Kein Schatten, kein Verlauf. Der Durchmesser waechst in drei
 * Stufen mit der Anzahl und ist bei 36 Bildpunkten gedeckelt, dort passen auch
 * dreistellige Zahlen sauber hinein.
 */
function gruppenGroesse(anzahl: number): number {
  return anzahl < 10 ? 28 : anzahl < 100 ? 32 : 36;
}

function gruppenIcon(farbe: string, anzahl: number): L.DivIcon {
  const groesse = gruppenGroesse(anzahl);
  const schrift = anzahl < 100 ? 12 : 11;
  return L.divIcon({
    className: "",
    html: `<div class="${AUFBLENDEN}" style="
        width:${groesse}px;height:${groesse}px;box-sizing:border-box;
        background:${farbe};
        border:2px solid white;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        color:${zahlTinte()};
        font-size:${schrift}px;font-weight:700;line-height:1;
        font-variant-numeric:tabular-nums;letter-spacing:0.01em;
      ">${anzahl}</div>`,
    iconSize: [groesse, groesse],
    iconAnchor: [groesse / 2, groesse / 2],
  });
}

/**
 * Inhalt eines Punktes als Text. Zwei Punkte mit gleicher Kennung sehen auf der
 * Karte gleich aus, also muss auch nichts neu gezeichnet werden.
 */
function punktKennung(p: KartenPunkt): string {
  return [p.typ, p.id, p.lat, p.lng, p.name, p.details ?? ""].join("|");
}

/**
 * Kennung eines Markers. Bleibt sie beim naechsten Zeichnen gleich, bleibt der
 * Marker stehen. Die Mitte wird gerundet, weil sie aus Bildpunkten
 * zurueckgerechnet ist und sonst an der letzten Stelle wackeln koennte.
 */
function gruppenKennung(g: Gruppe): string {
  if (g.punkte.length === 1) return `p:${punktKennung(g.punkte[0])}`;
  return `g:${g.lat.toFixed(6)},${g.lng.toFixed(6)}:${g.punkte.map(punktKennung).join(";")}`;
}

/** Namen kommen aus der Datenbank und werden als Text eingesetzt, nicht als Markup. */
function sicher(text: string): string {
  return text.replace(/[&<>"]/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[z] || z);
}

/**
 * Hinweis beim Ueberfahren eines Kreises. Bei kleinen Gruppen stehen die Namen
 * darunter, das erspart das Hineinzoomen, nur um zu sehen wer da sitzt. Ab
 * sechs Namen wuerde die Liste die Karte zudecken, dann bleibt es bei der
 * Anzahl. Mehr als der Name wird nicht gezeigt.
 */
function gruppenHinweis(gruppe: Gruppe, bezeichnung: string): { html: string; zeilen: number } {
  const kopf = `<span style="font-weight:600">${gruppe.punkte.length} ${bezeichnung}</span>`;
  if (gruppe.punkte.length > NAMEN_GRENZE) return { html: kopf, zeilen: 1 };
  const namen = gruppe.punkte.map(p => sicher(p.name)).join("<br>");
  return {
    html: `${kopf}<br><span style="font-weight:400;color:${token("--muted-foreground")}">${namen}</span>`,
    zeilen: 1 + gruppe.punkte.length,
  };
}

/**
 * Der Hinweis steht immer vollstaendig ueber dem Kreis, auch wenn er mehrere
 * Namen traegt. Die Richtung "center" setzt ihn mittig auf den Versatz,
 * deshalb waechst der Versatz mit der Zeilenzahl mit. Sonst legte sich eine
 * laengere Liste ueber den Kreis, den sie erklaeren soll.
 */
function hinweisVersatz(anzahl: number, zeilen: number): L.PointExpression {
  return [0, -(gruppenGroesse(anzahl) / 2 + 6 + (zeilen * 15 + 8) / 2)];
}

export function DeutschlandkarteBasis({
  punkte,
  farben,
  bezeichnungen,
  onPunktKlick,
  aktionText,
  immerGruppieren = false,
  className,
  style,
}: DeutschlandkarteBasisProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const laenderRef = useRef<L.GeoJSON | null>(null);
  /** Die gezeichneten Marker nach `gruppenKennung`. Ueberlebt jeden Renderdurchlauf. */
  const markerRef = useRef(new Map<string, L.Marker>());
  // Steht die Maus gerade auf einem farbigen Punkt? Dann darf der Name des
  // Bundeslandes darunter nicht zusaetzlich erscheinen.
  const punktUeberfahren = useRef(false);

  // Aussehen und Klickverhalten liegen in einem Halter, damit das Neuzeichnen
  // nur von den Punkten abhaengt. Sonst brauchte jede Seite eine gemerkte
  // Farbtabelle und einen gemerkten Klickbehandler, nur damit die Karte nicht
  // bei jedem Renderdurchlauf neu aufgebaut wird.
  const optionen = useRef({ farben, bezeichnungen, onPunktKlick, aktionText });
  optionen.current = { farben, bezeichnungen, onPunktKlick, aktionText };

  /*
   * Gezeichnet wird nach dem Inhalt der Punkte, nicht nach der Liste als
   * Objekt. Die Marketingseite baut ihre Liste bei jeder Aenderung im
   * Zwischenspeicher neu, auch wenn sich an den Punkten nichts aendert. Frueher
   * hat jede neue Liste alle Marker entfernt und wieder eingeblendet, und die
   * Karte blinkte im Takt der Aktualisierungen (bis 05.10.2026).
   */
  const punkteRef = useRef(punkte);
  punkteRef.current = punkte;
  const datenKennung = useMemo(() => punkte.map(punktKennung).sort().join("\n"), [punkte]);

  // Karte einmalig aufbauen. In der Uebersicht keine Kacheln von fremden
  // Servern, stattdessen die Grenzen der 16 Bundeslaender aus einer eigenen
  // Datei. Die wird bewusst dynamisch geladen, damit sie nicht im Startpaket
  // landet. Erst in der Nahansicht kommt die Kachelkarte dazu, siehe unten.
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const behaelter = mapRef.current;
    const gezeichneteMarker = markerRef.current;
    let beendet = false;

    const grenzen = L.latLngBounds(
      [GERMANY_BOUNDS.south, GERMANY_BOUNDS.west],
      [GERMANY_BOUNDS.north, GERMANY_BOUNDS.east],
    );

    const map = L.map(behaelter, {
      center: grenzen.getCenter(),
      zoom: 6,
      scrollWheelZoom: true,
      // Feinere Zoomstufen, sonst bleibt beim Einpassen bis zur Haelfte des
      // Kartenbereichs ungenutzt. Ohne Kacheln kostet das nichts.
      zoomSnap: 0.25,
      // In der Uebersicht gibt es keine fremde Quelle und damit auch nichts zu
      // nennen. Die Angabe wird erst mit den Kacheln eingeblendet.
      attributionControl: false,
      maxBounds: grenzen.pad(0.08),
      maxBoundsViscosity: 1,
      // Obergrenze, damit man nicht ins Leere zoomt. Stufe 18 zeigt einzelne
      // Haeuser, weiter braucht es hier nicht.
      maxZoom: 18,
    });
    mapInstanceRef.current = map;

    // Die Hauptstaedte liegen unter den Datenpunkten. Sie sind Orientierung,
    // kein Inhalt, deshalb auch nicht anklickbar: so nehmen sie einem
    // darueberliegenden Datenpunkt nie die Maus weg. Sie bekommen eine eigene
    // Ebene zwischen Landesflaeche und Datenpunkten, dann laesst sich ihre
    // Deckkraft weich zuruecknehmen, sobald die Kachelkarte eigene Ortsnamen
    // mitbringt.
    const staedtePane = map.createPane("hauptstaedte");
    staedtePane.style.zIndex = "450";
    staedtePane.style.pointerEvents = "none";
    staedtePane.style.transition = "opacity 400ms ease-out";
    const staedteEbene = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);

    /**
     * Beschriftungen nur zeichnen, wenn die Karte breit genug ist. Auf einem
     * schmalen Fenster ruecken die sechzehn Namen so dicht zusammen, dass es
     * unruhig wird. Die Ortsmarken selbst bleiben immer sichtbar.
     */
    let mitNamen: boolean | null = null;
    const zeichneHauptstaedte = () => {
      const gewuenscht = map.getSize().x >= 560;
      if (gewuenscht === mitNamen) return;
      mitNamen = gewuenscht;
      staedteEbene.clearLayers();
      for (const stadt of LANDESHAUPTSTAEDTE) {
        L.marker([stadt.lat, stadt.lng], {
          icon: hauptstadtIcon(stadt, gewuenscht),
          interactive: false,
          keyboard: false,
          pane: "hauptstaedte",
        }).addTo(staedteEbene);
      }
    };

    /** Halter fuer die weiter unten deklarierte Kachelpruefung. */
    let kachelnPruefenHalter: (() => void) | null = null;

    /**
     * Deutschland fuellt den Behaelter aus. Weiter als bis zum Landesrand laesst
     * sich nicht herauszoomen, frueher landete man dabei in Nordafrika.
     */
    /**
     * Hat das erste Einpassen mit echten Massen stattgefunden? Solange der
     * Behaelter keine Breite hat, etwa in einem noch nicht eingeblendeten
     * Bereich, rechnet Leaflet mit Null und landet bei der groessten Zoomstufe.
     * Dann wird das Einpassen nachgeholt, sobald Masse vorliegen.
     */
    let eingepasst = false;
    const einpassen = () => {
      map.invalidateSize({ animate: false });
      const groesse = map.getSize();
      if (groesse.x < 1 || groesse.y < 1) return;
      map.setMinZoom(0);
      const kleinster = map.getBoundsZoom(grenzen);
      map.setMinZoom(kleinster);
      if (!eingepasst) {
        eingepasst = true;
        map.fitBounds(grenzen, { padding: [8, 8], animate: false });
      } else if (map.getZoom() < kleinster) {
        map.setZoom(kleinster);
      }
      zeichneHauptstaedte();
    };
    einpassen();

    // Der Kartenbereich waechst jetzt mit dem Fenster, Leaflet muss das erfahren.
    const beobachter = new ResizeObserver(() => einpassen());
    beobachter.observe(behaelter);

    // Die Maske liegt ueber den Kacheln, aber unter Grenzen und Datenpunkten.
    // Ein Rechteck als maxBounds allein wuerde Nachbarlaender sichtbar lassen.
    const maskenPane = map.createPane("deutschlandmaske");
    maskenPane.style.zIndex = "250";
    maskenPane.style.pointerEvents = "none";
    let aussenMaske: L.Polygon | null = null;
    let laender: L.GeoJSON | null = null;
    // Sind die Kacheln der Nahansicht gerade zu sehen? Davon haengt ab, ob die
    // Bundeslandflaechen gefuellt sind.
    let kachelnSichtbar = false;
    void (async () => {
      const modul = await import("@/data/bundeslaender.geo.json");
      if (beendet) return;
      const daten = (modul as any).default ?? modul;
      // Alle Ringe einschliesslich Inseln und Aussparungen bilden zusammen
      // die vorhandene Deutschlandkontur. Evenodd verdeckt nur das Ausland.
      const ringe = deutschlandMaskenRinge(daten as FeatureCollection<Polygon | MultiPolygon>);
      aussenMaske = L.polygon(ringe, {
        pane: "deutschlandmaske",
        renderer: L.svg({ pane: "deutschlandmaske", padding: 1 }),
        interactive: false,
        stroke: false,
        fillColor: token("--muted"),
        fillOpacity: 1,
        fillRule: "evenodd",
        // Keine vereinfachten Randlinien, die beim Zoomen Luecken erzeugen.
        smoothFactor: 0,
        noClip: true,
      }).addTo(map);
      laender = L.geoJSON(daten, {
        style: () => laenderStil(kachelnSichtbar),
        onEachFeature: (feature, layer) => {
          const name = String((feature.properties as any)?.name || "");
          if (name) {
            layer.bindTooltip(name, {
              sticky: true,
              // "center" statt "top": diese Richtung zeichnet kein Pfeilchen,
              // dessen Farbe aus leaflet.css kaeme und in der dunklen
              // Darstellung weiss stehen bliebe.
              direction: "center",
              offset: [0, -18],
              opacity: 1,
              className: HINWEIS_KLASSE,
            });
          }
          layer.on("mouseover", () => {
            (layer as L.Path).setStyle(laenderStilAktiv(kachelnSichtbar));
            // Steht die Maus auf einem farbigen Punkt oder auf einem Kreis, hat
            // dieser Vorrang. Leaflets eigener Zuhoerer hat den Namen des
            // Landes hier schon geoeffnet, deshalb wird er direkt wieder
            // geschlossen.
            if (punktUeberfahren.current) layer.closeTooltip();
          });
          layer.on("mouseout", () => (layer as L.Path).setStyle(laenderStil(kachelnSichtbar)));
        },
      }).addTo(map);
      laenderRef.current = laender;
      laender.bringToBack();
      // Die Pruefung ist weiter unten deklariert; sie laeuft erst, wenn dieser
      // asynchrone Abschnitt fertig ist, deshalb ueber den Halter.
      kachelnPruefenHalter?.();
    })();

    // ── Kachelkarte der Nahansicht ────────────────────────────────────────
    let kacheln: L.TileLayer | null = null;
    let quelle: L.Control.Attribution | null = null;
    /** Laufendes Ausblenden. Erst danach wird die Ebene entfernt. */
    let abblenden: number | null = null;
    const kachelnEinfaerben = () => {
      const el = kacheln?.getContainer();
      if (el) el.style.filter = document.documentElement.classList.contains("dark")
        ? "grayscale(1) invert(1) brightness(0.75) contrast(0.9)"
        : "saturate(0.25)";
    };

    /**
     * Die Namensnennung ins Erscheinungsbild holen. Sie bleibt sichtbar und
     * lesbar, tritt aber farblich zurueck. Farben aus den Tokens, damit sie in
     * der dunklen Darstellung ebenso sitzt.
     */
    const quelleEinfaerben = () => {
      const el = quelle?.getContainer();
      if (!el) return;
      el.style.background = token("--card", 0.85);
      el.style.color = token("--muted-foreground");
      el.style.fontSize = "10px";
      el.style.lineHeight = "1.4";
      el.style.padding = "2px 6px";
      el.style.borderTop = `1px solid ${token("--border")}`;
      el.style.borderLeft = `1px solid ${token("--border")}`;
      el.style.borderTopLeftRadius = "6px";
      el.querySelectorAll("a").forEach((a) => {
        (a as HTMLElement).style.color = token("--primary");
      });
    };

    /**
     * Kacheln je nach Zoomstufe ein- oder ausblenden.
     *
     * Geladen wird erst beim ersten Ueberschreiten der Schwelle, beim Oeffnen
     * der Seite geht also keine einzige Anfrage hinaus. Ein- und Ausblenden
     * laeuft ueber die Deckkraft, nicht ueber ein hartes Umschalten. Entfernt
     * wird die Ebene erst nach dem Ausblenden, danach laedt sie auch nichts
     * mehr nach.
     */
    const kachelnPruefen = () => {
      const gewuenscht = aussenMaske !== null && map.getZoom() >= KACHEL_SCHWELLE;
      if (gewuenscht === kachelnSichtbar) return;
      kachelnSichtbar = gewuenscht;
      // Die Bundeslandflaechen sind deckend. Sobald die Kacheln kommen, nehmen
      // sie ihre Fuellung zurueck, sonst waere von Ortsnamen und Strassen
      // nichts zu sehen. Die Grenzlinien bleiben.
      laender?.setStyle(laenderStil(kachelnSichtbar));
      // Die Landeshauptstaedte treten zurueck, sobald die Kacheln eigene
      // Ortsnamen mitbringen. Sonst stuende Muenchen zweimal untereinander,
      // einmal in unserer und einmal in deren Schrift.
      staedtePane.style.opacity = kachelnSichtbar ? "0" : "1";

      if (gewuenscht) {
        if (abblenden !== null) { window.clearTimeout(abblenden); abblenden = null; }
        if (!kacheln) {
          quelle = L.control.attribution({ prefix: false, position: "bottomright" }).addTo(map);
          kacheln = L.tileLayer(KACHEL_ADRESSE, {
            attribution: KACHEL_QUELLE,
            maxZoom: 18,
            maxNativeZoom: 19,
            noWrap: true,
            // Nur Kacheln im Bereich Deutschlands, alles andere waere
            // verschenkte Ladezeit.
            bounds: grenzen,
            className: "[transition:opacity_400ms_ease-out]",
          }).addTo(map);
          kachelnEinfaerben();
          kacheln.setOpacity(0);
          const el = quelle.getContainer();
          if (el) {
            el.style.transition = "opacity 400ms ease-out";
            el.style.opacity = "0";
          }
          quelleEinfaerben();
          // Ein Bild spaeter, sonst gibt es keinen Uebergang von Null aus.
          requestAnimationFrame(() => {
            if (beendet) return;
            kacheln?.setOpacity(KACHEL_DECKKRAFT);
            if (el) el.style.opacity = "1";
          });
        } else {
          kacheln.setOpacity(KACHEL_DECKKRAFT);
          const el = quelle?.getContainer();
          if (el) el.style.opacity = "1";
        }
      } else if (kacheln) {
        kacheln.setOpacity(0);
        const el = quelle?.getContainer();
        if (el) el.style.opacity = "0";
        abblenden = window.setTimeout(() => {
          abblenden = null;
          if (kacheln) { map.removeLayer(kacheln); kacheln = null; }
          if (quelle) { map.removeControl(quelle); quelle = null; }
        }, 450);
      }
    };
    kachelnPruefenHalter = kachelnPruefen;
    map.on("zoomend", kachelnPruefen);
    kachelnPruefen();

    // Beim Wechsel zwischen heller und dunkler Darstellung neu einfaerben, die
    // Farben kommen aus den Design-Tokens und aendern sich mit dem Thema.
    // Die Ortsmarken der Hauptstaedte tragen ihre Farben im Markup, sie werden
    // dafuer neu gezeichnet. Der Farbfilter passt die OSM-Kacheln ohne
    // erneute Netzwerkanfragen an die dunkle Darstellung an.
    const themenWaechter = new MutationObserver(() => {
      laender?.setStyle(laenderStil(kachelnSichtbar));
      mitNamen = null;
      zeichneHauptstaedte();
      aussenMaske?.setStyle({ fillColor: token("--muted") });
      kachelnEinfaerben();
      quelleEinfaerben();
    });
    themenWaechter.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      beendet = true;
      if (abblenden !== null) window.clearTimeout(abblenden);
      themenWaechter.disconnect();
      beobachter.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      markerLayerRef.current = null;
      gezeichneteMarker.clear();
      laenderRef.current = null;
    };
  }, []);

  // Punkte zeichnen und dabei dicht beieinanderliegende je Kategorie
  // zusammenfassen. Neu gezeichnet wird beim Wechsel der Zoomstufe, denn nur
  // dann kann sich die Aufteilung aendern.
  useEffect(() => {
    const layer = markerLayerRef.current;
    const map = mapInstanceRef.current;
    if (!layer || !map) return;

    const farbeVon = (typ: string) => optionen.current.farben[typ] || token("--primary");
    const bezeichnungVon = (typ: string) => optionen.current.bezeichnungen?.[typ] || "Einträge";

    /**
     * Das Fenster eines Punktes. Die Aktionszeile erscheint nur, wenn die Seite
     * einen Klickbehandler mitgibt, sonst bleibt es beim reinen Nachschlagen.
     */
    const fensterInhalt = (s: KartenPunkt) => {
      const aktion = optionen.current.onPunktKlick
        ? `<p style="font-size:11px;color:${farbeVon(s.typ)};margin:4px 0 0;font-weight:600">→ ${sicher(optionen.current.aktionText || "Öffnen")}</p>`
        : "";
      return `
        <div style="min-width:140px">
          <p style="font-weight:700;font-size:12px;margin:0 0 2px">${sicher(s.name)}</p>
          <p style="font-size:11px;color:#666;margin:0">${sicher(s.details || "")}</p>${aktion}
        </div>
      `;
    };

    /** Klick auf das Fenster meldet den Punkt an die Seite zurueck. */
    const fensterKlickbar = (marker: L.Marker, s: KartenPunkt) => {
      if (!optionen.current.onPunktKlick) return;
      marker.on("popupopen", () => {
        const el = marker.getPopup()?.getElement();
        if (!el) return;
        el.style.cursor = "pointer";
        el.addEventListener("click", () => optionen.current.onPunktKlick?.(s), { once: true });
      });
    };

    /** Ein einzelner Punkt. Verhaelt sich wie bisher. */
    const zeichnePunkt = (s: KartenPunkt): L.Marker => {
      const icon = L.divIcon({
        className: "",
        html: `<div class="${AUFBLENDEN}" style="
          width:14px;height:14px;
          background:${farbeVon(s.typ)};
          border:2px solid white;
          border-radius:50%;
          box-shadow:0 1px 4px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([s.lat, s.lng], { icon }).addTo(layer);
      // Beim Ueberfahren nur der Name, mehr gehoert auf die Karte nicht.
      // Ohne Pfeilchen und immer oberhalb des Punktes, damit ein dicht
      // danebenliegender Punkt nicht verdeckt wird. Es ist immer nur ein
      // Hinweis zu sehen, weil immer nur ein Punkt unter der Maus liegt.
      marker.bindTooltip(s.name, {
        direction: "center",
        offset: [0, -18],
        opacity: 1,
        className: HINWEIS_KLASSE,
      });
      // Auf Geraeten ohne Maus oeffnet dieselbe Berührung zusaetzlich das
      // vorhandene Fenster mit Name und Kurzangabe, es geht also nichts verloren.
      marker.bindPopup(fensterInhalt(s));
      fensterKlickbar(marker, s);
      marker.on("mouseover", () => {
        punktUeberfahren.current = true;
        // Ein bereits offener Landesname weicht dem Punkt.
        laenderRef.current?.eachLayer((l) => l.closeTooltip());
      });
      marker.on("mouseout", () => { punktUeberfahren.current = false; });
      // Beim Antippen oeffnet Leaflet Hinweis und Fenster zugleich. Das Fenster
      // zeigt den Namen ohnehin, der Hinweis tritt zurueck.
      marker.on("popupopen", () => marker.closeTooltip());
      return marker;
    };

    /** Ein Kreis mit der Anzahl. `zoom` ist die Stufe, auf der gruppiert wurde. */
    const zeichneGruppe = (gruppe: Gruppe, zoom: number): L.Marker => {
      const marker = L.marker([gruppe.lat, gruppe.lng], {
        icon: gruppenIcon(farbeVon(gruppe.typ), gruppe.punkte.length),
        // Ueber den Einzelpunkten, ein Kreis darf nie unter einem Punkt liegen.
        zIndexOffset: 500,
      }).addTo(layer);
      const hinweis = gruppenHinweis(gruppe, bezeichnungVon(gruppe.typ));
      marker.bindTooltip(hinweis.html, {
        direction: "center",
        offset: hinweisVersatz(gruppe.punkte.length, hinweis.zeilen),
        opacity: 1,
        className: HINWEIS_KLASSE,
      });
      marker.on("mouseover", () => {
        // Wie beim Einzelpunkt: der Landesname darunter tritt zurueck.
        punktUeberfahren.current = true;
        laenderRef.current?.eachLayer((l) => l.closeTooltip());
      });
      marker.on("mouseout", () => { punktUeberfahren.current = false; });

      // Punkte auf genau derselben Koordinate gehen durch Zoomen nie
      // auseinander. Statt vergeblich heranzufahren, zeigt der Kreis dann eine
      // Liste seiner Mitglieder zum Anklicken. Es zaehlt nur der Fall, dass
      // wirklich alle Mitglieder dieselbe Koordinate haben. Sitzen daneben noch
      // weitere Punkte, bringt das Heranfahren ja etwas.
      const erster = gruppe.punkte[0];
      const deckungsgleich = gruppe.punkte.every(p => p.lat === erster.lat && p.lng === erster.lng);
      const unteilbar = deckungsgleich && !!optionen.current.onPunktKlick;
      if (unteilbar) {
        const zeilen = gruppe.punkte
          .map((p, i) => `
            <p data-nummer="${i}" style="font-size:12px;margin:${i === 0 ? "0" : "6px"} 0 0;cursor:pointer;font-weight:600">
              ${sicher(p.name)}
            </p>
            <p style="font-size:11px;color:#666;margin:0">${sicher(p.details || "")}</p>`)
          .join("");
        marker.bindPopup(`<div style="min-width:180px;max-height:220px;overflow:auto">${zeilen}</div>`);
        marker.on("popupopen", () => {
          marker.closeTooltip();
          const el = marker.getPopup()?.getElement();
          el?.querySelectorAll<HTMLElement>("[data-nummer]").forEach((zeile) => {
            zeile.addEventListener("click", () => {
              const punkt = gruppe.punkte[Number(zeile.dataset.nummer)];
              if (punkt) optionen.current.onPunktKlick?.(punkt);
            }, { once: true });
          });
        });
        return marker;
      }

      // Ein Klick fuehrt so weit heran, dass die Gruppe aufgeht. Das erspart
      // mehrfaches Zoomen von Hand.
      // Der Kreis bleibt beim Zoomen stehen, solange seine Mitglieder gleich
      // bleiben. Der engste Abstand galt fuer die Stufe beim Zeichnen und wird
      // deshalb auf die heutige umgerechnet.
      marker.on("click", () => {
        marker.closeTooltip();
        const jetzt = map.getZoom();
        const engster = gruppe.engster * 2 ** (jetzt - zoom);
        map.flyTo([gruppe.lat, gruppe.lng], zielZoom({ ...gruppe, engster }, jetzt), { duration: 0.6 });
      });
      return marker;
    };

    /*
     * Abgleich statt Neuaufbau: Marker, deren Kennung gleich bleibt, bleiben
     * stehen. Entfernt wird nur, was wegfaellt, und nur Neues blendet auf.
     * Beim blossen Verschieben aendert sich nichts, weil im festen Bildraster
     * der Zoomstufe gerechnet wird und nicht im Ausschnitt.
     */
    const zeichne = (erzwingen = false) => {
      const zoom = map.getZoom();
      const gruppen = new Map<string, Gruppe>();
      for (const g of gruppiere(map, punkteRef.current, zoom, immerGruppieren)) gruppen.set(gruppenKennung(g), g);
      const marker = markerRef.current;
      if (erzwingen) { layer.clearLayers(); marker.clear(); }
      let entfernt = erzwingen;
      for (const [kennung, m] of marker) {
        if (gruppen.has(kennung)) continue;
        layer.removeLayer(m);
        marker.delete(kennung);
        entfernt = true;
      }
      // Ein Marker, der unter der Maus verschwindet, meldet kein "mouseout"
      // mehr. Ohne dieses Zuruecksetzen bliebe der Vorrang haengen und der
      // Name des Bundeslandes tauchte nie wieder auf.
      if (entfernt) punktUeberfahren.current = false;
      for (const [kennung, gruppe] of gruppen) {
        if (marker.has(kennung)) continue;
        marker.set(kennung, gruppe.punkte.length === 1 ? zeichnePunkt(gruppe.punkte[0]) : zeichneGruppe(gruppe, zoom));
      }
    };

    zeichne();
    const beiZoom = () => zeichne();
    map.on("zoomend", beiZoom);

    // Die Zahl im Kreis nimmt ihre Farbe aus den Tokens, beim Wechsel der
    // Darstellung muss sie deshalb neu gesetzt werden.
    const themenWaechter = new MutationObserver(() => zeichne(true));
    themenWaechter.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      map.off("zoomend", beiZoom);
      themenWaechter.disconnect();
    };
  }, [datenKennung, immerGruppieren]);

  return (
    // Hintergrund als Inline-Stil, sonst gewinnt je nach Reihenfolge der
    // Stylesheets das graue Standardgrau aus leaflet.css.
    <div ref={mapRef} className={className} style={{ background: "hsl(var(--muted))", ...style }} />
  );
}

export default DeutschlandkarteBasis;
