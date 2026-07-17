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

export type CredentialFieldType = "text" | "password" | "url" | "select";

export type IntegrationCredentialOption = {
  value: string;
  label: string;
};

export type IntegrationCredentialField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: CredentialFieldType;
  required?: boolean;
  helpText?: string;
  defaultValue?: string;
  autoComplete?: string;
  options?: IntegrationCredentialOption[];
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

export type IntegrationBackfillMode = "sync" | "async_job";

export type IntegrationBackfillFilter = {
  value: string;
  label: string;
};

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
  testConnectionPath?: string;
  saveCredentialsPath?: string;
  statusPath?: string;
  settingsPath?: string;
  runNowPath?: string;
  backfillPath?: string;
  backfillMode?: IntegrationBackfillMode;
  backfillJobStatusPath?: string;
  backfillFilters?: IntegrationBackfillFilter[];
  backfillTimeoutMs?: number;
  backfillTitle?: string;
  backfillDescription?: string;

  apiPlatform?: string;
  defaultBackfillFrom?: string;
  defaultBackfillTo?: string;
  defaultAutoImportIntervalMinutes?: number;
  defaultAutoImportLookbackHours?: number;

  documentation?: {
    credentialInstructions?: string[];
    installInstructions?: string[];
  };
};
