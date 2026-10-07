import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { objektUnterlagenBefristen } from "@/lib/storage";
import { ExposeAnsicht } from "@/components/expose/ExposeAnsicht";
import { LinkNichtMehrGueltig } from "@/components/expose/LinkNichtMehrGueltig";
import { investagonErgaenzung, type ExposeGrundriss } from "@/components/expose/exposeInvestagon";
import { annahmenVorbelegen, baueExposeInhalt, type Person } from "@/lib/exposeInhalt";
import {
  ansprechpartnerAusAntwort, baueObjektExposeInhalt, exposePayloadZuObjekt, grundrisseAusAntwort, objektExposeRecheneinheit,
  type KundenlinkGrundriss,
} from "@/lib/exposePublicDaten";
import type { ObjektData } from "@/lib/objekteStore";
import type { ExposeAnnahmen } from "@/lib/exposeAnnahmen";
import { useSeitenSprache, type Sprache } from "@/lib/seitenSprache";
import { SeitenSpracheProvider } from "@/lib/seitenSpracheKontext";
import { exposeSeitenTexte } from "@/components/expose/exposeTexte";

/** Was schiefging: Objekt nicht freigegeben oder die Anfrage selbst scheiterte. */
type Fehler = "" | "nichtVerfuegbar" | "laden";

/** Das Objekt ist nicht freigegeben oder `get-expose` liefert keins. */
class ExposeNichtVerfuegbar extends Error {}

/** Nur die Form, in der ein Token eines Kunden-Exposés vorkommt (32 Byte als Hex). */
const TOKEN_FORM = /^[0-9a-f]{64}$/i;

/**
 * Die befristete Adresse eines Grundrisses gilt 15 Minuten. Beim Nachladen im
 * Tab bleibt sie, solange sie jünger als 10 Minuten ist. Sonst lüde jeder
 * Wechsel zurück in den Tab alle Pläne neu.
 */
const ADRESSE_ERNEUERN_NACH_MS = 10 * 60 * 1000;

