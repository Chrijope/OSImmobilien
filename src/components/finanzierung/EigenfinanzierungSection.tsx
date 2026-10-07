import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Upload, AlertTriangle, CheckCircle2, Download, Loader2, Banknote, Info, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import {
  getEigenfinanzierung,
  aktiviereEigenfinanzierung,
  deaktiviereEigenfinanzierung,
  setGegenAngebot,
  speichereKundenAngebot,
  speichereKundenDarlehensvertrag,
  loescheKundenDarlehensvertrag,
  alleKundenDarlehensvertraege,
  setGegenDarlehensvertrag,
  bestaetigeVP,
  type EigenfinanzierungAngebot,
} from "@/lib/eigenfinanzierungStore";
import { confirmDialog } from "@/lib/confirm";
import { openUnterlage } from "@/lib/storage";
import { addAktivitaet } from "@/lib/aktivitaetenStore";
import { notifyByRole, notifyKunde, notifyUser } from "@/lib/bellNotifications";
import { KUNDEN_GLOCKE } from "@/lib/kundenGlocke";
import { addFollowUp } from "@/lib/followUpStore";
import { getCurrentUserId } from "@/lib/currentUser";

/*
 * Knoepfe in diesem Kasten brechen ihre Beschriftung um, statt aus dem Rahmen
 * zu ragen.
 *
 * Christian am 23.09.2026 mit einem Bildschirmfoto: Die Hochladeknoepfe
 * standen je nach Fensterbreite ueber dem Rand ihrer Karte. Ein Knopf traegt
 * von Haus aus `whitespace-nowrap` und eine feste Hoehe, er kann also nicht
 * schmaler werden als seine Beschriftung. Ob die lange oder die kurze
 * Beschriftung erscheint, entschied bisher allein die Fensterbreite (`sm:`),
 * nicht die Breite des Kastens. Der Kasten sitzt aber tief verschachtelt im
 * Kundenprofil, neben Kontaktspalte, Aktivitaeten und Abschnittsleiste, und
 * ist bei 700, 940, 1180 oder 1400 Pixel Fensterbreite schmaler als
 * „Finanzierungsangebot (Gegenangebot) hochladen“.
 *
 * Deshalb: volle Breite des Kastens, Umbruch erlaubt, Hoehe waechst mit.
 *
 * Bewusst ohne `min-h-…`: Die Mobilschicht in `index.css` haelt Knoepfe auf
 * dem Telefon bei 40 Pixeln, laesst aber jeden mit eigener Mindesthoehe aus.
 * Die bisherigen 36 Pixel am Schreibtisch kommen deshalb aus dem
 * Innenabstand: 16 Pixel Zeilenhoehe bei `text-xs` plus zweimal 10, bei
 * `text-sm` 20 plus zweimal 8. `text-balance` verteilt eine umbrochene
 * Beschriftung gleichmaessig auf beide Zeilen, statt ein einzelnes Wort
 * allein in die zweite zu schieben.
 */
const HOCHLADE_KNOPF = "w-full h-auto whitespace-normal text-balance py-2.5 text-xs gap-1.5";
const UMBRECHENDER_KNOPF = "h-auto whitespace-normal text-balance py-2 gap-1.5";

interface Props {
  investmentId: string;
  kundeId: string;
  kundeName: string;
  beraterId?: string;
  beraterName?: string;
  onConfirmed?: () => void; // pipeline → notar
}

