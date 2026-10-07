import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { cacheGet } from "@/lib/dataCache";
import { getObjektById, type ObjektData } from "@/lib/objekteStore";
import { hatGeschuetzteUnterlagen, objektUnterlagenBefristen, resolveUnterlagenUrl } from "@/lib/storage";
import { normName, useMarktdaten } from "@/lib/marktdatenStore";
import { berufsbezeichnung } from "@/lib/berufsbezeichnung";
import { vertriebspartnerFuerExpose, type ProfilZeile, type RollenZeile } from "@/lib/exposeAnsprechpartner";
import { kundeAusCache, type ExposeKunde } from "@/lib/objektExposeStore";
import { useVertretungen } from "@/hooks/useVertretungen";
import { isTeamWideKontaktRole } from "@/lib/kontaktOwnership";
import { istAblageZeiger, type ExposeGrundriss, type ExposeInhalt, type Person } from "@/lib/exposeInhalt";

/**
 * Das Objekt für die interne Exposé-Seite, mit befristeten Adressen der
 * Unterlagen.
 *
 * Unterlagen liegen geschuetzt und haben keine dauerhafte Adresse mehr. Das
 * Exposé braucht die Adresse des Grundrisses schon beim Aufbau der Seite,
 * weil die PDF dort in Bilder umgewandelt wird. Ein Klick kaeme zu spaet.
 * Haengt am Objekt keine geschuetzte Unterlage, bleibt alles synchron.
 *
 * Gemeinsam für das Exposé einer Einheit und das des ganzen Objekts.
 */
