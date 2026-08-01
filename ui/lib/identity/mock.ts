import type { BusinessContext, Identity, Organization } from "./types";

export const MOCK_ORGANIZATIONS: Organization[] = [
  { id: "org-bullseye", name: "Bullseye Health", mark: "B", accountId: "account-bullseye" },
  { id: "org-valuerx", name: "ValueRx", mark: "VR", accountId: "account-valuerx" },
  { id: "org-petes", name: "Pete's Pasta", mark: "PP", accountId: "account-petes" },
];

export const MOCK_BUSINESS_CONTEXTS: BusinessContext[] = [
  { id: "offer-bullseye", organizationId: "org-bullseye", name: "Bullseye", mark: "B" },
  { id: "offer-bullseye-retention", organizationId: "org-bullseye", name: "Bullseye Retention", mark: "BR" },
  { id: "offer-valuerx-individual", organizationId: "org-valuerx", name: "ValueRx Individual", mark: "V1" },
  { id: "offer-valuerx-family", organizationId: "org-valuerx", name: "ValueRx Family", mark: "VF" },
  { id: "offer-petes", organizationId: "org-petes", name: "Pete's Pasta", mark: "PP" },
];

export const MOCK_IDENTITIES: Identity[] = [
  { id: "platform-admin", name: "Avery Platform", email: "avery@tracekit.dev", title: "TraceKit Platform Admin", membership: { id: "m-platform", accountId: "tracekit", accountName: "TraceKit Platform", accountType: "platform", role: "platform-admin", organizationIds: [] } },
  { id: "agency-owner", name: "Morgan Agency", email: "morgan@northstar.dev", title: "Agency Owner", membership: { id: "m-agency-owner", accountId: "agency-northstar", accountName: "Northstar Growth", accountType: "agency", role: "agency-owner", organizationIds: ["org-bullseye", "org-valuerx", "org-petes"] } },
  { id: "agency-team", name: "Riley Team", email: "riley@northstar.dev", title: "Agency Team Member", membership: { id: "m-agency-team", accountId: "agency-northstar", accountName: "Northstar Growth", accountType: "agency", role: "team-member", organizationIds: ["org-bullseye", "org-valuerx"] } },
  { id: "client-admin", name: "Jordan Admin", email: "jordan@bullseye.dev", title: "Client Organization Admin", membership: { id: "m-client-admin", accountId: "account-bullseye", accountName: "Bullseye Health", accountType: "client", role: "organization-admin", organizationIds: ["org-bullseye"] } },
  { id: "client-analyst", name: "Casey Analyst", email: "casey@bullseye.dev", title: "Client Analyst", membership: { id: "m-client-analyst", accountId: "account-bullseye", accountName: "Bullseye Health", accountType: "client", role: "analyst-operator", organizationIds: ["org-bullseye"] } },
  { id: "client-read-only", name: "Taylor Viewer", email: "taylor@bullseye.dev", title: "Read-only Client User", membership: { id: "m-client-viewer", accountId: "account-bullseye", accountName: "Bullseye Health", accountType: "client", role: "client-read-only", organizationIds: ["org-bullseye"] } },
];

export const DEFAULT_DEVELOPMENT_IDENTITY_ID = "client-admin";
