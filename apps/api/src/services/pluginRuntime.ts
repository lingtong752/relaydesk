import path from "node:path";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import type {
  PluginActionExecutionRecord,
  PluginActionInputRecord,
  PluginActionPermission,
  PluginActionRecord,
  PluginCatalogRecord,
  PluginInstallationRecord,
  PluginRpcExecutionRecord,
  PluginRpcMethodRecord
} from "@shared";
import { serializeAuditEvent } from "../db.js";
import { buildPluginHostContext, buildPluginTaskBoard } from "./pluginHostContext.js";

const execFileAsync = promisify(execFile);
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RPC_AUDIT_LIMIT = 10;
const MAX_FILE_PREVIEW_CHARS = 20_000;
const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "branch", "rev-parse"]);
const LEGACY_ALLOWED_COMMANDS = new Set(["pwd", "ls", "cat", "git"]);
const INPUT_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

interface ExecutePluginActionInput {
  projectRootPath: string;
  plugin: Pick<PluginCatalogRecord | PluginInstallationRecord, "id" | "name" | "actions">;
  actionId: string;
  rawInputs?: Record<string, string>;
}

interface ExecutePluginRpcInput {
  app: FastifyInstance;
  projectId: ObjectId;
  projectRootPath: string;
  plugin: Pick<PluginCatalogRecord | PluginInstallationRecord, "id" | "name" | "rpcMethods">;
  rpcMethodId: string;
  rawInputs?: Record<string, string>;
}

type ExecFileError = Error & {
  code?: number | string;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
};

export class PluginRuntimeError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PluginRuntimeError";
    this.statusCode = statusCode;
  }
}

export function findPluginAction(
  plugin: Pick<PluginCatalogRecord | PluginInstallationRecord, "actions">,
  actionId: string
): PluginActionRecord | null {
  return plugin.actions.find((action) => action.id === actionId) ?? null;
}

export function findPluginRpcMethod(
  plugin: Pick<PluginCatalogRecord | PluginInstallationRecord, "rpcMethods">,
  rpcMethodId: string
): PluginRpcMethodRecord | null {
  return plugin.rpcMethods.find((method) => method.id === rpcMethodId) ?? null;
}

