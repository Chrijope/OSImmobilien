/**
 * Welche Adressen darf der Server abrufen?
 *
 * Die Logik liegt in `supabase/functions/_shared/ziel-adresse.ts`, weil
 * `fetch-url-pdfs` sie braucht. Geprüft wird sie hier, denn die Edge Functions
 * laufen unter Deno und kommen im Testlauf nicht vor.
 *
 * Anlass: externes Audit vom 15.09.2026, Befund F12. `fetch-url-pdfs` nahm eine
 * beliebige Adresse entgegen und rief sie ab. Damit war der Server ein
 * Sprungbrett in das interne Netz, und weil die Function das Geladene als
 * base64 zurückgibt, sogar ein lesendes.
 *
 * Der eigentliche Prüfstein sind die ungewöhnlichen Schreibweisen. 127.0.0.1
 * erkennt jeder, aber 2130706433, 0177.0.0.1, 0x7f.1 und ::ffff:127.0.0.1 sind
 * dieselbe Adresse, und genau daran scheitern selbstgebaute Prüfungen.
 */

import { describe, it, expect } from "vitest";
import {
  ABLEHNUNGSTEXT,
  alsIPv4,
  alsIPv6,
  ipv4Gesperrt,
  ipv6Gesperrt,
  istErlaubteZieladresse,
  pruefeZieladresse,
  verlangeErlaubteZieladresse,
  ZieladresseAbgelehnt,
} from "../../supabase/functions/_shared/ziel-adresse.ts";

/** Kurzschreibweise: ist diese Adresse erlaubt? */
const erlaubt = (adresse: string) => istErlaubteZieladresse(adresse);

describe("alsIPv4 liest alle Schreibweisen einer IPv4-Adresse", () => {
  const ERWARTET_LOOPBACK = 2130706433; // 127.0.0.1

  it("liest die gewöhnliche Punktschreibweise", () => {
    expect(alsIPv4("127.0.0.1")).toBe(ERWARTET_LOOPBACK);
    expect(alsIPv4("0.0.0.0")).toBe(0);
    expect(alsIPv4("255.255.255.255")).toBe(4294967295);
  });

  it("liest die reine Dezimalzahl", () => {
    expect(alsIPv4("2130706433")).toBe(ERWARTET_LOOPBACK);
    expect(alsIPv4("3232235777")).toBe(alsIPv4("192.168.1.1"));
  });

  it("liest oktale Teile", () => {
    expect(alsIPv4("0177.0.0.1")).toBe(ERWARTET_LOOPBACK);
    expect(alsIPv4("0177.0.0.01")).toBe(ERWARTET_LOOPBACK);
    expect(alsIPv4("0300.0250.0.1")).toBe(alsIPv4("192.168.0.1"));
  });

  it("liest hexadezimale Teile", () => {
    expect(alsIPv4("0x7f.0.0.1")).toBe(ERWARTET_LOOPBACK);
    expect(alsIPv4("0x7f000001")).toBe(ERWARTET_LOOPBACK);
    expect(alsIPv4("0xC0.0xA8.0x00.0x01")).toBe(alsIPv4("192.168.0.1"));
  });

  it("liest verkürzte Formen, bei denen der letzte Teil auffüllt", () => {
    expect(alsIPv4("127.1")).toBe(ERWARTET_LOOPBACK);
    expect(alsIPv4("127.0.1")).toBe(ERWARTET_LOOPBACK);
    expect(alsIPv4("10.1")).toBe(alsIPv4("10.0.0.1"));
  });

  it("verträgt den abschließenden Wurzelpunkt", () => {
    expect(alsIPv4("127.0.0.1.")).toBe(ERWARTET_LOOPBACK);
  });

  it("weist zurück, was keine Adresse ist", () => {
    expect(alsIPv4("")).toBeNull();
    expect(alsIPv4("example.com")).toBeNull();
    expect(alsIPv4("127.0.0.1.2.3")).toBeNull();
    expect(alsIPv4("256.0.0.1")).toBeNull();
    expect(alsIPv4("127.0.0.256")).toBeNull();
    expect(alsIPv4("0900.0.0.1")).toBeNull(); // 9 gibt es im Oktalsystem nicht
    expect(alsIPv4("0xzz.0.0.1")).toBeNull();
    expect(alsIPv4("127..0.1")).toBeNull();
  });
});

