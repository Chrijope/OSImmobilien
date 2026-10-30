import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/contexts/UserContext";
import { saisonGeaendert, useSaison, SAISON_EREIGNIS } from "@/hooks/useSaison";
import { supabase } from "@/integrations/supabase/client";
import { getAppConfig, setAppConfig } from "@/lib/appConfigStore";
import { cacheGet } from "@/lib/dataCache";
import { getCurrentUserId } from "@/lib/currentUser";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { tarnName } from "@/lib/vorfuehrmodus";
import { cn } from "@/lib/utils";
import {
  FIGUR,
  GEISTER_TAGE,
  offeneTuerchen,
  osterJahr,
  rolleSiehtFiguren,
  SCHLUESSEL_AUS,
  SCHLUESSEL_ZENTRAL,
  schluesselOstern,
  TUERCHEN,
  VERSTECK_NAME,
  versteckeImJahr,
  type Anlass,
  type OsterStand,
  type Versteck,
  type ZentraleSchalter,
} from "@/lib/saison";

/*
 * Die Saisonfiguren (Christian, 30.10.2026). Zeiträume, Schalter und Inhalte
 * stehen in `lib/saison.ts`, ob gerade eine Figur erscheint, sagt `useSaison`.
 *
 * Die Dialoge (Adventskalender, Eiersuche) hängen einmal im CRM-Gerüst und
 * werden per Fensterereignis geöffnet. Grund: Das Dashboard baut seine
 * Begrüßung bei jedem Zeichnen neu auf, ein Dialog darin würde sich dabei
 * jedes Mal schließen.
 */

const OEFFNEN = "saison-dialog-oeffnen";
type DialogArt = "advent" | "ostern";
const oeffne = (art: DialogArt) => window.dispatchEvent(new CustomEvent(OEFFNEN, { detail: art }));

/** Eine Figur als Bild. Schweben nur, wenn das Gerät Bewegung erlaubt. */
function Figur({ src, className, schweben }: { src: string; className?: string; schweben?: boolean }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      className={cn("pointer-events-none select-none drop-shadow-[0_6px_8px_rgba(15,22,33,0.25)]", schweben && "motion-safe:animate-[logo-haus-schweben_4.5s_ease-in-out_infinite]", className)}
    />
  );
}

// ─── Halloween: Geist an der Glocke ─────────────────────────────────────

type Geisterlead = { kontakt_id: string; vorname: string | null; nachname: string | null; days_inactive: number };

