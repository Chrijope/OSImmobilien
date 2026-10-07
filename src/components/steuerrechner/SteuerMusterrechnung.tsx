/**
 * Die Beispielrechnung auf der Ergebnisseite.
 *
 * Sie zeigt an EINEM durchgerechneten Fall, wie der Steuereffekt entsteht:
 * von der Miete ueber Zinsen und Abschreibung zum steuerlichen Verlust, von
 * dort zur Ersparnis, und weiter zu der Frage, wer die monatlichen Kosten
 * eigentlich traegt.
 *
 * Drei Regeln, die diese Datei zusammenhalten:
 *
 *   1  Es wird NICHTS neu gerechnet, was `steuerRechner.ts` schon rechnet.
 *      Jede Zahl hier stammt aus dem Ergebnis oder ist eine offengelegte
 *      Ableitung aus dessen Groessen. Sonst stuenden auf einer Seite zwei
 *      Wahrheiten.
 *   2  Gerechnet wird durchgehend am TYPISIERTEN OBJEKT, also an demselben
 *      Objekt, auf dem auch die Zahlen oben beruhen, und auf dem SICHEREN Weg,
 *      also mit der gesetzlichen Abschreibung ohne Gutachten. Der Weg mit
 *      Gutachten setzt einen Nachweis voraus und taugt nicht als Beispiel.
 *      Konkret heisst „nichts neu rechnen“: Das erste Jahr kommt aus
 *      `ergebnis.spanne.plan[0]`, die Zehnjahressicht aus
 *      `ergebnis.spanne.vermoegen`.
 *   3  Beschriftung und Wert muessen zusammenpassen. Beim Erhaltungsaufwand
 *      ist genau das einmal schiefgegangen: Unter der Ueberschrift
 *      „Erhaltungsaufwand" stand die Ersparnis statt des Aufwands, und die
 *      Zahl sah deshalb viel zu niedrig aus. Hier stehen beide Groessen
 *      getrennt und jede unter ihrem eigenen Namen.
 *
 * Was unser Rechenkern NICHT kennt, steht hier auch nicht: Es gibt keine
 * Mietanpassung ueber die Jahre und keine eigene Sanierungsabschreibung. Der
 * Aufwand nach dem Kauf ist bei uns sofort abziehbarer Erhaltungsaufwand nach
 * § 6 Abs. 1 Nr. 1a EStG und steht deshalb als einmaliger Posten daneben.
 */
import { ArrowRight, TrendingUp, Wallet } from "lucide-react";
import { BETRACHTUNG_JAHRE, type Ergebnis } from "@/lib/steuerRechner";
import { TON, Zeile, eur } from "@/components/steuerrechner/bausteine";

/** Prozentzahl in deutscher Schreibweise, ohne unnoetige Nullen. */
const prozent = (v: number, stellen = 1) =>
  v.toLocaleString("de-DE", { maximumFractionDigits: stellen });