export async function executePluginAction(
  input: ExecutePluginActionInput
): Promise<PluginActionExecutionRecord> {
  const action = findPluginAction(input.plugin, input.actionId);
  if (!action) {
    throw new PluginRuntimeError("Plugin action not found", 404);
  }

  validateActionCommand(action);
  const resolvedInputs = resolveActionInputs(action.inputs, input.rawInputs ?? {});
  const resolvedArgs = action.args.map((argument) => interpolateArgument(argument, resolvedInputs));
  const timeoutMs = Math.min(action.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const startedAt = Date.now();
  const executedAt = new Date();

  try {
    const result = await execFileAsync(action.command, resolvedArgs, {
      cwd: input.projectRootPath,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      encoding: "utf8"
    });

    return {
      pluginId: input.plugin.id,
      actionId: action.id,
      command: action.command,
      args: resolvedArgs,
      cwd: input.projectRootPath,
      stdout: result.stdout.trimEnd(),
      stderr: result.stderr.trimEnd(),
      exitCode: 0,
      success: true,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      executedAt: executedAt.toISOString()
    };
  } catch (error) {
    const executionError = error as ExecFileError;
    return {
      pluginId: input.plugin.id,
      actionId: action.id,
      command: action.command,
      args: resolvedArgs,
      cwd: input.projectRootPath,
      stdout: executionError.stdout?.trimEnd() ?? "",
      stderr: executionError.stderr?.trimEnd() ?? executionError.message,
      exitCode: typeof executionError.code === "number" ? executionError.code : null,
      success: false,
      timedOut: Boolean(executionError.killed && executionError.signal === "SIGTERM"),
      durationMs: Date.now() - startedAt,
      executedAt: executedAt.toISOString()
    };
  }
}

export async function executePluginRpc(
  input: ExecutePluginRpcInput
): Promise<PluginRpcExecutionRecord> {
  const method = findPluginRpcMethod(input.plugin, input.rpcMethodId);
  if (!method) {
    throw new PluginRuntimeError("Plugin RPC method not found", 404);
  }

  const resolvedInputs = resolveActionInputs(method.inputs, input.rawInputs ?? {});
  const startedAt = Date.now();
  const executedAt = new Date();

  try {
    const result = await executeRpcHandler({
      app: input.app,
      method,
      projectId: input.projectId,
      projectRootPath: input.projectRootPath,
      resolvedInputs
    });

    return {
      pluginId: input.plugin.id,
      rpcMethodId: method.id,
      handler: method.handler,
      success: true,
      durationMs: Date.now() - startedAt,
      executedAt: executedAt.toISOString(),
      result
    };
  } catch (error) {
    if (error instanceof PluginRuntimeError) {
      throw error;
    }

    return {
      pluginId: input.plugin.id,
      rpcMethodId: method.id,
      handler: method.handler,
      success: false,
      durationMs: Date.now() - startedAt,
      executedAt: executedAt.toISOString(),
      result: null,
      error: error instanceof Error ? error.message : "Plugin RPC execution failed"
    };
  }
}

function resolveActionInputs(
  inputs: PluginActionInputRecord[],
  rawInputs: Record<string, string>
): Record<string, string> {
  return inputs.reduce<Record<string, string>>((accumulator, input) => {
    const nextValue = rawInputs[input.name] ?? input.defaultValue ?? "";
    if (input.required && nextValue.trim().length === 0) {
      throw new PluginRuntimeError(`Missing required action input: ${input.label}`);
    }

    accumulator[input.name] = nextValue;
    return accumulator;
  }, {});
}

function interpolateArgument(argument: string, inputs: Record<string, string>): string {
  return argument.replace(INPUT_PLACEHOLDER_PATTERN, (_match, inputName: string) => {
    if (!(inputName in inputs)) {
      throw new PluginRuntimeError(`Unknown action input placeholder: ${inputName}`);
    }

    return inputs[inputName] ?? "";
  });
}

function validateActionCommand(action: PluginActionRecord): void {
  if (action.command === "git") {
    const gitSubcommand = action.args[0]?.trim();
    if (!gitSubcommand) {
      throw new PluginRuntimeError("Git action requires a subcommand.");
    }

    if (READ_ONLY_GIT_SUBCOMMANDS.has(gitSubcommand)) {
      return;
    }

    assertPermissions(action.permissions, ["manage_git", "write_project"]);
    return;
  }

  if (LEGACY_ALLOWED_COMMANDS.has(action.command)) {
    return;
  }

  assertPermissions(action.permissions, ["execute_command"]);
}

function assertPermissions(
  actualPermissions: PluginActionPermission[],
  requiredPermissions: PluginActionPermission[]
): void {
  for (const permission of requiredPermissions) {
    if (!actualPermissions.includes(permission)) {
      throw new PluginRuntimeError(`Plugin permission required: ${permission}`, 403);
    }
  }
}

async function executeRpcHandler(input: {
  app: FastifyInstance;
  method: PluginRpcMethodRecord;
  projectId: ObjectId;
  projectRootPath: string;
  resolvedInputs: Record<string, string>;
}): Promise<Record<string, unknown>> {
  const requiredPermissions = input.method.permissions;

  switch (input.method.handler) {
    case "get_context_snapshot":
      assertPermissions(requiredPermissions, ["read_host_context"]);
      return {
        context: await buildPluginHostContext(input.app, input.projectId)
      };

    case "list_recent_audit_events": {
      assertPermissions(requiredPermissions, ["read_audit"]);
      const requestedLimit = parsePositiveInt(input.resolvedInputs.limit, DEFAULT_RPC_AUDIT_LIMIT);
      const events = await input.app.db.collections.auditEvents
        .find({ projectId: input.projectId })
        .sort({ createdAt: -1 })
        .limit(Math.min(requestedLimit, 50))
        .toArray();
      return {
        events: events.map((event) => serializeAuditEvent(event))
      };
    }

    case "list_task_board":
      assertPermissions(requiredPermissions, ["read_project"]);
      return {
        board: await buildPluginTaskBoard(input.app, {
          projectId: input.projectId.toHexString(),
          projectRootPath: input.projectRootPath
        })
      };

    case "read_workspace_file": {
      assertPermissions(requiredPermissions, ["read_project"]);
      const relativePath = input.resolvedInputs.relativePath?.trim();
      if (!relativePath) {
        throw new PluginRuntimeError("read_workspace_file requires relativePath input.");
      }

      const absolutePath = path.resolve(input.projectRootPath, relativePath);
      const normalizedRootPath = path.resolve(input.projectRootPath);
      if (!absolutePath.startsWith(`${normalizedRootPath}${path.sep}`) && absolutePath !== normalizedRootPath) {
        throw new PluginRuntimeError("Requested file path is outside the project root.", 403);
      }

      const content = await readFile(absolutePath, "utf8");
      const truncated = content.length > MAX_FILE_PREVIEW_CHARS;
      return {
        path: absolutePath,
        truncated,
        content: truncated ? `${content.slice(0, MAX_FILE_PREVIEW_CHARS)}\n...[truncated]` : content
      };
    }

    default:
      throw new PluginRuntimeError(`Unsupported RPC handler: ${input.method.handler}`, 400);
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
