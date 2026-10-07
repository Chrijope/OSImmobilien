import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Star, ArrowLeft, Users, TrendingUp, MessageSquareQuote, ThumbsUp, ThumbsDown, Filter } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Bewertung = {
  id: string;
  kontakt_id: string;
  vp_user_id: string | null;
  vp_name: string | null;
  kunde_name: string | null;
  r_informationen: number;
  r_arbeitsweise: number;
  r_ziele: number;
  r_produkt: number;
  r_beratungsart: number;
  r_berater_erfahrung: number;
  gelohnt: boolean | null;
  weiterempfehlung: boolean | null;
  kommentar: string | null;
  created_at: string;
};

const RATING_KEYS = [
  "r_informationen",
  "r_arbeitsweise",
  "r_ziele",
  "r_produkt",
  "r_beratungsart",
  "r_berater_erfahrung",
] as const;

const LABELS: Record<typeof RATING_KEYS[number], string> = {
  r_informationen: "Verständlichkeit der Informationen",
  r_arbeitsweise: "Arbeitsweise & Konzept",
  r_ziele: "Ziele der Arbeitsweise",
  r_produkt: "Produktinformationen",
  r_beratungsart: "Art der Beratung",
  r_berater_erfahrung: "Erfahrung mit dem Berater",
};

function avgOf(b: Bewertung) {
  const sum = RATING_KEYS.reduce((s, k) => s + (b[k] || 0), 0);
  return sum / RATING_KEYS.length;
}

function scoreColor(score: number) {
  if (score >= 3.5) return "text-emerald-500";
  if (score >= 2.5) return "text-amber-500";
  return "text-rose-500";
}

function Stars({ score }: { score: number }) {
  const full = Math.round(score);
  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i < full ? "text-yellow-500 fill-yellow-500" : "text-foreground/20",
          )}
        />
      ))}
    </div>
  );
}

