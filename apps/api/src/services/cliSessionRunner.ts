import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ProviderId } from "@shared";

export interface CliSessionResumeRequest {
  provider: ProviderId;
  cwd: string;
  externalSessionId: string;
  prompt: string;
  signal?: AbortSignal;
}

export interface CliSessionResumeResult {
  text: string;
  externalSessionId?: string;
}

export interface CliSessionRunner {
  supportsImportedSession(provider: ProviderId): boolean;
  resumeSession(input: CliSessionResumeRequest): Promise<CliSessionResumeResult>;
}

export class CliSessionRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliSessionRunnerError";
  }
}

function createAbortError(): Error {
  const error = new Error("The CLI session was aborted.");
  error.name = "AbortError";
  return error;
}

async function runCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let abortTimer: NodeJS.Timeout | null = null;

    function cleanup(): void {
      if (abortTimer) {
        clearTimeout(abortTimer);
        abortTimer = null;
      }
      input.signal?.removeEventListener("abort", handleAbort);
    }

    function handleAbort(): void {
      child.kill("SIGTERM");
      abortTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 1000);
    }

    if (input.signal?.aborted) {
      handleAbort();
    } else if (input.signal) {
      input.signal.addEventListener("abort", handleAbort, { once: true });
    }

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      cleanup();
      reject(error);
    });

    child.on("close", (code) => {
      cleanup();

      if (input.signal?.aborted) {
        reject(createAbortError());
        return;
      }

      if (code !== 0) {
        reject(
          new CliSessionRunnerError(
            stderr.trim() || stdout.trim() || `${input.command} exited with code ${code}`
          )
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function parseClaudeResult(stdout: string, externalSessionId: string): CliSessionResumeResult {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as {
        type?: string;
        result?: string;
        session_id?: string;
      };

      if (parsed.type === "result" && typeof parsed.result === "string") {
        return {
          text: parsed.result.trim(),
          externalSessionId:
            typeof parsed.session_id === "string" && parsed.session_id.trim()
              ? parsed.session_id.trim()
              : externalSessionId
        };
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new CliSessionRunnerError("Claude CLI returned an empty response.");
  }

  return {
    text: trimmed,
    externalSessionId
  };
}

function parseCodexJsonResult(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as {
        type?: string;
        text?: string;
        delta?: string;
        message?: string;
      };

      if (parsed.type === "agent_message" && typeof parsed.text === "string" && parsed.text.trim()) {
        return parsed.text.trim();
      }

      if (parsed.type === "message" && typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return "";
}

function parseGeminiResult(
  stdout: string,
  externalSessionId: string
): CliSessionResumeResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new CliSessionRunnerError("Gemini CLI returned an empty response.");
  }

  const candidates = [trimmed, ...trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse()];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        response?: string;
        sessionId?: string;
        session_id?: string;
      };

      if (typeof parsed.response === "string" && parsed.response.trim()) {
        return {
          text: parsed.response.trim(),
          externalSessionId:
            typeof parsed.sessionId === "string" && parsed.sessionId.trim()
              ? parsed.sessionId.trim()
              : typeof parsed.session_id === "string" && parsed.session_id.trim()
                ? parsed.session_id.trim()
                : externalSessionId
        };
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return {
    text: trimmed,
    externalSessionId
  };
}

export class LocalCliSessionRunner implements CliSessionRunner {
  supportsImportedSession(provider: ProviderId): boolean {
    return provider === "claude" || provider === "codex" || provider === "gemini";
  }

  async resumeSession(input: CliSessionResumeRequest): Promise<CliSessionResumeResult> {
    if (!this.supportsImportedSession(input.provider)) {
      throw new CliSessionRunnerError(`Imported ${input.provider} sessions are not supported yet.`);
    }

    if (input.provider === "claude") {
      return this.resumeClaudeSession(input);
    }

    if (input.provider === "codex") {
      return this.resumeCodexSession(input);
    }

    return this.resumeGeminiSession(input);
  }

  private async resumeClaudeSession(
    input: CliSessionResumeRequest
  ): Promise<CliSessionResumeResult> {
    const { stdout } = await runCommand({
      command: "claude",
      args: [
        "-p",
        "--output-format",
        "json",
        "--resume",
        input.externalSessionId,
        input.prompt
      ],
      cwd: input.cwd,
      signal: input.signal
    });

    return parseClaudeResult(stdout, input.externalSessionId);
  }

  private async resumeCodexSession(
    input: CliSessionResumeRequest
  ): Promise<CliSessionResumeResult> {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "relaydesk-codex-resume-"));
    const outputFile = path.join(tempDirectory, "last-message.txt");

    try {
      const { stdout } = await runCommand({
        command: "codex",
        args: [
          "exec",
          "resume",
          input.externalSessionId,
          input.prompt,
          "--json",
          "-o",
          outputFile
        ],
        cwd: input.cwd,
        signal: input.signal
      });

      const outputText = (await readFile(outputFile, "utf8").catch(() => "")).trim();
      const fallbackText = parseCodexJsonResult(stdout);
      const text = outputText || fallbackText;

      if (!text) {
        throw new CliSessionRunnerError("Codex CLI returned an empty response.");
      }

      return {
        text,
        externalSessionId: input.externalSessionId
      };
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  private async resumeGeminiSession(
    input: CliSessionResumeRequest
  ): Promise<CliSessionResumeResult> {
    const { stdout } = await runCommand({
      command: "gemini",
      args: [
        "--resume",
        "--prompt",
        input.prompt,
        "--output-format",
        "json"
      ],
      cwd: input.cwd,
      signal: input.signal
    });

    return parseGeminiResult(stdout, input.externalSessionId);
  }
}
