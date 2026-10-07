import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cacheRefreshTable } from "@/lib/dataCache";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { kundenSprache } from "@/lib/kundenSprache";
import { KundenspracheHinweis } from "@/components/kunden/KundenspracheHinweis";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kontaktId: string;
  vorname: string;
  nachname: string;
  email?: string;
  onSuccess?: () => void;
}

/**
 * DSGVO Art. 17 Sofortlöschung — unwiderruflich.
 * Pflichtfelder: Bestätigung, Grund-Referenz, Namens-Eingabe.
 * Ruft RPC dsgvo_hard_delete_kontakt + Bestätigungs-Mail an Kunde.
 */
export function DsgvoHardDeleteDialog({
  open, onOpenChange, kontaktId, vorname, nachname, email, onSuccess,
}: Props) {
  const { toast } = useToast();
  const [grund, setGrund] = useState("");
  const [loading, setLoading] = useState(false);

  const fullName = `${vorname} ${nachname}`.trim();
  const canDelete = grund.trim().length >= 3;

  const reset = () => {
    setGrund("");
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setLoading(true);
    // Die Kundensprache jetzt lesen: Nach der Löschung gibt es den Kontakt
    // nicht mehr, und der Server könnte sie nicht mehr ermitteln.
    const sprache = kundenSprache(kontaktId);
    try {
      // 1) Storage purgen + Audit-Eintrag (vor dem DB-Hard-Delete,
      // solange der Kontakt noch existiert und gehasht werden kann).
      try {
        const { error: cleanupErr } = await supabase.functions.invoke(
          "dsgvo-storage-cleanup",
          { body: { kontakt_id: kontaktId, grund_referenz: grund.trim() } },
        );
        if (cleanupErr) {
          console.warn("[dsgvo-storage-cleanup] non-fatal:", cleanupErr.message);
        }
      } catch (e) {
        console.warn("[dsgvo-storage-cleanup] non-fatal:", e);
      }

      // 2) Datenbank-Hard-Delete
      const { data, error } = await supabase.functions.invoke("dsgvo-hard-delete", {
        body: { kontaktId, reason: grund.trim(), triggeredBy: "admin-direct" },
      });
      if (error) throw error;
      if (data && data.ok === false && Array.isArray(data.errors) && data.errors.length > 0) {
        console.warn("dsgvo-hard-delete partial errors:", data.errors);
      }

      // Bestätigungs-Mail an Kunde (best effort, fire-and-forget — UI nicht blockieren)
      if (email) {
        supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "dsgvo-deletion-confirmation",
            recipientEmail: email,
            idempotencyKey: `dsgvo-hard-${kontaktId}`,
            sprache,
            templateData: { name: fullName },
          },
        }).catch(() => { /* mail ist best effort */ });
      }

      // Cache sofort aktualisieren, damit Kontakt aus allen Listen verschwindet
      cacheRefreshTable("kontakte").catch(() => {});

      toast({
        title: "Endgültig gelöscht (DSGVO)",
        description: `${fullName} und alle verknüpften Daten wurden unwiderruflich entfernt.`,
      });
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({
        title: "Löschung fehlgeschlagen",
        description: e?.message || "Bitte erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            DSGVO Art. 17 — Sofortlöschung
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                <strong>{fullName}</strong> wird unwiderruflich aus der gesamten
                Datenbank entfernt — inklusive aller Personen, Investments,
                Notizen, Aufgaben, Aktivitäten, Follow-Ups, Tokens und Dokumente.
              </p>
              <p className="text-destructive font-medium">
                Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="dsgvo-grund" className="text-sm mb-1 block">
              Grund der Löschung *
            </Label>
            <Textarea
              id="dsgvo-grund"
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              placeholder="z. B. Kunde hat Löschung per E-Mail vom 12.05.2026 verlangt"
              rows={3}
            />
          </div>
        </div>

        <AlertDialogFooter>
          {/* Die Löschbestätigung an den Kunden folgt seiner Sprache. */}
          {email && <KundenspracheHinweis kontaktId={kontaktId} className="self-center sm:mr-auto" />}
          <AlertDialogCancel disabled={loading}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleDelete(); }}
            disabled={!canDelete || loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Lösche…" : "DSGVO-Sofortlöschung"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}