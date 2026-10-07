/**
 * Der Einstieg in die Selbstauskunft aus dem Handbuch, ohne Kontaktformular.
 *
 * /handbuch/ergebnis/:token/selbstauskunft
 *
 * Hierhin führen der Knopf im PDF und, ohne eigenen Link der Sitzung, der
 * Knopf auf der Ergebnisseite. Die Seite holt sich zum Handbuch-Token einen
 * frischen Ausfüll-Link für den Lead dieses Handbuchs und springt sofort in
 * die Selbstauskunft (`/sa/:token`). Beim Abschluss aktualisiert
 * `finalize-selbstauskunft` diesen Lead, samt Zuständigkeit und Glocke; ein
 * zweiter Kontakt entsteht nicht. Siehe `lib/handbuch/saStart.ts`.
 *
 * Nur wenn das Handbuch abgelaufen oder unbekannt ist, bleibt die offene
 * Selbstauskunft mit ihrem kurzen Kontaktschritt: Dann ist kein Lead bekannt.
 *
 * Kein Meta Pixel: Die Adresse trägt das Handbuch-Token (`metaPixel.ts`).
 */
import "@/styles/handbuchSeite.css";
import "@/styles/handbuchSeiteLiquid.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { HandbuchFuss, HandbuchKopf } from "@/components/handbuch/Rahmen";
import { useHandbuchThema, useSeitenTitel } from "@/components/handbuch/teile";
import { SeitenSpracheProvider, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { starteHandbuchSelbstauskunft, type SaStart } from "@/lib/handbuch/saStart";
import { offeneSelbstauskunftPfad, saTokenPfad } from "@/lib/handbuch/wege";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";
import { mitSeitenSprache } from "@/lib/seitenSprache";

export default function HandbuchSelbstauskunftStart() {
  return (
    <SeitenSpracheProvider>
      <Start />
    </SeitenSpracheProvider>
  );
}

function Start() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const thema = useHandbuchThema();
  const sprache = useSeitenSprache();
  const T = useSeitenTexte(HANDBUCH_SEITEN_TEXTE);
  const S = T.saStart;
  const [stand, setStand] = useState<SaStart | null>(null);
  // Jeder Aufruf legt einen Link an: nur einmal je Seitenaufruf, auch wenn
  // React den Effekt im Entwicklungsmodus doppelt ausführt.
  const gestartet = useRef(false);

  useSeitenTitel(S.titel);

  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    void starteHandbuchSelbstauskunft(token).then((r) => {
      if (r.status === "ok") navigate(mitSeitenSprache(saTokenPfad(r.saToken), sprache), { replace: true });
      else setStand(r);
    });
  }, [token, navigate, sprache]);

  const zurSeite = (
    <a className="hb-knopf hb-zweit" href={mitSeitenSprache("/handbuch", sprache)}>
      {S.zurSeite}
    </a>
  );

  let inhalt: JSX.Element;
  if (!stand || stand.status === "ok") {
    inhalt = (
      <p style={{ display: "flex", gap: 10, alignItems: "center", color: "#fff" }} role="status">
        <Loader2 className="animate-spin" aria-hidden="true" /> {S.laedt}
      </p>
    );
  } else if (stand.status === "liegtVor") {
    inhalt = (
      <>
        <span className="hb-augenbraue">{S.augenbraue}</span>
        <h1>{S.liegtVorTitel}</h1>
        <p className="hb-lead" style={{ color: "#C3CEDC" }}>
          {S.liegtVorText}
        </p>
        {zurSeite}
      </>
    );
  } else if (stand.status === "abgelaufen" || stand.status === "unbekannt") {
    inhalt = (
      <>
        <span className="hb-augenbraue">{S.augenbraue}</span>
        <h1>{S.abgelaufenTitel}</h1>
        <p className="hb-lead" style={{ color: "#C3CEDC" }}>
          {S.abgelaufenText}
        </p>
        <a className="hb-knopf hb-orange" href={mitSeitenSprache(offeneSelbstauskunftPfad(null), sprache)}>
          {S.ausfuellen} <ArrowRight aria-hidden="true" />
        </a>
      </>
    );
  } else {
    inhalt = (
      <>
        <span className="hb-augenbraue">{S.augenbraue}</span>
        <p className="hb-lead" style={{ color: "#C3CEDC" }} role="alert">
          {stand.status === "zuOft" ? S.zuOftText : S.fehlerText}
        </p>
        {zurSeite}
      </>
    );
  }

  return (
    <div className="hb" data-thema={thema}>
      <HandbuchKopf thema={thema} anker={false} />
      <section className="hb-ergebnis-kopf">
        <div className="hb-wrap" style={{ maxWidth: 760 }}>
          {inhalt}
        </div>
      </section>
      <HandbuchFuss />
    </div>
  );
}
