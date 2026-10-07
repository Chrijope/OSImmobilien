import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Cake, PartyPopper, Phone, Mail } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { tarnName } from "@/lib/vorfuehrmodus";
import { supabase } from "@/integrations/supabase/client";
import { getKontakte } from "@/lib/kundenStore";
import { kontaktBelongsToUser, isTeamWideKontaktRole } from "@/lib/kontaktOwnership";
import { sammleGeburtstage, ROLLEN_LABEL, type RohGeburtstag, type GeburtstagEintrag } from "@/lib/geburtstage";

/**
 * Einmal am Tag beim ersten Anmelden: Wer hat heute Geburtstag.
 *
 * Das Popup gab es schon, es zeigte aber ausschliesslich Mitarbeiter. Kunden
 * kamen darin gar nicht vor, obwohl gerade dort ein Anruf zaehlt: Ein
 * Vertriebspartner, der zum Geburtstag anruft, ist der Grund, warum jemand
 * zwei Jahre spaeter die zweite Wohnung kauft.
 *
 * Statt einer eigenen Logik nutzt es jetzt dieselbe Bibliothek wie die
 * Geburtstagskarte auf dem Dashboard (`geburtstage.ts`). Damit kann beides
 * nicht mehr auseinanderlaufen, und die Kundenliste kommt gratis mit.
 *
 * Kunden stehen oben. Nicht weil ein Kollege weniger wert waere, sondern weil
 * der Kollege ohnehin im Buero sitzt und der Kunde nur heute erreichbar ist.
 */

function heuteSchluessel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function GeburtstagPopup() {
  const { user, authUser } = useUser();
  // Kunden und Tippgeber sehen im Portal keine fremden Geburtstage.
  const darfSehen = user.role !== "kunde" && user.role !== "tippgeber";
  const [offen, setOffen] = useState(false);
  const [heute, setHeute] = useState<GeburtstagEintrag[]>([]);

  useEffect(() => {
    if (!darfSehen || !authUser?.id) return;

    // Einmal am Tag. Der Schluessel haengt am Nutzer, damit ein zweiter
    // Mensch am selben Rechner seine eigene Meldung bekommt.
    const gesehenSchluessel = `mi_birthday_popup_seen_${authUser.id}`;
    if (localStorage.getItem(gesehenSchluessel) === heuteSchluessel()) return;

    const laden = async () => {
      const rohe: RohGeburtstag[] = [];

      // ── Kunden ──
      // Ein Vertriebspartner sieht nur seine eigenen, Fuehrung sieht alle.
      // Dieselbe Regel wie in der Geburtstagskarte.
      try {
        const sichtWeit = isTeamWideKontaktRole(user.role);
        for (const k of getKontakte()) {
          if (!k.geburtstag) continue;
          if (!sichtWeit && !kontaktBelongsToUser(k, { userName: user.name, userId: authUser.id })) continue;
          rohe.push({
            id: k.id,
            name: tarnName(`${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()) || "Kunde",
            bezeichnung: k.berater ? `Kunde · ${tarnName(k.berater, "partner")}` : "Kunde",
            quelle: "kunde",
            geburtstag: k.geburtstag,
          });
        }
      } catch {
        // Der Zwischenspeicher ist noch nicht da. Dann eben nur das Team.
      }

      // ── Kolleginnen und Kollegen ──
      try {
        const { data: profile } = await supabase
          .from("profiles").select("id, name, geburtstag").not("geburtstag", "is", null);
        const { data: rollen } = await supabase.from("user_roles").select("user_id, role");

        const rollenJeNutzer = new Map<string, string[]>();
        for (const r of (rollen ?? []) as Array<{ user_id: string; role: string }>) {
          const liste = rollenJeNutzer.get(r.user_id) ?? [];
          liste.push(r.role);
          rollenJeNutzer.set(r.user_id, liste);
        }

        for (const p of (profile ?? []) as Array<{ id: string; name: string; geburtstag: string }>) {
          // Wer nur die Kundenrolle hat, ist hier kein Kollege. Er taucht
          // gegebenenfalls oben als Kunde auf.
          const intern = (rollenJeNutzer.get(p.id) ?? []).filter((r) => r !== "kunde");
          if (intern.length === 0) continue;
          if (p.id === authUser.id) continue; // sich selbst gratuliert man nicht
          rohe.push({
            id: p.id,
            name: p.name,
            bezeichnung: ROLLEN_LABEL[intern[0]] ?? intern[0],
            quelle: "team",
            geburtstag: p.geburtstag,
          });
        }
      } catch {
        // Ohne Netz bleibt die Kundenliste, das ist immer noch etwas wert.
      }

      // Fenster von null Tagen: ausschliesslich der heutige Tag.
      const treffer = sammleGeburtstage(rohe, 0)
        .filter((e) => e.tageBis === 0)
        // Kunden zuerst, sonst nach Namen. Ein Kunde ist nur heute erreichbar.
        .sort((a, b) =>
          (a.quelle === b.quelle ? 0 : a.quelle === "kunde" ? -1 : 1) ||
          a.name.localeCompare(b.name, "de-DE"),
        );

      if (treffer.length > 0) {
        setHeute(treffer);
        setOffen(true);
      }
    };

    void laden();
  }, [darfSehen, authUser?.id, user.role, user.name]);

  const schliessen = () => {
    if (authUser?.id) {
      localStorage.setItem(`mi_birthday_popup_seen_${authUser.id}`, heuteSchluessel());
    }
    setOffen(false);
  };

  if (!darfSehen) return null;

  const kunden = heute.filter((e) => e.quelle === "kunde");

  return (
    <Dialog open={offen} onOpenChange={(v) => { if (!v) schliessen(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <PartyPopper className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            {heute.length === 1 ? "Heute hat jemand Geburtstag" : `Heute haben ${heute.length} Geburtstag`}
          </DialogTitle>
          <DialogDescription className="text-center">
            {kunden.length > 0
              ? "Ein kurzer Anruf bleibt im Gedächtnis, eine Nachricht auch."
              : "Vergiss nicht zu gratulieren, das macht Freude."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[46vh] space-y-2 overflow-y-auto py-2">
          {heute.map((e) => (
            <div
              key={`${e.quelle}-${e.id}`}
              className={`flex items-center gap-3 rounded-lg p-3 ${
                e.quelle === "kunde" ? "border border-primary/20 bg-primary/[0.04]" : "bg-muted/50"
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                e.quelle === "kunde" ? "bg-primary/15" : "bg-primary/10"
              }`}>
                <Cake className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {e.name}
                  {e.alter !== undefined && (
                    <span className="ml-1.5 font-normal text-muted-foreground">wird {e.alter}</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{e.bezeichnung}</p>
              </div>
              {e.quelle === "kunde" && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Kunde
                </span>
              )}
            </div>
          ))}
        </div>

        {kunden.length > 0 && (
          <p className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> anrufen</span>
            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> oder schreiben</span>
          </p>
        )}

        <DialogFooter>
          <Button onClick={schliessen} className="w-full">Alles klar, ich gratuliere</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