/** Ein Abschnitt der Beispielrechnung, als eigene Karte. */
function Block({
  titel,
  unterzeile,
  children,
}: {
  titel: string;
  unterzeile?: string;
  children: React.ReactNode;
}) {
  return (
    <section data-ui="card" className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <h4 className="text-base font-semibold text-foreground">{titel}</h4>
      {unterzeile && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{unterzeile}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

interface Props {
  ergebnis: Ergebnis;
  /** Springt zum Kasten ueber dem Ergebnis, siehe `SteuerRechnerStrecke`. */
  onHandlung: () => void;
  /** Beschriftung des Knopfes. Ohne Angabe bleibt der alte Wortlaut. */
  handlungText?: string;
}

export default function SteuerMusterrechnung({ ergebnis: r, onHandlung, handlungText }: Props) {
  const o = r.spanne.objekt;
  /* Der Leitweg, also derselbe Abschreibungssatz, mit dem die Seite oben
     rechnet. Bis zum 17.09.2026 nahm die Beispielrechnung den gesetzlichen
     Satz. Seit die Seite mit dem angesetzten Satz fuehrt, muss das Beispiel
     denselben nehmen, sonst zeigen Kopf und Beispiel zwei Ergebnisse. Was
     ohne Gutachten uebrig bleibt, steht dafuer als eigene Zeile darunter. */
  const weg = r.spanne.erhoeht;
  const sicher = r.spanne.regulaer;
  /*
   * Das erste Jahr kommt aus dem Plan des Rechenkerns, nicht aus einer
   * Nebenrechnung hier. Vorher standen hier eigene Ableitungen aus `QUOTEN`,
   * und genau daraus entstand der Widerspruch zwischen der monatlichen
   * Zuzahlung in dieser Datei und der frei verfuegbaren Liquiditaet weiter
   * unten. Eine Seite, eine Rechnung.
   */
  const j1 = r.spanne.plan[0];
  const v = r.spanne.vermoegen;

  /* ── Eckdaten ────────────────────────────────────────────────────────── */
  const kaufpreis = o.preis;
  const kaufnebenkosten = v.eigenkapital;
  /* Der Kaufpreis wird finanziert, eingesetzt wird das Geld fuer die
     Nebenkosten. So steht es auch in den Annahmen am Seitenende. */
  const darlehen = kaufpreis;
  const kapitaleinsatz = kaufnebenkosten;

  const zinsenJahr = j1.zinsen;
  const laufendeKostenJahr = j1.kosten;

  const tilgungJahr1 = j1.tilgung;
  const rateJahr = zinsenJahr + tilgungJahr1;

  const ersparnisJahr1 = j1.ersparnis;

  /*
   * Die beiden Saetze, die zwischen einem Abzug und der Steuer daraus liegen.
   *
   * Sie beantworten die Frage, an der Christian zweimal haengen geblieben ist:
   * „Den ganzen Erhaltungsaufwand kann ich doch im ersten Jahr abrechnen, warum
   * dann nur die kleinere Zahl als Ersparnis?“ Beides stimmt. Abgezogen wird
   * vom zu versteuernden Einkommen, zurueck kommt davon dieser Anteil. Steht
   * der Satz da, rechnet niemand mehr im Kopf und verrechnet sich dabei.
   */
  const verlustSatz = weg.verlust > 0 ? (ersparnisJahr1 / weg.verlust) * 100 : 0;
  const erhaltungSatz =
    r.spanne.erhaltung.bruttoAufwand > 0
      ? (r.spanne.erhaltung.ersparnisEinmalig / r.spanne.erhaltung.bruttoAufwand) * 100
      : 0;

  /* ── Monatlich ───────────────────────────────────────────────────────── */
  const m = (jahreswert: number) => jahreswert / 12;
  const kaltmieteMonat = m(j1.miete);
  const tilgungMonat = m(tilgungJahr1);
  const rateMonat = m(rateJahr);
  const kostenMonat = m(laufendeKostenJahr);
  const steuervorteilMonat = m(ersparnisJahr1);
  const ueberschussVor = m(j1.cashflowVorSteuer);
  const ueberschussNach = m(j1.cashflowNachSteuer);

  /* ── Wer traegt die monatlichen Kosten ───────────────────────────────── */
  const gesamtkostenMonat = rateMonat + kostenMonat;
  const anteilMieter = Math.min(kaltmieteMonat, gesamtkostenMonat);
  const anteilFinanzamt = Math.min(
    steuervorteilMonat,
    Math.max(0, gesamtkostenMonat - anteilMieter),
  );
  const anteilDu = Math.max(0, gesamtkostenMonat - anteilMieter - anteilFinanzamt);
  const traeger = [
    {
      name: "Der Mieter",
      wert: anteilMieter,
      farbe: "bg-chart-b2c",
      erklaerung: "Die Kaltmiete",
    },
    {
      name: "Das Finanzamt",
      wert: anteilFinanzamt,
      farbe: "bg-chart-b2b",
      erklaerung: "Die Steuerersparnis aus dem Verlust",
    },
    {
      name: "Du",
      wert: anteilDu,
      farbe: "bg-chart-provision",
      erklaerung: "Was danach noch offen bleibt",
    },
  ];

  /* ── Erstes Jahr, Vermoegen ──────────────────────────────────────────────
   * Dieselbe Rechnung wie die Karte „Was nach zehn Jahren übrig bleibt“ auf
   * der Ergebnisseite, nur fuer ein Jahr. Vorher zog die Zehnjahreskarte den
   * Kapitaleinsatz ab und diese hier nicht. Zwei benachbarte Aufstellungen,
   * zwei Konventionen, und der Leser konnte nicht wissen, welche gilt.
   */
  const wertsteigerungJahr1 = v.wertsteigerung / BETRACHTUNG_JAHRE;
  const aufbauJahr1 = tilgungJahr1 + wertsteigerungJahr1;
  const cashflowJahr1 = j1.cashflowNachSteuer;
  const untermStrichJahr1 = aufbauJahr1 + cashflowJahr1 - kapitaleinsatz;

  return (
    <div className="rounded-2xl border border-primary/25 bg-accent/40 p-5 md:p-6">
      {/* Der Kopf sagt in der ersten Zeile, dass dies ein BEISPIEL ist. Wer
          nur die grosse Zahl sieht, soll sie nicht fuer seine eigene halten. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* Stand in `text-primary` auf `bg-primary/10` und kam damit im
            Hellmodus auf 3,65:1, also unter den 4,5:1 fuer normale Schrift.
            Die Flaeche bleibt, die Schrift steht jetzt in `foreground`. */}
        <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
          Beispielrechnung
        </span>
        <span className="text-xs text-muted-foreground">
          Gerechnet mit deinen Angaben, an einem typisierten Objekt
        </span>
      </div>

      <h3 className="mt-4 text-lg font-semibold text-foreground md:text-xl">
        So entsteht der Steuereffekt, Schritt für Schritt
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        Ein durchgerechnetes Beispiel, damit die Zahlen oben nachvollziehbar werden. Es rechnet mit
        {" "}{prozent(weg.satz)} Prozent Abschreibung, so wie der Kopf der Seite, und das setzt ein
        Gutachten zur Nutzungsdauer voraus. Ohne Gutachten gilt der gesetzliche Satz von{" "}
        {prozent(sicher.satz)} Prozent, der für alle gilt. Es ist keine Zusage und kein Angebot für
        ein bestimmtes Objekt.
      </p>

      {/* a) Die Kopfkarte, dieselben zwei Groessen wie in der Ergebniskarte */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Dieselben zwei Toene wie im Kopf der Seite, damit der Leser die
            Groessen wiedererkennt, statt sie neu einordnen zu muessen. */}
        <div className={`rounded-2xl border ${TON.gut.rand} ${TON.gut.flaeche} p-5 md:p-6`}>
          <div className="flex items-center gap-2">
            <TrendingUp aria-hidden="true" className={`h-4 w-4 shrink-0 ${TON.gut.symbol}`} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
              Steuerersparnis über {BETRACHTUNG_JAHRE} Jahre
            </p>
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground md:text-4xl">
            {eur(r.spanne.zehnJahre.bis)}
          </p>
          <p className="mt-2 text-sm text-foreground">
            Im ersten Jahr sind das {eur(ersparnisJahr1)}, also {eur(steuervorteilMonat)} pro Monat.
            Ohne Gutachten wären es {eur(r.spanne.zehnJahre.von)}.
          </p>
        </div>
        <div className={`rounded-2xl border ${TON.gut.rand} ${TON.gut.flaeche} p-5 md:p-6`}>
          <div className="flex items-center gap-2">
            <Wallet aria-hidden="true" className={`h-4 w-4 shrink-0 ${TON.gut.symbol}`} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
              Vermögensaufbau über {BETRACHTUNG_JAHRE} Jahre
            </p>
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground md:text-4xl">
            {eur(v.aufbau)}
          </p>
          <p className="mt-2 text-sm text-foreground">
            {eur(v.tilgung)} Tilgung und {eur(v.wertsteigerung)} angenommener Wertzuwachs.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {/* b) Die Eckdaten */}
        <Block
          titel="Die Eckdaten des Beispiels"
          unterzeile={`Kaufpreis und Miete stammen aus dem typisierten Objekt. Die Kaufnebenkosten sind mit ${prozent(r.nebenkostenProzent)} Prozent angesetzt, dem höchsten Satz in Deutschland aus Grunderwerbsteuer, Notar und Grundbuch. Je nach Bundesland, in dem die Wohnung liegt, weicht er nur nach unten ab.`}
        >
          <Zeile text="Kaufpreis" wert={eur(kaufpreis)} />
          <Zeile
            text={`Kaufnebenkosten, ${prozent(r.nebenkostenProzent)} Prozent`}
            wert={eur(kaufnebenkosten)}
            hinweis="Grunderwerbsteuer, Notar und Grundbuch, gerechnet mit dem Höchstsatz"
          />
          <Zeile
            text="Darlehenssumme"
            wert={eur(darlehen)}
            hinweis="Der Kaufpreis wird finanziert"
          />
          <Zeile
            text="Eigenkapital, dein Kapitaleinsatz"
            wert={eur(kapitaleinsatz)}
            hinweis="Genau die Kaufnebenkosten"
            betont
          />
          <Zeile
            text="Kaltmiete monatlich, Soll"
            wert={eur(o.kaltmieteSoll / 12)}
            hinweis={`${prozent(o.mietrendite * 100)} Prozent Bruttomietrendite`}
          />
          <Zeile
            text="Mietausfallwagnis"
            wert={`-${eur(o.mietausfall / 12)}`}
            hinweis="Zwei Prozent der Kaltmiete nach § 29 II. BV, also Miete, die nicht hereinkommt"
          />
          <Zeile
            text="Kaltmiete, mit der gerechnet wird"
            wert={eur(kaltmieteMonat)}
            betont
          />
          <Zeile text="Haltedauer" wert={`${BETRACHTUNG_JAHRE} Jahre`} />
          <Zeile
            text="Dein Grenzsteuersatz"
            wert={`${prozent(r.grenzsteuersatz * 100)} Prozent`}
            hinweis="Gerechnet wird trotzdem über den Tarifverlauf, nicht mit diesem Satz mal Betrag"
          />
        </Block>

        {/* c) So entsteht die Ersparnis im ersten Jahr */}
        <Block
          titel="So entsteht die Ersparnis, erstes Jahr"
          unterzeile="Miete minus Zinsen, Abschreibung und laufende Kosten ergibt den steuerlichen Verlust. Genau dieser Verlust senkt dein zu versteuerndes Einkommen."
        >
          <Zeile
            text="Mieteinnahmen im Jahr"
            wert={eur(j1.miete)}
            hinweis={`${eur(o.kaltmieteSoll)} Sollmiete abzüglich ${eur(o.mietausfall)} Mietausfallwagnis`}
          />
          <Zeile
            text="Zinsen"
            wert={`-${eur(zinsenJahr)}`}
            hinweis={`${prozent(o.zins * 100, 2)} Prozent auf die Darlehenssumme`}
          />
          <Zeile
            text="Abschreibung Gebäude"
            wert={`-${eur(weg.afaJahr)}`}
            hinweis={`${prozent(weg.satz)} Prozent vom Gebäudewert von ${eur(o.gebaeudewert)}, das entspricht ${weg.restnutzungsdauer} Jahren Nutzungsdauer und setzt ein Gutachten nach § 7 Abs. 4 Satz 2 EStG voraus. Ohne Gutachten sind es ${prozent(sicher.satz)} Prozent, also ${eur(sicher.afaJahr)}, denn das Gesetz unterstellt ${r.spanne.nutzungsdauerGesetzlich} Jahre.`}
          />
          <Zeile
            text="Nicht umlagefähige Kosten"
            wert={`-${eur(laufendeKostenJahr)}`}
            hinweis={`${eur(o.verwaltung)} Verwaltung, rund 30 Euro im Monat, dazu ${eur(o.ruecklage)} Instandhaltungsrücklage, das sind 0,5 Prozent des Gebäudewerts`}
          />
          <Zeile
            text="Steuerlicher Verlust aus Vermietung"
            wert={`-${eur(weg.verlust)}`}
            betont
          />
          <Zeile
            text="Deine Steuerersparnis im ersten Jahr"
            wert={eur(ersparnisJahr1)}
            hinweis={`Die Steuer mit diesem Verlust gegen die Steuer ohne ihn, nicht Verlust mal Steuersatz. Von ${eur(weg.verlust)} Verlust kommen ${prozent(verlustSatz)} Prozent als Steuer zurück.`}
            ton="gut"
          />

          {/* Der Erhaltungsaufwand steht bewusst NEBEN der Rechnung und nicht
              darin: Er faellt nur an, wenn tatsaechlich saniert wird, und er
              wirkt einmal. Aufwand und Ersparnis stehen getrennt, jede Zahl
              unter ihrem eigenen Namen. */}
          <div data-ui="card" className="mt-4 rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-semibold text-foreground">
              Falls du nach dem Kauf sanierst, einmalig
            </p>
            <div className="mt-2">
              <Zeile
                text="Erhaltungsaufwand, den du bezahlst"
                wert={`bis zu ${eur(r.spanne.erhaltung.bruttoAufwand)}`}
                /* Die Grenze des Gesetzes sind 15 Prozent OHNE Umsatzsteuer,
                   und sie gilt fuer drei Jahre. Stand hier nur „17,85 Prozent“
                   direkt vor dem Paragrafen, las es sich, als stuenden die
                   17,85 im Gesetz und als gaelten sie fuer ein Jahr. */
                hinweis={`§ 6 Abs. 1 Nr. 1a EStG erlaubt in drei Jahren nach dem Kauf 15 Prozent des Gebäudewerts ohne Umsatzsteuer. Angesetzt sind 90 Prozent davon als Sicherheitsabstand, mit Umsatzsteuer ${prozent(r.spanne.erhaltung.anteilProzent, 2)} Prozent des Gebäudewerts.`}
              />
              <Zeile
                text="Steuerersparnis daraus"
                wert={`bis zu ${eur(r.spanne.erhaltung.ersparnisEinmalig)}`}
                hinweis="Kommt im ersten Jahr zur Ersparnis oben hinzu, in den Jahren danach nicht mehr"
                ton="gut"
              />
            </div>
            {/* Der Satz zwischen den beiden Zeilen darueber. Ohne ihn stehen
                zwei Zahlen ohne sichtbaren Zusammenhang untereinander, und
                genau daraus entsteht der Eindruck, die zweite sei zu klein. */}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Vom Aufwand kommen {prozent(erhaltungSatz)} Prozent als Steuer zurück. Nicht mehr,
              weil der Aufwand dein zu versteuerndes{" "}
              <span className="font-medium text-foreground">Einkommen</span> senkt und nicht deine
              Steuer. Und nicht dein Grenzsteuersatz von {prozent(r.grenzsteuersatz * 100)} Prozent,
              weil der nur für den obersten Euro gilt: Ein Abzug dieser Größe zieht dein Einkommen
              ein gutes Stück nach unten, und der Steuersatz sinkt auf diesem Weg mit. Die{" "}
              {prozent(erhaltungSatz)} Prozent sind der Durchschnitt über den abgezogenen Bereich.
            </p>
          </div>
        </Block>

        {/* d) Monatliche Uebersicht */}
        <Block
          titel="Monatliche Übersicht"
          unterzeile="Was jeden Monat hereinkommt und was hinausgeht, einmal ohne und einmal mit dem Steuervorteil."
        >
          <Zeile text="Kaltmiete" wert={eur(kaltmieteMonat)} />
          <Zeile
            text="Kreditrate"
            wert={`-${eur(rateMonat)}`}
            hinweis="Zins und Tilgung im ersten Jahr"
          />
          <Zeile text="Laufende Kosten" wert={`-${eur(kostenMonat)}`} />
          <Zeile
            text="Überschuss vor Steuervorteil"
            wert={eur(ueberschussVor)}
            betont
          />
          <Zeile text="Steuervorteil" wert={`+ ${eur(steuervorteilMonat)}`} />
          <Zeile
            text={ueberschussNach < 0 ? "Deine Zuzahlung im Monat" : "Dein Überschuss im Monat"}
            wert={eur(ueberschussNach)}
            ton={ueberschussNach < 0 ? "achtung" : "gut"}
          />
        </Block>

        {/* e) Wer traegt die Kosten. Der didaktische Kern der Seite. */}
        <Block
          titel="Wer zahlt deine monatlichen Kosten?"
          unterzeile={`Rate und laufende Kosten sind zusammen ${eur(gesamtkostenMonat)} im Monat. Diese Karte zeigt, aus welchen drei Töpfen sie kommen.`}
        >
          {/* Der Balken zeigt die Anteile als Laengen, die Liste darunter sagt
              denselben Sachverhalt noch einmal in Zahlen. Die Farbe allein
              traegt die Zuordnung also nicht. */}
          <div
            aria-hidden="true"
            className="flex h-4 w-full items-stretch gap-[2px] overflow-hidden rounded-full"
          >
            {traeger.map((t) => (
              <div
                key={t.name}
                className={`${t.farbe} first:rounded-l-full last:rounded-r-full`}
                style={{
                  width: `${gesamtkostenMonat > 0 ? (t.wert / gesamtkostenMonat) * 100 : 0}%`,
                }}
              />
            ))}
          </div>

          <ul className="mt-4">
            {traeger.map((t) => (
              <li
                key={t.name}
                className="flex items-baseline justify-between gap-4 border-t border-border py-2.5 first:border-t-0"
              >
                <span className="flex min-w-0 items-baseline gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.farbe}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{t.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t.erklaerung}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-semibold tabular-nums text-foreground">
                    {eur(t.wert)}
                  </span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {prozent(gesamtkostenMonat > 0 ? (t.wert / gesamtkostenMonat) * 100 : 0, 0)}{" "}
                    Prozent
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {/*
            Der Satz musste umgeschrieben werden, nachdem die laufenden Kosten
            auf einen realistischen Wert gestiegen sind. Vorher stand hier „Das
            ist der Kern der Sache: Die Wohnung finanziert sich zum groessten
            Teil aus der Miete und aus der Steuer“, und das klang wie eine
            Zusage. Es blieb ausserdem unerwaehnt, dass der groesste Teil dessen,
            was der Kaeufer monatlich zuzahlt, Tilgung ist und damit sein
            eigenes Vermoegen. Genau das ist das staerkere Argument, und es
            braucht keine Schoenung.
          */}
          <p className="mt-4 rounded-xl bg-muted/60 px-4 py-3 text-xs leading-relaxed text-foreground">
            Mieter und Finanzamt tragen im Beispiel zusammen{" "}
            {prozent(
              gesamtkostenMonat > 0
                ? ((anteilMieter + anteilFinanzamt) / gesamtkostenMonat) * 100
                : 0,
              0,
            )}{" "}
            Prozent der monatlichen Kosten. Auf dich entfallen {eur(anteilDu)} im Monat.{" "}
            {tilgungMonat >= anteilDu ? (
              <>
                Allein die Tilgung beträgt {eur(tilgungMonat)} im Monat, ist also grösser als dein
                Anteil. Was du zuzahlst, geht damit vollständig in die Tilgung und ist kein
                Aufwand, sondern dein eigener Anteil an der Wohnung.
              </>
            ) : (
              <>
                Davon sind {eur(tilgungMonat)} Tilgung, also Geld, das nicht weg ist, sondern in
                deinen eigenen Anteil an der Wohnung wandert.
              </>
            )}
          </p>
        </Block>

        {/* f) Vermoegenszuwachs im ersten Jahr, dieselbe Ordnung wie oben */}
        <Block
          titel="Was im ersten Jahr an Vermögen entsteht"
          unterzeile="Dieselbe Aufstellung wie in der Karte oben, nur für ein Jahr statt für zehn. Auch der Kapitaleinsatz steht darin, sonst liessen sich die beiden nicht vergleichen."
        >
          <Zeile
            text="Tilgung"
            wert={`+ ${eur(tilgungJahr1)}`}
            hinweis="Schulden, die du nicht mehr hast"
          />
          <Zeile
            text="Wertzuwachs"
            wert={`+ ${eur(wertsteigerungJahr1)}`}
            hinweis="Modellannahme, gleichmäßig über die zehn Jahre verteilt"
          />
          <Zeile text="Vermögensaufbau im ersten Jahr" wert={eur(aufbauJahr1)} ton="gut" />
          <Zeile
            text={cashflowJahr1 < 0 ? "Deine Zuzahlung im ersten Jahr" : "Dein Überschuss im ersten Jahr"}
            wert={`${cashflowJahr1 < 0 ? "- " : "+ "}${eur(Math.abs(cashflowJahr1))}`}
            hinweis={`Zwölf Monate der Zeile oben, die Steuerersparnis von ${eur(ersparnisJahr1)} ist darin schon enthalten`}
            ton={cashflowJahr1 < 0 ? "achtung" : "gut"}
          />
          <Zeile
            text="Dein Einsatz beim Kauf"
            wert={`- ${eur(kapitaleinsatz)}`}
            hinweis="Kaufnebenkosten, fallen sofort an"
            ton="achtung"
          />
          <Zeile
            text="Unter dem Strich nach einem Jahr"
            wert={eur(untermStrichJahr1)}
            ton={untermStrichJahr1 < 0 ? "achtung" : "gut"}
          />

          <p className="mt-4 rounded-xl bg-muted/60 px-4 py-3 text-xs leading-relaxed text-foreground">
            Nach einem Jahr steht hier eine negative Zahl, und das ist normal: Die Kaufnebenkosten
            fallen sofort an, der Vermögensaufbau braucht Zeit. Wie es nach{" "}
            {BETRACHTUNG_JAHRE} Jahren aussieht, steht in der Karte „Was nach {BETRACHTUNG_JAHRE}{" "}
            Jahren übrig bleibt“ weiter oben.
          </p>
        </Block>
      </div>

      {/* h) Der Weg zur persoenlichen Rechnung */}
      <button
        type="button"
        onClick={onHandlung}
        className="group mt-5 flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground shadow-apple-sm transition-all duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 active:scale-[0.995]"
      >
        {handlungText || "Persönliche Kalkulation anfordern"}
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </button>

      {/* i) Die Annahmen dieser Beispielrechnung */}
      <details className="steuer-details mt-4">
        <summary>Annahmen der Modellrechnung</summary>
        <div className="space-y-2 pt-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Das Objekt ist typisiert.</span>{" "}
            Angesetzt ist eine gebrauchte, vermietete Eigentumswohnung zu {eur(o.preis)},
            Gebäudeanteil {Math.round(o.gebaeudeanteil * 100)} Prozent, also {eur(o.gebaeudewert)},
            Fertigstellung {o.baujahr}, Mischzins {prozent(o.zins * 100, 2)} Prozent,
            Bruttomietrendite {prozent(o.mietrendite * 100)} Prozent, laufende abzugsfähige
            Nebenkosten {eur(o.nebenkosten)} im Jahr. Ein konkretes Objekt ist damit nicht gemeint
            und wird auch nicht empfohlen.
          </p>
          <p>
            Gerechnet ist mit {prozent(weg.satz)} Prozent Abschreibung, also mit{" "}
            {weg.restnutzungsdauer} Jahren Nutzungsdauer nach § 7 Abs. 4 Satz 2 EStG. Das setzt ein
            Gutachten zum konkreten Gebäude voraus, denn das Gesetz unterstellt{" "}
            {r.spanne.nutzungsdauerGesetzlich} Jahre. Ohne Gutachten gilt der gesetzliche Satz von{" "}
            {prozent(sicher.satz)} Prozent nach {sicher.paragraf}, siehe die Karte „Was ohne
            Gutachten übrig bleibt“ weiter oben.
          </p>
          <p>
            Vom Mietsoll gehen zwei Prozent Mietausfallwagnis ab (§ 29 II. BV). Als nicht
            umlagefähige Kosten sind {eur(o.verwaltung)} Verwaltung im Jahr angesetzt und{" "}
            {eur(o.ruecklage)} Instandhaltungsrücklage, also 0,5 Prozent des Gebäudewerts. Die
            Rücklage ist steuerlich streng genommen erst abziehbar, wenn sie verbaut wird; das
            Modell behandelt sie vereinfachend als laufenden Aufwand.
          </p>
          <p>
            Jedes der {BETRACHTUNG_JAHRE} Jahre ist einzeln gerechnet: Die Tilgung folgt einer
            Annuität, die Restschuld sinkt, die abziehbaren Zinsen sinken mit, und damit sinkt auch
            die Ersparnis. Über die {BETRACHTUNG_JAHRE} Jahre ergibt das nicht das Zehnfache des
            ersten Jahres, sondern das {prozent(r.spanne.faktor10J, 2)}-fache. Der Wertzuwachs ist
            eine Modellannahme auf den Kaufpreis. Eine Mietanpassung über die Jahre kennt dieses
            Modell nicht, die Miete bleibt rechnerisch gleich.
          </p>
          <p>
            <span className="font-medium text-foreground">
              Auch das hier ist keine Steuerberatung.
            </span>{" "}
            Die Beispielrechnung zeigt eine Größenordnung und ersetzt weder eine steuerliche noch
            eine anlagebezogene Beratung. Deine tatsächlichen Werte können abweichen.
          </p>
        </div>
      </details>
    </div>
  );
}
