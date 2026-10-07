/**
 * Der Konfigurator der Handbuch-Seite als eigene Seite (Wizard).
 *
 * /handbuch/konfigurator          ohne Partner, Leads in die Lead-Verwaltung
 * /handbuch/:slug/konfigurator    mit Partner, Leads gehören ihm
 *
 * Seit dem 26.09.2026 steht der Konfigurator nicht mehr im Einstieg der
 * Landingpage, sondern hier: eine Frage je Schritt, Fortschritt, Zurück,
 * große Kacheln, am Ende die Kontaktdaten. Die Landingpage verlinkt an
 * mehreren Stellen hierher und hängt dabei die Adresszeile an, damit die
 * Kampagnenkennung (UTM) auch nach einem Neuladen noch da ist. Das Kürzel
 * steht im Pfad und entscheidet wie bisher allein auf dem Server.
 */
import "@/styles/handbuchSeite.css";
import "@/styles/handbuchSeiteLiquid.css";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Konfigurator, { type KonfiguratorErgebnis } from "@/components/handbuch/Konfigurator";
import { HandbuchFuss, HandbuchKopf, useBeraterAusKuerzel } from "@/components/handbuch/Rahmen";
import { useHandbuchThema, useSeitenTitel } from "@/components/handbuch/teile";
import { SeitenSpracheProvider, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { useMetaPixelMitEinwilligung } from "@/hooks/useMetaPixelMitEinwilligung";
import { zaehleHandbuch } from "@/lib/handbuch/ereignisse";
import { handbuchStartseite, konfiguratorPfad } from "@/lib/handbuch/wege";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { Vertrauen, type HandbuchErgebnisZustand } from "./HandbuchLanding";

export default function HandbuchKonfigurator() {
  return (
    <SeitenSpracheProvider>
      <Wizard />
    </SeitenSpracheProvider>
  );
}

function Wizard() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const thema = useHandbuchThema();
  const sprache = useSeitenSprache();
  const T = useSeitenTexte(HANDBUCH_SEITEN_TEXTE);
  const stand = useBeraterAusKuerzel(slug);
  const berater = stand.status === "ok" ? stand.berater : null;
  const beraterId = berater?.userId || null;

  useSeitenTitel(T.wizard.titel(berater?.name ?? ""), T.wizard.beschreibung);
  useMetaPixelMitEinwilligung(berater);

  // Anzeigen können direkt hierher führen. Wer von der Landingpage kommt, ist
  // schon gezählt; der Zähler zählt je Sitzung nur einmal.
  useEffect(() => {
    if (stand.status === "laden") return;
    void zaehleHandbuch("hb_seite_geoeffnet", beraterId);
  }, [stand.status, beraterId]);

  const fertig = (e: KonfiguratorErgebnis) => {
    const zustand: HandbuchErgebnisZustand = { ...e, beraterSlug: berater?.slug ?? slug ?? null };
    // Ohne Token in der Adresse, Begründung in HandbuchLanding (Meta Pixel).
    // Die Sprache wandert in der Adresse mit (`?lang=en`).
    navigate(mitSeitenSprache("/handbuch/ergebnis/neu", sprache), { state: zustand });
  };

  return (
    <div className="hb" data-thema={thema}>
      <HandbuchKopf thema={thema} berater={berater} anker={false} startseite={handbuchStartseite(slug)} />
      <main className="hb-wizard-seite">
        <div className="hb-wrap">
          <div className="einleitung">
            <span className="hb-augenbraue">{T.wizard.augenbraue}</span>
            <h1>{T.wizard.h1}</h1>
            <p>{T.wizard.lead}</p>
          </div>
          <Konfigurator beraterSlug={berater?.slug ?? slug ?? null} beraterId={beraterId} onFertig={fertig} ohneBuch />
          <Vertrauen texte={T.vertrauen} stil={{ marginTop: 18 }} />
        </div>
      </main>
      <HandbuchFuss startseite={handbuchStartseite(slug)} konfigurator={konfiguratorPfad(slug)} />
    </div>
  );
}
