"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { brandForAccountType } from "@/lib/identity/branding";
import { navigationForIdentity } from "@/lib/identity/shell-navigation";
import { useIdentity } from "@/components/identity/identity-provider";
import { DevelopmentIdentitySwitcher } from "@/components/identity/development-identity-switcher";
import { withSessionDevelopmentIdentity } from "@/lib/identity/development-state";
import { BrandAnchor } from "@/components/ui/brand-mark";

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

  return <aside className="flex h-full w-72 flex-col border-r bg-white/95 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b0e14]/95"><div className="border-b px-5 py-5 dark:border-white/10"><Link href={homeHref} onClick={onNavigate} aria-label={`${brand.productName} home`} className="block rounded-lg"><BrandAnchor productName={brand.productName} subtitle={shellLabel} mark={brand.logoMark} accent={brand.productName === "TraceKit" ? undefined : brand.accent}/></Link></div><nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4"><div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{variant === "product-admin" ? "Platform" : variant === "agency" ? "Agency Experience" : "Organization Experience"}</div><div className="space-y-1">{navigation.map((item) => { const Icon = item.icon; const active = activePath(pathname, item.href); return <Link key={item.href} href={withSessionDevelopmentIdentity(item.href, session)} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "tk-nav-active" : "tk-nav-inactive"}`}><Icon className="h-4 w-4" /><span className="flex-1">{item.label}</span><ChevronRight className="h-3.5 w-3.5 opacity-45" /></Link>; })}</div></nav>{brand.poweredByTraceKit === "always" && brand.productName !== "TraceKit" ? <div className="border-t px-4 py-2 text-center text-[9px] text-slate-500 dark:border-white/10">Powered by TraceKit</div> : null}<DevelopmentIdentitySwitcher /></aside>;
}
