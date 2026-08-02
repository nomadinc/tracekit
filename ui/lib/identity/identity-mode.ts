export type IdentityMode = "workos" | "development";

export function identityMode(env: NodeJS.ProcessEnv = process.env): IdentityMode {
  if (env.TRACEKIT_IDENTITY_MODE === "development" && env.TRACEKIT_ENABLE_DEV_IDENTITIES === "true" && env.NODE_ENV !== "production") {
    return "development";
  }
  return "workos";
}

export function developmentIdentitiesEnabled(env: NodeJS.ProcessEnv = process.env) {
  return identityMode(env) === "development";
}

export function identityProviderInitialization(initialSession?: {
  developmentOnly: boolean;
}) {
  const hasInitialSession = Boolean(initialSession);
  const persistent = Boolean(initialSession && !initialSession.developmentOnly);
  return {
    persistent,
    ready: hasInitialSession,
    initializeDevelopment: !persistent,
  };
}

export function resolveIdentitySource({
  hasRealSession,
  developmentEnabled,
  providerConfigured,
}: {
  hasRealSession: boolean;
  developmentEnabled: boolean;
  providerConfigured: boolean;
}) {
  if (hasRealSession) return "persistent" as const;
  if (developmentEnabled) return "development" as const;
  return providerConfigured ? "none" as const : "provider-unavailable" as const;
}
