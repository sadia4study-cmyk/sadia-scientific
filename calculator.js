const FN_LABEL = {
  sin: "sin",
  cos: "cos",
  tan: "tan",
  asin: "sin⁻¹",
  acos: "cos⁻¹",
  atan: "tan⁻¹",
  ln: "ln",
  log: "log",
  sqrt: "√",
  abs: "abs",
  exp: "e^",
};

const OP_LABEL = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "^": "^",
  "u-": "−",
};

const POST_LABEL = {
  fact: "!",
  percent: "%",
  square: "²",
};

const CONST_LABEL = {
  pi: "π",
  e: "e",
  ans: "Ans",
};

const state = {
  tokens: [],
  angle: "DEG",
  ans: 0,
  error: false,
  afterEquals: false,
  lastExpression: "",
};

function lastToken() {
  return state.tokens[state.tokens.length - 1];
}

function isValueToken(token) {
  return token && (token.type === "num" || token.type === "const" || token.type === "rparen" || token.type === "postfix");
}

function recover() {
  if (!state.error) return;
  state.error = false;
  state.tokens = [];
  state.afterEquals = false;
  state.lastExpression = "";
}

function startFreshValue() {
  recover();
  if (state.afterEquals) {
    state.tokens = [];
    state.afterEquals = false;
    state.lastExpression = "";
  }
}

function continueFromResult() {
  recover();
  state.afterEquals = false;
}

function pushImplicitMultiply() {
  if (isValueToken(lastToken())) {
    state.tokens.push({ type: "op", value: "*" });
  }
}

function inputDigit(digit) {
  startFreshValue();
  const token = lastToken();
  if (token && token.type === "num") {
    if (digit === "." && token.value.includes(".")) return;
    if (digit !== "." && token.value === "0") token.value = digit;
    else token.value += digit;
  } else {
    pushImplicitMultiply();
    state.tokens.push({ type: "num", value: digit === "." ? "0." : digit });
  }
  render();
}

function inputOp(op) {
  continueFromResult();
  const token = lastToken();
  if (!token) {
    if (op === "-") state.tokens.push({ type: "op", value: "u-" });
    render();
    return;
  }
  if (token.type === "op" && token.value === "u-") {
    state.tokens.pop();
    if (op !== "-") inputOp(op);
    else render();
    return;
  }
  if (token.type === "op") {
    if (op === "-") state.tokens.push({ type: "op", value: "u-" });
    else token.value = op;
    render();
    return;
  }
  if (token.type === "lparen" || token.type === "func") {
    if (op === "-") state.tokens.push({ type: "op", value: "u-" });
    render();
    return;
  }
  state.tokens.push({ type: "op", value: op });
  render();
}

function inputFunction(name) {
  startFreshValue();
  pushImplicitMultiply();
  state.tokens.push({ type: "func", value: name });
  state.tokens.push({ type: "lparen", value: "(" });
  render();
}

function inputConstant(name) {
  startFreshValue();
  pushImplicitMultiply();
  state.tokens.push({ type: "const", value: name });
  render();
}

function inputParen(paren) {
  if (paren === "(") {
    startFreshValue();
    pushImplicitMultiply();
    state.tokens.push({ type: "lparen", value: "(" });
    render();
    return;
  }
  continueFromResult();
  let open = 0;
  for (const token of state.tokens) {
    if (token.type === "lparen") open += 1;
    else if (token.type === "rparen") open -= 1;
  }
  if (open > 0 && isValueToken(lastToken())) {
    state.tokens.push({ type: "rparen", value: ")" });
  }
  render();
}

function inputPostfix(kind) {
  continueFromResult();
  if (!isValueToken(lastToken())) return;
  state.tokens.push({ type: "postfix", value: kind });
  render();
}

function inputReciprocal() {
  continueFromResult();
  if (!isValueToken(lastToken())) return;
  state.tokens.push(
    { type: "op", value: "^" },
    { type: "lparen", value: "(" },
    { type: "op", value: "u-" },
    { type: "num", value: "1" },
    { type: "rparen", value: ")" },
  );
  render();
}

