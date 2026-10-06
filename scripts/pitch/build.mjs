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
const desk = (n, cap, h = 430, w = 760, pos = "top") => `<figure class="dk" style="width:${w}px"><div class="bar"><i></i><i></i><i></i><span>clubsupport-hhchardenberg-rgbs-projects.vercel.app/beheer</span></div><div class="scr" style="height:${h}px"><img src="${shot(n)}" style="object-position:${pos}" alt=""></div>${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
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

  two("Voor het bestuur", "Beheer: overzicht en leden", `<p>Alles wat de ledenadministratie nodig heeft, op telefoon én desktop.</p>${ul("Dashboard met aantallen en status", "Leden zoeken en filteren", "Nieuw lid aanmaken: pas en uitnodiging gaan automatisch mee", "Rechten per rol: scanner, ledenbeheer, systeembeheer")}`, `${desk("beheer-overzicht", "Overzicht", 270, 570)}<div style="height:14px"></div>${desk("beheer-leden", "Ledenlijst", 270, 570)}`),

  two("Passen beheren", "Een pas kwijt? In seconden opgelost", `<p>Op de pagina van een lid staat alles bij elkaar: gegevens, gekoppelde accounts en de pas met haar geschiedenis.</p>${ul("<b>Deactiveren</b> en later weer activeren (bijv. tijdelijk niet betaald, door een mens besloten)", "<b>Opnieuw uitgeven</b> bij verlies of lek: een nieuwe unieke pas; de oude code is direct en onomkeerbaar waardeloos", "Elke wijziging met reden in het auditlog")}`, `${desk("beheer-lid", "Lidpagina", 440, 580)}`),

  two("Importeren", "Honderden leden in één keer, zonder verrassingen", `<p>CSV uploaden, <b>eerst een preview</b>, dan pas bevestigen. Er wordt niets opgeslagen of gemaild voordat u akkoord geeft.</p>${ul("Fouten en dubbele lidnummers worden zichtbaar overgeslagen", "Gedeeld e-mailadres? Eén account met meerdere leden, <b>één uitnodiging</b>", "Koppeling aan bestaande accounts vraagt expliciete bevestiging")}`, `${desk("beheer-import-preview", "Importpreview", 440, 580)}`),

  two("Toezicht", "Controlelogboek: wie controleerde wat", `<p>Een apart, doorzoekbaar logboek voor het bestuur. Kies met één tik een controleur, of filter op lid, uitkomst en periode.</p>${ul("Tijd, controleur, uitkomst en lid", "Nooit de QR-code of een zoekterm", "Bewaartermijn 90 dagen, instelbaar")}`, `${desk("beheer-controles-controleur", "Controles per controleur", 440, 580)}`),

  two("Toezicht", "Audit en accounts", `<p>Alle gevoelige handelingen worden vastgelegd, zonder persoonsgegevens of tokens in het log. Accounts beheren in één scherm.</p>${ul("Audit filteren op account en op actie", "Accounts uitnodigen, blokkeren en van rol wisselen", "Beheerrollen vereisen tweestapsverificatie (MFA)")}`, `${desk("beheer-audit", "Auditlog", 270, 570)}<div style="height:14px"></div>${desk("beheer-accounts", "Accounts", 270, 570)}`),

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
body{margin:0;font-family:DIN,Arial,sans-serif;color:#000}
.s{width:1280px;height:720px;position:relative;overflow:hidden;page-break-after:always;background:#f2f2f2;padding:56px 72px}
.s::before{content:"";position:absolute;left:0;right:0;bottom:0;height:12px;background:#ff6600}
.pg{position:absolute;right:28px;bottom:22px;font-weight:700;font-size:14px;color:#4a4a4a;letter-spacing:.1em}
.k{margin:0 0 10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:15px;color:#ff6600;background:#000;display:inline-block;padding:5px 12px;border-radius:99px}
h1,h2,h3{font-family:DIN;text-transform:uppercase;margin:0;line-height:1.05}
h2{font-weight:300;font-size:46px;margin:6px 0 22px;letter-spacing:.01em}
h3{font-weight:900;font-size:21px;letter-spacing:.06em;margin-bottom:12px}
p{font-size:20px;line-height:1.45;margin:0 0 14px}
ul{margin:0 0 12px;padding-left:22px;font-size:19px;line-height:1.4}
li{margin-bottom:8px}li::marker{color:#ff6600}
.cover,.end{background:#000;color:#fff;padding:0}
.cover::before,.end::before{height:18px}
.cv{position:absolute;left:84px;top:96px;width:620px}
.cv .logo{height:150px;margin-bottom:34px}
.cv h1{font-weight:300;font-size:84px;letter-spacing:.02em;margin:10px 0 24px;line-height:1}
.cv .lead{font-size:26px;color:#ddd;line-height:1.4}
.cvph{position:absolute;right:70px;top:60px;display:flex;gap:26px}
.end .cv{top:130px;width:1000px}.end h1{font-size:96px}.url{display:inline-block;margin-top:26px;font-size:28px;font-weight:700;color:#000;background:#ff6600;padding:12px 26px;border-radius:14px}
.split{display:grid;grid-template-columns:520px 1fr;gap:34px;align-items:center}
.split.wide{grid-template-columns:430px 1fr}
.split .vis{display:flex;justify-content:center;align-items:center;flex-direction:column}
.split h2{font-size:42px}
.row{display:flex;gap:26px;justify-content:center}
.row.three{gap:16px}.row.three .dev{width:205px;height:474px}
.ph,.dk{margin:0;text-align:center}
figcaption{margin-top:10px;font-size:15px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4a4a4a}
.dev{width:236px;height:545px;border:7px solid #000;border-radius:34px;background:#000;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.28)}
.dev img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.pasimg{height:545px;width:auto;border-radius:20px;box-shadow:0 18px 40px rgba(0,0,0,.28);display:block;margin:0 auto}
.dk{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.25);border:2px solid #000}
.dk .bar{background:#000;height:30px;display:flex;align-items:center;gap:7px;padding:0 12px}
.dk .bar i{width:10px;height:10px;border-radius:50%;background:#ff6600;display:block}
.dk .bar span{color:#bbb;font-size:12px;margin-left:12px}
.dk .scr{overflow:hidden}.dk img{width:100%;height:100%;object-fit:cover;display:block}
.dk figcaption{margin:0;padding:6px;background:#f2f2f2}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.cols2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.card{background:#fff;border-radius:18px;padding:26px 28px;border-left:8px solid #ff6600;box-shadow:0 6px 18px rgba(0,0,0,.08)}
.card.hl{background:#000;color:#fff}.card.hl h3{color:#ff6600}
.tile{background:#000;color:#fff;border-radius:22px;padding:30px;min-height:330px}
.tile .n{display:inline-flex;width:54px;height:54px;border-radius:50%;background:#ff6600;color:#000;font-weight:900;font-size:28px;align-items:center;justify-content:center;margin-bottom:18px}
.tile h3{color:#ff6600;font-size:30px}.tile p{font-size:21px;color:#eee}
.foot{margin-top:26px;font-size:18px;color:#4a4a4a}
.note{font-size:16px;color:#4a4a4a;font-style:italic}
`;

const html = `<!doctype html><html lang="nl"><meta charset="utf-8"><title>HHC ClubSupport — pitch</title><style>${css}</style><body>${slides.join("")}</body></html>`;
writeFileSync(path.join(out, "pitch.html"), html);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(out, "pitch.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
await page.pdf({ path: path.join(out, "HHC-ClubSupport-pitch.pdf"), width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true });
for (const i of [6, 10, 12, 13, 14, 18]) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator(".s").nth(i - 1).screenshot({ path: path.join(out, `prev-${i}.png`) });
}
await browser.close();
console.log("klaar:", path.join(out, "HHC-ClubSupport-pitch.pdf"), `${slides.length} dia's`);
