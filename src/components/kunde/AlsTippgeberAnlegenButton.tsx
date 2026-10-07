import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UserPlus, Gift, Handshake, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { cacheGet } from "@/lib/dataCache";
import { createProgramm, getProgrammByInvestment, updateProgramm } from "@/lib/empfehlungenStore";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";

interface Props {
  kunde: any;
  investments: any[];
  currentUser: { id?: string; name?: string; role?: string } | null;
  onChanged?: () => void;
}

/**
 * Action button for converting a contact into a Tippgeber OR unlocking the
 * Empfehlungsprogramm (referral program) inside the customer portal.
 *
 * Visibility rules:
 *  - Hidden for finanzierer / non-privileged roles
 *  - Hidden if contact already fully converted to Tippgeber
 *  - Hidden if contact has an active investment AND the
 *    Empfehlungsprogramm is already unlocked (dual state already established)
 */
export function AlsTippgeberAnlegenButton({ kunde, investments, currentUser, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const rowMeta = useMemo(
    () => (cacheGet("kontakte").find((r: any) => r.id === kunde?.id)?.meta) || {},
    [kunde?.id, open]
  );

  const hasInvestment = (investments?.length || 0) > 0;
  const istTippgeber = !!rowMeta.konvertiert_zu_tippgeber || !!rowMeta.tippgeberId;

  const [scenario, setScenario] = useState<"A" | "B">(hasInvestment ? "A" : "B");
  // Tippgeber form (Szenario B)
  const [provTyp, setProvTyp] = useState<"fest" | "prozent">("fest");
  const [provWert, setProvWert] = useState("250");
  const [notizen, setNotizen] = useState("");

  const allowedRoles = ["admin", "inhaber", "vp", "setter"];
  if (!currentUser?.role || !allowedRoles.includes(currentUser.role)) return null;
  if (istTippgeber) {
    return (
      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-300">
        🤝 Tippgeber
      </Badge>
    );
  }
  // Kontakte mit Investment: Das Empfehlungsprogramm pflegen die Knoepfe
  // EmpfehlungsprogrammKnoepfe bei den Stammdaten, einmal fuer alle
  // Investments. Der Tippgeber-Weg hier gilt nur ohne Investment.
  if (hasInvestment) return null;

  const openDialog = () => {
    setScenario(hasInvestment ? "A" : "B");
    setOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (scenario === "A") {
        // Empfehlungsprogramm freischalten
        const { error } = await (supabase as any).rpc("merge_kontakt_meta", {
          _kontakt_id: kunde.id,
          _updates: { empfehlungsprogramm_aktiv: true, empfehlungsprogramm_aktiv_am: new Date().toISOString() },
        });
        if (error) throw error;

        // Pro Investment ein Default-Programm anlegen, falls noch keins existiert
        const beraterName = kunde.berater || "";
        const kontaktName = `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim();
        for (const inv of investments) {
          const vorhanden = getProgrammByInvestment(inv.id);
          if (vorhanden) {
            // Nach einer frueheren Deaktivierung wieder oeffnen statt doppelt anlegen.
            if (!vorhanden.freigeschaltet) updateProgramm(vorhanden.id, { freigeschaltet: true });
            continue;
          }
          createProgramm({
            investmentId: inv.id,
            kontaktId: kunde.id,
            kontaktName,
            beraterName,
            provisionsTyp: "fest",
            provisionsBetrag: 250,
            provisionsText: "250 € pro erfolgreich vermittelten Abschluss",
            bedingungen: "Empfehlung führt zu unterschriebenem Notarvertrag.",
            freigeschaltet: true,
          });
        }
        toast.success("Empfehlungsprogramm freigeschaltet – im Kundenportal sichtbar.");
      } else {
        // Szenario B: Als reinen Tippgeber anlegen
        if (!kunde.email?.trim()) {
          toast.error("Kontakt benötigt eine E-Mail-Adresse für den Tippgeber-Zugang.");
          setSaving(false);
          return;
        }
        if (!provWert.trim()) {
          toast.error("Bitte Provisionswert angeben.");
          setSaving(false);
          return;
        }

        const { data: insertedRow, error: insErr } = await (supabase as any)
          .from("tippgeber")
          .insert({
            vorname: kunde.vorname || "",
            nachname: kunde.nachname || "",
            email: kunde.email.trim(),
            telefon: kunde.telefon || null,
            strasse: kunde.strasse || null,
            hausnummer: kunde.hausnummer || null,
            plz: kunde.plz || null,
            ort: kunde.ort || null,
            land: "Deutschland",
            zugeordnet_id: currentUser?.id || null,
            zugeordnet_name: currentUser?.name || kunde.berater || "",
            provisionstyp: provTyp,
            provisionswert: provWert.trim(),
            notizen: notizen.trim() || null,
            benutzer_id: null,
            meta: { source_kontakt_id: kunde.id },
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

        // Kontakt-Meta markieren + archivieren
        await (supabase as any).rpc("merge_kontakt_meta", {
          _kontakt_id: kunde.id,
          _updates: {
            konvertiert_zu_tippgeber: true,
            konvertiert_zu_tippgeber_am: new Date().toISOString(),
            tippgeberId: insertedRow?.id,
          },
        });
        await (supabase as any).from("kontakte").update({ archiviert: true }).eq("id", kunde.id);

        toast.success("Tippgeber angelegt – Einladung wird versendet…");

        // Einladung im Hintergrund
        supabase.functions
          .invoke("invite-user", {
            body: {
              email: kunde.email.trim(),
              name: `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim(),
              role: "tippgeber",
              vorname: kunde.vorname || "",
              nachname: kunde.nachname || "",
              telefon: kunde.telefon || undefined,
              tippgeberId: insertedRow?.id,
            },
          })
          .then(async ({ error: invErr }) => {
            // Der Grund der Function (etwa eine Ablehnung) statt "non-2xx status code".
            const grund = invErr ? await edgeFehlerMitGrund(invErr, { functionName: "invite-user" }) as Error : null;
            if (grund) toast.error("Einladung fehlgeschlagen: " + (grund.message || String(grund)));
            else toast.success("Einladung an " + kunde.email + " verschickt.");
          })
          .catch((e: any) => toast.error("Einladung fehlgeschlagen: " + (e?.message || String(e))));
      }

      setOpen(false);
      onChanged?.();
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={openDialog}
              className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
            >
              <UserPlus className="h-3 w-3 mr-1" /> Als Tippgeber anlegen
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm text-xs leading-relaxed">
            Aktiviere für diesen Kontakt entweder das <b>Empfehlungsprogramm</b>
            {" "}(wenn er Kunde bleibt und parallel Personen empfehlen darf – sichtbar im Kundenportal)
            {" "}oder lege ihn als <b>reinen Tippgeber</b> an (wenn er selbst nicht investiert,
            aber Leads liefert – mit eigenem Tippgeber-Portal-Zugang). Beide Wege können später kombiniert werden.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kontakt als Tippgeber / Empfehlungsgeber einrichten</DialogTitle>
            <DialogDescription>
              Wähle, wie dieser Kontakt weitere Personen ins System bringen soll.
              Vorgeschlagen ist das passende Szenario auf Basis seines Investment-Status.
            </DialogDescription>
          </DialogHeader>

          <RadioGroup value={scenario} onValueChange={(v) => setScenario(v as "A" | "B")} className="space-y-3">
            {/* Szenario A */}
            <label
              className={cn(
                "flex gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                scenario === "A" ? "border-amber-500 bg-amber-500/5" : "hover:bg-muted/40"
              )}
            >
              <RadioGroupItem value="A" id="scen-a" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Gift className="h-4 w-4 text-amber-600" />
                  Empfehlungsprogramm freischalten (Kunde bleibt Kunde)
                  {hasInvestment && <Badge variant="secondary" className="text-[10px]">Empfohlen</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Der Kontakt behält seinen Kundenstatus und sieht im Kundenportal eine Sektion,
                  über die er Personen empfehlen kann. Pro aktivem Investment wird automatisch
                  ein Standard-Programm angelegt (250&nbsp;€ pro Abschluss), das du jederzeit anpassen kannst.
                </p>
                {!hasInvestment && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    Aktuell ist kein Investment hinterlegt – das Programm wird leer angelegt und greift erst, sobald ein Investment existiert.
                  </p>
                )}
              </div>
            </label>

            {/* Szenario B */}
            <label
              className={cn(
                "flex gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                scenario === "B" ? "border-cyan-500 bg-cyan-500/5" : "hover:bg-muted/40"
              )}
            >
              <RadioGroupItem value="B" id="scen-b" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Handshake className="h-4 w-4 text-cyan-600" />
                  Als reinen Tippgeber anlegen
                  {!hasInvestment && <Badge variant="secondary" className="text-[10px]">Empfohlen</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Der Kontakt wird aus der aktiven Pipeline genommen (bleibt in „Alle Kontakte" sichtbar)
                  und erhält einen eigenen Tippgeber-Portal-Zugang per E-Mail-Einladung.
                  Sinnvoll, wenn er selbst nicht investiert, aber Leads liefern möchte.
                </p>
              </div>
            </label>
          </RadioGroup>

          {scenario === "B" && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Provisionsmodell</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Typ</Label>
                  <Select value={provTyp} onValueChange={(v) => setProvTyp(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fest">Festbetrag (€)</SelectItem>
                      <SelectItem value="prozent">Prozent (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Wert</Label>
                  <Input value={provWert} onChange={(e) => setProvWert(e.target.value)} placeholder={provTyp === "fest" ? "250" : "1"} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notizen (optional)</Label>
                <Textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} rows={2} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Daten (Name, E-Mail, Telefon, Adresse) werden vom Kontakt übernommen und können später im Tippgeber-Bereich angepasst werden.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Abbrechen</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Speichern…" : scenario === "A" ? "Empfehlungsprogramm freischalten" : "Tippgeber anlegen & einladen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}