export function EigenfinanzierungSection({ investmentId, kundeId, kundeName, beraterId, beraterName, onConfirmed }: Props) {
  const { user } = useUser();
  const { toast } = useToast();
  const currentUserId = getCurrentUserId() || undefined;
  const [state, setState] = useState(() => getEigenfinanzierung(investmentId));
  type SlotKey = "kundeFA" | "kundeDV" | "gegenFA" | "gegenDV";
  const [uploading, setUploading] = useState<SlotKey | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [hinweis, setHinweis] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<SlotKey | null>(null);

  useEffect(() => {
    const reload = () => setState(getEigenfinanzierung(investmentId));
    window.addEventListener("eigenfinanzierung-updated", reload);
    return () => window.removeEventListener("eigenfinanzierung-updated", reload);
  }, [investmentId]);

  /*
   * Die Entscheidung zur Eigenfinanzierung gehoert zum einzelnen Investment.
   *
   * Der Anfangswert von `useState` wird nur beim ersten Aufbau gelesen. Beim
   * Wechsel von Investment 1 auf Investment 3 bleibt dieser Bereich an
   * derselben Stelle im Baum stehen und wurde deshalb nicht neu aufgebaut, er
   * zeigte also weiter den Schalterstand des zuerst geoeffneten Investments.
   */
  const [geladenesInvestment, setGeladenesInvestment] = useState(investmentId);
  if (geladenesInvestment !== investmentId) {
    setGeladenesInvestment(investmentId);
    setState(getEigenfinanzierung(investmentId));
    setConfirmActivate(false);
    setConfirmDeactivate(false);
    setHinweis("");
  }

  const isVP = user.role === "vertriebspartner";
  const isVL = user.role === "vertriebsleiter";
  const isAdmin = ["admin", "inhaber"].includes(user.role);
  const isFinanzierer = user.role === "finanzierungspartner";
  const isKunde = user.role === "kunde";

  const canActivate = isVP || isVL || isAdmin;
  const canDeactivate = isAdmin; // 7.6
  const canConfirmFinal = isVP || isAdmin; // VP bestätigt nach Kunden-Upload
  const canUploadGegen = isFinanzierer || isAdmin; // Hybrid 7.3
  const canUploadKunde = isKunde || isVP || isAdmin; // Kunde lädt selbst, VP kann assistieren
  const canView = canActivate || isFinanzierer || isKunde;

  if (!canView) return null;
  // Nur anzeigen wenn aktiv ODER VP/Admin/VL (die können aktivieren)
  if (!state.aktiv && !canActivate) return null;

  // ── Aktivieren ──
  const handleActivate = () => {
    aktiviereEigenfinanzierung(investmentId, user.name || "Unbekannt", currentUserId, user.role, hinweis.trim() || undefined);
    setState(getEigenfinanzierung(investmentId));
    setConfirmActivate(false);
    setHinweis("");

    addAktivitaet({
      kundeId,
      art: "notiz",
      beschreibung: `Eigenfinanzierung aktiviert von ${user.name}${hinweis ? `. Hinweis: ${hinweis}` : ""}`,
      von: user.name,
    });

    // Benachrichtigungen (Glocke) an alle Beteiligten – KEINE Aufgabe
    notifyByRole(["finanzierungspartner", "admin", "inhaber"], {
      titel: "Eigenfinanzierung aktiviert",
      nachricht: `${kundeName}: ${user.name} hat angegeben, dass der Kunde die Finanzierung selbst übernimmt.`,
      link: `/kunden/${kundeId}?tab=investments&investment=${investmentId}#finanzierung`,
    });
    notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.eigenfinanzierungAn[sprache](), link: `/kunde/investments` }));

    // Inbox-Aufgabe für den Kunden läuft über Bell-Notification (Kundenportal hat keine Follow-Up-Inbox)

    toast({ title: "Eigenfinanzierung aktiviert", description: "Kunde, Finanzierungspartner und Admin wurden benachrichtigt." });
  };

  const handleDeactivate = () => {
    deaktiviereEigenfinanzierung(investmentId, user.name || "Admin");
    setState(getEigenfinanzierung(investmentId));
    setConfirmDeactivate(false);
    addAktivitaet({ kundeId, art: "notiz", beschreibung: `Eigenfinanzierung deaktiviert von ${user.name}`, von: user.name });
    const deaktiviertMeldung = {
      titel: "Eigenfinanzierung deaktiviert",
      nachricht: `${kundeName}: Eigenfinanzierungs-Modus wurde von ${user.name} aufgehoben.`,
      link: `/kunden/${kundeId}?tab=investments&investment=${investmentId}#finanzierung`,
    };
    // Bis 28.09.2026 stand hier die ganze Rolle "vertriebspartner", die
    // Meldung mit Kundennamen ging an jeden Partner. Jetzt nur der Zustaendige.
    notifyByRole(["finanzierungspartner", "admin", "inhaber"], deaktiviertMeldung);
    if (beraterId && beraterId !== currentUserId) notifyUser(beraterId, deaktiviertMeldung);
    notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.eigenfinanzierungAus[sprache](), link: `/kunde/investments` }));
    toast({ title: "Eigenfinanzierung deaktiviert" });
  };

  // ── Upload ──
  const triggerUpload = (slot: SlotKey) => {
    pendingSlot.current = slot;
    fileRef.current?.click();
  };

  const handleFile = async (file: File) => {
    const slot = pendingSlot.current;
    if (!slot || !file) return;
    setUploading(slot);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const ext = file.name.split(".").pop() || "pdf";
      const path = `finanzierung/eigen/${kundeId}/${investmentId}/${slot}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("unterlagen").upload(path, file, { upsert: true });
      if (error) throw error;
      const angebot: EigenfinanzierungAngebot = {
        fileName: file.name,
        storagePath: path,
        uploadedAt: new Date().toISOString(),
        uploadedByName: user.name || "Unbekannt",
        uploadedByRole: user.role,
      };
      const isKundeSlot = slot === "kundeFA" || slot === "kundeDV";
      const isDV = slot === "kundeDV" || slot === "gegenDV";
      const label = isDV ? "Darlehensvertrag" : "Finanzierungsangebot";
      /*
       * Die Unterlagen des Kunden gehen über die eigene Datenbankfunktion,
       * damit dieselbe Regel gilt wie im Kundenportal: genau ein
       * Finanzierungsangebot, beliebig viele Darlehensverträge, und die Regel
       * steht in der Datenbank. Solange die Migration 20260921270000 noch
       * nicht gelaufen ist, schreibt eine interne Rolle wie bisher weiter.
       */
      const rueckfallErlaubt = !isKunde;
      if (slot === "kundeFA") {
        const e = await speichereKundenAngebot(investmentId, angebot, rueckfallErlaubt);
        if (!e.ok) { toast({ title: "Nicht gespeichert", description: e.fehler, variant: "destructive" }); return; }
      } else if (slot === "kundeDV") {
        const e = await speichereKundenDarlehensvertrag(investmentId, angebot, rueckfallErlaubt);
        if (!e.ok) { toast({ title: "Nicht gespeichert", description: e.fehler, variant: "destructive" }); return; }
      }
      else if (slot === "gegenFA") setGegenAngebot(investmentId, angebot);
      else if (slot === "gegenDV") setGegenDarlehensvertrag(investmentId, angebot);

      if (isKundeSlot) {
        addAktivitaet({ kundeId, art: "notiz", beschreibung: `Eigenfinanzierung: ${label} „${file.name}" hochgeladen von ${user.name}`, von: user.name });
        notifyByRole(["finanzierungspartner", "admin", "inhaber"], {
          titel: `Kunden-${label} eingegangen`,
          nachricht: `${kundeName} hat sein ${label} hochgeladen.`,
          link: `/kunden/${kundeId}?tab=investments&investment=${investmentId}#finanzierung`,
        });
        if (beraterId) {
          notifyUser(beraterId, {
            titel: `Kunden-${label} eingegangen`,
            nachricht: `${kundeName} hat sein ${label} hochgeladen. Bitte prüfen.`,
            link: `/kunden/${kundeId}?tab=investments&investment=${investmentId}#finanzierung`,
          });
          // Inbox-Aufgabe nur für VP
          if (slot === "kundeFA") {
            addFollowUp({
              kundeId, kundeName, berater: beraterName || "VP",
              pipelineStufe: "finanzierung", typ: "erinnerung",
              titel: "Eigenfinanzierung: Darlehensvertrag abwarten",
              beschreibung: `Kunde ${kundeName} hat das Finanzierungsangebot hochgeladen. Bitte unterschriebenen Darlehensvertrag abwarten.`,
              faelligAm: new Date().toISOString().slice(0, 10),
              prioritaet: "mittel", automatisch: true,
            });
          } else if (!state.vpBestaetigt) {
            /*
             * Mehrere Darlehensverträge sind erlaubt, mehrere gleichlautende
             * Aufgaben nicht. Ist die Eigenfinanzierung bereits bestätigt, ist
             * nichts mehr zu bestätigen, dann bleibt es bei der Glocke oben.
             */
            addFollowUp({
              kundeId, kundeName, berater: beraterName || "VP",
              pipelineStufe: "finanzierung", typ: "erinnerung",
              titel: "Eigenfinanzierung bestätigen und weiter zum Notar",
              beschreibung: `Kunde ${kundeName} hat den unterschriebenen Darlehensvertrag hochgeladen. Bitte prüfen und Pipeline auf Notar setzen.`,
              faelligAm: new Date().toISOString().slice(0, 10),
              prioritaet: "hoch", automatisch: true,
            });
          }
        }
      } else {
        addAktivitaet({ kundeId, art: "notiz", beschreibung: `Eigenfinanzierung: Gegenangebot ${label} „${file.name}" hochgeladen von ${user.name}`, von: user.name });
        notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.gegenangebot[sprache](label), link: `/kunde/investments` }));
        if (beraterId) {
          notifyUser(beraterId, {
            titel: `Gegenangebot ${label} hochgeladen`,
            nachricht: `${kundeName}: Finanzierer hat ein Gegenangebot (${label}) erstellt.`,
            link: `/kunden/${kundeId}?tab=investments&investment=${investmentId}#finanzierung`,
          });
        }
      }
      setState(getEigenfinanzierung(investmentId));
      toast({ title: "Hochgeladen ✓" });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Upload fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setUploading(null);
      pendingSlot.current = null;
    }
  };

  // ── Darlehensverträge des Kunden (Altbestand eingeschlossen) ──
  const darlehensvertraege = alleKundenDarlehensvertraege(state);
  const unterlagenVollstaendig = !!state.kundenAngebot && darlehensvertraege.length > 0;

  const handleDeleteDarlehensvertrag = async (ang: EigenfinanzierungAngebot) => {
    const ok = await confirmDialog({
      title: "Darlehensvertrag löschen?",
      description: `„${ang.fileName}" wird aus der Eigenfinanzierung entfernt. Die übrigen Darlehensverträge bleiben erhalten.`,
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ok) return;
    const ergebnis = await loescheKundenDarlehensvertrag(investmentId, ang.storagePath, !isKunde);
    if (!ergebnis.ok) {
      toast({ title: "Nicht gelöscht", description: ergebnis.fehler, variant: "destructive" });
      return;
    }
    setState(getEigenfinanzierung(investmentId));
    /*
     * Die Datei im Speicher wird nachrangig entfernt. Der Kunde darf im
     * Bucket „unterlagen" nur seine externen Investments löschen, für ihn
     * schlägt das fehl. Bleibt dann höchstens eine verwaiste Datei liegen,
     * sichtbar ist sie nirgends mehr. Ein Fehler hier darf die gemeldete
     * Löschung nicht kippen.
     */
    /*
     * Seit dem 30.09.2026 löschen im Speicher nur Leitung, zuständiger
     * Partner, Backoffice, Vertriebsleitung, Finanzierungspartner (bei
     * Finanzierungsunterlagen) und der Kunde selbst. Lehnt der Speicher ab,
     * meldet er keinen Fehler, sondern entfernt einfach nichts. Das sagen
     * wir dann, statt es still zu übergehen.
     */
    let dateiEntfernt = false;
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.storage.from("unterlagen").remove([ang.storagePath]);
      dateiEntfernt = !error && Array.isArray(data) && data.length > 0;
      if (error) console.warn("Datei im Speicher nicht entfernt", error.message);
    } catch (e) { console.warn("Datei im Speicher nicht entfernt", e); }
    // Kunden sehen im Portal eine eigene Karte mit eigenen Texten.
    if (!dateiEntfernt && !isKunde) {
      toast({
        title: "Datei bleibt im Speicher",
        description: "Der Darlehensvertrag ist aus der Eigenfinanzierung entfernt. Die Datei selbst darf deine Rolle nicht löschen; das übernimmt bei Bedarf die Leitung.",
      });
    }
    addAktivitaet({
      kundeId,
      art: "notiz",
      beschreibung: `Eigenfinanzierung: Darlehensvertrag „${ang.fileName}" entfernt von ${user.name}`,
      von: user.name,
    });
    toast({ title: "Darlehensvertrag entfernt" });
  };

  // ── VP bestätigt → Pipeline → Notar ──
  const handleConfirmFinal = () => {
    if (!unterlagenVollstaendig) {
      toast({ title: "Unterlagen unvollständig", description: "Der Kunde muss das Finanzierungsangebot und mindestens einen unterschriebenen Darlehensvertrag hochladen.", variant: "destructive" });
      return;
    }
    bestaetigeVP(investmentId, user.name || "VP", currentUserId);
    setState(getEigenfinanzierung(investmentId));
    addAktivitaet({ kundeId, art: "notiz", beschreibung: `Eigenfinanzierung bestätigt durch ${user.name}, die Pipeline steht auf Notar`, von: user.name });
    notifyByRole(["finanzierungspartner", "admin", "inhaber"], {
      titel: "Eigenfinanzierung bestätigt",
      nachricht: `${kundeName}: ${user.name} hat die Eigenfinanzierung bestätigt. Die Pipeline steht auf Notar.`,
      link: `/kunden/${kundeId}?tab=investments&investment=${investmentId}#finanzierung`,
    });
    notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.finanzierungBestaetigt[sprache](), link: `/kunde/investments` }));
    toast({ title: "Bestätigt, die Pipeline steht auf Notar" });
    onConfirmed?.();
  };

  // ── Render ──
  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

  return (
    <div className="mb-4 border rounded-lg p-4 bg-primary/5 border-primary/30">
      <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

      {/*
        Titel links, „Aktiv“ rechts. Wie bei den Kennzeichen weiter unten gibt
        der Titel nach (`min-w-0`), das Kennzeichen bleibt einzeilig.
      */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Banknote className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h4 className="font-bold text-sm">Eigenfinanzierung durch Kunde</h4>
            <p className="text-xs text-muted-foreground">Der Kunde finanziert über eine externe Bank. Er lädt die Unterlagen hoch, du bestätigst.</p>
          </div>
        </div>
        {state.aktiv && (
          <Badge className="bg-primary text-primary-foreground shrink-0">Aktiv</Badge>
        )}
      </div>

      {!state.aktiv && canActivate && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Aktiviere diesen Modus, wenn der Kunde seine Finanzierung über eine eigene Bank abwickelt. Der Standard-more.immo-Flow bleibt parallel verfügbar, falls du auf ein Gegenangebot umschwenken willst (Hybrid).
          </p>
          <Button size="sm" onClick={() => setConfirmActivate(true)} className={`${UMBRECHENDER_KNOPF} max-w-full`}>
            <Banknote className="h-3.5 w-3.5" /> Kunde finanziert selbst aktivieren
          </Button>
        </div>
      )}

      {state.aktiv && (
        <div className="space-y-4">
          {/* Aktivierungsinfo */}
          <div className="text-xs bg-background/60 rounded p-2 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p>Aktiviert von <span className="font-semibold">{state.aktiviertVonName}</span> am {fmt(state.aktiviertAm)}.</p>
              {state.hinweis && <p className="mt-1 italic">„{state.hinweis}"</p>}
            </div>
          </div>

          {/* Kunden-Unterlagen */}
          <div className="border rounded p-3 bg-background space-y-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unterlagen vom Kunden</h5>
            {/*
              Das Finanzierungsangebot bleibt bei genau einem. Am Ende gibt es
              nur eine Bankzusage, Darlehensverträge können dagegen mehrere
              sein, etwa bei zwei Darlehen oder einer nachgereichten Fassung.

              Christian am 17.09.2026: „Ausstehend" brach mitten im Wort um, zu
              „Ausstehe" und „nd". Das Kennzeichen ist ein Flex-Element und darf
              deshalb von Haus aus schrumpfen. Dazu kommt, dass der
              Arbeitsbereich des Kundenprofils `overflow-wrap: anywhere` vererbt,
              damit lange Kennungen nicht aus der Karte laufen. Beides zusammen
              trennt ein einzelnes Wort an beliebiger Stelle. `shrink-0` und
              `whitespace-nowrap` halten das Kennzeichen in einer Zeile.
              Nachgeben soll stattdessen die Beschriftung links, deshalb bekommt
              sie `min-w-0` und bricht zwischen den Wörtern um.
            */}
            <div className="border rounded p-2 bg-muted/30">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="min-w-0 text-xs font-medium [overflow-wrap:break-word]">Finanzierungsangebot (Bankzusage)</span>
                {state.kundenAngebot
                  ? <Badge variant="outline" className="shrink-0 whitespace-nowrap bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30 text-[10px]">Hochgeladen</Badge>
                  : <Badge variant="outline" className="shrink-0 whitespace-nowrap bg-destructive/10 text-destructive border-destructive/30 text-[10px]">Ausstehend</Badge>}
              </div>
              {state.kundenAngebot ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-xs">
                    <p className="font-medium">{state.kundenAngebot.fileName}</p>
                    <p className="text-muted-foreground">Von {state.kundenAngebot.uploadedByName} ({state.kundenAngebot.uploadedByRole}) am {fmt(state.kundenAngebot.uploadedAt)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs gap-1.5 shrink-0" onClick={() => openUnterlage(state.kundenAngebot!.storagePath)}>
                    <Download className="h-3 w-3" /> Öffnen
                  </Button>
                </div>
              ) : canUploadKunde ? (
                /*
                 * Auf dem Telefon steht auf dem Knopf nur "Hochladen".
                 *
                 * Christian am 17.09.2026: Der ausgeschriebene Knopf ragte aus
                 * dem Kasten heraus. Er hat recht, die Bezeichnung steht zwei
                 * Zeilen darueber ohnehin als Ueberschrift. Fuer
                 * Bildschirmleser bleibt sie ueber `aria-label` am Knopf, die
                 * lesen die Ueberschrift naemlich nicht mit vor. Ab 640 Pixel
                 * steht wieder der volle Text. Ist der Kasten dann schmaler als
                 * diese Beschriftung, bricht sie um, siehe `HOCHLADE_KNOPF`.
                 */
                <Button size="sm" variant="outline" className={HOCHLADE_KNOPF} disabled={uploading === "kundeFA"} aria-label="Finanzierungsangebot (Bankzusage) hochladen" onClick={() => triggerUpload("kundeFA")}>
                  {uploading === "kundeFA" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  <span className="sm:hidden">Hochladen</span>
                  <span className="hidden sm:inline">Finanzierungsangebot (Bankzusage) hochladen</span>
                </Button>
              ) : (
                <p className="text-[11px] text-muted-foreground">Wartet auf Upload durch den Kunden.</p>
              )}
            </div>

            <div className="border rounded p-2 bg-muted/30">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="min-w-0 text-xs font-medium [overflow-wrap:break-word]">Darlehensvertrag (unterschrieben)</span>
                {darlehensvertraege.length > 0
                  ? <Badge variant="outline" className="shrink-0 whitespace-nowrap bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30 text-[10px]">{darlehensvertraege.length === 1 ? "Hochgeladen" : `${darlehensvertraege.length} hochgeladen`}</Badge>
                  : <Badge variant="outline" className="shrink-0 whitespace-nowrap bg-destructive/10 text-destructive border-destructive/30 text-[10px]">Ausstehend</Badge>}
              </div>
              {darlehensvertraege.length > 0 && (
                <div className="space-y-2 mb-2">
                  {darlehensvertraege.map((ang) => (
                    <div key={ang.storagePath} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-xs">
                        <p className="font-medium">{ang.fileName}</p>
                        <p className="text-muted-foreground">Von {ang.uploadedByName} ({ang.uploadedByRole}) am {fmt(ang.uploadedAt)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => openUnterlage(ang.storagePath)}>
                          <Download className="h-3 w-3" /> Öffnen
                        </Button>
                        {canUploadKunde && (
                          <Button size="sm" variant="ghost" className="text-xs px-2 text-muted-foreground hover:text-destructive" aria-label={`${ang.fileName} löschen`} onClick={() => handleDeleteDarlehensvertrag(ang)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {canUploadKunde ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={HOCHLADE_KNOPF}
                  disabled={uploading === "kundeDV"}
                  aria-label={darlehensvertraege.length > 0 ? "Weiteren Darlehensvertrag hinzufügen" : "Darlehensvertrag (unterschrieben) hochladen"}
                  onClick={() => triggerUpload("kundeDV")}
                >
                  {uploading === "kundeDV"
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : darlehensvertraege.length > 0 ? <Plus className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
                  <span className="sm:hidden">{darlehensvertraege.length > 0 ? "Weiterer Vertrag" : "Hochladen"}</span>
                  <span className="hidden sm:inline">{darlehensvertraege.length > 0 ? "Weiteren Darlehensvertrag hinzufügen" : "Darlehensvertrag (unterschrieben) hochladen"}</span>
                </Button>
              ) : darlehensvertraege.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Wartet auf Upload durch den Kunden.</p>
              ) : null}
            </div>
          </div>

          {/* Gegenangebot more.immo (Hybrid) */}
          {(state.gegenAngebot || state.gegenDarlehensvertrag || canUploadGegen) && (
            <div className="border rounded p-3 bg-background space-y-3">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gegenangebot more.immo (optional)</h5>
              {(["gegenFA","gegenDV"] as const).map((slot) => {
                const isDV = slot === "gegenDV";
                const ang = isDV ? state.gegenDarlehensvertrag : state.gegenAngebot;
                const label = isDV ? "Darlehensvertrag (Gegenangebot)" : "Finanzierungsangebot (Gegenangebot)";
                return (
                  <div key={slot} className="border rounded p-2 bg-muted/30">
                    {/* Gleiche Überlegung wie oben bei den Kundenunterlagen. */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="min-w-0 text-xs font-medium [overflow-wrap:break-word]">{label}</span>
                      {ang && <Badge variant="outline" className="shrink-0 whitespace-nowrap bg-primary/10 text-primary border-primary/30 text-[10px]">Hochgeladen</Badge>}
                    </div>
                    {ang ? (
                      /* Wie bei den Kundenunterlagen: der Dateiname gibt nach, „Öffnen“ bleibt ganz. */
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 text-xs">
                          <p className="font-medium">{ang.fileName}</p>
                          <p className="text-muted-foreground">Von {ang.uploadedByName} am {fmt(ang.uploadedAt)}</p>
                        </div>
                        <Button size="sm" variant="outline" className="text-xs gap-1.5 shrink-0" onClick={() => openUnterlage(ang.storagePath)}>
                          <Download className="h-3 w-3" /> Öffnen
                        </Button>
                      </div>
                    ) : canUploadGegen ? (
                      /* Gleiche Ueberlegung wie oben beim Kundenknopf. */
                      <Button size="sm" variant="outline" className={HOCHLADE_KNOPF} disabled={uploading === slot} aria-label={`${label} hochladen`} onClick={() => triggerUpload(slot)}>
                        {uploading === slot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        <span className="sm:hidden">Hochladen</span>
                        <span className="hidden sm:inline">{label} hochladen</span>
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* VP-Bestätigung → Notar */}
          <div className="border rounded p-3 bg-background">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Finale Bestätigung</h5>
            {state.vpBestaetigt ? (
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
                <span className="min-w-0">Bestätigt von <span className="font-semibold">{state.vpBestaetigt.vonName}</span> am {fmt(state.vpBestaetigt.datum)}. Die Pipeline steht auf Notar.</span>
              </div>
            ) : canConfirmFinal ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Prüfe die Bankzusage des Kunden und bestätige sie hier. Danach springt die Pipeline auf Notar.</p>
                <Button size="sm" disabled={!unterlagenVollstaendig} onClick={handleConfirmFinal} className={`${UMBRECHENDER_KNOPF} w-full`}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Finanzierung bestätigen und weiter zum Notar
                </Button>
                {!unterlagenVollstaendig && (
                  <p className="text-[11px] text-muted-foreground">Erst möglich, wenn der Kunde das Finanzierungsangebot und mindestens einen unterschriebenen Darlehensvertrag hochgeladen hat.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Wartet auf Bestätigung durch den Vertriebspartner.</p>
            )}
          </div>

          {/* Deaktivieren – nur Admin */}
          {canDeactivate && (
            <div className="pt-2 border-t">
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setConfirmDeactivate(true)}>
                Eigenfinanzierung aufheben
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Aktivierungs-Dialog mit Warnung + Hinweis */}
      <AlertDialog open={confirmActivate} onOpenChange={setConfirmActivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
              Eigenfinanzierung aktivieren?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Der Kunde übernimmt die Finanzierung selbst über eine externe Bank. Die Standard-more.immo-Finanzierung läuft parallel weiter und kann jederzeit reaktiviert werden (Hybrid für Gegenangebot).</p>
                <p className="text-xs text-muted-foreground">Kunde, Finanzierungspartner und Admin werden informiert. Aufgabe „Angebot hochladen" geht an den Kunden.</p>
                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="ef-hinweis" className="text-xs">Hinweis (optional)</Label>
                  <Textarea id="ef-hinweis" value={hinweis} onChange={e => setHinweis(e.target.value)} placeholder="z.B. Kunde hat Bestandsbeziehung zur Hausbank" className="text-xs" rows={2} />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate}>Aktivieren</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eigenfinanzierung aufheben?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Modus wird deaktiviert und die Finanzierung läuft wieder regulär über more.immo. Bisher hochgeladene Dokumente bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate}>Aufheben</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}