/** All public entry points use the existing object endpoint and the same premium document. */
export default function ExposePublic() {
  const { id = "", weId } = useParams<{ id: string; weId?: string }>();
  const [params] = useSearchParams();
  const wohnungId = params.get("wohnung") || weId;
  const beraterId = params.get("berater");
  /*
   * `?token=` ist der Schlüssel eines Kunden-Exposés (`objekt_exposes.token`).
   * Mit ihm nennt `get-expose` den Vertriebspartner dieses Exposés, und die
   * Seite zeigt ihn oben über den Bildern und unten im Kontakt. Ein Token in
   * falscher Form geht gar nicht erst hinaus.
   */
  const tokenRoh = params.get("token");
  const token = tokenRoh && TOKEN_FORM.test(tokenRoh) ? tokenRoh : null;
  /*
   * `?vorschau=1` hängt das Kundenprofil an, wenn der Partner den Link selbst
   * öffnet. Dann zählt `get-expose` nicht mit und läutet keine Glocke.
   */
  const vorschau = params.get("vorschau") === "1";
  const [objekt, setObjekt] = useState<ObjektData | null>(null);
  /*
   * Abgelaufen oder zurückgezogen: `get-expose` schickt nur den Hinweis und
   * die vier Angaben des Partners. `undefined` heißt „nicht abgelaufen“,
   * `null` „abgelaufen, aber ohne Partner“.
   */
  const [abgelaufen, setAbgelaufen] = useState<Person | null | undefined>(undefined);
  const [ansprechpartner, setAnsprechpartner] = useState<Person | undefined>(undefined);
  /*
   * Die Rohzeilen der Einheiten, wie die Schnittstelle sie liefert.
   *
   * `exposePayloadZuObjekt` baut daraus die Anzeigefassung, dabei faellt `meta`
   * weg. Fuer die Investagon-Ergaenzung (Besonderheiten, Merkmale) wird es
   * aber gebraucht. Was darin steht, ist bereits von `get-expose` gefiltert:
   * Provision, Mietvertraege, Kaeufernamen und Dateiadressen sind dort nie
   * dabei, siehe `supabase/functions/_shared/expose-oeffentlich.ts`.
   */
  const [einheitenRoh, setEinheitenRoh] = useState<Array<Record<string, unknown>>>([]);
  /*
   * Die Grundrisse aus Investagon, mit befristeter Adresse (15 Minuten).
   *
   * `get-expose` nennt sie nur zu einem gueltigen Token, und nur ohne Adresse
   * (Entscheidung Christian vom 23.09.2026: keine Originaladresse bei
   * Investagon, keine Adresse eines fremden Servers im Kundenlink). Die
   * Adresse holt die Seite je Plan einzeln ueber die Aktion „datei“; der
   * Server prueft dafuer Token, Objekt, Einheit und Ampel noch einmal.
   * Ohne Token gibt es keine Plaene aus Investagon.
   */
  const [plaene, setPlaene] = useState<ExposeGrundriss[]>([]);
  const adressen = useRef(new Map<string, { url: string; geholt: number }>());
  const [fehler, setFehler] = useState<Fehler>("");
  /*
   * Die Sprache des Kunden aus `get-expose` (Kundensprache, Etappe 3). Nur mit
   * gültigem Token, auch in der Antwort „abgelaufen“. Ohne Token ist das
   * Exposé anonym: dann zählt nur `?lang=` in der Adresse, sonst Deutsch.
   * `useSeitenSprache` nimmt `?lang=` vor dem Server und setzt `<html lang>`.
   */
  const [serverSprache, setServerSprache] = useState<unknown>(undefined);
  const sprache = useSeitenSprache(token ? serverSprache : undefined);
  const t = exposeSeitenTexte(sprache);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const grundrissAdresse = async (g: KundenlinkGrundriss): Promise<string | null> => {
      if (!token) return null;
      try {
        const abfrage = new URLSearchParams({ id, aktion: "datei", token, bereich: g.bereich, datei: g.id });
        if (wohnungId) abfrage.set("wohnung", wohnungId);
        const antwort = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-expose?${abfrage}`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, cache: "no-store", signal: controller.signal,
        });
        if (!antwort.ok) return null;
        const daten = (await antwort.json()) as { url?: unknown } | null;
        return typeof daten?.url === "string" && /^https:\/\//i.test(daten.url) ? daten.url : null;
      } catch {
        return null;
      }
    };
    /** Die Plaene mit Adresse. Ein Plan, fuer den es keine gibt, faellt weg. */
    const plaeneMitAdresse = async (eintraege: KundenlinkGrundriss[]): Promise<ExposeGrundriss[]> => {
      const jetzt = Date.now();
      const fertig = await Promise.all(eintraege.map(async (g) => {
        const schluessel = `${g.bereich}~${g.id}`;
        const bekannt = adressen.current.get(schluessel);
        if (bekannt && jetzt - bekannt.geholt < ADRESSE_ERNEUERN_NACH_MS) return { g, url: bekannt.url };
        const url = await grundrissAdresse(g);
        if (url) adressen.current.set(schluessel, { url, geholt: jetzt });
        return { g, url };
      }));
      return fertig.flatMap(({ g, url }) => (url ? [{ id: g.id, name: g.name, url, istBild: g.istBild, ...(g.ersatz ? { ersatz: g.ersatz } : {}) }] : []));
    };
    const laden = async (initial: boolean) => {
      if (initial) { setLoading(true); setObjekt(null); setFehler(""); setAbgelaufen(undefined); setPlaene([]); adressen.current.clear(); }
      try {
        const abfrage = new URLSearchParams({ id });
        if (token) abfrage.set("token", token);
        if (token && wohnungId) abfrage.set("wohnung", wohnungId);
        // Gezählt wird nur das erste Laden, nicht das Nachladen beim
        // Zurückwechseln in den Tab, und nie die Vorschau des Partners.
        if (token && initial && !vorschau) abfrage.set("aufruf", "1");
        if (token && vorschau) abfrage.set("vorschau", "1");
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-expose?${abfrage}`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, cache: "no-store", signal: controller.signal,
        });
        const payload = await response.json();
        if (active && token) setServerSprache(payload?.sprache);
        if (payload?.abgelaufen === true) {
          if (active) { setAbgelaufen(ansprechpartnerAusAntwort(payload.ansprechpartner) ?? null); setObjekt(null); setFehler(""); }
          return;
        }
        if (!response.ok || payload.error || !payload.objekt || payload.objekt.sichtbar === false) throw new ExposeNichtVerfuegbar();
        // Geschuetzte Unterlagen brauchen eine befristete Adresse. Ein nicht
        // angemeldeter Betrachter bekommt keine, dann faellt der Eintrag hier
        // heraus und erscheint im Exposé nicht. Bilder bleiben oeffentlich.
        const [geladen, plaeneNeu] = await Promise.all([
          objektUnterlagenBefristen(exposePayloadZuObjekt(payload)),
          plaeneMitAdresse(token ? grundrisseAusAntwort(payload.grundrisse) : []),
        ]);
        if (active) {
          setObjekt(geladen);
          setEinheitenRoh(Array.isArray(payload.wohnungen) ? payload.wohnungen : []);
          setPlaene(plaeneNeu);
          setAnsprechpartner(ansprechpartnerAusAntwort(payload.ansprechpartner));
          setFehler("");
        }
      } catch (error) {
        if (active && !controller.signal.aborted) { setFehler(error instanceof ExposeNichtVerfuegbar ? "nichtVerfuegbar" : "laden"); setObjekt(null); }
      } finally { if (active) setLoading(false); }
    };
    void laden(true);
    const focus = () => { void laden(false); };
    window.addEventListener("focus", focus);
    return () => { active = false; controller.abort(); window.removeEventListener("focus", focus); };
  }, [id, retry, token, wohnungId, vorschau]);
  if (abgelaufen !== undefined) return <LinkNichtMehrGueltig ansprechpartner={abgelaufen ?? undefined} sprache={sprache} />;
  if (loading) return <div className="flex min-h-screen items-center justify-center gap-3"><Loader2 className="h-5 w-5 animate-spin"/> {t.laedt}</div>;
  if (fehler || !objekt) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"><h1 className="text-xl font-semibold">{t.nichtVerfuegbarTitel}</h1>{fehler && <p>{fehler === "nichtVerfuegbar" ? t.nichtVerfuegbarText : t.ladeFehler}</p>}<button className="flex gap-2" onClick={() => setRetry(r => r+1)}><RefreshCw size={16}/> {t.erneutLaden}</button></div>;
  const wohnung = wohnungId ? objekt.wohnungen.find(w => w.id === wohnungId || w.weNr === wohnungId) : null;
  if (wohnungId && !wohnung) return <div className="p-12 text-center"><h1>{t.einheitNichtGefunden}</h1><p>{t.einheitGehoertNicht}</p></div>;
  /*
   * Die Exposé-Bausteine lesen die Sprache über den Kontext
   * (`useAnzeigeSprache`). Im CRM fehlt der Provider, dort bleibt alles deutsch.
   */
  return <SeitenSpracheProvider sprache={sprache}><PublicDokument key={`${id}:${wohnungId || "objekt"}`} objekt={objekt} wohnungId={wohnung?.id} beraterId={beraterId || objekt.erstellt_von} einheitenRoh={einheitenRoh} plaene={plaene} kundenAnsprechpartner={ansprechpartner} sprache={sprache} /></SeitenSpracheProvider>;
}

