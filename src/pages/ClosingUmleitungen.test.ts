/**
 * Wächter für die beiden entfernten Closing-Seiten.
 *
 * Am 23.09.2026 sind die öffentliche Closing-Seite (/closing) und die alte
 * Closing-Präsentation (/closing-praesentation) entfernt worden. Beide
 * Adressen können noch in Mails, Notizen, Lesezeichen und offenen Tabs
 * stehen. Sie dürfen deshalb nicht ins Leere laufen, sondern leiten weiter:
 *
 *   /closing                auf /partner-werden, ohne die alten Parameter
 *   /closing-praesentation  auf /bewerberprozess
 *
 * Geprüft wird der Wortlaut von `App.tsx`, nicht ein nachgebauter Router,
 * wie in `ExpatsCalculatorZugang.test.tsx` und `routenTabellen.test.ts`.
 *
 * Dazu die Regel aus `LastRouteMemory.tsx`: Der Eintrag „/closing" wirkt als
 * Präfix und hält damit auch die beiden Fenster des Videocalls aus dem
 * Merken der letzten Seite heraus. Das soll so bleiben.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROUTEN_TABELLEN } from "@/lib/routenTabellen";
import { istVomRoutenspeicherAusgenommen } from "@/components/LastRouteMemory";

const APP_TSX = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const APP_EINZEILIG = APP_TSX.replace(/\s+/g, " ");

/** Alles, was vor dem Anmeldeschutz steht. Danach fängt `AppShell` an. */
const ANMELDESCHUTZ = "<Route element={<AppShell />}>";
const OEFFENTLICHER_TEIL = APP_TSX.split(ANMELDESCHUTZ)[0].replace(/\s+/g, " ");

/** Die eine Zeile, die eine Adresse in App.tsx trägt. */
function routenZeile(pfad: string): string {
  const treffer = APP_TSX.split("\n").filter((z) => z.includes(`path="${pfad}"`));
  expect(treffer, `genau eine Route für ${pfad}`).toHaveLength(1);
  return treffer[0].trim();
}

describe("/closing leitet auf die Partnerseite", () => {
  it("steht als Umleitung in App.tsx, ohne die alten Parameter mitzunehmen", () => {
    expect(APP_EINZEILIG).toContain(
      '<Route path="/closing" element={<Navigate to="/partner-werden" replace />} />',
    );
    // Die alte Seite las bewerberId und name aus der Adresse. Die Partnerseite
    // braucht sie nicht, deshalb reist die Query nicht mit.
    expect(routenZeile("/closing")).not.toContain("location.search");
  });

  it("bleibt ohne Anmeldung erreichbar, wie die Seite davor", () => {
    expect(APP_TSX).toContain(ANMELDESCHUTZ);
    expect(OEFFENTLICHER_TEIL).toContain('<Route path="/closing" element={<Navigate to="/partner-werden" replace />} />');
  });

  it("das Ziel gibt es wirklich", () => {
    // Seit dem 30.09.2026 die neue Seite „Partner werden“ (`PartnerWerden.tsx`).
    expect(routenZeile("/partner-werden")).toContain("<PartnerWerden />");
    expect(existsSync(resolve(__dirname, "PartnerWerden.tsx"))).toBe(true);
  });

  it("die alte Seite ist weg und wird nirgends mehr geladen", () => {
    expect(existsSync(resolve(__dirname, "ClosingPage.tsx"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../assets/closing"))).toBe(false);
    expect(APP_TSX).not.toContain('import("./pages/ClosingPage")');
    expect(APP_TSX).not.toContain("<ClosingPage");
  });
});

describe("/closing-praesentation leitet in den Bewerberprozess", () => {
  it("steht als Umleitung in App.tsx", () => {
    expect(APP_EINZEILIG).toContain(
      '<Route path="/closing-praesentation" element={<Navigate to="/bewerberprozess" replace />} />',
    );
  });

  it("das Ziel gibt es wirklich", () => {
    expect(routenZeile("/bewerberprozess")).toContain("<Bewerberprozess />");
  });

  it("die alte Seite ist weg und wird nirgends mehr geladen", () => {
    expect(existsSync(resolve(__dirname, "ClosingPraesentation.tsx"))).toBe(false);
    expect(APP_TSX).not.toContain('import("./pages/ClosingPraesentation")');
    expect(APP_TSX).not.toContain("<ClosingPraesentation ");
    expect(APP_TSX).not.toContain("<ClosingPraesentation />");
  });
});

describe("Was an den Adressen sonst hängt", () => {
  it("beide Umleitungen behalten ihren Eintrag in der Routentabelle", () => {
    expect(ROUTEN_TABELLEN["/closing"]).toBeDefined();
    expect(ROUTEN_TABELLEN["/closing-praesentation"]).toBeDefined();
  });

  it("die Fenster des Videocalls werden weiterhin nicht als letzte Seite gemerkt", () => {
    expect(istVomRoutenspeicherAusgenommen("/closing")).toBe(true);
    expect(istVomRoutenspeicherAusgenommen("/closing-moderation")).toBe(true);
    expect(istVomRoutenspeicherAusgenommen("/closing-praesentation-entwurf")).toBe(true);
    // Gegenprobe: der Bewerberprozess selbst wird gemerkt.
    expect(istVomRoutenspeicherAusgenommen("/bewerberprozess")).toBe(false);
  });
});