export default function VpBewertungen() {
  const [items, setItems] = useState<Bewertung[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; avatar_url?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedVp, setSelectedVp] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [internalUsers, setInternalUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("vp_bewertungen" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) { setLoading(false); return; }
      const list = (data || []) as unknown as Bewertung[];
      setItems(list);
      const ids = Array.from(new Set(list.map((b) => b.vp_user_id).filter(Boolean))) as string[];
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles" as any)
          .select("id, name, avatar_url")
          .in("id", ids);
        if (!cancelled && profs) {
          const map: Record<string, { name: string; avatar_url?: string }> = {};
          for (const p of profs as any[]) {
            map[p.id] = { name: p.name || "", avatar_url: p.avatar_url || undefined };
          }
          setProfiles(map);
        }
      }

      const { data: rolesData } = await supabase
        .from("user_roles" as any)
        .select("user_id, role")
        .in("role", ["vertriebspartner", "vertriebsleiter", "admin", "inhaber"]);
      const userIds = Array.from(new Set((rolesData || []).map((r: any) => r.user_id))) as string[];
      if (userIds.length > 0) {
        const { data: profsData } = await supabase
          .from("profiles" as any)
          .select("id, name")
          .in("id", userIds)
          .order("name", { ascending: true });
        if (!cancelled && profsData) {
          const seen = new Set<string>();
          const users: { id: string; name: string }[] = [];
          for (const p of profsData as any[]) {
            if (!seen.has(p.id)) {
              seen.add(p.id);
              users.push({ id: p.id, name: p.name || "Unbekannt" });
            }
          }
          setInternalUsers(users);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const buckets = new Map<string, { key: string; vpUserId: string | null; name: string; avatar?: string; items: Bewertung[] }>();
    for (const b of items) {
      const key = b.vp_user_id || `name:${b.vp_name || "unbekannt"}`;
      const profile = b.vp_user_id ? profiles[b.vp_user_id] : undefined;
      const name = profile?.name || b.vp_name || "Unbekannt";
      if (!buckets.has(key)) {
        buckets.set(key, { key, vpUserId: b.vp_user_id, name, avatar: profile?.avatar_url, items: [] });
      }
      buckets.get(key)!.items.push(b);
    }
    return Array.from(buckets.values()).map((g) => {
      const scores = g.items.map(avgOf);
      const avg = scores.reduce((s, x) => s + x, 0) / (scores.length || 1);
      const empfehl = g.items.filter((i) => i.weiterempfehlung === true).length;
      const empfehlRate = g.items.length > 0 ? empfehl / g.items.length : 0;
      return { ...g, avg, count: g.items.length, empfehlRate };
    }).sort((a, b) => b.avg - a.avg || b.count - a.count);
  }, [items, profiles]);

  const filtered = useMemo(() => {
    let list = grouped;
    if (filterUserId !== "all") {
      list = list.filter((g) => g.vpUserId === filterUserId);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }
    return list;
  }, [grouped, search, filterUserId]);

  const totalAvg = useMemo(() => {
    if (items.length === 0) return 0;
    return items.map(avgOf).reduce((s, x) => s + x, 0) / items.length;
  }, [items]);
  const totalEmpfehl = useMemo(() => {
    const j = items.filter((i) => i.weiterempfehlung === true).length;
    return items.length ? j / items.length : 0;
  }, [items]);

  const selected = selectedVp ? grouped.find((g) => g.key === selectedVp) || null : null;

  return (
    <div className="space-y-6">
      <PageHeader title="VP-Bewertungen" subtitle="Qualitätsfeedback unserer Kunden zur Beratung und Kundenkommunikation." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <Users className="h-5 w-5 text-foreground/60" />
          <div>
            <div className="text-2xl font-semibold">{items.length}</div>
            <div className="text-xs text-muted-foreground">Bewertungen gesamt</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
          <div>
            <div className={cn("text-2xl font-semibold", scoreColor(totalAvg))}>
              {totalAvg.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">/ 4</span>
            </div>
            <div className="text-xs text-muted-foreground">Durchschnittsscore</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <ThumbsUp className="h-5 w-5 text-emerald-500" />
          <div>
            <div className="text-2xl font-semibold">{Math.round(totalEmpfehl * 100)}%</div>
            <div className="text-xs text-muted-foreground">Weiterempfehlungsrate</div>
          </div>
        </Card>
      </div>

      {!selected ? (
        <>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Input
              placeholder="Berater suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterUserId} onValueChange={setFilterUserId}>
              <SelectTrigger className="w-full sm:w-64">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Alle Berater" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Berater</SelectItem>
                {internalUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
              <div className="col-span-5">Vertriebspartner</div>
              <div className="col-span-3">Score</div>
              <div className="col-span-2 text-center">Bewertungen</div>
              <div className="col-span-2 text-right">Weiterempfehlung</div>
            </div>
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground text-center">Lade Bewertungen…</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-sm text-muted-foreground text-center">Noch keine Bewertungen vorhanden.</div>
            ) : (
              filtered.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setSelectedVp(g.key)}
                  className="w-full text-left grid grid-cols-12 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                >
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9">
                      {g.avatar && <AvatarImage src={g.avatar} alt={g.name} />}
                      <AvatarFallback>{g.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{g.name}</div>
                      <div className="text-xs text-muted-foreground">Vertriebspartner</div>
                    </div>
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <Stars score={g.avg} />
                    <span className={cn("text-sm font-semibold", scoreColor(g.avg))}>{g.avg.toFixed(2)}</span>
                  </div>
                  <div className="col-span-2 text-center text-sm">{g.count}</div>
                  <div className="col-span-2 text-right">
                    <Badge variant="outline" className={cn(g.empfehlRate >= 0.8 ? "border-emerald-500/40 text-emerald-600" : g.empfehlRate >= 0.5 ? "border-amber-500/40 text-amber-600" : "border-rose-500/40 text-rose-600")}>
                      {Math.round(g.empfehlRate * 100)}%
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </Card>
        </>
      ) : (
        <VpDetail group={selected} onBack={() => setSelectedVp(null)} />
      )}
    </div>
  );
}

function VpDetail({ group, onBack }: { group: { name: string; avatar?: string; items: Bewertung[]; avg: number; empfehlRate: number; count: number }; onBack: () => void }) {
  const perCategory = RATING_KEYS.map((k) => {
    const vals = group.items.map((b) => b[k]).filter((v) => typeof v === "number") as number[];
    const avg = vals.reduce((s, x) => s + x, 0) / (vals.length || 1);
    return { key: k, label: LABELS[k], avg };
  });
  const gelohntJa = group.items.filter((i) => i.gelohnt === true).length;
  const gelohntRate = group.items.length ? gelohntJa / group.items.length : 0;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
      </button>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            {group.avatar && <AvatarImage src={group.avatar} alt={group.name} />}
            <AvatarFallback>{group.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-semibold truncate">{group.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <Stars score={group.avg} />
              <span className={cn("text-sm font-semibold", scoreColor(group.avg))}>{group.avg.toFixed(2)} / 4</span>
              <span className="text-xs text-muted-foreground">· {group.count} Bewertungen</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-5 space-y-3">
          <div className="text-sm font-medium flex items-center gap-2"><TrendingUp className="h-4 w-4 text-foreground/60" /> Score je Kategorie</div>
          {perCategory.map((c) => (
            <div key={c.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/80">{c.label}</span>
                <span className={cn("font-semibold", scoreColor(c.avg))}>{c.avg.toFixed(2)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(c.avg / 4) * 100}%` }} />
              </div>
            </div>
          ))}
        </Card>
        <Card className="p-5 space-y-4">
          <div className="text-sm font-medium">Kundenstimmung</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3 text-center">
              <ThumbsUp className="h-5 w-5 mx-auto text-emerald-500" />
              <div className="text-xl font-semibold mt-1">{Math.round(group.empfehlRate * 100)}%</div>
              <div className="text-[11px] text-muted-foreground">würden weiterempfehlen</div>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <Star className="h-5 w-5 mx-auto text-yellow-500 fill-yellow-500" />
              <div className="text-xl font-semibold mt-1">{Math.round(gelohntRate * 100)}%</div>
              <div className="text-[11px] text-muted-foreground">Gespräch hat sich gelohnt</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-sm font-medium flex items-center gap-2 mb-3">
          <MessageSquareQuote className="h-4 w-4 text-foreground/60" /> Einzelne Bewertungen
        </div>
        <div className="divide-y divide-border">
          {group.items.map((b) => (
            <div key={b.id} className="py-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Stars score={avgOf(b)} />
                  <span className={cn("font-semibold", scoreColor(avgOf(b)))}>{avgOf(b).toFixed(2)}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-foreground/80">{b.kunde_name || "Anonym"}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{new Date(b.created_at).toLocaleDateString("de-DE")}</span>
                  {b.weiterempfehlung === true ? (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600"><ThumbsUp className="h-3 w-3 mr-1" />Empfohlen</Badge>
                  ) : b.weiterempfehlung === false ? (
                    <Badge variant="outline" className="border-rose-500/40 text-rose-600"><ThumbsDown className="h-3 w-3 mr-1" />Nein</Badge>
                  ) : null}
                </div>
              </div>
              {b.kommentar && (
                <p className="text-sm text-foreground/85 italic border-l-2 border-primary/40 pl-3">„{b.kommentar}"</p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}