import { merkeLesestelle } from "@/lib/vertriebsakademieAnsicht";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  ArrowLeft, ArrowRight, Copy, ExternalLink, Lightbulb, Target,
  MessageSquare, ShieldAlert, ListChecks, Link2, BookOpen, Dumbbell, CheckCircle2, Sparkles, Info, Gem,
  ChevronsDownUp, ChevronsUpDown, PlayCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  getKapitelBySlug, getNextKapitel, getPrevKapitel, aufgabenFuerPfad,
  type AkademieSection, type AkademieSkript, type AkademieEinwand, type AkademieLink, type AkademieUebung, type AkademieGoldNugget,
} from "@/lib/vertriebsakademieContent";
import { AkademieProgressBar } from "@/components/vertriebsakademie/AkademieProgressBar";
import { useVaProgress, vaProgress, computeKapitelStats, computeGlobalStats, sichtbareUebungen } from "@/lib/vertriebsakademieProgress";
import { setVaReturn, currentMainScrollY, scrollMainTo, clearVaReturn } from "@/lib/vertriebsakademieReturn";
import { supabase } from "@/integrations/supabase/client";
import { buildVpUrl } from "@/lib/publicUrl";
import { useUser } from "@/contexts/UserContext";
import { useZielgruppe, showGoldNugget, showAdvancedUebung, showQuereinsteigerHinweis, abschnittHatInhalt } from "@/lib/vertriebsakademieZielgruppe";
import { AkademieAufgabenBlock } from "@/components/vertriebsakademie/aufgaben/AkademieAufgabenBlock";
import { AkademieAbschlusstest } from "@/components/vertriebsakademie/aufgaben/AkademieAbschlusstest";
import { AkademieAbwaegungsfall } from "@/components/vertriebsakademie/aufgaben/AkademieAbwaegungsfall";
import { ZielgruppenFilter } from "@/components/vertriebsakademie/ZielgruppenFilter";
import { AkademieVisualsBlock } from "@/components/vertriebsakademie/AkademieVisuals";
import { AkademieSectionNav } from "@/components/vertriebsakademie/AkademieSectionNav";
import { AkademieSuche } from "@/components/vertriebsakademie/AkademieSuche";
import { BeratungTrainingsCockpit } from "@/components/vertriebsakademie/BeratungTrainingsCockpit";
import { WarumKasten } from "@/components/vertriebsakademie/WarumKasten";
import { BegriffsText, useAbschnittsBegriffe } from "@/components/vertriebsakademie/BegriffsText";
import { AkademieAbsatz } from "@/components/vertriebsakademie/AkademieAbsatz";
import {
  AkademieBildBlock, AkademieVideoBlock, medienAusAbschnitt,
} from "@/components/vertriebsakademie/AkademieMedien";
import { AkademieSerieKompakt } from "@/components/vertriebsakademie/AkademieSerie";
import { KapitelAbschluss } from "@/components/vertriebsakademie/KapitelAbschluss";
import { KapitelFeier } from "@/components/vertriebsakademie/KapitelFeier";

/** Ersetzt Platzhalter wie {{MeineLandingpage}} durch echte Werte. */
function applyPlaceholders(text: string, values: { landingpage?: string | null }): string {
  const link = values.landingpage || "(deine persönliche Landingpage wird geladen …)";
  return text.replace(/\{\{\s*MeineLandingpage\s*\}\}/g, link);
}

function CopyBlock({ skript, landingpageUrl }: { skript: AkademieSkript; landingpageUrl: string | null }) {
  const { toast } = useToast();
  const rendered = applyPlaceholders(skript.text, { landingpage: landingpageUrl });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rendered);
      toast({ title: "In Zwischenablage kopiert" });
    } catch {
      toast({ title: "Kopieren fehlgeschlagen", variant: "destructive" });
    }
  };
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-4 py-2 bg-muted/50 border-b">
        <div>
          <div className="text-sm font-medium">{skript.titel}</div>
          {skript.kontext && (
            <div className="text-xs text-muted-foreground mt-0.5">{skript.kontext}</div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={copy} className="gap-1 shrink-0">
          <Copy className="h-3.5 w-3.5" /> Kopieren
        </Button>
      </div>
      <pre className="text-sm whitespace-pre-wrap px-4 py-3 font-sans leading-relaxed">
        {rendered}
      </pre>
      {skript.warum && (
        <WarumKasten
          className="border-t"
          titel={skript.warumTitel ?? deriveWarumTitel(rendered, skript.titel)}
          text={skript.warum}
        />
      )}
    </div>
  );
}

