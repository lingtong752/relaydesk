import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import {
  BUILTIN_PLUGIN_CATALOG,
  type PluginCatalogRecord,
  type PluginInstallationRecord,
  type PluginFrontendRecord,
  type PluginFrontendRenderMode,
  type PluginSourceType
} from "@shared";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const GIT_CACHE_DIRECTORY = path.join(".relaydesk", "plugin-sources", "git");
const MANIFEST_FILE_NAMES = ["relaydesk.plugin.json", "plugin.json"];

const localPluginActionInputSchema = z.object({
  name: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  placeholder: z.string().trim().min(1).optional(),
  required: z.boolean().default(false),
  defaultValue: z.string().optional()
});

const pluginPermissionSchema = z.enum([
  "read_project",
  "write_project",
  "execute_command",
  "read_host_context",
  "read_audit",
  "manage_git"
]);

const localPluginActionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  command: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  inputs: z.array(localPluginActionInputSchema).default([]),
  permissions: z.array(pluginPermissionSchema).default(["read_project"]),
  timeoutMs: z.number().int().positive().max(60000).optional()
});

const localPluginRpcMethodSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  handler: z.enum([
    "get_context_snapshot",
    "list_recent_audit_events",
    "list_task_board",
    "read_workspace_file"
  ]),
  inputs: z.array(localPluginActionInputSchema).default([]),
  permissions: z.array(pluginPermissionSchema).default(["read_host_context"])
});

const localPluginManifestSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  version: z.string().trim().min(1).default("0.1.0"),
  description: z.string().trim().min(1),
  capabilities: z.array(z.string().trim().min(1)).default([]),
  tabTitle: z.string().trim().min(1),
  routeSegment: z.string().trim().min(1),
  frontend: z
    .object({
      type: z.enum(["builtin", "local_bundle", "git_bundle"]).default("builtin"),
      apiVersion: z.string().trim().min(1).default("1.0"),
      displayName: z.string().trim().min(1).optional(),
      builtinComponent: z.enum(["project_pulse", "delivery_radar"]).optional(),
      entry: z.string().trim().min(1).nullable().optional()
    })
    .optional(),
  frontendComponent: z.enum(["project_pulse", "delivery_radar"]).optional(),
  backendService: z.enum(["none", "context_snapshot", "rpc_bridge"]).default("context_snapshot"),
  actions: z.array(localPluginActionSchema).default([]),
  rpcMethods: z.array(localPluginRpcMethodSchema).default([])
}).superRefine((value, context) => {
  if (!value.frontend && !value.frontendComponent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "frontend or frontendComponent is required"
    });
    return;
  }

  if (value.frontend?.type === "builtin" && !value.frontend.builtinComponent && !value.frontendComponent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["frontend", "builtinComponent"],
      message: "builtin frontend requires builtinComponent"
    });
  }

  if (value.frontend && value.frontend.type !== "builtin" && !value.frontend.entry) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["frontend", "entry"],
      message: "bundle frontend requires entry"
    });
  }
});

export interface PluginInstallSourceInput {
  pluginId?: string;
  sourceType?: Extract<PluginSourceType, "local" | "git">;
  sourceRef?: string;
  sourceVersion?: string | null;
}

function normalizePluginFrontend(input: {
  frontend?: {
    type: PluginFrontendRenderMode;
    apiVersion: string;
    displayName?: string;
    builtinComponent?: PluginCatalogRecord["frontendComponent"];
    entry?: string | null;
  };
  frontendComponent?: PluginCatalogRecord["frontendComponent"];
  sourceType: PluginSourceType;
  pluginName: string;
}): PluginFrontendRecord {
  if (input.frontend) {
    const type =
      input.frontend.type === "builtin"
        ? "builtin"
        : input.frontend.type === "git_bundle" || input.sourceType === "git"
          ? "git_bundle"
          : "local_bundle";

    return {
      type,
      apiVersion: input.frontend.apiVersion,
      displayName: input.frontend.displayName ?? input.pluginName,
      builtinComponent:
        type === "builtin"
          ? input.frontend.builtinComponent ?? input.frontendComponent ?? "project_pulse"
          : undefined,
      entry: input.frontend.entry ?? null
    };
  }

  return {
    type: "builtin",
    apiVersion: "1.0",
    displayName: input.pluginName,
    builtinComponent: input.frontendComponent ?? "project_pulse",
    entry: null
  };
}

