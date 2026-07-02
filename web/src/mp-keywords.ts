/** MetaPost 关键字分组：成对/同族关键字共用样式类 */

export type MpKeywordGroup = {
  className: string;
  words: readonly string[];
};

export const MP_KEYWORD_GROUPS: readonly MpKeywordGroup[] = [
  {
    className: "cm-mp-kw-def",
    words: [
      "def",
      "vardef",
      "enddef",
      "expr",
      "text",
      "suffix",
      "primary",
      "secondary",
      "tertiary",
      "quote",
      "newinternal",
    ],
  },
  {
    className: "cm-mp-kw-tex",
    words: ["btex", "etex", "verbatimtex", "tex"],
  },
  {
    className: "cm-mp-kw-fig",
    words: ["beginfig", "endfig", "beginchar", "endchar"],
  },
  {
    className: "cm-mp-kw-group",
    words: ["begingroup", "endgroup"],
  },
  {
    className: "cm-mp-kw-control",
    words: [
      "if",
      "fi",
      "else",
      "elseif",
      "ifelse",
      "for",
      "forever",
      "forsuffix",
      "endfor",
      "exitif",
      "step",
      "until",
      "do",
      "od",
      "return",
      "dump",
      "save",
      "interim",
      "mod",
    ],
  },
  {
    className: "cm-mp-kw-draw",
    words: [
      "draw",
      "drawarrow",
      "drawdot",
      "drawoptions",
      "fill",
      "filldraw",
      "unfill",
      "clip",
      "pickup",
      "pen",
      "pair",
      "path",
      "transform",
      "numeric",
      "boolean",
      "string",
      "picture",
      "color",
      "label",
      "dotlabel",
      "graph",
      "plane",
      "origin",
      "left",
      "right",
      "up",
      "down",
      "fullcircle",
      "halfcircle",
      "pencircle",
      "scaled",
      "xscaled",
      "yscaled",
      "shifted",
      "rotated",
      "rotatedaround",
      "dashed",
      "evenly",
      "withpen",
      "withcolor",
      "cycle",
      "controls",
      "and",
      "of",
      "subpath",
      "length",
      "xpart",
      "ypart",
      "whatever",
      "intersectionpoint",
      "unitvector",
      "direction",
      "point",
      "curl",
      "input",
    ],
  },
];

const wordToClass = new Map<string, string>();
for (const group of MP_KEYWORD_GROUPS) {
  for (const word of group.words) {
    wordToClass.set(word, group.className);
  }
}

/** 长词优先；同长度时让 tex 排在 btex/etex 之后，避免误匹配 */
const sortedWords = [...wordToClass.keys()].sort((a, b) => {
  const byLen = b.length - a.length;
  if (byLen !== 0) return byLen;
  if (a === "tex") return 1;
  if (b === "tex") return -1;
  return a.localeCompare(b);
});
export const mpKeywordRe = new RegExp(`\\b(?:${sortedWords.join("|")})\\b`, "g");

export function mpKeywordClass(word: string): string | undefined {
  return wordToClass.get(word);
}

export function isMpKeyword(word: string): boolean {
  return wordToClass.has(word);
}

export type MpKeywordMatch = { from: number; to: number; className: string };

/** 在 text[offset..] 内扫描关键字；from/to 为相对 text 起点的偏移 */
export function findMpKeywordMatches(text: string, limit = text.length): MpKeywordMatch[] {
  const matches: MpKeywordMatch[] = [];
  mpKeywordRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = mpKeywordRe.exec(text)) && m.index < limit) {
    const className = wordToClass.get(m[0]);
    if (!className) continue;
    matches.push({ from: m.index, to: m.index + m[0].length, className });
  }
  return matches;
}

export function rangesOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && bFrom < aTo;
}
