"use client";

import * as React from "react";
import Link from "next/link";
import { fullPageHrefForEntity, type InvestigationTarget } from "@/lib/entities";
import { useInvestigation } from "@/components/investigation/investigation-context";

export function EntityLink({
  target,
  href,
  mode = "panel",
  children,
  className = "",
  onOpen,
}: {
  target: InvestigationTarget;
  href?: string;
  mode?: "panel" | "page";
  children: React.ReactNode;
  className?: string;
  onOpen?: () => void;
}) {
  const investigation = useInvestigation();
  const fullHref = href || fullPageHrefForEntity(target, target.query?.workspace_id || "default");

  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (mode === "page") return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onOpen?.();
    investigation.open(target);
  }

  return (
    <Link href={fullHref} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