export function useExposeObjekt(id: string): {
  /** Das Objekt aus dem Zwischenspeicher, ohne aufgelöste Adressen. */
  objekt: ObjektData | undefined;
  /** Dasselbe mit befristeten Adressen; null, solange sie noch laden. */
  objektMitAdressen: ObjektData | null | undefined;
  bereit: boolean;
} {
  const liveVersion = useLiveVersion(["objekte", "wohnungen", "objekt_bilder", "wohnungs_bilder", "objekt_dokumente", "wohnungs_dokumente", "profiles"]);
  const bereit = useCacheReady(["objekte", "wohnungen", "kontakte", "investments"]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const objekt = useMemo(() => getObjektById(id), [id, liveVersion]);

  const brauchtAdressen = !!objekt && hatGeschuetzteUnterlagen(objekt);
  const [aufgeloest, setAufgeloest] = useState<ObjektData | null>(null);
  // Beim Wechsel auf ein anderes Objekt darf der alte Stand nicht kurz
  // stehen bleiben, sonst zeigt das Exposé fremde Unterlagen.
  useEffect(() => { setAufgeloest(null); }, [id]);
  useEffect(() => {
    let aktiv = true;
    if (!objekt || !brauchtAdressen) return;
    void objektUnterlagenBefristen(objekt).then((o) => { if (aktiv) setAufgeloest(o); });
    return () => { aktiv = false; };
  }, [objekt, brauchtAdressen]);

  return { objekt, objektMitAdressen: objekt ? (brauchtAdressen ? aufgeloest : objekt) : undefined, bereit };
}

/**
 * Die Grundrisse im Exposé mit Adressen, die der Browser öffnen kann.
 *
 * `objektUnterlagenBefristen` löst nur Zeiger auf `/objekt-dokument/` auf.
 * Die Kopien aus Investagon (`/investagon-dokument/…`) blieben Zeiger, und
 * genau auf sie zeigen die meisten Grundrisse. Das Exposé lud dann ein Bild
 * von einer Adresse, die es nicht gibt. Alle Unterlagen eines Hauses
 * aufzulösen, wären bei fünfzig Einheiten Hunderte Anfragen; hier werden nur
 * die höchstens drei gewählten Pläne aufgelöst.
 *
 * Solange die Adressen laden, steht kein Plan da, danach der Abschnitt. Ein
 * Plan ohne Adresse fällt weg. Seite und PDF bekommen dieselbe Fassung.
 */
export function useGrundrissAdressen(inhalt: ExposeInhalt): ExposeInhalt {
  const plaene = inhalt.grundriss.dokumente;
  const mitZeiger = plaene.some((p) => istAblageZeiger(p.url));
  const schluessel = plaene.map((p) => p.url).join("|");
  const [aufgeloest, setAufgeloest] = useState<{ schluessel: string; dokumente: ExposeGrundriss[] } | null>(null);
  useEffect(() => {
    if (!mitZeiger) return;
    let aktiv = true;
    void Promise.all(plaene.map(async (p) => (istAblageZeiger(p.url) ? { ...p, url: (await resolveUnterlagenUrl(p.url)) ?? "" } : p)))
      .then((liste) => { if (aktiv) setAufgeloest({ schluessel, dokumente: liste.filter((p) => /^https?:\/\//i.test(p.url)) }); })
      .catch(() => { if (aktiv) setAufgeloest({ schluessel, dokumente: [] }); });
    return () => { aktiv = false; };
    // `schluessel` fasst die Adressen der Pläne zusammen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel, mitZeiger]);
  return useMemo(() => {
    if (!mitZeiger) return inhalt;
    const dokumente = aufgeloest?.schluessel === schluessel ? aufgeloest.dokumente : [];
    return { ...inhalt, grundriss: { dokumente } };
  }, [inhalt, mitZeiger, aufgeloest, schluessel]);
}

/**
 * Der Vertriebspartner, der im Exposé als Ansprechpartner steht: mit Kunde
 * dessen zuständiger Partner, sonst der angemeldete Nutzer. Regel in
 * `exposeAnsprechpartner.ts`.
 */
export function useExposeAnsprechpartner(kunde: ExposeKunde | null): Person {
  const { user, authUser } = useUser();
  const profile = cacheGet<ProfilZeile>("profiles");
  const rollen = cacheGet<RollenZeile>("user_roles");
  const eigenesProfil = authUser?.id ? profile.find((p) => p.id === authUser.id) : undefined;
  const eigenePerson: Person = {
    name: user.name,
    // Im Exposé liest ein Kunde mit: Berufsbezeichnung statt Rollenkennung.
    rolle: berufsbezeichnung(user.role) || "Dein Ansprechpartner",
    email: user.email || eigenesProfil?.email || undefined,
    telefon: eigenesProfil?.telefon || undefined,
    buchungslink: eigenesProfil?.buchungslink || undefined,
    avatarUrl: eigenesProfil?.avatar_url || undefined,
  };
  return vertriebspartnerFuerExpose({ kundeZustaendigId: kunde?.zustaendigId, eigeneId: authUser?.id, eigenePerson, profile, rollen });
}

/**
 * Der Kunde aus `?kunde=` für das interne Exposé.
 *
 * Seit dem 05.10.2026 öffnen auch Vertriebspartner das Exposé. Nach aktiver
 * Rolle gilt wie in der Kontaktliste: Wer keine teamweite Sicht hat, bekommt
 * den Kundenbezug nur für eigene und vertretene Kunden. Für jeden anderen
 * Kunden zeigt die Seite die neutrale Vorschau ohne Kunden, ohne Namen und
 * ohne fremden Partner. Die Zeilenrechte auf `kontakte` schützen die Daten
 * selbst, das hier ist die Anzeige dazu.
 *
 * `bereit` und `objekt` lassen den Kunden neu suchen, sobald der
 * Zwischenspeicher nachgeladen hat.
 */
export function useExposeKunde(kundeId: string | null, bereit: boolean, objekt: unknown): ExposeKunde | null {
  const { user, authUser } = useUser();
  const eigeneId = authUser?.id ?? null;
  const vertretungFuer = useVertretungen(eigeneId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kunde = useMemo(() => kundeAusCache(kundeId), [kundeId, bereit, objekt]);
  if (!kunde || isTeamWideKontaktRole(user.role)) return kunde;
  const zustaendig = kunde.zustaendigId;
  return zustaendig && (zustaendig === eigeneId || vertretungFuer.has(zustaendig)) ? kunde : null;
}

/** Standort und Arbeitgeber aus der Standortdatenbank, falls der Ort dort geführt wird. */
export function useExposeStandort(ort: string | undefined) {
  const marktdaten = useMarktdaten();
  return useMemo(() => {
    const n = normName(ort || "");
    const standort = n ? marktdaten.standorte.find((s) => normName(s.name) === n) : undefined;
    return { standort, standortArbeitgeber: standort ? marktdaten.arbeitgeber.get(standort.id) : undefined };
  }, [marktdaten, ort]);
}
