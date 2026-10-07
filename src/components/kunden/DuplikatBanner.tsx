import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ChevronDown, ChevronUp, Merge, X, Mail, Phone, User, CheckSquare } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { KundeData } from "@/lib/kundenStore";
import { useToast } from "@/hooks/use-toast";
import { findeDuplikatGruppen, duplikatEtikett, emailSchluessel, isPlaceholderEmail, type DuplikatKriterium } from "@/lib/duplikatCheck";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";
import { confirmDialog, hinweisDialog } from "@/lib/confirm";
import { cacheRefreshTable } from "@/lib/dataCache";
import {
  kontakteZusammenfuehren, vergleicheAlter, formatDatum, formatMoreId,
  ZusammenfuehrenMigrationFehlt, zusammengefuehrteDateienVerschieben, type ZusammenfuehrungsErgebnis,
} from "@/lib/kontaktZusammenfuehren";

/**
 * Kerntabellen im Zwischenspeicher, deren Zeilen beim Zusammenführen den
 * Kontakt wechseln. Übrige geladene Tabellen zieht die Echtzeit-Anbindung nach.
 */
const NACH_ZUSAMMENFUEHREN_NEU_LADEN = ["kontakte", "investments", "aktivitaeten", "follow_ups", "aufgaben"];

interface DuplikatGruppe {
  key: string;
  typ: DuplikatKriterium;
  /** Alle Kriterien, die die Eintraege der Gruppe gemeinsam haben. */
  kriterien: DuplikatKriterium[];
  label: string;
  kontakte: KundeData[];
}

interface Props {
  kontakte: KundeData[];
  onMerged?: () => void;
}

