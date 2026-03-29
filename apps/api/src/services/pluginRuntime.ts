import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  PluginActionExecutionRecord,
  PluginActionRecord,
  PluginCatalogRecord,
  PluginInstallationRecord
} from "@shared";

const execFileAsync = promisify(execFile);
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "branch", "rev-parse"]);
const ALLOWED_COMMANDS = new Set(["pwd", "ls", "cat", "git"]);
const INPUT_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

interface ExecutePluginActionInput {
  projectRootPath: string;
  plugin: Pick<PluginCatalogRecord | PluginInstallationRecord, "id" | "name" | "actions">;
  actionId: string;
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

export async function executePluginAction(
  input: ExecutePluginActionInput
): Promise<PluginActionExecutionRecord> {
  const action = findPluginAction(input.plugin, input.actionId);
  if (!action) {
    throw new PluginRuntimeError("Plugin action not found", 404);
  }

  validateActionCommand(action);
  const resolvedInputs = resolveActionInputs(action, input.rawInputs ?? {});
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

function resolveActionInputs(
  action: PluginActionRecord,
  rawInputs: Record<string, string>
): Record<string, string> {
  return action.inputs.reduce<Record<string, string>>((accumulator, input) => {
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
  if (!ALLOWED_COMMANDS.has(action.command)) {
    throw new PluginRuntimeError(
      `Unsupported plugin command: ${action.command}. 当前仅允许 ${[...ALLOWED_COMMANDS].join(", ")}。`
    );
  }

  if (action.command === "git") {
    const gitSubcommand = action.args[0]?.trim();
    if (!gitSubcommand || !READ_ONLY_GIT_SUBCOMMANDS.has(gitSubcommand)) {
      throw new PluginRuntimeError(
        `Unsupported git action: ${gitSubcommand ?? "(missing)"}. 当前仅允许 ${[
          ...READ_ONLY_GIT_SUBCOMMANDS
        ].join(", ")}。`
      );
    }
  }
}
