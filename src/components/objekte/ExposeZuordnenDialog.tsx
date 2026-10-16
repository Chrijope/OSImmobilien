import { useMemo, useState } from "react";
import { FileText, FolderOpen, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { addDokument, addWohnungTabellenDokument, getObjekte } from "@/lib/objekteStore";
import { objektDateiAblegen, UPLOAD_LIMITS } from "@/lib/storage";
import { exposeAblagePfad, exposesZuordnen, type ExposeZuordnung } from "@/lib/exposeZuordnung";
import { einheitKurz } from "@/lib/grundrissAusPdf";

type Hochladbar = Extract<ExposeZuordnung, { art: "einheit" | "objekt" }>;

/**
 * „Exposés zuordnen“: einen Ordner mit fertigen Exposé-PDFs den Einheiten
 * zuordnen, nur für Admin und Inhaber (Christian, 16.10.2026).
 *
 * Ablauf: Ordner wählen, die Vorschau zeigt jede Datei mit ihrem Ziel, erst
 * nach einer Rückfrage wird hochgeladen. Unklare und schon vorhandene
 * Zuordnungen werden nie hochgeladen. Wiederholbar: Ein zweiter Lauf findet
 * die schon angelegten Unterlagen am Namen und überspringt sie.
 *
 * Abgelegt wird wie jede Wohnungsunterlage im geschützten Eimer
 * (`objekte/<id>/wohnungen/<wid>/…`), die Zeile kommt in
 * `wohnungs_dokumente` (siehe `addWohnungTabellenDokument`). Die Freigabe
 * für Kunden bleibt offen, sie setzt man danach wie bei jeder Unterlage.
 * Die Rechte prüfen Speicher und Zeilensicherheit, der Knopf ist nur die
 * Sichtbarkeit.
 */
export function ExposeZuordnenDialog() {
  const [offen, setOffen] = useState(false);
  const [dateien, setDateien] = useState<File[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState(0);
  const [ergebnis, setErgebnis] = useState<{ ok: number; fehler: string[] } | null>(null);

  // Die Objekte erst beim Öffnen lesen; `getObjekte` enthält auch verkaufte Einheiten.
  // `ergebnis` zählt mit: Nach dem Hochladen neu lesen, damit „schon da“ stimmt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const objekte = useMemo(() => (offen ? getObjekte() : []), [offen, ergebnis]);
  const nachDatei = useMemo(() => {
    const m = new Map<string, File>();
    for (const f of dateien) m.set(f.webkitRelativePath || f.name, f);
    return m;
  }, [dateien]);
  const zuordnungen = useMemo(
    () => exposesZuordnen(dateien.map((f) => ({ pfad: f.webkitRelativePath || f.name, name: f.name })), objekte),
    [dateien, objekte],
  );
  const sichtbar = zuordnungen.filter((z) => z.art !== "ignoriert");
  const ignoriert = zuordnungen.length - sichtbar.length;
  const hochladbar = sichtbar.filter((z): z is Hochladbar => (z.art === "einheit" || z.art === "objekt") && !z.schonDa);
  const unklar = sichtbar.filter((z) => z.art === "unklar").length;
  const schonDa = sichtbar.filter((z) => (z.art === "einheit" || z.art === "objekt") && z.schonDa).length;

  const zuruecksetzen = () => { setDateien([]); setErgebnis(null); setFortschritt(0); };

  const hochladen = async () => {
    const ja = await confirmDialog({
      title: `${hochladbar.length} Exposés hochladen?`,
      description: "Jede PDF wird unverändert bei der angezeigten Einheit unter „Dokumente“ abgelegt. Unklare und schon vorhandene bleiben liegen.",
      confirmText: "Hochladen",
      cancelText: "Zurück zur Vorschau",
    });
    if (!ja) return;
    setLaeuft(true);
    setFortschritt(0);
    const fehler: string[] = [];
    let ok = 0;
    // Nacheinander: 77 Dateien zu je rund 5 MB parallel würden die Leitung verstopfen.
    for (const z of hochladbar) {
      const datei = nachDatei.get(z.datei.pfad);
      try {
        if (!datei) throw new Error("Datei nicht mehr gewählt");
        if (datei.size > UPLOAD_LIMITS.pdf) throw new Error("Datei größer als 50 MB");
        const url = await objektDateiAblegen(exposeAblagePfad(z), datei, "application/pdf");
        if (!url) throw new Error("Ablage im Speicher fehlgeschlagen");
        const id = crypto.randomUUID();
        const angelegt = z.art === "einheit"
          ? await addWohnungTabellenDokument(z.wohnungId, { id, name: z.dokumentName, url, kategorie: "wohnungsunterlagen" })
          : await addDokument(z.objektId, { id, name: z.dokumentName, url, typ: "custom", kategorie: "objektunterlagen", sichtbar: true });
        if (!angelegt) throw new Error("Unterlage ließ sich nicht eintragen");
        ok += 1;
      } catch (err) {
        fehler.push(`${z.datei.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
      setFortschritt((n) => n + 1);
    }
    setLaeuft(false);
    setErgebnis({ ok, fehler });
    toast({
      title: fehler.length ? "Exposés teilweise hochgeladen" : "Exposés hochgeladen",
      description: `${ok} hochgeladen${fehler.length ? `, ${fehler.length} fehlgeschlagen` : ""}.`,
      variant: fehler.length ? "destructive" : "default",
    });
  };

  const ziel = (z: ExposeZuordnung) => {
    if (z.art === "einheit") return `${z.objektTitel} · ${einheitKurz(z.weNr)}`;
    if (z.art === "objekt") return `${z.objektTitel} · am Objekt`;
    return z.art === "unklar" ? z.grund : "";
  };

  return (
    <Dialog open={offen} onOpenChange={(o) => { if (!laeuft) { setOffen(o); if (!o) zuruecksetzen(); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-1" /> Exposés zuordnen
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[86dvh] w-[95vw] max-w-4xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Exposés den Einheiten zuordnen</DialogTitle>
          <DialogDescription>
            Ordner mit den Exposé-PDFs wählen. Die Zuordnung läuft über Adresse und WE-Nummer im Dateinamen. Hochgeladen wird erst nach Bestätigung.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            <FolderOpen className="h-4 w-4" /> Ordner wählen
            <input
              type="file"
              multiple
              className="sr-only"
              disabled={laeuft}
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={(e) => { setErgebnis(null); setDateien(Array.from(e.target.files ?? [])); }}
            />
          </label>
          {dateien.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {hochladbar.length} bereit · {schonDa} schon vorhanden · {unklar} unklar · {ignoriert} übergangen
            </span>
          )}
        </div>

        {dateien.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Noch kein Ordner gewählt.</p>
        ) : sichtbar.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">In diesem Ordner liegt kein Exposé.</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Datei</TableHead>
                  <TableHead className="text-xs">Ziel</TableHead>
                  <TableHead className="text-xs">Stand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sichtbar.map((z) => (
                  <TableRow key={z.datei.pfad}>
                    <TableCell className="text-xs">{z.datei.name}</TableCell>
                    <TableCell className="text-xs">{ziel(z)}</TableCell>
                    <TableCell>
                      {z.art === "unklar" ? <Badge variant="destructive" className="text-[10px]">unklar</Badge>
                        : "schonDa" in z && z.schonDa ? <Badge variant="secondary" className="text-[10px]">schon da</Badge>
                          : <Badge variant="outline" className="text-[10px]">bereit</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {ergebnis && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            <p>{ergebnis.ok} hochgeladen.</p>
            {ergebnis.fehler.map((f) => <p key={f} className="text-destructive">{f}</p>)}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={laeuft} onClick={() => setOffen(false)}>Schließen</Button>
          <Button size="sm" disabled={laeuft || hochladbar.length === 0 || !!ergebnis} onClick={hochladen}>
            {laeuft ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {fortschritt} von {hochladbar.length}</> : `${hochladbar.length} Exposés hochladen`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
