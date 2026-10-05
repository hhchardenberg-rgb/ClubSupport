"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";

export type PassItem = {
  id: string;
  name: string;
  number: string;
  active: boolean;
  svg: string | null; // zelf gegenereerde QR-SVG (geen gebruikersinvoer)
  unavailable: boolean;
  apple: boolean;
  google: boolean;
};

/** Veegbare carrousel (native scroll-snap) met pijlen, stippen en toetsenbordbediening. */
export function PassCarousel({ items }: { items: PassItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [index, setIndex] = useState(0);
  const n = items.length;

  const goTo = useCallback((i: number) => {
    const el = ref.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.clientWidth) / 2, behavior: reduce ? "auto" : "smooth" });
    setIndex(i);
  }, []);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let dist = Infinity;
      Array.from(el.children).forEach((c, i) => {
        const s = c as HTMLElement;
        const d = Math.abs(s.offsetLeft + s.clientWidth / 2 - mid);
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      setIndex(best);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <section aria-roledescription="carrousel" aria-label="Ledenpassen">
      <div
        ref={ref}
        className={`carousel${n > 1 ? " multi" : ""}`}
        onScroll={onScroll}
        tabIndex={n > 1 ? 0 : -1}
        onKeyDown={(e) => {
          // Eigen afhandeling; standaard toetsenbordscroll van de container zou anders tegenwerken.
          const to = e.key === "ArrowRight" ? Math.min(n - 1, index + 1) : e.key === "ArrowLeft" ? Math.max(0, index - 1) : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
          if (to === null) return;
          e.preventDefault();
          if (to !== index) goTo(to);
        }}
        aria-label={n > 1 ? "Veeg of gebruik de pijltjestoetsen om tussen passen te wisselen" : undefined}
      >
        {items.map((p, k) => (
          <article key={p.id} className="slide" role="group" aria-roledescription="pas" aria-label={`Pas ${k + 1} van ${n}: ${p.name}`}>
            <div className="pass">
              <div className="pass-head">
                <span className="pass-logo"><Logo height={34} onOrange /><span className="t">Ledenpas</span></span>
                {p.active ? <span className="badge ok">Actief</span> : <span className="badge bad">Niet actief</span>}
              </div>
              <div className="pass-body">
                <div className="who">{p.name}</div>
                <div className="num">Lidnummer {p.number}</div>
                {p.svg ? (
                  <div className="pass-qr" role="img" aria-label={`QR-code van de ledenpas van ${p.name}`} dangerouslySetInnerHTML={{ __html: p.svg }} />
                ) : (
                  <p className="pass-off" role="alert">
                    {p.unavailable
                      ? "Deze pas kan tijdelijk niet worden getoond. Neem contact op met HHC ClubSupport."
                      : "Deze pas is niet actief en kan niet worden gebruikt. Neem contact op met HHC ClubSupport."}
                  </p>
                )}
              </div>
              {p.svg && (
                <div className="pass-foot">
                  {p.apple ? <a className="btn" href={`/api/wallet/apple/${p.id}`}>Toevoegen aan Apple Wallet</a> : <button disabled aria-describedby={`w-${p.id}`}>Apple Wallet</button>}
                  {p.google ? <a className="btn secondary" href={`/api/wallet/google/${p.id}`}>Opslaan in Google Wallet</a> : <button disabled aria-describedby={`w-${p.id}`}>Google Wallet</button>}
                  {(!p.apple || !p.google) && (
                    <p id={`w-${p.id}`} className="muted" style={{ color: "#bbb", margin: 0, fontSize: ".9rem", textAlign: "center" }}>
                      {!p.apple && !p.google ? "Apple Wallet en Google Wallet zijn nog niet beschikbaar." : !p.apple ? "Apple Wallet is nog niet beschikbaar." : "Google Wallet is nog niet beschikbaar."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {n > 1 && (
        <div className="carousel-nav">
          <button type="button" className="secondary arrow" onClick={() => goTo(Math.max(0, index - 1))} disabled={index === 0} aria-label="Vorige pas">‹</button>
          <div className="dots" role="group" aria-label="Kies een pas">
            {items.map((p, k) => (
              <button key={p.id} type="button" className="dot" aria-label={`Pas ${k + 1}: ${p.name}`} aria-current={k === index ? "true" : undefined} onClick={() => goTo(k)} />
            ))}
          </div>
          <button type="button" className="secondary arrow" onClick={() => goTo(Math.min(n - 1, index + 1))} disabled={index === n - 1} aria-label="Volgende pas">›</button>
        </div>
      )}
      {n > 1 && <p className="counter muted" style={{ textAlign: "center", margin: 0 }} aria-live="polite">Pas {index + 1} van {n}</p>}
    </section>
  );
}
