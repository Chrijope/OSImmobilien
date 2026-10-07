import { useState, type ReactNode } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, Mail, Phone, CalendarDays, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LazyImage } from "@/components/ui/lazy-image";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Hinweis } from "@/components/objektseite/Bausteine";
import { Energieskala } from "@/components/expose/Energieskala";
import { resolveImageUrl } from "@/lib/objekteImages";
import { eur0 } from "@/lib/objektKennzahlen";
import { SANIERUNGEN_UEBERSCHRIFT } from "@/lib/objektdetailsAnzeige";
import { OBJEKTDETAILS_TEXTE } from "@/lib/objektdetailsAnzeigeTexte";
import { abschnittAnker, exposeAbschnitte, kennzahlSchluessel, verwaltungKostenText, type ExposeAbschnittId, type ExposeInhalt, type Kennzahl, type Person } from "@/lib/exposeInhalt";
import { cn } from "@/lib/utils";
import { initialen } from "@/lib/exposeAnsprechpartner";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { exposeSeitenTexte } from "./exposeTexte";

/**
 * Die Abschnitte des Exposés außer dem Rechner (Abschnitt 6, ExposeRechner)
 * und der Mikrolage (Abschnitt 3, Mikrolage). Jeder Abschnitt ist eine
 * eigene Komponente, die genau den Teil von `ExposeInhalt` bekommt, den sie
 * zeigt, damit das PDF (E4) später dieselben Datenstücke abgreifen kann.
 */

const KARTE = "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";

/** Rahmen eines Abschnitts: Kennung als Sprungmarke, Nummer, Titel, Linie. */
export function Abschnitt({ id, children, rechts }: { id: ExposeAbschnittId; children: ReactNode; rechts?: ReactNode }) {
  const a = exposeAbschnitte(useAnzeigeSprache()).find((x) => x.id === id)!;
  return (
    <section id={abschnittAnker(id)} data-testid={`abschnitt-${id}`} className="scroll-mt-32 pt-8 first:pt-0 lg:scroll-mt-6">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-xs font-bold tracking-[0.15em] text-primary">{String(a.nr).padStart(2, "0")}</span>
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{a.titel}</h2>
        <span className="h-px flex-1 bg-border/60" />
        {rechts}
      </div>
      {children}
    </section>
  );
}

function KennzahlKachel({ k, gross }: { k: Kennzahl; gross?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className={cn("font-semibold text-foreground tabular-nums", gross ? "text-lg" : "text-base")}>{k.wert}</div>
      <div className="text-xs text-muted-foreground">{k.label}{k.unter ? `, ${k.unter}` : ""}</div>
    </div>
  );
}

// ── 1 Start ──

