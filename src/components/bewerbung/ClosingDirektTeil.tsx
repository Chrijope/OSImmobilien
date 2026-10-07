/**
 * Teil 2 des Erstgesprächs: „Closing direkt anschließen".
 *
 * Rendert die Gesprächsabschnitte aus closingDirektSkript.ts (Folie für Folie
 * entlang der Closing-Präsentation) mit Abhak-Kästchen, Sprechtexten und
 * kontextbezogenen Notizfeldern.
 *
 * Datenhaltung ohne Doppelung:
 * - Reine Gesprächsnotizen und der Abhak-Stand gehen über onDatenChange ins
 *   Skript-Meta (erstgespraechSkript.closingDirekt), das Autosave des
 *   Erstgesprächs-Tabs speichert sie mit.
 * - Entscheidung, Paketwahl, Zahlungsweise, Vertragsanschrift,
 *   Rechnungsadresse und andere Vertriebe schreibt die Komponente über
 *   updateBewerber in EXAKT dieselben Bewerber-Felder wie der ClosingTab.
 *   Was hier erfasst wird, steht sofort im Reiter Closing und umgekehrt.
 * - Der Vertrag wird weiterhin ausschließlich im Reiter Closing erzeugt,
 *   hier steht nur der Hinweis darauf.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DateInput } from "@/components/ui/date-input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ThumbsUp, XCircle, Clock, CheckCircle2, ArrowRight, Sparkles, Target,
  PhoneCall, ExternalLink, Mail, CalendarClock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { updateBewerber, changeBewerberStatus, type Bewerber } from "@/lib/bewerbungStore";
import { fuellePlatzhalter } from "@/lib/assessmentSkript";
import { sendeStartfahrplan } from "@/lib/startfahrplanVersand";
import {
  CLOSING_DIREKT_ABSCHNITTE, DIREKT_PAKETE, LEAD_QUALIFIZIERUNG_BUCHUNGSLINK,
  closingDirektStatusSprung, followUpStatusZiel, passendeAbschlussVarianten,
  type ClosingDirektAbschnitt, type ClosingDirektDaten, type ClosingDirektFeld, type ClosingDirektNotizen,
} from "@/lib/closingDirektSkript";
import { formatPreis, ZAHLUNGSWEISEN, type LizenzPaketId, type Zahlungsweise } from "@/lib/lizenzPakete";
import { RegieHinweis, Script } from "@/components/bewerbung/erstgespraechBausteine";

const PAKET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  junior: Sparkles,
  lead_berater: Target,
};

/**
 * Zerlegt einen mehrzeiligen Adress-String in seine Bestandteile. Gleiche
 * Auslegung wie parseRA im ClosingTab und im Abschlussformular der
 * Präsentation, damit alle drei Stellen denselben String gleich lesen.
 */
function parseAdresse(raw: string) {
  const zeilen = (raw || "").split(/\r?\n/).map((z) => z.trim());
  const plzOrt = (zeilen[2] || "").match(/^(\d{4,5})\s+(.+)$/);
  const ust = (zeilen[3] || "").replace(/^USt-?IdNr\.?:?\s*/i, "");
  return {
    name: zeilen[0] || "",
    strasse: zeilen[1] || "",
    plz: plzOrt ? plzOrt[1] : "",
    ort: plzOrt ? plzOrt[2] : zeilen[2] || "",
    ust,
  };
}

/** Baut den Adress-String im Format des ClosingTabs zusammen. */
function baueAdresse(name: string, strasse: string, plz: string, ort: string, ust?: string): string {
  return [
    name.trim(),
    strasse.trim(),
    [plz.trim(), ort.trim()].filter(Boolean).join(" "),
    ust?.trim() ? `USt-IdNr.: ${ust.trim()}` : "",
  ].filter(Boolean).join("\n");
}