export async function listProjectPluginCatalog(projectRootPath: string): Promise<PluginCatalogRecord[]> {
  const catalog = [...BUILTIN_PLUGIN_CATALOG];
  const seenPluginIds = new Set(catalog.map((plugin) => plugin.id));
  const pluginsDirectoryPath = path.join(projectRootPath, ".relaydesk", "plugins");

  const manifestFiles = await readdir(pluginsDirectoryPath, { withFileTypes: true }).catch(() => []);
  for (const manifestFile of manifestFiles) {
    if (!manifestFile.isFile() || !manifestFile.name.endsWith(".json")) {
      continue;
    }

    const manifestPath = path.join(pluginsDirectoryPath, manifestFile.name);
    const plugin = await readLocalPluginManifest({
      manifestPath,
      sourceType: "local",
      sourceRef: manifestPath,
      sourceVersion: null
    });
    if (!plugin || seenPluginIds.has(plugin.id)) {
      continue;
    }

    catalog.push(plugin);
    seenPluginIds.add(plugin.id);
  }

  return catalog;
}

export async function findProjectPlugin(
  projectRootPath: string,
  pluginId: string
): Promise<PluginCatalogRecord | null> {
  const catalog = await listProjectPluginCatalog(projectRootPath);
  return catalog.find((plugin) => plugin.id === pluginId) ?? null;
}

export async function resolveInstallablePlugin(
  projectRootPath: string,
  input: PluginInstallSourceInput
): Promise<PluginCatalogRecord | null> {
  if (input.pluginId) {
    return findProjectPlugin(projectRootPath, input.pluginId);
  }

  if (input.sourceType === "local" && input.sourceRef) {
    return resolveLocalPluginSource(input.sourceRef);
  }

  if (input.sourceType === "git" && input.sourceRef) {
    return resolveGitPluginSource(projectRootPath, input.sourceRef, input.sourceVersion ?? null);
  }

  return null;
}

async function resolveLocalPluginSource(sourceRef: string): Promise<PluginCatalogRecord | null> {
  const manifestPath = await resolvePluginManifestPath(sourceRef);
  if (!manifestPath) {
    return null;
  }

  return readLocalPluginManifest({
    manifestPath,
    sourceType: "local",
    sourceRef: manifestPath,
    sourceVersion: null
  });
}

async function resolveGitPluginSource(
  projectRootPath: string,
  sourceRef: string,
  sourceVersion: string | null
): Promise<PluginCatalogRecord | null> {
  const cloneDirectory = await ensureGitPluginClone(projectRootPath, sourceRef, sourceVersion, true);
  if (!cloneDirectory) {
    return null;
  }

  const manifestPath = await resolvePluginManifestPath(cloneDirectory);
  if (!manifestPath) {
    return null;
  }

  return readLocalPluginManifest({
    manifestPath,
    sourceType: "git",
    sourceRef,
    sourceVersion
  });
}

async function ensureGitPluginClone(
  projectRootPath: string,
  sourceRef: string,
  sourceVersion: string | null,
  refresh: boolean
): Promise<string | null> {
  const cloneDirectory = path.join(
    projectRootPath,
    GIT_CACHE_DIRECTORY,
    createHash("sha1").update(`${sourceRef}::${sourceVersion ?? "HEAD"}`).digest("hex")
  );

  if (refresh) {
    await rm(cloneDirectory, { recursive: true, force: true }).catch(() => undefined);
  }

  const cloneExists = await readdir(cloneDirectory).catch(() => null);
  if (!cloneExists) {
    await mkdir(path.dirname(cloneDirectory), { recursive: true });
    await execFileAsync("git", ["clone", "--depth", "1", sourceRef, cloneDirectory], {
      cwd: projectRootPath,
      encoding: "utf8"
    }).catch(() => null);
  }

  const cloneReady = await readdir(cloneDirectory).catch(() => null);
  if (!cloneReady) {
    return null;
  }

  if (sourceVersion) {
    await execFileAsync("git", ["checkout", sourceVersion], {
      cwd: cloneDirectory,
      encoding: "utf8"
    }).catch(() => null);
  }

  return cloneDirectory;
}

