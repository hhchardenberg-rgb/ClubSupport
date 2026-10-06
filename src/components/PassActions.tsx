"use client";
import { useState } from "react";
import { BRAND } from "@/lib/brand.generated";

/** Pas bewaren als afbeelding of de pas afdrukken; alles gebeurt op het toestel, er gaat niets naar de server. */
export function PassActions({ name, number, svg }: { name: string; number: string; svg: string }) {
  const [msg, setMsg] = useState("");

  /** Tekent de hele pas (kop, naam, lidnummer, QR) op een canvas; zelfde huisstijl als op het scherm. */
  async function toPng(): Promise<Blob> {
    const W = 1080;
    const H = 1560;
    const orange = "#ff6600";
    const font = (w: number, px: number) => `${w} ${px}px DIN, "DIN Next LT Pro", Arial, sans-serif`;
    await Promise.all([font(300, 40), font(700, 40), font(900, 40)].map((f) => document.fonts.load(f).catch(() => [])));

    const load = async (src: string) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return img;
    };
    const svgUrl = URL.createObjectURL(new Blob([svg.replace("<svg ", '<svg width="800" height="800" ')], { type: "image/svg+xml" }));
    try {
      const [qr, logo] = await Promise.all([load(svgUrl), BRAND.logo ? load(BRAND.logo).catch(() => null) : Promise.resolve(null)]);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      const rr = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
      };

      // kaart
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#000";
      rr(0, 0, W, H, 64);
      ctx.fill();
      ctx.save();
      rr(0, 0, W, H, 64);
      ctx.clip();
      // oranje kop met logo en titel
      ctx.fillStyle = orange;
      ctx.fillRect(0, 0, W, 170);
      let x = 56;
      if (logo) {
        const h = 110;
        const w = Math.round(h * (logo.naturalWidth / logo.naturalHeight));
        ctx.drawImage(logo, x, 30, w, h);
        x += w + 28;
      }
      ctx.fillStyle = "#000";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.font = font(900, 54);
      ctx.fillText("LEDENPAS", x, 88);

      // naam (max. twee regels, past zich aan)
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const text = name.toUpperCase();
      let px = 84;
      let lines: string[] = [];
      for (; px >= 44; px -= 6) {
        ctx.font = font(300, px);
        lines = [];
        let line = "";
        for (const word of text.split(/\s+/)) {
          const t = line ? `${line} ${word}` : word;
          if (ctx.measureText(t).width > W - 140 && line) { lines.push(line); line = word; } else line = t;
        }
        lines.push(line);
        if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= W - 140)) break;
      }
      let y = 290;
      for (const l of lines) { ctx.fillText(l, W / 2, y); y += px * 1.1; }
      ctx.fillStyle = orange;
      ctx.font = font(700, 46);
      ctx.fillText(`LIDNUMMER ${number}`.split("").join("\u200a"), W / 2, y + 30);

      // QR met witte stille zone
      const box = 780;
      const bx = (W - box) / 2;
      const by = 470;
      ctx.fillStyle = "#fff";
      rr(bx, by, box, box, 40);
      ctx.fill();
      ctx.imageSmoothingEnabled = false;
      const pad = 60;
      ctx.drawImage(qr, bx + pad, by + pad, box - 2 * pad, box - 2 * pad);

      // voet
      ctx.fillStyle = "#ccc";
      ctx.font = font(400, 34);
      ctx.fillText("Toon deze pas bij de controle. Alleen geldig zolang de pas actief is.", W / 2, 1400);
      ctx.fillStyle = orange;
      ctx.fillRect(0, H - 22, W, 22);
      ctx.restore();
      return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  const fileName = `hhc-ledenpas-${number.replace(/[^A-Za-z0-9_-]/g, "")}.png`;

  async function save() {
    setMsg("");
    try {
      const blob = await toPng();
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Ledenpas ${name}` });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setMsg("Pas bewaard als afbeelding.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Bewaren is niet gelukt op dit toestel.");
    }
  }

  function print(e: React.MouseEvent<HTMLButtonElement>) {
    const slide = e.currentTarget.closest(".slide");
    slide?.classList.add("printing");
    const done = () => slide?.classList.remove("printing");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  }

  return (
    <div className="pass-actions">
      <button type="button" className="secondary small" onClick={save}>Pas bewaren als afbeelding</button>
      <button type="button" className="secondary small" onClick={print}>Afdrukken</button>
      <span className="muted" role="status" aria-live="polite">{msg}</span>
    </div>
  );
}
