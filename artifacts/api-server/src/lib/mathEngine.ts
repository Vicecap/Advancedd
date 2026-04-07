import * as math from "mathjs";

export type Operation =
  | "factor"
  | "expand"
  | "solve"
  | "diff"
  | "integrate"
  | "limit"
  | "simplify"
  | "evaluate";

export interface ComputeStep {
  step: number;
  label: string;
  expression: string;
}

export interface ComputeResult {
  expression: string;
  operation: Operation;
  result: string;
  steps: ComputeStep[];
  isNumeric: boolean;
  numericValue: number | null;
}

const PURE_NUMERIC_RE = /^[\d\s+\-*/^().e]+$/i;
const NON_POLY_RE = /sin|cos|tan|ln|log|sqrt|abs/i;

function detectOperation(expression: string): Operation {
  const lower = expression.toLowerCase();
  if (lower.includes("factor")) return "factor";
  if (lower.includes("expand")) return "expand";
  if (lower.includes("solve") || lower.includes("=")) return "solve";
  if (lower.includes("derivative") || lower.includes("differentiate") || lower.includes("diff")) return "diff";
  if (lower.includes("integrate") || lower.includes("integral")) return "integrate";
  if (lower.includes("limit")) return "limit";
  if (lower.includes("simplify")) return "simplify";
  if (lower.includes("evaluate") || lower.includes("compute") || lower.includes("calculate")) return "evaluate";
  if (PURE_NUMERIC_RE.test(expression)) return "evaluate";
  return "simplify";
}

function stripKeyword(expression: string): string {
  return expression
    .replace(/\b(factor|expand|solve|derivative|differentiate|diff|integrate|integral|limit|simplify|evaluate|compute|calculate)\b/gi, "")
    .trim();
}

function fmt(n: number): string {
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  const s = n.toFixed(6).replace(/\.?0+$/, "");
  return s;
}

function isZero(n: number): boolean {
  return Math.abs(n) < 1e-9;
}

function evalAt(exprStr: string, variable: string, val: number): number {
  return +math.evaluate(exprStr, { [variable]: val });
}

function polyCoeffs(exprStr: string, variable = "x"): { a: number; b: number; c: number } {
  const c = evalAt(exprStr, variable, 0);
  const f1 = evalAt(exprStr, variable, 1);
  const fm1 = evalAt(exprStr, variable, -1);
  const b = (f1 - fm1) / 2;
  const a = (f1 + fm1 - 2 * c) / 2;
  return { a, b, c };
}

function polyDegree(exprStr: string, variable: string): number {
  let deriv = exprStr;
  for (let d = 0; d <= 8; d++) {
    try {
      const val = evalAt(deriv, variable, 0);
      if (isZero(val) && d > 0) {
        const node2 = math.parse(deriv);
        const next = math.simplify(math.derivative(node2, variable)).toString();
        if (next === "0") return d - 1;
      }
      const node = math.parse(deriv);
      const next = math.simplify(math.derivative(node, variable)).toString();
      if (next === "0") return d;
      deriv = next;
    } catch {
      return d > 0 ? d - 1 : 0;
    }
  }
  return 8;
}

function extractPolyTerms(expr: string, variable: string): Array<{ coeff: number; power: number }> {
  const terms: Array<{ coeff: number; power: number }> = [];
  let current = expr;
  let factorial = 1;
  for (let power = 0; power <= 8; power++) {
    try {
      const val = evalAt(current, variable, 0);
      const coeff = val / factorial;
      if (!isZero(coeff)) terms.push({ coeff, power });
      const node = math.parse(current);
      const next = math.simplify(math.derivative(node, variable)).toString();
      if (next === "0") break;
      factorial *= (power + 1);
      current = next;
    } catch {
      break;
    }
  }
  return terms.sort((a, b) => b.power - a.power);
}

function termLabel(coeff: number, power: number, variable: string): string {
  const c = fmt(Math.abs(coeff));
  const sign = coeff < 0 ? "-" : "+";
  if (power === 0) return `${sign} ${c}`;
  if (power === 1) return coeff === 1 ? `+ ${variable}` : coeff === -1 ? `- ${variable}` : `${sign} ${c}${variable}`;
  return coeff === 1 ? `+ ${variable}^${power}` : coeff === -1 ? `- ${variable}^${power}` : `${sign} ${c}${variable}^${power}`;
}

