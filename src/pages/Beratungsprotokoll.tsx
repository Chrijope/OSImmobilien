import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileText, Loader2, Lock, Send, Smartphone } from "lucide-react";
import { LivePdfVorschau } from "@/components/pdf/LivePdfVorschau";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { KundenspracheHinweis } from "@/components/kunden/KundenspracheHinweis";
import { useUser } from "@/contexts/UserContext";
import { useCacheReady } from "@/hooks/useCacheReady";
import { supabase } from "@/integrations/supabase/client";
import { aftersalesSignaturAnlegen, aftersalesVpUnterschreiben } from "@/lib/aftersalesSignatur";
import {
  ENTWURF_SCHLUESSEL, entwurfErgaenzen, feldSetzen, heuteIso, istBeratungsprotokoll, offenePflichtfelder,
  protokollStatus, TEXTE, vorbelegen, type BeratungsprotokollDaten, type Feld,
} from "@/lib/beratungsprotokoll";
import { erzeugeBeratungsprotokollPdf, type ProtokollUnterschrift } from "@/lib/beratungsprotokollPdf";
import { crmQuellen } from "@/lib/beratungsprotokollQuellen";
import { getInvestmentById, getInvestmentMetaField, investmentGespeichert, setInvestmentMetaFields } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import { stelleKundenspracheSicher, useKundenSprache } from "@/lib/kundenSprache";

/*
 * Beratungs- und Qualitätsprotokoll als eigene Seite (17.10.2026), ersetzt
 * das Popup „Aftersales-Beratungsdokument“. Links das Formular, rechts das
 * PDF, das bei jeder Eingabe neu gezeichnet wird. Auf dem Handy schaltet ein
 * Umschalter zwischen beiden um.
 *
 * Die Adresse hängt unter /kunden/:id, damit genau die Rollen sie öffnen
 * dürfen, die auch das Kundenprofil sehen. Versand und Unterschrift laufen
 * wie bisher: `aftersales_signatur_anlegen` prüft serverseitig, ob der Kunde
 * zum Nutzer gehört, der Partner unterschreibt per QR-Code, danach
 * verschickt `finalize-aftersales-beratung` den Link an den Kunden.
 */

// Mieter fehlt bewusst: Nicht jede Rolle liest sie, die Seite soll trotzdem öffnen.
const TABELLEN = ["kontakte", "investments", "objekte", "wohnungen"];

export default function Beratungsprotokoll() {
  const { id = "", investmentId = "" } = useParams();
  const bereit = useCacheReady(TABELLEN);
  if (!bereit) return <div className="p-6 text-sm text-muted-foreground">Lädt …</div>;
  return <BeratungsprotokollInhalt kontaktId={id} investmentId={investmentId} />;
}

type Phase = "form" | "vp-sign" | "sending" | "sent";

