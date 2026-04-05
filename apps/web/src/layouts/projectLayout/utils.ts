import type { SessionRecord } from "@shared";
import type { RealtimeConnectionState } from "../../lib/ws";
import type { CommandGroup } from "./types";

export function getConnectionStatusLabel(state: RealtimeConnectionState): string {
  if (state === "connected") {
    return "实时连接正常";
  }

  if (state === "reconnecting") {
    return "正在恢复实时连接";
  }

  if (state === "connecting") {
    return "正在建立实时连接";
  }

  return "实时连接已断开";
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

export function getSessionActivityAt(session: SessionRecord): number {
  const timestamp = Date.parse(session.lastMessageAt ?? session.updatedAt ?? session.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getGroupLabel(group: CommandGroup): string {
  if (group === "workbench") {
    return "工作台";
  }

  if (group === "session") {
    return "会话";
  }

  return "项目";
}

export function getStorageKey(projectId: string, field: "pinnedSessions" | "recentCommands"): string {
  return `relaydesk.workspace.${projectId}.commandPalette.${field}`;
}

export function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function persistIds(key: string, ids: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // localStorage may be unavailable in private mode or restricted environments.
  }
}