export function DuplikatBanner({ kontakte, onMerged }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState<DuplikatGruppe | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const DISMISS_KEY = "duplikat-banner-dismissed-v1";
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) return new Set<string>(JSON.parse(raw));
    } catch {}
    return new Set<string>();
  });
  const persistDismissed = (next: Set<string>) => {
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(next))); } catch {}
    setDismissed(next);
  };
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const [laeuft, setLaeuft] = useState(false);

  const duplikate = useMemo(() => {
    // Die Regel, wann etwas ein Duplikat ist, steht allein in duplikatCheck.ts.
    // Eine Gruppe gilt als ignoriert, wenn ihr heutiger oder einer ihrer
    // frueheren Schluessel gemerkt ist, siehe `alteSchluessel`.
    return findeDuplikatGruppen(kontakte)
      .filter(g => !dismissed.has(g.schluessel) && !g.alteSchluessel.some(s => dismissed.has(s)))
      .map((g): DuplikatGruppe => {
        // Behalten wird immer der aeltere Kontakt (Regel vom 26.09.2026),
        // deshalb steht er vorn. Die Datenbank prueft dieselbe Richtung.
        const sorted = [...g.eintraege].sort(vergleicheAlter);
        const erster = g.eintraege[0];
        const label =
          g.kriterium === "email" ? emailSchluessel(erster.email)
          : g.kriterium === "telefon" ? (g.eintraege.find(k => k.telefon)?.telefon || "")
          : `${erster.vorname} ${erster.nachname}`;
        return { key: g.schluessel, typ: g.kriterium, kriterien: g.kriterien, label, kontakte: sorted };
      });
  }, [kontakte, dismissed]);

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

  /**
   * Fuehrt jede Gruppe in ihren aeltesten Kontakt zusammen, einen neueren nach
   * dem anderen. Bricht beim ersten Fehler ab; was bis dahin zusammengefuehrt
   * wurde, ist vollstaendig (jeder Schritt ist in der Datenbank ein Ganzes).
   */
  const gruppenZusammenfuehren = async (gruppen: DuplikatGruppe[]) => {
    setLaeuft(true);
    const ergebnisse: ZusammenfuehrungsErgebnis[] = [];
    let fehler: unknown = null;
    try {
      for (const gruppe of gruppen) {
        const aeltester = gruppe.kontakte[0];
        for (const neuerer of gruppe.kontakte.slice(1)) {
          ergebnisse.push(await kontakteZusammenfuehren(aeltester.id, neuerer.id));
        }
      }
    } catch (e) {
      fehler = e;
    } finally {
      setLaeuft(false);
    }

    if (ergebnisse.length > 0) {
      await Promise.all(NACH_ZUSAMMENFUEHREN_NEU_LADEN.map((t) => cacheRefreshTable(t).catch(() => {})));
      onMerged?.();
      toast({
        title: "Duplikate zusammengeführt",
        description: `${ergebnisse.length} Kontakt${ergebnisse.length > 1 ? "e" : ""} in den älteren übernommen und in den Papierkorb gelegt.`,
      });
    }

    const mitKonflikt = ergebnisse.filter((e) => e.portalKonflikt || e.nichtUmgehaengt.length > 0);
    if (mitKonflikt.length > 0) {
      await hinweisDialog({
        title: "Bitte von Hand prüfen",
        description: (
          <>
            Beim Zusammenführen ist nicht alles automatisch übernommen worden:
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {mitKonflikt.some((e) => e.portalKonflikt) && (
                <li>Beide Kontakte hatten einen eigenen Zugang zum Kundenportal. Der Zugang des neueren Kontakts wurde nicht übernommen, er hängt weiter am Kontakt im Papierkorb.</li>
              )}
              {mitKonflikt.some((e) => e.nichtUmgehaengt.length > 0) && (
                <li>Einzelne Einträge gibt es je Kontakt nur einmal und der ältere hatte schon einen ({[...new Set(mitKonflikt.flatMap((e) => e.nichtUmgehaengt))].join(", ")}). Sie liegen weiter am Kontakt im Papierkorb.</li>
              )}
            </ul>
            <p className="mt-2">Die Einzelheiten stehen als Notiz im Verlauf des behaltenen Kontakts.</p>
          </>
        ),
      });
    }

    // Dateien, die nicht mitgewandert sind, liegen unverändert am alten Ort
    // und sind für Mitarbeitende weiter lesbar. Das Verschieben ist
    // wiederholbar, deshalb bieten wir es gleich noch einmal an.
    for (const e of ergebnisse) {
      let problem = e.dateienProblem;
      while (problem) {
        const nochmal = await confirmDialog({
          title: "Einige Dateien konnten nicht verschoben werden",
          description: `${problem} Die Dateien sind nicht verloren: Sie liegen noch im Ordner des Kontakts im Papierkorb, und das Team sieht sie weiter. Im Kundenportal erscheinen sie erst nach dem Verschieben.`,
          confirmText: "Noch einmal versuchen",
          cancelText: "So lassen",
        });
        if (!nochmal) break;
        problem = await zusammengefuehrteDateienVerschieben(e.behaltenId, e.aufgeloestId);
      }
    }

    if (fehler instanceof ZusammenfuehrenMigrationFehlt) {
      await hinweisDialog({
        title: "Zusammenführen noch nicht möglich",
        description: "Die Datenbank-Erweiterung dafür ist noch nicht eingespielt (Migration 20260926230000). Es wurde nichts verändert.",
      });
    } else if (fehler) {
      toast({
        title: "Fehler beim Zusammenführen",
        description: fehler instanceof Error ? fehler.message : String(fehler),
        variant: "destructive",
      });
    }
  };

  const handleMerge = async (gruppe: DuplikatGruppe) => {
    setMergeConfirm(null);
    await gruppenZusammenfuehren([gruppe]);
  };

  // Alle markierten Gruppen auf einmal ignorieren: gleicher Mechanismus wie
  // der Ignorieren-Knopf je Gruppe, nur gesammelt. Loescht nichts, die
  // Gruppen werden nur dauerhaft aus dem Banner ausgeblendet.
  const handleBulkIgnore = () => {
    const next = new Set(dismissed);
    selectedGroups.forEach(key => next.add(key));
    const anzahl = selectedGroups.size;
    persistDismissed(next);
    setSelectedGroups(new Set());
    toast({
      title: "Gruppen ignoriert",
      description: `${anzahl} Duplikat-Gruppe${anzahl !== 1 ? "n" : ""} werden nicht mehr angezeigt.`,
    });
  };

  const handleBulkMerge = async () => {
    setBulkConfirm(false);
    const gruppen = duplikate.filter(g => selectedGroups.has(g.key));
    await gruppenZusammenfuehren(gruppen);
    setSelectedGroups(new Set());
  };

  const totalDupes = duplikate.reduce((sum, g) => sum + g.kontakte.length - 1, 0);
  const selectedDupesCount = duplikate
    .filter(g => selectedGroups.has(g.key))
    .reduce((sum, g) => sum + g.kontakte.length - 1, 0);

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
                {totalDupes} doppelte Einträge nach E-Mail, Telefon oder Namen gefunden
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {someSelected && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs h-8"
                onClick={handleBulkIgnore}
              >
                <X className="h-3 w-3" />
                {selectedGroups.size} Gruppe{selectedGroups.size > 1 ? "n" : ""} ignorieren
              </Button>
            )}
            {someSelected && (
              <Button
                size="sm"
                className="gap-1 text-xs h-8"
                disabled={laeuft}
                onClick={() => setBulkConfirm(true)}
              >
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
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Alle Gruppen auswählen"
                />
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
                <div
                  key={gruppe.key}
                  className={`bg-card border rounded-lg p-3 transition-colors ${
                    isSelected ? "border-primary/50 bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleGroup(gruppe.key)}
                        aria-label={`Gruppe ${gruppe.label} auswählen`}
                      />
                      <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                        {typIcon(gruppe.typ)}
                        {gruppe.kontakte.length}× {duplikatEtikett(gruppe.kriterien)}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">{gruppe.label}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7"
                        onClick={() => persistDismissed(new Set(dismissed).add(gruppe.key))}
                      >
                        <X className="h-3 w-3" /> Ignorieren
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1 text-xs h-7"
                        disabled={laeuft}
                        onClick={() => setMergeConfirm(gruppe)}
                      >
                        <Merge className="h-3 w-3" /> Zusammenführen
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {gruppe.kontakte.map((k, idx) => (
                      <div
                        key={k.id}
                        className="flex items-center gap-3 text-xs cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                        onClick={() => navigate(`/kunden/${k.id}`)}
                      >
                        {idx === 0 && (
                          <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">Behalten</Badge>
                        )}
                        {idx > 0 && (
                          <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">Papierkorb</Badge>
                        )}
                        <span className="font-medium">{k.vorname} {k.nachname}</span>
                        {k.telefon && <span className="text-muted-foreground">{k.telefon}</span>}
                        {k.email && !isPlaceholderEmail(k.email.toLowerCase()) && (
                          <span className="text-muted-foreground">{k.email}</span>
                        )}
                        <span className="text-muted-foreground ml-auto">
                          {k.erstellt_am ? new Date(k.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}
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
        <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplikate zusammenführen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {mergeConfirm ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Bleibt:</strong>{" "}
                    {mergeConfirm.kontakte[0].vorname} {mergeConfirm.kontakte[0].nachname}
                    {" "}({formatMoreId(mergeConfirm.kontakte[0])}, angelegt am {formatDatum(mergeConfirm.kontakte[0].erstellt_am)}), der ältere Kontakt.
                  </p>
                  <div>
                    <strong className="text-foreground">Geht in den Papierkorb:</strong>
                    <ul className="list-disc pl-5">
                      {mergeConfirm.kontakte.slice(1).map((k) => (
                        <li key={k.id}>
                          {k.vorname} {k.nachname} ({formatMoreId(k)}, angelegt am {formatDatum(k.erstellt_am)})
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p>
                    Vorher wandert alles zum älteren Kontakt: Investments, Aufgaben, Verlauf, Dokumente,
                    Unterschriften, Termine und der Portalzugang. Leere Felder werden gefüllt, abweichende
                    Angaben stehen als Notiz im Verlauf. Das lässt sich nicht automatisch rückgängig machen.
                  </p>
                </div>
              ) : <div />}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Nichts ändern</AlertDialogCancel>
            <AlertDialogAction onClick={() => mergeConfirm && handleMerge(mergeConfirm)}>
              Zusammenführen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkConfirm} onOpenChange={setBulkConfirm}>
        <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY}>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedGroups.size} Gruppen zusammenführen?</AlertDialogTitle>
            <AlertDialogDescription>
              In jeder ausgewählten Gruppe bleibt der ältere Kontakt. Alles von den neueren wandert zu ihm,
              danach gehen <strong>{selectedDupesCount} neuere Kontakt{selectedDupesCount !== 1 ? "e" : ""}</strong> aus
              {" "}{selectedGroups.size} Gruppe{selectedGroups.size > 1 ? "n" : ""} in den Papierkorb.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Nichts ändern</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkMerge}>
              Alle zusammenführen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
