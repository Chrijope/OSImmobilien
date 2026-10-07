import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SelbstauskunftForm, SelbstauskunftHinweise, loescheLokalenSaEntwurf } from "@/components/selbstauskunft/SelbstauskunftForm";
import { normalisiereSprache, type Sprache } from "@/lib/kundenSprache";
import { saText } from "@/lib/selbstauskunftTexte";
import logo from "@/assets/moreimmo-logo.png";
import { zaehleHandbuch } from "@/lib/handbuch/ereignisse";
import { spracheAusAdresse } from "@/lib/seitenSprache";
import { nameAusLink } from "@/lib/saNameAusLink";

/**
 * `unbekannt`: Den Link gibt es nicht (nie gegeben, oder schon aufgeräumt).
 * `fehler`: Die Abfrage selbst ist gescheitert, etwa ohne Netz. Bis zum
 * 07.10.2026 zeigten beide „Ungültiger Link“, auch wenn nur das Netz weg war.
 * `weiter`: Es gibt einen neueren Link für dieselbe Selbstauskunft, die Seite
 * leitet gleich dorthin.
 * `widerrufen`: Der Berater hat an eine andere Adresse einen neuen Link
 * geschickt, dieser gilt nicht mehr (Status `widerrufen`, Migration
 * 20261007100000). Jeder Status außer offen und abgeschlossen landet hier.
 * `person2`: Ein eigener Link für Person 2. Das Formular hat dafür keine
 * eigene Ansicht und reicht immer die Unterschrift von Person 1 ein, die der
 * Server für diesen Link ablehnt (seit 07.10.2026). Statt nach dem Ausfüllen
 * zu scheitern, weist die Seite ihn gleich freundlich ab.
 */
type PageStatus = "loading" | "ready" | "expired" | "used" | "unbekannt" | "fehler" | "weiter" | "widerrufen" | "person2";

/** Antwort von `sa_neuen_link_anfordern`, dazu `fehler` für Netz oder fehlende Migration. */
type Anforderung = "bereit" | "sendet" | "angefordert" | "schon_angefordert" | "nicht_moeglich" | "fehler";

/**
 * Der Token des neueren Links für dieselbe Selbstauskunft (fester Link je
 * Investment und Person, Migration 20261007100000). Ohne die Migration fehlt
 * die Funktion, dann bleibt es beim aufgerufenen Link.
 */
/** Für RPCs, die die erzeugten Datenbanktypen noch nicht kennen (Migration offen). */
type FreierRpc = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
const freierRpc = supabase as unknown as FreierRpc;

const ladeLink = (token: string) => supabase.rpc("get_sa_fill_token", { _token: token });

async function nachfolgerVon(token: string): Promise<string | null> {
  try {
    const { data, error } = await freierRpc.rpc("sa_link_nachfolger", { _token: token });
    return !error && typeof data === "string" && data && data !== token ? data : null;
  } catch {
    return null;
  }
}

/**
 * Die Fusszeile mit dem Datenschutz-Hinweis.
 *
 * Ausgerechnet die Seite, auf der jemand sein Einkommen, seine Ausgaben und
 * seine bestehenden Verpflichtungen eintraegt, verwies frueher nirgends auf
 * die Datenschutzerklaerung. Sie steht deshalb auf jeder Ansicht der Seite,
 * auch nach dem Absenden. Im dreispaltigen Aufbau sitzt sie unten in der
 * linken Spalte, auf schmalen Bildschirmen ganz am Ende der Seite.
 */
function Fusszeile({ className = "", sprache }: { className?: string; sprache: Sprache }) {
  return (
    <footer className={`border-t pt-4 text-xs text-muted-foreground ${className}`}>
      <p>
        {saText("Ihre Angaben werden vertraulich behandelt und ausschließlich zur Prüfung Ihrer Finanzierungsmöglichkeiten verwendet.", sprache)}{" "}
        <a
          href={sprache === "en" ? "/datenschutz?lang=en" : "/datenschutz"}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          {saText("Datenschutzerklärung", sprache)}
        </a>
      </p>
      <p className="mt-1">OS Immobilien Holding GmbH, Am Ostbahnhof 1, 15749 Mittenwalde</p>
    </footer>
  );
}

