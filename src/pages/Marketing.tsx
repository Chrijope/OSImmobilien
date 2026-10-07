import { useState, useMemo, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { getKontakte, mergeKontaktMeta } from "@/lib/kundenStore";
import { cacheGet, cacheGetById, cacheUpdate } from "@/lib/dataCache";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { useLiveVersion } from "@/hooks/useLiveData";
import { DeutschlandkarteBasis } from "@/components/karte/DeutschlandkarteBasis";
import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";
import { kundenAnschrift, anschriftZeile } from "@/lib/kundenAnschrift";
import type { InvestmentZeileMitSa } from "@/lib/saQuelle";

type StandortTyp = "kunde" | "partner" | "objekt";

type Standort = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  typ: StandortTyp;
  details: string;
  strukturPartner?: string; // ID of managing VP for vertriebspartner filtering
};

const FILTER_CONFIG: { typ: StandortTyp; label: string; color: string; markerColor: string }[] = [
  { typ: "kunde", label: "Kunden", color: "bg-green-500", markerColor: "#22c55e" },
  { typ: "partner", label: "Partner", color: "bg-blue-500", markerColor: "#3b82f6" },
  { typ: "objekt", label: "Objekte", color: "bg-amber-500", markerColor: "#f59e0b" },
];

const markerColorMap: Record<StandortTyp, string> = {
  kunde: "#22c55e",
  partner: "#3b82f6",
  objekt: "#f59e0b",
};

// Rollen, die NICHT als Partner auf der Karte erscheinen sollen.
// Analog zur Nutzerverwaltung: alle internen Nutzer werden gezeigt,
// nur externe Rollen (Kunde/Tippgeber) sind ausgeschlossen.
const EXCLUDED_PARTNER_ROLES = new Set<string>(["kunde", "tippgeber"]);

import { geocodeAddress, getCachedCoords } from "@/lib/geocodeCache";

/** Die Felder, die diese Seite in `meta` ablegt. */
type GeoMeta = {
  lat?: unknown;
  lng?: unknown;
  /** Adresse, zu der der letzte Nachschlag gehoert. Aendert sie sich, wird neu gesucht. */
  geoAdresse?: unknown;
  /** Zeitpunkt eines erfolglosen Nachschlags. Verhindert ewige Wiederholungen. */
  geoFehlgeschlagenAm?: unknown;
};

/**
 * Ergebnis eines Nachschlags am Datensatz vermerken.
 *
 * Ohne das wird jede Adresse auf jedem Geraet und bei jedem Aufruf erneut bei
 * Nominatim nachgeschlagen. Da dort nur eine Anfrage pro Sekunde erlaubt ist,
 * dauerte der Aufbau der Karte bei vielen Kontakten entsprechend lange. Einmal
 * gespeichert, ist der Punkt fuer alle sofort da.
 *
 * Rueckgabe: `false`, wenn das Speichern gescheitert ist. Der Aufrufer zaehlt
 * das mit und weist es aus, statt den Fehler stillschweigend zu schlucken.
 */
