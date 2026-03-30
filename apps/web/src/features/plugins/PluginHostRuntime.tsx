import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PluginFrontendModuleRecord,
  PluginHostContextRecord,
  PluginInstallationRecord,
  PluginRpcExecutionRecord,
  SessionRecord
} from "@shared";
import { api } from "../../lib/api";
import { createPluginHostBridge } from "./pluginBridge";
import {
  buildPluginApiCompatibilityMessage,
  isPluginFrontendApiCompatible,
  verifyPluginModuleIntegrity
} from "./pluginRuntime";

interface PluginHostRuntimeProps {
  installation: PluginInstallationRecord;
  pluginContext: PluginHostContextRecord | null;
  projectId: string;
  projectRootPath: string;
  realtimeState: string;
  selectedSession: SessionRecord | null;
  token: string | null;
  onExecuteRpc(
    installation: PluginInstallationRecord,
    rpcMethodId: string,
    inputs?: Record<string, string>
  ): Promise<PluginRpcExecutionRecord | null>;
}

interface PluginFrontendModule {
  default?: (
    element: HTMLElement,
    bridge: ReturnType<typeof createPluginHostBridge>["bridge"]
  ) => void | (() => void) | Promise<void | (() => void)>;
  renderRelayDeskPlugin?: (
    element: HTMLElement,
    bridge: ReturnType<typeof createPluginHostBridge>["bridge"]
  ) => void | (() => void) | Promise<void | (() => void)>;
}

interface LoadedPluginFrontendModule {
  response: PluginFrontendModuleRecord;
  module: PluginFrontendModule;
}

const pluginModuleCache = new Map<string, Promise<LoadedPluginFrontendModule>>();

function buildPluginModuleCacheKey(installation: PluginInstallationRecord): string {
  return [
    installation.installationId,
    installation.id,
    installation.version,
    installation.updatedAt,
    installation.frontend.type,
    installation.frontend.entry ?? "builtin"
  ].join(":");
}

async function loadPluginFrontendModule(
  token: string,
  projectId: string,
  installation: PluginInstallationRecord
): Promise<LoadedPluginFrontendModule> {
  const cacheKey = buildPluginModuleCacheKey(installation);
  const existing = pluginModuleCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const response = await api.getProjectPluginFrontendModule(token, projectId, installation.id);
    if (!isPluginFrontendApiCompatible(response.frontend.apiVersion)) {
      throw new Error(buildPluginApiCompatibilityMessage(response.frontend.apiVersion));
    }

    const integrityOk = await verifyPluginModuleIntegrity(response.code, response.integrity);
    if (!integrityOk) {
      throw new Error("插件前端完整性校验失败，已阻止加载。");
    }

    const moduleUrl = URL.createObjectURL(
      new Blob([response.code], {
        type: "text/javascript"
      })
    );

    try {
      const module = (await import(/* @vite-ignore */ moduleUrl)) as PluginFrontendModule;
      return {
        response,
        module
      };
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  })().catch((error) => {
    pluginModuleCache.delete(cacheKey);
    throw error;
  });

  pluginModuleCache.set(cacheKey, promise);
  return promise;
}

export function PluginHostRuntime({
  installation,
  pluginContext,
  projectId,
  projectRootPath,
  realtimeState,
  selectedSession,
  token,
  onExecuteRpc
}: PluginHostRuntimeProps): JSX.Element {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const bridgeControllerRef = useRef<ReturnType<typeof createPluginHostBridge> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryPath, setEntryPath] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<string | null>(null);
  const [hostApiVersion, setHostApiVersion] = useState<string | null>(null);

  const bridgeState = useMemo(
    () => ({
      installation,
      pluginContext,
      projectId,
      projectRootPath,
      realtimeState,
      selectedSession
    }),
    [installation, pluginContext, projectId, projectRootPath, realtimeState, selectedSession]
  );

  useEffect(() => {
    bridgeControllerRef.current?.updateState(bridgeState);
  }, [bridgeState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let disposed = false;
    if (!token) {
      setLoading(false);
      setError("缺少登录态，暂时无法加载插件前端模块。");
      return;
    }

    const controller = createPluginHostBridge({
      initialState: bridgeState,
      callRpc(methodId, inputs) {
        return onExecuteRpc(installation, methodId, inputs);
      }
    });
    bridgeControllerRef.current = controller;
    setLoading(true);
    setError(null);
    setEntryPath(null);
    setIntegrity(null);
    setHostApiVersion(null);

    void (async () => {
      try {
        const { response, module } = await loadPluginFrontendModule(token, projectId, installation);
        if (disposed) {
          return;
        }

        setEntryPath(response.entryPath);
        setIntegrity(response.integrity);
        setHostApiVersion(response.hostApiVersion);
        const renderPlugin = module.renderRelayDeskPlugin ?? module.default;
        if (typeof renderPlugin !== "function") {
          throw new Error("Plugin frontend module must export default or renderRelayDeskPlugin.");
        }

        if (!mountRef.current) {
          return;
        }

        mountRef.current.innerHTML = "";
        const cleanup = await renderPlugin(mountRef.current, controller.bridge);
        cleanupRef.current = typeof cleanup === "function" ? cleanup : null;
      } catch (runtimeError) {
        if (!disposed) {
          setError(runtimeError instanceof Error ? runtimeError.message : "加载插件前端失败");
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      bridgeControllerRef.current?.destroy();
      bridgeControllerRef.current = null;
    };
  }, [
    installation.id,
    installation.installationId,
    installation.version,
    installation.updatedAt,
    installation.frontend.type,
    installation.frontend.entry,
    onExecuteRpc,
    projectId,
    token
  ]);

  return (
    <section className="plugin-runtime-card">
      <div className="section-title-row">
        <div>
          <div className="eyebrow">插件前端 Runtime</div>
          <h4>{installation.frontend.displayName}</h4>
        </div>
        <span className="plugin-badge">{installation.frontend.type}</span>
      </div>
      <p className="muted">
        API {installation.frontend.apiVersion}
        {entryPath ? ` · ${entryPath}` : installation.frontend.entry ? ` · ${installation.frontend.entry}` : ""}
      </p>
      {hostApiVersion ? (
        <p className="muted">
          宿主 API {hostApiVersion}
          {integrity ? ` · ${integrity.slice(0, 20)}...` : ""}
        </p>
      ) : null}
      {loading ? <div className="info-box">正在加载插件前端模块...</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
      <div className="plugin-runtime-card" ref={mountRef}>
        {!loading && !error ? "插件前端已挂载。若模块没有主动渲染内容，这里会保持为空。" : null}
      </div>
    </section>
  );
}
