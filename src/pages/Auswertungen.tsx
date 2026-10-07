import { useState, useMemo } from "react";
import { SichtUmschalter } from "@/components/SichtUmschalter";
import { type Datensicht, istFuehrungskraft } from "@/lib/datenSicht";
import { useLiveVersion } from "@/hooks/useLiveData";
import { SatzartBadge, SatzartLegende } from "@/components/abrechnung/SatzartBadge";
import { KARRIERE_STUFEN, findKarriereStufe, formatSatzProzent, getKarriereOverrideForUser, getKarriereStufe, getEffectiveRate, getCustomProvisionRateSetter, getCustomProvisionRateEigen } from "@/lib/karriereStufeHelper";
import { OVERHEAD_AKTIV } from "@/lib/lizenzPakete";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, Users } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { berechneGamification } from "@/lib/gamificationEngine";
import { loadAllUsers, loadVertriebsUsers } from "@/lib/loadAllUsers";
import { FunnelReport } from "@/components/auswertungen/FunnelReport";
import { MeinTeamSection, useShowMeinTeam } from "@/components/auswertungen/MeinTeamSection";

// ── Provisionsmodell ──
// Titel und Saetze kommen aus KARRIERE_STUFEN, nur die Beispielrechnung ist
// lokal: Mehrverdienst bei Ø 200.000 € Kaufpreis. Die Uebersichten zeigen
// nur das aktuelle Modell (einheitliche 4-%-Stufe); Bestandsstufen
// (nurBestand) erscheinen nur, wenn der betrachtete Partner selbst darauf
// steht.
const provisionsStufen = KARRIERE_STUFEN.map((s) => ({
  id: s.id,
  nurBestand: !!s.nurBestand,
  rate: s.rate,
  volumen: s.titel,
  provision: formatSatzProzent(s.rate),
  beispiel: `${(s.rate * 2000).toLocaleString("de-DE")} €`,
}));

// ── Karrierestufen ──
// Vorteile und Voraussetzungen sind Anzeige-Texte dieser Seite. Titel, Emoji,
// Saetze und Schwellen kommen aus der kanonischen Stufen-Definition.
const KARRIERE_STUFEN_ZUSATZ: Record<string, { vorteile: string[]; voraussetzungen: string[] }> = {
  tippgeber: {
    vorteile: ["Vollzugriff CRM & Pipeline", "Academy Grundkurse", "Persönliches Vertriebspartner-Microsite", "Setterin-Leads (gegen Setter-Satz)"],
    voraussetzungen: ["Bestandsstufe, wird nicht mehr neu vergeben"],
  },
  vertriebspartner: {
    vorteile: ["Einheitlich 4 % auf Lead- und Eigenkontakte", "Vollzugriff CRM & Pipeline", "Academy inkl. Aufbau- & Tax-Kursen", "Eigene Empfehlungsprogramme", "Erweiterte Beratungs-Präsentation"],
    voraussetzungen: ["Onboarding abgeschlossen", "Paket: Vertriebspartner"],
  },
  manager: {
    // Die Override-Zeile erscheint nur, solange die Overhead-Provision aktiv ist.
    vorteile: ["Alles aus Vertriebspartner", "Vertriebspartner werben & coachen", ...(OVERHEAD_AKTIV ? ["1,5 % Override auf jeden Junior-Abschluss"] : []), "Team-Dashboard & Statistiken", "Zielplanungs-Tool für das Team"],
    voraussetzungen: ["Bestandsstufe, wird nicht mehr neu vergeben"],
  },
  vertriebsfirma: {
    vorteile: ["Alles aus Team Lead", ...(OVERHEAD_AKTIV ? ["2 % Override auf jeden Junior-Abschluss"] : []), "Whitelabel-Optionen für eigene Marke", "Direkter Ansprechpartner aus der Geschäftsleitung", "Strategische Mitgestaltung"],
    voraussetzungen: ["Bestandsstufe, wird nicht mehr neu vergeben"],
  },
};