export function AbschnittStart({ inhalt }: { inhalt: ExposeInhalt }) {
  const { kopf, start } = inhalt;
  const bilder = start.bilder.filter((b) => b.url).sort((a, b) => (a.reihenfolge || 0) - (b.reihenfolge || 0));
  const [idx, setIdx] = useState(0);
  const aktuell = bilder[Math.min(idx, Math.max(0, bilder.length - 1))];
  return (
    <div className="space-y-3">
      <div className="relative h-64 overflow-hidden rounded-2xl bg-muted sm:h-80 lg:h-[22rem]">
        {aktuell ? (
          <LazyImage key={aktuell.id || aktuell.url} src={resolveImageUrl(aktuell.url)} alt={aktuell.alt || kopf.titel} className="h-full w-full object-cover" wrapperClassName="h-full w-full" priority />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/40"><Building2 className="h-16 w-16" /></div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-foreground/85" />
        <div className="absolute inset-x-5 bottom-5 text-background">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">Deine Kapitalanlage</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{kopf.adresse.split(",")[0]}, {kopf.titel}</h1>
          <div className="text-sm opacity-90">{[kopf.ort, kopf.untertitel].filter(Boolean).join(" · ")}</div>
        </div>
        {bilder.length > 1 && (
          <>
            <Button type="button" size="icon" variant="secondary" aria-label="Vorheriges Bild" onClick={() => setIdx((i) => (i - 1 + bilder.length) % bilder.length)} className="absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full shadow"><ChevronLeft className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="secondary" aria-label="Nächstes Bild" onClick={() => setIdx((i) => (i + 1) % bilder.length)} className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full shadow"><ChevronRight className="h-4 w-4" /></Button>
            <span className="absolute right-3 top-3 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-semibold">{idx + 1} / {bilder.length}</span>
          </>
        )}
      </div>
      {bilder.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {bilder.map((b, i) => (
            <button key={b.id || b.url} type="button" onClick={() => setIdx(i)} aria-label={`Bild ${i + 1}`} className={cn("h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2", i === idx ? "border-primary" : "border-transparent")}>
              <LazyImage src={resolveImageUrl(b.url)} alt={b.alt || ""} className="h-full w-full object-cover" wrapperClassName="h-full w-full" />
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="start-kennzahlen">
        {start.kennzahlen.map((k) => <KennzahlKachel key={k.label} k={k} gross />)}
      </div>
      {(typeof start.einwohner === "number" || typeof start.wachstumProzent === "number") && (
        <div className="flex flex-wrap gap-3 text-sm">
          {typeof start.einwohner === "number" && <span><b className="tabular-nums">{new Intl.NumberFormat("de-DE").format(start.einwohner)}</b> <span className="text-muted-foreground">Einwohner in {inhalt.standort.ort}</span></span>}
          {typeof start.wachstumProzent === "number" && <span><b className={cn("tabular-nums", start.wachstumProzent >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]")}>{start.wachstumProzent > 0 ? "+" : ""}{start.wachstumProzent.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</b> <span className="text-muted-foreground">Einwohner in fünf Jahren</span></span>}
        </div>
      )}
      {start.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="start-chips">
          {start.chips.map((c) => <Badge key={c} variant="outline" className="bg-card font-semibold">{c}</Badge>)}
        </div>
      )}
    </div>
  );
}

// ── 2 Standort ──

export function AbschnittStandort({ standort }: { standort: ExposeInhalt["standort"] }) {
  return (
    <div className="space-y-4">
      {standort.kennzahlen.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{standort.kennzahlen.map((k) => <KennzahlKachel key={k.label} k={k} gross />)}</div>
      ) : (
        <p className="text-sm text-muted-foreground">Zu {standort.ort} liegen noch keine Standortkennzahlen vor.</p>
      )}
      {standort.argumente.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2" data-testid="standort-argumente">
          {standort.argumente.map((a, i) => (
            <div key={i} className="rounded-xl border border-border/60 border-l-4 border-l-primary bg-card px-4 py-3">
              <div className="flex items-baseline gap-2"><span className="text-xs font-bold text-primary">{i + 1}.</span><b>{a.titel}</b></div>
              {a.text && <p className="mt-1 text-sm leading-relaxed text-foreground/90">{a.text}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Die Argumente für diesen Standort erläutert dir dein Ansprechpartner im Gespräch.</p>
      )}
      {standort.arbeitgeber.length > 0 && (
        <div className={KARTE} data-testid="standort-arbeitgeber">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Namhafte Arbeitgeber</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {standort.arbeitgeber.map((a, i) => (
              <div key={a.name} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">{i + 1}</span>
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{[a.branche, a.mitarbeiter ? `rund ${new Intl.NumberFormat("de-DE").format(a.mitarbeiter)} Beschäftigte` : ""].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Hinweis>Quelle: {standort.quelle}.</Hinweis>
    </div>
  );
}

// ── 4 Objektdaten ──

export function AbschnittObjektdaten({ objektdaten }: { objektdaten: ExposeInhalt["objektdaten"] }) {
  const { zeilen, sanierungen, energie } = objektdaten;
  const sprache = useAnzeigeSprache();
  const t = exposeSeitenTexte(sprache);
  const od = OBJEKTDETAILS_TEXTE[sprache === "en" ? "en" : "de"];
  const haelfte = Math.ceil(zeilen.length / 2);
  const spalte = (liste: Kennzahl[]) => (
    <div className="divide-y divide-border/60">
      {liste.map((z) => (
        // `data-zeile`: Das Exposé hebt darüber einzelne wichtige Werte farbig hervor (premiumExpose.css).
        <div key={z.label} data-zeile={kennzahlSchluessel(z)} className="flex items-start justify-between gap-3 py-2 text-sm">
          <span className="text-muted-foreground">{z.label}</span>
          <span className="text-right"><span className="font-semibold">{z.wert}</span>{z.unter && <div className="text-xs text-muted-foreground">{z.unter}</div>}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className={`${KARTE} grid gap-x-8 md:grid-cols-2`} data-testid="objektdaten-tabelle">
        {spalte(zeilen.slice(0, haelfte))}
        {spalte(zeilen.slice(haelfte))}
      </div>
      <div className={KARTE}>
        <div className="mb-2 font-semibold">{sprache === "en" ? od.sanierungenUeberschrift : SANIERUNGEN_UEBERSCHRIFT}</div>
        {sanierungen.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="sanierungen-ohne-liste">{objektdaten.sanierungenOhneListe || od.keineAngaben}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {sanierungen.map((s, i) => (
              <li key={i} className="flex justify-between gap-3"><span><b>{s.jahr}</b> {s.massnahme}</span>{s.betrag ? <span className="whitespace-nowrap tabular-nums text-muted-foreground">{eur0(s.betrag, sprache)}</span> : null}</li>
            ))}
          </ul>
        )}
        {objektdaten.gemeinschaftseigentum && <Hinweis>{objektdaten.gemeinschaftseigentum}</Hinweis>}
      </div>
      <div className={KARTE}>
        <div className="mb-1 font-semibold">{t.energieeffizienz}</div>
        <div className="mb-3 text-xs text-muted-foreground">
          {[energie.art, energie.energietraeger, energie.baujahr ? t.baujahrMit(energie.baujahr) : "", energie.gueltigBis ? t.ausweisGueltig(energie.gueltigBis) : ""].filter(Boolean).join(" · ") || t.energieFehlt}
        </div>
        <Energieskala klasse={energie.klasse} kennwert={energie.kennwert} positionProzent={energie.positionProzent} hinweis={energie.hinweis} />
        {objektdaten.fehlendePflichtangaben.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-[hsl(var(--warning))]/10 px-3 py-2 text-xs text-foreground" data-testid="pflichtangaben-fehlen">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
            <span>{t.pflichtangabenFehlen(objektdaten.fehlendePflichtangaben.join(", "))}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ── 5 Grundriss ──

export function AbschnittGrundriss({ grundriss }: { grundriss: ExposeInhalt["grundriss"] }) {
  const bild = grundriss.dokumente.find((d) => d.istBild);
  const weitere = grundriss.dokumente.filter((d) => d !== bild);
  return (
    <div className="space-y-3">
      {bild ? (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card p-2">
          <LazyImage src={resolveImageUrl(bild.url)} alt={bild.name} className="mx-auto max-h-[36rem] w-auto object-contain" wrapperClassName="w-full" />
        </div>
      ) : (
        <div className={`${KARTE} flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground`}>
          <FileText className="h-8 w-8 text-muted-foreground/50" />
          {grundriss.dokumente.length ? "Der Grundriss liegt als Datei vor, siehe unten." : "Für diese Einheit liegt noch kein Grundriss vor. Dein Ansprechpartner reicht ihn nach, sobald er vorliegt."}
        </div>
      )}
      {weitere.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {weitere.map((d) => (
            <Button key={d.id} asChild size="sm" variant="outline" className="gap-1.5"><a href={d.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> {d.name}</a></Button>
          ))}
        </div>
      )}
      <Hinweis>Maße im Grundriss können vom Aufmaß abweichen. Möbel dienen nur der Veranschaulichung.</Hinweis>
    </div>
  );
}

// ── 7 Verwaltung ──

export function AbschnittVerwaltung({ verwaltung }: { verwaltung: ExposeInhalt["verwaltung"] }) {
  return (
    <div className={KARTE}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold">{verwaltung.name ? `Leistungen der Verwaltung, ${verwaltung.name}` : "Leistungen der Mietverwaltung"}</div>
        <div className="text-xs text-muted-foreground">{[verwaltung.art, verwaltungKostenText(verwaltung)].filter(Boolean).join(" · ")}</div>
      </div>
      <ul className="grid gap-x-8 gap-y-1.5 text-sm md:grid-cols-2" data-testid="verwaltung-leistungen">
        {verwaltung.leistungen.map((l) => (
          <li key={l} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--success))]" />{l}</li>
        ))}
      </ul>
      <Hinweis>Die Mietverwaltung kümmert sich um deine Wohnung und den Mieter. Die Verwaltung der Eigentümergemeinschaft für das ganze Haus steckt im Hausgeld.</Hinweis>
    </div>
  );
}

// ── 10 Chancen und Risiken ──

export function AbschnittChancenRisiken({ themen }: { themen: ExposeInhalt["chancenRisiken"] }) {
  const [offen, setOffen] = useState<string[]>([]);
  const alle = offen.length === themen.length;
  return (
    <div className={KARTE}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Jede Kapitalanlage hat Chancen und Risiken, auch diese Wohnung. Damit du entscheiden kannst, stehen hier beide Seiten nebeneinander, Thema für Thema.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOffen(alle ? [] : themen.map((t) => t.id))} data-testid="alle-aufklappen">{alle ? "Alle einklappen" : "Alle aufklappen"}</Button>
      </div>
      <Accordion type="multiple" value={offen} onValueChange={setOffen}>
        {themen.map((t) => (
          <AccordionItem key={t.id} value={t.id}>
            <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">{t.titel}</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-lg bg-[hsl(var(--success))]/10 px-3 py-2"><div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--success))]">Chance</div>{t.chance}</div>
                <div className="rounded-lg bg-[hsl(var(--warning))]/10 px-3 py-2"><div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--warning))]">Risiko</div>{t.risiko}</div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

// ── 11 Rechtliche Hinweise ──

export function AbschnittRechtliches({ rechtliches }: { rechtliches: ExposeInhalt["rechtliches"] }) {
  return (
    <div className="space-y-4">
      {rechtliches.entwurf && (
        <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-4 py-3 text-sm" data-testid="rechtliches-entwurf">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
          <span><b>Entwurf.</b> Diese Hinweise sind noch nicht vom Anwalt freigegeben. Vor dem ersten Kundenlink werden sie geprüft und ersetzt.</span>
        </div>
      )}
      <div className={`${KARTE} space-y-4`}>
        {rechtliches.hinweise.map((h) => (
          <div key={h.titel}>
            <div className="text-sm font-semibold">{h.titel}</div>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{h.text}</p>
          </div>
        ))}
      </div>
      <div className={KARTE} data-testid="energieausweis-pflichtangaben">
        <div className="mb-2 font-semibold">Pflichtangaben zum Energieausweis (GEG § 87)</div>
        <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {rechtliches.energieausweis.map((k) => (
            <div key={k.label} className="flex justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0"><span className="text-muted-foreground">{k.label}</span><span className="font-semibold">{k.wert}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 12 Kontakt ──

/** Der Vertriebspartner mit Bild, Name, Rolle und den Wegen zu ihm. */
function PersonKarte({ person, titel }: { person: Person; titel: string }) {
  const t = exposeSeitenTexte(useAnzeigeSprache());
  return (
    <div className={KARTE}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titel}</div>
      <div className="flex items-center gap-3">
        {person.avatarUrl ? (
          <img src={person.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initialen(person.name)}</div>
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold">{person.name}</div>
          {person.rolle && !/ansprechpartner|your contact/i.test(person.rolle) && <div className="truncate text-xs text-muted-foreground">{person.rolle}</div>}
        </div>
      </div>
      <div className="screen-only mt-3 flex flex-wrap gap-2">
        {person.email && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`mailto:${person.email}`}><Mail className="h-3.5 w-3.5" /> {t.email}</a></Button>}
        {person.telefon && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`tel:${person.telefon}`}><Phone className="h-3.5 w-3.5" /> {t.anrufen}</a></Button>}
        {/*
          Weiße Schrift auf dunklem Blau, 6:1. Im Exposé erbt jeder Link die
          Schriftfarbe seiner Umgebung (`.premium-expose a`), dadurch stand
          hier dunkle Schrift auf Blau. `kontakt-termin` setzt beide Farben
          fest, Regel in `premiumExpose.css`.
        */}
        {person.buchungslink && <Button asChild size="sm" className="kontakt-termin gap-1.5 bg-[#0466a9] text-white hover:bg-[#03558d]"><a href={person.buchungslink} target="_blank" rel="noreferrer" data-testid="kontakt-termin"><CalendarDays className="h-3.5 w-3.5" /> {t.termin}</a></Button>}
      </div>
      {/* Im Druck sind Knöpfe nutzlos, dort stehen Adresse und Nummer als Text. */}
      {(person.email || person.telefon) && <p className="print-only mt-2 text-sm">{[person.telefon, person.email].filter(Boolean).join(" · ")}</p>}
    </div>
  );
}

/**
 * Ganz unten „Dein Ansprechpartner“: nur der Vertrieb.
 *
 * Der Objektpartner stand bis zum 23.09.2026 daneben. Christian will ihn im
 * Exposé nicht mehr sehen: Der Kunde hat einen Ansprechpartner, nicht zwei.
 * Ist kein Vertriebspartner bekannt (etwa im allgemeinen Kundenlink), steht
 * statt eines „Nicht hinterlegt“ der Weg zu MOREImmo selbst da.
 */
export function AbschnittKontakt({ kontakt }: { kontakt: ExposeInhalt["kontakt"] }) {
  const t = exposeSeitenTexte(useAnzeigeSprache());
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-foreground px-5 py-6 text-background">
        <div className="text-xl font-semibold">{t.bereit}</div>
        <p className="mt-1 text-sm opacity-80">{t.bereitText}</p>
      </div>
      <div className="mx-auto max-w-md" data-testid="kontakt-personen">
        {kontakt.vertrieb ? (
          <PersonKarte person={kontakt.vertrieb} titel={t.imVertrieb} />
        ) : (
          <div className={KARTE} data-testid="kontakt-firma">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.kontaktFirma}</div>
            <p className="text-sm text-muted-foreground">{t.kontaktFirmaText}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {kontakt.email && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`mailto:${kontakt.email}`}><Mail className="h-3.5 w-3.5" /> {kontakt.email}</a></Button>}
              {kontakt.telefon && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`tel:${kontakt.telefon.replace(/\s+/g, "")}`}><Phone className="h-3.5 w-3.5" /> {kontakt.telefon}</a></Button>}
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">{kontakt.firma}</p>
    </div>
  );
}
