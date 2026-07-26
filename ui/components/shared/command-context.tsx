"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

export type ContextCommand = {
  id: string;
  group?: string;
  title: string;
  subtitle?: string | null;
  icon?: LucideIcon;
  run: () => void | Promise<void>;
};

type RegisteredCommand = ContextCommand & {
  scope_id: string;
};

type CommandContextValue = {
  commands: RegisteredCommand[];
  registerCommands: (scopeId: string, commands: ContextCommand[]) => () => void;
};

const CommandContext = React.createContext<CommandContextValue>({
  commands: [],
  registerCommands: () => () => undefined,
});

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [commands, setCommands] = React.useState<RegisteredCommand[]>([]);

  const registerCommands = React.useCallback((scopeId: string, nextCommands: ContextCommand[]) => {
    setCommands((current) => [
      ...current.filter((command) => command.scope_id !== scopeId),
      ...nextCommands.map((command) => ({ ...command, scope_id: scopeId })),
    ]);
    return () => {
      setCommands((current) => current.filter((command) => command.scope_id !== scopeId));
    };
  }, []);

  const value = React.useMemo(() => ({ commands, registerCommands }), [commands, registerCommands]);

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

export function useContextCommands(scopeId: string, commands: ContextCommand[]) {
  const { registerCommands } = React.useContext(CommandContext);
  React.useEffect(() => registerCommands(scopeId, commands), [commands, registerCommands, scopeId]);
}

export function useRegisteredCommands() {
  return React.useContext(CommandContext).commands;
}
