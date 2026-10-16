import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import { cacheGetById } from "@/lib/dataCache";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { baueExposeInhalt, sichtbareZeilen } from "@/lib/exposeInhalt";
import { useKundenSprache } from "@/lib/kundenSprache";
import { STANDARD_SPRACHE } from "@/lib/seitenSprache";
import { SeitenSpracheProvider } from "@/lib/seitenSpracheKontext";
import { empfehlungAusSuche, kundenRueckwegAusSuche, mitEmpfehlung, mitRueckweg } from "@/lib/empfehlungAuswahl";
import { englischeObjektTexteAnfordern, englischeObjektTexteFehlen, OBJEKT_TEXTE_EN_META_SCHLUESSEL } from "@/lib/objektTexteKi";
import { KUNDENANSICHT_PARAM, KUNDENANSICHT_WERT, type ExposeKunde } from "@/lib/objektExposeStore";
import { wieImKundenlink } from "@/lib/exposePublicDaten";
import { ObjektseiteZugang } from "@/components/objektseite/ObjektseiteZugang";
import { ExposeAnsicht } from "@/components/expose/ExposeAnsicht";
import { investagonErgaenzung, ohneWidersprueche, zeilenErgaenzen } from "@/components/expose/exposeInvestagon";
import { useExposeAnsprechpartner, useExposeKunde, useExposeObjekt, useExposeStandort, useGrundrissAdressen } from "@/components/expose/useExposeObjekt";
import { ObjektExposeGesamt } from "./ObjektExposeGesamt";

/**
 * Das Exposé je Wohneinheit, interne Ansicht.
 *
 * Adresse `/objekte/:id/einheiten/:weId/expose`, optional `?kunde=` für den
 * Kunden. Zugang wie die
 * Einheiten-Seite. Die Seite läuft bewusst ohne CRM-Rahmen: Die Route liegt
 * außerhalb der `AppShell` (wie „Als Kunde ansehen“), und jeder Weg hierher
 * öffnet einen eigenen Tab. Sie zeigt, was der Kunde später über den Link
 * sieht, plus eine schmale Vorschau-Leiste, von der aus „Zur Einheit im
 * CRM“ im selben Tab zurück ins CRM führt. Den Rechner mit „Annahmen
 * speichern“ gibt es seit dem 16.10.2026 nicht mehr.
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

  return <ExposeSeite objekt={objektMitAdressen} wohnung={wohnung} kunde={kunde} kundenansicht={kundenansicht} />;
}

/**
 * `kundenansicht`: die Vorschau aus „Exposé für Kunden“ (`?ansicht=kunde`).
 * Sie zeigt, was der Kunde über seinen Link sieht: keine interne Leiste
 * („Zur Einheit im CRM“, „Vorschau ohne Kunden“) und den Partner oben im
 * Kasten. Ohne den Schalter bleibt „Exposé anzeigen“ die interne Ansicht.
 */
function ExposeSeite({ objekt: objektGeladen, wohnung, kunde, kundenansicht = false }: { objekt: ObjektData; wohnung: ObjektWohnung; kunde: ExposeKunde | null; kundenansicht?: boolean }) {
  const { user } = useUser();
  const [params] = useSearchParams();

  /*
   * Die Sprache des Exposés: mit Kunde seine Sprache aus dem Kundenprofil,
   * ohne Kunde Deutsch. Nie eine Einstellung des Mitarbeiters.
   *
   * Bis zum 25.09.2026 blieb diese Seite immer deutsch, nur das PDF folgte
   * dem Kunden. Christians Entscheidung vom 25.09.2026: Wer aus dem
   * Kundenprofil über die Objektauswahl kommt, arbeitet im Kundenbezug, und
   * dann zeigt schon die Seite das Exposé so, wie der Kunde es bekommt. Die
   * Leiste für den Mitarbeiter (Kopf und Rückwege) bleibt deutsch.
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

  const [pdfLaeuft, setPdfLaeuft] = useState(false);

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

  /**
   * PDF bauen und als Datei laden. Bewusst nur der Download, keine Ablage
   * unter den Dokumenten der Einheit, sonst entstehen bei jedem Klick
   * Dubletten.
   */
  const pdfHerunterladen = async () => {
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
        {
          sprache,
          erstelltAm: heute,
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

  // Die Exposé-Bausteine lesen die Sprache über den Kontext (`useAnzeigeSprache`).
  if (kundenansicht) {
    return (
      <SeitenSpracheProvider sprache={sprache}>
        <ExposeAnsicht
          inhalt={inhalt}
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
        kopfRechts={kopfRechts}
        leisteObenLinks={leisteObenLinks}
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
