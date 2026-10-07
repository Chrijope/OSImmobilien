import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Die sechs Anmelde- und Zugangsmails.
 *
 * Diese Mails traegt Supabase selbst an, ueber `auth-email-hook`. In ihnen
 * stecken die Bestaetigungslinks und die Einmalcodes. Geht dort ein Platzhalter
 * verloren oder heisst er ploetzlich anders, kommt die Mail weiterhin an, sieht
 * richtig aus, und niemand kann sich mehr anmelden oder sein Passwort
 * zuruecksetzen. Genau diese Sorte Fehler faellt beim Ansehen nicht auf.
 *
 * Geprueft wird deshalb dreierlei:
 *
 *   dass jede Vorlage ihre Platzhalter noch entgegennimmt und auch verwendet,
 *   dass der Hook genau diese Platzhalter noch fuellt,
 *   dass alle sechs am gemeinsamen Layout haengen und nicht an einem zweiten.
 *
 * Gelesen wird der Quelltext, nicht das gerenderte Ergebnis: Die Vorlagen
 * laufen in Deno und importieren ueber `npm:`-Adressen, die Vitest nicht
 * aufloest.
 */

const WURZEL = join(__dirname, "..", "..");
const ORDNER = join(WURZEL, "supabase", "functions", "_shared", "email-templates");
const HOOK = join(WURZEL, "supabase", "functions", "auth-email-hook", "index.ts");
const LAYOUT = join(
  WURZEL, "supabase", "functions", "_shared", "transactional-email-templates", "_layout.tsx",
);

const lies = (pfad: string): string => {
  try { return readFileSync(pfad, "utf8"); } catch { return ""; }
};

/**
 * Die Platzhalter je Vorlage.
 *
 * `benutzt` sind die, die im Text der Mail auftauchen muessen. `nurDeklariert`
 * steht fuer `email` in der Adressaenderung: Das Feld gehoert zur Schnittstelle
 * von Supabase und wird bewusst nicht angezeigt, weil bei der Fanout-Mail an
 * die neue Adresse `email` bereits die neue ist und die Zeile sonst "von neu
 * nach neu" laese. Der Kommentar dazu steht in der Vorlage.
 */
const VORLAGEN = {
  "signup.tsx": {
    komponente: "SignupEmail",
    benutzt: ["siteName", "siteUrl", "recipient", "confirmationUrl"],
    nurDeklariert: [] as string[],
    ziel: "confirmationUrl",
  },
  "invite.tsx": {
    komponente: "InviteEmail",
    benutzt: ["siteName", "siteUrl", "confirmationUrl"],
    nurDeklariert: [] as string[],
    ziel: "confirmationUrl",
  },
  "magic-link.tsx": {
    komponente: "MagicLinkEmail",
    benutzt: ["siteName", "confirmationUrl"],
    nurDeklariert: [] as string[],
    ziel: "confirmationUrl",
  },
  "recovery.tsx": {
    komponente: "RecoveryEmail",
    benutzt: ["siteName", "confirmationUrl"],
    nurDeklariert: [] as string[],
    ziel: "confirmationUrl",
  },
  "email-change.tsx": {
    komponente: "EmailChangeEmail",
    benutzt: ["siteName", "oldEmail", "newEmail", "confirmationUrl"],
    nurDeklariert: ["email"],
    ziel: "confirmationUrl",
  },
  "reauthentication.tsx": {
    komponente: "ReauthenticationEmail",
    benutzt: ["token"],
    nurDeklariert: [] as string[],
    ziel: "token",
  },
} as const;

const dateien = Object.keys(VORLAGEN) as Array<keyof typeof VORLAGEN>;

