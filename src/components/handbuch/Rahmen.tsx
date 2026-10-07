/**
 * Kopfleiste und Fuß der öffentlichen Handbuch-Seiten, dazu der Partner aus
 * dem Kürzel der Adresse und das Bild des Inhabers für den Firmenlink.
 *
 * Seit dem 26.09.2026 zweisprachig: Der Umschalter DE/EN sitzt rechts in der
 * Kopfleiste (`SeitenSprachUmschalter`, dasselbe Muster wie die
 * Berater-Mikroseite). Die Wahl steht in `?lang=` und im Browser-Speicher und
 * gilt damit auf allen Handbuch-Seiten.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import { PartnerPixelHinweis } from "@/components/cookie/PartnerPixelHinweis";
import { leseVerantwortlicher } from "@/hooks/useMetaPixelMitEinwilligung";
import { SeitenSprachUmschalter, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { nurEchteBezeichnung, BERUF_IMMOBILIENBERATER } from "@/lib/berufsbezeichnung";
import { projektUrl } from "@/lib/handbuch/leadAbsenden";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { Wortmarke, type HandbuchThema } from "./teile";

export interface HandbuchBerater {
  userId: string;
  slug: string;
  name: string;
  position: string;
  telefon: string;
  email: string;
  bild: string | null;
  buchungslink: string;
  metaPixelId: string | null;
  /** Name und Anschrift für den Datenschutzhinweis, nur mit aktivem Pixel. */
  pixelVerantwortlicher: { name: string; anschrift: string } | null;
}


export type BeraterStand = { status: "ohne" } | { status: "laden" } | { status: "unbekannt" } | { status: "ok"; berater: HandbuchBerater };

/**
 * Der Partner zum Kürzel, über dieselbe öffentliche Function wie die
 * Mikroseite (`get-vp-microsite`). Eigene Funktion, weil das Kundenprofil
 * denselben Partner für das Handbuch-PDF braucht (`handbuch/profilPdf.ts`).
 */
export async function ladeBeraterAusKuerzel(slug: string): Promise<BeraterStand> {
  try {
    const res = await fetch(`${projektUrl()}/get-vp-microsite?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return { status: "unbekannt" };
    const j = (await res.json()) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      status: "ok",
      berater: {
        userId: text(j.userId),
        slug: text(j.slug) || slug,
        name: text(j.name),
        position: nurEchteBezeichnung(text(j.position)) || BERUF_IMMOBILIENBERATER,
        telefon: text(j.telefon),
        email: text(j.email),
        bild: text(j.bild) || null,
        buchungslink: text(j.buchungslink),
        metaPixelId: text(j.metaPixelId) || null,
        pixelVerantwortlicher: leseVerantwortlicher(j.pixelVerantwortlicher),
      },
    };
  } catch {
    return { status: "unbekannt" };
  }
}

/**
 * Der Partner zum Kürzel als Hook. Ohne Kürzel: kein Partner. Ein unbekanntes
 * Kürzel zeigt die Seite trotzdem, nur ohne Partner; die Zuordnung entscheidet
 * ohnehin der Server beim Absenden.
 */
export function useBeraterAusKuerzel(slug: string | null | undefined): BeraterStand {
  const [stand, setStand] = useState<BeraterStand>(slug ? { status: "laden" } : { status: "ohne" });
  useEffect(() => {
    if (!slug) {
      setStand({ status: "ohne" });
      return;
    }
    let abgebrochen = false;
    setStand({ status: "laden" });
    ladeBeraterAusKuerzel(slug).then((r) => {
      if (!abgebrochen) setStand(r);
    });
    return () => {
      abgebrochen = true;
    };
  }, [slug]);
  return stand;
}

export function HandbuchKopf({
  thema,
  berater,
  anker = true,
  aktion,
  startseite,
}: {
  thema: HandbuchThema;
  berater?: HandbuchBerater | null;
  anker?: boolean;
  aktion?: { text: string; onClick: () => void };
  /** Auf den Unterseiten führt das Logo zurück zur Landingpage. */
  startseite?: string;
}) {
  const t = useSeitenTexte(HANDBUCH_SEITEN_TEXTE).kopf;
  const sprache = useSeitenSprache();
  const marke = thema === "dunkel" ? <Wortmarke hell groesse={19} /> : <img src="/images/moreimmo-logo.png" alt="MOREImmo" />;
  const anker_ = ["#handbuch", "#so-arbeiten-wir", "#musterrechnung", "#ablauf", "#fragen"];
  return (
    <header className="hb-kopf">
      <div className="hb-kopf-marke">
        {startseite ? (
          <Link to={mitSeitenSprache(startseite, sprache)} aria-label={t.zurSeite} style={{ display: "inline-flex", color: "inherit", textDecoration: "none" }}>
            {marke}
          </Link>
        ) : (
          marke
        )}
        {berater?.name && <span className="hb-kopf-berater">{t.mit(berater.name)}</span>}
      </div>
      {anker && (
        <nav aria-label={t.abschnitte}>
          {anker_.map((a, i) => (
            <a key={a} href={a}>
              {t.nav[i]}
            </a>
          ))}
        </nav>
      )}
      <div className="hb-kopf-rechts">
        {aktion && (
          <button type="button" className="hb-knopf hb-orange hb-klein-knopf" onClick={aktion.onClick}>
            {aktion.text}
          </button>
        )}
        <SeitenSprachUmschalter className="hb-sprache" />
      </div>
    </header>
  );
}

/**
 * Der Fuß. `startseite` ist leer auf der Landingpage (dann springen die
 * Anker innerhalb der Seite) und sonst deren Adresse.
 */
export function HandbuchFuss({ startseite = "", konfigurator = "/handbuch/konfigurator" }: { startseite?: string; konfigurator?: string } = {}) {
  const t = useSeitenTexte(HANDBUCH_SEITEN_TEXTE).fuss;
  const sprache = useSeitenSprache();
  const start = startseite ? mitSeitenSprache(startseite, sprache) : "";
  return (
    <footer className="hb-fuss">
      <div className="hb-wrap">
        <div>
          <div style={{ marginBottom: 14 }}>
            <Wortmarke hell groesse={20} />
          </div>
          <div>MOREImmo, Wendelsteinstraße 19, 83075 Bad Feilnbach</div>
          <div style={{ marginTop: 8 }}>
            <a href="mailto:office@more.immo" style={{ display: "inline" }}>
              office@more.immo
            </a>
          </div>
        </div>
        <div>
          <b>{t.handbuch}</b>
          <Link to={mitSeitenSprache(konfigurator, sprache)}>{t.konfigurator}</Link>
          <a href={`${start}#musterrechnung`}>{t.musterrechnung}</a>
          <a href={`${start}#ablauf`}>{t.ablauf}</a>
        </div>
        <div>
          <b>{t.rechtliches}</b>
          <a href={mitSeitenSprache("/impressum", sprache)}>{t.impressum}</a>
          <a href={mitSeitenSprache("/datenschutz", sprache)}>{t.datenschutz}</a>
          <CookieEinstellungenLink className="hb-fuss-link" sprache={sprache} />
        </div>
      </div>
      <div className="hb-wrap" style={{ display: "block", marginTop: 24 }}>
        <PartnerPixelHinweis sprache={sprache} />
      </div>
    </footer>
  );
}
