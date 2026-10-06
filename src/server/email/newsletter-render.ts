import { env } from "@/lib/env";
import { esc, wrap, type Mail } from "./templates";

/**
 * Nieuwsbrief-opmaak. De redactie schrijft PLATTE TEKST met lichte opmaak; er wordt nooit ruwe HTML overgenomen:
 *   lege regel = nieuwe alinea · "## Kop" = tussenkop · regels met "- " = opsomming · **vet** ·
 *   [tekst](https://adres) of een los https-adres = link (alleen http/https).
 * Alles wordt HTML-geëscaped; kop en onderwerp mogen geen regeleindes bevatten (header-injectie).
 */
export const NEWSLETTER_LIMITS = { subject: 150, body: 20000 } as const;

const LINK = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)|(https?:\/\/[^\s<>"']{1,500})/g;

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const bold = (escaped: string) => escaped.replace(/\*\*([^*\n]{1,300})\*\*/g, "<strong>$1</strong>");

/** Inline: tekst → veilige HTML met links en vet. */
export function inlineHtml(raw: string): string {
  let out = "";
  let last = 0;
  for (const m of raw.matchAll(LINK)) {
    out += bold(esc(raw.slice(last, m.index)));
    let label = m[1];
    let url = m[2] ?? m[3];
    let trail = "";
    if (!m[1]) {
      const t = /[.,;:!?)]+$/.exec(url);
      if (t) {
        trail = t[0];
        url = url.slice(0, -trail.length);
      }
    }
    const safe = safeUrl(url);
    if (safe) out += `<a href="${esc(safe)}" style="color:#000;font-weight:bold">${esc(label ?? url)}</a>${esc(trail)}`;
    else out += bold(esc(m[0]));
    last = (m.index ?? 0) + m[0].length;
  }
  return out + bold(esc(raw.slice(last)));
}

export function bodyToHtml(body: string): string {
  const blocks = body.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  return blocks
    .map((b) => {
      const lines = b.split("\n");
      if (lines.length === 1 && lines[0].startsWith("## ")) return `<h2 style="font-size:17px;margin:20px 0 6px">${inlineHtml(lines[0].slice(3))}</h2>`;
      if (lines.every((l) => l.startsWith("- "))) return `<ul style="padding-left:20px;margin:0 0 12px">${lines.map((l) => `<li style="margin-bottom:4px">${inlineHtml(l.slice(2))}</li>`).join("")}</ul>`;
      return `<p style="margin:0 0 12px;line-height:1.5">${lines.map(inlineHtml).join("<br>")}</p>`;
    })
    .join("");
}

export function bodyToText(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)").replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/^## /gm, "").trim();
}

export function validateNewsletter(subject: string, body: string): string | null {
  if (!subject.trim()) return "Vul een onderwerp in.";
  if (/[\r\n]/.test(subject)) return "Het onderwerp mag geen regeleinden bevatten.";
  if (subject.length > NEWSLETTER_LIMITS.subject) return `Het onderwerp is te lang (max ${NEWSLETTER_LIMITS.subject} tekens).`;
  if (!body.trim()) return "Schrijf de tekst van de nieuwsbrief.";
  if (body.length > NEWSLETTER_LIMITS.body) return `De tekst is te lang (max ${NEWSLETTER_LIMITS.body} tekens).`;
  return null;
}

export function unsubscribeUrls(token: string) {
  return { page: `${env.appUrl}/afmelden/${token}`, oneClick: `${env.appUrl}/api/nieuwsbrief/afmelden?token=${token}` };
}

/** De uiteindelijke mail: opmaak + verplichte afmeldlink (en List-Unsubscribe-headers voor één-klik afmelden). */
export function newsletterMail(p: { subject: string; body: string; token: string; audienceNote: string; preview?: boolean }): Mail {
  const u = unsubscribeUrls(p.token);
  const info = process.env.NEWSLETTER_SENDER_INFO?.trim();
  const footerHtml = `<hr style="border:0;border-top:1px solid #ccc;margin:24px 0 12px"><p style="font-size:12px;color:#444;line-height:1.5">${esc(p.audienceNote)} Je ontvangt geen nieuwsbrieven meer als je je afmeldt: <a href="${esc(u.page)}" style="color:#000">afmelden</a>. Dit geldt alleen voor nieuwsbrieven; mails over je account en ledenpas blijven werken.${info ? `<br>${esc(info)}` : ""}</p>`;
  const text = `${bodyToText(p.body)}\n\n--\n${p.audienceNote} Afmelden voor nieuwsbrieven: ${u.page}${info ? `\n${info}` : ""}`;
  return {
    subject: p.subject,
    text,
    html: wrap(p.subject, bodyToHtml(p.body), footerHtml),
    headers: p.preview ? undefined : { "List-Unsubscribe": `<${u.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
