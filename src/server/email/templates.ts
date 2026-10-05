import { env } from "@/lib/env";
import { BRAND } from "@/lib/brand.generated";

/** Korte, minimale mails. Geen QR-token, geen bijlage, geen wachtwoord. */
export type Mail = { subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wrap(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;color:#000">
<div style="background:#000;color:#fff;padding:14px 20px;border-bottom:6px solid #ff6600;font-weight:bold;letter-spacing:.5px">${
  BRAND.logoEmail ? `<img src="${env.appUrl}${BRAND.logoEmail}" alt="HHC ClubSupport" height="56" style="display:block;height:56px;width:auto">` : `HHC <span style="color:#ff6600">CLUBSUPPORT</span>`
}</div>
<div style="max-width:560px;margin:0 auto;padding:20px;background:#fff"><h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}</div></body></html>`;
}

function button(url: string, label: string) {
  return `<p><a href="${esc(url)}" style="display:inline-block;background:#ff6600;color:#000;font-weight:bold;padding:12px 20px;text-decoration:none;border:2px solid #000">${esc(label)}</a></p><p style="font-size:13px;color:#444">Werkt de knop niet? Kopieer deze link: ${esc(url)}</p>`;
}

export function invitationMail(p: { name: string; loginName: string; link: string }): Mail {
  const subject = "Activeer je HHC ClubSupport-account";
  const text = `Hallo ${p.name},\n\nJe ledenpas van HHC ClubSupport staat klaar. Activeer je account en kies zelf een wachtwoord.\n\nInlognaam: ${p.loginName}\nActiveren: ${p.link}\n\nDeze link is 24 uur geldig en kan één keer worden gebruikt. Wij sturen nooit een wachtwoord per e-mail.\nMet dit account kan iedereen met toegang alle eraan gekoppelde ledenpassen zien en beheren.`;
  const html = wrap("Je ledenpas staat klaar", `<p>Hallo ${esc(p.name)},</p><p>Activeer je account en kies zelf een wachtwoord.</p><p>Inlognaam: <strong>${esc(p.loginName)}</strong></p>${button(p.link, "Account activeren")}<p style="font-size:13px">De link is 24 uur geldig en werkt één keer. Wij sturen nooit een wachtwoord per e-mail. Iedereen met toegang tot dit account ziet en beheert alle eraan gekoppelde ledenpassen.</p>`);
  return { subject, text, html };
}

export function passNoticeMail(p: { name: string }): Mail {
  const link = `${env.appUrl}/ledenpas/inloggen`;
  const subject = "Er staat een nieuwe ledenpas klaar";
  const text = `Hallo ${p.name},\n\nEr is een nieuwe ledenpas aan je HHC ClubSupport-account gekoppeld. Log in om de pas te bekijken: ${link}\n\nJe wachtwoord is niet gewijzigd.`;
  const html = wrap("Nieuwe ledenpas", `<p>Hallo ${esc(p.name)},</p><p>Er is een nieuwe ledenpas aan je account gekoppeld.</p>${button(link, "Inloggen")}<p style="font-size:13px">Je wachtwoord is niet gewijzigd.</p>`);
  return { subject, text, html };
}

export function resetMail(p: { link: string }): Mail {
  const subject = "Wachtwoord opnieuw instellen";
  const text = `Je hebt gevraagd om je HHC ClubSupport-wachtwoord opnieuw in te stellen.\n\n${p.link}\n\nDeze link is 1 uur geldig en werkt één keer. Heb je dit niet aangevraagd? Dan kun je deze mail negeren.`;
  const html = wrap("Wachtwoord opnieuw instellen", `<p>Je hebt gevraagd om je wachtwoord opnieuw in te stellen.</p>${button(p.link, "Nieuw wachtwoord kiezen")}<p style="font-size:13px">De link is 1 uur geldig en werkt één keer. Niet aangevraagd? Negeer deze mail.</p>`);
  return { subject, text, html };
}
