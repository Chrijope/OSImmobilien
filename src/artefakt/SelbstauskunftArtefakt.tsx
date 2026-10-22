import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SelbstauskunftForm,
  SelbstauskunftHinweise,
  loescheLokalenSaEntwurf,
  SA_FORMULAR_TEXTE,
  type SelbstauskunftData,
} from "@/components/selbstauskunft/SelbstauskunftForm";
import { generateSelbstauskunftPDF } from "@/lib/selbstauskunftPdf";
import { confirmDialog } from "@/lib/confirm";
import { useToast } from "@/hooks/use-toast";
import { speichereDatei } from "./speichern";

/*
 * Die Selbstauskunft aus dem CRM, ohne Kunde und ohne Server. Der Stand liegt
 * nur im Browser (localStorage, über das Formular selbst). Am Ende ersetzt
 * „Als PDF speichern“ den Versand mit digitaler Unterschrift.
 */
const KUNDE_ID = "artefakt";
const ABSCHLUSS_SCHRITT = SA_FORMULAR_TEXTE.schritte.indexOf("Abschluss");

function dateiname(data: SelbstauskunftData): string {
  const name = [data.vorname, data.nachname].map((t) => (t || "").trim()).filter(Boolean).join("_");
  const sicher = name.replace(/[^\p{L}\p{N}_-]+/gu, "_");
  return `Selbstauskunft${sicher ? `_${sicher}` : ""}_${new Date().toISOString().slice(0, 10)}.pdf`;
}

function Abschluss({ data, onNeu }: { data: SelbstauskunftData; onNeu: () => void }) {
  const { toast } = useToast();
  const [laeuft, setLaeuft] = useState(false);

  const alsPdf = async () => {
    setLaeuft(true);
    try {
      const doc = await generateSelbstauskunftPDF(
        data,
        { vorname: data.vorname || "", nachname: data.nachname || "", osImmoId: "" },
        undefined,
        { papierUnterschrift: true },
      );
      const ergebnis = await speichereDatei(dateiname(data), doc.output("blob"));
      if (ergebnis === "gespeichert") toast({ title: "PDF gespeichert ✓", description: "Schicke es jetzt dem Kunden zur Unterschrift." });
    } catch (e) {
      console.error("[Artefakt] PDF fehlgeschlagen", e);
      toast({ title: "PDF konnte nicht erstellt werden", description: "Bitte versuche es noch einmal.", variant: "destructive" });
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">Abschluss</h2>
      <div className="border-2 border-primary/40 bg-primary/5 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-bold text-lg">Selbstauskunft vollständig ausgefüllt</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Speichere das PDF und schicke es dem Kunden zur Unterschrift. Er schickt es unterschrieben zurück.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
              <Button variant="brand" onClick={alsPdf} disabled={laeuft} data-testid="als-pdf-speichern">
                {laeuft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Als PDF speichern
              </Button>
              <Button variant="outline" onClick={onNeu} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                Neue Selbstauskunft beginnen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Die Angaben bleiben nur in diesem Browser gespeichert und werden nirgendwohin gesendet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Ab 1280 Pixeln steht die Hinweisspalte neben dem Formular, darunter im Formular selbst. */
function useBreit(): boolean {
  const abfrage = "(min-width: 1280px)";
  const [breit, setBreit] = useState(() => typeof window !== "undefined" && window.matchMedia?.(abfrage).matches);
  useEffect(() => {
    const m = window.matchMedia?.(abfrage);
    if (!m) return;
    const neu = () => setBreit(m.matches);
    m.addEventListener("change", neu);
    return () => m.removeEventListener("change", neu);
  }, []);
  return !!breit;
}

export default function SelbstauskunftArtefakt() {
  const [suche] = useSearchParams();
  const ziel = suche.get("ziel") || "";
  // Neuer Schlüssel = neues Formular, nach „Neue Selbstauskunft beginnen“.
  const [runde, setRunde] = useState(0);
  const [hinweisSchritt, setHinweisSchritt] = useState(0);
  const breit = useBreit();

  const neuBeginnen = async () => {
    const ja = await confirmDialog({
      title: "Neue Selbstauskunft beginnen?",
      description: "Alle Angaben in diesem Browser werden gelöscht. Speichern Sie vorher das PDF, wenn Sie es noch brauchen.",
      confirmText: "Angaben löschen und neu beginnen",
      cancelText: "Zurück zum Formular",
      variant: "destructive",
    });
    if (!ja) return;
    loescheLokalenSaEntwurf(KUNDE_ID);
    setRunde((r) => r + 1);
  };

  return (
    // Genau eine Fensterhoehe bei jeder Breite (22.10.2026): Die Knopfleiste steht
    // immer am unteren Rand, gescrollt wird nur der Inhalt der Karte. Vorher hing
    // unter 1280 Pixeln die Hinweisspalte unter dem Formular, die Seite scrollte
    // als Ganzes und die Leiste rutschte unter den Rand.
    <div data-lg="seite" className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      {/*
        Unten ohne Innenabstand: Die Knopfleiste schliesst buendig mit dem
        Fensterrand ab, oben abgerundet wie die Karte darueber (Christian,
        22.10.2026). Die Gestaltung der Leiste steht im Formular selbst.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4 sm:px-6 sm:pt-6 xl:flex-row xl:gap-6">
        <main className="flex min-h-0 w-full flex-1 flex-col gap-4 xl:min-w-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Zurück zur Beratungspräsentation" asChild>
              <Link to="/praesentation">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">Online-Selbstauskunft</h1>
              <p className="text-sm text-muted-foreground">Gemeinsam im Gespräch ausfüllen, am Ende als PDF speichern</p>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <SelbstauskunftForm
              key={runde}
              kundeId={KUNDE_ID}
              vorgewaehltesZiel={ziel}
              // Schmal: Hinweise im Formular (scrollen mit). Breit: eigene Spalte rechts.
              onHinweisSchritt={breit ? setHinweisSchritt : undefined}
              ohneBackend={{ abschluss: (data) => <Abschluss data={data} onNeu={neuBeginnen} /> }}
            />
          </div>
        </main>
        {breit && (
          <aside className="w-[300px] shrink-0 overflow-y-auto pb-6 2xl:w-[320px]">
            {/* Der CRM-Hinweis zum Abschluss spricht von digitaler Unterschrift per E-Mail, das gibt es hier nicht. */}
            {hinweisSchritt !== ABSCHLUSS_SCHRITT && <SelbstauskunftHinweise schritt={hinweisSchritt} />}
          </aside>
        )}
      </div>
    </div>
  );
}
