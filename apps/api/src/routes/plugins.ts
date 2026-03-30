import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { RELAYDESK_PLUGIN_HOST_API_VERSION } from "@shared";
import type {
  PluginActionPermission,
  PluginActionRecord,
  PluginCatalogRecord,
  PluginFrontendModuleRecord,
  PluginInstallationRecord,
  PluginPreviewDiffRecord,
  PluginRpcMethodRecord
} from "@shared";
import { getAuthUser } from "../auth.js";
import {
  parseObjectId,
  serializePluginExecutionHistory,
  serializePluginInstallation
} from "../db.js";
import {
  listProjectPluginCatalog,
  resolveInstalledPluginFrontendModule,
  resolveInstallablePlugin
} from "../services/pluginCatalog.js";
import { buildPluginHostContext } from "../services/pluginHostContext.js";
import { resolveProjectRootPath } from "../services/projectRoot.js";
import {
  executePluginAction,
  executePluginRpc,
  PluginRuntimeError
} from "../services/pluginRuntime.js";

const installPluginSchema = z
  .object({
    pluginId: z.string().trim().min(1).optional(),
    sourceType: z.enum(["local", "git"]).optional(),
    sourceRef: z.string().trim().min(1).optional(),
    sourceVersion: z.string().trim().min(1).nullable().optional()
  })
  .refine((value) => Boolean(value.pluginId || (value.sourceType && value.sourceRef)), {
    message: "pluginId or sourceType/sourceRef is required"
  });

const updatePluginStateSchema = z.object({
  enabled: z.boolean()
});

