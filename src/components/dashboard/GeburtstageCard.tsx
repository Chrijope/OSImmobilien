import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Cake, ChevronDown, Gift } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { tarnName } from "@/lib/vorfuehrmodus";
import { supabase } from "@/integrations/supabase/client";
import { getKontakte } from "@/lib/kundenStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { istFuehrungskraft } from "@/lib/datenSicht";
import {
  ROLLEN_LABEL,
  sammleGeburtstage,
  type GeburtstagEintrag,
  type RohGeburtstag,
} from "@/lib/geburtstage";

/** Wie viele Einträge direkt in der Karte stehen. Der Rest kommt ins Fenster. */
const SICHTBAR = 5;

type Filter = "alle" | "team" | "kunden";

const ROLE_PRIORITY = [
  "inhaber", "admin", "vertriebsleiter", "vertriebspartner",
  "objektpartner", "finanzierungspartner", "versicherungsexperte",
  "hausverwaltung", "buchhaltung", "setterin", "marketing",
  "hr", "backoffice", "individuell", "testaccount", "bewerber",
];

export function GeburtstageCard() {
  const { user, authUser } = useUser();
  const erlaubt = user.role !== "kunde";
  // Fuehrungskraefte sehen alle Kunden und koennen filtern. Welche Rollen das
  // sind, beantwortet `datenSicht` fuer die ganze Anwendung.
  const sichtWeit = istFuehrungskraft(user.role);

  const [team, setTeam] = useState<RohGeburtstag[]>([]);
  const [filter, setFilter] = useState<Filter>("alle");
  const [alleOffen, setAlleOffen] = useState(false);

  useEffect(() => {
    if (!erlaubt) return;
    let abgebrochen = false;

    const laden = async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, name, geburtstag")
        .not("geburtstag", "is", null);
      if (error || !profiles) return;

      const { data: rollen } = await supabase.from("user_roles").select("user_id, role");
      const rollenJeNutzer = new Map<string, string[]>();
      (rollen || []).forEach((r: { user_id: string; role: string }) => {
        const arr = rollenJeNutzer.get(r.user_id) || [];
        arr.push(r.role);
        rollenJeNutzer.set(r.user_id, arr);
      });

      const liste: RohGeburtstag[] = [];
      for (const p of profiles) {
        const meine = (rollenJeNutzer.get(p.id) || []).filter((r) => r !== "kunde");
        if (meine.length === 0) continue; // reiner Kunde, kommt über die Kontakte
        const haupt = ROLE_PRIORITY.find((r) => meine.includes(r)) || meine[0];
        liste.push({
          id: p.id,
          name: p.name,
          bezeichnung: ROLLEN_LABEL[haupt] || haupt,
          quelle: "team",
          geburtstag: p.geburtstag,
        });
      }
      if (!abgebrochen) setTeam(liste);
    };

    void laden();
    return () => { abgebrochen = true; };
  }, [erlaubt]);

  const kunden = useMemo<RohGeburtstag[]>(() => {
    if (!erlaubt) return [];
    try {
      return getKontakte()
        .filter((k) => !!k.geburtstag)
        // Ein Vertriebspartner sieht nur seine eigenen Kunden. Admin,
        // Inhaber und Vertriebsleiter sehen alle.
        .filter((k) => sichtWeit || kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id }))
        .map((k) => ({
          id: k.id,
          name: tarnName(`${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()) || "Kunde",
          bezeichnung: k.berater ? `Kunde · ${tarnName(k.berater, "partner")}` : "Kunde",
          quelle: "kunde" as const,
          geburtstag: k.geburtstag,
        }));
    } catch {
      return [];
    }
  }, [erlaubt, sichtWeit, user.name, authUser?.id]);

  const eintraege = useMemo(() => {
    const rohe = filter === "team" ? team : filter === "kunden" ? kunden : [...team, ...kunden];
    return sammleGeburtstage(rohe);
  }, [team, kunden, filter]);

  if (!erlaubt) return null;

  const sichtbar = eintraege.slice(0, SICHTBAR);
  const rest = eintraege.length - sichtbar.length;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">
            Geburtstage
          </CardTitle>
          <Cake className="h-4 w-4 text-muted-foreground ml-auto" />
        </div>
        <p className="text-[11px] text-muted-foreground">Die nächsten 30 Tage</p>
        {sichtWeit && (
          <div className="flex items-center gap-1 pt-1">
            {([
              ["alle", "Alle"],
              ["team", "Team"],
              ["kunden", "Kunden"],
            ] as Array<[Filter, string]>).map(([wert, label]) => (
              <button
                key={wert}
                onClick={() => setFilter(wert)}
                className={`text-[11px] rounded-full px-2.5 py-1 border transition-colors ${
                  filter === wert
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {eintraege.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            In den nächsten 30 Tagen hat niemand Geburtstag.
          </p>
        ) : (
          <div className="space-y-1">
            {sichtbar.map((b) => (
              <Zeile key={`${b.quelle}-${b.id}`} eintrag={b} />
            ))}
            {rest > 0 && (
              <button
                onClick={() => setAlleOffen(true)}
                className="w-full mt-2 text-xs text-primary hover:underline flex items-center justify-center gap-1 py-1"
              >
                Noch {rest} weitere anzeigen
                <ChevronDown className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={alleOffen} onOpenChange={setAlleOffen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-4 w-4" /> Geburtstage in den nächsten 30 Tagen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {eintraege.map((b) => (
              <Zeile key={`dlg-${b.quelle}-${b.id}`} eintrag={b} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Zeile({ eintrag }: { eintrag: GeburtstagEintrag }) {
  const heute = eintrag.tageBis === 0;
  return (
    <div className={`flex items-center gap-3 py-1.5 rounded-lg ${heute ? "bg-primary/5 px-2" : ""}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          heute ? "bg-primary/15" : "bg-muted"
        }`}
      >
        <Cake className={`h-4 w-4 ${heute ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {eintrag.name}
          {eintrag.alter !== undefined && (
            <span className="text-muted-foreground font-normal"> · {eintrag.alter}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">{eintrag.bezeichnung}</p>
      </div>
      <span
        className={`text-[10px] font-medium whitespace-nowrap ${
          heute ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {heute ? "heute" : eintrag.datumLabel}
      </span>
    </div>
  );
}
