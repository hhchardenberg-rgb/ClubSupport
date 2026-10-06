"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { processNewsletterAction } from "@/app/beheer/(app)/nieuwsbrieven/actions";

/** Verwerkt de wachtrij batch voor batch zolang deze pagina open is; de dagelijkse cron vangt de rest op. */
export function NewsletterProgress({ id, remaining: initial, total }: { id: string; remaining: number; total: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(initial);
  const [error, setError] = useState("");
  const running = useRef(false);

  useEffect(() => {
    let stop = false;
    async function loop() {
      if (running.current) return;
      running.current = true;
      let left = initial;
      while (!stop && left > 0) {
        const r = await processNewsletterAction(id);
        if (r.error || r.remaining < 0) {
          setError("Het verwerken is gestopt. Vernieuw de pagina om het opnieuw te proberen.");
          break;
        }
        left = r.remaining;
        setRemaining(left);
        if (r.sent + r.failed === 0 && left > 0) await new Promise((res) => setTimeout(res, 3000)); // wachtende herpogingen (backoff)
      }
      running.current = false;
      if (!stop) router.refresh();
    }
    void loop();
    return () => {
      stop = true;
    };
  }, [id, initial, router]);

  const done = Math.max(0, total - remaining);
  return (
    <div role="status" aria-live="polite" className="notice">
      <p><strong>Bezig met versturen…</strong> {done} van {total} verwerkt. Laat deze pagina open; de rest wordt anders later automatisch afgemaakt.</p>
      <progress max={total} value={done} style={{ width: "100%" }} aria-label="Voortgang verzenden" />
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
