import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("application shell reorganizes existing routes around business navigation", () => {
  const navigation = readRepoFile("ui/lib/app-navigation.ts");
  const sidebar = readRepoFile("ui/components/layout/sidebar.tsx");
  const appLayout = readRepoFile("ui/app/(app)/layout.tsx");
  const rootPage = readRepoFile("ui/app/page.tsx");
  const breadcrumbs = readRepoFile("ui/components/shared/breadcrumbs.tsx");

  for (const label of ["Home", "Customers", "Marketing", "Revenue", "Operations", "Settings"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }

  for (const route of ["/", "/journeys", "/events", "/reports", "/orders", "/operations", "/settings/integrations", "/setup"]) {
    assert.match(navigation, new RegExp(`href: "${route.replace("/", "\\/")}"`));
  }

  assert.match(sidebar, /APP_NAVIGATION/);
  assert.match(sidebar, /SECONDARY_NAVIGATION/);
  assert.match(navigation, /breadcrumbsForPath/);
  assert.match(breadcrumbs, /aria-label="Breadcrumb"/);
  assert.match(appLayout, /<AppShell>{children}<\/AppShell>/);
  assert.match(rootPage, /<HomeCommandCenter \/>/);
  assert.doesNotMatch(rootPage, /redirect\("\/overview"\)/);
});

test("home command center consumes one composed Home API and preserves overview compatibility", () => {
  const root = readRepoFile("ui/app/page.tsx");
  const overview = readRepoFile("ui/app/(app)/overview/page.tsx");
  const home = readRepoFile("ui/components/home/home-command-center.tsx");
  const proxy = readRepoFile("ui/app/api/home/route.ts");

  assert.match(root, /<AppShell>/);
  assert.match(root, /<HomeCommandCenter \/>/);
  assert.match(overview, /<HomeCommandCenter \/>/);
  assert.match(home, /homeQuery\(\{ workspace_id: WORKSPACE_ID, window: windowKey \}\)/);
  assert.match(home, /PriorityWorkItems/);
  assert.match(home, /RecentActivity/);
  assert.match(home, /What's Happening/);
  assert.match(home, /WorkspaceHealth/);
  assert.match(home, /RevenueAndAttribution/);
  assert.match(home, /RecentCustomers/);
  assert.match(home, /IntegrationsAndActions/);
  assert.match(proxy, /\/v1\/home/);
  assert.doesNotMatch(home, /\/v1\/kpis|\/v1\/revenue-spend|\/api\/setup-wizard/);
});

test("topbar exposes workspace search and notification affordances", () => {
  const topbar = readRepoFile("ui/components/layout/topbar.tsx");
  const navigation = readRepoFile("ui/lib/app-navigation.ts");
  const commandPalette = readRepoFile("ui/components/shared/command-palette.tsx");
  const searchProxy = readRepoFile("ui/app/api/search/route.ts");

  assert.match(topbar, /CommandPaletteButton/);
  assert.match(topbar, /CommandPaletteDialog/);
  assert.match(topbar, /Breadcrumbs/);
  assert.match(topbar, /LiveWorkspaceStatus/);
  assert.match(topbar, /WORKSPACE_SUMMARY/);
  assert.match(topbar, /notificationQuery\(\{ workspace_id: "default", limit: 5 \}\)/);
  assert.match(topbar, /LIVE_WORKSPACE_UPDATE_EVENT/);
  assert.match(topbar, /View All/);
  assert.match(commandPalette, /metaKey/);
  assert.match(commandPalette, /ctrlKey/);
  assert.match(commandPalette, /globalSearchQuery/);
  assert.match(commandPalette, /ArrowDown/);
  assert.match(commandPalette, /workspace_id/);
  assert.match(searchProxy, /\/v1\/search/);
  assert.match(navigation, /Search customers, orders, Work Items, and pages\.\.\./);
  assert.match(navigation, /Production/);
  assert.match(navigation, /Your marketing command center/);
});

test("live workspace client is installed once at the shell and proxies SSE safely", () => {
  const appShell = readRepoFile("ui/components/layout/app-shell.tsx");
  const liveProvider = readRepoFile("ui/components/live/live-workspace-provider.tsx");
  const liveLib = readRepoFile("ui/lib/live.ts");
  const proxy = readRepoFile("ui/app/api/events/stream/route.ts");
  const home = readRepoFile("ui/components/home/home-command-center.tsx");
  const operations = readRepoFile("ui/app/(app)/operations/operations-client.tsx");
  const notifications = readRepoFile("ui/app/(app)/notifications/notifications-client.tsx");
  const customerDetail = readRepoFile("ui/app/(app)/customers/[person_id]/customer-detail-client.tsx");
  const journeyDetail = readRepoFile("ui/app/(app)/journeys/[tkid]/page.tsx");

  assert.match(appShell, /<LiveWorkspaceProvider workspaceId="default">/);
  assert.match(liveProvider, /new EventSource/);
  assert.match(liveProvider, /workspace\.update/);
  assert.match(liveProvider, /LIVE_WORKSPACE_UPDATE_EVENT/);
  assert.match(liveProvider, /seen\.current/);
  assert.match(liveLib, /tracekit:workspace-update/);
  assert.match(proxy, /\/v1\/events\/stream/);
  assert.match(proxy, /text\/event-stream/);
  assert.match(proxy, /x-tk-secret/);
  assert.match(home, /LIVE_WORKSPACE_UPDATE_EVENT/);
  assert.match(operations, /LIVE_WORKSPACE_UPDATE_EVENT/);
  assert.match(notifications, /LIVE_WORKSPACE_UPDATE_EVENT/);
  assert.match(customerDetail, /LIVE_WORKSPACE_UPDATE_EVENT/);
  assert.match(journeyDetail, /LiveRouteRefresh/);
});

test("notification center route consumes Notification Engine APIs", () => {
  const page = readRepoFile("ui/app/(app)/notifications/page.tsx");
  const client = readRepoFile("ui/app/(app)/notifications/notifications-client.tsx");
  const proxy = readRepoFile("ui/app/api/notifications/route.ts");
  const actionProxy = readRepoFile("ui/app/api/notifications/[...notificationPath]/route.ts");

  assert.match(page, /<NotificationsClient \/>/);
  assert.match(client, /Notification Center/);
  assert.match(client, /notificationQuery/);
  assert.match(client, /\/api\/notifications\/\$\{encodeURIComponent\(notification\.id\)\}\/read/);
  assert.match(client, /\/api\/notifications\/\$\{encodeURIComponent\(notification\.id\)\}\/dismiss/);
  assert.match(client, /Everything looks healthy/);
  assert.match(proxy, /\/v1\/notifications/);
  assert.match(actionProxy, /\/v1\/notifications\/\$\{path\}/);
});

test("decision home links to dedicated refund and chargeback analysis routes", () => {
  const decisionHome = readRepoFile("ui/app/(app)/dashboard/decision-home-overview.tsx");
  const refundPage = readRepoFile("ui/app/(app)/dashboard/refunds/page.tsx");
  const chargebackPage = readRepoFile("ui/app/(app)/dashboard/chargebacks/page.tsx");
  const analysisClient = readRepoFile("ui/app/(app)/dashboard/financial-issue-analysis-client.tsx");
  const worker = readRepoFile("api/src/index.ts");

  assert.match(decisionHome, /href=\{`\/dashboard\/refunds\?\$\{dateRangeQuery\(range\)\}`\}/);
  assert.match(decisionHome, /href=\{`\/dashboard\/chargebacks\?\$\{dateRangeQuery\(range\)\}`\}/);
  assert.match(refundPage, /<FinancialIssueAnalysisClient kind="refund" \/>/);
  assert.match(chargebackPage, /<FinancialIssueAnalysisClient kind="chargeback" \/>/);
  assert.match(analysisClient, /\/v1\/refunds\/analysis/);
  assert.match(analysisClient, /\/v1\/chargebacks\/analysis/);
  assert.match(analysisClient, /TimeIntervalPicker/);
  assert.match(analysisClient, /Affiliate ID/);
  assert.match(analysisClient, /Apply/);
  assert.match(analysisClient, /Clear/);
  assert.match(analysisClient, /Top 5 Affiliates by Refunds/);
  assert.match(analysisClient, /Top 5 Affiliates by Chargebacks/);
  assert.match(analysisClient, /Source \/ Sub-ID Ranking/);
  assert.match(analysisClient, /No refund data was found/);
  assert.doesNotMatch(analysisClient, /LineChart|TrendChart|DetailDrawer|SORT_OPTIONS|campaign_id|attribution_status/);
  assert.match(worker, /path === "\/v1\/refunds\/analysis"/);
  assert.match(worker, /path === "\/v1\/chargebacks\/analysis"/);
  assert.match(worker, /FINANCIAL_ISSUE_PLATFORM_FALLBACK_PLATFORMS = \["wowboost", "wowsuite:wowboost", "wowsuite"\]/);
  assert.match(worker, /selectFinancialIssuePlatformRowsByStatus/);
  assert.match(worker, /selectFinancialIssuePlatformRowsInOrderRange/);
  assert.match(worker, /\.in\("platform", FINANCIAL_ISSUE_PLATFORM_FALLBACK_PLATFORMS\)/);
  assert.match(worker, /\.gte\("occurred_at", `\$\{from\}T00:00:00\.000Z`\)/);
  assert.match(worker, /\.lt\("occurred_at", nextDayStartIso\(to\)\)/);
  assert.match(worker, /\.gte\("order_ts", `\$\{from\}T00:00:00\.000Z`\)/);
  assert.match(worker, /\.lt\("order_ts", nextDayStartIso\(to\)\)/);
  assert.match(worker, /FINANCIAL_ISSUE_ANALYSIS_PLATFORM_CANDIDATE_SELECT/);
  const candidateSelect = worker.match(/const FINANCIAL_ISSUE_ANALYSIS_PLATFORM_CANDIDATE_SELECT =\s*\n\s*"([^"]+)"/)?.[1] || "";
  assert.doesNotMatch(candidateSelect, /customer_email|customer_email_normalized|email,/);
  assert.match(candidateSelect, /source_id,sub1,sub2,sub3,sub4,sub5/);
  assert.match(worker, /financialIssuePlatformFallbackDecision/);
  assert.match(worker, /existingLedgerIssueOrderIds/);
  assert.match(worker, /existing_ledger_issue/);
  assert.match(worker, /candidateOrderIdsWithAffiliate/);
});

test("financial import monitor route consumes the authenticated Worker endpoint without a privileged UI proxy", () => {
  const navigation = readRepoFile("ui/lib/app-navigation.ts");
  const page = readRepoFile("ui/app/(app)/dashboard/financial-import-monitor/page.tsx");
  const client = readRepoFile("ui/app/(app)/dashboard/financial-import-monitor/financial-import-monitor-client.tsx");
  const lib = readRepoFile("ui/lib/financial-import-monitor.ts");
  const worker = readRepoFile("api/src/index.ts");
  const monitor = readRepoFile("api/src/financial-import-monitor.ts");

  assert.match(navigation, /href: "\/dashboard\/financial-import-monitor"/);
  assert.match(page, /<FinancialImportMonitorClient \/>/);
  assert.match(client, /Financial Import Monitor/);
  assert.match(client, /\/v1\/financial-import-monitor/);
  assert.match(client, /SummaryCards/);
  assert.match(client, /AccountTable/);
  assert.match(client, /DetailPanel/);
  assert.match(client, /Needs attention/);
  assert.match(lib, /financialImportMonitorQuery/);
  assert.match(worker, /FINANCIAL_IMPORT_MONITOR_PATH/);
  assert.match(worker, /getFinancialImportMonitorReport/);
  assert.match(monitor, /FINANCIAL_IMPORT_MONITOR_PATH = "\/v1\/financial-import-monitor"/);
  assert.match(monitor, /integrations_credentials/);
  assert.match(monitor, /integration_import_jobs/);
  assert.match(monitor, /connector_import_tasks/);
  assert.match(monitor, /conversions/);
  assert.match(monitor, /processor_account_id/);
  assert.match(monitor, /diagnostic_only/);
  assert.doesNotMatch(monitor, /\bfetch\s*\(/);
  assert.doesNotMatch(monitor, /\.(insert|upsert|update|delete)\s*\(/);
  assert.throws(() => readRepoFile("ui/app/api/financial-import-monitor/route.ts"));
});

test("financial issue analysis migration adds indexes matching the bounded query predicates", () => {
  const migration = readRepoFile("supabase/migrations/034_financial_issue_analysis_indexes.sql");
  const explain = readRepoFile("docs/operations/refunds-analysis-explain.sql");

  assert.match(
    migration,
    /platform_orders_financial_issue_order_range_idx[\s\S]*workspace_id, order_ts, platform, platform_order_id/,
  );
  assert.match(
    migration,
    /platform_orders_financial_issue_status_idx[\s\S]*workspace_id, status_norm, platform_order_id, platform/,
  );
  assert.match(
    migration,
    /conversions_financial_issue_range_idx[\s\S]*workspace_id, occurred_at, ledger_type, order_id/,
  );
  assert.doesNotMatch(migration, /\bwhere\b/i);
  assert.doesNotMatch(migration.toLowerCase(), /drop\s+(table|index)|truncate|delete\s+from|update\s+public/);
  assert.match(explain, /explain \(analyze, buffers, costs, verbose\)/);
  assert.match(explain, /platform_orders_financial_issue_order_range_idx/);
  assert.match(explain, /platform_orders_financial_issue_status_idx/);
  assert.match(explain, /conversions_financial_issue_range_idx/);
});

test("WowBoost and WowPay integration catalog routes are registered by the Worker", () => {
  const catalog = readRepoFile("ui/lib/integrations/catalog.ts");
  const worker = readRepoFile("api/src/index.ts");

  for (const route of [
    "/v1/integrations/wowboost/status",
    "/v1/integrations/wowboost/settings",
    "/v1/integrations/wowboost/run-now",
    "/v1/integrations/wowboost/import-orders-async",
    "/v1/integrations/wowboost/import-job-status",
    "/v1/integrations/wowpay/status",
    "/v1/integrations/wowpay/settings",
    "/v1/integrations/wowpay/run-now",
    "/v1/integrations/wowpay/import-orders",
  ]) {
    assert.match(catalog, new RegExp(route.replaceAll("/", "\\/")));
    assert.match(worker, new RegExp(route.replaceAll("/", "\\/")));
  }

  assert.match(worker, /buildWowSuiteCredentialStatus\(sub, creds\)/);
  assert.match(worker, /normalizeWowSuiteImportDateRange/);
  assert.match(worker, /dry_run: true/);
  assert.match(worker, /onConflict: "platform_order_id"/);
});

test("shared time interval picker keeps labels and dark-mode controls readable", () => {
  const picker = readRepoFile("ui/components/time-interval-picker.tsx");

  for (const label of ["Today", "Yesterday", "Last 7 Days", "Month to Date", "PRESETS", "CUSTOM RANGE", "From", "To", "Clear", "Cancel", "Apply"]) {
    assert.match(picker, new RegExp(label));
  }

  assert.match(picker, /sameDayRange/);
  assert.match(picker, /aria-pressed=\{selected\}/);
  assert.match(picker, /dark:bg-ink/);
  assert.match(picker, /dark:bg-slate-950/);
  assert.match(picker, /dark:border-white\/10/);
  assert.match(picker, /dark:text-slate-100/);
  assert.match(picker, /dark:text-slate-200/);
  assert.match(picker, /dark:text-slate-300/);
  assert.match(picker, /focus:ring-2 focus:ring-teal-500/);
  assert.match(picker, /dark:\[color-scheme:dark\]/);
  assert.match(picker, /setFromStr\(e\.target\.value\)/);
  assert.match(picker, /setToStr\(e\.target\.value\)/);
  assert.doesNotMatch(picker, /className="(?:[^"]* )?text-left px-2 py-2 rounded border hover:bg-gray-50 text-sm"/);
  assert.doesNotMatch(picker, /className="(?:[^"]* )?text-sm px-3 py-2 rounded-md border hover:bg-gray-50"/);
});

test("investigation drawer primitives are installed in the app shell", () => {
  const appShell = readRepoFile("ui/components/layout/app-shell.tsx");
  const provider = readRepoFile("ui/components/investigation/investigation-provider.tsx");
  const drawer = readRepoFile("ui/components/investigation/investigation-drawer.tsx");
  const entityHeader = readRepoFile("ui/components/shared/entity-header.tsx");
  const entityLink = readRepoFile("ui/components/shared/entity-link.tsx");
  const commandContext = readRepoFile("ui/components/shared/command-context.tsx");
  const entities = readRepoFile("ui/lib/entities.ts");
  const proxy = readRepoFile("ui/app/api/entities/[...entityPath]/route.ts");

  assert.match(appShell, /<InvestigationProvider>/);
  assert.match(appShell, /<CommandProvider>/);
  assert.match(provider, /MAX_STACK_DEPTH = 8/);
  assert.match(provider, /inspect/);
  assert.match(provider, /parseInspectValue/);
  assert.match(drawer, /PREVIEW_CACHE_MAX = 50/);
  assert.match(drawer, /Escape/);
  assert.match(drawer, /tracekit:work-item-mutated/);
  assert.match(drawer, /useContextCommands/);
  assert.match(commandContext, /registerCommands/);
  assert.match(commandContext, /useRegisteredCommands/);
  assert.match(entityHeader, /entityType: EntityType/);
  assert.match(entityHeader, /CopyButton/);
  assert.match(entityLink, /mode = "panel"/);
  assert.match(entityLink, /metaKey/);
  assert.match(entities, /customer" \| "order" \| "journey" \| "work_item"/);
  assert.match(proxy, /\/v1\/entities\/\$\{path\}/);
});

test("entity investigation is reachable from Home, Operations, Notifications, and command search", () => {
  const home = readRepoFile("ui/components/home/home-command-center.tsx");
  const operations = readRepoFile("ui/app/(app)/operations/operations-client.tsx");
  const notifications = readRepoFile("ui/app/(app)/notifications/notifications-client.tsx");
  const topbar = readRepoFile("ui/components/layout/topbar.tsx");
  const commandPalette = readRepoFile("ui/components/shared/command-palette.tsx");
  const commands = readRepoFile("ui/lib/commands.ts");
  const customerDetail = readRepoFile("ui/app/(app)/customers/[person_id]/customer-detail-client.tsx");
  const journeyDetail = readRepoFile("ui/app/(app)/journeys/[tkid]/page.tsx");
  const journeyList = readRepoFile("ui/app/(app)/journeys/page.tsx");

  assert.match(home, /EntityLink/);
  assert.match(home, /activityTarget/);
  assert.match(home, /type: "work_item"/);
  assert.match(home, /type: "customer"/);
  assert.match(home, /type: "order"/);
  assert.match(operations, /useInvestigation/);
  assert.match(operations, /inspectTarget/);
  assert.match(operations, /investigation\.open\(\{ type: "work_item"/);
  assert.match(notifications, /EntityLink/);
  assert.match(topbar, /EntityLink/);
  assert.match(commandPalette, /BUILT_IN_OPERATIONS_VIEW_COMMANDS/);
  assert.match(commandPalette, /BUILT_IN_SAFE_ACTION_COMMANDS/);
  assert.match(commandPalette, /useRegisteredCommands/);
  assert.match(commandPalette, /investigation\.open\(item\.target\)/);
  assert.match(commands, /copy_current_page_link/);
  assert.match(commands, /Show attribution issues/);
  assert.match(customerDetail, /<EntityHeader/);
  assert.doesNotMatch(customerDetail, /<Customer360Header/);
  assert.match(journeyDetail, /<EntityHeader/);
  assert.match(journeyList, /EntityLink/);
});