function inputSign() {
  continueFromResult();
  const token = lastToken();
  if (!token) {
    state.tokens.push({ type: "op", value: "u-" });
    render();
    return;
  }
  if (token.type === "op") {
    if (token.value === "u-") state.tokens.pop();
    else state.tokens.push({ type: "op", value: "u-" });
    render();
    return;
  }
  const start = termStart(state.tokens.length - 1);
  const prev = state.tokens[start - 1];
  if (prev && prev.type === "op" && prev.value === "u-") state.tokens.splice(start - 1, 1);
  else state.tokens.splice(start, 0, { type: "op", value: "u-" });
  render();
}

function termStart(index) {
  const token = state.tokens[index];
  if (!token) return index;
  if (token.type === "postfix") return termStart(index - 1);
  if (token.type === "rparen") {
    let depth = 0;
    for (let i = index; i >= 0; i -= 1) {
      if (state.tokens[i].type === "rparen") depth += 1;
      else if (state.tokens[i].type === "lparen") {
        depth -= 1;
        if (depth === 0) {
          if (i > 0 && state.tokens[i - 1].type === "func") return i - 1;
          return i;
        }
      }
    }
  }
  return index;
}

function clearAll() {
  state.tokens = [];
  state.error = false;
  state.afterEquals = false;
  state.lastExpression = "";
  render();
}

function backspace() {
  if (state.error) {
    clearAll();
    return;
  }
  state.afterEquals = false;
  const token = lastToken();
  if (!token) {
    render();
    return;
  }
  if (token.type === "num" && token.value.length > 1) token.value = token.value.slice(0, -1);
  else state.tokens.pop();
  if (lastToken()?.type === "func") state.tokens.pop();
  render();
}

function equals() {
  if (!state.tokens.length) return;
  try {
    const prepared = prepare(state.tokens, true);
    const value = evaluateTokens(prepared, state.angle, state.ans);
    state.lastExpression = stringify(prepared);
    state.ans = value;
    state.tokens = [{ type: "num", value: canonicalize(value) }];
    state.afterEquals = true;
    state.error = false;
  } catch {
    state.error = true;
  }
  render();
}

function prepare(tokens, autocomplete) {
  const copy = tokens.map((token) => ({ ...token }));
  while (copy.length) {
    const token = copy[copy.length - 1];
    if (token.type === "op" || token.type === "func" || token.type === "lparen") {
      if (!autocomplete) throw new Error("incomplete");
      if (token.type === "lparen" && copy.length > 1 && copy[copy.length - 2].type === "func") {
        copy.pop();
        copy.pop();
        continue;
      }
      copy.pop();
      continue;
    }
    break;
  }
  if (!copy.length) throw new Error("empty");
  let open = 0;
  for (const token of copy) {
    if (token.type === "lparen") open += 1;
    if (token.type === "rparen") open -= 1;
    if (open < 0) throw new Error("paren");
  }
  if (open > 0) {
    if (!autocomplete) throw new Error("paren");
    while (open > 0) {
      copy.push({ type: "rparen", value: ")" });
      open -= 1;
    }
  }
  return copy;
}

function stringify(tokens) {
  let text = "";
  tokens.forEach((token) => {
    if (token.type === "num") text += token.value;
    else if (token.type === "const") text += CONST_LABEL[token.value];
    else if (token.type === "func") text += FN_LABEL[token.value];
    else if (token.type === "lparen") text += "(";
    else if (token.type === "rparen") text += ")";
    else if (token.type === "postfix") text += POST_LABEL[token.value];
    else if (token.type === "op" && token.value === "u-") text += "−";
    else if (token.type === "op") text += ` ${OP_LABEL[token.value]} `;
  });
  return text.trim();
}

function canonicalize(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "Error";
  if (Object.is(n, -0) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e10 || abs < 1e-7) {
    return n.toExponential(8).replace(/(\.\d*?)0+e/, "$1e").replace(/\.e/, "e");
  }
  return String(parseFloat(n.toPrecision(12)));
}

