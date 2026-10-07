import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { getJuniorsForRecruiter } from "@/lib/juniorOverrideLogic";
import { istFuehrungskraft } from "@/lib/datenSicht";
import { supabase } from "@/integrations/supabase/client";
import { nameMeintNutzer } from "@/lib/beraterNamensabgleich";
import { unscharfKlasse } from "@/lib/vorfuehrmodus";

export function TeamUebersichtCard() {
  const navigate = useNavigate();
  const { user, authUser } = useUser();
  // Wer als Fuehrungskraft gilt, steht in `datenSicht`, nicht noch einmal hier.
  const isAdmin = istFuehrungskraft(user.role);
  const _cv = useLiveVersion(["user_settings", "profiles", "user_roles"]);

  const juniors = useMemo(() => {
    if (!authUser?.id) return [];
    return getJuniorsForRecruiter(authUser.id);
  }, [authUser?.id, _cv]);

  const [tippgeberCount, setTippgeberCount] = useState(0);
  const [allJuniorsCount, setAllJuniorsCount] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("tippgeber").select("id, zugeordnet_id, zugeordnet_name");
      const rows = data || [];
      if (isAdmin) {
        setTippgeberCount(rows.length);
      } else {
        setTippgeberCount(
          rows.filter((t: any) =>
            // Kennung zuerst, der Name nur ohne Kennung und nur eindeutig.
            t.zugeordnet_id
              ? !!authUser?.id && t.zugeordnet_id === authUser.id
              : nameMeintNutzer(t.zugeordnet_name, { userId: authUser?.id, userName: user?.name })
          ).length
        );
      }
    })();
  }, [authUser?.id, user?.name, isAdmin, _cv]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("user_settings")
        .select("einstellungen")
        .not("einstellungen->>teamleader_id", "is", null);
      setAllJuniorsCount((data || []).length);
    })();
  }, [isAdmin, _cv]);

  const teamCount = isAdmin ? allJuniorsCount : juniors.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Team-Übersicht
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => navigate("/teampartner")}
            data-ui="kennzahl" data-anordnung="kompakt"
            className="flex flex-col items-center gap-1 rounded-lg border border-border p-4 text-center transition hover:bg-accent"
          >
            <div data-ui="kennzahl-label" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Teampartner
            </div>
            {/* Im Vorfuehrmodus bleibt die Beschriftung stehen, nur die Zahl
                wird weichgezeichnet. Die Karte erklaert sich weiter, die
                Teamgroesse sieht der Zuschauer aber nicht. */}
            <div data-ui="kennzahl-wert" className={unscharfKlasse("text-3xl font-bold")}>{teamCount}</div>
            <div data-ui="kennzahl-zusatz" className="text-xs text-muted-foreground">
              {isAdmin ? "Untergeschlüsselt (gesamt)" : "Mir untergeschlüsselt"}
            </div>
          </button>
          <button
            onClick={() => navigate("/teampartner")}
            data-ui="kennzahl" data-anordnung="kompakt"
            className="flex flex-col items-center gap-1 rounded-lg border border-border p-4 text-center transition hover:bg-accent"
          >
            <div data-ui="kennzahl-label" className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5" />
              Tippgeber
            </div>
            <div data-ui="kennzahl-wert" className={unscharfKlasse("text-3xl font-bold")}>{tippgeberCount}</div>
            <div data-ui="kennzahl-zusatz" className="text-xs text-muted-foreground">
              {isAdmin ? "Insgesamt angelegt" : "Von mir angelegt"}
            </div>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}