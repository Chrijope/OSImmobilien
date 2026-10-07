/**
 * Der Reiter Videocall im neuen Bewerberprozess.
 *
 * Er heißt weiterhin „Videocall", weil der Statusschlüssel in der Datenbank
 * `Erstgespraech` bleibt und die Stufe im Ablauf so beschriftet ist. Der
 * Termin selbst heißt überall, wo ihn ein Mensch liest,
 * **Persönliches Gespräch**.
 *
 * Drei Zonen:
 *
 *   1. **Der Kopf.** Der selbst gebuchte Termin mit dem Weg in den Videoraum,
 *      der Stand des Kennenlernens, die beiden Knöpfe in Moderation und
 *      Präsentation.
 *   2. **Aus dem Kennenlernbogen.** Alle Antworten, in drei Gruppen. Sie sind
 *      die einzige Vorbereitung, die dieser Termin braucht.
 *   3. **Die Seitenleiste.** Wo wir stehen (Folie n von m), das Kurzprofil aus
 *      fünf Merkmalen und die Karte „Gespräch beenden" mit den vier Knöpfen.
 *
 * ## Warum das alte Zehn-Punkte-Skript hier nicht mehr steht
 *
 * Es war eine zweite Welt neben der Moderation: `assessmentSkript` mit zehn
 * Punkten und sechzehn Abschnitten auf der einen Seite, `bewerberVideocall`
 * mit sechs Kernbausteinen und den Modulen auf der anderen. Beide teilten
 * kein einziges Feld. Wer den Videocall führte, füllte das Skript nicht aus,
 * und trotzdem hingen Status, Zusammenfassung und Closing daran. Im neuen
 * Ablauf gibt es deshalb nur noch eine Erfassung, und sie steht in der
 * Moderation und hier. **Der bestehende Ablauf behält sein Skript
 * unverändert**; er läuft weiter über `ErstgespraechsTab`.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Calendar, Check, ExternalLink, MonitorPlay, Video,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import type { Bewerber } from "@/lib/bewerbungStore";
import { TERMIN_ZEITZONE } from "@/lib/bewerberTermine";
import { moderationsUrl, praesentationsUrl } from "@/lib/praesentationsKopplung";
import { uebungsUrl } from "@/lib/praesentationsUebung";
import {
  ENTSCHEIDUNG_LABELS,
  WUNSCH_LABELS,
  dauerMinuten,
  getStrecke,
  lies,
  merkmale,
  zusatzModule,
} from "@/lib/bewerberVideocall";
import {
  useKennenlernenAntworten,
  useKooperationsgespraechAbschluss,
  useSelbstGebuchterTermin,
  useVideocallErfassung,
  useVideocallFolien,
} from "@/components/bewerbung/useBewerberVideocall";
import { KennenlernbogenKarte } from "@/components/bewerbung/KennenlernbogenKarte";
import { GespraechEinladung } from "@/components/bewerbung/GespraechEinladung";
import { VorwissenKarte } from "@/components/bewerbung/VorwissenKarte";
import { useVorwissen } from "@/components/bewerbung/useErstgespraechSkript";
import { VideocallMitschriftKarte } from "@/components/bewerbung/VideocallMitschriftKarte";
import { VideocallNotizKarte } from "@/components/bewerbung/VideocallNotizKarte";
import { MitschriftenKasten } from "@/components/mitschrift/MitschriftenKasten";
import { ladeBewerberRaumIds } from "@/lib/bewerberTerminStore";
import { GespraechBeendenKarte } from "@/components/bewerbung/VideocallAbschluss";
import { AbsageDialog, ZusammenfassungKarte } from "@/components/bewerbung/erstgespraechBausteine";

function datumKurz(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

/**
 * Datum und Uhrzeit des gebuchten Termins, in deutscher Zeit.
 *
 * Ausdrücklich in `TERMIN_ZEITZONE` und nicht in der des Browsers, dieselbe
 * Entscheidung wie in der Kennenlernen-Karte: Wer aus dem Ausland ins CRM
 * sieht, soll dieselbe Uhrzeit lesen wie die HR-Managerin.
 */
