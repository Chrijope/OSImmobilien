import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Folder, FileText, Upload, FolderPlus, Trash2, Download, Pencil, ChevronRight, Home, Loader2, UploadCloud } from "lucide-react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listKundeDokumente, createOrdner, uploadDatei, renameDokument,
  moveDokument, deleteDokument, getSignedUrl, type KundeDokument,
} from "@/lib/kundeDokumenteStore";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";

interface Props {
  kontaktId: string;
  investments: Array<{ id: string; label?: string }>;
  initialInvestmentId?: string | null;
  canManage: boolean;
}

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

export default function KundeDokumenteCard({ kontaktId, investments, initialInvestmentId, canManage }: Props) {
  const options = useMemo(() => [
    ...investments.map((inv, i) => ({ id: inv.id, label: inv.label || `Investment ${i + 1}` })),
    { id: "__all__", label: "Allgemein" },
  ], [investments]);

  const [activeInvestment, setActiveInvestment] = useState<string>(
    initialInvestmentId && investments.some(i => i.id === initialInvestmentId)
      ? initialInvestmentId
      : (investments[0]?.id ?? "__all__"),
  );
  const [items, setItems] = useState<KundeDokument[]>([]);
  const [path, setPath] = useState<KundeDokument[]>([]); // Breadcrumb-Ordner
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dialog-States (statt window.prompt/confirm — im Preview-Sandbox blockiert)
  const [ordnerDialogOpen, setOrdnerDialogOpen] = useState(false);
  const [ordnerName, setOrdnerName] = useState("");
  const [renameTarget, setRenameTarget] = useState<KundeDokument | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<KundeDokument | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverBreadcrumb, setDragOverBreadcrumb] = useState<number | null>(null); // -1 = Start, sonst path idx

  const currentInvestmentId = activeInvestment === "__all__" ? null : activeInvestment;
  const currentParentId = path.length ? path[path.length - 1].id : null;

  const reload = async () => {
    setLoading(true);
    const all = await listKundeDokumente(kontaktId, currentInvestmentId);
    setItems(all);
    setLoading(false);
  };

  useEffect(() => {
    setPath([]);
    reload();
    // Realtime
    const channel = supabase
      .channel(`kd-${kontaktId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kunde_dokumente", filter: `kontakt_id=eq.${kontaktId}` }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kontaktId, activeInvestment]);

  const visible = items.filter(i => (i.parent_id || null) === currentParentId);
  const ordner = visible.filter(i => i.typ === "ordner");
  const dateien = visible.filter(i => i.typ === "datei");

  const openOrdner = (o: KundeDokument) => setPath(p => [...p, o]);
  const goToBreadcrumb = (idx: number) => setPath(p => p.slice(0, idx));

  const openNewOrdner = () => { setOrdnerName(""); setOrdnerDialogOpen(true); };
  const submitNewOrdner = async () => {
    const name = ordnerName.trim();
    if (!name) { toast.error("Bitte Ordnernamen eingeben"); return; }
    const created = await createOrdner({
      kontaktId, investmentId: currentInvestmentId, parentId: currentParentId, name,
    });
    if (created) {
      setItems(prev => prev.some(i => i.id === created.id) ? prev : [...prev, created]);
      toast.success("Ordner angelegt");
      setOrdnerDialogOpen(false);
      void reload();
    } else toast.error("Ordner konnte nicht angelegt werden");
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    let ok = 0;
    const created: KundeDokument[] = [];
    for (const f of arr) {
      const res = await uploadDatei({
        kontaktId, investmentId: currentInvestmentId, parentId: currentParentId, file: f,
      });
      if (res) { ok++; created.push(res); }
    }
    if (created.length) {
      setItems(prev => {
        const existing = new Set(prev.map(i => i.id));
        return [...prev, ...created.filter(c => !existing.has(c.id))];
      });
    }
    setUploading(false);
    if (ok) toast.success(`${ok} Datei(en) hochgeladen`);
    if (ok < arr.length) toast.error(`${arr.length - ok} Datei(en) fehlgeschlagen`);
    void reload();
  };

  const openRename = (dok: KundeDokument) => { setRenameTarget(dok); setRenameValue(dok.name); };
  const submitRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget.name) { setRenameTarget(null); return; }
    const ok = await renameDokument(renameTarget.id, name);
    if (ok) {
      const id = renameTarget.id;
      setItems(prev => prev.map(i => i.id === id ? { ...i, name } : i));
      toast.success("Umbenannt");
      setRenameTarget(null);
      void reload();
    } else toast.error("Fehler");
  };

  const openDelete = (dok: KundeDokument) => setDeleteTarget(dok);
  const collectDeleteIds = (dok: KundeDokument) => {
    const ids = new Set<string>([dok.id]);
    const queue = [dok.id];
    while (queue.length) {
      const parentId = queue.shift()!;
      for (const item of items) {
        if (item.parent_id === parentId && !ids.has(item.id)) {
          ids.add(item.id);
          if (item.typ === "ordner") queue.push(item.id);
        }
      }
    }
    return ids;
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    const deleteIds = collectDeleteIds(deleteTarget);
    const ok = await deleteDokument(deleteTarget);
    if (ok) {
      setItems(prev => prev.filter(item => !deleteIds.has(item.id)));
      setPath(prev => prev.filter(folder => !deleteIds.has(folder.id)));
      toast.success("Gelöscht");
      void reload();
    } else toast.error("Fehler beim Löschen");
    setDeleteTarget(null);
  };

  const handleOpen = async (dok: KundeDokument) => {
    if (!dok.storage_path) return;
    const url = await getSignedUrl(dok.storage_path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error("Link konnte nicht erstellt werden");
  };

  const handleMoveToRoot = async (dok: KundeDokument) => {
    if (!currentParentId && !path.length) return;
    const target = path.length >= 2 ? path[path.length - 2].id : null;
    const ok = await moveDokument(dok.id, target);
    if (ok) {
      setItems(prev => prev.map(i => i.id === dok.id ? { ...i, parent_id: target } : i));
      toast.success("Verschoben");
      void reload();
    }
  };

  const moveInto = async (dokId: string, targetParentId: string | null) => {
    const dok = items.find(i => i.id === dokId);
    if (!dok) return;
    if (dok.id === targetParentId) return;
    if ((dok.parent_id || null) === targetParentId) return;
    // Verhindern, dass Ordner in sich selbst / eigenen Nachfahren verschoben wird
    if (dok.typ === "ordner" && targetParentId) {
      const descendantIds = new Set<string>();
      const queue = [dok.id];
      while (queue.length) {
        const p = queue.shift()!;
        for (const it of items) {
          if (it.parent_id === p && !descendantIds.has(it.id)) {
            descendantIds.add(it.id);
            if (it.typ === "ordner") queue.push(it.id);
          }
        }
      }
      if (descendantIds.has(targetParentId)) {
        toast.error("Ordner kann nicht in sich selbst verschoben werden");
        return;
      }
    }
    const ok = await moveDokument(dokId, targetParentId);
    if (ok) {
      setItems(prev => prev.map(i => i.id === dokId ? { ...i, parent_id: targetParentId } : i));
      toast.success("Verschoben");
      void reload();
    } else toast.error("Verschieben fehlgeschlagen");
  };

  return (
    <Card
      className={`p-5 space-y-4 transition ${dragOver ? "ring-2 ring-primary bg-primary/5" : ""}`}
      onDragOver={(e) => { if (canManage && !draggingId) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOver(true); } }}
      onDragEnter={(e) => { if (canManage && !draggingId) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => {
        // Nur zurücksetzen, wenn die Card wirklich verlassen wird
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        if (!canManage || draggingId) return;
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            📁 Dokumente
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Info zu Dokumenten">
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-sm text-xs leading-relaxed">
                  Nutze diesen Bereich ähnlich wie <strong>Google Drive</strong>: Lege Ordner an und hinterlege
                  alle relevanten Kundenunterlagen zentral – z. B. <strong>Musterberechnungen</strong>,
                  <strong> Exposés</strong>, <strong>Bonitätsunterlagen</strong>, <strong>Verträge</strong> und
                  sonstige <strong>Dokumente</strong>. Per Drag &amp; Drop hochladen und in Ordner verschieben.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h3>
          <p className="text-xs text-muted-foreground">Nur intern sichtbar — Ablage fürs Objektgespräch</p>
        </div>
        {canManage && (
          /*
           * Umbrechend statt starr in einer Zeile.
           *
           * Christian am 17.09.2026: Auf dem Telefon ragte "Upload" rechts aus
           * der Karte heraus und war abgeschnitten. Die drei Knoepfe brauchen
           * zusammen mehr Platz, als ein 375 Pixel breites Telefon hergibt.
           * Mit `flex-wrap` rutscht der dritte in die naechste Zeile, statt
           * ueber den Rand zu laufen. Am Schreibtisch passen sie weiterhin
           * nebeneinander, dort aendert sich nichts.
           *
           * Seit dem 23.09.2026 sind es zwei Knoepfe: "Objektvorstellung" ist
           * entfallen (Exposé, Kundenansicht und Kundenlink decken sie ab).
           * Der Umbruch bleibt als Schutz fuer schmale Spalten.
           */
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={openNewOrdner}>
              <FolderPlus className="h-4 w-4 mr-1" /> Ordner
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) handleUploadFiles(e.target.files); e.target.value = ""; }}
            />
          </div>
        )}
      </div>

      {/*
        Investment-Umschalter.

        Am Schreibtisch bleiben es Schaltflaechen nebeneinander: Man sieht auf
        einen Blick, wie viele Vorgaenge es gibt, und ist mit einem Klick dort.
        Auf dem Telefon fuellten dieselben Schaltflaechen zwei ganze Zeilen,
        bevor der eigentliche Inhalt anfing. Deshalb steht dort stattdessen ein
        Auswahlfeld, gewuenscht von Christian am 17.09.2026.

        Welches von beidem zu sehen ist, entscheidet `kundenprofil.css` ueber
        die Breite der mittleren Spalte, nicht ueber die Fensterbreite. Das
        Kundenprofil misst im ganzen Haus so, denn neben der Karte stehen je
        nach Ansicht noch zwei weitere Spalten.
      */}
      <div className="kundendokumente-bereichsknoepfe flex gap-1 flex-wrap border-b pb-2">
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => setActiveInvestment(opt.id)}
            className={`px-3 py-1 text-xs rounded-md transition ${
              activeInvestment === opt.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/70"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="kundendokumente-bereichswahl border-b pb-2">
        <Label htmlFor="dokumente-bereich" className="text-xs text-muted-foreground">Bereich</Label>
        <Select value={activeInvestment} onValueChange={setActiveInvestment}>
          <SelectTrigger id="dokumente-bereich" className="mt-1 w-full">
            <SelectValue placeholder="Bereich wählen" />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        <button
          className={`hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded ${dragOverBreadcrumb === -1 ? "bg-primary/15 text-primary ring-1 ring-primary" : ""}`}
          onClick={() => setPath([])}
          onDragOver={(e) => { if (draggingId) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setDragOverBreadcrumb(-1); } }}
          onDragLeave={() => setDragOverBreadcrumb(v => v === -1 ? null : v)}
          onDrop={(e) => { if (draggingId) { e.preventDefault(); e.stopPropagation(); void moveInto(draggingId, null); setDraggingId(null); setDragOverBreadcrumb(null); } }}
        >
          <Home className="h-3 w-3" /> Start
        </button>
        {path.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <button
              className={`hover:text-foreground px-1.5 py-0.5 rounded ${dragOverBreadcrumb === i ? "bg-primary/15 text-primary ring-1 ring-primary" : ""}`}
              onClick={() => goToBreadcrumb(i + 1)}
              onDragOver={(e) => { if (draggingId) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setDragOverBreadcrumb(i); } }}
              onDragLeave={() => setDragOverBreadcrumb(v => v === i ? null : v)}
              onDrop={(e) => { if (draggingId) { e.preventDefault(); e.stopPropagation(); void moveInto(draggingId, p.id); setDraggingId(null); setDragOverBreadcrumb(null); } }}
            >{p.name}</button>
          </span>
        ))}
      </div>

      {/* Deutlich sichtbare Drag & Drop Zone */}
      {canManage && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 px-4 transition text-center
            ${dragOver
              ? "border-primary bg-primary/10 text-primary"
              : "border-primary/40 bg-primary/5 hover:bg-primary/10 text-muted-foreground hover:text-foreground"}`}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <UploadCloud className={`h-7 w-7 ${dragOver ? "text-primary" : "text-primary/70"}`} />
          )}
          <div className="text-sm font-medium">
            {dragOver ? "Zum Hochladen loslassen" : "Dateien hierher ziehen oder klicken"}
          </div>
          <div className="text-xs text-muted-foreground">
            Mehrere Dateien möglich · Ablage: {path.length ? path[path.length - 1].name : (options.find(o => o.id === activeInvestment)?.label ?? "Start")}
          </div>
        </button>
      )}

      {/* Inhalt */}
      <div className="min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {canManage
              ? "Noch keine Dokumente in diesem Ordner."
              : "Keine Dokumente vorhanden."}
          </div>
        ) : (
          <div className="space-y-1">
            {ordner.map(o => (
              <div
                key={o.id}
                className={`flex items-center gap-2 px-2 py-2 rounded hover:bg-muted/50 group transition ${draggingId === o.id ? "opacity-50" : ""} ${dragOverFolderId === o.id ? "bg-primary/15 ring-2 ring-primary" : ""}`}
                draggable={canManage}
                onDragStart={(e) => { if (!canManage) return; setDraggingId(o.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", o.id); } catch {} }}
                onDragEnd={() => { setDraggingId(null); setDragOverFolderId(null); }}
                onDragOver={(e) => { if (draggingId && draggingId !== o.id) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setDragOverFolderId(o.id); } }}
                onDragLeave={(e) => {
                  if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
                  setDragOverFolderId(v => v === o.id ? null : v);
                }}
                onDrop={(e) => { if (draggingId && draggingId !== o.id) { e.preventDefault(); e.stopPropagation(); void moveInto(draggingId, o.id); setDraggingId(null); setDragOverFolderId(null); } }}
              >
                <button className="flex items-center gap-2 flex-1 text-left" onDoubleClick={() => openOrdner(o)} onClick={() => openOrdner(o)}>
                  <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
                  <span className="text-sm truncate">{o.name}</span>
                </button>
                {canManage && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <Button size="icon" aria-label="Bearbeiten" variant="ghost" className="h-7 w-7" onClick={() => openRename(o)}><Pencil className="h-3.5 w-3.5" /></Button>
                    {path.length > 0 && <Button size="icon" aria-label="Löschen" variant="ghost" className="h-7 w-7" title="Nach oben verschieben" onClick={() => handleMoveToRoot(o)}>↑</Button>}
                    <Button size="icon" aria-label="Löschen" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => openDelete(o)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            ))}
            {dateien.map(d => (
              <div
                key={d.id}
                className={`flex items-center gap-2 px-2 py-2 rounded hover:bg-muted/50 group transition ${draggingId === d.id ? "opacity-50" : ""}`}
                draggable={canManage}
                onDragStart={(e) => { if (!canManage) return; setDraggingId(d.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", d.id); } catch {} }}
                onDragEnd={() => setDraggingId(null)}
              >
                <button className="flex items-center gap-2 flex-1 text-left" onClick={() => handleOpen(d)}>
                  <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-sm truncate">{d.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{formatBytes(d.groesse_bytes)}</span>
                </button>
                {canManage && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <Button size="icon" aria-label="Herunterladen" variant="ghost" className="h-7 w-7" onClick={() => handleOpen(d)}><Download className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" aria-label="Bearbeiten" variant="ghost" className="h-7 w-7" onClick={() => openRename(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                    {path.length > 0 && <Button size="icon" aria-label="Löschen" variant="ghost" className="h-7 w-7" title="Nach oben verschieben" onClick={() => handleMoveToRoot(d)}>↑</Button>}
                    <Button size="icon" aria-label="Löschen" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => openDelete(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Neuer Ordner — CI Dialog */}
      <Dialog open={ordnerDialogOpen} onOpenChange={setOrdnerDialogOpen}>
        <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-primary" /> Neuer Ordner
            </DialogTitle>
            <DialogDescription>
              Gib dem Ordner einen aussagekräftigen Namen — z. B. „Bonitätsunterlagen", „Objekt XY" oder „Notartermin".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="ordnerName">Ordnername</Label>
            <Input
              id="ordnerName"
              autoFocus
              value={ordnerName}
              onChange={(e) => setOrdnerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNewOrdner(); }}
              placeholder="z. B. Bonitätsunterlagen"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrdnerDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={submitNewOrdner} disabled={!ordnerName.trim()}>Ordner anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Umbenennen — CI Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => { if (!o) setRenameTarget(null); }}>
        <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" /> Umbenennen
            </DialogTitle>
            <DialogDescription>Wähle einen neuen, eindeutigen Namen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="renameValue">Neuer Name</Label>
            <Input
              id="renameValue"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitRename(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Abbrechen</Button>
            <Button onClick={submitRename} disabled={!renameValue.trim()}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Löschen — CI AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.typ === "ordner" ? "Ordner löschen?" : "Datei löschen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.typ === "ordner"
                ? <>Der Ordner „{deleteTarget?.name}" wird <strong>samt Inhalt</strong> unwiderruflich gelöscht.</>
                : <>Die Datei „{deleteTarget?.name}" wird unwiderruflich gelöscht.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={submitDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}