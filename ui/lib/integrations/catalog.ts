import type { IntegrationDefinition } from "./types";

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

    credentialFields: [
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://api.konnektive.com",
        required: true,
      },
      {
        key: "loginId",
        label: "Login ID",
        placeholder: "Konnektive login ID",
        required: true,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        required: true,
      },
    ],

    supportsWebhook: true,
    supportsBackfill: true,
    supportsTestConnection: true,
    supportsTestEvents: false,

    postbackPath: "/v1/postbacks/konnektive",
    connectPath: "/v1/integrations/konnektive/connect",
    backfillPath: "/v1/integrations/konnektive/import-orders",

    documentation: {
      credentialInstructions: [
        "Open Konnektive.",
        "Go to Admin → User Accounts.",
        "Create or select an API-enabled user.",
        "Paste the Login ID and password into TraceKit.",
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

    credentialFields: [
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://public-api.tryemanagecrm.com",
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
      },
    ],

    supportsWebhook: true,
    supportsBackfill: true,
    supportsTestConnection: true,
    supportsTestEvents: false,

    postbackPath: "/v1/postbacks/wowboost",
    connectPath: "/v1/integrations/wowboost/connect",
    backfillPath: "/v1/integrations/wowboost/import-orders-async",
  },

  {
    id: "wowpay",
    name: "WowPay",
    category: "gateway",
    
    description:
      "Import payment transactions, refunds, chargebacks, gateway data, and settlement details.",
      
    primaryAction: "connect",

    authType: "username_password",

    credentialFields: [
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://public-api.tryemanagecrm.com",
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
      },
    ],

    supportsWebhook: true,
    supportsBackfill: true,
    supportsTestConnection: true,
    supportsTestEvents: false,

    postbackPath: "/v1/postbacks/wowpay",
    connectPath: "/v1/integrations/wowpay/connect",
    backfillPath: "/v1/integrations/wowpay/import-orders",
  },

  {
    id: "everflow",
    name: "Everflow",
    category: "tracking",
    description:
      "Import conversions, affiliate payouts, offers, affiliates, and attribution identifiers.",
      
    primaryAction: "connect",

    authType: "api_key",

    credentialFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
      },
      {
        key: "networkId",
        label: "Network ID",
        required: false,
      },
    ],

    supportsWebhook: true,
    supportsBackfill: true,
    supportsTestConnection: true,
    supportsTestEvents: false,

    postbackPath: "/v1/postbacks/everflow",
    connectPath: "/v1/integrations/everflow/connect",
  },
];

export function getIntegrationDefinition(id: string) {
  return integrationCatalog.find((integration) => integration.id === id);
}

export function getIntegrationsByCategory(
  category: IntegrationDefinition["category"]
) {
  return integrationCatalog.filter(
    (integration) => integration.category === category
  );
}