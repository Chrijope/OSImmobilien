import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { einlage } from "@/components/kunde/portal/einlage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gift, Heart, UserPlus, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { PhoneInput } from "@/components/ui/phone-input";
import { PortalHero } from "@/components/kunde/portal/PortalHero";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { portalLocale, portalSprache } from "@/i18n/portalSprache";
import { datumText, euroText } from "@/lib/sprachFormat";
import { PORTAL_STATUS_TEXT_KEY, type EmpfehlungStatus } from "@/lib/empfehlungenStore";

/** Fehlt die Datenbankfunktion noch (Migration nicht gelaufen)? */
function funktionFehlt(fehler: { code?: string; message?: string }): boolean {
  return fehler.code === "PGRST202" || fehler.code === "42883" || /could not find the function/i.test(fehler.message || "");
}

/**
 * Rueckfall ohne Migration 20261004175000: nur eine Glocke an den
 * Zustaendigen des eigenen Kontakts, mit Link aufs Kundenprofil. Eine Aufgabe
 * entsteht hier bewusst nicht: Sie duerfte nur dem Kunden selbst gehoeren
 * (Zugriffsregel), er saehe und erledigte sie dann. Ohne Zustaendigen geht
 * nichts raus, und der Kunde sieht die Fehlermeldung. Wirft bei jedem Fehler.
 */
async function programmAnfrageOhneFunktion(kontakt: any): Promise<void> {
  const zustaendig: string | null = kontakt.zustaendig_id || null;
  if (!zustaendig) throw new Error("Kein Zuständiger und keine Funktion für die Leitung");
  const kundeName = `${kontakt.vorname} ${kontakt.nachname}`.trim();
  const { error: glockeFehler } = await supabase.from("benachrichtigungen").insert({
    benutzer_id: zustaendig,
    titel: `Empfehlungsprogramm anfragen: ${kundeName}`,
    nachricht: `${kundeName} hat über das Kundenportal das Empfehlungsprogramm angefragt. Bitte Empfehlungsprogramm für ${kundeName} erstellen und freigeben.`,
    link: `/kunden/${kontakt.id}#empfehlungsprogramm`,
  });
  if (glockeFehler) throw glockeFehler;
}