function GeistAnDerGlocke({ heuteAusblenden }: { heuteAusblenden: () => void }) {
  const navigate = useNavigate();
  const [offen, setOffen] = useState(false);
  const [leads, setLeads] = useState<Geisterlead[] | null>(null);

  useEffect(() => {
    if (!offen) return;
    const uid = getCurrentUserId();
    if (!uid) { setLeads([]); return; }
    let aktiv = true;
    (async () => {
      // Dieselbe Prüfung wie die SLA-Glocke, nur ab 14 Tagen und nur die eigenen.
      const { data, error } = await supabase.rpc("get_sla_violations" as any, { p_user_id: uid });
      if (!aktiv) return;
      const zeilen = (error ? [] : ((data || []) as Geisterlead[]))
        .filter((z) => z.days_inactive >= GEISTER_TAGE)
        .sort((a, b) => b.days_inactive - a.days_inactive);
      setLeads(zeilen);
    })();
    return () => { aktiv = false; };
  }, [offen]);

  const name = (l: Geisterlead) => tarnName(`${l.vorname ?? ""} ${l.nachname ?? ""}`.trim() || "Ohne Namen");

  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Halloween: Geist anklicken" data-pruefung="saison-geist"
          className="relative h-9 w-9 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Figur src={FIGUR.geist} schweben className="h-8 w-auto mx-auto" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[70] w-[min(320px,calc(100vw-2rem))] p-4">
        <div className="flex items-center gap-3">
          <Figur src={FIGUR.kuerbis} className="h-10 w-auto" />
          <div className="font-semibold text-foreground leading-snug">Buh! Diese Leads geistern herum</div>
        </div>
        {leads === null ? (
          <p className="mt-3 text-sm text-muted-foreground">Der Geist schaut nach …</p>
        ) : leads.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Hier spukt nichts. Alles im grünen Bereich.</p>
        ) : (
          <>
            <p className="mt-2 text-hinweis text-muted-foreground">Seit über {GEISTER_TAGE} Tagen ohne Aktivität.</p>
            <ul className="mt-2 grid gap-1.5">
              {leads.slice(0, 5).map((l) => (
                <li key={l.kontakt_id}>
                  <button type="button" onClick={() => { setOffen(false); navigate(`/kunden/${l.kontakt_id}`); }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-left text-sm hover:bg-accent">
                    <span className="truncate">{name(l)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{l.days_inactive} Tage</span>
                  </button>
                </li>
              ))}
            </ul>
            {leads.length > 5 && <p className="mt-1.5 text-hinweis text-muted-foreground">und {leads.length - 5} weitere</p>}
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {leads && leads.length > 0 && (
            <Button size="sm" onClick={() => { setOffen(false); navigate(`/kunden/${leads[0].kontakt_id}`); }}>Ersten Lead öffnen</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => { setOffen(false); heuteAusblenden(); }}>Heute ausblenden</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Ostern: Stand der Eiersuche ────────────────────────────────────────

function osterStand(jahr: number): OsterStand {
  const stand = getUserSetting<OsterStand | null>(schluesselOstern(jahr), null);
  return { gefunden: Array.isArray(stand?.gefunden) ? stand!.gefunden : [], abzeichenAm: stand?.abzeichenAm };
}

/** Der Zähler oben in der Kopfleiste. Ein Klick öffnet die Eiersuche. */
function EierZaehler() {
  const jahr = osterJahr(new Date());
  const stand = osterStand(jahr);
  const fertig = !!stand.abzeichenAm;
  return (
    <button type="button" onClick={() => oeffne("ostern")} data-pruefung="saison-eierzaehler"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-hinweis font-semibold text-foreground hover:bg-accent/80 max-sm:hidden">
      <Figur src={FIGUR.ei} className="h-5 w-auto" />
      {fertig ? `Osterabzeichen ${jahr}` : `${Math.min(3, stand.gefunden.length)} von 3 gefunden`}
    </button>
  );
}

/** Kopfleiste: Geist zu Halloween, Eierzähler zu Ostern. */
export function SaisonKopfleiste() {
  const { anlass, sichtbar, heuteAusblenden } = useSaison();
  if (!sichtbar) return null;
  if (anlass === "halloween") return <GeistAnDerGlocke heuteAusblenden={heuteAusblenden} />;
  if (anlass === "ostern") return <EierZaehler />;
  return null;
}

/** Ein verstecktes Osterei. Erscheint nur, wenn dieses Versteck dieses Jahr dran ist. */
export function SaisonEi({ ort }: { ort: Versteck }) {
  const { anlass, sichtbar } = useSaison();
  const [, neu] = useState(0);
  if (!sichtbar || anlass !== "ostern") return null;
  const jahr = osterJahr(new Date());
  if (!versteckeImJahr(jahr).includes(ort)) return null;
  const stand = osterStand(jahr);
  if (stand.gefunden.includes(ort)) return null;

  const finden = () => {
    const gefunden = [...new Set([...stand.gefunden, ort])];
    const alle = versteckeImJahr(jahr).every((v) => gefunden.includes(v));
    const neuStand: OsterStand = { gefunden, ...(alle ? { abzeichenAm: new Date().toISOString() } : {}) };
    void setUserSetting(schluesselOstern(jahr), neuStand);
    saisonGeaendert();
    neu((n) => n + 1);
    if (alle) toast.success(`Alle drei gefunden! Dein Osterabzeichen ${jahr} ist dir sicher.`);
    else toast.success(`Ei gefunden, ${gefunden.length} von 3.`);
  };

  return (
    <button type="button" onClick={finden} aria-label="Osterei einsammeln" title="Osterei" data-pruefung={`saison-ei-${ort}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Figur src={FIGUR.ei} className="h-6 w-auto" />
    </button>
  );
}

// ─── Seitenleiste und Begrüßung ────────────────────────────────────────

/** Der Tannenbaum neben dem Logo in der Seitenleiste. */
export function SaisonLogo() {
  const { anlass, sichtbar } = useSaison();
  if (!sichtbar || anlass !== "weihnachten") return null;
  return (
    <button type="button" onClick={() => oeffne("advent")} aria-label="Adventskalender öffnen" data-pruefung="saison-baum"
      className="absolute right-1.5 top-1.5 h-10 w-10 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Figur src={FIGUR.baum} className="h-9 w-auto mx-auto" />
    </button>
  );
}

/** Geschenk zu Weihnachten, Hase zu Ostern, in der Begrüßung des Dashboards neben dem Datum. */
export function SaisonBegruessung() {
  const { anlass, sichtbar } = useSaison();
  if (!sichtbar || (anlass !== "weihnachten" && anlass !== "ostern")) return null;
  const weihnachten = anlass === "weihnachten";
  return (
    <button type="button" onClick={() => oeffne(weihnachten ? "advent" : "ostern")}
      aria-label={weihnachten ? "Adventskalender öffnen" : "Osterhase anklicken"}
      data-pruefung={weihnachten ? "saison-geschenk" : "saison-hase"}
      className="h-14 w-14 shrink-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Figur src={weihnachten ? FIGUR.geschenk : FIGUR.hase} schweben className="h-12 w-auto mx-auto" />
    </button>
  );
}

// ─── Dialoge ────────────────────────────────────────────────────────────

/** Eigene Jahreszahlen aus dem Zwischenspeicher, nur für den angemeldeten Nutzer. */
function eigeneJahreszahlen(uid: string | null, jahr: number) {
  const kontakte = (cacheGet("kontakte") as any[]).filter((k) => k.zustaendig_id === uid && !k.geloescht);
  const eigene = new Set(kontakte.map((k) => String(k.id)));
  const imJahr = (wert: unknown) => typeof wert === "string" && wert.startsWith(String(jahr));
  const termine = (cacheGet("aktivitaeten") as any[]).filter(
    (a) => a.art === "meeting" && eigene.has(String(a.kunde_id)) && a.erledigt_am && imJahr(a.erledigt_am),
  ).length;
  return {
    kontakte: kontakte.filter((k) => imJahr(k.erstellt_am)).length,
    termine,
    inArbeit: kontakte.filter((k) => !k.archiviert && !["verloren", "inaktiv"].includes(String(k.status))).length,
  };
}

function Adventskalender({ vorschau, heuteAusblenden, schliessen }: { vorschau: boolean; heuteAusblenden: () => void; schliessen: () => void }) {
  const navigate = useNavigate();
  const heute = new Date();
  // In der Vorschau sind alle Türchen offen, damit Christian sie durchsehen kann.
  const offene = vorschau ? 24 : offeneTuerchen(heute);
  const [gewaehlt, setGewaehlt] = useState(Math.max(1, offene));
  const jahr = heute.getFullYear();
  const zahlen = useMemo(() => eigeneJahreszahlen(getCurrentUserId(), jahr), [jahr]);
  const tuer = TUERCHEN[gewaehlt - 1];
  const geh = (ziel: string) => { schliessen(); navigate(ziel); };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <Figur src={FIGUR.baum} className="h-12 w-auto" />
          <div>
            <DialogTitle>Adventskalender</DialogTitle>
            <DialogDescription>{offene === 0 ? "Ab dem 1. Dezember öffnet sich jeden Tag ein Türchen." : "Jeden Tag ein Türchen, alte bleiben offen."}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Türchen">
        {TUERCHEN.map((_, i) => {
          const nr = i + 1;
          const zu = nr > offene;
          return (
            <button key={nr} type="button" disabled={zu} onClick={() => setGewaehlt(nr)} aria-pressed={nr === gewaehlt}
              className={cn(
                "aspect-square rounded-lg text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                zu ? "bg-muted text-muted-foreground/60 cursor-not-allowed"
                  : nr === gewaehlt ? "bg-emerald-600 text-white"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300",
              )}>
              {nr}
            </button>
          );
        })}
      </div>
      {offene > 0 && tuer && (
        <div className="rounded-xl border border-border bg-card p-4" data-pruefung="saison-tuerchen">
          <div className="text-hinweis font-semibold uppercase tracking-wide text-muted-foreground">Türchen {gewaehlt}</div>
          {tuer.art === "tipp" && (
            <>
              <p className="mt-1.5 text-sm">{tuer.text}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => geh("/vertriebsakademie")}>In der Akademie lesen</Button>
            </>
          )}
          {tuer.art === "einwand" && (
            <>
              <p className="mt-1.5 text-sm font-medium">„{tuer.einwand}“</p>
              <p className="mt-1 text-sm text-muted-foreground">Gute Antwort: {tuer.antwort}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => geh("/vertriebsakademie-neu/einwaende")}>Zu den Einwänden</Button>
            </>
          )}
          {tuer.art === "zahl" && (
            <p className="mt-1.5 text-sm">
              {tuer.zahl === "kontakte" && <>In diesem Jahr sind schon <b className="tabular-nums">{zahlen.kontakte}</b> neue Kontakte bei dir gelandet.</>}
              {tuer.zahl === "termine" && <>In diesem Jahr hast du schon <b className="tabular-nums">{zahlen.termine}</b> Termine mit Kunden geführt.</>}
              {tuer.zahl === "inArbeit" && <>Gerade betreust du <b className="tabular-nums">{zahlen.inArbeit}</b> Kontakte. Welcher wartet am längsten auf dich?</>}
            </p>
          )}
          {tuer.art === "jahr" && (
            <>
              <div className="mt-1.5 flex items-center gap-2">
                <Figur src={FIGUR.geschenk} className="h-9 w-auto" />
                <span className="font-semibold">Dein Jahr {jahr} in Zahlen</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {([["neue Kontakte", zahlen.kontakte], ["Termine geführt", zahlen.termine], ["Kontakte in Arbeit", zahlen.inArbeit]] as const).map(([titel, wert]) => (
                  <div key={titel} className="rounded-lg bg-muted p-2">
                    <div className="text-xl font-bold tabular-nums">{wert}</div>
                    <div className="text-hinweis text-muted-foreground">{titel}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">Danke für dein Jahr. Frohe Weihnachten!</p>
            </>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => { schliessen(); heuteAusblenden(); }}>Heute ausblenden</Button>
      </div>
    </>
  );
}

function Eiersuche({ heuteAusblenden, schliessen }: { heuteAusblenden: () => void; schliessen: () => void }) {
  const jahr = osterJahr(new Date());
  const verstecke = versteckeImJahr(jahr);
  const stand = osterStand(jahr);
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <Figur src={FIGUR.hase} className="h-14 w-auto" />
          <div>
            <DialogTitle>{stand.abzeichenAm ? `Geschafft! Dein Osterabzeichen ${jahr}` : "Ich habe drei Eier versteckt."}</DialogTitle>
            <DialogDescription>
              {stand.abzeichenAm
                ? "Du hast alle drei Eier gefunden. Frohe Ostern!"
                : `Eines ${VERSTECK_NAME[verstecke[0]]}, eines ${VERSTECK_NAME[verstecke[1]]}, eines ${VERSTECK_NAME[verstecke[2]]}.`}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="flex items-end justify-center gap-6 py-2" aria-label={`${stand.gefunden.length} von 3 gefunden`}>
        {verstecke.map((v) => (
          <div key={v} className="grid justify-items-center gap-1">
            <Figur src={FIGUR.ei} className={cn("h-12 w-auto", !stand.gefunden.includes(v) && "opacity-25 grayscale")} />
            <span className="text-hinweis text-muted-foreground">{stand.gefunden.includes(v) ? "gefunden" : "noch versteckt"}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => { schliessen(); heuteAusblenden(); }}>Heute ausblenden</Button>
      </div>
    </>
  );
}

/** Hängt einmal im CRM-Gerüst und öffnet Adventskalender oder Eiersuche. */
export function SaisonDialoge() {
  const { sichtbar, vorschau, heuteAusblenden } = useSaison();
  const [art, setArt] = useState<DialogArt | null>(null);
  useEffect(() => {
    const auf = (e: Event) => setArt((e as CustomEvent<DialogArt>).detail);
    window.addEventListener(OEFFNEN, auf);
    return () => window.removeEventListener(OEFFNEN, auf);
  }, []);
  const schliessen = () => setArt(null);
  return (
    <Dialog open={sichtbar && !!art} onOpenChange={(o) => !o && schliessen()}>
      <DialogContent className="max-w-md">
        {art === "advent" && <Adventskalender vorschau={vorschau} heuteAusblenden={heuteAusblenden} schliessen={schliessen} />}
        {art === "ostern" && <Eiersuche heuteAusblenden={heuteAusblenden} schliessen={schliessen} />}
      </DialogContent>
    </Dialog>
  );
}

// ─── Zahnradmenü ────────────────────────────────────────────────────────

const ANLASS_NAME: Record<Anlass, string> = { halloween: "Halloween", weihnachten: "Weihnachten", ostern: "Ostern" };

/** Persönlicher Schalter für alle internen Rollen, dazu für Admin und Inhaber der Schalter für alle. */
export function SaisonMenue() {
  const { user } = useUser();
  const [, neu] = useState(0);
  useEffect(() => {
    const auf = () => neu((n) => n + 1);
    window.addEventListener(SAISON_EREIGNIS, auf);
    return () => window.removeEventListener(SAISON_EREIGNIS, auf);
  }, []);
  if (!rolleSiehtFiguren(user.role)) return null;
  const aus = getUserSetting<boolean>(SCHLUESSEL_AUS, false) === true;
  const fuerAlle = user.role === "admin" || user.role === "inhaber";
  const zentral = getAppConfig<ZentraleSchalter>(SCHLUESSEL_ZENTRAL, {});

  return (
    <>
      <DropdownMenuCheckboxItem
        checked={!aus}
        onSelect={(e) => e.preventDefault()}
        onCheckedChange={(an) => { void setUserSetting(SCHLUESSEL_AUS, !an); saisonGeaendert(); neu((n) => n + 1); }}
        data-pruefung="saison-schalter"
      >
        Saisonfiguren anzeigen
      </DropdownMenuCheckboxItem>
      {fuerAlle && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Saisonfiguren für alle</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="z-[70]">
              {(["halloween", "weihnachten", "ostern"] as const).map((a) => (
                <DropdownMenuCheckboxItem
                  key={a}
                  checked={zentral[a] !== false}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={async (an) => {
                    const ok = await setAppConfig(SCHLUESSEL_ZENTRAL, { ...getAppConfig<ZentraleSchalter>(SCHLUESSEL_ZENTRAL, {}), [a]: an });
                    if (ok) toast.success(`${ANLASS_NAME[a]} ist jetzt für alle ${an ? "an" : "aus"}.`);
                    saisonGeaendert();
                  }}
                >
                  {ANLASS_NAME[a]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      )}
    </>
  );
}
