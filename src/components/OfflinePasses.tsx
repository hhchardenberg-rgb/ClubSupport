"use client";
import { useEffect, useState } from "react";
import { PassCarousel } from "./PassCarousel";
import { loadOffline } from "@/lib/offline-store";

const fmt = (t: number) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(t));

/** Offline weergave: toont de bewaarde passen, of legt uit waarom dat niet kan. */
export function OfflinePasses() {
  const [data, setData] = useState<ReturnType<typeof loadOffline> | null>(null);
  useEffect(() => setData(loadOffline()), []);
  if (!data) return <p className="muted" role="status">Laden…</p>;
  if (data.state === "ok")
    return (
      <>
        <div className="alert warning" role="status">
          <div>
            <strong className="alert-title">Je bent offline</strong>
            <div>Deze passen zijn voor het laatst bijgewerkt op {fmt(data.savedAt)}. De actuele geldigheid wordt altijd online gecontroleerd door de scanner.</div>
          </div>
        </div>
        <PassCarousel items={data.items} />
        <p><a className="btn secondary" href="/ledenpas">Opnieuw verbinden</a></p>
      </>
    );
  return (
    <div className="card" role="status">
      <h2>{data.state === "expired" ? "Offline kopie verlopen" : "Geen pas opgeslagen"}</h2>
      <p>
        {data.state === "expired"
          ? "De opgeslagen kopie is te oud. Maak verbinding en open de app opnieuw."
          : "Er staat geen pas op dit toestel. Log eenmalig in met internet; daarna kun je je pas ook offline bekijken."}
      </p>
      <p><a className="btn" href="/ledenpas">Opnieuw proberen</a></p>
    </div>
  );
}
