import { useEffect, useRef, type ReactNode } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ausschnittPunkte, legende, OBJEKT_FARBE, type KartenPunkt } from "@/lib/umgebungspunkte";
import type { Sprache } from "@/lib/seitenSprache";
import { umgebungTexte } from "./umgebungTexte";

/**
 * Die Karte der Umgebung: die Nadel des Objekts, die Punkte der Umgebung in
 * der Farbe ihrer Kategorie und eine kleine Legende (Christian, 24.09.2026).
 * Ein Tipp auf einen Punkt zeigt Name, Art und Entfernung.
 *
 * Eine Karte für alle vier Stellen: Objektseite, Einheitenseite (beide über
 * `UmgebungsKarte`), Kundenansicht und Exposé (beide über `Mikrolage`).
 *
 * KEINE ABFRAGE AUS DEM BROWSER. Alle Punkte kommen aus der gespeicherten
 * Messung, geladen werden nur die Kartenbilder von OpenStreetMap. Darüber
 * wachen `ExposeAnsicht.test.tsx` und `keinGeodienstImBrowser.test.ts`.
 *
 * Die Klassennamen `mikro-karte*` sind die der Exposé-Karte, damit deren
 * Regeln in `premiumExpose.css` (auch die für den Druck) weiter greifen.
 */

type Koordinate = { lat: number; lng: number };

/** Text für ein Popup. Namen stammen aus OpenStreetMap und sind Fremdtext. */
function html(text: string): string {
  return text.replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[z] as string);
}

// Die Farbe der Objektnadel steht in `umgebungspunkte.ts`, weil das PDF sie ohne Leaflet braucht.
export { OBJEKT_FARBE };

const objektIcon = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;border-radius:13px 13px 13px 2px;background:${OBJEKT_FARBE};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);transform:rotate(-45deg)"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -24],
});

/*
 * Runde Punkte statt kleiner Nadeln: Bei bis zu fünfzig Orten bleibt die
 * Karte so ruhig, und die Nadel des Objekts hebt sich ab. Die Tippfläche ist
 * größer als der sichtbare Punkt, damit der Finger ihn auf dem Handy trifft.
 */
const punktIcon = (farbe: string) =>
  L.divIcon({
    className: "umgebung-punkt",
    html: `<span style="display:block;width:14px;height:14px;margin:6px;border-radius:50%;background:${farbe};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -8],
  });

export function PunkteKarte({
  zentrum,
  punkte,
  nadelTitel,
  titel,
  ersatz,
  ortsmitte = false,
  sprache = "de",
}: {
  /** Mitte der Karte und Ort der Nadel. Ohne ihn steht `ersatz` an der Stelle der Karte. */
  zentrum?: Koordinate;
  punkte: KartenPunkt[];
  /** Text im Popup der Nadel, etwa die Adresse oder „Ortsmitte, ab hier gemessen“. */
  nadelTitel: string;
  /** Für die Beschreibung der Karte für Bildschirmleser. */
  titel: string;
  ersatz?: ReactNode;
  /** Gemessen ab Ortsmitte oder Postleitzahlgebiet: Die Popups sagen es dazu. */
  ortsmitte?: boolean;
  /** Sprache der Popups und der Legende. Ohne Angabe Deutsch (CRM). */
  sprache?: Sprache;
}) {
  const t = umgebungTexte(sprache);
  const feld = useRef<HTMLDivElement>(null);
  /*
   * Die Karte hängt am Inhalt, nicht am Objekt: Der Kundenlink lädt seine
   * Daten bei jedem Zurückkehren ins Fenster neu, und jedes Mal entsteht ein
   * neues, aber gleiches Objekt. Die Karte deshalb jedes Mal abzureißen und
   * neu zu bauen, kostet Kartenbilder und lässt Leaflet mitten in einer
   * Animation stolpern („_leaflet_pos“).
   */
  const schluessel = zentrum ? JSON.stringify({ zentrum: { lat: zentrum.lat, lng: zentrum.lng }, punkte, nadelTitel, ortsmitte, sprache }) : "";

  useEffect(() => {
    const el = feld.current;
    if (!el || !schluessel) return;
    const daten = JSON.parse(schluessel) as { zentrum: Koordinate; punkte: KartenPunkt[]; nadelTitel: string; ortsmitte: boolean; sprache: Sprache };
    const tk = umgebungTexte(daten.sprache);
    const { zentrum: mitte, punkte: orte } = daten;
    const karte = L.map(el, {
      center: [mitte.lat, mitte.lng],
      // Nur die Nadel des Objekts: näher heran, damit Straße und Nachbarschaft lesbar sind.
      zoom: orte.length > 0 ? 15 : 16,
      // Kein Scrollzoom: Sonst zoomt die Karte, während man die Seite scrollt.
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(karte);
    const zusatz = daten.ortsmitte ? tk.abMesspunkt : "";
    for (const p of orte) {
      L.marker([p.lat, p.lng], { icon: punktIcon(p.farbe), keyboard: false, title: p.name })
        .addTo(karte)
        .bindPopup(`<b>${html(p.name)}</b><br>${html(p.art)} · ${html(tk.entfernung(p.meter))}${html(zusatz)} · ${html(tk.zuFuss(p.minuten))}`);
    }
    // Die Nadel zuletzt und obenauf, damit kein Punkt sie verdeckt.
    L.marker([mitte.lat, mitte.lng], { icon: objektIcon, keyboard: false, zIndexOffset: 1000 })
      .addTo(karte)
      .bindPopup(`<b>${html(daten.nadelTitel)}</b>`);
    // Ohne gemessene Breite (etwa im Test) bleibt es beim festen Ausschnitt.
    // Ohne Animation: Wird die Karte währenddessen entfernt, wirft Leaflet sonst.
    const ausschnitt = ausschnittPunkte(orte);
    if (ausschnitt.length > 0 && el.clientWidth > 0 && el.clientHeight > 0) {
      karte.fitBounds(
        L.latLngBounds([[mitte.lat, mitte.lng], ...ausschnitt.map((p): L.LatLngTuple => [p.lat, p.lng])]),
        { padding: [28, 28], maxZoom: 16, animate: false },
      );
    }
    return () => { karte.stop(); karte.remove(); };
  }, [schluessel]);

  const eintraege = legende(punkte);

  return (
    <div className="mikro-karte" data-testid="mikrolage-karte">
      {schluessel
        ? <div ref={feld} className="mikro-karte-feld" role="img" aria-label={t.karteVon(titel)} data-testid="mikrolage-karte-feld" />
        : <div className="mikro-karte-ersatz" data-testid="mikrolage-karte-ersatz">{ersatz}</div>}
      {schluessel && eintraege.length > 0 && (
        <ul className="umgebung-legende" aria-label={t.legende} data-testid="umgebung-legende">
          <li><span className="umgebung-legende-nadel" style={{ background: OBJEKT_FARBE }} aria-hidden="true" />{ortsmitte ? t.messpunkt : t.objekt}</li>
          {eintraege.map((e) => (
            <li key={e.id}><span className="umgebung-legende-punkt" style={{ background: e.farbe }} aria-hidden="true" />{t.kategorien[e.id] ?? e.titel}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
