import { useState, useMemo } from "react";
import { SichtUmschalter } from "@/components/SichtUmschalter";
import { type Datensicht, istFuehrungskraft } from "@/lib/datenSicht";
import { useLiveVersion } from "@/hooks/useLiveData";
import { DeineProvisionKarte } from "@/components/abrechnung/DeineProvisionKarte";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Users } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loadAllUsers, loadVertriebsUsers } from "@/lib/loadAllUsers";
import { FunnelReport } from "@/components/auswertungen/FunnelReport";
import { MeinTeamSection, useShowMeinTeam } from "@/components/auswertungen/MeinTeamSection";

// ── Rankings ──
const rankingKategorien: { titel: string; daten: { pos: number; name: string; wert: number; ich: boolean }[] }[] = [];

const zeitraeume = ["Heute", "Letzte 7 Tage", "Letzte 30 Tage", "Aktueller Monat", "Vorheriger Monat", "Letzte 3 Monate", "Letzte 12 Monate", "Aktuelles Jahr", "Seit Anfang"];

const posIcon = (pos: number) => {
  if (pos === 1) return <span className="text-yellow-500">🥇</span>;
  if (pos === 2) return <span className="text-gray-400">🥈</span>;
  if (pos === 3) return <span className="text-amber-600">🥉</span>;
  return <span className="text-muted-foreground text-sm">{pos}</span>;
};

