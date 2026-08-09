import { sha256Hex, type CommerceEvidenceStore, type StoredEvidence } from "./evidence-store";

const BUCKET = "commerce-evidence";

type EvidenceScope = { organizationId: string; connectionId: string; providerAccountId: string; sourceObjectType: string };

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Commerce Evidence storage is unavailable.");
  return { url, key };
}

function safeSegment(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Commerce Evidence scope is invalid.");
  return value;
}

function objectPath(scope: EvidenceScope, hash: string) {
  return [scope.organizationId, scope.connectionId, scope.providerAccountId, scope.sourceObjectType, hash].map(safeSegment).join("/");
}

function encodedPath(path: string) { return path.split("/").map(encodeURIComponent).join("/"); }

export class SupabaseCommerceEvidenceStore implements CommerceEvidenceStore {
  async putImmutable(input: { organizationId: string; connectionId?: string; providerAccountId?: string; sourceObjectType?: string; payload: Uint8Array; contentType: string }): Promise<StoredEvidence> {
    if (!input.connectionId || !input.providerAccountId || !input.sourceObjectType) throw new Error("Durable Commerce Evidence requires complete server scope.");
    const payloadHash = await sha256Hex(input.payload);
    const path = objectPath({ organizationId: input.organizationId, connectionId: input.connectionId, providerAccountId: input.providerAccountId, sourceObjectType: input.sourceObjectType }, payloadHash);
    const response = await this.storageRequest(path, { method: "POST", headers: { "Content-Type": input.contentType, "x-upsert": "false" }, body: Buffer.from(input.payload) });
    if (!response.ok) {
      const existing = await this.getAuthorized({ organizationId: input.organizationId, storageReference: `${BUCKET}/${path}` });
      if (!existing || (await sha256Hex(existing)) !== payloadHash) throw new Error("Commerce Evidence could not be persisted immutably.");
    }
    return { storageBackend: "protected_object_storage", storageReference: `${BUCKET}/${path}`, contentType: input.contentType, byteSize: input.payload.byteLength, payloadHash };
  }

  async getAuthorized(input: { organizationId: string; storageReference: string }) {
    const prefix = `${BUCKET}/${safeSegment(input.organizationId)}/`;
    if (!input.storageReference.startsWith(prefix)) return null;
    const path = input.storageReference.slice(BUCKET.length + 1);
    const response = await this.storageRequest(path, { method: "GET" });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  }

  async markErased(input: { organizationId: string; storageReference: string }) {
    const prefix = `${BUCKET}/${safeSegment(input.organizationId)}/`;
    if (!input.storageReference.startsWith(prefix)) throw new Error("Evidence unavailable.");
    const response = await this.storageRequest(input.storageReference.slice(BUCKET.length + 1), { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error("Commerce Evidence erasure failed.");
  }

  async verifyHash(input: { organizationId: string; storageReference: string; payloadHash: string }) {
    const payload = await this.getAuthorized(input);
    return payload ? (await sha256Hex(payload)) === input.payloadHash : false;
  }

  private async storageRequest(path: string, init: RequestInit) {
    const { url, key } = configuration();
    return fetch(`${url}/storage/v1/object/${BUCKET}/${encodedPath(path)}`, { ...init, cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers } });
  }
}
