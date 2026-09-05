import "server-only";
import type { CommerceConnectionVerifier } from "./control-plane";
import { BoundedCommasConnectionVerifier } from "./commas-verifier";
import { BoundedShopifyConnectionVerifier } from "./shopify-verifier";
import { BoundedNext29ConnectionVerifier } from "./next29-verifier";

export class CommerceProviderConnectionVerifier implements CommerceConnectionVerifier {
  private readonly commas = new BoundedCommasConnectionVerifier();
  private readonly shopify = new BoundedShopifyConnectionVerifier();
  private readonly next29 = new BoundedNext29ConnectionVerifier();

  verify(input: { provider: string; environment: string; secret: string; correlationId: string }) {
    if (input.provider === "commas") return this.commas.verify(input);
    if (input.provider === "shopify") return this.shopify.verify(input);
    if (input.provider === "next29") return this.next29.verify(input);
    throw new Error("Provider verification is unavailable.");
  }
}
