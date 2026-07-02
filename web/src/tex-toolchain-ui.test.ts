import { describe, expect, it } from "vitest";

import { sharedToolBinDir, shortenPath } from "./tex-toolchain-ui";

describe("tex-toolchain-ui", () => {
  it("shortens long TeX Live paths", () => {
    expect(
      shortenPath("/usr/local/texlive/2025/bin/universal-darwin/mpost"),
    ).toBe("…/bin/universal-darwin/mpost");
  });

  it("detects shared bin directory", () => {
    expect(
      sharedToolBinDir(
        "/usr/local/texlive/2025/bin/universal-darwin/mpost",
        "/usr/local/texlive/2025/bin/universal-darwin/latex",
      ),
    ).toBe("/usr/local/texlive/2025/bin/universal-darwin");
  });
});
