import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getIntegrationsByCategory } from "@/lib/integrations/catalog";

type ConnStatus = "not_connected" | "connected" | "syncing";

type IntegrationItem = {
  key: string;
  name: string;
  subtitle: string;
  status: ConnStatus;
  href: string;
  primaryAction: "connect" | "configure" | "manage" | "open" | "launch";
};

function StatusPill({ status }: { status: ConnStatus }) {
  const s =
    status === "connected"
      ? {
          label: "Connected",
          cls: "bg-emerald-50 text-emerald-700",
        }
      : status === "syncing"
        ? {
            label: "Syncing",
            cls: "bg-amber-50 text-amber-800",
          }
        : {
            label: "Not connected",
            cls: "bg-gray-100 text-gray-700",
          };

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5",
        "text-xs font-medium",
        s.cls,
      ].join(" ")}
    >
      {s.label}
    </span>
  );
}

function getActionLabel(item: IntegrationItem) {
  if (item.status === "connected") {
    return "Manage";
  }

  const labels: Record<IntegrationItem["primaryAction"], string> = {
    connect: "Connect",
    configure: "Configure",
    manage: "Manage",
    open: "Open",
    launch: "Launch",
  };

  return labels[item.primaryAction];
}

function IntegrationRow({ item }: { item: IntegrationItem }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate font-medium">{item.name}</div>
          <StatusPill status={item.status} />
        </div>

        <div className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
          {item.subtitle}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={item.href}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
        >
          {getActionLabel(item)}
        </Link>
      </div>
    </div>
  );
}

function toIntegrationItem(integration: {
  id: string;
  name: string;
  description: string;
  primaryAction: IntegrationItem["primaryAction"];
}): IntegrationItem {
  return {
    key: integration.id,
    name: integration.name,
    subtitle: integration.description,
    status: "not_connected",
    href: `/settings/integrations/${integration.id}`,
    primaryAction: integration.primaryAction,
  };
}

export default function IntegrationsHubPage() {
  const crms = getIntegrationsByCategory("crm").map(toIntegrationItem);

  const gateways =
    getIntegrationsByCategory("gateway").map(toIntegrationItem);

  const tracking =
    getIntegrationsByCategory("tracking").map(toIntegrationItem);

  const developerTools =
    getIntegrationsByCategory("developer").map(toIntegrationItem);

  return (
    <div className="space-y-6">
      <Card title="Integrations">
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p>
            Connect your CRMs, payment gateways, and tracking platforms. Once
            connected, TraceKit will backfill and keep your reporting up to
            date.
          </p>

          <p className="text-xs opacity-80">
            Connection statuses are placeholders for now. Later they will be
            loaded from the database.
          </p>
        </div>
      </Card>

      <Card title="CRMs">
        <div className="space-y-3">
          {crms.map((item) => (
            <IntegrationRow key={item.key} item={item} />
          ))}
        </div>
      </Card>

      <Card title="Payment Gateways">
        <div className="space-y-3">
          {gateways.map((item) => (
            <IntegrationRow key={item.key} item={item} />
          ))}
        </div>
      </Card>

      <Card title="Tracking Platforms">
        <div className="space-y-3">
          {tracking.map((item) => (
            <IntegrationRow key={item.key} item={item} />
          ))}
        </div>
      </Card>

      <Card title="Developer Tools">
        <div className="space-y-3">
          {developerTools.map((item) => (
            <IntegrationRow key={item.key} item={item} />
          ))}
        </div>
      </Card>
    </div>
  );
}