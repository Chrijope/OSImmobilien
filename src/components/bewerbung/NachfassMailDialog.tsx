import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cacheReload } from "@/lib/dataCache";
import {
  KL_NACHFASS_BETREFF,
  nachfassMailAlsText,
  type NachfassAusschluss,
} from "../../../supabase/functions/_shared/bewerber-nachfass";

/**
 * Der Bestätigungsdialog für „Sammelmail zum Kennenlernen senden".
 *
 * Beim Öffnen holt er die Vorschau aus `send-bewerber-nachfass`: Empfänger
 * und Ausgeschlossene mit Grund. Die Function rechnet beides, nicht das CRM,
 * damit Dialog und Versand dieselbe Liste sehen. Fehlt die Migration, sagt
 * der Dialog das und sperrt den Knopf. Erst „Jetzt senden" schickt.
 *
 * Alles im CRM-Stil (AlertDialog, Alert, Badge), kein Browser-Fenster.
 */

interface Vorschau {
  betreff: string;
  empfaenger: Array<{ id: string; name: string; email: string }>;
  ausgeschlossen: NachfassAusschluss[];
  migrationFehlt: boolean;
}

interface Ergebnis {
  gesendet: number;
  fehlgeschlagen: Array<{ id: string; name: string; grund: string }>;
  uebersprungen: number;
}

/** Bei Edge-Function-Fehlern steckt die eigentliche Meldung im Response-Body. */
async function fehlerText(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: { text?: () => Promise<string> } })?.context;
  let detail = "";
  try { detail = ctx && typeof ctx.text === "function" ? await ctx.text() : ""; } catch { /* egal */ }
  try { detail = JSON.parse(detail)?.error || detail; } catch { /* kein JSON */ }
  return detail || (error as { message?: string })?.message || fallback;
}

