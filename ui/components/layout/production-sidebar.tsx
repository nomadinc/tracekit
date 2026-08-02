"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { brandForAccountType } from "@/lib/identity/branding";
import { navigationForIdentity } from "@/lib/identity/shell-navigation";
import { useIdentity } from "@/components/identity/identity-provider";
import { DevelopmentIdentitySwitcher } from "@/components/identity/development-identity-switcher";
import { withSessionDevelopmentIdentity } from "@/lib/identity/development-state";

function activePath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function ProductionSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || "/";
  const { session, variant } = useIdentity();
  const brand = brandForAccountType(session.identity.membership.accountType);
  const navigation = navigationForIdentity(session.identity);
  const shellLabel = variant === "product-admin" ? "Platform Operations" : variant === "agency" ? "Agency Account" : "Client Organization";

  const homeHref = withSessionDevelopmentIdentity(variant === "product-admin" ? "/platform/organizations" : "/", session);

  return <aside className="flex h-full w-72 flex-col border-r bg-white/95 shadow-sm backdrop-blur dark:border-white/10 dark:bg-ink/95"><div className="border-b px-5 py-5 dark:border-white/10"><Link href={homeHref} onClick={onNavigate} className="inline-flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-slate-400"><span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: brand.accent }}>{brand.logoMark}</span><span><span className="block text-lg font-semibold tracking-tight">{brand.productName}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{shellLabel}</span></span></Link></div><nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4"><div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{variant === "product-admin" ? "Platform" : variant === "agency" ? "Agency Experience" : "Organization Experience"}</div><div className="space-y-1">{navigation.map((item) => { const Icon = item.icon; const active = activePath(pathname, item.href); return <Link key={item.href} href={withSessionDevelopmentIdentity(item.href, session)} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-400 ${active ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"}`}><Icon className="h-4 w-4" /><span className="flex-1">{item.label}</span><ChevronRight className="h-3.5 w-3.5 opacity-45" /></Link>; })}</div></nav>{brand.poweredByTraceKit === "always" && brand.productName !== "TraceKit" ? <div className="border-t px-4 py-2 text-center text-[9px] text-slate-500 dark:border-white/10">Powered by TraceKit</div> : null}<DevelopmentIdentitySwitcher /></aside>;
}