async function merkeGeoDaten(
  tabelle: "kontakte" | "objekte" | "dienstleister",
  id: string,
  patch: GeoMeta,
  rolle?: string,
): Promise<boolean> {
  /*
   * Seit dem 30.09.2026 schreiben in `objekte` nur Admin und Inhaber, in
   * `dienstleister` dazu die Hausverwaltung. Alle anderen behalten das
   * Ergebnis im lokalen Zwischenspeicher (`geocodeCache`, der auch
   * erfolglose Suchen merkt), sonst lehnte die Datenbank bei jedem Aufruf ab
   * und die Karte fragte jede Adresse erneut nach.
   */
  const darfSchreiben = tabelle === "kontakte"
    || rolle === "admin" || rolle === "inhaber"
    || (tabelle === "dienstleister" && rolle === "hausverwaltung");
  if (!darfSchreiben) return true;
  if (tabelle === "kontakte") {
    // Feldweise ueber die RPC, damit nicht das ganze meta aus einem zuvor
    // gelesenen Stand zurueckgeschrieben wird. mergeKontaktMeta zieht ausserdem
    // den Zwischenspeicher nach.
    return mergeKontaktMeta(id, patch as Record<string, any>);
  }
  // Fuer objekte und dienstleister gibt es keine feldweise Funktion. Grundlage
  // ist deshalb das meta aus dem Zwischenspeicher, der ueber Realtime aktuell
  // gehalten wird. cacheUpdate schreibt in Datenbank UND Zwischenspeicher,
  // damit ein spaeteres Speichern des Datensatzes den Wert nicht wieder
  // ueberschreibt.
  const bestehend = (cacheGetById<{ meta?: Record<string, unknown> }>(tabelle, id)?.meta) || {};
  try {
    await cacheUpdate(tabelle, id, { meta: { ...bestehend, ...patch } }, { silent: true });
    return true;
  } catch (e) {
    console.error(`Marketing: Koordinaten fuer ${tabelle}/${id} nicht gespeichert:`, e);
    return false;
  }
}

/**
 * Wurde fuer genau diese Adresse schon einmal erfolglos gesucht?
 *
 * Nur dann gilt der Vermerk, sonst wuerde eine nachgepflegte Adresse nie wieder
 * probiert.
 */
function schonErfolglos(meta: GeoMeta | undefined, adresse: string): boolean {
  if (!meta?.geoFehlgeschlagenAm) return false;
  return String(meta.geoAdresse || "") === adresse;
}

/**
 * Rollen, Dienstleister und Objekte. Die liest die Seite einmal je Aufruf.
 *
 * Frueher kamen sie bei jeder Aenderung an `kontakte` neu aus der Datenbank,
 * und das Nachschlagen weiter unten aendert bei jedem Treffer selbst einen
 * Kontakt. Die Seite lud sich damit im Sekundentakt neu.
 */
async function ladeFremdeStandortDaten(isVP: boolean) {
  // VPs bekommen weder Partner-Rollen noch Dienstleister, nur die eigenen Kunden.
  if (isVP) return { roles: [], profiles: [], settings: [], dienstleister: [], objekte: [] };
  const [rolesRes, dienstRes, objekteRes] = await Promise.all([
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("dienstleister").select("id, name, kategorie, adresse, meta").not("adresse", "is", null),
    supabase.from("objekte").select("id, titel, adresse, plz, ort, status, meta"),
  ]);
  const roles = ((rolesRes.data || []) as { user_id: string; role: string }[])
    .filter((r) => !EXCLUDED_PARTNER_ROLES.has(r.role));
  const userIds: string[] = [...new Set(roles.map((r) => r.user_id))];
  const [{ data: profiles }, { data: settings }] = userIds.length > 0
    ? await Promise.all([
        supabase.from("profiles").select("id, name").in("id", userIds),
        supabase.from("user_settings").select("user_id, einstellungen").in("user_id", userIds),
      ])
    : [{ data: [] }, { data: [] }];
  return {
    roles,
    profiles: (profiles || []) as { id: string; name: string | null }[],
    settings: (settings || []) as { user_id: string; einstellungen: unknown }[],
    dienstleister: (dienstRes.data || []) as any[],
    objekte: (objekteRes.data || []) as any[],
  };
}

/** Beschriftung im Hinweis eines Kreises, etwa "3 Kunden". */
const GRUPPEN_BEZEICHNUNGEN: Record<string, string> = Object.fromEntries(
  FILTER_CONFIG.map(f => [f.typ, f.label]),
);