function terminText(startAt: string): string {
  const d = new Date(startAt);
  if (isNaN(d.getTime())) return "";
  const tag = d.toLocaleDateString("de-DE", { timeZone: TERMIN_ZEITZONE });
  const zeit = d.toLocaleTimeString("de-DE", {
    timeZone: TERMIN_ZEITZONE, hour: "2-digit", minute: "2-digit",
  });
  return `${tag} um ${zeit} Uhr`;
}

export function VideocallTab({
  bewerber,
  canEdit,
  onRefresh,
  beraterName,
}: {
  bewerber: Bewerber;
  canEdit: boolean;
  onRefresh: () => void;
  beraterName: string;
}) {
  const { user } = useUser();
  const { antworten, eingereichtAm, buchungsToken, geladen, befund } = useKennenlernenAntworten(
    bewerber.id,
    bewerber.vorname,
  );
  const { erfassung, aendern } = useVideocallErfassung(bewerber, canEdit);
  const folien = useVideocallFolien(antworten, erfassung);
  const termin = useSelbstGebuchterTermin(bewerber.id);
  /*
   * Der alte Vorabbogen der uebernommenen Bewerber. Er wird immer geladen,
   * angezeigt aber nur, wenn kein Kennenlernbogen vorliegt. Wer beides hat,
   * sieht den neueren, sonst staende dieselbe Auskunft zweimal da.
   */
  const vorwissen = useVorwissen(bewerber.id);

  /*
   * Die Videoräume dieses Bewerbers, für die Mitschrift weiter unten.
   *
   * Warum nicht über den Kontakt wie in der Kundenakte: Ein Bewerberraum
   * trägt bewusst keine Kontaktkennung, ein Bewerber ist kein Kontakt. Ohne
   * diesen Weg wäre die Mitschrift zwar gespeichert, aber nirgends zu lesen.
   */
  const [raumIds, setRaumIds] = useState<string[]>([]);
  useEffect(() => {
    let lebt = true;
    void ladeBewerberRaumIds(bewerber.id).then((ids) => { if (lebt) setRaumIds(ids); });
    return () => { lebt = false; };
  }, [bewerber.id]);

  const [zusammenfassungOffen, setZusammenfassungOffen] = useState(true);
  const [vorwissenOffen, setVorwissenOffen] = useState(true);
  const [absageOffen, setAbsageOffen] = useState(false);
  const [absageModus, setAbsageModus] = useState<"kein_interesse" | "abgelehnt">("abgelehnt");
  const [absageGrund, setAbsageGrund] = useState("");

  /** Absage aus dem Abschluss heraus: derselbe Dialog wie die Knöpfe darunter. */
  const absageOeffnen = useCallback(
    (modus: "kein_interesse" | "abgelehnt", grundVorschlag = "") => {
      setAbsageModus(modus);
      setAbsageGrund(grundVorschlag);
      setAbsageOffen(true);
    },
    [],
  );

  const { abschliessen, zwischenspeichern, adressenSpeichern, ablehnen } =
    useKooperationsgespraechAbschluss({
      bewerber,
      beraterName: beraterName || user?.name || "",
      erfassung,
      onRefresh,
      onAbsageNoetig: absageOeffnen,
    });

  // Die Adressen leben am Bewerber und nicht im Gesprächsstand: Das Closing
  // liest genau diese beiden Felder, und ein zweiter Ort wäre ein zweiter
  // Wahrheitsanspruch.
  const [vertragsAdresse, setVertragsAdresse] = useState(bewerber.vertragsAdresse ?? "");
  const [rechnungsAdresse, setRechnungsAdresse] = useState(bewerber.rechnungsAdresse ?? "");
  const [identisch, setIdentisch] = useState(
    !bewerber.rechnungsAdresse || bewerber.rechnungsAdresse === bewerber.vertragsAdresse,
  );
  useEffect(() => {
    setVertragsAdresse(bewerber.vertragsAdresse ?? "");
    setRechnungsAdresse(bewerber.rechnungsAdresse ?? "");
    setIdentisch(!bewerber.rechnungsAdresse || bewerber.rechnungsAdresse === bewerber.vertragsAdresse);
  }, [bewerber.id, bewerber.vertragsAdresse, bewerber.rechnungsAdresse]);

  const skript = bewerber.erstgespraechSkript;
  const abgeschlossenAm = datumKurz(skript?.durchgefuehrtAm);
  const entscheidung = erfassung.entscheidung ?? "";
  const weg = antworten ? lies(antworten).weg : null;
  const strecke = weg ? getStrecke(weg) : null;
  const zusatz = zusatzModule(erfassung);
  const name = [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ");

  /** Adressen sofort ablegen: sie werden im Gespräch diktiert, nicht getippt. */
  const adressenAblegen = (vertrag: string, rechnung: string, gleich: boolean) => {
    if (!canEdit) return;
    adressenSpeichern(vertrag, gleich ? vertrag : rechnung);
  };

  return (
    <div className="space-y-4">
      {/* ─── Zone 1: der Kopf ─── */}
      <Card className="p-4 space-y-3" data-testid="videocall-kopf">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {abgeschlossenAm && entscheidung ? (
              <Badge className="h-6 gap-1 bg-green-600 text-white hover:bg-green-600 text-[11px]" data-testid="videocall-status">
                <Check className="h-3 w-3" aria-hidden />
                Persönliches Gespräch geführt am {abgeschlossenAm}
                {skript?.durchgefuehrtVon ? ` · ${skript.durchgefuehrtVon}` : ""}
              </Badge>
            ) : (
              <Badge variant="outline" className="h-6 gap-1 text-[11px] text-muted-foreground" data-testid="videocall-status">
                <Calendar className="h-3 w-3" aria-hidden />
                Noch nicht geführt
              </Badge>
            )}
            <Badge variant="outline" className="h-6 text-[11px] font-normal text-muted-foreground">
              {!geladen
                ? "Kennenlernen wird geladen"
                : antworten
                  ? `Kennenlernen ausgefüllt${eingereichtAm ? ` am ${datumKurz(eingereichtAm)}` : ""}`
                  : "Kein ausgefülltes Kennenlernen"}
            </Badge>
            {strecke && (
              <Badge variant="secondary" className="h-6 text-[11px] font-normal">
                {strecke.label} · {dauerMinuten(strecke.weg, zusatz)} Minuten
              </Badge>
            )}
            {entscheidung && (
              <Badge variant="outline" className="h-6 text-[11px] font-normal">
                {ENTSCHEIDUNG_LABELS[entscheidung]}
              </Badge>
            )}
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {/* „Moderation öffnen" führt bei jedem Bewerber in dieselbe
                  Moderation: links die Wahl zwischen Closing-Präsentation
                  (Vorabbogen), Kennenlern-Präsentation und Rechner,
                  Favoriten je Nutzer. Vorgewählt ist die Präsentation, die
                  zum Ablauf dieses Bewerbers passt. Die Kennung reist mit,
                  deshalb steht dort sein Name, die Notizen landen bei ihm,
                  und die Folien des Kennenlernbogens tragen seine Antworten,
                  auf seinem Weg und im geteilten Fenster ebenso. */}
              <a
                href={uebungsUrl({ art: "kennenlernbogen", bewerberId: bewerber.id })}
                target="_blank"
                rel="noopener noreferrer"
                title="Moderation mit beiden Präsentationen und dem Rechner, geöffnet für diesen Bewerber"
              >
                <Button size="sm" variant="brand" className="gap-1.5">
                  <Video className="h-3.5 w-3.5" aria-hidden /> Moderation öffnen
                  <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
                </Button>
              </a>
              <a
                href={praesentationsUrl(bewerber.id, 1, name)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" variant="outline" className="gap-1.5">
                  <MonitorPlay className="h-3.5 w-3.5" aria-hidden /> Präsentation (Bildschirmfreigabe)
                  <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
                </Button>
              </a>
              <a
                href={moderationsUrl(bewerber.id, 1)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                title="Die bisherige Moderation mit den Antworten dieses Bewerbers, Erfassung und Abschluss"
              >
                Moderation mit den Antworten von {name}
              </a>
            </div>
          )}
        </div>

        {/* Der selbst gebuchte Termin. Er stand bisher nur in der Übersicht. */}
        {termin ? (
          <div
            className="rounded-md border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5 px-3 py-2"
            data-testid="videocall-termin"
          >
            <p className="text-sm font-medium">
              Persönliches Gespräch am {terminText(termin.startAt)}, selbst gebucht
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Er hat sich die Zeit am Ende des Kennenlernens selbst ausgesucht. Verschieben und
              absagen kann er über seinen eigenen Link.
            </p>
            {termin.raumPfad && (
              <Button variant="outline" size="sm" className="mt-2" asChild>
                <a href={termin.raumPfad} target="_blank" rel="noreferrer">
                  <Video className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Videoraum öffnen
                </a>
              </Button>
            )}
          </div>
        ) : bewerber.erstgespraechDatum ? (
          /*
            Der von Hand eingetragene Termin, seit dem 21.09.2026 der Normalfall:
            Vereinbart wird über den Kalender der HR-Managerin, und die trägt ihn
            danach unten in der Karte ein.

            Hier stand vorher „Der Videoraum ließ sich nicht laden". Das war
            gemeint für eine Buchung, deren Raum fehlt, und ist beim Handeintrag
            schlicht falsch: Es gibt keine Buchung, also auch keinen Raum, der
            sich laden ließe.
          */
          <div className="rounded-md border px-3 py-2" data-testid="videocall-termin">
            <p className="text-sm font-medium">
              Persönliches Gespräch am {bewerber.erstgespraechDatum}
              {bewerber.erstgespraechUhrzeit ? ` um ${bewerber.erstgespraechUhrzeit} Uhr` : ""}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Von Hand eingetragen, nach der Buchung im Kalender. Ändern lässt er sich unten in der
              Karte „Einladung zur Terminbuchung".
            </p>
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Noch kein Termin. Der Bewerber sucht sich die Zeit im Kalender aus, danach trägst du sie
            unten in der Karte „Einladung zur Terminbuchung" ein.
          </p>
        )}
      </Card>

      {/* ─── Zone 2 und 3 ─── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          {/*
            Die Einladung zur Terminbuchung steht oben, solange kein Termin
            gebucht ist: Dann ist sie der naechste Schritt. Sie verschickt
            ausdruecklich NICHT die Eingangsmail mit dem Kennenlernbogen, die
            liegt in der Uebersicht.
          */}
          <GespraechEinladung
            bewerber={bewerber}
            buchungsToken={buchungsToken}
            canEdit={canEdit}
            terminAm={termin?.startAt}
            onRefresh={onRefresh}
          />

          {/* Was im Gespräch mitgeschrieben wurde, steht vor dem Bogen: Nach
              dem Termin ist die eigene Mitschrift das Frische, die Antworten
              des Bewerbers sind das Nachschlagewerk. */}
          {/* Mitschreiben auch ohne Moderation, in dieselbe Notiz. */}
          <VideocallNotizKarte erfassung={erfassung} canEdit={canEdit} onAendern={aendern} />

          <VideocallMitschriftKarte erfassung={erfassung} ohneNotiz={canEdit} />

          {/*
            Daneben, nicht darin: Die Karte darüber zeigt die Listen und die
            Notiz aus der Moderation, also das, was jemand getippt hat. Hier
            steht das wörtlich Gesprochene aus dem Raum. Zwei verschiedene
            Dinge, deshalb zwei Kästen.

            Derselbe Kasten wie in der Kundenakte, nur über den Raum statt
            über den Kontakt geholt: Datum und Uhrzeit je Mitschrift, die
            Auswahl bei mehreren Gesprächen und der Deckel gegen sehr lange
            Texte stecken dort schon drin.
          */}
          {raumIds.length > 0 && (
            <MitschriftenKasten
              raumIds={raumIds}
              leerHinweis="Zu diesem Gespräch liegt keine Mitschrift vor. Sie entsteht nur, wenn sie im Gesprächsraum ausdrücklich gestartet wurde. Sichtbar ist sie für die Gastgeberin des Gesprächs sowie für Admin und Inhaber."
            />
          )}

          {/*
            Übernommene Bewerber aus dem Bewerbungsmanagement haben keinen
            Kennenlernbogen, sondern den alten Vorabbogen mit 16 Fragen. Ihre
            Antworten stehen in derselben Spalte, werden aber von
            `istKennenlernen` verworfen, weil ihnen das Feld `weg` fehlt. Ohne
            die beiden Karten hier stünde bei ihnen „Es liegt kein
            eingereichter Bogen vor", obwohl alles vorhanden ist.

            Deshalb: Liegt ein alter Bogen vor, treten Zusammenfassung und
            Vorwissen an die Stelle der leeren Kennenlern-Karte. Sonst bliebe
            neben den Antworten die Auskunft stehen, es gebe keine.
          */}
          {!antworten && vorwissen ? (
            <>
              <ZusammenfassungKarte
                skript={bewerber.erstgespraechSkript}
                mitClosing={false}
                offen={zusammenfassungOffen}
                onOffenChange={setZusammenfassungOffen}
              />
              <VorwissenKarte
                vorname={bewerber.vorname}
                vorwissen={vorwissen}
                offen={vorwissenOffen}
                onOffenChange={setVorwissenOffen}
              />
            </>
          ) : (
            <KennenlernbogenKarte
              antworten={antworten}
              ausgefuelltAm={datumKurz(eingereichtAm)}
              befund={befund}
            />
          )}

          {antworten && folien.length > 0 && (
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Die Folien dieses Termins
              </p>
              <ol className="space-y-1">
                {folien.map((f, i) => (
                  <li key={f.id} className="flex items-start gap-2 text-xs">
                    <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="leading-snug">
                      <span className="font-medium">{f.titel}</span>
                      <span className="block text-[10px] text-muted-foreground">{f.kopfzeile}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                Geführt wird in der Moderation. Diese Liste ist der Überblick, kein Bedienelement.
              </p>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          {antworten && (
            <Card className="p-4" data-testid="videocall-kurzprofil">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Kurzprofil, statt einer Punktzahl
              </p>
              <ul className="space-y-1.5">
                {merkmale(antworten).map((m) => {
                  const bestaetigt = (erfassung.bestaetigt ?? []).includes(m.id);
                  return (
                    <li key={m.id} className="text-xs">
                      <span className="font-medium">{m.label}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        {bestaetigt
                          ? "im Gespräch bestätigt"
                          : m.selbstauskunft === "erfuellt" ? "Selbstauskunft" : "offen"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {erfassung.wunsch && (
                <p className="mt-3 border-t pt-2 text-[11px]">
                  <span className="text-muted-foreground">Sein Wunsch: </span>
                  <span className="font-medium">{WUNSCH_LABELS[erfassung.wunsch].label}</span>
                </p>
              )}
            </Card>
          )}

          {canEdit && (
            <GespraechBeendenKarte
              erfassung={erfassung}
              canEdit={canEdit}
              abgeschlossenAm={abgeschlossenAm}
              vertragsAdresse={vertragsAdresse}
              rechnungsAdresse={identisch ? vertragsAdresse : rechnungsAdresse}
              identisch={identisch}
              onAendern={aendern}
              onVertragsAdresse={(wert) => {
                setVertragsAdresse(wert);
                adressenAblegen(wert, rechnungsAdresse, identisch);
              }}
              onRechnungsAdresse={(wert) => {
                setRechnungsAdresse(wert);
                adressenAblegen(vertragsAdresse, wert, false);
              }}
              onIdentisch={(an) => {
                setIdentisch(an);
                adressenAblegen(vertragsAdresse, rechnungsAdresse, an);
              }}
              onAbschliessen={abschliessen}
              onZwischenspeichern={zwischenspeichern}
              onKeinInteresse={() => absageOeffnen("kein_interesse")}
              onAbgelehnt={() => absageOeffnen("abgelehnt", (erfassung.entscheidungGrund ?? "").trim())}
            />
          )}
        </aside>
      </div>

      <AbsageDialog
        open={absageOffen}
        onOpenChange={setAbsageOffen}
        modus={absageModus}
        initialGrund={absageGrund || skript?.absageGrund || ""}
        bewerberEmail={bewerber.email}
        onBestaetigen={(grund, mail) => ablehnen(grund, absageModus, mail)}
      />
    </div>
  );
}
