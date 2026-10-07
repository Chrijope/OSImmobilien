import type { CSSProperties } from "react";
import { MapPin } from "lucide-react";
import { kartenPunkte, type Umgebung } from "@/lib/umgebungspunkte";
import type { Sprache } from "@/lib/seitenSprache";
import { PunkteKarte } from "./PunkteKarte";
import { Lagekasten, LagekastenOhneMessung } from "./Lagekasten";
import { umgebungInSprache, umgebungTexte } from "./umgebungTexte";
import "./umgebung.css";

/**
 * Karte links, Lagekasten rechts; auf schmalen Flächen die Karte oben und
 * die Liste darunter (Christian, 24.09.2026).
 *
 * Eine Ansicht für alle vier Stellen:
 *   - Objektseite und Einheitenseite, Reiter „Karte“ (`UmgebungsKarte`,
 *     Variante „crm“, hell und dunkel, Liquid Glass über die Karte darum)
 *   - Kundenansicht und Exposé am Bildschirm (`Mikrolage`, Variante
 *     „expose“, immer hell wie das ganze Exposé)
 *
 * Die Reihenfolge der Quellen ist überall dieselbe:
 *   1. die gemessene Umgebung (`umgebungAusAnalyse`) mit Punkten und Liste,
 *   2. sonst die gespeicherte Lage (`meta.koordinaten`), nur mit der Nadel,
 *      und rechts der ehrliche Satz, dass die Auswertung noch fehlt,
 *   3. sonst an der Stelle der Karte ein ruhiger Satz mit einem Link zu
 *      OpenStreetMap, den man selbst anklickt.
 *
 * Im Browser wird nie eine Adresse gesucht und nie eine Umgebung abgefragt.
 */
export function Umgebungsansicht({
  umgebung,
  lage,
  adresse,
  titel,
  variante,
  kartenHoehe,
  zusatz,
  sprache = "de",
}: {
  umgebung?: Umgebung;
  /** Die gespeicherte Lage des Hauses, falls die Messung fehlt. */
  lage?: { lat: number; lng: number };
  adresse: string;
  /** Name für Nadel und Bildschirmleser, meist die Adresse. */
  titel: string;
  variante: "crm" | "expose";
  /** Höhe der Karte in Pixeln im CRM. Im Exposé bestimmt premiumExpose.css. */
  kartenHoehe?: number;
  /** Ein Satz unter dem Leerzustand, etwa warum die Messung scheiterte. Nur im CRM. */
  zusatz?: string;
  /** Sprache der Texte (Kundensprache, Etappe 3). Das CRM gibt keine an und bleibt deutsch. */
  sprache?: Sprache;
}) {
  const t = umgebungTexte(sprache);
  const umgebungAnzeige = umgebungInSprache(umgebung, sprache);
  const zentrum = umgebung?.zentrum ?? lage;
  const ortsmitte = umgebung?.genauigkeit === "ort" || umgebung?.genauigkeit === "plz";
  const osm = `https://www.openstreetmap.org/search?query=${encodeURIComponent(adresse)}`;
  const ersatz = (
    <p>
      <span className="mikro-symbol" aria-hidden="true"><MapPin size={15} /></span>
      {t.karteFolgt}
      {adresse.trim() && <a href={osm} target="_blank" rel="noreferrer">{t.inOpenStreetMap}</a>}
    </p>
  );
  const stil = kartenHoehe ? ({ "--u-karte-hoehe": `${kartenHoehe}px` } as CSSProperties) : undefined;
  const druck = variante === "expose";

  return (
    <div className={`umgebung-ansicht umgebung-${variante}`} style={stil}>
      <div className="mikro-grid" data-testid="mikrolage-aufbau">
        <PunkteKarte
          zentrum={zentrum}
          punkte={kartenPunkte(umgebungAnzeige)}
          nadelTitel={t.nadel(umgebung, titel)}
          titel={titel}
          ersatz={ersatz}
          ortsmitte={ortsmitte}
          sprache={sprache}
        />
        {umgebungAnzeige
          ? <Lagekasten umgebung={umgebungAnzeige} druckhinweis={druck} sprache={sprache} />
          : <LagekastenOhneMessung adresse={adresse} druckhinweis={druck} zusatz={zusatz} sprache={sprache} />}
      </div>
    </div>
  );
}
