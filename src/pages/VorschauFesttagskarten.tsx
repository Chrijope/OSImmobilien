import { useState } from "react";
import { FesttagskarteAnzeige } from "@/components/saison/Festtagskarte";
import { kartenTexte, type Anlass, type Motiv, type Ton } from "@/lib/festtagskarten";

/**
 * Lokale Vorschau aller Festtagskarten, nur unter `npm run dev`
 * (siehe `vorschauRouten.ts`). Beispielnamen statt echter Daten.
 */
const KARTEN: Array<{ anlass: Anlass; motiv: Motiv; name: string }> = [
  { anlass: "weihnachten", motiv: 1, name: "Weihnachten 1 · Schneekugel" },
  { anlass: "weihnachten", motiv: 2, name: "Weihnachten 2 · Adventshaus" },
  { anlass: "weihnachten", motiv: 3, name: "Weihnachten 3 · Exposé" },
  { anlass: "silvester", motiv: 1, name: "Silvester" },
  { anlass: "geburtstag", motiv: 1, name: "Geburtstag 1 · Torte" },
  { anlass: "geburtstag", motiv: 2, name: "Geburtstag 2 · Geschenk" },
  { anlass: "geburtstag", motiv: 3, name: "Geburtstag 3 · Exposé" },
];
const SICHTEN: Array<{ id: string; name: string; ton: Ton; en: boolean }> = [
  { id: "vp", name: "Vertriebspartner", ton: "du", en: false },
  { id: "kunde", name: "Kunde", ton: "sie", en: false },
  { id: "kunde-en", name: "Kunde (EN)", ton: "sie", en: true },
];

export default function VorschauFesttagskarten() {
  const [k, setK] = useState(0);
  const [s, setS] = useState(0);
  const [lauf, setLauf] = useState(1);
  const karte = KARTEN[k], sicht = SICHTEN[s];
  const f = { anlass: karte.anlass, jahr: 2026, motiv: karte.motiv };
  const t = kartenTexte(f, sicht.ton === "du"
    ? { ton: "du", sprache: "de", vorname: "Anna", nachname: "Beispiel", rolle: "Vertriebspartnerin" }
    : { ton: "sie", sprache: sicht.en ? "en" : "de", vorname: "Max", nachname: "Beispiel", anrede: "Herr" });
  const knopf = (aktiv: boolean) =>
    `rounded-full px-3 py-1.5 text-xs ${aktiv ? "bg-[#D8B46A] text-[#0A1F18]" : "text-white/80 hover:text-white"}`;
  return (
    <div className="min-h-screen bg-[#dfe7e2]">
      <nav className="fixed left-1/2 top-3 z-[200] flex max-w-[95vw] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-3xl bg-[#0A1F18]/85 p-1.5">
        {KARTEN.map((x, i) => <button key={x.name} className={knopf(i === k)} onClick={() => { setK(i); setLauf((n) => n + 1); }}>{x.name}</button>)}
        <span className="mx-1 w-px bg-white/20" />
        {SICHTEN.map((x, i) => <button key={x.id} className={knopf(i === s)} onClick={() => { setS(i); setLauf((n) => n + 1); }}>{x.name}</button>)}
      </nav>
      <FesttagskarteAnzeige key={lauf} f={f} t={t} en={sicht.en} onSchliessen={() => setLauf((n) => n + 1)} />
    </div>
  );
}
