import type { ProviderId } from "@shared";
import type { ProviderAdapter } from "./types.js";
import { claudeProviderAdapter } from "./adapters/claudeAdapter.js";
import { codexProviderAdapter } from "./adapters/codexAdapter.js";
import { geminiProviderAdapter } from "./adapters/geminiAdapter.js";
import { mockProviderAdapter } from "./adapters/mockAdapter.js";
import { createUnsupportedProviderAdapter } from "./adapters/unsupportedAdapter.js";

const providerAdapters = new Map<ProviderId, ProviderAdapter>([
  [mockProviderAdapter.id, mockProviderAdapter],
  [claudeProviderAdapter.id, claudeProviderAdapter],
  [codexProviderAdapter.id, codexProviderAdapter],
  [geminiProviderAdapter.id, geminiProviderAdapter]
]);

export function getProviderAdapter(provider: ProviderId): ProviderAdapter {
  return providerAdapters.get(provider) ?? createUnsupportedProviderAdapter(provider);
}

export function listRegisteredProviders(): ProviderId[] {
  return [...providerAdapters.keys()];
}
