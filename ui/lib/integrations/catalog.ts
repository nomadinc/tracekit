import type {
  IntegrationCategory,
  IntegrationDefinition,
} from "./types";

export const integrationCategoryLabels: Record<IntegrationCategory, string> = {
  crm: "CRMs",
  gateway: "Payment Gateways",
  tracking: "Tracking Platforms",
  commerce: "Commerce",
  developer: "Developer Tools",
};

export const integrationCategoryOrder: IntegrationCategory[] = [
  "crm",
  "gateway",
  "tracking",
  "commerce",
  "developer",
];

const orderImportFilters = [
  { value: "all_sales", label: "All Sales" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "declined", label: "Declined" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];

const checkoutChampBaseUrl = "https://api.checkoutchamp.com";
const wowSuiteBaseUrl = "https://public-api.tryemanagecrm.com";

export const integrationCatalog: IntegrationDefinition[] = [
  {
    id: "manual-postback",
    name: "Manual Postback",
    category: "developer",
    description:
      "Send sales, refunds, chargebacks, chargeback fees, and bank fees directly into the append-only ledger.",
    primaryAction: "configure",
    authType: "none",
    credentialFields: [],
    supportsWebhook: true,
    supportsBackfill: false,
    supportsTestConnection: false,
    supportsTestEvents: true,
    testEvents: [
      "sale",
      "refund",
      "chargeback",
      "chargeback_fee",
      "bank_fee",
    ],
    postbackPath: "/v1/postbacks/manual",
    documentation: {
      installInstructions: [
        "Copy the generated postback URL.",
        "Send JSON using POST with Content-Type application/json.",
        "Include type, order_id, transaction_id, amount, and currency.",
      ],
    },
  },
  {
    id: "konnektive",
    name: "Konnektive CRM",
    category: "crm",
    description:
      "Import orders, refunds, chargebacks, attribution data, and customer records.",
    primaryAction: "connect",
    authType: "username_password",
    apiPlatform: "checkoutchamp",
    credentialFields: [
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: checkoutChampBaseUrl,
        defaultValue: checkoutChampBaseUrl,
        required: true,
      },
      {
        key: "username",
        label: "Username",
        placeholder: "API username",
        required: true,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        required: true,
        autoComplete: "new-password",
        helpText: "Password is cleared from the form after a successful save.",
      },
    ],
    supportsWebhook: true,
    supportsBackfill: true,
    supportsTestConnection: true,
    supportsTestEvents: false,
    postbackPath: "/v1/postbacks/konnektive",
    testConnectionPath: "/v1/integrations/test-connect",
    saveCredentialsPath: "/v1/integrations/save-credentials",
    statusPath: "/v1/integrations/checkoutchamp/status",
    settingsPath: "/v1/integrations/checkoutchamp/settings",
    runNowPath: "/v1/integrations/checkoutchamp/run-now",
    backfillPath: "/v1/integrations/checkoutchamp/import-orders",
    backfillMode: "sync",
    backfillFilters: orderImportFilters,
    backfillTimeoutMs: 60000,
    defaultBackfillFrom: "2024-01-01",
    defaultBackfillTo: "2024-01-02",
    defaultAutoImportIntervalMinutes: 60,
    defaultAutoImportLookbackHours: 2,
    documentation: {
      credentialInstructions: [
        "Open Konnektive.",
        "Go to Admin > User Accounts.",
        "Create or select an API-enabled user.",
        "Paste the API username and password into TraceKit.",
      ],
    },
  },
  {
    id: "wowboost",
    name: "WowBoost",
    category: "crm",
    description:
      "Import WowBoost order exports, refunds, chargebacks, products, and affiliate attribution.",
    primaryAction: "connect",
    authType: "username_password",
    apiPlatform: "wowboost",
    credentialFields: [
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: wowSuiteBaseUrl,
        defaultValue: wowSuiteBaseUrl,
        required: true,
      },
      {
        key: "username",
        label: "Username",
        required: true,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        required: true,
        autoComplete: "new-password",
        helpText: "Password is cleared from the form after a successful save.",
      },
    ],
    supportsWebhook: true,
    supportsBackfill: true,
    supportsTestConnection: true,
    supportsTestEvents: false,
    postbackPath: "/v1/postbacks/wowboost",
    testConnectionPath: "/v1/integrations/test-connect",
    saveCredentialsPath: "/v1/integrations/save-credentials",
    statusPath: "/v1/integrations/wowboost/status",
    settingsPath: "/v1/integrations/wowboost/settings",
    runNowPath: "/v1/integrations/wowboost/run-now",
    backfillPath: "/v1/integrations/wowboost/import-orders-async",
    backfillMode: "async_job",
    backfillJobStatusPath: "/v1/integrations/wowboost/import-job-status",
    backfillFilters: orderImportFilters,
    defaultBackfillFrom: "2024-01-01",
    defaultBackfillTo: "2024-01-02",
    defaultAutoImportIntervalMinutes: 60,
    defaultAutoImportLookbackHours: 2,
    documentation: {
      credentialInstructions: [
        "Use the WowSuite public API credentials for the WowBoost export flow.",
        "TraceKit tests the credentials, saves them, then runs order imports through the background job endpoint.",
      ],
    },
  },
  {
    id: "wowpay",
    name: "WowPay",
    category: "gateway",
    description:
      "Import payment transactions, refunds, chargebacks, gateway data, and settlement details.",
    primaryAction: "connect",
    authType: "username_password",
    apiPlatform: "wowpay",
    credentialFields: [
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://api.wowpay.com",
        defaultValue: "https://api.wowpay.com",
        required: true,
      },
      {
        key: "username",
        label: "Username",
        required: true,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        required: true,
        autoComplete: "new-password",
        helpText: "Password is cleared from the form after a successful save.",
      },
    ],
    supportsWebhook: true,
    supportsBackfill: true,
    supportsTestConnection: true,
    supportsTestEvents: false,
    postbackPath: "/v1/postbacks/wowpay",
    testConnectionPath: "/v1/integrations/test-connect",
    saveCredentialsPath: "/v1/integrations/save-credentials",
    statusPath: "/v1/integrations/wowpay/status",
    settingsPath: "/v1/integrations/wowpay/settings",
    runNowPath: "/v1/integrations/wowpay/run-now",
    backfillPath: "/v1/integrations/wowpay/import-orders",
    backfillMode: "sync",
    backfillFilters: orderImportFilters,
    backfillTimeoutMs: 60000,
    defaultBackfillFrom: "2024-01-01",
    defaultBackfillTo: "2024-01-02",
    defaultAutoImportIntervalMinutes: 60,
    defaultAutoImportLookbackHours: 2,
  },
  {
    id: "everflow",
    name: "Everflow",
    category: "tracking",
    description:
      "Import conversions, affiliate payouts, offers, affiliates, and attribution identifiers.",
    primaryAction: "connect",
    authType: "api_key",
    apiPlatform: "everflow",
    credentialFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        autoComplete: "new-password",
      },
      {
        key: "networkId",
        label: "Network ID",
        required: false,
      },
    ],
    supportsWebhook: true,
    supportsBackfill: false,
    supportsTestConnection: true,
    supportsTestEvents: false,
    postbackPath: "/v1/postbacks/everflow",
    connectPath: "/v1/integrations/everflow/connect",
    documentation: {
      credentialInstructions: [
        "Create or copy an Everflow API key with reporting access.",
        "Paste the API key and optional network ID into TraceKit.",
      ],
    },
  },
];

export function getIntegrationDefinition(id: string) {
  return integrationCatalog.find((integration) => integration.id === id);
}

export function getIntegrationsByCategory(category: IntegrationCategory) {
  return integrationCatalog.filter(
    (integration) => integration.category === category
  );
}

export function getPopulatedIntegrationCategories() {
  return integrationCategoryOrder
    .map((category) => ({
      category,
      label: integrationCategoryLabels[category],
      integrations: getIntegrationsByCategory(category),
    }))
    .filter((section) => section.integrations.length > 0);
}
