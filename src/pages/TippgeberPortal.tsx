import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { getInitials } from "@/lib/chatStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Gift,
  UserPlus,
  HandCoins,
  MessageCircle,
  Loader2,
  Send,
  LogOut,
  CheckCircle2,
  Phone,
  Mail,
  Globe,
  Copy,
  Share2,
  ExternalLink,
  MessageSquareText,
  Download,
  ListChecks,
  FileText,
} from "lucide-react";
import logoImg from "@/assets/moreimmo-logo.png";
import { toast } from "sonner";
import { buildVpUrl } from "@/lib/publicUrl";
import {
  PITCH_VARIANTS,
  SALES_PROZESS_SCHRITTE,
  ZIELGRUPPEN,
  ANLASS_OEFFNER,
  EINWAND_KARTEN,
  type PitchContext,
  type ZielgruppeId,
} from "@/lib/tippgeberPitches";
import { generateTippgeberPitchesPdf } from "@/lib/tippgeberPitchesPdf";
import { generateTippgeberFlyerPdf } from "@/lib/tippgeberFlyerPdf";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import QRCode from "qrcode";
import { MousePointerClick, QrCode, Lightbulb, MessageCircleQuestion, FileDown } from "lucide-react";
import {
  tippgeberGruppeFuerStufe,
  TIPPGEBER_GRUPPE_LABEL,
  type TippgeberGruppe,
} from "@/lib/empfehlungenStore";
import { chatBenachrichtigungAnstossen } from "@/lib/chatBenachrichtigungAnstossen";
import { stehtRechts } from "@/lib/chatSeite";
import { oeffentlicheAdresse } from "@/lib/oeffentlicheBasis";
import {
  EINVERSTAENDNIS_FEHLT,
  einverstaendnisWortlaut,
  empfehlungAnlegen,
  fehlendePflichtangabe,
} from "@/lib/tippgeberEmpfehlung";
import { Checkbox } from "@/components/ui/checkbox";

type Tipp = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  zugeordnet_id: string | null;
  zugeordnet_name: string | null;
  provisionstyp: string | null;
  provisionswert: string | null;
  tg_slug: string | null;
  meta: any;
};

type Empfehlung = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  erstellt_am: string;
  meta: any;
  archiviert?: boolean;
};

type Programm = {
  id: string;
  name: string;
  praemie: string | null;
  beschreibung: string | null;
};

type VpProfile = {
  id: string;
  name: string | null;
  email: string | null;
  telefon: string | null;
  avatar_url: string | null;
};

/**
 * Datenschutz: Tippgeber sehen keine internen Pipelinestufen mehr, sondern
 * nur die grobe Statusgruppe (dieselben Texte wie im Kundenportal des
 * Empfehlungsgebers). Die Zuordnung kommt zentral aus empfehlungenStore.
 */
function formatStage(meta: any, archiviert: boolean | undefined): { label: string; tone: "neu" | "active" | "lost" | "done" } {
  const gruppe = tippgeberGruppeFuerStufe(meta?.pipelineStufe, archiviert);
  const tone =
    gruppe === "verloren" ? "lost"
    : gruppe === "abgeschlossen" ? "done"
    : gruppe === "offen" ? "neu"
    : "active";
  return { label: TIPPGEBER_GRUPPE_LABEL[gruppe], tone };
}

