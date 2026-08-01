import type { IdentitySession } from "./types";

export interface IdentitySessionAdapter {
  readonly kind: string;
  load(): Promise<IdentitySession>;
  subscribe?(listener: (session: IdentitySession) => void): () => void;
}

export const DEVELOPMENT_IDENTITY_STORAGE_KEY = "tracekit:development-identity";
