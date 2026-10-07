import { describe, it, expect } from "vitest";
import {
  bogenWeg,
  favoritBeschriftung,
  favoritenSchluessel,
  kennenlernFolien,
  kennenlernGruppen,
  kennenlernUebungsFolien,
  leseFavoritenSchluessel,
  leseModule,
  leseUebungsArt,
  leseUebungsStand,
  leererBewerber,
  leseWeg,
  notizFolienBezug,
  notizMitBezug,
  rechnerEintrag,
  sanitizeFavoriten,
  standAusNachricht,
  standNachricht,
  toggleFavorit,
  uebungsFensterUrl,
  uebungsKanalKennung,
  uebungsUrl,
  vorabbogenGruppen,
  type UebungsStand,
} from "./praesentationsUebung";
import { kanalName, leseNachricht } from "./praesentationsKopplung";
import { STRECKEN } from "./bewerberVideocall";
import { deckFuerEinstieg } from "./praesentationsDeck";

/**
 * Die Übungsansicht: drei Abläufe, die Wege dahinter, die Leiste und die
 * Favoriten-Schlüssel. Alles ohne Bewerber, denn genau das ist ihr Zweck.
 */
describe("praesentationsUebung", () => {
  describe("die drei Auswahlmöglichkeiten", () => {
    it("liest die Art aus der Adresse und fällt sonst auf den Vorabbogen zurück", () => {
      expect(leseUebungsArt("vorabbogen")).toBe("vorabbogen");
      expect(leseUebungsArt("kennenlernbogen")).toBe("kennenlernbogen");
      expect(leseUebungsArt("rechner")).toBe("rechner");
      expect(leseUebungsArt("irgendwas")).toBe("vorabbogen");
      expect(leseUebungsArt(null)).toBe("vorabbogen");
    });

    it("baut je Art eine Adresse ohne Bewerberkennung", () => {
      expect(uebungsUrl({ art: "vorabbogen" })).toBe("/praesentation-uebung?art=vorabbogen");
      expect(uebungsUrl({ art: "vorabbogen", teil: 2 })).toBe("/praesentation-uebung?art=vorabbogen&teil=2");
      expect(uebungsUrl({ art: "kennenlernbogen", weg: "weg3", module: ["m6"] }))
        .toBe("/praesentation-uebung?art=kennenlernbogen&weg=weg3&module=m6");
      expect(uebungsUrl({ art: "rechner", folieId: "rechner" })).toBe("/praesentation-uebung?art=rechner");
      for (const url of [uebungsUrl({ art: "vorabbogen" }), uebungsUrl({ art: "kennenlernbogen" }), uebungsUrl({ art: "rechner" })]) {
        expect(url).not.toContain("bewerberId");
      }
    });

    it("liest den ganzen Stand aus einer Query", () => {
      const stand = leseUebungsStand(new URLSearchParams("art=kennenlernbogen&weg=weg2&module=m3,m6,quatsch&folie=modul-m3"));
      expect(stand).toEqual({ art: "kennenlernbogen", teil: 1, weg: "weg2", module: ["m3", "m6"], folieId: "modul-m3", bewerberId: "" });
    });

    /*
     * Aus dem Bewerberprofil reist nur die Kennung mit, für die Notizen. Die
     * Folien bleiben davon unberührt.
     */
    it("nimmt die Bewerberkennung mit in die Adresse und liest sie wieder", () => {
      expect(uebungsUrl({ art: "vorabbogen", teil: 2, bewerberId: "b 1" }))
        .toBe("/praesentation-uebung?art=vorabbogen&teil=2&bewerber=b%201");
      expect(uebungsUrl({ art: "kennenlernbogen", bewerberId: "  " })).not.toContain("bewerber");
      expect(leseUebungsStand(new URLSearchParams("art=rechner&bewerber=b1")).bewerberId).toBe("b1");
    });
  });

  describe("das Präsentationsfenster", () => {
    const stand: UebungsStand = { art: "kennenlernbogen", teil: 1, weg: "weg2", module: ["m3"], folieId: "modul-m3", bewerberId: "b1" };

    /*
     * Die Kennung reist seit dem 22.09.2026 beim Kennenlernbogen mit, und nur
     * dort: Sonst stünden im geteilten Fenster leere Folien, während die
     * Moderation daneben seine Antworten zeigt. Sein Name steht im Fenster
     * nach wie vor nirgends, dafür sorgt die Seite selbst.
     */
    it("bekommt Sitzung und Stand in die Adresse, beim Kennenlernbogen auch den Bewerber", () => {
      expect(uebungsFensterUrl(stand, "s7"))
        .toBe("/praesentation-uebung?fenster=1&kanal=s7&art=kennenlernbogen&weg=weg2&module=m3&folie=modul-m3&bewerber=b1");
      expect(uebungsFensterUrl(stand, "")).toBe("/praesentation-uebung?fenster=1&art=kennenlernbogen&weg=weg2&module=m3&folie=modul-m3&bewerber=b1");
    });

    it("lässt den Bewerber beim Vorabbogen und beim Rechner weg, dort gäbe es nichts zu füllen", () => {
      const vorab: UebungsStand = { ...stand, art: "vorabbogen", teil: 2, folieId: "preis" };
      expect(uebungsFensterUrl(vorab, "s7")).not.toContain("bewerber");
      expect(uebungsFensterUrl({ ...stand, art: "rechner" }, "s7")).not.toContain("bewerber");
    });

    it("öffnet den Kanal je Sitzung, ohne Sitzung den festen Übungskanal", () => {
      expect(kanalName(uebungsKanalKennung("s7"))).toBe("closing-praesentation-uebung-s7");
      expect(uebungsKanalKennung("")).toBeNull();
      expect(kanalName(uebungsKanalKennung(null))).toBe("closing-praesentation-ohne-bewerber");
    });

    it("packt den Stand ohne Bewerber in eine gültige Nachricht und liest ihn geprüft zurück", () => {
      const n = standNachricht(stand);
      expect(n).toEqual({ typ: "stand", art: "kennenlernbogen", teil: 1, weg: "weg2", module: ["m3"], folieId: "modul-m3" });
      expect("bewerberId" in n).toBe(false);
      // Die Nachricht übersteht die Prüfung des Kanals unverändert.
      expect(leseNachricht(JSON.parse(JSON.stringify(n)))).toEqual(n);
      expect(standAusNachricht(n)).toEqual({ ...stand, bewerberId: "" });
      // Unbekannte Wege und Module fallen beim Lesen weg, wie in einer Adresse.
      expect(standAusNachricht({ typ: "stand", art: "kennenlernbogen", teil: 2, weg: "weg9", module: ["m3", "xx"], folieId: " x " }, "b2"))
        .toEqual({ art: "kennenlernbogen", teil: 2, weg: "weg1", module: ["m3"], folieId: "x", bewerberId: "b2" });
    });
  });

  describe("die Notizen", () => {
    it("stellt den Folienbezug vorn in den Text", () => {
      expect(notizFolienBezug({ art: "vorabbogen", weg: "weg1" }, 11, "Deine Zahlen")).toBe("[Closing, Folie 11 Deine Zahlen]");
      expect(notizFolienBezug({ art: "kennenlernbogen", weg: "weg3" }, 2, "Ausgangslage · 6 Minuten")).toBe("[Kennenlern, Weg 3, Folie 2 Ausgangslage · 6 Minuten]");
      expect(notizFolienBezug({ art: "rechner", weg: "weg1" }, 1, "Deine Zahlen")).toBe("[Rechner]");
      expect(notizFolienBezug({ art: "vorabbogen", weg: "weg1" }, 3, "  ")).toBe("[Closing, Folie 3]");
      expect(notizMitBezug("[Rechner]", "  Rechnet mit 2 Abschlüssen.  ")).toBe("[Rechner] Rechnet mit 2 Abschlüssen.");
    });

    it("die leere Hülle hat keine Kennung und keine Angaben", () => {
      const b = leererBewerber();
      expect(b.id).toBe("");
      expect(b.vorname).toBe("");
      expect(b.notizenLog).toEqual([]);
    });
  });

  describe("die Wege", () => {
    it("Vorabbogen: Feld teil, Werte 1 und 2, alles andere ist 1", () => {
      expect(leseUebungsStand(new URLSearchParams("art=vorabbogen&teil=2")).teil).toBe(2);
      expect(leseUebungsStand(new URLSearchParams("art=vorabbogen&teil=7")).teil).toBe(1);
      expect(deckFuerEinstieg(1).length).toBeGreaterThan(deckFuerEinstieg(2).length);
    });

    it("Kennenlernbogen: Feld weg, Werte weg1 bis weg5, sonst weg1", () => {
      expect(leseWeg("weg4")).toBe("weg4");
      expect(leseWeg("weg9")).toBe("weg1");
      expect(leseWeg(null)).toBe("weg1");
      expect(leseModule("m3, m6,m3,xx")).toEqual(["m3", "m6"]);
    });

    it("liefert auf jedem der fünf Wege Folien, ganz ohne Bewerberantworten", () => {
      for (const s of STRECKEN) {
        const folien = kennenlernUebungsFolien(s.weg);
        expect(folien.length).toBeGreaterThanOrEqual(7);
        expect(folien[0].id).toBe("kern-begruessung");
        expect(folien[folien.length - 1].id).toBe("kern-weitergehen");
        for (const m of s.gesetzt) expect(folien.map((f) => f.id)).toContain(`modul-${m}`);
        for (const m of s.beiBedarf) expect(folien.map((f) => f.id)).not.toContain(`modul-${m}`);
      }
    });

    it("schaltet Module bei Bedarf zu", () => {
      const ohne = kennenlernUebungsFolien("weg2");
      const mit = kennenlernUebungsFolien("weg2", ["m3"]);
      expect(mit.length).toBe(ohne.length + 1);
      expect(mit.map((f) => f.id)).toContain("modul-m3");
    });

    /*
     * Der Kern der Moderation: Mit seinem Bogen tragen die Folien seine
     * Antworten, ohne Bogen und auf einem fremden Weg bleiben sie blank. Bis
     * zum 22.09.2026 blieben sie immer blank, und niemandem fiel es auf.
     */
    it("füllt die Folien mit seinen Antworten, sobald sein Bogen zu diesem Weg gehört", () => {
      const antworten = { weg: "weg1", wegAntwort1: "4_bis_10", startzeitpunkt: "vier_wochen" };
      const gefuellt = JSON.stringify(kennenlernFolien("weg1", [], antworten));
      expect(gefuellt).toContain("4 bis 10");
      expect(gefuellt).toContain("In den nächsten vier Wochen");

      // Ohne Antworten und auf einem fremden Weg bleibt es die blanke Strecke.
      expect(kennenlernFolien("weg1", [], null)).toEqual(kennenlernUebungsFolien("weg1"));
      expect(kennenlernFolien("weg2", [], antworten)).toEqual(kennenlernUebungsFolien("weg2"));
    });

    it("lässt die Folien-Ids gleich, egal ob mit oder ohne seine Antworten", () => {
      const antworten = { weg: "weg3", wegAntwort1: "4_bis_10" };
      expect(kennenlernFolien("weg3", ["m6"], antworten).map((f) => f.id))
        .toEqual(kennenlernUebungsFolien("weg3", ["m6"]).map((f) => f.id));
    });

    it("liest seinen Weg aus dem Bogen und verwirft, was keine Strecke ist", () => {
      expect(bogenWeg({ weg: "weg4" })).toBe("weg4");
      expect(bogenWeg({ weg: " weg4 " })).toBe("weg4");
      expect(bogenWeg({ weg: "weg9" })).toBeNull();
      expect(bogenWeg({})).toBeNull();
      expect(bogenWeg(null)).toBeNull();
    });
  });

  describe("die Leiste", () => {
    it("gruppiert den Vorabbogen in Teil 1 und Teil 2 und beschriftet den Rechner", () => {
      const gruppen = vorabbogenGruppen();
      expect(gruppen.map((g) => g.titel)).toEqual(["Teil 1 · Kennenlernen", "Teil 2 · Präsentation über uns"]);
      const alle = gruppen.flatMap((g) => g.eintraege);
      expect(alle.length).toBe(deckFuerEinstieg(1).length);
      const rechner = alle.find((e) => e.istRechner);
      expect(rechner?.folieId).toBe("rechner");
      expect(rechner?.titel).toContain("Rechner");
      expect(rechner?.teil).toBe(2);
    });

    it("gruppiert den Kennenlernbogen in fünf Wege mit Modulen bei Bedarf", () => {
      const gruppen = kennenlernGruppen({ weg2: ["m3"] });
      expect(gruppen.map((g) => g.titel)).toEqual(["Weg 1", "Weg 2", "Weg 3", "Weg 4", "Weg 5"]);
      const weg2 = gruppen[1];
      expect(weg2.beiBedarf).toEqual(["m3", "m6"]);
      const m3 = weg2.eintraege.find((e) => e.folieId === "modul-m3");
      expect(m3?.modulBeiBedarf).toBe("m3");
      expect(m3?.titel).toMatch(/^Modul 3/);
      // Ohne Zuschaltung fehlt das Modul bei Bedarf.
      expect(gruppen[2].eintraege.map((e) => e.folieId)).not.toContain("modul-m6");
    });

    it("hat einen eigenen Rechner-Eintrag", () => {
      const r = rechnerEintrag();
      expect(r.art).toBe("rechner");
      expect(r.istRechner).toBe(true);
      expect(r.schluessel).toBe("rechner||rechner");
    });
  });

  describe("die Favoriten", () => {
    it("baut und liest Schlüssel aus Art, Weg und Folie", () => {
      expect(favoritenSchluessel("vorabbogen", "rechner")).toBe("vorabbogen||rechner");
      expect(favoritenSchluessel("kennenlernbogen", "modul-m6", "weg1")).toBe("kennenlernbogen|weg1|modul-m6");
      expect(leseFavoritenSchluessel("kennenlernbogen|weg1|modul-m6")).toEqual({ art: "kennenlernbogen", weg: "weg1", folieId: "modul-m6" });
      expect(leseFavoritenSchluessel("vorabbogen||rechner")).toEqual({ art: "vorabbogen", weg: null, folieId: "rechner" });
      expect(leseFavoritenSchluessel("kennenlernbogen|weg9|x")).toBeNull();
      expect(leseFavoritenSchluessel("quatsch")).toBeNull();
    });

    it("setzt und entfernt einen Favoriten", () => {
      const a = toggleFavorit([], "vorabbogen||rechner");
      expect(a).toEqual(["vorabbogen||rechner"]);
      const b = toggleFavorit(a, "kennenlernbogen|weg2|kern-service");
      expect(b).toEqual(["vorabbogen||rechner", "kennenlernbogen|weg2|kern-service"]);
      expect(toggleFavorit(b, "vorabbogen||rechner")).toEqual(["kennenlernbogen|weg2|kern-service"]);
    });

    it("wirft Unbrauchbares aus der Datenbank weg", () => {
      expect(sanitizeFavoriten(null)).toEqual([]);
      expect(sanitizeFavoriten(["vorabbogen||rechner", 3, "", "vorabbogen||rechner", "x|y", "kennenlernbogen|weg3|kern-service"]))
        .toEqual(["vorabbogen||rechner", "kennenlernbogen|weg3|kern-service"]);
    });

    it("beschriftet einen Favoriten und nennt das Modul, das er braucht", () => {
      expect(favoritBeschriftung("vorabbogen||rechner")).toMatchObject({ gruppe: "Vorabbogen", titel: "Deine Zahlen (Rechner)", module: [] });
      expect(favoritBeschriftung("rechner||rechner")).toMatchObject({ gruppe: "Rechner" });
      // Modul 3 ist auf Weg 2 nur bei Bedarf: Der Favorit muss es mitbringen.
      expect(favoritBeschriftung("kennenlernbogen|weg2|modul-m3")).toMatchObject({ gruppe: "Kennenlernbogen · Weg 2", module: ["m3"] });
      // Gesetztes Modul braucht nichts.
      expect(favoritBeschriftung("kennenlernbogen|weg1|modul-m6")).toMatchObject({ module: [] });
      expect(favoritBeschriftung("vorabbogen||gibt-es-nicht")).toBeNull();
    });
  });
});