export default function TippgeberPortal() {
  const { user, authUser, logout } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get("tab") || "uebersicht";
  const [tab, setTab] = useState(initialTab);

  // Tab mit URL synchronisieren (z. B. wenn Sidebar-Links wie
  // /tippgeber-portal?tab=neu geklickt werden — sonst bleibt der initiale
  // Tab-State stehen und der Klick scheint wirkungslos).
  useEffect(() => {
    const urlTab = searchParams.get("tab") || "uebersicht";
    if (urlTab !== tab) setTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [tipp, setTipp] = useState<Tipp | null>(null);
  const [empfehlungen, setEmpfehlungen] = useState<Empfehlung[]>([]);
  const [programme, setProgramme] = useState<Programm[]>([]);
  const [vpProfile, setVpProfile] = useState<VpProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Chat-Badge: ungelesene Nachrichten vom VP
  const [chatId, setChatId] = useState<string | null>(null);
  const [unreadChat, setUnreadChat] = useState(0);

  // Chat-ID einmalig laden
  useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any).rpc("get_or_create_tippgeber_vp_chat");
        const id = (data as any)?.chat_id as string | undefined;
        if (!cancelled && id) setChatId(id);
      } catch (e) {
        console.warn("chat id load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser?.id]);

  // Initial unread count + Realtime auf neue Nachrichten
  useEffect(() => {
    if (!chatId || !authUser?.id) return;
    let cancelled = false;
    const loadUnread = async () => {
      const { data } = await (supabase as any)
        .from("chat_nachrichten")
        .select("id, absender_id, gelesen_von")
        .eq("chat_id", chatId);
      if (cancelled) return;
      const count = (data || []).filter((m: any) => {
        if (m.absender_id === authUser.id) return false;
        const gv: string[] = Array.isArray(m.gelesen_von) ? m.gelesen_von : [];
        return !gv.includes(authUser.id);
      }).length;
      setUnreadChat(count);
    };
    loadUnread();
    const ch = supabase
      .channel(`tippgeber-chat-unread-${chatId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_nachrichten", filter: `chat_id=eq.${chatId}` },
        (payload: any) => {
          const m = payload.new;
          if (m.absender_id === authUser.id) return;
          if (tabRef.current === "chat") {
            // Direkt als gelesen markieren, kein Badge
            const gv = Array.isArray(m.gelesen_von) ? [...m.gelesen_von, authUser.id] : [authUser.id];
            (supabase as any).from("chat_nachrichten").update({ gelesen_von: gv }).eq("id", m.id);
            return;
          }
          setUnreadChat(prev => prev + 1);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId, authUser?.id]);

  // Tab-Ref damit Realtime-Handler aktuellen Tab kennt
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // Beim Öffnen des Chat-Tabs alle Nachrichten als gelesen markieren
  useEffect(() => {
    if (tab !== "chat" || !chatId || !authUser?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("chat_nachrichten")
        .select("id, absender_id, gelesen_von")
        .eq("chat_id", chatId);
      const toUpdate = (data || []).filter((m: any) => {
        if (m.absender_id === authUser.id) return false;
        const gv: string[] = Array.isArray(m.gelesen_von) ? m.gelesen_von : [];
        return !gv.includes(authUser.id);
      });
      await Promise.all(toUpdate.map((m: any) => {
        const gv = Array.isArray(m.gelesen_von) ? [...m.gelesen_von, authUser.id] : [authUser.id];
        return (supabase as any).from("chat_nachrichten").update({ gelesen_von: gv }).eq("id", m.id);
      }));
      setUnreadChat(0);
    })();
  }, [tab, chatId, authUser?.id]);

  const loadAll = async () => {
    if (!authUser?.id) return;
    setLoading(true);
    try {
      const [{ data: t }, { data: k }, { data: p }] = await Promise.all([
        (supabase as any)
          .from("tippgeber")
          .select("id, vorname, nachname, email, telefon, zugeordnet_id, zugeordnet_name, provisionstyp, provisionswert, tg_slug, meta")
          .eq("benutzer_id", authUser.id)
          .maybeSingle(),
        (supabase as any)
          .from("kontakte")
          .select("id, vorname, nachname, email, telefon, erstellt_am, meta, archiviert")
          .filter("meta->>tippgeberBenutzerId", "eq", authUser.id)
          .order("erstellt_am", { ascending: false }),
        (supabase as any)
          .from("empfehlungsprogramme")
          .select("id, name, praemie, beschreibung")
          .eq("aktiv", true)
          .eq("benutzer_id", authUser.id)
          .order("erstellt_am", { ascending: false }),
      ]);
      setTipp(t || null);
      setEmpfehlungen((k || []) as any);
      setProgramme((p || []) as any);
      try {
        const { data: vp } = await (supabase as any).rpc("get_tippgeber_vp_profile");
        const row = Array.isArray(vp) ? vp[0] : vp;
        setVpProfile((row as VpProfile) || null);
      } catch (e) {
        console.warn("vp profile load failed", e);
      }
    } catch (e) {
      console.error("TippgeberPortal load error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [authUser?.id]);

  const onTabChange = (next: string) => {
    setTab(next);
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  const stats = useMemo(() => {
    // Statistik auf Basis der groben Statusgruppen, nicht der internen Stufen.
    const gruppen = empfehlungen.map(e => tippgeberGruppeFuerStufe(e.meta?.pipelineStufe, e.archiviert));
    const total = empfehlungen.length;
    const active = gruppen.filter(g => g !== "verloren" && g !== "abgeschlossen").length;
    const closed = gruppen.filter(g => g === "abgeschlossen").length;
    const klicks = Number(tipp?.meta?.klicks || 0);
    return { total, active, closed, klicks };
  }, [empfehlungen, tipp?.meta?.klicks]);

  return (
    <div data-lg="seite" data-portal="kunde" className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <header data-lg="kopfscheibe" className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto max-w-6xl flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="MOREImmo" className="h-8 w-auto" />
              <div className="hidden sm:block">
                <div className="text-xs font-semibold uppercase tracking-widest text-primary">Tippgeber-Portal</div>
                <div className="text-[11px] text-muted-foreground -mt-0.5">
                  {tipp?.zugeordnet_name ? `Betreut durch ${tipp.zugeordnet_name}` : "Empfehlungs-Programm"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium leading-tight">{user.name}</div>
                <div className="text-[11px] text-muted-foreground">Tippgeber</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => logout()}>
                <LogOut className="h-4 w-4 mr-1.5" /> <span className="hidden sm:inline">Abmelden</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 md:py-10 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !tipp ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <h2 className="text-xl font-bold">Kein Tippgeber-Profil verknüpft</h2>
                <p className="text-sm text-muted-foreground">
                  Dein Zugang ist noch nicht mit einem Tippgeber-Profil verknüpft. Bitte wende dich an
                  deinen Vertriebspartner.
                </p>
                <Button variant="outline" onClick={() => logout()}>Abmelden</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile icon={Gift} label="Empfehlungen gesamt" value={stats.total} />
                <StatTile icon={UserPlus} label="Aktiv in Bearbeitung" value={stats.active} />
                <StatTile icon={CheckCircle2} label="Abgeschlossen" value={stats.closed} />
                <StatTile
                  icon={MousePointerClick}
                  label="Link-Aufrufe"
                  value={stats.klicks}
                  hint={stats.klicks > 0 ? "Besucher deiner Landingpage" : "Teile deinen Link, um Aufrufe zu sammeln"}
                />
              </div>

              <LandingpageCard
                tippgeberId={tipp.id}
                tippgeberSlug={tipp.tg_slug}
                tippgeberVorname={tipp.vorname}
                vpFullName={tipp.zugeordnet_name || "Vertriebspartner"}
                stats={stats}
              />

              <VpContactCard
                vp={vpProfile}
                fallbackName={tipp.zugeordnet_name || "Vertriebspartner"}
                onOpenChat={() => onTabChange("chat")}
              />

              <Tabs value={tab} onValueChange={onTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-6">
                  <TabsTrigger value="uebersicht"><Gift className="h-4 w-4 mr-1.5" />Übersicht</TabsTrigger>
                  <TabsTrigger value="neu"><UserPlus className="h-4 w-4 mr-1.5" />Neuer Kontakt</TabsTrigger>
                  <TabsTrigger value="pitches"><MessageSquareText className="h-4 w-4 mr-1.5" />Pitches</TabsTrigger>
                  <TabsTrigger value="prozess"><ListChecks className="h-4 w-4 mr-1.5" />Prozess</TabsTrigger>
                  <TabsTrigger value="konditionen"><HandCoins className="h-4 w-4 mr-1.5" />Konditionen</TabsTrigger>
                  <TabsTrigger value="chat" className="relative">
                    <MessageCircle className="h-4 w-4 mr-1.5" />Chat
                    {unreadChat > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                        {unreadChat > 99 ? "99+" : unreadChat}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="uebersicht" className="mt-4">
                  <UebersichtTab empfehlungen={empfehlungen} />
                </TabsContent>
                <TabsContent value="neu" className="mt-4">
                  <NeuerKontaktTab onCreated={() => { loadAll(); onTabChange("uebersicht"); }} />
                </TabsContent>
                <TabsContent value="pitches" className="mt-4">
                  <PitchesTab
                    tippgeberId={tipp.id}
                    tippgeberSlug={tipp.tg_slug}
                    tippgeberVorname={tipp.vorname}
                    tippgeberEmail={tipp.email}
                    vpFullName={tipp.zugeordnet_name || "Vertriebspartner"}
                  />
                </TabsContent>
                <TabsContent value="prozess" className="mt-4">
                  <ProzessTab vpName={tipp.zugeordnet_name || "Vertriebspartner"} />
                </TabsContent>
                <TabsContent value="konditionen" className="mt-4">
                  <KonditionenTab tipp={tipp} programme={programme} />
                </TabsContent>
                <TabsContent value="chat" className="mt-4">
                  <ChatTab vpName={tipp.zugeordnet_name || "Vertriebspartner"} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </main>
      </div>
  );
}

function StatTile({ icon: Icon, label, value, hint }: { icon: any; label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold leading-tight">{value}</div>
          {hint && <div className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-2">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function VpContactCard({
  vp,
  fallbackName,
  onOpenChat,
}: {
  vp: VpProfile | null;
  fallbackName: string;
  onOpenChat: () => void;
}) {
  const name = vp?.name || fallbackName;
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const email = vp?.email || null;
  const telefon = vp?.telefon || null;
  const avatar = vp?.avatar_url || null;

  return (
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardContent className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-5">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="relative shrink-0">
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="h-16 w-16 md:h-20 md:w-20 rounded-full object-cover ring-2 ring-primary/20"
              />
            ) : (
              <div className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl font-semibold ring-2 ring-primary/20">
                {initials || "VP"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-primary">
              Dein Ansprechpartner
            </div>
            <div className="text-lg md:text-xl font-bold leading-tight truncate">{name}</div>
            <div className="mt-1.5 flex flex-col gap-0.5 text-sm text-muted-foreground">
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1.5 hover:text-foreground truncate"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{email}</span>
                </a>
              )}
              {telefon && (
                <a
                  href={`tel:${telefon.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{telefon}</span>
                </a>
              )}
              {!email && !telefon && (
                <span className="text-xs italic">Kontaktdaten werden ergänzt.</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex md:flex-col gap-2 md:w-auto w-full">
          <Button
            onClick={onOpenChat}
            className="flex-1 md:flex-none"
            size="sm"
          >
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Nachricht senden
          </Button>
          {telefon && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="flex-1 md:flex-none"
            >
              <a href={`tel:${telefon.replace(/\s+/g, "")}`}>
                <Phone className="h-4 w-4 mr-1.5" /> Anrufen
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UebersichtTab({ empfehlungen }: { empfehlungen: Empfehlung[] }) {
  const [filter, setFilter] = useState<string>("alle");

  if (empfehlungen.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-2">
          <Gift className="h-10 w-10 mx-auto text-muted-foreground/60" />
          <h3 className="font-semibold">Noch keine Empfehlungen</h3>
          <p className="text-sm text-muted-foreground">
            Lege deinen ersten Kontakt im Tab <strong>„Neuer Kontakt"</strong> an. Dein
            Vertriebspartner wird sofort benachrichtigt.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Filter nach den groben Statusgruppen, nicht nach internen Stufen.
  const gefiltert = empfehlungen.filter(e =>
    filter === "alle" || tippgeberGruppeFuerStufe(e.meta?.pipelineStufe, e.archiviert) === filter
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {gefiltert.length} von {empfehlungen.length} {empfehlungen.length === 1 ? "Empfehlung" : "Empfehlungen"}
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Status filtern" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Status</SelectItem>
            {(Object.keys(TIPPGEBER_GRUPPE_LABEL) as TippgeberGruppe[]).map(gruppe => (
              <SelectItem key={gruppe} value={gruppe}>{TIPPGEBER_GRUPPE_LABEL[gruppe]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {gefiltert.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Keine Empfehlungen mit diesem Status.
          </CardContent>
        </Card>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Empfohlen am</th>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">E-Mail</th>
                <th className="text-left font-medium px-4 py-2.5">Telefon</th>
                <th className="text-left font-medium px-4 py-2.5">Notiz</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((e, idx) => {
                const stage = formatStage(e.meta, e.archiviert);
                const date = new Date(e.erstellt_am).toLocaleDateString("de-DE");
                return (
                  <tr key={e.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{date}</td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{e.vorname} {e.nachname}</td>
                    <td className="px-4 py-3 text-xs">{e.email || <span className="text-muted-foreground">–</span>}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{e.telefon || <span className="text-muted-foreground">–</span>}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[280px]">
                      {e.meta?.tippgeberAnliegen || <span className="opacity-60">–</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          stage.tone === "done" ? "border-emerald-500/40 text-emerald-700 bg-emerald-500/10"
                          : stage.tone === "lost" ? "border-rose-500/40 text-rose-700 bg-rose-500/10"
                          : stage.tone === "neu" ? "border-sky-500/40 text-sky-700 bg-sky-500/10"
                          : "border-amber-500/40 text-amber-700 bg-amber-500/10"
                        }
                      >
                        {stage.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </div>
  );
}

export function NeuerKontaktTab({ onCreated }: { onCreated: () => void }) {
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [anliegen, setAnliegen] = useState("");
  const [ziel, setZiel] = useState("");
  const [einkommen, setEinkommen] = useState("");
  const [eigenkapital, setEigenkapital] = useState("");
  const [beruflicheSituation, setBeruflicheSituation] = useState("");
  const [schufaSauber, setSchufaSauber] = useState("");
  const [investitionsZeitpunkt, setInvestitionsZeitpunkt] = useState("");
  const [einverstanden, setEinverstanden] = useState(false);
  const [einverstaendnisFehler, setEinverstaendnisFehler] = useState(false);
  const [saving, setSaving] = useState(false);
  const wortlaut = einverstaendnisWortlaut(vorname);

  const submit = async () => {
    // Pflicht sind nur die Kontaktdaten und das Einverständnis, die
    // Qualifizierung ist freiwillig.
    const fehlt = fehlendePflichtangabe({ vorname, nachname, email, telefon });
    if (fehlt) toast.error(fehlt);
    setEinverstaendnisFehler(!einverstanden);
    if (fehlt || !einverstanden) return;
    setSaving(true);
    try {
      const { error } = await empfehlungAnlegen((name, args) => (supabase as any).rpc(name, args), {
        _vorname: vorname.trim(),
        _nachname: nachname.trim(),
        _email: email.trim(),
        _telefon: telefon.trim(),
        _anliegen: anliegen.trim(),
        _ziel: ziel.trim(),
        _einkommen: einkommen.trim(),
        _eigenkapital: eigenkapital.trim(),
        _berufliche_situation: beruflicheSituation.trim(),
        _schufa_sauber: schufaSauber.trim(),
        _investitions_zeitpunkt: investitionsZeitpunkt.trim(),
      }, wortlaut);
      if (error) throw error;
      toast.success("Empfehlung erfolgreich übermittelt – dein VP wurde benachrichtigt.");
      setVorname(""); setNachname(""); setEmail(""); setTelefon(""); setAnliegen("");
      setZiel(""); setEinkommen(""); setEigenkapital(""); setBeruflicheSituation("");
      setSchufaSauber(""); setInvestitionsZeitpunkt(""); setEinverstanden(false);
      onCreated();
    } catch (e: any) {
      toast.error("Konnte Empfehlung nicht speichern: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Hinweis-Banner: zwei Wege zu empfehlen */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Lightbulb className="h-4 w-4" />
            </div>
            <div className="space-y-1.5">
              <h4 className="font-semibold text-sm">Du hast zwei Wege, jemanden zu empfehlen</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>
                  <strong className="text-foreground">1. Persönlicher Empfehlungs-Link (oben):</strong>{" "}
                  Du schickst nur den Link – der Interessent füllt selbst aus. Niedrige Hemmschwelle, kein Gespräch nötig.
                </li>
                <li>
                  <strong className="text-foreground">2. Formular hier unten:</strong>{" "}
                  Du hast schon mit der Person gesprochen und kennst die Antworten. Dein VP bekommt einen vorqualifizierten Lead und kann gezielter beraten.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" /> Neuen Kontakt empfehlen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Vorname *</Label>
            <Input value={vorname} onChange={e => setVorname(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Nachname *</Label>
            <Input value={nachname} onChange={e => setNachname(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>E-Mail *</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon *</Label>
            <Input value={telefon} onChange={e => setTelefon(e.target.value)} />
          </div>
        </div>
        <div className="pt-2 border-t">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {vorname.trim() ? `Qualifizierung von ${vorname.trim()}` : "Qualifizierung deines Kontaktes"}
          </h4>
          <p className="text-xs text-muted-foreground mb-3">
            Alle Fragen hier sind freiwillig. Beantworte nur, was du sicher weißt, und lass den Rest leer.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{(vorname.trim() ? `Was ist das Ziel von ${vorname.trim()} mit einem Immobilieninvestment?` : "Was ist das Ziel deines Kontaktes mit einem Immobilieninvestment?")}</Label>
              <Select value={ziel} onValueChange={setZiel}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Vermögensaufbau / Werte schaffen">Vermögensaufbau / Werte schaffen</SelectItem>
                  <SelectItem value="Fremdkapitalhebel (wenig EK-Einsatz)">Fremdkapitalhebel (wenig EK-Einsatz)</SelectItem>
                  <SelectItem value="Sorgenfrei im Alter (Immo-Rente)">Sorgenfrei im Alter (Immo-Rente)</SelectItem>
                  <SelectItem value="Geldanlage (Inflationsschutz)">Geldanlage (Inflationsschutz)</SelectItem>
                  <SelectItem value="Kapitalaufbau fürs Eigenheim">Kapitalaufbau fürs Eigenheim</SelectItem>
                  <SelectItem value="Finanzielle Freiheit (passives Einkommen)">Finanzielle Freiheit (passives Einkommen)</SelectItem>
                  <SelectItem value="Sichere finanzielle Zukunft für die Kinder">Sichere finanzielle Zukunft für die Kinder</SelectItem>
                  <SelectItem value="Eigenes Immobilien-Portfolio aus- & aufbauen">Eigenes Immobilien-Portfolio aus- & aufbauen</SelectItem>
                  <SelectItem value="Steuervorteile sichern">Steuervorteile sichern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{(vorname.trim() ? `Was ist die berufliche Situation von ${vorname.trim()}?` : "Was ist die berufliche Situation deines Kontaktes?")}</Label>
              <Select value={beruflicheSituation} onValueChange={setBeruflicheSituation}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Angestellt">Angestellt</SelectItem>
                  <SelectItem value="Selbstständig">Selbstständig</SelectItem>
                  <SelectItem value="Beamter">Beamter</SelectItem>
                  <SelectItem value="Rentner">Rentner</SelectItem>
                  <SelectItem value="Student">Student</SelectItem>
                  <SelectItem value="Arbeitssuchend">Arbeitssuchend</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{(vorname.trim() ? `Wie viel Geld verdient ${vorname.trim()} monatlich? (€)` : "Wie viel Geld verdient dein Kontakt monatlich? (€)")}</Label>
              <Input
                inputMode="numeric"
                value={einkommen}
                onChange={e => setEinkommen(e.target.value.replace(/[^0-9.,]/g, ""))}
                placeholder="z.B. 3.000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{(vorname.trim() ? `Wie viel Eigenkapital steht ${vorname.trim()} zur Verfügung? (€)` : "Wie viel Eigenkapital steht deinem Kontakt zur Verfügung? (€)")}</Label>
              <Input
                inputMode="numeric"
                value={eigenkapital}
                onChange={e => setEigenkapital(e.target.value.replace(/[^0-9.,]/g, ""))}
                placeholder="z.B. 20.000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{vorname.trim() ? `Ist die SCHUFA von ${vorname.trim()} nach deinem Wissen ohne Negativeinträge?` : "Ist die SCHUFA deines Kontaktes nach deinem Wissen ohne Negativeinträge?"}</Label>
              <Select value={schufaSauber} onValueChange={setSchufaSauber}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ja">Ja</SelectItem>
                  <SelectItem value="Nein">Nein</SelectItem>
                  <SelectItem value="Unbekannt">Weiß nicht</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{(vorname.trim() ? `Ab wann möchte ${vorname.trim()} in eine Immobilie investieren?` : "Ab wann möchte dein Kontakt in eine Immobilie investieren?")}</Label>
              <Select value={investitionsZeitpunkt} onValueChange={setInvestitionsZeitpunkt}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sofort">Sofort</SelectItem>
                  <SelectItem value="1-3 Monate">In 1–3 Monaten</SelectItem>
                  <SelectItem value="3-6 Monate">In 3–6 Monaten</SelectItem>
                  <SelectItem value="6+ Monate">In 6+ Monaten</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Anliegen / Notiz (optional)</Label>
          <Textarea
            value={anliegen}
            onChange={e => setAnliegen(e.target.value)}
            rows={3}
            placeholder="z.B. Interesse an Eigentumswohnung in München, Budget ca. 350.000 €"
          />
        </div>
        <div className="space-y-1 pt-2 border-t">
          <div className="flex items-start gap-2">
            <Checkbox
              id="tg-einverstaendnis"
              className="mt-0.5"
              checked={einverstanden}
              onCheckedChange={(v) => {
                setEinverstanden(v === true);
                if (v === true) setEinverstaendnisFehler(false);
              }}
              aria-required="true"
              aria-invalid={einverstaendnisFehler}
              aria-describedby={einverstaendnisFehler ? "tg-einverstaendnis-fehler" : undefined}
            />
            <Label htmlFor="tg-einverstaendnis" className="text-sm font-normal leading-snug cursor-pointer">
              {wortlaut} *
            </Label>
          </div>
          {einverstaendnisFehler && (
            <p id="tg-einverstaendnis-fehler" role="alert" className="text-xs text-destructive pl-6">
              {EINVERSTAENDNIS_FEHLT}
            </p>
          )}
        </div>
        <div className="flex justify-end pt-1">
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Empfehlung absenden
          </Button>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}

function KonditionenTab({ tipp, programme }: { tipp: Tipp; programme: Programm[] }) {
  const wert = tipp.provisionswert?.trim() || "";
  const typ = tipp.provisionstyp || "euro";
  const display = wert
    ? typ === "prozent" ? `${wert} %` : `${wert} €`
    : "Individuell – siehe Programm";

  // Beispielberechnung auf Basis eines Beispiel-Kaufpreises
  const beispielKaufpreis = 250000;
  const numWert = parseFloat(wert.replace(",", ".")) || 0;
  let beispielVerguetung: number | null = null;
  if (numWert > 0) {
    if (typ === "prozent") {
      beispielVerguetung = (beispielKaufpreis * numWert) / 100;
    } else {
      beispielVerguetung = numWert; // Fixbetrag pro Abschluss
    }
  }
  const fmtEuro = (n: number) =>
    n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><HandCoins className="h-4 w-4" /> Deine Tippgeber-Vergütung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-primary">{display}</span>
            <span className="text-xs text-muted-foreground">
              {typ === "prozent" ? "vom Provisionsumsatz pro erfolgreichem Abschluss" : "pro erfolgreichem Abschluss"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground pt-1 border-t">
            Vereinbart mit {tipp.zugeordnet_name || "deinem Vertriebspartner"}. Auszahlung erfolgt
            nach Notarbeurkundung und Eingang der Käuferprovision.
          </p>
        </CardContent>
      </Card>

      {beispielVerguetung !== null && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Beispielberechnung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Beispiel-Kaufpreis der Immobilie</span>
              <span className="font-medium">{fmtEuro(beispielKaufpreis)}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">
                Deine Vergütung {typ === "prozent" ? `(${wert} % vom Kaufpreis)` : "(Fixbetrag pro Abschluss)"}
              </span>
              <span className="font-medium">
                {typ === "prozent"
                  ? `${fmtEuro(beispielKaufpreis)} × ${wert} %`
                  : "Fix"}
              </span>
            </div>
            <div className="flex justify-between items-baseline pt-1">
              <span className="font-semibold">Deine Tippgeber-Vergütung</span>
              <span className="text-2xl font-bold text-primary">{fmtEuro(beispielVerguetung)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-2 border-t">
              Hinweis: Dies ist ein unverbindliches Rechenbeispiel auf Basis eines durchschnittlichen
              Kaufpreises von {fmtEuro(beispielKaufpreis)}. Die tatsächliche Vergütung richtet sich
              nach dem realen Kaufpreis der vermittelten Immobilie.
            </p>
          </CardContent>
        </Card>
      )}

      {programme.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktuelle Empfehlungs-Programme</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {programme.map(p => (
              <div key={p.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{p.name}</div>
                  {p.praemie && <Badge variant="secondary">{p.praemie}</Badge>}
                </div>
                {p.beschreibung && <p className="text-sm text-muted-foreground mt-1">{p.beschreibung}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ChatTab({ vpName }: { vpName: string }) {
  const { user, authUser } = useUser();
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_or_create_tippgeber_vp_chat");
        if (error) throw error;
        if (cancelled) return;
        const id = (data as any)?.chat_id as string | undefined;
        if (!id) throw new Error("Kein Chat verfügbar");
        setChatId(id);
        const { data: msgs } = await (supabase as any)
          .from("chat_nachrichten")
          .select("id, absender_id, inhalt, gesendet_am")
          .eq("chat_id", id)
          .order("gesendet_am", { ascending: true });
        if (!cancelled) setMessages(msgs || []);
      } catch (e: any) {
        if (!cancelled) toast.error("Chat konnte nicht geladen werden: " + (e?.message || String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!chatId) return;
    const ch = supabase
      .channel(`tippgeber-chat-${chatId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_nachrichten", filter: `chat_id=eq.${chatId}` },
        (payload: any) => setMessages(prev => [...prev, payload.new]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    if (!chatId || !text.trim() || !authUser?.id) return;
    setSending(true);
    try {
      // Absendername und Initialen gehoeren ins meta. Ohne sie steht die
      // Nachricht im internen Chat ohne Namen und mit leerem Kreis da, weil
      // die Oberflaeche dort ausschliesslich aus diesem Feld liest.
      const absender = (user?.name || "").trim();
      const nachrichtId = crypto.randomUUID();
      const { error } = await (supabase as any)
        .from("chat_nachrichten")
        .insert({
          id: nachrichtId,
          chat_id: chatId,
          absender_id: authUser.id,
          inhalt: text.trim(),
          meta: absender ? { senderName: absender, senderInitials: getInitials(absender) } : {},
        });
      if (error) throw error;
      setText("");
      // Glocke und Mail an den Vertriebspartner, mit Knopf direkt in den Chat.
      void chatBenachrichtigungAnstossen(nachrichtId);
    } catch (e: any) {
      toast.error("Nachricht konnte nicht gesendet werden: " + (e?.message || String(e)));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4" /> Chat mit {vpName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="h-[420px] overflow-y-auto bg-muted/30 rounded-lg p-3 border"
            >
              {/* Mittige Spalte wie im CRM-Chat, siehe `ChatVerlauf.tsx`. */}
              <div className="mx-auto w-full max-w-[37.5rem] space-y-2">
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-12">
                    Schreibe deinem Vertriebspartner eine Nachricht.
                  </p>
                ) : messages.map(m => {
                  // Seitenregel wie im CRM (`src/lib/chatSeite.ts`), aus Sicht
                  // des Tippgebers: seine Seite rechts, MOREImmo links.
                  const own = stehtRechts(m.absender_id, authUser?.id, new Set(authUser?.id ? [authUser.id] : []));
                  return (
                    <div key={m.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        own ? "bg-primary text-primary-foreground" : "bg-background border"
                      }`}>
                        {m.inhalt}
                        <div className={`text-[10px] mt-1 ${own ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(m.gesendet_am).toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mx-auto flex w-full max-w-[37.5rem] gap-2">
              <Input
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Nachricht schreiben…"
                disabled={sending}
              />
              <Button onClick={send} disabled={!text.trim() || sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Landingpage-Karte mit Share-Funktionen + Fortschritts-Balken ───────────
function LandingpageCard({
  tippgeberId,
  tippgeberSlug,
  tippgeberVorname,
  vpFullName,
  stats,
}: {
  tippgeberId: string;
  tippgeberSlug: string | null;
  tippgeberVorname: string;
  vpFullName: string;
  stats: { total: number; active: number; closed: number };
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const [loadingSlug, setLoadingSlug] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // VP-Slug via öffentliche Tippgeber-Edge-Funktion holen — Tippgeber
        // hat keine RLS-Berechtigung für user_settings des VP. Wir nutzen
        // ensure-vp-slug nicht (das ist nur für eingeloggte VPs); stattdessen
        // ein einfacher Lookup über profiles.slug via Edge-Funktion.
        const { data } = await (supabase as any).rpc("get_or_create_tippgeber_vp_chat");
        // Slug separat aus public-Profil-Endpoint
        const res = await fetch(
          `https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/get-tippgeber-vp-slug`,
          { method: "POST", headers: { "Content-Type": "application/json", apikey: (supabase as any).supabaseKey || "" }, body: JSON.stringify({ tippgeberId }) },
        ).catch(() => null);
        if (res && res.ok) {
          const j = await res.json().catch(() => null);
          if (!cancelled && j?.slug) { setSlug(j.slug); return; }
        }
        // Fallback: kein Slug
      } finally {
        if (!cancelled) setLoadingSlug(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tippgeberId]);

  const tgParam = tippgeberSlug || tippgeberId;
  const url = slug ? `${buildVpUrl(slug)}?tg=${tgParam}` : "";
  const display = url.replace(/^https?:\/\//, "");
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Dein Empfehlungs-Link wurde kopiert!");
      setTimeout(() => setCopied(false), 2500);
    });
  };
  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try { await navigator.share({ title: `Empfehlung von ${tippgeberVorname}`, text: `Schau dir das mal an – persönliche Beratung von ${vpFullName}.`, url }); } catch {}
    } else copy();
  };
  const shareWhatsApp = () => {
    if (!url) return;
    const msg = encodeURIComponent(`Hey! Ich wollte dir kurz ${vpFullName} empfehlen – er macht Kapitalanlage-Immobilien und erklärt das echt locker. Schau's dir mal an: ${url}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Dein persönlicher Empfehlungs-Link
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Das ist deine eigene Landingpage zu {vpFullName}. Teile den Link per WhatsApp, SMS oder
          E-Mail. Jeder, der sich darüber einträgt, wird dir automatisch als Empfehlung gutgeschrieben –
          {vpFullName} bekommt den Lead direkt ins System und meldet sich zeitnah.
        </p>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-background border text-xs font-mono truncate">
          <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">{loadingSlug ? "Lade…" : (display || "Bald verfügbar")}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={copy} disabled={!url} className="gap-1.5">
            {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Kopiert" : "Link kopieren"}
          </Button>
          <Button size="sm" variant="secondary" onClick={shareWhatsApp} disabled={!url} className="gap-1.5">
            <Share2 className="h-4 w-4" /> WhatsApp
          </Button>
          <Button size="sm" variant="outline" onClick={() => url && window.open(url, "_blank")} disabled={!url} className="gap-1.5">
            <ExternalLink className="h-4 w-4" /> Vorschau
          </Button>
          {navigator.share && (
            <Button size="sm" variant="outline" onClick={share} disabled={!url} className="gap-1.5">
              <Share2 className="h-4 w-4" /> Teilen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Prozess-Tab (6 Schritte) ──────────────────────────────────────────────
function ProzessTab({ vpName }: { vpName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> So läuft der Prozess für deine Empfehlung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Damit du genau weißt was passiert, sobald du jemanden empfiehlst – hier der Ablauf bei
          {" "}{vpName}:
        </p>
        <ol className="space-y-3 mt-2">
          {SALES_PROZESS_SCHRITTE.map((s) => (
            <li key={s.nr} className="flex gap-3 p-3 rounded-lg border bg-background">
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {s.nr}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="font-semibold text-sm">{s.titel}</h4>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{s.dauer}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{s.beschreibung}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

// ─── Pitches-Tab (WhatsApp-Vorlagen + PDF + Email) ─────────────────────────
function PitchesTab({
  tippgeberId,
  tippgeberSlug,
  tippgeberVorname,
  tippgeberEmail,
  vpFullName,
}: {
  tippgeberId: string;
  tippgeberSlug: string | null;
  tippgeberVorname: string;
  tippgeberEmail: string | null;
  vpFullName: string;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [flyerLoading, setFlyerLoading] = useState(false);
  const [zielgruppe, setZielgruppe] = useState<ZielgruppeId>("alle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/get-tippgeber-vp-slug`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tippgeberId }) },
        ).catch(() => null);
        if (res && res.ok) {
          const j = await res.json().catch(() => null);
          if (!cancelled && j?.slug) setSlug(j.slug);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [tippgeberId]);

  const tgParam = tippgeberSlug || tippgeberId;
  const landingUrl = slug ? `${buildVpUrl(slug)}?tg=${tgParam}` : `https://portal.more.immo/?tg=${tgParam}`;
  const vpVorname = vpFullName.split(" ")[0] || vpFullName;
  const ctx: PitchContext = { tippgeberVorname, vpVorname, vpFullName, landingpageUrl: landingUrl };

  // QR-Code für Empfehlungs-Link erzeugen (zum Anzeigen + Download).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await QRCode.toDataURL(landingUrl, {
          width: 480,
          margin: 1,
          color: { dark: "#0F172A", light: "#FFFFFF" },
        });
        if (!cancelled) setQrDataUrl(url);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [landingUrl]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Pitch kopiert!"));
  };
  const sendWhatsApp = (text: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const doc = await generateTippgeberPitchesPdf(ctx);
      doc.save(`Pitch-Toolkit-${tippgeberVorname}.pdf`);
    } catch (e: any) {
      toast.error("PDF konnte nicht erstellt werden: " + (e?.message || String(e)));
    } finally { setPdfLoading(false); }
  };

  const downloadFlyer = async () => {
    setFlyerLoading(true);
    try {
      const doc = await generateTippgeberFlyerPdf(ctx);
      doc.save(`Empfehlungs-Flyer-${tippgeberVorname}.pdf`);
    } catch (e: any) {
      toast.error("Flyer konnte nicht erstellt werden: " + (e?.message || String(e)));
    } finally { setFlyerLoading(false); }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `QR-Empfehlungslink-${tippgeberVorname}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const sendEmail = async () => {
    if (!tippgeberEmail) { toast.error("Keine E-Mail-Adresse hinterlegt."); return; }
    setEmailSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "tippgeber-pitch-toolkit",
          recipientEmail: tippgeberEmail,
          idempotencyKey: `tg-pitch-${tippgeberId}-${Date.now()}`,
          templateData: {
            tippgeberVorname,
            vpFullName,
            landingpageUrl: landingUrl,
            portalUrl: oeffentlicheAdresse("/tippgeber-portal?tab=pitches"),
            loginUrl: oeffentlicheAdresse("/auth"),
          },
        },
      });
      if (error) throw error;
      toast.success("E-Mail wurde versendet!");
    } catch (e: any) {
      toast.error("E-Mail konnte nicht versendet werden: " + (e?.message || String(e)));
    } finally { setEmailSending(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-primary" /> Dein Pitch-Toolkit
          </h3>
          <p className="text-xs text-muted-foreground">
            Fertige WhatsApp-/SMS-Vorlagen mit deinem persönlichen Empfehlungs-Link. <strong>Wichtig:</strong>{" "}
            Die Texte sind nur Beispiele – passe sie in deinem eigenen Wording an, damit sie authentisch beim
            Empfänger ankommen. Verweise dann schnell auf {vpFullName}, der die Details erklärt.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={downloadPdf} disabled={pdfLoading} className="gap-1.5">
              {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Alles als PDF
            </Button>
            <Button size="sm" variant="secondary" onClick={downloadFlyer} disabled={flyerLoading} className="gap-1.5">
              {flyerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Persönlicher Flyer (1 Seite)
            </Button>
            <Button size="sm" variant="outline" onClick={sendEmail} disabled={emailSending || !tippgeberEmail} className="gap-1.5">
              {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Per E-Mail an mich senden
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QR-Code des Empfehlungs-Links */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center">
          <div className="bg-white border rounded-lg p-2 shrink-0">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR-Code Empfehlungs-Link" className="w-32 h-32" />
            ) : (
              <div className="w-32 h-32 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" /> QR-Code deines Empfehlungs-Links
            </h3>
            <p className="text-xs text-muted-foreground">
              Perfekt für persönliche Gespräche: Zeige den Code auf deinem Handy oder drucke ihn auf
              eine Visitenkarte / einen Flyer. Wer scannt, landet direkt auf deiner persönlichen
              Empfehlungsseite – Tracking inklusive.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={downloadQr} disabled={!qrDataUrl} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> QR-Code (PNG)
              </Button>
              <Button size="sm" variant="outline" onClick={downloadFlyer} disabled={flyerLoading} className="gap-1.5">
                {flyerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                Druckbarer Flyer (A4)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anlass-basierte Gesprächs-Öffner */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" /> Gesprächs-Öffner für Alltagssituationen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Wann passt das Thema natürlich ins Gespräch? Hier sechs typische Situationen mit fertigen
            Überleitungen, die du flexibel nutzen kannst.
          </p>
          <Accordion type="single" collapsible className="w-full">
            {ANLASS_OEFFNER.map((a) => (
              <AccordionItem key={a.id} value={a.id}>
                <AccordionTrigger className="text-sm py-3">
                  <span className="flex items-center gap-2 text-left">
                    <span className="text-base">{a.emoji}</span>
                    <span>{a.anlass}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">{a.ueberleitung}</p>
                  <div className="border-l-2 border-primary/40 bg-primary/5 rounded-r-md p-3 italic text-foreground">
                    „{a.beispiel}"
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Einwand-Behandlung */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircleQuestion className="h-4 w-4 text-primary" /> Antworten auf typische Einwände
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Diese Reaktionen hörst du am häufigsten. Hier hast du die passenden Antworten plus
            sanften Übergang zurück zum Termin.
          </p>
          <Accordion type="single" collapsible className="w-full">
            {EINWAND_KARTEN.map((e) => (
              <AccordionItem key={e.id} value={e.id}>
                <AccordionTrigger className="text-sm py-3 text-left">
                  „{e.einwand}"
                </AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">Deine Antwort</div>
                    <p className="text-foreground">{e.antwort}</p>
                  </div>
                  <div className="pt-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Übergang zum Termin</div>
                    <p className="text-muted-foreground italic">{e.uebergang}</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Zielgruppen-Filter für Pitches */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-primary" /> Pitches nach Zielgruppe filtern
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ZIELGRUPPEN.map((z) => {
              const aktiv = zielgruppe === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setZielgruppe(z.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition ${
                    aktiv
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:border-primary/40"
                  }`}
                >
                  <span>{z.emoji}</span>
                  <span>{z.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            {ZIELGRUPPEN.find((z) => z.id === zielgruppe)?.hinweis}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PITCH_VARIANTS.filter((p) => zielgruppe === "alle" || p.zielgruppen.includes(zielgruppe)).map((p) => {
          const text = p.text(ctx);
          return (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{p.emoji}</span>
                    <span>{p.titel}</span>
                  </span>
                  <Badge variant="outline" className="text-[10px]">{p.thema}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  value={text}
                  readOnly
                  rows={8}
                  className="text-xs font-mono leading-relaxed"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyText(text)} className="gap-1.5 flex-1">
                    <Copy className="h-3.5 w-3.5" /> Kopieren
                  </Button>
                  <Button size="sm" onClick={() => sendWhatsApp(text)} className="gap-1.5 flex-1">
                    <Send className="h-3.5 w-3.5" /> WhatsApp
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground text-center pt-2">
        Alle Links enthalten deinen persönlichen Tracking-Code – jede Anmeldung wird automatisch
        dir als Empfehlung zugeordnet.
      </p>
    </div>
  );
}