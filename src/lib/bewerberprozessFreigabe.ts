import { CHRISTIAN_PEETZ_ID } from "./leadPool";

/**
 * Die benannte Freigabeliste rund um den Bewerberprozess.
 *
 * Wichtig seit dem 21.09.2026: Für den **Bewerberprozess selbst öffnet diese
 * Liste nichts mehr**. Dort entscheidet allein die Rolle, nämlich admin,
 * inhaber und hr, siehe `BEWERBERPROZESS_ROLLEN` und `darfBewerberprozess`.
 * Christian hat das an diesem Tag so entschieden. Was bleibt, ist der
 * Videocall-Bereich, und der seit dem 27.09.2026 ausschließlich für Christian
 * Peetz in der aktiven Rolle admin, siehe `darfVideocallBereich`. Sein Eintrag
 * ist der einzige mit "videocall"; die Liste schränkt die Rolle admin damit
 * nur ein, sie öffnet nichts für eine andere Rolle.
 *
 * Die Kennungen und Adressen hier sind die kanonische Liste, an der Christian
 * erkannt wird (auch `neuImCrmZugang.ts` liest sie).
 *
 * Maßgeblich bleibt zusätzlich `sidebarPermissions.ts`: Dort wird dieselbe Prüfung für
 * den Routen-Schutz benutzt, sonst wäre der Eintrag in der Seitenleiste zwar
 * weg, die Adresse aber trotzdem erreichbar.
 */

/**
 * Die Bereiche, die an dieser Liste hängen.
 *
 * `"bewerberprozess"` steht nur noch als Begriff da und öffnet nichts mehr,
 * siehe `darfBewerberprozess`. Er bleibt im Typ, damit ein alter Eintrag in
 * einer Fassung aus der Versionsgeschichte nicht stumm zur Zeichenkette wird.
 */
export type BewerberprozessBereich = "bewerberprozess" | "videocall";

export type BewerberprozessFreigabe = {
  /** Nur zum Nachlesen, wer gemeint ist. */
  name: string;
  /** Nutzer-Kennungen aus `auth.users`. Das sichere Merkmal. */
  userIds: readonly string[];
  /** Bekannte Mailadressen. Hilfsmerkmal, falls die Kennung nicht vorliegt. */
  emails: readonly string[];
  /** Welche Bereiche diese Person sieht. */
  bereiche: readonly BewerberprozessBereich[];
};

export const BEWERBERPROZESS_FREIGABEN: readonly BewerberprozessFreigabe[] = [
  {
    name: "Christian Peetz",
    /*
     * Beide Kennungen mit Absicht. Im Projekt stehen zwei verschiedene für
     * dieselbe Person: `CHRISTIAN_PEETZ_ID` in `leadPool.ts` und eine zweite,
     * fest eingetragene in `KundenDetail.tsx`. Welche die des angemeldeten
     * Kontos ist, lässt sich aus dem Quelltext nicht entscheiden. Stünde hier
     * nur die falsche, fehlte der Punkt in der Seitenleiste, und der Bereich
     * wäre nicht erreichbar. Beide einzutragen kostet nichts, es ist dieselbe
     * Person.
     */
    userIds: [CHRISTIAN_PEETZ_ID, "e81f0a13-0578-4456-9960-07be014d869c"],
    /*
     * Ebenso alle Adressen, die im Projekt für ihn vorkommen. Verglichen wird
     * ohne Rücksicht auf Groß- und Kleinschreibung, deshalb genügt je eine
     * Schreibweise.
     */
    emails: [
      "c.peetz@osimmobilien.netlify.app",
      "c.peetz@moreimmo.de",
      "c.peetz@imondu.de",
      "info@peetz-ventures.de",
      "christianpeetz.v.a@me.com",
      "christianpeetz.v.a@icloud.com",
    ],
    /*
     * Seit dem 27.09.2026 der einzige Eintrag mit "videocall" (Entscheidung
     * von Christian). Er öffnet den Bereich nur zusammen mit der aktiven
     * Rolle admin, siehe `darfVideocallBereich`. Dieselben Kennungen prüft die
     * Datenbank in `darf_videocall` (Migration
     * 20260927120000_videocall_nur_geschaeftsfuehrer.sql).
     */
    bereiche: ["videocall"],
  },
  {
    name: "Sarah Kaiser-Thom",
    /*
     * Sie führt die persönlichen Gespräche. Den Bewerberprozess sieht sie über
     * ihre Rolle `hr`, und nur darüber. Hier stand sie wegen des
     * Videocall-Bereichs, weil sie die Moderation führt; auch den öffnet
     * seit dem 27.09.2026 niemand außer Christian Peetz als admin.
     */
    userIds: [],
    /*
     * Beide Schreibweisen, und das ist kein Schoenheitsfehler: Bis zum
     * 10.09.2026 stand hier nur `s.kaiser-thom@osimmobilien.netlify.app`. Ihr Konto lautet
     * aber `sarah.kaiser-thom@osimmobilien.netlify.app`. Der Vergleich unten ist exakt, nur
     * kleingeschrieben, also hat die Freigabe nie gegriffen.
     *
     * Die Folge war nicht offensichtlich: Ohne den Videocall-Bereich sieht sie
     * ihren Buchungskalender nicht, kann dort keinen Wochenplan eintragen, und
     * ohne Wochenplan findet `bewerber_termin_gastgeber()` keinen Gastgeber.
     * Dann zeigt die Buchungsseite ihren Abschlusstext, nichts sieht kaputt
     * aus, und **kein Bewerber kann einen Termin buchen**.
     *
     * Wer hier eine Zeile aendert, prueft die Adresse gegen das echte Konto,
     * nicht gegen die Schreibweise, die im Haus ueblich scheint.
     */
    emails: ["sarah.kaiser-thom@osimmobilien.netlify.app", "s.kaiser-thom@osimmobilien.netlify.app"],
    /*
     * Leer seit dem 27.09.2026. Den Videocall-Bereich sieht seitdem nur noch
     * Christian Peetz in der Rolle admin, auch die Rolle hr öffnet ihn nicht.
     */
    bereiche: [],
  },
  {
    name: "Christian Kurz",
    /*
     * Geschäftsleitung, führt die Gespräche zum zweiten Produkt. Die Adressen
     * sind nicht im Projekt hinterlegt, deshalb beide gängigen Schreibweisen
     * des Hauses. Trifft keine zu, ergänzt sie der nächste Durchgang.
     */
    userIds: [],
    emails: ["c.kurz@osimmobilien.netlify.app", "christian.kurz@osimmobilien.netlify.app"],
    /* Leer seit dem 27.09.2026, Videocall nur noch für Christian Peetz als admin. */
    bereiche: [],
  },
];