describe("ipv4Gesperrt kennt die besonderen Netze", () => {
  const gesperrt = (adresse: string) => ipv4Gesperrt(alsIPv4(adresse)!);

  it("sperrt die Rückschleife", () => {
    expect(gesperrt("127.0.0.1")).not.toBeNull();
    expect(gesperrt("127.255.255.254")).not.toBeNull();
  });

  it("sperrt den Metadatendienst der Cloud", () => {
    expect(gesperrt("169.254.169.254")).not.toBeNull();
    expect(gesperrt("169.254.0.1")).not.toBeNull();
  });

  it("sperrt die drei privaten Netze", () => {
    expect(gesperrt("10.0.0.1")).not.toBeNull();
    expect(gesperrt("10.255.255.255")).not.toBeNull();
    expect(gesperrt("192.168.1.1")).not.toBeNull();
    expect(gesperrt("172.16.0.1")).not.toBeNull();
    expect(gesperrt("172.31.255.255")).not.toBeNull();
  });

  it("lässt die Nachbarn von 172.16 bis 172.31 in Ruhe", () => {
    // 172.15.x und 172.32.x sind öffentlich und dürfen nicht mitgesperrt werden
    expect(gesperrt("172.15.0.1")).toBeNull();
    expect(gesperrt("172.32.0.1")).toBeNull();
  });

  it("sperrt 0.0.0.0, Rundruf, Mehrfachempfang und das Trägernetz", () => {
    expect(gesperrt("0.0.0.0")).not.toBeNull();
    expect(gesperrt("255.255.255.255")).not.toBeNull();
    expect(gesperrt("224.0.0.1")).not.toBeNull();
    expect(gesperrt("100.64.0.1")).not.toBeNull();
  });

  it("lässt öffentliche Adressen durch", () => {
    expect(gesperrt("8.8.8.8")).toBeNull();
    expect(gesperrt("93.184.216.34")).toBeNull();
    expect(gesperrt("1.1.1.1")).toBeNull();
  });
});