const karriereStufen = KARRIERE_STUFEN.map((s) => ({
  id: s.id,
  titel: s.titel,
  emoji: s.emoji,
  nurBestand: !!s.nurBestand,
  provision: formatSatzProzent(s.rate),
  rate: s.rate,
  extras: s.juniorOverride ? `+${formatSatzProzent(s.juniorOverride)} Junior-Override` : undefined,
  vorteile: KARRIERE_STUFEN_ZUSATZ[s.id].vorteile,
  voraussetzungen: KARRIERE_STUFEN_ZUSATZ[s.id].voraussetzungen,
  schwelle: { abschluesse: s.schwelle },
}));

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

  // ── Live Gamification-Berechnung (nur für Karrierestufe) ──
  const gamification = useMemo(() => {
    if (isBackoffice && sicht === "haus") {
      if (selectedPartnerId === "alle") return berechneGamification();
      return berechneGamification(selectedPartnerId, selectedPartner);
    }
    // In der Sicht "Meine Zahlen" zaehlen die eigenen Abschluesse, auch fuer
    // Fuehrungskraefte. Die Karrierestufe ist eine persoenliche Kennzahl.
    return berechneGamification(authUser?.id, user.name);
  }, [user.name, authUser?.id, isBackoffice, selectedPartnerId, selectedPartner, sicht]);

  // ── Karriere-Override aus user_settings laden (live-reaktiv) ──
  const settingsVersion = useLiveVersion(["user_settings"]);
  const karriereOverride = useMemo(() => {
    if (isBackoffice && selectedPartnerId !== "alle") {
      return getKarriereOverrideForUser(selectedPartnerId);
    }
    return getKarriereOverrideForUser(authUser?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBackoffice, selectedPartnerId, authUser?.id, settingsVersion]);

  // ── Aktuelle Karrierestufe (live) ──
  // Die Stufe kommt ausschliesslich aus dem karriere_override der
  // Nutzerverwaltung. Vorher stieg sie hier ab 10/30/50 Abschluessen von
  // selbst auf, waehrend ueberall sonst nur der Override zaehlt.
  const aktuelleKarriere = useMemo(() => {
    return getKarriereStufe(0, karriereOverride);
  }, [karriereOverride]);

  // ── Effektiver Provisionssatz (ggf. individuell) ──
  const targetUserId = useMemo(() => {
    if (isBackoffice && selectedPartnerId !== "alle") return selectedPartnerId;
    return authUser?.id;
  }, [isBackoffice, selectedPartnerId, authUser?.id]);
  const effectiveProvisionRate = getEffectiveRate(targetUserId, aktuelleKarriere);
  // Die beiden gepflegten Sätze: für selbst gewonnene Kontakte und für
  // zugewiesene Leads. Der Speicherschlüssel heisst aus historischen Gründen
  // weiterhin "setter", gemeint ist der Lead-Satz.
  const setterRate = getCustomProvisionRateSetter(targetUserId);
  const eigenRate = getCustomProvisionRateEigen(targetUserId);
  const hasSplit = setterRate !== null || eigenRate !== null;

  // „Mein Team" — nur für Team Lead / Lizenzpartner / Admin / Inhaber / Vertriebsleiter
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

        {/* ── Provisionserklärung ── */}
        <Card className="border-l-4 border-l-primary bg-muted/30">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">€</span>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-2">So verdienst du im Kapitalanlagevertrieb</p>
                <p className="text-sm text-muted-foreground">
                  Du erhältst <strong>ab 3 % Provision</strong> auf das vermittelte Kapitalanlagevolumen. Je höher deine Karrierestufe, desto höher deine Provision – <strong>bis zu 10 %</strong>.
                </p>
                <p className="text-sm text-foreground mt-2">
                  <span className="text-muted-foreground">Aktuell {isBackoffice && selectedPartner !== "alle" ? `für ${selectedPartner}` : "für dich"}: </span>
                  <strong>{aktuelleKarriere.emoji} {aktuelleKarriere.titel}</strong>
                  {" – "}
                  {hasSplit ? (
                    <>
                      <strong>Eigen {eigenRate ?? effectiveProvisionRate} %</strong>
                      {" · "}
                      <strong>Zugewiesen {setterRate ?? effectiveProvisionRate} %</strong>
                    </>
                  ) : (
                    <strong>{effectiveProvisionRate} % Provision</strong>
                  )}
                </p>
                {hasSplit && (
                  <SatzartLegende className="mt-3 pt-3 border-t" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Provisionsstaffel ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
              Provisionsstaffel (Kapitalanlagen)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Provision auf das vermittelte Kapitalanlagevolumen – steigerbar bis 10 %:
            </p>
          </CardHeader>
          <CardContent>
             <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-muted-foreground uppercase mb-2 px-2">
               <span>Karrierestufe</span>
               <span>Provision</span>
               <span className="text-right">Mehrverdienst*</span>
             </div>
             {provisionsStufen.filter((s) => !s.nurBestand || s.id === aktuelleKarriere.id).map((s, i) => {
               const istAktuelleStufe = s.volumen === aktuelleKarriere.titel;
               return (
                <div key={i} className={`grid grid-cols-3 gap-2 items-center px-2 py-3 rounded-lg text-sm ${istAktuelleStufe ? "bg-primary/5" : ""} border-b border-border last:border-0`}>
                  <span className="font-medium text-foreground flex items-center gap-2">
                    {s.volumen}
                    {istAktuelleStufe && <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 h-4">{isBackoffice && selectedPartner !== "alle" ? selectedPartner.split(" ")[0] : "Du"}</Badge>}
                  </span>
                  <span className="text-foreground">
                    {istAktuelleStufe && hasSplit ? (
                      <span className="flex flex-wrap gap-1.5 items-center">
                        <SatzartBadge art="eigen" satz={eigenRate ?? effectiveProvisionRate} />
                        <SatzartBadge art="zugewiesen" satz={setterRate ?? effectiveProvisionRate} />
                      </span>
                    ) : (
                      s.provision
                    )}
                  </span>
                  <span className="text-right font-semibold text-primary">{s.beispiel}</span>
                </div>
               );
              })}
            <p className="text-[11px] text-muted-foreground mt-3">* Beispiel-Mehrverdienst bei Ø 200.000 € Kaufpreis</p>
          </CardContent>
        </Card>

        {/* ── Partner-Filter für Admin ── */}
        {isBackoffice && allPartners.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Users className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Partner-Auswertung</p>
                    <p className="text-xs text-muted-foreground">Wähle einen Partner, um dessen Karrierestufe zu sehen</p>
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

        {/* ── Karriereplan & Provisionsstaffeln ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
                  Karriereplan & Provisionsstaffeln
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Dein Aufstieg im Kapitalanlagevertrieb – jede Stufe bringt dir mehr Provision und exklusive Vorteile.
                </p>
              </div>
              <Badge className="bg-primary text-primary-foreground text-xs px-3 py-1.5 gap-1.5 shrink-0">
                <span>{aktuelleKarriere.emoji}</span>
                Aktuelle Stufe: {aktuelleKarriere.titel}
                {" "}
                {hasSplit
                  ? `(Setter ${setterRate ?? effectiveProvisionRate} % · Eigen ${eigenRate ?? effectiveProvisionRate} %)`
                  : `(${effectiveProvisionRate} %)`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* istAktuell wird auf der VOLLEN Stufenliste berechnet (die
                  Schwellen-Logik braucht die Nachbarstufen), gezeigt werden
                  danach nur die aktuelle 4-%-Stufe und die eigene
                  Bestandsstufe. */}
              {karriereStufen.map((s, i) => {
                const abschluesse = gamification.abschluesse;
                // Der Override kann als Kennung ("manager") oder als Titel
                // ("Team Lead") gespeichert sein. findKarriereStufe loest
                // beides auf; ein reiner Titelvergleich markierte bei
                // Kennungen keine Karte.
                const istAktuell = karriereOverride
                  ? findKarriereStufe(karriereOverride)?.id === s.id
                  : (abschluesse >= s.schwelle.abschluesse &&
                    (i === karriereStufen.length - 1 || abschluesse < karriereStufen[i + 1].schwelle.abschluesse));
                const naechsterAufstieg = !karriereOverride && !istAktuell && i > 0 &&
                  abschluesse >= karriereStufen[i - 1].schwelle.abschluesse &&
                  abschluesse < s.schwelle.abschluesse;
                return { s, istAktuell, naechsterAufstieg };
              }).filter(({ s, istAktuell }) => !s.nurBestand || istAktuell).map(({ s, istAktuell, naechsterAufstieg }, i) => {
                return (
                <div
                  key={i}
                  className={`relative rounded-xl border p-5 ${
                    istAktuell ? "border-primary bg-primary/5 shadow-md" : "border-border"
                  }`}
                >
                  {istAktuell && (
                    <Badge className="absolute -top-2 left-4 bg-primary text-primary-foreground text-[9px]">
                      {isBackoffice && selectedPartner !== "alle" ? `${selectedPartner.split(" ")[0]}s Stufe` : "Deine Stufe"}
                      {karriereOverride ? " (manuell)" : ""}
                    </Badge>
                  )}
                  {naechsterAufstieg && (
                    <Badge variant="outline" className="absolute -top-2 left-4 text-[9px]">
                      Aufstieg möglich
                    </Badge>
                  )}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{s.emoji}</span>
                    <div>
                      <p className="font-bold text-foreground">{s.titel}</p>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm mb-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Provision</span>
                      <span className="font-semibold">{s.provision}</span>
                    </div>
                    {s.extras && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Team-Override</span>
                        <span className="font-semibold text-primary">{s.extras}</span>
                      </div>
                    )}
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-1.5">
                    {s.vorteile.map((v, vi) => (
                      <p key={vi} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="text-primary">◎</span> {v}
                      </p>
                    ))}
                  </div>
                  <Separator className="my-3" />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Voraussetzungen</p>
                  {s.voraussetzungen.map((v, vi) => (
                    <p key={vi} className="text-xs text-muted-foreground">• {v}</p>
                  ))}
                </div>
                );
              })}
            </div>
            {effectiveProvisionRate !== aktuelleKarriere.rate && (
              <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium text-foreground">
                  📌 Individueller Provisionssatz: <strong>{effectiveProvisionRate} %</strong>
                  <span className="text-muted-foreground ml-1">(statt Standard {aktuelleKarriere.rate} %)</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Rankings ── */}
        <div>
          {/* ── Mein Team (Team Lead / Lizenzpartner) ── */}
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
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-semibold text-muted-foreground uppercase mb-2 px-1">
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
                          {d.ich && <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 h-4">Du</Badge>}
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
