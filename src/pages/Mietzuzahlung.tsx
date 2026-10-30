import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LivePdfVorschau } from "@/components/pdf/LivePdfVorschau";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { useCacheReady } from "@/hooks/useCacheReady";
import { getAbwicklungDaten } from "@/lib/abwicklungStore";
import { getInvestmentById, getInvestmentMetaField, investmentGespeichert, setInvestmentMetaFields } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import { listendatenFuerEinheit } from "@/lib/listendaten";
import { garageFuerEinheit } from "@/lib/mietgarantie";
import {
  datumDe, ENTWURF_SCHLUESSEL, entwurfErgaenzen, euro, fuerPdf, neuesSchreiben, rechne, vorbelegen, type MietzuzahlungDaten,
} from "@/lib/mietzuzahlung";
import { erzeugeMietzuzahlungPdf } from "@/lib/mietzuzahlungPdf";
import { getObjektById } from "@/lib/objekteStore";

/*
 * Vereinbarung über eine Mietzuzahlung (Mietsubvention), 30.10.2026. Aufbau
 * wie das Beratungs- und Qualitätsprotokoll: links das Formular, vorbelegt
 * aus Kundenprofil, Investment und „Objekt anlegen“, rechts das PDF, das bei
 * jeder Eingabe neu gezeichnet wird. Alles bleibt änderbar, bevor das
 * Dokument an den Kunden geht. Die Adresse hängt unter /kunden/:id, damit
 * nur öffnet, wer auch das Kundenprofil sieht.
 */

const TABELLEN = ["kontakte", "investments", "objekte", "wohnungen"];

export default function Mietzuzahlung() {
  const { id = "", investmentId = "" } = useParams();
  const bereit = useCacheReady(TABELLEN);
  if (!bereit) return <div className="p-6 text-sm text-muted-foreground">Lädt …</div>;
  return <MietzuzahlungInhalt kontaktId={id} investmentId={investmentId} />;
}

/** Was das System für dieses Investment weiß. */
export function systemWerte(kontaktId: string, investmentId: string): MietzuzahlungDaten {
  const inv = getInvestmentById(investmentId);
  const objekt = inv?.objektId ? getObjektById(inv.objektId) : undefined;
  const wohnung = objekt?.wohnungen.find((w) => w.id === inv?.wohnungId);
  const wohnungId = inv?.wohnungId || "";
  const garage = wohnungId ? garageFuerEinheit(wohnungId) : null;
  return vorbelegen({
    kunde: getKontaktById(kontaktId),
    objekt: objekt ? { adresse: objekt.adresse, plz: objekt.plz, ort: objekt.ort, meta: objekt.meta as Record<string, unknown> } : null,
    wohnung: wohnung ? { weNr: wohnung.weNr || inv?.weNr, etage: wohnung.etage, lage: wohnung.lage, groesse: wohnung.groesse, mieteGesamt: wohnung.mieteGesamt } : { weNr: inv?.weNr },
    listenwerte: wohnungId ? listendatenFuerEinheit(wohnungId)?.werte ?? null : null,
    garage: garage ? { nr: garage.nr, istMiete: garage.istMiete } : null,
    uebergabe: getAbwicklungDaten(investmentId).uebergabeDatum,
  });
}

