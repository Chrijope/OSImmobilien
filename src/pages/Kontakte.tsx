import React, { useState, useMemo, useEffect } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, Plus, Search, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/PageHeader";
import { getKontakte, addKontakt } from "@/lib/kundenStore";
import { KundenspracheFeld } from "@/components/kunden/profil/KundenspracheFeld";
import { kundenSpracheMetaPatch, type Sprache } from "@/lib/kundenSprache";
import { getCurrentUserId } from "@/lib/currentUser";
import { confirmDialog } from "@/lib/confirm";
import { useColumnConfig, ColumnSelector } from "@/components/kunden/KundenColumnConfig";
import { Powerdialer } from "@/components/kunden/Powerdialer";
import { ImportExportButton } from "@/components/kunden/ImportExportButton";
import { StickyPagination, usePagination } from "@/components/kunden/StickyPagination";
import { useUser } from "@/contexts/UserContext";
import { buildBucketEntries, type KundeBucketEntry } from "@/lib/kontaktPipeline";
import { isTeamWideKontaktRole, kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { BucketEntryDealCell, bucketEntryKey, bucketEntryHref } from "@/components/kunden/BucketEntryCells";
import { KontaktTypFilter } from "@/components/kunden/KontaktTypFilter";
import { getKontaktTyp, type KontaktTyp } from "@/lib/kontaktTypHelper";
import { BeraterFilter, matchesBeraterFilter } from "@/components/kunden/BeraterFilter";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizeTelefon } from "@/lib/phoneUtils";
import { findPotentialDuplicates } from "@/lib/duplikatCheck";
import { fehlendePflichtfelder } from "@/lib/kontaktPflichtfelder";
import { markItemSeen, isItemSeen, getSeenItemIds, getSeenAt, SEEN_KEYS } from "@/lib/seenBadges";
import { InactivityAmpel } from "@/components/kunden/InactivityAmpel";
import { getFollowUps } from "@/lib/followUpStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

function dedupeKontakte(entries: KundeBucketEntry[]) {
  const seen = new Set<string>();
  const out: KundeBucketEntry["kunde"][] = [];
  for (const e of entries) {
    if (seen.has(e.kunde.id)) continue;
    seen.add(e.kunde.id);
    out.push(e.kunde);
  }
  return out;
}

const FIXED_COLUMNS = ["vorname", "nachname", "telefon", "email", "beratungsgespraechAm", "berater", "status", "erstellt_am", "quelle", "leadTyp"];
const DEAL_AFTER = "email";

const QUELLEN = [
  "Website", "Instagram", "Facebook", "LinkedIn", "TikTok",
  "Empfehlung", "Veranstaltung", "Netzwerk", "Meta Kampagne",
  "Google Ads", "Flyer", "Kaltakquise", "Sonstige",
];

const emptyForm = () => ({
  anrede: "", vorname: "", nachname: "", email: "", telefon: "",
  quelle: "",
  strasse: "", hausnummer: "", plz: "", ort: "",
  leadTyp: "manuell" as "meta" | "google" | "website" | "manuell",
  empfehlungsgeberName: "",
  empfehlungsgeberBeziehung: "",
  kundenSprache: "de" as Sprache,
});

