import type { Permission, Role } from "./permissions";

export type AccountType = "platform" | "agency" | "client";
export type ShellVariant = "product-admin" | "agency" | "client";

export type Organization = {
  id: string;
  name: string;
  mark: string;
  accountId: string;
};

export type BusinessContext = {
  id: string;
  organizationId: string;
  name: string;
  mark: string;
};

export type Membership = {
  id: string;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  role: Role;
  organizationIds: string[];
  grants?: Permission[];
  denials?: Permission[];
};

export type Identity = {
  id: string;
  name: string;
  email: string;
  title: string;
  membership: Membership;
};

export type IdentitySession = {
  authenticated: boolean;
  developmentOnly: boolean;
  identity: Identity;
  activeOrganizationId: string | null;
  activeBusinessContextId: string | null;
};

export type BrandConfiguration = {
  productName: string;
  logoMark: string;
  accent: string;
  faviconUrl?: string;
  loginPresentation?: "tracekit" | "agency";
  customDomain?: string;
  poweredByTraceKit: "always" | "optional" | "hidden";
};