const Marketing = () => {
  const { user } = useUser();
  const isVP = user.role === "vertriebspartner";
  /*
   * Kundenpunkte nur fuer Rollen, die Kunden ohnehin sehen duerfen, nach der
   * aktiven Rolle. Die Marketingseite ist auch fuer HR frei, HR hat aber keine
   * Kundenseiten. Traegt eine Person neben HR eine Rolle mit Kundenzugriff,
   * liefert die Datenbank ihr die Kontakte trotzdem; ohne diese Pruefung
   * stuenden dann Kundennamen auf der Karte.
   */
  const kundenSichtbar = isUrlAllowedForRole(
    "/kunden", user.role, (user as any).customPermissions, (user as any).vpStufeId,
  );
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [loading, setLoading] = useState(true);

  // Kontakte und Investments (dort steht die Selbstauskunft mit der Anschrift).
  const kontakteVersion = useLiveVersion(["kontakte", "investments"]);
  const fremdeDaten = useRef<{ isVP: boolean; daten: ReturnType<typeof ladeFremdeStandortDaten> } | null>(null);

  // Wie viele Standorte noch geokodiert werden müssen. Ehrlicher als ein
  // Ladebalken, der behauptet, es wäre gleich fertig.
  const [offeneStandorte, setOffeneStandorte] = useState(0);
  // Adressen, zu denen sich dauerhaft keine Koordinaten finden lassen. Die
  // werden nicht mehr angefragt, sondern ausgewiesen: dahinter stecken
  // unvollstaendig gepflegte Adressen.
  const [ohneKoordinaten, setOhneKoordinaten] = useState(0);
  // Schreibvorgaenge, die nicht durchgingen. Frueher fielen die unter den Tisch.
  const [nichtGespeichert, setNichtGespeichert] = useState(0);

  // Load real users from DB
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Kein setLoading(true) beim erneuten Durchlauf: Die bekannten Punkte
      // bleiben stehen, bis der neue Stand da ist.
      setNichtGespeichert(0);

      /**
       * Standorte werden gesammelt und in einem Rutsch gesetzt.
       *
       * Vorher rief jeder einzelne Punkt setStandorte auf. Bei einigen hundert
       * Kontakten bedeutete das genauso viele Renderdurchläufe, und die Karte
       * hat sich sichtbar Punkt für Punkt aufgebaut. Außerdem wurde die Liste
       * zu Beginn geleert, wodurch selbst bereits bekannte Punkte kurz
       * verschwanden.
       */
      const gesammelt: Standort[] = [];
      const gesehen = new Set<string>();
      const sammle = (s: Standort) => {
        const schluessel = `${s.typ}:${s.id}`;
        if (gesehen.has(schluessel)) return;
        gesehen.add(schluessel);
        gesammelt.push(s);
      };

      /** Adressen, zu denen bereits erfolglos gesucht wurde. */
      let unauffindbar = 0;

      /** Adressen ohne bekannte Koordinaten, werden im Hintergrund nachgeladen. */
      const offen: {
        addr: string;
        build: (c: { lat: number; lng: number }) => Standort;
        /** Vermerkt das Ergebnis am Datensatz, damit es einmalig bleibt. */
        merke?: (patch: GeoMeta) => Promise<boolean>;
      }[] = [];

      if (fremdeDaten.current?.isVP !== isVP) {
        fremdeDaten.current = { isVP, daten: ladeFremdeStandortDaten(isVP) };
      }
      const { roles, profiles, settings, dienstleister, objekte } = await fremdeDaten.current.daten;
      if (cancelled) return;

      // 1. Partner (alle internen Rollen außer Kunde/Tippgeber)
      if (roles.length > 0) {
        const profileMap = new Map((profiles || []).map(p => [p.id, p]));
        const settingsMap = new Map((settings || []).map(s => [s.user_id, s.einstellungen as any]));
        const seenUsers = new Set<string>();
        for (const r of roles) {
          if (seenUsers.has(r.user_id)) continue;
          seenUsers.add(r.user_id);
          const profile = profileMap.get(r.user_id);
          const einstell = settingsMap.get(r.user_id);
          if (!profile) continue;
          const profil = einstell?.profil || {};
          const gew = einstell?.gewerbedaten || {};
          const ort = profil.ort || gew.ort || einstell?.ort || einstell?.stadt || "";
          const plz = profil.plz || gew.plz || einstell?.plz || "";
          const strasse = [profil.strasse || gew.strasse || einstell?.strasse || "", profil.hausnummer || gew.hausnummer || ""]
            .filter(Boolean)
            .join(" ")
            .trim();
          const lat = parseFloat(einstell?.lat);
          const lng = parseFloat(einstell?.lng);
          if (!ort && isNaN(lat)) continue;
          const typ: StandortTyp = "partner";
          const roleLabel = r.role.charAt(0).toUpperCase() + r.role.slice(1);
          const details = `${roleLabel} · ${ort || ""}`;
          const name = profile.name || "–";
          if (!isNaN(lat) && !isNaN(lng)) {
            sammle({ id: r.user_id, name, lat, lng, typ, details });
          } else {
            const addr = [strasse, plz, ort].filter(Boolean).join(" ");
            const cached = getCachedCoords(addr);
            if (cached) sammle({ id: r.user_id, name, lat: cached.lat, lng: cached.lng, typ, details });
            else if (cached === null) unauffindbar++;
            // Die Einstellungen fremder Nutzer darf diese Seite nicht schreiben,
            // deshalb gibt es hier keinen Vermerk am Datensatz.
            else offen.push({ addr, build: c => ({ id: r.user_id, name, lat: c.lat, lng: c.lng, typ, details }) });
          }
        }
      }

      // 2. Kunden
      //
      // Achtung: `getKontakte()` liefert KundeData, und `dbRowToKunde` uebertraegt
      // die Spalte `meta` NICHT in dieses Objekt. Ein Zugriff auf `k.meta` ist
      // deshalb immer leer, und die einmal gespeicherten Koordinaten waren nie
      // wieder zu sehen. Die Rohzeile aus dem Zwischenspeicher hat sie.
      const kontaktMeta = new Map<string, GeoMeta>();
      for (const zeile of cacheGet<{ id: string; meta?: GeoMeta }>("kontakte")) {
        if (zeile?.id) kontaktMeta.set(zeile.id, zeile.meta || {});
      }
      // Investments je Kunde, fuer die Anschrift aus der Selbstauskunft.
      const investmentsJeKunde = new Map<string, InvestmentZeileMitSa[]>();
      for (const inv of cacheGet<InvestmentZeileMitSa & { kunde_id?: string | null }>("investments")) {
        if (!inv?.kunde_id) continue;
        const liste = investmentsJeKunde.get(inv.kunde_id);
        if (liste) liste.push(inv); else investmentsJeKunde.set(inv.kunde_id, [inv]);
      }
      const kontakte = !kundenSichtbar ? [] : getKontakte().filter(k => {
        if (k.geloescht || k.archiviert) return false;
        if (isVP && !kontaktBelongsToUser(k, { userName: user.name, userId: (user as any).id })) return false;
        return true;
      });
      for (const k of kontakte) {
        const anschrift = kundenAnschrift(k, investmentsJeKunde.get(k.id) || []);
        if (!anschrift) continue;
        const meta = kontaktMeta.get(k.id) || ((k as any).meta as GeoMeta) || {};
        const lat = parseFloat(String(meta.lat));
        const lng = parseFloat(String(meta.lng));
        const name = `${k.vorname} ${k.nachname}`;
        const details = `Kapitalanlage · ${anschrift.ort || anschrift.plz}`;
        if (!isNaN(lat) && !isNaN(lng)) {
          sammle({ id: k.id, name, lat, lng, typ: "kunde", details });
        } else {
          const addr = anschriftZeile(anschrift);
          if (schonErfolglos(meta, addr)) { unauffindbar++; continue; }
          const cached = getCachedCoords(addr);
          if (cached) sammle({ id: k.id, name, lat: cached.lat, lng: cached.lng, typ: "kunde", details });
          else if (cached === null) unauffindbar++;
          else {
            offen.push({
              addr,
              build: c => ({ id: k.id, name, lat: c.lat, lng: c.lng, typ: "kunde", details }),
              merke: (patch) => merkeGeoDaten("kontakte", k.id, patch),
            });
          }
        }
      }

      // 3. Dienstleister (als Partner)
      if (dienstleister.length > 0) {
        for (const d of dienstleister) {
          if (!d.adresse?.trim()) continue;
          const meta = ((d.meta as GeoMeta) || {});
          const lat = parseFloat(String(meta.lat));
          const lng = parseFloat(String(meta.lng));
          const details = `${d.kategorie || "Partner"} · ${d.adresse}`;
          if (!isNaN(lat) && !isNaN(lng)) {
            sammle({ id: d.id, name: d.name, lat, lng, typ: "partner", details });
          } else if (schonErfolglos(meta, d.adresse)) {
            unauffindbar++;
          } else {
            const cached = getCachedCoords(d.adresse);
            if (cached) sammle({ id: d.id, name: d.name, lat: cached.lat, lng: cached.lng, typ: "partner", details });
            else if (cached === null) unauffindbar++;
            else {
              offen.push({
                addr: d.adresse,
                build: c => ({ id: d.id, name: d.name, lat: c.lat, lng: c.lng, typ: "partner", details }),
                merke: (patch) => merkeGeoDaten("dienstleister", d.id, patch, user.role),
              });
            }
          }
        }
      }

      // 4. Objekte (nur interne Rollen)
      if (objekte.length > 0) {
        for (const o of objekte) {
          const ort = o.ort || "";
          const plz = o.plz || "";
          const adresse = o.adresse || "";
          if (!ort && !adresse) continue;
          const meta = ((o.meta as GeoMeta) || {});
          const lat = parseFloat(String(meta.lat));
          const lng = parseFloat(String(meta.lng));
          const label = o.titel || "Objekt";
          const details = `Objekt · ${[adresse, plz, ort].filter(Boolean).join(" ")}`;
          if (!isNaN(lat) && !isNaN(lng)) {
            sammle({ id: `obj-${o.id}`, name: label, lat, lng, typ: "objekt", details });
          } else {
            const addr = [adresse, plz, ort].filter(Boolean).join(" ");
            if (schonErfolglos(meta, addr)) { unauffindbar++; continue; }
            const cached = getCachedCoords(addr);
            if (cached) sammle({ id: `obj-${o.id}`, name: label, lat: cached.lat, lng: cached.lng, typ: "objekt", details });
            else if (cached === null) unauffindbar++;
            else {
              offen.push({
                addr,
                build: c => ({ id: `obj-${o.id}`, name: label, lat: c.lat, lng: c.lng, typ: "objekt", details }),
                merke: (patch) => merkeGeoDaten("objekte", o.id, patch, user.role),
              });
            }
          }
        }
      }

      if (cancelled) return;
      // Alles, was ohne Nachfragen bekannt ist, erscheint sofort und gemeinsam.
      setStandorte(gesammelt);
      setOffeneStandorte(offen.length);
      setOhneKoordinaten(unauffindbar);
      setLoading(false);

      // Der Rest wird im Hintergrund ermittelt und angehängt. Das Ergebnis wird
      // am Datensatz vermerkt, damit dieselbe Adresse nicht auf jedem Gerät und
      // bei jedem Aufruf erneut nachgeschlagen wird. Auch ein erfolgloser
      // Nachschlag wird vermerkt, sonst kostet eine unvollstaendige Adresse
      // dauerhaft bei jedem Aufruf die volle Wartezeit.
      for (const { addr, build, merke } of offen) {
        if (cancelled) return;
        const coords = await geocodeAddress(addr);
        if (cancelled) return;
        setOffeneStandorte((n) => Math.max(0, n - 1));
        if (coords) {
          const standort = build(coords);
          setStandorte(prev =>
            prev.some(p => p.id === standort.id && p.typ === standort.typ) ? prev : [...prev, standort],
          );
          if (merke) {
            const ok = await merke({
              lat: coords.lat,
              lng: coords.lng,
              geoAdresse: addr,
              geoFehlgeschlagenAm: null,
            });
            if (!ok && !cancelled) setNichtGespeichert(n => n + 1);
          }
        } else {
          setOhneKoordinaten(n => n + 1);
          if (merke) {
            const ok = await merke({ geoAdresse: addr, geoFehlgeschlagenAm: new Date().toISOString() });
            if (!ok && !cancelled) setNichtGespeichert(n => n + 1);
          }
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [kontakteVersion, isVP, kundenSichtbar, user.name]);

  // VP sieht nur eigene Kunden
  const availableFilters = (isVP
    ? FILTER_CONFIG.filter(f => f.typ === "kunde")
    : FILTER_CONFIG
  ).filter(f => kundenSichtbar || f.typ !== "kunde");

  const [activeFilters, setActiveFilters] = useState<Set<StandortTyp>>(
    new Set(availableFilters.map(f => f.typ))
  );

  const toggleFilter = (typ: StandortTyp) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(typ)) next.delete(typ);
      else next.add(typ);
      return next;
    });
  };

  const filteredStandorte = useMemo(() => {
    let filtered = standorte.filter(s => activeFilters.has(s.typ));
    if (isVP) {
      filtered = filtered.filter(s => s.typ === "kunde");
    }
    return filtered;
  }, [activeFilters, isVP, standorte]);

  return (
    <DashboardLayout>
      {/* Die Seite fuellt den sichtbaren Bereich aus. Die Untergrenze greift nur
          auf sehr flachen Fenstern, dann scrollt der Inhaltsbereich. */}
      <div className="h-full min-h-[520px] flex flex-col gap-4">
        <PageHeader
          title="Marketing"
          subtitle={isVP ? "Deine eigenen Kunden auf der Karte" : "Deutschland-Karte mit Partnern & Kunden"}
        />

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left sidebar filters */}
          <div className="w-64 flex-shrink-0 space-y-3 overflow-y-auto">
            {availableFilters.map(filter => {
              const count = filteredStandorte.filter(s => s.typ === filter.typ).length;
              return (
                <Card key={filter.typ} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${filter.color}`} />
                      <span className="text-sm font-semibold">{filter.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{count}</Badge>
                      <Checkbox
                        checked={activeFilters.has(filter.typ)}
                        onCheckedChange={() => toggleFilter(filter.typ)}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}

            <Card className="p-3">
              <h3 className="font-semibold text-sm mb-2">Legende</h3>
              <div className="space-y-1.5">
                {availableFilters.map(f => (
                  <div key={f.typ} className="flex items-center gap-2 text-xs">
                    <span className={`w-2.5 h-2.5 rounded-full ${f.color}`} />
                    <span>{f.label}</span>
                  </div>
                ))}
              </div>
            </Card>

            {isVP && (
              <Card className="p-3 bg-accent/30 border-accent/50">
                <p className="text-xs text-muted-foreground">
                  Du siehst nur deine eigenen Kunden auf der Karte.
                </p>
              </Card>
            )}

          </div>

          {/* Map area */}
          <Card className="flex-1 min-w-0 min-h-0 p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Standorte Deutschland</span>
              <div className="ml-auto flex items-center gap-2">
                {ohneKoordinaten > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {ohneKoordinaten} ohne Koordinaten, Adresse unvollständig
                  </span>
                )}
                {nichtGespeichert > 0 && (
                  <span className="text-[10px] text-destructive">
                    {nichtGespeichert} nicht gespeichert
                  </span>
                )}
                <Badge variant="secondary" className="text-xs">
                  {loading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : offeneStandorte > 0 ? (
                    <span className="flex items-center gap-1.5">
                      {filteredStandorte.length} Einträge
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-[10px] font-normal opacity-70">
                        {offeneStandorte} werden ermittelt
                      </span>
                    </span>
                  ) : (
                    `${filteredStandorte.length} Einträge`
                  )}
                </Badge>
              </div>
            </div>
            <DeutschlandkarteBasis
              punkte={filteredStandorte}
              farben={markerColorMap}
              bezeichnungen={GRUPPEN_BEZEICHNUNGEN}
              className="w-full flex-1 min-h-0 rounded-lg overflow-hidden border"
            />
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Marketing;
