import { sha256Hex, type CommerceEvidenceStore, type StoredEvidence } from "./evidence-store";
import { supabaseAuthHeaders } from "./supabase-auth";

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
    const response = await this.storageRequest(path, { method: "POST", headers: { "Content-Type": input.contentType, "x-upsert": "false" }, body: input.payload.slice().buffer as ArrayBuffer });
    if (!response.ok) {
      const conflict = response.status === 400 || response.status === 409;
      this.logPersistence("post_failed", input.sourceObjectType, payloadHash, response.status, conflict);
      if (!conflict) throw new Error(`Commerce Evidence storage POST failed (${response.status}).`);
      const verification = await this.verifyExistingObject(path, payloadHash);
      if (!verification.matched) throw new Error("Commerce Evidence could not be persisted immutably.");
      this.logPersistence("reused", input.sourceObjectType, payloadHash, verification.status, true, verification.attempts);
    } else {
      this.logPersistence("persisted", input.sourceObjectType, payloadHash, response.status, false);
    }
    return { storageBackend: "protected_object_storage", storageReference: `${BUCKET}/${path}`, contentType: input.contentType, byteSize: input.payload.byteLength, payloadHash };
  }

  private async verifyExistingObject(path: string, payloadHash: string) {
    let status = 0;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await this.storageRequest(path, { method: "GET" });
        status = response.status;
        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          return { matched: (await sha256Hex(bytes)) === payloadHash, status, attempts: attempt };
        }
        if (response.status === 404) return { matched: false, status, attempts: attempt };
      } catch {
        status = 0;
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
    this.logPersistence("verification_failed", "unknown", payloadHash, status, true, 3);
    return { matched: false, status, attempts: 3 };
  }

  private logPersistence(result: string, sourceObjectType: string, payloadHash: string, statusCode: number, conflict: boolean, verificationAttempts?: number) {
    console.log(JSON.stringify({ event: "commerce.evidence.persistence", result, statusCode, conflict, sourceObjectType, scope: "tenant_scoped", payloadHashPrefix: payloadHash.slice(0, 8), verificationAttempts: verificationAttempts ?? 0 }));
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
    return fetch(`${url}/storage/v1/object/${BUCKET}/${encodedPath(path)}`, { ...init, headers: { ...supabaseAuthHeaders(key), ...init.headers } });
  }
}
