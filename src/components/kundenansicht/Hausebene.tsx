import { useMemo } from "react";
import { Building2, Hammer, Home, KeyRound, MapPin, Zap } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArtChip, Detail, Hinweis, Kachel, KartenTitel } from "@/components/objektseite/Bausteine";
import { baueObjektExposeInhalt, gesamtobjektZahlen } from "@/lib/exposePublicDaten";
import type { Person } from "@/lib/exposeInhalt";
import type { ObjektData } from "@/lib/objekteStore";
import { dez, eur0, kaltmieteVon, objektKennzahlen, prozent, renditeProzent } from "@/lib/objektKennzahlen";
import { objektartAbleiten, objektartInfo, objektseiteFelder } from "@/lib/objektseiteDaten";
import { objektdetailsAnzeige } from "@/lib/objektdetailsAnzeige";
import { detectBundesland } from "@/lib/bundeslandGrEst";
import { gepflegterKaufnebenkostenSatz, kaufnebenkostenPct } from "@/lib/kaufnebenkosten";
import type { KundenDokument, Zurueckgehalten } from "@/lib/kundenansichtDaten";
import type { DokumentVerweis } from "../../../supabase/functions/get-kundenansicht/antwort.ts";
import { BeschreibungKarte, KARTE, KundenGalerie, Lagekarte, VerfuegbarChip } from "./KundenBausteine";
import { KundenDokumente } from "./KundenDokumente";
import { wohnungsSpalten, wohnungsZeilen } from "./kundenTexte";
import { KUNDENANSICHT_TEXTE, objektartAnzeige, useKundenTexte } from "./kundenansichtTexte";

/** Der Satz, wenn die Wohnung aus dem Link inzwischen vergeben ist (Bauplan 1.5). */
export const VERGEBEN_SATZ = KUNDENANSICHT_TEXTE.de.haus.vergebenSatz;

/**
 * Die Hausebene der Kundenansicht (Bauplan 1.2 und 1.3).
 *
 * Ein Haus mit mehreren Wohnungen: Kacheln nur aus den freien Wohnungen, die
 * Tabelle „Verfügbare Wohnungen“, ein Klick öffnet die Wohnung. Kein
 * Verkaufsstand, keine Zahl zu reservierten oder verkauften Wohnungen: Die
 * Antwort des Servers enthält sie gar nicht erst.
 *
 * Globalobjekt: verkauft wird das Haus als Ganzes. Statt der Wohnungsliste
 * steht der Mietenspiegel, ohne Einzelpreise und ohne Klick auf eine Wohnung
 * (Entscheidung vom 10.09.2026).
 */
