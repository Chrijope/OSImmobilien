import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Globe, Calculator, Plane, ArrowRight } from "lucide-react";
import logoImg from "@/assets/moreimmo-logo.png";
import { SeitenSpracheProvider, SeitenSprachUmschalter, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { mitSeitenSprache, type Sprache } from "@/lib/seitenSprache";
import { LINKS_TEXTE, type LinksTexte } from "./linksTexte";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";

/**
 * Die Linkseite für die sozialen Netze, erreichbar unter `/links`.
 *
 * WARUM ES SIE GIBT
 *
 * Instagram lässt in der Bildunterschrift keinen Link zu. Der einzige
 * anklickbare Verweis ist der im Profil, und genau dort hängt die ganze
 * Auswertung: Ohne Kennung an diesem Link kann hinterher niemand sagen,
 * welcher Beitrag einen Interessenten gebracht hat.
 *
 * WARUM SELBST GEBAUT UND KEIN FREMDER DIENST
 *
 * Ein Dienst wie Linktree sieht jeden Klick unserer Interessenten, mit
 * Zeitpunkt, Gerät und Herkunft. Das sind personenbezogene Daten auf einem
 * fremden Server, für den es einen Auftragsverarbeitungsvertrag bräuchte. Bei
 * einer eigenen Seite unter more.immo stellt sich die Frage nicht.
 *
 * WIE DIE KENNUNG WEITERGEREICHT WIRD
 *
 * Die Seite erfindet keine Kampagne. Sie nimmt, was in ihrer eigenen Adresse
 * steht, und hängt es an jedes Ziel weiter, auch an die Website: Ein
 * UTM-Merkmal wirkt systemübergreifend. Steht der Profillink also auf
 * `/links?utm_campaign=ig-2609-belastung-01`, trägt jeder Klick von hier aus
 * dieselbe Kennung. Christian wechselt damit eine einzige Adresse je Woche
 * statt drei.
 *
 * Fehlt die Kennung, wird nichts erfunden: Dann gehen die Ziele ohne
 * Kampagne hinaus, und in der Auswertung steht ehrlich nichts.
 *
 * DEUTSCH UND ENGLISCH (Plan Kundensprache, Etappe 6)
 *
 * Die Seite ermittelt ihre Sprache selbst (`?lang=`, gemerkte Wahl,
 * Browser), oben rechts sitzt der Umschalter. Auf Englisch führt der
 * Steuerrechner auf `/steuer?lang=en`, die Kennung geht trotzdem mit. Die
 * Texte stehen in `linksTexte.ts`.
 */

/** Die Felder, die aus der Adresse dieser Seite an die Ziele weitergehen. */
const KENNUNGSFELDER = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/**
 * Die Farben der Symbole.
 *
 * Werte aus der Markenrichtlinie 1.2, dieselben wie im CRM. Je Ziel eine
 * eigene Farbe, damit die Kacheln auf einen Blick unterscheidbar sind; die
 * Flächen bleiben ruhig, farbig ist nur das Symbol auf zartem Grund.
 *
 * Jede Farbe hat eine Fassung für den Dunkelmodus. Ohne sie stünde ein
 * dunkles Grün auf dunklem Grund, und niemand sähe mehr etwas.
 */
const FARBEN = {
  blau: "text-[#087AC7] bg-[#F0F9FF] dark:text-[#8AD0FF] dark:bg-[#123349]",
  gruen: "text-[#187745] bg-[#E6F6EC] dark:text-[#45C47E] dark:bg-[#14281E]",
  teal: "text-[#0f7a86] bg-[#e6f4f5] dark:text-[#5fc9d3] dark:bg-[#12262a]",
} as const;

interface Ziel {
  titel: string;
  /**
   * Ein kurzes Kennzeichen hinter dem Titel, nur wo es wirklich nötig ist.
   *
   * Beschreibungen unter jedem Link gab es bis zum 19.09.2026, sie sind
   * wieder heraus: Wer von Instagram kommt, überfliegt die Seite in zwei
   * Sekunden, und drei Erklärtexte zu drei Titeln, die sich selbst erklären,
   * kosten nur Zeit. Geblieben ist das eine, was man dem Titel nicht ansieht.
   */
  kennzeichen?: string;
  url: string;
  icon: typeof Globe;
  farbe: keyof typeof FARBEN;
  /**
   * Führt aus dem CRM heraus auf die Website.
   *
   * Die Kennung geht trotzdem mit, siehe Kopfkommentar. `rel="noopener"`
   * bleibt Pflicht.
   */
  extern?: boolean;
}

/**
 * Was unter welcher Überschrift steht, in dieser Reihenfolge, in der Sprache
 * der Seite.
 *
 * Der Steuerrechner steht bewusst auf `/steuer` OHNE Kürzel. Mit Kürzel
 * (`/steuer/name`) lädt die Seite die Microsite eines Vertriebspartners und
 * weist den Interessenten ihm zu. Aus einem öffentlichen Profil heraus wäre
 * das falsch: Dort weiß niemand, wer ihn später betreuen wird.
 *
 * Beim Expats-Kalkulator steht "in English" hinter dem Titel. Das ist kein
 * Schmuck: Der Rechner selbst ist durchgehend englisch, und wer das erst nach
 * dem Klick merkt, springt wieder ab. Auf der englischen Seite entfällt es,
 * dort ist Englisch selbstverständlich.
 */
function gruppen(t: LinksTexte, sprache: Sprache): { ueberschrift: string; ziele: Ziel[] }[] {
  return [
  {
    ueberschrift: t.gruppen.webseite,
    ziele: [
      {
        titel: "more.immo",
        url: "https://more.immo",
        icon: Globe,
        farbe: "blau",
        extern: true,
      },
    ],
  },
  {
    ueberschrift: t.gruppen.rechner,
    ziele: [
      {
        titel: t.ziele.steuerrechner,
        url: mitSeitenSprache("/steuer", sprache),
        icon: Calculator,
        farbe: "gruen",
      },
      {
        // Das Kennzeichen bleibt, und zwar als einziges: Der Rechner ist
        // durchgehend englisch, und das sieht man dem Namen nicht an.
        titel: t.ziele.expats,
        ...(sprache === "de" ? { kennzeichen: t.ziele.expatsKennzeichen } : {}),
        url: "/expats-calculator",
        icon: Plane,
        farbe: "teal",
      },
    ],
  },
  ];
}

export default function LinksPublic() {
  return (
    <SeitenSpracheProvider>
      <LinksPublicInhalt />
    </SeitenSpracheProvider>
  );
}

function LinksPublicInhalt() {
  const [suche] = useSearchParams();
  const t = useSeitenTexte(LINKS_TEXTE);
  const sprache = useSeitenSprache();

  /** Die Kennung aus der eigenen Adresse, für die Weitergabe an die Ziele. */
  const kennung = useMemo(() => {
    const p = new URLSearchParams();
    // `lang` gehört nicht dazu: Die Sprache hängt `mitSeitenSprache` gezielt
    // an die eigenen Seiten, die Website bekommt sie nicht.
    for (const feld of KENNUNGSFELDER) {
      const wert = suche.get(feld);
      if (wert) p.set(feld, wert);
    }
    // Kommt jemand ohne Kennung, ist die Quelle trotzdem bekannt: Diese Seite
    // wird ausschliesslich aus den Netzen verlinkt.
    if (!p.has("utm_source")) p.set("utm_source", "instagram");
    if (!p.has("utm_medium")) p.set("utm_medium", "profil");
    return p.toString();
  }, [suche]);

  const mitKennung = (url: string) =>
    kennung ? url + (url.includes("?") ? "&" : "?") + kennung : url;

  useEffect(() => {
    document.title = t.dokumentTitel;
  }, [t.dokumentTitel]);

  return (
    <div data-lg="seite" className="min-h-dvh bg-background text-foreground flex flex-col">
      {/*
        Kopf. Bewusst schmal und ruhig: Wer von Instagram kommt, hat zwei
        Sekunden Geduld und sucht nicht nach einer Marke, sondern nach dem
        Ding, das im Beitrag stand.
      */}
      <header className="pt-12 pb-8 px-5 relative">
        {/* Rechts oben, außerhalb des Textflusses, damit Logo und Überschrift
            mittig bleiben. */}
        <div className="absolute right-4 top-3">
          <SeitenSprachUmschalter />
        </div>
        <div className="mx-auto w-full max-w-md text-center">
          <img src={logoImg} alt="MOREImmo" className="h-9 object-contain mx-auto mb-6" />
          <h1 className="text-2xl font-bold tracking-tight">{t.titel}</h1>
          {/*
            Der einzige erklärende Satz der Seite. Er gilt für alles darunter,
            deshalb steht er hier oben und nicht dreimal einzeln.
          */}
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {t.untertitel}
          </p>
        </div>
      </header>

      <main className="flex-1 px-5 pb-10">
        <div className="mx-auto w-full max-w-md space-y-7">
          {gruppen(t, sprache).map((gruppe) => (
            <section key={gruppe.ueberschrift}>
              <h2 className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {gruppe.ueberschrift}
              </h2>

              <div className="space-y-2.5">
                {gruppe.ziele.map((ziel) => {
                  const Symbol = ziel.icon;
                  return (
                    <a
                      key={ziel.url}
                      href={mitKennung(ziel.url)}
                      {...(ziel.extern ? { rel: "noopener" } : {})}
                      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${FARBEN[ziel.farbe]}`}
                      >
                        <Symbol className="h-5 w-5" />
                      </span>

                      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-tight">
                        {ziel.titel}
                        {ziel.kennzeichen && (
                          <span className="ml-2 align-middle text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {ziel.kennzeichen}
                          </span>
                        )}
                      </span>

                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </a>
                  );
                })}
              </div>
            </section>
          ))}

          {/*
            Der Vorbehalt bleibt, aber als eine Zeile. Er gehört ans Ende: Wer
            oben schon geklickt hat, braucht ihn nicht vorweg.
          */}
          <p className="pt-1 text-center text-[13px] leading-relaxed text-muted-foreground">
            {t.vorbehalt}
          </p>
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6">
        <div className="mx-auto flex w-full max-w-md flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span>MOREImmo</span>
          <a href={mitSeitenSprache("/impressum", sprache)} className="transition-colors hover:text-foreground">
            {t.impressum}
          </a>
          <a href={mitSeitenSprache("/datenschutz", sprache)} className="transition-colors hover:text-foreground">
            {t.datenschutz}
          </a>
          <CookieEinstellungenLink sprache={sprache} className="transition-colors hover:text-foreground" />
        </div>
      </footer>
    </div>
  );
}
