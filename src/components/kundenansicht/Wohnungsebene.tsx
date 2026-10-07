import { useMemo } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArtChip, BlickZeileAnzeige, Detail, Hinweis, InfoSymbol, Kachel, KartenTitel } from "@/components/objektseite/Bausteine";
import { EinheitFinanzen } from "@/components/objektseite/EinheitFinanzen";
import { investagonErgaenzung } from "@/components/expose/exposeInvestagon";
import { baueExposeInhalt, kaufnebenkostenKachelText, type Person } from "@/lib/exposeInhalt";
import { getHausgeldMonatForWohnung, getHausgeldNichtUmlegbarForWohnung, type ObjektData, type ObjektWohnung } from "@/lib/objekteStore";
import { aufEinenBlickZeilen, dez, eur0, kaltmieteVon, preisJeQm, prozent, renditeVon } from "@/lib/objektKennzahlen";
import { istNeubauArt, objektartAbleiten, objektartInfo, objektseiteFelder } from "@/lib/objektseiteDaten";
import { objektAnlageklasse, objektBauzustand } from "@/lib/objektKlassen";
import { objektdetailsAnzeige } from "@/lib/objektdetailsAnzeige";
import { OBJEKTDETAILS_TEXTE } from "@/lib/objektdetailsAnzeigeTexte";
import { detectBundesland } from "@/lib/bundeslandGrEst";
import { verwaltungsartLabel } from "@/lib/verwaltungInfo";
import type { KundenDokument, Struktur, Zurueckgehalten } from "@/lib/kundenansichtDaten";
import type { DokumentVerweis } from "../../../supabase/functions/get-kundenansicht/antwort.ts";
import {
  BeschreibungKarte, KARTE, KartenReiter, KundenGalerie, MerkmaleKarte, VerfuegbarChip,
} from "./KundenBausteine";
import { objektartAnzeige, useKundenTexte, wertAnzeige } from "./kundenansichtTexte";
import { kundenBlickZeilen, wohnungName } from "./kundenTexte";
import { KundenDokumente } from "./KundenDokumente";
import { Wohnungswechsel } from "./Wohnungswechsel";

export type KundenReiter = "uebersicht" | "dokumente" | "finanzen" | "karte";

/**
 * Die Wohnungsebene der Kundenansicht (Bauplan 1.1): hier landet der Kunde.
 *
 * Aufgebaut wie die interne Einheitsseite, aber nur aus freigegebenen
 * Bausteinen: Titel, Wohnung wechseln, die Reiter Übersicht, Dokumente,
 * Finanzen und Karte. Keine Stifte, keine Kennzeichen, keine Verweise ins
 * CRM, und die Investmentkalkulation gibt es hier nie.
 *
 * Seit dem 24.09.2026 stehen Karte, Mikro- und Makrolage im eigenen Reiter
 * „Karte“ statt ganz unten in der Übersicht, damit die Lage mit einem Klick
 * erreichbar ist.
 */