export function BeratungsprotokollInhalt({ kontaktId, investmentId, vorschau = false }: { kontaktId: string; investmentId: string; vorschau?: boolean }) {
  const { user } = useUser();
  const inv = getInvestmentById(investmentId);
  const kunde = getKontaktById(kontaktId);
  const ab = ((inv?.meta as Record<string, any> | undefined)?.aftersalesBeratung || {}) as Record<string, any>;
  const status = protokollStatus(ab, inv?.notarTermin, heuteIso());
  const unterschrieben = status === "wartet_auf_kunde" || status === "abgeschlossen";
  const kundeName = [kunde?.vorname, kunde?.nachname].filter(Boolean).join(" ").trim();

  const [daten, setDaten] = useState<BeratungsprotokollDaten>(() =>
    unterschrieben && istBeratungsprotokoll(ab.formData)
      ? ab.formData
      : entwurfErgaenzen(
          getInvestmentMetaField<Partial<BeratungsprotokollDaten> | null>(investmentId, ENTWURF_SCHLUESSEL, null),
          vorbelegen(crmQuellen(kontaktId, investmentId, user.name)),
        ),
  );
  const nurLesen = unterschrieben;
  const setze = <F extends Feld>(feld: F, wert: BeratungsprotokollDaten[F]) => setDaten((d) => feldSetzen(d, feld, wert));
  const offen = useMemo(() => offenePflichtfelder(daten), [daten]);
  // Das PDF in der Sprache des Kunden (Profil), solange nichts versendet ist.
  const { sprache: profilSprache } = useKundenSprache(kontaktId);
  const pdfDaten = useMemo(() => (nurLesen ? daten : { ...daten, sprache: profilSprache }), [daten, nurLesen, profilSprache]);

  // Entwurf speichern, kurz nach der letzten Eingabe. Der Store schreibt
  // entprellt über merge_investment_meta, nichts geht beim Verlassen verloren.
  const [gespeichert, setGespeichert] = useState(true);
  const ersterLauf = useRef(true);
  useEffect(() => {
    if (ersterLauf.current) { ersterLauf.current = false; return; }
    if (nurLesen || vorschau) return;
    setGespeichert(false);
    const timer = setTimeout(() => {
      setInvestmentMetaFields(investmentId, { [ENTWURF_SCHLUESSEL]: daten });
      setGespeichert(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [daten, investmentId, nurLesen, vorschau]);

  const unterschriften = useMemo(() => {
    const sig = (name?: string, data?: string, am?: string): ProtokollUnterschrift | undefined =>
      data ? { name: name || "", signatureData: data, signedAt: am || new Date().toISOString() } : undefined;
    // Seit 17.10.2026 unterschreiben bis zu zwei Käufer, je eine Anfrage.
    const kaeufer = Object.values((ab.kundeUnterschriften || {}) as Record<string, { name?: string; signature?: string; signedAt?: string; person?: string }>);
    const k1 = kaeufer.find((u) => u.person !== "kunde2");
    const k2 = kaeufer.find((u) => u.person === "kunde2");
    return {
      vp: sig(ab.vpSignerName, ab.vpSignature, ab.vpSignedAt),
      kunde: k1 ? sig(k1.name, k1.signature, k1.signedAt) : sig(ab.kundeSignerName, ab.kundeSignature, ab.kundeSignedAt),
      kunde2: k2 ? sig(k2.name, k2.signature, k2.signedAt) : undefined,
    };
  }, [ab.vpSignerName, ab.vpSignature, ab.vpSignedAt, ab.kundeSignerName, ab.kundeSignature, ab.kundeSignedAt, ab.kundeUnterschriften]);
  // ── Unterschrift des Partners und Versand, wie bisher im Popup ──
  const [phase, setPhase] = useState<Phase>("form");
  const [token, setToken] = useState<string | null>(null);
  const [vpSignatur, setVpSignatur] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const qrUrl = token ? `${window.location.origin}/signatur?token=${token}&type=aftersales_vp&mobile=1` : "";

  const signaturEmpfangen = useCallback((dataUrl: string) => {
    setVpSignatur(dataUrl);
    toast.success("Unterschrift vom Smartphone empfangen");
  }, []);
  useEffect(() => {
    if (!token || phase !== "vp-sign") return;
    const ch = supabase.channel(`sig-${token}`)
      .on("broadcast", { event: "signature" }, (payload) => {
        const dataUrl = (payload as any)?.payload?.dataUrl;
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) signaturEmpfangen(dataUrl);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [token, phase, signaturEmpfangen]);

  const zurUnterschrift = async () => {
    if (offen.length) { toast.error(`Bitte noch ausfüllen: ${offen.join(", ")}`); return; }
    setLaeuft(true);
    try {
      // Rückfrage „Deutsch oder English?“, falls noch nie gewählt. Die Antwort
      // ist die Sprache des Protokolls, wie bei der Reservierung.
      const sprache = await stelleKundenspracheSicher(kontaktId);
      const formular = { ...daten, sprache };
      setDaten(formular);
      setInvestmentMetaFields(investmentId, { [ENTWURF_SCHLUESSEL]: formular });
      await investmentGespeichert(investmentId);
      const vpToken = await aftersalesSignaturAnlegen({
        investmentId, kontaktId, vpName: user.name, kundeName, kundeEmail: kunde?.email, formular: formular as unknown as Record<string, unknown>,
      });
      setToken(vpToken);
      setPhase("vp-sign");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error && e.message ? e.message : "Die Unterschrift konnte nicht vorbereitet werden.");
    } finally {
      setLaeuft(false);
    }
  };

  const unterschreibenUndSenden = async () => {
    if (!vpSignatur || !token) return;
    setLaeuft(true);
    setPhase("sending");
    try {
      await aftersalesVpUnterschreiben(token, vpSignatur);
      const { error } = await supabase.functions.invoke("finalize-aftersales-beratung", {
        body: { investmentId, kontaktId, phase: "vp", signatureToken: token, formData: daten, signature: vpSignatur, signerName: user.name },
      });
      if (error) throw error;
      setPhase("sent");
      toast.success(`Beratungsprotokoll an ${kundeName || "den Kunden"} gesendet`);
    } catch (e) {
      console.error(e);
      toast.error("Versand fehlgeschlagen. Bitte erneut versuchen.");
      setPhase("vp-sign");
    } finally {
      setLaeuft(false);
    }
  };

  // ── Handy: Formular oder Vorschau ──
  const [ansicht, setAnsicht] = useState<"formular" | "vorschau">("formular");

  if (!inv) {
    return <div className="p-6 text-sm text-muted-foreground">Dieses Investment wurde nicht gefunden.</div>;
  }

  const zurueck = vorschau ? "#" : `/kunden/${kontaktId}?tab=inv-${investmentId}`;
  const aus = new Set(daten.vorausgefuellt ?? []);
  const sendenGesperrt = status === "gesperrt";

  return (
    <div className="p-3 sm:p-6 space-y-4" data-lg="seite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {!vorschau && (
            <Link to={zurueck} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Zurück zum Kundenprofil
            </Link>
          )}
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><FileText className="h-5 w-5 sm:h-6 sm:w-6" /> {TEXTE.titel}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {kundeName}{inv.objektTitel ? `, ${inv.objektTitel}` : ""}{inv.weNr ? `, WE ${inv.weNr}` : ""}
          </p>
        </div>
        <div className="text-xs text-muted-foreground self-end">
          {nurLesen ? <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Unterschrieben, nur noch lesbar</span>
            : vorschau ? "Vorschau, wird nicht gespeichert"
            : gespeichert ? "Entwurf gespeichert" : "Speichert …"}
        </div>
      </div>

      {/* Umschalter nur auf schmalen Bildschirmen */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:hidden" role="tablist">
        {(["formular", "vorschau"] as const).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={ansicht === a}
            onClick={() => setAnsicht(a)}
            className={`rounded-md py-1.5 text-sm font-medium ${ansicht === a ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {a === "formular" ? "Formular" : "PDF-Vorschau"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className={`min-w-0 space-y-4 ${ansicht === "formular" ? "" : "hidden lg:block"}`}>
          {!nurLesen && aus.size > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500/30 border border-sky-500/50 mr-1.5 align-middle" />
              Aus dem CRM vorausgefüllt, bitte prüfen. Alle Felder bleiben änderbar.
            </p>
          )}

          <fieldset disabled={nurLesen || phase !== "form"} className="space-y-4">
            <Block titel={TEXTE.a1}>
              <Text feld="kaeuferName" label={TEXTE.a1Zeilen.kaeuferName} daten={daten} setze={setze} aus={aus} pflicht />
              <Text feld="kaeuferAnschrift" label={TEXTE.a1Zeilen.kaeuferAnschrift} daten={daten} setze={setze} aus={aus} pflicht />
              <Text feld="weitereKaeufer" label={TEXTE.a1Zeilen.weitereKaeufer} daten={daten} setze={setze} aus={aus} />
              {daten.weitereKaeufer.trim() && (
                <Text feld="kaeufer2Email" label="E-Mail des weiteren Käufers (bekommt einen eigenen Unterschriftslink)" daten={daten} setze={setze} aus={aus} pflicht />
              )}
            </Block>

            <Block titel={TEXTE.a2}>
              <Text feld="objektAdresse" label={TEXTE.a2Zeilen.objektAdresse} daten={daten} setze={setze} aus={aus} pflicht />
              <div className="grid sm:grid-cols-2 gap-3">
                <Text feld="objektLage" label={TEXTE.a2Zeilen.objektLage} daten={daten} setze={setze} aus={aus} platzhalter="z. B. 2. OG, links" />
                <Text feld="einheitNr" label={TEXTE.a2Zeilen.einheitNr} daten={daten} setze={setze} aus={aus} pflicht />
                <Text feld="groesse" label={TEXTE.a2Zeilen.groesse} daten={daten} setze={setze} aus={aus} />
                <Text feld="verkaufspreis" label={TEXTE.a2Zeilen.verkaufspreis} daten={daten} setze={setze} aus={aus} pflicht />
              </div>
              <Text feld="stellplatz" label={TEXTE.a2Zeilen.stellplatz} daten={daten} setze={setze} aus={aus} />
            </Block>

            <Block titel={TEXTE.a4}>
              <Wahl
                feld="nutzung" daten={daten} setze={setze} pflicht label="Die Immobilie wird erworben zur"
                optionen={[["eigennutzung", "Eigennutzung"], ["vermietung", "Vermietung"]]}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <Text feld="besichtigtGeschoss" label="Besichtigte Wohnung im Geschoss" daten={daten} setze={setze} aus={aus} platzhalter="z. B. 2." />
                <Wahl
                  feld="besichtigtLage" daten={daten} setze={setze} label="Lage der besichtigten Wohnung"
                  optionen={[["links", "links"], ["mitte", "mitte"], ["rechts", "rechts"]]}
                />
              </div>
            </Block>

            <Block titel={TEXTE.a5}>
              <Wahl
                feld="besichtigung" daten={daten} setze={setze} pflicht label="Zutreffende Variante" untereinander
                optionen={[
                  ["selbst", "Käufer hat die Kaufsache selbst besichtigt"],
                  ["beauftragt_zugeschaltet", "Beauftragte/r hat besichtigt, Käufer war in Bild und Ton zugeschaltet"],
                  ["beauftragt", "Beauftragte/r hat besichtigt"],
                  ["nicht_wahrgenommen", "Besichtigung nicht wahrgenommen"],
                ]}
              />
              {(daten.besichtigung === "beauftragt" || daten.besichtigung === "beauftragt_zugeschaltet") && (
                <Text feld="beauftragter" label="Name der/des Beauftragten" daten={daten} setze={setze} aus={aus} pflicht />
              )}
            </Block>

            <Block titel={TEXTE.a6}>
              <div className="grid sm:grid-cols-2 gap-3">
                <Text feld="kaufangebot" label={TEXTE.a6Zeilen.kaufangebot} daten={daten} setze={setze} aus={aus} pflicht />
                <Text feld="vertriebDurch" label={TEXTE.a6Zeilen.vertriebDurch} daten={daten} setze={setze} aus={aus} pflicht />
              </div>
            </Block>

            <Block titel={TEXTE.a10}>
              <Wahl
                feld="mietverhaeltnis" daten={daten} setze={setze} pflicht label="Die Wohnung ist" aus={aus}
                optionen={[["leer", "leerstehend"], ["vermietet", "vermietet"]]}
              />
              {daten.mietverhaeltnis === "vermietet" && (
                <Text feld="nettokaltmiete" label="Derzeitige Nettokaltmiete (EUR)" daten={daten} setze={setze} aus={aus} pflicht />
              )}
            </Block>

            <Block titel={TEXTE.a11}>
              <Text feld="unterlagenUebergebenAm" label="Unterlagen übergeben am" typ="date" daten={daten} setze={setze} aus={aus} />
            </Block>

            <Block titel={TEXTE.a16}>
              <div className="grid sm:grid-cols-2 gap-3">
                <Text feld="erstkontaktDurch" label={TEXTE.a16Zeilen.erstkontaktDurch} daten={daten} setze={setze} aus={aus} />
                <Text feld="erstgespraechVon" label={TEXTE.a16Zeilen.erstgespraechVon} daten={daten} setze={setze} aus={aus} />
                <Text feld="erstgespraechOrt" label="Ort des Erstgesprächs" daten={daten} setze={setze} aus={aus} platzhalter="z. B. Videocall" />
                <Text feld="erstgespraechDatum" label="Datum des Erstgesprächs" typ="date" daten={daten} setze={setze} aus={aus} />
              </div>
              <Text feld="unterlagenPapierAm" label={TEXTE.a16Zeilen.unterlagenPapierAm} typ="date" daten={daten} setze={setze} aus={aus} />
            </Block>

            <Block titel="Ort und Datum der Unterzeichnung">
              <div className="grid sm:grid-cols-2 gap-3">
                <Text feld="ort" label="Ort" daten={daten} setze={setze} aus={aus} pflicht platzhalter="z. B. Berlin" />
                <Text feld="datum" label="Datum" typ="date" daten={daten} setze={setze} aus={aus} pflicht />
              </div>
              <p className="text-[11px] text-muted-foreground">Steht im PDF bei jeder Bestätigung des Käufers.</p>
            </Block>
          </fieldset>

          {!nurLesen && !vorschau && (
            <Card className="p-4 space-y-3">
              {phase === "form" && (
                <>
                  {offen.length > 0 && <p className="text-xs text-muted-foreground">Noch offen: {offen.join(", ")}</p>}
                  {sendenGesperrt && <p className="text-xs text-muted-foreground"><Lock className="inline h-3.5 w-3.5 mr-1" />Unterschrift und Versand sind ab dem Tag des Notartermins möglich. Bis dahin kannst du alles vorbereiten.</p>}
                  <Button variant="brand" disabled={laeuft || offen.length > 0 || sendenGesperrt} onClick={zurUnterschrift}>
                    {laeuft && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Weiter zur Unterschrift
                  </Button>
                </>
              )}
              {phase === "vp-sign" && (
                <div className="flex flex-col items-center text-center gap-3">
                  <p className="font-semibold flex items-center gap-2"><Smartphone className="h-5 w-5" /> Per Smartphone unterschreiben</p>
                  {qrUrl && <div className="p-3 bg-white rounded border"><QRCodeSVG value={qrUrl} size={180} /></div>}
                  <p className="text-sm text-muted-foreground max-w-sm">Scanne den QR-Code und unterschreibe auf dem Smartphone. Die Unterschrift erscheint hier automatisch.</p>
                  {vpSignatur && (
                    <div className="w-full max-w-sm border rounded bg-white p-2"><img src={vpSignatur} alt="Unterschrift" className="max-h-28 mx-auto object-contain" /></div>
                  )}
                  <div className="flex flex-wrap justify-center items-center gap-2">
                    <Button variant="ghost" onClick={() => { setPhase("form"); setVpSignatur(null); }}>Zurück</Button>
                    {vpSignatur && <Button variant="ghost" onClick={() => setVpSignatur(null)}>Neu unterschreiben</Button>}
                    <KundenspracheHinweis kontaktId={kontaktId} />
                    <Button variant="brand" disabled={!vpSignatur || laeuft} onClick={unterschreibenUndSenden}>
                      <Send className="h-4 w-4 mr-2" /> Unterzeichnen und an Kunden senden
                    </Button>
                  </div>
                </div>
              )}
              {phase === "sending" && <p className="text-sm flex items-center"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Wird versendet …</p>}
              {phase === "sent" && (
                <div className="text-center space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
                  <p className="font-medium">Versendet</p>
                  <p className="text-sm text-muted-foreground">{daten.weitereKaeufer.trim() ? "Beide Käufer bekommen" : `${kundeName || "Der Kunde"} bekommt`} jetzt eine E-Mail mit dem Link zur Unterschrift. Sobald alle unterschrieben haben, liegt das PDF im Investment.</p>
                  <Button variant="outline" asChild><Link to={zurueck}>Zurück zum Kundenprofil</Link></Button>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className={`min-w-0 lg:sticky lg:top-0 ${ansicht === "vorschau" ? "" : "hidden lg:block"}`}>
          <LivePdfVorschau erzeuge={() => erzeugeBeratungsprotokollPdf(pdfDaten, unterschriften)} schluessel={JSON.stringify(pdfDaten) + (unterschriften.kunde ? "k" : "") + (unterschriften.kunde2 ? "2" : "") + (unterschriften.vp ? "v" : "")} />
        </div>
      </div>
    </div>
  );
}

/* ── Kleine Formularbausteine ─────────────────────────────────── */

type Setze = <F extends Feld>(feld: F, wert: BeratungsprotokollDaten[F]) => void;

function Block({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-semibold">{titel}</h2>
      {children}
    </Card>
  );
}

function Text({ feld, label, daten, setze, aus, pflicht, typ = "text", platzhalter }: {
  feld: Feld; label: string; daten: BeratungsprotokollDaten; setze: Setze; aus: Set<string>;
  pflicht?: boolean; typ?: "text" | "date"; platzhalter?: string;
}) {
  const id = `bp-${feld}`;
  const vorausgefuellt = aus.has(feld);
  return (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={id} className="text-xs">
        {label}{pflicht && <span className="text-destructive"> *</span>}
        {vorausgefuellt && <span className="ml-1.5 text-[10px] font-normal text-sky-700 dark:text-sky-300">aus dem CRM</span>}
      </Label>
      <Input
        id={id}
        type={typ}
        value={String(daten[feld] ?? "")}
        placeholder={platzhalter}
        onChange={(e) => setze(feld, e.target.value as never)}
        className={vorausgefuellt ? "bg-sky-500/10 border-sky-500/40" : ""}
      />
    </div>
  );
}

function Wahl({ feld, label, optionen, daten, setze, pflicht, untereinander, aus }: {
  feld: Feld; label: string; optionen: Array<[string, string]>; daten: BeratungsprotokollDaten; setze: Setze;
  pflicht?: boolean; untereinander?: boolean; aus?: Set<string>;
}) {
  const vorausgefuellt = !!aus?.has(feld);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}{pflicht && <span className="text-destructive"> *</span>}
        {vorausgefuellt && <span className="ml-1.5 text-[10px] font-normal text-sky-700 dark:text-sky-300">aus dem CRM</span>}
      </Label>
      <RadioGroup
        value={String(daten[feld] ?? "")}
        onValueChange={(v) => setze(feld, v as never)}
        className={untereinander ? "grid gap-2" : "flex flex-wrap gap-x-4 gap-y-2"}
      >
        {optionen.map(([wert, text]) => (
          <label key={wert} className="flex items-start gap-2 text-sm cursor-pointer leading-snug">
            <RadioGroupItem value={wert} className="mt-0.5" /> {text}
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
