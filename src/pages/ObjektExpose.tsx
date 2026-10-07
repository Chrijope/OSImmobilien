import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useUser } from "@/contexts/UserContext";
import { cacheGetById } from "@/lib/dataCache";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { eur0 } from "@/lib/objektKennzahlen";
import type { ExposeAnnahmen } from "@/lib/exposeAnnahmen";
import type { ExposeErgebnis } from "@/lib/exposeRechner";
import { annahmenVorbelegen, baueExposeInhalt, sichtbareZeilen } from "@/lib/exposeInhalt";
import { useKundenSprache } from "@/lib/kundenSprache";
import { STANDARD_SPRACHE } from "@/lib/seitenSprache";
import { SeitenSpracheProvider } from "@/lib/seitenSpracheKontext";
import { empfehlungAusSuche, kundenRueckwegAusSuche, mitEmpfehlung, mitRueckweg } from "@/lib/empfehlungAuswahl";
import { englischeObjektTexteAnfordern, englischeObjektTexteFehlen, OBJEKT_TEXTE_EN_META_SCHLUESSEL } from "@/lib/objektTexteKi";
import {
  annahmenZusammenfuehren, EXPOSE_MIGRATION_HINWEIS, exposeDatensatzPasst, KUNDENANSICHT_PARAM, KUNDENANSICHT_WERT, ladeExposeFuer, ladeExposeNachId,
  preisHatSichGeaendert, speichereExpose, type ExposeKunde, type ObjektExpose as ExposeDatensatz,
} from "@/lib/objektExposeStore";
import { wieImKundenlink } from "@/lib/exposePublicDaten";
import { ObjektseiteZugang } from "@/components/objektseite/ObjektseiteZugang";
import { ExposeAnsicht } from "@/components/expose/ExposeAnsicht";
import { investagonErgaenzung, ohneWidersprueche, zeilenErgaenzen } from "@/components/expose/exposeInvestagon";
import { useExposeAnsprechpartner, useExposeKunde, useExposeObjekt, useExposeStandort, useGrundrissAdressen } from "@/components/expose/useExposeObjekt";
import type { AnnahmenHerkunftKarte } from "@/components/expose/ExposeRechner";
import { ObjektExposeGesamt } from "./ObjektExposeGesamt";

/**
 * Das Exposé je Wohneinheit, interne Ansicht.
 *
 * Adresse `/objekte/:id/einheiten/:weId/expose`, optional `?kunde=` für den
 * Kunden und `?expose=` für einen gespeicherten Datensatz. Zugang wie die
 * Einheiten-Seite. Die Seite läuft bewusst ohne CRM-Rahmen: Die Route liegt
 * außerhalb der `AppShell` (wie „Als Kunde ansehen“), und jeder Weg hierher
 * öffnet einen eigenen Tab. Sie zeigt, was der Kunde später über den Link
 * sieht, plus eine schmale Vorschau-Leiste zum Speichern, von der aus
 * „Zur Einheit im CRM“ im selben Tab zurück ins CRM führt.
 *
 * Ohne `:weId`, also unter `/objekte/:id/expose`, zeigt dieselbe Seite das
 * Exposé des ganzen Objekts (`ObjektExposeGesamt`), etwa eines
 * Globalobjekts. Beide Adressen hängen an dieser einen Seite, damit in
 * `App.tsx` nur die Route dazukommt und kein weiterer Seitenimport.
 */
export default function ObjektExpose() {
  const { id = "", weId = "" } = useParams<{ id: string; weId?: string }>();
  if (!weId) {
    return (
      <ObjektseiteZugang verwaltungPfad={`/objekte/${id}/verwaltung`} mitVertriebsleitung>
        <ObjektExposeGesamt id={id} />
      </ObjektseiteZugang>
    );
  }
  return (
    <ObjektseiteZugang verwaltungPfad={`/objekte/${id}/wohnung/${weId}`} mitVertriebsleitung>
      <ObjektExposeInhalt id={id} weId={weId} />
    </ObjektseiteZugang>
  );
}

