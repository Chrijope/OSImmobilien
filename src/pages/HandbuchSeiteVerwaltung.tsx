/**
 * Verwaltung der Handbuch-Seite im CRM (/handbuch-seite).
 *
 * Vorerst nur Admin, Inhaber und Vertriebsleitung (Schalter in
 * `lib/handbuch/zugang.ts`, erzwungen im Routenschutz über
 * `sidebarPermissions.ts`). Oben rechts dasselbe Teilen-Element wie bei der
 * Berater-Mikroseite, darunter der persönliche Link und die Vorschau, wie
 * Interessenten den Partner als Ansprechpartner sehen. Wer die Gesamtsicht
 * hat, sieht zusätzlich den Firmenlink ohne Partner samt Kampagnenkennung
 * und die Übersicht wahlweise für alle, den eigenen Link oder nur den
 * Firmenlink. Partner sehen nur ihre eigenen Zahlen (auch serverseitig).
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookMarked, Building2, Copy, ExternalLink, Info, Link2, Loader2, Mail, Phone, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useBeraterAusKuerzel } from "@/components/handbuch/Rahmen";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { LinkTeilenKnoepfe } from "@/components/teilen/LinkTeilenKnoepfe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { buildHandbuchUrl, handbuchVorschauUrl } from "@/lib/publicUrl";
import { ladeHandbuchKennzahlen, type KennzahlenStand } from "@/lib/handbuch/kennzahlen";
import { hatHandbuchGesamtsicht } from "@/lib/handbuch/zugang";
import { mitKampagne } from "@/lib/handbuch/kampagnenLink";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";
import { hatEigenenPartnerLink } from "../../supabase/functions/_shared/lead-zuordnung.ts";

const QUELLEN = [
  { wert: "meta", text: "Meta (Facebook, Instagram)", medium: "paid_social" },
  { wert: "google", text: "Google", medium: "cpc" },
  { wert: "linkedin", text: "LinkedIn", medium: "paid_social" },
  { wert: "newsletter", text: "Newsletter", medium: "email" },
];

function Kachel({ wert, text, hervor }: { wert: number | string; text: string; hervor?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${hervor ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"}`}>
      <div className="text-2xl font-semibold tabular-nums text-foreground">{wert}</div>
      <div className="mt-1 text-xs text-muted-foreground">{text}</div>
    </div>
  );
}

function LinkZeile({ url }: { url: string | null }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2.5 font-mono text-[13px]">
      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{url ? url.replace(/^https?:\/\//, "") : "Wird vorbereitet…"}</span>
    </div>
  );
}

export default function HandbuchSeiteVerwaltung() {
  const { user, authUser } = useUser();
  // Gesamtsicht: Admin, Inhaber, Vertriebsleitung.
  const istAdmin = hatHandbuchGesamtsicht(user.role);
  const mitLink = hatEigenenPartnerLink(user.role);
  const [slug, setSlug] = useState<string | null>(null);
  const [slugFehler, setSlugFehler] = useState(false);
  const [tage, setTage] = useState(90);
  const [ansicht, setAnsicht] = useState<"alle" | "meine" | "firma">(istAdmin ? "alle" : "meine");
  const [kennzahlen, setKennzahlen] = useState<KennzahlenStand | { status: "laden" }>({ status: "laden" });
  const [quelle, setQuelle] = useState(QUELLEN[0].wert);
  const [kampagne, setKampagne] = useState("handbuch_herbst");

  useEffect(() => {
    if (!authUser?.id || !mitLink) return;
    let abgebrochen = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ensure-vp-slug", { body: {} });
        if (abgebrochen) return;
        if (!error && data?.slug) setSlug(String(data.slug));
        else setSlugFehler(true);
      } catch {
        if (!abgebrochen) setSlugFehler(true);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [authUser?.id, mitLink]);

  useEffect(() => {
    let abgebrochen = false;
    setKennzahlen({ status: "laden" });
    // Ohne Gesamtsicht entscheidet ohnehin der Server: nur die eigenen Zahlen.
    const meine = !istAdmin || ansicht === "meine";
    ladeHandbuchKennzahlen(tage, meine ? authUser?.id ?? null : null, istAdmin && ansicht === "firma").then((r) => {
      if (!abgebrochen) setKennzahlen(r);
    });
    return () => {
      abgebrochen = true;
    };
  }, [tage, ansicht, istAdmin, authUser?.id]);

  const persoenlich = slug ? buildHandbuchUrl(slug) : null;
  const firmenlink = buildHandbuchUrl(null);
  const quelleEintrag = QUELLEN.find((q) => q.wert === quelle) ?? QUELLEN[0];
  const kampagnenLink = useMemo(() => mitKampagne(firmenlink, quelleEintrag.wert, quelleEintrag.medium, kampagne), [firmenlink, quelleEintrag, kampagne]);

  const kopiere = (text: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Link kopiert!"))
      .catch(() => toast.error("Kopieren ging nicht. Markiere den Link und kopiere ihn von Hand."));

  return (
    <div className="space-y-4">
      <PageHeader title="Handbuch-Seite" subtitle="Deine Landingpage mit Konfigurator und persönlichem Immobilienhandbuch">
        <LinkTeilenKnoepfe url={persoenlich} vorschauUrl={slug ? handbuchVorschauUrl(slug) : null} />
      </PageHeader>

      <p className="max-w-3xl text-sm text-muted-foreground">
        Teile diesen Link mit Interessenten. Wer die sechs Fragen beantwortet, bekommt sein persönliches Immobilienhandbuch sofort online, als PDF und per E-Mail, und landet als Kontakt automatisch bei dir unter „Alle Kontakte“. Aus dem Handbuch geht es direkt in die Selbstauskunft; ist sie unterschrieben, steht der Kontakt auf Objektauswahl.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <User className="h-4 w-4 text-primary" aria-hidden="true" /> Dein persönlicher Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mitLink ? (
              <>
                <LinkZeile url={persoenlich} />
                {slugFehler && <p className="text-xs text-destructive">Dein Link konnte gerade nicht geladen werden. Bitte lade die Seite neu.</p>}
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Leads über diesen Link gehören dir: Sie erscheinen unter „Alle Kontakte“, du bekommst die Glocke und die Mail wie bei Leads über deine Mikroseite. Das Handbuch geht in deinem Namen hinaus, Antworten des Interessenten landen bei dir.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Deine Rolle hat keinen persönlichen Partnerlink.</p>
            )}
          </CardContent>
        </Card>

        {istAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                <Building2 className="h-4 w-4 text-primary" aria-hidden="true" /> Firmenlink für Werbung
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <LinkZeile url={firmenlink} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => kopiere(firmenlink)}>
                  <Copy className="h-4 w-4" /> Link kopieren
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(handbuchVorschauUrl(null), "_blank", "noopener")}>
                  <ExternalLink className="h-4 w-4" /> Vorschau
                </Button>
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Ohne Partnerkennung. Leads über diesen Link landen ohne Partner in der Lead-Verwaltung zum Zuteilen, Setterin, Admin, Inhaber und Vertriebsleitung bekommen die Glocke.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {mitLink && <AnsprechpartnerVorschau slug={slug} />}

      {istAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <Info className="h-4 w-4 text-primary" aria-hidden="true" /> Kampagnenkennung anhängen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Für bezahlte Werbung immer den Link mit Kampagnenkennung (UTM) verwenden. Dann steht am Kontakt, aus welcher Anzeige er kam, und die Statistik zeigt Leads, Termine und Abschlüsse je Kampagne.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hb-quelle">Quelle</Label>
                <select
                  id="hb-quelle"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={quelle}
                  onChange={(e) => setQuelle(e.target.value)}
                >
                  {QUELLEN.map((q) => (
                    <option key={q.wert} value={q.wert}>
                      {q.text}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hb-kampagne">Name der Kampagne</Label>
                <Input id="hb-kampagne" value={kampagne} onChange={(e) => setKampagne(e.target.value)} placeholder="zum Beispiel handbuch_steuer" />
              </div>
            </div>
            <LinkZeile url={kampagnenLink} />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => kopiere(kampagnenLink)}>
              <Copy className="h-4 w-4" /> Link mit Kennung kopieren
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <BookMarked className="h-4 w-4 text-primary" aria-hidden="true" /> Übersicht
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {istAdmin && (
              <div className="flex rounded-lg border p-0.5" role="group" aria-label="Welche Anfragen">
                {(
                  [
                    ["alle", "Alle"],
                    ["meine", "Nur mein Link"],
                    ["firma", "Nur Firmenlink"],
                  ] as const
                ).map(([wert, text]) => (
                  <button
                    key={wert}
                    type="button"
                    aria-pressed={ansicht === wert}
                    className={`rounded-md px-2.5 py-1 ${ansicht === wert ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => setAnsicht(wert)}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
            <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={tage} onChange={(e) => setTage(Number(e.target.value))} aria-label="Zeitraum">
              <option value={30}>30 Tage</option>
              <option value={90}>90 Tage</option>
              <option value={365}>12 Monate</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {kennzahlen.status === "laden" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Zahlen werden geladen
            </p>
          )}
          {kennzahlen.status === "migration" && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-foreground">Migration ausstehend</p>
              <p className="mt-0.5 text-muted-foreground">
                Die Übersicht erscheint, sobald die Migration 20260926170000_handbuch_seite.sql gelaufen ist. Die Seite selbst funktioniert schon: Leads entstehen, das Handbuch erscheint online und als PDF. Ohne Migration fehlen nur die Zustellmail, die Zählung und diese Übersicht.
              </p>
            </div>
          )}
          {kennzahlen.status === "migration_firma" && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-foreground">„Nur Firmenlink“ braucht die Migration 20260926180000</p>
              <p className="mt-0.5 text-muted-foreground">„Alle“ und „Nur mein Link“ funktionieren schon. Die Auswahl nur für den Firmenlink erscheint, sobald die Migration gelaufen ist.</p>
            </div>
          )}
          {kennzahlen.status === "fehler" && <p className="text-sm text-destructive">Die Zahlen konnten gerade nicht geladen werden.</p>}
          {kennzahlen.status === "ok" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Kachel wert={kennzahlen.zahlen.aufrufe} text="Aufrufe der Seite" />
                <Kachel wert={kennzahlen.zahlen.gestartet} text="Konfigurator gestartet" />
                <Kachel wert={kennzahlen.zahlen.sechsFragen} text="alle sechs Fragen beantwortet" />
                <Kachel wert={kennzahlen.zahlen.erhalten} text="Handbuch erhalten" hervor />
                <Kachel wert={kennzahlen.zahlen.saGestartet} text="Selbstauskunft begonnen" />
                <Kachel wert={kennzahlen.zahlen.saAbgeschickt} text="Selbstauskunft abgeschickt" hervor />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Kachel wert={kennzahlen.zahlen.passt} text="Ausgang „passt“" />
                <Kachel wert={kennzahlen.zahlen.vielleicht} text="Ausgang „passt vielleicht“" />
                <Kachel wert={kennzahlen.zahlen.nochNicht} text="Ausgang „passt noch nicht“" />
                <Kachel wert={kennzahlen.zahlen.geoeffnet} text="Handbuch über den Link geöffnet" />
                <Kachel wert={kennzahlen.zahlen.pdf} text="PDF gespeichert" />
                <Kachel wert={`${kennzahlen.zahlen.ueberPartner} / ${kennzahlen.zahlen.ueberFirma}`} text="über Partnerlink / Firmenlink" />
              </div>
              <p className="text-xs text-muted-foreground">
                Letzte {kennzahlen.zahlen.tage} Tage. Aufrufe und Schritte zählt der Browser ohne Personenbezug; wer einen Werbeblocker nutzt, fehlt dort. „Handbuch erhalten“ und „Selbstauskunft abgeschickt“ kommen aus der Datenbank und sind vollständig.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * So sieht ein Interessent den Partner auf dessen Handbuch-Seite: Bild,
 * Name, Telefon, E-Mail, genau aus derselben öffentlichen Quelle wie die
 * Seite selbst (`get-vp-microsite`). Fehlt Bild oder Telefon, ein Hinweis
 * mit Weg in die Einstellungen.
 */