export function NachfassMailDialog({
  open,
  onOpenChange,
  onGesendet,
}: {
  open: boolean;
  onOpenChange: (offen: boolean) => void;
  /** Nach einem Lauf, damit die Liste die neuen Vermerke zeigt. */
  onGesendet?: () => void;
}) {
  const [laedt, setLaedt] = useState(false);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [ladeFehler, setLadeFehler] = useState("");
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    if (!open) return;
    let abgebrochen = false;
    setLaedt(true);
    setLadeFehler("");
    setVorschau(null);
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("send-bewerber-nachfass", { body: { modus: "vorschau" } });
        if (abgebrochen) return;
        if (error) throw new Error(await fehlerText(error, "Vorschau konnte nicht geladen werden"));
        if (data?.error) throw new Error(String(data.error));
        setVorschau({
          betreff: data?.betreff || KL_NACHFASS_BETREFF,
          empfaenger: Array.isArray(data?.empfaenger) ? data.empfaenger : [],
          ausgeschlossen: Array.isArray(data?.ausgeschlossen) ? data.ausgeschlossen : [],
          migrationFehlt: !!data?.migrationFehlt,
        });
      } catch (e) {
        if (!abgebrochen) setLadeFehler(e instanceof Error ? e.message : "Vorschau konnte nicht geladen werden");
      } finally {
        if (!abgebrochen) setLaedt(false);
      }
    })();
    return () => { abgebrochen = true; };
  }, [open]);

  const senden = async () => {
    if (!vorschau || vorschau.migrationFehlt || vorschau.empfaenger.length === 0) return;
    setSendet(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-bewerber-nachfass", { body: { modus: "senden" } });
      if (error) throw new Error(await fehlerText(error, "Versand fehlgeschlagen"));
      if (data?.error) throw new Error(String(data.error));
      const ergebnis: Ergebnis = {
        gesendet: Number(data?.gesendet) || 0,
        fehlgeschlagen: Array.isArray(data?.fehlgeschlagen) ? data.fehlgeschlagen : [],
        uebersprungen: Number(data?.uebersprungen) || 0,
      };
      const teile = [`${ergebnis.gesendet} gesendet`];
      if (ergebnis.fehlgeschlagen.length) teile.push(`${ergebnis.fehlgeschlagen.length} fehlgeschlagen`);
      if (ergebnis.uebersprungen) teile.push(`${ergebnis.uebersprungen} übersprungen`);
      // Kompakt statt Namensliste: Bei vielen Fehlschlaegen ist meist eine
      // gemeinsame Ursache schuld, die steht dann genau einmal da.
      const gruende = Array.from(new Set(ergebnis.fehlgeschlagen.map((f) => f.grund)));
      const beispiele = ergebnis.fehlgeschlagen.slice(0, 3).map((f) => f.name).join(", ");
      const nichtErreichtText = ergebnis.fehlgeschlagen.length
        ? ` Nicht erreicht: ${beispiele}${ergebnis.fehlgeschlagen.length > 3 ? ` und ${ergebnis.fehlgeschlagen.length - 3} weitere` : ""}. Grund: ${gruende.slice(0, 2).join(" / ")}`
        : "";
      toast({
        title: ergebnis.gesendet ? "Sammelmail verschickt" : "Sammelmail nicht verschickt",
        description: teile.join(", ") + "." + nichtErreichtText,
        variant: ergebnis.fehlgeschlagen.length && !ergebnis.gesendet ? "destructive" : undefined,
      });
      // Die Vermerke hat der Server geschrieben; der Cache kennt sie noch nicht.
      await cacheReload("bewerbungen");
      onGesendet?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Versand fehlgeschlagen",
        description: e instanceof Error ? e.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setSendet(false);
    }
  };

  const anzahl = vorschau?.empfaenger.length ?? 0;
  const sendenErlaubt = !!vorschau && !vorschau.migrationFehlt && anzahl > 0 && !sendet && !laedt;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!sendet) onOpenChange(o); }}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Sammelmail zum Kennenlernen senden?</AlertDialogTitle>
          <AlertDialogDescription>
            Jeder Bewerber im Status Eingang bekommt diese Mail genau einmal, mit seinem eigenen Link zum
            Kennenlernbogen. Übersprungen wird, wer den Kennenlernbogen schon abgeschickt hat, wer die Mail
            schon bekommen hat oder keine Mailadresse hinterlegt hat. Wer nur den früheren Vorab-Bogen
            ausgefüllt hat, bekommt sie: Das ist ein anderer Bogen, das Kennenlernen hat er noch nicht
            gesehen. Ein zweiter Lauf nimmt nur die Übrigen.

            Die Sammelmail startet keine neue Erinnerungsrunde. Wer schon eingeladen war, behält seine
            laufende Kette (Tag 3 und Tag 11), sie ruht nur am Tag der Sammelmail. Wer noch nie eingeladen
            war, bekommt keine Erinnerungen.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {laedt && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Empfänger werden ermittelt …
            </div>
          )}

          {ladeFehler && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Vorschau nicht möglich</AlertTitle>
              <AlertDescription>{ladeFehler}</AlertDescription>
            </Alert>
          )}

          {vorschau?.migrationFehlt && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Migration noch nicht ausgeführt</AlertTitle>
              <AlertDescription>
                Die Tabelle für die Abmelde-Links (bewerber_abmeldung) fehlt noch in Supabase. Bitte zuerst die
                Migration 20260902160000_bewerber_abmeldung.sql im SQL-Editor ausführen, sonst hätte die Mail
                keinen gültigen Link „Kein Interesse mehr".
              </AlertDescription>
            </Alert>
          )}

          {vorschau && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary" className="text-xs">{anzahl} Empfänger</Badge>
                {vorschau.ausgeschlossen.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {vorschau.ausgeschlossen.length} übersprungen
                  </Badge>
                )}
                <span className="text-muted-foreground">Absenderin ist die HR-Managerin aus dem Profil.</span>
              </div>

              {anzahl === 0 && !vorschau.migrationFehlt && (
                <p className="text-sm text-muted-foreground">
                  Niemand wartet gerade auf diese Mail: Alle im Eingang haben sie schon bekommen oder haben keine Mailadresse.
                </p>
              )}

              <section className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Betreff</p>
                <p className="mb-3 text-sm font-semibold">{vorschau.betreff}</p>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Text (Vorname wird je Empfänger eingesetzt)</p>
                <div className="space-y-2 text-sm leading-relaxed">
                  {nachfassMailAlsText("Max").map((absatz, i) => (
                    <p key={i} className={absatz.startsWith("[") ? "font-medium text-primary" : ""}>{absatz}</p>
                  ))}
                </div>
              </section>

              {vorschau.empfaenger.length > 0 && (
                <section>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Empfänger</p>
                  <ul className="max-h-40 divide-y overflow-y-auto rounded-lg border text-sm">
                    {vorschau.empfaenger.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <span className="truncate">{e.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{e.email}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {vorschau.ausgeschlossen.length > 0 && (
                <section>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Übersprungen</p>
                  <ul className="max-h-40 divide-y overflow-y-auto rounded-lg border text-sm">
                    {vorschau.ausgeschlossen.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <span className="truncate">{a.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {a.grund === "Mail schon erhalten" && a.am
                            ? `${a.grund} am ${new Date(a.am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`
                            : a.grund}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={sendet}>Abbrechen</AlertDialogCancel>
          <Button onClick={() => { void senden(); }} disabled={!sendenErlaubt} className="gap-2">
            {sendet ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {sendet ? "Wird gesendet …" : anzahl > 0 ? `Jetzt an ${anzahl} senden` : "Jetzt senden"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