function MietzuzahlungInhalt({ kontaktId, investmentId }: { kontaktId: string; investmentId: string }) {
  const inv = getInvestmentById(investmentId);
  const kunde = getKontaktById(kontaktId);
  const ausSystem = useMemo(() => systemWerte(kontaktId, investmentId), [kontaktId, investmentId]);
  // Ohne Entwurf (Adresse direkt aufgerufen) wie über den Knopf: Mittenwalde und heutiges Datum.
  const [daten, setDaten] = useState<MietzuzahlungDaten>(() =>
    entwurfErgaenzen(getInvestmentMetaField<Partial<MietzuzahlungDaten> | null>(investmentId, ENTWURF_SCHLUESSEL, null), neuesSchreiben(ausSystem)));
  const [ansicht, setAnsicht] = useState<"formular" | "vorschau">("formular");
  const r = useMemo(() => rechne(daten), [daten]);
  const setze = (feld: keyof MietzuzahlungDaten, wert: string) => setDaten((d) => ({ ...d, [feld]: wert }));

  // Entwurf am Investment, kurz nach der letzten Eingabe, wie beim Beratungsprotokoll.
  const [gespeichert, setGespeichert] = useState(true);
  const ersterLauf = useRef(true);
  useEffect(() => {
    if (ersterLauf.current) { ersterLauf.current = false; return; }
    setGespeichert(false);
    const timer = setTimeout(() => {
      setInvestmentMetaFields(investmentId, { [ENTWURF_SCHLUESSEL]: daten });
      setGespeichert(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [daten, investmentId]);

  const herunterladen = async () => {
    const doc = await erzeugeMietzuzahlungPdf(fuerPdf(daten));
    doc.save(`Mietzuzahlung ${daten.kaeuferName || "Kunde"}${daten.weNr ? ` WE ${daten.weNr}` : ""}.pdf`);
  };

  // Wie die Reservierung: Der Server nimmt den gespeicherten Entwurf, legt den Link an und schickt die Mail.
  const navigate = useNavigate();
  const [sendet, setSendet] = useState(false);
  const zurUnterschrift = async () => {
    setSendet(true);
    try {
      setInvestmentMetaFields(investmentId, { [ENTWURF_SCHLUESSEL]: daten });
      await investmentGespeichert(investmentId);
      const { data, error } = await supabase.functions.invoke("send-mietzuzahlung-signatur", { body: { investmentId } });
      if (error || !data?.ok) {
        const grund = data?.error || data?.grund || (await (error as { context?: Response })?.context?.json?.().catch(() => null))?.error;
        toast.error(grund || "Versand fehlgeschlagen.");
        return;
      }
      toast.success(`Zur Unterschrift an ${data.email} gesendet`);
      navigate(`/kunden/${kontaktId}?tab=investments&investment=${investmentId}#aftersales`);
    } finally {
      setSendet(false);
    }
  };

  if (!inv) return <div className="p-6 text-sm text-muted-foreground">Investment nicht gefunden.</div>;

  /** Feld mit Markierung, wenn der Wert noch dem System entspricht. */
  const feld = (k: keyof MietzuzahlungDaten, label: string, opt: { platzhalter?: string; hinweis?: string; datum?: boolean } = {}) => {
    const ausCrm = !!ausSystem[k] && daten[k] === ausSystem[k];
    return (
      <div key={k}>
        <Label className="text-xs">{label}</Label>
        {opt.datum ? (
          <DateInput value={daten[k]} onChange={(v) => setze(k, v)} />
        ) : (
          <Input className={`h-8 ${ausCrm ? "bg-sky-500/10 border-sky-500/40" : ""}`} value={daten[k]} placeholder={opt.platzhalter}
            onChange={(e) => setze(k, e.target.value)} />
        )}
        {opt.hinweis && <p className="mt-0.5 text-bildunterschrift text-muted-foreground">{opt.hinweis}</p>}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6" data-testid="mietzuzahlung-seite">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to={`/kunden/${kontaktId}?tab=investments&investment=${investmentId}#aftersales`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Zurück zu {[kunde?.vorname, kunde?.nachname].filter(Boolean).join(" ") || "Kunde"}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Vereinbarung über eine Mietzuzahlung</h1>
          <p className="text-sm text-muted-foreground">Mietsubvention der OS Mietpool Verwaltung UG, aus Investment und Objektdaten vorbelegt.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{gespeichert ? "Entwurf gespeichert" : "Speichert …"}</span>
          <Button variant="outline" size="sm" onClick={() => setDaten({ ...ausSystem, bank: daten.bank, iban: daten.iban, ort2: daten.ort2, datum2: daten.datum2 })} title="Alle Werte erneut aus dem System übernehmen; Bank, IBAN, Ort und Datum bleiben">
            <RotateCcw className="h-4 w-4 mr-1" /> Aus dem System neu laden
          </Button>
          <Button size="sm" variant="outline" onClick={() => void herunterladen()}><Download className="h-4 w-4 mr-1" /> PDF herunterladen</Button>
          <Button size="sm" variant="brand" disabled={sendet} onClick={() => void zurUnterschrift()} data-testid="mietzuzahlung-senden">
            <Send className="h-4 w-4 mr-1" /> {sendet ? "Sendet …" : "Zur Unterschrift an Kunden senden"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:hidden" role="tablist">
        {(["formular", "vorschau"] as const).map((a) => (
          <button key={a} role="tab" aria-selected={ansicht === a} onClick={() => setAnsicht(a)}
            className={`rounded-md py-1.5 text-sm font-medium ${ansicht === a ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            {a === "formular" ? "Formular" : "PDF-Vorschau"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className={`min-w-0 space-y-4 ${ansicht === "formular" ? "" : "hidden lg:block"}`}>
          <p className="text-xs text-muted-foreground">
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-sky-500/50 bg-sky-500/30 align-middle" />
            Aus dem System vorausgefüllt, bitte prüfen. Alle Felder bleiben änderbar.
          </p>
          <Block titel="Käufer (Vertragspartner 1)">
            {feld("kaeuferName", "Name")}
            {feld("kaeuferAnschrift", "Anschrift")}
          </Block>
          <Block titel="Kaufgegenstand">
            <div className="grid gap-3 sm:grid-cols-3">
              {feld("weNr", "Wohnung Nr.")}
              {feld("lage", "Lage", { platzhalter: "3.OG re" })}
              {feld("garageNr", "Garage / Stellplatz", { platzhalter: "leer: keine" })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {feld("strasse", "Straße")}
              {feld("ort", "PLZ und Ort")}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {feld("grundbuchVon", "Grundbuch von")}
              {feld("amtsgericht", "Amtsgericht")}
              {feld("blatt", "Blatt")}
            </div>
          </Block>
          <Block titel="Miete und Zielmiete">
            <div className="grid gap-3 sm:grid-cols-4">
              {feld("flaeche", "Wohnfläche (m²)")}
              {feld("istMiete", "Grundmiete netto (€)")}
              {feld("zielQm", "Zielmiete (€/m²)")}
              {feld("laufzeitMonate", "Laufzeit (Monate)")}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {feld("uebergabe", "Übergabestichtag", { datum: true })}
              {feld("letzteErhoehung", "Letzte Mieterhöhung", { datum: true })}
              {feld("naechsteErhoehung", "Nächste Erhöhung möglich", { datum: true, hinweis: "Leer: 15 Monate nach der letzten" })}
              {feld("erhoehungProzent", "Erhöhung um (%)", { hinweis: "Kappungsgrenze" })}
            </div>
          </Block>
          {daten.garageNr.trim() && (
            <Block titel="Garage">
              <div className="grid gap-3 sm:grid-cols-3">
                {feld("garageIstMiete", "Ist-Miete Garage (€)")}
                {feld("garageZuschussAuf", "Bezuschusst auf (€)")}
                {feld("garageMonate", "Für Monate")}
              </div>
            </Block>
          )}
          <Block titel="Auszahlung">
            <div className="grid gap-3 sm:grid-cols-2">
              {feld("bank", "Bank")}
              {feld("iban", "IBAN")}
            </div>
          </Block>
          <Block titel="Unterschrift Käufer">
            <div className="grid gap-3 sm:grid-cols-2">
              {feld("ort1", "Ort Käufer")}
              {feld("datum1", "Datum Käufer", { datum: true })}
            </div>
            <p className="text-bildunterschrift text-muted-foreground">Vertragspartner 2 unterschreibt immer in Mittenwalde mit dem heutigen Datum und Olivers Unterschrift.</p>
          </Block>
          <Card className="space-y-1 p-4 text-sm" data-testid="mietzuzahlung-summe">
            <p className="font-semibold">Rechnung</p>
            <p className="text-muted-foreground">Bis {datumDe(r.phase1.bis) || "…"}: {euro(r.phase1.differenz)} € × {r.phase1.monate} Monate = <b>{euro(r.phase1.betrag)} €</b></p>
            {r.phase2 && <p className="text-muted-foreground">Ab {datumDe(r.phase2.von)} (Miete {euro(r.phase2.neueMiete)} €): {euro(r.phase2.differenz)} € × {r.phase2.monate} Monate = <b>{euro(r.phase2.betrag)} €</b></p>}
            {r.garage && <p className="text-muted-foreground">Garage: {euro(r.garage.differenz)} € × {r.garage.monate} Monate = <b>{euro(r.garage.betrag)} €</b></p>}
            <p className="pt-1">Mietzuzahlung gesamt: <b>{euro(r.gesamt)} €</b></p>
          </Card>
        </div>
        <div className={`min-w-0 lg:sticky lg:top-4 ${ansicht === "vorschau" ? "" : "hidden lg:block"}`}>
          <LivePdfVorschau erzeuge={() => erzeugeMietzuzahlungPdf(fuerPdf(daten))} schluessel={JSON.stringify(daten)} titel="Vereinbarung über eine Mietzuzahlung" />
        </div>
      </div>
    </div>
  );
}

function Block({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-semibold">{titel}</p>
      {children}
    </Card>
  );
}

