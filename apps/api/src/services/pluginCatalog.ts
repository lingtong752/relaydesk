import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { BUILTIN_PLUGIN_CATALOG, type PluginCatalogRecord } from "@shared";
import { z } from "zod";

const localPluginActionInputSchema = z.object({
  name: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  placeholder: z.string().trim().min(1).optional(),
  required: z.boolean().default(false),
  defaultValue: z.string().optional()
});

const localPluginActionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  command: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  inputs: z.array(localPluginActionInputSchema).default([]),
  permissions: z.array(z.enum(["read_project", "write_project"])).default(["read_project"]),
  timeoutMs: z.number().int().positive().max(60000).optional()
});

const localPluginManifestSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  version: z.string().trim().min(1).default("0.1.0"),
  description: z.string().trim().min(1),
  capabilities: z.array(z.string().trim().min(1)).default([]),
  tabTitle: z.string().trim().min(1),
  routeSegment: z.string().trim().min(1),
  frontendComponent: z.enum(["project_pulse", "delivery_radar"]),
  backendService: z.enum(["none", "context_snapshot"]).default("context_snapshot"),
  actions: z.array(localPluginActionSchema).default([])
});

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
    const plugin = await readLocalPluginManifest(manifestPath);
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

async function readLocalPluginManifest(
  manifestPath: string
): Promise<PluginCatalogRecord | null> {
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = localPluginManifestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }

    return {
      id: parsed.data.id,
      sourceType: "local",
      sourceRef: manifestPath,
      name: parsed.data.name,
      version: parsed.data.version,
      description: parsed.data.description,
      capabilities: parsed.data.capabilities,
      tabTitle: parsed.data.tabTitle,
      routeSegment: parsed.data.routeSegment,
      frontendComponent: parsed.data.frontendComponent,
      backendService: parsed.data.backendService,
      actions: parsed.data.actions
    };
  } catch {
    return null;
  }
}
