import "@/styles/akademie-neu.css";
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, ChevronDown, ChevronUp, User, Trophy, MessageSquare } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { VERTRIEBSAKADEMIE_KAPITEL } from "@/lib/vertriebsakademieContent";

interface PartnerRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  totalXp: number;
  /** Punkte aus richtig gelösten Aufgaben. Anders als die alten XP misst das Können. */
  punkte: number;
  geloesteAufgaben: number;
  doneKapitel: number;
  totalKapitel: number;
  overallPct: number;
  lastUpdate: string | null;
}

interface AntwortRow {
  id: string;
  kapitel_slug: string;
  uebung_id: string;
  uebung_titel: string | null;
  antwort: string;
  erledigt: boolean;
  xp: number;
  updated_at: string;
}

interface FortschrittRow {
  kapitel_slug: string;
  checks_done: number;
  uebungen_done: number;
  xp_total: number;
  pct: number;
  kapitel_abgeschlossen: boolean;
  updated_at: string;
}

export default function VertriebsakademieAdmin() {
  const neueAnsicht = useLocation().pathname.startsWith("/vertriebsakademie");
  const { user } = useUser();
  const isCoach = ["admin", "inhaber", "vertriebsleiter"].includes(user.role);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [query, setQuery] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [detailAnt, setDetailAnt] = useState<AntwortRow[]>([]);
  const [detailFort, setDetailFort] = useState<FortschrittRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!isCoach) return;
    (async () => {
      setLoading(true);
      try {
        const [{ data: fortAll }, { data: profiles }, { data: roles }, { data: aufgaben }] =
          await Promise.all([
            supabase.from("va_partner_fortschritt").select("*"),
            supabase.from("profiles").select("id, name, email"),
            supabase.from("user_roles").select("user_id, role"),
            supabase.from("va_aufgaben_ergebnisse" as never).select("user_id, punkte, geloest"),
          ]);

        // Punkte und gelöste Aufgaben je Partner
        const punkteById = new Map<string, { punkte: number; geloest: number }>();
        ((aufgaben as { user_id: string; punkte: number; geloest: boolean }[] | null) || []).forEach((a) => {
          const bisher = punkteById.get(a.user_id) || { punkte: 0, geloest: 0 };
          punkteById.set(a.user_id, {
            punkte: bisher.punkte + (a.punkte || 0),
            geloest: bisher.geloest + (a.geloest ? 1 : 0),
          });
        });

        const rolesById = new Map<string, string>();
        (roles || []).forEach((r: any) => rolesById.set(r.user_id, r.role));
        const profileById = new Map<string, { name: string; email: string }>();
        (profiles || []).forEach((p: any) => profileById.set(p.id, { name: p.name || "", email: p.email || "" }));

        // Aggregiere pro User
        const byUser = new Map<string, FortschrittRow[]>();
        (fortAll || []).forEach((f: any) => {
          const list = byUser.get(f.user_id) || [];
          list.push(f);
          byUser.set(f.user_id, list);
        });

        const partnerRows: PartnerRow[] = [];
        for (const [userId, list] of byUser) {
          const totalXp = list.reduce((a, r) => a + (r.xp_total || 0), 0);
          const doneKap = list.filter(r => r.kapitel_abgeschlossen).length;
          const totalKap = VERTRIEBSAKADEMIE_KAPITEL.length;
          const overallPct = totalKap > 0
            ? Math.round(list.reduce((a, r) => a + (r.pct || 0), 0) / totalKap)
            : 0;
          const lastUpdate = list.reduce<string | null>((a, r) => {
            if (!a) return r.updated_at;
            return r.updated_at > a ? r.updated_at : a;
          }, null);
          const p = profileById.get(userId);
          partnerRows.push({
            user_id: userId,
            name: p?.name || "Unbekannt",
            email: p?.email || "",
            role: rolesById.get(userId) || "—",
            totalXp,
            punkte: punkteById.get(userId)?.punkte ?? 0,
            geloesteAufgaben: punkteById.get(userId)?.geloest ?? 0,
            doneKapitel: doneKap, totalKapitel: totalKap, overallPct, lastUpdate,
          });
        }
        // Bewusst nicht nach Punkten sortieren. Eine Rangliste nach Punkten
        // wäre genau die Gamification, die im Partnerbild entfernt wurde, nur
        // hinter dem Rücken der Partner. Und die alten XP messen Häkchen und
        // Textlänge, nicht Können. Sortiert wird deshalb nach zuletzt aktiv.
        partnerRows.sort((a, b) => (b.lastUpdate || "").localeCompare(a.lastUpdate || ""));
        setRows(partnerRows);
      } finally {
        setLoading(false);
      }
    })();
  }, [isCoach]);

  const loadDetail = async (userId: string) => {
    if (openUserId === userId) { setOpenUserId(null); return; }
    setOpenUserId(userId);
    setDetailLoading(true);
    try {
      const [{ data: ant }, { data: fort }] = await Promise.all([
        supabase.from("va_partner_antworten").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        supabase.from("va_partner_fortschritt").select("*").eq("user_id", userId),
      ]);
      setDetailAnt((ant || []) as any);
      setDetailFort((fort || []) as any);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q),
    );
  }, [rows, query]);

  if (!isCoach) return <Navigate to={neueAnsicht ? "/vertriebsakademie-neu" : "/vertriebsakademie"} replace />;

  return (
    <DashboardLayout>
      <div className={neueAnsicht ? "an-root an-neben space-y-6" : "w-full space-y-6"}>
        <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
          <Link to="/vertriebsakademie"><ArrowLeft className="h-4 w-4" /> Zurück zur Vertriebsakademie</Link>
        </Button>

        <PageHeader
          title="Vertriebsakademie · Fortschritt Partner"
          subtitle="Coaching-Übersicht: Wer hat welche Kapitel bearbeitet, welche Übungs-Antworten liegen vor."
        />

        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen nach Name, E-Mail, Rolle …"
              className="pl-9"
            />
          </div>
        </Card>

        {loading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Lade Fortschrittsdaten …</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "Noch keine Fortschrittsdaten vorhanden. Sobald ein Partner die ersten Übungen bearbeitet, erscheinen die Einträge hier."
              : "Keine Treffer für deine Suche."}
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const open = openUserId === r.user_id;
              return (
                <Card key={r.user_id} className="overflow-hidden">
                  <button
                    className="w-full flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => loadDetail(r.user_id)}
                  >
                    <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{r.name}</span>
                        <Badge variant="outline" className="text-[10px]">{r.role}</Badge>
                        <span className="text-[11px] text-muted-foreground">{r.email}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1" title="Punkte aus richtig gelösten Aufgaben">
                          <Trophy className="h-3 w-3 text-amber-500" /> {r.punkte} Punkte
                        </span>
                        <span>{r.doneKapitel}/{r.totalKapitel} Kapitel</span>
                        <span>{r.geloesteAufgaben} Aufgaben gelöst</span>
                        <span className="tabular-nums">{r.overallPct}% gesamt</span>
                        {r.lastUpdate && <span>· zuletzt {new Date(r.lastUpdate).toLocaleDateString("de-DE")}</span>}
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all" style={{ width: `${r.overallPct}%` }} />
                      </div>
                    </div>
                    {open ? <ChevronUp className="h-4 w-4 opacity-50" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
                  </button>

                  {open && (
                    <div className="border-t bg-muted/20 p-4 space-y-4">
                      {detailLoading ? (
                        <div className="text-xs text-muted-foreground text-center">Lade Details …</div>
                      ) : (
                        <>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Kapitel-Fortschritt</div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {VERTRIEBSAKADEMIE_KAPITEL.map((kap) => {
                                const f = detailFort.find(x => x.kapitel_slug === kap.slug);
                                const pct = f?.pct ?? 0;
                                return (
                                  <div key={kap.slug} className="rounded-md border bg-background p-2">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="font-medium truncate">{kap.nummer}. {kap.titel}</span>
                                      <span className="tabular-nums text-muted-foreground shrink-0">{pct}%</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-muted mt-1 overflow-hidden">
                                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" /> Übungs-Antworten ({detailAnt.length})
                            </div>
                            {detailAnt.length === 0 ? (
                              <div className="text-xs text-muted-foreground italic">Noch keine Antworten eingereicht.</div>
                            ) : (
                              <div className="space-y-2">
                                {detailAnt.map((a) => {
                                  const kap = VERTRIEBSAKADEMIE_KAPITEL.find(k => k.slug === a.kapitel_slug);
                                  return (
                                    <div key={a.id} className={`rounded-md border bg-background p-3 ${a.erledigt ? "border-emerald-500/30" : ""}`}>
                                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                        <Badge variant="outline" className="text-[9px]">Kap. {kap?.nummer ?? "?"}</Badge>
                                        <span className="font-medium">{a.uebung_titel || a.uebung_id}</span>
                                        {a.erledigt && <Badge className="text-[9px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30">erledigt · +{a.xp} XP</Badge>}
                                        <span className="ml-auto text-muted-foreground">{new Date(a.updated_at).toLocaleString("de-DE")}</span>
                                      </div>
                                      {a.antwort ? (
                                        <pre className="mt-2 text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">
                                          {a.antwort}
                                        </pre>
                                      ) : (
                                        <div className="mt-2 text-xs text-muted-foreground italic">Kein Antworttext (nur Checkbox).</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}