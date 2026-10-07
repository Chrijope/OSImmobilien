import { useEffect, useRef, useState } from "react";
import { Bug, Upload, X, Loader2, Check, Camera, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { rollenLabel } from "@/lib/rollenLabel";
import { notifyAdmins } from "@/lib/bellNotifications";
import { betreffAusFehler, holeKontext, kontextAlsText } from "@/lib/fehlerKontext";
import { macheBildschirmfoto } from "@/lib/fehlerScreenshot";
import {
  schliesseFehlerMeldung,
  useFehlerMeldung,
  type FehlerMeldungVorgabe,
} from "@/lib/fehlerMelden";

type Prio = "niedrig" | "mittel" | "hoch";

/**
 * Empfänger der Bug-Meldungen.
 *
 * Lag vorher als feste Adresse und als feste Nutzer-ID im Quelltext. Die
 * Adresse ist jetzt über die Umgebung überschreibbar, und die Benachrichtigung
 * im CRM geht an alle Administratoren statt an eine einzelne ID, die beim
 * nächsten Personalwechsel ins Leere zeigt.
 */
const RECIPIENT =
  (import.meta.env.VITE_BUG_REPORT_EMAIL as string | undefined) || "c.peetz@imondu.de";

const MAX_FILES = 10;
const TARGET_MAX_DIM = 1920;
const TARGET_QUALITY = 0.82;
const HARD_UPLOAD_LIMIT = 25 * 1024 * 1024;

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;
    const ratio = Math.min(1, TARGET_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", TARGET_QUALITY),
    );
    if (!blob) return file;
    if (blob.size >= file.size) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

interface Props {
  /** Nur für die alte Aufrufform aus der Kopfzeile. Ohne Angabe zieht der Dialog aus dem Store. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function BugReportDialog(props: Props = {}) {
  const store = useFehlerMeldung();
  const gesteuert = typeof props.open === "boolean";
  const open = gesteuert ? !!props.open : store.offen;
  const vorgabe: FehlerMeldungVorgabe = gesteuert ? {} : store.vorgabe;
  const setOpen = (o: boolean) => {
    if (gesteuert) props.onOpenChange?.(o);
    else if (!o) schliesseFehlerMeldung();
  };

  const { user } = useUser();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user.name || "");
  const [betreff, setBetreff] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [prio, setPrio] = useState<Prio>("mittel");
  const [files, setFiles] = useState<File[]>([]);
  const [autoBild, setAutoBild] = useState<File | null>(null);
  const [bildLaeuft, setBildLaeuft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [kontext, setKontext] = useState<ReturnType<typeof holeKontext> | null>(null);
  const [duplikat, setDuplikat] = useState(false);

  const reset = () => {
    setBetreff("");
    setBeschreibung("");
    setPrio("mittel");
    setFiles([]);
    setAutoBild(null);
    setDone(false);
    setKontext(null);
    setDuplikat(false);
  };

  /**
   * Beim Öffnen wird alles zusammengetragen, was wir ohne Zutun wissen können.
   * Der Partner soll nur noch einen Satz schreiben müssen.
   */
  useEffect(() => {
    if (!open) return;
    const k = holeKontext();
    setKontext(k);
    setName(user.name || "");
    if (vorgabe.betreff) setBetreff(vorgabe.betreff);
    else if (k.fehler) setBetreff(betreffAusFehler(k.fehler.meldung));
    if (vorgabe.beschreibung) setBeschreibung(vorgabe.beschreibung);
    if (vorgabe.prioritaet) setPrio(vorgabe.prioritaet);
    else if (k.fehler?.quelle === "boundary") setPrio("hoch");

    if (vorgabe.screenshot) {
      setBildLaeuft(true);
      // Kurz warten, damit der Dialog gezeichnet ist und sich selbst ausblenden kann.
      const t = setTimeout(() => {
        macheBildschirmfoto()
          .then((f) => setAutoBild(f))
          .finally(() => setBildLaeuft(false));
      }, 250);
      return () => clearTimeout(t);
    }
    // Absichtlich nur an `open` gebunden: Beim erneuten Rendern soll nichts
    // überschrieben werden, was der Partner gerade tippt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    (async () => {
      const next: File[] = [...files];
      for (const f of Array.from(list)) {
        if (next.length >= MAX_FILES) {
          toast({ title: `Maximal ${MAX_FILES} Bilder` });
          break;
        }
        const compressed = await compressImage(f);
        if (compressed.size > HARD_UPLOAD_LIMIT) {
          toast({
            title: `Datei zu groß: ${f.name}`,
            description: "Auch nach Komprimierung über 25 MB",
            variant: "destructive",
          });
          continue;
        }
        next.push(compressed);
      }
      setFiles(next);
    })();
  };

  const submit = async () => {
    if (!betreff.trim() || !beschreibung.trim() || !name.trim()) {
      toast({ title: "Bitte alle Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      const ticketId = crypto.randomUUID();
      const k = kontext ?? holeKontext();
      const fingerabdruck = k.fehler?.fingerabdruck ?? "";

      // Läuft zu diesem Fehler schon ein offenes Ticket? Dann nicht das zwölfte
      // Ticket für denselben Bug erzeugen, sondern anhängen.
      let bestehendesTicket: { id: string; meta: Record<string, unknown> } | null = null;
      if (fingerabdruck) {
        try {
          const { data } = await supabase
            .from("support_tickets")
            .select("id, meta, status")
            .eq("kategorie", "bug")
            .neq("status", "geschlossen")
            .limit(200);
          const treffer = (data || []).find(
            (r) => (r.meta as Record<string, unknown> | null)?.fingerabdruck === fingerabdruck,
          );
          if (treffer) {
            bestehendesTicket = {
              id: treffer.id as string,
              meta: (treffer.meta as Record<string, unknown>) || {},
            };
          }
        } catch (e) {
          console.warn("Doppelprüfung fehlgeschlagen", e);
        }
      }

      // Bilder hochladen
      const alleBilder = autoBild ? [autoBild, ...files] : files;
      const bilderUrls: string[] = [];
      if (uid && alleBilder.length > 0) {
        for (const f of alleBilder) {
          const ext = f.name.split(".").pop() || "png";
          const path = `${uid}/${ticketId}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("bug-reports")
            .upload(path, f, { contentType: f.type, upsert: false });
          if (upErr) {
            console.error("Bug-report upload failed:", upErr);
            continue;
          }
          const { data: signed } = await supabase.storage
            .from("bug-reports")
            .createSignedUrl(path, 60 * 60 * 24 * 30);
          if (signed?.signedUrl) bilderUrls.push(signed.signedUrl);
        }
      }

      const roleLabel = rollenLabel(user.role, user.rollenVariante);
      const reporterEmail = (authData.user?.email as string) || "";
      const technik = kontextAlsText(k);

      // Nachmeldung zu einem bekannten Fehler
      if (bestehendesTicket) {
        const bisher = Array.isArray(bestehendesTicket.meta.nachmeldungen)
          ? (bestehendesTicket.meta.nachmeldungen as unknown[])
          : [];
        const { error: updErr } = await supabase
          .from("support_tickets")
          .update({
            meta: {
              ...bestehendesTicket.meta,
              nachmeldungen: [
                ...bisher,
                {
                  zeit: new Date().toISOString(),
                  name: name.trim(),
                  rolle: roleLabel,
                  beschreibung: beschreibung.trim(),
                  url: k.url,
                  bilder: bilderUrls,
                },
              ],
              betroffene: bisher.length + 2,
            } as never,
          })
          .eq("id", bestehendesTicket.id);

        if (!updErr) {
          setDuplikat(true);
          setDone(true);
          toast({
            title: "Danke, das kennen wir schon",
            description: "Deine Meldung wurde an das laufende Ticket angehängt.",
          });
          setTimeout(() => {
            setOpen(false);
            reset();
          }, 2000);
          return;
        }
        console.warn("Anhängen fehlgeschlagen, es wird ein eigenes Ticket erstellt", updErr);
      }

      // Fortlaufende Ticketnummer
      let nextNummer = 1001;
      try {
        const { data: existing } = await supabase.from("support_tickets").select("meta").limit(2000);
        const maxNr = (existing || []).reduce((max: number, row: { meta: unknown }) => {
          const n = parseInt(String((row?.meta as Record<string, unknown>)?.nummer ?? 0), 10) || 0;
          return n > max ? n : max;
        }, 1000);
        nextNummer = maxNr + 1;
      } catch (e) {
        console.warn("Konnte Ticket-Nummer nicht ermitteln, verwende Fallback", e);
      }

      const { error: dbErr } = await supabase.from("support_tickets").insert({
        id: ticketId,
        betreff: betreff.trim(),
        nachricht: beschreibung.trim() + (technik ? `\n\n--- Technischer Kontext ---\n${technik}` : ""),
        kategorie: "bug",
        prioritaet: prio,
        status: "offen",
        benutzer_id: uid || null,
        meta: {
          nummer: nextNummer,
          reporterName: name.trim(),
          reporterRole: roleLabel,
          reporterEmail,
          url: k.url,
          bilder: bilderUrls,
          userAgent: k.userAgent,
          // Neu: alles, was die Suche nach der Ursache abkürzt
          fingerabdruck,
          quelle: k.fehler?.quelle ?? "manuell",
          fehlermeldung: k.fehler?.meldung ?? "",
          stack: k.fehler?.stack ?? "",
          route: k.route,
          bildschirm: k.bildschirm,
          schritte: k.schritte,
          konsole: k.konsole,
          automatischesBild: !!autoBild,
        } as never,
      });

      // Ehrlich bleiben: Wenn das Ticket nicht in der Datenbank landet, darf der
      // Partner nicht "gesendet" lesen und sich in Sicherheit wiegen.
      if (dbErr) {
        console.error("Bug-report DB insert failed:", dbErr);
        /*
         * Den Grund mit anzeigen.
         *
         * Am 16.09.2026 meldete Philipp Pintat, dass er einen Fehler nicht an
         * die IT senden konnte, weil dabei wieder ein Fehler kam. Welcher, war
         * nicht zu erfahren: Die Meldung nannte nur, dass es nicht geklappt
         * hat. Genau an dieser Stelle reisst die Spur ab, und ohne sie bleibt
         * nur Raten. Deshalb steht der technische Grund jetzt dabei. Er ist
         * haesslich, aber er ist das Einzige, was der Partner weitergeben
         * kann, wenn der Meldeweg selbst klemmt.
         */
        const grund = [dbErr.message, dbErr.code ? `(${dbErr.code})` : ""]
          .filter(Boolean)
          .join(" ")
          .slice(0, 300);
        toast({
          title: "Meldung konnte nicht gespeichert werden",
          description:
            "Bitte melde dich kurz direkt beim Team und gib diesen Grund weiter: "
            + (grund || "kein Grund vom Server erhalten"),
          variant: "destructive",
        });
        return;
      }

      const prioEmoji = prio === "hoch" ? "🔴" : prio === "mittel" ? "🟡" : "🟢";
      notifyAdmins({
        titel: `${prioEmoji} Bug gemeldet: ${betreff.trim().slice(0, 80)}`,
        nachricht: `${name.trim()} (${roleLabel}) – ${beschreibung.trim().slice(0, 200)}`,
        link: "/helpdesk",
      });

      const { error: mailErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "bug-report",
          recipientEmail: RECIPIENT,
          idempotencyKey: `bug-report-${ticketId}`,
          templateData: {
            reporterName: name.trim(),
            reporterEmail,
            reporterRole: roleLabel,
            prioritaet: prio,
            betreff: betreff.trim(),
            beschreibung: beschreibung.trim() + (technik ? `\n\n${technik}` : ""),
            url: k.url,
            bilder: bilderUrls,
            ticketId,
          },
        },
      });
      if (mailErr) console.error("Bug-report mail failed:", mailErr);

      setDone(true);
      toast({ title: "Bug-Report gesendet", description: "Vielen Dank, wir kümmern uns darum." });
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 1500);
    } catch (e) {
      console.error(e);
      toast({ title: "Fehler beim Senden", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-fehler-dialog>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-primary" />
            {kontext?.fehler && kontext.fehler.quelle !== "manuell"
              ? "Da ist etwas schiefgelaufen"
              : "Bug oder Fehler melden"}
          </DialogTitle>
          <DialogDescription>
            {kontext?.fehler && kontext.fehler.quelle !== "manuell"
              ? "Wir haben den Fehler schon aufgezeichnet. Schreib bitte kurz dazu, was du gerade tun wolltest, dann können wir ihn nachstellen."
              : "Beschreibe das Problem so genau wie möglich. Ein Bildschirmfoto hilft uns, den Fehler schnell zu finden."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <p className="font-medium text-foreground">Vielen Dank.</p>
            <p className="text-sm text-muted-foreground mt-1">
              {duplikat
                ? "Der Fehler war schon bekannt, deine Meldung ist beim laufenden Ticket."
                : "Deine Meldung ist angekommen."}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {kontext?.fehler && kontext.fehler.quelle !== "manuell" && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-1">
                <div className="font-medium text-destructive">Aufgezeichnete Meldung</div>
                <div className="font-mono text-[11px] break-words text-foreground/80">
                  {kontext.fehler.meldung}
                </div>
                <div className="text-muted-foreground">
                  Seite {kontext.route}, {kontext.schritte.length} Schritte und{" "}
                  {kontext.konsole.length} Meldungen werden mitgeschickt.
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="bug-name">Dein Name *</Label>
              <Input
                id="bug-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vor- und Nachname"
              />
            </div>

            <div>
              <Label htmlFor="bug-betreff">Kurze Zusammenfassung *</Label>
              <Input
                id="bug-betreff"
                value={betreff}
                onChange={(e) => setBetreff(e.target.value)}
                placeholder="z. B. Speichern-Button reagiert nicht"
                maxLength={120}
              />
            </div>

            <div>
              <Label htmlFor="bug-prio">Priorität</Label>
              <Select value={prio} onValueChange={(v) => setPrio(v as Prio)}>
                <SelectTrigger id="bug-prio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="niedrig">🟢 Niedrig – Kosmetisch / nicht dringend</SelectItem>
                  <SelectItem value="mittel">🟡 Mittel – Stört, aber Workaround möglich</SelectItem>
                  <SelectItem value="hoch">🔴 Hoch – Blockiert die Arbeit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="bug-beschreibung">Was wolltest du gerade tun? *</Label>
              <Textarea
                id="bug-beschreibung"
                value={beschreibung}
                onChange={(e) => setBeschreibung(e.target.value)}
                placeholder="Ein Satz reicht. Zum Beispiel: Ich wollte die Selbstauskunft speichern."
                rows={4}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground mt-1">{beschreibung.length}/2000</p>
            </div>

            {/* Automatisches Bildschirmfoto mit Vorschau */}
            <div>
              <Label className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Bildschirmfoto
              </Label>
              {bildLaeuft ? (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> wird aufgenommen …
                </div>
              ) : autoBild ? (
                <div className="mt-1 space-y-2">
                  <div className="relative group">
                    <img
                      src={URL.createObjectURL(autoBild)}
                      alt="Automatisches Bildschirmfoto"
                      className="w-full max-h-48 object-contain rounded border border-border bg-muted/30"
                    />
                    <button
                      type="button"
                      onClick={() => setAutoBild(null)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                      aria-label="Bildschirmfoto entfernen"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    Das Bild zeigt genau das, was gerade auf deinem Bildschirm steht, also
                    möglicherweise auch Kundendaten. Prüfe es kurz und entferne es, wenn es nicht
                    mitgeschickt werden soll.
                  </p>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBildLaeuft(true);
                      macheBildschirmfoto()
                        .then((f) => setAutoBild(f))
                        .finally(() => setBildLaeuft(false));
                    }}
                  >
                    <Camera className="h-4 w-4 mr-2" /> Bildschirmfoto aufnehmen
                  </Button>
                  <span className="text-[11px] text-muted-foreground">wird nicht mitgeschickt</span>
                </div>
              )}
            </div>

            <div>
              <Label>Weitere Bilder (optional, max. {MAX_FILES})</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={files.length >= MAX_FILES}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bilder hinzufügen ({files.length}/{MAX_FILES})
              </Button>
              {files.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={URL.createObjectURL(f)}
                        alt={f.name}
                        className="w-full h-20 object-cover rounded border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                        aria-label="Bild entfernen"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Abbrechen
              </Button>
              <Button className="flex-1" onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "An IT senden"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
