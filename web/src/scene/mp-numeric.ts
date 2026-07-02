/** Look up MetaPost numeric: u, d[0], or array shorthand d0 for d[0]. */
export function lookupNumeric(name: string, vars: Map<string, number>): number | null {
  const t = name.trim().replace(/\s+/g, "");
  if (!t) return null;
  if (vars.has(t)) return vars.get(t)!;
  const sub = t.match(/^([a-zA-Z_]\w*)\[(\d+)\]$/);
  if (sub) return vars.get(`${sub[1]}[${sub[2]}]`) ?? null;
  const shorthand = t.match(/^([a-zA-Z_]\w*)(\d+)$/);
  if (shorthand) {
    return vars.get(`${shorthand[1]}[${shorthand[2]}]`) ?? null;
  }
  return null;
}

function peelOuterParens(s: string): string {
  let t = s.trim();
  while (t.startsWith("(") && t.endsWith(")")) {
    let depth = 0;
    let ok = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "(") depth++;
      else if (t[i] === ")") depth--;
      if (depth === 0 && i < t.length - 1) {
        ok = false;
        break;
      }
    }
    if (!ok || depth !== 0) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

function parseLiteralScalar(expr: string): number | null {
  let t = expr.trim().replace(/\s+/g, "");
  t = t.replace(/(cm|mm|in|pt|bp|pc|dd|cc|sp)$/i, "");
  t = t.replace(/\*?u$/i, "");
  const div = t.match(/^(-?[\d.]+)\/(-?[\d.]+)$/);
  if (div) {
    const n = parseFloat(div[1]) / parseFloat(div[2]);
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function splitAtDepth0(s: string, op: string, fromRight = false): [string, string] | null {
  let depth = 0;
  const indices: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && ch === op) indices.push(i);
  }
  if (indices.length === 0) return null;
  const i = fromRight ? indices[indices.length - 1]! : indices[0]!;
  return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}

/** Evaluate simple MetaPost numeric expressions (sqrt, cosd, arithmetic). */
export function evalNumeric(expr: string, vars: Map<string, number>): number | null {
  const t = expr.trim();
  if (!t) return null;
  let depth = 0;
  for (const ch of t) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) return null;
  }

  const sqrtM = t.match(/^sqrt\((.*)\)$/is);
  if (sqrtM) {
    const v = evalNumeric(sqrtM[1]!, vars);
    return v !== null && v >= 0 ? Math.sqrt(v) : null;
  }
  const cosdM = t.match(/^cosd\((.*)\)$/is);
  if (cosdM) {
    const v = evalNumeric(cosdM[1]!, vars);
    return v !== null ? Math.cos((v * Math.PI) / 180) : null;
  }
  const sindM = t.match(/^sind\((.*)\)$/is);
  if (sindM) {
    const v = evalNumeric(sindM[1]!, vars);
    return v !== null ? Math.sin((v * Math.PI) / 180) : null;
  }

  const peeled = peelOuterParens(t);
  if (peeled !== t) return evalNumeric(peeled, vars);

  const named = lookupNumeric(peeled, vars);
  if (named !== null && /^[a-zA-Z_][\w]*(\[\d+\])?$/.test(peeled)) return named;

  const lit = parseLiteralScalar(peeled);
  if (lit !== null && /^[\d./]+(\*?u)?(cm|mm|pt|bp)?$/i.test(peeled.replace(/\s/g, ""))) {
    return lit;
  }

  const plus = splitAtDepth0(peeled, "+");
  if (plus) {
    const a = evalNumeric(plus[0], vars);
    const b = evalNumeric(plus[1], vars);
    return a !== null && b !== null ? a + b : null;
  }
  const minus = splitAtDepth0(peeled, "-", true);
  if (minus && minus[0]) {
    const a = evalNumeric(minus[0], vars);
    const b = evalNumeric(minus[1], vars);
    return a !== null && b !== null ? a - b : null;
  }
  const mul = splitAtDepth0(peeled, "*");
  if (mul) {
    const a = evalNumeric(mul[0], vars);
    const b = evalNumeric(mul[1], vars);
    return a !== null && b !== null ? a * b : null;
  }
  const div = splitAtDepth0(peeled, "/");
  if (div) {
    const a = evalNumeric(div[0], vars);
    const b = evalNumeric(div[1], vars);
    return a !== null && b !== null && b !== 0 ? a / b : null;
  }

  return lookupNumeric(peeled, vars) ?? parseLiteralScalar(peeled);
}
