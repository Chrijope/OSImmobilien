import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ChevronDown, ChevronUp, Merge, X, Mail, Phone, User, CheckSquare } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { findeDuplikatGruppen, duplikatEtikett, emailSchluessel, telefonSchluessel, isPlaceholderEmail, type DuplikatKriterium } from "@/lib/duplikatCheck";
import { deleteBewerber, type Bewerber } from "@/lib/bewerbungStore";

interface DuplikatGruppe {
  key: string;
  typ: DuplikatKriterium;
  /** Alle Kriterien, die die Eintraege der Gruppe gemeinsam haben. */
  kriterien: DuplikatKriterium[];
  label: string;
  bewerber: Bewerber[];
}

const DISMISS_STORAGE_KEY = "mi_bewerber_duplikat_dismissed_v1";

const fingerprintGroup = (key: string, bewerber: Bewerber[]) => {
  const ids = bewerber.map(b => b.id).sort().join(",");
  return `${key}::${ids}`;
};

const loadDismissed = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
};

const saveDismissed = (set: Set<string>) => {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

interface Props {
  bewerber: Bewerber[];
  onMerged?: () => void;
}

export function BewerberDuplikatBanner({ bewerber, onMerged }: Props) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState<DuplikatGruppe | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  const duplikate = useMemo(() => {
    // Die Regel, wann etwas ein Duplikat ist, steht allein in duplikatCheck.ts.
    // Ignoriert ist eine Gruppe, wenn ihr Fingerabdruck mit dem heutigen oder
    // einem frueheren Schluessel gemerkt ist, siehe `alteSchluessel`.
    return findeDuplikatGruppen(bewerber)
      .filter(g =>
        ![g.schluessel, ...g.alteSchluessel].some(s => dismissed.has(fingerprintGroup(s, g.eintraege))),
      )
      .map((g): DuplikatGruppe => {
        const sorted = [...g.eintraege].sort((a, b) => {
          const aTel = telefonSchluessel(a.telefon) ? 1 : 0;
          const bTel = telefonSchluessel(b.telefon) ? 1 : 0;
          if (aTel !== bTel) return bTel - aTel;
          const aMail = emailSchluessel(a.email) ? 1 : 0;
          const bMail = emailSchluessel(b.email) ? 1 : 0;
          if (aMail !== bMail) return bMail - aMail;
          return (a.erstelltAm || "").localeCompare(b.erstelltAm || "");
        });
        const erster = g.eintraege[0];
        const label =
          g.kriterium === "email" ? emailSchluessel(erster.email)
          : g.kriterium === "telefon" ? (g.eintraege.find(b => b.telefon)?.telefon || "")
          : `${erster.vorname} ${erster.nachname}`;
        return { key: g.schluessel, typ: g.kriterium, kriterien: g.kriterien, label, bewerber: sorted };
      });
  }, [bewerber, dismissed]);

  if (duplikate.length === 0) return null;

  const allSelected = duplikate.length > 0 && duplikate.every(g => selectedGroups.has(g.key));
  const someSelected = selectedGroups.size > 0;

  const toggleGroup = (key: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedGroups(new Set());
    else setSelectedGroups(new Set(duplikate.map(g => g.key)));
  };

  const handleMerge = (gruppe: DuplikatGruppe) => {
    const keep = gruppe.bewerber[0];
    const toDelete = gruppe.bewerber.slice(1);
    try {
      toDelete.forEach(b => deleteBewerber(b.id));
      toast({
        title: "Duplikate zusammengeführt ✓",
        description: `${toDelete.length} Duplikat${toDelete.length > 1 ? "e" : ""} von "${keep.vorname} ${keep.nachname}" entfernt.`,
      });
      onMerged?.();
    } catch {
      toast({ title: "Fehler beim Zusammenführen", variant: "destructive" });
    }
    setMergeConfirm(null);
  };

  const handleBulkMerge = () => {
    const groupsToMerge = duplikate.filter(g => selectedGroups.has(g.key));
    const toDelete: Bewerber[] = [];
    groupsToMerge.forEach(g => { g.bewerber.slice(1).forEach(b => toDelete.push(b)); });
    try {
      toDelete.forEach(b => deleteBewerber(b.id));
      toast({
        title: "Duplikate zusammengeführt ✓",
        description: `${toDelete.length} Duplikate aus ${groupsToMerge.length} Gruppe${groupsToMerge.length > 1 ? "n" : ""} entfernt.`,
      });
      setSelectedGroups(new Set());
      onMerged?.();
    } catch {
      toast({ title: "Fehler beim Zusammenführen", variant: "destructive" });
    }
    setBulkConfirm(false);
  };

  const totalDupes = duplikate.reduce((sum, g) => sum + g.bewerber.length - 1, 0);
  const selectedDupesCount = duplikate
    .filter(g => selectedGroups.has(g.key))
    .reduce((sum, g) => sum + g.bewerber.length - 1, 0);

  const typIcon = (typ: DuplikatKriterium) => {
    if (typ === "email") return <Mail className="h-3 w-3" />;
    if (typ === "telefon") return <Phone className="h-3 w-3" />;
    return <User className="h-3 w-3" />;
  };

  return (
    <>
      <Card className="border-warning/50 bg-warning/5 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {duplikate.length} Duplikat-Gruppe{duplikate.length !== 1 ? "n" : ""} erkannt
              </p>
              <p className="text-xs text-muted-foreground">
                {totalDupes} doppelte Bewerber nach E-Mail, Telefon oder Namen gefunden
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {someSelected && (
              <Button size="sm" className="gap-1 text-xs h-8" onClick={() => setBulkConfirm(true)}>
                <Merge className="h-3 w-3" />
                {selectedGroups.size} Gruppe{selectedGroups.size > 1 ? "n" : ""} zusammenführen ({selectedDupesCount})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="gap-1">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {expanded ? "Ausblenden" : "Anzeigen"}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Alle Gruppen auswählen" />
                <CheckSquare className="h-3 w-3" />
                {allSelected ? "Alle abwählen" : "Alle auswählen"}
                <span className="text-muted-foreground font-normal">
                  ({selectedGroups.size}/{duplikate.length} Gruppen markiert)
                </span>
              </label>
            </div>

            {duplikate.map(gruppe => {
              const isSelected = selectedGroups.has(gruppe.key);
              return (
                <div key={gruppe.key} className={`bg-card border rounded-lg p-3 transition-colors ${isSelected ? "border-primary/50 bg-primary/5" : ""}`}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleGroup(gruppe.key)} aria-label={`Gruppe ${gruppe.label} auswählen`} />
                      <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                        {typIcon(gruppe.typ)}
                        {gruppe.bewerber.length}× {duplikatEtikett(gruppe.kriterien)}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">{gruppe.label}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => setDismissed(prev => new Set(prev).add(fingerprintGroup(gruppe.key, gruppe.bewerber)))}>
                        <X className="h-3 w-3" /> Ignorieren
                      </Button>
                      <Button size="sm" className="gap-1 text-xs h-7" onClick={() => setMergeConfirm(gruppe)}>
                        <Merge className="h-3 w-3" /> Zusammenführen
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {gruppe.bewerber.map((b, idx) => (
                      <div key={b.id} className="flex items-center gap-3 text-xs rounded px-2 py-1 hover:bg-muted/50">
                        {idx === 0 && <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">Behalten</Badge>}
                        {idx > 0 && <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">Duplikat</Badge>}
                        <span className="font-medium">{b.vorname} {b.nachname}</span>
                        {b.telefon && <span className="text-muted-foreground">{b.telefon}</span>}
                        {b.email && !isPlaceholderEmail(b.email.toLowerCase()) && <span className="text-muted-foreground">{b.email}</span>}
                        <span className="text-muted-foreground ml-auto">
                          {b.erstelltAm ? new Date(b.erstelltAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AlertDialog open={!!mergeConfirm} onOpenChange={() => setMergeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplikate zusammenführen?</AlertDialogTitle>
            <AlertDialogDescription>
              {mergeConfirm && (
                <>
                  Der priorisierte Bewerber <strong>{mergeConfirm.bewerber[0].vorname} {mergeConfirm.bewerber[0].nachname}</strong>
                  {mergeConfirm.bewerber[0].telefon && <> (Tel: {mergeConfirm.bewerber[0].telefon})</>} wird behalten.
                  {" "}{mergeConfirm.bewerber.length - 1} Duplikat{mergeConfirm.bewerber.length - 1 > 1 ? "e" : ""} werden gelöscht.
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => mergeConfirm && handleMerge(mergeConfirm)}>Zusammenführen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkConfirm} onOpenChange={setBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedGroups.size} Gruppen zusammenführen?</AlertDialogTitle>
            <AlertDialogDescription>
              In jeder ausgewählten Gruppe wird der priorisierte Bewerber (mit Telefon &gt; E-Mail &gt; ältester) behalten.
              Insgesamt werden <strong>{selectedDupesCount} Duplikat{selectedDupesCount !== 1 ? "e" : ""}</strong> aus
              {" "}{selectedGroups.size} Gruppe{selectedGroups.size > 1 ? "n" : ""} unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkMerge}>Alle zusammenführen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}