function buildPolyStr(terms: Array<{ coeff: number; power: number }>, variable: string): string {
  if (terms.length === 0) return "0";
  let out = "";
  for (let i = 0; i < terms.length; i++) {
    const { coeff, power } = terms[i];
    if (i === 0) {
      const c = fmt(Math.abs(coeff));
      const sign = coeff < 0 ? "-" : "";
      if (power === 0) out += `${sign}${c}`;
      else if (power === 1) out += coeff === 1 ? variable : coeff === -1 ? `-${variable}` : `${sign}${c}${variable}`;
      else out += coeff === 1 ? `${variable}^${power}` : coeff === -1 ? `-${variable}^${power}` : `${sign}${c}${variable}^${power}`;
    } else {
      out += ` ${termLabel(coeff, power, variable)}`;
    }
  }
  return out;
}

function ruleForPolyTerm(coeff: number, power: number, variable: string): string {
  if (power === 0) return `constant rule: d/d${variable}(${fmt(coeff)}) = 0`;
  if (power === 1) return `constant multiple rule: d/d${variable}(${fmt(coeff)}${variable}) = ${fmt(coeff)}`;
  return `power rule: d/d${variable}(${fmt(coeff)}${variable}^${power}) = ${power}·${fmt(coeff)}·${variable}^${power - 1}`;
}

function derivativeTerm(coeff: number, power: number): { coeff: number; power: number } | null {
  if (power === 0) return null;
  return { coeff: coeff * power, power: power - 1 };
}

function integralTerm(coeff: number, power: number): { coeff: number; power: number } {
  return { coeff: coeff / (power + 1), power: power + 1 };
}

function findIntegerFactors(a: number, b: number, c: number): [number, number] | null {
  const product = a * c;
  const limit = Math.abs(product) + 1;
  for (let p = -limit; p <= limit; p++) {
    if (p === 0) continue;
    if (!isZero(product % p) && !isZero(product - p * Math.round(product / p))) {
      if (Math.abs(Math.round(product / p) * p - product) > 1e-9) continue;
    }
    const q = product / p;
    if (Math.abs(Math.round(q) - q) < 1e-9 && isZero(p + q - b)) {
      return [Math.round(p), Math.round(q)];
    }
  }
  return null;
}

function makeStep(n: number, label: string, expression: string): ComputeStep {
  return { step: n, label, expression };
}

