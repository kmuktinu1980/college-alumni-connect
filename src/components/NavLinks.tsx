"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="page flex gap-1 overflow-x-auto" aria-label="Sections">
      {links.map((l) => {
        const on = path === l.href || path.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap border-b-[3px] px-3 pb-[11px] pt-3 font-medium no-underline ${
              on ? "border-river text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