function deriveWarumTitel(rendered: string, titel: string): string {
  const combined = `${titel} ${rendered}`.toLowerCase();
  // Enthält der Skript-Text tatsächliche Fragen an den Kunden?
  const hatFrage = /\?/.test(rendered);
  // Handelt es sich um einen Einwand/Absage-Kontext?
  const istEinwand = /(einwand|absage|widerspruch|kontert|nein|abwehr)/.test(combined);
  const istUebergang = /(überleit|übergang|bridge|transition|handover)/.test(combined);
  const istOpener = /(opener|eröffnung|einstieg|begrüß|hallo|guten tag)/.test(combined);
  const istClose = /(close|abschluss|closing|termin(vereinbarung)?|call to action)/.test(combined);
  const istPitch = /(pitch|präsentation|story|elevator)/.test(combined);

  if (hatFrage) return "Warum diese Frage so aufgebaut ist";
  if (istEinwand) return "Warum diese Einwand-Antwort so wirkt";
  if (istUebergang) return "Warum diese Überleitung so funktioniert";
  if (istOpener) return "Warum dieser Einstieg so wirkt";
  if (istClose) return "Warum dieser Abschluss so funktioniert";
  if (istPitch) return "Warum dieser Pitch so aufgebaut ist";
  return "Warum dieses Skript so aufgebaut ist";
}

