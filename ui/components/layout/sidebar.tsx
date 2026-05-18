import Link from "next/link";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/journeys", label: "Journeys" },
  { href: "/orders", label: "Orders" },

  // ✅ integrations lives under /settings/integrations
  { href: "/settings/integrations", label: "Integrations" },

  { href: "/scrubber", label: "Scrubber" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-60 border-r h-full flex flex-col bg-white dark:bg-ink">
      <div className="px-4 py-4 text-lg font-bold tracking-wide">
        TRACEKIT <span className="text-cyan">•</span>
      </div>

      <nav className="px-2 space-y-1">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-slate2/40"
          >
            {it.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto px-4 py-3 text-xs text-gray-500">
        Appearance
        <br />
        Light/Dark in top bar
      </div>
    </aside>
  );
}
