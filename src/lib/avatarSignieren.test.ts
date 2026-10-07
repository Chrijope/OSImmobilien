/**
 * Wachhund über der Bildadresse in der Mailsignatur.
 *
 * Die Logik liegt in `supabase/functions/_shared/avatar-signieren.ts`, weil
 * die Edge Functions in Deno laufen und nichts aus `src/` importieren können.
 * Getestet wird von hier, so wie bei `bewerber-eingangsmail` und
 * `standort-messung`.
 *
 * Worum es geht: Das Profilbild unter der Mail war da und war später wieder
 * weg. Ursache war die signierte Adresse mit einem Jahr Laufzeit. Eine Mail
 * liegt im Postfach, wird Monate später wieder geöffnet, und dann lädt das
 * Bild nicht mehr. Seit dem 21.09.2026 steht deshalb die öffentliche Adresse
 * in der Mail, die nicht abläuft.
 *
 * Diese Tests halten beides fest: dass die Adresse unverändert durchgereicht
 * wird, und dass der Bucket `avatars` öffentlich bleibt. Kippt jemand den
 * Bucket auf privat, fällt es hier auf und nicht erst in einem Postfach.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";
import {
  avatarSpeicherpfad,
  avatarUrlFuerMail,
  MAIL_LOGO_URL,
} from "../../supabase/functions/_shared/avatar-signieren.ts";

const BASIS = "https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/avatars";

describe("avatarSpeicherpfad", () => {
  it("gewinnt den Pfad aus der öffentlichen Adresse mit Zeitstempel zurück", () => {
    // Genau diese Form legt Einstellungen.tsx in profiles.avatar_url ab.
    expect(avatarSpeicherpfad(`${BASIS}/1d6f60b0/avatar.jpg?t=1757068800000`)).toBe(
      "1d6f60b0/avatar.jpg",
    );
  });

  it("kommt auch ohne Zeitstempel zurecht", () => {
    expect(avatarSpeicherpfad(`${BASIS}/1d6f60b0/avatar.webp`)).toBe("1d6f60b0/avatar.webp");
  });

  it("fasst fremde Adressen nicht an", () => {
    expect(avatarSpeicherpfad("https://example.com/bild.png")).toBeNull();
    expect(avatarSpeicherpfad("https://www.gravatar.com/avatar/abc?s=64")).toBeNull();
  });

  it("fasst einen anderen Bucket nicht an", () => {
    expect(
      avatarSpeicherpfad(
        "https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/objekt-medien/x.jpg",
      ),
    ).toBeNull();
  });

  it("erkennt eine bereits signierte Adresse nicht als öffentlichen Pfad", () => {
    const signiert =
      "https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/sign/avatars/1d6f60b0/avatar.jpg?token=abc";
    expect(avatarSpeicherpfad(signiert)).toBeNull();
  });

  it("gibt bei leeren Werten null zurück", () => {
    expect(avatarSpeicherpfad("")).toBeNull();
    expect(avatarSpeicherpfad("   ")).toBeNull();
    expect(avatarSpeicherpfad(null)).toBeNull();
    expect(avatarSpeicherpfad(undefined)).toBeNull();
  });

  it("macht die Prozentzeichen der Adresse wieder zu echten Zeichen", () => {
    expect(avatarSpeicherpfad(`${BASIS}/1d6f60b0/mein%20avatar.jpg`)).toBe(
      "1d6f60b0/mein avatar.jpg",
    );
  });

  it("überlebt eine kaputte Prozentfolge", () => {
    expect(avatarSpeicherpfad(`${BASIS}/1d6f60b0/avatar%.jpg`)).toBe("1d6f60b0/avatar%.jpg");
  });
});

describe("avatarUrlFuerMail", () => {
  it("reicht die öffentliche Adresse unverändert durch, samt Zeitstempel", () => {
    // Der Zeitstempel muss bleiben: Er ist die Bremse gegen den
    // Bildzwischenspeicher von Gmail, wenn jemand ein neues Bild hochlädt.
    const gespeichert = `${BASIS}/1d6f60b0/avatar.jpg?t=1757068800000`;
    expect(avatarUrlFuerMail(gespeichert)).toBe(gespeichert);
  });

  it("baut kein Ablaufdatum in die Adresse", () => {
    // Der eigentliche Punkt dieser Änderung: keine Signatur, kein token, kein
    // Ablauf. Sonst ist das Bild in der archivierten Mail irgendwann weg.
    const ergebnis = avatarUrlFuerMail(`${BASIS}/1d6f60b0/avatar.jpg`) ?? "";
    expect(ergebnis).not.toContain("/object/sign/");
    expect(ergebnis).not.toContain("token=");
  });

  it("lässt fremde Adressen stehen", () => {
    expect(avatarUrlFuerMail("https://example.com/bild.png")).toBe("https://example.com/bild.png");
  });

  it("gibt bei leeren Werten undefined zurück, dann zeigt die Vorlage die Initialen", () => {
    expect(avatarUrlFuerMail("")).toBeUndefined();
    expect(avatarUrlFuerMail("   ")).toBeUndefined();
    expect(avatarUrlFuerMail(null)).toBeUndefined();
    expect(avatarUrlFuerMail(undefined)).toBeUndefined();
  });
});

describe("avatarUrlFuerMail macht jede Adresse mailfest, egal von wo versendet wird", () => {
  it("hängt einen relativen Pfad an die veröffentlichte Adresse", () => {
    expect(avatarUrlFuerMail("/bilder/team.jpg")).toBe("https://osimmobilien.netlify.app/bilder/team.jpg");
  });

  it("ersetzt die Lovable-Vorschau durch die veröffentlichte Adresse", () => {
    expect(avatarUrlFuerMail("https://id-preview--abc.lovable.app/__l5e/assets-v1/x/foto.png?v=2")).toBe(
      "https://osimmobilien.netlify.app/__l5e/assets-v1/x/foto.png?v=2",
    );
    expect(avatarUrlFuerMail("https://abc.lovableproject.com/foto.png")).toBe("https://osimmobilien.netlify.app/foto.png");
  });

  it("macht aus einer signierten Avatar-Adresse die dauerhafte öffentliche", () => {
    const signiert =
      "https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/sign/avatars/1d6f60b0/avatar.jpg?token=abc";
    expect(avatarUrlFuerMail(signiert)).toBe(`${BASIS}/1d6f60b0/avatar.jpg`);
  });

  it("lässt data:, blob: und Unlesbares weg, dann stehen die Initialen da", () => {
    expect(avatarUrlFuerMail("data:image/png;base64,AAAA")).toBeUndefined();
    expect(avatarUrlFuerMail("blob:https://osimmobilien.netlify.app/123")).toBeUndefined();
    expect(avatarUrlFuerMail("avatar.jpg")).toBeUndefined();
  });

  it("das Logo ist ein PNG unter der festen Adresse und liegt im public-Ordner", () => {
    expect(MAIL_LOGO_URL).toBe("https://osimmobilien.netlify.app/moreimmo-logo-mail.png");
    const datei = readFileSync(resolve(__dirname, "../../public/moreimmo-logo-mail.png"));
    // PNG-Signatur, kein SVG und kein WebP
    expect(datei.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});

describe("jede Mailvorlage zieht Logo und Profilbild über den Helfer", () => {
  const SHARED = resolve(__dirname, "../../supabase/functions/_shared");
  const layout = readFileSync(resolve(SHARED, "transactional-email-templates/_layout.tsx"), "utf8");

  it("das Layout nimmt das Logo aus MAIL_LOGO_URL und das Profilbild aus avatarUrlFuerMail", () => {
    expect(layout).toContain("logo: MAIL_LOGO_URL");
    expect(layout).toMatch(/const bild = avatarUrlFuerMail\(person\?\.bildUrl\)/);
    expect(layout).toContain("src={bild}");
    expect(layout).not.toContain("src={person.bildUrl}");
  });

  for (const ordner of ["transactional-email-templates", "email-templates"]) {
    const pfad = resolve(SHARED, ordner);
    const vorlagen = readdirSync(pfad).filter((d) => d.endsWith(".tsx") && !d.startsWith("_"));

    it(`${ordner}: jede Vorlage rendert über EmailLayout und baut keine eigene Bildadresse`, () => {
      expect(vorlagen.length).toBeGreaterThan(0);
      for (const datei of vorlagen) {
        const text = readFileSync(resolve(pfad, datei), "utf8");
        // Varianten wie erstgespraech-erinnerung-24h leihen sich die Komponente
        // einer Grundvorlage, die ihrerseits hier geprüft wird.
        const leihtKomponente = /import \{[^}]*\} from '\.\/[a-z0-9-]+\.tsx'/.test(text);
        expect(text.includes("EmailLayout") || leihtKomponente, `${datei} ohne EmailLayout`).toBe(true);
        expect(text, `${datei} setzt ein eigenes Bild`).not.toMatch(/<Img\b|<img\b/);
        expect(text, `${datei} nimmt den Browser-Origin`).not.toContain("location.origin");
      }
    });
  }

  it("die E-Mail-Signatur baut ihr Logo nicht aus dem Browser-Origin", () => {
    const text = readFileSync(resolve(__dirname, "../components/unterlagen/EmailSignaturDialog.tsx"), "utf8");
    expect(text).not.toContain("window.location.origin");
    expect(text).toContain("OEFFENTLICHE_BASIS");
  });
});

describe("der Bucket avatars bleibt öffentlich", () => {
  /**
   * Die dauerhafte Adresse funktioniert nur, solange der Bucket öffentlich
   * ist. Migration 20260517102500 hat ihn schon einmal auf privat gestellt,
   * 20260601143536 hat ihn zurückgeholt. Passiert das noch einmal, ohne dass
   * jemand avatar-signieren.ts anfasst, verschwinden die Profilbilder aus
   * allen Mails. Dieser Test liest die jüngste Migration, die den Bucket
   * anfasst, und besteht darauf, dass sie ihn öffentlich lässt.
   */
  it("die jüngste Migration am Bucket setzt ihn auf public", () => {
    const ordner = resolve(__dirname, "../../supabase/migrations");
    const betroffene = readdirSync(ordner)
      .filter((d) => d.endsWith(".sql"))
      .filter((d) => {
        const inhalt = readFileSync(resolve(ordner, d), "utf8");
        return inhalt.includes("storage.buckets") && inhalt.includes("'avatars'");
      })
      .sort();

    expect(betroffene.length).toBeGreaterThan(0);

    const juengste = betroffene[betroffene.length - 1];
    const inhalt = readFileSync(resolve(ordner, juengste), "utf8");

    // Die Anweisung, die den Bucket anfasst, steht in derselben Anweisung wie
    // 'avatars'. Wir schneiden grob bis zum nächsten Semikolon und sehen nach,
    // was dort mit `public` geschieht.
    const anweisungen = inhalt
      .split(";")
      .filter((a) => a.includes("storage.buckets") && a.includes("'avatars'"));

    expect(anweisungen.length).toBeGreaterThan(0);
    for (const anweisung of anweisungen) {
      expect(
        /public\s*=\s*false/i.test(anweisung),
        `${juengste} stellt den Bucket avatars auf privat. Dann laden die ` +
          `Profilbilder in den Mails nicht mehr, siehe avatar-signieren.ts.`,
      ).toBe(false);
    }
  });
});
