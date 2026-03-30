import { describe, expect, it } from "vitest";
import {
  buildPluginApiCompatibilityMessage,
  computePluginModuleIntegrity,
  isPluginFrontendApiCompatible,
  verifyPluginModuleIntegrity
} from "./pluginRuntime";

describe("pluginRuntime helpers", () => {
  it("accepts plugins that target the current host API major version", () => {
    expect(isPluginFrontendApiCompatible("1.0")).toBe(true);
    expect(isPluginFrontendApiCompatible("1.3.4")).toBe(true);
    expect(isPluginFrontendApiCompatible("2.0")).toBe(false);
  });

  it("builds a clear compatibility message", () => {
    expect(buildPluginApiCompatibilityMessage("2.0")).toContain("插件前端 API 2.0");
    expect(buildPluginApiCompatibilityMessage("2.0")).toContain("宿主 API 1.0");
  });

  it("computes and verifies plugin module integrity", async () => {
    const code = "export function renderRelayDeskPlugin() {}";
    const integrity = await computePluginModuleIntegrity(code);

    expect(integrity).toMatch(/^sha256-/);
    await expect(verifyPluginModuleIntegrity(code, integrity!)).resolves.toBe(true);
    await expect(verifyPluginModuleIntegrity(`${code}\n// tampered`, integrity!)).resolves.toBe(false);
  });
});
