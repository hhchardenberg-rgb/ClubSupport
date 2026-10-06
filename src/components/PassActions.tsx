"use client";
import { useState } from "react";

/** QR-afbeelding bewaren of de pas afdrukken; alles gebeurt op het toestel, er gaat niets naar de server. */
export function PassActions({ name, number, svg }: { name: string; number: string; svg: string }) {
  const [msg, setMsg] = useState("");

  async function toPng(): Promise<Blob> {
    const url = URL.createObjectURL(new Blob([svg.replace("<svg ", '<svg width="800" height="800" ')], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const size = 1024;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      const pad = 112; // stille zone rond de QR
      ctx.drawImage(img, pad, pad, size - 2 * pad, size - 2 * pad);
      return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
    } finally {
      URL.revokeObjectURL(url);
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
      setMsg("QR-afbeelding bewaard.");
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
      <button type="button" className="secondary small" onClick={save}>QR-afbeelding bewaren</button>
      <button type="button" className="secondary small" onClick={print}>Afdrukken</button>
      <span className="muted" role="status" aria-live="polite">{msg}</span>
    </div>
  );
}
