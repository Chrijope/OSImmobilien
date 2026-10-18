import { useState, type ReactNode } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  beschreibungErstellen,
  MAX_ARGUMENT,
  MAX_KURZBESCHREIBUNG,
  MAX_WIZARD_STANDORTARGUMENTE,
  standortargumenteErstellen,
  type WizardTexteEingabe,
} from "@/lib/objektWizardTexte";

/*
 * Beschreibung und Standortargumente im Wizard „Neues Objekt“ (Inhaber,
 * 18.10.2026). Beides lässt sich per KI vorschlagen und danach frei ändern.
 */

function Hinweise({ liste }: { liste: string[] }) {
  if (!liste.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400" data-testid="ki-hinweise">
      {liste.map((h) => <li key={h}>{h}</li>)}
    </ul>
  );
}

function KiKnopf({ laeuft, schonDa, onClick, disabled, text }: { laeuft: boolean; schonDa: boolean; onClick: () => void; disabled?: boolean; text?: string }) {
  return (
    <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onClick} disabled={laeuft || disabled}>
      {laeuft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {laeuft ? (text ?? "KI schreibt…") : schonDa ? "Neu erstellen" : "Mit KI erstellen"}
    </Button>
  );
}

const ohneAdresse = (a: WizardTexteEingabe) => !a.adresse?.trim() && !a.ort?.trim();

export function BeschreibungFeld({ wert, onChange, ki, hinweis }: {
  wert: string;
  onChange: (wert: string) => void;
  /** Ohne `ki` gibt es keinen Knopf, etwa in Schritt 2, wo Einheiten und Bilder noch fehlen. */
  ki?: { angaben: () => WizardTexteEingabe; bildUrls: () => string[] };
  hinweis?: ReactNode;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [hinweise, setHinweise] = useState<string[]>([]);
  const zuLang = wert.length > MAX_KURZBESCHREIBUNG;

  const erstellen = async () => {
    if (!ki) return;
    const angaben = ki.angaben();
    if (ohneAdresse(angaben)) {
      toast({ title: "Adresse fehlt", description: "Bitte zuerst Adresse und Ort in den Basisdaten eintragen.", variant: "destructive" });
      return;
    }
    if (wert.trim() && !window.confirm("Die vorhandene Beschreibung wird ersetzt. Fortfahren?")) return;
    setLaeuft(true);
    try {
      const e = await beschreibungErstellen(angaben, ki.bildUrls());
      onChange(e.beschreibung);
      setHinweise(e.hinweise);
      toast({ title: "Beschreibung erstellt", description: e.bilder ? `${e.bilder} Bilder ausgewertet. Bitte lesen und bei Bedarf anpassen.` : "Ohne Bilder erstellt. Bitte lesen und bei Bedarf anpassen." });
    } catch (f) {
      toast({ title: "Beschreibung nicht erstellt", description: f instanceof Error ? f.message : String(f), variant: "destructive" });
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div data-testid="beschreibung-feld">
      <div className="flex items-center justify-between gap-2 mb-1">
        <Label className="text-xs" htmlFor={ki ? "beschreibung-ki" : "beschreibung"}>Beschreibung *</Label>
        {ki && <KiKnopf laeuft={laeuft} schonDa={!!wert.trim()} onClick={erstellen} text="Wertet Bilder und Angaben aus…" />}
      </div>
      <Textarea id={ki ? "beschreibung-ki" : "beschreibung"} value={wert} maxLength={MAX_KURZBESCHREIBUNG} onChange={(e) => onChange(e.target.value)} rows={ki ? 8 : 4} />
      <div className="mt-1 flex items-start justify-between gap-3 text-[11px] text-muted-foreground">
        <span>{hinweis}</span>
        <span className={zuLang ? "shrink-0 font-semibold text-destructive" : "shrink-0"}>{wert.length} von {MAX_KURZBESCHREIBUNG} Zeichen</span>
      </div>
      <Hinweise liste={hinweise} />
    </div>
  );
}

export function StandortargumenteFeld({ werte, onChange, angaben }: {
  werte: string[];
  onChange: (werte: string[]) => void;
  /** Ohne `angaben` gibt es keinen KI-Knopf (Rolle ohne Objektpflege). */
  angaben?: () => WizardTexteEingabe;
}) {
  const [neu, setNeu] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [hinweise, setHinweise] = useState<string[]>([]);
  const voll = werte.length >= MAX_WIZARD_STANDORTARGUMENTE;

  const erstellen = async () => {
    if (!angaben) return;
    const a = angaben();
    if (ohneAdresse(a)) {
      toast({ title: "Adresse fehlt", description: "Bitte zuerst Adresse und Ort eintragen.", variant: "destructive" });
      return;
    }
    if (werte.length && !window.confirm("Die vorhandenen Standortargumente werden ersetzt. Fortfahren?")) return;
    setLaeuft(true);
    try {
      const e = await standortargumenteErstellen(a);
      onChange(e.standortargumente);
      setHinweise(e.hinweise);
    } catch (f) {
      toast({ title: "Standortargumente nicht erstellt", description: f instanceof Error ? f.message : String(f), variant: "destructive" });
    } finally {
      setLaeuft(false);
    }
  };

  const hinzufuegen = () => {
    const t = neu.trim();
    if (!t || voll) return;
    onChange([...werte, t]);
    setNeu("");
  };

  return (
    <div data-testid="standortargumente-feld">
      <div className="flex items-center justify-between gap-2 mb-1">
        <Label className="text-xs font-semibold">
          Standortargumente <span className="text-muted-foreground font-normal">({werte.length}/{MAX_WIZARD_STANDORTARGUMENTE})</span>
        </Label>
        {angaben && <KiKnopf laeuft={laeuft} schonDa={werte.length > 0} onClick={erstellen} />}
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">
        Warum sich der Standort für Kapitalanleger lohnt: Mikro- und Makrolage, Arbeitgeber, Anbindung, Infrastruktur. Die KI leitet sie aus der Adresse ab. Erscheinen auf Objektseite und im Exposé.
      </p>
      <div className="space-y-1.5">
        {werte.map((a, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              value={a}
              maxLength={MAX_ARGUMENT}
              aria-label={`Standortargument ${i + 1}`}
              onChange={(e) => onChange(werte.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => { if (!a.trim()) onChange(werte.filter((_, j) => j !== i)); }}
              className="h-8 text-xs"
            />
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" aria-label={`Standortargument ${i + 1} entfernen`}
              onClick={() => onChange(werte.filter((_, j) => j !== i))}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      {!voll ? (
        <div className="mt-1.5 flex gap-2">
          <Input value={neu} maxLength={MAX_ARGUMENT} onChange={(e) => setNeu(e.target.value)} placeholder="Neues Standortargument…" className="h-[40px] text-xs sm:h-8"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); hinzufuegen(); } }} />
          <Button type="button" size="sm" className="h-[40px] min-w-[40px] sm:h-8 sm:min-w-0" onClick={hinzufuegen} aria-label="Standortargument hinzufügen">+</Button>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Höchstens {MAX_WIZARD_STANDORTARGUMENTE} Standortargumente.</p>
      )}
      <Hinweise liste={hinweise} />
    </div>
  );
}