function PublicDokument({ objekt, wohnungId, beraterId, einheitenRoh, plaene, kundenAnsprechpartner, sprache }: { objekt: ObjektData; wohnungId?: string; beraterId?: string; einheitenRoh: Array<Record<string, unknown>>; plaene: ExposeGrundriss[]; kundenAnsprechpartner?: Person; sprache: Sprache }) {
  const wohnung = objekt.wohnungen.find(w => w.id === wohnungId);
  const [berater, setBerater] = useState<Person>();
  useEffect(() => {
    let active = true;
    setBerater(undefined);
    /*
     * Ohne Token bleibt es beim bisherigen Weg über `?berater=`. Die Sicht
     * `profiles_public` läuft mit den Rechten des Aufrufers und ist für einen
     * nicht angemeldeten Besucher leer; der Kontakt zeigt dann den Weg zu
     * MOREImmo selbst. Mit Token kommt der Partner aus `get-expose`.
     */
    if (kundenAnsprechpartner || !beraterId) return () => { active = false; };
    void supabase.from("profiles_public" as any).select("name, email, avatar_url, buchungslink").eq("id", beraterId).maybeSingle().then(({data}) => {
      if (!active || !data) return;
      const p = data as unknown as { name: string; email?: string; avatar_url?: string; buchungslink?: string };
      if (!p.name) return;
      setBerater({name:p.name, rolle:"Dein Ansprechpartner", email:p.email, avatarUrl:p.avatar_url, buchungslink:p.buchungslink});
    });
    return () => { active = false; };
  }, [beraterId, kundenAnsprechpartner]);
  const ansprechpartner = kundenAnsprechpartner ?? berater;
  /*
   * Immer neutrale Standardannahmen, auch mit Token: keine Selbstauskunft und
   * keine im CRM gespeicherten Annahmen (`objekt_exposes.annahmen`), denn der
   * Link kann weitergeleitet werden (Entscheidung Christian, 23.09.2026).
   * `get-expose` liefert solche Werte gar nicht erst aus.
   */
  const vorbelegung = useMemo(() => annahmenVorbelegen(objekt, wohnung || objektExposeRecheneinheit(objekt), null), [objekt, wohnung]);
  // Only user edits persist when live object data is refreshed. Object defaults remain live.
  const [aenderungen, setAenderungen] = useState<Partial<ExposeAnnahmen>>({});
  const annahmen = useMemo(() => ({ ...vorbelegung.annahmen, ...aenderungen }), [vorbelegung, aenderungen]);
  const onAnnahmen = useCallback((a: Partial<ExposeAnnahmen>) => setAenderungen(old => ({ ...old, ...a })), []);
  const inhalt = useMemo(() => wohnung ? baueExposeInhalt({objekt, wohnung, ersteller:ansprechpartner, sprache}) : baueObjektExposeInhalt({objekt, ersteller:ansprechpartner, sprache}), [objekt, wohnung, ansprechpartner, sprache]);
  const herkunft = Object.fromEntries(vorbelegung.ausObjekt.filter(k => !(k in aenderungen)).map(k => [k,"objekt" as const]));
  /*
   * Dieselben Investagon-Ergaenzungen wie in der internen Ansicht: Grundriss,
   * Besonderheiten, Merkmale, Objektdaten. Christian hat am 16.09.2026
   * verlangt, dass der Kundenlink zeigt, was die interne Seite zeigt.
   *
   * Die Rohdaten sind vorher gefiltert, hier steht also nur, was ein Fremder
   * sehen darf. Die Grundrisse kommen ausschliesslich aus `plaene`, also mit
   * befristeter Adresse aus dem eigenen Speicher. Aus den Rohdaten wird hier
   * nie ein Plan gebaut: Deren Adressen laegen bei Investagon.
   */
  const investagon = useMemo(
    () => ({
      ...investagonErgaenzung({
        objekt,
        einheit: wohnung ? (einheitenRoh.find((r) => r.id === wohnung.id) ?? null) : null,
        ebene: wohnung ? "einheit" : "objekt",
        sprache,
      }),
      grundrisse: plaene,
    }),
    [objekt, wohnung, einheitenRoh, plaene, sprache],
  );
  return <ExposeAnsicht inhalt={inhalt} rechner={{annahmen, onAnnahmen, herkunft}} pdfAktiv investagon={investagon} kundenAnsprechpartner={kundenAnsprechpartner} />;
}
