import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addKontakt, getKontakte } from "@/lib/kundenStore";
import { getCurrentUserId } from "@/lib/currentUser";
import { confirmDialog } from "@/lib/confirm";
import { useUser } from "@/contexts/UserContext";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizeTelefon } from "@/lib/phoneUtils";
import { findPotentialDuplicates } from "@/lib/duplikatCheck";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";
import { fehlendePflichtfelder } from "@/lib/kontaktPflichtfelder";
import { KundenspracheFeld } from "@/components/kunden/profil/KundenspracheFeld";
import { kundenSpracheMetaPatch, type Sprache } from "@/lib/kundenSprache";

const QUELLEN = [
  "Website", "Instagram", "Facebook", "LinkedIn", "TikTok",
  "Empfehlung", "Veranstaltung", "Netzwerk", "Meta Kampagne",
  "Google Ads", "Flyer", "Kaltakquise", "Sonstige",
];

const emptyForm = () => ({
  anrede: "", vorname: "", nachname: "", email: "", telefon: "",
  quelle: "",
  strasse: "", hausnummer: "", plz: "", ort: "",
  leadTyp: "manuell" as "meta" | "google" | "website" | "manuell",
  empfehlungsgeberName: "",
  empfehlungsgeberBeziehung: "",
  kundenSprache: "de" as Sprache,
});