function AnsprechpartnerVorschau({ slug }: { slug: string | null }) {
  const stand = useBeraterAusKuerzel(slug);
  const b = stand.status === "ok" ? stand.berater : null;
  const fehlt = b ? [!b.bild ? "dein Profilbild" : "", !b.telefon ? "deine Telefonnummer" : ""].filter(Boolean) : [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
          <User className="h-4 w-4 text-primary" aria-hidden="true" /> So sehen Interessenten dich als Ansprechpartner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!b ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Vorschau wird geladen
          </p>
        ) : (
          <div className="flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            {b.bild ? (
              <img src={b.bild} alt={b.name} className="h-16 w-16 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="h-6 w-6" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              {/* Dieselbe Beschriftung wie auf der öffentlichen Seite, die siezt; die Verwaltung selbst duzt den Partner. */}
              <div className="text-xs text-muted-foreground">{HANDBUCH_SEITEN_TEXTE.de.landing.wer.deinBerater}</div>
              <div className="text-base font-semibold">{b.name}</div>
              <div className="text-xs text-muted-foreground">{b.position}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {b.telefon && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {b.telefon}
                  </span>
                )}
                {b.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {b.email}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {fehlt.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-muted-foreground">
              Auf deiner Seite {fehlt.length > 1 ? "fehlen" : "fehlt"} noch {fehlt.join(" und ")}. Mit Bild und Nummer wirkt die Seite persönlicher, und Interessenten erreichen dich direkt.{" "}
              <Link to="/einstellungen" className="font-medium text-primary hover:underline">
                In den Einstellungen ergänzen
              </Link>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
