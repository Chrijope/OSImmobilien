import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { updateProgramm, type EmpfehlungsProgramm } from "@/lib/empfehlungenStore";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";

interface Props {
  programm: EmpfehlungsProgramm | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EmpfehlungsprogrammEditDialog({ programm, open, onOpenChange, onSaved }: Props) {
  const [provisionsTyp, setProvisionsTyp] = useState<"fest" | "prozent">("fest");
  const [provisionsBetrag, setProvisionsBetrag] = useState<string>("");
  const [provisionsText, setProvisionsText] = useState("");
  const [bedingungen, setBedingungen] = useState("");

  useEffect(() => {
    if (programm && open) {
      setProvisionsTyp(programm.provisionsTyp);
      setProvisionsBetrag(String(programm.provisionsBetrag || ""));
      setProvisionsText(programm.provisionsText || "");
      setBedingungen(programm.bedingungen || "");
    }
  }, [programm, open]);

  const handleSave = () => {
    if (!programm) return;
    const betrag = parseFloat(provisionsBetrag);
    if (!betrag || !provisionsText.trim()) {
      toast({ title: "Bitte Provisionshöhe und Beschreibung angeben", variant: "destructive" });
      return;
    }
    updateProgramm(programm.id, {
      provisionsTyp,
      provisionsBetrag: betrag,
      provisionsText: provisionsText.trim(),
      bedingungen: bedingungen.trim(),
    });
    toast({ title: "Empfehlungsprogramm aktualisiert ✓", description: "Die Änderungen sind im Kundenportal sofort sichtbar." });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Empfehlungsprogramm bearbeiten</DialogTitle>
          <DialogDescription>
            Änderungen werden dem Kunden sofort im Kundenportal angezeigt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-semibold">Provisionstyp</Label>
            <Select
              value={provisionsTyp}
              onValueChange={(v) => {
                const next = v as "fest" | "prozent";
                setProvisionsTyp(next);
                // Betrag leeren, damit der alte Wert (z.B. 500 €) nicht versehentlich als 500 %
                // gespeichert wird und der Nutzer aktiv den neuen Wert eintippen muss.
                setProvisionsBetrag("");
              }}
            >
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="fest">Festpreis (€)</SelectItem>
                <SelectItem value="prozent">Prozentsatz (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold">
              Provisionshöhe {provisionsTyp === "prozent" ? "(%)" : "(€)"}
            </Label>
            <Input
              type="number"
              value={provisionsBetrag}
              onChange={(e) => setProvisionsBetrag(e.target.value)}
              placeholder={provisionsTyp === "prozent" ? "z.B. 2" : "z.B. 500"}
              step={provisionsTyp === "prozent" ? "0.1" : "1"}
              min={0}
              className="h-9 mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {provisionsTyp === "prozent"
                ? "Angabe in % vom Kaufpreis – z.B. 2 für 2%"
                : "Angabe als fester Eurobetrag – z.B. 500 für 500€"}
            </p>
          </div>

          <div>
            <Label className="text-xs font-semibold">Beschreibung für den Kunden</Label>
            <Textarea
              value={provisionsText}
              onChange={(e) => setProvisionsText(e.target.value)}
              placeholder="z.B. Für jede erfolgreiche Empfehlung erhältst du 500€ Tippgeberprovision nach Notartermin."
              className="text-sm mt-1"
              rows={3}
            />
          </div>

          <div>
            <Label className="text-xs font-semibold">Bedingungen (optional)</Label>
            <Input
              value={bedingungen}
              onChange={(e) => setBedingungen(e.target.value)}
              placeholder="z.B. Auszahlung nach Notartermin des Empfohlenen"
              className="h-9 mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} className="gap-1.5">
            <Save className="h-4 w-4" /> Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
