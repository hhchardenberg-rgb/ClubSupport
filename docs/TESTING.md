# Testoverzicht

Laatste volledige run (lokaal, Postgres 16, Node 22, Chromium): **82 unit-/integratietests + 38 end-to-end-/browsertests, allemaal geslaagd.** De CI-workflow (`.github/workflows/ci.yml`) is geschreven maar nog niet op GitHub gedraaid.

```bash
npm test          # unit/integratie (tests/*.test.ts)
npm run test:e2e  # next build + e2e + browser (tests-e2e/*.test.ts)
```

## Dekking per gevraagde test

| # | Vereiste | Status | Waar |
|---|---|:-:|---|
| 1 | Beheerder maakt lid/pas; unieke QR; geen persoonsgegevens | ✔ | `passes.test.ts` (token opaque, 256 bit, uniek, niet in DB-rij), `accounts.test.ts` |
| 2 | Geautoriseerde scanner ziet geldigheid, naam, lidnummer | ✔ | `passes.test.ts`, `roles.test.ts` (scan-endpoint), `browser.test.ts` (echte browser) |
| 3 | Account ziet gekoppelde passen; niet-gekoppeld id/token geeft geen toegang | ✔ | `accounts.test.ts`, `roles.test.ts` (ledenpas) |
| 4 | Deactiveren/verwijderen/heruitgeven → oude token direct ongeldig | ✔ | `passes.test.ts`, `roles.test.ts` (via live endpoint) |
| 5 | Pas blijft geldig tot expliciete deactivatie; tijd/betaling doet niets | ✔ | `passes.test.ts` (pas uit 2000, notitie "niet betaald" → nog geldig) |
| 6 | CSV-preview: ontbrekende velden, duplicaten, ongeldige rijen, geen acties | ✔ | `import.test.ts` |
| 7 | Onbekende, gemanipuleerde, te vaak aangeboden codes | ✔ | `passes.test.ts`, `roles.test.ts` (429 bij te veel scans) |
| 8 | Offline scanner toont nooit geldig | ✔ | `scan-view.test.ts` (alle fout-/rommelantwoorden), `browser.test.ts` (offline, abort, 500, HTML-200) |
| 9 | Scanner-rol kan niet naar ledenbeheer/admin | ✔ | `roles.test.ts` (alle beheer-routes); zie beperking hieronder |
| 10 | (vervallen) Wallet is niet in gebruik; vervangen door offline kopie voor leden | ✔ | `browser.test.ts` (offline kopie, server uitgeschakeld) |
| 11 | Account met meerdere leden ziet alle passen; ongekoppeld blijft ontoegankelijk | ✔ | `accounts.test.ts`, `roles.test.ts` |
| 12 | CSV-preview groepeert gedeelde e-mail zonder duplicaat; bevestiging vereist | ✔ | `import.test.ts` |
| 13 | ≤ 1 uitnodiging per nieuw account; bestaand account alleen melding, geen wachtwoordwijziging | ✔ | `accounts.test.ts`, `links.test.ts`, `import.test.ts` |
| 14 | Activatie-/resetlinks eenmalig, verlopen, gehasht, geen account-enumeratie | ✔ | `links.test.ts` |
| 15 | PWA, camera, handmatige invoer, responsive op iOS Safari/Android Chrome | **gedeeltelijk** | `browser.test.ts`: Chromium met Pixel 5/iPhone 13-emulatie, nepcamera, geweigerde camera, handmatige invoer, offline, manifesten + iconen + service worker, geen CSP-fouten, 320 px-breedte. **Niet** op echte toestellen of in echte Safari/WebKit |

Aanvullend gedekt: **zoeken op naam/lidnummer** (`lookup.test.ts`, scanner-UI), **controlelogboek en auditfilter per account** (`scanlog.test.ts`), **offline ledenpas**, **pas bewaren als afbeelding (PNG-download)**, **veegbare pas-carrousel** (echte aanraak-veeg via CDP, pijlen, stippen, toetsenbord, labels, geen horizontale scroll; getest met verminderde beweging), **automatische toegankelijkheidscontrole** (axe-core, WCAG 2.1 A/AA) op login-, activatie-, ledenpas-, scanner- en beheerschermen op telefoon (Pixel 5) en desktop, met een negatieve controle dat axe echt overtredingen vindt, bewaartermijnen/opruimjob en cron-autorisatie (`retention.test.ts`), CSRF/Origin op eigen routes, security headers, geblokkeerd account, MFA-redirect voor beheerrollen, hoofdpagina zonder Scanner/Beheer-verwijzingen (`roles.test.ts`).

## Ledenadministratie (aanvulling): gevraagde tests