export function Hausebene({
  objekt, global, fuerDich, partner, dokumente, zurueckgehalten, dateiLaden, onWohnung, vergebenHinweis, fuerDichId,
}: {
  objekt: ObjektData;
  global: boolean;
  /** Beim Globalobjekt: Das Haus ist für genau diesen Kunden reserviert. */
  fuerDich: boolean;
  fuerDichId: string | null;
  partner?: Person;
  dokumente: KundenDokument[];
  zurueckgehalten: Zurueckgehalten[];
  dateiLaden: (verweis: DokumentVerweis) => Promise<string | null>;
  onWohnung: (wohnungId: string) => void;
  /** Die Wohnung aus dem Link ist vergeben: Hinweis über den freien Wohnungen. */
  vergebenHinweis: boolean;
}) {
  const { t: alle, sprache } = useKundenTexte();
  const t = alle.haus;
  const eur = (n: number) => eur0(n, sprache);
  const zahl = (n: number, stellen: number) => dez(n, stellen, sprache);
  const felder = objektseiteFelder(objekt);
  const art = objektartInfo(felder.objektart) ?? objektartInfo(objektartAbleiten(objekt));
  const bundesland = detectBundesland(objekt.plz, objekt.ort);
  const adresse = [objekt.adresse, [objekt.plz, objekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const details = objektdetailsAnzeige(objekt, undefined, new Date(), sprache);
  const sanierungSumme = felder.sanierungen.reduce((s, x) => s + (x.betrag || 0), 0);
  const inhalt = useMemo(() => baueObjektExposeInhalt({ objekt, ersteller: partner, sprache }), [objekt, partner, sprache]);
  const k = objektKennzahlen(objekt.wohnungen);
  const baujahr = objekt.globalDaten?.baujahr || undefined;
  const jahre = details.sanierungen.jahre;
  const sanierungSpanne = jahre.length ? (Math.min(...jahre) === Math.max(...jahre) ? String(jahre[0]) : `${Math.min(...jahre)} ${t.bis} ${Math.max(...jahre)}`) : undefined;
  const nkProzent = kaufnebenkostenPct({ plz: objekt.plz, metaPct: gepflegterKaufnebenkostenSatz(objekt) });
  const spanneText = (s: { von: number; bis: number } | null, f: (n: number) => string) =>
    s ? (s.von === s.bis ? f(s.von) : `${f(s.von)} ${t.bis} ${f(s.bis)}`) : t.keineAngabe;
  const anzahl = objekt.wohnungen.length;
  const heute = new Date().toISOString().slice(0, 10);
  const zeilen = wohnungsZeilen(objekt.wohnungen, heute, sprache);
  const nkUnter = nkProzent > 0 ? t.zzglNebenkosten(prozent(nkProzent, 1, sprache), bundesland) : undefined;
  const spalten = wohnungsSpalten(zeilen);

  const kacheln = global ? (() => {
    const z = gesamtobjektZahlen(objekt);
    const rendite = renditeProzent(z.mieteJahr / 12, z.kaufpreis);
    return (
      <>
        <Kachel label={t.kaufpreisGesamt} wert={z.kaufpreis > 0 ? eur(z.kaufpreis) : t.keineAngabe}
          unter={z.kaufpreis > 0 ? (nkUnter ?? t.zzglNebenkostenJeLand) : undefined} />
        <Kachel label={t.wohnflaecheGesamt} wert={z.flaeche > 0 ? `${zahl(z.flaeche, 1)} m²` : t.keineAngabe} unter={z.flaecheAusEinheiten ? t.summeEinheiten : undefined} />
        <Kachel label={t.jahresmiete} wert={z.mieteJahr > 0 ? eur(z.mieteJahr) : t.keineAngabe}
          unter={z.mieteJahr > 0 ? t.jeMonat(eur(z.mieteJahr / 12), !!z.mieteAusEinheiten) : undefined} />
        <Kachel label={t.mietrendite} wert={rendite > 0 ? prozent(rendite, 2, sprache) : t.keineAngabe} unter={t.jahresmieteDurchKaufpreis} info={alle.renditeErklaerung} />
        <Kachel label={t.einheiten} wert={anzahl > 0 ? String(anzahl) : t.keineAngabe} unter={t.imHaus} />
        <Kachel label={t.baujahr} wert={baujahr ? String(baujahr) : t.keineAngabe} unter={sanierungSpanne ? t.sanierung(sanierungSpanne) : undefined} />
      </>
    );
  })() : (
    <>
      <Kachel label={t.wohnflaechen} wert={spanneText(k.wohnflaeche, (n) => `${zahl(n, 1)} m²`)} />
      <Kachel label={t.zimmer} wert={spanneText(k.zimmer, (n) => String(n))} />
      <Kachel label={t.kaufpreise} wert={spanneText(k.kaufpreis, eur)} unter={nkUnter} />
      <Kachel label={t.kaltmieteJeMonat} wert={spanneText(k.kaltmiete, eur)} unter={k.kaltmieteJeQm ? t.kaltmieteJeQm(zahl(k.kaltmieteJeQm.von, 2), zahl(k.kaltmieteJeQm.bis, 2)) : undefined} />
      <Kachel label={t.rendite} wert={spanneText(k.rendite, (n) => prozent(n, 2, sprache))} unter={t.jahresmieteDurchKaufpreis} info={alle.renditeErklaerung} />
      <Kachel label={t.preisJeQm} wert={spanneText(k.preisJeQm, eur)} unter={t.kaufpreisDurchFlaeche} />
      <Kachel label={t.baujahr} wert={baujahr ? String(baujahr) : t.keineAngabe} unter={sanierungSpanne ? t.sanierung(sanierungSpanne) : undefined} />
      <Kachel label={t.verfuegbar} wert={t.wohnungen(anzahl)} />
    </>
  );

  return (
    <div className="min-w-0" data-testid={global ? "kunden-hausebene-global" : "kunden-hausebene"}>
      <div className="mb-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{objekt.titel || objekt.adresse || t.objekt}</h1>
          {global && <VerfuegbarChip fuerDich={fuerDich} />}
          {art && <ArtChip>{objektartAnzeige(art, sprache)}</ArtChip>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0" />{[adresse, bundesland].filter(Boolean).join(", ")}</span>
          {!global && (
            <span className="flex items-center gap-1.5" data-testid="anzahl-verfuegbar">
              <Home className="h-4 w-4 shrink-0" />{anzahl === 0 ? t.keineFrei : t.anzahlVerfuegbar(anzahl)}
            </span>
          )}
        </div>
      </div>

      {vergebenHinweis && (
        <p className="mb-4 rounded-xl border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-4 py-3 text-sm text-foreground" data-testid="hinweis-vergeben">
          {t.vergebenSatz}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <KundenGalerie hausBilder={objekt.bilder} adresse={adresse} titel={objekt.titel || adresse} />
          <BeschreibungKarte inhalt={inhalt} />
        </div>
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3" data-testid="kunden-kacheln">{kacheln}</div>
          <div className={KARTE} data-testid="kunden-objektdetails">
            <KartenTitel>{t.objektdetails}</KartenTitel>
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail icon={<Zap className="h-3.5 w-3.5" />} label={t.energieausweis}
                wert={felder.energieausweis.klasse ? t.klasse(felder.energieausweis.klasse) : t.keineAngabe}
                unter={[felder.energieausweis.art, felder.energieausweis.kennwert ? `${zahl(felder.energieausweis.kennwert, 0)} kWh/(m²·a)` : "", felder.energieausweis.energietraeger, felder.energieausweis.gueltigBis ? t.gueltigBis(felder.energieausweis.gueltigBis) : ""].filter(Boolean).join(", ") || undefined} />
              <Detail icon={<Building2 className="h-3.5 w-3.5" />} label={t.gemeinschaftseigentum} wert={details.gemeinschaftseigentum.wert} unter={details.gemeinschaftseigentum.unter} />
              <Detail icon={<Hammer className="h-3.5 w-3.5" />} label={t.sanierungen} wert={details.sanierungen.wert}
                unter={[details.sanierungen.unter, details.sanierungen.art === "gepflegt" && sanierungSumme > 0 ? t.sanierungSumme(eur(sanierungSumme)) : ""].filter(Boolean).join(", ") || undefined} />
              <Detail icon={<KeyRound className="h-3.5 w-3.5" />} label={t.verwaltung} wert={details.verwaltung.wert} unter={details.verwaltung.unter} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Lagekarte mikrolage={inhalt.mikrolage} titel={objekt.adresse || objekt.titel} />
      </div>

      <div className={`${KARTE} mt-4 min-w-0`}>
        {global ? (
          <div data-testid="kunden-mietenspiegel">
            <KartenTitel>{t.mietenspiegel}</KartenTitel>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase tracking-wide">{t.einheit}</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide">{t.lage}</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.wohnflaeche}</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.zimmer}</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.kaltmiete}</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide">{t.vermietung}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {objekt.wohnungen.map((w) => {
                    const miete = kaltmieteVon(w, heute);
                    return (
                      <TableRow key={w.id}>
                        <TableCell className="font-semibold">{w.weNr || t.einheit}</TableCell>
                        <TableCell>{[w.etage, w.lage].filter(Boolean).join(" ") || t.keineAngabe}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{w.groesse > 0 ? `${zahl(w.groesse, 1)} m²` : t.keineAngabe}</TableCell>
                        <TableCell className="text-right">{w.zimmer > 0 ? w.zimmer : t.keineAngabe}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{miete > 0 ? eur(miete) : t.keineAngabe}</TableCell>
                        <TableCell>{w.vermietet ? t.vermietet : t.frei}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Hinweis>{t.nurImGanzen}</Hinweis>
          </div>
        ) : (
          <div data-testid="kunden-verfuegbare-wohnungen">
            <KartenTitel>{t.verfuegbareWohnungen}</KartenTitel>
            {anzahl === 0 ? (
              <p className="text-sm text-muted-foreground">{t.keineFreiLang}</p>
            ) : (
              <>
                {/* Ab 640 px die Tabelle. Leere Spalten fallen weg, siehe `wohnungsSpalten`. */}
                <div className="hidden overflow-x-auto sm:block" data-testid="kunden-wohnungen-tabelle">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px] uppercase tracking-wide">{t.wohnung}</TableHead>
                        {spalten.etage && <TableHead className="text-[11px] uppercase tracking-wide">{t.etage}</TableHead>}
                        {spalten.flaeche && <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.flaeche}</TableHead>}
                        {spalten.zimmer && <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.zimmer}</TableHead>}
                        {spalten.kaltmiete && <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.kaltmiete}</TableHead>}
                        {spalten.kaufpreis && <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.kaufpreis}</TableHead>}
                        {spalten.rendite && <TableHead className="text-right text-[11px] uppercase tracking-wide">{t.rendite}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {zeilen.map((z) => (
                        <TableRow key={z.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onWohnung(z.id)}
                          tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onWohnung(z.id); } }}
                          aria-label={t.oeffnen(z.name)} data-testid={`zeile-${z.id}`}>
                          <TableCell className="font-semibold text-primary">{z.name}{fuerDichId === z.id ? <span className="ml-1 text-xs font-normal text-muted-foreground">{t.fuerDichReserviert}</span> : null}</TableCell>
                          {spalten.etage && <TableCell>{z.etage}</TableCell>}
                          {spalten.flaeche && <TableCell className="whitespace-nowrap text-right">{z.flaeche}</TableCell>}
                          {spalten.zimmer && <TableCell className="text-right">{z.zimmer}</TableCell>}
                          {spalten.kaltmiete && <TableCell className="whitespace-nowrap text-right">{z.kaltmiete}</TableCell>}
                          {spalten.kaufpreis && <TableCell className="whitespace-nowrap text-right">{z.kaufpreis}</TableCell>}
                          {spalten.rendite && <TableCell className="whitespace-nowrap text-right">{z.rendite}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/*
                  Unter 640 px Karten statt Tabelle, nach dem Muster der
                  CRM-Objektseite (`EinheitenTabelle`). Vorher lagen Kaufpreis
                  und Rendite auf dem Handy rechts außerhalb des Bildes.
                */}
                <ul className="space-y-2 sm:hidden" data-testid="kunden-wohnungen-karten">
                  {zeilen.map((z) => (
                    <li key={z.id}>
                      <button type="button" onClick={() => onWohnung(z.id)} data-testid={`karte-${z.id}`}
                        aria-label={t.oeffnen(z.name)}
                        className="flex w-full min-h-[44px] flex-col gap-1 rounded-xl border border-border/60 bg-card p-3 text-left transition-colors hover:bg-muted/50">
                        <span className="flex w-full items-baseline justify-between gap-2">
                          <span className="font-semibold text-primary">
                            {z.name}
                            {z.etage && <span className="ml-1 text-xs font-normal text-muted-foreground">· {z.etage}</span>}
                          </span>
                          {z.kaufpreis && <span className="shrink-0 font-semibold text-foreground">{z.kaufpreis}</span>}
                        </span>
                        {fuerDichId === z.id && <span className="text-xs text-muted-foreground">{t.fuerDichReserviert}</span>}
                        <span className="text-xs text-muted-foreground">
                          {[z.zimmer ? t.zimmerAnzahl(z.zimmer) : "", z.flaeche, z.kaltmiete ? t.kaltmieteMit(z.kaltmiete) : "", z.rendite ? t.renditeMit(z.rendite) : ""].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {anzahl > 0 && <Hinweis>{t.klickHinweis}</Hinweis>}
          </div>
        )}
      </div>

      <div className="mt-4">
        <KundenDokumente dokumente={dokumente} zurueckgehalten={zurueckgehalten} wohnungId={null} dateiLaden={dateiLaden} />
      </div>
    </div>
  );
}

