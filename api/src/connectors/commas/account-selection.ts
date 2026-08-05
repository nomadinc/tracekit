export type CommasDiscoveryAccount = "small" | "main";

export function selectCommasDiscoveryAccount(
  argv: string[],
  environment: Record<string, string | undefined>,
): { account: CommasDiscoveryAccount; apiKey: string } {
  const argumentsWithAccount = argv.filter((argument) => argument.startsWith("--account="));
  if (argumentsWithAccount.length !== 1) {
    throw new Error("Exactly one explicit --account=small|main selection is required.");
  }
  const account = argumentsWithAccount[0].slice("--account=".length);
  if (account !== "small" && account !== "main") {
    throw new Error("Invalid Commas account selection. Use --account=small or --account=main.");
  }
  const environmentKey = account === "small" ? "COMMAS_API_KEY_SMALL_ACCOUNT" : "COMMAS_API_KEY_MAIN_ACCOUNT";
  const apiKey = String(environment[environmentKey] ?? "").trim();
  if (!apiKey) throw new Error(`The selected Commas ${account} account credential is not configured.`);
  return { account, apiKey };
}
