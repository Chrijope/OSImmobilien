import { Fragment } from "react";
import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import {
  ArrowRight, Users, ShieldAlert, Rocket, Zap, Route as RouteIcon,
} from "lucide-react";
import { VERTRIEBSAKADEMIE_KAPITEL } from "@/lib/vertriebsakademieContent";
import { ZielgruppenFilter } from "@/components/vertriebsakademie/ZielgruppenFilter";
import { useVaProgress, computeKapitelStats } from "@/lib/vertriebsakademieProgress";
import { useZielgruppe } from "@/lib/vertriebsakademieZielgruppe";
import { AkademieHero } from "@/components/vertriebsakademie/AkademieHero";
import { AkademieRoadmap } from "@/components/vertriebsakademie/AkademieRoadmap";
import { AkademieKapitelKachel } from "@/components/vertriebsakademie/AkademieKapitelKachel";
import { AkademieTeamVergleich } from "@/components/vertriebsakademie/AkademieTeamVergleich";
import { AkademieSiegel } from "@/components/vertriebsakademie/AkademieSiegel";
import { AkademieSerie } from "@/components/vertriebsakademie/AkademieSerie";
import { AkademieSuche } from "@/components/vertriebsakademie/AkademieSuche";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";

export default function Vertriebsakademie() {
  const progressState = useVaProgress();
  const [zielgruppe] = useZielgruppe();
  const { user } = useUser();
  const navigate = useNavigate();
  const isCoach = ["admin", "inhaber", "vertriebsleiter"].includes(user.role);
  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <PageHeader
          title="Vertriebsakademie"
          subtitle="Dein kompletter Fahrplan durch den Vertrieb von Kapitalanlage-Immobilien — von den Grundlagen bis zum Empfehlungssystem."
        >
          {isCoach && (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to="/vertriebsakademie/admin">
                <Users className="h-4 w-4" /> Fortschritt Partner
              </Link>
            </Button>
          )}
        </PageHeader>

        {/*
          Die Gesamtsuche sitzt im Hero, nicht darueber. Wer die Seite
          oeffnet, sieht dort zuerst hin. Sie geht ueber alle Kapitel, denn
          wer hier ankommt, weiss meistens seine Frage, aber nicht das
          Kapitel. Der Sprung landet ueber `vaScrollTo` direkt im Abschnitt,
          der dort drei Sekunden lang eingerahmt wird.
        */}
        <AkademieHero
          suche={
            <AkademieSuche
              quelle={VERTRIEBSAKADEMIE_KAPITEL}
              mitKapitelNamen
              platzhalter="Frage stellen, zum Beispiel: Was sage ich, wenn der Kunde den Preis vergleicht?"
              ariaLabel="In allen Kapiteln der Vertriebsakademie suchen"
              ohneTrefferText="Dazu steht nichts in den Kapiteln. Versuche es mit einem anderen Wort, oder sieh in der Einwand-Bibliothek nach."
              onSprung={(kapitelSlug, abschnittId) =>
                navigate(`/vertriebsakademie/${kapitelSlug}?vaScrollTo=${abschnittId}`)
              }
            />
          }
        />

        {/* Serie: Tage in Folge mit mindestens einer geloesten Aufgabe.
            Steht direkt ueber dem Uebungsplatz, weil genau dort der naechste
            Tag verdient wird. */}
        <AkademieSerie />

        {/* Übungsplatz: Tagesimpuls, Karteikarten, Profi-Impuls der Woche */}
        <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Zap className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Übungsplatz</div>
              <p className="text-xs text-muted-foreground">
                Drei Aufgaben am Tag, Karteikarten aus Lexikon und Zahlenkapitel
                {zielgruppe === "profi" ? ", dazu der Profi-Impuls der Woche." : "."}
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="gap-1 shrink-0">
            <Link to="/vertriebsakademie/training">
              Öffnen <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </Card>

        {/* 2. Roadmap – schmale Progress-Leiste, dient nur der Orientierung */}
        <AkademieRoadmap />

        {/* 3. Kapitel-Grid – Haupt-Navigation */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Alle Kapitel
            </h3>
            <ZielgruppenFilter />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {VERTRIEBSAKADEMIE_KAPITEL.map((k, i) => (
              <Fragment key={k.slug}>
                <AkademieKapitelKachel
                  k={k}
                  index={i}
                  stats={computeKapitelStats(k, progressState, zielgruppe)}
                />
                {/* Ablaufplan zwischen Kapitel 2 (Pitch) und 3 (Leadgenerierung):
                    ab Leadgenerierung beginnt der Prozess, den der Plan im Ueberblick zeigt. */}
                {k.slug === "pitch-und-aufhaenger" && (
                  <Link to="/vertriebsakademie/ablaufplan" className="block group md:col-span-2">
                    <Card className="p-5 border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-transparent hover:border-primary/60 hover:shadow-md transition-all">
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
                          <RouteIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Ablaufplan
                          </span>
                          <h3 className="mt-1 text-base font-semibold leading-snug group-hover:text-primary transition-colors">
                            Der Weg zum Abschluss
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Alle acht Stationen von Neuer Lead bis Provisionszahlung, den
                            Pipelinestufen zugeordnet, mit Zeitangaben je Termin. Auch als PDF.
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary shrink-0 self-center">
                          Öffnen <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Card>
                  </Link>
                )}
              </Fragment>
            ))}
          </div>
        </div>

        {/* 4. Zusatz-Bereiche kompakt in Tabs */}
        <Tabs defaultValue="siegel" className="w-full">
          <TabsList>
            <TabsTrigger value="siegel">Auszeichnungen</TabsTrigger>
            <TabsTrigger value="team">Team-Vergleich</TabsTrigger>
            <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          </TabsList>
          <TabsContent value="siegel" className="mt-4">
            <AkademieSiegel />
          </TabsContent>
          <TabsContent value="team" className="mt-4">
            <AkademieTeamVergleich />
          </TabsContent>
          <TabsContent value="shortcuts" className="mt-4 grid gap-4 md:grid-cols-2">
            <Link to="/vertriebsakademie/einwaende" state={{ vonAkademie: true }} className="block group">
              <Card className="p-5 h-full border-2 border-rose-500/30 bg-gradient-to-br from-rose-500/5 to-transparent hover:border-rose-500/60 hover:shadow-md transition-all">
                <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-600 w-fit mb-3">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold group-hover:text-rose-600 transition-colors">Einwand-Bibliothek</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Kundeneinwände mit Antwortvarianten, Fallen & Meta-Moves — auch mitten im Gespräch.
                </p>
                <div className="pt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                  Öffnen <ArrowRight className="h-3 w-3" />
                </div>
              </Card>
            </Link>
            <Link to="/vertriebsakademie/grundlagen" className="block group">
              <Card className="p-5 h-full border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/40 hover:shadow-md transition-all">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary w-fit mb-3">
                  <Rocket className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold group-hover:text-primary transition-colors">Quereinsteiger?</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Starte mit Kapitel 0 (Grundlagen) und arbeite dich chronologisch durch. Profis nutzen den „Profi-Pfad".
                </p>
                <div className="pt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Kapitel 0 starten <ArrowRight className="h-3 w-3" />
                </div>
              </Card>
            </Link>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}