import { describe, expect, it } from "vitest";

import { findMpKeywordMatches, mpKeywordClass } from "./mp-keywords";

describe("mp-keywords", () => {
  it("pairs share the same style class", () => {
    expect(mpKeywordClass("def")).toBe(mpKeywordClass("enddef"));
    expect(mpKeywordClass("vardef")).toBe(mpKeywordClass("enddef"));
    expect(mpKeywordClass("expr")).toBe(mpKeywordClass("vardef"));
    expect(mpKeywordClass("btex")).toBe(mpKeywordClass("etex"));
    expect(mpKeywordClass("beginfig")).toBe(mpKeywordClass("endfig"));
    expect(mpKeywordClass("begingroup")).toBe(mpKeywordClass("endgroup"));
  });

  it("does not highlight tex inside btex or etex", () => {
    const src = "btex $x$ etex";
    const matches = findMpKeywordMatches(src);
    expect(matches.map((m) => src.slice(m.from, m.to))).toEqual(["btex", "etex"]);
    expect(matches.every((m) => m.className === "cm-mp-kw-tex")).toBe(true);
  });

  it("prefers longer tokens like enddef over def", () => {
    const matches = findMpKeywordMatches("vardef x = 1; enddef;");
    expect(matches.map((m) => m.from)).toEqual([0, 14]);
    expect(matches[1].className).toBe(matches[0].className);
  });

  it("recognizes common MetaPost drawing syntax", () => {
    const src = "drawarrow fullcircle scaled 8u shifted origin dashed evenly withpen pencircle;";
    const words = findMpKeywordMatches(src).map((m) => src.slice(m.from, m.to));
    expect(words).toEqual([
      "drawarrow",
      "fullcircle",
      "scaled",
      "shifted",
      "origin",
      "dashed",
      "evenly",
      "withpen",
      "pencircle",
    ]);
  });
});
