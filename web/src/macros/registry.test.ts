import { describe, expect, it } from "vitest";
import { buildMacroCall, parseMacroTools, type MacroTool } from "./registry";

describe("parseMacroTools", () => {
  it("parses text params in a second paren group", () => {
    const tools = parseMacroTools(
      "vardef drawAxisTick(expr len)(text lab) = label(lab,(0,0)); enddef;",
    );
    expect(tools).toHaveLength(1);
    expect(tools[0].params).toEqual([
      { kind: "expr", name: "len" },
      { kind: "text", name: "lab" },
    ]);
  });
});

describe("buildMacroCall", () => {
  const drawAxisTick: MacroTool = {
    name: "drawAxisTick",
    kind: "vardef",
    params: [
      { kind: "expr", name: "len" },
      { kind: "text", name: "lab" },
    ],
    defaults: { len: "3", lab: "btex $x$ etex" },
  };

  it("emits separate parens for text arguments", () => {
    expect(buildMacroCall(drawAxisTick, {})).toBe("drawAxisTick(3)(btex $x$ etex);");
  });
});
