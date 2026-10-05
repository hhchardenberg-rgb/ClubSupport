"use client";
import { useEffect, useState } from "react";
import type { PassItem } from "./PassCarousel";
import { clearOffline, offlineEnabled, saveOffline, setOfflineEnabled } from "@/lib/offline-store";

/** Bewaart bij elke online weergave de actuele passen op dit toestel (tenzij het lid dat heeft uitgezet). */
export function OfflineSync({ items, maxDays }: { items: PassItem[]; maxDays: number }) {
  useEffect(() => {
    if (offlineEnabled() && items.length > 0) saveOffline(items, maxDays);
    else clearOffline();
  }, [items, maxDays]);
  return null;
}

export function OfflineToggle({ items, maxDays }: { items: PassItem[]; maxDays: number }) {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(offlineEnabled()), []);
  return (
    <section className="card" aria-labelledby="off">
      <h2 id="off">Zonder internet bekijken</h2>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: 0 }}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            setOfflineEnabled(e.target.checked);
            if (e.target.checked) saveOffline(items, maxDays);
          }}
        />
        <span>Bewaar mijn passen op dit toestel, zodat ik ze ook zonder internet kan tonen.</span>
      </label>
      <p className="field-hint">
        De kopie staat alleen op dit toestel, wordt bij elk online bezoek ververst, verdwijnt bij uitloggen en vervalt na {maxDays} dagen. Een ingetrokken pas verdwijnt zodra je weer online bent;
        de scanner controleert altijd online. Gebruik dit niet op een gedeeld toestel.
      </p>
    </section>
  );
}
