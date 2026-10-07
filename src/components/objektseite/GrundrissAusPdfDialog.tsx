import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { confirmDialog } from "@/lib/confirm";
import { liegtAufFremdemServer } from "@/lib/dokumentGruppen";
import {
  einheitKurz, grundrissAusPdfSpeichern, grundrissName, naechsteNummer, pdfOeffnen, seiteAlsBild, uebernommeneGrundrisseFuer,
  type GrundrissUebernahme, type GrundrissZiel, type PdfQuelle, type UebernommenerGrundriss,
} from "@/lib/grundrissAusPdf";
import { resolveUnterlagenUrl } from "@/lib/storage";

export type { GrundrissUebernahme };

/** Längste Kante der Vorschau im Dialog. Gespeichert wird größer (`GRUNDRISS_KANTE`). */
const VORSCHAU_KANTE = 1100;

const HAUS = "haus";

/**
 * „Grundriss aus PDF übernehmen“: eine Seite einer PDF als Grundriss einer
 * Einheit oder des ganzen Hauses speichern. Nur für Admin und Inhaber, das
 * prüft der Reiter, der den Knopf zeigt.
 *
 * Die PDF lädt über die befristete Adresse aus dem eigenen Speicher
 * (`resolveUnterlagenUrl`), nie über eine Adresse bei Investagon. Gezeichnet
 * wird nur die Seite, die gerade zu sehen ist; bei einer Mappe mit achtzig
 * Seiten lädt der Dialog also nicht achtzig Bilder.
 */
