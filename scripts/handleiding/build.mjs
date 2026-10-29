// Bouwt handleiding-out/HHC-ClubSupport-handleiding.pdf uit de opnames in handleiding-out/shots
// (zie scripts/handleiding/capture.test.ts). A4 staand, in dezelfde stijl als de pitch.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "handleiding-out");
const U = (p) => pathToFileURL(path.join(root, p)).href;
const shot = (n) => U(`handleiding-out/shots/${n}.png`);
const font = (f) => U(`public/fonts/${f}.woff2`);
const logo = `<img class="logo" src="${U("public/brand/logo.png")}" alt="HHC ClubSupport">`;
const VERSIE = "Versie 1.0 · oktober 2026";

/* ---------- bouwstenen ---------- */
// Telefoon: afbeelding is 780 px breed (iPhone 2x); y en h in originele pixels van de opname.
const phone = (n, cap, { w = 176, h = 380, y = 0 } = {}) => {
  const k = (w - 8) / 780; // binnenbreedte van het kader
  return `<figure class="ph" style="width:${w}px"><div class="dev" style="height:${h}px"><img src="${shot(n)}" style="width:${w - 8}px;margin-top:-${Math.round(y * k)}px" alt=""></div>${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
};
// Bureaublad: opname is 2200 px breed (1100 x 2). Uitsnede in originele pixels: x/cw (breedte), y/ch (hoogte).
// Standaard de middenkolom van 980 px (x=120, cw=1960): dat is leesbaar op A4 (schaal ca. 0,7).
const desk = (n, cap, { w = 682, x = 120, cw = 1960, y = 0, ch = 1200 } = {}) => {
  const k = w / cw;
  return `<figure class="dk" style="width:${w}px"><div class="scr" style="height:${Math.round(ch * k)}px"><img src="${shot(n)}" style="width:${Math.round(2200 * k)}px;margin-left:-${Math.round(x * k)}px;margin-top:-${Math.round(y * k)}px" alt=""></div>${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
};
const ul = (...items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
const steps = (...items) => `<ol class="steps">${items.map((i) => `<li><span>${i}</span></li>`).join("")}</ol>`;
const tip = (t, b) => `<div class="tip"><b>${t}</b>${b}</div>`;
const warn = (t, b) => `<div class="warn"><b>${t}</b>${b}</div>`;
const table = (head, rows, cls = "") => `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const badge = (t, c = "") => `<span class="bd ${c}">${t}</span>`;

let n = 0;
const toc = [];
/** Inhoudspagina: kicker + titel + hoofdtekst. `chap` zet de pagina in de inhoudsopgave. */
const page = ({ chap, k, title, body, toctitle }) => {
  n += 1;
  if (toctitle) toc.push({ t: toctitle, p: n, chap });
  return `<section class="page"><div class="hd"><img src="${U("public/brand/logo-small.png")}" alt=""><span>Handleiding</span><em>${chap ?? ""}</em></div><div class="bd-wrap"><p class="k">${k}</p><h2>${title}</h2>${body}</div><div class="ft"><span>HHC ClubSupport — Handleiding</span><b>${String(n).padStart(2, "0")}</b></div></section>`;
};
const cols = (left, right, cls = "") => `<div class="cols ${cls}"><div class="l">${left}</div><div class="r">${right}</div></div>`;
const row = (...x) => `<div class="frow">${x.join("")}</div>`;

/* ---------- pagina's ---------- */
const pages = [];

// Omslag
n += 1;
pages.push(`<section class="page cover"><div class="cv">${logo}<p class="k">Supportersvereniging HHC Hardenberg</p><h1>Handleiding</h1><p class="lead">HHC ClubSupport: Ledenpas, Scanner en Beheer.<br>Stap voor stap, met schermafbeeldingen.</p></div><div class="cvph">${phone("ledenpas-een-pas", "", { w: 212, h: 470 })}${phone("scanner-geldig", "", { w: 212, h: 470 })}</div><p class="ver">${VERSIE}</p></section>`);

pages.push("@@TOC@@");
n += 1; // de inhoudsopgave is pagina 2

// 1. Kennismaking
pages.push(page({ chap: "1 · Kennismaking", toctitle: "Wat is HHC ClubSupport?", k: "Hoofdstuk 1 · Kennismaking", title: "Wat is HHC ClubSupport?", body: `
<p class="lead2">HHC ClubSupport is de digitale ledenpas van supportersvereniging HHC Hardenberg. Een lid heeft de pas op de telefoon. Een controleur scant de QR-code en ziet direct of de pas nu geldig is. Het bestuur beheert alles op één plek.</p>
<div class="tiles">
  <div class="tile"><span class="nm">1</span><h3>Ledenpas</h3><p>Voor <b>leden</b>. Inloggen, de pas tonen, bewaren of afdrukken, gegevens wijzigen aanvragen.</p></div>
  <div class="tile"><span class="nm">2</span><h3>Scanner</h3><p>Voor <b>controleurs</b>. QR-codes scannen of een lid zoeken. Elke controle is live.</p></div>
  <div class="tile"><span class="nm">3</span><h3>Beheer</h3><p>Voor <b>bestuur en ledenadministratie</b>. Leden, passen, import, nieuwsbrieven, accounts en toezicht.</p></div>
</div>
<h3 class="sub">Hoe ga ik ernaartoe?</h3>
${table(["Ik ben…", "Ik open…", "Ik log in met…"], [["Lid", "<b>Ledenpas</b> op het adres van de vereniging (of de app op je beginscherm)", "Het e-mailadres en wachtwoord van mijn account"], ["Controleur", "<b>Scanner</b>, een eigen app met een eigen adres", "Mijn persoonlijke staf-account"], ["Beheerder", "<b>Beheer</b>, niet gelinkt vanaf de ledenpagina's", "Mijn persoonlijke staf-account plus tweestapsverificatie"]])}
${tip("Eén account per persoon", "Iedereen meldt zich persoonlijk aan. Deel je inlog nooit met een ander: elke handeling wordt vastgelegd op naam van het account.")}
<h3 class="sub">Zo werkt het in één zin</h3>
<p>Een pas is een unieke code. De scanner vraagt bij <b>elke scan</b> aan de server of de pas nu geldig is. Een kwijtgeraakte of gekopieerde pas kan daarom direct worden ingetrokken.</p>` }));

pages.push(page({ chap: "1 · Kennismaking", toctitle: "Begrippen en spelregels", k: "Hoofdstuk 1 · Kennismaking", title: "Begrippen en spelregels", body: `
<p class="lead2">Vier dingen worden bewust uit elkaar gehouden. Dat voorkomt fouten en maakt duidelijk wie wat beslist.</p>
${table(["Begrip", "Wat is het?", "Wie wijzigt het?"], [
  ["<b>Lid</b>", "De persoon in het ledenbestand: naam, lidnummer en optioneel een e-mailadres.", "Ledenbeheer"],
  ["<b>Lidmaatschap</b>", "Of iemand nu lid is: <i>actief</i>, <i>geschorst</i> of <i>beëindigd</i>, met een begin- en einddatum.", "Ledenbeheer"],
  ["<b>Account</b>", "De inlog (e-mailadres en wachtwoord). Eén account kan aan meerdere leden gekoppeld zijn, bijvoorbeeld een gezin.", "Ledenbeheer koppelt; de gebruiker kiest het wachtwoord"],
  ["<b>Pas</b>", "De QR-code van een lid: <i>actief</i>, <i>gedeactiveerd</i> (tijdelijk) of <i>ingetrokken</i> (definitief).", "Ledenbeheer"]], "wide")}
<div class="rule"><p class="k">De regel voor een geldige scan</p><div class="eq"><span>Pas is <b>actief</b></span><i>+</i><span>Lidmaatschap is <b>nu geldig</b></span><i>=</i><span class="ok">GELDIG</span></div><p class="small">Is één van de twee niet in orde, dan toont de scanner ONGELDIG. De reden van een schorsing of beëindiging ziet de controleur nooit.</p></div>
<h3 class="sub">Belangrijke spelregels</h3>
${ul("<b>Koppelen op e-mailadres gebeurt nooit automatisch.</b> Alleen een beheerder koppelt een account aan een lid, na bevestiging.", "<b>Archiveren is omkeerbaar</b>, verwijderen niet. Een lid wordt eerst gearchiveerd en pas later definitief gewist.", "<b>Een ingetrokken pas komt nooit terug.</b> Bij verlies krijgt het lid een nieuwe pas met een nieuwe code.", "<b>Een oud-lid</b> is een lid met een beëindigd of verlopen lidmaatschap. Dat is een afgeleide categorie, geen aparte status.", "De scanner is <b>fail-safe</b>: bij twijfel of geen verbinding staat er NIET GECONTROLEERD, nooit GELDIG.")}` }));

// 2. Ledenpas
pages.push(page({ chap: "2 · Ledenpas", toctitle: "Voor leden: activeren en inloggen", k: "Hoofdstuk 2 · Voor leden", title: "Eerste keer: activeren en inloggen", body: cols(`
<p>Een beheerder maakt je aan als lid. Je krijgt daarna één e-mail met een <b>eenmalige activatielink</b>. Daarmee kies je zelf een wachtwoord. Er is geen openbare registratie.</p>
<h3 class="sub">Account activeren</h3>
${steps("Open de link in de e-mail van HHC ClubSupport.", "Kies een wachtwoord van minimaal 12 tekens en herhaal het.", "Tik op <b>Wachtwoord opslaan</b>. Je kunt nu inloggen.")}
${warn("De link werkt één keer", "Een activatielink is maximaal 24 uur geldig. Is hij verlopen? Vraag de ledenadministratie om een nieuwe uitnodiging.")}
<h3 class="sub">Inloggen</h3>
${steps("Vul je e-mailadres en wachtwoord in en tik op <b>Inloggen</b>.", "Je pas staat meteen in beeld.", "Gebruik je liever vingerafdruk of gezichtsherkenning? Kies <b>Inloggen met passkey</b> (zie hoofdstuk Beveiliging).")}
<h3 class="sub">Wachtwoord vergeten?</h3>
${steps("Tik op <b>Wachtwoord vergeten?</b> onder het inlogscherm.", "Vul je e-mailadres in en tik op <b>Stuur resetlink</b>.", "Open de e-mail en kies een nieuw wachtwoord. De link is een uur geldig.")}
<p class="small">Uit veiligheid krijg je altijd dezelfde melding, ook als het adres niet bij een account hoort.</p>`,
  `<div class="stackph">${phone("ledenpas-activeren", "Activeren", { h: 225 })}${phone("ledenpas-inloggen", "Inloggen", { h: 360 })}${phone("wachtwoord-vergeten", "Wachtwoord vergeten", { h: 225 })}</div>`, "narrow") }));

pages.push(page({ chap: "2 · Ledenpas", toctitle: "Je pas tonen, bewaren en afdrukken", k: "Hoofdstuk 2 · Voor leden", title: "Je pas tonen, bewaren en afdrukken", body: `
${cols(`
<p>Na het inloggen zie je je ledenpas: een zwarte kaart met je naam, lidnummer en een grote QR-code. Houd je telefoon met voldoende helderheid voor de scanner.</p>
<h3 class="sub">Wat staat er op de pas?</h3>
${ul("<b>Bovenin</b> een oranje strook met het logo en een label <b>Geldig</b> als je lidmaatschap en pas nu in orde zijn.", "<b>Naam en lidnummer</b>, zodat de controleur ze met je legitimatiebewijs kan vergelijken.", "<b>De QR-code</b>. Er staat geen persoonlijke informatie in de code zelf.")}
<h3 class="sub">Pas bewaren als afbeelding</h3>
<p>Tik onder de pas op <b>Pas bewaren als afbeelding</b>. Je krijgt de hele pas (logo, naam, lidnummer en QR) als plaatje en kiest via het deelmenu waar het heen gaat, bijvoorbeeld je foto's.</p>
<h3 class="sub">Afdrukken</h3>
<p>Tik op <b>Afdrukken</b> om alleen de pas op papier te krijgen. De knoppen en menu's blijven buiten beeld.</p>
${tip("Een bewaarde kopie blijft werken", "Zolang de pas niet is ingetrokken werkt een afbeelding of afdruk gewoon. Deel hem alleen met jezelf: wie de QR-code heeft, kan zich als jou voordoen. Bij verlies laat je de pas intrekken.")}`,
  `<div class="stackph two">${phone("ledenpas-een-pas", "Je pas", { h: 470 })}<figure class="ph" style="width:176px"><img class="pasimg" src="${shot("pas-afbeelding")}" alt=""><figcaption>Zo ziet de bewaarde afbeelding eruit</figcaption></figure></div>`, "narrow")}` }));

pages.push(page({ chap: "2 · Ledenpas", toctitle: "Meerdere passen en zonder internet", k: "Hoofdstuk 2 · Voor leden", title: "Meerdere passen en zonder internet", body: `
<h3 class="sub first">Een gezin of meerdere leden op één account</h3>
${cols(`
<p>Is je account aan meerdere leden gekoppeld, bijvoorbeeld je gezin, dan staan alle passen in één rij. Een melding bovenaan vertelt hoeveel leden aan je account hangen.</p>
${ul("<b>Veeg</b> naar links of rechts, of gebruik de pijlen onder de pas.", "De <b>stippen en teller</b> laten zien welke pas je ziet.", "Open <b>Gekoppelde leden</b> voor de lijst van wie er aan je account hangt.")}
<p class="small">Wie toegang heeft tot dit account, ziet alle gekoppelde passen. Koppelen doet alleen de ledenadministratie.</p>`, `<div class="frow two">${phone("ledenpas-gezin-1", "Pas 1", { h: 320, w: 166 })}${phone("ledenpas-gezin-2", "Pas 2", { h: 320, w: 166 })}</div>`, "narrow w2")}
<h3 class="sub">Zonder internet</h3>
${cols(`
<p>Na het inloggen bewaart de app, met toestemming van het lid, een kopie van je eigen passen op je toestel. Zo kun je je pas ook in een kelder of een stadion zonder bereik tonen.</p>
${ul("Bij geen verbinding zie je <b>JE BENT OFFLINE</b> met het moment van de laatste update.", "De kopie verloopt vanzelf (standaard na 30 dagen) en verdwijnt zodra je uitlogt.", "<b>De scanner controleert altijd online.</b> Een ingetrokken of geblokkeerde pas werkt dus nooit, ook niet als jouw scherm nog een pas toont.")}`, `<div class="frow two">${phone("ledenpas-offline", "Offline", { h: 320, w: 166 })}${phone("ledenpas-offline-aan", "Online met offline kopie", { h: 320, w: 166 })}</div>`, "narrow w2")}
${tip("Installeren op je beginscherm", "Open de Ledenpas in je browser en kies <b>Zet op beginscherm</b> (iPhone: deelmenu, Android: menu met drie puntjes). Je opent de pas dan als een gewone app.")}` }));

pages.push(page({ chap: "2 · Ledenpas", toctitle: "Wijzigingen aanvragen en beveiliging", k: "Hoofdstuk 2 · Voor leden", title: "Wijzigingen aanvragen en beveiliging", body: `
<h3 class="sub first">Wijzigingen of opzeggen aanvragen</h3>
${cols(`
<p>Wil je je naam of contact-e-mailadres laten aanpassen, of je lidmaatschap opzeggen? Dat regel je onder <b>Verzoeken</b>. Een verzoek wordt <b>nooit direct doorgevoerd</b>: de ledenadministratie beoordeelt het eerst.</p>
${steps("Open <b>Verzoeken</b> en kies het lid (bij een gezin: de juiste pas).", "Vul de nieuwe gegevens in, of bij opzeggen de gewenste einddatum, en tik op <b>Wijziging aanvragen</b> of <b>Opzegging aanvragen</b>.", "Onder <b>Mijn verzoeken</b> zie je de status: <i>In behandeling</i>, <i>Goedgekeurd</i> of <i>Afgewezen</i> (met uitleg).")}
<p class="small">Een lopend verzoek kun je intrekken. Per lid en type is één verzoek tegelijk mogelijk.</p>`, `<div class="frow">${phone("ledenpas-verzoeken", "Verzoeken", { h: 330, w: 176 })}</div>`, "narrow")}
<h3 class="sub">Beveiliging van je account</h3>
${cols(`
<p>Onder <b>Beveiliging</b> kies je extra bescherming. Voor leden is dit vrijwillig; voor beheerders en controleurs is het sterk aan te raden.</p>
${ul("<b>Passkey</b>: inloggen met vingerafdruk, gezichtsherkenning of pincode van je toestel. Geen wachtwoord nodig, en beschermd tegen nepsites.", "<b>Authenticator-app</b>: een code uit een app zoals Google Authenticator of Microsoft Authenticator. Werkt op elk toestel, ook zonder passkey.", "<b>Herstelcodes</b>: laten je inloggen als je je telefoon kwijt bent. Elke code werkt één keer.")}
${tip("De authenticator-app blijft altijd een keuze", "Een passkey is een extra mogelijkheid, nooit verplicht. De authenticator-app werkt altijd naast een passkey.")}`, `<div class="frow">${phone("ledenpas-beveiliging", "Beveiliging", { h: 340, w: 176 })}</div>`, "narrow")}` }));

// 3. Scanner
pages.push(page({ chap: "3 · Scanner", toctitle: "Voor controleurs: scannen", k: "Hoofdstuk 3 · Voor controleurs", title: "Scannen bij de ingang", body: `
${cols(`
<p>De Scanner is een eigen app voor controleurs, met een eigen inlog. Elke scan wordt <b>live</b> bij de server gecontroleerd; zonder verbinding krijg je dus geen oordeel.</p>
<h3 class="sub">Aan de slag</h3>
${steps("Log in met je <b>persoonlijke</b> staf-account op de Scanner.", "Tik op <b>Scan starten</b> en geef de camera toestemming. De camera start pas na jouw tik.", "Richt de camera op de QR-code van het lid. Het resultaat vult het hele scherm.", "Tik op <b>Volgende scan</b> voor de volgende bezoeker.")}
<p>Lukt scannen niet, bijvoorbeeld door een gebroken scherm? Voer de code dan handmatig in onder <b>Code handmatig invoeren</b> en tik op <b>Controleren</b>.</p>
${tip("Controleer altijd de naam", "Bij GELDIG staan naam en lidnummer groot in beeld. Vergelijk ze met het legitimatiebewijs. Een screenshot van een QR-code is technisch niet te onderscheiden van de echte pas.")}
<h3 class="sub">Installeren als app</h3>
<p>Open de Scanner in je browser en kies <b>Zet op beginscherm</b>. De app heeft een eigen pictogram, los van de Ledenpas.</p>`,
  `<div class="stackph">${phone("scanner-inloggen", "Inloggen", { h: 215 })}${phone("scanner-start", "Beginscherm", { h: 270 })}${phone("scanner-geldig", "Geldig", { h: 270 })}</div>`, "narrow")}` }));

pages.push(page({ chap: "3 · Scanner", toctitle: "De uitkomsten", k: "Hoofdstuk 3 · Voor controleurs", title: "De uitkomsten en wat je doet", body: `
<div class="five">${phone("scanner-geldig", "Geldig", { w: 124, h: 300 })}${phone("scanner-gedeactiveerd", "Gedeactiveerd", { w: 124, h: 300 })}${phone("scanner-lidmaatschap", "Lidmaatschap", { w: 124, h: 300 })}${phone("scanner-onbekend", "Onbekend", { w: 124, h: 300 })}${phone("scanner-offline", "Geen verbinding", { w: 124, h: 300 })}</div>
${table(["Je ziet", "Wat het betekent", "Wat je doet"], [
  [`${badge("GELDIG", "dark")}`, "Pas is actief en het lidmaatschap is nu geldig. Naam en lidnummer staan in beeld.", "Vergelijk de naam met het legitimatiebewijs en laat de bezoeker door."],
  [`${badge("ONGELDIG", "red")}<br><small>Pas gedeactiveerd</small>`, "De pas is geblokkeerd door de ledenadministratie. Naam en lidnummer staan in beeld.", "Niet toelaten. Verwijs naar de ledenadministratie."],
  [`${badge("ONGELDIG", "red")}<br><small>Lidmaatschap niet geldig</small>`, "Het lidmaatschap is geschorst, beëindigd of verlopen. De reden zie je bewust niet.", "Niet toelaten. Verwijs naar de ledenadministratie."],
  [`${badge("ONGELDIG", "red")}<br><small>Pas ingetrokken of verwijderd</small>`, "De pas is definitief ingetrokken (verloren of gelekt). Er staat geen naam bij.", "Niet toelaten. Het lid heeft een nieuwe pas nodig."],
  [`${badge("ONGELDIG", "red")}<br><small>Onbekende code</small>`, "De code komt niet voor in het systeem.", "Niet toelaten. Probeer eventueel opnieuw te scannen."],
  [`${badge("NIET GECONTROLEERD", "orange")}`, "Er is geen verbinding of er ging iets mis. <b>Er is niets vastgesteld.</b>", "Herstel de verbinding en scan opnieuw. Laat niet toe op basis van dit scherm."],
  [`${badge("EVEN WACHTEN", "orange")}`, "Je scant te snel achter elkaar. Er is niets vastgesteld.", "Wacht even en scan opnieuw."],
  [`${badge("NIET GECONTROLEERD", "orange")}<br><small>Sessie verlopen</small>`, "Je bent uitgelogd of je sessie is verlopen.", "Log opnieuw in en scan opnieuw."]], "wide small")}
${warn("De scanner zegt nooit GELDIG als hij het niet zeker weet", "Alleen een volledig en correct antwoord van de server geeft GELDIG. Elke fout, time-out of afwijking geeft NIET GECONTROLEERD.")}` }));

pages.push(page({ chap: "3 · Scanner", toctitle: "Zoeken, beveiliging en tips", k: "Hoofdstuk 3 · Voor controleurs", title: "Een lid zoeken en handige tips", body: `
${cols(`
<h3 class="sub first">Lid zonder pas</h3>
<p>Heeft iemand zijn pas niet bij zich? Dan hoef je niemand weg te sturen. Zoek het lid op naam of lidnummer onder <b>Zoeken op naam of lidnummer</b>.</p>
${ul("Typ <b>minimaal 3 letters</b> (of een lidnummer) en tik op <b>Zoeken</b>.", "Je ziet <b>maximaal 8 resultaten</b> met alleen naam, lidnummer en passtatus, zoals <i>Pas actief · Geldig lid</i>.", "Zijn het er te veel? Maak je zoekterm preciezer.", "Controleer altijd de identiteit met een legitimatiebewijs.")}
${tip("Privacy", "Er worden geen adressen of e-mailadressen getoond. Je zoekopdrachten staan zonder zoekterm in het controlelogboek, zodat misbruik herkenbaar is.")}`, `<div class="frow">${phone("scanner-zoeken", "Zoeken op naam", { h: 440, w: 176 })}</div>`, "narrow")}
<h3 class="sub">Je eigen account beveiligen</h3>
<p>Onder <b>Beveiliging: passkey en herstelcodes</b> (onderaan de Scanner) stel je een passkey of authenticator-app in en maak je herstelcodes. Dat is niet verplicht voor controleurs, maar het beschermt jouw account.</p>
<h3 class="sub">Tips voor een drukke avond</h3>
${ul("Zet de schermhelderheid hoog en houd de camera schoon.", "Meld je af als je de telefoon uit handen geeft: <b>Uitloggen</b> staat altijd rechtsboven.", "Veel onbekende of afgewezen scans achter elkaar? Dat wordt gemeld aan de beheerders en kan wijzen op gokken met codes.", "Valt het netwerk uit? Blijf scannen op NIET GECONTROLEERD niet vertrouwen. Beslis volgens de afspraak van de vereniging, bijvoorbeeld met de ledenlijst op papier.")}` }));

// 4. Beheer
pages.push(page({ chap: "4 · Beheer", toctitle: "Voor beheerders: inloggen en tweestapsverificatie", k: "Hoofdstuk 4 · Voor beheerders", title: "Inloggen en tweestapsverificatie", body: `
<p class="lead2">Beheer is bedoeld voor bestuur en ledenadministratie en heeft de hoogste beveiliging. Je logt in met je persoonlijke staf-account.</p>
${cols(`<h3 class="sub first">Tweestapsverificatie is verplicht</h3>
<p>De eerste keer dat je inlogt, stel je tweestapsverificatie (MFA) in. Zonder MFA kom je niet verder dan deze pagina. Daarna vraagt Beheer bij elke login om een code of passkey.</p>
${steps("Log in met e-mailadres en wachtwoord.", "Bevestig met je wachtwoord en tik op <b>Doorgaan</b>.", "Scan de QR-code met een authenticator-app (bijvoorbeeld Google Authenticator of Microsoft Authenticator).", "Vul de 6-cijferige code in en tik op <b>Bevestigen</b>.", "Bewaar je <b>herstelcodes</b> op een veilige plek, niet op dezelfde telefoon.")}`, desk("beheer-inloggen", "Inloggen bij Beheer", { w: 300, x: 540, cw: 1120, y: 0, ch: 880 }), "")}
${row(desk("beheer-mfa-instellen", "Stap 1: kies je methode", { w: 330, x: 450, cw: 1300, y: 40, ch: 1000 }), desk("beheer-mfa-qr", "Stap 2: scan en bevestig", { w: 330, x: 450, cw: 1300, y: 40, ch: 1000 }))}
${tip("Liever geen app?", "Kies <b>Passkey instellen</b>: je toestel vraagt dan om je vingerafdruk, gezichtsherkenning of pincode. De authenticator-app blijft altijd beschikbaar.")}
${warn("Telefoon kwijt?", "Log in met een herstelcode. Heb je die niet meer, vraag dan een systeembeheerder om je tweede factor te resetten (zie Accounts en rollen).")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Overzicht en menu", k: "Hoofdstuk 4 · Voor beheerders", title: "Het overzicht en het menu", body: `
${desk("beheer-overzicht", "Het overzicht", { ch: 960 })}
<div class="cols tw"><div class="l"><h3 class="sub first">Wat zie je?</h3>${ul("<b>Leden</b>: het aantal leden in het bestand.", "<b>Actieve passen</b> en <b>Gedeactiveerd</b>: de stand van de passen.", "<b>Oud-leden</b>: beëindigd of verlopen lidmaatschap.", "<b>Scans (24 uur)</b>: controles in het afgelopen etmaal.", "<b>Mailproblemen</b>: e-mails die niet zijn aangekomen.", "Een <b>oranje balk</b> meldt openstaande beveiligingsmeldingen (alleen systeembeheer).")}</div>
<div class="r"><h3 class="sub first">Snelle acties</h3>${ul("<b>Nieuw lid</b> maakt direct een lid met pas aan.", "<b>Leden zoeken</b> opent de ledenlijst.", "<b>CSV importeren</b> start de import.")}<p class="small">Welke onderdelen je ziet, hangt af van je rol (zie Accounts en rollen).</p></div></div>
<h3 class="sub">Het menu</h3>
${cols(`<p>Past het menu niet naast elkaar, dan klapt het in achter de knop <b>Menu</b>. Het menu zweeft over de pagina en sluit door buiten het menu te tikken, op Escape te drukken of een pagina te kiezen.</p>`, `<div class="frow">${desk("beheer-menu", "Op de computer", { w: 230, x: 1100, cw: 1000, y: 0, ch: 1000 })}${phone("beheer-menu-mobiel", "Op de telefoon", { w: 160, h: 260 })}</div>`, "")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Leden zoeken en filteren", k: "Hoofdstuk 4 · Voor beheerders", title: "Leden zoeken en filteren", body: `
${desk("beheer-leden", "De ledenlijst", { ch: 1400 })}
<h3 class="sub">Zoeken</h3>
<p>Zoek op <b>naam, lidnummer of externe referentie</b>. Filter daarnaast op <b>lidmaatschap</b> (bijvoorbeeld alleen geschorst of oud-leden) en op <b>pas of archief</b>. Gearchiveerde leden staan standaard niet in de lijst.</p>
<div class="legend">${badge("Geldig", "dark")}<span>lidmaatschap loopt nu</span>${badge("Geschorst", "red")}<span>tijdelijk niet geldig</span>${badge("Beëindigd", "red")}<span>lidmaatschap is afgelopen</span>${badge("Oud-lid", "plain")}<span>beëindigd of verlopen</span>${badge("Gedeactiveerd", "orange")}<span>pas is geblokkeerd</span></div>
<h3 class="sub">Selectie exporteren</h3>
<p>Met <b>Selectie exporteren (CSV)</b> download je de lijst die je nu ziet. Een export bevat persoonsgegevens: ga er zorgvuldig mee om. Elke export wordt vastgelegd in het auditlog, en ongebruikelijk veel exports geven een beveiligingsmelding.</p>
${tip("Koppel nooit op e-mailadres", "Twee leden met hetzelfde e-mailadres zijn niet automatisch dezelfde persoon of hetzelfde account. Koppelen gebeurt altijd bewust, onder <b>Koppelingen</b>.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Het lid: gegevens en lidmaatschap", k: "Hoofdstuk 4 · Voor beheerders", title: "De ledenpagina: gegevens en lidmaatschap", body: `
${desk("beheer-lid", "De pagina van één lid", { ch: 1360 })}
<p>Bovenaan staat het <b>overzicht</b> met vier vakken: lidmaatschap, pas, accounts en wat een scan nu zou opleveren. Onder <b>Wat betekenen de statussen?</b> staat de uitleg. Daaronder staan links <b>Lidmaatschap</b> en rechts <b>Gegevens</b> (naam, e-mailadres, externe referentie en een interne notitie; het lidnummer ligt vast).</p>
<h3 class="sub">Lidmaatschap beheren</h3>
${table(["Actie", "Wat gebeurt er?"], [
  ["<b>Datums aanpassen</b>", "Begin- en einddatum wijzigen. De einddatum is de laatste geldige dag (Nederlandse tijd). Zonder einddatum loopt het lidmaatschap door."],
  ["<b>Lidmaatschap schorsen</b>", "Scans zijn direct ongeldig tot je weer activeert. De pas blijft ongewijzigd. Een reden is verplicht en blijft intern."],
  ["<b>Lidmaatschap activeren</b>", "Heft een schorsing op, of start een nieuw lidmaatschap als er geen loopt."],
  ["<b>Lidmaatschap beëindigen</b>", "Scans zijn direct ongeldig. Lid, accounts en pashistorie blijven bewaard; het lid wordt een oud-lid. Een reden is verplicht."]], "wide small")}
${warn("Bevestig elke ingrijpende actie", "Bij schorsen, beëindigen en andere ingrijpende acties vink je <b>Ik bevestig deze actie</b> aan. Elke wijziging komt met reden in het auditlog.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Het lid: pas, accounts en archief", k: "Hoofdstuk 4 · Voor beheerders", title: "De ledenpagina: pas, accounts en archief", body: `
${cols(`
<h3 class="sub first">De pas beheren</h3>
${table(["Actie", "Gevolg"], [
  ["<b>Pas blokkeren</b>", "De QR is direct ongeldig. Tijdelijk: <b>Pas activeren</b> zet dezelfde pas weer aan."],
  ["<b>Nieuwe pas uitgeven</b>", "Een nieuwe unieke pas; de oude wordt <b>direct en onomkeerbaar</b> ingetrokken. Kies de aanleiding: verloren, gelekt of vervangen."],
  ["<b>Definitief intrekken</b>", "Zonder nieuwe pas. Een ingetrokken pas kan nooit meer worden geactiveerd."]], "small")}
<h3 class="sub">Accounts en e-mail</h3>
<p>Onder <b>Accounts en e-mail</b> zie je welke accounts aan het lid hangen en of de uitnodiging is aangekomen (<b>Afleverstatus</b>). Je kunt een uitnodiging opnieuw versturen, een account <b>ontkoppelen</b> of een bestaand ledenaccount <b>koppelen</b>, steeds met bevestiging.</p>`, desk("beheer-lid", "Pas en accounts", { w: 300, x: 170, cw: 950, y: 4000, ch: 1800 }), "")}
<h3 class="sub">Archiveren en verwijderen zijn twee dingen</h3>
${cols(`<p><b>Archiveren</b> haalt het lid uit de lijsten en maakt scans ongeldig. Pas, lidmaatschap, accounts en historie blijven bewaard. <b>Het is omkeerbaar</b> met <b>Lid herstellen</b>.</p>`, `<p><b>Verwijderen</b> kan pas na archivering en wist het lid na de bewaartermijn. Het raakt <b>nooit andere leden of accounts</b>, ook niet bij een gedeeld e-mailadres.</p>`, "tw")}
<h3 class="sub">Oud-leden</h3>
<p>Een lid van wie het lidmaatschap is beëindigd of verlopen, krijgt de aanduiding <b>Oud-lid</b> en telt mee onder Oud-leden op het overzicht. De gegevens, accounts en pashistorie blijven bewaard; scans zijn ongeldig. Begin je opnieuw met <b>Lidmaatschap activeren</b>, dan is het lid meteen weer geldig.</p>
${tip("Historie", "Onderaan de pagina staat de <b>Historie</b> van dit lid: wie wat wanneer deed, zonder persoonsgegevens of codes.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Nieuw lid en koppelingen", k: "Hoofdstuk 4 · Voor beheerders", title: "Een nieuw lid en koppelingen", body: `
${cols(`
<h3 class="sub first">Nieuw lid aanmaken</h3>
<p>Kies <b>Nieuw lid</b>. Het lid krijgt direct een pas en, als je een e-mailadres invult, een uitnodiging om het account te activeren.</p>
${ul("<b>Lidnummer</b> (uniek, vast) en <b>naam</b> zijn verplicht.", "<b>E-mailadres</b> is optioneel. Gebruik een adres dat het lid zelf leest.", "<b>Externe referentie</b>: een eigen nummer uit een ander ledensysteem (optioneel, uniek).", "<b>Lidmaatschap</b>: status, begindatum en einddatum (laatste geldige dag).", "<b>Notitie</b>: alleen zichtbaar voor beheer, zonder invloed op de geldigheid.")}
<p class="small">Bestaat het e-mailadres al bij een account, dan vraagt het systeem om bevestiging voordat het lid wordt gekoppeld. Dat gebeurt nooit stilzwijgend.</p>`, desk("beheer-nieuw-lid", "Nieuw lid", { w: 330, x: 170, cw: 1100, y: 0, ch: 1650 }), "")}
<h3 class="sub">Koppelingen</h3>
<p>Onder <b>Koppelingen</b> zie je alle ledenaccounts, of ze zijn geactiveerd en hoeveel leden eraan hangen. Zoek op e-mailadres en open een account om leden te koppelen of te ontkoppelen.</p>
${desk("beheer-koppelingen", "Koppelingen", { ch: 560 })}
${ul("Een gezin: één account, meerdere leden.", "<b>Nog niet geactiveerd</b> betekent dat de uitnodiging nog niet is gebruikt.", "Koppelen vraagt altijd een bewuste bevestiging.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Leden importeren (CSV)", k: "Hoofdstuk 4 · Voor beheerders", title: "Leden importeren: bestand en kolommen", body: `
<p class="lead2">Importeer honderden leden in één keer. Je ziet <b>eerst een voorbeeld</b>; er wordt niets opgeslagen of gemaild voordat je bevestigt.</p>
<h3 class="sub first">Stap 1: bestand kiezen</h3>
${cols(`<p>Kies <b>Leden importeren</b> en selecteer een CSV-bestand (maximaal 1 MB en 5000 rijen). Kolomnamen zoals <i>lidnummer</i>, <i>naam</i>, <i>email</i> en <i>lidmaatschap</i> worden herkend.</p><p>Tik op <b>Verder naar kolomkoppeling</b>.</p>`, desk("beheer-import", "Bestand kiezen", { w: 400, ch: 700 }), "")}
<h3 class="sub">Stap 2: kolommen koppelen</h3>
<p>Per kolom uit je bestand kies je het bijbehorende veld. Lidnummer en naam zijn verplicht. Kolommen die het systeem niet herkent staan op <i>Negeren</i> tot jij ze koppelt.</p>
${desk("beheer-import-koppelen", "Kolommen koppelen", { ch: 1250 })}
${cols(`<h3 class="sub first">Bestaande leden</h3><p>Je kiest waarop bestaande leden worden herkend, standaard op <b>lidnummer</b>. Een bestaand lid wordt bijgewerkt; er komt geen tweede lid of pas bij.</p>`, `<p class="small" style="margin-top:22px">Tik daarna op <b>Voorbeeld tonen</b>. Er is nog niets opgeslagen.</p>`, "tw")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Import: voorbeeld en bevestigen", k: "Hoofdstuk 4 · Voor beheerders", title: "Leden importeren: voorbeeld en bevestigen", body: `
<h3 class="sub first">Stap 3: voorbeeld</h3>
${desk("beheer-import-preview", "Voorbeeld van de import", { ch: 1500 })}
<p>Per rij zie je wat er zou gebeuren: <i>Nieuw</i>, <i>Bijgewerkt</i>, <i>Ongewijzigd</i>, een fout (bijvoorbeeld een ontbrekende naam) of een mogelijk dubbel. Bovenin staan de totalen.</p>
<h3 class="sub">Stap 4: bevestigen</h3>
${steps("Controleer de rijen en de totalen.", "Vink de bevestigingen aan en tik op <b>Importeren</b>.", "Nieuwe leden krijgen een pas en een uitnodiging per e-mail. Een herhaalde import maakt geen dubbelen.")}
${cols(`<h3 class="sub first">Gedeelde e-mailadressen</h3><p>Hebben meerdere rijen hetzelfde e-mailadres, dan gaat het om één account met meerdere leden en krijgt dat adres <b>één uitnodiging</b>. Een bestaande koppeling vraagt expliciet om bevestiging.</p>`, `${tip("Fouten", "Rijen zonder naam of met een dubbel lidnummer worden zichtbaar overgeslagen; de rest wordt gewoon verwerkt. Met <b>Kolomkoppeling aanpassen</b> kun je terug.")}`, "tw")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Verzoeken van leden", k: "Hoofdstuk 4 · Voor beheerders", title: "Verzoeken van leden afhandelen", body: `
<p class="lead2">Leden kunnen via hun Ledenpas een wijziging of opzegging aanvragen. Er wordt <b>niets doorgevoerd</b> voordat iemand van de ledenadministratie het goedkeurt.</p>
${desk("beheer-verzoeken", "Openstaande verzoeken", { ch: 1650 })}
${steps("Open <b>Verzoeken</b>. Het getal tussen haakjes in het menu is het aantal openstaande verzoeken.", "Lees het verzoek. Bij <b>Gegevens wijzigen</b> zie je per veld de huidige en de gevraagde waarde. Bij <b>Lidmaatschap opzeggen</b> zie je de gewenste einddatum.", "Tik op <b>Goedkeuren en doorvoeren</b> om de wijziging toe te passen, of op <b>Afwijzen</b>.", "Een afwijzing vraagt een <b>toelichting</b>. Het lid ziet deze in de Ledenpas.")}
${tip("Goed om te weten", "Een e-mailadres dat bij een staf-account hoort, kan niet worden doorgevoerd voor een lid. Wijs zo'n verzoek af. Onder <b>Recent afgehandeld</b> staat wat er is besloten, met datum en behandelaar.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Nieuwsbrieven schrijven", k: "Hoofdstuk 4 · Voor beheerders", title: "Nieuwsbrieven: schrijven", body: `
${desk("beheer-nieuwsbrieven", "Alle nieuwsbrieven", { ch: 950 })}
<p class="lead2" style="margin-top:12px">Onder <b>Nieuwsbrieven</b> staat elke nieuwsbrief met status: <i>Concept</i>, <i>Gepland</i>, <i>Wordt verstuurd</i>, <i>Verstuurd</i> of <i>Geannuleerd</i>. Afgemelde adressen ontvangen nooit meer een nieuwsbrief.</p>
${cols(`
<h3 class="sub first">Een nieuwsbrief maken</h3>
${steps("Kies <b>Nieuwe nieuwsbrief</b>.", "Vul het <b>onderwerp</b> in en kies de <b>doelgroep</b>.", "Schrijf de <b>tekst</b> en tik op <b>Concept opslaan</b>.")}
<h3 class="sub">Doelgroepen</h3>
${ul("<b>Leden</b>: nu geldig lidmaatschap.", "<b>Oud-leden</b>: beëindigd of verlopen lidmaatschap.", "<b>Iedereen</b>: alle leden met een e-mailadres.")}
<p class="small">Een gedeeld e-mailadres krijgt één mail.</p>`, `
<h3 class="sub first">Opmaak</h3>
<p>Schrijf gewone tekst. Ruwe HTML wordt nooit overgenomen. Dit kan wel:</p>
${table(["Je typt", "Resultaat"], [["Lege regel", "Nieuwe alinea"], ["<code>## Kop</code>", "Tussenkop"], ["<code>- punt</code>", "Opsomming"], ["<code>**vet**</code>", "<b>Vet</b>"], ["<code>[tekst](https://…)</code>", "Link"]], "small")}
<p class="small">Onderwerp maximaal 150 tekens, tekst maximaal 20.000 tekens. Elke mail bevat automatisch een afmeldlink.</p>`, "tw")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Nieuwsbrieven testen en versturen", k: "Hoofdstuk 4 · Voor beheerders", title: "Nieuwsbrieven: testen en versturen", body: `
${desk("beheer-nieuwsbrief-concept", "Een concept: voorbeeld, testmail, versturen en plannen", { y: 0, ch: 1700 })}
${steps("<b>Voorbeeld</b>: bekijk onder Voorbeeld hoe de mail eruitziet.", "<b>Testmail naar mezelf</b>: stuur eerst een test naar je eigen adres.", "<b>Versturen</b>: controleer het aantal ontvangers, bevestig en tik op <b>Nieuwsbrief versturen</b>.", "<b>Of plannen</b>: kies datum en tijd (Nederlandse tijd) en tik op <b>Nieuwsbrief plannen</b>.")}
${warn("Eenmaal verzonden is verzonden", "Controleer de ontvangers en de tekst goed. Een verstuurde nieuwsbrief kan niet meer worden aangepast of teruggehaald.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Nieuwsbrieven: plannen en volgen", k: "Hoofdstuk 4 · Voor beheerders", title: "Nieuwsbrieven: plannen en volgen", body: `
${row(desk("beheer-nieuwsbrief-gepland", "Gepland", { w: 336, ch: 1500 }), desk("beheer-nieuwsbrief-verzonden", "Verstuurd", { w: 336, ch: 1500 }))}
${table(["Status", "Wat kun je doen?"], [["Concept", "Wijzigen, testen, plannen, versturen of verwijderen."], ["Gepland", "Wachten op het gekozen moment, of <b>Planning annuleren</b>. De ontvangers worden pas op het verzendmoment vastgelegd."], ["Wordt verstuurd", "Wordt in kleine groepen verstuurd. Je kunt de verzending <b>annuleren</b>."], ["Verstuurd", "Alleen nog bekijken: aantallen en voorbeeld. Onder <b>Verzending</b> zie je ontvangers, verzonden, wachtend en mislukt."]], "wide small")}
<p>Mislukte verzendingen kun je opnieuw proberen met <b>Mislukte verzendingen opnieuw proberen</b>.</p>
${tip("Plannen en het moment van versturen", "Een geplande nieuwsbrief start op het gekozen tijdstip of bij het eerstvolgende moment dat het systeem de planning controleert. Dat kan enkele uren later zijn dan de gekozen tijd. Is het tijdstip kritiek, verstuur dan direct.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Toezicht: controlelogboek", k: "Hoofdstuk 4 · Voor beheerders", title: "Toezicht: het controlelogboek", body: `
<p class="lead2">Een apart, doorzoekbaar logboek van alle <b>scans en zoekacties</b> van controleurs. Kies met één tik een controleur, of filter op lid, uitkomst en periode.</p>
${desk("beheer-controles-controleur", "Controles van één controleur", { ch: 1400 })}
${ul("Per regel: tijd, controleur, handeling (geldig, ongeldig, lidmaatschap niet geldig, onbekende code, zoekopdracht) en het lid.", "<b>Nooit</b> de QR-code of een zoekterm.", "Bewaartermijn: 90 dagen.")}
${tip("Waarvoor gebruik je dit?", "Om te zien wie wanneer controleerde, en om afwijkend gedrag te herkennen, zoals veel afgewezen scans achter elkaar. Dat wordt ook automatisch gemeld onder <b>Meldingen</b>.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Toezicht: audit", k: "Hoofdstuk 4 · Voor beheerders", title: "Toezicht: het auditlog", body: `
<p class="lead2">Het <b>auditlog</b> legt elke gevoelige handeling vast: wie, wat en wanneer. Alleen systeembeheer heeft toegang.</p>
${desk("beheer-audit", "Het auditlog", { ch: 1500 })}
${ul("Denk aan een nieuw lid, een geschorst of beëindigd lidmaatschap, een uitgegeven of ingetrokken pas, een export, een koppeling of een rolwijziging.", "Filter per account met één tik, of op soort actie.", "Er staan <b>geen persoonsgegevens of codes</b> in.", "Bewaartermijn: standaard 2 jaar.")}
${tip("Redenen", "Bij schorsen, beëindigen, blokkeren en intrekken legt het systeem de opgegeven reden vast. Die reden zie je alleen hier en op de ledenpagina, nooit op de scanner of in de Ledenpas.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Accounts en rollen", k: "Hoofdstuk 4 · Voor beheerders", title: "Accounts en rollen", body: `
<p class="lead2">Alleen systeembeheer beheert staf-accounts. Elke medewerker krijgt een eigen account; gedeelde accounts voor beheer of controle zijn niet toegestaan.</p>
${desk("beheer-accounts", "Het accountbeheer", { ch: 1300 })}
${table(["Rol", "Mag…"], [
  ["<b>Scanner</b><br><small>controleur</small>", "Scannen en leden zoeken in de Scanner. Geen toegang tot Beheer."],
  ["<b>Ledenbeheer</b><br><small>ledenadministratie</small>", "Alles rond leden: lidmaatschappen, passen, koppelingen, import, export, verzoeken, nieuwsbrieven en het controlelogboek."],
  ["<b>Systeembeheer</b>", "Alles van Ledenbeheer, plus staf-accounts en rollen, het auditlog en beveiligingsmeldingen."]], "wide small")}
${ul("<b>Account aanmaken</b>: vul naam, persoonlijk e-mailadres en rol in. De medewerker krijgt een uitnodiging.", "<b>Rol wijzigen</b>, <b>adres wijzigen</b> en <b>blokkeren</b> doe je per account. Je eigen rol kun je niet wijzigen.", "Zorg voor <b>minimaal twee</b> actieve systeembeheerders, zodat je nooit buitengesloten raakt.", "<b>MFA resetten</b>: raakt een medewerker zijn telefoon en herstelcodes kwijt, dan reset systeembeheer de tweede factor met een reden. Dit wordt gemeld en vastgelegd.")}` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Meldingen", k: "Hoofdstuk 4 · Voor beheerders", title: "Beveiligingsmeldingen", body: `
<p class="lead2">Het systeem let op verdachte activiteit en meldt dat aan systeembeheer, op het overzicht en per e-mail. Een melding bevat <b>nooit</b> wachtwoorden, codes of e-mailadressen.</p>
${desk("beheer-meldingen", "Meldingen", { ch: 1550 })}
${table(["Voorbeelden van meldingen", "Wat te doen?"], [
  ["Meerdere mislukte inlogpogingen voor een account", "Controleer of de gebruiker zelf probeert in te loggen. Laat zo nodig het wachtwoord resetten."],
  ["Veel onbekende of afgewezen scans door één controleur", "Bekijk het controlelogboek van die controleur en spreek hem erop aan."],
  ["Export buiten kantooruren, of meerdere exports kort achter elkaar", "Vraag de gebruiker of de export bedoeld was."],
  ["Passkey toegevoegd, herstelcode gebruikt, MFA gereset, rol gewijzigd", "Informatief. Controleer of het klopt, zeker als niemand er om gevraagd heeft."]], "wide small")}
<p>Behandeld? Tik op <b>Afgehandeld</b>. Met <b>Alles tonen</b> zie je ook de afgehandelde meldingen.</p>` }));

pages.push(page({ chap: "4 · Beheer", toctitle: "Je eigen beveiliging", k: "Hoofdstuk 4 · Voor beheerders", title: "Je eigen beveiliging", body: `
<p class="lead2">Onder <b>Beveiliging</b> in het menu beheer je je eigen inlog. Dit geldt voor leden, controleurs en beheerders op dezelfde manier.</p>
${desk("beheer-beveiliging", "Beveiliging", { ch: 1250 })}
${ul("<b>Passkeys</b>: voeg een passkey toe met een naam, bijvoorbeeld &ldquo;iPhone Jan&rdquo;. Je kunt meerdere passkeys hebben en ze later verwijderen. Een passkey telt als tweede factor en vraagt altijd een vingerafdruk, gezichtsherkenning of pincode.", "<b>Authenticator-app</b>: stel hem in na bevestiging met je wachtwoord. Hij werkt altijd, ook naast een passkey.", "<b>Herstelcodes</b>: maak nieuwe codes aan met je wachtwoord. Oude codes werken dan niet meer. Elke code werkt één keer.")}
${warn("Nieuwe passkey of gebruikte herstelcode", "Je krijgt hier een e-mail over. Heb je dit niet zelf gedaan? Laat dan direct je wachtwoord resetten en meld het bij systeembeheer.")}` }));

// 5. Beveiliging en privacy
pages.push(page({ chap: "5 · Beveiliging", toctitle: "Beveiliging en privacy in het kort", k: "Hoofdstuk 5 · Veilig werken", title: "Beveiliging en privacy in het kort", body: `
<div class="cols3">
  <div class="card"><h3>De code</h3>${ul("Willekeurig en onraadbaar", "In de QR staan <b>geen</b> naam of nummer", "Opgeslagen als hash en versleuteld; bij intrekking gewist")}</div>
  <div class="card hl"><h3>Controle</h3>${ul("De server is altijd de bron van waarheid", "Twijfel is NIET GECONTROLEERD", "Beperkingen op scannen en zoeken")}</div>
  <div class="card"><h3>Toegang</h3>${ul("Eigen apps met eigen rechten", "MFA voor beheerders", "Sessies en beveiligde verbindingen")}</div>
</div>
<h3 class="sub">Wat het systeem nooit doet</h3>
${ul("De <b>reden</b> van een schorsing of beëindiging of beheernotities tonen aan controleurs of leden.", "Persoonsgegevens, codes of wachtwoorden opnemen in QR-codes, e-mails, logboeken of beveiligingsmeldingen.", "Leden of accounts <b>samenvoegen of koppelen op e-mailadres of naam</b>.", "Een wijzigingsverzoek van een lid doorvoeren zonder goedkeuring van de ledenadministratie.", "Een nieuwsbrief sturen naar een afgemeld adres, of meer dan één mail per adres.")}
<h3 class="sub">Wat u zelf kunt doen</h3>
${ul("Gebruik een <b>uniek wachtwoord</b> van minimaal 12 tekens. Het systeem waarschuwt als het in een bekend datalek voorkomt.", "Zet een <b>passkey of authenticator-app</b> aan.", "Bewaar <b>herstelcodes</b> op een veilige plek, niet op dezelfde telefoon.", "Verlies je een pas of telefoon? Meld het direct, dan wordt de pas ingetrokken of de tweede factor gereset.", "Verstuur nooit wachtwoorden of codes per e-mail. De beheerders vragen er nooit om.")}
<h3 class="sub">Bewaartermijnen</h3>
${table(["Gegevens", "Bewaartermijn (standaard)"], [["Scan- en zoeklogboek", "90 dagen"], ["Auditlog", "2 jaar"], ["Verwijderd lid (na archivering)", "90 dagen, daarna definitief gewist"], ["Verzendregels van nieuwsbrieven", "2 jaar"]], "small")}
<p class="small">De termijnen zijn instelbaar door de vereniging en worden dagelijks opgeruimd.</p>` }));

// 6. Problemen oplossen
pages.push(page({ chap: "6 · Hulp", toctitle: "Problemen oplossen", k: "Hoofdstuk 6 · Hulp", title: "Problemen oplossen", body: `
${table(["Wat gaat er mis?", "Wat kun je doen?"], [
  ["<b>Ik kan niet inloggen</b>", "Controleer het e-mailadres (let op autofill) en het wachtwoord. Gebruik <b>Wachtwoord vergeten?</b>. Log in op het vaste adres van de vereniging; een oude link werkt automatisch door of niet. Na meerdere mislukte pogingen moet je even wachten."],
  ["<b>De activatielink werkt niet</b>", "Een link werkt één keer en is maximaal 24 uur geldig. Vraag de ledenadministratie om een nieuwe uitnodiging."],
  ["<b>Ik krijg geen e-mail</b>", "Kijk in je spam. Onder Beheer bij het lid staat de <b>Afleverstatus</b>. Controleer of het e-mailadres klopt."],
  ["<b>Mijn pas toont niet Geldig</b>", "Het lidmaatschap loopt niet (meer) of de pas is geblokkeerd. Neem contact op met de ledenadministratie."],
  ["<b>Ik ben mijn telefoon kwijt (MFA)</b>", "Log in met een <b>herstelcode</b>. Heb je die niet? Vraag systeembeheer om je tweede factor te resetten."],
  ["<b>Ik ben mijn pas kwijt</b>", "Meld het bij de ledenadministratie. Die geeft een nieuwe pas uit; de oude wordt direct onbruikbaar."],
  ["<b>De scanner zegt NIET GECONTROLEERD</b>", "Controleer je verbinding en scan opnieuw. Er is niets vastgesteld; laat niet toe op basis van dit scherm."],
  ["<b>De camera start niet</b>", "Sta cameragebruik toe voor de Scanner in de instellingen van je browser. Voer anders de code handmatig in."],
  ["<b>Een pagina geeft een foutmelding na een update</b>", "Ververs de pagina helemaal (Ctrl+Shift+R of Cmd+Shift+R) en probeer opnieuw."],
  ["<b>Een geplande nieuwsbrief is nog niet weg</b>", "De planning wordt periodiek gecontroleerd. Open Beheer of wacht op de volgende controle; bekijk de status onder Nieuwsbrieven."]], "wide")}
${tip("Nog niet opgelost?", "Neem contact op met de ledenadministratie of systeembeheer van de vereniging. Noem nooit je wachtwoord of herstelcodes.")}` }));

pages.push(page({ chap: "6 · Hulp", toctitle: "Begrippenlijst", k: "Bijlage", title: "Begrippenlijst", body: `
${table(["Begrip", "Betekenis"], [
  ["Account", "De inlog met e-mailadres en wachtwoord. Eén account kan meerdere leden bevatten."],
  ["Archiveren", "Een lid uit de lijsten halen en scans ongeldig maken. Omkeerbaar."],
  ["Audit", "Het logboek van gevoelige handelingen in Beheer."],
  ["Authenticator-app", "App die een code van 6 cijfers geeft voor tweestapsverificatie."],
  ["Deactiveren", "Een pas tijdelijk blokkeren. Dezelfde pas kan weer worden geactiveerd."],
  ["Herstelcode", "Eenmalige code om in te loggen als je je tweede factor kwijt bent."],
  ["Intrekken", "Een pas definitief onbruikbaar maken. Onomkeerbaar."],
  ["Lid", "De persoon in het ledenbestand met naam en lidnummer."],
  ["Lidmaatschap", "Of iemand nu lid is: actief, geschorst of beëindigd, met datums."],
  ["MFA", "Tweestapsverificatie: naast je wachtwoord een tweede bewijs, zoals een app-code of passkey."],
  ["Oud-lid", "Lid met een beëindigd of verlopen lidmaatschap."],
  ["Pas", "De QR-code van een lid. Actief, gedeactiveerd of ingetrokken."],
  ["Passkey", "Inloggen met vingerafdruk, gezichtsherkenning of pincode, zonder wachtwoord."],
  ["PWA", "Een website die je als app op je beginscherm zet, zoals de Ledenpas en de Scanner."],
  ["Schorsen", "Het lidmaatschap tijdelijk stilzetten. Scans zijn dan ongeldig."],
  ["Verzoek", "Een aanvraag van een lid om gegevens te wijzigen of op te zeggen. Pas na goedkeuring doorgevoerd."]], "wide")}` }));

// achterkant
n += 1;
pages.push(`<section class="page end"><div class="cv">${logo}<h1>Veel plezier met<br>HHC ClubSupport</h1><p class="lead">Vragen of opmerkingen? Neem contact op met de ledenadministratie van HHC Hardenberg.</p></div></section>`);

/* inhoudsopgave */
const byChap = {};
for (const t of toc) (byChap[t.chap] ??= []).push(t);
const tocHtml = `<section class="page"><div class="hd"><img src="${U("public/brand/logo-small.png")}" alt=""><span>Handleiding</span><em></em></div><div class="bd-wrap"><p class="k">Inhoud</p><h2>Inhoud</h2><div class="toc">${Object.entries(byChap).map(([c, items]) => `<div class="tc"><h3>${c}</h3>${items.map((t) => `<p><span>${t.t}</span><i></i><b>${t.p}</b></p>`).join("")}</div>`).join("")}</div></div><div class="ft"><span>HHC ClubSupport — Handleiding</span><b>02</b></div></section>`;
pages[1] = tocHtml;

const css = `
@font-face{font-family:DIN;src:url(${font("dinnext-light")});font-weight:300}
@font-face{font-family:DIN;src:url(${font("dinnext-regular")});font-weight:400}
@font-face{font-family:DIN;src:url(${font("dinnext-medium")});font-weight:500}
@font-face{font-family:DIN;src:url(${font("dinnext-bold")});font-weight:700}
@font-face{font-family:DIN;src:url(${font("din-black")});font-weight:900}
@page{size:794px 1123px;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:DIN,Arial,sans-serif;color:#111;background:#fff;font-size:13.5px;line-height:1.45}
.page{width:794px;height:1123px;position:relative;overflow:hidden;page-break-after:always;background:#fff;padding:78px 56px 70px}
.hd{position:absolute;left:56px;right:56px;top:26px;display:flex;align-items:center;gap:12px;border-bottom:3px solid #ff6600;padding-bottom:10px}
.hd img{height:30px}.hd span{font-weight:900;text-transform:uppercase;letter-spacing:.18em;font-size:11px}.hd em{margin-left:auto;font-style:normal;font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#555}
.ft{position:absolute;left:56px;right:56px;bottom:26px;display:flex;justify-content:space-between;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#777;font-weight:700;border-top:1px solid #ddd;padding-top:8px}
.ft b{color:#111;font-weight:900}
.k{margin:0 0 8px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;font-size:11px;color:#111;display:flex;align-items:center;gap:10px}
.k::before{content:"";width:30px;height:4px;background:#ff6600;display:block}
h1,h2,h3{margin:0;line-height:1.08;text-transform:uppercase}
h2{font-weight:300;font-size:30px;margin:0 0 14px;letter-spacing:.01em}
h3{font-weight:900;font-size:13px;letter-spacing:.09em;margin-bottom:8px}
h3.sub{margin-top:14px;font-size:13px}h3.sub.first{margin-top:0}
p{margin:0 0 8px;color:#222}
.lead2{font-size:15px;line-height:1.5;color:#222;margin-bottom:12px}
.small{font-size:11.5px;color:#555}
ul{margin:0 0 8px;padding-left:19px;color:#222}li{margin-bottom:4px}li::marker{color:#ff6600}
code{font-family:Menlo,Consolas,monospace;font-size:11px;background:#f0f0f0;padding:1px 4px;border-radius:4px}
ol.steps{list-style:none;counter-reset:s;margin:0 0 10px;padding:0}
ol.steps li{counter-increment:s;display:flex;gap:10px;align-items:flex-start;margin-bottom:6px}
ol.steps li::before{content:counter(s);flex:0 0 22px;height:22px;border-radius:50%;background:#ff6600;color:#111;font-weight:900;font-size:12px;display:flex;align-items:center;justify-content:center;margin-top:0}
.tip,.warn{border-radius:10px;padding:10px 14px;margin:10px 0;font-size:12.5px}
.tip{background:#f2f2f2;border-left:5px solid #ff6600;color:#222}.tip>b:first-child,.warn>b:first-child{display:block;font-weight:900;text-transform:uppercase;letter-spacing:.08em;font-size:11.5px;margin-bottom:2px}
.warn{background:#111;color:#eee}.warn>b:first-child{color:#ff6600}
table{border-collapse:separate;border-spacing:0;width:100%;margin:6px 0 10px;font-size:12px;border:1px solid #d9d9d9;border-radius:10px;overflow:hidden}
th{background:#111;color:#fff;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:10.5px;padding:7px 10px}
td{padding:7px 10px;border-top:1px solid #e6e6e6;vertical-align:top;color:#222}tbody tr:nth-child(even) td{background:#fafafa}
table.small{font-size:11px}table.small td{padding:5px 9px}
.bd{display:inline-block;font-weight:900;font-size:10.5px;letter-spacing:.06em;padding:2px 9px;border-radius:999px;text-transform:uppercase;border:2px solid #111}
.bd.dark{background:#111;color:#fff}.bd.red{background:#b00020;color:#fff;border-color:#b00020}.bd.orange{background:#ff6600;color:#111;border-color:#ff6600}.bd.plain{background:#fff;color:#111}
td small{color:#555;font-size:10.5px}
.cols{display:flex;gap:22px;align-items:flex-start}
.cols .l{flex:1 1 0;min-width:0}.cols .r{flex:0 0 auto}
.cols.tw .l,.cols.tw .r{flex:1 1 0}
.cols.narrow .r{width:190px}
.cols.narrow.w2 .r{width:350px}
.cols.wide2 .r{width:350px}
.frow{display:flex;gap:14px;justify-content:center;align-items:flex-start;margin:8px 0}
.stackph{display:flex;flex-direction:column;gap:10px;align-items:center}
.stackph.two{flex-direction:column}
.five{display:flex;gap:8px;justify-content:center;margin-bottom:8px}
.ph,.dk{margin:0;text-align:center}
figcaption{margin-top:5px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#777}
.dev{border:3px solid #111;border-radius:18px;background:#fff;overflow:hidden}
.dev img{display:block}
.pasimg{display:block;width:100%;border-radius:12px}
.dk{border:1px solid #cfcfcf;border-radius:10px;overflow:hidden;background:#fff;margin-bottom:6px}
.dk .scr{overflow:hidden}.dk img{display:block;max-width:none}
.dk figcaption{margin:0;padding:6px;border-top:1px solid #e6e6e6;background:#fafafa}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:8px 0}
.tile{background:#111;color:#fff;border-radius:14px;padding:18px;min-height:150px}
.tile .nm{display:inline-flex;width:34px;height:34px;border-radius:50%;background:#ff6600;color:#111;font-weight:900;font-size:18px;align-items:center;justify-content:center;margin-bottom:10px}
.tile h3{color:#ff6600;font-size:17px}.tile p{color:#eee;font-size:12.5px;margin:0}
.rule{background:#111;color:#fff;border-radius:14px;padding:16px 20px;margin:12px 0}
.rule .k{color:#fff}.rule p{color:#ddd}
.eq{display:flex;align-items:center;gap:12px;margin:8px 0 10px;font-size:14px}.eq span{background:#222;padding:10px 14px;border-radius:10px;flex:1;text-align:center}.eq i{font-style:normal;font-weight:900;font-size:22px;color:#ff6600}
.eq .ok{background:#ff6600;color:#111;font-weight:900;letter-spacing:.1em}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:10px}
.card{border:1px solid #d9d9d9;border-top:5px solid #ff6600;border-radius:12px;padding:14px 16px}.card h3{font-size:13px}
.card.hl{background:#111;border-color:#111;border-top-color:#ff6600;color:#fff}.card.hl h3{color:#ff6600}.card.hl ul{color:#eee}
.card ul{padding-left:16px;font-size:12px;margin:0}
.legend{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px 10px;align-items:center;font-size:11.5px;margin:6px 0 10px}
.toc{display:grid;grid-template-columns:1fr 1fr;gap:10px 30px;margin-top:10px}
.tc h3{border-bottom:3px solid #ff6600;padding-bottom:5px;margin-bottom:6px;font-size:13px}
.tc p{display:flex;gap:6px;align-items:baseline;margin:0 0 5px;font-size:12.5px}.tc p i{flex:1;border-bottom:1px dotted #aaa;transform:translateY(-3px)}.tc p b{font-weight:900}
.cover,.end{background:#111;color:#fff;padding:0}
.cover::before,.end::before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:#ff6600}
.cv{position:absolute;left:70px;top:90px;width:640px}
.cv .logo{height:120px;margin-bottom:36px}
.cv .k{color:#ff6600}.cv .k::before{background:#ff6600}
.cv h1{font-weight:300;font-size:74px;letter-spacing:.02em;margin:8px 0 22px;line-height:1.02}
.cv .lead{font-size:20px;color:#ddd;line-height:1.45}
.cvph{position:absolute;left:70px;bottom:70px;display:flex;gap:22px}
.cvph .dev{border-color:#444}
.ver{position:absolute;right:56px;bottom:40px;color:#999;font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:11px;margin:0}
.end .cv{top:300px}.end h1{font-size:60px}
`;

const html = `<!doctype html><html lang="nl"><meta charset="utf-8"><title>HHC ClubSupport — Handleiding</title><style>${css}</style><body>${pages.join("")}</body></html>`;
writeFileSync(path.join(out, "handleiding.html"), html);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const pg = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await pg.goto(pathToFileURL(path.join(out, "handleiding.html")).href);
await pg.evaluate(() => document.fonts.ready);
await pg.waitForTimeout(1000);
// Controle: past de inhoud op elke pagina?
const over = await pg.evaluate(() => [...document.querySelectorAll(".page")].map((p, i) => {
  const w = p.querySelector(".bd-wrap");
  if (!w) return null;
  const ft = p.querySelector(".ft").getBoundingClientRect().top;
  const last = [...w.children].at(-1).getBoundingClientRect().bottom;
  return last > ft - 8 ? { pagina: i + 1, teveel: Math.round(last - ft + 8) } : null;
}).filter(Boolean));
if (over.length) console.log("LET OP, inhoud te lang op:", JSON.stringify(over));
await pg.pdf({ path: path.join(out, "HHC-ClubSupport-handleiding.pdf"), width: "794px", height: "1123px", printBackground: true, preferCSSPageSize: true });
if (process.env.PREVIEW) for (const i of process.env.PREVIEW.split(",").map(Number)) await pg.locator(".page").nth(i - 1).screenshot({ path: path.join(out, `prev-${i}.png`) });
await browser.close();
console.log("klaar:", path.join(out, "HHC-ClubSupport-handleiding.pdf"), `${pages.length} pagina's`);
