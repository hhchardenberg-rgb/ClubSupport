/**
 * Genereert app-iconen (PNG) met Chromium (Playwright).
 *   node scripts/make-icons.mjs                 -> tijdelijke iconen (tekst "HHC")
 *   node scripts/make-icons.mjs pad/naar/logo.svg|png -> iconen met het echte logo
 * Ledenpas = oranje achtergrond; Scanner = zwarte achtergrond met zoekerhoeken, zodat beide apps te onderscheiden zijn.
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const logoPath = process.argv[2];
const font = readFileSync("public/fonts/din-black.woff2").toString("base64");
const logoData = logoPath ? `data:${/\.svg$/i.test(logoPath) ? "image/svg+xml" : "image/png"};base64,${readFileSync(logoPath).toString("base64")}` : null;

function html(kind, size, maskable) {
  const pad = maskable ? 0.2 : 0.1; // maskable: veilige zone (80%)
  const scanner = kind === "scanner";
  const bg = scanner ? "#000" : "#ff6600";
  const fg = scanner ? "#ff6600" : "#000";
  const inner = logoData
    ? `<img src="${logoData}" style="height:${scanner ? 62 : 80}%;max-width:100%;object-fit:contain">`
    : `<div style="font:900 ${size * 0.34}px DIN;color:${fg};line-height:1">HHC</div>`;
  const label = scanner ? `<div style="font:900 ${size * 0.1}px DIN;color:#fff;letter-spacing:${size * 0.01}px;margin-top:${size * 0.03}px">SCANNER</div>` : "";
  const corners = scanner
    ? ["top:0;left:0;border-top:6px solid #ff6600;border-left:6px solid #ff6600", "top:0;right:0;border-top:6px solid #ff6600;border-right:6px solid #ff6600", "bottom:0;left:0;border-bottom:6px solid #ff6600;border-left:6px solid #ff6600", "bottom:0;right:0;border-bottom:6px solid #ff6600;border-right:6px solid #ff6600"]
        .map((c) => `<i style="position:absolute;${c};width:${size * 0.12}px;height:${size * 0.12}px"></i>`).join("")
    : "";
  return `<style>@font-face{font-family:DIN;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:900}
  html,body{margin:0}#i{width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center;position:relative;box-sizing:border-box}
  #c{position:absolute;inset:${size * pad}px;display:flex;flex-direction:column;align-items:center;justify-content:center}</style>
  <div id="i"><div id="c">${corners}${inner}${label}</div></div>`;
}

import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/brand", { recursive: true });
let logoRatio = 0.9;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage();

// Logo: bronbestand bewaren en webformaten renderen (verhouding blijft behouden, nooit vervormen).
if (logoData) {
  mkdirSync("brand-source", { recursive: true });
  if (path.resolve(logoPath).startsWith(path.resolve("brand-source")) === false) copyFileSync(logoPath, path.join("brand-source", "HHC_ClubSupport_Logo_RGB" + path.extname(logoPath).toLowerCase()));
  await page.setContent(`<img id="l" src="${logoData}">`);
  await page.waitForFunction(() => document.getElementById("l").complete);
  const dim = await page.evaluate(() => ({ w: document.getElementById("l").naturalWidth, h: document.getElementById("l").naturalHeight }));
  logoRatio = dim.w && dim.h ? dim.w / dim.h : 0.9;
  for (const [file, h] of [["logo.png", 512], ["logo-email.png", 160], ["logo-small.png", 96]]) {
    const w = Math.round(h * logoRatio);
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${w}px;height:${h}px}</style><img src="${logoData}">`);
    await page.waitForFunction(() => document.images[0].complete);
    writeFileSync(path.join("public/brand", file), await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true }));
  }
  // favicon (32px) en grote OG-achtige afbeelding blijven bewust achterwege; favicon = icoon 192
}
async function render(kind, size, file, maskable = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(kind, size, maskable));
  await page.evaluate(() => document.fonts.ready);
  if (logoData) await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  writeFileSync(path.join("public/icons", file), await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
}
for (const kind of ["ledenpas", "scanner"]) {
  await render(kind, 192, `${kind}-192.png`);
  await render(kind, 512, `${kind}-512.png`);
  await render(kind, 512, `${kind}-maskable-512.png`, true);
  await render(kind, 180, `apple-touch-${kind}.png`, true);
}

writeFileSync(
  "src/lib/brand.generated.ts",
  `// GEGENEREERD door scripts/make-icons.mjs — niet met de hand bewerken.\nexport const BRAND: { logo: string | null; logoEmail: string | null; ratio: number } = ${JSON.stringify({ logo: logoData ? "/brand/logo.png" : null, logoEmail: logoData ? "/brand/logo-email.png" : null, ratio: Number(logoRatio.toFixed(4)) })};\n`,
);
await browser.close();
console.log("iconen geschreven in public/icons, public/brand en src/lib/brand.generated.ts");