/** Die Adresse des neuen Bereichs. */
export const BEWERBERPROZESS_ROUTE = "/bewerberprozess";

/**
 * Die abgeloeste Adresse des Bewerbungsmanagements.
 *
 * Sie leitet in `App.tsx` auf den Bewerberprozess weiter und gehoert deshalb
 * rechtlich zu ihm. Ohne diesen Eintrag sperrt `isUrlAllowedForRole` die alte
 * Adresse als unbekannt, und die Weiterleitung kaeme nie zum Zug: Wer einem
 * Link aus einer laengst verschickten Mail folgt, saehe eine Sperrmeldung
 * statt seines Bewerbers.
 */
export const BEWERBUNGSMANAGEMENT_ROUTE_ALT = "/bewerbungsmanagement";

/**
 * Die Routen des Videocall-Bereichs, die an dieser Liste hängen.
 *
 * Seit dem 27.09.2026 sperrt `istRouteGesperrt` sie für alle außer Christian
 * Peetz in der Rolle admin, siehe `darfVideocallBereich`. Keine Rolle, keine
 * individuelle Berechtigung und kein Eintrag in `role_permissions` öffnet sie.
 */
export const VIDEOCALL_ROUTEN: readonly string[] = [
  "/videocall",
  "/videoraum",
];

/**
 * Die Rollen, die den Bewerberprozess sehen. Seit dem 21.09.2026 ist das eine
 * Positivliste: Wer keine dieser Rollen trägt, kommt nicht hinein, auch
 * nicht über einen namentlichen Eintrag, über `role_permissions` oder über
 * eine eigene Berechtigung.
 *
 * Seit dem 27.09.2026 sind es vier: hr, admin, inhaber und backoffice
 * (Entscheidung von Christian). Dieselbe Liste erzwingt die Datenbank in
 * `public.darf_bewerberbereich` (Migration
 * 20260927060000_bewerbungen_nur_bewerberbereich.sql) und stehen die Edge
 * Functions in `supabase/functions/_shared/bewerber-rollen.ts`. Alle anderen
 * internen Rollen, auch Vertriebspartner und Vertriebsleitung, sehen keine
 * Bewerbung mehr.
 *
 * Vorgeschichte: Bis zum 07.09.2026 hing der Bereich allein an der
 * Freigabeliste, danach galten Liste und Rolle nebeneinander. Damit stach ein
 * Name die Rolle, und wer zum Prüfen auf eine andere Rolle umschaltete, sah
 * den Bereich trotzdem. Christian hat am 21.09.2026 entschieden, dass allein
 * die Rolle zählt.
 *
 * Der Videocall-Bereich bleibt bewusst außen vor, siehe
 * `darfVideocallBereich`; „hr" öffnet ihn nicht.
 */
export const BEWERBERPROZESS_ROLLEN: readonly string[] = ["hr", "admin", "inhaber", "backoffice"];

