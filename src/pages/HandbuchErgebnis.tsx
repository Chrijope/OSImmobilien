/**
 * Das Ergebnis des Konfigurators: das persönliche Immobilienhandbuch.
 *
 * /handbuch/ergebnis/:token
 *
 * Zwei Wege hierher:
 *   - direkt nach dem Absenden. Die Antworten kommen im Zustand der Navigation
 *     mit, die Seite rechnet das Handbuch sofort im Browser. Das klappt auch,
 *     wenn die Migration noch nicht gelaufen ist (dann heißt das Token „neu“);
 *   - über den Link in der Mail. Dann lädt die Seite die Antworten über das
 *     Token (`handbuch_abrufen`) und rechnet dasselbe Handbuch neu.
 *
 * Das Token ist 64 Zeichen Zufall, persönlich und nicht erratbar. In der
 * Adresse steht sonst nichts Persönliches.
 */
import "@/styles/handbuchSeite.css";
import "@/styles/handbuchSeiteLiquid.css";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ArrowRight, Check, Download, Loader2, Mail } from "lucide-react";
import HandbuchAnsicht from "@/components/handbuch/HandbuchAnsicht";
import Agenda from "@/components/handbuch/Agenda";
import { HandbuchFuss, HandbuchKopf, useBeraterAusKuerzel } from "@/components/handbuch/Rahmen";
import { anteilig, Hochzaehlen, useEinblenden, useHandbuchThema, useSeitenTitel } from "@/components/handbuch/teile";
import { SeitenSpracheProvider, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { baueHandbuch } from "@/lib/handbuch/inhalt";
import { ladeHandbuch, merkePdfGespeichert, type HandbuchAbruf } from "@/lib/handbuch/abruf";
import { handbuchAuswertung } from "@/lib/handbuch/modell";
import { handbuchStartseite, konfiguratorPfad, saWege } from "@/lib/handbuch/wege";
import { zaehleHandbuch } from "@/lib/handbuch/ereignisse";
import { antwortTextIn, rahmenTextIn } from "@/lib/handbuch/fragenSprache";
import { euroIn } from "@/lib/handbuch/diagramme";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";
import { datumText as datumInSprache } from "@/lib/sprachFormat";
import { mitSeitenSprache, type Sprache } from "@/lib/seitenSprache";
import { hinweisDialog } from "@/lib/confirm";
import { leseFrischesErgebnis, merkeFrischesErgebnis } from "@/lib/handbuch/ergebnisSitzung";
import {
  ermittleAusgang,
  handbuchRahmen,
  istHandbuchToken,
  type HandbuchAntworten,
} from "../../supabase/functions/_shared/handbuch-funnel.ts";
import type { HandbuchErgebnisZustand } from "./HandbuchLanding";

interface Daten {
  antworten: HandbuchAntworten;
  vorname: string;
  nachname: string;
  datum: string;
  beraterSlug: string | null;
  saToken: string | null;
  saStatus: "offen" | "ausgefuellt" | "abgelaufen" | null;
  gespeichert: boolean;
  frisch: boolean;
}

function datumText(iso: string | null, sprache: Sprache): string {
  const roh = iso ? new Date(iso) : new Date();
  const d = Number.isNaN(roh.getTime()) ? new Date() : roh;
  return sprache === "en" ? datumInSprache(d, "en") : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function HandbuchErgebnis() {
  return (
    <SeitenSpracheProvider>
      <Ergebnis />
    </SeitenSpracheProvider>
  );
}

function Ergebnis() {
  const { token = "" } = useParams<{ token: string }>();
  const location = useLocation();
  const thema = useHandbuchThema();
  const sprache = useSeitenSprache();
  const T = useSeitenTexte(HANDBUCH_SEITEN_TEXTE);
  const E = T.ergebnis;
  const ausNavigation = (location.state ?? null) as HandbuchErgebnisZustand | null;
  // Nach Neuladen fehlt der Navigationszustand; dann das in dieser Sitzung
  // gemerkte frische Ergebnis (nur unter „neu“, echte Tokens laden selbst).
  const zustand = useMemo(
    () => (ausNavigation?.antworten ? ausNavigation : token === "neu" ? leseFrischesErgebnis() : null),
    [ausNavigation, token],
  );
  useEffect(() => {
    if (ausNavigation?.antworten) merkeFrischesErgebnis(ausNavigation);
  }, [ausNavigation]);
  const [abruf, setAbruf] = useState<HandbuchAbruf | { status: "laden" } | null>(null);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);

  useSeitenTitel(E.titel);

  // Frisch aus dem Konfigurator? Dann nicht laden, sondern gleich zeigen.
  const frisch = !!zustand && !!zustand.antworten;

  useEffect(() => {
    if (frisch) return;
    if (!istHandbuchToken(token)) {
      setAbruf({ status: "unbekannt" });
      return;
    }
    let abgebrochen = false;
    setAbruf({ status: "laden" });
    ladeHandbuch(token).then((r) => {
      if (!abgebrochen) setAbruf(r);
    });
    return () => {
      abgebrochen = true;
    };
  }, [frisch, token]);

  const daten: Daten | null = useMemo(() => {
    if (frisch && zustand) {
      return {
        antworten: zustand.antworten,
        vorname: zustand.vorname,
        nachname: zustand.nachname,
        datum: datumText(null, sprache),
        beraterSlug: zustand.beraterSlug,
        saToken: zustand.saToken,
        saStatus: zustand.saToken ? "offen" : null,
        gespeichert: !!zustand.handbuchToken,
        frisch: true,
      };
    }
    if (abruf && abruf.status === "ok") {
      return {
        antworten: abruf.antworten,
        vorname: abruf.vorname,
        nachname: abruf.nachname,
        datum: datumText(abruf.erstelltAm, sprache),
        beraterSlug: abruf.beraterSlug,
        saToken: abruf.saToken,
        saStatus: abruf.saStatus,
        gespeichert: true,
        frisch: false,
      };
    }
    return null;
  }, [frisch, zustand, abruf, sprache]);

  const stand = useBeraterAusKuerzel(daten?.beraterSlug ?? null);
  const berater = stand.status === "ok" ? stand.berater : null;
  const beraterId = berater?.userId || null;
  // Kein Meta Pixel auf dieser Seite: Die Adresse trägt das persönliche
  // Token, und das Pixel meldet Seitenaufrufe mit der vollen Adresse
  // (Sicherheitsprüfung vom 26.09.2026).

  useEffect(() => {
    if (daten && !daten.frisch && stand.status !== "laden") void zaehleHandbuch("hb_handbuch_geoeffnet", beraterId);
  }, [daten, stand.status, beraterId]);

  // Das Token dieses Handbuchs, falls gespeichert: für den Vermerk „PDF
  // gespeichert“ und den Einstieg in die Selbstauskunft.
  const handbuchToken = zustand?.handbuchToken ?? (istHandbuchToken(token) ? token : null);

  /*
   * Der Weg zur Selbstauskunft, seit dem 28.09.2026 ohne Kontaktformular,
   * wenn der Lead bekannt ist (`saWege`). Auf dem Bildschirm der eigene Link
   * dieser Sitzung, sonst der Einstieg über das Handbuch-Token; im PDF nie der
   * eigene Link, weil ein weitergegebenes PDF sonst den angefangenen Stand
   * öffnete. Ohne Knopf auf dem Bildschirm kommt der Link per E-Mail.
   */
  const wege = daten
    ? saWege({ saToken: daten.saToken, handbuchToken, saStatus: daten.saStatus, beraterSlug: daten.beraterSlug })
    : { bildschirm: null, pdf: null };
  const absolut = (pfad: string | null) => (pfad ? `${window.location.origin}${mitSeitenSprache(pfad, sprache)}` : null);
  const saLink = absolut(wege.bildschirm);
  const saLinkPdf = absolut(wege.pdf);
  const saPerMail = !!daten && !saLink && daten.saStatus !== "ausgefuellt";

  const grundAngaben = useMemo(() => {
    if (!daten) return null;
    return {
      antworten: daten.antworten,
      vorname: daten.vorname,
      nachname: daten.nachname,
      datum: daten.datum,
      partner: berater ? { name: berater.name, email: berater.email, telefon: berater.telefon, buchungslink: berater.buchungslink } : null,
      sprache,
    };
  }, [daten, berater, sprache]);

  const handbuch = useMemo(
    () => (grundAngaben ? baueHandbuch({ ...grundAngaben, saLink, saPerMail }) : null),
    [grundAngaben, saLink, saPerMail],
  );

  // Die Kapitel blenden beim Lesen einmal ein, sobald das Handbuch steht.
  useEinblenden(".hb-buch-seite", handbuch);

  const saStart = () => void zaehleHandbuch("hb_sa_gestartet", beraterId);

  const pdfSpeichern = async () => {
    if (!handbuch || !grundAngaben) return;
    setPdfLaeuft(true);
    try {
      // Erst beim Klick laden: jsPDF und der Satz sind groß und werden auf
      // der Seite sonst nicht gebraucht.
      const { ladeHandbuchPdfHerunter } = await import("@/lib/handbuch/handbuchPdf");
      // Das PDF mit seinem eigenen Link, siehe `saWege`.
      await ladeHandbuchPdfHerunter(baueHandbuch({ ...grundAngaben, saLink: saLinkPdf }));
      void zaehleHandbuch("hb_pdf_geladen", beraterId);
      // Am Lead vermerken, für den Stand in der Lead-Verwaltung. Ohne
      // Migration oder ohne gespeichertes Handbuch geschieht einfach nichts.
      if (handbuchToken) void merkePdfGespeichert(handbuchToken);
    } catch (e) {
      console.error("Handbuch-PDF:", e);
      await hinweisDialog({ title: E.pdfFehlerTitel, description: E.pdfFehlerText, buttonText: E.pdfFehlerKnopf });
    } finally {
      setPdfLaeuft(false);
    }
  };

  // ─── Zustände ohne Handbuch ──────────────────────────────────────────
  if (!daten) {
    const laedt = !abruf || abruf.status === "laden";
    return (
      <div className="hb" data-thema={thema}>
        <HandbuchKopf thema={thema} anker={false} />
        <section className="hb-ergebnis-kopf">
          <div className="hb-wrap" style={{ maxWidth: 760 }}>
            {laedt ? (
              <p style={{ display: "flex", gap: 10, alignItems: "center", color: "#fff" }} role="status">
                <Loader2 className="animate-spin" aria-hidden="true" /> {E.laedt}
              </p>
            ) : abruf?.status === "abgelaufen" ? (
              <>
                <span className="hb-augenbraue">{E.abgelaufenAugenbraue}</span>
                <h1>{E.abgelaufenTitel(abruf.vorname)}</h1>
                <p className="hb-lead" style={{ color: "#C3CEDC" }}>
                  {E.abgelaufenText}
                </p>
                <a className="hb-knopf hb-orange" href={mitSeitenSprache(konfiguratorPfad(null), sprache)}>
                  {E.neuAnfordern} <ArrowRight aria-hidden="true" />
                </a>
              </>
            ) : (
              <>
                <span className="hb-augenbraue">{E.unbekanntAugenbraue}</span>
                <h1>{E.unbekanntTitel}</h1>
                <p className="hb-lead" style={{ color: "#C3CEDC" }}>
                  {E.unbekanntText}
                </p>
                <a className="hb-knopf hb-orange" href={mitSeitenSprache("/handbuch", sprache)}>
                  {E.zurSeite} <ArrowRight aria-hidden="true" />
                </a>
              </>
            )}
          </div>
        </section>
        <HandbuchFuss />
      </div>
    );
  }

  const r = handbuchRahmen(daten.antworten);
  const ausgang = ermittleAusgang(daten.antworten);
  const auswertung = handbuchAuswertung(daten.antworten);
  const A = daten.antworten;
  const a = (s: Parameters<typeof antwortTextIn>[0], id: string) => antwortTextIn(s, id, sprache);
  const werte = [
    a("ziel", A.ziel),
    a("beruf", A.beruf),
    a("brutto", A.brutto),
    a("ueberschuss", A.ueberschuss),
    a("eigenkapital", A.eigenkapital),
    a("start", A.start),
    E.steuersatz(auswertung.grenzsatz, auswertung.gemeinsam),
    rahmenTextIn(r, sprache),
  ];
  const angaben = E.angaben.map((l, i) => [l, werte[i]] as [string, string]);
  const saText = ausgang === "passt" ? E.saPasst : ausgang === "vielleicht" ? E.saVielleicht : E.saNochNicht;

  return (
    <div className="hb" data-thema={thema}>
      <HandbuchKopf thema={thema} berater={berater} anker={false} startseite={handbuchStartseite(daten.beraterSlug)} />
      <section className="hb-ergebnis-kopf">
        <div className="hb-wrap">
          <span className="hb-pill gruen" style={{ background: "rgba(111,208,143,.16)", color: "#8BE0A8" }}>
            <Check aria-hidden="true" /> {daten.frisch ? E.fertig : E.deinHandbuch}
          </span>
          <h1>{E.h1(daten.vorname)}</h1>
          <p className="hb-lead" style={{ color: "#C3CEDC" }}>
            {daten.gespeichert ? (daten.frisch ? E.leadFrisch : E.leadGespeichert) : E.leadOhne}
          </p>
          <div className="hb-werkzeug" style={{ marginTop: 22 }}>
            <button type="button" className="hb-knopf hb-orange" onClick={pdfSpeichern} disabled={pdfLaeuft}>
              {pdfLaeuft ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
              {pdfLaeuft ? E.pdfLaeuft : E.pdfSpeichern}
            </button>
          </div>
          <div className="hb-ergebnis-raster">
            <div className="hb-rahmen-karte hb-karte">
              <div className="hb-klein">{E.rahmenModell}</div>
              {r.bis > 0 ? (
                <>
                  <div className="gross">
                    <Hochzaehlen auchSichtbar text={(a) => rahmenTextIn({ von: anteilig(r.von, a), bis: anteilig(r.bis, a) }, sprache)} />
                  </div>
                  <div className="hb-klein">{E.empfohlen(euroIn(r.empf, sprache))}</div>
                </>
              ) : (
                <>
                  <div className="gross">{E.keinRahmen}</div>
                  <div className="hb-klein">{E.keinRahmenText}</div>
                </>
              )}
            </div>
            <div className="hb-sa-karte">
              <p className="hb-augenbraue">{E.naechster}</p>
              {/* Liegt die Selbstauskunft vor, eigene Überschrift und kein Knopf. */}
              <h2>{daten.saStatus === "ausgefuellt" ? E.saLiegtVorTitel : E.saTitel}</h2>
              {daten.saStatus === "ausgefuellt" ? (
                <p style={{ margin: 0 }}>{E.saLiegtVor}</p>
              ) : saLink ? (
                <>
                  <p>{saText}</p>
                  {daten.saStatus === "abgelaufen" && <p>{E.saAbgelaufen}</p>}
                  <a className="hb-knopf hb-orange" href={saLink} onClick={saStart}>
                    {E.saKnopf} <ArrowRight aria-hidden="true" />
                  </a>
                </>
              ) : (
                <>
                  <p>{saText}</p>
                  {saPerMail && <p style={{ margin: 0 }}>{E.saPerMail}</p>}
                </>
              )}
              {daten.gespeichert && daten.frisch && (
                <p className="hb-klein" style={{ color: "#A9B6C8", marginTop: 14, marginBottom: 0 }}>
                  <Mail aria-hidden="true" style={{ width: 14, height: 14, display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
                  {E.linkAuchMail}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="hb-abschnitt" style={{ paddingTop: 48 }}>
        {handbuch && (
          <div className="hb-wrap hb-ergebnis-layout">
            <Agenda handbuch={handbuch} angaben={angaben} />
            <HandbuchAnsicht handbuch={handbuch} onSaStart={saStart} />
          </div>
        )}
      </section>
      <HandbuchFuss startseite={handbuchStartseite(daten.beraterSlug)} konfigurator={konfiguratorPfad(daten.beraterSlug)} />
    </div>
  );
}
