/**
 * Wer welche Einstellungsbereiche sieht, und welche gesperrt sind.
 *
 * Zwei Stellen fragen dieselbe Liste ab: das Zahnradmenü in der Kopfleiste
 * und die Einstellungsseite selbst. Liefen sie auseinander, stuende im Menue
 * ein Bereich, den die Seite nicht kennt, und der Klick liefe ins Leere.
 */
import { describe, expect, it } from "vitest";

import { bereichSlug, einstellungenBereiche, einstellungenMenue } from "./einstellungenBereiche";

const titel = (rolle: string) => einstellungenBereiche(rolle).map((b) => b.titel);

describe("Wer welche Bereiche bekommt", () => {
  it("gibt dem Vertriebspartner Christians Reihenfolge", () => {
    expect(titel("vertriebspartner")).toEqual([
      "Profil",
      "Kalender",
      "Abwesenheit",
      "Benachrichtigungen",
      "Protokoll",
      "Sicherheit",
      "Tutorial",
    ]);
  });

  it("gibt dem Admin zusaetzlich den E-Mail-Status", () => {
    expect(titel("admin")).toContain("E-Mail-Status");
    expect(titel("inhaber")).toContain("E-Mail-Status");
    expect(titel("vertriebspartner")).not.toContain("E-Mail-Status");
  });

  it("laesst Kunden nur das Noetigste", () => {
    // Ein Kunde hat weder Profil im Vertriebssinn noch Leads.
    expect(titel("kunde")).toEqual(["Benachrichtigungen", "Protokoll", "Sicherheit"]);
  });

  it("gibt dem Tippgeber kein Abwesenheit und keinen Kalender", () => {
    /*
     * Abwesenheit steuert die Leadverteilung. Ein Tippgeber bekommt keine
     * Leads zugewiesen, fuer ihn waere der Bereich ohne Wirkung.
     */
    const t = titel("tippgeber");
    expect(t).toContain("Profil");
    expect(t).not.toContain("Abwesenheit");
    expect(t).not.toContain("Kalender");
  });

  it("zeigt das Tutorial nicht in den Aussenrollen", () => {
    expect(titel("kunde")).not.toContain("Tutorial");
    expect(titel("tippgeber")).not.toContain("Tutorial");
  });
});

describe("Die Entwurf-Regel, dieselbe wie in der Seitenleiste", () => {
  const kalenderFuer = (rolle: string) =>
    einstellungenBereiche(rolle).find((b) => b.titel === "Kalender");

  it("sperrt den Kalender fuer den Vertriebspartner", () => {
    const k = kalenderFuer("vertriebspartner");
    expect(k?.entwurf).toBe(true);
    expect(k?.offen).toBe(false);
    expect(k?.abzeichen).toBe("Bald verfügbar");
  });

  it("laesst ihn fuer Admin und Inhaber offen", () => {
    /*
     * Christians ausdrueckliche Vorgabe: Er selbst soll hinein, die Partner
     * nicht. Genau so verhaelt sich die Seitenleiste schon.
     */
    for (const rolle of ["admin", "inhaber"]) {
      const k = kalenderFuer(rolle);
      expect(k?.entwurf, rolle).toBe(true);
      expect(k?.offen, rolle).toBe(true);
      expect(k?.abzeichen, rolle).toBe("Entwurf");
    }
  });

  it("laesst alle uebrigen Bereiche offen", () => {
    const gesperrt = einstellungenBereiche("vertriebspartner")
      .filter((b) => b.entwurf)
      .map((b) => b.titel);
    expect(gesperrt).toEqual(["Kalender"]);
  });
});

describe("Der Slug fuer die Adresse", () => {
  it("bildet die bisherigen Reiterwerte nach", () => {
    // Bestehende Verweise mit ?tab=... muessen weiter treffen.
    expect(bereichSlug("Profil")).toBe("profil");
    expect(bereichSlug("E-Mail-Status")).toBe("e-mail-status");
    expect(bereichSlug("Benachrichtigungen")).toBe("benachrichtigungen");
  });

  it("stimmt fuer jeden Bereich mit seinem Titel ueberein", () => {
    for (const b of einstellungenBereiche("admin")) {
      expect(b.slug).toBe(bereichSlug(b.titel));
    }
  });
});

describe("Das Zahnradmenue", () => {
  const menue = (rolle: string) => einstellungenMenue(rolle).map((e) => e.titel);

  it("fasst Protokoll und Sicherheit zu einem Eintrag zusammen", () => {
    /*
     * Beide beantworten dieselbe Frage, naemlich wer an meinem Zugang war.
     * Nebeneinander im Hauptmenue lasen sie sich wie zwei unabhaengige Dinge.
     */
    const eintraege = einstellungenMenue("vertriebspartner");
    const titel = eintraege.map((e) => e.titel);
    expect(titel).toContain("Konto & Zugang");
    expect(titel).not.toContain("Protokoll");
    expect(titel).not.toContain("Sicherheit");

    const zusammen = eintraege.find((e) => e.titel === "Konto & Zugang");
    expect(zusammen?.unterpunkte?.map((b) => b.titel)).toEqual(["Protokoll", "Sicherheit"]);
  });

  it("laesst die Reihenfolge unangetastet", () => {
    // Der zusammengefasste Eintrag steht dort, wo sein erster Teil stuende.
    expect(menue("vertriebspartner")).toEqual([
      "Profil",
      "Kalender",
      "Abwesenheit",
      "Benachrichtigungen",
      "Konto & Zugang",
      "Tutorial",
    ]);
  });

  it("fuehrt jeden einfachen Eintrag direkt in seinen Bereich", () => {
    for (const eintrag of einstellungenMenue("admin")) {
      if (eintrag.unterpunkte) continue;
      expect(eintrag.bereich, eintrag.titel).toBeDefined();
      expect(eintrag.bereich?.slug, eintrag.titel).toBeTruthy();
    }
  });

  it("behaelt die Entwurf-Sperre am Kalender", () => {
    const kalender = einstellungenMenue("vertriebspartner").find((e) => e.titel === "Kalender");
    expect(kalender?.bereich?.offen).toBe(false);
    expect(einstellungenMenue("admin").find((e) => e.titel === "Kalender")?.bereich?.offen).toBe(true);
  });

  it("deckt mit seinen Eintraegen genau die Bereiche ab", () => {
    /*
     * Kein Bereich darf im Menue fehlen, und keiner doppelt erscheinen. Sonst
     * gaebe es eine Seite, die man ueber das Zahnrad nicht erreicht.
     */
    for (const rolle of ["admin", "vertriebspartner", "kunde", "tippgeber"]) {
      const ausMenue = einstellungenMenue(rolle).flatMap((e) =>
        e.unterpunkte ? e.unterpunkte.map((b) => b.slug) : [e.bereich!.slug],
      );
      const alle = einstellungenBereiche(rolle).map((b) => b.slug);
      expect(ausMenue.sort(), rolle).toEqual(alle.sort());
    }
  });
});
