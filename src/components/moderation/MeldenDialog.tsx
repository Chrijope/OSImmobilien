import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag } from "lucide-react";
import { createMeldung } from "@/lib/moderationStore";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";

interface MeldenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  typ: "chat_nachricht" | "profil";
  referenzId: string;
  referenzLabel?: string;
}

const GRUENDE = [
  "Beleidigung / Respektlosigkeit",
  "Spam / Werbung",
  "Unangemessener Inhalt",
  "Falsche Informationen",
  "Belästigung",
  "Sonstiges",
];

export default function MeldenDialog({ open, onOpenChange, typ, referenzId, referenzLabel }: MeldenDialogProps) {
  const { authUser } = useUser();
  const [grund, setGrund] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!grund) {
      toast.error("Bitte wähle einen Grund aus.");
      return;
    }
    if (!authUser?.id) return;
    setLoading(true);
    try {
      await createMeldung({
        melder_id: authUser.id,
        typ,
        referenz_id: referenzId,
        grund,
        beschreibung: beschreibung || undefined,
      });
      toast.success("Meldung wurde erfolgreich eingereicht. Die Administratoren werden informiert.");
      onOpenChange(false);
      setGrund("");
      setBeschreibung("");
    } catch (err: any) {
      toast.error("Fehler beim Einreichen: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Inhalt melden
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {referenzLabel && (
            <p className="text-sm text-muted-foreground">
              Du meldest: <strong>{referenzLabel}</strong>
            </p>
          )}
          <div className="space-y-2">
            <Label>Grund der Meldung *</Label>
            <Select value={grund} onValueChange={setGrund}>
              <SelectTrigger>
                <SelectValue placeholder="Grund auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {GRUENDE.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Beschreibung (optional)</Label>
            <Textarea
              placeholder="Beschreibe den Verstoß genauer..."
              value={beschreibung}
              onChange={e => setBeschreibung(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={handleSubmit} disabled={loading} variant="destructive">
              {loading ? "Wird gesendet..." : "Meldung einreichen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
