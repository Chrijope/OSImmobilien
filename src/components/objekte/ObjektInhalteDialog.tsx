import { useMemo, useState } from "react";
import { FolderOpen, Images, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { cacheReload } from "@/lib/dataCache";
import { compressForUpload } from "@/lib/imageCompression";
import { bildZeileAnlegen, getObjekte, objektMetaErgaenzen, setObjektTitelbild } from "@/lib/objekteStore";
import { objektDateiAblegen, UPLOAD_LIMITS } from "@/lib/storage";
import { einheitKurz } from "@/lib/grundrissAusPdf";
import { OBJEKT_INHALTE } from "@/data/objektInhalte";
import {
  bildAblagePfad,
  bilderZuordnen,
  darfSchreiben,
  FELD_NAME,
  metaPatch,
  textVorschauAlle,
  type BildZuordnung,
  type HochladbaresBild,
} from "@/lib/objektInhalteImport";

type Bericht = { ok: number; fehler: string[]; titel: string };

const kurz = (zeilen: string[]) => {
  const t = zeilen.join(" · ");
  return t.length > 160 ? `${t.slice(0, 157)}…` : t || "leer";
};

/**
 * „Objektinhalte einspielen“: Beschreibung, Standortargumente und interne
 * Highlights aus `src/data/objektInhalte.ts` und Bilder aus dem Ordner
 * „Objektbilder Import“, nur für Admin und Inhaber, nicht im Testkonto
 * (Christian, 16.10.2026). Erst Vorschau, dann Rückfrage, dann Schreiben,
 * am Ende ein Bericht. Wiederholbar: Gleiche Texte und schon vorhandene
 * Bilder werden übersprungen.
 */
export function ObjektInhalteDialog() {
  const [offen, setOffen] = useState(false);
  const [haken, setHaken] = useState<Record<string, boolean>>({});
  const [dateien, setDateien] = useState<File[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState("");
  const [bericht, setBericht] = useState<Bericht | null>(null);

  // `bericht` zählt mit: Nach dem Schreiben neu lesen, damit Vorschau und „schon da“ stimmen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const objekte = useMemo(() => (offen ? getObjekte() : []), [offen, bericht]);
  const texte = useMemo(() => textVorschauAlle(OBJEKT_INHALTE, objekte), [objekte]);
  const textBereit = texte.filter((v) => darfSchreiben(v, v.art === "bereit" && !!haken[v.objektId]));

  const nachDatei = useMemo(() => new Map(dateien.map((f) => [f.webkitRelativePath || f.name, f])), [dateien]);
  const bilder = useMemo(
    () => bilderZuordnen(dateien.map((f) => ({ pfad: f.webkitRelativePath || f.name, name: f.name })), objekte),
    [dateien, objekte],
  );
  const bilderSichtbar = bilder.filter((z) => z.art !== "ignoriert");
  const bilderBereit = bilderSichtbar.filter((z): z is HochladbaresBild => (z.art === "objekt" || z.art === "einheit") && !z.schonDa);

  const zuruecksetzen = () => { setDateien([]); setBericht(null); setHaken({}); setFortschritt(""); };

  const texteSchreiben = async () => {
    const ja = await confirmDialog({
      title: `Texte für ${textBereit.length} Objekte einspielen?`,
      description: "Beschreibung, Standort und interne Highlights werden wie in der Vorschau gesetzt. Objekte ohne Haken mit gepflegtem Text bleiben unverändert.",
      confirmText: "Einspielen",
      cancelText: "Zurück zur Vorschau",
    });
    if (!ja) return;
    setLaeuft(true);
    const fehler: string[] = [];
    let ok = 0;
    for (const v of textBereit) {
      if (v.art !== "bereit") continue;
      setFortschritt(v.objektTitel);
      try {
        await objektMetaErgaenzen(v.objektId, metaPatch(v));
        ok += 1;
      } catch (err) {
        fehler.push(`${v.objektTitel}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setLaeuft(false);
    setFortschritt("");
    setBericht({ ok, fehler, titel: "Texte" });
    toast({ title: fehler.length ? "Texte teilweise eingespielt" : "Texte eingespielt", description: `${ok} Objekte${fehler.length ? `, ${fehler.length} fehlgeschlagen` : ""}.`, variant: fehler.length ? "destructive" : "default" });
  };

  const bilderHochladen = async () => {
    const ja = await confirmDialog({
      title: `${bilderBereit.length} Bilder hochladen?`,
      description: "Jedes Bild kommt an das angezeigte Objekt oder die Einheit. Unklare und schon vorhandene bleiben liegen. Ein Objekt ohne Titelbild bekommt das erste neue Bild als Titelbild.",
      confirmText: "Hochladen",
      cancelText: "Zurück zur Vorschau",
    });
    if (!ja) return;
    setLaeuft(true);
    const fehler: string[] = [];
    let ok = 0;
    // Nacheinander, damit viele große Fotos die Leitung nicht verstopfen.
    for (const [i, z] of bilderBereit.entries()) {
      setFortschritt(`${i + 1} von ${bilderBereit.length}`);
      const datei = nachDatei.get(z.datei.pfad);
      try {
        if (!datei) throw new Error("Datei nicht mehr gewählt");
        let hoch: File = datei;
        try {
          const { compressed } = await compressForUpload(datei, "standard");
          if (compressed && compressed.size > 0) hoch = compressed;
        } catch { /* Ungewöhnliches Format: das Original nehmen. */ }
        if (hoch.size > UPLOAD_LIMITS.image) throw new Error("Bild größer als 10 MB");
        const endung = (hoch.name.split(".").pop() || "jpg").toLowerCase();
        const url = await objektDateiAblegen(bildAblagePfad(z, endung), hoch, hoch.type || "image/jpeg");
        if (!url) throw new Error("Ablage im Speicher fehlgeschlagen");
        const alt = z.art === "einheit" ? `${z.objektTitel} · ${einheitKurz(z.weNr)}` : z.objektTitel;
        await bildZeileAnlegen(z.art === "einheit" ? { art: "einheit", wohnungId: z.wohnungId } : { art: "objekt", objektId: z.objektId }, { url, alt, reihenfolge: z.reihenfolge });
        if (z.titelbild) await setObjektTitelbild(z.objektId, url);
        ok += 1;
      } catch (err) {
        fehler.push(`${z.datei.pfad}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await Promise.all(["objekte", "objekt_bilder", "wohnungs_bilder"].map(cacheReload));
    setLaeuft(false);
    setFortschritt("");
    setBericht({ ok, fehler, titel: "Bilder" });
    toast({ title: fehler.length ? "Bilder teilweise hochgeladen" : "Bilder hochgeladen", description: `${ok} hochgeladen${fehler.length ? `, ${fehler.length} fehlgeschlagen` : ""}.`, variant: fehler.length ? "destructive" : "default" });
  };

  const bildZiel = (z: BildZuordnung) => {
    if (z.art === "einheit") return `${z.objektTitel} · ${einheitKurz(z.weNr)}${z.titelbild ? " · Titelbild" : ""}`;
    if (z.art === "objekt") return `${z.objektTitel} · Objektbild${z.titelbild ? " · Titelbild" : ""}`;
    return z.grund;
  };

  return (
    <Dialog open={offen} onOpenChange={(o) => { if (!laeuft) { setOffen(o); if (!o) zuruecksetzen(); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Images className="h-4 w-4 mr-1" /> Objektinhalte einspielen
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[86dvh] w-[95vw] max-w-5xl flex-col gap-3 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Objektinhalte einspielen</DialogTitle>
          <DialogDescription>
            Beschreibung, Standort und interne Highlights aus den Exposés sowie Bilder aus dem Ordner „Objektbilder Import“. Geschrieben wird erst nach Bestätigung.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Texte</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Objekt</TableHead>
                  <TableHead className="text-xs">Feld</TableHead>
                  <TableHead className="text-xs">Vorher</TableHead>
                  <TableHead className="text-xs">Nachher</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {texte.map((v) => v.art === "unklar" ? (
                  <TableRow key={v.inhalt.adresse}>
                    <TableCell className="text-xs">{v.inhalt.adresse}</TableCell>
                    <TableCell colSpan={3}><Badge variant="destructive" className="text-[10px]">unklar</Badge> <span className="text-xs">{v.grund}</span></TableCell>
                  </TableRow>
                ) : v.felder.map((f, i) => (
                  <TableRow key={`${v.objektId}-${f.feld}`}>
                    {i === 0 && (
                      <TableCell rowSpan={v.felder.length} className="align-top text-xs">
                        <div className="font-medium">{v.objektTitel}</div>
                        {v.brauchtHaken && (
                          <label className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                            <Checkbox checked={!!haken[v.objektId]} disabled={laeuft} onCheckedChange={(c) => setHaken((h) => ({ ...h, [v.objektId]: c === true }))} />
                            Von Hand gepflegten Text überschreiben
                          </label>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="align-top text-xs">
                      {FELD_NAME[f.feld]}
                      {f.gleich ? <Badge variant="secondary" className="ml-1 text-[10px]">gleich</Badge> : f.gepflegt ? <Badge variant="outline" className="ml-1 text-[10px]">von Hand</Badge> : null}
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">{kurz(f.vorher)}</TableCell>
                    <TableCell className="align-top text-xs">{kurz(f.nachher)}</TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={laeuft || textBereit.length === 0} onClick={texteSchreiben}>
              {laeuft && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Texte für {textBereit.length} Objekte einspielen
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Bilder</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              <FolderOpen className="h-4 w-4" /> Ordner „Objektbilder Import“ wählen
              <input
                type="file"
                multiple
                className="sr-only"
                disabled={laeuft}
                {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                onChange={(e) => { setBericht(null); setDateien(Array.from(e.target.files ?? [])); }}
              />
            </label>
            {dateien.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {bilderBereit.length} bereit · {bilderSichtbar.filter((z) => "schonDa" in z && z.schonDa).length} schon da · {bilderSichtbar.filter((z) => z.art === "unklar").length} unklar
              </span>
            )}
          </div>
          {bilderSichtbar.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <Table>
                <TableBody>
                  {bilderSichtbar.map((z) => (
                    <TableRow key={z.datei.pfad}>
                      <TableCell className="text-xs">{z.datei.pfad.split("/").slice(-3).join("/")}</TableCell>
                      <TableCell className="text-xs">{bildZiel(z)}</TableCell>
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
          <div className="flex justify-end">
            <Button size="sm" disabled={laeuft || bilderBereit.length === 0} onClick={bilderHochladen}>
              {laeuft ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {fortschritt}</> : `${bilderBereit.length} Bilder hochladen`}
            </Button>
          </div>
        </section>

        {bericht && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs" data-testid="objektinhalte-bericht">
            <p>{bericht.titel}: {bericht.ok} geschrieben{bericht.fehler.length ? `, ${bericht.fehler.length} fehlgeschlagen` : ""}.</p>
            {bericht.fehler.map((f) => <p key={f} className="text-destructive">{f}</p>)}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={laeuft} onClick={() => setOffen(false)}>Schließen</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
