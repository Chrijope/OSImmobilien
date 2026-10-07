import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cacheGet } from "@/lib/dataCache";
import { addAktivitaet } from "@/lib/aktivitaetenStore";
import { notifyKundeEmpfehlungsprogramm } from "@/lib/bellNotifications";
import {
  createProgramm, getProgrammByInvestment, updateProgramm,
  type EmpfehlungsProgramm,
} from "@/lib/empfehlungenStore";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";

/**
 * Die gemeinsamen Dialoge des Empfehlungsprogramms: Einstell-Dialog
 * (Freischalten und Bearbeiten in einem Formular) und die Rueckfrage vor dem
 * Deaktivieren. Genutzt vom Kundenprofil (EmpfehlungsprogrammKnoepfe) und von
 * der Empfehlungen-Seite, damit die Speicherlogik nur einmal gepflegt wird.
 *
 * Unter der Haube haengen die Programme weiter an den Investments, davon
 * leben Kundenportal, Empfehlungseingang und Abrechnung. Diese Dialoge
 * schreiben dieselben Konditionen in alle Programme des Kunden und behandeln
 * sie als eines. Zusaetzlich steht der Gesamtzustand in
 * meta.empfehlungsprogramm_aktiv des Kontakts.
 */

export type EmpfehlungsprogrammDialogArt = "einstellen" | "deaktivieren";

interface Props {
  kunde: any;
  investments: any[];
  currentUser: { id?: string; name?: string; role?: string } | null;
  /** Welcher Dialog offen ist; null bedeutet beide geschlossen. */
  offen: EmpfehlungsprogrammDialogArt | null;
  onSchliessen: () => void;
  onChanged?: () => void;
}

interface FormWerte {
  typ: "fest" | "prozent";
  betrag: string;
  text: string;
  bedingungen: string;
}