const executePluginActionSchema = z.object({
  inputs: z.record(z.string(), z.string().max(4000)).default({})
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

function sortValues<T extends string>(values: T[]): T[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function formatPluginEntryLabel(item: { id: string; label: string }): string {
  return item.label === item.id ? item.id : `${item.label} (${item.id})`;
}

function getPluginPermissions(
  plugin: Pick<PluginCatalogRecord | PluginInstallationRecord, "actions" | "rpcMethods">
): PluginActionPermission[] {
  const permissions = new Set<PluginActionPermission>();

  for (const action of plugin.actions) {
    for (const permission of action.permissions) {
      permissions.add(permission);
    }
  }

  for (const rpcMethod of plugin.rpcMethods) {
    for (const permission of rpcMethod.permissions) {
      permissions.add(permission);
    }
  }

  return sortValues(Array.from(permissions));
}

function buildActionSignature(action: PluginActionRecord): string {
  return JSON.stringify({
    label: action.label,
    description: action.description,
    command: action.command,
    args: action.args,
    inputs: action.inputs,
    permissions: sortValues(action.permissions),
    timeoutMs: action.timeoutMs ?? null
  });
}

function buildRpcSignature(method: PluginRpcMethodRecord): string {
  return JSON.stringify({
    label: method.label,
    description: method.description,
    handler: method.handler,
    inputs: method.inputs,
    permissions: sortValues(method.permissions)
  });
}

function buildPluginPreviewDiff(
  installation: PluginInstallationRecord,
  plugin: PluginCatalogRecord
): PluginPreviewDiffRecord {
  const changedFields: PluginPreviewDiffRecord["changedFields"] = [];

  if (installation.name !== plugin.name) {
    changedFields.push("name");
  }
  if (installation.version !== plugin.version) {
    changedFields.push("version");
  }
  if (installation.description !== plugin.description) {
    changedFields.push("description");
  }
  if (installation.tabTitle !== plugin.tabTitle) {
    changedFields.push("tabTitle");
  }
  if (installation.routeSegment !== plugin.routeSegment) {
    changedFields.push("routeSegment");
  }
  if (JSON.stringify(installation.frontend) !== JSON.stringify(plugin.frontend)) {
    changedFields.push("frontendComponent");
  }
  if (installation.frontendComponent !== plugin.frontendComponent) {
    if (!changedFields.includes("frontendComponent")) {
      changedFields.push("frontendComponent");
    }
  }
  if (installation.backendService !== plugin.backendService) {
    changedFields.push("backendService");
  }
  if (installation.sourceType !== plugin.sourceType) {
    changedFields.push("sourceType");
  }
  if ((installation.sourceRef ?? null) !== (plugin.sourceRef ?? null)) {
    changedFields.push("sourceRef");
  }
  if ((installation.sourceVersion ?? null) !== (plugin.sourceVersion ?? null)) {
    changedFields.push("sourceVersion");
  }

  const installationCapabilities = new Set(installation.capabilities);
  const previewCapabilities = new Set(plugin.capabilities);
  const addedCapabilities = sortValues(
    plugin.capabilities.filter((capability) => !installationCapabilities.has(capability))
  );
  const removedCapabilities = sortValues(
    installation.capabilities.filter((capability) => !previewCapabilities.has(capability))
  );

  const installationPermissions = new Set(getPluginPermissions(installation));
  const previewPermissions = new Set(getPluginPermissions(plugin));
  const addedPermissions = sortValues(
    getPluginPermissions(plugin).filter((permission) => !installationPermissions.has(permission))
  );
  const removedPermissions = sortValues(
    getPluginPermissions(installation).filter((permission) => !previewPermissions.has(permission))
  );

  const installationActions = new Map(
    installation.actions.map((action) => [action.id, buildActionSignature(action)])
  );
  const previewActions = new Map(plugin.actions.map((action) => [action.id, buildActionSignature(action)]));
  const addedActions = sortValues(
    plugin.actions
      .filter((action) => !installationActions.has(action.id))
      .map((action) => formatPluginEntryLabel(action))
  );
  const removedActions = sortValues(
    installation.actions
      .filter((action) => !previewActions.has(action.id))
      .map((action) => formatPluginEntryLabel(action))
  );
  const changedActions = sortValues(
    plugin.actions
      .filter((action) => installationActions.has(action.id))
      .filter((action) => installationActions.get(action.id) !== buildActionSignature(action))
      .map((action) => formatPluginEntryLabel(action))
  );

  const installationRpcMethods = new Map(
    installation.rpcMethods.map((method) => [method.id, buildRpcSignature(method)])
  );
  const previewRpcMethods = new Map(
    plugin.rpcMethods.map((method) => [method.id, buildRpcSignature(method)])
  );
  const addedRpcMethods = sortValues(
    plugin.rpcMethods
      .filter((method) => !installationRpcMethods.has(method.id))
      .map((method) => formatPluginEntryLabel(method))
  );
  const removedRpcMethods = sortValues(
    installation.rpcMethods
      .filter((method) => !previewRpcMethods.has(method.id))
      .map((method) => formatPluginEntryLabel(method))
  );
  const changedRpcMethods = sortValues(
    plugin.rpcMethods
      .filter((method) => installationRpcMethods.has(method.id))
      .filter((method) => installationRpcMethods.get(method.id) !== buildRpcSignature(method))
      .map((method) => formatPluginEntryLabel(method))
  );

  const hasChanges =
    changedFields.length > 0 ||
    addedCapabilities.length > 0 ||
    removedCapabilities.length > 0 ||
    addedPermissions.length > 0 ||
    removedPermissions.length > 0 ||
    addedActions.length > 0 ||
    removedActions.length > 0 ||
    changedActions.length > 0 ||
    addedRpcMethods.length > 0 ||
    removedRpcMethods.length > 0 ||
    changedRpcMethods.length > 0;

  return {
    hasChanges,
    changedFields,
    addedCapabilities,
    removedCapabilities,
    addedPermissions,
    removedPermissions,
    addedActions,
    removedActions,
    changedActions,
    addedRpcMethods,
    removedRpcMethods,
    changedRpcMethods
  };
}

async function getOwnedProject(
  app: FastifyInstance,
  ownerId: ObjectId,
  projectId: string
) {
  const parsedProjectId = parseObjectId(projectId);
  if (!parsedProjectId) {
    return {
      project: null,
      parsedProjectId: null
    };
  }

  const project = await app.db.collections.projects.findOne({
    _id: parsedProjectId,
    ownerId
  });

  return {
    project,
    parsedProjectId
  };
}

async function recordPluginAuditEvent(
  app: FastifyInstance,
  input: {
    projectId: ObjectId;
    pluginId: string;
    eventType:
      | "plugin.installed"
      | "plugin.upgraded"
      | "plugin.uninstalled"
      | "plugin.action.executed"
      | "plugin.rpc.executed";
    summary: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await app.db.collections.auditEvents.insertOne({
    _id: new ObjectId(),
    projectId: input.projectId,
    eventType: input.eventType,
    actorType: "user",
    summary: input.summary,
    payload: {
      pluginId: input.pluginId,
      ...input.payload
    },
    createdAt: new Date()
  });
}

async function recordPluginExecutionHistory(
  app: FastifyInstance,
  input: {
    projectId: ObjectId;
    pluginId: string;
    executionKind: "action" | "rpc";
    title: string;
    summary: string;
    success: boolean;
    durationMs: number;
    executedAt: string;
    actionId?: string;
    rpcMethodId?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await app.db.collections.pluginExecutionHistory.insertOne({
    _id: new ObjectId(),
    projectId: input.projectId,
    pluginId: input.pluginId,
    executionKind: input.executionKind,
    title: input.title,
    summary: input.summary,
    success: input.success,
    durationMs: input.durationMs,
    executedAt: new Date(input.executedAt),
    actionId: input.actionId,
    rpcMethodId: input.rpcMethodId,
    details: input.details
  });
}

async function upsertPluginInstallation(
  app: FastifyInstance,
  input: {
    projectId: ObjectId;
    plugin: Awaited<ReturnType<typeof resolveInstallablePlugin>>;
  }
) {
  const plugin = input.plugin;
  if (!plugin) {
    throw new Error("Plugin not found");
  }

  const now = new Date();
  const existing = await app.db.collections.pluginInstallations.findOne({
    projectId: input.projectId,
    pluginId: plugin.id
  });

  if (existing) {
    await app.db.collections.pluginInstallations.updateOne(
      { _id: existing._id },
      {
        $set: {
          sourceType: plugin.sourceType,
          sourceRef: plugin.sourceRef ?? null,
          sourceVersion: plugin.sourceVersion ?? null,
          name: plugin.name,
          version: plugin.version,
          description: plugin.description,
          capabilities: plugin.capabilities,
          tabTitle: plugin.tabTitle,
          routeSegment: plugin.routeSegment,
          frontend: plugin.frontend,
          frontendComponent: plugin.frontendComponent,
          backendService: plugin.backendService,
          actions: plugin.actions,
          rpcMethods: plugin.rpcMethods,
          enabled: true,
          updatedAt: now
        }
      }
    );

    const refreshed = await app.db.collections.pluginInstallations.findOne({ _id: existing._id });
    return serializePluginInstallation(refreshed ?? existing);
  }

  const result = await app.db.collections.pluginInstallations.insertOne({
    projectId: input.projectId,
    pluginId: plugin.id,
    sourceType: plugin.sourceType,
    sourceRef: plugin.sourceRef ?? null,
    sourceVersion: plugin.sourceVersion ?? null,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    capabilities: plugin.capabilities,
    tabTitle: plugin.tabTitle,
    routeSegment: plugin.routeSegment,
    frontend: plugin.frontend,
    frontendComponent: plugin.frontendComponent,
    backendService: plugin.backendService,
    actions: plugin.actions,
    rpcMethods: plugin.rpcMethods,
    enabled: true,
    createdAt: now,
    updatedAt: now
  });
  const installation = await app.db.collections.pluginInstallations.findOne({
    _id: result.insertedId
  });

  return serializePluginInstallation(installation!);
}

export async function registerPluginRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/projects/:projectId/plugins/catalog",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      return {
        plugins: await listProjectPluginCatalog(project.rootPath)
      };
    }
  );

  app.get(
    "/api/projects/:projectId/plugins",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installations = await app.db.collections.pluginInstallations
        .find({ projectId: parsedProjectId })
        .sort({ updatedAt: -1 })
        .toArray();

      return {
        installations: installations.map(serializePluginInstallation)
      };
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/preview",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const parsedBody = installPluginSchema.safeParse(request.body);
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const plugin = await resolveInstallablePlugin(project.rootPath, parsedBody.data);
      if (!plugin) {
        return reply.code(404).send({ message: "Plugin not found or manifest could not be parsed" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId: plugin.id
      });

      return {
        plugin,
        alreadyInstalled: Boolean(installation),
        installation: installation ? serializePluginInstallation(installation) : null,
        diff: installation ? buildPluginPreviewDiff(serializePluginInstallation(installation), plugin) : null
      };
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/install",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const parsedBody = installPluginSchema.safeParse(request.body);
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const plugin = await resolveInstallablePlugin(project.rootPath, parsedBody.data);
      if (!plugin) {
        return reply.code(404).send({ message: "Plugin not found or manifest could not be parsed" });
      }

      const installation = await upsertPluginInstallation(app, {
        projectId: parsedProjectId,
        plugin
      });
      await recordPluginAuditEvent(app, {
        projectId: parsedProjectId,
        pluginId: installation.id,
        eventType: "plugin.installed",
        summary: `${installation.name} 已安装到当前项目。`,
        payload: {
          sourceType: installation.sourceType,
          sourceRef: installation.sourceRef ?? null,
          sourceVersion: installation.sourceVersion ?? null,
          version: installation.version
        }
      });

      return {
        installation
      };
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/:pluginId/upgrade",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const { projectId, pluginId } = request.params as { projectId: string; pluginId: string };
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      const refreshedPlugin = await resolveInstallablePlugin(project.rootPath, {
        pluginId: installation.sourceType === "builtin" ? pluginId : undefined,
        sourceType:
          installation.sourceType === "local" || installation.sourceType === "git"
            ? installation.sourceType
            : undefined,
        sourceRef: installation.sourceRef ?? undefined,
        sourceVersion: installation.sourceVersion ?? undefined
      });
      if (!refreshedPlugin) {
        return reply.code(404).send({ message: "Plugin source could not be refreshed" });
      }

      const refreshedInstallation = await upsertPluginInstallation(app, {
        projectId: parsedProjectId,
        plugin: refreshedPlugin
      });
      await recordPluginAuditEvent(app, {
        projectId: parsedProjectId,
        pluginId,
        eventType: "plugin.upgraded",
        summary: `${refreshedInstallation.name} 已刷新到最新插件定义。`,
        payload: {
          sourceType: refreshedInstallation.sourceType,
          sourceRef: refreshedInstallation.sourceRef ?? null,
          sourceVersion: refreshedInstallation.sourceVersion ?? null,
          previousVersion: installation.version,
          version: refreshedInstallation.version
        }
      });

      return {
        installation: refreshedInstallation
      };
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/:pluginId/uninstall",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const { projectId, pluginId } = request.params as { projectId: string; pluginId: string };
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      const historyCount = await app.db.collections.pluginExecutionHistory.countDocuments({
        projectId: parsedProjectId,
        pluginId
      });
      await app.db.collections.pluginInstallations.deleteOne({ _id: installation._id });
      await recordPluginAuditEvent(app, {
        projectId: parsedProjectId,
        pluginId,
        eventType: "plugin.uninstalled",
        summary: `${installation.name} 已从当前项目卸载。`,
        payload: {
          sourceType: installation.sourceType,
          sourceRef: installation.sourceRef ?? null,
          sourceVersion: installation.sourceVersion ?? null,
          version: installation.version,
          retainedHistoryCount: historyCount
        }
      });

      return {
        ok: true,
        installation: serializePluginInstallation(installation),
        retainedHistoryCount: historyCount
      };
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/:pluginId/state",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const pluginId = (request.params as { projectId: string; pluginId: string }).pluginId;
      const parsedBody = updatePluginStateSchema.safeParse(request.body);
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      await app.db.collections.pluginInstallations.updateOne(
        { _id: installation._id },
        {
          $set: {
            enabled: parsedBody.data.enabled,
            updatedAt: new Date()
          }
        }
      );
      const refreshed = await app.db.collections.pluginInstallations.findOne({ _id: installation._id });

      return {
        installation: serializePluginInstallation(refreshed ?? installation)
      };
    }
  );

  app.get(
    "/api/projects/:projectId/plugins/:pluginId/frontend/module",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const pluginId = (request.params as { projectId: string; pluginId: string }).pluginId;
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      const serializedInstallation = serializePluginInstallation(installation);
      if (serializedInstallation.frontend.type === "builtin") {
        return reply.code(400).send({ message: "Built-in plugins do not expose an external frontend module" });
      }

      const module = await resolveInstalledPluginFrontendModule({
        projectRootPath: await resolveProjectRootPath(project.rootPath),
        installation: serializedInstallation
      });
      if (!module) {
        return reply.code(404).send({ message: "Plugin frontend module could not be resolved" });
      }

      const integrity = `sha256-${createHash("sha256").update(module.code).digest("base64")}`;

      const payload: PluginFrontendModuleRecord = {
        installation: serializedInstallation,
        frontend: serializedInstallation.frontend,
        entryPath: module.entryPath,
        code: module.code,
        integrity,
        hostApiVersion: RELAYDESK_PLUGIN_HOST_API_VERSION
      };

      return payload;
    }
  );

  app.get(
    "/api/projects/:projectId/plugins/:pluginId/context",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const pluginId = (request.params as { projectId: string; pluginId: string }).pluginId;
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      return {
        installation: serializePluginInstallation(installation),
        context: await buildPluginHostContext(app, parsedProjectId)
      };
    }
  );

  app.get(
    "/api/projects/:projectId/plugins/:pluginId/history",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const projectId = (request.params as { projectId: string }).projectId;
      const pluginId = (request.params as { projectId: string; pluginId: string }).pluginId;
      const parsedQuery = historyQuerySchema.safeParse(request.query ?? {});
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId || !parsedQuery.success) {
        return reply.code(400).send({ message: "Invalid request" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      const history = await app.db.collections.pluginExecutionHistory
        .find({ projectId: parsedProjectId, pluginId })
        .sort({ executedAt: -1 })
        .limit(parsedQuery.data.limit)
        .toArray();

      return {
        installation: serializePluginInstallation(installation),
        history: history.map(serializePluginExecutionHistory)
      };
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/:pluginId/actions/:actionId/execute",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const { projectId, pluginId, actionId } = request.params as {
        projectId: string;
        pluginId: string;
        actionId: string;
      };
      const parsedBody = executePluginActionSchema.safeParse(request.body ?? {});
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      if (!installation.enabled) {
        return reply.code(409).send({ message: "Plugin is disabled" });
      }

      try {
        const execution = await executePluginAction({
          projectRootPath: project.rootPath,
          plugin: serializePluginInstallation(installation),
          actionId,
          rawInputs: parsedBody.data.inputs
        });

        await Promise.all([
          recordPluginAuditEvent(app, {
            projectId: parsedProjectId,
            pluginId,
            eventType: "plugin.action.executed",
            summary: `${installation.name} 执行了动作 ${actionId}。`,
            payload: {
              actionId,
              sourceType: installation.sourceType,
              cwd: execution.cwd,
              command: execution.command,
              args: execution.args,
              success: execution.success,
              exitCode: execution.exitCode,
              timedOut: execution.timedOut,
              durationMs: execution.durationMs
            }
          }),
          recordPluginExecutionHistory(app, {
            projectId: parsedProjectId,
            pluginId,
            executionKind: "action",
            title: `${installation.name} / ${actionId}`,
            summary: execution.success ? "插件动作执行成功。" : "插件动作执行失败。",
            success: execution.success,
            durationMs: execution.durationMs,
            executedAt: execution.executedAt,
            actionId,
            details: {
              command: execution.command,
              args: execution.args,
              cwd: execution.cwd,
              exitCode: execution.exitCode,
              timedOut: execution.timedOut,
              stderr: execution.stderr,
              stdoutPreview: execution.stdout.slice(0, 500)
            }
          })
        ]);

        return {
          installation: serializePluginInstallation(installation),
          execution
        };
      } catch (error) {
        if (error instanceof PluginRuntimeError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        request.log.error({ err: error, pluginId, actionId }, "plugin action execution failed");
        return reply.code(500).send({ message: "Plugin action execution failed" });
      }
    }
  );

  app.post(
    "/api/projects/:projectId/plugins/:pluginId/rpc/:rpcMethodId/execute",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = getAuthUser(request);
      const ownerId = new ObjectId(authUser.userId);
      const { projectId, pluginId, rpcMethodId } = request.params as {
        projectId: string;
        pluginId: string;
        rpcMethodId: string;
      };
      const parsedBody = executePluginActionSchema.safeParse(request.body ?? {});
      const { project, parsedProjectId } = await getOwnedProject(app, ownerId, projectId);

      if (!parsedProjectId) {
        return reply.code(400).send({ message: "Invalid project id" });
      }

      if (!parsedBody.success) {
        return reply.code(400).send({ message: "Invalid payload" });
      }

      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const installation = await app.db.collections.pluginInstallations.findOne({
        projectId: parsedProjectId,
        pluginId
      });
      if (!installation) {
        return reply.code(404).send({ message: "Plugin installation not found" });
      }

      if (!installation.enabled) {
        return reply.code(409).send({ message: "Plugin is disabled" });
      }

      try {
        const execution = await executePluginRpc({
          app,
          projectId: parsedProjectId,
          projectRootPath: project.rootPath,
          plugin: serializePluginInstallation(installation),
          rpcMethodId,
          rawInputs: parsedBody.data.inputs
        });

        await Promise.all([
          recordPluginAuditEvent(app, {
            projectId: parsedProjectId,
            pluginId,
            eventType: "plugin.rpc.executed",
            summary: `${installation.name} 调用了后端 RPC ${rpcMethodId}。`,
            payload: {
              rpcMethodId,
              sourceType: installation.sourceType,
              handler: execution.handler,
              success: execution.success,
              durationMs: execution.durationMs
            }
          }),
          recordPluginExecutionHistory(app, {
            projectId: parsedProjectId,
            pluginId,
            executionKind: "rpc",
            title: `${installation.name} / ${rpcMethodId}`,
            summary: execution.success ? "插件 RPC 调用成功。" : "插件 RPC 调用失败。",
            success: execution.success,
            durationMs: execution.durationMs,
            executedAt: execution.executedAt,
            rpcMethodId,
            details: {
              handler: execution.handler,
              error: execution.error ?? null,
              resultPreview: execution.result
            }
          })
        ]);

        return {
          installation: serializePluginInstallation(installation),
          execution
        };
      } catch (error) {
        if (error instanceof PluginRuntimeError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        request.log.error({ err: error, pluginId, rpcMethodId }, "plugin rpc execution failed");
        return reply.code(500).send({ message: "Plugin RPC execution failed" });
      }
    }
  );
}