describe("Anmeldemails: die Platzhalter bleiben erhalten", () => {
  it("alle sechs Vorlagen liegen an ihrem Platz", () => {
    const fehlend = dateien.filter((d) => !existsSync(join(ORDNER, d)));
    expect(fehlend, `Diese Vorlagen fehlen: ${fehlend.join(", ")}`).toEqual([]);
  });

  it.each(dateien)("%s nimmt ihre Platzhalter entgegen und verwendet sie", (datei) => {
    const erwartet = VORLAGEN[datei];
    const inhalt = lies(join(ORDNER, datei));
    expect(inhalt, `${datei} ist leer oder fehlt`).not.toBe("");

    for (const feld of [...erwartet.benutzt, ...erwartet.nurDeklariert]) {
      // In der Schnittstelle deklariert, sonst kaeme der Wert nie an.
      expect(
        new RegExp(`^\\s*(?:// )?${feld}\\??:`, "m").test(inhalt),
        `${datei} deklariert "${feld}" nicht mehr. Der Hook schickt den Wert, ` +
        `die Vorlage nimmt ihn nicht mehr entgegen.`,
      ).toBe(true);
    }

    // Und im Mailtext auch benutzt, sonst nimmt die Vorlage den Wert zwar
    // entgegen, zeigt ihn aber nirgends. Gemessen wird nur der Teil ab
    // `<EmailLayout`, denn davor stehen nur Schnittstelle und Auspacken.
    const mailtext = inhalt.slice(inhalt.indexOf("<EmailLayout"));
    for (const feld of erwartet.benutzt) {
      expect(
        new RegExp(`\\b${feld}\\b`).test(mailtext),
        `${datei} verwendet "${feld}" nicht mehr im Mailtext.`,
      ).toBe(true);
    }
  });

  it("der Bestaetigungslink landet im Knopf, der Einmalcode im Codefeld", () => {
    const fehler: string[] = [];
    for (const datei of dateien) {
      const inhalt = lies(join(ORDNER, datei));
      const ziel = VORLAGEN[datei].ziel;
      if (ziel === "token") {
        if (!/<Code\s+wert=\{token\}/.test(inhalt)) {
          fehler.push(`${datei}: der Einmalcode steht nicht mehr im Codefeld.`);
        }
        continue;
      }
      if (!new RegExp(`href=\\{${ziel}\\}`).test(inhalt)) {
        fehler.push(`${datei}: der Knopf bekommt "${ziel}" nicht mehr als Ziel.`);
      }
    }
    expect(fehler, fehler.join("\n")).toEqual([]);
  });

  it("kein Knopf zeigt auf sich selbst", () => {
    // href="#" sieht aus wie ein Knopf und tut nichts.
    const mitRaute = dateien.filter((d) => /href=(?:"#"|\{['"]#['"]\})/.test(lies(join(ORDNER, d))));
    expect(mitRaute, `Diese Vorlagen setzen href="#": ${mitRaute.join(", ")}`).toEqual([]);
  });

  it("der Hook fuellt genau diese Platzhalter", () => {
    const hook = lies(HOOK);
    expect(hook).not.toBe("");

    // Die beiden Werte, an denen alles haengt: Sie kommen von Supabase und
    // duerfen weder umbenannt noch weggelassen werden.
    expect(hook).toMatch(/confirmationUrl:\s*payload\.data\.url/);
    expect(hook).toMatch(/token:\s*payload\.data\.token/);

    const gebraucht = new Set<string>();
    for (const datei of dateien) {
      for (const feld of VORLAGEN[datei].benutzt) gebraucht.add(feld);
    }
    const fehlend = [...gebraucht].filter((f) => !new RegExp(`\\b${f}:`).test(hook));
    expect(fehlend, `Der Hook setzt diese Felder nicht mehr: ${fehlend.join(", ")}`).toEqual([]);
  });

  it("der Hook laedt weiterhin alle sechs Vorlagen", () => {
    const hook = lies(HOOK);
    const fehlend = dateien.filter((d) => {
      const name = VORLAGEN[d].komponente;
      const pfad = d.replace(/\.tsx$/, "");
      return !hook.includes(`{ ${name} }`) || !hook.includes(`email-templates/${pfad}.tsx`);
    });
    expect(fehlend, `Nicht mehr eingebunden: ${fehlend.join(", ")}`).toEqual([]);
  });
});

describe("Anmeldemails: das gemeinsame Layout greift", () => {
  it.each(dateien)("%s baut auf EmailLayout auf", (datei) => {
    const inhalt = lies(join(ORDNER, datei));
    expect(inhalt).toMatch(/from '\.\/_gemeinsam\.ts'/);
    expect(inhalt).toMatch(/<EmailLayout/);
  });

  it("keine Vorlage bringt ein eigenes Aussehen mit", () => {
    // Das war der Zustand vorher: eigene Farben, eigene Schrift, eigener Knopf,
    // kein Logo. Sobald hier wieder etwas davon auftaucht, laufen die beiden
    // Fassungen erneut auseinander.
    const eigenbau: string[] = [];
    for (const datei of dateien) {
      const inhalt = lies(join(ORDNER, datei));
      if (/const (main|container|h1|button|footer)\s*=/.test(inhalt)) eigenbau.push(`${datei} (eigene Stilobjekte)`);
      if (/fontFamily:\s*'Arial/.test(inhalt)) eigenbau.push(`${datei} (Arial statt Hausschrift)`);
      if (/<Body\b|<Html\b|<Head\b/.test(inhalt)) eigenbau.push(`${datei} (eigenes Grundgeruest)`);
    }
    expect(eigenbau, `Wieder Eigenbau: ${eigenbau.join(", ")}`).toEqual([]);
  });

  it("es gibt nur ein Layout", () => {
    // `_gemeinsam.ts` darf ausschliesslich weiterreichen. Legt jemand dort
    // Farben oder Groessen an, ist das der Anfang des zweiten Layouts.
    const naht = lies(join(ORDNER, "_gemeinsam.ts"));
    expect(naht).toMatch(/from '\.\.\/transactional-email-templates\/_layout\.tsx'/);
    expect(naht).not.toMatch(/#[0-9a-fA-F]{6}/);

    const weitereLayouts = readdirSync(ORDNER).filter((d) => /^_layout/.test(d));
    expect(weitereLayouts, `Zweites Layout gefunden: ${weitereLayouts.join(", ")}`).toEqual([]);
  });

  it("keine Mail zeigt einen Abmeldelink oder einen leeren Ansprechpartner", () => {
    // Der Fuss setzt sonst {{unsubscribe_url}} ein, und dieser Platzhalter
    // wird nur ersetzt, wenn ein unsubscribe_token mitgeschickt wird. Der
    // Hook schickt keines, der rohe Platzhalter stuende dann in der Mail.
    const fehler: string[] = [];
    for (const datei of dateien) {
      const inhalt = lies(join(ORDNER, datei));
      if (!/\bintern\b/.test(inhalt)) fehler.push(`${datei}: ohne "intern", Abmeldelink bliebe roh stehen.`);
      if (!/\bohneUnterschrift\b/.test(inhalt)) fehler.push(`${datei}: ohne "ohneUnterschrift", es erschiene der Platzhalter "MOREImmo Team".`);
    }
    expect(fehler, fehler.join("\n")).toEqual([]);
  });

  it("das Logo traegt einen Ersatztext in der Hausschrift", () => {
    // Viele Mailprogramme laden fremde Bilder nicht. Der Alternativtext des
    // Logos wird dann mit den Schriftangaben am Bild gezeichnet, deshalb
    // stehen sie dort. Ohne sie sieht man einen leeren Kasten.
    const layout = lies(LAYOUT);
    expect(layout).toMatch(/const logoStil = \{[\s\S]*?fontFamily: T\.schrift/);
    expect(layout).toMatch(/alt=\{MARKE\.name\}/);
  });

  it("jede der sechs Mails hat einen Betreff auf Deutsch und einen auf Englisch", () => {
    // Seit dem 25.09.2026 (Plan Kundensprache, M30) gibt es je Sprache einen
    // Block. Deutsch bleibt der Rueckfall fuer alle ohne Kundenprofil.
    const hook = lies(HOOK);
    const block = hook.match(/const EMAIL_SUBJECTS[\s\S]*?\n\}/)?.[0] ?? "";
    const deutsch = block.match(/\n  de: \{[\s\S]*?\n  \}/)?.[0] ?? "";
    const englisch = block.match(/\n  en: \{[\s\S]*?\n  \}/)?.[0] ?? "";
    for (const art of ["signup", "invite", "magiclink", "recovery", "email_change", "reauthentication"]) {
      expect(deutsch, `Deutscher Betreff fuer "${art}" fehlt`).toMatch(new RegExp(`\\b${art}:`));
      expect(englisch, `Englischer Betreff fuer "${art}" fehlt`).toMatch(new RegExp(`\\b${art}:`));
    }
    // Im deutschen Block stehen keine englischen Betreffzeilen des Geruests mehr.
    expect(deutsch).not.toMatch(/Confirm your|Reset your|Your login|Your verification|been invited/);
    // Der Rueckfall auf Deutsch bleibt im Versand.
    expect(hook).toMatch(/EMAIL_SUBJECTS\.de\[emailType\]/);
  });

  it("jede der sechs Vorlagen hat Deutsch und Englisch und nimmt die Sprache entgegen", () => {
    const fehler: string[] = [];
    for (const datei of dateien) {
      const inhalt = lies(join(ORDNER, datei));
      if (!/^\s*sprache\?:/m.test(inhalt)) fehler.push(`${datei}: nimmt "sprache" nicht entgegen`);
      if (!/\n  de: \{/.test(inhalt) || !/\n  en: \{/.test(inhalt)) fehler.push(`${datei}: ohne Texte fuer de und en`);
      if (!/texteFuer\(TEXTE, sprache\)/.test(inhalt)) fehler.push(`${datei}: waehlt die Texte nicht nach der Sprache`);
    }
    expect(fehler, fehler.join("\n")).toEqual([]);
    expect(lies(HOOK)).toMatch(/\bsprache,\n\s*\}/);
  });
});

describe("Anmeldemails: der Ton passt zum uebrigen System", () => {
  it("keine Gedankenstriche in den sichtbaren Texten", () => {
    const mitStrich = dateien.filter((d) => {
      const inhalt = lies(join(ORDNER, d));
      // Nur der Fliesstext, nicht Kommentare oder Trennlinien im Quelltext.
      return inhalt
        .split("\n")
        .filter((z) => !/^\s*(\*|\/\/|\/\*)/.test(z))
        .some((z) => /\s[–—]\s/.test(z));
    });
    expect(mitStrich, `Gedankenstrich im Mailtext: ${mitStrich.join(", ")}`).toEqual([]);
  });

  it("alle Auth-Mails duzen, seit dem 15.09.2026 spricht das ganze Projekt per Du", () => {
    const gesiezt = dateien.filter((d) => /\b(Sie haben|Sie wurden|Ihr Passwort|Ihre E-Mail|Ihren Zugang|Ihrer Identität|Guten Tag)\b/.test(lies(join(ORDNER, d))));
    expect(gesiezt, `Hier wird noch gesiezt: ${gesiezt.join(", ")}`).toEqual([]);
  });
});