export function Wohnungsebene({
  objekt, wohnung: w, struktur, einheitRoh, fuerDich, fuerDichId, partner, dokumente, zurueckgehalten, dateiLaden,
  reiter, onReiter, onWohnung, onHaus,
}: {
  objekt: ObjektData;
  wohnung: ObjektWohnung;
  struktur: Struktur;
  einheitRoh: Record<string, unknown> | null;
  fuerDich: boolean;
  fuerDichId: string | null;
  partner?: Person;
  dokumente: KundenDokument[];
  zurueckgehalten: Zurueckgehalten[];
  dateiLaden: (verweis: DokumentVerweis) => Promise<string | null>;
  reiter: KundenReiter;
  onReiter: (r: KundenReiter) => void;
  onWohnung: (wohnungId: string) => void;
  /** Zur Hausübersicht, nur bei einem Haus mit mehreren Wohnungen. */
  onHaus?: () => void;
}) {
  const { t: alle, sprache } = useKundenTexte();
  const t = alle.wohnung;
  const dt = OBJEKTDETAILS_TEXTE[sprache];
  const eur = (n: number) => eur0(n, sprache);
  const einzelobjekt = struktur === "einzelwohnung";
  const felder = objektseiteFelder(objekt);
  const art = objektartInfo(felder.objektart) ?? objektartInfo(objektartAbleiten(objekt));
  const neubau = istNeubauArt(art?.id);
  const anlageklasse = objektAnlageklasse(objekt) || undefined;
  const bauzustand = objektBauzustand(objekt) || undefined;
  const bundesland = detectBundesland(objekt.plz, objekt.ort);
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const miete = kaltmieteVon(w);
  const hausgeld = getHausgeldMonatForWohnung(objekt, w);
  const hausgeldNu = getHausgeldNichtUmlegbarForWohnung(objekt, w);
  const nkText = kaufnebenkostenKachelText(objekt, w, undefined, sprache);
  const gesamt = (w.vkGesamt || 0) + (w.stellplatzPreis || 0);
  const rendite = renditeVon(w);
  const baujahr = objekt.globalDaten?.baujahr || undefined;
  const afa = objekt.afaDaten;
  const adresse = [objekt.adresse, [objekt.plz, objekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const zahlOderLeer = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };

  const blick = aufEinenBlickZeilen({
    wohnung: w, ort: objekt.ort, bundesland, baujahr, bauzustand, neubau,
    hausgeldMonat: hausgeld, hausgeldNichtUmlegbarMonat: hausgeldNu,
    energie: felder.energieausweis,
    verwaltungsart: verwaltungsartLabel(meta.verwaltungsart) || undefined,
    verwaltungWegMonatObjekt: zahlOderLeer(meta.verwaltungskostenWeg),
    verwaltungSevMonatObjekt: zahlOderLeer(meta.verwaltungskostenSev),
    mietgarantieKaltObjekt: zahlOderLeer(meta.garantierteErstvermietungKalt),
    sprache,
  });
  const details = objektdetailsAnzeige(objekt, w, new Date(), sprache);
  const sanierungen = details.sanierungen;
  const sanierungSumme = felder.sanierungen.reduce((s, x) => s + (x.betrag || 0), 0);
  const anteilBetrag = w.sanierungAnteilBetrag ?? (w.sanierungAnteilProzent && sanierungSumme > 0 ? sanierungSumme * w.sanierungAnteilProzent / 100 : undefined);

  // Beschreibung, Standort und die Lage im Reiter Karte wie im Exposé, mit neutralen Angaben.
  const inhalt = useMemo(() => baueExposeInhalt({ objekt, wohnung: w, ersteller: partner, sprache }), [objekt, w, partner, sprache]);
  const zusatz = useMemo(
    () => investagonErgaenzung({ objekt, einheit: einheitRoh, ebene: "einheit", sprache }),
    [objekt, einheitRoh, sprache],
  );

  const eigeneBilder = w.bilder && w.bilder.length > 0 ? w.bilder : [];

  return (
    <div className="min-w-0" data-testid="kunden-wohnungsebene">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {onHaus && (
            <Button variant="ghost" size="sm" className="-ml-2 mb-1 gap-1.5 text-muted-foreground hover:text-foreground" onClick={onHaus}>
              <ArrowLeft className="h-4 w-4" /> {t.zurHaus}
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{wohnungName(w, sprache)}</h1>
            <VerfuegbarChip fuerDich={fuerDich} />
            {art && <ArtChip>{objektartAnzeige(art, sprache)}{bauzustand && art.id === "sanierter_bestand" ? `, ${wertAnzeige(bauzustand, sprache).toLowerCase()}` : ""}</ArtChip>}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{adresse}</div>
        </div>
      </div>

      {!einzelobjekt && (
        <Wohnungswechsel wohnungen={objekt.wohnungen} aktuellId={w.id} fuerDichId={fuerDichId} onWahl={onWohnung} />
      )}

      <Tabs value={reiter} onValueChange={(v) => onReiter(v as KundenReiter)}>
        <TabsList className="mb-4 grid h-auto w-full grid-cols-4 rounded-xl p-1 lg:max-w-xl">
          <TabsTrigger value="uebersicht" className="rounded-lg px-1 py-2">{t.reiter.uebersicht}</TabsTrigger>
          <TabsTrigger value="dokumente" className="rounded-lg px-1 py-2">{t.reiter.dokumente}</TabsTrigger>
          <TabsTrigger value="finanzen" className="rounded-lg px-1 py-2">{t.reiter.finanzen}</TabsTrigger>
          <TabsTrigger value="karte" className="rounded-lg px-1 py-2">{t.reiter.karte}</TabsTrigger>
        </TabsList>

        <TabsContent value="uebersicht">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="contents lg:block lg:space-y-4">
              <div className="order-1 lg:order-none">
                <KundenGalerie key={w.id} wohnungsBilder={eigeneBilder} hausBilder={objekt.bilder} adresse={adresse} titel={`${objekt.titel || adresse}, ${wohnungName(w, sprache)}`} />
              </div>
              <BeschreibungKarte inhalt={inhalt} className="order-4 lg:order-none" />
              <MerkmaleKarte beschreibungen={zusatz.beschreibungen} merkmale={zusatz.merkmale} className="order-6 lg:order-none" />
              {einzelobjekt && (
                <div className={`${KARTE} order-7 lg:order-none`} data-testid="kunden-objektangaben">
                  <KartenTitel>{t.objektangaben}</KartenTitel>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Detail label={t.objektart} wert={art ? objektartAnzeige(art, sprache) : t.keineAngabe} />
                    <Detail label={alle.haus.gemeinschaftseigentum} wert={details.gemeinschaftseigentum.wert} unter={details.gemeinschaftseigentum.unter} />
                    <Detail label={alle.haus.verwaltung} wert={details.verwaltung.wert} unter={details.verwaltung.unter} />
                  </div>
                </div>
              )}
            </div>

            <div className="contents lg:block lg:space-y-4">
              <div className="order-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:order-none" data-testid="kunden-kacheln">
                <Kachel label={t.gesamtinvestition} wert={gesamt > 0 ? eur(gesamt) : t.keineAngabe}
                  unter={gesamt > 0 ? <>{w.stellplatzPreis ? t.kaufpreisPlusStellplatz(eur(w.vkGesamt), eur(w.stellplatzPreis)) : t.kaufpreis(eur(w.vkGesamt))}<br />{nkText}</> : undefined} />
                <Kachel label={t.monatsmiete} wert={miete > 0 ? eur(miete) : t.keineAngabe}
                  unter={miete > 0 ? <>{rendite > 0 ? t.renditeUnter(prozent(rendite, 2, sprache)) : ""}<br />{hausgeldNu > 0 ? t.hausgeldNichtUmlegbar(eur(hausgeldNu)) : ""}</> : undefined}
                  info={alle.renditeErklaerung} />
                <Kachel label={t.wohnflaeche} wert={w.groesse > 0 ? `${dez(w.groesse, 1, sprache)} m²` : t.keineAngabe} unter={preisJeQm(w.vkGesamt, w.groesse) > 0 ? t.jeQm(eur(preisJeQm(w.vkGesamt, w.groesse))) : undefined} info={t.kaufpreisDurchFlaeche} />
                <Kachel label={t.typUndNutzung} wert={<span className="text-lg sm:text-xl">{anlageklasse ? wertAnzeige(anlageklasse, sprache) : t.eigentumswohnung}</span>}
                  unter={[w.vermietet ? t.kapitalanlageVermietet : t.kapitalanlage, afa ? t.afa(afa.afaModell, prozent(afa.afaSatz, 1, sprache)) : ""].filter(Boolean).join(" · ")} />
              </div>
              <div className={`${KARTE} order-3 lg:order-none`} data-testid="kunden-objektdetails">
                <KartenTitel rechts={<span className="text-xs text-muted-foreground">{t.infoHinweis}</span>}>{t.objektdetails}</KartenTitel>
                <div className="grid gap-x-8 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.fakten}</div>
                    {kundenBlickZeilen(blick.fakten, sprache).map((z) => <BlickZeileAnzeige key={z.id ?? z.label} zeile={z.id === "anlageklasse" || z.id === "bauzustand" ? { ...z, wert: wertAnzeige(z.wert, sprache) } : z} />)}
                  </div>
                  <div>
                    <div className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:mt-0">{t.mietuebersicht}</div>
                    {kundenBlickZeilen(blick.miete, sprache).map((z) => <BlickZeileAnzeige key={z.id ?? z.label} zeile={z} />)}
                  </div>
                </div>
              </div>
              <div className={`${KARTE} order-5 lg:order-none`} data-testid="kunden-massnahmen">
                <KartenTitel zusatz={sanierungen.art === "keine" ? undefined : sanierungen.wert}>{dt.sanierungenUeberschrift}</KartenTitel>
                {sanierungen.eintraege.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {sanierungen.art === "neubau" ? t.neubauOhne(sanierungen.wert) : sanierungen.art === "import" ? sanierungen.unter : t.keineAngabenBautraeger}
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {sanierungen.eintraege.map((s, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span>{s.jahr && <b>{s.jahr} </b>}{s.massnahme}</span>
                        {s.betrag ? <span className="tabular-nums text-muted-foreground">{eur(s.betrag)}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {sanierungen.art === "bautraeger" && <Hinweis>{t.massnahmenBautraeger(dt.vermerkBautraeger)}</Hinweis>}
                {(anteilBetrag || w.sanierungAnteilProzent) && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-accent px-3 py-2 text-sm">
                    <span className="flex items-center gap-1 font-medium">{t.deinAnteil} <InfoSymbol text={t.deinAnteilInfo} /></span>
                    <span className="font-semibold tabular-nums">{[w.sanierungAnteilProzent ? prozent(w.sanierungAnteilProzent, 1, sprache) : "", anteilBetrag ? eur(anteilBetrag) : ""].filter(Boolean).join(" = ")}</span>
                  </div>
                )}
                {!einzelobjekt && (
                  <Hinweis>{t.gemeinschaftseigentum([details.gemeinschaftseigentum.wert, details.gemeinschaftseigentum.unter].filter(Boolean).join(", "))}</Hinweis>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dokumente">
          <KundenDokumente dokumente={dokumente} zurueckgehalten={zurueckgehalten} wohnungId={w.id} dateiLaden={dateiLaden}
            hausTitel={einzelobjekt ? alle.dokumente.objekt : alle.dokumente.haus} />
        </TabsContent>

        <TabsContent value="finanzen">
          <p className="mb-3 rounded-xl border border-primary/30 bg-accent px-4 py-2.5 text-sm text-foreground" data-testid="finanzen-hinweis">
            {t.finanzenHinweis}
          </p>
          <EinheitFinanzen key={w.id} objekt={objekt} wohnung={w} kundenModus />
        </TabsContent>

        <TabsContent value="karte">
          <KartenReiter mikrolage={inhalt.mikrolage} titel={objekt.adresse || objekt.titel} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