export default function Kontakte() {
  const cacheReady = useCacheReady(["kontakte"]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  // Hinweis: KEIN `markSeen` mehr beim Öffnen der Liste – das Badge in der
  // Sidebar zählt erst herunter, wenn ein einzelner Kontakt tatsächlich
  // geöffnet (oder einem VP zugewiesen) wird.
  const isTeamWide = isTeamWideKontaktRole(user.role);
  const liveVersion = useLiveVersion(["kontakte", "investments", "follow_ups", "aufgaben"]);
  const myUserId = getCurrentUserId();
  const entries = useMemo<KundeBucketEntry[]>(() => {
    // Sichtbarkeit (VP-Scope) auf Kontakt-Ebene, danach Investment-zentrisch expandieren.
    const base = getKontakte().filter(k =>
      !k.archiviert &&
      (!!(k.berater && k.berater.trim()) || !!(k as any).zustaendig_id)
    );
    const scoped = isTeamWide
      ? base
      : base.filter(k => kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id || myUserId }));
    return buildBucketEntries(scoped, "kontakte");
  }, [liveVersion, isTeamWide, user.name, authUser?.id, myUserId]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = usePersistedState<boolean>("mi_filter_kontakte_archived", false);
  const [nurAnrufbar, setNurAnrufbar] = usePersistedState<boolean>(
    `mi_filter_kontakte_nur_anrufbar__${myUserId || "anon"}`,
    true,
  );
  const [typFilter, setTypFilter] = usePersistedState<KontaktTyp | "-">("mi_filter_kontakte_typ", "-");
  const [beraterFilter, setBeraterFilter] = usePersistedState<string>("mi_filter_kontakte_berater", "-");
  const [sortField, setSortField] = usePersistedState<string>("mi_filter_kontakte_sortField", "erstellt_am");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("mi_filter_kontakte_sortDir", "desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showPowerdialer, setShowPowerdialer] = useState(false);
  const [newKontakt, setNewKontakt] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  // Highlight des "Kontakt anlegen"-Buttons für 3 s nach Schnellzugriff vom Dashboard.
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightAnlegen, setHighlightAnlegen] = useState(false);
  useEffect(() => {
    if (searchParams.get("highlight") === "anlegen") {
      setHighlightAnlegen(true);
      setSearchParams({}, { replace: true });
      const t = setTimeout(() => setHighlightAnlegen(false), 3000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const { columns, extraKeys, toggleExtra, optionalKeys, fixedKeys } = useColumnConfig("kontakte", FIXED_COLUMNS);

  const filtered = useMemo(() => {
    let result = entries;
    if (!showArchived) result = result.filter(e => !e.kunde.archiviert);
    if (nurAnrufbar) {
      const nowIso = new Date().toISOString();
      const heute = nowIso.slice(0, 10);
      const futureFuKundeIds = new Set<string>(
        getFollowUps()
          .filter(f => f.status === "offen" && !!f.faelligAm && f.faelligAm >= heute)
          .map(f => f.kundeId)
      );
      result = result.filter((e) => {
        const k: any = e.kunde;
        if (k.verstecktBis && k.verstecktBis > nowIso) return false;
        if (k.setterTerminDatum && k.setterTerminDatum >= heute) return false;
        if (k.beratungsgespraechAm && String(k.beratungsgespraechAm) >= heute) return false;
        if (futureFuKundeIds.has(k.id)) return false;
        return true;
      });
    }
    if (typFilter !== "-") {
      result = result.filter((e) => getKontaktTyp(e.kunde) === typFilter);
    }
    if (beraterFilter !== "-") {
      result = result.filter((e) => matchesBeraterFilter(e.kunde, beraterFilter));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) => {
        const k = e.kunde;
        return (
          k.vorname.toLowerCase().includes(q) || k.nachname.toLowerCase().includes(q) ||
          k.email.toLowerCase().includes(q) || k.telefon.includes(q) ||
          k.firma.toLowerCase().includes(q) || k.ort.toLowerCase().includes(q) ||
          (e.objektLabel || "").toLowerCase().includes(q)
        );
      });
    }
    return [...result].sort((a, b) => {
      const aVal = String((a.kunde as any)[sortField] ?? "");
      const bVal = String((b.kunde as any)[sortField] ?? "");
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [entries, search, sortField, sortDir, showArchived, nurAnrufbar, typFilter, beraterFilter, user.name, authUser?.id, liveVersion]);

  const pagination = usePagination("kontakte", filtered.length);
  const paged = pagination.slice(filtered);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const handleCreate = async () => {
    const errors = fehlendePflichtfelder(newKontakt);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: "Pflichtfelder ausfüllen", description: "Bitte alle markierten Felder ausfüllen.", variant: "destructive" });
      return;
    }

    // Duplikat-Check nach der Regel in duplikatCheck.ts: gleiche E-Mail, gleiche
    // Telefonnummer oder gleicher voller Name, keine Aehnlichkeitssuche.
    const dupes = findPotentialDuplicates(
      { vorname: newKontakt.vorname, nachname: newKontakt.nachname, email: newKontakt.email, telefon: newKontakt.telefon },
      getKontakte()
    );
    if (dupes.length > 0) {
      const hard = dupes.find(d => d.grund === "email" || d.grund === "telefon");
      if (hard) {
        toast({
          title: hard.grund === "email" ? "E-Mail bereits vergeben" : "Telefonnummer bereits vergeben",
          description: `Bereits zugeordnet: "${hard.kontakt.vorname} ${hard.kontakt.nachname}" (${hard.detail}).`,
          variant: "destructive",
          action: (
            <Button variant="outline" size="sm" onClick={() => navigate(`/kunden/${hard.kontakt.id}`)}>
              Zum Kontakt
            </Button>
          ),
        });
        return;
      }
      const soft = dupes[0];
      const proceed = await confirmDialog({
        title: "Möglicher Duplikat-Kontakt gefunden",
        description:
          `Es gibt bereits ${soft.kontakt.vorname} ${soft.kontakt.nachname} (gleicher Name). Soll trotzdem ein neuer Kontakt angelegt werden?`,
        confirmText: "Trotzdem anlegen",
        cancelText: "Nicht anlegen",
      });
      if (!proceed) return;
    }

    const empfName = newKontakt.empfehlungsgeberName.trim();
    const empfBeziehung = newKontakt.empfehlungsgeberBeziehung.trim();
    addKontakt({
      anrede: newKontakt.anrede,
      vorname: newKontakt.vorname.trim(),
      nachname: newKontakt.nachname.trim(),
      email: newKontakt.email,
      telefon: normalizeTelefon(newKontakt.telefon),
      quelle: newKontakt.quelle,
      strasse: newKontakt.strasse.trim(),
      hausnummer: newKontakt.hausnummer.trim(),
      plz: newKontakt.plz.trim(),
      ort: newKontakt.ort.trim(),
      leadTyp: newKontakt.leadTyp,
      berater: user.name,
      zustaendig_id: getCurrentUserId() || undefined,
      pipelineStufe: "erstgespraech_geplant",
      status: "kontaktiert" as any,
      meta: {
        // Die Sprache ist beim Anlegen sichtbar gewählt worden.
        ...kundenSpracheMetaPatch(newKontakt.kundenSprache, getCurrentUserId()),
        ...(empfName ? {
          empfehlungsgeber: true,
          empfehlungsgeberName: empfName,
          ...(empfBeziehung ? { empfehlungsgeberBeziehung: empfBeziehung } : {}),
        } : {}),
      },
    } as any);
    toast({ title: "Kontakt angelegt ✓", description: `${newKontakt.vorname} ${newKontakt.nachname}` });
    setDialogOpen(false);
    setNewKontakt(emptyForm());
    setFormErrors({});
  };

  const upd = (field: string, value: string) => {
    setNewKontakt((p) => ({ ...p, [field]: value }));
    if (formErrors[field]) setFormErrors((e) => ({ ...e, [field]: false }));
  };

  const fieldClass = (field: string) =>
    formErrors[field] ? "border-destructive ring-1 ring-destructive/30" : "";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Kontakte" subtitle={`${entries.length} Deals in Kontakten`} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => ["inhaber", "admin"].includes(user.role) ? setShowPowerdialer(!showPowerdialer) : null} disabled={!["inhaber", "admin"].includes(user.role)}>
              <Phone className="h-4 w-4" /> {showPowerdialer ? "Liste anzeigen" : "Powerdialer"}
              {["inhaber", "admin"].includes(user.role) ? (
                <Badge variant="outline" className="text-[10px] ml-1 px-1.5 py-0 border-[hsl(var(--warning))] text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10">Entwurf</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] ml-1 px-1.5 py-0 border-muted-foreground text-muted-foreground">Bald verfügbar</Badge>
              )}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setFormErrors({}); } }}>
              <DialogTrigger asChild>
                {/* Hauptaktion der Seite Kontakte, deshalb Marken-Orange. Der
                    Zwilling auf "Alle Kontakte" steckt in NeuerKontaktDialog. */}
                <Button size="sm" variant="brand" className={highlightAnlegen ? "ring-2 ring-brand-orange ring-offset-2 ring-offset-background animate-pulse" : ""}><Plus className="h-4 w-4 mr-1" /> Kontakt anlegen</Button>
              </DialogTrigger>
            <DialogContent className="max-w-3xl w-[95vw]">
              <DialogHeader><DialogTitle>Neuen Kontakt anlegen</DialogTitle></DialogHeader>
              <div className="grid gap-5 py-4 max-h-[75vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Anrede *</Label>
                    <Select value={newKontakt.anrede} onValueChange={(v) => upd("anrede", v)}>
                      <SelectTrigger className={fieldClass("anrede")}><SelectValue placeholder="–" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Herr">Herr</SelectItem>
                        <SelectItem value="Frau">Frau</SelectItem>
                        <SelectItem value="Divers">Divers</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Vorname *</Label><Input className={fieldClass("vorname")} value={newKontakt.vorname} onChange={(e) => upd("vorname", e.target.value)} /></div>
                  <div><Label className="text-xs">Nachname *</Label><Input className={fieldClass("nachname")} value={newKontakt.nachname} onChange={(e) => upd("nachname", e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">E-Mail *</Label><Input className={fieldClass("email")} type="email" value={newKontakt.email} onChange={(e) => upd("email", e.target.value)} /></div>
                  <div><Label className="text-xs">Telefon *</Label><PhoneInput className={fieldClass("telefon")} value={newKontakt.telefon} onChange={(v) => upd("telefon", v)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Quelle *</Label>
                    <Select value={newKontakt.quelle} onValueChange={(v) => upd("quelle", v)}>
                      <SelectTrigger className={fieldClass("quelle")}><SelectValue placeholder="Quelle wählen..." /></SelectTrigger>
                      <SelectContent>
                        {QUELLEN.map((q) => (
                          <SelectItem key={q} value={q}>{q}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Lead-Typ *</Label>
                    <Select value={newKontakt.leadTyp} onValueChange={(v) => upd("leadTyp", v)}>
                      <SelectTrigger className={fieldClass("leadTyp")}><SelectValue placeholder="Typ wählen..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manuell">Manuell</SelectItem>
                        <SelectItem value="meta">Funnel Lead</SelectItem>
                        <SelectItem value="google">Google Ad</SelectItem>
                        <SelectItem value="website">Website</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-2"><Label className="text-xs">Straße</Label><Input value={newKontakt.strasse} onChange={(e) => upd("strasse", e.target.value)} /></div>
                  <div><Label className="text-xs">Nr.</Label><Input value={newKontakt.hausnummer} onChange={(e) => upd("hausnummer", e.target.value)} /></div>
                  <div><Label className="text-xs">PLZ</Label><Input value={newKontakt.plz} onChange={(e) => upd("plz", e.target.value)} /></div>
                </div>
                <div><Label className="text-xs">Ort</Label><Input value={newKontakt.ort} onChange={(e) => upd("ort", e.target.value)} /></div>
                {/* Kundensprache, vorbelegt mit Deutsch. Wer anlegt, sieht sie und
                    ändert sie mit einem Klick; damit gilt sie als gewählt (Plan
                    Kundensprache 2.4). */}
                <div>
                  <Label className="text-xs">Sprache</Label>
                  <div className="mt-1.5"><KundenspracheFeld wert={newKontakt.kundenSprache} onWahl={(s) => upd("kundenSprache", s)} ariaLabel="Sprache des Kontakts" /></div>
                  <p className="text-[11px] text-muted-foreground mt-1">In dieser Sprache bekommt der Kunde Mails, Dokumente und das Kundenportal.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <Label className="text-xs">Empfehlungsgeber (optional)</Label>
                    <Input
                      placeholder="Name des Empfehlungsgebers"
                      value={newKontakt.empfehlungsgeberName}
                      onChange={(e) => upd("empfehlungsgeberName", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Beziehung (optional)</Label>
                    <Input
                      placeholder="z.B. Familie, Kollege, Freund"
                      value={newKontakt.empfehlungsgeberBeziehung}
                      onChange={(e) => upd("empfehlungsgeberBeziehung", e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={handleCreate} className="w-full">Kontakt anlegen</Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {showPowerdialer ? (
          <Powerdialer kontakte={dedupeKontakte(filtered)} onClose={() => setShowPowerdialer(false)} />
        ) : (

        <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Kontakte suchen..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="archiviert" checked={showArchived} onCheckedChange={(v) => setShowArchived(!!v)} />
              <label htmlFor="archiviert" className="text-sm">Archivierte anzeigen</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="nur-anrufbar" checked={nurAnrufbar} onCheckedChange={(v) => setNurAnrufbar(!!v)} />
              <label htmlFor="nur-anrufbar" className="text-sm flex items-center gap-1">
                Nur jetzt anrufbare
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                      Blendet Kontakte aus, die aktuell in Wartezeit sind (nach "Nicht erreicht"),
                      ein zukünftiges Erst-/Beratungsgespräch terminiert haben oder einen offenen
                      Follow-Up in der Zukunft besitzen.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </label>
            </div>
            <KontaktTypFilter value={typFilter} onChange={setTypFilter} />
            {isTeamWide && (
              <BeraterFilter value={beraterFilter} onChange={setBeraterFilter} kontakte={entries.map(e => e.kunde)} liveVersion={liveVersion} />
            )}
            <ColumnSelector fixedKeys={fixedKeys} extraKeys={extraKeys} optionalKeys={optionalKeys} toggleExtra={toggleExtra} />
            <div className="ml-auto">
              <ImportExportButton kontakte={dedupeKontakte(filtered)} onImportDone={() => {}} exportFilename="kontakte" />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-xs">SLA</TableHead>
                {columns.map((col) => (
                  <React.Fragment key={col.key}>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(col.key)}>
                      <span className="flex items-center gap-1 text-xs">{col.label} <SortIcon field={col.key} /></span>
                    </TableHead>
                    {col.key === DEAL_AFTER && <TableHead className="text-xs">Deal</TableHead>}
                  </React.Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!cacheReady ? (
                <TableRow><TableCell colSpan={columns.length + 2}><TableSkeleton columns={columns.length + 2} rows={6} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length + 2} className="text-center py-8 text-muted-foreground">Keine Kontakte gefunden.</TableCell></TableRow>
              ) : (
                paged.map((entry) => {
                  const k = entry.kunde;
                  const seenCutoff = getSeenAt(SEEN_KEYS.vpKontakte);
                  const isNew =
                    !isItemSeen(SEEN_KEYS.vpKontakte, k.id) &&
                    (seenCutoff ? String(k.erstellt_am || "") > seenCutoff : false);
                  return (
                    <TableRow
                      key={bucketEntryKey(entry)}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        markItemSeen(SEEN_KEYS.vpKontakte, k.id);
                        navigate(bucketEntryHref(entry));
                      }}
                    >
                      <TableCell><InactivityAmpel kunde={entry.kunde} stufeOverride={entry.stufe} /></TableCell>
                      {columns.map((col, idx) => (
                        <React.Fragment key={col.key}>
                          <TableCell>
                            {idx === 0 && isNew && (
                              <Badge className="mr-2 align-middle text-[9px] px-1.5 py-0 h-4 bg-emerald-500 text-white border-0 hover:bg-emerald-500 uppercase tracking-wide">
                                Neu
                              </Badge>
                            )}
                            {col.render(entry.kunde)}
                          </TableCell>
                          {col.key === DEAL_AFTER && <TableCell><BucketEntryDealCell entry={entry} /></TableCell>}
                        </React.Fragment>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        )}

        {!showPowerdialer && (
          <StickyPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            showAll={pagination.showAll}
            total={filtered.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            onToggleShowAll={pagination.setShowAll}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