function evaluateTokens(tokens, angle, ans) {
  const output = [];
  const stack = [];
  const prec = { "+": 2, "-": 2, "*": 3, "/": 3, "u-": 3.5, "^": 4 };
  const rightAssoc = new Set(["^", "u-"]);

  for (const token of tokens) {
    if (token.type === "num" || token.type === "const" || token.type === "postfix") {
      output.push(token);
    } else if (token.type === "func") {
      stack.push(token);
    } else if (token.type === "op") {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.type !== "op") break;
        const lower = rightAssoc.has(token.value)
          ? prec[token.value] < prec[top.value]
          : prec[token.value] <= prec[top.value];
        if (!lower) break;
        output.push(stack.pop());
      }
      stack.push(token);
    } else if (token.type === "lparen") {
      stack.push(token);
    } else if (token.type === "rparen") {
      while (stack.length && stack[stack.length - 1].type !== "lparen") output.push(stack.pop());
      if (!stack.length) throw new Error("paren");
      stack.pop();
      if (stack.length && stack[stack.length - 1].type === "func") output.push(stack.pop());
    }
  }
  while (stack.length) {
    const token = stack.pop();
    if (token.type === "lparen" || token.type === "func") throw new Error("paren");
    output.push(token);
  }

  const values = [];
  for (const token of output) {
    if (token.type === "num") {
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new Error("num");
      values.push(value);
    } else if (token.type === "const") {
      if (token.value === "pi") values.push(Math.PI);
      else if (token.value === "e") values.push(Math.E);
      else if (token.value === "ans") values.push(ans);
      else throw new Error("const");
    } else if (token.type === "op" && token.value === "u-") {
      if (!values.length) throw new Error("stack");
      values.push(-values.pop());
    } else if (token.type === "op") {
      const b = values.pop();
      const a = values.pop();
      if (a === undefined || b === undefined) throw new Error("stack");
      values.push(applyOp(token.value, a, b));
    } else if (token.type === "postfix") {
      if (!values.length) throw new Error("stack");
      values.push(applyPostfix(token.value, values.pop()));
    } else if (token.type === "func") {
      if (!values.length) throw new Error("stack");
      values.push(applyFunc(token.value, values.pop(), angle));
    }
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error("math");
  return values[0];
}

function applyOp(op, a, b) {
  let value;
  if (op === "+") value = a + b;
  else if (op === "-") value = a - b;
  else if (op === "*") value = a * b;
  else if (op === "/") {
    if (b === 0) throw new Error("div0");
    value = a / b;
  } else if (op === "^") value = a ** b;
  else throw new Error("op");
  if (!Number.isFinite(value)) throw new Error("math");
  return value;
}

function applyPostfix(kind, a) {
  if (kind === "percent") return a / 100;
  if (kind === "square") return a * a;
  if (kind === "fact") return factorial(a);
  throw new Error("postfix");
}

function factorial(n) {
  if (!Number.isFinite(n) || n < 0 || Math.abs(n - Math.round(n)) > 1e-9) throw new Error("fact");
  const value = Math.round(n);
  if (value > 170) throw new Error("fact");
  let result = 1;
  for (let i = 2; i <= value; i += 1) result *= i;
  return result;
}

function applyFunc(name, x, angle) {
  const deg = angle === "DEG";
  const toRad = (n) => (deg ? (n * Math.PI) / 180 : n);
  const fromRad = (n) => (deg ? (n * 180) / Math.PI : n);
  let value;
  if (name === "sin") value = Math.sin(toRad(x));
  else if (name === "cos") value = Math.cos(toRad(x));
  else if (name === "tan") {
    const radians = toRad(x);
    if (Math.abs(Math.cos(radians)) < 1e-12) throw new Error("domain");
    value = Math.sin(radians) / Math.cos(radians);
  } else if (name === "asin") {
    if (x < -1 || x > 1) throw new Error("domain");
    value = fromRad(Math.asin(x));
  } else if (name === "acos") {
    if (x < -1 || x > 1) throw new Error("domain");
    value = fromRad(Math.acos(x));
  } else if (name === "atan") value = fromRad(Math.atan(x));
  else if (name === "ln") {
    if (x <= 0) throw new Error("domain");
    value = Math.log(x);
  } else if (name === "log") {
    if (x <= 0) throw new Error("domain");
    value = Math.log10(x);
  } else if (name === "sqrt") {
    if (x < 0) throw new Error("domain");
    value = Math.sqrt(x);
  } else if (name === "abs") value = Math.abs(x);
  else if (name === "exp") value = Math.exp(x);
  else throw new Error("fn");
  if (!Number.isFinite(value)) throw new Error("math");
  return value;
}

