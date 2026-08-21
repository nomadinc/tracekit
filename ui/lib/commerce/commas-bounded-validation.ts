export const HARD_TRANSACTION_MAX = 10;

export type BoundedArgs = {
  transactionIds: string[];
  maxTransactions: number | null;
  preflight: boolean;
  confirmed: boolean;
};

export type RuntimeControls = {
  schedulerEnv: string | undefined;
  killSwitchEnv: string | undefined;
  productionControlState: string | null;
  scheduleEnabled: boolean | null;
  scheduleActivationState: string | null;
  connectionPaused: boolean;
  activationMode: string | null;
  activeRunCount: number;
};

export function parseBoundedArgs(argv: string[]): BoundedArgs {
  const transactionIds: string[] = [];
  let maxTransactions: number | null = null;
  let preflight = false;
  let confirmed = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--transaction-id") {
      const value = argv[++index]?.trim();
      if (!value) throw new Error("--transaction-id requires a value.");
      transactionIds.push(value);
    } else if (arg === "--max-transactions") {
      const value = argv[++index];
      if (!value || !/^\d+$/.test(value)) throw new Error("--max-transactions must be an integer.");
      maxTransactions = Number(value);
    } else if (arg === "--preflight") preflight = true;
    else if (arg === "--confirm-production-shadow-validation") confirmed = true;
    else if (arg === "--help") throw new Error("Usage: --transaction-id <id>... or --max-transactions <1..10> [--preflight] --confirm-production-shadow-validation");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const uniqueIds = Array.from(new Set(transactionIds));
  if (uniqueIds.length > HARD_TRANSACTION_MAX) throw new Error("At most 10 source transactions may be selected.");
  if (uniqueIds.length && maxTransactions !== null) throw new Error("Choose --transaction-id or --max-transactions, not both.");
  if (!uniqueIds.length && maxTransactions === null) throw new Error("An explicit transaction selection is required.");
  if (maxTransactions !== null && (maxTransactions < 1 || maxTransactions > HARD_TRANSACTION_MAX)) throw new Error("--max-transactions must be between 1 and 10.");
  return { transactionIds: uniqueIds, maxTransactions, preflight, confirmed };
}

export function assertRuntimeSafe(controls: RuntimeControls) {
  if (controls.schedulerEnv !== "false") throw new Error("TRACEKIT_COMMERCE_SCHEDULER_ENABLED must be exactly false.");
  if (controls.killSwitchEnv !== "disabled") throw new Error("TRACEKIT_COMMERCE_KILL_SWITCH must be exactly disabled.");
  if (controls.productionControlState === "enabled") throw new Error("Database commerce_scheduler control is enabled.");
  if (controls.scheduleEnabled === true || controls.scheduleActivationState === "enabled") throw new Error("Commerce schedule is enabled.");
  if (controls.connectionPaused) throw new Error("Commerce connection is paused; validation requires an explicitly usable connection.");
  if (controls.activeRunCount > 0) throw new Error("A concurrent Commas sync run is active.");
  if (controls.activationMode !== null && !["mock", "shadow"].includes(controls.activationMode)) throw new Error("Repository activation is live; bounded validation is not permitted.");
}

export function selectBoundedTransactions<T extends { id: string | number }>(items: T[], args: BoundedArgs): T[] {
  const selected = args.transactionIds.length
    ? args.transactionIds.map((id) => items.find((item) => String(item.id) === id)).filter((item): item is T => Boolean(item))
    : items.slice(0, args.maxTransactions ?? HARD_TRANSACTION_MAX);
  if (selected.length > HARD_TRANSACTION_MAX) throw new Error("Bounded selection exceeded the hard transaction maximum.");
  if (args.transactionIds.length && selected.length !== args.transactionIds.length) throw new Error("One or more requested transaction IDs were not found.");
  return selected;
}
