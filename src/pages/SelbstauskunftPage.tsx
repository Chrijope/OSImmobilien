import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, Save, Send, Mail, CheckCircle2, Loader2 } from "lucide-react";
import { SelbstauskunftForm } from "@/components/selbstauskunft/SelbstauskunftForm";
import { getKontaktById } from "@/lib/kundenStore";
import { updateInvestment, setSaEditStatus, setSaSignaturePending } from "@/lib/investmentsStore";
import { updateKontakt } from "@/lib/kundenStore";
import { addGeteilteAufgabe } from "@/lib/aktivitaetenStore";
import { sendeSelbstauskunftEinladung, hatAngefangenenStand } from "@/lib/selbstauskunftEinladung";
import { getSaInvitationSentAt } from "@/lib/investmentsStore";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { saLadeschritt } from "@/lib/saLadezeit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function SelbstauskunftPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const kundeId = searchParams.get("kundeId") || "";
  const investmentId = searchParams.get("investmentId") || "";
  const isEditMode = searchParams.get("edit") === "true";
  const { toast } = useToast();
  const { user, authUser } = useUser();
  const [sendeDialogOffen, setSendeDialogOffen] = useState(false);
  const [sendeLaeuft, setSendeLaeuft] = useState(false);
  // Ziel aus der Beratungspräsentation, wird im Formular vorbelegt.
  const vorgewaehltesZiel = searchParams.get("ziel") || "";

  const cachedKunde = getKontaktById(kundeId);
  const [kunde, setKunde] = useState<any>(cachedKunde || null);
  /*
   * Gewartet wird nur, wenn der Kontakt noch gar nicht da ist.
   *
   * Vorher stand hier `useState(!!kundeId)`: Die Seite zeigte immer erst
   * "Lade Kundendaten ...", auch wenn der Kontakt langst im Zwischenspeicher
   * lag, weil der Nutzer gerade aus der Kundenakte kam. Das Formular erschien
   * erst nach dem Umweg ueber die Anmeldepruefung und eine Abfrage der Tabelle
   * `kontakte`, also nach einem vollen Weg zum Server. Genau das war die
   * Wartezeit beim Oeffnen der Selbstauskunft.
   *
   * Die Abfrage laeuft unveraendert weiter, nur eben im Hintergrund. Wer die
   * Adresse direkt aufruft (neuer Tab, Neuladen), sieht weiterhin den
   * Ladehinweis, denn dann gibt es wirklich noch nichts zu zeigen.
   */
  const [loading, setLoading] = useState(!!kundeId && !cachedKunde);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    saLadeschritt("Seite der Selbstauskunft aufgebaut");
    if (!kundeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const mapRow = (data: any) => ({
      id: data.id,
      vorname: data.vorname,
      nachname: data.nachname,
      email: data.email || "",
      telefon: data.telefon || "",
      strasse: data.strasse || "",
      hausnummer: data.hausnummer || "",
      plz: data.plz || "",
      ort: data.ort || "",
      anrede: data.anrede || "Herr",
      geburtstag: (data.meta as any)?.geburtstag || "",
      // Einkuenfte und Ausgaben werden bewusst nicht mehr uebergeben: Zahlen
      // liegen am Investment, nicht am Kontakt.
      person2: (data.meta as any)?.person2 || null,
    });

    // Cache zuerst (sofort verfügbar, kein Flackern)
    const fromCache = getKontaktById(kundeId);
    if (fromCache) {
      setKunde(fromCache);
      // Der Kontakt ist da, also kann das Formular sofort gezeichnet werden.
      // Die Abfrage unten laeuft trotzdem und bringt den Stand der Datenbank
      // nach, sie haelt aber nichts mehr auf.
      setLoading(false);
      saLadeschritt("Kunde aus dem Zwischenspeicher, kein Warten");
    } else {
      saLadeschritt("Kunde nicht im Zwischenspeicher, Abfrage laeuft");
    }

    // DB-Fetch immer ausführen (source of truth, mit Retries für neuen Tab,
    // in dem die Auth-Session evtl. noch nicht hydriert ist)
    (async () => {
      const abfrageStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      // Auf Auth-Session warten (kann im neuen Tab/nach Full-Reload kurz dauern)
      const sessionDeadline = Date.now() + 8000;
      while (Date.now() < sessionDeadline) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) break;
        await new Promise((r) => setTimeout(r, 250));
      }

      const maxAttempts = 8;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const { data, error } = await supabase
            .from("kontakte")
            .select("*")
            .eq("id", kundeId)
            .maybeSingle();
          if (cancelled) return;
          if (error) throw error;
          if (data) {
            setKunde(mapRow(data));
            setFetchError(null);
            setLoading(false);
            const dauer = Math.round(
              (typeof performance !== "undefined" ? performance.now() : Date.now()) - abfrageStart,
            );
            saLadeschritt(`Kunde aus der Datenbank geholt (Abfrage ${dauer} ms)`);
            return;
          }
        } catch (e: any) {
          console.error(`SA fetch attempt ${attempt} failed:`, e);
          if (attempt === maxAttempts) {
            setFetchError(e?.message || "Unbekannter Fehler beim Laden");
          }
        }
        // Backoff zwischen Versuchen (bis ~6s gesamt)
        await new Promise((r) => setTimeout(r, 500 + 250 * attempt));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [kundeId]);

  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signatureSent, setSignatureSent] = useState(false);
  const [pendingNavigate, setPendingNavigate] = useState<string | null>(null);
  const formApiRef = useRef<{ saveDraft: () => Promise<void> } | null>(null);

  // Browser tab close / refresh warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Intercept browser back button via popstate
  useEffect(() => {
    window.history.pushState({ selfauskunft: true }, "");

    const handlePopState = () => {
      setShowLeaveDialog(true);
      setPendingNavigate(`/kunden/${kundeId}`);
      window.history.pushState({ selfauskunft: true }, "");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [kundeId]);

  const handleBackClick = useCallback(() => {
    setPendingNavigate(`/kunden/${kundeId}`);
    setShowLeaveDialog(true);
  }, [kundeId]);

  const confirmLeave = useCallback(() => {
    setShowLeaveDialog(false);
    navigate(pendingNavigate || `/kunden/${kundeId}`);
  }, [navigate, pendingNavigate, kundeId]);

  const handleSaveAndLeave = useCallback(async () => {
    try {
      await formApiRef.current?.saveDraft();
    } catch (e) {
      console.warn("[SA] saveDraft before leave failed", e);
    }
    setShowLeaveDialog(false);
    navigate(pendingNavigate || `/kunden/${kundeId}`);
  }, [navigate, pendingNavigate, kundeId]);

  /*
   * Den angefangenen Stand dem Kunden zum Fertigmachen schicken.
   *
   * Der haeufige Fall aus der Praxis: Berater und Kunde fuellen im Termin
   * gemeinsam aus, die Zeit reicht nicht, der Kunde macht zu Hause weiter.
   * Bisher musste der Berater dafuer das Formular verlassen und in der
   * Kundenakte den richtigen Knopf suchen.
   */
  const [erneuterVersand, setErneuterVersand] = useState(false);
  const anKundenSenden = useCallback(async () => {
    if (!investmentId || !kunde) return;
    if (!kunde.email) {
      toast({
        title: "Keine E-Mail-Adresse",
        description: "Beim Kunden ist keine E-Mail hinterlegt. Bitte zuerst in den Stammdaten ergänzen.",
        variant: "destructive",
      });
      return;
    }
    setErneuterVersand(!!getSaInvitationSentAt(investmentId));
    setSendeDialogOffen(true);
  }, [investmentId, kunde, toast]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Lade Kundendaten…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!kunde) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">
            Kunde nicht gefunden.
            {kundeId && (
              <span className="block text-xs mt-1 opacity-70">ID: {kundeId}</span>
            )}
          </p>
          {fetchError && (
            <p className="text-xs text-destructive max-w-md text-center">{fetchError}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>Erneut versuchen</Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>Zurück</Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const sendenBestaetigt = async () => {
    if (!investmentId || !kunde?.email) return;
    setSendeLaeuft(true);
    try {
      const kundeName = `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim();
      await sendeSelbstauskunftEinladung({
        kontaktId: kundeId,
        investmentId,
        kundeName,
        kundeEmail: kunde.email,
        absenderName: user?.name || "",
        beraterId: (kunde as any)?.zustaendig_id || authUser?.id,
        erneut: erneuterVersand,
      });
      setSendeDialogOffen(false);
      toast({
        title: erneuterVersand ? "Erneut versendet ✓" : "An den Kunden versendet ✓",
        description: `${kundeName} kann die Selbstauskunft jetzt fertig ausfüllen und unterschreiben.`,
      });
      navigate(`/kunden/${kundeId}`);
    } catch (err: any) {
      toast({
        title: "Fehler",
        description: err?.message || "Die Einladung konnte nicht gesendet werden.",
        variant: "destructive",
      });
    } finally {
      setSendeLaeuft(false);
    }
  };

  return (
    <DashboardLayout>
      {/*
        Volle Breite statt der frueheren Begrenzung auf max-w-5xl. Die gewonnene
        Breite wird im Formular in zusaetzliche Spalten umgesetzt, nicht in
        breitere Felder.
      */}
      {/*
        Hoehe am Fenster, nicht am Inhalt.

        Gemessen am 15.09.2026 in der Vorschau: `h-full` (also 100 Prozent)
        bezieht sich auf den Elternbereich, und der ist hier nur so hoch wie
        sein Inhalt. Bei einem 1122 Pixel hohen Fenster endete deshalb alles
        schon bei 856 Pixeln, und die Knopfleiste stand 266 Pixel ueber dem
        unteren Rand, bei jedem Abschnitt woanders. `100dvh` nimmt die
        tatsaechliche Fensterhoehe, auch auf dem Telefon mit ein- und
        ausfahrender Adresszeile.

        `overflow-hidden` haelt alles im Fenster, gescrollt wird nur der
        Karteninhalt im Formular. Das Innenmass gibt ringsum denselben
        Abstand zum Bildschirmrand.
      */}
      <div className="flex h-[100dvh] w-full flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Zurück" onClick={handleBackClick}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{isEditMode ? "Selbstauskunft bearbeiten" : "Online-Selbstauskunft"}</h1>
            <p className="text-sm text-muted-foreground">{kunde.vorname} {kunde.nachname}</p>
            {isEditMode && (
              <p className="text-xs text-[hsl(var(--warning))] mt-1">⚠ Bearbeitungsmodus – Änderungen müssen erneut unterschrieben werden</p>
            )}
          </div>
        </div>

        {/*
        Der Dialog sagt ausdruecklich, dass der angefangene Stand mitgeht.
        Vorher stand hier nur "Link zum eigenstaendigen Ausfuellen", was sich
        wie "der Kunde faengt von vorne an" liest. Genau deshalb hat niemand
        den Knopf benutzt, wenn er ihn am noetigsten gebraucht haette.
      */}
      <AlertDialog open={sendeDialogOffen} onOpenChange={setSendeDialogOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {erneuterVersand ? "Selbstauskunft erneut senden?" : "Selbstauskunft an den Kunden senden?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-sm">
              <span className="block">
                {kunde?.vorname} {kunde?.nachname} bekommt eine E-Mail an {kunde?.email} mit einem
                Link zur Selbstauskunft.
              </span>
              {investmentId && hatAngefangenenStand(investmentId) ? (
                <span className="block rounded-md bg-muted p-3">
                  <strong className="block mb-1">Deine bisherigen Eingaben werden mitgeschickt.</strong>
                  Der Kunde sieht alles, was du schon ausgefüllt hast, und macht dort weiter, wo du
                  aufgehört hast. Er muss nichts doppelt eintragen.
                </span>
              ) : (
                <span className="block">
                  Der Kunde füllt die Selbstauskunft eigenständig aus und unterschreibt sie.
                </span>
              )}
              <span className="block text-xs text-muted-foreground">
                Sobald der Kunde selbst etwas einträgt, gelten seine Angaben. Deine spätere Bearbeitung
                überschreibt sie nicht mehr.
              </span>
              {erneuterVersand && (
                <span className="block text-xs text-muted-foreground">
                  Der bisherige Link bleibt gültig, der Kunde erhält lediglich eine neue E-Mail.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendeLaeuft}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); sendenBestaetigt(); }}
              disabled={sendeLaeuft}
            >
              {sendeLaeuft ? "Wird gesendet ..." : erneuterVersand ? "Erneut senden" : "Jetzt senden"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Das Formular bekommt den Rest der Hoehe, damit seine Knopfleiste
          am unteren Bildschirmrand sitzt und nur der Karteninhalt scrollt. */}
      <div className="flex min-h-0 flex-1 flex-col">
      <SelbstauskunftForm
          kundeId={kundeId}
          investmentId={investmentId}
          prefillKontakt={kunde}
          onAnKundenSenden={investmentId ? anKundenSenden : undefined}
          isEditMode={isEditMode}
          vorgewaehltesZiel={vorgewaehltesZiel}
          registerApi={(api) => { formApiRef.current = api; }}
          onComplete={() => {
            if (investmentId) {
              // Mark signature as pending (PDF will be generated after all signatures)
              setSaSignaturePending(investmentId, true);

              if (isEditMode) {
                // In edit mode: show signature dialog instead of navigating away
                setShowSignatureDialog(true);
              } else {
                /*
                 * "selbstauskunft", nicht "bonitaetsunterlagen".
                 *
                 * Bis zur gedrehten Reihenfolge war die Bonitaet die naechste
                 * Stufe nach der Selbstauskunft. Jetzt liegt sie ganz hinten,
                 * hinter Objektauswahl und Reservierung. Wer hier weiter auf
                 * "bonitaetsunterlagen" setzt, schiebt den Kunden ueber zwei
                 * Stufen hinweg, die er noch gar nicht durchlaufen hat.
                 *
                 * Richtig ist die Stufe, in der er tatsaechlich steht: Die
                 * Selbstauskunft ist unterwegs, seine Unterschrift steht aus.
                 */
                updateInvestment(investmentId, { pipelineStufe: "selbstauskunft" });
                updateKontakt(kundeId, { pipelineStufe: "selbstauskunft", status: "kontaktiert" });
                navigate(`/kunden/${kundeId}`);
              }
            } else {
              navigate(`/kunden/${kundeId}`);
            }
          }}
        />
      </div>

      {/* Leave confirmation */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent className="max-w-[560px] w-[calc(100vw-2rem)] p-6 sm:p-8 rounded-3xl">
          <AlertDialogHeader className="space-y-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl font-semibold tracking-tight">
              Seite verlassen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground break-words whitespace-normal text-pretty">
              Hast du deine Daten über den Button{" "}
              <strong className="text-foreground font-semibold whitespace-nowrap">
                „Zwischenspeichern“
              </strong>{" "}
              gesichert? Falls nicht, gehen alle nicht gespeicherten Eingaben verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-col gap-2 pt-4 sm:space-x-0">
            <AlertDialogCancel className="mt-0 w-full rounded-full">
              Zurück zum Formular
            </AlertDialogCancel>
            <Button
              variant="outline"
              className="gap-1.5 w-full rounded-full"
              onClick={handleSaveAndLeave}
            >
              <Save className="h-4 w-4" /> Speichern & zurück
            </Button>
            <AlertDialogAction
              onClick={confirmLeave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full rounded-full"
            >
              Ohne Speichern verlassen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Signature send dialog (edit mode) */}
      <AlertDialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Zur Unterschrift versenden
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Die geänderte Selbstauskunft muss von allen Antragstellern erneut unterschrieben werden.</p>
              <div className="bg-muted rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Send className="h-3 w-3 text-primary" />
                  <span className="font-medium">Person 1:</span> {kunde.vorname} {kunde.nachname} ({kunde.email || "keine E-Mail"})
                </div>
                {kunde.person2 && (
                  <div className="flex items-center gap-2">
                    <Send className="h-3 w-3 text-primary" />
                    <span className="font-medium">Person 2:</span> {kunde.person2.vorname} {kunde.person2.nachname} ({kunde.person2.email || kunde.email || "keine E-Mail"})
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Nach Eingang der Unterschriften werden alle Berechnungen (Einnahmen, Bonitätsrahmen, Objektvorschläge) automatisch aktualisiert.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {signatureSent ? (
              <div className="w-full flex items-center gap-2 text-sm text-[hsl(var(--success))] justify-center py-2">
                <CheckCircle2 className="h-4 w-4" />
                Zur Unterschrift versendet – System wird nach Rücklauf aktualisiert.
              </div>
            ) : (
              <>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={() => {
                  setSaEditStatus(investmentId, "unterschrift_versendet");
                  // Notify backoffice
                  addGeteilteAufgabe({
                    titel: `SA-Änderung zur Unterschrift versendet: ${kunde.vorname} ${kunde.nachname}`,
                    beschreibung: `Die geänderte Selbstauskunft für ${kunde.vorname} ${kunde.nachname} wurde zur Unterschrift an Person 1${kunde.person2 ? " + Person 2" : ""} versendet. Nach Rücklauf werden alle Berechnungen aktualisiert.`,
                    prioritaet: "mittel",
                    typ: "aufgabe",
                    faellig_am: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
                    uhrzeit: "09:00",
                    kundeId: kundeId,
                    kundeName: `${kunde.vorname} ${kunde.nachname}`,
                  });
                  setSignatureSent(true);
                  setTimeout(() => navigate(`/kunden/${kundeId}`), 2000);
                }} className="gap-1.5">
                  <Send className="h-3 w-3" /> Jetzt versenden
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
