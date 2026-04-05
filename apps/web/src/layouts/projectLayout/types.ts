export type WorkbenchTab = "chat" | "terminal" | "files" | "git";
export type CommandGroup = "workbench" | "session" | "project";
export type CommandPaletteScope = "all" | "session";

export const MAX_PINNED_SESSION_COUNT = 6;
export const MAX_RECENT_COMMAND_COUNT = 16;
export const MAX_RECENT_COMMAND_GROUP_COUNT = 5;

export interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle: string;
  keywords: string;
  group: CommandGroup;
  sortAt?: number;
  sessionId?: string;
  execute(): void;
}

export interface CommandPaletteSection {
  id: string;
  title: string;
  items: CommandPaletteItem[];
}
