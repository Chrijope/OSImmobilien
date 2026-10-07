import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ObjektseiteZugang } from "@/components/objektseite/ObjektseiteZugang";
import { KundenansichtSeite, KundenHinweisSeite, KundenLaden } from "@/components/kundenansicht/KundenansichtSeite";
import { ladeDateiAdresse, ladeKundenansicht, type KundenansichtZugang, type LadeErgebnis } from "@/lib/kundenansichtDaten";
import type { DokumentVerweis } from "../../supabase/functions/get-kundenansicht/antwort.ts";
import { vorschauAuswahlAusSuche } from "@/lib/kundenansichtZiel";
import { useSeitenSprache } from "@/lib/seitenSprache";
import { SeitenSpracheProvider } from "@/lib/seitenSpracheKontext";

/**
 * „Als Kunde ansehen“: die Kundenansicht im Termin.
 *
 * Adressen `/objekte/:id/kundenansicht` (Haus) und
 * `/objekte/:id/einheiten/:weId/kundenansicht` (Wohnung), dazu optional
 * `?investmentId=<Investment>`. So öffnen sie der Dialog „Kundenlink senden“,
 * die Knöpfe und die Umleitungen der alten Kundenansicht; `?empfehlung=` aus
 * der Objektauswahl gilt genauso. Dann steht der zuständige Partner des
 * Kunden im Kasten, sonst du, und „für dich reserviert“ gilt für diesen
 * Kunden.
 *
 * Dieselbe Seite und dieselben Daten wie der Kundenlink: Die Daten kommen von
 * `get-kundenansicht`, nie aus dem Zwischenspeicher des CRM. Was du im Termin
 * zeigst, ist genau das, was der Kunde bekommt. Es entsteht kein Link, es
 * wird nichts gezählt und keine Glocke läutet.
 *
 * Ohne CRM-Leiste (die Route liegt außerhalb der `AppShell`), damit sich die
 * Seite dem Kunden direkt zeigen lässt. Sehen dürfen sie seit dem 05.10.2026
 * alle, die auch die Einheitsseite sehen (`ObjektseiteZugang`), also auch
 * Vertriebsleitung und freigeschaltete Vertriebspartner; der Server prüft die
 * Rolle noch einmal selbst und gibt den Kundenbezug nur für eigene Kunden.
 */
export default function KundenansichtVorschau() {
  const { id = "", weId } = useParams<{ id: string; weId?: string }>();
  return (
    <ObjektseiteZugang verwaltungPfad={weId ? `/objekte/${id}/wohnung/${weId}` : `/objekte/${id}/verwaltung`} mitVertriebsleitung>
      <VorschauInhalt id={id} weId={weId ?? null} />
    </ObjektseiteZugang>
  );
}

function VorschauInhalt({ id, weId }: { id: string; weId: string | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const suche = new URLSearchParams(location.search);
  const investmentId = suche.get("investmentId") || suche.get("empfehlung") || null;
  // Aus „Kundenlink senden“: nur die dort gewählten Wohnungen, wie später der Link.
  const auswahlText = vorschauAuswahlAusSuche(suche)?.join(",") ?? null;
  /*
   * Die Wohnung, bei der die Vorschau einsteigt. Nur sie kann „für dich
   * reserviert“ sein, wie beim Kundenlink. Ein späterer Wechsel lädt nichts
   * nach und ändert den Einstieg nicht.
   */
  const einstieg = useRef(weId);
  const zugang = useMemo<KundenansichtZugang>(
    () => ({ art: "vorschau", objektId: id, wohnungId: einstieg.current, investmentId, wohnungAuswahl: auswahlText ? auswahlText.split(",") : null }),
    [id, investmentId, auswahlText],
  );

  const [ergebnis, setErgebnis] = useState<LadeErgebnis | null>(null);
  const [versuch, setVersuch] = useState(0);
  useEffect(() => {
    const abbruch = new AbortController();
    setErgebnis(null);
    ladeKundenansicht(zugang, { signal: abbruch.signal })
      .then((e) => { if (!abbruch.signal.aborted) setErgebnis(e); })
      .catch(() => { /* abgebrochen */ });
    return () => abbruch.abort();
  }, [zugang, versuch]);

  const dateiLaden = useCallback((verweis: DokumentVerweis) => ladeDateiAdresse(zugang, verweis), [zugang]);
  const onWohnung = useCallback(
    (w: string) => navigate(`/objekte/${encodeURIComponent(id)}/einheiten/${encodeURIComponent(w)}/kundenansicht${location.search}`),
    [navigate, id, location.search],
  );
  const onHaus = useCallback(() => navigate(`/objekte/${encodeURIComponent(id)}/kundenansicht${location.search}`), [navigate, id, location.search]);

  // Mit Kunde zeigt die Vorschau seine Sprache aus dem Kundenprofil, sonst Deutsch (05.10.2026).
  const sprache = useSeitenSprache(ergebnis?.art === "ok" ? ergebnis.daten.sprache : undefined);

  if (!ergebnis) return <KundenLaden />;
  if (ergebnis.art === "vergeben") {
    return <KundenHinweisSeite titel="Diese Immobilie ist inzwischen vergeben" text="Dein Ansprechpartner zeigt dir gern Alternativen." partner={ergebnis.partner} />;
  }
  if (ergebnis.art === "hinweis") return <KundenHinweisSeite titel="Die Kundenansicht ist gerade nicht möglich" text={ergebnis.meldung} />;
  if (ergebnis.art === "nicht_gefunden") return <KundenHinweisSeite titel="Objekt nicht gefunden" text="Dieses Objekt gibt es nicht mehr." />;
  if (ergebnis.art !== "ok") {
    return <KundenHinweisSeite titel="Die Seite lässt sich gerade nicht laden" text="Bitte versuche es gleich noch einmal." onErneut={() => setVersuch((n) => n + 1)} />;
  }
  return (
    <SeitenSpracheProvider sprache={sprache}>
      <KundenansichtSeite
        daten={ergebnis.daten}
        wohnungId={weId}
        dateiLaden={dateiLaden}
        onWohnung={onWohnung}
        onHaus={onHaus}
      />
    </SeitenSpracheProvider>
  );
}