/**
 * `weg="handbuch"`: alte Links aus Handbuch-Mails
 * (/handbuch/selbstauskunft/:token, 26.09.2026). Seit demselben Abend ist die
 * Selbstauskunft aus dem Handbuch genau die Standard-Selbstauskunft wie bei
 * „An Kunde senden“ (neue Links: /sa/:token), mit Steuer-ID, Bankverbindung,
 * Person 2 und Unterschrift. Anders ist auf dem alten Weg nur noch: Ein
 * abgelaufener Link verweist auf die offene Selbstauskunft der Handbuch-Seite
 * statt auf einen Berater, den es vielleicht noch nicht gibt.
 *
 * Die Sprache: `?lang=en` in der Adresse geht vor der Sprache am Kontakt
 * (Muster `seitenSprache.ts`). So öffnet der Link aus einer englischen
 * Handbuch-Mail auch dann englisch, wenn die Datenbankfunktion die Sprache
 * noch nicht mitliefert.
 */
export default function SelbstauskunftPublic({ weg }: { weg?: "handbuch" } = {}) {
  const handbuchWeg = weg === "handbuch";
  const { token } = useParams<{ token: string }>();
  const { search } = useLocation();
  const navigate = useNavigate();
  const ausAdresse = spracheAusAdresse(search);
  // Zählt hoch bei „Erneut versuchen“ und lädt damit neu.
  const [ladeVersuch, setLadeVersuch] = useState(0);
  const [anforderung, setAnforderung] = useState<Anforderung>("bereit");
  const [status, setStatus] = useState<PageStatus>("loading");
  const [tokenData, setTokenData] = useState<any>(null);
  const [completed, setCompleted] = useState(false);
  /*
   * Der Abschnitt, in dem der Kunde gerade steht. Das Formular meldet ihn über
   * `onHinweisSchritt`, damit die Hinweisspalte rechts zum offenen Abschnitt
   * passt, obwohl sie ausserhalb des Formulars steht.
   */
  const [hinweisSchritt, setHinweisSchritt] = useState(0);
  /*
   * Die Sprache des Kunden. Sie kommt mit dem Link aus `get_sa_fill_token`
   * (Feld `sprache`, Plan Kundensprache Etappe 4). Solange die Migration dazu
   * nicht gelaufen ist, fehlt das Feld, dann bleibt es bei Deutsch. Bis die
   * Zeile geladen ist, kennt die Seite die Sprache noch nicht und zeigt den
   * Ladehinweis deutsch.
   */
  const [sprache, setSprache] = useState<Sprache>(ausAdresse ?? "de");
  const t = (de: string, werte?: Record<string, string | number>) => saText(de, sprache, werte);

  // Die Seitensprache für Vorleseprogramme und die Silbentrennung des Browsers.
  useEffect(() => {
    const html = document.documentElement;
    const vorher = html.lang;
    html.lang = sprache;
    return () => { html.lang = vorher; };
  }, [sprache]);

  useEffect(() => {
    if (!token) { setStatus("unbekannt"); return; }
    let abgebrochen = false;
    setStatus("loading");
    setAnforderung("bereit");

    const load = async () => {
      let antwort: Awaited<ReturnType<typeof ladeLink>> | null = null;
      try {
        antwort = await ladeLink(token);
      } catch {
        antwort = null;
      }
      if (abgebrochen) return;
      if (!antwort || antwort.error) {
        // Netz weg oder Server gestört: nicht „ungültig“ sagen.
        setStatus("fehler");
        return;
      }
      const rpcData = antwort.data;
      const data = Array.isArray(rpcData) ? rpcData[0] : rpcData;

      if (!data || !data.id) {
        setStatus("unbekannt");
        return;
      }

      // Vor den Statusprüfungen, damit auch „abgelaufen“ und „bereits
      // ausgefüllt“ in der Sprache des Kunden erscheinen.
      setSprache(ausAdresse ?? normalisiereSprache((data as { sprache?: unknown }).sprache) ?? "de");

      if (data.status === "used") {
        // Abgeschlossen: einen alten Entwurf auf diesem Geraet entfernen.
        loescheLokalenSaEntwurf(data.kontakt_id, data.investment_id);
        setStatus("used");
        return;
      }

      if (data.status !== "pending") {
        setStatus("widerrufen");
        return;
      }

      if (Number(data.person_nr) === 2) {
        setStatus("person2");
        return;
      }

      /*
       * Ein fester Link je Investment und Person (07.10.2026): Ein älterer
       * Link aus einer früheren Mail führt auf den aktuellen. Der Stand liegt
       * am Investment, beim Wechsel geht nichts verloren.
       */
      const neuerToken = await nachfolgerVon(token);
      if (abgebrochen) return;
      if (neuerToken) {
        setStatus("weiter");
        navigate(`/sa/${neuerToken}${search}`, { replace: true });
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        loescheLokalenSaEntwurf(data.kontakt_id, data.investment_id);
        setStatus("expired");
        return;
      }

      // Offener Link: Ein Entwurf, den der Kundenlink frueher dauerhaft im
      // localStorage abgelegt hat, wird nicht mehr gebraucht. Der Stand kommt
      // vom Server, der Rueckfall liegt nur noch im sessionStorage des Tabs.
      loescheLokalenSaEntwurf(data.kontakt_id, data.investment_id, true);

      // Load kontakt data for prefill
      const { data: kontakt } = await supabase
        .from("kontakte")
        .select("*")
        .eq("id", data.kontakt_id)
        .maybeSingle();

      // Merge prefill_data from token (advisor's draft) with kontakt data
      const prefillFromToken = data.prefill_data || {};
      const isP2 = data.person_nr === 2;

      // For Person 2, use person2 data from kontakt meta
      const p2Meta = (kontakt?.meta as any)?.person2 || {};

      /*
       * Ohne Anmeldung darf der Besucher den Kontakt nicht lesen (Zeilen-
       * sicherheit), `kontakt` ist dann leer. Name und E-Mail stehen aber am
       * Link selbst (`get_sa_fill_token`). Damit niemand sie neu tippen muss
       * und dabei vertippt, werden sie vorbelegt. Seit dem 26.09.2026.
       * Die Namensteile kommen getrennt aus der Vorbelegung, nie aus dem
       * zerlegten Anzeigenamen (siehe `nameAusLink`). Bei Person 2 gehört die
       * Vorbelegung zu Person 1, deshalb dort nur der Anzeigename.
       */
      const ausLink = {
        ...nameAusLink(isP2 ? null : prefillFromToken, data.name),
        email: String(data.email || ""),
      };

      setTokenData({
        ...data,
        isPersonNr2: isP2,
        kontakt: kontakt ? {
          id: kontakt.id,
          vorname: isP2 ? (p2Meta.vorname || "") : kontakt.vorname,
          nachname: isP2 ? (p2Meta.nachname || "") : kontakt.nachname,
          email: isP2 ? (p2Meta.email || "") : (kontakt.email || ""),
          telefon: isP2 ? (p2Meta.telefon || "") : (kontakt.telefon || ""),
          strasse: kontakt.strasse || "",
          hausnummer: kontakt.hausnummer || "",
          plz: kontakt.plz || "",
          ort: kontakt.ort || "",
          anrede: isP2 ? (p2Meta.anrede || "Herr") : (kontakt.anrede || "Herr"),
          geburtstag: isP2 ? (p2Meta.geburtsdatum || "") : ((kontakt.meta as any)?.geburtstag || ""),
          // Einkuenfte und Ausgaben werden bewusst nicht mehr uebergeben:
          // Zahlen liegen am Investment, nicht am Kontakt.
          person2: isP2 ? null : ((kontakt.meta as any)?.person2 || null),
        } : ausLink,
        prefillSaData: Object.keys(prefillFromToken).length > 0 ? prefillFromToken : null,
      });
      setStatus("ready");
      if (handbuchWeg) void zaehleHandbuch("hb_sa_gestartet");

      // Vermerken, dass der Kunde den Knopf aus der Mail benutzt hat. Das ist
      // der verlässliche Teil der Messung: Er hängt nicht daran, ob der
      // Mailclient Bilder lädt. Genau so macht es die Signatur-Seite.
      // Absichtlich ohne Fehlerbehandlung nach außen: Wenn der Vermerk nicht
      // klappt, darf die Selbstauskunft trotzdem nicht blockiert sein.
      try {
        await (supabase as any).rpc("mark_sa_link_opened", { _token: token });
      } catch { /* noop */ }
    };

    load();
    return () => { abgebrochen = true; };
  }, [token, handbuchWeg, ausAdresse, search, navigate, ladeVersuch]);

  /*
   * „Neuen Link anfordern“ auf der Ansicht „abgelaufen“: eine Glocke an den
   * zuständigen Berater (`sa_neuen_link_anfordern`, höchstens einmal je Link
   * in 24 Stunden). Der Knopf ist gesperrt, solange die Anfrage läuft, und
   * verschwindet danach, damit niemand mehrfach klickt.
   */
  const neuenLinkAnfordern = async () => {
    if (!token || anforderung === "sendet") return;
    setAnforderung("sendet");
    try {
      const { data, error } = await freierRpc.rpc("sa_neuen_link_anfordern", { _token: token });
      if (error) throw error;
      setAnforderung(data === "angefordert" || data === "schon_angefordert" ? data : "nicht_moeglich");
    } catch {
      setAnforderung("fehler");
    }
  };

  const handleComplete = async () => {
    // Mark token as used
    if (token) {
      await (supabase as any).rpc("mark_sa_fill_token_used", { _token: token });
    }
    setCompleted(true);
  };

  const zeigeFormular = status === "ready" && !!tokenData && !completed;

  /*
   * Zwei Ansichten, ein Rahmen.
   *
   * Steht das Formular, ist die Seite dreispaltig und genau so hoch wie das
   * Fenster (`xl:h-[100dvh]` plus `xl:overflow-hidden`), damit die Knopfleiste
   * unten stehen bleibt und nur der Karteninhalt scrollt. Das ist dieselbe
   * Hoehenkette wie in der CRM-Fassung: `h-full` haette sich auf den
   * Elternbereich bezogen, und der ist nur so hoch wie sein Inhalt.
   *
   * Die Statusmeldungen (Ladehinweis, Link abgelaufen, bereits ausgefuellt,
   * Danke) behalten ihre eigene schmale, mittige Darstellung. Sie sind kein
   * Formular und brauchen weder Spalten noch eine feste Hoehe.
   *
   * Unter 1280 Pixeln faellt alles uebereinander und die Seite scrollt wie
   * gewohnt am Stueck. Nur deshalb sind `min-h-0` und `flex-1` an den Spalten
   * auf `xl:` beschraenkt: Ohne feste Hoehe wuerde `min-h-0` die Mitte
   * zusammenfallen lassen.
   *
   * Die Seitenspalten sind ab 1280 Pixeln schmal (280 und 300) und ab 1536
   * etwas breiter (300 und 320). Genau bei 1280 ist der Platz am knappsten,
   * dort zaehlt jede Spalte, die das Formular in der Mitte noch nebeneinander
   * unterbringt.
   */
  return (
    <div data-lg="seite" className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-muted/30 to-background xl:h-[100dvh] xl:overflow-hidden">
      {zeigeFormular ? (
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 xl:min-h-0 xl:flex-row xl:gap-6">
          {/* Linke Spalte: Logo, Begruessung, Datenschutz. Sie bleibt stehen,
              das wirkt auf grossen Bildschirmen ruhiger als mitlaufen. */}
          <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[280px] xl:overflow-y-auto 2xl:w-[300px]">
            <img src={logo} alt="OS Immobilien" className="h-12 self-center object-contain xl:self-start" />

            <Card className="border-primary/20 bg-primary/5 p-6">
              <h1 className="mb-2 text-xl font-bold">{t("Willkommen, {name}", { name: tokenData.name ?? "" })}</h1>
              <p className="text-sm text-muted-foreground">
                {t("Bitte füllen Sie die nachfolgende Selbstauskunft sorgfältig aus. Alle mit")} <span className="text-destructive">*</span> {t("markierten Felder sind Pflichtfelder. Am Ende können Sie Ihre Eingaben prüfen und digital unterschreiben.")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{t("⏱ Dauer: ca. 10–15 Min.")}</span>
                <span>{t("🔒 DSGVO-konform")}</span>
                <span>{t("💾 Zwischenspeichern möglich")}</span>
              </div>
            </Card>

            <Fusszeile className="mt-auto hidden xl:block" sprache={sprache} />
          </aside>

          {/* Mittlere Spalte: das Formular, die breiteste Spalte. Sie bekommt
              den ganzen Rest der Breite und die Hoehe des Fensters. */}
          <main className="flex w-full flex-col xl:min-h-0 xl:min-w-0 xl:flex-1">
            <SelbstauskunftForm
              kundeId={tokenData.kontakt_id}
              investmentId={tokenData.investment_id}
              prefillKontakt={tokenData.kontakt}
              prefillSaData={tokenData.prefillSaData}
              customerMode
              sprache={sprache}
              saToken={token}
              onComplete={handleComplete}
              onHinweisSchritt={setHinweisSchritt}
            />
          </main>

          {/* Rechte Spalte: die Hinweise zum offenen Abschnitt. */}
          <aside className="w-full shrink-0 xl:w-[300px] xl:overflow-y-auto 2xl:w-[320px]">
            <SelbstauskunftHinweise schritt={hinweisSchritt} sprache={sprache} />
          </aside>

          {/* Auf schmalen Bildschirmen steht die Fusszeile am Ende der Seite,
              nicht oben zwischen Begruessung und Formular. */}
          <Fusszeile className="xl:hidden" sprache={sprache} />
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 p-4 sm:p-6">
          <img src={logo} alt="OS Immobilien" className="h-14 object-contain" />

          {status === "loading" && (
            <Card className="flex w-full flex-col items-center gap-4 p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t("Wird geladen…")}</p>
            </Card>
          )}

          {status === "expired" && (
            <Card className="flex w-full flex-col items-center gap-4 p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <h2 className="text-lg font-bold">{t("Link abgelaufen")}</h2>
              <p className="text-sm text-muted-foreground">
                {handbuchWeg
                  ? t("Dieser Link ist nicht mehr gültig. Sie können die Selbstauskunft trotzdem ausfüllen, auch ohne persönlichen Link.")
                  : t("Dieser Link ist nicht mehr gültig. Ihr Berater kann Ihnen einen neuen Link senden, Ihre bisherigen Angaben bleiben erhalten.")}
              </p>
              {!handbuchWeg && (anforderung === "bereit" || anforderung === "sendet") && (
                <Button className="btn-brand" disabled={anforderung === "sendet"} onClick={neuenLinkAnfordern}>
                  {anforderung === "sendet" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("Neuen Link anfordern")}
                </Button>
              )}
              {anforderung === "angefordert" && (
                <p role="status" className="text-sm font-medium text-foreground">{t("Ihr Berater ist benachrichtigt und sendet Ihnen einen neuen Link.")}</p>
              )}
              {anforderung === "schon_angefordert" && (
                <p role="status" className="text-sm font-medium text-foreground">{t("Sie haben bereits einen neuen Link angefordert. Ihr Berater meldet sich bei Ihnen.")}</p>
              )}
              {(anforderung === "nicht_moeglich" || anforderung === "fehler") && (
                <p role="status" className="text-sm text-muted-foreground">{t("Die Anfrage konnte gerade nicht gesendet werden. Bitte wenden Sie sich direkt an Ihren Berater.")}</p>
              )}
              {handbuchWeg && (
                <a href={sprache === "en" ? "/handbuch/selbstauskunft?lang=en" : "/handbuch/selbstauskunft"} className="btn-brand inline-flex items-center rounded-md px-4 py-2 text-sm font-semibold no-underline">
                  {t("Selbstauskunft ausfüllen|Knopf offene Selbstauskunft")}
                </a>
              )}
            </Card>
          )}

          {status === "used" && (
            <Card className="flex w-full flex-col items-center gap-4 p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-[hsl(var(--success,142_76%_36%))]" />
              <h2 className="text-lg font-bold">{t("Bereits ausgefüllt")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("Diese Selbstauskunft wurde bereits ausgefüllt und eingereicht. Bei Fragen wenden Sie sich bitte an Ihren Berater.")}
              </p>
            </Card>
          )}

          {status === "weiter" && (
            <Card className="flex w-full flex-col items-center gap-4 p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t("Sie werden zu Ihrem aktuellen Link weitergeleitet…")}</p>
            </Card>
          )}

          {status === "fehler" && (
            <Card className="flex w-full flex-col items-center gap-4 p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <h2 className="text-lg font-bold">{t("Kurze Störung")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("Die Seite konnte gerade nicht geladen werden. Bitte versuchen Sie es in einem Moment erneut.")}
              </p>
              <Button className="btn-brand" onClick={() => setLadeVersuch((n) => n + 1)}>
                <RotateCw className="mr-2 h-4 w-4" />
                {t("Erneut versuchen")}
              </Button>
            </Card>
          )}

          {status === "widerrufen" && (
            <Card className="flex w-full flex-col items-center gap-4 p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <h2 className="text-lg font-bold">{t("Link nicht mehr gültig")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("Dieser Link wurde durch einen neueren ersetzt. Bitte nutzen Sie den Link aus Ihrer neuesten E-Mail von OS Immobilien oder wenden Sie sich an Ihren Berater.")}
              </p>
            </Card>
          )}

          {status === "person2" && (
            <Card className="flex w-full flex-col items-center gap-4 p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-primary" />
              <h2 className="text-lg font-bold">{t("Gemeinsame Selbstauskunft")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("Bitte füllen Sie die Selbstauskunft gemeinsam über den Link von Person 1 aus.")}
              </p>
            </Card>
          )}

          {status === "unbekannt" && (
            <Card className="flex w-full flex-col items-center gap-4 p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <h2 className="text-lg font-bold">{t("Link nicht bekannt")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("Dieser Link ist nicht bekannt. Bitte nutzen Sie den Link aus Ihrer neuesten E-Mail von OS Immobilien oder wenden Sie sich an Ihren Berater.")}
              </p>
              {handbuchWeg && (
                <a href={sprache === "en" ? "/handbuch/selbstauskunft?lang=en" : "/handbuch/selbstauskunft"} className="btn-brand inline-flex items-center rounded-md px-4 py-2 text-sm font-semibold no-underline">
                  {t("Selbstauskunft ohne persönlichen Link ausfüllen")}
                </a>
              )}
            </Card>
          )}

          {completed && (
            <Card className="flex w-full flex-col items-center gap-4 p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-[hsl(var(--success,142_76%_36%))]" />
              <h2 className="text-xl font-bold">{t("Vielen Dank!")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("Ihre Selbstauskunft wurde erfolgreich eingereicht und digital unterschrieben. Ihr persönlicher Berater meldet sich zeitnah bei Ihnen mit den weiteren Schritten und schaltet im Anschluss Ihr persönliches Kundenportal frei.")}
              </p>
              <p className="text-xs text-muted-foreground">{t("Sie können dieses Fenster jetzt schließen.")}</p>
            </Card>
          )}

          <Fusszeile className="mt-auto w-full text-center" sprache={sprache} />
        </div>
      )}
    </div>
  );
}
