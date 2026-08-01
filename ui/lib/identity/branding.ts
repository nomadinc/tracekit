import type { BrandConfiguration } from "./types";

export const TRACEKIT_BRAND: BrandConfiguration = {
  productName: "TraceKit",
  logoMark: "TK",
  accent: "#0f172a",
  loginPresentation: "tracekit",
  poweredByTraceKit: "always",
};

export const NORTHSTAR_AGENCY_BRAND: BrandConfiguration = {
  productName: "Northstar Intelligence",
  logoMark: "NG",
  accent: "#155e75",
  loginPresentation: "agency",
  poweredByTraceKit: "always",
};

export function brandForAccountType(accountType: "platform" | "agency" | "client") {
  return accountType === "agency" ? NORTHSTAR_AGENCY_BRAND : TRACEKIT_BRAND;
}
