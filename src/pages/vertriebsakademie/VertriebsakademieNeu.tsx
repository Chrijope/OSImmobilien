import { useEffect, useMemo, useState } from "react";
import { sucheInAkademie, sucheImKapitel } from "@/lib/vertriebsakademieSuche";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  GraduationCap,
  Search,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useUser } from "@/contexts/UserContext";
import {
  VERTRIEBSAKADEMIE_KAPITEL as kapitel,
  getKapitelBySlug,
  getNextKapitel,
  aufgabenFuerPfad,
  type AkademieKapitel,
} from "@/lib/vertriebsakademieContent";
import {
  useVaProgress,
  useVaFortschrittGeladen,
  computeKapitelStats,
  computeGlobalStats,
  vaProgress,
  sichtbareUebungen,
} from "@/lib/vertriebsakademieProgress";
import {
  useZielgruppe,
  abschnittHatInhalt,
} from "@/lib/vertriebsakademieZielgruppe";
import {
  AKADEMIE_NEU as base,
  leseLesestelle,
  merkeLesestelle,
  teileLektion,
} from "@/lib/vertriebsakademieAnsicht";
import { SectionBlock } from "./VertriebsakademieKapitel";
import { ZielgruppenFilter } from "@/components/vertriebsakademie/ZielgruppenFilter";
import { AkademieAbschlusstest } from "@/components/vertriebsakademie/aufgaben/AkademieAbschlusstest";
import { AkademieAbwaegungsfall } from "@/components/vertriebsakademie/aufgaben/AkademieAbwaegungsfall";
import { AkademieSiegel } from "@/components/vertriebsakademie/AkademieSiegel";
import { AkademieTeamVergleich } from "@/components/vertriebsakademie/AkademieTeamVergleich";
import { supabase } from "@/integrations/supabase/client";
import { buildVpUrl } from "@/lib/publicUrl";
import haus from "@/assets/akademie-lernhaus.png";
import "@/styles/akademie-neu.css";

