import "server-only";
import { CommerceVerificationError, type CommerceConnectionVerifier } from "./control-plane";
import { EverflowHealthError, getEverflowNetworkIdentity } from "../integrations/everflow-client";

/** Reverify the stored network without reconnecting, rotating, or synchronizing. */
export class BoundedEverflowConnectionVerifier implements CommerceConnectionVerifier {
  async verify(input: Parameters<CommerceConnectionVerifier["verify"]>[0]) {
    if (!input.expectedProviderAccountId)
      throw new CommerceVerificationError("everflow_account_scope_unavailable", 409, false);
    try {
      await getEverflowNetworkIdentity({apiKey:input.secret,networkId:input.expectedProviderAccountId,correlationId:input.correlationId});
      return {capabilities:["network_identity"],providerStatus:200};
    } catch (error) {
      if (error instanceof EverflowHealthError)
        throw new CommerceVerificationError(error.code,error.httpStatus,error.retryable);
      throw error;
    }
  }
}