export function computeExpression(
  rawExpression: string,
  operation?: Operation,
  variable = "x",
  limitPoint = 0,
): ComputeResult {
  const cleanExpr = stripKeyword(rawExpression);
  const detectedOp = operation ?? detectOperation(rawExpression);
  const steps: ComputeStep[] = [];

  let result: string;
  let isNumeric = false;
  let numericValue: number | null = null;
  let n = 1;

  try {
    switch (detectedOp) {

      // ───────────────────────────── EVALUATE ─────────────────────────────
      case "evaluate": {
        steps.push(makeStep(n++, "Expression to evaluate", cleanExpr));
        const val = math.evaluate(cleanExpr);
        result = fmt(+val);
        isNumeric = typeof val === "number" && isFinite(+val);
        numericValue = isNumeric ? +val : null;

        if (/[+\-*/^]/.test(cleanExpr)) {
          try {
            const simplified = math.simplify(cleanExpr, []).toString();
            if (simplified !== cleanExpr && simplified !== result) {
              steps.push(makeStep(n++, "Simplifying order of operations", simplified));
            }
          } catch { }
        }
        steps.push(makeStep(n++, "Result", `= ${result}`));
        break;
      }

      // ───────────────────────────── SIMPLIFY ─────────────────────────────
      case "simplify": {
        steps.push(makeStep(n++, "Original expression", cleanExpr));

        if (!NON_POLY_RE.test(cleanExpr) && cleanExpr.includes(variable)) {
          const terms = extractPolyTerms(cleanExpr, variable);
          if (terms.length > 0) {
            const byPower = new Map<number, number>();
            for (const { coeff, power } of terms) {
              byPower.set(power, (byPower.get(power) ?? 0) + coeff);
            }
            const combined = [...byPower.entries()]
              .filter(([, c]) => !isZero(c))
              .sort(([a], [b]) => b - a)
              .map(([p, c]) => ({ coeff: c, power: p }));
            const poly = buildPolyStr(combined, variable);
            steps.push(makeStep(n++, "Collect like terms", poly));
            const simplified = math.simplify(cleanExpr, { exactFractions: false }).toString();
            if (simplified !== poly && simplified !== cleanExpr) {
              steps.push(makeStep(n++, "Further simplification", simplified));
            }
            result = simplified !== cleanExpr ? simplified : poly;
          } else {
            const simplified = math.simplify(cleanExpr, { exactFractions: false }).toString();
            steps.push(makeStep(n++, "Simplified form", simplified));
            result = simplified;
          }
        } else {
          const simplified = math.simplify(cleanExpr, { exactFractions: false }).toString();
          steps.push(makeStep(n++, "Simplified form", simplified));
          result = simplified;
        }

        try {
          const val = +math.evaluate(cleanExpr, { [variable]: 1 });
          if (isFinite(val) && !cleanExpr.includes(variable)) {
            isNumeric = true;
            numericValue = evalAt(cleanExpr, variable, 0);
          }
        } catch { }

        steps.push(makeStep(n++, "Result", result));
        break;
      }

      // ───────────────────────────── EXPAND ─────────────────────────────
      case "expand": {
        steps.push(makeStep(n++, "Original expression", cleanExpr));
        const expanded = math.simplify(cleanExpr, []).toString();
        steps.push(makeStep(n++, "Apply distributive law and expand brackets", expanded));
        const collected = math.simplify(expanded, { exactFractions: false }).toString();
        if (collected !== expanded) {
          steps.push(makeStep(n++, "Collect like terms", collected));
        }
        result = collected !== cleanExpr ? collected : expanded;
        steps.push(makeStep(n++, "Expanded form", result));
        break;
      }

      // ───────────────────────────── FACTOR ─────────────────────────────
      case "factor": {
        steps.push(makeStep(n++, "Expression to factor", cleanExpr));

        let factorExpr = cleanExpr;
        if (!factorExpr.includes("=")) {
          if (!NON_POLY_RE.test(factorExpr)) {
            const { a, b, c } = polyCoeffs(factorExpr, variable);

            if (!isZero(a)) {
              steps.push(makeStep(n++, "Identify as quadratic: a·x² + b·x + c",
                `a = ${fmt(a)},  b = ${fmt(b)},  c = ${fmt(c)}`));

              if (isZero(a - 1)) {
                steps.push(makeStep(n++, `Find two numbers that multiply to c = ${fmt(c)} and add to b = ${fmt(b)}`, `p × q = ${fmt(c)},  p + q = ${fmt(b)}`));
              } else {
                steps.push(makeStep(n++, `Multiply a × c = ${fmt(a)} × ${fmt(c)} = ${fmt(a * c)}`, `Find factors of ${fmt(a * c)} that add to b = ${fmt(b)}`));
              }

              const factors = findIntegerFactors(a, b, c);

              if (factors) {
                const [p, q] = factors;
                if (isZero(a - 1)) {
                  const sign1 = p >= 0 ? "+" : "−";
                  const sign2 = q >= 0 ? "+" : "−";
                  steps.push(makeStep(n++, `Found: ${fmt(p)} × ${fmt(q)} = ${fmt(a * c)},  ${fmt(p)} + ${fmt(q)} = ${fmt(b)}`, `Factors: ${fmt(p)} and ${fmt(q)}`));
                  result = `(${variable} ${sign1} ${Math.abs(p)})(${variable} ${sign2} ${Math.abs(q)})`;
                  steps.push(makeStep(n++, "Write in factored form", result));
                } else {
                  steps.push(makeStep(n++, `Found: ${fmt(p)} × ${fmt(q)} = ${fmt(a * c)},  ${fmt(p)} + ${fmt(q)} = ${fmt(b)}`, `Split middle term: ${fmt(b)}${variable} = ${fmt(p)}${variable} + ${fmt(q)}${variable}`));
                  steps.push(makeStep(n++, "Rewrite expression", `${fmt(a)}${variable}² + ${fmt(p)}${variable} + ${fmt(q)}${variable} + ${fmt(c)}`));
                  steps.push(makeStep(n++, "Factor by grouping", `${variable}(${fmt(a)}${variable} + ${fmt(p)}) + ${fmt(c / q)}(${fmt(a)}${variable} + ${fmt(p)})`));
                  const f1a = a, f1c = p, f2a = 1, f2c = c / q;
                  const s1 = f1c >= 0 ? "+" : "-";
                  const s2 = f2c >= 0 ? "+" : "-";
                  result = `(${fmt(f1a)}${variable} ${s1} ${Math.abs(f1c)})(${fmt(f2a)}${variable} ${s2} ${Math.abs(f2c)})`;
                  steps.push(makeStep(n++, "Factored form", result));
                }

                const disc = b * b - 4 * a * c;
                const r1 = (-b + Math.sqrt(disc)) / (2 * a);
                const r2 = (-b - Math.sqrt(disc)) / (2 * a);
                steps.push(makeStep(n++, "Verify roots", `${variable} = ${fmt(r1)}  or  ${variable} = ${fmt(r2)}`));
              } else {
                steps.push(makeStep(n++, "No integer factors found — use quadratic formula", `Δ = b² − 4ac = ${fmt(b * b)} − ${fmt(4 * a * c)} = ${fmt(b * b - 4 * a * c)}`));
                const disc = b * b - 4 * a * c;
                if (disc < 0) {
                  result = "No real factors (Δ < 0 — complex roots)";
                  steps.push(makeStep(n++, "Discriminant is negative", result));
                } else {
                  const r1 = (-b + Math.sqrt(disc)) / (2 * a);
                  const r2 = (-b - Math.sqrt(disc)) / (2 * a);
                  result = isZero(r1 - r2)
                    ? `${fmt(a)}(${variable} − ${fmt(r1)})²`
                    : `${fmt(a)}(${variable} − ${fmt(r1)})(${variable} − ${fmt(r2)})`;
                  steps.push(makeStep(n++, "Factored using roots", result));
                }
              }
            } else if (!isZero(b)) {
              steps.push(makeStep(n++, "Linear expression — factor out common factor", `${variable}(${fmt(b)})`));
              result = !isZero(c) ? `${fmt(b)}(${variable} + ${fmt(c / b)})` : `${fmt(b)}${variable}`;
              steps.push(makeStep(n++, "Factored form", result));
            } else {
              const simplified = math.simplify(cleanExpr, { exactFractions: true }).toString();
              result = simplified;
              steps.push(makeStep(n++, "Simplified", result));
            }
          } else {
            const simplified = math.simplify(cleanExpr, { exactFractions: true }).toString();
            result = simplified;
            steps.push(makeStep(n++, "Simplified", result));
          }
        } else {
          result = math.simplify(factorExpr, { exactFractions: true }).toString();
          steps.push(makeStep(n++, "Result", result));
        }
        break;
      }

      // ───────────────────────────── SOLVE ─────────────────────────────
      case "solve": {
        const hasEq = cleanExpr.includes("=");
        let lhs: string, rhs: string;

        if (hasEq) {
          const idx = cleanExpr.indexOf("=");
          lhs = cleanExpr.slice(0, idx).trim();
          rhs = cleanExpr.slice(idx + 1).trim();
        } else {
          lhs = cleanExpr;
          rhs = "0";
        }

        steps.push(makeStep(n++, "Original equation", `${lhs} = ${rhs}`));

        const fStr = `(${lhs}) - (${rhs})`;
        const { a, b, c } = polyCoeffs(fStr, variable);

        if (!isZero(a)) {
          steps.push(makeStep(n++, "Rearrange to standard form: ax² + bx + c = 0",
            `${fmt(a)}${variable}² ${b >= 0 ? "+" : ""} ${fmt(b)}${variable} ${c >= 0 ? "+" : ""} ${fmt(c)} = 0`));
          steps.push(makeStep(n++, "Identify coefficients",
            `a = ${fmt(a)},  b = ${fmt(b)},  c = ${fmt(c)}`));

          const disc = b * b - 4 * a * c;
          steps.push(makeStep(n++, "Calculate discriminant: Δ = b² − 4ac",
            `Δ = (${fmt(b)})² − 4(${fmt(a)})(${fmt(c)}) = ${fmt(b * b)} − ${fmt(4 * a * c)} = ${fmt(disc)}`));

          if (disc < 0) {
            steps.push(makeStep(n++, "Δ < 0 — no real solutions", "The equation has no real roots"));
            result = "No real solutions (discriminant < 0)";
          } else if (isZero(disc)) {
            const x = -b / (2 * a);
            steps.push(makeStep(n++, "Δ = 0 — one repeated root", `${variable} = −b / 2a = ${fmt(-b)} / ${fmt(2 * a)}`));
            steps.push(makeStep(n++, "Solution", `${variable} = ${fmt(x)}`));
            result = `${variable} = ${fmt(x)}`;
          } else {
            steps.push(makeStep(n++, "Δ > 0 — two distinct real roots: apply quadratic formula",
              `${variable} = (−b ± √Δ) / 2a = (${fmt(-b)} ± √${fmt(disc)}) / ${fmt(2 * a)}`));
            const r1 = (-b + Math.sqrt(disc)) / (2 * a);
            const r2 = (-b - Math.sqrt(disc)) / (2 * a);
            steps.push(makeStep(n++, "First root: x₁ = (−b + √Δ) / 2a",
              `${variable}₁ = (${fmt(-b)} + ${fmt(Math.sqrt(disc))}) / ${fmt(2 * a)} = ${fmt(r1)}`));
            steps.push(makeStep(n++, "Second root: x₂ = (−b − √Δ) / 2a",
              `${variable}₂ = (${fmt(-b)} − ${fmt(Math.sqrt(disc))}) / ${fmt(2 * a)} = ${fmt(r2)}`));

            const intFactors = findIntegerFactors(a, b, c);
            if (intFactors) {
              const [p, q] = intFactors;
              const s1 = -p >= 0 ? "+" : "−";
              const s2 = -q >= 0 ? "+" : "−";
              const factored = isZero(a - 1)
                ? `(${variable} ${s1} ${Math.abs(-p)})(${variable} ${s2} ${Math.abs(-q)}) = 0`
                : `${fmt(a)}(${variable} − ${fmt(r1)})(${variable} − ${fmt(r2)}) = 0`;
              steps.push(makeStep(n++, "Factored form (verification)", factored));
            }

            result = `${variable} = ${fmt(r1)}  or  ${variable} = ${fmt(r2)}`;
            steps.push(makeStep(n++, "Solutions", result));
          }
        } else if (!isZero(b)) {
          steps.push(makeStep(n++, "Linear equation: isolate the variable", ""));
          if (!isZero(c)) {
            const moveDir = c > 0 ? `Subtract ${fmt(c)} from both sides` : `Add ${fmt(-c)} to both sides`;
            steps.push(makeStep(n++, moveDir, `${fmt(b)}${variable} = ${fmt(-c)}`));
          }
          const x = -c / b;
          if (!isZero(b - 1) && !isZero(b + 1)) {
            steps.push(makeStep(n++, `Divide both sides by ${fmt(b)}`,
              `${variable} = ${fmt(-c)} ÷ ${fmt(b)} = ${fmt(x)}`));
          }
          result = `${variable} = ${fmt(x)}`;
          steps.push(makeStep(n++, "Solution", result));
          isNumeric = true;
          numericValue = x;
        } else {
          if (isZero(c)) {
            result = `${variable} ∈ ℝ (all real numbers)`;
            steps.push(makeStep(n++, "Identity — true for all values", result));
          } else {
            result = "No solution (contradiction)";
            steps.push(makeStep(n++, "Contradiction — no solution exists", result));
          }
        }
        break;
      }

      // ───────────────────────────── DIFFERENTIATE ─────────────────────────────
      case "diff": {
        steps.push(makeStep(n++, `Differentiate with respect to ${variable}`, cleanExpr));

        if (!NON_POLY_RE.test(cleanExpr) && cleanExpr.includes(variable)) {
          const terms = extractPolyTerms(cleanExpr, variable);

          if (terms.length > 0) {
            steps.push(makeStep(n++, "Apply sum rule — differentiate each term separately",
              terms.map(({ coeff, power }) =>
                power === 0 ? `d/d${variable}(${fmt(coeff)})`
                  : `d/d${variable}(${fmt(coeff)}${variable}${power > 1 ? `^${power}` : ""})`
              ).join("  +  ")));

            const derivTerms: Array<{ coeff: number; power: number }> = [];
            for (const { coeff, power } of terms) {
              const rule = ruleForPolyTerm(coeff, power, variable);
              const dt = derivativeTerm(coeff, power);
              if (dt) {
                const termStr = dt.power === 0
                  ? fmt(dt.coeff)
                  : dt.power === 1 ? `${fmt(dt.coeff)}${variable}` : `${fmt(dt.coeff)}${variable}^${dt.power}`;
                steps.push(makeStep(n++, `Apply ${rule}`, `= ${termStr}`));
                derivTerms.push(dt);
              } else {
                steps.push(makeStep(n++, `Apply ${rule}`, `= 0`));
              }
            }

            const combined = buildPolyStr(derivTerms, variable);
            if (derivTerms.length > 1) {
              steps.push(makeStep(n++, "Combine all terms", combined));
            }

            const node = math.parse(cleanExpr);
            const derivNode = math.derivative(node, variable);
            result = math.simplify(derivNode).toString();
            steps.push(makeStep(n++, "Final derivative", result));
          } else {
            const node = math.parse(cleanExpr);
            const derived = math.derivative(node, variable);
            result = math.simplify(derived).toString();
            steps.push(makeStep(n++, "Applying differentiation rules", result));
          }
        } else {
          const node = math.parse(cleanExpr);
          const derived = math.derivative(node, variable);
          const simplified = math.simplify(derived);
          result = simplified.toString();

          if (cleanExpr.toLowerCase().includes("sin")) {
            steps.push(makeStep(n++, `Trig rule: d/d${variable}(sin(${variable})) = cos(${variable})`, ""));
          } else if (cleanExpr.toLowerCase().includes("cos")) {
            steps.push(makeStep(n++, `Trig rule: d/d${variable}(cos(${variable})) = −sin(${variable})`, ""));
          } else if (cleanExpr.includes("e^")) {
            steps.push(makeStep(n++, `Exponential rule: d/d${variable}(e^${variable}) = e^${variable}`, ""));
          } else if (cleanExpr.toLowerCase().includes("ln")) {
            steps.push(makeStep(n++, `Log rule: d/d${variable}(ln(${variable})) = 1/${variable}`, ""));
          }

          steps.push(makeStep(n++, "Result of differentiation", result));

          if (result !== simplified.toString()) {
            result = simplified.toString();
            steps.push(makeStep(n++, "Simplify", result));
          }
        }
        break;
      }

      // ───────────────────────────── INTEGRATE ─────────────────────────────
      case "integrate": {
        steps.push(makeStep(n++, `Find the indefinite integral: ∫ (${cleanExpr}) d${variable}`, ""));
        steps.push(makeStep(n++, "Reverse power rule: ∫ ax^n d" + variable + " = ax^(n+1)/(n+1) + C", ""));

        if (!NON_POLY_RE.test(cleanExpr)) {
          const terms = extractPolyTerms(cleanExpr, variable);

          if (terms.length > 0) {
            const intTerms: Array<{ coeff: number; power: number }> = [];
            for (const { coeff, power } of terms) {
              const it = integralTerm(coeff, power);
              const cStr = (n: number) => isZero(n - 1) ? "" : isZero(n + 1) ? "-" : fmt(n);
              const termStr = (c: number, p: number) =>
                p === 0 ? fmt(c)
                  : p === 1 ? `${cStr(c)}${variable}`
                    : `${cStr(c)}${variable}^${p}`;
              const label = power === 0
                ? `∫ ${fmt(coeff)} d${variable} = ${fmt(coeff)}${variable}`
                : `∫ ${fmt(coeff)}${power > 1 ? `${variable}^${power}` : variable} d${variable} = ${fmt(coeff)}${variable}^${it.power}/${it.power} = ${termStr(it.coeff, it.power)}`;
              steps.push(makeStep(n++, label, ""));
              intTerms.push(it);
            }

            const combined = buildPolyStr(intTerms, variable) + " + C";
            steps.push(makeStep(n++, "Combine all integrated terms", combined));
            result = combined;
          } else {
            result = `∫(${cleanExpr})d${variable} + C`;
            steps.push(makeStep(n++, "Integral", result));
          }
        } else {
          const lower = cleanExpr.toLowerCase();
          if (lower.includes("sin")) {
            result = `-cos(${variable}) + C`;
            steps.push(makeStep(n++, `Trig rule: ∫sin(${variable})d${variable} = −cos(${variable}) + C`, result));
          } else if (lower.includes("cos")) {
            result = `sin(${variable}) + C`;
            steps.push(makeStep(n++, `Trig rule: ∫cos(${variable})d${variable} = sin(${variable}) + C`, result));
          } else if (cleanExpr.includes("e^")) {
            result = `e^${variable} + C`;
            steps.push(makeStep(n++, `Exponential rule: ∫e^${variable}d${variable} = e^${variable} + C`, result));
          } else if (lower.includes("1/x") || lower.includes("x^-1")) {
            result = `ln|${variable}| + C`;
            steps.push(makeStep(n++, `Reciprocal rule: ∫(1/${variable})d${variable} = ln|${variable}| + C`, result));
          } else {
            result = `∫(${cleanExpr})d${variable} + C`;
            steps.push(makeStep(n++, "Result", result));
          }
        }

        steps.push(makeStep(n++, "Final answer (don't forget + C for indefinite integrals)", result));
        break;
      }

      // ───────────────────────────── LIMIT ─────────────────────────────
      case "limit": {
        steps.push(makeStep(n++, `Evaluate: lim(${variable} → ${limitPoint}) ${cleanExpr}`, ""));

        const directVal = (() => {
          try { return evalAt(cleanExpr, variable, limitPoint); } catch { return null; }
        })();

        if (directVal !== null && isFinite(directVal)) {
          steps.push(makeStep(n++, `Direct substitution: replace ${variable} with ${limitPoint}`, `= ${fmt(directVal)}`));
          result = fmt(directVal);
          isNumeric = true;
          numericValue = directVal;
        } else {
          steps.push(makeStep(n++, "Direct substitution gives indeterminate form — use limits from both sides", ""));
          const eps = 1e-8;
          const fromLeft = evalAt(cleanExpr, variable, limitPoint - eps);
          const fromRight = evalAt(cleanExpr, variable, limitPoint + eps);
          steps.push(makeStep(n++, `Approaching from left (${variable} → ${limitPoint}⁻)`, `≈ ${fmt(fromLeft)}`));
          steps.push(makeStep(n++, `Approaching from right (${variable} → ${limitPoint}⁺)`, `≈ ${fmt(fromRight)}`));

          const avg = (fromLeft + fromRight) / 2;
          if (Math.abs(fromLeft - fromRight) < 1e-5) {
            result = fmt(Math.round(avg * 1e10) / 1e10);
            isNumeric = isFinite(+result);
            numericValue = isNumeric ? +result : null;
            steps.push(makeStep(n++, "Both sides agree — limit exists", `lim = ${result}`));
          } else {
            result = "Limit does not exist";
            steps.push(makeStep(n++, "Sides disagree — limit does not exist", result));
          }
        }
        break;
      }

      default:
        throw new Error(`Unknown operation: ${detectedOp}`);
    }
  } catch (err) {
    throw new Error(`Computation failed: ${(err as Error).message}`);
  }

  return {
    expression: cleanExpr,
    operation: detectedOp,
    result,
    steps,
    isNumeric,
    numericValue,
  };
}