| Vereiste | Waar |
|---|---|
| Meerdere leden met hetzelfde e-mailadres (geen samenvoeging, plus-adressen apart, ongevraagd koppelen geweigerd) | `members.test.ts` |
| Één account met expliciet gekoppelde leden/passen; ontkoppelen raakt lid/lidmaatschap/pas niet | `members.test.ts` |
| Weigering van toegang tot niet-gekoppelde leden, ook direct (id, URL, API): `getPassForAccount`, ledenpas-HTML, beheerroutes voor lid/scanner | `members.test.ts`, `roles.test.ts` |
| Geldige/ongeldige scans bij beëindigd, geschorst, verlopen, nog niet gestart, geen lidmaatschap, gearchiveerd; einddatum inclusief; tijdzone Amsterdam | `membership.test.ts`, `members.test.ts`, `roles.test.ts` (API) |
| Directe server-side intrekking van vervangen/verloren pas; historie bewaard | `members.test.ts` |
| Import: gedeelde e-mail, dubbele lidnummers, mogelijke dubbele personen, herhaald importeren, externe referentie als sleutel, kolomkoppeling (UI in Chromium) | `members.test.ts`, `import.test.ts`, `membership.test.ts` (CSV), `browser.test.ts` |
| Maximaal één uitnodiging per nieuw account bij meerdere gekoppelde leden | `members.test.ts`, `import.test.ts` |
| Rolbeperkingen: scanner/ledenbeheer/sysadmin/lid, export, koppelingen | `membership.test.ts`, `roles.test.ts` |
| Veilig archiveren/verwijderen zonder cascade (account en ander lid blijven; purge raakt alleen het verwijderde lid) | `members.test.ts` |
| Export: recht, Origin/CSRF, methode, CSV-header, formule-injectie, geen tokens, audit zonder persoonsgegevens | `roles.test.ts` |
| Toegankelijkheid van lid-, import-, koppelingen- en gefilterde ledenschermen (axe) | `browser.test.ts` |

**Oud-leden en nieuwsbrieven** (`newsletter.test.ts`, `roles.test.ts`, `browser.test.ts`): categorie lid/oud-lid/geen, filter en teller, nieuw lidmaatschap maakt weer lid · opmaak (escaping, javascript:-links, headers, validatie) · doelgroepen (gedeeld adres één keer, verwijderd/adresloos/afgemeld nooit) · bevestiging + ontvangersaantal, één keer in de wachtrij, precies één mail per ontvanger met eigen afmeldlink, herhaald verwerken verstuurt niets opnieuw · testmodus max. 3 · afmelden (gemanipuleerde tokens, idempotent, wachtende verzendingen vervallen, geen adres in audit, prefetch-veilig, één-klik alleen via POST) · annuleren en opnieuw proberen · testmail · rechten · toegankelijkheid van de nieuwsbriefschermen en afmeldpagina. De provider is in de tests vervangen; er is **niets echt verstuurd**.

Alle testgegevens zijn synthetisch (`example.test`-adressen, verzonnen namen).

## Bekende gaten in de tests
- Het **koppelscherm van de import** is end-to-end in Chromium getest; de afzonderlijke server actions voor lidmaatschap/archiveren/verwijderen zijn via de domeinfuncties getest en door `requireStaff` beschermd, maar niet met een ruw POST-verzoek per rol aangeroepen.
- **Server actions** worden via de pagina's en de `requireStaff`-guard beschermd en de routes zijn e2e getest, maar elke afzonderlijke action is niet met een ruw POST-verzoek aangeroepen door een onbevoegde rol.
- **MFA-inrichting** (TOTP scannen/bevestigen) is niet geautomatiseerd getest; alleen de redirect-eis en de inlogstap zijn gedekt.
- **Echte Resend-accounts** zijn niet gebruikt (alleen testmodus).
- Geen belasting- of penetratietest. De automatische axe-controle dekt maar een deel van de toegankelijkheidseisen; een schermlezertest (VoiceOver/TalkBack) en een toetsenbordronde door Beheer zijn niet gedaan.
- Accounts-, audit- en importscherm zijn visueel gecontroleerd maar niet in de axe-run opgenomen (die dekt overzicht, leden, nieuw lid, lid en import).

## Handmatige apparaattest (uit te voeren door de club vóór livegang)

**iPhone/iPad (Safari, HTTPS-productie-URL):**
1. Ledenpas: inloggen → pas zichtbaar → *Deel → Zet op beginscherm* → app opent standalone met eigen icoon/naam.
2. Scanner (`/scanner`): inloggen als controleur → *Zet op beginscherm* → naam "Scanner" en ander icoon dan Ledenpas.
3. Scan starten → cameratoestemming verschijnt pas na de tik; scan een pas → GELDIG met naam; gedeactiveerde pas → ONGELDIG; vliegtuigmodus → "Niet gecontroleerd".
4. Camera geweigerd (Instellingen → Safari) → duidelijke melding + handmatige invoer werkt.
5. Offline: inloggen, offline kopie aan, vliegtuigmodus → pas zichtbaar; uitloggen → kopie weg.

**Android (Chrome):** idem; installatiebanner of *Menu → App installeren*.

**Beide:** schermen op 320–430 px zonder horizontaal scrollen; scanresultaat leesbaar in fel zonlicht (hoogste schermhelderheid); schermlezer (VoiceOver/TalkBack) leest de resultaten voor (`role=alert`).