function ObjektExposeInhalt({ id, weId }: { id: string; weId: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kundeId = params.get("kunde");
  const exposeId = params.get("expose");
  const kundenansicht = params.get(KUNDENANSICHT_PARAM) === KUNDENANSICHT_WERT;
  const { objekt, objektMitAdressen, bereit } = useExposeObjekt(id);
  // Für Vertriebspartner nur ein eigener oder vertretener Kunde, siehe `useExposeKunde`.
  const kunde = useExposeKunde(kundeId, bereit, objekt);

  const wohnung = objektMitAdressen?.wohnungen.find((w) => w.id === weId);

  if (!objektMitAdressen || !wohnung) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background py-20">
        {bereit && (!objekt || objektMitAdressen) ? (
          <>
            <p className="text-muted-foreground">{objekt ? "Diese Einheit gibt es nicht mehr." : "Objekt nicht gefunden."}</p>
            <Button variant="outline" onClick={() => navigate(objekt ? `/objekte/${id}` : "/objekte")}>{objekt ? "Zur Objektseite" : "Zur Objektliste"}</Button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Exposé wird geladen…</p>
        )}
      </div>
    );
  }

  return <ExposeSeite objekt={objektMitAdressen} wohnung={wohnung} kunde={kunde} exposeId={exposeId} kundenansicht={kundenansicht} />;
}

/** Der Hinweis über dem Rechner, solange für diese Einheit nichts gespeichert ist. */
export const EINHEIT_NOCH_NICHT_GESPEICHERT =
  "Die Regler sind zum Ausprobieren. Mit „Annahmen speichern“ bleiben deine Einstellungen für diese Einheit erhalten. Der Kundenlink rechnet immer mit den Standardwerten.";

/**
 * `kundenansicht`: die Vorschau aus „Exposé für Kunden“ (`?ansicht=kunde`).
 * Sie zeigt, was der Kunde über seinen Link sieht: keine interne Leiste
 * („Zur Einheit im CRM“, „Vorschau ohne Kunden“), kein Speichern der
 * Annahmen, der Partner oben im Kasten und neutrale Standardannahmen wie im
 * Kundenlink. Ohne den Schalter bleibt „Exposé anzeigen“ die interne Ansicht.
 */
