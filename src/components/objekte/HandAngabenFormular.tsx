import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import {
  HEIZUNGSARTEN, MABV_VORLAGE, MIETARTEN, STELLPLATZARTEN,
  type HandAngaben, type MabvRate,
} from "../../../supabase/functions/_shared/hand-angaben";

const OHNE = "__ohne__";
const FREITEXTE = 4;

/** Zahl aus einem Eingabefeld, Komma erlaubt; leer heißt nicht gepflegt. */
function zahlAus(text: string): number | undefined {
  const n = Number(text.replace(",", "."));
  return text.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
}

function Auswahl({ label, wert, optionen, onChange }: { label: string; wert?: string; optionen: ReadonlyArray<readonly [string, string]>; onChange: (v?: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={wert || OHNE} onValueChange={(v) => onChange(v === OHNE ? undefined : v)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={OHNE} className="text-xs">Keine Angabe</SelectItem>
          {optionen.map(([k, t]) => <SelectItem key={k} value={k} className="text-xs">{t}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Die Angaben, die es bisher nur aus Investagon gab (30.10.2026). Am Objekt
 * alles, an der Einheit nur Merkmale und Freitexte, denn die unterscheiden
 * sich je Wohnung (Investagon „Tags“ und „Extra 1–4“). Gespeichert in
 * `meta.angaben`, gelesen über `rohdaten` (Hand vor Investagon).
 */
export function HandAngabenFormular({ wert, onChange, ebene, denkmal = false }: {
  wert: HandAngaben;
  onChange: (neu: HandAngaben) => void;
  ebene: "objekt" | "einheit";
  /** Bauzustand „Denkmal“: nur dann die Felder der Denkmal-AfA (Christian, 30.10.2026). */
  denkmal?: boolean;
}) {
  const setze = <K extends keyof HandAngaben>(k: K, v: HandAngaben[K]) => onChange({ ...wert, [k]: v });
  const freitexte = Array.from({ length: FREITEXTE }, (_, i) => wert.freitexte?.[i] ?? "");
  const raten = wert.mabvRaten ?? [];
  const setzeRate = (i: number, rate: Partial<MabvRate>) =>
    setze("mabvRaten", raten.map((r, j) => (j === i ? { ...r, ...rate } : r)));

  return (
    <div className="space-y-4" data-testid={`hand-angaben-${ebene}`}>
      <div>
        <Label className="text-xs">Merkmale <span className="text-muted-foreground font-normal">(eine Zeile je Merkmal, gern „Bezeichnung: Wert“, z. B. „Aufzug: Ja“)</span></Label>
        <Textarea rows={3} value={(wert.merkmale ?? []).join("\n")}
          onChange={(e) => setze("merkmale", e.target.value ? e.target.value.split("\n") : undefined)}
          placeholder={"Erhöhte AfA\nMietsubvention\nGarage inklusive"} />
        <p className="text-bildunterschrift text-muted-foreground mt-0.5">Erscheinen als Merkmale im Exposé; „Aufzug“ und „360°-Verwaltung“ werden erkannt.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {freitexte.map((t, i) => (
          <div key={i}>
            <Label className="text-xs">Freitext {i + 1}</Label>
            <Textarea rows={2} value={t} onChange={(e) => {
              const neu = [...freitexte];
              neu[i] = e.target.value;
              setze("freitexte", neu.some((x) => x.trim()) ? neu : undefined);
            }} />
          </div>
        ))}
      </div>
      {ebene === "einheit" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Miteigentumsanteil (%)</Label>
            <Input className="h-8" inputMode="decimal" defaultValue={wert.miteigentumsanteil ?? ""} placeholder="z. B. 2,345"
              onBlur={(e) => setze("miteigentumsanteil", zahlAus(e.target.value))} />
            <p className="text-bildunterschrift text-muted-foreground mt-0.5">In Prozent, wie in Kaufpreisliste und Exposé.</p>
          </div>
        </div>
      )}
      {ebene === "objekt" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Auswahl label="Heizungsart" wert={wert.heizung} optionen={HEIZUNGSARTEN} onChange={(v) => setze("heizung", v)} />
            <Auswahl label="Stellplatz" wert={wert.stellplatzArt} optionen={STELLPLATZARTEN.map((s) => [s, s] as const)} onChange={(v) => setze("stellplatzArt", v)} />
            <Auswahl label="Mietart" wert={wert.mietArt} optionen={MIETARTEN.map((s) => [s, s] as const)} onChange={(v) => setze("mietArt", v)} />
            <div>
              <Label className="text-xs">Virtueller Rundgang (Link)</Label>
              <Input className="h-8" value={wert.rundgangUrl ?? ""} placeholder="https://…" onChange={(e) => setze("rundgangUrl", e.target.value.trim() || undefined)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!!wert.degressiveAfa} onCheckedChange={(v) => setze("degressiveAfa", v || undefined)} />
            <Label className="text-xs">Degressive AfA erlauben <span className="text-muted-foreground font-normal">(aus: linear)</span></Label>
          </div>
          {denkmal && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end" data-testid="denkmal-afa">
            <div>
              <Label className="text-xs">Denkmal-Anteil (%)</Label>
              <Input className="h-8" inputMode="decimal" defaultValue={wert.denkmalAnteil ?? ""} onBlur={(e) => setze("denkmalAnteil", zahlAus(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Denkmal-AfA Jahre 1–8 (%)</Label>
              <Input className="h-8" inputMode="decimal" defaultValue={wert.denkmalAfaJahre1bis8 ?? ""} onBlur={(e) => setze("denkmalAfaJahre1bis8", zahlAus(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Denkmal-AfA Jahre 9–12 (%)</Label>
              <Input className="h-8" inputMode="decimal" defaultValue={wert.denkmalAfaJahre9bis12 ?? ""} onBlur={(e) => setze("denkmalAfaJahre9bis12", zahlAus(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Beginn Denkmal-AfA</Label>
              <DateInput value={wert.denkmalAfaBeginn ?? ""} onChange={(v) => setze("denkmalAfaBeginn", v || undefined)} />
            </div>
          </div>
          )}
          <div className="space-y-2" data-testid="mabv-raten">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Kaufpreisraten nach MaBV {raten.length > 0 && <span className="text-muted-foreground font-normal">(Summe {raten.reduce((s, r) => s + (r.prozent || 0), 0).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %)</span>}</Label>
              <div className="flex gap-2">
                {raten.length === 0 && (
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setze("mabvRaten", MABV_VORLAGE.map((r) => ({ ...r })))}>Raten nach § 3 MaBV übernehmen</Button>
                )}
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setze("mabvRaten", [...raten, { bezeichnung: "", prozent: 0 }])}>
                  <Plus className="h-3 w-3 mr-1" /> Rate
                </Button>
              </div>
            </div>
            {raten.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="h-8 flex-1" value={r.bezeichnung} aria-label={`Rate ${i + 1} Bezeichnung`} onChange={(e) => setzeRate(i, { bezeichnung: e.target.value })} />
                <Input className="h-8 w-24" inputMode="decimal" aria-label={`Rate ${i + 1} Prozent`} defaultValue={r.prozent || ""} onBlur={(e) => setzeRate(i, { prozent: zahlAus(e.target.value) ?? 0 })} />
                <span className="text-xs text-muted-foreground">%</span>
                <button type="button" aria-label={`Rate ${i + 1} entfernen`} className="text-muted-foreground hover:text-foreground"
                  onClick={() => { const neu = raten.filter((_, j) => j !== i); setze("mabvRaten", neu.length ? neu : undefined); }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