export async function resolveInstalledPluginFrontendModule(input: {
  projectRootPath: string;
  installation: Pick<PluginInstallationRecord, "sourceType" | "sourceRef" | "sourceVersion" | "frontend">;
}): Promise<{ entryPath: string; code: string } | null> {
  if (input.installation.frontend.type === "builtin" || !input.installation.frontend.entry) {
    return null;
  }

  let manifestPath: string | null = null;

  if (input.installation.sourceType === "local" && input.installation.sourceRef) {
    manifestPath = await resolvePluginManifestPath(input.installation.sourceRef);
  } else if (input.installation.sourceType === "git" && input.installation.sourceRef) {
    const cloneDirectory = await ensureGitPluginClone(
      input.projectRootPath,
      input.installation.sourceRef,
      input.installation.sourceVersion ?? null,
      false
    );
    manifestPath = cloneDirectory ? await resolvePluginManifestPath(cloneDirectory) : null;
  }

  if (!manifestPath) {
    return null;
  }

  const pluginRootPath = path.dirname(manifestPath);
  const entryPath = path.isAbsolute(input.installation.frontend.entry)
    ? path.resolve(input.installation.frontend.entry)
    : path.resolve(pluginRootPath, input.installation.frontend.entry);
  const relativeEntryPath = path.relative(pluginRootPath, entryPath);
  if (
    relativeEntryPath.startsWith("..") ||
    path.isAbsolute(relativeEntryPath) ||
    relativeEntryPath === ""
  ) {
    return null;
  }

  try {
    const code = await readFile(entryPath, "utf8");
    if (!code.trim()) {
      return null;
    }

    return {
      entryPath,
      code
    };
  } catch {
    return null;
  }
}

async function resolvePluginManifestPath(sourceRef: string): Promise<string | null> {
  const normalizedPath = path.resolve(sourceRef);

  const fileCandidates = [normalizedPath];
  for (const manifestFileName of MANIFEST_FILE_NAMES) {
    fileCandidates.push(path.join(normalizedPath, manifestFileName));
  }
  fileCandidates.push(path.join(normalizedPath, ".relaydesk", "plugin.json"));

  for (const candidate of fileCandidates) {
    if (!candidate.endsWith(".json")) {
      continue;
    }

    try {
      const raw = await readFile(candidate, "utf8");
      if (raw.trim().length > 0) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  const nestedPluginsDirectory = path.join(normalizedPath, ".relaydesk", "plugins");
  const nestedFiles = await readdir(nestedPluginsDirectory, { withFileTypes: true }).catch(() => []);
  const manifestFile = nestedFiles.find((entry) => entry.isFile() && entry.name.endsWith(".json"));
  return manifestFile ? path.join(nestedPluginsDirectory, manifestFile.name) : null;
}

async function readLocalPluginManifest(input: {
  manifestPath: string;
  sourceType: PluginSourceType;
  sourceRef: string;
  sourceVersion: string | null;
}): Promise<PluginCatalogRecord | null> {
  try {
    const raw = await readFile(input.manifestPath, "utf8");
    const parsed = localPluginManifestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }

    return {
      id: parsed.data.id,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      sourceVersion: input.sourceVersion,
      name: parsed.data.name,
      version: parsed.data.version,
      description: parsed.data.description,
      capabilities: parsed.data.capabilities,
      tabTitle: parsed.data.tabTitle,
      routeSegment: parsed.data.routeSegment,
      frontend: normalizePluginFrontend({
        frontend: parsed.data.frontend,
        frontendComponent: parsed.data.frontendComponent,
        sourceType: input.sourceType,
        pluginName: parsed.data.name
      }),
      frontendComponent:
        parsed.data.frontend?.builtinComponent ?? parsed.data.frontendComponent ?? "project_pulse",
      backendService:
        parsed.data.rpcMethods.length > 0 && parsed.data.backendService === "none"
          ? "rpc_bridge"
          : parsed.data.backendService,
      actions: parsed.data.actions,
      rpcMethods: parsed.data.rpcMethods
    };
  } catch {
    return null;
  }
}
