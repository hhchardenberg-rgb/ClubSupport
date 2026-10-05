"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void> };

/** Platformgerichte installatiehulp voor de Ledenpas-app (zet op beginscherm). */
export function InstallHelp() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(ios ? "ios" : /Android/.test(ua) ? "android" : "other");
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw-ledenpas.js", { scope: "/ledenpas/" }).catch(() => undefined);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return null;
  return (
    <section className="card" aria-labelledby="inst">
      <h2 id="inst">Zet Ledenpas op je beginscherm</h2>
      {evt && (
        <p>
          <button onClick={() => evt.prompt()}>Installeer de app</button>
        </p>
      )}
      {!evt && platform === "ios" && (
        <ol>
          <li>Open deze pagina in <strong>Safari</strong>.</li>
          <li>Tik op de knop <strong>Deel</strong> (vierkant met pijl omhoog).</li>
          <li>Kies <strong>Zet op beginscherm</strong> en tik op <strong>Voeg toe</strong>.</li>
        </ol>
      )}
      {!evt && platform === "android" && (
        <ol>
          <li>Open deze pagina in <strong>Chrome</strong>.</li>
          <li>Tik op het menu (drie puntjes) rechtsboven.</li>
          <li>Kies <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.</li>
        </ol>
      )}
      {!evt && platform === "other" && <p>Open deze pagina op je telefoon om de app op je beginscherm te zetten.</p>}
    </section>
  );
}
