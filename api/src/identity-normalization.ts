export const IDENTITY_IDENTIFIER_TYPES = [
  "email",
  "phone",
  "paypal_payer_id",
  "stripe_customer_id",
  "shopify_customer_id",
  "woocommerce_customer_id",
  "checkoutchamp_customer_id",
  "fanbasis_customer_id",
  "everflow_transaction_id",
  "external_customer_id",
  "order_customer_id",
] as const;

export type IdentityIdentifierType = (typeof IDENTITY_IDENTIFIER_TYPES)[number];

export type IdentityNormalizationResult = {
  raw_value: string | null;
  normalized_value: string;
  normalized_hash: string | null;
  valid: boolean;
  warnings: string[];
};

const PLACEHOLDER_VALUES = new Set([
  "",
  "null",
  "undefined",
  "unknown",
  "n/a",
  "na",
  "none",
  "(none)",
  "-",
  "--",
]);

const ZERO_INVALID_TYPES = new Set<IdentityIdentifierType>([
  "paypal_payer_id",
  "stripe_customer_id",
  "shopify_customer_id",
  "woocommerce_customer_id",
  "checkoutchamp_customer_id",
  "fanbasis_customer_id",
  "everflow_transaction_id",
  "external_customer_id",
  "order_customer_id",
]);

export function isIdentityIdentifierType(value: unknown): value is IdentityIdentifierType {
  return (IDENTITY_IDENTIFIER_TYPES as readonly string[]).includes(cleanText(value));
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function safeUnicode(value: string) {
  try {
    return value.normalize("NFKC");
  } catch {
    return value;
  }
}

function isPlaceholder(value: unknown, type?: IdentityIdentifierType) {
  const text = cleanText(value);
  const comparable = text.toLowerCase();
  return PLACEHOLDER_VALUES.has(comparable) || (text === "0" && (!type || ZERO_INVALID_TYPES.has(type)));
}

function invalidResult(rawValue: unknown, warning: string): IdentityNormalizationResult {
  return {
    raw_value: cleanText(rawValue) || null,
    normalized_value: "",
    normalized_hash: null,
    valid: false,
    warnings: [warning],
  };
}

export async function normalizeIdentityEmail(value: unknown): Promise<IdentityNormalizationResult> {
  if (isPlaceholder(value, "email")) return invalidResult(value, "placeholder_value");
  const raw = cleanText(value);
  const normalized = safeUnicode(raw).toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return invalidResult(value, "invalid_email");
  }
  return {
    raw_value: raw,
    normalized_value: normalized,
    normalized_hash: await sha256Hex(normalized),
    valid: true,
    warnings: [],
  };
}

function digitsOnly(value: string) {
  return value.replace(/[^\d]/g, "");
}

export async function normalizeIdentityPhone(
  value: unknown,
  args: { country?: string | null } = {},
): Promise<IdentityNormalizationResult> {
  if (isPlaceholder(value, "phone")) return invalidResult(value, "placeholder_value");
  const raw = cleanText(value);
  const warnings: string[] = [];
  if (!raw) return invalidResult(value, "empty_phone");

  if (raw.startsWith("+")) {
    const digits = digitsOnly(raw);
    if (digits.length < 8 || digits.length > 15) return invalidResult(value, "invalid_e164_phone");
    const normalized = `+${digits}`;
    return {
      raw_value: raw,
      normalized_value: normalized,
      normalized_hash: await sha256Hex(normalized),
      valid: true,
      warnings,
    };
  }

  const country = cleanText(args.country).toUpperCase();
  const digits = digitsOnly(raw);
  if (!country) {
    warnings.push("country_context_required");
    return {
      raw_value: raw,
      normalized_value: digits || raw,
      normalized_hash: digits ? await sha256Hex(digits) : null,
      valid: false,
      warnings,
    };
  }

  if (country === "US" || country === "CA") {
    const normalized = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : "";
    if (!normalized) return invalidResult(value, "invalid_nanp_phone");
    return {
      raw_value: raw,
      normalized_value: normalized,
      normalized_hash: await sha256Hex(normalized),
      valid: true,
      warnings,
    };
  }

  warnings.push("unsupported_country_context");
  return {
    raw_value: raw,
    normalized_value: digits || raw,
    normalized_hash: digits ? await sha256Hex(digits) : null,
    valid: false,
    warnings,
  };
}

function normalizeUuidCaseWhenSafe(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : value;
}

function shouldLowercaseExternalIdentifier(type: IdentityIdentifierType) {
  return type === "everflow_transaction_id";
}

export async function normalizeExternalIdentityIdentifier(
  type: IdentityIdentifierType,
  value: unknown,
): Promise<IdentityNormalizationResult> {
  if (isPlaceholder(value, type)) return invalidResult(value, "placeholder_value");
  const raw = cleanText(value);
  if (!raw) return invalidResult(value, "empty_identifier");
  const normalized = type === "everflow_transaction_id"
    ? normalizeUuidCaseWhenSafe(raw)
    : shouldLowercaseExternalIdentifier(type)
      ? raw.toLowerCase()
      : raw;
  return {
    raw_value: raw,
    normalized_value: normalized,
    normalized_hash: await sha256Hex(`${type}:${normalized}`),
    valid: true,
    warnings: [],
  };
}

export async function normalizeIdentityIdentifier(args: {
  identifier_type: unknown;
  value: unknown;
  country?: string | null;
}): Promise<IdentityNormalizationResult & { identifier_type: IdentityIdentifierType | null }> {
  const type = cleanText(args.identifier_type);
  if (!isIdentityIdentifierType(type)) {
    return {
      ...invalidResult(args.value, "unsupported_identifier_type"),
      identifier_type: null,
    };
  }

  const result = type === "email"
    ? await normalizeIdentityEmail(args.value)
    : type === "phone"
      ? await normalizeIdentityPhone(args.value, { country: args.country })
      : await normalizeExternalIdentityIdentifier(type, args.value);

  return {
    ...result,
    identifier_type: type,
  };
}
