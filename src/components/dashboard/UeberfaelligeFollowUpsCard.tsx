import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { getFollowUps } from "@/lib/followUpStore";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { tarnName } from "@/lib/vorfuehrmodus";
import { getKontakte } from "@/lib/kundenStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { istUeberfaellig } from "@/lib/dashboardKpis";
import { useDashboardFilter } from "@/lib/dashboardSicht";
import { istFuehrungskraft, teamMitgliederIds } from "@/lib/datenSicht";
import { getDoneInboxIds } from "@/lib/inboxCountStore";

export function UeberfaelligeFollowUpsCard() {
  const navigate = useNavigate();
  const _cv = useLiveVersion(["follow_ups", "kontakte"]);
  const { user, authUser } = useUser();
  const weiteSicht = istFuehrungskraft(user.role);
  // Dieselbe Auswahl wie die Filterleiste oben. Stellt ein Admin auf "Ganze
  // Firma", zählt auch diese Karte firmenweit.
  const { sicht } = useDashboardFilter(weiteSicht);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    // Die ID kommt jetzt aus dem angemeldeten Nutzer. Vorher stand sie im
    // localStorage, und wenn dort nichts lag, galt kein Kontakt mehr als
    // eigener, weil die Zuständigkeit per ID entscheidet. Die Karte zeigte
    // dann fast nichts, während die Inbox alles listete.
    const uid = authUser?.id;

    // Dieselbe Zuordnung wie in der Inbox: Ein Follow-Up gehört mir, wenn mir
    // der Kunde gehört. Vorher verglich die Karte den Beraternamen im
    // Follow-Up mit meinem Namen, Zeichen für Zeichen. Stand dort ein anderes
    // Format oder gar nichts, fiel der Eintrag heraus, und die Karte zeigte
    // einen einzigen Follow-Up, während die Inbox zehn listete.
    const meineKunden = new Set<string>();
    try {
      getKontakte().forEach((k) => {
        if (kontaktBelongsToUser(k, { userName: user.name, userId: uid })) meineKunden.add(k.id);
      });
    } catch { /* ignore */ }

    const teamIds = teamMitgliederIds(uid);
    const teamKunden = new Set<string>();
    try {
      getKontakte().forEach((k) => {
        const z = k.zustaendig_id || (k as { zustaendigId?: string }).zustaendigId;
        if (z && teamIds.has(z)) teamKunden.add(k.id);
      });
    } catch { /* ignore */ }

    const all = getFollowUps().filter(f => f.status !== "erledigt");
    const doneIds = new Set(getDoneInboxIds());
    const mine = all.filter(f => {
      if (doneIds.has(`fu-${f.id}`)) return false;
      if (sicht === "firma") return true;
      if (meineKunden.has(f.kundeId)) return true;
      return sicht === "team" && teamKunden.has(f.kundeId);
    });

    const overdue = mine.filter(f => istUeberfaellig(f.faelligAm));
    const heute = mine.filter(f => (f.faelligAm || "").slice(0, 10) === today && !istUeberfaellig(f.faelligAm));
    const top = [...overdue].sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
    return { overdue: overdue.length, heute: heute.length, top };
  }, [_cv, sicht, user.name, authUser?.id]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-3">
        <div>          <h3 className="font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Überfällige Follow-Ups
          </h3>
        </div>
        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate("/inbox")}>
          In der Inbox erledigen <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className={`rounded-lg p-3 flex flex-col items-center text-center ${stats.overdue > 0 ? "bg-destructive/10 border border-destructive/30" : "bg-muted/40"}`}>
          <div className="text-2xl font-bold leading-none">{stats.overdue}</div>
          <div className="text-xs text-muted-foreground mt-1.5">überfällig</div>
        </div>
        <div className="rounded-lg p-3 bg-muted/40 flex flex-col items-center text-center">
          <div className="text-2xl font-bold leading-none">{stats.heute}</div>
          <div className="text-xs text-muted-foreground mt-1.5">heute fällig</div>
        </div>
      </div>

      {stats.top.length > 0 ? (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {stats.top.map(f => (
            <button
              key={f.id}
              onClick={() => navigate(`/kunden/${f.kundeId}`)}
              className="w-full text-left flex items-center justify-between gap-2 rounded-md border p-2 hover:bg-muted/50 transition"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{tarnName(f.kundeName) || "Unbekannt"}</div>
                <div className="text-xs text-muted-foreground truncate">{f.titel}</div>
              </div>
              <Badge variant="destructive" className="gap-1 shrink-0 text-[10px]">
                <Clock className="h-3 w-3" /> {f.faelligAm}
              </Badge>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">Keine überfälligen Follow-Ups – top!</p>
      )}
    </Card>
  );
}