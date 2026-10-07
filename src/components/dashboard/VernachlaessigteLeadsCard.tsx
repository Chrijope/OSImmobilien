import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/currentUser";
import { useUser } from "@/contexts/UserContext";
import { tarnName } from "@/lib/vorfuehrmodus";
import { useLiveVersion } from "@/hooks/useLiveData";
import { istFuehrungskraft, teamMitgliederIds } from "@/lib/datenSicht";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";

interface SlaRow {
  kontakt_id: string;
  vorname: string;
  nachname: string;
  pipeline_stufe: string;
  last_activity: string;
  days_inactive: number;
  severity: "orange" | "rot" | "gruen";
  reason: string;
}

/**
 * Wie viele Personen die Karte höchstens abfragt.
 *
 * `get_sla_violations` beantwortet immer genau eine Person. Für eine
 * Führungskraft heisst das eine Abfrage je Teammitglied. Bei einem grossen
 * Team wäre das ein Schwall von Anfragen beim Öffnen des Dashboards, deshalb
 * die Grenze. Sie greift in der Praxis nicht, ein Team ist kleiner.
 */
const MAX_ABFRAGEN = 25;

export function VernachlaessigteLeadsCard() {
  const { user, authUser } = useUser();
  const uid = authUser?.id || getCurrentUserId();
  const [rows, setRows] = useState<SlaRow[]>([]);
  const [loading, setLoading] = useState(true);

  /*
   * Wessen Leads zeigt die Karte?
   *
   * Für einen Vertriebspartner die eigenen, für eine Führungskraft zusätzlich
   * die des eigenen Teams. Wer zum Team gehört, steht in `datenSicht`, also an
   * derselben Stelle wie für Pipeline und Dashboard.
   */
  // Die Team-Zuordnung steht im Zwischenspeicher und ist beim allerersten
  // Rendern oft noch leer. Ohne diese Version bliebe es dann dauerhaft bei den
  // eigenen Leads, obwohl die Zuordnung Sekunden spaeter da ist.
  const teamVersion = useLiveVersion(["user_settings", "profiles", "bewerbungen"]);
  const bereich = useMemo(() => {
    const ids = new Set<string>();
    if (uid) ids.add(uid);
    if (uid && istFuehrungskraft(user.role)) {
      for (const id of teamMitgliederIds(uid)) ids.add(id);
    }
    return [...ids].slice(0, MAX_ABFRAGEN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, user.role, teamVersion]);
  const fuehrung = istFuehrungskraft(user.role);

  useEffect(() => {
    if (!bereich.length) { setLoading(false); return; }
    let mounted = true;
    (async () => {
      /*
       * Je Person eine Abfrage. Schlägt eine fehl, bleibt es bei den anderen:
       * Solange die Migration `20260807190000_sla_verstoesse_fuer_die_aufsicht`
       * in Supabase nicht gelaufen ist, weist die Datenbank die Abfrage für
       * Teammitglieder ab. Dann zeigt die Karte eben nur die eigenen Leads,
       * statt ganz leer zu bleiben.
       */
      const antworten = await Promise.all(
        bereich.map((id) => supabase.rpc("get_sla_violations" as any, { p_user_id: id })),
      );
      if (!mounted) return;
      const gesammelt = new Map<string, SlaRow>();
      for (const { data, error } of antworten) {
        if (error || !data) continue;
        for (const zeile of data as SlaRow[]) gesammelt.set(zeile.kontakt_id, zeile);
      }
      setRows([...gesammelt.values()].sort((a, b) => b.days_inactive - a.days_inactive));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [bereich]);

  const rot = rows.filter(r => r.severity === "rot");
  const orange = rows.filter(r => r.severity === "orange");

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <h3 className="font-semibold text-sm">Vernachlässigte Leads</h3>
        </div>
        <div className="flex gap-1">
          {rot.length > 0 && <Badge variant="destructive">{rot.length} rot</Badge>}
          {orange.length > 0 && <Badge className="bg-orange-500 text-white hover:bg-orange-600">{orange.length} orange</Badge>}
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Lädt…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          {fuehrung
            ? "Alle Leads in deinem Bereich sind innerhalb der SLA-Schwelle. 👍"
            : "Alle deine Leads sind innerhalb der SLA-Schwelle. 👍"}
        </div>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {rows.slice(0, 20).map(r => (
            <Link
              key={r.kontakt_id}
              to={`/kunden/${r.kontakt_id}`}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                    r.severity === "rot" ? "bg-destructive" : "bg-orange-500"
                  }`}
                />
                <span className="truncate font-medium">{tarnName(`${r.vorname ?? ""} ${r.nachname ?? ""}`.trim())}</span>
                <span className="text-xs text-muted-foreground truncate">· {r.pipeline_stufe}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                <Clock className="h-3 w-3" />
                {r.days_inactive}d
              </div>
            </Link>
          ))}
          {rows.length > 20 && (
            <div className="text-xs text-center text-muted-foreground pt-2">
              +{rows.length - 20} weitere
            </div>
          )}
        </div>
      )}
    </Card>
  );
}