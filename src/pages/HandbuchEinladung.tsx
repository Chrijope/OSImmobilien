/**
 * /handbuch-einladung/:token, der persönliche Link aus der Willkommensmail
 * (seit 30.09.2026).
 *
 * Wie der Konfigurator (HandbuchKonfigurator.tsx), aber für einen Lead, den
 * es schon gibt: sechs Fragen, dann nur eine Bestätigung statt des
 * Kontaktformulars. Bewusst außerhalb von /handbuch/:slug, damit „einladung“
 * nicht als Partnerkürzel gesperrt werden muss, und ohne Meta Pixel: Das
 * Token steht in der Adresse, und ein bekannter Kontakt ist kein neuer Lead.
 */
import "@/styles/handbuchSeite.css";
import "@/styles/handbuchSeiteLiquid.css";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Konfigurator, { type KonfiguratorErgebnis } from "@/components/handbuch/Konfigurator";
import { HandbuchFuss, HandbuchKopf, useBeraterAusKuerzel } from "@/components/handbuch/Rahmen";
import { useHandbuchThema, useSeitenTitel } from "@/components/handbuch/teile";
import { SeitenSpracheProvider, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { EINLADUNG_TEXTE, ladeEinladung, type EinladungStand } from "@/lib/handbuch/einladung";
import { handbuchStartseite, konfiguratorPfad } from "@/lib/handbuch/wege";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { Vertrauen, type HandbuchErgebnisZustand } from "./HandbuchLanding";

export default function HandbuchEinladung() {
  return (
    <SeitenSpracheProvider>
      <Seite />
    </SeitenSpracheProvider>
  );
}

function Seite() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const thema = useHandbuchThema();
  const sprache = useSeitenSprache();
  const T = useSeitenTexte(HANDBUCH_SEITEN_TEXTE);
  const E = EINLADUNG_TEXTE[sprache === "en" ? "en" : "de"];
  const [stand, setStand] = useState<EinladungStand>({ status: "laden" });
  const slug = stand.status === "ok" ? stand.beraterSlug : null;
  const beraterStand = useBeraterAusKuerzel(slug ?? undefined);
  const berater = beraterStand.status === "ok" ? beraterStand.berater : null;

  useSeitenTitel(T.wizard.titel(berater?.name ?? ""), T.wizard.beschreibung);

  useEffect(() => {
    let aktiv = true;
    void ladeEinladung(token).then((s) => { if (aktiv) setStand(s); });
    return () => { aktiv = false; };
  }, [token]);

  const fertig = (e: KonfiguratorErgebnis) => {
    const zustand: HandbuchErgebnisZustand = { ...e, beraterSlug: slug };
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
            <p>{E.lead}</p>
          </div>
          {stand.status === "laden" && <p className="hb-klein">{E.laedt}</p>}
          {(stand.status === "abgelaufen" || stand.status === "unbekannt") && (
            <div className="hb-konfig hb-karte">
              <p>{stand.status === "abgelaufen" ? E.fehlerAbgelaufen : E.fehlerUnbekannt}</p>
              <a className="hb-knopf hb-orange" href={mitSeitenSprache(konfiguratorPfad(), sprache)}>
                {E.zumFragebogen}
              </a>
            </div>
          )}
          {stand.status === "ok" && (
            <Konfigurator
              beraterSlug={slug}
              beraterId={berater?.userId || null}
              onFertig={fertig}
              ohneBuch
              einladung={stand.daten}
            />
          )}
          <Vertrauen texte={T.vertrauen} stil={{ marginTop: 18 }} />
        </div>
      </main>
      <HandbuchFuss startseite={handbuchStartseite(slug)} konfigurator={konfiguratorPfad(slug)} />
    </div>
  );
}