export function GrundrissAusPdfDialog({ offen, onOpenChange, quelle, uebernahme, vorbelegteWohnungId }: {
  offen: boolean;
  onOpenChange: (offen: boolean) => void;
  /** Die PDF, wie sie gespeichert ist: Zeiger oder Adresse. */
  quelle: { name: string; url: string };
  uebernahme: GrundrissUebernahme;
  /** Die Unterlage hängt an dieser Einheit. */
  vorbelegteWohnungId?: string;
}) {
  const [pdf, setPdf] = useState<PdfQuelle | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [seite, setSeite] = useState(1);
  const [seitenEingabe, setSeitenEingabe] = useState("1");
  const [vorschau, setVorschau] = useState<{ seite: number; bild: string } | null>(null);
  const [vorschauFehler, setVorschauFehler] = useState(false);
  const [zielWert, setZielWert] = useState<string>(vorbelegteWohnungId ?? uebernahme.wohnungId ?? "");
  const [speichert, setSpeichert] = useState(false);
  const gezeichnet = useRef(new Map<number, string>());

  // Beim Öffnen die PDF laden, beim Schließen wieder freigeben.
  useEffect(() => {
    if (!offen) return;
    let aktiv = true;
    let geoeffnet: PdfQuelle | null = null;
    setPdf(null); setLadeFehler(null); setSeite(1); setSeitenEingabe("1"); setVorschau(null); setVorschauFehler(false);
    setZielWert(vorbelegteWohnungId ?? uebernahme.wohnungId ?? "");
    gezeichnet.current.clear();
    (async () => {
      if (liegtAufFremdemServer(quelle.url)) throw new Error("fremd");
      const url = await resolveUnterlagenUrl(quelle.url);
      if (!url || liegtAufFremdemServer(url)) throw new Error("keine Adresse");
      const q = await pdfOeffnen(url);
      geoeffnet = q;
      if (aktiv) setPdf(q); else q.schliessen();
    })().catch((fehler: unknown) => {
      if (!aktiv) return;
      setLadeFehler(fehler instanceof Error && fehler.message === "fremd"
        ? "Diese PDF liegt auf einem fremden Server. Übernommen werden nur Unterlagen aus dem eigenen Speicher."
        : "Die PDF ließ sich nicht laden. Versuch es bitte gleich noch einmal.");
    });
    return () => { aktiv = false; geoeffnet?.schliessen(); };
  }, [offen, quelle.url, vorbelegteWohnungId, uebernahme.wohnungId]);

  // Nur die sichtbare Seite zeichnen, schon gezeichnete merken.
  useEffect(() => {
    if (!pdf) return;
    let aktiv = true;
    setVorschauFehler(false);
    const bekannt = gezeichnet.current.get(seite);
    if (bekannt) { setVorschau({ seite, bild: bekannt }); return; }
    pdf.zeichnen(seite, VORSCHAU_KANTE)
      .then((flaeche) => {
        const bild = flaeche.toDataURL("image/jpeg", 0.85);
        flaeche.width = 0; flaeche.height = 0;
        gezeichnet.current.set(seite, bild);
        if (aktiv) setVorschau({ seite, bild });
      })
      .catch(() => { if (aktiv) setVorschauFehler(true); });
    return () => { aktiv = false; };
  }, [pdf, seite]);

  const seiten = pdf?.seiten ?? 0;
  const geheZu = (nummer: number) => {
    if (!seiten) return;
    const neu = Math.min(Math.max(1, Math.round(nummer)), seiten);
    setSeite(neu);
    setSeitenEingabe(String(neu));
  };

  const einheit = uebernahme.einheiten.find((e) => e.id === zielWert);
  const ziel: GrundrissZiel | null = zielWert === HAUS ? { art: "haus" } : einheit ? { art: "einheit", wohnungId: einheit.id, weNr: einheit.weNr } : null;
  const bereit = !!pdf && !!ziel && vorschau?.seite === seite && !speichert;

  const speichern = async () => {
    if (!pdf || !ziel) return;
    const vorhandene: UebernommenerGrundriss[] = uebernommeneGrundrisseFuer(uebernahme.objektId, ziel);
    let ersetzen: UebernommenerGrundriss[] = [];
    let nummer = 1;
    if (vorhandene.length > 0) {
      const wofuer = ziel.art === "haus" ? "das ganze Haus" : einheitKurz(ziel.weNr);
      const ja = await confirmDialog({
        title: "Es gibt schon einen übernommenen Grundriss",
        description: `Für ${wofuer} liegt bereits ${vorhandene.map((v) => `„${v.name}“`).join(", ")} vor. Soll die neue Seite ihn ersetzen oder zusätzlich gespeichert werden? Die PDF selbst bleibt in jedem Fall unverändert.`,
        confirmText: "Ersetzen",
        cancelText: "Zusätzlich speichern",
      });
      if (ja) ersetzen = vorhandene; else nummer = naechsteNummer(ziel, vorhandene);
    }
    setSpeichert(true);
    try {
      const bild = await seiteAlsBild(pdf, seite);
      const ergebnis = await grundrissAusPdfSpeichern({ objektId: uebernahme.objektId, ziel, bild, name: grundrissName(ziel, nummer), ersetzen });
      if (ergebnis.ok === false) {
        toast.error(ergebnis.text);
        return;
      }
      toast.success(`„${ergebnis.name}“ ist gespeichert und erscheint im Exposé.`);
      onOpenChange(false);
    } catch {
      toast.error("Die Seite ließ sich nicht als Bild speichern. Versuch es bitte gleich noch einmal.");
    } finally {
      setSpeichert(false);
    }
  };

  const zielName = ziel ? grundrissName(ziel) : null;

  return (
    <Dialog open={offen} onOpenChange={(auf) => { if (!speichert) onOpenChange(auf); }}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-3" data-testid="grundriss-aus-pdf">
        <DialogHeader>
          <DialogTitle>Grundriss aus PDF übernehmen</DialogTitle>
          <DialogDescription>
            Wähle die Seite mit dem Grundriss und die Einheit. Die Seite wird als Bild gespeichert, die PDF bleibt, wie sie ist.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Aus: {quelle.name}</p>

        <div className="flex h-[40vh] min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30 p-2 sm:h-[52vh]" data-testid="grundriss-seitenvorschau">
          {ladeFehler ? (
            <p className="max-w-sm px-4 text-center text-sm text-muted-foreground">{ladeFehler}</p>
          ) : vorschauFehler ? (
            <p className="max-w-sm px-4 text-center text-sm text-muted-foreground">Diese Seite ließ sich nicht zeichnen.</p>
          ) : vorschau && vorschau.seite === seite ? (
            <img src={vorschau.bild} alt={`Seite ${seite} von ${seiten}`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {pdf ? `Seite ${seite} wird gezeichnet…` : "PDF wird geladen…"}</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2" role="group" aria-label="Seite wählen">
          <Button type="button" variant="outline" size="sm" className="h-10 gap-1 sm:h-9" disabled={!seiten || seite <= 1} onClick={() => geheZu(seite - 1)}>
            <ChevronLeft className="h-4 w-4" /> Zurück
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Seite
            <input
              type="number" inputMode="numeric" min={1} max={seiten || 1} value={seitenEingabe} disabled={!seiten}
              aria-label="Seitenzahl"
              onChange={(e) => setSeitenEingabe(e.target.value)}
              onBlur={() => geheZu(Number(seitenEingabe) || seite)}
              onKeyDown={(e) => { if (e.key === "Enter") geheZu(Number(seitenEingabe) || seite); }}
              className="h-10 w-16 rounded-md border border-input bg-background px-2 text-center text-sm text-foreground sm:h-9"
            />
            von {seiten || "…"}
          </label>
          <Button type="button" variant="outline" size="sm" className="h-10 gap-1 sm:h-9" disabled={!seiten || seite >= seiten} onClick={() => geheZu(seite + 1)}>
            Weiter <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="grundriss-ziel">Grundriss für</Label>
          <select id="grundriss-ziel" value={zielWert} onChange={(e) => setZielWert(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
            <option value="" disabled>Einheit wählen</option>
            {uebernahme.einheiten.map((e) => <option key={e.id} value={e.id}>{einheitKurz(e.weNr)}</option>)}
            <option value={HAUS}>Ganzes Haus (Hausplan)</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {zielName
              ? `Gespeichert als „${zielName}“ ${ziel?.art === "haus" ? "bei den Unterlagen zum Objekt" : "bei den Unterlagen dieser Einheit"}. Er erscheint danach im Exposé.`
              : "Wähle, zu welcher Einheit der Grundriss gehört, oder „Ganzes Haus“ für einen Plan des Hauses."}
            {" "}Die Seite geht als Grundriss an Kunden, achte darauf, dass keine Namen von Mietern oder Eigentümern darauf stehen.
          </p>
        </div>

        {/* Wie in den Pflegedialogen: Auf dem Handy klebt die Knopfleiste unten im Dialog. */}
        <div className="sticky -bottom-6 z-10 -mb-6 flex justify-end gap-2 border-t border-border/60 bg-card pb-6 pt-3 sm:static sm:mb-0 sm:border-t-0 sm:bg-transparent sm:pb-0 sm:pt-2">
          <Button type="button" variant="outline" className="h-10 sm:h-9" disabled={speichert} onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button type="button" className="h-10 gap-1.5 sm:h-9" disabled={!bereit} onClick={() => void speichern()}>
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Als Grundriss speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