describe("alsIPv6 liest IPv6-Adressen", () => {
  it("liest die volle Schreibweise", () => {
    expect(alsIPv6("2001:0db8:0000:0000:0000:0000:0000:0001"))
      .toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 1]);
  });

  it("liest die verkürzte Schreibweise mit zwei Doppelpunkten", () => {
    expect(alsIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(alsIPv6("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(alsIPv6("fe80::1")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("nimmt eckige Klammern und eine Zonenkennung an", () => {
    expect(alsIPv6("[::1]")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(alsIPv6("fe80::1%eth0")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("rechnet eine eingebettete IPv4-Adresse um", () => {
    expect(alsIPv6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(alsIPv6("::ffff:169.254.169.254")).toEqual([0, 0, 0, 0, 0, 0xffff, 0xa9fe, 0xa9fe]);
  });

  it("weist Unsinn zurück", () => {
    expect(alsIPv6("example.com")).toBeNull();
    expect(alsIPv6("1:2:3:4:5:6:7")).toBeNull();
    expect(alsIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(alsIPv6("::1::2")).toBeNull();
    expect(alsIPv6("::gggg")).toBeNull();
    expect(alsIPv6("::ffff:0177.0.0.1")).toBeNull();
  });
});

describe("ipv6Gesperrt lässt nur den weltweiten Bereich durch", () => {
  const gesperrt = (adresse: string) => ipv6Gesperrt(alsIPv6(adresse)!);

  it("sperrt die Rückschleife und die unbestimmte Adresse", () => {
    expect(gesperrt("::1")).not.toBeNull();
    expect(gesperrt("::")).not.toBeNull();
  });

  it("sperrt eindeutig lokale, link-lokale und Mehrfachempfangsadressen", () => {
    expect(gesperrt("fc00::1")).not.toBeNull();
    expect(gesperrt("fd12:3456::1")).not.toBeNull();
    expect(gesperrt("fe80::1")).not.toBeNull();
    expect(gesperrt("ff02::1")).not.toBeNull();
  });

  it("sperrt jede in IPv6 eingebettete IPv4-Adresse", () => {
    expect(gesperrt("::ffff:127.0.0.1")).not.toBeNull();
    expect(gesperrt("::ffff:169.254.169.254")).not.toBeNull();
    expect(gesperrt("::ffff:10.0.0.1")).not.toBeNull();
    // Auch eine öffentliche IPv4 in IPv6-Verpackung. Dafür gibt es hier keinen
    // Grund, und was man nicht braucht, lässt man nicht durch.
    expect(gesperrt("::ffff:8.8.8.8")).not.toBeNull();
  });

  it("sperrt Teredo, 6to4 und das Dokumentationsnetz", () => {
    expect(gesperrt("2001:0:1::1")).not.toBeNull();
    expect(gesperrt("2002:7f00:1::1")).not.toBeNull();
    expect(gesperrt("2001:db8::1")).not.toBeNull();
  });

  it("lässt weltweite Adressen durch", () => {
    expect(gesperrt("2606:4700:4700::1111")).toBeNull(); // Cloudflare
    expect(gesperrt("2a00:1450:4001:80f::200e")).toBeNull(); // Google
  });
});

describe("pruefeZieladresse lässt nur http und https zu", () => {
  it("weist fremde Schemata ab", () => {
    expect(erlaubt("file:///etc/passwd")).toBe(false);
    expect(erlaubt("file://localhost/etc/passwd")).toBe(false);
    expect(erlaubt("gopher://example.com:70/_test")).toBe(false);
    expect(erlaubt("ftp://example.com/datei.pdf")).toBe(false);
    expect(erlaubt("data:application/pdf;base64,AAAA")).toBe(false);
    expect(erlaubt("javascript:alert(1)")).toBe(false);
  });

  it("nimmt http und https an", () => {
    expect(erlaubt("http://example.com/datei.pdf")).toBe(true);
    expect(erlaubt("https://example.com/datei.pdf")).toBe(true);
  });

  it("nennt als Grund das Schema", () => {
    expect(pruefeZieladresse("file:///etc/passwd").grund).toBe("schema");
  });
});

describe("pruefeZieladresse weist interne Ziele ab", () => {
  it("weist localhost in allen Formen ab", () => {
    expect(erlaubt("http://localhost/datei.pdf")).toBe(false);
    expect(erlaubt("http://LOCALHOST/datei.pdf")).toBe(false);
    expect(erlaubt("http://localhost./datei.pdf")).toBe(false);
    expect(erlaubt("http://api.localhost/datei.pdf")).toBe(false);
    expect(erlaubt("http://localhost.localdomain/datei.pdf")).toBe(false);
  });

  it("weist die Rückschleife in jeder Schreibweise ab", () => {
    expect(erlaubt("http://127.0.0.1/datei.pdf")).toBe(false);
    expect(erlaubt("http://127.1/datei.pdf")).toBe(false);
    expect(erlaubt("http://2130706433/datei.pdf")).toBe(false);
    expect(erlaubt("http://0177.0.0.1/datei.pdf")).toBe(false);
    expect(erlaubt("http://0x7f000001/datei.pdf")).toBe(false);
    expect(erlaubt("http://0x7f.0.0.1/datei.pdf")).toBe(false);
    expect(erlaubt("http://[::1]/datei.pdf")).toBe(false);
    expect(erlaubt("http://[::ffff:127.0.0.1]/datei.pdf")).toBe(false);
    expect(erlaubt("http://[0:0:0:0:0:ffff:7f00:1]/datei.pdf")).toBe(false);
  });

  it("weist den Metadatendienst der Cloud ab", () => {
    expect(erlaubt("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(erlaubt("http://169.254.169.254/computeMetadata/v1/")).toBe(false);
    expect(erlaubt("http://2852039166/latest/meta-data/")).toBe(false); // dezimal
    expect(erlaubt("http://0251.0376.0251.0376/latest/")).toBe(false); // oktal
    expect(erlaubt("http://metadata.google.internal/computeMetadata/v1/")).toBe(false);
    expect(erlaubt("http://metadata.goog/")).toBe(false);
    expect(erlaubt("http://instance-data/latest/")).toBe(false);
    expect(erlaubt("http://[::ffff:169.254.169.254]/")).toBe(false);
  });

  it("weist die privaten Netze ab", () => {
    expect(erlaubt("http://10.0.0.5/")).toBe(false);
    expect(erlaubt("http://192.168.178.1/")).toBe(false);
    expect(erlaubt("http://172.16.0.1/")).toBe(false);
    expect(erlaubt("http://172.20.10.1/")).toBe(false);
    expect(erlaubt("http://172.31.255.254/")).toBe(false);
    expect(erlaubt("http://[fd00::1]/")).toBe(false);
    expect(erlaubt("http://[fe80::1]/")).toBe(false);
  });

  it("weist interne Namen und Namen ohne Punkt ab", () => {
    expect(erlaubt("http://drucker.local/")).toBe(false);
    expect(erlaubt("http://fileserver.intranet/")).toBe(false);
    expect(erlaubt("http://dienst.internal/")).toBe(false);
    expect(erlaubt("http://router/")).toBe(false);
    expect(erlaubt("http://supabase_kong/")).toBe(false);
  });

  it("weist Zugangsdaten in der Adresse ab", () => {
    // Hier ist 127.0.0.1 der Rechner, nicht drive.google.com
    expect(erlaubt("http://drive.google.com@127.0.0.1/datei.pdf")).toBe(false);
    expect(erlaubt("https://nutzer:wort@example.com/datei.pdf")).toBe(false);
    expect(pruefeZieladresse("https://nutzer:wort@example.com/").grund).toBe("zugangsdaten");
  });

  it("weist ungewöhnliche Ports ab", () => {
    expect(erlaubt("http://example.com:22/")).toBe(false);
    expect(erlaubt("http://example.com:5432/")).toBe(false);
    expect(erlaubt("http://example.com:8000/")).toBe(false);
    expect(pruefeZieladresse("http://example.com:22/").grund).toBe("port");
  });

  it("nimmt die üblichen Ports an", () => {
    expect(erlaubt("http://example.com:80/")).toBe(true);
    expect(erlaubt("https://example.com:443/")).toBe(true);
  });

  it("weist unlesbare Eingaben ab", () => {
    expect(erlaubt("")).toBe(false);
    expect(erlaubt("   ")).toBe(false);
    expect(erlaubt("kein link")).toBe(false);
    expect(istErlaubteZieladresse(null)).toBe(false);
    expect(istErlaubteZieladresse(undefined)).toBe(false);
    expect(istErlaubteZieladresse(42)).toBe(false);
    expect(istErlaubteZieladresse({ url: "https://example.com" })).toBe(false);
  });
});

describe("die erlaubten Sonderwege bleiben offen", () => {
  /*
   * Das ist der eigentliche Zweck der Function. Wenn hier etwas rot wird, ist
   * die Prüfung zu streng geraten und der Dienst kaputt.
   */
  const SONDERWEGE = [
    "https://onedrive.live.com/?authkey=AAA&id=BBB&cid=CCC",
    "https://1drv.ms/f/s!ABCDEFG",
    "https://1drv.ms/b/c/abc123/EinDokument",
    "https://moreimmo-my.sharepoint.com/:f:/g/personal/christian_more_immo/AbCdEf",
    "https://moreimmo.sharepoint.com/sites/Objekte/Freigegebene%20Dokumente/expose.pdf",
    "https://api.onedrive.com/v1.0/shares/u!aHR0cHM6Ly8xZHJ2Lm1zL2Yvcw/driveItem",
    "https://api.onedrive.com/v1.0/shares/u!aHR0cHM6Ly8xZHJ2Lm1z/root/children",
    "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing",
    "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp",
    "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp",
    "https://doc-0s-3c-docs.googleusercontent.com/docs/securesc/abc/def/0/datei.pdf",
    "https://public.bn.files.1drv.com/y4mABCDEF",
    "https://moreimmo-my.sharepoint.com/personal/x/_layouts/15/download.aspx?UniqueId=abc",
  ];

  it.each(SONDERWEGE)("lässt %s durch", (adresse) => {
    expect(erlaubt(adresse)).toBe(true);
  });

  it("lässt gewöhnliche öffentliche Adressen durch", () => {
    expect(erlaubt("https://osimmobilien.netlify.app/expose.pdf")).toBe(true);
    expect(erlaubt("https://osimmobilien.netlify.app/dokumente/haus.pdf")).toBe(true);
    expect(erlaubt("http://93.184.216.34/datei.pdf")).toBe(true);
    expect(erlaubt("https://[2606:4700:4700::1111]/datei.pdf")).toBe(true);
  });
});

describe("die Ablehnung verrät nichts über das interne Netz", () => {
  it("nennt dem Aufrufer immer denselben Satz", () => {
    const ziele = [
      "http://127.0.0.1/",
      "http://169.254.169.254/",
      "http://10.0.0.1/",
      "file:///etc/passwd",
      "http://example.com:22/",
    ];
    for (const ziel of ziele) {
      let gefangen: unknown = null;
      try {
        verlangeErlaubteZieladresse(ziel);
      } catch (e) {
        gefangen = e;
      }
      expect(gefangen).toBeInstanceOf(ZieladresseAbgelehnt);
      expect((gefangen as Error).message).toBe(ABLEHNUNGSTEXT);
    }
  });

  it("hält den Grund nur im Hinweis fest, nicht in der Nachricht", () => {
    const pruefung = pruefeZieladresse("http://169.254.169.254/");
    expect(pruefung.erlaubt).toBe(false);
    expect(pruefung.hinweis).toBeTruthy();
    expect(ABLEHNUNGSTEXT).not.toContain("169.254");
    expect(ABLEHNUNGSTEXT).not.toContain("127.0.0.1");
  });

  it("enthält keinen Gedankenstrich", () => {
    expect(ABLEHNUNGSTEXT).not.toMatch(/[–—]/);
  });

  it("gibt bei Erfolg die vereinheitlichte Adresse zurück", () => {
    expect(verlangeErlaubteZieladresse("https://Example.COM/Datei.pdf"))
      .toBe("https://example.com/Datei.pdf");
  });
});
