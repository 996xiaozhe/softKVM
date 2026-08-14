import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator, resolveLocale } from "./index";

afterEach(() => vi.unstubAllGlobals());

describe("resolveLocale", () => {
  it("maps traditional Chinese variants", () => {
    vi.stubGlobal("navigator", { language: "zh-HK", languages: ["zh-HK"] });
    expect(resolveLocale("system")).toBe("zh-TW");
  });

  it("maps generic Chinese to zh-CN", () => {
    vi.stubGlobal("navigator", { language: "zh-SG", languages: ["zh-SG"] });
    expect(resolveLocale("system")).toBe("zh-CN");
  });

  it("falls back to English for unknown locales", () => {
    vi.stubGlobal("navigator", { language: "eo-EO", languages: ["eo-EO"] });
    expect(resolveLocale("system")).toBe("en");
  });
});

describe("createTranslator", () => {
  it("substitutes template values", () => {
    const t = createTranslator("en");
    expect(t("currentInput", { input: "HDMI 1" })).toContain("HDMI 1");
  });

  it("uses English when system locale is unsupported", () => {
    vi.stubGlobal("navigator", { language: "eo-EO", languages: ["eo-EO"] });
    const t = createTranslator("system");
    expect(t("tagline")).toBe("Monitor input switching");
  });
});
