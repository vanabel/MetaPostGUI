import { describe, expect, it } from "vitest";

import { findTexHighlightMatches } from "./tex-highlight";

describe("tex-highlight", () => {
  it("highlights TeX commands in mposttex content", () => {
    const src = String.raw`\usepackage{amssymb,bm,xcolor,amsmath}`;
    const matches = findTexHighlightMatches(src);
    expect(matches.map((m) => src.slice(m.from, m.to))).toEqual([String.raw`\usepackage`]);
    expect(matches[0].className).toBe("cm-tex-command");
  });

  it("highlights begin and end commands before comments", () => {
    const src = String.raw`\AtBeginDocument{\begin{CJK*}{UTF8}{gkai}} % cjk setup`;
    const matches = findTexHighlightMatches(src);
    expect(matches.map((m) => src.slice(m.from, m.to))).toEqual([
      String.raw`\AtBeginDocument`,
      String.raw`\begin`,
      "% cjk setup",
    ]);
  });

  it("does not start a comment at escaped percent", () => {
    const src = String.raw`\newcommand{\pct}{\%}`;
    const matches = findTexHighlightMatches(src);
    expect(matches.map((m) => m.className)).not.toContain("cm-tex-comment");
  });
});
