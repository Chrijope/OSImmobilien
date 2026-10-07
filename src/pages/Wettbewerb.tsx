import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "@/lib/dataCache";
import { isTestAccount, localGet, localSet } from "@/lib/dbStoreHelper";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Flame, Trophy, Target, Users } from "lucide-react";
import { Medal, Crown, Award } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { loadAllUsers } from "@/lib/loadAllUsers";

// ── Challenge Type ──
interface ChallengeData {
  id: string;
  titel: string;
  icon: string;
  beschreibung: string;
  startDatum: string;
  endDatum: string;
  anzeigemonat: string;
  zielwert: number;
  einheit: string;
  preis: string;
  verbleibend: string;
  fortschritt: number;
  aktiv: boolean;
  ranking: { pos: number; kuerzel: string; name: string; wert: number; ich: boolean; color: string }[];
  ergebnis?: string;
}

const ICONS = ["🏆", "🎯", "🔥", "💰", "⚡", "🏅", "🎖️", "🥇"];
const LS_KEY = "mi_wettbewerb_challenges";

function toDb(c: ChallengeData): Record<string, any> {
  return {
    id: c.id, titel: c.titel, icon: c.icon, beschreibung: c.beschreibung,
    start_datum: c.startDatum, end_datum: c.endDatum, anzeigemonat: c.anzeigemonat,
    zielwert: c.zielwert, einheit: c.einheit, preis: c.preis, fortschritt: c.fortschritt,
    aktiv: c.aktiv, ranking: c.ranking, ergebnis: c.ergebnis || null,
  };
}

function fromDb(r: any): ChallengeData {
  return {
    id: r.id, titel: r.titel, icon: r.icon || "🏆", beschreibung: r.beschreibung || "",
    startDatum: r.start_datum || "", endDatum: r.end_datum || "", anzeigemonat: r.anzeigemonat || "",
    zielwert: r.zielwert || 0, einheit: r.einheit || "", preis: r.preis || "",
    verbleibend: "–", fortschritt: r.fortschritt || 0, aktiv: r.aktiv ?? true,
    ranking: r.ranking || [], ergebnis: r.ergebnis,
  };
}

function loadChallenges(): ChallengeData[] {
  if (isTestAccount()) return localGet<ChallengeData[]>(LS_KEY, []);
  return cacheGet("wettbewerb_challenges").map(fromDb);
}

function saveChallengeToDb(c: ChallengeData) {
  if (isTestAccount()) {
    const all = localGet<ChallengeData[]>(LS_KEY, []);
    all.push(c);
    localSet(LS_KEY, all);
  } else {
    cacheInsert("wettbewerb_challenges", toDb(c));
  }
}

function updateChallengeInDb(id: string, data: Partial<ChallengeData>) {
  if (isTestAccount()) {
    const all = localGet<ChallengeData[]>(LS_KEY, []).map(c => c.id === id ? { ...c, ...data } : c);
    localSet(LS_KEY, all);
  } else {
    const existing = cacheGet("wettbewerb_challenges").find((r: any) => r.id === id);
    if (!existing) return;
    const merged = { ...fromDb(existing), ...data };
    const { id: _id, ...updates } = toDb(merged);
    cacheUpdate("wettbewerb_challenges", id, updates);
  }
}

function deleteChallengeFromDb(id: string) {
  if (isTestAccount()) {
    localSet(LS_KEY, localGet<ChallengeData[]>(LS_KEY, []).filter(c => c.id !== id));
  } else {
    cacheDelete("wettbewerb_challenges", id);
  }
}

const posIcon = (pos: number) => {
  if (pos === 1) return "👑";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return String(pos);
};

