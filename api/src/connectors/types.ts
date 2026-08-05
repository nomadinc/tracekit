export type CommerceProvider =
  | "commas"
  | "shopify"
  | "checkout_champ"
  | "konnektive"
  | "woocommerce"
  | "next29"
  | "sticky_io";

export type CommerceProviderConnectionStatus =
  | "configured"
  | "validating"
  | "connected"
  | "degraded"
  | "disabled";

export type CommerceProviderCapability = {
  resource: string;
  list: boolean;
  get: boolean;
  incrementalFilters: readonly string[];
  notes?: string;
};

export type CommerceProviderConnection = {
  id: string;
  organizationId: string;
  provider: CommerceProvider;
  providerAccountId: string | null;
  displayName: string;
  environment: string;
  status: CommerceProviderConnectionStatus;
  credentialReference: string;
  capabilities: CommerceProviderCapability[];
  createdAt: string;
  updatedAt: string;
};
