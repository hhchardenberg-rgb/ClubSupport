"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * Menu in de kop: staat alles naast elkaar als het past, anders klapt het in achter een Menu-knop.
 * Of het past wordt gemeten aan een onzichtbare kopie (zelfde lettertype), zodat de uitkomst niet
 * afhangt van de huidige stand en het menu niet heen en weer springt.
 */
export function BeheerNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const panelId = useId();
  const navRef = useRef<HTMLElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  const measure = useCallback(() => {
    const nav = navRef.current;
    const ghost = ghostRef.current;
    const parent = nav?.parentElement;
    if (!nav || !ghost || !parent) return;
    const cs = getComputedStyle(parent);
    const gap = parseFloat(cs.columnGap) || 14;
    const inner = parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const others = Array.from(parent.children).filter((c) => c !== nav && c !== ghost && c !== toggleRef.current) as HTMLElement[];
    const used = others.reduce((sum, c) => sum + c.offsetWidth, 0) + others.length * gap;
    setCollapsed(ghost.scrollWidth + 12 > inner - used);
  }, []);

  useLayoutEffect(() => {
    measure();
    const parent = navRef.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => ro.disconnect();
  }, [measure, links.length]);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!collapsed) setOpen(false);
  }, [collapsed]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="site-nav-ghost" aria-hidden="true" ref={ghostRef}>
        {links.map((l) => <span key={l.href}>{l.label}</span>)}
      </div>
      <nav className={`site-nav${collapsed ? " collapsed" : ""}${collapsed && open ? " open" : ""}`} aria-label="Beheer" id={panelId} ref={navRef}>
        {links.map((l) => {
          const current = l.href === "/beheer" ? path === "/beheer" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      {collapsed ? (
        <button type="button" className="menu-toggle" ref={toggleRef} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          Menu <span className="chev" aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}