const Auswertungen = () => {
  const { user, authUser } = useUser();
  // Der Vertriebsleiter fehlte hier. Er sah deshalb auf dieser Seite nur sich
  // selbst, obwohl er ueberall sonst Team- und Hauszahlen sehen darf.
  const isBackoffice = istFuehrungskraft(user.role);
  const [sicht, setSicht] = useState<Datensicht>(isBackoffice ? "haus" : "eigene");

  const [zeitraum, setZeitraum] = useState("Seit Anfang");
  const [expandedRankings, setExpandedRankings] = useState<Record<number, boolean>>({});
  // Die Auswahl haelt die Kennung, nicht den Namen: Zwei Partner koennen
  // gleich heissen. Der Name dient nur der Anzeige.
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("alle");

  // Load all partners for admin filter
  const allPartners = useMemo(() => {
    if (!isBackoffice) return [];
    // Nur Vertriebspartner & Vertriebsleiter — keine Kunden / Inhaber / Finanzierungspartner.
    return loadVertriebsUsers().filter((u) => u.name && u.name.trim().length > 0);
  }, [isBackoffice]);
  const selectedPartner = selectedPartnerId === "alle"
    ? "alle"
    : allPartners.find((p) => p.id === selectedPartnerId)?.name || "alle";

  // ── Effektiver Provisionssatz (ggf. individuell) ──
  const targetUserId = useMemo(() => {
    if (isBackoffice && selectedPartnerId !== "alle") return selectedPartnerId;
    return authUser?.id;
  }, [isBackoffice, selectedPartnerId, authUser?.id]);
  // Neu zeichnen, wenn sich ein Satz in der Nutzerverwaltung ändert.
  useLiveVersion(["user_settings"]);

  // „Mein Team": Admin, Inhaber, Vertriebsleiter und Partner mit altem Team-Vertragspaket
  const meinTeamRecruiterId = isBackoffice && selectedPartner !== "alle" ? targetUserId : authUser?.id;
  const meinTeamRecruiterName = isBackoffice && selectedPartner !== "alle" ? selectedPartner : user.name;
  const showMeinTeam = useShowMeinTeam(meinTeamRecruiterId, user.role);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <PageHeader
          title="Auswertungen & Ranking"
          subtitle="Vergleiche dich mit anderen Vertriebspartnern"
        />

        <SichtUmschalter
          rolle={user.role}
          wert={sicht}
          onWechsel={(neu) => { setSicht(neu); if (neu !== "haus") setSelectedPartnerId("alle"); }}
          mitTeam={false}
        />

        {/* ── Provision: fester Satz aus der Nutzerverwaltung ── */}
        <DeineProvisionKarte
          userId={targetUserId}
          partnerName={isBackoffice && selectedPartner !== "alle" ? selectedPartner : undefined}
          alle={isBackoffice && sicht === "haus" && selectedPartnerId === "alle"}
        />

        {/* ── Partner-Filter für Admin ── */}
        {isBackoffice && allPartners.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Users className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Partner-Auswertung</p>
                    <p className="text-xs text-muted-foreground">Wähle einen Partner, um dessen Provision und Zahlen zu sehen</p>
                  </div>
                </div>
                <select
                  value={selectedPartnerId}
                  onChange={(e) => setSelectedPartnerId(e.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground w-full sm:w-auto sm:min-w-[220px]"
                >
                  <option value="alle">Alle Partner (gesamt)</option>
                  {allPartners.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.rolle ? ` (${p.rolle})` : ""}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Rankings ── */}
        <div>
          {/* ── Mein Team ── */}
          {showMeinTeam && (
            <div className="mb-6">
              <MeinTeamSection
                recruiterUserId={meinTeamRecruiterId}
                recruiterName={meinTeamRecruiterName}
              />
            </div>
          )}

          {/* ── Funnel-Reporting ── */}
          <div className="mb-6">
            {/* In der Haussicht zaehlt die Personenauswahl, sonst die eigene
                Person. Vorher sah eine Fuehrungskraft hier immer nur sich. */}
            <FunnelReport
              beraterFilter={isBackoffice && sicht === "haus" ? selectedPartner : user.name}
              beraterId={isBackoffice && sicht === "haus" ? (selectedPartnerId === "alle" ? undefined : selectedPartnerId) : authUser?.id}
            />
          </div>

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <p className="text-sm font-medium text-muted-foreground hidden sm:block">Zeitraum:</p>
            <div className="sm:hidden w-full">
              <Select value={zeitraum} onValueChange={setZeitraum}>
                <SelectTrigger className="w-full h-9 text-xs">
                  <span className="text-muted-foreground mr-1">Zeitraum:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zeitraeume.map((z) => (
                    <SelectItem key={z} value={z} className="text-xs">
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden sm:flex flex-wrap gap-2">
              {zeitraeume.map((z) => (
                <button
                  key={z}
                  onClick={() => setZeitraum(z)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    zeitraum === z
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rankingKategorien.map((kat, ki) => {
              const expanded = expandedRankings[ki];
              const visibleDaten = expanded ? kat.daten : kat.daten.slice(0, 5);
              return (
                <Card key={ki}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-primary rounded-full" />
                      <CardTitle className="text-sm font-semibold font-sans">{kat.titel}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-bildunterschrift font-semibold text-muted-foreground uppercase mb-2 px-1">
                      <span>Pos.</span>
                      <span>Vertriebspartner</span>
                      <span className="text-right">Anzahl</span>
                    </div>
                    {visibleDaten.map((d) => (
                      <div
                        key={d.pos}
                        className={`grid grid-cols-3 gap-2 items-center px-1 py-2.5 rounded-lg text-sm ${
                          d.ich ? "bg-primary/5" : ""
                        } border-b border-border last:border-0`}
                      >
                        <span className="flex items-center gap-1">{posIcon(d.pos)}</span>
                        <span className={`font-medium ${d.ich ? "text-primary" : "text-foreground"} flex items-center gap-1.5`}>
                          {d.name}
                          {d.ich && <Badge className="bg-primary text-primary-foreground text-bildunterschrift px-1.5 h-4">Du</Badge>}
                        </span>
                        <span className={`text-right font-semibold ${d.ich ? "text-primary" : "text-foreground"}`}>
                          {d.wert}
                        </span>
                      </div>
                    ))}
                    {kat.daten.length > 5 && (
                      <button
                        onClick={() => setExpandedRankings(prev => ({ ...prev, [ki]: !prev[ki] }))}
                        className="mt-3 text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
                      >
                        {expanded ? "Weniger anzeigen" : "Mehr laden …"} <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Auswertungen;
