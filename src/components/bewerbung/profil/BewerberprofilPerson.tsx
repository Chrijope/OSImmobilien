import { useRef, type ComponentType, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Star, Trash2 } from "lucide-react";
import { normalizeTelefon, whatsAppLink } from "@/lib/phoneUtils";
import { tarnEmail, tarnTelefon, tarnVerweis } from "@/lib/vorfuehrmodus";
import { formatDatum } from "@/lib/utils";
import { stelleAnzeige } from "@/lib/bewerberArbeitsplatz";
import type { Bewerber } from "@/lib/bewerbungStore";
import { BewerberNameKopf } from "../BewerberNameKopf";
import "./bewerberprofil.css";

/**
 * Die linke Spalte des Bewerberprofils: alles zur Person, fest stehend.
 *
 * Reihenfolge wie von Christian beschrieben: Bewerberangaben und
 * Kontaktdaten, darunter die Meta-Bewerberfragen aus dem Bewerbungsformular.
 * Die fünf runden Knöpfe für Erstgespräch, Videocall, Follow-up, Anrufen und
 * Notiz stehen dazwischen, direkt unter dem Namen, denn sie sind das, was man
 * in dieser Spalte tut.
 *
 * Der Löschknopf sitzt seit dem 17.09.2026 am Fuss der Kontaktdaten. Vorher
 * stand er ganz unten, nach den sieben Meta-Fragen, und wurde dort übersehen.
 *
 * ## Warum das Eingabefeld von aussen kommt
 *
 * `feldKomponente` ist das `EditableField` aus `pages/BewerberArbeitsplatz`.
 * Es wird übergeben und nicht nachgebaut: Es speichert beim Verlassen des
 * Feldes und nicht bei jedem Tastendruck, und genau dieses Verhalten soll
 * überall dasselbe bleiben. Ein zweites Feld mit eigener Logik wäre der
 * Anfang zweier verschiedener Antworten auf dieselbe Frage.
 */

type FeldKomponente = ComponentType<{
  value: string;
  onSave: (wert: string) => void;
  placeholder?: string;
  multiline?: boolean;
}>;

/**
 * Die Sternebewertung in der linken Spalte, bedienbar und gegen Versehen
 * abgesichert.
 *
 * ## Warum nicht einfach fünf anklickbare Sterne
 *
 * Als die Sterne noch an zwei Stellen standen, war diese hier bewusst nur zum
 * Ansehen: Eine bedienbare Sternreihe mitten in einer Spalte, die man auf dem
 * Telefon mit dem Finger durchrollt, setzt irgendwann eine Bewertung, die
 * niemand setzen wollte, und niemandem fällt es auf. Christian will den Kasten
 * in der Übersicht trotzdem los, also muss dieses Bedenken hier gelöst werden
 * statt dort umgangen.
 *
 * Zwei Vorkehrungen, beide ohne einen zusätzlichen Klick für den Normalfall:
 *
 *   1. **Der Wisch zählt nicht.** Gemerkt wird, wo der Finger aufgesetzt hat.
 *      Hat er sich bis zum Loslassen um mehr als acht Pixel bewegt, war es
 *      eine Rollbewegung und kein Tippen, und der Stern tut nichts. Genau
 *      dieser Fall ist das Versehen, das gemeint war.
 *   2. **Jeder Wert lässt sich zurücknehmen.** Ein zweiter Tipp auf denselben
 *      Stern setzt die Bewertung wieder auf null, und daneben steht dafür
 *      zusätzlich ein ausgeschriebener Knopf. Wer doch einmal danebentrifft,
 *      ist einen Tipp davon entfernt, es rückgängig zu machen.
 *
 * Die Sterne sind echte Knöpfe, nicht anklickbare Sinnbilder. Damit sind sie
 * auch mit der Tastatur erreichbar, und jeder trägt seinen Wert als Satz.
 */
