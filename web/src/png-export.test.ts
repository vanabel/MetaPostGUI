import { describe, expect, it } from "vitest";

import { pngFilenameFromLabel, resolveSvgRasterSize, svgLengthToPx } from "./png-export";

describe("png-export", () => {
  it("normalizes export labels into png filenames", () => {
    expect(pngFilenameFromLabel(" fig:demo 01 ")).toBe("fig-demo-01.png");
    expect(pngFilenameFromLabel("figure.png")).toBe("figure.png");
    expect(pngFilenameFromLabel("")).toBe("metapost-figure.png");
  });

  it("converts common SVG length units to CSS pixels", () => {
    expect(svgLengthToPx("72pt")).toBeCloseTo(96);
    expect(svgLengthToPx("10mm")).toBeCloseTo(37.795, 3);
    expect(svgLengthToPx("100%")).toBeNull();
  });

  it("uses viewBox dimensions when preview CSS sets percentage sizes", () => {
    expect(
      resolveSvgRasterSize({
        widthAttr: "100%",
        heightAttr: "100%",
        viewBox: "0 0 120 80",
      }),
    ).toEqual({ width: 240, height: 160 });
  });

  it("keeps the viewBox aspect ratio when only one length is absolute", () => {
    expect(
      resolveSvgRasterSize({
        widthAttr: "300px",
        heightAttr: null,
        viewBox: "0 0 150 75",
        scale: 1,
      }),
    ).toEqual({ width: 300, height: 150 });
  });
});