export function NeuerKontaktDialog({ triggerLabel = "Kontakt anlegen", size = "sm" as "sm" | "default" }: { triggerLabel?: string; size?: "sm" | "default" }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [newKontakt, setNewKontakt] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  /**
   * Ist schon etwas eingetragen?
   *
   * Verglichen wird gegen das leere Formular, damit vorbelegte Felder wie die
   * Anrede nicht faelschlich als Eingabe gelten.
   */
  const hatEingaben = () => {
    const leer = emptyForm() as Record<string, unknown>;
    return Object.entries(newKontakt as Record<string, unknown>).some(
      ([k, v]) => typeof v === "string" && v.trim() !== "" && v !== leer[k],
    );
  };

  const upd = (field: string, value: string) => {
    setNewKontakt((p) => ({ ...p, [field]: value }));
    if (formErrors[field]) setFormErrors((e) => ({ ...e, [field]: false }));
  };
  const fieldClass = (field: string) => formErrors[field] ? "border-destructive ring-1 ring-destructive/30" : "";

  const handleCreate = async () => {
    const errors = fehlendePflichtfelder(newKontakt);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: "Pflichtfelder ausfüllen", description: "Bitte alle markierten Felder ausfüllen.", variant: "destructive" });
      return;
    }
    const dupes = findPotentialDuplicates(
      { vorname: newKontakt.vorname, nachname: newKontakt.nachname, email: newKontakt.email, telefon: newKontakt.telefon },
      getKontakte()
    );
    if (dupes.length > 0) {
      const hard = dupes.find(d => d.grund === "email" || d.grund === "telefon");
      if (hard) {
        toast({
          title: hard.grund === "email" ? "E-Mail bereits vergeben" : "Telefonnummer bereits vergeben",
          description: `Bereits zugeordnet: "${hard.kontakt.vorname} ${hard.kontakt.nachname}" (${hard.detail}).`,
          variant: "destructive",
          action: (
            <Button variant="outline" size="sm" onClick={() => navigate(`/kunden/${hard.kontakt.id}`)}>
              Zum Kontakt
            </Button>
          ),
        });
        return;
      }
      const soft = dupes[0];
      const proceed = await confirmDialog({
        title: "Möglicher Duplikat-Kontakt gefunden",
        description:
          `Es gibt bereits ${soft.kontakt.vorname} ${soft.kontakt.nachname} (gleicher Name). Soll trotzdem ein neuer Kontakt angelegt werden?`,
        confirmText: "Trotzdem anlegen",
        cancelText: "Nicht anlegen",
      });
      if (!proceed) return;
    }
    const empfName = newKontakt.empfehlungsgeberName.trim();
    const empfBeziehung = newKontakt.empfehlungsgeberBeziehung.trim();
    addKontakt({
      anrede: newKontakt.anrede,
      vorname: newKontakt.vorname.trim(),
      nachname: newKontakt.nachname.trim(),
      email: newKontakt.email,
      telefon: normalizeTelefon(newKontakt.telefon),
      quelle: newKontakt.quelle,
      strasse: newKontakt.strasse.trim(),
      hausnummer: newKontakt.hausnummer.trim(),
      plz: newKontakt.plz.trim(),
      ort: newKontakt.ort.trim(),
      leadTyp: newKontakt.leadTyp,
      berater: user.name,
      zustaendig_id: getCurrentUserId() || undefined,
      pipelineStufe: "erstgespraech_geplant",
      status: "kontaktiert" as any,
      meta: {
        // Die Sprache ist beim Anlegen sichtbar gewählt worden.
        ...kundenSpracheMetaPatch(newKontakt.kundenSprache, getCurrentUserId()),
        ...(empfName ? {
          empfehlungsgeber: true,
          empfehlungsgeberName: empfName,
          ...(empfBeziehung ? { empfehlungsgeberBeziehung: empfBeziehung } : {}),
        } : {}),
      },
    } as any);
    toast({ title: "Kontakt angelegt ✓", description: `${newKontakt.vorname} ${newKontakt.nachname}` });
    setOpen(false);
    setNewKontakt(emptyForm());
    setFormErrors({});
  };

  return (
    <Dialog
      open={open}
      onOpenChange={async (o) => {
        // Beim Schliessen nachfragen, wenn schon etwas eingetippt wurde.
        // Vorher verwarf ein Klick neben den Dialog kommentarlos alles, was
        // bis dahin ausgefuellt war.
        if (!o && hatEingaben()) {
          const verwerfen = await confirmDialog({
            title: "Eingaben verwerfen?",
            description: "Der Kontakt wurde noch nicht angelegt. Alles Eingetragene geht verloren.",
            confirmText: "Verwerfen",
            cancelText: "Weiter bearbeiten",
            variant: "destructive",
          });
          if (!verwerfen) return;
          setNewKontakt(emptyForm());
        }
        setOpen(o);
        if (!o) setFormErrors({});
      }}
    >
      <DialogTrigger asChild>
        {/* Hauptaktion der Seite "Alle Kontakte", deshalb Marken-Orange. */}
        <Button size={size} variant="brand"><Plus className="h-4 w-4 mr-1" /> {triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-3xl w-[95vw]">
        <DialogHeader><DialogTitle>Neuen Kontakt anlegen</DialogTitle></DialogHeader>
        <div className="grid gap-5 py-4 max-h-[75vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Anrede *</Label>
              <Select value={newKontakt.anrede} onValueChange={(v) => upd("anrede", v)}>
                <SelectTrigger className={fieldClass("anrede")}><SelectValue placeholder="–" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Herr">Herr</SelectItem>
                  <SelectItem value="Frau">Frau</SelectItem>
                  <SelectItem value="Divers">Divers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Vorname *</Label><Input className={fieldClass("vorname")} value={newKontakt.vorname} onChange={(e) => upd("vorname", e.target.value)} /></div>
            <div><Label className="text-xs">Nachname *</Label><Input className={fieldClass("nachname")} value={newKontakt.nachname} onChange={(e) => upd("nachname", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">E-Mail *</Label><Input className={fieldClass("email")} type="email" value={newKontakt.email} onChange={(e) => upd("email", e.target.value)} /></div>
            <div><Label className="text-xs">Telefon *</Label><PhoneInput className={fieldClass("telefon")} value={newKontakt.telefon} onChange={(v) => upd("telefon", v)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quelle *</Label>
              <Select value={newKontakt.quelle} onValueChange={(v) => upd("quelle", v)}>
                <SelectTrigger className={fieldClass("quelle")}><SelectValue placeholder="Quelle wählen..." /></SelectTrigger>
                <SelectContent>
                  {QUELLEN.map((q) => (<SelectItem key={q} value={q}>{q}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Lead-Typ *</Label>
              <Select value={newKontakt.leadTyp} onValueChange={(v) => upd("leadTyp", v)}>
                <SelectTrigger className={fieldClass("leadTyp")}><SelectValue placeholder="Typ wählen..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manuell">Manuell</SelectItem>
                  <SelectItem value="meta">Funnel Lead</SelectItem>
                  <SelectItem value="google">Google Ad</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2"><Label className="text-xs">Straße</Label><Input value={newKontakt.strasse} onChange={(e) => upd("strasse", e.target.value)} /></div>
            <div><Label className="text-xs">Nr.</Label><Input value={newKontakt.hausnummer} onChange={(e) => upd("hausnummer", e.target.value)} /></div>
            <div><Label className="text-xs">PLZ</Label><Input value={newKontakt.plz} onChange={(e) => upd("plz", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Ort</Label><Input value={newKontakt.ort} onChange={(e) => upd("ort", e.target.value)} /></div>
          {/* Kundensprache, vorbelegt mit Deutsch. Wer anlegt, sieht sie und
              ändert sie mit einem Klick; damit gilt sie als gewählt (Plan
              Kundensprache 2.4). */}
          <div>
            <Label className="text-xs">Sprache</Label>
            <div className="mt-1.5"><KundenspracheFeld wert={newKontakt.kundenSprache} onWahl={(s) => upd("kundenSprache", s)} ariaLabel="Sprache des Kontakts" /></div>
            <p className="text-[11px] text-muted-foreground mt-1">In dieser Sprache bekommt der Kunde Mails, Dokumente und das Kundenportal.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div>
              <Label className="text-xs">Empfehlungsgeber (optional)</Label>
              <Input placeholder="Name des Empfehlungsgebers" value={newKontakt.empfehlungsgeberName} onChange={(e) => upd("empfehlungsgeberName", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Beziehung (optional)</Label>
              <Input placeholder="z.B. Familie, Kollege, Freund" value={newKontakt.empfehlungsgeberBeziehung} onChange={(e) => upd("empfehlungsgeberBeziehung", e.target.value)} />
            </div>
          </div>
          <Button onClick={handleCreate} className="w-full">Kontakt anlegen</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}