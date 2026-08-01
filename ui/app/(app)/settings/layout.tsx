"use client";

import type { ReactNode } from "react";
import { AccessBoundary } from "@/components/identity/access-control";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AccessBoundary
      permission="organizations.manage"
      variants={["client", "agency"]}
    >
      {children}
    </AccessBoundary>
  );
}