export const ClosingDirektTeil = ({
  bewerber: b,
  canEdit,
  daten,
  onDatenChange,
  onRefresh,
  folieId,
  abschnittKey,
}: {
  bewerber: Bewerber;
  canEdit: boolean;
  daten: ClosingDirektDaten;
  onDatenChange: (patch: Partial<ClosingDirektDaten>) => void;
  onRefresh: () => void;
  /**
   * Nur die Abschnitte zu dieser Folie zeigen (Moderationsansicht, Folie
   * für Folie). Ohne Angabe alle 16 Abschnitte.
   */
  folieId?: string;
  /**
   * Nur diesen einen Abschnitt zeigen, und zwar ohne eigenen Rahmen und
   * Kopf (Reiter Erstgespräch, Schritt für Schritt): Titel, Folie und das
   * Abhak-Kästchen stehen dort in der Stationskarte. Derselbe Mechanismus
   * wie der Folienfilter, nur eine Stufe feiner.
   */
  abschnittKey?: string;
}) => {
  const notizen = daten.notizen ?? {};
  const abgehakt = daten.abgehakt ?? [];

  // ── Bewerber-Felder (dieselben wie im ClosingTab) ──
  const [entscheidung, setEntscheidung] = useState<"" | "ja" | "nein" | "bedenkzeit">(b.closingEntscheidung || "");
  const [paket, setPaket] = useState<LizenzPaketId | "">((b.paketwahl as LizenzPaketId) || "");
  const [zw, setZw] = useState<Zahlungsweise>((b.zahlungsweise as Zahlungsweise) || "einmal");
  const [bedenkzeitDatum, setBedenkzeitDatum] = useState(b.bedenkzeitRueckrufAm || "");
  const [bedenkzeitGrund, setBedenkzeitGrund] = useState(b.bedenkzeitGrund || "");
  const [abgelehntGrund, setAbgelehntGrund] = useState(b.closingAbgelehntGrund || "");

  // ── Unterlagen-Weiche: Follow-up (dieselben Felder wie die FollowUpCard) ──
  const [fuDatum, setFuDatum] = useState(b.followUpDatum || "");
  const [fuUhrzeit, setFuUhrzeit] = useState(b.followUpUhrzeit || "");
  const [fuNotiz, setFuNotiz] = useState(b.followUpNotiz || "");
  const [sendetFahrplan, setSendetFahrplan] = useState(false);

  const va = parseAdresse(b.vertragsAdresse || "");
  const ra = parseAdresse(b.rechnungsAdresse || "");
  const [vaName, setVaName] = useState(va.name || [b.vorname, b.nachname].filter(Boolean).join(" "));
  const [vaStrasse, setVaStrasse] = useState(va.strasse || "");
  const [vaPlz, setVaPlz] = useState(va.plz);
  const [vaOrt, setVaOrt] = useState(va.ort || b.ort || "");
  // Der Regelfall ist eine Adresse, deshalb ist der Haken gesetzt. Wer über
  // eine Firma abrechnet, nimmt ihn weg (gleiche Logik wie im
  // Abschlussformular der Präsentation).
  const [identisch, setIdentisch] = useState(
    !(Boolean(b.rechnungsAdresse?.trim()) && b.rechnungsAdresse !== b.vertragsAdresse),
  );
  const [raName, setRaName] = useState(ra.name);
  const [raStrasse, setRaStrasse] = useState(ra.strasse);
  const [raPlz, setRaPlz] = useState(ra.plz);
  const [raOrt, setRaOrt] = useState(ra.ort);
  const [raUst, setRaUst] = useState(ra.ust);
  // Standard ist die exklusive Zusammenarbeit; erst das Umlegen des Schalters
  // öffnet das Eingabefeld. Sind im Profil schon andere Vertriebe hinterlegt
  // (Reiter Closing, Abschlussformular der Präsentation), steht der Schalter
  // hier auf "nicht exklusiv", sonst zeigte die HR-Managerin etwas anderes
  // als der Reiter Closing. Nur das Abschlussformular, das der Bewerber
  // sieht, startet bewusst immer exklusiv.
  const [exklusiv, setExklusiv] = useState(!(b.andereVertriebe || "").trim());
  const [vertriebe, setVertriebe] = useState(b.andereVertriebe || "");

  // Nachträge aus anderen Stellen (Reiter Closing, Präsentation) nachziehen.
  useEffect(() => { setEntscheidung(b.closingEntscheidung || ""); }, [b.closingEntscheidung]);
  useEffect(() => { setPaket((b.paketwahl as LizenzPaketId) || ""); }, [b.paketwahl]);
  useEffect(() => { setZw((b.zahlungsweise as Zahlungsweise) || "einmal"); }, [b.zahlungsweise]);
  useEffect(() => {
    setVertriebe(b.andereVertriebe || "");
    setExklusiv(!(b.andereVertriebe || "").trim());
  }, [b.andereVertriebe]);
  useEffect(() => {
    setFuDatum(b.followUpDatum || "");
    setFuUhrzeit(b.followUpUhrzeit || "");
    setFuNotiz(b.followUpNotiz || "");
  }, [b.followUpDatum, b.followUpUhrzeit, b.followUpNotiz]);
  useEffect(() => {
    const p = parseAdresse(b.vertragsAdresse || "");
    if (p.name) setVaName(p.name);
    if (p.strasse) setVaStrasse(p.strasse);
    if (p.plz) setVaPlz(p.plz);
    if (p.ort) setVaOrt(p.ort);
  }, [b.vertragsAdresse]);
  useEffect(() => {
    const p = parseAdresse(b.rechnungsAdresse || "");
    if (p.name) setRaName(p.name);
    if (p.strasse) setRaStrasse(p.strasse);
    if (p.plz) setRaPlz(p.plz);
    if (p.ort) setRaOrt(p.ort);
    if (p.ust) setRaUst(p.ust);
  }, [b.rechnungsAdresse]);

  const setNotiz = (key: keyof ClosingDirektNotizen, wert: string) =>
    onDatenChange({ notizen: { ...notizen, [key]: wert } });

  const toggleAbgehakt = (key: string, an: boolean) =>
    onDatenChange({ abgehakt: an ? [...abgehakt.filter((k) => k !== key), key] : abgehakt.filter((k) => k !== key) });

  /** Führt bei Ja plus Paket den Sprung auf die Stufe Paketwahl aus. */
  const pruefeStatusSprung = (neueEntscheidung: string, neuesPaket: string) => {
    const ziel = closingDirektStatusSprung(b.status, neueEntscheidung, neuesPaket);
    if (!ziel) return;
    changeBewerberStatus(b.id, ziel);
    toast({
      title: "Closing direkt abgeschlossen",
      description: "Status springt auf Paketwahl. Der Vertrag wird im Reiter Closing erzeugt.",
    });
  };

  const waehleEntscheidung = (wert: "ja" | "nein" | "bedenkzeit") => {
    setEntscheidung(wert);
    updateBewerber(b.id, { closingEntscheidung: wert });
    pruefeStatusSprung(wert, paket);
    onRefresh();
  };

  const waehlePaket = (id: LizenzPaketId) => {
    setPaket(id);
    updateBewerber(b.id, { paketwahl: id, zahlungsweise: zw });
    pruefeStatusSprung(entscheidung, id);
    onRefresh();
  };

  const waehleZahlungsweise = (id: Zahlungsweise) => {
    setZw(id);
    updateBewerber(b.id, { zahlungsweise: id });
    onRefresh();
  };

  /** Speichert beide Adressen in dieselben Felder wie der ClosingTab. */
  const speichereAdressen = () => {
    const vertragsAdresse = baueAdresse(vaName, vaStrasse, vaPlz, vaOrt);
    const rechnungsAdresse = identisch
      ? vertragsAdresse
      : baueAdresse(raName, raStrasse, raPlz, raOrt, raUst);
    updateBewerber(b.id, { vertragsAdresse, rechnungsAdresse });
    onRefresh();
  };

  const speichereBedenkzeit = () => {
    if (!bedenkzeitDatum.trim()) {
      toast({
        title: "Bitte einen Rückruftermin setzen",
        description: "Eine Bedenkzeit ohne Termin ist ein verlorener Bewerber.",
        variant: "destructive",
      });
      return;
    }
    updateBewerber(b.id, {
      closingEntscheidung: "bedenkzeit",
      bedenkzeitRueckrufAm: bedenkzeitDatum.trim(),
      bedenkzeitGrund: bedenkzeitGrund.trim(),
    });
    changeBewerberStatus(b.id, "Bedenkzeit");
    toast({ title: "Auf Bedenkzeit gesetzt", description: `Rückruf am ${bedenkzeitDatum.trim()} vorgemerkt.` });
    onRefresh();
  };

  /** Unterlagen-Weiche: Startfahrplan über den gemeinsamen Versandweg senden. */
  const startfahrplanSenden = async () => {
    if (!b.email) {
      toast({ title: "Keine E-Mail hinterlegt", description: "Trag im Bewerberprofil eine E-Mail-Adresse ein.", variant: "destructive" });
      return;
    }
    setSendetFahrplan(true);
    try {
      // Die Fassung wählt sendeStartfahrplan selbst: Nach komplettem Teil 1
      // plus Teil 2 (auch über die Unterlagen-Weiche) ist es die erweiterte.
      const ergebnis = await sendeStartfahrplan(b, { paketId: paket || b.paketwahl || "" });
      toast({
        title: ergebnis?.fassung === "erweitert"
          ? "Startfahrplan (erweiterte Fassung) versendet"
          : "Startfahrplan versendet",
        description: `Die Zusammenfassung (PDF) wurde an ${b.email} geschickt.`,
      });
      onRefresh();
    } catch (e) {
      toast({
        title: "Versand fehlgeschlagen",
        description: e instanceof Error ? e.message : "Bitte erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setSendetFahrplan(false);
    }
  };

  /**
   * Unterlagen-Weiche: Follow-up in dieselben Felder wie die FollowUpCard
   * schreiben und den Status über den bestehenden Mechanismus auf Follow-Up
   * setzen. Der Termin erscheint damit in der Übersicht des Bewerberprofils
   * und am Fälligkeitstag in der Inbox.
   */
  const followUpPlanen = () => {
    if (!fuDatum.trim()) {
      toast({ title: "Bitte Follow-up-Datum angeben", variant: "destructive" });
      return;
    }
    updateBewerber(b.id, {
      followUpDatum: fuDatum.trim(),
      followUpUhrzeit: fuUhrzeit,
      followUpNotiz: fuNotiz.trim() || "Startfahrplan gesendet, ruft wegen der Entscheidung an.",
    });
    const ziel = followUpStatusZiel(b.status);
    if (ziel) changeBewerberStatus(b.id, ziel);
    toast({
      title: "Follow-up geplant",
      description: `Rückruf am ${fuDatum.trim()}${fuUhrzeit ? ` um ${fuUhrzeit} Uhr` : ""}. ${ziel ? "Status: Follow-Up." : ""}`,
    });
    onRefresh();
  };

  /**
   * Einblendung des Folge-Calls zu gestellten Leads bei Geschäftsführer
   * Christian Kurz. Bewusst hinter einem Knopf: Die HR-Managerin zeigt ihn
   * nur bei richtig starken Kandidaten, das ist reine Ermessenssache.
   */
  const renderQualiCall = () => (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold flex items-center gap-1.5">
          <PhoneCall className="h-4 w-4 text-amber-600" /> Folge-Call für gestellte Leads
        </div>
        <Button
          type="button" size="sm" variant="outline" disabled={!canEdit}
          onClick={() => onDatenChange({ qualiCallAngeboten: !daten.qualiCallAngeboten })}
        >
          {daten.qualiCallAngeboten ? "Einblendung ausblenden" : "Folge-Call anbieten"}
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Reine Ermessenssache, nur bei richtig starken Kandidaten anbieten: Im Folge-Call stimmt
        Geschäftsführer Christian ab, ob der Partner Leads gestellt bekommt, ohne dafür zu
        zahlen. Der Leadkauf steht davon unabhängig jedem Partner offen.
      </p>
      {daten.qualiCallAngeboten && (
        <a
          href={LEAD_QUALIFIZIERUNG_BUCHUNGSLINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 hover:underline"
        >
          Folge-Call bei Christian Kurz buchen
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );

  /** Die Weiche im Startfahrplan-Abschnitt: direkt starten oder Unterlagen. */
  const renderStartWeiche = () => (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="text-xs font-semibold">Wie geht es mit {b.vorname || "dem Bewerber"} weiter?</div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button" size="sm" disabled={!canEdit}
          variant={daten.startWeiche === "direkt" ? "default" : "outline"}
          onClick={() => onDatenChange({ startWeiche: "direkt" })}
          className="gap-1.5"
        >
          <ThumbsUp className="h-3.5 w-3.5" /> Ist heiß, will direkt starten
        </Button>
        <Button
          type="button" size="sm" disabled={!canEdit}
          variant={daten.startWeiche === "unterlagen" ? "secondary" : "outline"}
          onClick={() => onDatenChange({ startWeiche: "unterlagen" })}
          className="gap-1.5"
        >
          <Mail className="h-3.5 w-3.5" /> Möchte überlegen, bittet um Unterlagen
        </Button>
      </div>
      {daten.startWeiche === "direkt" && (
        <p className="text-[11px] text-muted-foreground">
          Kein Versand nötig. Geh direkt weiter zur Entscheidung im nächsten Abschnitt und mach
          den Vertrag anschließend im Reiter Closing fertig.
        </p>
      )}
      {daten.startWeiche === "unterlagen" && (
        <div className="space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              1. Startfahrplan senden
            </div>
            <Button
              type="button" size="sm" variant="outline" className="gap-1.5"
              disabled={!canEdit || sendetFahrplan || !b.email}
              onClick={startfahrplanSenden}
              title={!b.email ? "Bewerber-E-Mail fehlt" : undefined}
            >
              <Mail className="h-3.5 w-3.5" />
              {sendetFahrplan ? "Wird versendet ..." : "Startfahrplan jetzt senden"}
            </Button>
            {b.paketUebersichtSentAt && (
              <p className="text-[10px] text-emerald-600">
                Zuletzt versendet am {new Date(b.paketUebersichtSentAt).toLocaleString("de-DE")}.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" /> 2. Follow-up vereinbaren (Pflicht)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Datum</Label>
                <DateInput value={fuDatum} onChange={setFuDatum} disabled={!canEdit} />
              </div>
              <div>
                <Label className="text-xs">Uhrzeit</Label>
                <Input type="time" className="mt-1 h-9 text-sm" value={fuUhrzeit}
                  onChange={(e) => setFuUhrzeit(e.target.value)} disabled={!canEdit} />
              </div>
            </div>
            <Label className="text-xs">Notiz (optional)</Label>
            <Textarea
              className="text-sm min-h-[50px]"
              value={fuNotiz}
              onChange={(e) => setFuNotiz(e.target.value)}
              disabled={!canEdit}
              placeholder="Woran hängt die Entscheidung? Was wurde zugesagt?"
            />
            <Button type="button" size="sm" className="gap-1.5"
              disabled={!canEdit || !fuDatum.trim()} onClick={followUpPlanen}>
              <CalendarClock className="h-3.5 w-3.5" /> Follow-up planen
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Der Termin erscheint in der Übersicht des Bewerberprofils und in der Inbox, der
              Status wechselt auf <strong>Follow-Up</strong>. Zum Termin anrufen, nach der
              Entscheidung fragen und dann im Reiter Closing alles fertig machen.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  /** Einwandbehandlungen, aufklappbar wie Punkt 8 in Teil 1. */
  const renderEinwaende = (abschnitt: ClosingDirektAbschnitt) => (
    <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-1">
      <Accordion type="single" collapsible className="w-full">
        {(abschnitt.einwaende ?? []).map((e, i) => (
          <AccordionItem key={i} value={`${abschnitt.key}-einwand-${i}`} className={i === (abschnitt.einwaende ?? []).length - 1 ? "border-none" : ""}>
            <AccordionTrigger className="text-sm py-2.5">„{e.einwand}"</AccordionTrigger>
            <AccordionContent>
              <Script>„{e.antwort}"</Script>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );

  const renderFeld = (feld: ClosingDirektFeld) => (
    <div key={feld.key} className="space-y-1">
      <Label className="text-xs">{feld.label}</Label>
      {feld.typ === "notiz" ? (
        <Textarea
          className="text-sm min-h-[70px] mt-1"
          value={notizen[feld.key] ?? ""}
          onChange={(e) => setNotiz(feld.key, e.target.value)}
          disabled={!canEdit}
          placeholder={feld.placeholder}
        />
      ) : (
        <Input
          className="mt-1 h-9 text-sm"
          value={notizen[feld.key] ?? ""}
          onChange={(e) => setNotiz(feld.key, e.target.value)}
          disabled={!canEdit}
          placeholder={feld.placeholder}
        />
      )}
    </div>
  );

  const aktivPaket = DIREKT_PAKETE.find((p) => p.id === paket) ?? null;

  const renderPaketwahl = () => (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="text-xs font-semibold">Paketwahl (wird im Reiter Closing gespiegelt)</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {DIREKT_PAKETE.map((p) => {
          const Icon = PAKET_ICONS[p.id] ?? Sparkles;
          const gewaehlt = paket === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={!canEdit}
              onClick={() => waehlePaket(p.id)}
              className={`text-left rounded-lg border p-3 transition bg-card ${
                gewaehlt ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
              } ${!canEdit ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon className="h-4 w-4 text-primary" /> {p.titel}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{p.zielgruppe}</div>
              <div className="text-xs font-medium text-primary mt-1.5">
                {p.provisionssatz}% Provision · kein laufendes Entgelt
              </div>
            </button>
          );
        })}
      </div>
      {aktivPaket && (
        aktivPaket.preis > 0 ? (
          <div>
            <Label className="text-xs font-medium">Zahlungsweise</Label>
            <div className="flex gap-2 mt-1.5">
              {ZAHLUNGSWEISEN.map((z) => (
                <button
                  key={z.id} type="button" disabled={!canEdit}
                  onClick={() => waehleZahlungsweise(z.id)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    zw === z.id ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/40"
                  } ${!canEdit ? "opacity-70 cursor-not-allowed" : ""}`}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Zahlungsweise: keine einmalige Setup-Investition und kein laufendes Entgelt. CRM, Objektzugänge,
            Pflichtschulungen, Training, Landingpage, Verkaufsunterlagen, Coaching, Community und Support
            werden gestellt; nur ein Leadpaket wird nach Rechnung abgerechnet.
          </p>
        )
      )}
    </div>
  );

  const renderEntscheidung = () => (
    <div className="space-y-3">
      <div data-ui="card" className="rounded-lg border bg-card p-3 space-y-2">
        <div className="text-xs font-semibold flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Entscheidung (wird im Reiter Closing gespiegelt)
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button" size="sm" disabled={!canEdit}
            variant={entscheidung === "ja" ? "default" : "outline"}
            onClick={() => waehleEntscheidung("ja")}
            className="gap-1.5"
          >
            <ThumbsUp className="h-3.5 w-3.5" /> Ja, will starten
          </Button>
          <Button
            type="button" size="sm" disabled={!canEdit}
            variant={entscheidung === "nein" ? "destructive" : "outline"}
            onClick={() => waehleEntscheidung("nein")}
            className="gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" /> Nein, möchte nicht starten
          </Button>
          <Button
            type="button" size="sm" disabled={!canEdit}
            variant={entscheidung === "bedenkzeit" ? "secondary" : "outline"}
            onClick={() => waehleEntscheidung("bedenkzeit")}
            className="gap-1.5"
          >
            <Clock className="h-3.5 w-3.5" /> Braucht Bedenkzeit
          </Button>
        </div>
        {entscheidung === "ja" && !paket && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Wähle oben im Abschnitt „Was es kostet" noch das Paket, dann springt der Status
            automatisch auf Paketwahl.
          </p>
        )}
      </div>

      {entscheidung === "bedenkzeit" && (
        <div className="rounded-lg border p-3 space-y-2">
          <Label className="text-xs font-medium">
            Wann rufst du wieder an? <span className="text-destructive">*</span>
          </Label>
          <DateInput value={bedenkzeitDatum} onChange={setBedenkzeitDatum} disabled={!canEdit} />
          <Label className="text-xs font-medium pt-1 block">Woran hängt die Entscheidung?</Label>
          <Textarea
            className="text-sm min-h-[60px]"
            value={bedenkzeitGrund}
            onChange={(e) => setBedenkzeitGrund(e.target.value)}
            disabled={!canEdit}
            placeholder="z. B. Rücksprache mit Partnerin, Zeitpunkt, Leadkosten ..."
          />
          {canEdit && (
            <Button size="sm" variant="secondary" className="gap-1.5"
              disabled={!bedenkzeitDatum.trim()} onClick={speichereBedenkzeit}>
              <Clock className="h-3.5 w-3.5" /> Auf Bedenkzeit setzen
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground">
            Status wechselt auf <strong>Bedenkzeit</strong>, der Rückruf erscheint zur Wiedervorlage.
          </p>
        </div>
      )}

      {entscheidung === "nein" && (
        <div className="rounded-lg border p-3 space-y-2">
          <Label className="text-xs font-medium">Verlust-Grund</Label>
          <Textarea
            className="text-sm min-h-[60px]"
            value={abgelehntGrund}
            onChange={(e) => setAbgelehntGrund(e.target.value)}
            onBlur={() => { updateBewerber(b.id, { closingAbgelehntGrund: abgelehntGrund }); onRefresh(); }}
            disabled={!canEdit}
            placeholder="z. B. Kein Budget, falscher Zeitpunkt, anderes Angebot ..."
          />
          <p className="text-[10px] text-muted-foreground">
            Die Absage selbst läuft wie gewohnt über die Knöpfe in Punkt 9
            (C · Absage, inklusive wertschätzender Absage-Mail).
          </p>
        </div>
      )}

      {entscheidung === "ja" && (
        <>
          {/* Vertragsanschrift, dieselben Felder wie im ClosingTab */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-semibold">Vertragsanschrift</div>
            <p className="text-[10px] text-muted-foreground">
              Diese Anschrift steht später im Vertrag. Sie landet direkt im Reiter Closing.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs">Vorname Nachname</Label>
                <Input value={vaName} onChange={(e) => setVaName(e.target.value)} onBlur={speichereAdressen}
                  disabled={!canEdit} placeholder="z. B. Max Mustermann" className="h-9 text-sm" />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs">Straße und Hausnummer</Label>
                <Input value={vaStrasse} onChange={(e) => setVaStrasse(e.target.value)} onBlur={speichereAdressen}
                  disabled={!canEdit} placeholder="z. B. Musterstraße 12" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PLZ</Label>
                <Input value={vaPlz} onChange={(e) => setVaPlz(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                  onBlur={speichereAdressen} disabled={!canEdit} placeholder="83075" inputMode="numeric" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ort</Label>
                <Input value={vaOrt} onChange={(e) => setVaOrt(e.target.value)} onBlur={speichereAdressen}
                  disabled={!canEdit} placeholder="Bad Feilnbach" className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Rechnungsadresse */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-semibold">Rechnungsadresse</div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-1">
              <Checkbox
                checked={identisch}
                onCheckedChange={(v) => {
                  const neu = v === true;
                  setIdentisch(neu);
                  // Direkt mit dem neuen Haken speichern, nicht über den
                  // (noch alten) State von speichereAdressen.
                  const vertragsAdresse = baueAdresse(vaName, vaStrasse, vaPlz, vaOrt);
                  const rechnungsAdresse = neu
                    ? vertragsAdresse
                    : baueAdresse(raName, raStrasse, raPlz, raOrt, raUst);
                  updateBewerber(b.id, { vertragsAdresse, rechnungsAdresse });
                  onRefresh();
                }}
                disabled={!canEdit}
              />
              <span>Identisch mit Vertragsanschrift</span>
            </label>
            {!identisch && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">Vorname Nachname / Firmenname</Label>
                  <Input value={raName} onChange={(e) => setRaName(e.target.value)} onBlur={speichereAdressen}
                    disabled={!canEdit} placeholder="z. B. Mustermann GmbH" className="h-9 text-sm" />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">Straße und Hausnummer</Label>
                  <Input value={raStrasse} onChange={(e) => setRaStrasse(e.target.value)} onBlur={speichereAdressen}
                    disabled={!canEdit} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PLZ</Label>
                  <Input value={raPlz} onChange={(e) => setRaPlz(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                    onBlur={speichereAdressen} disabled={!canEdit} inputMode="numeric" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ort</Label>
                  <Input value={raOrt} onChange={(e) => setRaOrt(e.target.value)} onBlur={speichereAdressen}
                    disabled={!canEdit} className="h-9 text-sm" />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">USt-IdNr. (optional)</Label>
                  <Input value={raUst}
                    onChange={(e) => setRaUst(e.target.value.replace(/[\s\-.]/g, "").toUpperCase().slice(0, 14))}
                    onBlur={speichereAdressen} disabled={!canEdit} placeholder="DE123456789" className="h-9 text-sm font-mono" />
                </div>
              </div>
            )}
          </div>

          {/* Andere Vertriebe: Standard ist die exklusive Zusammenarbeit. */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Switch
                checked={exklusiv}
                onCheckedChange={(v) => {
                  const an = !!v;
                  setExklusiv(an);
                  if (an) {
                    setVertriebe("");
                    updateBewerber(b.id, { andereVertriebe: "" });
                    onRefresh();
                  }
                }}
                disabled={!canEdit}
              />
              <span className="text-xs font-medium">Exklusive Zusammenarbeit mit MOREImmo</span>
            </label>
            {!exklusiv && (
              <div className="space-y-1">
                <Label className="text-xs">Für welche Unternehmen ist er oder sie aktuell tätig? Ein Unternehmen pro Zeile.</Label>
                <Textarea
                  className="text-sm min-h-[60px]"
                  value={vertriebe}
                  onChange={(e) => setVertriebe(e.target.value)}
                  onBlur={() => { updateBewerber(b.id, { andereVertriebe: vertriebe.trim() }); onRefresh(); }}
                  disabled={!canEdit}
                  placeholder={"Muster Vertriebs GmbH, München"}
                />
                <p className="text-[10px] text-muted-foreground">
                  Landet im Bewerberprofil. Ob dafür die individuelle Vertragsfassung nötig ist,
                  entscheidet ihr im Reiter Closing.
                </p>
              </div>
            )}
          </div>

        </>
      )}
    </div>
  );

  /**
   * Der Gesprächsabschluss: die zur Entscheidung passende Abschluss-Variante
   * (ohne Entscheidung alle drei) plus bei Ja der Hinweis, dass der Vertrag
   * im Reiter Closing erzeugt und versendet wird.
   */
  const renderGespraechsabschluss = (a: ClosingDirektAbschnitt) => {
    const varianten = passendeAbschlussVarianten(a.varianten ?? [], entscheidung, daten.startWeiche);
    return (
      <div className="space-y-2">
        {varianten.length > 1 && (
          <p className="text-[11px] text-muted-foreground">
            Noch keine Entscheidung oder Weiche erfasst, deshalb stehen hier alle Abschluss-Varianten.
          </p>
        )}
        {varianten.map((v) => (
          <div key={v.key} className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {v.titel}
            </div>
            <Script>„{fuellePlatzhalter(v.sprechtext, { vorname: b.vorname })}"</Script>
          </div>
        ))}
        {entscheidung === "ja" && (
          <div className="rounded-md border border-green-600/40 bg-green-50/60 dark:bg-green-950/20 p-3 flex items-start gap-2">
            <ArrowRight className="h-4 w-4 text-green-700 dark:text-green-400 shrink-0 mt-0.5" />
            <p className="text-xs text-green-800 dark:text-green-300">
              <strong>Weiter im Reiter Closing: Vertrag erzeugen und senden.</strong> Alle hier
              erfassten Angaben (Entscheidung, Paket, Adressen) sind dort bereits vorbefüllt.
            </p>
          </div>
        )}
        {/* Zweite Einblendung des Folge-Calls am Ende des Skripts. */}
        {renderQualiCall()}
      </div>
    );
  };

  /** Der Inhalt eines Abschnitts: Sprechtexte, Regie, Einwände, Spezialblöcke, Felder. */
  const renderInhalt = (abschnitt: ClosingDirektAbschnitt) => (
    <>
      {abschnitt.sprechtexte.map((t, i) => (
        <Script key={i}>„{fuellePlatzhalter(t, { vorname: b.vorname })}"</Script>
      ))}
      {abschnitt.hinweis && <RegieHinweis hinweis={abschnitt.hinweis} />}
      {(abschnitt.einwaende ?? []).length > 0 && renderEinwaende(abschnitt)}
      {abschnitt.spezial === "paketwahl" && (
        <>
          {renderPaketwahl()}
          {/* Erste Einblendung des Folge-Calls, direkt an der Lead-Thematik. */}
          {renderQualiCall()}
        </>
      )}
      {abschnitt.spezial === "startWeiche" && renderStartWeiche()}
      {abschnitt.spezial === "gespraechsabschluss" && renderGespraechsabschluss(abschnitt)}
      {(abschnitt.felder ?? []).length > 0 && (
        <div className="space-y-3">{(abschnitt.felder ?? []).map(renderFeld)}</div>
      )}
      {abschnitt.spezial === "entscheidung" && renderEntscheidung()}
    </>
  );

  const renderAbschnitt = (abschnitt: ClosingDirektAbschnitt, index: number) => {
    const istAbgehakt = abgehakt.includes(abschnitt.key);
    return (
      <div key={abschnitt.key} className={`rounded-lg border p-3 space-y-2 ${istAbgehakt ? "bg-muted/30" : ""}`}>
        <div className="flex items-start gap-2">
          <Checkbox
            id={`closing-direkt-${abschnitt.key}`}
            checked={istAbgehakt}
            onCheckedChange={(v) => toggleAbgehakt(abschnitt.key, v === true)}
            disabled={!canEdit}
            className="mt-0.5"
          />
          <label htmlFor={`closing-direkt-${abschnitt.key}`} className="cursor-pointer">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Teil 2 · Abschnitt {index + 1} von {CLOSING_DIREKT_ABSCHNITTE.length} · {abschnitt.titel}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              Folie: {abschnitt.folieTitel}
            </span>
          </label>
        </div>
        {renderInhalt(abschnitt)}
      </div>
    );
  };

  // Ein einzelner Abschnitt ohne Rahmen: Kopf und Abhak-Kästchen zeigt die
  // Stationskarte des Reiters selbst.
  if (abschnittKey) {
    const einzeln = CLOSING_DIREKT_ABSCHNITTE.find((a) => a.key === abschnittKey);
    if (!einzeln) return null;
    return <div className="space-y-3">{renderInhalt(einzeln)}</div>;
  }

  // Der Index bleibt der im Gesamtskript ("Abschnitt 12 von 16"), auch wenn
  // die Moderation nur die Abschnitte einer Folie zeigt.
  return (
    <div className="space-y-3">
      {CLOSING_DIREKT_ABSCHNITTE.map((abschnitt, index) =>
        folieId && abschnitt.folieId !== folieId ? null : renderAbschnitt(abschnitt, index),
      )}
    </div>
  );
};