export default function KundeEmpfehlungen() {
  const { t } = useTranslation();
  const { authUser } = useUser();
  const [kontakt, setKontakt] = useState<any>(null);
  const [programm, setProgramm] = useState<any>(null);
  const [empfehlungen, setEmpfehlungen] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empTelefon, setEmpTelefon] = useState("");
  const [empBeziehung, setEmpBeziehung] = useState("");
  const [empAnmerkungen, setEmpAnmerkungen] = useState("");
  const [empSuccess, setEmpSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    let kontaktId: string | null = null;
    let kontaktChannel: any = null;
    let progChannel: any = null;
    let empChannel: any = null;

    const load = async () => {
      try {
        // Find kontakt
        const { data: kontakte } = await supabase
          .from("kontakte")
          .select("*")
          .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
          .limit(1);
        const k = kontakte?.[0];
        if (!k) { setLoading(false); return; }
        setKontakt(k);
        kontaktId = k.id;

        // Find empfehlungsprogramme linked to this kontakt
        const { data: progs } = await supabase
          .from("empfehlungsprogramme")
          .select("*")
          .eq("aktiv", true);

        // Find programme matching this kontakt (via meta.kontaktId)
        const matching = (progs || []).find((p: any) => p.meta?.kontaktId === k.id);
        if (matching) {
          setProgramm(matching);
          // Load empfehlungen for this programme
          const { data: emps } = await supabase
            .from("empfehlungen")
            .select("*")
            .order("erstellt_am", { ascending: false });
          // Filter by programmId in meta
          const filtered = (emps || []).filter((e: any) => e.meta?.programmId === matching.id);
          setEmpfehlungen(filtered);
        } else {
          setProgramm(null);
          setEmpfehlungen([]);
        }
      } catch (err) {
        console.error("[KundeEmpfehlungen] Laden fehlgeschlagen:", err);
        // Feste ID, damit wiederholte Realtime-Ladefehler keine Toast-Flut erzeugen.
        toast.error(t("portal.empfehlungen.load_error"), { id: "kunde-empfehlungen-load" });
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    load().then(() => {
      if (!kontaktId) return;
      // Realtime: kontakt (z.B. Empfehlungsprogramm-Anfrage), programme (Freischaltung), empfehlungen (Status)
      kontaktChannel = supabase
        .channel(`kunde-emp-kontakt-${authUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "kontakte", filter: `id=eq.${kontaktId}` }, () => load())
        .subscribe();
      progChannel = supabase
        .channel(`kunde-emp-prog-${authUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "empfehlungsprogramme" }, () => load())
        .subscribe();
      empChannel = supabase
        .channel(`kunde-emp-emp-${authUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "empfehlungen" }, () => load())
        .subscribe();
    });

    return () => {
      if (kontaktChannel) supabase.removeChannel(kontaktChannel);
      if (progChannel) supabase.removeChannel(progChannel);
      if (empChannel) supabase.removeChannel(empChannel);
    };
  }, [authUser]);

  const handleSubmit = async () => {
    if (!empName.trim() || !programm || !kontakt || submitting) return;
    setSubmitting(true);
    try {
      const empfehlenderName = `${kontakt.vorname} ${kontakt.nachname}`;
      const nameParts = empName.trim().split(/\s+/);
      const vorname = nameParts[0] || "";
      const nachname = nameParts.slice(1).join(" ");

      /*
       * Kontakt und Empfehlung legt die Datenbankfunktion in einem Schritt an,
       * wie auf der Kundenprofilseite. Sie findet den Partner ueber die
       * Kennung am Kontakt des Kunden, erkennt Dubletten und schickt die
       * Glocke nach den Glockenregeln (Zustaendiger, sonst Leitung).
       *
       * Bis zum 04.10.2026 schrieb diese Seite selbst in `kontakte`,
       * `empfehlungen` und `benachrichtigungen`, suchte den Partner notfalls
       * ueber seinen Namen und schickte die Glocke an jede gefundene Kennung.
       * Seit den Zugriffsregeln vom 28. und 30.09.2026 darf ein Kunde dort
       * nicht mehr direkt schreiben; die Empfehlung scheiterte also.
       */
      const { data, error } = await supabase.rpc("create_empfehlung_kontakt", {
        _referrer_kontakt_id: kontakt.id,
        _vorname: vorname,
        _nachname: nachname,
        _email: empEmail.trim(),
        _telefon: empTelefon.trim(),
        _quelle: `Empfehlung von ${empfehlenderName}`,
        _berater: "",
        _beziehung: empBeziehung.trim(),
        _anmerkungen: empAnmerkungen.trim(),
        _programm_id: programm.id,
        _investment_id: programm.meta?.investmentId || "",
      });
      if (error) throw error;
      const ergebnis = (data ?? {}) as { empfehlung_id?: string; duplicate?: boolean };
      if (!ergebnis.empfehlung_id) throw new Error("Empfehlung ohne Kennung zurückgekommen");

      // Sofort sichtbar; die Realtime-Meldung laedt die Liste danach ohnehin neu.
      setEmpfehlungen((prev) => [
        {
          id: ergebnis.empfehlung_id,
          empfohlen_name: empName.trim(),
          status: ergebnis.duplicate ? "dublette" : "neu",
          erstellt_am: new Date().toISOString(),
          meta: { programmId: programm.id },
        },
        ...prev,
      ]);

      setEmpName(""); setEmpEmail(""); setEmpTelefon(""); setEmpBeziehung(""); setEmpAnmerkungen("");
      setEmpSuccess(true);
      setTimeout(() => setEmpSuccess(false), 4000);
    } catch (err) {
      console.error("[KundeEmpfehlungen] Empfehlung konnte nicht gespeichert werden:", err);
      toast.error(t("portal.empfehlungen.submit_error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }


  /*
   * Empfehlungsprogramm anfragen.
   *
   * Christians Vorgabe vom 04.10.2026: Der zustaendige Partner bekommt eine
   * Aufgabe und eine Glocke, die auf genau diese Aufgabe zeigt. Gibt es
   * keinen Zustaendigen, gehen beide an Admin, Inhaber und Vertriebsleitung.
   * Zustaendig ist allein `zustaendig_id`, nie der Beratername.
   *
   * Der Weg ist `empfehlungsprogramm_anfragen` (Migration 20261004175000),
   * weil ein Kunde weder eine Aufgabe fuer andere anlegen noch der Leitung
   * eine Glocke schicken darf. Die Aufgabe gehoert dem Empfaenger, der Kunde
   * sieht sie nicht. Fehlt die Funktion noch, geht nur eine Glocke an den
   * Zustaendigen. Ohne Zustaendigen geht es dann nicht, und der Kunde sieht
   * die Fehlermeldung statt eines Erfolgs.
   *
   * Bisher wurden die Fehler beider Einfuegungen nicht ausgewertet, und ohne
   * Zustaendigen ging gar nichts raus; der Kunde sah trotzdem „gesendet“.
   */
  const handleRequestProgramm = async () => {
    if (!kontakt || !authUser || requestLoading) return;
    setRequestLoading(true);
    try {
      const { error } = await supabase.rpc("empfehlungsprogramm_anfragen" as any, { _kontakt_id: kontakt.id });
      if (error) {
        if (!funktionFehlt(error)) throw error;
        await programmAnfrageOhneFunktion(kontakt);
      }
      setRequestSent(true);
    } catch (err) {
      console.error("[KundeEmpfehlungen] Programm-Anfrage fehlgeschlagen:", err);
      toast.error(t("portal.empfehlungen.request_error"));
    } finally {
      setRequestLoading(false);
    }
  };

  if (!programm) {
    return (
      <DashboardLayout>
        <div className="px-2">
          <PortalHero
            eyebrow={t("portal.empfehlungen.hero_eyebrow")}
            title={t("portal.empfehlungen.hero_title_inactive")}
            subtitle={t("portal.empfehlungen.hero_subtitle_inactive")}
            actions={!requestSent ? (
              <Button className="gap-2" variant="brand" onClick={handleRequestProgramm} disabled={requestLoading}>
                {requestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                {t("portal.empfehlungen.request_program")}
              </Button>
            ) : (
              <div className="inline-flex items-center gap-2 text-sm text-[hsl(var(--success))] font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {t("portal.empfehlungen.request_sent")}
              </div>
            )}
          />
        </div>
      </DashboardLayout>
    );
  }

  const progMeta = programm.meta || {};
  const provisionsBetrag = progMeta.provisionsBetrag || 0;
  const provisionsTyp: "fest" | "prozent" = progMeta.provisionsTyp === "prozent" ? "prozent" : "fest";
  const provisionsText = progMeta.provisionsText || programm.praemie || "";
  const bedingungen = progMeta.bedingungen || programm.beschreibung || "";
  const BEISPIEL_KAUFPREIS = 300000;
  const sprache = portalSprache();
  const fmtEUR = (v: number) => euroText(v, sprache, 0);
  // Prozentsatz mit bis zu zwei Nachkommastellen, ohne Nullen aufzufüllen (3 % statt 3,00 %).
  const prozentZahl = (v: number) => Number(v || 0).toLocaleString(portalLocale(), { maximumFractionDigits: 2 });
  const prozentAnzeige = (v: number) => (sprache === "en" ? `${prozentZahl(v)}%` : `${prozentZahl(v)} %`);
  const beispielVerguetung =
    provisionsTyp === "prozent"
      ? Math.round((BEISPIEL_KAUFPREIS * (provisionsBetrag || 0)) / 100)
      : provisionsBetrag || 0;
  const verguetungLabel =
    provisionsTyp === "prozent"
      ? t("portal.empfehlungen.rate_of_purchase_price", { percent: prozentZahl(provisionsBetrag) })
      : fmtEUR(provisionsBetrag);

  return (
    <DashboardLayout>
      <div className="space-y-6 px-2">
        <PortalHero
          eyebrow={t("portal.empfehlungen.hero_eyebrow_active")}
          title={t("portal.empfehlungen.hero_title_active")}
          subtitle={provisionsText || t("portal.empfehlungen.hero_subtitle_default")}
          actions={<Badge className="bg-primary/10 text-primary text-xs border border-primary/30">{t("portal.empfehlungen.active")}</Badge>}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div {...einlage("px-4 py-2")}>
              <span className="text-xs text-muted-foreground">{t("portal.empfehlungen.your_referrals")}</span>
              <p className="text-lg font-semibold">{empfehlungen.length}</p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2">
              <span className="text-xs text-muted-foreground">{t("portal.empfehlungen.per_successful_referral")}</span>
              <p className="text-lg font-semibold text-primary">{verguetungLabel}</p>
            </div>
          </div>
          {bedingungen && <p className="text-xs text-muted-foreground mt-3">{t("portal.empfehlungen.conditions", { text: bedingungen })}</p>}
        </PortalHero>

        {/* Beispielrechnung */}
        <div className="portal-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">{t("portal.empfehlungen.example_title")}</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {t("portal.empfehlungen.example_basis", { price: fmtEUR(BEISPIEL_KAUFPREIS) })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div {...einlage("p-3")}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("portal.empfehlungen.example_avg_price")}</p>
              <p className="font-semibold mt-1">{fmtEUR(BEISPIEL_KAUFPREIS)}</p>
            </div>
            <div {...einlage("p-3")}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {provisionsTyp === "prozent" ? t("portal.empfehlungen.example_your_rate") : t("portal.empfehlungen.example_your_fixed")}
              </p>
              <p className="font-semibold mt-1">
                {provisionsTyp === "prozent" ? prozentAnzeige(provisionsBetrag) : fmtEUR(provisionsBetrag)}
              </p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-primary uppercase tracking-wide">{t("portal.empfehlungen.example_your_payout")}</p>
              <p className="font-bold text-primary mt-1">{fmtEUR(beispielVerguetung)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {provisionsTyp === "prozent"
              ? t("portal.empfehlungen.example_formula_rate", {
                  price: fmtEUR(BEISPIEL_KAUFPREIS),
                  percent: prozentZahl(provisionsBetrag),
                  payout: fmtEUR(beispielVerguetung),
                })
              : t("portal.empfehlungen.example_formula_fixed", { amount: fmtEUR(provisionsBetrag) })}
          </p>
        </div>

        {/* Neue Empfehlung */}
        <div className="portal-card p-6">
          <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> {t("portal.empfehlungen.new_title")}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t("portal.empfehlungen.new_sub")}
          </p>

          {empSuccess && (
            <div className="border rounded-lg p-3 border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <p className="text-sm text-[hsl(var(--success))] font-medium">{t("portal.empfehlungen.success")}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label className="text-xs font-semibold">{t("portal.empfehlungen.name")} *</Label><Input value={empName} onChange={e => setEmpName(e.target.value)} placeholder={t("portal.empfehlungen.name_ph")} className="h-9 mt-1" /></div>
            <div>
              <Label className="text-xs font-semibold">{t("portal.empfehlungen.relation")}</Label>
              <Select value={empBeziehung} onValueChange={setEmpBeziehung}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder={t("portal.empfehlungen.relation_ph")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Familie">{t("portal.empfehlungen.rel_family")}</SelectItem>
                  <SelectItem value="Freund">{t("portal.empfehlungen.rel_friend")}</SelectItem>
                  <SelectItem value="Arbeitskollege">{t("portal.empfehlungen.rel_colleague")}</SelectItem>
                  <SelectItem value="Nachbar">{t("portal.empfehlungen.rel_neighbor")}</SelectItem>
                  <SelectItem value="Bekannter">{t("portal.empfehlungen.rel_acquaintance")}</SelectItem>
                  <SelectItem value="Sonstige">{t("portal.empfehlungen.rel_other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs font-semibold">{t("portal.empfehlungen.email")}</Label><Input value={empEmail} onChange={e => setEmpEmail(e.target.value)} placeholder={t("portal.empfehlungen.email_ph")} className="h-9 mt-1" type="email" /></div>
            <div><Label className="text-xs font-semibold">{t("portal.empfehlungen.phone")}</Label><PhoneInput value={empTelefon} onChange={v => setEmpTelefon(v)} className="h-9 mt-1" /></div>
            <div className="md:col-span-2">
              <Label className="text-xs font-semibold">{t("portal.empfehlungen.notes")}</Label>
              <Textarea value={empAnmerkungen} onChange={e => setEmpAnmerkungen(e.target.value)} placeholder={t("portal.empfehlungen.notes_ph")} className="mt-1" rows={2} />
            </div>
          </div>
          <Button variant="brand" className="mt-4 gap-2" onClick={handleSubmit} disabled={!empName.trim() || submitting}>
            <UserPlus className="h-4 w-4" /> {t("portal.empfehlungen.submit")}
          </Button>
        </div>

        {/* Bisherige */}
        <div className="portal-card p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" /> {t("portal.empfehlungen.history_title", { count: empfehlungen.length })}
          </h3>
          {empfehlungen.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("portal.empfehlungen.no_history")}</p>
          ) : (
            <div className="space-y-3">
              {empfehlungen.map((emp) => {
                const status = (emp.status || "offen") as EmpfehlungStatus;
                // Label zentral aus PORTAL_STATUS_TEXT_KEY, damit neue
                // Statuswerte (in_beratung, in_abwicklung, dublette) hier
                // nicht wieder auf den Fallback zurueckfallen.
                const label = t(PORTAL_STATUS_TEXT_KEY[status] ?? PORTAL_STATUS_TEXT_KEY.offen);
                const toneConfig: Record<EmpfehlungStatus, { color: string; dot: string }> = {
                  "offen": { color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30", dot: "bg-[hsl(var(--warning))]" },
                  "neu": { color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30", dot: "bg-[hsl(var(--warning))]" },
                  "kontaktiert": { color: "bg-primary/10 text-primary border-primary/30", dot: "bg-primary" },
                  "termin": { color: "bg-primary/10 text-primary border-primary/30", dot: "bg-primary" },
                  "in_beratung": { color: "bg-primary/10 text-primary border-primary/30", dot: "bg-primary" },
                  "in_abwicklung": { color: "bg-primary/10 text-primary border-primary/30", dot: "bg-primary" },
                  "abgeschlossen": { color: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30", dot: "bg-[hsl(var(--success))]" },
                  "verloren": { color: "bg-destructive/10 text-destructive border-destructive/30", dot: "bg-destructive" },
                  "dublette": { color: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
                };
                const cfg = { ...(toneConfig[status] || toneConfig["offen"]), label };
                return (
                  <div key={emp.id} className="border rounded-lg p-4 flex items-start gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{emp.empfohlen_name}</p>
                      {emp.empfohlen_email && <p className="text-xs text-muted-foreground">{emp.empfohlen_email}</p>}
                      {emp.empfohlen_telefon && <p className="text-xs text-muted-foreground">{emp.empfohlen_telefon}</p>}
                      {emp.meta?.beziehung && <p className="text-xs text-muted-foreground">{t("portal.empfehlungen.relation_label", { text: emp.meta.beziehung })}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{emp.erstellt_am ? datumText(emp.erstellt_am, sprache) : ""}</p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 ${cfg.color}`}>
                      {cfg.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
