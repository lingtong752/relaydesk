import type {
  PluginHostContextRecord,
  PluginInstallationRecord,
  PluginRpcExecutionRecord,
  SessionRecord
} from "@shared";

export interface PluginHostBridgeState {
  installation: PluginInstallationRecord;
  pluginContext: PluginHostContextRecord | null;
  projectId: string;
  projectRootPath: string;
  realtimeState: string;
  selectedSession: SessionRecord | null;
}

export interface PluginHostBridge {
  getState(): PluginHostBridgeState;
  subscribe(listener: (state: PluginHostBridgeState) => void): () => void;
  callRpc(methodId: string, inputs?: Record<string, string>): Promise<PluginRpcExecutionRecord | null>;
}

export interface PluginHostBridgeController {
  bridge: PluginHostBridge;
  updateState(nextState: PluginHostBridgeState): void;
  destroy(): void;
}

export function createPluginHostBridge(input: {
  initialState: PluginHostBridgeState;
  callRpc(methodId: string, inputs?: Record<string, string>): Promise<PluginRpcExecutionRecord | null>;
}): PluginHostBridgeController {
  let currentState = input.initialState;
  const listeners = new Set<(state: PluginHostBridgeState) => void>();

  return {
    bridge: {
      getState() {
        return currentState;
      },
      subscribe(listener) {
        listeners.add(listener);
        listener(currentState);
        return () => {
          listeners.delete(listener);
        };
      },
      callRpc(methodId, inputs) {
        return input.callRpc(methodId, inputs);
      }
    },
    updateState(nextState) {
      currentState = nextState;
      for (const listener of listeners) {
        listener(currentState);
      }
    },
    destroy() {
      listeners.clear();
    }
  };
}
