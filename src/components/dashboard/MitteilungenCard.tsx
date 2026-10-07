import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { cacheGet } from "@/lib/dataCache";
import { getEffectivePipelineStufe } from "@/lib/kontaktPipeline";
import { getKontakte } from "@/lib/kundenStore";
import { useUser } from "@/contexts/UserContext";
import { getCurrentUserId } from "@/lib/currentUser";
import { useLiveVersion } from "@/hooks/useLiveData";

export function MitteilungenCard() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [notifications, setNotifications] = useState<{ color: string; text: string; time: string }[]>([]);
  const cacheVersion = useLiveVersion(["follow_ups", "kontakte"]);

  useEffect(() => {
    try {
      const followUps = cacheGet("follow_ups") || [];
      const kontakte = getKontakte();
      const kontaktMap = new Map(kontakte.map((k: any) => [k.id, k]));
      const today = new Date().toISOString().slice(0, 10);
      const currentUserId = getCurrentUserId();

      const upcoming = followUps
        .filter((f: any) => {
          // Nur Aufgaben die heute (oder überfällig auf heute) anstehen
          if (f.status !== "offen" || !f.faellig_am) return false;
          if (f.faellig_am.slice(0, 10) !== today) return false;
          const k = kontaktMap.get(f.kunde_id);
          if (!k) return false;
          if (k.geloescht || k.archiviert) return false;
          if (getEffectivePipelineStufe(k) === "verloren") return false;
          // Jeder sieht nur seine eigenen Mitteilungen (auch Admins)
          if (currentUserId && f.benutzer_id !== currentUserId) return false;
          return true;
        })
        .slice(0, 3)
        .map((f: any) => ({
          color: "bg-warning",
          text: `${f.titel}${f.kunde_name ? ` – ${f.kunde_name}` : ""}`,
          time: "Heute",
        }));
      setNotifications(upcoming);
    } catch {
      // Cache not ready yet
    }
  }, [user.role, cacheVersion]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
          <div className="flex items-center gap-2">          <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">Inbox Aufgaben</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Keine Aufgaben für heute.</p>
        ) : (
          <div className="space-y-3">
            {notifications.map((n, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.color}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{n.text}</p>
                  <p className="text-xs text-muted-foreground">{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => navigate("/inbox")}
          className="mt-auto pt-4 text-xs font-medium text-chart-b2b hover:underline text-left"
        >
          Alle Inbox Aufgaben ansehen →
        </button>
      </CardContent>
    </Card>
  );
}
