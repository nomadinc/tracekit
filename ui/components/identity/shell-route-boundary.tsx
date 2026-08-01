"use client";

import { usePathname } from "next/navigation";
import { AccessDenied } from "./access-control";
import { useIdentity } from "./identity-provider";

export function ShellRouteBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { variant } = useIdentity();
  const platformRoute = pathname.startsWith("/platform/");
  if (variant === "product-admin" && !platformRoute) {
    return <AccessDenied reason="Product Admin identities use the isolated Platform Operations shell. Entering Client Workspace routes requires a future controlled tenant-preview flow." />;
  }
  if (variant !== "product-admin" && platformRoute) {
    return <AccessDenied reason="Client and Agency identities cannot enter Product Admin destinations." />;
  }
  return <>{children}</>;
}