const etappen = [
  { name: "Fundament", slugs: ["kultur", "grundlagen", "positionierung"] },
  {
    name: "Gespräche",
    slugs: ["pitch-und-aufhaenger", "leadgenerierung", "erstgespraech"],
  },
  {
    name: "Beratung",
    slugs: ["beratungsgespraech", "objektauswahl", "finanzierung"],
  },
  { name: "Abschluss", slugs: ["notar", "nach-dem-notar"] },
  {
    name: "Wachstum",
    slugs: [
      "mindset",
      "empfehlungssystem",
      "verhandlung",
      "cross-sell",
      "steuer-deep-dive",
      "skalierung-team",
    ],
  },
];
function Start() {
  const state = useVaProgress();
  const geladen = useVaFortschrittGeladen();
  const [pfad] = useZielgruppe();
  const { authUser, user } = useUser();
  const [suche, setSuche] = useState("");
  const g = computeGlobalStats(state, pfad);
  const gespeichert = leseLesestelle(authUser?.id);
  const zuletzt = gespeichert && getKapitelBySlug(gespeichert.slug);
  const next =
    zuletzt || kapitel.find((k) => !state.kapitelDone[k.slug]) || kapitel[0];
  const ziel = `${base}/${next.slug}${zuletzt ? `?lektion=${encodeURIComponent(gespeichert!.section)}` : ""}`;
  /*
    Die Suche versteht ganze Fragen, nicht nur Stichwörter.

    Vorher stand hier ein reiner Textvergleich: Er fand nur, was wörtlich
    dastand, gewichtete nichts und lieferte bei einer ganzen Frage wie
    "was sage ich, wenn der Kunde den Preis vergleicht" gar keinen Treffer,
    weil dieser Satz so in keinem Abschnitt steht. Jetzt rechnet derselbe
    Suchkern wie im Vertriebshandbuch: Füllwörter fliegen raus, die Frage
    eines Abschnitts wiegt schwerer als der Fließtext, und ein Wort, das
    ohnehin überall vorkommt, zählt weniger.

    Abschnitte ohne Inhalt für den gewählten Pfad bleiben draußen, sonst
    führt ein Treffer auf eine leere Stelle.
  */
  const treffer = useMemo(
    () =>
      sucheInAkademie(suche, kapitel)
        .filter((t) => abschnittHatInhalt(t.abschnitt, pfad))
        .map((t) => ({ k: t.kapitel, s: t.abschnitt })),
    [suche, kapitel, pfad],
  );
  return (
    <>
      <nav className="an-tabs" aria-label="Akademiebereiche">
        <a href="#lernweg" aria-current="page">
          Mein Lernweg
        </a>
        <Link to={`${base}/training`}>Trainieren</Link>
        <a href="#nachschlagen">Nachschlagen</a>
      </nav>
      <div className="an-titel">
        <p className="an-eyebrow">DEIN WISSEN. DEIN NÄCHSTER SCHRITT.</p>
        <h2 className="an-title">Aus Wissen wird Sicherheit.</h2>
        <p>Lerne in deinem Tempo. Nimm etwas mit in dein nächstes Gespräch.</p>
      </div>

      <section data-ui="card" className="an-hero bg-card" aria-label="Weiterlernen">
        <div>
          <p className="an-eyebrow">
            {zuletzt ? "HIER WARST DU ZULETZT" : "DEIN NÄCHSTES KAPITEL"}
          </p>
          <h2>{next.titel}</h2>
          <p>{next.teaser}</p>
          {/*
            Hauptaktion der Akademie, deshalb Marken-Orange. Statt der
            seiteneigenen Klasse "an-button" steht hier der Knopf aus dem
            Baukasten, weil das Orange nur dort definiert ist. Alle uebrigen
            "an-button" in den Lektionen bleiben absichtlich blau, sonst
            haette eine Kapitelseite ein halbes Dutzend orange Knoepfe.
          */}
          <Button asChild variant="brand">
            <Link to={ziel}>
              {zuletzt
                ? "Lektion fortsetzen"
                : g.doneKapitel === g.totalKapitel
                  ? "Wissen auffrischen"
                  : "Jetzt weiterlernen"}{" "}
              <ArrowRight size={18} />
            </Link>
          </Button>
          <div className="an-hero-fuss">
            <BookOpen size={17} />{" "}
            {geladen
              ? `${g.doneLektionen} von ${g.totalLektionen} Lektionen bearbeitet`
              : "Dein Lernstand wird geladen …"}
          </div>
        </div>
        <img src={haus} alt="" />
      </section>
      {/*
        Die Suche steht direkt unter dem Kaestchen "Hier warst du zuletzt"
        und damit ueber den fuenf Etappen. Wer die Akademie oeffnet, hat
        zwei Absichten: weiterlernen, wo er aufgehoert hat, oder eine
        bestimmte Stelle nachschlagen. Beides liegt jetzt nebeneinander
        oben, statt dass das Nachschlagen unten am Seitenende verschwindet.
        Wunsch Christians vom 11.09.2026.
      */}
      <section id="nachschlagen" className="an-suche">
        <h2>Was möchtest du nachschlagen?</h2>
        <label htmlFor="an-search">Kapitel, Begriff oder Thema suchen</label>
        <div>
          <Search size={20} />
          <input
            id="an-search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Zum Beispiel Cashflow oder Erstgespräch"
            type="search"
          />
        </div>
        {suche.trim() && (
          <>
            <p role="status">{treffer.length} passende Lektionen</p>
            {treffer.map(({ k, s }) => (
              <Link
                key={`${k.slug}/${s.id}`}
                to={`${base}/${k.slug}?lektion=${encodeURIComponent(s.id)}`}
                className="an-suchtreffer"
              >
                <span>
                  <strong>{s.ueberschrift}</strong>
                  <small>{k.titel}</small>
                </span>
                <ArrowRight size={18} />
              </Link>
            ))}
          </>
        )}
      </section>
      <nav className="an-etappen" aria-label="Etappen deines Lernwegs">
        {etappen.map((e, i) => {
          const done = e.slugs.every((s) => state.kapitelDone[s]);
          return (
            <a key={e.name} href={`#etappe-${i}`}>
              <span className={done ? "fertig" : ""}>
                {done ? <Check size={16} /> : i + 1}
              </span>
              {e.name}
            </a>
          );
        })}
      </nav>
      <div className="an-uebersicht" id="lernweg">
        <div>
          <h2>Dein Lernweg</h2>
          <p className="an-muted">
            Die Inhalte bleiben vollständig. Du entscheidest, wo du einsteigst.
          </p>
          <ZielgruppenFilter />
          {etappen.map((e, i) => (
            <section className="an-gruppe" key={e.name} id={`etappe-${i}`}>
              <h3>{e.name}</h3>
              {e.slugs.map((slug) => {
                const k = getKapitelBySlug(slug)!;
                const stats = computeKapitelStats(k, state, pfad);
                return (
                  <Link
                    className="an-kapitel"
                    key={slug}
                    to={`${base}/${slug}`}
                  >
                    <span
                      className={`an-status ${stats.isDone ? "fertig" : ""}`}
                    >
                      {stats.isDone ? <Check size={18} /> : k.nummer}
                    </span>
                    <span>
                      <strong>{k.titel}</strong>
                      <small>
                        {stats.doneLektionen} / {stats.totalLektionen} Lektionen
                        · {stats.pct}% bearbeitet
                      </small>
                    </span>
                    <ArrowRight size={18} />
                  </Link>
                );
              })}
            </section>
          ))}
        </div>
        <aside data-ui="card" className="an-werkzeug bg-card">
          <h3>Für deinen Alltag</h3>
          <Link to={`${base}/einwaende`}>
            Einwände verstehen <ArrowRight size={17} />
          </Link>
          <Link to={`${base}/ablaufplan`}>
            Der Weg zum Abschluss <ArrowRight size={17} />
          </Link>
          <Link to={`${base}/quereinstieg-90-tage`}>
            Dein 90-Tage-Programm <ArrowRight size={17} />
          </Link>
          <Link to={`${base}/glossar-zahlen`}>
            Begriffe und Zahlen <ArrowRight size={17} />
          </Link>
          <Link to={`${base}/training`}>
            Eine Runde trainieren <ArrowRight size={17} />
          </Link>
          <div className="an-hinweis">
            <Sparkles size={22} />
            <h3>Dein Fortschritt bleibt bei dir.</h3>
            <p>
              Beide Ansichten verwenden denselben Lernstand. Was du hier
              bearbeitest, siehst du auch in der bisherigen Akademie.
            </p>
          </div>
          {["admin", "inhaber", "vertriebsleiter"].includes(user.role) && (
            <Link to={`${base}/admin`}>
              <Users size={17} /> Fortschritt der Partner
            </Link>
          )}
        </aside>
      </div>

      <details data-ui="card" className="an-extra bg-card">
        <summary>Deine Auszeichnungen</summary>
        <AkademieSiegel />
      </details>
      <details data-ui="card" className="an-extra bg-card">
        <summary>Team-Vergleich</summary>
        <AkademieTeamVergleich />
      </details>
    </>
  );
}
function Lernraum({ kap }: { kap: AkademieKapitel }) {
  const state = useVaProgress();
  const geladen = useVaFortschrittGeladen();
  const [pfad] = useZielgruppe();
  const { authUser } = useUser();
  const [params, setParams] = useSearchParams();
  const [landingpage, setLandingpage] = useState<string | null>(null);
  const [fokus, setFokus] = useState(false);
  /*
    Die Kapitelsuche. Sie durchsucht ausschliesslich dieses eine Kapitel.
    Wer hier fragt, steckt mitten in einem Thema; Treffer aus achtzehn
    anderen Kapiteln waeren an dieser Stelle eine Ablenkung und keine
    Antwort. Die Suche ueber alle Kapitel steht oben auf der Uebersicht.
  */
  const [kapitelSuche, setKapitelSuche] = useState("");
  const sections = kap.sections.filter((s) => abschnittHatInhalt(s, pfad));
  const kapitelTreffer = useMemo(
    () =>
      sucheImKapitel(kapitelSuche, kap)
        .map((t) => t.abschnitt)
        .filter((a) => sections.some((s) => s.id === a.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kapitelSuche, kap, pfad],
  );
  const suchtImKapitel = kapitelSuche.trim().length >= 2;
  const gespeichert = leseLesestelle(authUser?.id);
  const requested = params.get("vaScrollTo") || params.get("lektion");
  const sec =
    sections.find((s) => s.id === requested) ||
    sections.find(
      (s) => gespeichert?.slug === kap.slug && s.id === gespeichert.section,
    ) ||
    sections.find((s) => !state.sectionsDone[`${kap.slug}::${s.id}`]) ||
    sections[0];
  const idx = sections.indexOf(sec);
  const phase =
    params.get("schritt") === "praxis"
      ? "praxis"
      : params.get("schritt") === "mitnehmen"
        ? "mitnehmen"
        : "wissen";
  const stats = computeKapitelStats(kap, state, pfad);
  const next = getNextKapitel(kap.slug);
  const done =
    !!state.kapitelDone[kap.slug] ||
    !!state.sectionsDone[`${kap.slug}::${sec?.id}`];
  const parts = sec ? teileLektion(sec) : null;
  const praxisAnzahl = sec
    ? aufgabenFuerPfad(sec, pfad).length +
      sichtbareUebungen(sec, pfad).length +
      (sec.checkliste?.length || 0)
    : 0;
  function waehlen(id: string, schritt = "wissen") {
    setParams({ lektion: id, schritt });
    merkeLesestelle(authUser?.id, { slug: kap.slug, section: id });
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" });
  }
  function schritt(value: string) {
    if (sec) {
      setParams({ lektion: sec.id, schritt: value });
      merkeLesestelle(authUser?.id, { slug: kap.slug, section: sec.id });
    }
  }
  useEffect(() => {
    if (!geladen || !sec) return;
    merkeLesestelle(authUser?.id, { slug: kap.slug, section: sec.id });
    if (!requested)
      setParams({ lektion: sec.id, schritt: phase }, { replace: true });
  }, [geladen, authUser?.id, kap.slug, sec, requested, phase, setParams]);
  useEffect(() => {
    let cancelled = false;
    if (authUser?.id)
      void supabase.functions
        .invoke("ensure-vp-slug", { body: {} })
        .then(({ data, error }) => {
          if (!cancelled && !error && data?.slug)
            setLandingpage(buildVpUrl(data.slug));
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);
  if (!sec || !parts)
    return (
      <>
        <h2 className="an-title">{kap.titel}</h2>
        <p>
          Für diesen Lernpfad gibt es hier keinen Abschnitt. Wähle einen anderen
          Pfad.
        </p>
        <ZielgruppenFilter />
      </>
    );
  const blockProps = {
    slug: kap.slug,
    kapitelNummer: kap.nummer,
    kapitelTitel: kap.titel,
    landingpageUrl: landingpage,
    onSprung: (id: string) => waehlen(id),
    vollerText: true,
  };
  return (
    <>
      <div className="an-leiste">
        <Link to={base}>
          <ArrowLeft size={17} /> Zur Akademie
        </Link>
        <button onClick={() => setFokus(!fokus)} aria-pressed={fokus}>
          {fokus ? "Lektionsübersicht zeigen" : "Fokusmodus"}
        </button>
      </div>
      <div className={`an-lernraum ${fokus ? "an-fokus" : ""}`}>
        <aside className="an-lektionen">
          <p className="an-eyebrow">KAPITEL {kap.nummer}</p>
          <h2>{kap.titel}</h2>
          <p>
            {stats.doneLektionen} von {stats.totalLektionen} Lektionen
          </p>
          <ZielgruppenFilter />

          {/*
            Die Suche in diesem Kapitel. Sie steht ueber der Lektionsliste,
            weil sie dieselbe Liste einengt: Wer etwas eintippt, sieht nur
            noch die Lektionen dieses Kapitels, die dazu passen. Leert man das
            Feld, steht die volle Liste wieder da.
          */}
          <div className="an-kapitelsuche">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={kapitelSuche}
              onChange={(e) => setKapitelSuche(e.target.value)}
              placeholder="In diesem Kapitel suchen"
              aria-label={`Nur im Kapitel ${kap.titel} suchen`}
            />
          </div>

          {suchtImKapitel && (
            <p className="an-kapitelsuche-stand" role="status">
              {kapitelTreffer.length === 0
                ? "Dazu steht nichts in diesem Kapitel. Die Suche oben auf der Akademieseite geht über alle Kapitel."
                : `${kapitelTreffer.length} ${kapitelTreffer.length === 1 ? "Lektion" : "Lektionen"} in diesem Kapitel`}
            </p>
          )}

          <nav aria-label="Lektionen">
            {(suchtImKapitel ? kapitelTreffer : sections).map((s) => {
              const nr = sections.indexOf(s) + 1;
              return (
                <button
                  key={s.id}
                  onClick={() => { waehlen(s.id); setKapitelSuche(""); }}
                  aria-current={s.id === sec.id ? "step" : undefined}
                >
                  <span>
                    {state.kapitelDone[kap.slug] ||
                    state.sectionsDone[`${kap.slug}::${s.id}`] ? (
                      <Check size={16} />
                    ) : (
                      nr
                    )}
                  </span>
                  {s.ueberschrift}
                </button>
              );
            })}
          </nav>
          <button
            className="an-pruefung-link"
            onClick={() => schritt("mitnehmen")}
          >
            Kapitelabschluss ansehen <ArrowRight size={16} />
          </button>
        </aside>
        <div className="an-lesson">
          <p className="an-eyebrow">
            LEKTION {idx + 1} VON {sections.length}{" "}
            {done ? "· BEREITS BEARBEITET" : ""}
          </p>
          <h2 className="an-title">{sec.ueberschrift}</h2>
          <nav className="an-schritte" aria-label="Lernschritte">
            {[
              ["wissen", "Verstehen"],
              ["praxis", "Anwenden"],
              ["mitnehmen", "Mitnehmen"],
            ].map(([id, label], i) => (
              <button
                key={id}
                aria-current={phase === id ? "step" : undefined}
                onClick={() => schritt(id)}
              >
                <span>{i + 1}</span>
                {label}
              </button>
            ))}
          </nav>
          <section
            data-ui="card" className="an-inhalt bg-card"
            aria-label={
              phase === "wissen"
                ? "Lerninhalt"
                : phase === "praxis"
                  ? "Übungen"
                  : "Lernabschluss"
            }
          >
            {phase === "wissen" && (
              <>
                <SectionBlock
                  key={`${sec.id}-wissen`}
                  {...blockProps}
                  section={parts.wissen}
                />
                <footer className="an-weiter">
                  <span>Erst verstehen. Dann selbst ausprobieren.</span>
                  <button
                    className="an-button"
                    onClick={() =>
                      schritt(praxisAnzahl ? "praxis" : "mitnehmen")
                    }
                  >
                    {praxisAnzahl ? "Jetzt anwenden" : "Lektion abschließen"}
                    <ArrowRight size={18} />
                  </button>
                </footer>
              </>
            )}
            {phase === "praxis" && (
              <>
                <div className="an-praxis-kopf">
                  <Target size={25} />
                  <div>
                    <h2>Mach das Wissen zu deinem.</h2>
                    <p>
                      Die Aufgaben und deine bisherigen Antworten bleiben
                      erhalten.
                    </p>
                  </div>
                </div>
                {praxisAnzahl ? (
                  <SectionBlock
                    key={`${sec.id}-praxis`}
                    {...blockProps}
                    section={parts.praxis}
                  />
                ) : (
                  <p>
                    Diese Lektion hat keine eigenen Aufgaben. Du kannst sie
                    direkt abschließen.
                  </p>
                )}
                <footer className="an-weiter">
                  <button onClick={() => schritt("wissen")}>
                    Inhalt noch einmal ansehen
                  </button>
                  <button
                    className="an-button"
                    onClick={() => schritt("mitnehmen")}
                  >
                    Zum Lernabschluss <ArrowRight size={18} />
                  </button>
                </footer>
              </>
            )}
            {phase === "mitnehmen" && (
              <>
                <div className="an-abschluss">
                  <div className="an-siegel">
                    <Check size={32} />
                  </div>
                  <p className="an-eyebrow">
                    {done ? "LEKTION BEARBEITET" : "DEIN NÄCHSTER SCHRITT"}
                  </p>
                  <h2>
                    {done
                      ? "Wissen, das du mitnehmen kannst."
                      : "Diese Lektion durchgearbeitet?"}
                  </h2>
                  <p>{sec.ueberschrift}</p>
                  <p className="an-muted">
                    Der Abschluss und alle Aufgaben zählen genauso wie in der
                    bisherigen Ansicht.
                  </p>
                  <button
                    className="an-button"
                    disabled={done || !geladen}
                    onClick={() =>
                      vaProgress.toggleSectionDone(kap.slug, sec.id)
                    }
                  >
                    {done
                      ? "Als bearbeitet gespeichert"
                      : !geladen
                        ? "Lernstand wird geladen …"
                        : "Als abgeschlossen markieren"}{" "}
                    <Check size={18} />
                  </button>
                  {idx < sections.length - 1 ? (
                    <button
                      className="an-next"
                      onClick={() => waehlen(sections[idx + 1].id)}
                    >
                      Als Nächstes: {sections[idx + 1].ueberschrift}
                      <ArrowRight size={20} />
                    </button>
                  ) : next ? (
                    <Link className="an-next" to={`${base}/${next.slug}`}>
                      Nächstes Kapitel: {next.titel}
                      <ArrowRight size={20} />
                    </Link>
                  ) : (
                    <p>Du bist am Ende des Lernwegs angekommen.</p>
                  )}
                  <Link to={base} className="an-pause">
                    Für heute fertig
                  </Link>
                </div>
                <details
                  data-ui="card" className="an-extra bg-card"
                  open={idx === sections.length - 1 ? true : undefined}
                >
                  <summary>Kapitelabschluss · Tests und Abwägungsfall</summary>
                  {kap.abwaegungsfall && (
                    <AkademieAbwaegungsfall
                      slug={kap.slug}
                      fall={kap.abwaegungsfall}
                    />
                  )}
                  <AkademieAbschlusstest
                    kap={kap}
                    onSprung={(id) => waehlen(id)}
                  />
                  <div className="an-kapitelabschluss">
                    <h3>
                      {state.kapitelDone[kap.slug]
                        ? "Kapitel abgeschlossen"
                        : "Ganzes Kapitel abschließen"}
                    </h3>
                    <p>
                      {stats.pct}% bearbeitet · {stats.doneAufgaben}/
                      {stats.totalAufgaben} Aufgaben gelöst
                    </p>
                    <button
                      className="an-button"
                      disabled={!geladen}
                      onClick={() =>
                        vaProgress.setKapitelDone(
                          kap.slug,
                          !state.kapitelDone[kap.slug],
                        )
                      }
                    >
                      {state.kapitelDone[kap.slug]
                        ? "Kapitel wieder öffnen"
                        : "Kapitel als abgeschlossen markieren"}
                    </button>
                  </div>
                </details>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
export default function VertriebsakademieNeu() {
  const { slug } = useParams();
  const kap = slug ? getKapitelBySlug(slug) : undefined;
  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <PageHeader title="Vertriebsakademie" />
        <div className="an-root">
          {!slug ? (
            <Start />
          ) : kap ? (
            <Lernraum key={kap.slug} kap={kap} />
          ) : (
            <>
              <h2 className="an-title">Kapitel nicht gefunden</h2>
              <Link to={base}>Zum Lernweg</Link>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
