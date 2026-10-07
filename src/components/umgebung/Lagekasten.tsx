import { Bus, Dumbbell, Hospital, Landmark, MapPin, ShoppingBag, Trees, University } from "lucide-react";
import type { Umgebung, UmgebungKategorieId, UmgebungsKategorie, UmgebungsPunkt } from "@/lib/umgebungspunkte";
import type { Sprache } from "@/lib/seitenSprache";
import { umgebungTexte, type UmgebungTexte } from "./umgebungTexte";

/**
 * Der Kasten „Lage der Immobilie“ neben der Karte (Christian, 24.09.2026):
 * nach Kategorien geordnet, je Kategorie die nächsten Orte mit Entfernung.
 * Oben die Mikrolage (Einkaufen, Freizeit, Parks und Grün, Bus und Bahn,
 * Öffentliche Einrichtungen), darunter die Makrolage (Hochschulen,
 * Krankenhäuser).
 *
 * Ein Kasten für alle vier Stellen, siehe `Umgebungsansicht`. Die
 * Klassennamen `mikro-*` sind die des Exposés, damit dessen Regeln in
 * `premiumExpose.css` und `exposeLageGrundriss.css` (auch für den Druck)
 * weiter greifen. Im CRM gestaltet `umgebung.css` dieselben Klassen.
 *
 * Ohne Messung steht hier nie eine Entfernung, nur Adresse und ein ehrlicher
 * Satz (`LagekastenOhneMessung`).
 */

const SYMBOL: Record<UmgebungKategorieId, typeof ShoppingBag> = {
  einkaufen: ShoppingBag,
  freizeit: Dumbbell,
  gruen: Trees,
  verkehr: Bus,
  einrichtungen: Landmark,
  hochschulen: University,
  kliniken: Hospital,
};

function Zeile({ punkt, farbe, makro, t }: { punkt: UmgebungsPunkt; farbe: string; makro: boolean; t: UmgebungTexte }) {
  return (
    <li>
      <span className={makro ? "mikro-punkt mikro-punkt-makro" : "mikro-punkt"} style={makro ? undefined : { background: farbe }} aria-hidden="true" />
      <span className="mikro-name"><b>{punkt.name}</b><small>{punkt.art}</small></span>
      <span className="mikro-weg">{makro ? t.entfernung(punkt.entfernungMeter) : `${t.entfernung(punkt.entfernungMeter)} · ${punkt.gehminuten} min`}</span>
    </li>
  );
}

function Kategorie({ kategorie, testId, t }: { kategorie: UmgebungsKategorie; testId: string; t: UmgebungTexte }) {
  const Symbol = SYMBOL[kategorie.id];
  const makro = kategorie.ebene === "makro";
  const mehrere = kategorie.listen.length > 1;
  return (
    <section className="mikro-gruppe" data-testid={testId}>
      <h3>
        <span className="mikro-symbol" style={makro ? undefined : { color: kategorie.farbe }}><Symbol size={15} /></span>
        {kategorie.titel}
      </h3>
      {kategorie.listen.map((liste) => (
        <div key={liste.id} className={mehrere ? "umgebung-teilliste" : undefined} data-testid={mehrere ? `${testId}-${liste.id}` : undefined}>
          {mehrere && <h4>{liste.titel}</h4>}
          <ul>
            {liste.punkte.map((p, i) => <Zeile key={`${p.name}-${i}`} punkt={p} farbe={kategorie.farbe} makro={makro} t={t} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Der Kasten mit gemessener Umgebung. */
export function Lagekasten({ umgebung, druckhinweis = false, sprache }: { umgebung: Umgebung; druckhinweis?: boolean; sprache?: Sprache }) {
  const t = umgebungTexte(sprache);
  const mikro = umgebung.kategorien.filter((k) => k.ebene === "mikro");
  const makro = umgebung.kategorien.filter((k) => k.ebene === "makro");
  const genau = t.genauigkeit(umgebung.genauigkeit);
  const makroText = !umgebung.makroGemessen ? t.makroNichtGemessen : makro.length === 0 ? t.makroLeer : "";
  return (
    <aside className="mikro-liste" data-testid="mikrolage-liste" aria-label={t.lageDerImmobilie} tabIndex={0}>
      {/* Im Druck fehlt die Karte (Kartenbilder laden live und verrutschen), die Liste steht allein. */}
      {druckhinweis && <p className="print-only mikro-druckhinweis">{t.druckhinweis}</p>}
      {genau && <p className="umgebung-genauigkeit" data-testid="umgebung-genauigkeit">{genau}</p>}
      <p className="mikro-ebene">{t.mikrolage}</p>
      {mikro.length === 0
        ? <p className="mikro-leer">{t.mikroLeer}</p>
        : mikro.map((k) => <Kategorie key={k.id} kategorie={k} testId={`mikrolage-${k.id}`} t={t} />)}
      <section className="mikro-ebene-block" data-testid="makrolage" aria-label={t.makrolage}>
        <p className="mikro-ebene">{t.makrolage}</p>
        {makroText
          ? <p className="mikro-leer" data-testid="makrolage-leer">{makroText}</p>
          : makro.map((k) => <Kategorie key={k.id} kategorie={k} testId={`makrolage-${k.id}`} t={t} />)}
      </section>
      {/* Dieselbe Quellenzeile wie überall im Exposé (`quellenzeile` in premiumExpose.css). Sie sagt auch, ab wo gemessen wurde. */}
      <p className="quellenzeile mikro-quelle" data-testid="mikrolage-quelle">{umgebung.hinweis} {t.gehminutenSatz}</p>
    </aside>
  );
}

/**
 * Ohne gemessene Umgebung: Adresse und ein ruhiger Satz statt leerer Listen.
 * Kein „wird gerade ausgewertet“: Der Satz stünde sonst womöglich lange da,
 * ohne dass etwas läuft.
 */
export function LagekastenOhneMessung({ adresse, druckhinweis = false, zusatz, sprache }: { adresse: string; druckhinweis?: boolean; zusatz?: string; sprache?: Sprache }) {
  const t = umgebungTexte(sprache);
  return (
    <aside className="mikro-liste mikro-ersatz" data-testid="mikrolage-ersatz" aria-label={t.lageDerImmobilie}>
      {druckhinweis && <p className="print-only mikro-druckhinweis">{t.druckhinweis}</p>}
      <h3><span className="mikro-symbol"><MapPin size={15} /></span>{t.lageDerImmobilie}</h3>
      {adresse && <p className="mikro-adresse" data-testid="mikrolage-adresse">{adresse}</p>}
      <p className="mikro-leer" data-testid="mikrolage-ersatz-text">{t.nichtGemessen}</p>
      {zusatz && <p className="mikro-leer umgebung-zusatz" data-testid="umgebung-zusatz">{zusatz}</p>}
    </aside>
  );
}
