export type StoredEvidence = {
  storageBackend: "protected_object_storage" | "test_memory";
  storageReference: string;
  contentType: string;
  byteSize: number;
  payloadHash: string;
};

export interface CommerceEvidenceStore {
  putImmutable(input: { organizationId: string; connectionId?: string; providerAccountId?: string; sourceObjectType?: string; payload: Uint8Array; contentType: string }): Promise<StoredEvidence>;
  getAuthorized(input: { organizationId: string; storageReference: string }): Promise<Uint8Array | null>;
  markErased(input: { organizationId: string; storageReference: string }): Promise<void>;
  verifyHash(input: { organizationId: string; storageReference: string; payloadHash: string }): Promise<boolean>;
}

export async function sha256Hex(payload: Uint8Array, cryptoApi: Crypto = globalThis.crypto) {
  const digest = await cryptoApi.subtle.digest("SHA-256", Uint8Array.from(payload).buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class MemoryCommerceEvidenceStore implements CommerceEvidenceStore {
  private readonly rows = new Map<string, { organizationId: string; payload: Uint8Array; erased: boolean }>();
  async putImmutable(input: { organizationId: string; payload: Uint8Array; contentType: string }) {
    const payloadHash = await sha256Hex(input.payload);
    const storageReference = `memory://${input.organizationId}/${payloadHash}`;
    if (!this.rows.has(storageReference)) this.rows.set(storageReference, { organizationId: input.organizationId, payload: input.payload.slice(), erased: false });
    return { storageBackend: "test_memory" as const, storageReference, contentType: input.contentType, byteSize: input.payload.byteLength, payloadHash };
  }
  async getAuthorized(input: { organizationId: string; storageReference: string }) {
    const row = this.rows.get(input.storageReference);
    return row?.organizationId === input.organizationId && !row.erased ? row.payload.slice() : null;
  }
  async markErased(input: { organizationId: string; storageReference: string }) {
    const row = this.rows.get(input.storageReference);
    if (row?.organizationId !== input.organizationId) throw new Error("Evidence unavailable.");
    row.erased = true;
  }
  async verifyHash(input: { organizationId: string; storageReference: string; payloadHash: string }) {
    const payload = await this.getAuthorized(input);
    return payload ? (await sha256Hex(payload)) === input.payloadHash : false;
  }
}
