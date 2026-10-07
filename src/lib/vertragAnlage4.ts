/**
 * Anlage 4 zum Vertriebspartnervertrag: Vereinbarung über die gemeinsame
 * Verantwortlichkeit nach Art. 26 DSGVO (Meta Pixel und Conversions API auf
 * Partnerseiten).
 *
 * Der Text steht nur hier, damit Korrekturen aus der Prüfung an einer Stelle
 * landen. Er gilt ab der Vertragsfassung 2026-09-26
 * (VERTRAGSFASSUNG_MIT_ANLAGE_4); ältere Fassungen enthalten ihn nicht, und
 * Bestandspartner bekommen ihn nicht nachträglich (Christians Entscheidung
 * vom 26.09.2026, Variante A).
 *
 * Grundlage ist der Entwurf von Dr. Hellwig vom 26.09.2026 mit den
 * Änderungen aus der Codex-Prüfung desselben Tages:
 * - § 1 Absatz 2: Bestandteil des Vertrages, keine gesonderte Bestätigung
 *   per Klick; die Pflichten gelten, sobald eine eigene Pixel-ID genutzt wird.
 * - § 2 Absatz 2: Für Anfragen im CRM gilt die Rollenverteilung der Anlage 2.
 * - § 2 Absatz 4: Retargeting ohne Ausnahme untersagt.
 * - § 8 Absatz 1 und § 10 Absatz 1 an § 1 Absatz 2 angeglichen (keine
 *   Bestätigung, Entfernen der Pixel-ID lässt die Pflichten ruhen).
 * - § 9 Absatz 4: § 11 des Hauptvertrages gilt, Art. 82 Absatz 5 DSGVO
 *   bleibt unberührt. § 9 Absatz 5: nur die neuen Pflichten sind ohne
 *   Vertragsstrafe.
 * - § 11 Absatz 3: Textform nur für spätere Änderungen.
 * Die Prüfvermerke des Entwurfs ([Anwalt A1] usw.) gehören nicht in den
 * Vertragstext. Nicht anwaltlich geprüft.
 */

import type { KlauselTools } from "./vertragKonditionen";

export const ANLAGE_4_TITEL =
  "Vereinbarung über die gemeinsame Verantwortlichkeit nach Art. 26 DSGVO (Meta Pixel und Conversions API auf Partnerseiten)";

