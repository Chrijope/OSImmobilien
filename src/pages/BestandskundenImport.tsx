import React, { useMemo, useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Upload, Plus, Users } from "lucide-react";
import { getKontakte, addKontakt } from "@/lib/kundenStore";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useUser } from "@/contexts/UserContext";
import { isTeamWideKontaktRole, kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { useToast } from "@/hooks/use-toast";
import { findPotentialDuplicates } from "@/lib/duplikatCheck";
import { confirmDialog } from "@/lib/confirm";
import { BeraterFilter, matchesBeraterFilter } from "@/components/kunden/BeraterFilter";

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE");
  } catch { return "—"; }
}

export default function BestandskundenImport() {
  const cacheReady = useCacheReady(["kontakte"]);
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  const { toast } = useToast();
  const liveVersion = useLiveVersion(["kontakte"]);
  const isTeamWide = isTeamWideKontaktRole(user.role);

  const entries = useMemo(() => {
    const all = getKontakte().filter(k => !k.archiviert && k.pipelineStufe === "bestandsimport");
    return isTeamWide ? all : all.filter(k => kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVersion, isTeamWide, user.name, authUser?.id]);

  const [search, setSearch] = useState("");
  const [quelleFilter, setQuelleFilter] = usePersistedState<"all" | "bestandsimport_manuell" | "bestandsimport_csv">("mi_filter_bestandimport_quelle", "all");
  const [beraterFilter, setBeraterFilter] = usePersistedState<string>("mi_filter_bestandimport_berater", "-");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = entries;
    if (quelleFilter !== "all") list = list.filter(k => (k.quelle || "") === quelleFilter);
    if (beraterFilter !== "-") list = list.filter(k => matchesBeraterFilter(k, beraterFilter));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(k => (k.vorname + " " + k.nachname + " " + (k.email || "") + " " + (k.telefon || "")).toLowerCase().includes(q));
    }
    return list;
  }, [entries, search, quelleFilter, beraterFilter]);

  // — Anlage-Dialog State —
  const emptyForm = {
    anrede: "", vorname: "", nachname: "", email: "", telefon: "",
    geburtstag: "",
    strasse: "", hausnummer: "", plz: "", ort: "",
    p2_anrede: "", p2_vorname: "", p2_nachname: "", p2_email: "", p2_telefon: "", p2_geburtsdatum: "",
    notiz: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const submitCreate = async () => {
    if (!form.vorname.trim() || !form.nachname.trim()) {
      toast({ title: "Vor- und Nachname sind Pflicht", variant: "destructive" });
      return;
    }
    if (!form.email.trim() && !form.telefon.trim()) {
      toast({ title: "E-Mail oder Telefon angeben", variant: "destructive" });
      return;
    }
    const dupes = findPotentialDuplicates(
      { vorname: form.vorname, nachname: form.nachname, email: form.email, telefon: form.telefon },
      getKontakte()
    );
    if (dupes.length > 0) {
      const ok = await confirmDialog({
        title: "Mögliches Duplikat gefunden",
        description: `Grund: ${dupes[0].grund} (${dupes[0].detail}). Soll der Bestandskunde trotzdem angelegt werden?`,
        confirmText: "Trotzdem anlegen",
        cancelText: "Nicht anlegen",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const person2 = (form.p2_vorname || form.p2_nachname) ? {
        anrede: form.p2_anrede, vorname: form.p2_vorname, nachname: form.p2_nachname,
        email: form.p2_email, telefon: form.p2_telefon, geburtsdatum: form.p2_geburtsdatum,
      } : undefined;
      await addKontakt({
        anrede: form.anrede,
        vorname: form.vorname.trim(),
        nachname: form.nachname.trim(),
        email: form.email.trim(),
        telefon: form.telefon.trim(),
        geburtstag: form.geburtstag,
        strasse: form.strasse.trim(),
        hausnummer: form.hausnummer.trim(),
        plz: form.plz.trim(),
        ort: form.ort.trim(),
        quelle: "bestandsimport_manuell",
        pipelineStufe: "bestandsimport" as any,
        status: "neu",
        meta: {
          kontaktTyp: "eigen",
          herkunftKanal: "Bestandsimport (manuell)",
          bestandSeit: new Date().toISOString(),
          notiz: form.notiz || undefined,
          ...(person2 ? { person2 } : {}),
        },
      } as any);
      toast({ title: "Bestandskunde angelegt ✓" });
      setForm(emptyForm);
      setCreateOpen(false);
    } catch (e: any) {
      toast({ title: "Fehler beim Anlegen", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const isTippgeber = user.role === "tippgeber";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Bestandskunden Import"
          subtitle={`${filtered.length} Bestandskontakt${filtered.length === 1 ? "" : "e"} ohne aktiven Sales-Prozess`}
        />

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
                <div>
                  <div className="font-medium text-foreground mb-1">Was ist „Bestandskunden Import"?</div>
                  Importierte oder manuell angelegte Bestandskontakte, die bereits im Bestand des Vertriebspartners sind, aber noch <strong>kein Investment</strong> haben. Sobald für einen Bestandskontakt ein Investment angelegt wird, wechselt er automatisch in die Pipeline-Stufe <strong>Beratungsgespräch</strong> und erscheint dann unter „Kontakte".
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Bestandskunden suchen..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={quelleFilter}
                onChange={(e) => setQuelleFilter(e.target.value as any)}
              >
                <option value="all">Alle Quellen</option>
                <option value="bestandsimport_manuell">Manuell angelegt</option>
                <option value="bestandsimport_csv">CSV-Import</option>
              </select>
              {isTeamWide && (
                <BeraterFilter value={beraterFilter} onChange={setBeraterFilter} kontakte={entries} liveVersion={liveVersion} />
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="default" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Bestandskunde anlegen
                </Button>
                {!isTippgeber && (
                  <Button variant="outline" onClick={() => navigate("/bestandskunden-import/csv")}>
                    <Upload className="h-4 w-4 mr-2" /> CSV importieren
                  </Button>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Person 2</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Vertriebspartner</TableHead>
                  <TableHead>Quelle</TableHead>
                  <TableHead>Importiert am</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!cacheReady ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Lade…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Keine Bestandskunden im Import-Pool.</TableCell></TableRow>
                ) : (
                  filtered.map(k => {
                    const p2 = (k as any)?.meta?.person2 as any;
                    const bestandSeit = (k as any)?.meta?.bestandSeit as string | undefined;
                    return (
                      <TableRow key={k.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/kunden/${k.id}`)}>
                        <TableCell className="font-medium">{k.vorname} {k.nachname}</TableCell>
                        <TableCell>{p2 && (p2.vorname || p2.nachname) ? `${p2.vorname || ""} ${p2.nachname || ""}`.trim() : "—"}</TableCell>
                        <TableCell>{k.email || "—"}</TableCell>
                        <TableCell>{k.telefon || "—"}</TableCell>
                        <TableCell>{k.berater || "—"}</TableCell>
                        <TableCell>
                          {k.quelle === "bestandsimport_csv" ? <Badge variant="secondary">CSV</Badge> :
                            k.quelle === "bestandsimport_manuell" ? <Badge variant="outline">Manuell</Badge> :
                              <Badge variant="outline">Bestand</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDate(bestandSeit || k.erstellt_am)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bestandskunde anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <div className="text-sm font-semibold mb-2">Person 1 (Hauptkontakt)</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Anrede</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.anrede} onChange={(e) => setForm({ ...form, anrede: e.target.value })}>
                    <option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option><option value="Divers">Divers</option>
                  </select>
                </div>
                <div><Label className="text-xs">Vorname *</Label><Input value={form.vorname} onChange={(e) => setForm({ ...form, vorname: e.target.value })} /></div>
                <div><Label className="text-xs">Nachname *</Label><Input value={form.nachname} onChange={(e) => setForm({ ...form, nachname: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div><Label className="text-xs">Geburtsdatum</Label><Input type="date" value={form.geburtstag} onChange={(e) => setForm({ ...form, geburtstag: e.target.value })} /></div>
                <div><Label className="text-xs">E-Mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label className="text-xs">Telefon</Label><Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} /></div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">E-Mail oder Telefon erforderlich.</div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Adresse (optional)</div>
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2"><Label className="text-xs">Straße</Label><Input value={form.strasse} onChange={(e) => setForm({ ...form, strasse: e.target.value })} /></div>
                <div><Label className="text-xs">Nr.</Label><Input value={form.hausnummer} onChange={(e) => setForm({ ...form, hausnummer: e.target.value })} /></div>
                <div><Label className="text-xs">PLZ</Label><Input value={form.plz} onChange={(e) => setForm({ ...form, plz: e.target.value })} /></div>
              </div>
              <div className="mt-3"><Label className="text-xs">Ort</Label><Input value={form.ort} onChange={(e) => setForm({ ...form, ort: e.target.value })} /></div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Person 2 (optional)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Anrede</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.p2_anrede} onChange={(e) => setForm({ ...form, p2_anrede: e.target.value })}>
                    <option value="">—</option><option value="Herr">Herr</option><option value="Frau">Frau</option><option value="Divers">Divers</option>
                  </select>
                </div>
                <div><Label className="text-xs">Geburtsdatum</Label><Input type="date" value={form.p2_geburtsdatum} onChange={(e) => setForm({ ...form, p2_geburtsdatum: e.target.value })} /></div>
                <div><Label className="text-xs">Vorname</Label><Input value={form.p2_vorname} onChange={(e) => setForm({ ...form, p2_vorname: e.target.value })} /></div>
                <div><Label className="text-xs">Nachname</Label><Input value={form.p2_nachname} onChange={(e) => setForm({ ...form, p2_nachname: e.target.value })} /></div>
                <div><Label className="text-xs">E-Mail</Label><Input type="email" value={form.p2_email} onChange={(e) => setForm({ ...form, p2_email: e.target.value })} /></div>
                <div><Label className="text-xs">Telefon</Label><Input value={form.p2_telefon} onChange={(e) => setForm({ ...form, p2_telefon: e.target.value })} /></div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Notiz</Label>
              <Input value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="z. B. Übergeben von Partner XY, August 2024" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button onClick={submitCreate} disabled={busy}>{busy ? "Speichert…" : "Anlegen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
