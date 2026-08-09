export type CommerceActionSuccess = { ok: true; connectionId?: string; verified?: boolean; status: string; message?: string; requestId?: string };
export type CommerceActionFailure = { ok: false; code: string; message: string; requestId?: string; retryable?: boolean };
export type CommerceActionResult = CommerceActionSuccess | CommerceActionFailure;

export async function readCommerceActionResponse(response: Response): Promise<CommerceActionResult> {
  const requestId = response.headers.get("x-tracekit-request-id") || undefined;
  if (response.status === 204) return response.ok
    ? { ok: true, status: "completed", requestId }
    : { ok: false, code: "empty_response", message: "TraceKit could not complete the operation.", requestId };
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text().catch(() => "");
  if (!body.trim()) return { ok: false, code: "empty_response", message: response.ok ? "TraceKit returned an incomplete response." : "TraceKit could not complete the operation.", requestId, retryable: response.status >= 500 };
  if (!contentType.toLowerCase().includes("application/json")) return { ok: false, code: "invalid_response", message: "TraceKit could not complete the operation.", requestId, retryable: response.status >= 500 };
  try {
    const parsed = JSON.parse(body) as Partial<CommerceActionResult>;
    if (parsed.ok === true && typeof parsed.status === "string") return { ...parsed, ok: true, requestId: parsed.requestId || requestId } as CommerceActionSuccess;
    if (parsed.ok === false && typeof parsed.code === "string" && typeof parsed.message === "string") return { ...parsed, ok: false, requestId: parsed.requestId || requestId } as CommerceActionFailure;
  } catch { /* Normalize malformed provider/framework responses below. */ }
  return { ok: false, code: "invalid_response", message: "TraceKit returned an invalid response.", requestId, retryable: response.status >= 500 };
}
