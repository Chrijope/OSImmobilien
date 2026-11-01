/**
 * Serverdaten der gängigen Mailanbieter, damit beim Verbinden niemand
 * Servernamen suchen muss (01.11.2026). Port 993/465: verschlüsselt ab der
 * ersten Zeile, 587: STARTTLS.
 */
export interface MailAnbieter {
  id: string;
  name: string;
  domains: string[];
  imap: string;
  imapPort: number;
  smtp: string;
  smtpPort: number;
  /** Verlangt der Anbieter ein eigenes App-Passwort statt des normalen? */
  appPasswort?: boolean;
  hinweis?: string;
}

export const ANBIETER: MailAnbieter[] = [
  {
    id: "gmail", name: "Gmail / Google Workspace", domains: ["gmail.com", "googlemail.com"],
    imap: "imap.gmail.com", imapPort: 993, smtp: "smtp.gmail.com", smtpPort: 465, appPasswort: true,
    hinweis: "Google verlangt ein App-Passwort: Google-Konto, Sicherheit, Bestätigung in zwei Schritten, App-Passwörter.",
  },
  {
    id: "icloud", name: "iCloud", domains: ["icloud.com", "me.com", "mac.com"],
    imap: "imap.mail.me.com", imapPort: 993, smtp: "smtp.mail.me.com", smtpPort: 587, appPasswort: true,
    hinweis: "Apple verlangt ein app-spezifisches Passwort: account.apple.com, Anmeldung und Sicherheit, App-spezifische Passwörter.",
  },
  { id: "ionos", name: "IONOS", domains: [], imap: "imap.ionos.de", imapPort: 993, smtp: "smtp.ionos.de", smtpPort: 465 },
  { id: "strato", name: "STRATO", domains: [], imap: "imap.strato.de", imapPort: 993, smtp: "smtp.strato.de", smtpPort: 465 },
  {
    id: "gmx", name: "GMX", domains: ["gmx.de", "gmx.net", "gmx.at", "gmx.ch"],
    imap: "imap.gmx.net", imapPort: 993, smtp: "mail.gmx.net", smtpPort: 465,
    hinweis: "Bei GMX zuerst in den Einstellungen „POP3/IMAP Abruf“ erlauben.",
  },
  {
    id: "webde", name: "WEB.DE", domains: ["web.de"],
    imap: "imap.web.de", imapPort: 993, smtp: "smtp.web.de", smtpPort: 587,
    hinweis: "Bei WEB.DE zuerst in den Einstellungen „POP3/IMAP Abruf“ erlauben.",
  },
  {
    id: "tonline", name: "Telekom (t-online.de)", domains: ["t-online.de", "magenta.de"],
    imap: "secureimap.t-online.de", imapPort: 993, smtp: "securesmtp.t-online.de", smtpPort: 465, appPasswort: true,
    hinweis: "Die Telekom verlangt das eigene E-Mail-Passwort aus dem Telekom-Kundencenter, nicht das Login-Passwort.",
  },
  {
    id: "microsoft", name: "Outlook / Microsoft 365", domains: ["outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de"],
    imap: "outlook.office365.com", imapPort: 993, smtp: "smtp.office365.com", smtpPort: 587,
    hinweis: "Microsoft lehnt die Anmeldung mit Passwort meist ab. Dafür gibt es „Mit Microsoft anmelden“, sobald es eingerichtet ist.",
  },
];

export function anbieterFuerAdresse(adresse: string): MailAnbieter | undefined {
  const domain = adresse.trim().toLowerCase().split("@")[1];
  if (!domain) return undefined;
  return ANBIETER.find((a) => a.domains.includes(domain));
}