export const ANLAGE_4_PARAGRAPHEN: { titel: string; absaetze: string[] }[] = [
  {
    titel: "§ 1 Gegenstand, Geltung und Rang",
    absaetze: [
      "(1) Diese Vereinbarung regelt nach Art. 26 DSGVO, wie die Gesellschaft und der Vertriebspartner ihre datenschutzrechtlichen Pflichten verteilen, wenn auf den Partnerseiten das Meta Pixel des Vertriebspartners eingesetzt wird und Anfragen über die Conversions API an dieses Pixel gemeldet werden. Partnerseiten sind die öffentliche persönliche Seite des Vertriebspartners (/vp/<Kürzel>) und seine Handbuch-Seite (/handbuch/<Kürzel>) im System der Gesellschaft. Weitere Seiten werden nur erfasst, wenn die Gesellschaft sie dem Vertriebspartner in Textform benennt.",
      "(2) Diese Vereinbarung ist Bestandteil des Vertriebspartnervertrages und wird mit ihm geschlossen. Ihre Pflichten gelten, sobald und solange der Vertriebspartner im CRM-System eine eigene Meta-Pixel-ID hinterlegt hat und diese auf den Partnerseiten genutzt wird. Solange keine Pixel-ID hinterlegt ist, lädt die Gesellschaft kein Pixel des Vertriebspartners und meldet keine Ereignisse an Meta.",
      "(3) Der Einsatz des Pixels ist freiwillig. Er ist keine Pflicht aus dem Hauptvertrag und keine Weisung der Gesellschaft; auf Provision, Leadzuteilung und sonstige Konditionen hat er keinen Einfluss.",
      "(4) Diese Anlage regelt ihren Gegenstand abschließend. Sie geht insoweit § 9 Absatz 4 des Hauptvertrages und der Auftragsverarbeitungsvereinbarung (Anlage 2) ausdrücklich vor (§ 14 Absatz 2 des Hauptvertrages). Im Übrigen gilt § 11.",
    ],
  },
  {
    titel: "§ 2 Gemeinsame und getrennte Verantwortung",
    absaetze: [
      "(1) Gemeinsam verantwortlich sind die Parteien für folgende Verarbeitungsschritte:",
      "(a) das Laden des Meta Pixels des Vertriebspartners auf den Partnerseiten nach Einwilligung des Besuchers und die dadurch bewirkte Erhebung und Übermittlung von Nutzungsdaten an Meta Platforms Ireland Ltd. (Meta). Erfasst sind insbesondere IP-Adresse, Browser- und Geräteangaben, die aufgerufene Seitenadresse, der Zeitpunkt, von Meta gesetzte Kennungen sowie die Ereignisse Seitenaufruf und Anfrage;",
      "(b) die Meldung einer über eine Partnerseite abgesendeten Anfrage vom Server der Gesellschaft an das Pixel des Vertriebspartners über die Conversions API von Meta. Die Meldung besteht aus Ereignisname, Zeitpunkt, Seitenadresse, einer Ereigniskennung zum Abgleich mit der Meldung aus dem Browser sowie E-Mail-Adresse und Telefonnummer des Anfragenden, beide vor dem Versand normalisiert und als SHA-256-Hashwert. Weitere Angaben aus dem Anfrageformular werden nicht übermittelt, insbesondere nicht Name, Einkommen, Eigenkapital, Anliegen oder Nachrichten.",
      "(2) Für die Verarbeitung der Anfragen im CRM-System gelten § 7 des Hauptvertrages und die Rollenverteilung der Anlage 2 unverändert: Für Gesellschaftskontakte ist die Gesellschaft Verantwortliche und der Vertriebspartner Auftragsverarbeiter nach Art. 28 DSGVO, für Eigenkontakte ist der Vertriebspartner selbst Verantwortlicher. Für den Betrieb der Partnerseiten, soweit er nicht unter Absatz 1 fällt, ist die Gesellschaft allein verantwortlich. Diese Anlage ändert nicht, ob ein Kontakt Gesellschaftskontakt oder Eigenkontakt ist.",
      "(3) Allein verantwortlich ist der Vertriebspartner für jede Verarbeitung nach der Übermittlung an Meta, soweit er sie nicht nach den mit Meta vereinbarten Bedingungen gemeinsam mit Meta verantwortet. Dazu gehören insbesondere der Abgleich mit Nutzerkonten, die Auswertung im Werbekonto, Speicherdauer und Löschung bei Meta sowie eine Übermittlung in Drittländer durch Meta. Die Gesellschaft hat auf diese Verarbeitung keinen Einfluss und keinen Zugriff auf das Werbekonto des Vertriebspartners.",
      "(4) Zweck der Verarbeitung nach Absatz 1 ist allein, den Erfolg der eigenen Werbeanzeigen des Vertriebspartners, die auf Partnerseiten führen, zu messen und zu verbessern. Die Gesellschaft verfolgt dabei das Interesse, dass über die Partnerseiten Anfragen entstehen, die über sie vermittelt werden; Auswertungen aus dem Werbekonto erhält sie nicht. Zielgruppen aus Besuchern der Partnerseiten darf der Vertriebspartner nicht bilden, insbesondere keine Zielgruppen zum Retargeting (Custom Audiences) und keine darauf aufbauenden ähnlichen Zielgruppen (Lookalike Audiences).",
      "(5) Rechtsgrundlage der Verarbeitung nach Absatz 1 ist die Einwilligung des Besuchers nach § 25 Absatz 1 TDDDG und Art. 6 Absatz 1 Buchstabe a DSGVO. Ohne wirksame Einwilligung findet keiner der Schritte nach Absatz 1 statt.",
      "(6) Die Übermittlung nach Absatz 1 Buchstabe b ist keine unzulässige Nutzung oder Weitergabe im Sinne von § 7 Absatz 6 des Hauptvertrages. Weitere Übermittlungen von Kontaktdaten an Meta oder andere Werbeplattformen sind damit nicht freigegeben.",
    ],
  },
  {
    titel: "§ 3 Information der Betroffenen",
    absaetze: [
      "(1) Die Gesellschaft erfüllt für beide Parteien die Informationspflichten nach Art. 13 DSGVO für die Verarbeitung nach § 2 Absatz 1, und zwar in ihrer Datenschutzerklärung und im Einwilligungshinweis der Partnerseiten. Sie nennt dort den Vertriebspartner als gemeinsam Verantwortlichen mit Name oder Firma und einer ladungsfähigen Anschrift. Der Vertriebspartner stellt diese Angaben bereit, hält sie im CRM-System aktuell und ist mit ihrer Veröffentlichung auf seinen Partnerseiten zu diesem Zweck einverstanden.",
      "(2) Die Gesellschaft stellt den Betroffenen den wesentlichen Inhalt dieser Vereinbarung nach Art. 26 Absatz 2 Satz 2 DSGVO zur Verfügung, in der Fassung des Anhangs „Wesentlicher Inhalt für Betroffene“, in ihrer Datenschutzerklärung und über einen Verweis im Einwilligungshinweis.",
      "(3) Über Verarbeitungen, für die er nach § 2 Absatz 3 allein verantwortlich ist, informiert der Vertriebspartner selbst. In Anzeigen und auf eigenen Kanälen macht er keine Angaben zur Datenverarbeitung auf den Partnerseiten, die dieser Vereinbarung oder der Datenschutzerklärung der Gesellschaft widersprechen.",
      "(4) Ändert die Gesellschaft Texte nach Absatz 1 oder 2, soweit sie diesen Gegenstand betreffen, teilt sie dies dem Vertriebspartner in Textform mit.",
    ],
  },
  {
    titel: "§ 4 Einwilligung",
    absaetze: [
      "(1) Die Gesellschaft holt die Einwilligung der Besucher ein und verwaltet sie. Sie lädt das Pixel erst nach Zustimmung in der Kategorie Marketing und meldet ein Ereignis über die Conversions API nur, wenn für den Besuch diese Einwilligung vorliegt. Auf jeder Partnerseite hält sie einen Weg bereit, die Einwilligung jederzeit so einfach zu widerrufen, wie sie erteilt wurde (Art. 7 Absatz 3 DSGVO).",
      "(2) Die Gesellschaft dokumentiert den Ablauf der Einwilligung so, dass er nach Art. 7 Absatz 1 DSGVO nachgewiesen werden kann, insbesondere Hinweistexte, deren Fassungen und die technische Umsetzung.",
      "(3) Der Vertriebspartner bindet auf den Partnerseiten keine eigenen Skripte, Tag-Manager oder sonstigen Messwerkzeuge ein. Er nutzt keine Einstellung und kein Verfahren, das die Einwilligungsverwaltung der Gesellschaft umgeht.",
    ],
  },
  {
    titel: "§ 5 Rechte der Betroffenen",
    absaetze: [
      "(1) Betroffene können ihre Rechte bei und gegenüber jeder Partei geltend machen (Art. 26 Absatz 3 DSGVO). Zentrale Anlaufstelle ist die Gesellschaft.",
      "(2) Erhält der Vertriebspartner ein Ersuchen, das die Verarbeitung nach § 2 Absatz 1 betrifft, leitet er es unverzüglich, spätestens innerhalb von drei Werktagen nach Eingang, in Textform an die Gesellschaft weiter. Geht bei der Gesellschaft ein Ersuchen ein, das eine Verarbeitung nach § 2 Absatz 3 betrifft, leitet sie es in derselben Frist an den Vertriebspartner weiter und teilt dem Betroffenen mit, an wen es weitergeleitet wurde.",
      "(3) Ersuchen zu § 2 Absatz 1 beantwortet die Gesellschaft innerhalb der Frist des Art. 12 Absatz 3 DSGVO. Der Vertriebspartner liefert die dafür nötigen Angaben und Mitwirkungen innerhalb von sieben Tagen nach Anforderung in Textform, insbesondere zu den Einstellungen seines Pixels und zu den Möglichkeiten, Daten in seinem Werbekonto zu löschen. Ersuchen zu § 2 Absatz 3 beantwortet der Vertriebspartner selbst innerhalb der gesetzlichen Frist.",
      "(4) Widerspricht ein Betroffener oder widerruft er seine Einwilligung, stellt die Gesellschaft sicher, dass für ihn keine weiteren Übermittlungen nach § 2 Absatz 1 stattfinden, soweit er ihr bekannt und technisch zuordenbar ist. Der Vertriebspartner veranlasst im Rahmen der Möglichkeiten, die Meta bietet, die Löschung bereits übermittelter Daten.",
      "(5) Die Parteien unterstützen einander dabei unentgeltlich.",
    ],
  },
  {
    titel: "§ 6 Sicherheit der Verarbeitung",
    absaetze: [
      "(1) Die Gesellschaft schützt die Partnerseiten und die Übermittlung nach § 2 Absatz 1 mit den Maßnahmen nach § 4 der Anlage 2. Die Verbindungen laufen verschlüsselt über TLS 1.2 oder höher. E-Mail-Adresse und Telefonnummer verlassen die Server der Gesellschaft nur als Hashwert nach § 2 Absatz 1 Buchstabe b.",
      "(2) Den Zugriffsschlüssel für die Conversions API (Token) erzeugt der Vertriebspartner ausschließlich für sein eigenes Pixel. Die Gesellschaft speichert ihn so, dass er nur serverseitig zugänglich ist und nach dem Speichern niemandem mehr angezeigt wird. Sie verwendet ihn ausschließlich für Meldungen nach § 2 Absatz 1 Buchstabe b und löscht ihn, sobald der Vertriebspartner ihn oder seine Pixel-ID entfernt oder diese Vereinbarung endet.",
      "(3) Der Vertriebspartner sichert sein Werbekonto und sein Unternehmenskonto bei Meta nach dem Stand der Technik, insbesondere mit einer Anmeldung in zwei Schritten. Dritten gewährt er nur den Zugriff, den sie benötigen. Vermutet er einen Missbrauch, widerruft er das Token unverzüglich bei Meta und teilt dies der Gesellschaft mit.",
    ],
  },
  {
    titel: "§ 7 Verletzungen des Schutzes personenbezogener Daten",
    absaetze: [
      "(1) Jede Partei informiert die andere unverzüglich, spätestens 24 Stunden nach Kenntnis, in Textform über jede Verletzung des Schutzes personenbezogener Daten, die die Verarbeitung nach § 2 Absatz 1 betrifft. Sie gibt dabei die Angaben nach Art. 33 Absatz 3 DSGVO an, soweit sie vorliegen, und reicht fehlende Angaben unverzüglich nach.",
      "(2) Die Meldung an die Aufsichtsbehörde nach Art. 33 DSGVO und die Benachrichtigung der Betroffenen nach Art. 34 DSGVO übernimmt die Partei, in deren Bereich die Verletzung eingetreten ist. Das ist die Gesellschaft für Partnerseiten, Server, Einwilligungsverwaltung und die Speicherung des Tokens, der Vertriebspartner für sein Werbekonto, seine Pixel-Einstellungen und sein Token außerhalb des Systems der Gesellschaft. Ist der Bereich nicht innerhalb von 48 Stunden nach Kenntnis geklärt, meldet die Gesellschaft, und der Vertriebspartner wirkt mit. Die Frist von 72 Stunden nach Art. 33 Absatz 1 DSGVO geht jeder Abstimmung vor.",
      "(3) Den Wortlaut einer Benachrichtigung nach Art. 34 DSGVO stimmen die Parteien nach Möglichkeit vorab ab. Jede Partei dokumentiert Verletzungen in ihrem Bereich nach Art. 33 Absatz 5 DSGVO.",
    ],
  },
  {
    titel: "§ 8 Pflichten des Vertriebspartners gegenüber Meta, Einstellungen des Pixels",
    absaetze: [
      "(1) Bevor er seine Pixel-ID hinterlegt, nimmt der Vertriebspartner über sein eigenes Werbekonto die Nutzungsbedingungen von Meta für die Business Tools einschließlich des Zusatzes für gemeinsam Verantwortliche (Controller Addendum) an. Mit dem Hinterlegen der Pixel-ID im CRM-System erklärt er, dass dies geschehen ist. Er hinterlegt ausschließlich ein Pixel, das zu einem Werbekonto gehört, das er selbst verantwortet.",
      "(2) Der Vertriebspartner hält die Einstellungen seines Pixels datensparsam. Er schaltet insbesondere den automatischen erweiterten Abgleich (Automatic Advanced Matching) ab, ebenso die automatische Erfassung weiterer Ereignisse, soweit Meta dies anbietet. Er nutzt keine Funktion, die über § 2 Absatz 1 hinaus Daten von den Partnerseiten an Meta übermittelt.",
      "(3) Kontaktdaten von Gesellschaftskontakten (§ 7 Absatz 2 des Hauptvertrages) lädt der Vertriebspartner nicht in Werbekonten hoch, auch nicht als Hashwert oder Kundenliste. § 7 Absatz 6 und § 9 des Hauptvertrages bleiben unberührt.",
      "(4) § 6 Absatz 3 des Hauptvertrages über die Freigabe von Werbung mit Bezug zur Gesellschaft bleibt unberührt.",
      "(5) Auf Verlangen weist der Vertriebspartner der Gesellschaft in Textform nach, dass er die Pflichten nach den Absätzen 1 und 2 einhält, im Regelfall durch Bildschirmaufnahmen der betreffenden Einstellungen.",
    ],
  },
  {
    titel: "§ 9 Haftung und Freistellung im Innenverhältnis",
    absaetze: [
      "(1) Gegenüber Betroffenen haften die Parteien nach Art. 82 Absatz 4 DSGVO; diese Anlage ändert daran nichts.",
      "(2) Im Innenverhältnis trägt jede Partei den Schaden, der auf einer schuldhaften Verletzung ihrer Pflichten aus dieser Anlage beruht (Art. 82 Absatz 5 DSGVO). Haben beide Parteien zu dem Schaden beigetragen, gilt § 254 BGB entsprechend.",
      "(3) Wird eine Partei wegen einer Verarbeitung nach § 2 Absatz 1 von einem Betroffenen, einer Behörde oder einem sonstigen Dritten in Anspruch genommen und beruht dies auf einer schuldhaften Pflichtverletzung der anderen Partei, stellt die andere Partei sie in diesem Umfang von den Ansprüchen und den angemessenen Kosten der Rechtsverteidigung frei. Die in Anspruch genommene Partei unterrichtet die andere unverzüglich, erkennt Ansprüche nicht ohne deren Zustimmung an und überlässt ihr die Führung der Verteidigung, soweit dies rechtlich möglich ist. Ob und inwieweit Geldbußen im Innenverhältnis ausgeglichen werden, richtet sich nach dem Gesetz.",
      "(4) § 11 des Hauptvertrages gilt auch für diese Anlage. Der gesetzliche Ausgleich unter den Parteien nach Art. 82 Absatz 5 DSGVO bleibt unberührt.",
      "(5) Die Pflichten, die allein diese Anlage begründet, lösen keine zusätzliche Vertragsstrafe aus. Verletzt ein Verhalten zugleich Pflichten des Hauptvertrages, bleibt es nach § 10 des Hauptvertrages sanktioniert.",
    ],
  },
  {
    titel: "§ 10 Dauer, Beendigung und Deaktivierung",
    absaetze: [
      "(1) Entfernt der Vertriebspartner seine Pixel-ID im CRM-System, ruhen die Pflichten nach dieser Anlage für die Zukunft, ohne dass es einer Kündigung bedarf; die Absätze 4 und 5 gelten entsprechend. Die Vereinbarung endet in jedem Fall mit dem Ende des Hauptvertrages.",
      "(2) Die Gesellschaft kann diese Vereinbarung mit einer Frist von einem Monat in Textform kündigen, etwa wenn sie die Funktion für alle Vertriebspartner einstellt. Das Recht zur außerordentlichen Kündigung bleibt unberührt.",
      "(3) Die Gesellschaft darf Pixel-ID und Token des Vertriebspartners sofort deaktivieren, wenn",
      "(a) tatsächliche Anhaltspunkte für einen Verstoß gegen § 2 Absatz 4, § 4 Absatz 3, § 6 Absatz 3 oder § 8 bestehen,",
      "(b) eine Aufsichtsbehörde oder ein Gericht die Verarbeitung beanstandet oder untersagt,",
      "(c) sich Rechtslage, Rechtsprechung oder die Bedingungen von Meta so ändern, dass die Verarbeitung nach dieser Anlage nicht mehr rechtssicher möglich ist, oder",
      "(d) der Vertriebspartner eine neue Fassung dieser Anlage nach § 11 Absatz 2 noch nicht bestätigt hat.",
      "Sie teilt ihm die Deaktivierung und ihren Grund unverzüglich in Textform mit und aktiviert die Pixel-ID wieder, sobald der Grund entfallen ist. Eine berechtigte Deaktivierung begründet keine Ansprüche des Vertriebspartners.",
      "(4) Mit der Beendigung entfernt die Gesellschaft das Pixel von den Partnerseiten, stellt die Meldungen über die Conversions API ein und löscht das Token. Die Löschung bereits an Meta übermittelter Daten veranlasst der Vertriebspartner in eigener Verantwortung (§ 2 Absatz 3).",
      "(5) Für Verarbeitungen vor der Beendigung gelten die §§ 5, 7 und 9 fort.",
    ],
  },
  {
    titel: "§ 11 Verhältnis zu Anlage 2, Schlussbestimmungen",
    absaetze: [
      "(1) Soweit diese Anlage nichts Abweichendes regelt, gelten Anlage 2 und der Hauptvertrag, insbesondere dessen §§ 9 und 14.",
      "(2) Erfordern Rechtsprechung, Vorgaben der Aufsichtsbehörden oder geänderte Bedingungen von Meta eine Anpassung dieser Anlage, legt die Gesellschaft dem Vertriebspartner eine angepasste Fassung in Textform vor. Bis er sie bestätigt, ruht die Verarbeitung nach § 2 Absatz 1 (§ 10 Absatz 3 Buchstabe d). Eine einseitige Änderung findet nicht statt.",
      "(3) Spätere Änderungen und die Beendigung dieser Anlage bedürfen der Textform (§ 126b BGB); eine angepasste Fassung nach Absatz 2 kann auch durch Bestätigung im CRM-System vereinbart werden. Insoweit genügt abweichend von § 14 Absatz 3 des Hauptvertrages die Textform.",
      "(4) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt; im Übrigen gilt § 14 des Hauptvertrages.",
    ],
  },
];

