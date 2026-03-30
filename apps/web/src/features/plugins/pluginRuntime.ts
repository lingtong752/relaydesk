import { RELAYDESK_PLUGIN_HOST_API_VERSION } from "@shared";

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return globalThis.btoa(binary);
}

function normalizeMajor(version: string): string | null {
  const trimmed = version.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.split(".")[0] ?? null;
}

export function isPluginFrontendApiCompatible(pluginApiVersion: string): boolean {
  const pluginMajor = normalizeMajor(pluginApiVersion);
  const hostMajor = normalizeMajor(RELAYDESK_PLUGIN_HOST_API_VERSION);
  return Boolean(pluginMajor && hostMajor && pluginMajor === hostMajor);
}

export function buildPluginApiCompatibilityMessage(pluginApiVersion: string): string {
  return `插件前端 API ${pluginApiVersion} 与宿主 API ${RELAYDESK_PLUGIN_HOST_API_VERSION} 不兼容。`;
}

export async function computePluginModuleIntegrity(code: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) {
    return null;
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return `sha256-${toBase64(new Uint8Array(digest))}`;
}

export async function verifyPluginModuleIntegrity(
  code: string,
  expectedIntegrity: string
): Promise<boolean> {
  const actualIntegrity = await computePluginModuleIntegrity(code);
  return Boolean(actualIntegrity && actualIntegrity === expectedIntegrity);
}