function EinwandRow({ e }: { e: AkademieEinwand }) {
  return (
    <AccordionItem value={e.einwand} className="border rounded-lg px-4 mb-2">
      <AccordionTrigger className="text-left text-sm hover:no-underline">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-apple-orange mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">„{e.einwand}"</div>
            {e.technik && (
              <div className="text-xs text-muted-foreground mt-0.5">Technik: {e.technik}</div>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="text-sm text-foreground/90 leading-relaxed">
        {e.antwort}
        {e.warum && (
          <WarumKasten
            className="mt-3 rounded-lg border border-blue-200/70 dark:border-blue-900/50"
            titel={e.warumTitel ?? "Warum diese Antwort so wirkt"}
            text={e.warum}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function GoldNuggetBox({ nugget, landingpageUrl }: { nugget: AkademieGoldNugget; landingpageUrl: string | null }) {
  return (
    <div className="rounded-lg border-2 border-amber-500/40 bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-amber-950/30 dark:to-amber-900/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0">
          <Gem className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-0.5">
            💎 Gold-Nugget für Profis
          </div>
          <div className="text-sm font-semibold text-foreground">{nugget.titel}</div>
          <div className="mt-2 text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{nugget.text}</div>
          {nugget.bullets && nugget.bullets.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {nugget.bullets.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
                  <span className="flex-1">{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {nugget.skript && (
        <div className="pt-1">
          <CopyBlock skript={nugget.skript} landingpageUrl={landingpageUrl} />
        </div>
      )}
    </div>
  );
}

function LinkList({ links, kapitelSlug, kapitelNummer, kapitelTitel, sectionId }: {
  links: AkademieLink[];
  kapitelSlug: string;
  kapitelNummer: string;
  kapitelTitel: string;
  sectionId: string;
}) {
  const { pathname } = useLocation();
  // Optik einmal festlegen, damit interner und externer Verweis gleich aussehen.
  const kachel =
    "flex items-start justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary hover:text-primary hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] active:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary transition-all duration-200";

  const inhalt = (l: AkademieLink) => (
    <>
      <span className="flex items-start gap-2 min-w-0">
        <Link2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span className="min-w-0">
          <span className="block truncate">{l.label}</span>
          {l.hinweis && (
            <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
              {l.hinweis}
            </span>
          )}
        </span>
      </span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 mt-0.5" />
    </>
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {links.map((l) =>
        // Ein externer Verweis darf nicht als interne Route laufen, sonst
        // landet der Klick im Leeren.
        l.external ? (
          <a
            key={l.to + l.label}
            href={l.to}
            target="_blank"
            rel="noreferrer"
            className={kachel}
          >
            {inhalt(l)}
          </a>
        ) : (
          <Link
            key={l.to + l.label}
            to={l.to}
            onClick={() => {
              setVaReturn({
                kapitelSlug,
                kapitelNummer,
                kapitelTitel,
                sectionId,
                scrollY: currentMainScrollY(),
                academyBase: pathname.startsWith("/vertriebsakademie-neu") ? "/vertriebsakademie-neu" : "/vertriebsakademie",
                targetPath: l.to.split("?")[0].split("#")[0],
              });
            }}
            className={kachel}
          >
            {inhalt(l)}
          </Link>
        ),
      )}
    </div>
  );
}

export function SectionBlock({ section, slug, kapitelNummer, kapitelTitel, landingpageUrl, onSprung, vollerText = false }: {
  section: AkademieSection;
  slug: string;
  kapitelNummer: string;
  kapitelTitel: string;
  landingpageUrl: string | null;
  onSprung?: (abschnittId: string) => void;
  vollerText?: boolean;
}) {
  const s = useVaProgress();
  const [zielgruppe] = useZielgruppe();
  const zeigeGold = showGoldNugget(zielgruppe);
  const zeigeAdvanced = showAdvancedUebung(zielgruppe);
  const zeigeQuereinsteiger = showQuereinsteigerHinweis(zielgruppe);
  const uebungen = (section.uebungen ?? []).filter((u) => zeigeAdvanced || !u.advanced);
  const aufgaben = aufgabenFuerPfad(section, zielgruppe);
  // Begriffserklärungen nur im Lehrtext. Skripte werden wörtlich gesprochen
  // und bleiben deshalb frei von Erklärknöpfen (sie rendern in `CopyBlock`).
  const begriffe = useAbschnittsBegriffe({
    absaetze: section.absaetze,
    bullets: section.bullets,
    profiTipp: zeigeGold ? section.profiTipp : undefined,
    quereinsteigerHinweis: zeigeQuereinsteiger ? section.quereinsteigerHinweis : undefined,
  });
  // Bild und Video, sobald der Inhaltstyp die Felder führt. Siehe AkademieMedien.
  const medien = medienAusAbschnitt(section);
  return (
    <div id={`va-sec-${section.id}`} className="space-y-4 scroll-mt-24">
      {section.intro && (
        <p className="text-sm text-muted-foreground italic">{section.intro}</p>
      )}

      {medien.bild && <AkademieBildBlock bild={medien.bild} />}

      {/* Lange Absätze zeigen zuerst ihren Anfang. Die Begriffserkennung läuft
          unverändert über den vollen Text, gekürzt wird erst deren Ergebnis. */}
      {section.absaetze?.map((_p, i) => (
        <AkademieAbsatz key={i} segmente={begriffe.absaetze[i]} vollerText={vollerText} />
      ))}

      {medien.video && <AkademieVideoBlock video={medien.video} />}

      {section.trainingsCockpit && <BeratungTrainingsCockpit />}

      {section.praesentationEmbed && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5" /> Live-Vorschau: {section.praesentationEmbed.label}
            </div>
            <Button asChild size="sm" variant="outline" className="gap-1">
              <a href={section.praesentationEmbed.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {section.praesentationEmbed.oeffnenLabel ?? "In neuem Tab öffnen"}
              </a>
            </Button>
          </div>
          <div className="relative w-full overflow-hidden rounded-lg border bg-background">
            <iframe
              src={section.praesentationEmbed.url}
              title={section.praesentationEmbed.label}
              loading="lazy"
              className="w-full block"
              style={{ height: (section.praesentationEmbed.hoehe ?? 720) + "px" }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Scrolle durch die Präsentation, um jede Sektion zu sehen. Für die volle Ansicht am besten in eigenem Tab öffnen.
          </p>
        </div>
      )}

      {section.bullets && section.bullets.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {section.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary mt-1">•</span>
              <span className="flex-1"><BegriffsText segmente={begriffe.bullets[i]} /></span>
            </li>
          ))}
        </ul>
      )}

      {section.visuals && section.visuals.length > 0 && (
        <AkademieVisualsBlock visuals={section.visuals} zeigeAdvanced={zeigeGold} />
      )}

      {section.skripte && section.skripte.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" /> Skripte
          </div>
          {section.skripte.map((s, i) => <CopyBlock key={i} skript={s} landingpageUrl={landingpageUrl} />)}
        </div>
      )}

      {section.einwaende && section.einwaende.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" /> Einwandbehandlung
          </div>
          <Accordion type="multiple" className="w-full">
            {section.einwaende.map((e, i) => <EinwandRow key={i} e={e} />)}
          </Accordion>
        </div>
      )}

      {section.checkliste && section.checkliste.length > 0 && (
        <div className="space-y-2 rounded-lg bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" /> Checkliste
          </div>
          <ul className="space-y-1.5 text-sm">
            {section.checkliste.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 accent-primary cursor-pointer"
                  checked={!!s.checks[`${slug}::${section.id}::${i}`]}
                  onChange={() => vaProgress.toggleCheck(slug, section.id, i)}
                />
                <span className={`flex-1 ${s.checks[`${slug}::${section.id}::${i}`] ? "line-through text-muted-foreground" : ""}`}>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aufgaben.length > 0 && (
        <AkademieAufgabenBlock slug={slug} aufgaben={aufgaben} onSprung={onSprung} />
      )}

      {uebungen.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Dumbbell className="h-3.5 w-3.5" /> Übungen &amp; Aufgaben
          </div>
          <div className="space-y-2">
            {uebungen.map((u) => {
              const done = !!s.uebungen[`${slug}::${u.id}`];
              const answerKey = `${slug}::${u.id}`;
              const currentAnswer = s.answers[answerKey] || "";
              const antwortTyp = u.antwortTyp ?? "keine";
              const need = u.mindestZeichen ?? 20;
              const chars = currentAnswer.trim().length;
              const isAdvanced = !!u.advanced;
              return (
                <div key={u.id} className={`flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors ${done ? "border-emerald-500/40 bg-emerald-500/5" : isAdvanced ? "border-amber-500/40 bg-gradient-to-br from-amber-50/70 to-amber-100/30 dark:from-amber-950/20 dark:to-amber-900/10" : ""}`}>
                  <input
                    type="checkbox"
                    className="mt-1 accent-primary cursor-pointer"
                    checked={done}
                    onChange={() => vaProgress.toggleUebung(slug, u.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{u.titel}</div>
                      {isAdvanced && (
                        <Badge className="text-[10px] gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40">
                          <Gem className="h-3 w-3" /> Advanced Challenge
                        </Badge>
                      )}
                      {u.advanced && (
                        <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                          Bonus-Aufgabe
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{u.beschreibung}</div>
                    {antwortTyp !== "keine" && (
                      <div className="mt-3 space-y-1">
                        {u.antwortLabel && (
                          <label className="text-[11px] font-medium text-foreground/80">{u.antwortLabel}</label>
                        )}
                        {antwortTyp === "text" ? (
                          <Input
                            value={currentAnswer}
                            placeholder={u.antwortPlaceholder}
                            onChange={(e) => vaProgress.setAnswer(slug, u.id, e.target.value)}
                            className="h-9 text-sm"
                          />
                        ) : (
                          <Textarea
                            value={currentAnswer}
                            placeholder={u.antwortPlaceholder}
                            onChange={(e) => vaProgress.setAnswer(slug, u.id, e.target.value)}
                            className="min-h-[90px] text-sm resize-y"
                          />
                        )}
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{chars}/{need} Zeichen · Antwort wird automatisch gespeichert &amp; für Coach sichtbar</span>
                          {chars >= need && <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Freigeschaltet</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {section.profiTipp && zeigeGold && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">Profi-Tipp</div>
            <div className="text-foreground/90"><BegriffsText segmente={begriffe.profiTipp} /></div>
          </div>
        </div>
      )}

      {section.quereinsteigerHinweis && zeigeQuereinsteiger && (
        <div className="flex items-start gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
          <Info className="h-4 w-4 text-sky-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Für Quereinsteiger — kurz erklärt</div>
            <div className="text-foreground/90 whitespace-pre-line">
              <BegriffsText segmente={begriffe.quereinsteigerHinweis} />
            </div>
          </div>
        </div>
      )}

      {section.goldNugget && zeigeGold && (
        <GoldNuggetBox nugget={section.goldNugget} landingpageUrl={landingpageUrl} />
      )}

      {section.links && section.links.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" /> Interne Verlinkungen
          </div>
          <LinkList
            links={section.links}
            kapitelSlug={slug}
            kapitelNummer={kapitelNummer}
            kapitelTitel={kapitelTitel}
            sectionId={section.id}
          />
        </div>
      )}
    </div>
  );
}

export default function VertriebsakademieKapitel() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const kap = getKapitelBySlug(slug);
  const { authUser } = useUser();
  const [landingpageUrl, setLandingpageUrl] = useState<string | null>(null);
  // Accordion-State: welche Sections sind offen. Zu Beginn nur die erste.
  const [openSections, setOpenSections] = useState<string[]>(
    () => (kap?.sections[0] ? [`va-sec-${kap.sections[0].id}`] : []),
  );

  /*
    Der Abschnitt, der gerade eingerahmt ist. Drei Sekunden, dann von allein
    weg. Ohne das landet man nach einem Sprung irgendwo in einer Textwand und
    sucht die Stelle, auf die man gerade geklickt hat. Dasselbe Muster steht
    im Vertriebshandbuch.
  */
  const [hervor, setHervor] = useState<string | null>(null);

  useEffect(() => {
    if (!hervor) return;
    const uhr = window.setTimeout(() => setHervor(null), 3000);
    return () => window.clearTimeout(uhr);
  }, [hervor]);

  const jumpToSection = (id: string) => {
    const key = `va-sec-${id}`;
    setOpenSections((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setHervor(id);
    setTimeout(() => {
      const el = document.getElementById(key);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  // Persönliche Landingpage des angemeldeten Partners einmalig laden — für
  // {{MeineLandingpage}}-Platzhalter in den Skripten.
  useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ensure-vp-slug", { body: {} });
        if (!cancelled && !error && data?.slug) setLandingpageUrl(buildVpUrl(data.slug));
      } catch {
        // ignore — Platzhalter bleibt sichtbar
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  // Sprung aus einem anderen Kapitel oder Rückkehr über das VaBackBanner.
  // Der Zielabschnitt wird zuerst aufgeklappt, sonst landet der Sprung auf
  // einer geschlossenen Kopfzeile und der Leser sieht nichts von dem, was ihn
  // hergeführt hat.
  useEffect(() => {
    const target = searchParams.get("vaScrollTo");
    if (!target || !kap) return;
    const t = window.setTimeout(() => {
      jumpToSection(target);
      // Query aufräumen, Return-Context löschen
      const sp = new URLSearchParams(searchParams);
      sp.delete("vaScrollTo");
      setSearchParams(sp, { replace: true });
      clearVaReturn();
    }, 120);
    return () => window.clearTimeout(t);
  }, [searchParams, kap, setSearchParams]);

  if (!kap) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto py-10 text-center space-y-4">
          <h1 className="text-2xl font-semibold">Kapitel nicht gefunden</h1>
          <Button asChild variant="outline">
            <Link to="/vertriebsakademie">Zurück zur Übersicht</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const prev = getPrevKapitel(slug);
  const next = getNextKapitel(slug);
  const progressState = useVaProgress();
  const [seitenZielgruppe] = useZielgruppe();
  const kapStats = computeKapitelStats(kap, progressState, seitenZielgruppe);
  // Der Gesamtstand laeuft ueber alle 19 Kapitel. Er wird nur fuer den
  // Uebergang am Kapitelende gebraucht, also nicht bei jedem Haken neu.
  const gesamtStats = useMemo(
    () => computeGlobalStats(progressState, seitenZielgruppe),
    [progressState, seitenZielgruppe],
  );
  const kapitelDone = !!progressState.kapitelDone[kap.slug];

  // Abschnitte, die im gewaehlten Lernpfad ueberhaupt Inhalt tragen.
  const sections = useMemo(
    () => kap.sections.filter((sec) => abschnittHatInhalt(sec, seitenZielgruppe)),
    [kap, seitenZielgruppe],
  );
  const [expanded, setExpanded] = useState(false);

  /*
    Die Kapitelsuche bekommt genau dieses eine Kapitel. Die Liste wird gemerkt,
    damit sie nicht bei jedem Tastendruck ein neues Feld ist und die Suche
    dadurch jedes Mal von vorn rechnet.
  */
  const nurDiesesKapitel = useMemo(() => [kap], [kap]);

  const activeSectionId = openSections[openSections.length - 1]?.replace("va-sec-", "");

  useEffect(() => {
    if (activeSectionId) merkeLesestelle(authUser?.id, { slug, section: activeSectionId });
  }, [authUser?.id, slug, activeSectionId]);

  return (
    <DashboardLayout>
      <div className="w-full space-y-6 pb-28 xl:pr-64">
        <Button variant="ghost" size="sm" onClick={() => navigate("/vertriebsakademie")} className="gap-1 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Zurück zur Vertriebsakademie
        </Button>

        <AkademieProgressBar showBackLink />

        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">Kapitel {kap.nummer}</Badge>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{kap.kicker}</span>
            {kap.placeholder && (
              <Badge className="text-[9px] bg-orange-500/15 text-orange-600 border-orange-500/30">
                in Arbeit
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-semibold">{kap.titel}</h1>
          <p className="text-base text-muted-foreground">{kap.teaser}</p>
        </div>

        <ZielgruppenFilter />

        {kap.ziel && (
          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="flex items-start gap-3">
              <Target className="h-4 w-4 text-primary mt-0.5" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
                  Lernziel
                </div>
                <div className="text-sm">{kap.ziel}</div>
              </div>
            </div>
          </Card>
        )}

        {/* Kapitel-Toolbar: Fortschritt + Kompakt/Erweitert-Steuerung */}
        {(() => {
          const firstOpenId = sections.find((sec) => {
            const checks = sec.checkliste || [];
            const ueb = sichtbareUebungen(sec, seitenZielgruppe);
            if (checks.length + ueb.length === 0) return false;
            const allC = checks.every((_c, i) => !!progressState.checks[`${kap.slug}::${sec.id}::${i}`]);
            const allU = ueb.every((u) => !!progressState.uebungen[`${kap.slug}::${u.id}`]);
            return !(allC && allU);
          })?.id;
          return (
            <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
                <BookOpen className="h-3.5 w-3.5" />
                <span>
                  {sections.length} Abschnitte ·{" "}
                  <span className="text-foreground font-medium">{kapStats.pct}%</span> bearbeitet
                </span>
                {/* Nur sichtbar, wenn wirklich eine Serie läuft. */}
                <AkademieSerieKompakt />
              </div>
              <div className="flex items-center gap-1">
                {firstOpenId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => jumpToSection(firstOpenId)}
                  >
                    <PlayCircle className="h-3.5 w-3.5" /> Weiter
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    if (expanded) { setOpenSections([]); setExpanded(false); }
                    else { setOpenSections(sections.map((s) => `va-sec-${s.id}`)); setExpanded(true); }
                  }}
                >
                  {expanded
                    ? <><ChevronsDownUp className="h-3.5 w-3.5" /> Alle zuklappen</>
                    : <><ChevronsUpDown className="h-3.5 w-3.5" /> Alle aufklappen</>}
                </Button>
              </div>
            </div>
          );
        })()}

        {/*
          Die Kapitelsuche. Sie bekommt bewusst nur dieses eine Kapitel und
          findet deshalb auch nur darin. Wer hier fragt, steht mitten in einem
          Thema; Treffer aus achtzehn anderen Kapiteln wären hier eine
          Ablenkung und keine Antwort. Die Suche über alle Kapitel steht auf
          der Übersicht.
        */}
        <AkademieSuche
          quelle={nurDiesesKapitel}
          mitKapitelNamen={false}
          platzhalter={`Nur in diesem Kapitel suchen, zum Beispiel: ${kap.sections[0]?.ueberschrift ?? "Frage stellen"}`}
          ariaLabel={`Im Kapitel ${kap.titel} suchen`}
          ohneTrefferText="Dazu steht nichts in diesem Kapitel. Die Suche auf der Übersicht sucht in allen Kapiteln."
          onSprung={(_slug, abschnittId) => jumpToSection(abschnittId)}
        />

        <Accordion
          type="multiple"
          value={openSections}
          onValueChange={(v) => setOpenSections(Array.isArray(v) ? v : [v as string])}
          className="space-y-3"
        >
          {sections.map((sec, idx) => {
            const key = `va-sec-${sec.id}`;
            const totalChecks = sec.checkliste?.length ?? 0;
            const sichtbar = sichtbareUebungen(sec, seitenZielgruppe);
            const totalUeb = sichtbar.length;
            const doneChecks = (sec.checkliste || []).reduce((n, _c, i) => n + (progressState.checks[`${kap.slug}::${sec.id}::${i}`] ? 1 : 0), 0);
            const doneUeb = sichtbar.reduce((n, u) => n + (progressState.uebungen[`${kap.slug}::${u.id}`] ? 1 : 0), 0);
            const total = totalChecks + totalUeb;
            const done = doneChecks + doneUeb;
            const secPct = total > 0 ? Math.round((done / total) * 100) : 0;
            // Massgeblich ist der ausdrueckliche Haken der Lektion, nicht ob
            // zufaellig alle Uebungen erledigt sind. Ein reiner Textabschnitt
            // konnte vorher ueberhaupt nie als erledigt gelten, weil er weder
            // Checkliste noch Uebungen hat.
            const secDone = !!progressState.sectionsDone[`${kap.slug}::${sec.id}`] || kapitelDone;
            return (
              <AccordionItem
                key={sec.id}
                /*
                  Die Kennung braucht der Sprung: `jumpToSection` sucht das
                  Ziel mit `getElementById`. Ohne sie klappte der Abschnitt
                  zwar auf, die Seite blieb aber stehen, wo sie war.
                */
                id={key}
                value={key}
                className={`scroll-mt-24 rounded-xl border bg-card overflow-hidden data-[state=open]:shadow-md transition-all duration-500 ${
                  secDone ? "border-emerald-500/40" : ""
                } ${hervor === sec.id ? "ring-2 ring-primary ring-offset-4 ring-offset-background" : "ring-0"}`}
              >
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${secDone ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"}`}>
                      {secDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold leading-tight">{sec.ueberschrift}</div>
                      {total > 0 && (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1 w-24 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full transition-all ${secDone ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${secPct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{done}/{total}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5 pt-1">
                  <SectionBlock
                    section={sec}
                    slug={kap.slug}
                    kapitelNummer={kap.nummer}
                    kapitelTitel={kap.titel}
                    landingpageUrl={landingpageUrl}
                    onSprung={jumpToSection}
                  />

                  {/* Abschluss der Lektion. Zaehlt in den Fortschrittsbalken:
                      alle Lektionen und alle Kapitel erledigt sind 100 Prozent. */}
                  <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3">
                    <div className="text-sm">
                      <div className="font-medium">
                        {secDone ? "Lektion abgeschlossen" : "Diese Lektion durchgearbeitet?"}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {kapitelDone
                          ? "Das ganze Kapitel ist als abgeschlossen markiert."
                          : "Der Haken zaehlt in deinen Fortschritt."}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={secDone ? "outline" : "default"}
                      disabled={kapitelDone}
                      className="shrink-0 gap-2"
                      onClick={() => vaProgress.toggleSectionDone(kap.slug, sec.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {secDone ? "Erledigt" : "Als abgeschlossen markieren"}
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        <AkademieSectionNav kap={kap} activeId={activeSectionId} onJump={jumpToSection} />

        {/*
          Der Abwaegungsfall gilt in jedem Lernpfad.

          Er hing bisher an `showGoldNugget`, war also im Quereinsteigerpfad
          unsichtbar. Damit verlor gerade der Anfaenger vierzehn Faelle, und
          zwar den einzigen Baustein ohne richtige Antwort, der stattdessen
          zeigt, wie das Team entschieden hat. Genau das ist fuer jemanden
          wertvoll, der die Regel noch nicht im Gefuehl hat.
        */}
        {kap.abwaegungsfall && (
          <AkademieAbwaegungsfall slug={kap.slug} fall={kap.abwaegungsfall} />
        )}

        <AkademieAbschlusstest kap={kap} onSprung={jumpToSection} />

        <Card className={`p-5 border-2 transition-colors ${kapitelDone ? "border-emerald-500/50 bg-emerald-500/5" : "border-primary/40 bg-primary/5"}`}>
          <div className="flex items-start gap-4 flex-wrap">
            <div className={`p-3 rounded-xl shrink-0 ${kapitelDone ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary"}`}>
              {kapitelDone ? <CheckCircle2 className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="text-sm font-semibold">
                {kapitelDone ? "Kapitel abgeschlossen — stark!" : "Kapitel abschließen"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Fortschritt: {kapStats.pct}%
                {kapStats.totalAufgaben > 0 && ` · ${kapStats.doneAufgaben}/${kapStats.totalAufgaben} Aufgaben`}
                {kapStats.totalChecks > 0 && ` · ${kapStats.doneChecks}/${kapStats.totalChecks} Checks`}
                {kapStats.totalUebungen > 0 && ` · ${kapStats.doneUebungen}/${kapStats.totalUebungen} Übungen`}
              </div>
              <div className="h-1.5 mt-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all" style={{ width: `${kapStats.pct}%` }} />
              </div>
            </div>
            <Button
              variant={kapitelDone ? "outline" : "default"}
              onClick={() => vaProgress.setKapitelDone(kap.slug, !kapitelDone)}
              className="gap-2 shrink-0"
            >
              {kapitelDone ? "Als offen markieren" : "Als abgeschlossen markieren"}
            </Button>
          </div>
        </Card>

        {/* Konfetti und Einblender, wenn das Kapitel auf 100 Prozent springt. */}
        <KapitelFeier
          key={kap.slug}
          slug={kap.slug}
          titel={kap.titel}
          pct={kapStats.pct}
          alleKapitelFertig={gesamtStats.totalKapitel > 0 && gesamtStats.doneKapitel === gesamtStats.totalKapitel}
        />

        {/* Was habe ich geschafft, was kommt als Naechstes, warum lohnt es sich. */}
        <KapitelAbschluss
          kap={kap}
          stats={kapStats}
          gesamt={gesamtStats}
          next={next}
          kapitelDone={kapitelDone}
          testBestanden={
            kap.abschlusstest
              ? !!progressState.aufgaben[`${kap.slug}::abschlusstest-${kap.slug}`]?.geloest
              : undefined
          }
          zielgruppe={seitenZielgruppe}
        />

        {/*
          Nur noch der Weg zurueck.

          Hier stand zusaetzlich ein Knopf zum naechsten Kapitel, direkt unter
          dem gleichlautenden aus `KapitelAbschluss`. Zwei Weiter-Knoepfe
          untereinander schwaechen beide, und der obere ist der bessere: Er
          sagt, was gerade geschafft wurde und was das naechste Kapitel bringt.
        */}
        <div className="flex items-center justify-between gap-2 pt-4 border-t">
          {prev ? (
            <Button asChild variant="outline" className="gap-1">
              <Link to={`/vertriebsakademie/${prev.slug}`}>
                <ArrowLeft className="h-4 w-4" /> Kap. {prev.nummer}: {prev.titel}
              </Link>
            </Button>
          ) : <div />}
          {next ? <div /> : (
            <Button asChild variant="outline" className="gap-1">
              <Link to="/vertriebsakademie">
                <BookOpen className="h-4 w-4" /> Zurück zur Übersicht
              </Link>
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}