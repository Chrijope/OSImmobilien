import { cacheReload } from "@/lib/dataCache";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { findeBildAdressen, type BildBefund } from "@/lib/investagonBilder";
import { AlertTriangle, ChevronDown, Copy, Download, Loader2 } from "lucide-react";

/**
 * Verwaltungsdialog für den Investagon-Import, nur für Admin und Inhaber.
 *
 * Der Echtlauf ist erst anklickbar, nachdem in derselben Dialogsitzung ein
 * Trockenlauf gelaufen ist und sein Bericht angezeigt wurde. Das erzwingt die
 * Reihenfolge, ohne zu bevormunden; beim Schließen des Dialogs beginnt die
 * Sitzung von vorn. Die Rollenprüfung hier ist nur die Sichtbarkeit,
 * maßgeblich prüft die Edge Function selbst noch einmal auf Admin und
 * Inhaber.
 */

/** Bildzahlen im Antwortformat der Edge Function, siehe bilder.ts dort. */
interface BildBericht {
  uebernommen: number;
  uebersprungen: number;
  fehlgeschlagen: number;
  projekte: {
    name: string;
    quelle: "antwort" | "zip" | "keine";
    uebernommen: number;
    uebersprungen: number;
  }[];
}

/** Antwortformat der Edge Function investagon-import. */
interface Bericht {
  quelle: "api" | "daten";
  angelegt: string[];
  aktualisiert: string[];
  einheiten: number;
  fehler: string[];
  trockenlauf: boolean;
  unvollstaendig?: boolean;
  sollProjekte?: number;
  sollEinheiten?: number;
  offen?: number;
  bilder?: BildBericht;
}

const BILD_QUELLE_TEXT: Record<BildBericht["projekte"][number]["quelle"], string> = {
  antwort: "Bilder und Unterlagen aus den Downloadadressen",
  zip: "Bilder und Unterlagen aus dem Dokumentenpaket",
  keine: "keine neuen Medien übernommen",
};

const NICHT_AUSGEROLLT = "Die Funktion ist noch nicht ausgerollt. Bitte in Lovable ausrollen lassen.";

/**
 * Macht aus einem invoke-Fehler einen Satz, den ein Nicht-Programmierer
 * versteht. FunctionsFetchError und 404 bedeuten: Die Funktion gibt es auf dem
 * Server noch gar nicht. Bei allen anderen Fehlern steht die eigentliche
 * Meldung im Antwortrumpf, den FunctionsHttpError erst per
 * context.response.json() herausrückt (gleiches Muster wie in Aktivieren.tsx).
 */
async function fehlerVon(error: unknown): Promise<string> {
  const e = error as {
    name?: string;
    message?: string;
    context?: Response | { response?: Response };
  };
  if (e?.name === "FunctionsFetchError" || /Failed to send a request/i.test(e?.message || "")) {
    return NICHT_AUSGEROLLT;
  }
  const kontext = e?.context;
  const antwort: Response | undefined =
    kontext && typeof (kontext as Response).status === "number"
      ? (kontext as Response)
      : (kontext as { response?: Response } | undefined)?.response;
  if (antwort) {
    if (antwort.status === 404) return NICHT_AUSGEROLLT;
    try {
      const rumpf = await antwort.clone().json();
      if (rumpf?.error) return String(rumpf.error);
    } catch {
      // Rumpf war kein JSON, dann bleibt nur die allgemeine Meldung.
    }
  }
  return e?.message || "Unbekannter Fehler beim Aufruf.";
}

/**
 * Die Zahlen eines Berichts, gleich für Trockenlauf und Echtlauf. Beim
 * Echtlauf kommen die Bildzahlen dazu.
 */