// ── Challenge Form Dialog ──
function ChallengeDialog({
  open, onClose, challenge, onSave, onDelete,
}: {
  open: boolean;
  onClose: () => void;
  challenge?: ChallengeData;
  onSave: (data: Partial<ChallengeData>) => void;
  onDelete?: () => void;
}) {
  const isEdit = !!challenge;
  const [titel, setTitel] = useState(challenge?.titel || "");
  const [icon, setIcon] = useState(challenge?.icon || "🏆");
  const [beschreibung, setBeschreibung] = useState(challenge?.beschreibung || "");
  const [startDatum, setStartDatum] = useState(challenge?.startDatum || new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }));
  const [endDatum, setEndDatum] = useState(challenge?.endDatum || new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }));
  const [anzeigemonat, setAnzeigemonat] = useState(challenge?.anzeigemonat || "");
  const [zielwert, setZielwert] = useState(challenge?.zielwert?.toString() || "");
  const [einheit, setEinheit] = useState(challenge?.einheit || "Inserate");
  const [preis, setPreis] = useState(challenge?.preis || "AirPods Pro");
  const [showIcons, setShowIcons] = useState(false);

  useEffect(() => {
    if (open) {
      setTitel(challenge?.titel || "");
      setIcon(challenge?.icon || "🏆");
      setBeschreibung(challenge?.beschreibung || "");
      setStartDatum(challenge?.startDatum || new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }));
      setEndDatum(challenge?.endDatum || new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }));
      setAnzeigemonat(challenge?.anzeigemonat || "");
      setZielwert(challenge?.zielwert?.toString() || "");
      setEinheit(challenge?.einheit || "Inserate");
      setPreis(challenge?.preis || "AirPods Pro");
      setShowIcons(false);
    }
  }, [open, challenge]);

  const handleSave = () => {
    onSave({
      titel, icon, beschreibung, startDatum, endDatum, anzeigemonat,
      zielwert: parseInt(zielwert) || 0, einheit, preis,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">



        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <><Pencil className="h-4 w-4" /> Challenge bearbeiten</> : <><Plus className="h-4 w-4" /> Neue Challenge erstellen</>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Titel *</Label>
              <Input value={titel} onChange={e => setTitel(e.target.value)} placeholder="z.B. B2C Sprint März" />
            </div>
            <div className="w-16">
              <Label>Icon</Label>
              <button
                onClick={() => setShowIcons(!showIcons)}
                className="w-full h-10 border border-border rounded-md flex items-center justify-center text-xl hover:bg-muted/50"
              >
                {icon}
              </button>
              {showIcons && (
                <div className="absolute z-10 mt-1 bg-card border border-border rounded-md p-2 grid grid-cols-4 gap-1 shadow-lg">
                  {ICONS.map(ic => (
                    <button key={ic} onClick={() => { setIcon(ic); setShowIcons(false); }}
                      className="w-8 h-8 rounded hover:bg-muted flex items-center justify-center text-lg">
                      {ic}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <Label>Beschreibung</Label>
            <Textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Beschreibe die Challenge…" rows={3} className="resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Startdatum *</Label>
              <Input value={startDatum} onChange={e => setStartDatum(e.target.value)} placeholder="TT.MM.JJJJ" />
            </div>
            <div>
              <Label>Enddatum *</Label>
              <Input value={endDatum} onChange={e => setEndDatum(e.target.value)} placeholder="TT.MM.JJJJ" />
            </div>
          </div>
          <div>
            <Label>Anzeige-Monat</Label>
            <Input value={anzeigemonat} onChange={e => setAnzeigemonat(e.target.value)} placeholder="z.B. März 2026" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Zielwert</Label>
              <Input type="number" value={zielwert} onChange={e => setZielwert(e.target.value)} />
            </div>
            <div>
              <Label>Einheit</Label>
              <Input value={einheit} onChange={e => setEinheit(e.target.value)} placeholder="Inserate" />
            </div>
            <div>
              <Label>Preis</Label>
              <Input value={preis} onChange={e => setPreis(e.target.value)} placeholder="Apple AirPods" />
            </div>
          </div>
        </div>
        <DialogFooter className="flex !justify-between">
          <div>
            {isEdit && onDelete && (
              <Button variant="destructive" size="sm" onClick={() => { onDelete(); onClose(); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Löschen
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Abbrechen</Button>
            <Button size="sm" onClick={handleSave}>{isEdit ? "Speichern" : "Erstellen"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Challenge Card ──
function ChallengeCard({
  challenge, defaultOpen = false, canEdit, onEdit, onDelete, highlightPartner,
}: {
  challenge: ChallengeData; defaultOpen?: boolean; canEdit: boolean;
  onEdit: () => void; onDelete: () => void; highlightPartner?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const top3 = challenge.ranking.slice(0, 3);
  const podium = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg">{challenge.icon}</div>
              <div>
                <p className="font-bold text-foreground">{challenge.titel}</p>
                <p className="text-xs text-muted-foreground">{challenge.beschreibung}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <>
                  <button onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                  <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
              <Badge className="bg-success text-destructive-foreground text-[10px]">Aktiv</Badge>
              <CollapsibleTrigger>
                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CollapsibleTrigger>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Zeitraum</p>
              <p className="font-semibold text-sm text-foreground">{challenge.anzeigemonat}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Ziel</p>
              <p className="font-semibold text-sm text-foreground">{challenge.zielwert} {challenge.einheit}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Preis</p>
              <p className="font-semibold text-sm text-foreground">{challenge.preis}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Verbleibend</p>
              <p className="font-semibold text-sm text-foreground">{challenge.verbleibend}</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1">✨ Dein Fortschritt</span>
              <span>{challenge.fortschritt}%</span>
            </div>
            <Progress value={challenge.fortschritt} className="h-2.5" />
          </div>

          <CollapsibleContent>
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2 mb-6">
                🏅 Ranking – {challenge.titel}
              </p>

              {podium.length >= 3 && (
                <div className="flex items-end justify-center gap-3 mb-6">
                  {podium.map((p, i) => {
                    const isFirst = i === 1;
                    const height = isFirst ? "h-24" : i === 0 ? "h-16" : "h-12";
                    const avatarSize = isFirst ? "w-14 h-14" : "w-10 h-10";
                    return (
                      <div key={p.pos} className="flex flex-col items-center">
                        <span className="text-sm mb-1">{posIcon(p.pos)}</span>
                        <div className={`${avatarSize} rounded-full ${p.color} flex items-center justify-center text-xs font-bold text-card mb-1`}>
                          {p.kuerzel}
                        </div>
                        <p className={`text-xs font-medium ${p.ich ? "text-primary" : "text-foreground"}`}>{p.name}</p>
                        <p className="text-xs text-muted-foreground"><strong>{p.wert}</strong> {challenge.einheit}</p>
                        <div className={`${height} w-14 rounded-t-lg ${isFirst ? "bg-primary" : "bg-muted"} flex items-end justify-center pb-1 mt-1`}>
                          <span className={`text-xs font-bold ${isFirst ? "text-primary-foreground" : "text-muted-foreground"}`}>{p.pos}.</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-0">
                {challenge.ranking.map((r) => {
                  const isHighlighted = highlightPartner ? r.name === highlightPartner : r.ich;
                  return (
                  <div key={r.pos}
                    className={`flex items-center justify-between py-3 px-3 rounded-lg ${isHighlighted ? "bg-primary/10 ring-1 ring-primary/30" : ""} border-b border-border last:border-0`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm w-5 text-center">{posIcon(r.pos)}</span>
                      <div className={`w-8 h-8 rounded-full ${r.color} flex items-center justify-center text-[10px] font-bold text-card`}>
                        {r.kuerzel}
                      </div>
                      <span className={`text-sm font-medium ${isHighlighted ? "text-primary font-semibold" : "text-foreground"} flex items-center gap-1.5`}>
                        {r.name}
                        {isHighlighted && <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 h-4">{highlightPartner ? "Ausgewählt" : "Du"}</Badge>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">{r.wert}</span>
                      <span className="text-xs text-muted-foreground">{challenge.einheit}</span>
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(r.wert / challenge.ranking[0].wert) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}

// ── Main Page ──
const Wettbewerb = () => {
  const { user } = useUser();
  /*
   * Wer Challenges anlegen, bearbeiten und loeschen darf, entscheidet die
   * Datenbank, nicht diese Zeile. Massgeblich sind die drei Regeln auf
   * `wettbewerb_challenges` in
   * `supabase/migrations/20260316192547_23b5cb54-8ae2-4efc-be85-b0aa5e5ed00c.sql`
   * (Zeilen 202 bis 206). Alle drei verlangen `is_admin_role`, also die
   * Rollen `admin` und `inhaber`.
   *
   * Hier stand vorher `admin`, `vertriebsleiter`, `backoffice`. Die beiden
   * letzten sahen dadurch Knoepfe, die ihnen die Datenbank beim Klick
   * verweigert hat (Fehlercode 42501). Sichtbar wurde daraus eine
   * Fehlermeldung fuer etwas, das der Nutzer gar nicht falsch gemacht hat.
   * Dieselbe Fehlerklasse ist schon auf den Seiten Unterlagen und
   * Praesentation aufgetreten und dort ebenso geloest worden.
   *
   * Die Liste ist deshalb bewusst eine Kopie dessen, was die Datenbank
   * erlaubt. Soll die Vertriebsleitung oder das Backoffice kuenftig mitreden
   * duerfen, ist das eine fachliche Entscheidung und braucht zuerst eine
   * Migration, die die drei Regeln aufmacht. Diese Zeile allein zu erweitern
   * stellt nur den alten Zustand wieder her.
   */
  const canEdit = ["admin", "inhaber"].includes(user.role);
  const isAdmin = ["admin", "inhaber"].includes(user.role);

  const [challenges, setChallenges] = useState<ChallengeData[]>(() => loadChallenges());
  const [selectedPartner, setSelectedPartner] = useState<string>("alle");
  const vergangene = challenges.filter(c => !c.aktiv && c.ergebnis);
  const [vergangeneOpen, setVergangeneOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeData | undefined>(undefined);

  const allPartners = useMemo(() => {
    if (!isAdmin) return [];
    return loadAllUsers().filter(u => u.name && u.name.trim().length > 0);
  }, [isAdmin]);

  const aktive = challenges.filter(c => c.aktiv);
  const gewonnen = vergangene.filter(c => c.ergebnis?.includes("1.")).length;
  const bestePlatzierung = "#1";

  const handleCreate = () => {
    setEditingChallenge(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (c: ChallengeData) => {
    setEditingChallenge(c);
    setDialogOpen(true);
  };

  const handleSave = (data: Partial<ChallengeData>) => {
    if (editingChallenge) {
      updateChallengeInDb(editingChallenge.id, data);
      setChallenges(prev => prev.map(c => c.id === editingChallenge.id ? { ...c, ...data } : c));
    } else {
      const newChallenge: ChallengeData = {
        id: crypto.randomUUID(), aktiv: true, fortschritt: 0, verbleibend: "–",
        ranking: [], ...data,
      } as ChallengeData;
      saveChallengeToDb(newChallenge);
      setChallenges(prev => [...prev, newChallenge]);
    }
  };

  const handleDelete = (id: string) => {
    deleteChallengeFromDb(id);
    setChallenges(prev => prev.filter(c => c.id !== id));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Wettbewerb" subtitle="Challenges, Ranglisten & Prämien">
          {canEdit && (
            <Button variant="brand" size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" /> Challenge erstellen
            </Button>
          )}
        </PageHeader>

        {/* Admin Partner-Filter */}
        {isAdmin && allPartners.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Users className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Partner filtern</p>
                    <p className="text-xs text-muted-foreground">Wähle einen Partner, um dessen Ranking hervorzuheben</p>
                  </div>
                </div>
                <select
                  value={selectedPartner}
                  onChange={(e) => setSelectedPartner(e.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground w-full sm:w-auto sm:min-w-[220px]"
                >
                  <option value="alle">Alle Partner</option>
                  {allPartners.map(p => (
                    <option key={p.id} value={p.name}>{p.name}{p.rolle ? ` (${p.rolle})` : ""}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <Flame className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{aktive.length}</p>
              <p className="text-xs text-muted-foreground">Aktiv</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{bestePlatzierung}</p>
              <p className="text-xs text-muted-foreground">Beste Pos.</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{gewonnen}</p>
              <p className="text-xs text-muted-foreground">Gewonnen</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{aktive.length + vergangene.length}</p>
              <p className="text-xs text-muted-foreground">Gesamt</p>
            </div>
          </Card>
        </div>

        {/* Aktive Challenges */}
        {/* ── Gesamtranking über alle aktiven Challenges ── */}
        {aktive.length > 0 && (() => {
          // Aggregate ranking across all active challenges
          const aggregated = new Map<string, { name: string; kuerzel: string; color: string; ich: boolean; total: number; details: { challenge: string; wert: number; einheit: string }[] }>();
          aktive.forEach(c => {
            (c.ranking || []).forEach(r => {
              const key = r.name;
              if (!aggregated.has(key)) {
                aggregated.set(key, { name: r.name, kuerzel: r.kuerzel, color: r.color, ich: r.ich, total: 0, details: [] });
              }
              const entry = aggregated.get(key)!;
              entry.total += r.wert;
              entry.details.push({ challenge: c.titel, wert: r.wert, einheit: c.einheit });
            });
          });
          const sorted = [...aggregated.values()].sort((a, b) => b.total - a.total);
          const top3 = sorted.slice(0, 3);
          const podium = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
          const myEntry = sorted.find(s => s.ich);
          const myPos = myEntry ? sorted.indexOf(myEntry) + 1 : undefined;
          const highlightName = selectedPartner !== "alle" ? selectedPartner : undefined;

          return (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center">
                    <Crown className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-lg">Gesamtranking</p>
                    <p className="text-xs text-muted-foreground">Übersicht über alle {aktive.length} aktiven Challenges</p>
                  </div>
                </div>

                {/* Podium */}
                {podium.length >= 3 && (
                  <div className="flex items-end justify-center gap-5 mb-8">
                    {podium.map((p, i) => {
                      const isFirst = i === 1;
                      const pos = sorted.indexOf(p) + 1;
                      const height = isFirst ? "h-28" : i === 0 ? "h-20" : "h-14";
                      const avatarSize = isFirst ? "w-16 h-16" : "w-12 h-12";
                      const isHL = highlightName ? p.name === highlightName : p.ich;
                      return (
                        <div key={p.name} className={`flex flex-col items-center ${isHL ? "scale-105" : ""} transition-transform`}>
                          <span className="text-lg mb-1">{posIcon(pos)}</span>
                          <div className={`${avatarSize} rounded-full ${p.color || "bg-muted-foreground"} flex items-center justify-center text-sm font-bold text-card mb-1 ${isHL ? "ring-3 ring-primary ring-offset-2" : ""}`}>
                            {p.kuerzel}
                          </div>
                          <p className={`text-sm font-semibold ${isHL ? "text-primary" : "text-foreground"}`}>{p.name}</p>
                          <p className="text-xs text-muted-foreground font-semibold">{p.total} Punkte</p>
                          <div className={`${height} w-16 rounded-t-lg ${isFirst ? "bg-gradient-to-t from-yellow-500 to-amber-400" : i === 0 ? "bg-gradient-to-t from-slate-400 to-slate-300" : "bg-gradient-to-t from-amber-700 to-amber-600"} flex items-end justify-center pb-1.5 mt-1`}>
                            <span className="text-sm font-bold text-white">{pos}.</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Own position highlight */}
                {myEntry && !highlightName && (
                  <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3 ring-1 ring-primary/20 mb-6">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-primary">{posIcon(myPos!)}</span>
                      <div>
                        <span className="text-sm font-semibold text-primary">Dein Platz im Gesamtranking</span>
                        <p className="text-xs text-muted-foreground">Über alle aktiven Challenges hinweg</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-foreground">{myEntry.total} Punkte</span>
                      <Badge className="bg-primary text-primary-foreground text-xs px-2 h-6">#{myPos}</Badge>
                    </div>
                  </div>
                )}

                {/* Full ranking list */}
                <div className="space-y-0">
                  <div className="grid grid-cols-[40px_1fr_auto] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border">
                    <span>Rang</span>
                    <span>Partner</span>
                    <span className="text-right">Gesamt</span>
                  </div>
                  {sorted.map((r, idx) => {
                    const pos = idx + 1;
                    const isHL = highlightName ? r.name === highlightName : r.ich;
                    return (
                      <div key={r.name}
                        className={`grid grid-cols-[40px_1fr_auto] gap-3 items-center py-3 px-3 rounded-lg ${isHL ? "bg-primary/10 ring-1 ring-primary/30" : ""} border-b border-border last:border-0`}>
                        <span className="text-sm text-center font-semibold">{posIcon(pos)}</span>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full ${r.color || "bg-muted-foreground"} flex items-center justify-center text-[10px] font-bold text-card flex-shrink-0`}>
                            {r.kuerzel}
                          </div>
                          <div className="min-w-0">
                            <span className={`text-sm font-medium ${isHL ? "text-primary font-semibold" : "text-foreground"} flex items-center gap-1.5`}>
                              {r.name}
                              {isHL && <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 h-4">{highlightName ? "Ausgewählt" : "Du"}</Badge>}
                            </span>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {r.details.map((d, di) => (
                                <span key={di} className="text-[10px] text-muted-foreground">
                                  {d.challenge}: <strong>{d.wert}</strong> {d.einheit}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-bold text-foreground">{r.total}</span>
                          <div className="w-24 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${isHL ? "bg-primary" : "bg-primary/60"}`} style={{ width: `${sorted[0]?.total ? (r.total / sorted[0].total) * 100 : 0}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {sorted.length === 0 && (
                  <div className="text-center py-8">
                    <Medal className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Noch keine Ranking-Daten vorhanden.</p>
                    <p className="text-xs text-muted-foreground">Sobald Teilnehmer Fortschritte machen, erscheint hier das Ranking.</p>
                  </div>
                )}

                {/* Individual challenge rankings */}
                {aktive.map(ch => {
                  const chRanking = [...(ch.ranking || [])].sort((a, b) => b.wert - a.wert);
                  if (chRanking.length === 0) return null;
                  return (
                    <div key={ch.id} className="mt-6 pt-5 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{ch.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-foreground">{ch.titel}</p>
                          <p className="text-[10px] text-muted-foreground">{ch.anzeigemonat} · Ziel: {ch.zielwert} {ch.einheit}</p>
                        </div>
                      </div>
                      <div className="space-y-0">
                        {chRanking.map((r, idx) => {
                          const pos = idx + 1;
                          const isHL = highlightName ? r.name === highlightName : r.ich;
                          return (
                            <div key={r.name}
                              className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${isHL ? "bg-primary/10 ring-1 ring-primary/30" : ""} border-b border-border last:border-0`}>
                              <div className="flex items-center gap-3">
                                <span className="text-sm w-5 text-center font-semibold">{posIcon(pos)}</span>
                                <div className={`w-7 h-7 rounded-full ${r.color} flex items-center justify-center text-[9px] font-bold text-card`}>
                                  {r.kuerzel}
                                </div>
                                <span className={`text-sm ${isHL ? "text-primary font-semibold" : "text-foreground"}`}>
                                  {r.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-foreground">{r.wert}</span>
                                <span className="text-[10px] text-muted-foreground">{ch.einheit}</span>
                                <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${isHL ? "bg-primary" : "bg-primary/60"}`} style={{ width: `${chRanking[0]?.wert ? (r.wert / chRanking[0].wert) * 100 : 0}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })()}

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            🔥 Aktive Challenges ({aktive.length})
          </p>
          <div className="space-y-4">
            {aktive.map((c, i) => (
              <ChallengeCard
                key={c.id} challenge={c} defaultOpen={i === 0} canEdit={canEdit}
                onEdit={() => handleEdit(c)} onDelete={() => handleDelete(c.id)}
                highlightPartner={selectedPartner !== "alle" ? selectedPartner : undefined}
              />
            ))}
          </div>
        </div>

        {/* Vergangene Challenges */}
        <Collapsible open={vergangeneOpen} onOpenChange={setVergangeneOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            📅 Vergangene Challenges ({vergangene.length})
            <ChevronDown className={`h-4 w-4 transition-transform ${vergangeneOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {vergangene.map((c) => (
              <Card key={c.id} className="p-5 opacity-80">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg">{c.icon}</div>
                    <div>
                      <p className="font-bold text-foreground">{c.titel}</p>
                      <p className="text-xs text-muted-foreground">{c.beschreibung}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">{c.ergebnis}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-3 mt-3">
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Zeitraum</p>
                    <p className="font-semibold text-xs text-foreground">{c.anzeigemonat}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Ziel</p>
                    <p className="font-semibold text-xs text-foreground">{c.zielwert} {c.einheit}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Preis</p>
                    <p className="font-semibold text-xs text-foreground">{c.preis}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Dein Ergebnis</p>
                    <p className="font-semibold text-xs text-primary">{c.ergebnis}</p>
                  </div>
                </div>
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Create / Edit Dialog */}
      <ChallengeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        challenge={editingChallenge}
        onSave={handleSave}
        onDelete={editingChallenge ? () => handleDelete(editingChallenge.id) : undefined}
      />
    </DashboardLayout>
  );
};

export default Wettbewerb;
