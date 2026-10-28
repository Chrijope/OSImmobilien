import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  haeuseruebergreifend, objektVon,
  type KundenObjektvergleich, type VergleichAnnahmen, type VergleichEinheit, type VergleichKunde, type VergleichObjekt, type VergleichTexte,
} from "@/lib/investmentrechner/kundenObjektvergleich";

/*
 * Eingaben des persönlichen Objektvergleichs (Christian, 28.10.2026), im CRM
 * (pages/KundenObjektvergleich.tsx) und im Artefakt des Rechners gleich.
 * Kunde, Objekt- und Wohnungswahl sowie Speichern liegen beim Aufrufer.
 */

export const feldKlasse = "h-8 w-full rounded-md border bg-background px-2 text-sm";

export function Feld({ label, children, hinweis }: { label: string; children: ReactNode; hinweis?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hinweis && <span className="block text-xs text-muted-foreground">{hinweis}</span>}
    </label>
  );
}

/** Zahl; `prozent` zeigt Anteile (0,042) als Prozent (4,2). */
function Zahl({ label, wert, onWert, prozent, hinweis }: { label: string; wert: number; onWert: (w: number) => void; prozent?: boolean; hinweis?: string }) {
  const anzeige = prozent ? Math.round(wert * 100000) / 1000 : wert;
  return (
    <Feld label={label} hinweis={hinweis}>
      <input type="number" step="any" className={feldKlasse} value={Number.isFinite(anzeige) ? anzeige : 0}
        onChange={(e) => { const n = Number(e.target.value); onWert(Number.isFinite(n) ? (prozent ? n / 100 : n) : 0); }} />
    </Feld>
  );
}

function Text({ label, wert, onWert, hinweis, mehrzeilig, platzhalter }: { label: string; wert: string; onWert: (w: string) => void; hinweis?: string; mehrzeilig?: boolean; platzhalter?: string }) {
  return (
    <Feld label={label} hinweis={hinweis}>
      {mehrzeilig
        ? <textarea className="w-full rounded-md border bg-background px-2 py-1 text-sm min-h-[72px]" value={wert} placeholder={platzhalter} onChange={(e) => onWert(e.target.value)} />
        : <input className={feldKlasse} value={wert} placeholder={platzhalter} onChange={(e) => onWert(e.target.value)} />}
    </Feld>
  );
}

export function Abschnitt({ titel, children, offen }: { titel: string; children: ReactNode; offen?: boolean }) {
  return (
    <details className="rounded-xl border bg-card p-4" open={offen}>
      <summary className="cursor-pointer text-sm font-semibold">{titel}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

const raster = "grid gap-3 grid-cols-2 md:grid-cols-4";

/** Bild als Adresse oder als Datei (im Artefakt gibt es kein Netz, dort zählt die Datei). */
function Bild({ label, wert, onWert }: { label: string; wert: string; onWert: (w: string) => void }) {
  return (
    <Feld label={label}>
      <div className="flex gap-2">
        <input className={feldKlasse} value={wert.startsWith("data:") ? "eigene Datei" : wert} placeholder="Adresse oder Datei"
          onChange={(e) => onWert(e.target.value)} readOnly={wert.startsWith("data:")} />
        <label className="shrink-0 cursor-pointer rounded-md border px-2 text-sm leading-8 hover:bg-muted">
          Datei
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const datei = e.target.files?.[0];
            if (!datei) return;
            const leser = new FileReader();
            leser.onload = () => onWert(String(leser.result || ""));
            leser.readAsDataURL(datei);
          }} />
        </label>
        {wert && <button type="button" className="shrink-0 text-xs text-muted-foreground hover:underline" onClick={() => onWert("")}>leeren</button>}
      </div>
    </Feld>
  );
}

