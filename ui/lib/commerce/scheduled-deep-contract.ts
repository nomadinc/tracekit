export const SCHEDULED_DEEP_PROVIDER_REQUEST_HARD_MAX = 800;

export function scheduledDeepProviderRequestLimit(value: unknown): number {
  if(typeof value!=="number")throw new Error("invalid_scheduled_deep_provider_request_limit");
  const limit = value;
  if (!Number.isInteger(limit) || limit < 1 || limit > SCHEDULED_DEEP_PROVIDER_REQUEST_HARD_MAX) {
    throw new Error("invalid_scheduled_deep_provider_request_limit");
  }
  return limit;
}

export function scheduledDeepAttemptAllowance(limit:number,consumed:number,maxAttempts=3):number {
  const validated=scheduledDeepProviderRequestLimit(limit);
  if(!Number.isInteger(consumed)||consumed<0)throw new Error("invalid_scheduled_deep_provider_request_count");
  return Math.max(0,Math.min(maxAttempts,validated-consumed));
}