function BerichtAnzeige({ bericht }: { bericht: Bericht }) {
  const echt = !bericht.trockenlauf;
  return (
    <div className="space-y-3">
      {bericht.quelle === "api" ? (
        <Badge className="bg-green-600 hover:bg-green-600 text-white">Quelle: Investagon-API</Badge>
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Die Investagon-API hat abgelehnt</AlertTitle>
          <AlertDescription>
            Dieser Bericht stammt aus der im System hinterlegten Ersatzliste, nicht aus
            Investagon. Er zeigt also nicht den aktuellen Stand. Der Grund steht in der
            Liste unten, oft fehlt ein Zugang oder eine Berechtigung.
          </AlertDescription>
        </Alert>
      )}

      {bericht.unvollstaendig && <Alert><AlertTitle>Teilimport</AlertTitle><AlertDescription>Die Laufzeitgrenze wurde erreicht. Starte den Import erneut, um weitere Projekte und Unterlagen zu übernehmen.</AlertDescription></Alert>}
      <div className="text-sm space-y-2">
        {bericht.sollProjekte !== undefined && <p>Aktueller API-Bestand: {bericht.sollProjekte} Projekte / {bericht.sollEinheiten} Wohnungen.</p>}
        {!bericht.trockenlauf && bericht.offen !== undefined && <p>Noch vollständig abzugleichen: {bericht.offen} Projekte.</p>}
        <p className="font-medium">
          {echt ? "Angelegt" : "Würde angelegt"}: {bericht.angelegt.length} {bericht.angelegt.length === 1 ? "Projekt" : "Projekte"}
        </p>
        {bericht.angelegt.length > 0 && (
          <ul className="list-disc pl-5 text-muted-foreground">
            {bericht.angelegt.map((name) => <li key={name}>{name}</li>)}
          </ul>
        )}
        <p className="font-medium">
          {echt ? "Aktualisiert" : "Würde aktualisiert"}: {bericht.aktualisiert.length} {bericht.aktualisiert.length === 1 ? "Projekt" : "Projekte"}
        </p>
        {bericht.aktualisiert.length > 0 && (
          <ul className="list-disc pl-5 text-muted-foreground">
            {bericht.aktualisiert.map((name) => <li key={name}>{name}</li>)}
          </ul>
        )}
        <p className="font-medium">Wohneinheiten insgesamt: {bericht.einheiten}</p>

        {bericht.bilder && (
          <>
            <p className="font-medium">
              Medien und Unterlagen: {bericht.bilder.uebernommen} übernommen, {bericht.bilder.uebersprungen} schon vorhanden,{" "}
              {bericht.bilder.fehlgeschlagen} fehlgeschlagen
            </p>
            {bericht.bilder.projekte.length > 0 && (
              <ul className="list-disc pl-5 text-muted-foreground">
                {bericht.bilder.projekte.map((p) => (
                  <li key={p.name}>
                    {p.name}: {BILD_QUELLE_TEXT[p.quelle] ?? p.quelle}
                    {p.quelle !== "keine" && ` (${p.uebernommen} übernommen, ${p.uebersprungen} schon vorhanden)`}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {bericht.fehler.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Hinweise und Fehler</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1">
              {bericht.fehler.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function InvestagonImportDialog() {
  const [offen, setOffen] = useState(false);

  // Trockenlauf
  const [laeuft, setLaeuft] = useState(false);
  const [bericht, setBericht] = useState<Bericht | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Echtlauf
  const [bilderMitladen, setBilderMitladen] = useState(true);
  // Ohne API-Schluessel: Daten aus dem Uebergabe-Paket im Speicher, siehe
  // supabase/functions/investagon-import/uebergabe.ts.
  const [ausUebergabe, setAusUebergabe] = useState(false);
  const [bestaetigungOffen, setBestaetigungOffen] = useState(false);
  const [echtLaeuft, setEchtLaeuft] = useState(false);
  const [echtBericht, setEchtBericht] = useState<Bericht | null>(null);
  const [echtFehler, setEchtFehler] = useState<string | null>(null);

  // Diagnose (Rohdaten)
  const [diagnoseOffen, setDiagnoseOffen] = useState(false);
  const [rohLaeuft, setRohLaeuft] = useState(false);
  const [rohText, setRohText] = useState<string | null>(null);
  const [rohFehler, setRohFehler] = useState<string | null>(null);
  const [bildBefund, setBildBefund] = useState<BildBefund | null>(null);

  /**
   * Beim Schließen alles zurücksetzen. Der Echtlauf soll nur nach einem
   * Trockenlauf derselben Sitzung möglich sein, ein alter Bericht von
   * gestern zählt nicht.
   */
  const oeffneOderSchliesse = (neu: boolean) => {
    setOffen(neu);
    if (!neu) {
      setBericht(null);
      setFehler(null);
      setEchtBericht(null);
      setEchtFehler(null);
      setBestaetigungOffen(false);
      setDiagnoseOffen(false);
      setRohText(null);
      setRohFehler(null);
      setBildBefund(null);
    }
  };

  const starteEchtlauf = async () => {
    setBestaetigungOffen(false);
    setEchtLaeuft(true);
    setEchtFehler(null);
    setEchtBericht(null);
    try {
      /*
        Nie aufräumen, also nie löschen.

        Ohne `aufraeumen: false` räumte die Function nach dem Lauf auf und
        löschte Investagon-Objekte, deren Kennung gerade nicht geliefert wurde,
        sofern weder Kunde noch Reservierung noch Verkauf daran hingen. Der
        Viertelstundenlauf ist seit dem 22.09.2026 schon auf "nicht aufräumen"
        gestellt, dieser Knopf war es nicht. Ein Klick hätte zum Beispiel ein
        Projekt gelöscht, das in Investagon nur kurz in "Überprüfung
        ausstehend" steht. Christian am 23.09.2026: Was in Investagon nicht
        angeboten wird, wird ausgeblendet, niemals gelöscht.
      */
      const { data, error } = await supabase.functions.invoke("investagon-import", {
        body: { bilder: bilderMitladen, aufraeumen: false, ...(ausUebergabe ? { quelle: "uebergabe" } : {}) },
      });
      if (error) {
        setEchtFehler(await fehlerVon(error));
        return;
      }
      if (data?.error) {
        setEchtFehler(String(data.error));
        return;
      }
      setEchtBericht(data as Bericht);
      await Promise.all(["objekte", "wohnungen", "objekt_bilder", "wohnungs_bilder", "objekt_dokumente", "wohnungs_dokumente"].map(cacheReload));
      toast({ title: data.unvollstaendig ? "Teilimport gespeichert" : data.fehler?.length ? "Import mit Hinweisen" : "Import abgeschlossen", description: data.unvollstaendig ? "Erneut starten, um weitere Projekte zu übernehmen." : "Der Bericht steht im Dialog." });
    } catch (e) {
      setEchtFehler(e instanceof Error ? e.message : "Unbekannter Fehler beim Aufruf.");
    } finally {
      setEchtLaeuft(false);
    }
  };

  const starteTrockenlauf = async () => {
    setLaeuft(true);
    setFehler(null);
    setBericht(null);
    try {
      const { data, error } = await supabase.functions.invoke("investagon-import", {
        body: { trockenlauf: true, ...(ausUebergabe ? { quelle: "uebergabe" } : {}) },
      });
      if (error) {
        setFehler(await fehlerVon(error));
        return;
      }
      if (data?.error) {
        setFehler(String(data.error));
        return;
      }
      setBericht(data as Bericht);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Unbekannter Fehler beim Aufruf.");
    } finally {
      setLaeuft(false);
    }
  };

  const ladeRohdaten = async () => {
    setRohLaeuft(true);
    setRohFehler(null);
    setRohText(null);
    setBildBefund(null);
    try {
      const { data, error } = await supabase.functions.invoke("investagon-import", {
        body: { roh: true },
      });
      if (error) {
        setRohFehler(await fehlerVon(error));
        return;
      }
      if (data?.error) {
        setRohFehler(String(data.error));
        return;
      }
      setRohText(JSON.stringify(data, null, 2));
      setBildBefund(findeBildAdressen(data));
    } catch (e) {
      setRohFehler(e instanceof Error ? e.message : "Unbekannter Fehler beim Aufruf.");
    } finally {
      setRohLaeuft(false);
    }
  };

  const kopiereRohdaten = async () => {
    if (!rohText) return;
    try {
      await navigator.clipboard.writeText(rohText);
      toast({ title: "Kopiert", description: "Die Rohdaten liegen jetzt in der Zwischenablage." });
    } catch {
      toast({ title: "Kopieren fehlgeschlagen", description: "Bitte den Text von Hand markieren und kopieren.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={offen} onOpenChange={oeffneOderSchliesse}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-1" /> Investagon-Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Investagon-Import</DialogTitle>
          <DialogDescription>
            Der Trockenlauf zeigt, welche Projekte aus Investagon angelegt oder aktualisiert würden.
            Er legt nichts an und ändert nichts, du kannst ihn gefahrlos starten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button onClick={starteTrockenlauf} disabled={laeuft}>
            {laeuft ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Trockenlauf läuft...
              </>
            ) : (
              "Trockenlauf starten"
            )}
          </Button>

          {fehler && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Trockenlauf nicht möglich</AlertTitle>
              <AlertDescription>{fehler}</AlertDescription>
            </Alert>
          )}

          {bericht && <BerichtAnzeige bericht={bericht} />}

          <div className="border rounded-md p-3 space-y-3">
            <p className="text-sm font-medium">Echtlauf</p>
            {!bericht && (
              <p className="text-sm text-muted-foreground">
                Der Echtlauf wird freigeschaltet, sobald in dieser Dialogsitzung ein Trockenlauf
                gelaufen ist.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={bilderMitladen}
                onCheckedChange={(wert) => setBilderMitladen(wert === true)}
                disabled={echtLaeuft}
              />
              Bilder und Unterlagen mitladen
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={ausUebergabe}
                onCheckedChange={(wert) => {
                  setAusUebergabe(wert === true);
                  // Ein Trockenlauf gilt nur fuer die Quelle, mit der er lief.
                  setBericht(null);
                }}
                disabled={laeuft || echtLaeuft}
              />
              Aus Übergabe-Paket (ohne API-Schlüssel)
            </label>
            <Button
              onClick={() => setBestaetigungOffen(true)}
              disabled={!bericht || laeuft || echtLaeuft}
            >
              {echtLaeuft ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Import läuft...
                </>
              ) : (
                "Import jetzt ausführen"
              )}
            </Button>

            {echtFehler && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Import nicht möglich</AlertTitle>
                <AlertDescription>{echtFehler}</AlertDescription>
              </Alert>
            )}

            {echtBericht && <BerichtAnzeige bericht={echtBericht} />}
          </div>

          <AlertDialog open={bestaetigungOffen} onOpenChange={setBestaetigungOffen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Import jetzt ausführen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Der Import legt die Projekte aus Investagon jetzt wirklich im CRM an und
                  aktualisiert bereits vorhandene{bilderMitladen ? ", einschließlich der Bilder und Unterlagen" : ""}.
                  Ein wiederholter Lauf ist unschädlich, vorhandene Objekte und Bilder werden
                  erkannt und nicht verdoppelt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={starteEchtlauf}>Import starten</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Collapsible open={diagnoseOffen} onOpenChange={setDiagnoseOffen} className="border rounded-md">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                Diagnose
                <ChevronDown className={`h-4 w-4 transition-transform ${diagnoseOffen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                Hier lässt sich die Rohantwort der Investagon-API ansehen. Damit wird sichtbar, ob
                Investagon Bildadressen mitliefert. Findet der Import in der Antwort keine, versucht
                er je Einheit das Dokumentenpaket.
              </p>
              <Button variant="outline" size="sm" onClick={ladeRohdaten} disabled={rohLaeuft}>
                {rohLaeuft ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Rohdaten werden geladen...
                  </>
                ) : (
                  "Rohdaten laden"
                )}
              </Button>

              {rohFehler && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Rohdaten nicht verfügbar</AlertTitle>
                  <AlertDescription>{rohFehler}</AlertDescription>
                </Alert>
              )}

              {bildBefund && (
                <div className="space-y-2">
                  {bildBefund.gefunden ? (
                    <Badge className="bg-green-600 hover:bg-green-600 text-white">Bildadressen gefunden</Badge>
                  ) : (
                    <Badge variant="secondary">Keine Bildadressen in der Antwort</Badge>
                  )}
                  {bildBefund.gefunden && (
                    <ul className="list-disc pl-5 text-xs text-muted-foreground break-all">
                      {bildBefund.fundstellen.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {rohText && (
                <div className="space-y-2">
                  <Button variant="ghost" size="sm" onClick={kopiereRohdaten}>
                    <Copy className="h-4 w-4 mr-1" /> Rohdaten kopieren
                  </Button>
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{rohText}</pre>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