export function ObjektvergleichFormular({ v, setV, onAlsStandard, freieHaeuser }: {
  v: KundenObjektvergleich;
  setV: Dispatch<SetStateAction<KundenObjektvergleich | null>>;
  /** „Als Standard am Objekt speichern“; fehlt im Artefakt. */
  onAlsStandard?: (i: number) => void;
  /** Zweites Haus von Hand an- und abschalten (Artefakt, ohne Objektwahl). */
  freieHaeuser?: boolean;
}) {
  const setze = (patch: Partial<KundenObjektvergleich>) => setV((alt) => (alt ? { ...alt, ...patch } : alt));
  const setzeKunde = (patch: Partial<VergleichKunde>) => setV((alt) => (alt ? { ...alt, kunde: { ...alt.kunde, ...patch } } : alt));
  const setzeObjekt = (i: number, patch: Partial<VergleichObjekt>) => setV((alt) => {
    if (!alt) return alt;
    return i === 1 && alt.objekt2 ? { ...alt, objekt2: { ...alt.objekt2, ...patch } } : { ...alt, objekt: { ...alt.objekt, ...patch } };
  });
  const setzeAnnahmen = (patch: Partial<VergleichAnnahmen>) => setV((alt) => (alt ? { ...alt, annahmen: { ...alt.annahmen, ...patch } } : alt));
  const setzeTexte = (patch: Partial<VergleichTexte>) => setV((alt) => (alt ? { ...alt, texte: { ...alt.texte, ...patch } } : alt));
  const setzeEinheit = (i: number, patch: Partial<VergleichEinheit>) =>
    setV((alt) => (alt ? { ...alt, einheiten: alt.einheiten.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : alt));
  return (
    <>
    <Abschnitt titel="Dokument und Annahmen">
      <div className="grid grid-cols-2 gap-3">
        <Feld label="Stand (Datum)"><input type="date" className={feldKlasse} value={v.stand} onChange={(e) => setze({ stand: e.target.value })} /></Feld>
        <Text label="Variante (Titel, Dateiname)" wert={v.variante} onWert={(w) => setze({ variante: w })} platzhalter="z. B. Kaufpreis angepasst" />
      </div>
      <div className={raster}>
        <Zahl label="Steuersatz %" prozent wert={v.annahmen.steuer} onWert={(w) => setzeAnnahmen({ steuer: w })} />
        <Zahl label="Zins %" prozent wert={v.annahmen.zins} onWert={(w) => setzeAnnahmen({ zins: w })} />
        <Zahl label="Tilgung %" prozent wert={v.annahmen.tilgung} onWert={(w) => setzeAnnahmen({ tilgung: w })} />
        <Zahl label="Kaufnebenkosten %" prozent wert={v.annahmen.knk} onWert={(w) => setzeAnnahmen({ knk: w })} />
        <Zahl label="Gebäudeanteil %" prozent wert={v.annahmen.gebaeudeanteil} onWert={(w) => setzeAnnahmen({ gebaeudeanteil: w })} />
        <Zahl label="Wertsteigerung %" prozent wert={v.annahmen.wertPa} onWert={(w) => setzeAnnahmen({ wertPa: w })} />
        <Zahl label="Kostensteigerung %" prozent wert={v.annahmen.kostenPa} onWert={(w) => setzeAnnahmen({ kostenPa: w })} />
        <Zahl label="Jahr 1" wert={v.annahmen.startJahr} onWert={(w) => setzeAnnahmen({ startJahr: w })} />
        <Zahl label="Zielmiete €/m²" wert={v.annahmen.mieteZielQm} onWert={(w) => setzeAnnahmen({ mieteZielQm: w })} />
        <Zahl label="Zieljahr Miete" wert={v.annahmen.mieteZielJahr} onWert={(w) => setzeAnnahmen({ mieteZielJahr: w })} />
        <Zahl label="Kappungsgrenze %" prozent wert={v.annahmen.kappung} onWert={(w) => setzeAnnahmen({ kappung: w })} hinweis="20 %, mit Verordnung 15 %" />
        <Zahl label="Subvention Monate" wert={v.annahmen.subventionMonate} onWert={(w) => setzeAnnahmen({ subventionMonate: w })} />
        <Zahl label="Lastenwechsel nach Monaten" wert={v.annahmen.lastenwechselMonate} onWert={(w) => setzeAnnahmen({ lastenwechselMonate: w })} hinweis="Monate nach dem Kauf, in der Regel 5" />
      </div>
    </Abschnitt>

    <Abschnitt titel="Wohnungen A und B">
      <div className="grid grid-cols-2 gap-4">
        {v.einheiten.map((e, i) => (
          <div key={i} className="space-y-2">
            <p className="text-sm font-medium">{i ? "B" : "A"} · WE {e.nr}</p>
            <Text label="Lage" wert={e.lage} onWert={(w) => setzeEinheit(i, { lage: w })} />
            <Zahl label="Wohnfläche m²" wert={e.qm} onWert={(w) => setzeEinheit(i, { qm: w })} />
            <Zahl label="Zimmer" wert={e.zimmer} onWert={(w) => setzeEinheit(i, { zimmer: w })} />
            <Zahl label="Kaufpreis Wohnung €" wert={e.kpWohnung} onWert={(w) => setzeEinheit(i, { kpWohnung: w })} />
            <Zahl label="Listenpreis € (bei Preisnachlass)" wert={e.kpListe} onWert={(w) => setzeEinheit(i, { kpListe: w })} hinweis="0 = kein Nachlass" />
            <Zahl label="Garagen (Anzahl)" wert={e.garagen} onWert={(w) => setzeEinheit(i, { garagen: Math.max(0, Math.round(w)) })} hinweis="nur die erste mit Kaufpreis" />
            <Zahl label="Kaufpreis Garage €" wert={e.garageKp} onWert={(w) => setzeEinheit(i, { garageKp: w })} />
            <Zahl label="Garagenmiete 1. Jahr € je Platz" wert={e.garageMiete1} onWert={(w) => setzeEinheit(i, { garageMiete1: w })} />
            <Zahl label="Garagenmiete im Zieljahr €" wert={e.garageMieteZiel} onWert={(w) => setzeEinheit(i, { garageMieteZiel: w })} />
            <div className="grid grid-cols-2 gap-2">
              <Zahl label="Garage heute von €" wert={e.garageIstVon} onWert={(w) => setzeEinheit(i, { garageIstVon: w })} />
              <Zahl label="bis €" wert={e.garageIstBis} onWert={(w) => setzeEinheit(i, { garageIstBis: w })} />
            </div>
            <Zahl label="Kaltmiete heute €" wert={e.mieteIst} onWert={(w) => setzeEinheit(i, { mieteIst: w })} />
            <Zahl label="Gerechnete Miete €/m² (subventioniert)" wert={e.mieteSubQm} onWert={(w) => setzeEinheit(i, { mieteSubQm: w })} />
            <Zahl label="Zielmiete €/m² (0 = aus den Annahmen)" wert={e.mieteZielQm ?? 0} onWert={(w) => setzeEinheit(i, { mieteZielQm: w || undefined })} />
            <Zahl label="Hausgeld umlagefähig €" wert={e.u} onWert={(w) => setzeEinheit(i, { u: w })} />
            <Zahl label="Hausgeld nicht umlagefähig €" wert={e.n} onWert={(w) => setzeEinheit(i, { n: w })} />
            <Zahl label="Erhaltungsrücklage €" wert={e.r} onWert={(w) => setzeEinheit(i, { r: w })} />
            <Zahl label="AfA-Dauer Jahre (Restnutzungsdauer)" wert={e.afaJahre} onWert={(w) => setzeEinheit(i, { afaJahre: w })} />
          </div>
        ))}
      </div>
    </Abschnitt>

    {freieHaeuser && (
      <label className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm">
        <input type="checkbox" checked={haeuseruebergreifend(v)}
          onChange={(e) => setV((alt) => (alt ? { ...alt, objekt2: e.target.checked ? { ...alt.objekt, strasse: "Haus B", ortZeile: "", fotoTitel: "", fotoHaus: "", hausPunkte: [] } : null } : alt))} />
        Wohnung B liegt in einem anderen Haus (häuserübergreifend)
      </label>
    )}
    {(haeuseruebergreifend(v) ? [0, 1] : [0]).map((i) => {
      const o = objektVon(v, i);
      const setz = (patch: Partial<VergleichObjekt>) => setzeObjekt(i, patch);
      return (
        <Abschnitt key={i} titel={haeuseruebergreifend(v) ? `Haus ${i ? "B" : "A"}: ${o.strasse}` : "Objekt"}>
          <Text label="Straße" wert={o.strasse} onWert={(w) => setz({ strasse: w })} />
          <Text label="PLZ und Ort" wert={o.ortZeile} onWert={(w) => setz({ ortZeile: w })} />
          <Text label="Das Haus (eine Zeile je Punkt)" mehrzeilig wert={o.hausPunkte.join("\n")} onWert={(w) => setz({ hausPunkte: w.split("\n").map((x) => x.trim()).filter(Boolean) })} />
          <Text label="Verwaltung" wert={o.verwaltung} onWert={(w) => setz({ verwaltung: w })} />
          <div className="grid grid-cols-2 gap-3">
            <Zahl label="Vergleichsmiete am Ort €/m²" wert={o.vergleichsmieteQm} onWert={(w) => setz({ vergleichsmieteQm: w })} hinweis="0 = Satz entfällt" />
            <Text label="Quelle Vergleichsmiete" wert={o.vergleichsmieteQuelle} onWert={(w) => setz({ vergleichsmieteQuelle: w })} platzhalter="z. B. MieteAktuell" />
          </div>
          <Text label="Hausgeld laut" wert={o.wirtschaftsplan} onWert={(w) => setz({ wirtschaftsplan: w })} platzhalter="Wirtschaftsplan 2027" />
          {i === 0 && <Bild label="Titelbild" wert={o.fotoTitel} onWert={(w) => setz({ fotoTitel: w })} />}
          <Bild label="Hausfoto Seite 3" wert={o.fotoHaus} onWert={(w) => setz({ fotoHaus: w })} />
          {onAlsStandard && (
            <>
              <Button size="sm" variant="outline" onClick={() => onAlsStandard(i)}>
                <Star className="h-4 w-4 mr-1.5" /> Als Standard am Objekt speichern
              </Button>
              <p className="text-xs text-muted-foreground">Speichert Subvention, Zielmiete, Vergleichsmiete, Garagenwerte und die Hauspunkte am Objekt, damit jeder neue Vergleich damit startet.</p>
            </>
          )}
        </Abschnitt>
      );
    })}

    <Abschnitt titel="Kunde (aus der Selbstauskunft, änderbar)">
      <div className="grid grid-cols-3 gap-3">
        <Text label="Anrede" wert={v.kunde.anrede} onWert={(w) => setzeKunde({ anrede: w })} />
        <Text label="Vorname" wert={v.kunde.vorname} onWert={(w) => setzeKunde({ vorname: w })} />
        <Text label="Nachname" wert={v.kunde.nachname} onWert={(w) => setzeKunde({ nachname: w })} />
      </div>
      <div className={raster}>
        <Zahl label="Netto im Monat €" wert={v.kunde.netto} onWert={(w) => setzeKunde({ netto: w })} />
        <Zahl label="Brutto im Jahr €" wert={v.kunde.bruttoJahr} onWert={(w) => setzeKunde({ bruttoJahr: w })} />
        <Zahl label="Miete warm €" wert={v.kunde.mieteWarm} onWert={(w) => setzeKunde({ mieteWarm: w })} />
        <Zahl label="Lebenshaltung €" wert={v.kunde.lebenshaltung} onWert={(w) => setzeKunde({ lebenshaltung: w })} />
        <Zahl label="Kreditraten €" wert={v.kunde.kreditRaten} onWert={(w) => setzeKunde({ kreditRaten: w })} />
        <Zahl label="Kapital €" wert={v.kunde.kapital} onWert={(w) => setzeKunde({ kapital: w })} />
        <Zahl label="Jahre bis zur Rente" wert={v.kunde.jahreBisRente} onWert={(w) => setzeKunde({ jahreBisRente: w })} />
        <Text label="Steuerklasse" wert={v.kunde.steuerklasse} onWert={(w) => setzeKunde({ steuerklasse: w })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text label="Beschäftigung" wert={v.kunde.beschaeftigung} onWert={(w) => setzeKunde({ beschaeftigung: w })} />
        <Text label="Familienstand" wert={v.kunde.familienstand} onWert={(w) => setzeKunde({ familienstand: w })} />
        <Text label="Kinder" wert={v.kunde.kinder} onWert={(w) => setzeKunde({ kinder: w })} />
        <Text label="Antrag" wert={v.kunde.antrag} onWert={(w) => setzeKunde({ antrag: w })} />
        <Text label="Wohnsituation" wert={v.kunde.wohnsituation} onWert={(w) => setzeKunde({ wohnsituation: w })} />
        <Text label="Laufende Kredite (Text)" wert={v.kunde.kredite} onWert={(w) => setzeKunde({ kredite: w })} />
        <Feld label="Selbstauskunft vom"><input type="date" className={feldKlasse} value={v.kunde.saDatum.slice(0, 10)} onChange={(e) => setzeKunde({ saDatum: e.target.value })} /></Feld>
      </div>
    </Abschnitt>

    <Abschnitt titel="Empfehlung (leer = automatisch aus den Kriterien)">
      <Text label="Überschrift" wert={v.texte.empfehlungTitel} onWert={(w) => setzeTexte({ empfehlungTitel: w })} />
      <Text label="Empfehlung (Absätze durch Leerzeile)" mehrzeilig wert={v.texte.empfehlung} onWert={(w) => setzeTexte({ empfehlung: w })} />
      <Text label="Wann die andere Wohnung besser passt" mehrzeilig wert={v.texte.wannAndere} onWert={(w) => setzeTexte({ wannAndere: w })} />
      <Text label="Nächste Schritte (eine Zeile je Schritt)" mehrzeilig wert={v.texte.naechsteSchritte.join("\n")}
        onWert={(w) => setzeTexte({ naechsteSchritte: w.split("\n").map((x) => x.trim()).filter(Boolean) })} />
    </Abschnitt>
    </>
  );
}
