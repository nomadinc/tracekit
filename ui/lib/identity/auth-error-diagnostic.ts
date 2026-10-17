// Only fixed categories leave this boundary. SDK errors can contain request or token data.
const callbackCodes = new Set(["missing_auth_params", "missing_pkce_cookie", "oauth_state_mismatch", "missing_tokens", "invalid_grant", "invalid_client", "invalid_redirect_uri"]);
export function authErrorDiagnostic(value: unknown) {
  const wrapper = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const error = wrapper.error && typeof wrapper.error === "object" ? wrapper.error as Record<string, unknown> : wrapper;
  const code = typeof error.code === "string" && callbackCodes.has(error.code) ? error.code : "unclassified";
  return { code, category: error.name === "ValiError" && code === "unclassified" ? "state_unseal_or_schema_rejected" : code === "missing_pkce_cookie" ? "verification_cookie_missing" : code === "oauth_state_mismatch" ? "state_mismatch" : code === "invalid_grant" ? "provider_code_rejected" : "authentication_error" };
}