export function EmpfehlungsprogrammDialoge({ kunde, investments, currentUser, offen, onSchliessen, onChanged }: Props) {
  const [speichert, setSpeichert] = useState(false);
  const [form, setForm] = useState<FormWerte>({ typ: "fest", betrag: "", text: "", bedingungen: "" });

  const aktiv = !!(cacheGet("kontakte").find((r: any) => r.id === kunde?.id)?.meta?.empfehlungsprogramm_aktiv);

  // Bewusst ohne useMemo: kleine Listen, und so ist der Stand bei jedem
  // Oeffnen garantiert frisch aus dem Cache.
  const programme = investments.map((inv) => getProgrammByInvestment(inv.id)).filter(Boolean) as EmpfehlungsProgramm[];
  const leitProgramm = programme[0] ?? null;

  // Beim Oeffnen des Einstell-Dialogs mit den bestehenden Konditionen
  // vorbefuellen, sonst leer starten.
  useEffect(() => {
    if (offen !== "einstellen") return;
    setForm(leitProgramm
      ? {
        typ: leitProgramm.provisionsTyp,
        betrag: String(leitProgramm.provisionsBetrag || ""),
        text: leitProgramm.provisionsText || "",
        bedingungen: leitProgramm.bedingungen || "",
      }
      : { typ: "fest", betrag: "", text: "", bedingungen: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen]);

  /** Freischalten oder Konditionen aendern, immer fuer alle Investments gleich. */
  const speichern = async () => {
    const betrag = parseFloat(form.betrag);
    if (!betrag || !form.text.trim()) {
      toast.error("Bitte Provisionshöhe und Beschreibung angeben.");
      return;
    }
    setSpeichert(true);
    const warAktiv = aktiv;
    try {
      const werte = {
        provisionsTyp: form.typ,
        provisionsBetrag: betrag,
        provisionsText: form.text.trim(),
        bedingungen: form.bedingungen.trim(),
        freigeschaltet: true,
      };
      for (const inv of investments) {
        const prog = getProgrammByInvestment(inv.id);
        if (prog) updateProgramm(prog.id, werte);
        else createProgramm({
          investmentId: inv.id,
          kontaktId: kunde.id,
          kontaktName: `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim(),
          beraterName: currentUser?.name || kunde.berater || "",
          ...werte,
        });
      }
      const { error } = await (supabase as any).rpc("merge_kontakt_meta", {
        _kontakt_id: kunde.id,
        _updates: { empfehlungsprogramm_aktiv: true, empfehlungsprogramm_aktiv_am: new Date().toISOString() },
      });
      if (error) throw error;
      if (!warAktiv) {
        notifyKundeEmpfehlungsprogramm(kunde.id);
        addAktivitaet({
          kundeId: kunde.id,
          art: "notiz",
          beschreibung: "Empfehlungsprogramm freigeschaltet",
          details: form.text.trim(),
          von: currentUser?.name || "",
        });
        toast.success("Empfehlungsprogramm freigeschaltet – im Kundenportal sichtbar.");
      } else {
        toast.success("Konditionen gespeichert.");
      }
      onSchliessen();
      onChanged?.();
    } catch (e: any) {
      toast.error(`Speichern fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
    } finally {
      setSpeichert(false);
    }
  };

  const deaktivieren = async () => {
    setSpeichert(true);
    try {
      for (const prog of programme) {
        if (prog.freigeschaltet) updateProgramm(prog.id, { freigeschaltet: false });
      }
      const { error } = await (supabase as any).rpc("merge_kontakt_meta", {
        _kontakt_id: kunde.id,
        _updates: { empfehlungsprogramm_aktiv: false, empfehlungsprogramm_deaktiviert_am: new Date().toISOString() },
      });
      if (error) throw error;
      addAktivitaet({
        kundeId: kunde.id,
        art: "notiz",
        beschreibung: "Empfehlungsprogramm deaktiviert",
        von: currentUser?.name || "",
      });
      toast.success("Empfehlungsprogramm deaktiviert.");
      onSchliessen();
      onChanged?.();
    } catch (e: any) {
      toast.error(`Deaktivieren fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <>
      {/* Einstell-Dialog: Freischalten und Bearbeiten, ein Formular fuer beides */}
      <Dialog open={offen === "einstellen"} onOpenChange={(o) => { if (!o) onSchliessen(); }}>
        <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              {aktiv ? "Empfehlungsprogramm bearbeiten" : "Empfehlungsprogramm aktivieren"}
            </DialogTitle>
            <DialogDescription>
              Gilt für {`${kunde?.vorname || ""} ${kunde?.nachname || ""}`.trim() || "den Kunden"} insgesamt und wird im Kundenportal angezeigt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold">Provisionstyp</Label>
              <Select value={form.typ} onValueChange={(v) => setForm((f) => ({ ...f, typ: v as "fest" | "prozent" }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fest">Festpreis (€)</SelectItem>
                  <SelectItem value="prozent">Prozentsatz (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Provisionshöhe {form.typ === "prozent" ? "(%)" : "(€)"}</Label>
              <Input
                type="number"
                value={form.betrag}
                onChange={(e) => setForm((f) => ({ ...f, betrag: e.target.value }))}
                placeholder={form.typ === "prozent" ? "z.B. 2" : "z.B. 500"}
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Beschreibung für den Kunden</Label>
              <Textarea
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="z.B. Für jede erfolgreiche Empfehlung erhältst du 500€ Tippgeberprovision nach Notartermin."
                className="text-sm mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Bedingungen (optional)</Label>
              <Input
                value={form.bedingungen}
                onChange={(e) => setForm((f) => ({ ...f, bedingungen: e.target.value }))}
                placeholder="z.B. Auszahlung nach Notartermin des Empfohlenen"
                className="h-8 text-sm mt-1"
              />
            </div>
            <Button size="sm" className="w-full gap-1.5" onClick={() => void speichern()} disabled={speichert}>
              {speichert
                ? "Wird gespeichert…"
                : aktiv ? "Änderungen speichern" : "Freischalten & dem Kunden anzeigen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rueckfrage vor dem Deaktivieren */}
      <Dialog open={offen === "deaktivieren"} onOpenChange={(o) => { if (!o) onSchliessen(); }}>
        <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Empfehlungsprogramm deaktivieren?</DialogTitle>
            <DialogDescription>
              Das Programm verschwindet aus dem Kundenportal. Bereits eingereichte Empfehlungen
              bleiben erhalten, und es lässt sich jederzeit wieder freischalten.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onSchliessen} disabled={speichert}>
              Abbrechen
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void deaktivieren()} disabled={speichert}>
              {speichert ? "Wird deaktiviert…" : "Deaktivieren"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
