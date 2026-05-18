import Link from "next/link";
import { Card } from "@/components/ui/card";

type ConnStatus = "not_connected" | "connected" | "syncing";

type IntegrationItem = {
  key: string;
  name: string;
  subtitle: string;
  status: ConnStatus;
  href: string;
};

function StatusPill({ status }: { status: ConnStatus }) {
  const s =
    status === "connected"
      ? { label: "Connected", cls: "bg-emerald-50 text-emerald-700" }
      : status === "syncing"
      ? { label: "Syncing", cls: "bg-amber-50 text-amber-800" }
      : { label: "Not connected", cls: "bg-gray-100 text-gray-700" };

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
          {item.status === "connected" ? "Manage" : "Connect"}
        </Link>
      </div>
    </div>
  );
}

export default function IntegrationsHubPage() {
  // v1 shell: hard-coded list (later we’ll drive this from DB)
  const crms: IntegrationItem[] = [
    {
      key: "konnektive",
      name: "Konnektive CRM",
      subtitle: "Legacy offers — orders, refunds, chargebacks (ingest into platform_orders).",
      status: "not_connected",
      href: "/settings/integrations/konnektive",
    },
    {
      key: "wowsuite",
      name: "WowSuite",
      subtitle: "Newer offers — orders, refunds, chargebacks (not integrated yet).",
      status: "not_connected",
      href: "/settings/integrations/wowsuite",
    },
  ];

  const gateways: IntegrationItem[] = [
    {
      key: "paypal",
      name: "PayPal",
      subtitle: "Gateway fees, disputes, chargebacks, transaction matching.",
      status: "not_connected",
      href: "/settings/integrations/paypal",
    },
    {
      key: "nmi",
      name: "NMI",
      subtitle: "Gateway fees, chargebacks, settlement reconciliation.",
      status: "not_connected",
      href: "/settings/integrations/nmi",
    },
  ];

  const tracking: IntegrationItem[] = [
    {
      key: "everflow",
      name: "Everflow",
      subtitle: "Conversions/events spend (payouts), offer/partner attribution.",
      status: "not_connected",
      href: "/settings/integrations/everflow",
    },
    {
      key: "voluum",
      name: "Voluum",
      subtitle: "Traffic/attribution events (optional).",
      status: "not_connected",
      href: "/settings/integrations/voluum",
    },
  ];

  return (
    <div className="space-y-6">
      <Card title="Integrations">
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p>
            Connect your CRMs, payment gateways, and tracking platforms.
            Once connected, TraceKit will backfill and keep your reporting up to date.
          </p>
          <p className="text-xs opacity-80">
            v1 shell: statuses are placeholders. Next step is Konnektive wizard + backfill.
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
    </div>
  );
}
