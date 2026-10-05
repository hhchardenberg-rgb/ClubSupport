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

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
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
await browser.close();
console.log("iconen geschreven in public/icons");
