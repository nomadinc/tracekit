import { notFound } from "next/navigation";
import { ShellPlaceholder } from "@/components/layout/shell-placeholder";
import type { Permission } from "@/lib/identity/permissions";

const SECTIONS: Record<string, { title: string; purpose: string; permission: Permission; manage?: Permission }> = {
  organizations: { title: "Organizations", purpose: "Platform tenant inventory and controlled Organization operations.", permission: "admin.manage_tenants" },
  agencies: { title: "Agencies", purpose: "Platform-level Agency Account operations and assigned Client Organization oversight.", permission: "admin.manage_tenants" },
  users: { title: "Users", purpose: "Platform identity and membership operations pending persistent identity approval.", permission: "users.view", manage: "users.manage_permissions" },
  connectors: { title: "Connectors", purpose: "Platform Connector visibility and operational support.", permission: "connectors.view", manage: "connectors.manage" },
  imports: { title: "Imports", purpose: "Platform import health and operational controls.", permission: "imports.view", manage: "imports.manage" },
  "system-health": { title: "System Health", purpose: "Platform-wide operational health and evidence-backed diagnostics.", permission: "audit_logs.view" },
  billing: { title: "Billing", purpose: "Platform billing visibility and future Account billing operations.", permission: "billing.view", manage: "billing.manage" },
  "audit-logs": { title: "Audit Logs", purpose: "Platform audit visibility pending persistent audit storage.", permission: "audit_logs.view" },
  "feature-access": { title: "Feature Access", purpose: "Controlled platform feature-access policy and rollout operations.", permission: "admin.manage_feature_access" },
  support: { title: "Support", purpose: "Platform support operations without silent tenant impersonation.", permission: "admin.manage_tenants" },
};

export default async function PlatformSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const config = SECTIONS[section];
  if (!config) notFound();
  return <ShellPlaceholder title={config.title} purpose={config.purpose} permission={config.permission} variants={["product-admin"]} managementPermission={config.manage} />;
}