export function BewerberSterne({
  wert,
  darfBewerten,
  onBewertung,
}: {
  wert: number;
  darfBewerten: boolean;
  onBewertung?: (wert: number) => void;
}) {
  // Wo der Finger oder die Maus aufgesetzt hat, für die Wischerkennung.
  const start = useRef<{ x: number; y: number } | null>(null);
  // Ob der letzte Klick aus einem Zeiger kam. Siehe `onClick` weiter unten.
  const zeiger = useRef(false);

  const setzen = (stern: number) => {
    if (!darfBewerten || !onBewertung) return;
    // Derselbe Stern noch einmal heisst: Bewertung zurücknehmen.
    onBewertung(stern === wert ? 0 : stern);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="bewerberprofil-bewertung">
      <div className="flex items-center gap-0.5" role="group" aria-label="Bewertung von 1 bis 5 Sternen">
        {[1, 2, 3, 4, 5].map((i) => {
          const gefuellt = i <= wert;
          const sinnbild = (
            <Star
              className={`h-4 w-4 ${gefuellt ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
              aria-hidden="true"
            />
          );
          if (!darfBewerten) return <span key={i}>{sinnbild}</span>;
          return (
            <button
              key={i}
              type="button"
              className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={
                i === wert
                  ? `${i} von 5 Sternen, noch einmal tippen nimmt die Bewertung zurück`
                  : `${i} von 5 Sternen vergeben`
              }
              aria-pressed={gefuellt}
              onPointerDown={(e) => {
                zeiger.current = true;
                start.current = Number.isFinite(e.clientX) ? { x: e.clientX, y: e.clientY } : null;
              }}
              onPointerUp={(e) => {
                const von = start.current;
                start.current = null;
                // Hat sich der Finger bewegt, war es ein Rollen und kein Tippen.
                if (von && Math.hypot(e.clientX - von.x, e.clientY - von.y) > 8) return;
                setzen(i);
              }}
              /*
                Der Rückfall für alles, was keinen Zeiger schickt: die Tastatur
                und Vorleseprogramme. Kam der Klick aus einem Zeiger, hat ihn
                `onPointerUp` schon behandelt, sonst zählte er doppelt.
              */
              onClick={() => {
                const ausZeiger = zeiger.current;
                zeiger.current = false;
                if (!ausZeiger) setzen(i);
              }}
            >
              {sinnbild}
            </button>
          );
        })}
      </div>
      <span className="text-muted-foreground">{wert || 0}/5</span>
      {darfBewerten && wert > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px] text-muted-foreground"
          onClick={() => onBewertung?.(0)}
        >
          Zurücknehmen
        </Button>
      )}
      {/* Der Gegensatz zum Vorab-Score, der in der Mitte gerechnet wird. */}
      <span className="basis-full text-[10px] text-muted-foreground">Von Hand vergeben</span>
    </div>
  );
}

/** Die sieben Fragen aus dem Meta-Bewerbungsformular, in ihrer Reihenfolge. */
const META_FRAGEN: { feld: keyof Bewerber; frage: string; mehrzeilig?: boolean }[] = [
  { feld: "vertriebserfahrung", frage: "Wie viel Vertriebserfahrung bringst du mit?" },
  { feld: "vertriebsbereich", frage: "In welchem Vertriebsbereich hast du bisher gearbeitet?" },
  { feld: "immobilienErfahrung", frage: "Hast du bereits Erfahrung im Immobilienvertrieb?" },
  { feld: "monatlichesEinkommen", frage: "Welches monatliche Einkommen hast du zuletzt im Vertrieb erzielt?" },
  { feld: "stundenProWoche", frage: "Wie viele Stunden pro Woche kannst du realistisch investieren?" },
  { feld: "aktuelleSituation", frage: "Welche Aussage trifft aktuell am ehesten auf dich zu?", mehrzeilig: true },
  { feld: "alter", frage: "Wie alt bist du?" },
];

export function BewerberprofilPerson({
  b,
  canEdit,
  beschreibung,
  schnellaktionen,
  zusatzFelder = [],
  feldKomponente: Feld,
  onNameSpeichern,
  onFeld,
  onStammdatenBearbeiten,
  onLoeschen,
  onWhatsappAngeschrieben,
  onBewertung,
  vorabScore,
  nichtErreichtVersuche = 0,
}: {
  b: Bewerber;
  canEdit: boolean;
  /** Die Zeile unter dem Namen, etwa die Stelle und die Quelle. */
  beschreibung: string;
  /** Die fünf runden Knöpfe, siehe `BewerberSchnellaktionen`. */
  schnellaktionen?: ReactNode;
  /**
   * Weitere Zeilen unter den Kontaktdaten, vom Aufrufer gestellt.
   *
   * Dafür da, was hier hingehört, aber eigenes Wissen mitbringt: die
   * Rechnungsadresse etwa wird aus einem mehrzeiligen Text zerlegt und wieder
   * zusammengesetzt, und diese Regel bleibt beim Aufrufer.
   */
  zusatzFelder?: { label: string; wert: ReactNode }[];
  feldKomponente: FeldKomponente;
  onNameSpeichern: (vorname: string, nachname: string) => void;
  onFeld: (feld: keyof Bewerber, wert: string) => void;
  onStammdatenBearbeiten: () => void;
  /** Fragt selbst zurück, bevor gelöscht wird. Siehe Aufrufer. */
  onLoeschen: () => void;
  /** Merkt, dass der Bewerber über WhatsApp angeschrieben wurde. */
  onWhatsappAngeschrieben?: (angeschrieben: boolean) => void;
  /**
   * Speichert die Sternebewertung. Null nimmt sie zurück.
   *
   * Seit dem 17.09.2026 ist das die einzige Stelle, an der bewertet wird: Der
   * Kasten „Deine Bewertung" im Reiter Übersicht ist entfallen. Fehlt die
   * Funktion, stehen die Sterne nur zum Ansehen da.
   */
  onBewertung?: (wert: number) => void;
  /**
   * Das Abzeichen mit dem Vorab-Score, vom Aufrufer gestellt.
   *
   * Es steht unmittelbar über den Sternen, und das ist der ganze Grund für
   * diese eigene Eigenschaft: Beide beantworten dieselbe Frage, wie gut dieser
   * Bewerber passt. Der Score ist gerechnet, die Sterne vergibt ein Mensch.
   * Untereinander sieht man auf einen Blick, wo die beiden auseinandergehen;
   * in verschiedenen Spalten sähe man das nicht.
   *
   * Als Knoten hereingereicht und nicht als Wert: Wie der Score entsteht und
   * wie seine Aufschlüsselung aussieht, weiss `VorabScoreBadge`, und dieses
   * Wissen soll nicht in die Personenspalte wandern.
   */
  vorabScore?: ReactNode;
  /**
   * Wie viele erfolglose Anrufe es bisher gab, für die Zeile mit der
   * Telefonnummer. Null oder undefined heisst: nichts anzeigen.
   *
   * Christian am 17.09.2026: „wenn ich auf Anrufen klicke und dann nicht
   * erreicht klicke, dass links bei Kontaktdaten vielleicht bei Telefonnummer
   * noch angezeigt wird, wie viele nicht erreicht Versuche man schon durch
   * hat." Die Zahl kommt vom Aufrufer aus `countNichtErreichtVersuche`, also
   * demselben Zähler wie der Kasten „Telefonstand" in der Mitte. Ein zweiter
   * Zählweg wäre der Anfang zweier verschiedener Antworten auf dieselbe Frage.
   *
   * Bei null steht bewusst nichts da, sonst trüge jeder frische Bewerber eine
   * Null neben seiner Nummer.
   */
  nichtErreichtVersuche?: number;
}) {
  const telefon = normalizeTelefon(b.telefon || "");

  return (
    <>
      <Card className="bewerberprofil-personkarte" data-testid="bewerberprofil-person">
        <div className="min-w-0 mb-3">
          <BewerberNameKopf
            vorname={b.vorname ?? ""}
            nachname={b.nachname ?? ""}
            darfBearbeiten={canEdit}
            onSpeichern={onNameSpeichern}
          />
          {beschreibung && <p className="text-xs text-muted-foreground mt-1 break-words">{beschreibung}</p>}
        </div>

        {schnellaktionen && <div className="mb-5">{schnellaktionen}</div>}

        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Kontaktdaten</h3>
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0"
              aria-label="E-Mail und Telefon bearbeiten"
              onClick={onStammdatenBearbeiten}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <dl className="bewerberprofil-felder">
          <div>
            <dt>E-Mail</dt>
            <dd>
              {b.email ? (
                <a href={tarnVerweis(`mailto:${b.email}`)} className="hover:text-primary hover:underline break-all">
                  {tarnEmail(b.email)}
                </a>
              ) : (
                <span className="text-muted-foreground">Nicht hinterlegt</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Telefon</dt>
            <dd>
              {b.telefon ? (
                <span className="flex items-center gap-2 flex-wrap">
                  <a href={tarnVerweis(`tel:${telefon.replace(/\s+/g, "")}`)} className="hover:text-primary hover:underline">
                    {tarnTelefon(telefon)}
                  </a>
                  {/* Derselbe grüne Kreis wie bisher im Reiter Übersicht. */}
                  <a
                    href={tarnVerweis(whatsAppLink(b.telefon))}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="WhatsApp öffnen"
                    title="WhatsApp öffnen"
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.028-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </a>
                </span>
              ) : (
                <span className="text-muted-foreground">Nicht hinterlegt</span>
              )}
              {/*
                Der Haken „schon angeschrieben" stand bis zum 17.09.2026 unten
                im Kasten „Telefonischer Kontakt" im Reiter Übersicht. Er
                gehört zur Telefonnummer und steht jetzt bei ihr, direkt unter
                dem grünen Zeichen. So ist WhatsApp an einer Stelle: der Weg
                hinein und der Vermerk, dass man ihn schon gegangen ist.
              */}
              {/*
                Der Zähler der erfolglosen Anrufe, knapp und als Beschriftung.
                Der weitergehende Stand, also welche Mail-Vorlage als Nächstes
                kommt und ob ein Closing-Termin steht, bleibt im Kasten
                „Telefonstand" in der Mitte: Er braucht Sätze und die fünf
                Balken, und beides passt nicht neben eine Telefonnummer.
              */}
              {b.telefon && nichtErreichtVersuche > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground" data-testid="bewerberprofil-nicht-erreicht">
                  {nichtErreichtVersuche === 1
                    ? "1 erfolgloser Anruf"
                    : `${nichtErreichtVersuche} erfolglose Anrufe`}
                </p>
              )}
              {onWhatsappAngeschrieben && b.telefon && (
                <label className="mt-1.5 flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Checkbox
                    className="h-3.5 w-3.5"
                    checked={!!b.whatsappAngeschrieben}
                    onCheckedChange={(wert) => onWhatsappAngeschrieben(wert === true)}
                    aria-label="Über WhatsApp angeschrieben"
                  />
                  Über WhatsApp angeschrieben
                </label>
              )}
            </dd>
          </div>
          <div>
            <dt>Adresse</dt>
            <dd>
              {canEdit ? (
                <div className="space-y-1">
                  <Feld value={b.adresse || ""} onSave={(v) => onFeld("adresse", v)} placeholder="Straße, Hausnr." />
                  <Feld value={b.ort || ""} onSave={(v) => onFeld("ort", v)} placeholder="PLZ Ort" />
                </div>
              ) : [b.adresse, b.ort].filter(Boolean).length > 0 ? (
                [b.adresse, b.ort].filter(Boolean).join(", ")
              ) : (
                <span className="text-muted-foreground">Nicht hinterlegt</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Beworben am</dt>
            <dd>{b.beworben ? formatDatum(b.beworben) : <span className="text-muted-foreground">Nicht hinterlegt</span>}</dd>
          </div>
          <div>
            <dt>Quelle</dt>
            <dd>{b.quelle || <span className="text-muted-foreground">Nicht hinterlegt</span>}</dd>
          </div>
          <div>
            <dt>Stelle</dt>
            {/*
              Steht nichts in der Akte, steht hier trotzdem „Vertriebspartner".
              Wer über den Bewerberprozess hereinkommt, bewirbt sich auf genau
              diese eine Stelle. Warum das eine Anzeigefrage bleibt und keine
              Migration wird, steht bei `stelleAnzeige`.
            */}
            <dd>{stelleAnzeige(b.stelleTitel)}</dd>
          </div>
          {zusatzFelder.map(({ label, wert }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{wert}</dd>
            </div>
          ))}
          {/*
            ── Die Sternebewertung, seit dem 17.09.2026 hier auch bedienbar ──

            Der Kasten „Deine Bewertung" im Reiter Übersicht ist entfallen,
            weil derselbe Wert zweimal dastand. Damit ist diese Stelle die
            einzige, an der bewertet wird, und sie muss es können.

            Die Abgrenzung zum Vorab-Score bleibt erhalten, obwohl die beiden
            jetzt in verschiedenen Spalten stehen: Dort heisst es „Gerechnet
            aus dem eingereichten Bogen", hier „Von Hand vergeben". Das eine
            rechnet das System, das andere entscheidet ein Mensch.
          */}
          {vorabScore && (
            <div>
              <dt>Vorab-Score</dt>
              <dd>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {vorabScore}
                  {/* Der Gegensatz zu den Sternen darunter. */}
                  <span className="basis-full text-[10px] text-muted-foreground">
                    Gerechnet aus dem eingereichten Bogen
                  </span>
                </div>
              </dd>
            </div>
          )}
          <div>
            <dt>Bewertung</dt>
            <dd>
              <BewerberSterne
                wert={b.bewertung || 0}
                darfBewerten={canEdit && !!onBewertung}
                onBewertung={onBewertung}
              />
            </dd>
          </div>
        </dl>

        {/*
          Der Löschknopf sitzt seit dem 17.09.2026 am Fuss der Kontaktdaten und
          nicht mehr unter den Meta-Bewerbungsfragen. Christian wollte ihn an
          der Stelle, an der ohnehin alles zur Person steht, und nicht erst
          nach sieben Fragen.
        */}
        {canEdit && (
          <div className="bewerberprofil-verwaltung">
            <Button variant="destructive" size="sm" onClick={onLoeschen}>
              <Trash2 className="h-4 w-4 mr-1" />
              Bewerber löschen
            </Button>
          </div>
        )}
      </Card>

      {/*
        ── Die Angaben von der Seite „Partner werden“ ─────────────────────
        Nur zum Lesen: Sie stammen aus dem Wizard und sind die Grundlage für
        den ersten Anruf. Die sieben Meta-Fragen darunter stellt diese Seite
        nicht, deshalb entfallen sie hier.
      */}
      {b.partnerWerden ? (
        <Card className="bewerberprofil-personkarte mt-3" data-testid="bewerberprofil-partner-werden">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Angaben aus „Partner werden“
          </h3>
          <div className="bewerberprofil-metafragen">
            <div>
              <p className="text-[11px] font-semibold mb-1">Rolle</p>
              <p className="text-xs">
                {b.partnerWerden.rolleText || "Keine Angabe"}
                {b.partnerWerden.wegText && <span className="text-muted-foreground"> · {b.partnerWerden.wegText}</span>}
              </p>
            </div>
            {b.partnerWerden.firma && (
              <div>
                <p className="text-[11px] font-semibold mb-1">Firma</p>
                <p className="text-xs">{b.partnerWerden.firma}</p>
              </div>
            )}
            {b.partnerWerden.kampagne && (
              <div>
                <p className="text-[11px] font-semibold mb-1">Kampagne</p>
                <p className="text-xs">{b.partnerWerden.kampagne}</p>
              </div>
            )}
            {b.partnerWerden.lesbar.map(({ frage, antwort }) => (
              <div key={frage}>
                <p className="text-[11px] font-semibold mb-1">{frage}</p>
                <p className="text-xs">{antwort || <span className="text-muted-foreground">Keine Angabe</span>}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
      <Card className="bewerberprofil-personkarte mt-3" data-testid="bewerberprofil-metafragen">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
          Meta-Bewerbungsfragen
        </h3>
        <div className="bewerberprofil-metafragen">
          {META_FRAGEN.map(({ feld, frage, mehrzeilig }) => {
            const wert = (b[feld] as string | undefined) || "";
            return (
              <div key={String(feld)}>
                <p className="text-[11px] font-semibold mb-1">{frage}</p>
                {canEdit ? (
                  <Feld value={wert} onSave={(v) => onFeld(feld, v)} placeholder="Keine Angabe" multiline={mehrzeilig} />
                ) : (
                  <p className="text-xs">{wert || <span className="text-muted-foreground">Keine Angabe</span>}</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      )}
    </>
  );
}
