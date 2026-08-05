export type CommasJsonObject = Record<string, unknown>;

export type CommasEnvironment = "production" | "custom";

export type CommasClientConfig = {
  apiKey: string;
  baseUrl?: string;
  environment?: CommasEnvironment;
  allowCustomBaseUrl?: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
};

export type CommasProduct = CommasJsonObject & {
  id: string;
  title?: string | null;
  internal_name?: string | null;
  description?: string | null;
  price?: string | number | null;
  payment_link?: string | null;
};

export type CommasCustomer = CommasJsonObject & {
  id: string | number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  country_code?: string | null;
  total_transactions?: number | null;
  total_spent?: string | number | null;
  last_transaction_date?: string | null;
};

export type CommasTransactionParty = CommasJsonObject & {
  id?: string | number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  country_code?: string | null;
};

export type CommasTransactionProduct = CommasProduct;

export type CommasRefundObservation = CommasJsonObject;

export type CommasTransaction = CommasJsonObject & {
  id: string | number;
  transaction_date?: string | null;
  fan?: CommasTransactionParty | null;
  servicePayment?: CommasJsonObject | null;
  service?: CommasTransactionProduct | null;
  product?: CommasTransactionProduct | null;
  refunds?: CommasRefundObservation[];
  customFields?: Array<{ label?: string; type?: string; value?: unknown }>;
  fee_amount?: string | number | null;
  net_amount?: string | number | null;
  amount?: string | number | null;
};

export type CommasPagination = {
  currentPage: number;
  perPage: number | null;
  totalPages: number | null;
  totalItems: number | null;
  hasMore: boolean;
  nextPage: number | null;
};

export type CommasRateLimit = {
  limit: number | null;
  remaining: number | null;
  reset: string | null;
  retryAfterSeconds: number | null;
};

export type CommasResponseShape = {
  topLevelKeys: string[];
  dataKeys: string[];
  itemKeys: string[];
};

export type CommasPage<T> = {
  items: T[];
  pagination: CommasPagination;
  rateLimit: CommasRateLimit;
  providerRequestId: string | null;
  correlationId: string;
  shape: CommasResponseShape;
};

export type CommasListOptions = {
  page?: number;
  perPage?: number;
};

export type CommasCustomerListOptions = CommasListOptions & {
  search?: string;
};

export type CommasTransactionListOptions = CommasListOptions & {
  productId?: string;
  customerId?: string;
};

export type CommasRequestContext = {
  correlationId?: string;
  signal?: AbortSignal;
};
