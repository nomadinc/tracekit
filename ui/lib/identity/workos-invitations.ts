export type WorkOSInvitation = {
  id: string;
  email: string;
  state: "pending" | "accepted" | "revoked" | "expired" | string;
  expiresAt: string | null;
  organizationId: string | null;
  inviterUserId: string | null;
  acceptedUserId: string | null;
};

type WorkOSInvitationResponse = {
  id?: unknown;
  email?: unknown;
  state?: unknown;
  expires_at?: unknown;
  organization_id?: unknown;
  inviter_user_id?: unknown;
  accepted_user_id?: unknown;
};

type WorkOSInvitationListResponse = { data?: WorkOSInvitationResponse[] };

function configuration() {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) throw new Error("WorkOS invitation delivery is unavailable.");
  return { apiKey };
}

function mapInvitation(value: WorkOSInvitationResponse): WorkOSInvitation {
  if (typeof value.id !== "string" || typeof value.email !== "string" || typeof value.state !== "string") {
    throw new Error("WorkOS returned an invalid invitation.");
  }
  return {
    id: value.id,
    email: value.email,
    state: value.state,
    expiresAt: typeof value.expires_at === "string" ? value.expires_at : null,
    organizationId: typeof value.organization_id === "string" ? value.organization_id : null,
    inviterUserId: typeof value.inviter_user_id === "string" ? value.inviter_user_id : null,
    acceptedUserId: typeof value.accepted_user_id === "string" ? value.accepted_user_id : null,
  };
}

async function workos(path: string, init: RequestInit = {}) {
  const { apiKey } = configuration();
  const response = await fetch(`https://api.workos.com${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`WorkOS invitation request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

export async function createWorkOSInvitation(input: {
  email: string;
  inviterUserId: string;
  organizationId?: string | null;
  expiresInDays?: number;
}) {
  const payload = {
    email: input.email,
    inviter_user_id: input.inviterUserId,
    expires_in_days: input.expiresInDays ?? 7,
    ...(input.organizationId ? { organization_id: input.organizationId } : {}),
  };
  return mapInvitation(await workos("/user_management/invitations", { method: "POST", body: JSON.stringify(payload) }) as WorkOSInvitationResponse);
}

export async function resendWorkOSInvitation(invitationId: string) {
  return mapInvitation(await workos(`/user_management/invitations/${encodeURIComponent(invitationId)}/resend`, { method: "POST" }) as WorkOSInvitationResponse);
}

export async function revokeWorkOSInvitation(invitationId: string) {
  return mapInvitation(await workos(`/user_management/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: "POST" }) as WorkOSInvitationResponse);
}

export async function listWorkOSInvitationsByEmail(email: string) {
  const payload = await workos(`/user_management/invitations?email=${encodeURIComponent(email)}&limit=100&order=desc`) as WorkOSInvitationListResponse;
  return Array.isArray(payload?.data) ? payload.data.map(mapInvitation) : [];
}
