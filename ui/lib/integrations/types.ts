export type IntegrationCategory =
  | "crm"
  | "gateway"
  | "tracking"
  | "commerce"
  | "developer";

export type IntegrationAuthType =
  | "none"
  | "api_key"
  | "username_password"
  | "oauth";

export type CredentialFieldType = "text" | "password" | "url";

export type IntegrationCredentialField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: CredentialFieldType;
  required?: boolean;
  helpText?: string;
};

export type IntegrationTestEvent =
  | "sale"
  | "refund"
  | "chargeback"
  | "chargeback_fee"
  | "bank_fee";
  
export type IntegrationPrimaryAction =
  | "connect"
  | "configure"
  | "manage"
  | "open"
  | "launch";

export type IntegrationDefinition = {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;

  primaryAction: IntegrationPrimaryAction;

  authType: IntegrationAuthType;
  credentialFields: IntegrationCredentialField[];

  supportsWebhook: boolean;
  supportsBackfill: boolean;
  supportsTestConnection: boolean;
  supportsTestEvents: boolean;

  testEvents?: IntegrationTestEvent[];

  postbackPath?: string;
  connectPath?: string;
  backfillPath?: string;

  documentation?: {
    credentialInstructions?: string[];
    installInstructions?: string[];
  };
};