function preview() {
  if (!state.tokens.length || state.error) return "";
  try {
    return canonicalize(evaluateTokens(prepare(state.tokens, true), state.angle, state.ans));
  } catch {
    return "";
  }
}

function render() {
  const expr = document.querySelector("#expr");
  const result = document.querySelector("#result");
  if (!expr || !result) return;

  if (state.error) {
    expr.textContent = state.lastExpression || stringify(state.tokens);
    result.textContent = "Error";
    return;
  }
  if (state.afterEquals) {
    expr.textContent = state.lastExpression;
    result.textContent = state.tokens[0] ? state.tokens[0].value : "0";
    return;
  }
  expr.textContent = stringify(state.tokens);
  const live = preview();
  result.textContent = live || (state.tokens.length ? "" : "0");
  if (!state.tokens.length) result.textContent = "0";
}

function setAngle(angle) {
  state.angle = angle;
  document.querySelector("#degBtn").setAttribute("aria-pressed", String(angle === "DEG"));
  document.querySelector("#radBtn").setAttribute("aria-pressed", String(angle === "RAD"));
  try { localStorage.setItem("sadia-angle", angle); } catch { /* ignore */ }
  render();
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector("#dayBtn").setAttribute("aria-pressed", String(theme === "day"));
  document.querySelector("#nightBtn").setAttribute("aria-pressed", String(theme === "night"));
  try { localStorage.setItem("sadia-theme", theme); } catch { /* ignore */ }
}

function handleAction(button) {
  const act = button.dataset.act;
  if (act === "digit") inputDigit(button.dataset.value);
  else if (act === "op") inputOp(button.dataset.value);
  else if (act === "fn") inputFunction(button.dataset.value);
  else if (act === "const") inputConstant(button.dataset.value);
  else if (act === "paren") inputParen(button.dataset.value);
  else if (act === "postfix") inputPostfix(button.dataset.value);
  else if (act === "recip") inputReciprocal();
  else if (act === "sign") inputSign();
  else if (act === "clear") clearAll();
  else if (act === "del") backspace();
  else if (act === "eq") equals();
}

function onKeydown(event) {
  const key = event.key;
  if (/^[0-9]$/.test(key)) inputDigit(key);
  else if (key === ".") inputDigit(".");
  else if (key === "+") inputOp("+");
  else if (key === "-") inputOp("-");
  else if (key === "*") inputOp("*");
  else if (key === "/") {
    inputOp("/");
    event.preventDefault();
  } else if (key === "^") inputOp("^");
  else if (key === "(") inputParen("(");
  else if (key === ")") inputParen(")");
  else if (key === "%") inputPostfix("percent");
  else if (key === "!") inputPostfix("fact");
  else if (key === "Enter" || key === "=") {
    equals();
    event.preventDefault();
  } else if (key === "Backspace") {
    backspace();
    event.preventDefault();
  } else if (key === "Escape") clearAll();
  else return;
}

function init() {
  let angle = "DEG";
  try {
    const stored = localStorage.getItem("sadia-angle");
    if (stored === "RAD" || stored === "DEG") angle = stored;
  } catch { /* ignore */ }
  setAngle(angle);
  setTheme(document.documentElement.dataset.theme === "night" ? "night" : "day");

  document.querySelector(".keys").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (button) handleAction(button);
  });
  document.querySelectorAll("[data-theme-set]").forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.themeSet));
  });
  document.querySelectorAll("[data-angle]").forEach((button) => {
    button.addEventListener("click", () => setAngle(button.dataset.angle));
  });
  window.addEventListener("keydown", onKeydown);
  render();
}

if (typeof document !== "undefined") init();
