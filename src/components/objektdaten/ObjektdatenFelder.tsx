import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GARAGEN_STATUS_TEXT, type GaragenArt, type GaragenStatus } from "@/lib/mietgarantie";
import type { EinheitFormDaten, ObjektFormDaten } from "@/lib/objektdatenFormular";

/*
 * Eingabeblöcke der Objektdaten im Formular „Objekt anlegen“ (17.10.2026).
 * Was hier steht, erscheint nach dem Speichern in Einheitenliste, Mieter und
 * Fristen der Objektdaten. Aus einer hochgeladenen Liste sind die Felder
 * meist schon gefüllt; dann nur prüfen und ergänzen.
 */

const auswahl = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

function Feld({ label, wert, onChange, typ = "text", platzhalter, hinweis }: {
  label: string; wert: string; onChange: (v: string) => void; typ?: "text" | "date" | "zahl"; platzhalter?: string; hinweis?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="h-8" type={typ === "date" ? "date" : "text"} inputMode={typ === "zahl" ? "decimal" : undefined}
        value={wert} placeholder={platzhalter} onChange={(e) => onChange(e.target.value)} />
      {hinweis && <p className="mt-0.5 text-bildunterschrift text-muted-foreground">{hinweis}</p>}
    </div>
  );
}

export function EinheitObjektdatenFelder({ wert, onChange }: { wert: EinheitFormDaten; onChange: (neu: EinheitFormDaten) => void }) {
  const setze = (teil: Partial<EinheitFormDaten>) => onChange({ ...wert, ...teil });
  return (
    <details className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
        Objektdaten dieser Einheit: MEA, Sollmiete, Mieter, Garage
      </summary>
      <div className="space-y-4 pt-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Feld label="Haus" wert={wert.haus} onChange={(v) => setze({ haus: v })} platzhalter="38 f" />
          <Feld label="MEA" typ="zahl" wert={wert.mea} onChange={(v) => setze({ mea: v })} hinweis="Verteilt Hausgeld, Wirtschaftsplan und Kosten" />
          <Feld label="Fläche laut Teilungserklärung (m²)" typ="zahl" wert={wert.flaecheTe} onChange={(v) => setze({ flaecheTe: v })} />
          <Feld label="Sollmiete (€)" typ="zahl" wert={wert.sollMiete} onChange={(v) => setze({ sollMiete: v })} hinweis="Miete, die die Wohnung erzielen soll" />
          <Feld label="Letzte Mieterhöhung ab" typ="date" wert={wert.letzteErhoehung} onChange={(v) => setze({ letzteErhoehung: v })} />
          <Feld label="Miete vor letzter Erhöhung (€)" typ="zahl" wert={wert.mieteVorErhoehung} onChange={(v) => setze({ mieteVorErhoehung: v })} hinweis="Für die Kappungsgrenze" />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Mieter (Kaltmiete ist die Miete oben)</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Feld label="Name" wert={wert.mieterName} onChange={(v) => setze({ mieterName: v })} platzhalter="leer: unvermietet" />
            <Feld label="Mietbeginn" typ="date" wert={wert.mietbeginn} onChange={(v) => setze({ mietbeginn: v })} />
            <Feld label="Befristet bis" typ="date" wert={wert.befristetBis} onChange={(v) => setze({ befristetBis: v })} />
            <Feld label="Kaution (€)" typ="zahl" wert={wert.kaution} onChange={(v) => setze({ kaution: v })} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Garage oder Stellplatz (Kaufpreis und Miete oben unter Stellplatz)</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Feld label="Nummer" wert={wert.garageNr} onChange={(v) => setze({ garageNr: v })} platzhalter="G4, leer: keine" />
            <div>
              <Label className="text-xs">Art</Label>
              <select className={auswahl} value={wert.garageArt} onChange={(e) => setze({ garageArt: e.target.value as GaragenArt })}>
                <option value="garage">Garage</option>
                <option value="stellplatz">Stellplatz</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Vermietet</Label>
              <select className={auswahl} value={wert.garageStatus} onChange={(e) => setze({ garageStatus: e.target.value as GaragenStatus })}>
                {(Object.keys(GARAGEN_STATUS_TEXT) as GaragenStatus[]).map((s) => <option key={s} value={s}>{GARAGEN_STATUS_TEXT[s]}</option>)}
              </select>
            </div>
            {wert.garageStatus !== "frei" && <Feld label="Ist-Miete Garage (€)" typ="zahl" wert={wert.garageIstMiete} onChange={(v) => setze({ garageIstMiete: v })} />}
          </div>
        </div>
      </div>
    </details>
  );
}

export function ObjektObjektdatenFelder({ wert, onChange }: { wert: ObjektFormDaten; onChange: (neu: ObjektFormDaten) => void }) {
  const setze = (teil: Partial<ObjektFormDaten>) => onChange({ ...wert, ...teil });
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Mietsubvention</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Art</Label>
            <select className={auswahl} value={wert.subventionArt} onChange={(e) => setze({ subventionArt: e.target.value as ObjektFormDaten["subventionArt"] })}>
              <option value="">keine</option>
              <option value="ziel">auf Zielmiete je m²</option>
              <option value="steigerung">Steigerung in %</option>
              <option value="einmal">Einmalbetrag fürs Objekt</option>
            </select>
          </div>
          {wert.subventionArt === "ziel" && <Feld label="Zielmiete (€/m²)" typ="zahl" wert={wert.zielQm} onChange={(v) => setze({ zielQm: v })} platzhalter="13,50" />}
          {wert.subventionArt === "steigerung" && <Feld label="Steigerung (%)" typ="zahl" wert={wert.steigerungProzent} onChange={(v) => setze({ steigerungProzent: v })} />}
          {wert.subventionArt === "einmal" && <Feld label="Einmalbetrag (€)" typ="zahl" wert={wert.einmalBetrag} onChange={(v) => setze({ einmalBetrag: v })} />}
          {wert.subventionArt && wert.subventionArt !== "einmal" && <>
            <Feld label="Laufzeit (Monate)" typ="zahl" wert={wert.laufzeitMonate} onChange={(v) => setze({ laufzeitMonate: v })} platzhalter="36" />
            <Feld label="Garage angerechnet (€)" typ="zahl" wert={wert.garageAnrechnung} onChange={(v) => setze({ garageAnrechnung: v })} platzhalter="100" />
            <Feld label="Garagen-Subvention (Monate)" typ="zahl" wert={wert.garagenSubventionMonate} onChange={(v) => setze({ garagenSubventionMonate: v })} platzhalter="12" />
          </>}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Mieterhöhung und Verkauf</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Feld label="Ortsübliche Vergleichsmiete (€/m²)" typ="zahl" wert={wert.vergleichsmieteQm} onChange={(v) => setze({ vergleichsmieteQm: v })} hinweis="Mietspiegel; Obergrenze jeder Erhöhung" />
          <Feld label="Kappungsgrenze (%)" typ="zahl" wert={wert.kappungsgrenzeProzent} onChange={(v) => setze({ kappungsgrenzeProzent: v })} hinweis="Leer: 20 %, Berlin 15 %" />
          <Feld label="Reservierung gilt (Tage)" typ="zahl" wert={wert.reservierungTage} onChange={(v) => setze({ reservierungTage: v })} hinweis="Leer: keine Ablauffrist" />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Kalkulation (Ankauf, Kosten, Provision), Meilensteine der Aufteilung und Wirtschaftsplan pflegst du nach dem Speichern in Objektdaten, Einheitenliste.</p>
    </div>
  );
}
