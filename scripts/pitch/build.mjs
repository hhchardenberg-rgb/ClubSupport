// Bouwt pitch-out/HHC-ClubSupport-pitch.pdf uit de opnames in pitch-out/shots (zie scripts/pitch/capture.test.ts).
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "pitch-out");
const U = (p) => pathToFileURL(path.join(root, p)).href;
const shot = (n) => U(`pitch-out/shots/${n}.png`);
const font = (f) => U(`public/fonts/${f}.woff2`);

const phone = (n, cap) => `<figure class="ph"><div class="dev"><img src="${shot(n)}" alt=""></div>${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
const desk = (n, cap, h = 440, w = 700, pos = "top") => `<figure class="dk" style="width:${w}px"><div class="scr" style="height:${h}px"><img src="${shot(n)}" style="object-position:${pos}" alt=""></div>${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
const logo = `<img class="logo" src="${U("public/brand/logo.png")}" alt="HHC ClubSupport">`;

let n = 0;
const slide = (cls, inner) => `<section class="s ${cls}"><div class="pg">${String(++n).padStart(2, "0")}</div>${inner}</section>`;
const two = (kicker, title, text, visual, cls = "") => slide(`split ${cls}`, `<div class="txt"><p class="k">${kicker}</p><h2>${title}</h2>${text}</div><div class="vis">${visual}</div>`);
const ul = (...items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

const slides = [
  slide("cover", `<div class="cv">${logo}<p class="k">Supportersvereniging HHC Hardenberg</p><h1>HHC ClubSupport</h1><p class="lead">De digitale ledenpas: veilig, snel en eenvoudig.<br>Voor leden, controleurs en bestuur.</p></div><div class="cvph">${phone("ledenpas-een-pas")}${phone("scanner-geldig")}</div>`),

  slide("plain", `<p class="k">Het vraagstuk</p><h2>Een ledenpas moet je kunnen vertrouwen</h2><div class="cols3">
    <div class="card"><h3>Nu</h3>${ul("Plastic of papieren passen raken kwijt of worden gekopieerd", "Controle op een lijst of op goed vertrouwen", "Bij verlies blijft de oude pas gewoon werken")}</div>
    <div class="card hl"><h3>Met ClubSupport</h3>${ul("Elke pas is een unieke, onraadbare code", "De scanner vraagt <b>live</b> aan de server of de pas nu geldig is", "Kwijt of gelekt? Direct intrekken en een nieuwe uitgeven")}</div>
    <div class="card"><h3>Voor iedereen</h3>${ul("Leden: pas altijd op de telefoon, ook zonder internet te tonen", "Controleurs: één blik, groot en duidelijk resultaat", "Bestuur: volledig overzicht en een spoor van wie wat deed")}</div></div>`),

  slide("plain", `<p class="k">De oplossing</p><h2>Drie ervaringen, één systeem</h2><div class="cols3 tri">
    <div class="tile"><span class="n">1</span><h3>Ledenpas</h3><p>De app voor leden. Inloggen, pas tonen, bewaren of afdrukken. Gezinnen swipen tussen passen.</p></div>
    <div class="tile"><span class="n">2</span><h3>Scanner</h3><p>De app voor controleurs. QR scannen, of een lid zoeken op naam of lidnummer. Altijd live gecontroleerd.</p></div>
    <div class="tile"><span class="n">3</span><h3>Beheer</h3><p>Voor bestuur en ledenadministratie. Leden, passen, import, controlelogboek, accounts en audit.</p></div></div>
    <p class="foot">Elk onderdeel is een aparte app met eigen inlog en eigen rechten; de startpagina voor leden toont geen scanner of beheer.</p>`),

  two("Voor leden", "Inloggen en de pas staat klaar", `<p>Een rustig, herkenbaar scherm in de huisstijl. Geen registratie: leden krijgen een uitnodiging per e-mail met een eenmalige activatielink.</p>${ul("Pas direct na inloggen zichtbaar", "Naam, lidnummer en QR groot in beeld", "Wachtwoord vergeten? Eén duidelijke knop")}`, `<div class="row">${phone("ledenpas-inloggen", "Inloggen")}${phone("ledenpas-een-pas", "Eigen ledenpas")}</div>`),

  two("Voor gezinnen", "Meerdere passen? Gewoon swipen", `<p>Eén account kan aan meerdere leden gekoppeld zijn, bijvoorbeeld een gezin. Alle passen staan in één carrousel.</p>${ul("Veeg naar links en rechts, of gebruik de pijlen", "Stippen en teller: je weet altijd welke pas je ziet", "Koppelen gebeurt alleen door een beheerder, nooit automatisch op e-mailadres")}`, `<div class="row">${phone("ledenpas-gezin-1", "Pas 1 van 3")}${phone("ledenpas-gezin-2", "Pas 2 van 3")}</div>`),

  two("Bewaren en delen", "De hele pas als afbeelding, of op papier", `<p>Zonder Apple Wallet of Google Wallet. Leden bewaren hun pas zelf, direct vanuit de app.</p>${ul("<b>Pas bewaren als afbeelding</b>: logo, naam, lidnummer en QR als PNG, via het deelmenu van de telefoon", "<b>Afdrukken</b>: alleen de pas, netjes op papier", "Alles gebeurt op het toestel; er gaat niets naar een ander systeem")}<p class="note">Een bewaarde kopie blijft werken tot de pas wordt ingetrokken.</p>`, `<div class="row">${phone("ledenpas-een-pas", "Knoppen onder de pas")}<figure class="ph"><img class="pasimg" src="${shot("pas-afbeelding")}" alt=""><figcaption>Zo ziet de bewaarde afbeelding eruit</figcaption></figure></div>`),

  two("Zonder internet", "De pas ook in de kelder van de kantine", `<p>Na inloggen bewaart de app (met toestemming van het lid) een kopie van de eigen passen op het toestel.</p>${ul("Pas tonen kan ook zonder verbinding", "Duidelijke melding wanneer de gegevens voor het laatst zijn bijgewerkt", "Kopie verloopt vanzelf (standaard 30 dagen) en verdwijnt bij uitloggen", "De scanner controleert <b>altijd</b> online: een ingetrokken pas werkt nooit meer")}`, `<div class="row">${phone("ledenpas-offline", "Offline: pas blijft zichtbaar")}${phone("ledenpas-offline-aan", "Online, met offline kopie aan")}</div>`),

  two("Voor controleurs", "Scannen, en in één blik weten", `<p>De scanner is een eigen installeerbare app. De camera start pas na een tik; het resultaat vult het hele scherm.</p>${ul("<b>GELDIG</b>: naam en lidnummer, om te vergelijken met een legitimatiebewijs", "<b>ONGELDIG</b>: pas gedeactiveerd, ingetrokken of onbekende code", "<b>NIET GECONTROLEERD</b>: bij geen verbinding of een fout. De scanner toont nooit 'geldig' als hij het niet zeker weet")}`, `<div class="row three">${phone("scanner-geldig", "Geldig")}${phone("scanner-gedeactiveerd", "Gedeactiveerd")}${phone("scanner-offline", "Geen verbinding")}</div>`, "wide"),

  two("Voor controleurs", "Pas vergeten? Zoek het lid op", `<p>Een lid zonder pas hoeft niet te worden weggestuurd. De controleur zoekt op naam of lidnummer en ziet direct of er een actieve pas is.</p>${ul("Minimaal 3 tekens, maximaal 8 resultaten", "Alleen naam, lidnummer en status: geen adres of e-mail", "Begrensd per minuut; zoektermen worden niet opgeslagen", "Elke zoekactie staat wel (zonder zoekterm) in het controlelogboek")}`, `<div class="row">${phone("scanner-zoeken", "Zoeken op naam of lidnummer")}${phone("scanner-onbekend", "Onbekende code")}</div>`),

  two("Voor het bestuur", "Beheer: leden in beeld", `<p>Alles wat de ledenadministratie nodig heeft, op telefoon én desktop.</p>${ul("Dashboard met aantallen en status", "Leden zoeken en filteren", "Nieuw lid aanmaken: pas en uitnodiging gaan automatisch mee", "Rechten per rol: scanner, ledenbeheer, systeembeheer")}`, `${desk("beheer-leden", "Ledenlijst", 470, 700)}`),

  two("Passen beheren", "Een pas kwijt? In seconden opgelost", `<p>Op de pagina van een lid staat alles bij elkaar: gegevens, gekoppelde accounts en de pas met haar geschiedenis.</p>${ul("<b>Deactiveren</b> en later weer activeren (bijv. tijdelijk niet betaald, door een mens besloten)", "<b>Opnieuw uitgeven</b> bij verlies of lek: een nieuwe unieke pas; de oude code is direct en onomkeerbaar waardeloos", "Elke wijziging met reden in het auditlog")}`, `${desk("beheer-lid", "Lidpagina", 470, 700)}`),

  two("Importeren", "Honderden leden in één keer, zonder verrassingen", `<p>CSV uploaden, <b>eerst een preview</b>, dan pas bevestigen. Er wordt niets opgeslagen of gemaild voordat u akkoord geeft.</p>${ul("Fouten en dubbele lidnummers worden zichtbaar overgeslagen", "Gedeeld e-mailadres? Eén account met meerdere leden, <b>één uitnodiging</b>", "Koppeling aan bestaande accounts vraagt expliciete bevestiging")}`, `${desk("beheer-import-preview", "Importpreview", 470, 700)}`),

  two("Toezicht", "Controlelogboek: wie controleerde wat", `<p>Een apart, doorzoekbaar logboek voor het bestuur. Kies met één tik een controleur, of filter op lid, uitkomst en periode.</p>${ul("Tijd, controleur, uitkomst en lid", "Nooit de QR-code of een zoekterm", "Bewaartermijn 90 dagen, instelbaar")}`, `${desk("beheer-controles-controleur", "Controles per controleur", 470, 700)}`),

  two("Toezicht", "Audit: elke gevoelige handeling vastgelegd", `<p>Geen persoonsgegevens of tokens in het log, wel wie wat deed en waarom.</p>${ul("Filter per account met één tik, en op actie", "Bewaartermijn instelbaar (standaard 2 jaar)", "Alleen systeembeheer heeft toegang")}`, `${desk("beheer-audit", "Auditlog", 470, 700)}`),

  two("Accounts en rollen", "Elke medewerker een eigen account", `<p>Controleurs en beheerders melden zich persoonlijk aan; geen gedeelde inlog.</p>${ul("Uitnodigen, blokkeren en van rol wisselen", "Rollen: scanner, ledenbeheer, systeembeheer", "Beheerrollen vereisen tweestapsverificatie (MFA)", "Per account direct naar controles en auditlog")}`, `${desk("beheer-accounts", "Accounts", 470, 700)}`),

  slide("plain", `<p class="k">Veiligheid vanaf het ontwerp</p><h2>Gebouwd om niet te lekken</h2><div class="cols3 sec">
    <div class="card"><h3>De code</h3>${ul("Minimaal 256 bit willekeurig, onraadbaar", "In de QR staat <b>geen</b> naam of nummer", "Opgeslagen als HMAC-hash, plus versleuteld (AES-GCM); bij intrekking gewist")}</div>
    <div class="card"><h3>Controle</h3>${ul("De database is altijd de bron van waarheid", "Fail-safe scanner: twijfel = niet gecontroleerd", "Rate limits op scans en zoeken")}</div>
    <div class="card"><h3>Toegang</h3>${ul("Eigen apps met eigen rechten (rollen)", "MFA voor beheerrollen", "Beveiligde inlog (Better Auth), sessies, CSRF- en XSS-bescherming (CSP met nonce)")}</div></div>
    <p class="foot">Met OWASP ASVS 5.0 als toetsingskader. Dit is een kader, geen certificering.</p>`),

  slide("plain", `<p class="k">Techniek</p><h2>Modern, EU-gehost en onderhoudbaar</h2><div class="cols3 tech">
    <div class="card"><h3>Stack</h3>${ul("Next.js 16 en TypeScript", "Postgres (Neon) met Drizzle-migraties", "Hosting op Vercel, functies in Frankfurt", "Installeerbare PWA's voor leden en scanner")}</div>
    <div class="card"><h3>E-mail</h3>${ul("Uitnodigingen en meldingen via een betrouwbare uitgaande rij", "Maximaal één uitnodiging per nieuw account", "Eenmalige, verlopende activatielinks (gehasht opgeslagen)", "Nu in testmodus")}</div>
    <div class="card"><h3>Kwaliteit</h3>${ul("49 geautomatiseerde unit-/integratietests", "28 browser- en end-to-end-tests", "Automatische toegankelijkheidscontrole (WCAG 2.1 AA)", "Bewaartermijnen met dagelijkse opruiming")}</div></div>`),

  slide("plain", `<p class="k">Huisstijl</p><h2>Herkenbaar HHC, van scherm tot pas</h2><div class="cols3 brand"><div class="card"><h3>Kleur en vorm</h3>${ul("Alleen HHC-oranje en zwart, met wit en grijs", "Geen groen; rood alleen voor fouten", "Het echte logo op elk scherm, in de pas, in e-mail en als app-icoon")}</div><div class="card"><h3>Typografie</h3>${ul("DIN, zoals in het huisstijlhandboek", "Grote, leesbare tekst", "Bedienbaar met duim, op elk schermformaat")}</div><div class="card"><h3>Gevoel van een app</h3>${ul("Geen zijwaarts schuiven van de pagina", "Installeren op het beginscherm", "Veilige randen voor notch en gebaren")}</div></div>`),

  slide("plain", `<p class="k">Eerlijk over de status</p><h2>Wat werkt, en wat nog moet vóór livegang</h2><div class="cols2"><div class="card hl"><h3>Klaar en getest</h3>${ul("Ledenpas, scanner en beheer, volledig werkend", "Import, controlelogboek, audit, accounts, MFA-eis", "Pas bewaren, afdrukken, offline tonen", "Live op Vercel met een eigen database")}</div><div class="card"><h3>Nog te doen door de club</h3>${ul("E-mail op een eigen afzenderdomein (nu testmodus)", "Controle van de database-regio (EU) en back-up", "Test op echte iPhones en Android-toestellen", "Controle lettertypelicentie voor webgebruik", "Demo-accounts verwijderen voordat echte leden komen")}</div></div><p class="foot">Bekende beperking: een QR-code kan worden gekopieerd (screenshot). Daarom toont de scanner altijd naam en lidnummer ter vergelijking met een ID, en kan een pas direct worden ingetrokken.</p>`),

  slide("end", `<div class="cv">${logo}<h1>Zelf ervaren?</h1><p class="lead">De app draait live. Log in met een demo-account en loop de ledenpas, de scanner en het beheer door.</p><p class="url">clubsupport-hhchardenberg-rgbs-projects.vercel.app</p></div>`),
];

const css = `
@font-face{font-family:DIN;src:url(${font("dinnext-light")});font-weight:300}
@font-face{font-family:DIN;src:url(${font("dinnext-regular")});font-weight:400}
@font-face{font-family:DIN;src:url(${font("dinnext-medium")});font-weight:500}
@font-face{font-family:DIN;src:url(${font("dinnext-bold")});font-weight:700}
@font-face{font-family:DIN;src:url(${font("din-black")});font-weight:900}
@page{size:1280px 720px;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:DIN,Arial,sans-serif;color:#111;background:#fff}
.s{width:1280px;height:720px;position:relative;overflow:hidden;page-break-after:always;background:#fff;padding:64px 80px}
.s::after{content:"";position:absolute;left:80px;top:34px;width:44px;height:44px;background:url(${U("public/brand/logo-small.png")}) center/contain no-repeat}
.cover::after,.end::after,.cover .pg,.end .pg{display:none}
.pg{position:absolute;right:80px;top:46px;font-weight:700;font-size:14px;color:#8a8a8a;letter-spacing:.14em}
.k{margin:0 0 14px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;font-size:14px;color:#111;display:flex;align-items:center;gap:12px}
.k::before{content:"";width:36px;height:4px;background:#ff6600;display:block}
h1,h2,h3{margin:0;line-height:1.05;text-transform:uppercase}
h2{font-weight:300;font-size:44px;margin:0 0 24px;letter-spacing:.01em}
h3{font-weight:900;font-size:19px;letter-spacing:.08em;margin-bottom:14px}
p{font-size:20px;line-height:1.5;margin:0 0 14px;color:#333}
ul{margin:0 0 12px;padding-left:22px;font-size:19px;line-height:1.45;color:#222}
li{margin-bottom:9px}li::marker{color:#ff6600}
.plain{padding-top:90px;display:flex;flex-direction:column;justify-content:center}
.plain h2{margin-bottom:30px}
.split{display:grid;grid-template-columns:480px 1fr;gap:48px;align-items:center;padding-top:96px;padding-bottom:48px}
.split.wide{grid-template-columns:420px 1fr}
.split .vis{display:flex;justify-content:center;align-items:center;flex-direction:column}
.row{display:flex;gap:28px;justify-content:center}
.row.three{gap:18px}.row.three .dev{width:200px;height:462px}
.ph,.dk{margin:0;text-align:center}
figcaption{margin-top:12px;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#777}
.dev{width:232px;height:536px;border:4px solid #111;border-radius:30px;background:#fff;overflow:hidden}
.dev img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.pasimg{height:536px;width:auto;border-radius:18px;display:block;margin:0 auto}
.dk{border:1px solid #cfcfcf;border-radius:14px;overflow:hidden;background:#fff}
.dk .scr{overflow:hidden}.dk img{width:100%;height:100%;object-fit:cover;display:block}
.dk figcaption{margin:0;padding:10px;border-top:1px solid #e6e6e6;background:#fafafa}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.cols2{display:grid;grid-template-columns:1fr 1fr;gap:28px}
.card{background:#fff;border:1px solid #d9d9d9;border-top:5px solid #ff6600;border-radius:14px;padding:26px 28px}
.card.hl{background:#111;border-color:#111;border-top-color:#ff6600;color:#fff}.card.hl h3{color:#ff6600}.card.hl ul,.card.hl p{color:#eee}
.tile{background:#111;color:#fff;border-radius:18px;padding:32px;min-height:330px}
.tile .n{display:inline-flex;width:52px;height:52px;border-radius:50%;background:#ff6600;color:#111;font-weight:900;font-size:26px;align-items:center;justify-content:center;margin-bottom:20px}
.tile h3{color:#ff6600;font-size:28px}.tile p{font-size:20px;color:#eee}
.foot{margin-top:28px;font-size:17px;color:#555;border-left:4px solid #ff6600;padding-left:16px}
.note{font-size:16px;color:#666;font-style:italic}
.cover,.end{background:#111;color:#fff;padding:0}
.cover::before,.end::before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:#ff6600}
.cv{position:absolute;left:96px;top:92px;width:600px}
.cv .logo{height:140px;margin-bottom:36px}
.cv .k{color:#ff6600}
.cv h1{font-weight:300;font-size:80px;letter-spacing:.02em;margin:8px 0 24px;line-height:1}
.cv .lead{font-size:25px;color:#ddd;line-height:1.45}
.cvph{position:absolute;right:70px;top:70px;display:flex;gap:26px}
.cvph .dev{border-color:#444}
.end .cv{top:150px;width:1000px}.end h1{font-size:92px}
.url{display:inline-block;margin-top:24px;font-size:26px;font-weight:700;color:#111;background:#ff6600;padding:12px 26px;border-radius:12px}
`;

const html = `<!doctype html><html lang="nl"><meta charset="utf-8"><title>HHC ClubSupport — pitch</title><style>${css}</style><body>${slides.join("")}</body></html>`;
writeFileSync(path.join(out, "pitch.html"), html);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(out, "pitch.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
await page.pdf({ path: path.join(out, "HHC-ClubSupport-pitch.pdf"), width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true });
for (const i of [1, 4, 6, 10, 11, 13, 19]) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator(".s").nth(i - 1).screenshot({ path: path.join(out, `prev-${i}.png`) });
}
await browser.close();
console.log("klaar:", path.join(out, "HHC-ClubSupport-pitch.pdf"), `${slides.length} dia's`);
