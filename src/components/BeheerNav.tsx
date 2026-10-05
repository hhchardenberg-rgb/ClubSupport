"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BeheerNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="site-nav" aria-label="Beheer">
      {links.map((l) => {
        const current = l.href === "/beheer" ? path === "/beheer" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
