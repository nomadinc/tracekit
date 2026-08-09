"use client";

import { useEffect, useState } from "react";

export type InvestigationSectionLink = { id: string; label: string };

export function InvestigationSectionNav({ sections }: { sections: InvestigationSectionLink[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const nodes = sections.map(({ id }) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActive(visible.target.id);
    }, { rootMargin: "-18% 0px -68%", threshold: [0, .15, .5] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  return <nav aria-label="Investigation sections" className="sticky top-[4.5rem] z-20 -mx-5 overflow-x-auto border-y border-[var(--tk-dark-border)] bg-[var(--tk-dark-background)]/95 px-5 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10"><div className="mx-auto flex min-w-max gap-1 py-2">{sections.map((section) => <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined} className={`rounded-lg px-3 py-2 text-[10px] font-semibold transition focus:outline-none ${active === section.id ? "bg-[var(--tk-brand-primary-subtle)] text-blue-200 ring-1 ring-blue-400/25" : "text-slate-400 hover:bg-white/[.05] hover:text-slate-100"}`}>{section.label}</a>)}</div></nav>;
}
