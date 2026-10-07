import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useNoIndex } from "@/hooks/useNoIndex";
import { LinkNichtMehrGueltig } from "@/components/expose/LinkNichtMehrGueltig";
import { KundenansichtSeite, KundenHinweisSeite, KundenLaden } from "@/components/kundenansicht/KundenansichtSeite";
import { ladeDateiAdresse, ladeKundenansicht, type KundenansichtZugang, type LadeErgebnis } from "@/lib/kundenansichtDaten";
import type { DokumentVerweis } from "../../supabase/functions/get-kundenansicht/antwort.ts";
import { KUNDENANSICHT_TEXTE } from "@/components/kundenansicht/kundenansichtTexte";
import { texteFuer, useSeitenSprache } from "@/lib/seitenSprache";
import { SeitenSpracheProvider } from "@/lib/seitenSpracheKontext";

/** So sieht ein Schlüssel aus: 32 Byte als Hex. Alles andere geht gar nicht erst hinaus. */
const TOKEN_FORM = /^[0-9a-f]{64}$/i;

/** Merker im Verlauf: Der Kunde hat die Hausübersicht selbst gewählt. */
interface HausZustand { haus?: boolean }

/**
 * Der Kundenlink zur Objektübersicht: `/immobilie/:token`, eine Wohnung unter
 * `/immobilie/:token/wohnung/:weId`. Ohne Anmeldung, ohne Cookie, nicht in
 * Suchmaschinen (`useNoIndex`).
 *
 * Der Link steigt bei der Wohnung ein, aus der er gesendet wurde. Das
 * entscheidet der Server (`einstieg_wohnung_id`), die Adresse trägt nur den
 * Schlüssel. Beim ersten Öffnen ohne Wohnung in der Adresse springt die Seite
 * deshalb zur Einstiegswohnung, solange sie frei ist. Wer danach selbst „Zur
 * Hausübersicht“ wählt, bleibt dort.
 *
 * Gezählt wird nur das erste Laden. Der Wechsel zwischen Wohnungen lädt
 * nichts nach, und `?vorschau=1` (der Partner öffnet den Link aus dem
 * Kundenprofil) zählt nie.
 *
 * Sprache (Kundensprache, Etappe 3): `get-kundenansicht` schickt `sprache`
 * aus dem Kundenprofil mit, `?lang=en|de` überschreibt nur die Anzeige.
 * Ohne beides Deutsch. Der Ladezustand ist deutsch, solange die Antwort
 * fehlt, außer `?lang=` sagt etwas anderes.
 */
export default function KundenansichtPublic() {
  useNoIndex();
  const { token = "", weId } = useParams<{ token: string; weId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const tokenGueltig = TOKEN_FORM.test(token);
  const vorschau = new URLSearchParams(location.search).get("vorschau") === "1";
  const zugang = useMemo<KundenansichtZugang>(() => ({ art: "link", token }), [token]);

  const [ergebnis, setErgebnis] = useState<LadeErgebnis | null>(null);
  const [versuch, setVersuch] = useState(0);
  // Der Schlüssel, dessen Aufruf schon gezählt ist. Ein zweites Laden (Erneut laden) zählt nicht noch einmal.
  const gezaehlt = useRef<string | null>(null);

  useEffect(() => {
    if (!tokenGueltig) {
      setErgebnis({ art: "nicht_gefunden" });
      return;
    }
    const abbruch = new AbortController();
    setErgebnis(null);
    const aufruf = !vorschau && gezaehlt.current !== token;
    ladeKundenansicht(zugang, { aufruf, signal: abbruch.signal })
      .then((e) => {
        if (abbruch.signal.aborted) return;
        if (aufruf && e.art !== "fehler") gezaehlt.current = token;
        setErgebnis(e);
      })
      .catch(() => { /* abgebrochen */ });
    return () => abbruch.abort();
    // `vorschau` nur beim ersten Laden: Ein späterer Wechsel der Adresse lädt nicht neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tokenGueltig, zugang, versuch]);

  const dateiLaden = useCallback((verweis: DokumentVerweis) => ladeDateiAdresse(zugang, verweis), [zugang]);
  const basis = `/immobilie/${encodeURIComponent(token)}`;
  const onWohnung = useCallback((id: string) => navigate(`${basis}/wohnung/${encodeURIComponent(id)}${location.search}`), [navigate, basis, location.search]);
  const serverSprache = ergebnis && "sprache" in ergebnis ? ergebnis.sprache : ergebnis?.art === "ok" ? ergebnis.daten.sprache : undefined;
  const sprache = useSeitenSprache(serverSprache);
  const t = texteFuer(KUNDENANSICHT_TEXTE, sprache).seite;
  const onHaus = useCallback(() => navigate(`${basis}${location.search}`, { state: { haus: true } satisfies HausZustand }), [navigate, basis, location.search]);

  // Alle Bausteine darunter lesen die Sprache aus dem Kontext.
  const mitSprache = (inhalt: JSX.Element) => <SeitenSpracheProvider sprache={sprache}>{inhalt}</SeitenSpracheProvider>;

  if (!ergebnis) return mitSprache(<KundenLaden />);
  if (ergebnis.art === "abgelaufen") return <LinkNichtMehrGueltig ansprechpartner={ergebnis.partner} art="objektuebersicht" sprache={sprache} />;
  if (ergebnis.art === "vergeben") {
    return mitSprache(
      <KundenHinweisSeite titel={t.vergebenTitel} text={t.vergebenText} partner={ergebnis.partner} />,
    );
  }
  if (ergebnis.art === "nicht_gefunden") {
    return mitSprache(<KundenHinweisSeite titel={t.nichtGefundenTitel} text={t.nichtGefundenText} />);
  }
  if (ergebnis.art !== "ok") {
    return mitSprache(
      <KundenHinweisSeite titel={t.fehlerTitel} text={t.fehlerText} onErneut={() => setVersuch((n) => n + 1)} />,
    );
  }

  const daten = ergebnis.daten;
  const hausGewaehlt = (location.state as HausZustand | null)?.haus === true;

  // Globalobjekt: nur das Haus. Einzelobjekt: nur die eine Wohnung, ohne Wohnung in der Adresse.
  if (weId && (daten.struktur === "globalobjekt" || daten.struktur === "einzelwohnung")) {
    return <Navigate to={`${basis}${location.search}`} replace />;
  }
  // Erstes Öffnen: zur Einstiegswohnung, solange sie frei oder für diesen Kunden reserviert ist.
  const einstieg = daten.einstieg;
  if (!weId && !hausGewaehlt && daten.struktur === "mehrere_einheiten" && einstieg.wohnungId
    && (einstieg.zustand === "frei" || einstieg.zustand === "fuer_dich_reserviert")) {
    return <Navigate to={`${basis}/wohnung/${encodeURIComponent(einstieg.wohnungId)}${location.search}`} replace />;
  }

  return mitSprache(
    <KundenansichtSeite
      daten={daten}
      wohnungId={weId ?? null}
      einstiegVergeben={!weId && !hausGewaehlt && einstieg.zustand === "vergeben"}
      dateiLaden={dateiLaden}
      onWohnung={onWohnung}
      onHaus={onHaus}
    />,
  );
}