/**
 * Der wesentliche Inhalt der Vereinbarung für Betroffene (Art. 26 Absatz 2
 * Satz 2 DSGVO). Hängt als Anhang an Anlage 4 (§ 3 Absatz 2) und ist der
 * Textbaustein für die Datenschutzerklärung. Gruppe F, deshalb Sie-Form.
 */
export const ANLAGE_4_BETROFFENEN_TITEL = "Gemeinsame Verantwortlichkeit für das Meta Pixel auf den Seiten unserer Vertriebspartner";

export const ANLAGE_4_BETROFFENEN_TEXT: string[] = [
  "Auf den persönlichen Seiten unserer Vertriebspartner (seine Seite unter /vp/ und seine Handbuch-Seite unter /handbuch/ samt Konfigurator, jeweils mit seinem Kürzel in der Adresse) kann der jeweilige Vertriebspartner das Meta Pixel einsetzen. Auf der Selbstauskunft der Handbuch-Seite und auf Seiten mit einem persönlichen Link lädt kein Pixel. Damit misst er, ob seine eigenen Werbeanzeigen auf Facebook und Instagram Erfolg haben. Dafür sind OS Immobilien und der Vertriebspartner, dessen Seite Sie besuchen, nach Art. 26 DSGVO gemeinsam verantwortlich. Name und Anschrift des Vertriebspartners finden Sie im Datenschutzhinweis auf seiner Seite.",
  "Gemeinsam verantwortlich sind wir für zwei Schritte. Erstens für das Laden des Meta Pixels, nachdem Sie eingewilligt haben, und die Übermittlung Ihrer Nutzungsdaten an Meta Platforms Ireland Ltd., etwa IP-Adresse, Browserangaben, besuchte Seite, Seitenaufruf und das Absenden einer Anfrage. Zweitens für die Meldung einer abgesendeten Anfrage von unserem Server an Meta (Conversions API). Dabei werden Ihre E-Mail-Adresse und Telefonnummer nur als Hashwert übertragen. Meta erhält so nicht den Klartext, kann den Hashwert aber mit eigenen Daten abgleichen und Ihre Anfrage dadurch einem Konto zuordnen. Weitere Angaben aus Ihrer Anfrage übermitteln wir nicht. Ohne Ihre Einwilligung findet keiner der beiden Schritte statt.",
  "Was nach der Übermittlung bei Meta geschieht, verantworten der Vertriebspartner und Meta, nicht OS Immobilien. Einzelheiten finden Sie in der Datenschutzrichtlinie von Meta. Dabei kann es zu einer Übermittlung in die USA kommen.",
  "So sind die Aufgaben verteilt: OS Immobilien betreibt die Seiten, holt Ihre Einwilligung ein, informiert Sie über die Verarbeitung und ist Ihre zentrale Anlaufstelle. Der Vertriebspartner verantwortet sein Werbekonto bei Meta, hält die Einstellungen seines Pixels datensparsam und nutzt die Daten nur, um den Erfolg seiner Anzeigen zu messen.",
  "Sie können Ihre Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegenüber jedem von uns geltend machen. Am schnellsten geht es über OS Immobilien Holding GmbH, Am Ostbahnhof 1, 15749 Mittenwalde, os@os-immobilien.com. Wenn nötig, leiten wir Ihr Anliegen an den Vertriebspartner weiter. Ihre Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen, über den Link „Cookie-Einstellungen“ im Fuß jeder Seite. Außerdem können Sie sich bei einer Datenschutzaufsichtsbehörde beschweren.",
];

/** Rendert Anlage 4 samt Anhang für Betroffene. */
export function renderAnlage4MetaPixel(t: Pick<KlauselTools, "h1" | "p">): void {
  for (const paragraph of ANLAGE_4_PARAGRAPHEN) {
    t.h1(paragraph.titel);
    for (const absatz of paragraph.absaetze) t.p(absatz);
  }
  t.h1("Anhang zu § 3 Absatz 2: Wesentlicher Inhalt für Betroffene");
  t.p(ANLAGE_4_BETROFFENEN_TITEL);
  for (const absatz of ANLAGE_4_BETROFFENEN_TEXT) t.p(absatz);
}