export const SUPPORTED_OPERATIONS = [
  {
    name: "evaluate",
    description: "Evaluate a numeric expression step by step",
    examples: ["3 + 4 * 2", "(10 / 2) ^ 3", "sqrt(144)"],
  },
  {
    name: "simplify",
    description: "Collect like terms and simplify an algebraic expression",
    examples: ["2x + 3x - x", "x^2 - x^2 + 1", "(x + 1)^2 - 1"],
  },
  {
    name: "expand",
    description: "Expand brackets using distributive law",
    examples: ["(x + 1)(x + 2)", "(x - 2)(x + 3)", "(2x + 1)^2"],
  },
  {
    name: "factor",
    description: "Factor a quadratic or polynomial expression with full working",
    examples: ["x^2 - 9", "x^2 + 5x + 6", "2x^2 + 7x + 3"],
  },
  {
    name: "solve",
    description: "Solve linear or quadratic equations with step-by-step working",
    examples: ["2x + 3 = 7", "x^2 - 5x + 6 = 0", "3x - 5 = x + 7"],
  },
  {
    name: "diff",
    description: "Differentiate term by term showing each rule applied",
    examples: ["x^3 + 2x", "3x^4 - 2x^2 + 5", "sin(x) + x^2"],
  },
  {
    name: "integrate",
    description: "Find the indefinite integral using the reverse power rule",
    examples: ["x^2 + 3x", "4x^3 - 2x + 1", "cos(x)"],
  },
  {
    name: "limit",
    description: "Evaluate the limit of an expression as a variable approaches a point",
    examples: ["sin(x) / x", "(x^2 - 1) / (x - 1)"],
  },
];