function ExposeSeite({ objekt: objektGeladen, wohnung, kunde, exposeId, kundenansicht = false }: { objekt: ObjektData; wohnung: ObjektWohnung; kunde: ExposeKunde | null; exposeId: string | null; kundenansicht?: boolean }) {
  const { user, authUser } = useUser();
  const [params] = useSearchParams();

  /*
   * Die Sprache des Exposés: mit Kunde seine Sprache aus dem Kundenprofil,
   * ohne Kunde Deutsch. Nie eine Einstellung des Mitarbeiters.
   *
   * Bis zum 25.09.2026 blieb diese Seite immer deutsch, nur das PDF folgte
   * dem Kunden. Christians Entscheidung vom 25.09.2026: Wer aus dem
   * Kundenprofil über die Objektauswahl kommt, arbeitet im Kundenbezug, und
   * dann zeigt schon die Seite das Exposé so, wie der Kunde es bekommt. Die
   * Leiste für den Mitarbeiter (Speichern, Hinweise, Kopf) bleibt deutsch.
   */
  const { sprache: spracheDesKunden } = useKundenSprache(kunde?.id);
  const sprache = kunde ? spracheDesKunden : STANDARD_SPRACHE;

  /*
   * Fehlt zu den automatisch erzeugten Objekttexten die englische Fassung
   * (Texte vor dem 25.09.2026), wird sie einmal nachgeholt, wie beim
   * Kundenlink. Bis dahin stehen sie deutsch mit Hinweis. Ein Fehlschlag
   * bricht nichts ab.
   */
  const [englischeTexte, setEnglischeTexte] = useState<unknown>(undefined);
  useEffect(() => {
    if (sprache !== "en" || !englischeObjektTexteFehlen(objektGeladen)) return;
    let abgebrochen = false;
    void englischeObjektTexteAnfordern(objektGeladen.id).then((en) => { if (!abgebrochen && en) setEnglischeTexte(en); });
    return () => { abgebrochen = true; };
    // Einmal je Objekt und Sprache, nicht bei jeder neuen Objektreferenz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprache, objektGeladen.id]);
  const objekt = useMemo<ObjektData>(
    () => (englischeTexte ? { ...objektGeladen, meta: { ...(objektGeladen.meta || {}), [OBJEKT_TEXTE_EN_META_SCHLUESSEL]: englischeTexte } } : objektGeladen),
    [objektGeladen, englischeTexte],
  );

  /*
   * Vorbelegung: Standardwerte und Objektdaten, bewusst ohne Selbstauskunft.
   *
   * Ein Exposé wird zu einer Einheit geöffnet, nicht zu einem Investment. Es
   * steht also nicht fest, welche Selbstauskunft gemeint wäre, und die eines
   * anderen Vorgangs wäre geraten. Deshalb startet der Rechner hier mit den
   * Standardannahmen (Regel in saQuelle.ts).
   */
  const vorbelegung = useMemo(() => annahmenVorbelegen(objekt, wohnung, null), [objekt, wohnung]);
  const [annahmen, setAnnahmen] = useState<ExposeAnnahmen>(vorbelegung.annahmen);
  const [gesperrt, setGesperrt] = useState(false);
  const [gespeichert, setGespeichert] = useState<ExposeDatensatz | null>(null);
  const [migrationFehlt, setMigrationFehlt] = useState(false);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [geaendert, setGeaendert] = useState(false);
  // Erst nach bestätigter Speicherung grün; jede Änderung danach setzt `geaendert` und nimmt das Grün zurück.
  const [frischGespeichert, setFrischGespeichert] = useState(false);
  // Für das PDF: das Ergebnis des Rechners mit den gerade eingestellten
  // Annahmen. Die Mikrolage nimmt das PDF aus dem Inhalt selbst.
  const ergebnisRef = useRef<ExposeErgebnis | null>(null);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const onErgebnis = useCallback((e: ExposeErgebnis) => { ergebnisRef.current = e; }, []);

  // Gespeicherten Datensatz laden und über die Vorbelegung legen. Nicht in
  // der Kundenansicht: Der Kundenlink rechnet nie mit gespeicherten Annahmen.
  useEffect(() => {
    let abgebrochen = false;
    setGeaendert(false);
    setFrischGespeichert(false);
    if (kundenansicht) {
      setAnnahmen(vorbelegung.annahmen);
      return () => { abgebrochen = true; };
    }
    (exposeId ? ladeExposeNachId(exposeId) : ladeExposeFuer(wohnung.id, kunde?.id ?? null, authUser?.id)).then((geladen) => {
      if (abgebrochen) return;
      /*
       * Ein Datensatz aus `?expose=` gilt nur, wenn er zu Objekt, Einheit und
       * dem erlaubten Kunden dieser Seite passt (Prüfung Codex, 05.10.2026).
       * Sonst neutral starten, ohne fremde Annahmen und ohne ihn beim
       * Speichern zu überschreiben.
       */
      const passt = !geladen.expose || exposeDatensatzPasst(geladen.expose, {
        objektId: objekt.id, wohnungId: wohnung.id, erlaubterKundeId: kunde?.id ?? null, eigeneId: authUser?.id,
      });
      const erg = passt ? geladen : { ...geladen, expose: null };
      setMigrationFehlt(erg.migrationFehlt);
      setLadeFehler(erg.fehler);
      setGespeichert(erg.expose);
      setGesperrt(erg.expose?.annahmen_gesperrt ?? false);
      setAnnahmen(annahmenZusammenfuehren(vorbelegung.annahmen, erg.expose?.annahmen));
    });
    return () => { abgebrochen = true; };
  }, [exposeId, wohnung.id, kunde?.id, vorbelegung.annahmen, kundenansicht, objekt.id, authUser?.id]);

  const onAnnahmen = useCallback((aenderung: Partial<ExposeAnnahmen>) => {
    setAnnahmen((a) => ({ ...a, ...aenderung }));
    setGeaendert(true);
  }, []);

  const herkunft = useMemo(() => {
    const h: AnnahmenHerkunftKarte = {};
    for (const k of vorbelegung.ausObjekt) h[k] = "objekt";
    for (const k of vorbelegung.ausSelbstauskunft) h[k] = "selbstauskunft";
    return h;
  }, [vorbelegung]);

  /*
   * Die Standortdatenbank dürfen nur Angemeldete lesen (RLS „TO
   * authenticated“). Im Kundenlink fehlen Einwohner, Entwicklung und
   * Arbeitgeber deshalb, und die Kundenansicht zeigt das ehrlich.
   */
  const { standort, standortArbeitgeber } = useExposeStandort(kundenansicht ? undefined : objekt.ort);
  // Der Vertriebspartner: mit Kunde dessen zuständiger Partner, sonst du.
  // Einen Objektpartner gibt es im Exposé nicht mehr. In der Kundenansicht
  // nur mit den Angaben, die auch der Kundenlink herausgibt.
  const partnerIntern = useExposeAnsprechpartner(kunde);
  const ansprechpartner = kundenansicht ? wieImKundenlink(partnerIntern) : partnerIntern;
  const ansprechpartnerSchluessel = JSON.stringify(ansprechpartner);

  const inhaltMitZeigern = useMemo(
    () => baueExposeInhalt({ objekt, wohnung, standort, standortArbeitgeber, kundeName: kunde?.name, ersteller: ansprechpartner, sprache }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objekt, wohnung, standort, standortArbeitgeber, kunde?.name, ansprechpartnerSchluessel, sprache],
  );
  // Die Grundrisse mit befristeter Adresse, für Seite und PDF.
  const inhalt = useGrundrissAdressen(inhaltMitZeigern);

  /*
   * Die Investagon-Rohdaten der Einheit liegen in ihrer `meta`, die der
   * gepflegte Typ `ObjektWohnung` nicht durchreicht. Deshalb die Zeile direkt
   * aus dem Zwischenspeicher. Fehlt sie, bleiben die Ergaenzungen leer und
   * das Exposé sieht aus wie zuvor.
   */
  const einheitRoh = cacheGetById<{ id: string; meta?: Record<string, unknown> | null }>("wohnungen", wohnung.id) ?? null;
  const investagon = useMemo(
    // Besonderheiten, Merkmale und Objektangaben. Die Grundrisse stehen seit
    // dem 23.09.2026 in `inhalt.grundriss` (`grundrisseFuerExpose`).
    () => investagonErgaenzung({ objekt, einheit: einheitRoh, ebene: "einheit", sprache }),
    [objekt, einheitRoh, sprache],
  );

  const speichern = async () => {
    if (!authUser?.id) { toast.error("Nicht angemeldet."); return; }
    setFrischGespeichert(false);
    setSpeichert(true);
    let erg: Awaited<ReturnType<typeof speichereExpose>>;
    try {
      erg = await speichereExpose({
        id: gespeichert?.id,
        wohnungId: wohnung.id,
        objektId: objekt.id,
        kontaktId: kunde?.id ?? null,
        erstelltVon: authUser.id,
        annahmen,
        annahmenGesperrt: gesperrt,
        preisstand: wohnung.vkGesamt || 0,
      });
    } catch (e) {
      toast.error(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : "unbekannter Fehler"}`);
      return;
    } finally {
      setSpeichert(false);
    }
    if (erg.migrationFehlt) { setMigrationFehlt(true); toast.error(EXPOSE_MIGRATION_HINWEIS); return; }
    if (erg.fehler || !erg.expose) { toast.error(`Speichern fehlgeschlagen: ${erg.fehler ?? "keine Bestätigung der Datenbank"}`); return; }
    setGespeichert(erg.expose);
    setGeaendert(false);
    setFrischGespeichert(true);
    toast.success("Annahmen gespeichert.");
  };

  /**
   * PDF mit den gerade eingestellten Annahmen bauen und als Datei laden.
   * Bewusst nur der Download, keine Ablage unter den Dokumenten der Einheit,
   * sonst entstehen bei jedem Klick Dubletten.
   */
  const pdfHerunterladen = async () => {
    const ergebnis = ergebnisRef.current;
    if (!ergebnis) { toast.error("Der Rechner ist noch nicht fertig, bitte gleich noch einmal versuchen."); return; }
    setPdfLaeuft(true);
    try {
      const { exposeDruckPdf, exposePdfDateiname } = await import("@/lib/exposeDruck");
      const heute = new Date();
      /*
       * Das PDF geht an den Kunden und folgt wie die Seite seiner Sprache
       * aus dem Profil (Plan Kundensprache, Etappe 5). Der Inhalt der Seite
       * ist schon in dieser Sprache. Nur wenn die englischen Objekttexte noch
       * fehlen (der Abruf beim Öffnen lief nicht durch), wird es hier noch
       * einmal versucht; klappt das nicht, stehen sie deutsch mit Hinweis.
       */
      let pdfInhalt = inhalt;
      if (sprache === "en" && englischeObjektTexteFehlen(objekt)) {
        const englisch = await englischeObjektTexteAnfordern(objekt.id);
        if (englisch) {
          setEnglischeTexte(englisch);
          const objektFuerPdf = { ...objekt, meta: { ...(objekt.meta || {}), [OBJEKT_TEXTE_EN_META_SCHLUESSEL]: englisch } };
          const englischerInhalt = baueExposeInhalt({
            objekt: objektFuerPdf, wohnung, standort, standortArbeitgeber, kundeName: kunde?.name, ersteller: ansprechpartner, sprache,
          });
          // Die Grundrisse mit befristeter Adresse hat die Seite schon aufgelöst.
          pdfInhalt = { ...englischerInhalt, grundriss: inhalt.grundriss };
        }
      }
      // Wie die Seite: Objektdaten mit den Investagon-Ergänzungen, dazu Besonderheiten und Merkmale.
      const blob = await exposeDruckPdf(
        { ...pdfInhalt, objektdaten: { ...pdfInhalt.objektdaten, zeilen: sichtbareZeilen(zeilenErgaenzen(pdfInhalt.objektdaten.zeilen, ohneWidersprueche(investagon.zeilen, pdfInhalt.objektdaten.energie))) } },
        annahmen,
        ergebnis,
        {
          sprache,
          herkunft,
          eigenkapitalEuro: vorbelegung.eigenkapitalEuro,
          erstelltAm: heute,
          preisstandAm: gespeichert?.preisstand_am && !preisGeaendert ? new Date(gespeichert.preisstand_am) : heute,
          zusatz: { beschreibungen: investagon.beschreibungen, merkmale: investagon.merkmale },
        },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exposePdfDateiname(inhalt, heute);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Das Exposé wurde als PDF heruntergeladen.");
    } catch (e) {
      toast.error(`Das PDF konnte nicht erstellt werden: ${e instanceof Error ? e.message : "unbekannter Fehler"}`);
    } finally {
      setPdfLaeuft(false);
    }
  };

  const preisGeaendert = preisHatSichGeaendert(gespeichert, wohnung.vkGesamt || 0);
  const speicherStatus = migrationFehlt
    ? EXPOSE_MIGRATION_HINWEIS
    : ladeFehler
      ? `Gespeicherte Annahmen konnten nicht geladen werden: ${ladeFehler}`
      : gespeichert
        ? `Gespeichert am ${new Date(gespeichert.aktualisiert_am).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}${geaendert ? ", seitdem geändert" : ""}`
        // Bis zum 23.09.2026 stand hier „gelten nur in diesem Browser“. Das
        // stimmte nicht: Ungespeichert gelten die Regler nur bis zum Neuladen.
        : EINHEIT_NOCH_NICHT_GESPEICHERT;

  const kopfRechts = (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="border-primary/30 bg-accent font-semibold text-primary" data-testid="kopf-kunde">
        {kunde ? `für ${kunde.name}, erstellt von ${user.name}` : `Vorschau ohne Kunden, ${user.name}`}
      </Badge>
      {/* Mit Kunde steht immer da, in welcher Sprache Seite und PDF gerade sind, auch bei Deutsch. */}
      {kunde && (
        <Badge variant="outline" className="border-primary/30 font-semibold text-primary" data-testid="kopf-sprache" data-sprache={sprache}>
          {sprache === "en" ? "Kundensprache Englisch: Exposé und PDF auf Englisch" : "Kundensprache Deutsch"}
        </Badge>
      )}
    </span>
  );

  /*
   * Kam man aus dem Kundenprofil, reisen Investment und Rückweg mit
   * (`?empfehlung=`, `?zurueck=`). Dann führt „Zur Einheit im CRM" in den
   * Kundenbezug zurück, und „Zum Kundenprofil" direkt zum Kunden.
   */
  const suche = params.toString();
  const kundenRueck = kunde ? kundenRueckwegAusSuche(suche) : null;
  const einheitZiel = mitRueckweg(mitEmpfehlung(`/objekte/${objekt.id}/einheiten/${wohnung.id}`, kunde ? empfehlungAusSuche(suche) : null), kundenRueck);

  /*
   * Das Exposé steht in einem eigenen Tab, ein „Zurück“ hätte dort kein
   * Ziel. Der Link führt im selben Tab zur Einheitsseite, dann wieder mit
   * CRM-Rahmen.
   */
  const leisteObenLinks = (
    <span className="flex flex-wrap items-center gap-1">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground max-md:min-h-[40px]">
        <Link to={einheitZiel} data-testid="zum-crm"><ArrowLeft className="h-3.5 w-3.5" /> Zur Einheit im CRM</Link>
      </Button>
      {kundenRueck && (
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground max-md:min-h-[40px]">
          <Link to={kundenRueck} data-testid="zum-kundenprofil"><ArrowLeft className="h-3.5 w-3.5" /> Zum Kundenprofil</Link>
        </Button>
      )}
    </span>
  );

  /*
   * Das PDF entsteht über den Druck der Seite. Mit Kunde geht es an ihn,
   * und die Bedienelemente und Hinweise für den Mitarbeiter (deutsch) haben
   * darin nichts zu suchen: `screen-only` blendet sie beim Druck aus. Ohne
   * Kunde bleibt es wie bisher.
   */
  const nurBildschirm = kunde ? "screen-only" : "";

  const rechnerKopf = (
    <div className={`flex flex-wrap items-center gap-2 ${nurBildschirm}`.trim()} data-testid="annahmen-speichern-bereich">
      <label className="flex items-center gap-1.5 text-xs">
        <Switch checked={gesperrt} onCheckedChange={(v) => { setGesperrt(v); setGeaendert(true); }} aria-label="Annahmen für den Kunden sperren" data-testid="schalter-sperren" />
        <Lock className="h-3 w-3 text-muted-foreground" /> Für den Kunden sperren
      </label>
      {frischGespeichert && !geaendert ? (
        <Button type="button" size="sm" className="gap-1.5 bg-success text-white hover:bg-success/90" onClick={speichern} data-testid="annahmen-speichern" data-zustand="gespeichert">
          <Check className="h-3.5 w-3.5" /> Gespeichert
        </Button>
      ) : (
        <Button type="button" size="sm" className="gap-1.5" onClick={speichern} disabled={speichert} data-testid="annahmen-speichern">
          {speichert ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Annahmen speichern
        </Button>
      )}
    </div>
  );

  const rechnerHinweis = (
    <div className={`mb-3 space-y-2 ${nurBildschirm}`.trim()} data-testid="rechner-hinweis-intern">
      {kunde && (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground" data-testid="ohne-selbstauskunft-hinweis">
          Die Annahmen sind Standardwerte, keine Zahlen von {kunde.name}. Einkommen, Familienstand und
          Eigenkapital gehören zu einem einzelnen Investment und stehen deshalb im Investmentrechner,
          sobald dort das Investment gewählt ist.
        </div>
      )}
      {preisGeaendert && gespeichert && (
        <div className="rounded-xl border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-4 py-2.5 text-sm" data-testid="preisstand-hinweis">
          <b>Preis hat sich geändert.</b> Beim Speichern galt ein Kaufpreis von {eur0(gespeichert.preisstand ?? 0)}, heute sind es {eur0(wohnung.vkGesamt || 0)}. Der Rechner nutzt den aktuellen Preis; „Annahmen speichern" übernimmt den neuen Preisstand.
        </div>
      )}
      <p className="text-xs text-muted-foreground" data-testid="speicher-status">{speicherStatus}</p>
    </div>
  );

  // Die Exposé-Bausteine lesen die Sprache über den Kontext (`useAnzeigeSprache`).
  if (kundenansicht) {
    return (
      <SeitenSpracheProvider sprache={sprache}>
        <ExposeAnsicht
          inhalt={inhalt}
          rechner={{ annahmen, onAnnahmen, herkunft, onErgebnis }}
          pdfAktiv
          investagon={investagon}
          kundenAnsprechpartner={ansprechpartner}
        />
      </SeitenSpracheProvider>
    );
  }

  return (
    <SeitenSpracheProvider sprache={sprache}>
      <ExposeAnsicht
        inhalt={inhalt}
        rechner={{ annahmen, onAnnahmen, herkunft, eigenkapitalEuro: vorbelegung.eigenkapitalEuro, kopfRechts: rechnerKopf, onErgebnis }}
        kopfRechts={kopfRechts}
        leisteObenLinks={leisteObenLinks}
        rechnerHinweis={rechnerHinweis}
        // Der deutsche Vermerk steht auch im gedruckten PDF, beim englischen Kunden deshalb nicht.
        fussText={sprache === "en" ? undefined : "Interne Vorschau"}
        pdfAktiv
        onPdf={pdfHerunterladen}
        pdfLaeuft={pdfLaeuft}
        investagon={investagon}
        // Nur im Exposé für einen Kunden steht der Partner oben über den Bildern.
        kundenAnsprechpartner={kunde ? ansprechpartner : undefined}
      />
    </SeitenSpracheProvider>
  );
}