/** Wer ist gerade angemeldet? Dieselbe Form wie `NutzerIdentitaet`. */
export type FreigabeIdentitaet = {
  email?: string | null;
  userId?: string | null;
  /**
   * Die aktive Rolle (`user.role`). Der Bewerberprozess entscheidet allein
   * nach ihr, der Videocall nach ihr und der Person zusammen.
   */
  rolle?: string | null;
};

function passt(eintrag: BewerberprozessFreigabe, identitaet?: FreigabeIdentitaet): boolean {
  const kennung = (identitaet?.userId || "").trim();
  if (kennung && eintrag.userIds.includes(kennung)) return true;
  const adresse = (identitaet?.email || "").trim().toLowerCase();
  return !!adresse && eintrag.emails.some((e) => e.toLowerCase() === adresse);
}

/** Ist diese Person für den genannten Bereich freigegeben? */
export function hatBewerberprozessFreigabe(
  bereich: BewerberprozessBereich,
  identitaet?: FreigabeIdentitaet,
): boolean {
  return BEWERBERPROZESS_FREIGABEN.some(
    (e) => e.bereiche.includes(bereich) && passt(e, identitaet),
  );
}

/** Trägt dieses Konto eine Rolle, die den Bewerberprozess sehen darf? */
export function hatBewerberprozessRolle(rolle?: string | null): boolean {
  const wert = (rolle || "").trim().toLowerCase();
  return !!wert && BEWERBERPROZESS_ROLLEN.includes(wert);
}

/**
 * Sieht diese Person den neuen Bewerberprozess?
 *
 * Seit dem 21.09.2026 entscheidet allein die Rolle, seit dem 27.09.2026 sind
 * es admin, inhaber, hr und backoffice, sonst niemand. Entschieden von
 * Christian.
 *
 * Bis dahin gab es einen zweiten Weg, den namentlichen Eintrag in der
 * Freigabeliste. Er hat die Rolle gestochen, und das war der Fehler: Wer in
 * der Liste stand und zum Pruefen auf eine andere Rolle umschaltete, behielt
 * den Eintrag in der Seitenleiste und den Zugang zur Adresse. Deshalb steht in
 * `bereiche` bei keiner Person mehr `"bewerberprozess"`, sonst stuende dort
 * eine Angabe ohne Wirkung, und die naechste Person laese daraus eine
 * Berechtigung heraus, die es nicht gibt.
 *
 * Fuer den Videocall-Bereich gilt eine eigene Regel, siehe
 * `darfVideocallBereich`.
 */
export function darfBewerberprozess(identitaet?: FreigabeIdentitaet): boolean {
  return hatBewerberprozessRolle(identitaet?.rolle);
}

/**
 * Darf dieses Konto den Videocall-Bereich sehen und nutzen?
 *
 * Seit dem 27.09.2026 (Entscheidung von Christian) genau dann, wenn es
 * Christian Peetz ist UND die aktive Rolle admin lautet. Niemand sonst, auch
 * nicht Inhaber, hr oder früher einzeln freigeschaltete Personen. Wechselt
 * er in eine andere Rolle, verschwindet der Bereich.
 *
 * Diese eine Regel gilt überall: Seitenleiste und Routenschutz
 * (`istRouteGesperrt`), `useVideocallFreigabe` und damit alle Einstiege wie
 * das Meeting im Kundenprofil. Die Datenbank prüft in `darf_videocall`
 * dieselben Kennungen zusammen mit `has_role(…, 'admin')`, weil sie die aktive
 * Rolle nicht kennt.
 */
export function darfVideocallBereich(identitaet?: FreigabeIdentitaet): boolean {
  return identitaet?.rolle === "admin" && hatBewerberprozessFreigabe("videocall", identitaet);
}

/**
 * Gehört die Adresse zum Bewerberprozess?
 *
 * Die abgeloeste Adresse des Bewerbungsmanagements zaehlt mit, siehe
 * `BEWERBUNGSMANAGEMENT_ROUTE_ALT`. Damit gilt fuer sie dieselbe Regel wie
 * fuer die neue: Wer den Bereich sehen darf, darf auch dem alten Link folgen,
 * wer nicht, wird an beiden Adressen gleich behandelt.
 */
export function istBewerberprozessRoute(cleanUrl: string): boolean {
  if (cleanUrl === BEWERBUNGSMANAGEMENT_ROUTE_ALT) return true;
  return cleanUrl === BEWERBERPROZESS_ROUTE || cleanUrl.startsWith(BEWERBERPROZESS_ROUTE + "/");
}

/** Gehört die Adresse zum Videocall-Bereich? */
export function istVideocallRoute(cleanUrl: string): boolean {
  return VIDEOCALL_ROUTEN.some((u) => cleanUrl === u || cleanUrl.startsWith(u + "/"));
}
