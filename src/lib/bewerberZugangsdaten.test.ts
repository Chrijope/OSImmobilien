import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Die Logik liegt bei der Edge Function (send-bewerber-zugangsdaten), weil sie
// dort gebraucht wird. Getestet wird sie hier, weil Vitest nur unterhalb von
// src sucht, so wie bei berater-namensabgleich und standort-messung.
import {
  pruefeZugangsdatenAuftrag,
  onboardingTerminSatz,
  MAIL_ANLEITUNG_URL,
} from "../../supabase/functions/_shared/bewerber-zugangsdaten.ts";

const gueltig = {
  empfaengerEmail: "max@privat.de",
  vorname: "Max",
  persoenlicheEmail: "m.mustermann@os-immobilien.com",
  passwort: "Start1234!",
  onboardingDatum: "24.08.2026",
  onboardingUhrzeit: "10:00",
};

describe("pruefeZugangsdatenAuftrag", () => {
  it("akzeptiert einen vollständigen Auftrag", () => {
    const res = pruefeZugangsdatenAuftrag(gueltig);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.auftrag.persoenlicheEmail).toBe("m.mustermann@os-immobilien.com");
      expect(res.auftrag.onboardingDatum).toBe("24.08.2026");
      expect(res.auftrag.onboardingUhrzeit).toBe("10:00");
    }
  });

  it("lehnt eine persönliche Adresse ohne @os-immobilien.com ab", () => {
    const res = pruefeZugangsdatenAuftrag({ ...gueltig, persoenlicheEmail: "m.mustermann@gmail.com" });
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.fehler).toMatch(/@os-immobilien\.com/);
  });

  it("lehnt eine Adresse ab, die @os-immobilien.com nur enthält, aber nicht darauf endet", () => {
    const res = pruefeZugangsdatenAuftrag({ ...gueltig, persoenlicheEmail: "os@os-immobilien.com.example.com" });
    expect(res.ok).toBe(false);
  });

  it("normalisiert Großschreibung der persönlichen Adresse", () => {
    const res = pruefeZugangsdatenAuftrag({ ...gueltig, persoenlicheEmail: "M.Mustermann@os-immobilien.com" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.auftrag.persoenlicheEmail).toBe("m.mustermann@os-immobilien.com");
  });

  it("lehnt ein fehlendes Passwort ab", () => {
    const res = pruefeZugangsdatenAuftrag({ ...gueltig, passwort: "" });
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.fehler).toMatch(/Passwort/);
  });

  it("lehnt ein Passwort aus nur Leerzeichen ab", () => {
    const res = pruefeZugangsdatenAuftrag({ ...gueltig, passwort: "   " });
    expect(res.ok).toBe(false);
  });

  it("lehnt eine ungültige private Empfängeradresse ab", () => {
    const res = pruefeZugangsdatenAuftrag({ ...gueltig, empfaengerEmail: "kein-postfach" });
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.fehler).toMatch(/private E-Mail/);
  });

  it("kommt ohne Onboarding-Termin aus (neutraler Satz in der Vorlage)", () => {
    const res = pruefeZugangsdatenAuftrag({
      ...gueltig,
      onboardingDatum: undefined,
      onboardingUhrzeit: undefined,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.auftrag.onboardingDatum).toBeUndefined();
      expect(res.auftrag.onboardingUhrzeit).toBeUndefined();
    }
  });

  it("weist Nicht-Objekte als Eingabe zurück", () => {
    expect(pruefeZugangsdatenAuftrag(null).ok).toBe(false);
    expect(pruefeZugangsdatenAuftrag("text").ok).toBe(false);
  });
});

describe("onboardingTerminSatz", () => {
  it("bestätigt Datum und Uhrzeit aus Schritt 1 und verweist auf die Zoom-Mail", () => {
    expect(onboardingTerminSatz("07.10.2026", "14:30")).toBe(
      "Den Termin für dein Onboarding am 07.10.2026 um 14:30 Uhr bestätigen wir dir hiermit auch nochmals. " +
        "Den Zoom-Link dazu hast du in einer separaten Mail erhalten.",
    );
  });

  it("schreibt ein ISO-Datum deutsch und kürzt Sekunden weg", () => {
    expect(onboardingTerminSatz("2026-10-07", "09:05:00")).toContain("am 07.10.2026 um 09:05 Uhr");
  });

  it("nennt ohne Uhrzeit nur das Datum", () => {
    expect(onboardingTerminSatz("07.10.2026", "")).toContain("Den Termin für dein Onboarding am 07.10.2026 bestätigen");
  });

  it("verspricht ohne Termin keine gemeinsame Abstimmung", () => {
    for (const satz of [onboardingTerminSatz(), onboardingTerminSatz("  ", "10:00")]) {
      expect(satz).toBe("Den Termin für dein Onboarding schicken wir dir separat.");
    }
  });
});

describe("Vorlage bewerber-zugangsdaten", () => {
  const vorlage = readFileSync(
    resolve(__dirname, "../../supabase/functions/_shared/transactional-email-templates/bewerber-zugangsdaten.tsx"),
    "utf-8",
  );

  it("verlinkt die öffentliche PDF auf osimmobilien.netlify.app statt ins CRM", () => {
    expect(MAIL_ANLEITUNG_URL).toBe("https://osimmobilien.netlify.app/dokumente/moreimmo-mail-einrichten.pdf");
    expect(vorlage).toContain('<Handlung href={MAIL_ANLEITUNG_URL} text="Anleitung öffnen" />');
    // Dieselbe Adresse zusätzlich als lesbarer Textlink.
    expect(vorlage).toContain("<Nebenhandlung href={MAIL_ANLEITUNG_URL} text={MAIL_ANLEITUNG_URL} />");
    expect(vorlage).not.toContain("/unterlagen/email-signatur");
    expect(vorlage).not.toContain("CRM · Unterlagen");
  });

  it("trägt den neuen Anleitungssatz und den Termin-Satz", () => {
    expect(vorlage.replace(/\s+/g, " ")).toContain(
      "Eine Schritt-für-Schritt-Anleitung zur Einrichtung findest du unter folgendem Button oder unter folgendem Link.",
    );
    expect(vorlage).toContain("Beide sind die Grundlage für dein Onboarding mit Christian Peetz. {terminSatz}");
    expect(vorlage).not.toContain("stimmen wir gemeinsam ab");
  });

  it("enthält keine Gedankenstriche", () => {
    expect(vorlage).not.toMatch(/[–—]/);
    expect(onboardingTerminSatz("07.10.2026", "10:00")).not.toMatch(/[–—]/);
  });
});
