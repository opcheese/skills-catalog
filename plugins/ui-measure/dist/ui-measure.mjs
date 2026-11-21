#!/usr/bin/env node

// src/cli.ts
import { readFile as readFile2 } from "node:fs/promises";
import { resolve as resolve2 } from "node:path";

// src/baseline/baseline.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// src/errors.ts
var SetupError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SetupError";
  }
};
var NotComparableError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NotComparableError";
  }
};
var PartialRunError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PartialRunError";
  }
};
var BaselineExistsError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "BaselineExistsError";
  }
};

// src/baseline/baseline.ts
var GROWTH_TOLERANCE_PX = 2;
function roundNumbers(s) {
  if (s === void 0) return "";
  return s.replace(/-?\d+(?:\.\d+)?/g, (n) => String(Math.round(Number(n)) + 0));
}
function baselineKey(f) {
  const subject = f.target.designNode ?? f.target.selector;
  return [f.check, f.kind, subject, roundNumbers(f.expected), roundNumbers(f.actual)].join("|");
}
function classify(findings, baseline) {
  const known = new Map(baseline.map((b) => [baselineKey(b), b]));
  return findings.map((f) => {
    if (f.status !== "fail") {
      const { origin: _origin, ...rest } = f;
      return rest;
    }
    const was = known.get(baselineKey(f));
    return { ...f, origin: isSameDefect(f, was) ? "inherited" : "introduced" };
  });
}
function isSameDefect(now, was) {
  if (!was) return false;
  if (now.deltaPx !== void 0 && !Number.isFinite(now.deltaPx) || was.deltaPx !== void 0 && !Number.isFinite(was.deltaPx)) {
    return false;
  }
  if (now.deltaPx !== void 0 && was.deltaPx !== void 0 && now.deltaPx - was.deltaPx > GROWTH_TOLERANCE_PX) {
    return false;
  }
  return true;
}
function baselinePath(dir, target) {
  if (target === "" || target === "." || target === ".." || /[\\/]/.test(target)) {
    throw new Error(`unusable baseline target ${JSON.stringify(target)}: it must be a plain name, not a path`);
  }
  return path.join(dir, `${target}.json`);
}
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, sortKeys(v)])
    );
  }
  return value;
}
function serialiseBaseline(findings) {
  return `${JSON.stringify(sortKeys(findings), null, 2)}
`;
}
function readBaseline(dir, target) {
  const file = baselinePath(dir, target);
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${String(error)}`);
  }
  return validate(parsed, file);
}
function validate(parsed, file) {
  const bad = (why) => {
    throw new Error(`${file} is not a usable baseline: ${why}`);
  };
  if (!Array.isArray(parsed)) bad("not an array of findings");
  const seen = /* @__PURE__ */ new Set();
  for (const [i, raw] of parsed.entries()) {
    if (typeof raw !== "object" || raw === null) bad(`entry ${i} is not an object`);
    const f = raw;
    if (f.status !== "fail") bad(`entry ${i} is not a fail finding`);
    if (typeof f.check !== "string" || typeof f.kind !== "string") bad(`entry ${i} has no check or kind`);
    if (typeof f.target?.selector !== "string") bad(`entry ${i} has no target selector`);
    if (f.deltaPx !== void 0 && (typeof f.deltaPx !== "number" || !Number.isFinite(f.deltaPx))) {
      bad(`entry ${i} has a deltaPx that is not a finite number`);
    }
    for (const field of ["expected", "actual"]) {
      if (f[field] !== void 0 && typeof f[field] !== "string") bad(`entry ${i} has a non-string ${field}`);
    }
    const key = baselineKey(f);
    if (seen.has(key)) bad(`duplicate key ${key}`);
    seen.add(key);
  }
  return parsed;
}
var WHY_A_PARTIAL_RUN_IS_NOT_A_BASELINE = "A baseline recorded from a partial run silently narrows what the gate can ever detect: everything the run failed to measure is absent from the baseline, so a later run that does measure it reports it as introduced -- and a later run that drops it too reports nothing at all. Nothing was written. Fix the setup so every pair is measured, then record again.";
function recordBaseline(dir, target, r, opts = {}) {
  const file = baselinePath(dir, target);
  if (r.verdict === "not_comparable") {
    throw new PartialRunError(`REFUSING: this run was not comparable. ${WHY_A_PARTIAL_RUN_IS_NOT_A_BASELINE}`);
  }
  const unmeasured = r.findings.filter((f) => f.status === "not_comparable").length;
  if (r.coverage.dropped > 0 || unmeasured > 0) {
    throw new PartialRunError(
      `REFUSING: this run measured only part of the page -- ${r.coverage.dropped} pairs dropped, ${unmeasured} not_comparable findings. ${WHY_A_PARTIAL_RUN_IS_NOT_A_BASELINE}`
    );
  }
  if (!opts.force && existsSync(file)) {
    throw new BaselineExistsError(
      `REFUSING: a baseline for ${target} already exists at ${file}. An accidental refresh silently converts every introduced defect into an inherited one. Pass force to overwrite it deliberately.`
    );
  }
  const entries = r.findings.filter((f) => f.status === "fail").map(({ origin: _origin, ...rest }) => rest);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, serialiseBaseline(entries));
}

// src/config.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
var object = (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SetupError("config must contain objects");
  }
  return value;
};
var string = (value, name) => {
  if (typeof value !== "string" || value === "") throw new SetupError(`${name} must be a non-empty string`);
  return value;
};
var size = (value, name) => {
  if (!Array.isArray(value) || value.length !== 2 || value.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0)) {
    throw new SetupError(`${name} must be two positive numbers`);
  }
  return value;
};
function validateAdapter(value, name) {
  const adapter = object(value);
  const kind = string(adapter.kind, `${name}.kind`);
  if (kind === "url") {
    string(adapter.url, `${name}.url`);
    string(adapter.root, `${name}.root`);
    for (const key of ["mock", "steps"]) {
      if (adapter[key] !== void 0) string(adapter[key], `${name}.${key}`);
    }
  } else if (kind === "designharness") {
    string(adapter.baseUrl, `${name}.baseUrl`);
    string(adapter.component, `${name}.component`);
    if (adapter.state !== void 0) string(adapter.state, `${name}.state`);
  } else if (kind === "storybook") {
    string(adapter.baseUrl, `${name}.baseUrl`);
    string(adapter.storyId, `${name}.storyId`);
  } else {
    throw new SetupError(`${name}.kind must be url, designharness, or storybook`);
  }
  return adapter;
}
function localPath(base, value) {
  return isAbsolute(value) ? value : resolve(base, value);
}
function loadConfig(file) {
  const filename = resolve(file);
  let raw;
  try {
    raw = JSON.parse(readFileSync2(filename, "utf8"));
  } catch (error) {
    throw new SetupError(`could not load config ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const config = object(raw);
  const targets = object(config.targets);
  const base = dirname(filename);
  for (const [name, value] of Object.entries(targets)) {
    const target = object(value);
    const prefix = `target ${name}`;
    target.adapter = validateAdapter(target.adapter, `${prefix}.adapter`);
    target.viewport = size(target.viewport, `${prefix}.viewport`);
    if (target.screen !== void 0) target.screen = size(target.screen, `${prefix}.screen`);
    for (const key of ["designRootFontPx", "dpr"]) {
      const n = target[key];
      if (n !== void 0 && (typeof n !== "number" || !Number.isFinite(n) || n <= 0)) {
        throw new SetupError(`${prefix}.${key} must be a positive number`);
      }
    }
    if (target.node !== void 0) target.node = localPath(base, string(target.node, `${prefix}.node`));
    if (target.figma !== void 0) {
      const figma = object(target.figma);
      string(figma.nodeId, `${prefix}.figma.nodeId`);
      if (figma.fileKey !== void 0) string(figma.fileKey, `${prefix}.figma.fileKey`);
    }
    const adapter = target.adapter;
    if (adapter.kind === "url") {
      if (adapter.mock) adapter.mock = localPath(base, adapter.mock);
      if (adapter.steps) adapter.steps = localPath(base, adapter.steps);
    }
  }
  if (config.tokens !== void 0) {
    const tokens = object(config.tokens);
    tokens.path = localPath(base, string(tokens.path, "tokens.path"));
    if (tokens.format !== "rows" && tokens.format !== "dtcg") {
      throw new SetupError("tokens.format must be rows or dtcg");
    }
  }
  if (config.unthemed !== void 0) {
    if (!Array.isArray(config.unthemed) || config.unthemed.some((c) => typeof c !== "string")) {
      throw new SetupError("unthemed must be an array of strings");
    }
  }
  if (config.geometry !== void 0) {
    const geometry2 = object(config.geometry);
    if (typeof geometry2.insetPx !== "number" || !Number.isFinite(geometry2.insetPx) || geometry2.insetPx < 0) {
      throw new SetupError("geometry.insetPx must be a non-negative number");
    }
    if (!Array.isArray(geometry2.nonScrolling) || geometry2.nonScrolling.some((s) => typeof s !== "string")) {
      throw new SetupError("geometry.nonScrolling must be an array of selectors");
    }
  }
  if (config.baselineDir !== void 0) {
    config.baselineDir = localPath(base, string(config.baselineDir, "baselineDir"));
  }
  return config;
}

// src/correspondence/propose.ts
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
var ProposalError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ProposalError";
  }
};
function parseProposal(text, source) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProposalError(`${source} did not produce valid JSON`);
  }
  const v = value;
  const strings = (a) => Array.isArray(a) && a.every((s) => typeof s === "string");
  const ok = v !== null && typeof v === "object" && Array.isArray(v.pairs) && v.pairs.every(
    (p) => p !== null && typeof p === "object" && typeof p.nodeId === "string" && typeof p.selector === "string"
  ) && v.unmapped !== void 0 && v.unmapped !== null && strings(v.unmapped.design) && strings(v.unmapped.impl) && (v.authoritative === void 0 || typeof v.authoritative === "boolean") && (v.unmappedReasons === void 0 || v.unmappedReasons !== null && typeof v.unmappedReasons === "object" && !Array.isArray(v.unmappedReasons) && Object.values(v.unmappedReasons).every((r) => typeof r === "string"));
  if (!ok) throw new ProposalError(`${source} did not produce a Proposal`);
  return v;
}
function runCommand(argv, input) {
  return new Promise((resolve3, reject) => {
    if (argv.length === 0) {
      reject(new ProposalError("proposer command is empty"));
      return;
    }
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => out += d);
    child.stderr.on("data", (d) => err += d);
    child.on(
      "error",
      (e) => reject(new ProposalError(`could not run ${argv[0]}: ${e.message}`))
    );
    child.on("close", (code) => {
      if (code === 0) resolve3(out);
      else
        reject(
          new ProposalError(
            `${argv[0]} exited with ${code}${err ? `: ${err.trim()}` : ""}`
          )
        );
    });
    child.stdin.on("error", () => {
    });
    child.stdin.end(input);
  });
}
async function propose(p, design2, dom) {
  if (p.kind === "recorded") {
    let text;
    try {
      text = await readFile(p.file, "utf8");
    } catch (e) {
      throw new ProposalError(
        `could not read ${p.file}: ${e.message}`
      );
    }
    return parseProposal(text, p.file);
  }
  const stdout = await runCommand(p.argv, JSON.stringify({ design: design2, dom }));
  return parseProposal(stdout, p.argv[0]);
}

// src/correspondence/verify.ts
var SIZE_TOLERANCE_PX = 8;
var GRAPHIC_TYPES = /* @__PURE__ */ new Set([
  "VECTOR",
  "ELLIPSE",
  "RECTANGLE",
  "LINE",
  "STAR"
]);
var GRAPHIC_TAGS = /* @__PURE__ */ new Set(["svg", "path", "img", "circle", "rect", "canvas"]);
function hasText(el) {
  return (el.text ?? "").trim().length > 0;
}
function typeCompatible(node, el) {
  if (node.type === "TEXT") {
    return hasText(el) ? { ok: true } : { ok: false, note: `TEXT node mapped to <${el.tag}> carrying no text` };
  }
  if (GRAPHIC_TYPES.has(node.type)) {
    if (hasText(el)) {
      return {
        ok: false,
        note: `${node.type} mapped to a text-bearing element`
      };
    }
    return GRAPHIC_TAGS.has(el.tag) ? { ok: true } : { ok: false, note: `${node.type} mapped to <${el.tag}>` };
  }
  if (!hasText(el)) return { ok: true };
  return node.labelOnly ? { ok: true } : { ok: false, note: `${node.type} container mapped to a text leaf` };
}
function normalise(box, designRoot, domRoot, scale) {
  return {
    x: domRoot.x + (box.x - designRoot.x) * scale,
    y: domRoot.y + (box.y - designRoot.y) * scale,
    width: box.width * scale,
    height: box.height * scale
  };
}
function readingOrder(boxes) {
  const byY = boxes.map((box, index) => ({ box, index })).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const row = /* @__PURE__ */ new Map();
  let current = 0;
  let first = byY.length > 0 ? byY[0].box : null;
  for (const entry of byY) {
    if (first === null) first = entry.box;
    const centre = entry.box.y + entry.box.height / 2;
    const rowCentre = first.y + first.height / 2;
    const apart = Math.abs(centre - rowCentre);
    const shorter = Math.min(entry.box.height, first.height);
    if (!(shorter > 0 && apart <= shorter / 2)) {
      current += 1;
      first = entry.box;
    }
    row.set(entry.index, current);
  }
  return boxes.map((box, index) => ({ box, index })).sort(
    (a, b) => (row.get(a.index) ?? 0) - (row.get(b.index) ?? 0) || a.box.x - b.box.x || a.index - b.index
  ).map((entry) => entry.index);
}
function longestIncreasing(values) {
  const best = values.map(() => 1);
  const from = values.map(() => -1);
  let endAt = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < i; j++) {
      if (values[j] < values[i] && best[j] + 1 > best[i]) {
        best[i] = best[j] + 1;
        from[i] = j;
      }
    }
    if (best[i] > best[endAt]) endAt = i;
  }
  const keep = [];
  for (let i = values.length ? endAt : -1; i >= 0; i = from[i]) keep.push(i);
  return keep.reverse();
}
function comparableBox(node, el) {
  if (node.hugsWidth !== true) return el.box;
  return el.ink ?? el.box;
}
function verifyMapping(proposal, design2, dom, opts) {
  const nodesById = new Map(design2.nodes.map((n) => [n.id, n]));
  const elementsBySelector = new Map(dom.elements.map((e) => [e.selector, e]));
  const verdicts = proposal.pairs.map((p) => ({
    nodeId: p.nodeId,
    selector: p.selector,
    outcome: "accepted"
  }));
  const reject = (v, rule, note) => {
    if (v.outcome === "not_comparable") return;
    v.outcome = "not_comparable";
    v.rule = rule;
    v.note = note;
  };
  for (const v of verdicts) {
    if (!nodesById.has(v.nodeId)) {
      reject(v, "resolvable", `no design node ${v.nodeId}`);
    } else if (!elementsBySelector.has(v.selector)) {
      reject(
        v,
        "resolvable",
        opts.notes?.[v.selector] ?? `no element matching ${v.selector}`
      );
    }
  }
  const nodeUses = /* @__PURE__ */ new Map();
  const selectorUses = /* @__PURE__ */ new Map();
  for (const v of verdicts) {
    nodeUses.set(v.nodeId, (nodeUses.get(v.nodeId) ?? 0) + 1);
    selectorUses.set(v.selector, (selectorUses.get(v.selector) ?? 0) + 1);
  }
  for (const v of verdicts) {
    if ((selectorUses.get(v.selector) ?? 0) > 1) {
      reject(
        v,
        "injective",
        `element ${v.selector} is claimed by more than one node`
      );
    } else if ((nodeUses.get(v.nodeId) ?? 0) > 1) {
      reject(
        v,
        "injective",
        `node ${v.nodeId} is mapped to more than one element`
      );
    }
  }
  for (const v of verdicts) {
    if (v.outcome === "not_comparable") continue;
    const node = nodesById.get(v.nodeId);
    const el = elementsBySelector.get(v.selector);
    if (!node || !el) continue;
    const check = typeCompatible(node, el);
    if (!check.ok)
      reject(v, "type_compatible", check.note ?? "incompatible types");
  }
  const textOwners = /* @__PURE__ */ new Map();
  for (const v of verdicts) {
    const el = elementsBySelector.get(v.selector);
    const t = (el?.text ?? "").trim();
    if (!t) continue;
    textOwners.set(t, [...textOwners.get(t) ?? [], v.selector]);
  }
  for (const v of verdicts) {
    if (v.outcome === "not_comparable") continue;
    const node = nodesById.get(v.nodeId);
    const el = elementsBySelector.get(v.selector);
    const wanted = (node?.text ?? "").trim();
    if (!node || !el || !wanted) continue;
    if ((el.text ?? "").trim() === wanted) continue;
    const elsewhere = (textOwners.get(wanted) ?? []).filter(
      (sel) => sel !== v.selector
    );
    if (elsewhere.length > 0) {
      reject(
        v,
        "text_consistent",
        `node text ${JSON.stringify(wanted)} belongs to ${elsewhere.join(", ")}, not to ${v.selector}`
      );
    }
  }
  const geometric = [];
  for (const v of verdicts) {
    if (v.outcome === "not_comparable") continue;
    const node = nodesById.get(v.nodeId);
    const el = elementsBySelector.get(v.selector);
    if (!node || !el) continue;
    if (!node.box || !el.box || !design2.root.box || !dom.root.box) {
      reject(v, "measurable", "no box on one side; correspondence unverifiable");
      continue;
    }
    const normalised = normalise(
      node.box,
      design2.root.box,
      dom.root.box,
      opts.scale
    );
    if (!Number.isFinite(opts.scale) || opts.scale <= 0) {
      reject(v, "measurable", "scale must be finite and greater than zero");
      continue;
    }
    if (!Object.values(normalised).every(Number.isFinite)) {
      reject(
        v,
        "measurable",
        "boxes could not be normalised (degenerate root box)"
      );
      continue;
    }
    const domBox = comparableBox(node, el);
    if (!Object.values(domBox).every(Number.isFinite)) {
      reject(v, "measurable", "a box carries a non-finite coordinate");
      continue;
    }
    geometric.push({ v, design: normalised, dom: domBox });
  }
  if (geometric.length > 1) {
    const rank = (boxes) => {
      const out = /* @__PURE__ */ new Map();
      const order = readingOrder(boxes);
      for (let r = 0; r < order.length; r++) out.set(order[r], r);
      return out;
    };
    const designRank = rank(geometric.map((g) => g.design));
    const domRank = rank(geometric.map((g) => g.dom));
    const byDesign = geometric.map((_, idx) => idx).sort((a, b) => (designRank.get(a) ?? 0) - (designRank.get(b) ?? 0));
    const keep = new Set(
      longestIncreasing(byDesign.map((idx) => domRank.get(idx) ?? 0)).map(
        (pos) => byDesign[pos]
      )
    );
    for (let idx = 0; idx < geometric.length; idx++) {
      if (keep.has(idx)) continue;
      reject(
        geometric[idx].v,
        "order_consistent",
        "reading order on the two sides disagrees about this pair"
      );
    }
  }
  for (const g of geometric) {
    if (g.v.outcome === "not_comparable") continue;
    const dw = Math.abs(g.design.width - g.dom.width);
    const dh = Math.abs(g.design.height - g.dom.height);
    const worst = Math.max(dw, dh);
    if (!Number.isFinite(worst)) {
      reject(g.v, "measurable", "a box carries a non-finite coordinate");
      continue;
    }
    const tolerance = SIZE_TOLERANCE_PX * opts.scale;
    if (worst > tolerance) {
      reject(
        g.v,
        "size_plausible",
        `sizes differ by ${worst.toFixed(2)}px after normalisation, over the ${tolerance.toFixed(2)}px plausibility tolerance (${SIZE_TOLERANCE_PX} design px x scale ${opts.scale})`
      );
    }
  }
  const collapse = (t) => (t ?? "").replace(/\s+/g, " ").trim();
  const sameText = (v) => {
    const wanted = collapse(nodesById.get(v.nodeId)?.text);
    return wanted !== "" && wanted === collapse(elementsBySelector.get(v.selector)?.text);
  };
  for (const v of verdicts) {
    if (v.outcome !== "not_comparable" || v.rule !== "size_plausible") continue;
    if (sameText(v)) v.outcome = "size_differs";
  }
  const good = (v) => v.outcome === "accepted" || v.outcome === "size_differs";
  let rescued = true;
  while (rescued) {
    rescued = false;
    for (const g of geometric) {
      if (g.v.outcome !== "not_comparable" || g.v.rule !== "size_plausible") {
        continue;
      }
      const prefix = `${g.v.selector} > `;
      const children = verdicts.filter(
        (o) => o.selector.startsWith(prefix) && nodesById.get(o.nodeId)?.parentId === g.v.nodeId
      );
      if (children.length < 2) continue;
      if (!children.every(good)) continue;
      g.v.outcome = "size_differs";
      g.v.note = "kept despite its size: all its mapped children paired";
      delete g.v.rule;
      rescued = true;
    }
  }
  const segments = (selector) => selector.split(" > ");
  const commonAncestor = (selectors) => {
    let common = segments(selectors[0]);
    for (const sel of selectors.slice(1)) {
      const parts = segments(sel);
      let n = 0;
      while (n < common.length && n < parts.length && common[n] === parts[n]) {
        n += 1;
      }
      common = common.slice(0, n);
    }
    return common;
  };
  const isContainerOfSiblings = (v) => {
    const kids = verdicts.filter(
      (o) => o.outcome === "accepted" && nodesById.get(o.nodeId)?.parentId === v.nodeId
    );
    if (kids.length < 2) return false;
    return commonAncestor(kids.map((k) => k.selector)).join(" > ") === v.selector;
  };
  for (const v of verdicts) {
    if (v.outcome !== "not_comparable" || v.rule !== "size_plausible") continue;
    if (isContainerOfSiblings(v)) v.outcome = "size_differs";
  }
  const accepted = verdicts.filter((v) => v.outcome === "accepted");
  const sizeDiffers = verdicts.filter((v) => v.outcome === "size_differs");
  const failed = verdicts.length - accepted.length - sizeDiffers.length;
  const rejected = verdicts.length === 0 || failed * 2 > verdicts.length;
  return {
    pairs: verdicts,
    accepted,
    sizeDiffers,
    rejected,
    note: rejected ? `${failed} of ${verdicts.length} pairs failed verification \u2014 the proposal is unusable; fall back to root-and-counts` : void 0
  };
}

// src/dom/adapters.ts
function adapterTarget(adapter) {
  switch (adapter.kind) {
    case "designharness": {
      const u = new URL(adapter.baseUrl);
      u.searchParams.set("c", adapter.component);
      if (adapter.state !== void 0) u.searchParams.set("state", adapter.state);
      return { url: u.toString(), rootSelector: "#harness-root > :nth-child(1)" };
    }
    case "storybook": {
      const base = adapter.baseUrl.replace(/\/+$/, "");
      const u = new URL(`${base}/iframe.html`);
      u.searchParams.set("id", adapter.storyId);
      u.searchParams.set("viewMode", "story");
      return { url: u.toString(), rootSelector: "#storybook-root > :nth-child(1)" };
    }
    case "url":
      return { url: adapter.url, rootSelector: adapter.root };
  }
}

// src/dom/open.ts
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    try {
      const resolved = createRequire(join(process.cwd(), "noop.js")).resolve("playwright");
      return await import(pathToFileURL(resolved).href);
    } catch {
      try {
        const { stdout } = await execFileAsync("pnpm", ["root", "-g"], { encoding: "utf8" });
        if (!stdout.trim()) throw new Error("no global node_modules");
        const resolved = createRequire(join(stdout.trim(), "noop.js")).resolve("playwright");
        return await import(pathToFileURL(resolved).href);
      } catch {
        throw new SetupError("Playwright is not installed; install playwright with: pnpm add -D playwright && pnpm exec playwright install chromium");
      }
    }
  }
}
async function runModule(path2, arg) {
  const mod = await import(pathToFileURL(path2).href);
  if (typeof mod.default !== "function") {
    throw new SetupError(`${path2} must default-export a function`);
  }
  await mod.default(arg);
}
async function openPage(spec2, opts = {}) {
  const { url, rootSelector } = adapterTarget(spec2.adapter);
  const [vw, vh] = spec2.viewport;
  const screen = spec2.screen ?? spec2.viewport;
  const dpr = spec2.dpr ?? 1;
  let browser = opts.browser;
  const ownsBrowser = browser === void 0;
  if (browser === void 0) {
    const pw = await loadPlaywright();
    try {
      browser = await pw.chromium.launch();
    } catch (e) {
      throw new SetupError(
        `Could not launch Chromium (${e instanceof Error ? e.message.split("\n")[0] : String(e)}). Run: pnpm exec playwright install chromium`
      );
    }
  }
  const owned = browser;
  let context;
  const close = async () => {
    try {
      await context?.close();
    } finally {
      if (ownsBrowser) await owned.close();
    }
  };
  try {
    context = await browser.newContext({
      viewport: { width: vw, height: vh },
      screen: { width: screen[0], height: screen[1] },
      deviceScaleFactor: dpr,
      reducedMotion: "reduce"
    });
    if (spec2.adapter.kind === "url" && spec2.adapter.mock) await runModule(spec2.adapter.mock, context);
    const page = await context.newPage();
    let response;
    try {
      response = await page.goto(url, { waitUntil: "load" });
    } catch (e) {
      await close();
      return { notComparable: `page did not load: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` };
    }
    if (response === null || response.status() >= 400) {
      await close();
      return { notComparable: `page answered HTTP ${response === null ? "none" : response.status()} for ${url}` };
    }
    await page.evaluate(() => document.fonts.ready.then(() => void 0));
    const found = await page.waitForSelector(rootSelector, { state: "attached", timeout: 3e3 }).then(() => true, () => false);
    if (!found) {
      await close();
      return { notComparable: `root ${rootSelector} not found` };
    }
    const hiddenBefore = await rootIsHidden(page, rootSelector);
    if (hiddenBefore) {
      await close();
      return { notComparable: `root ${rootSelector} is hidden` };
    }
    if (spec2.adapter.kind === "url" && spec2.adapter.steps) {
      await runModule(spec2.adapter.steps, page);
      await page.evaluate(() => document.fonts.ready.then(() => void 0));
      const after = await rootIsHidden(page, rootSelector);
      if (after === null) {
        await close();
        return { notComparable: `root ${rootSelector} not found after steps` };
      }
      if (after) {
        await close();
        return { notComparable: `root ${rootSelector} is hidden after steps` };
      }
    }
    const liveRootFontPx = await page.evaluate(
      () => parseFloat(getComputedStyle(document.documentElement).fontSize)
    );
    const scale = liveRootFontPx / (spec2.designRootFontPx ?? liveRootFontPx);
    return {
      page,
      rootSelector,
      scale,
      info: { url: page.url(), viewport: [vw, vh], screen: [screen[0], screen[1]], dpr },
      close
    };
  } catch (e) {
    await close().catch(() => void 0);
    throw e;
  }
}
async function rootIsHidden(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return true;
    if (getComputedStyle(el).visibility === "hidden") return true;
    for (let n = el; n; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (st.display === "none" || st.opacity === "0") return true;
    }
    return false;
  }, selector);
}

// src/dom/resolve.ts
function isUnbalanced(selector) {
  const open = [];
  let quote = null;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "\\") {
      i++;
    } else if (quote !== null) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "[" || c === "(") {
      open.push(c === "[" ? "]" : ")");
    } else if (c === "]" || c === ")") {
      if (open.pop() !== c) return true;
    }
  }
  return quote !== null || open.length > 0;
}
async function resolveProposal(p, dom, proposal) {
  const known = new Set(dom.elements.map((e) => e.selector));
  const unknown = [...new Set(proposal.pairs.map((x) => x.selector).filter((s) => !known.has(s)))];
  const resolved = /* @__PURE__ */ new Map();
  const wanted = [];
  for (const sel of unknown) {
    if (isUnbalanced(sel)) resolved.set(sel, { note: "invalid selector" });
    else wanted.push(sel);
  }
  if (wanted.length > 0) {
    const results = await p.page.evaluate(
      ({ rootSelector, selectors }) => {
        const root = document.querySelector(rootSelector);
        return selectors.map((sel) => {
          let matches;
          try {
            matches = Array.from(document.querySelectorAll(sel));
          } catch {
            return { note: "invalid selector" };
          }
          if (matches.length === 0) return { note: "no element" };
          const inside = matches.filter((el) => root !== null && (root === el || root.contains(el)));
          if (inside.length === 0) return { note: "no element inside root" };
          if (inside.length > 1) return { note: `ambiguous: ${inside.length} elements` };
          const steps = [];
          let node = inside[0];
          while (root !== null && node !== root && node.parentElement) {
            steps.unshift(Array.from(node.parentElement.children).indexOf(node) + 1);
            node = node.parentElement;
          }
          return { path: rootSelector + steps.map((i) => ` > :nth-child(${i})`).join("") };
        });
      },
      { rootSelector: p.rootSelector, selectors: wanted }
    );
    wanted.forEach((sel, i) => resolved.set(sel, results[i]));
  }
  const notes = {};
  const pairs = proposal.pairs.map((pair) => {
    const r = resolved.get(pair.selector);
    if (r === void 0) return pair;
    if ("path" in r) return { ...pair, selector: r.path };
    notes[pair.selector] = r.note;
    return pair;
  });
  return { proposal: { ...proposal, pairs }, notes };
}

// src/dom/tree.ts
async function domTree(p) {
  const elements = await p.page.evaluate((rootSelector) => {
    const first = document.querySelector(rootSelector);
    if (!first) throw new Error(`root ${rootSelector} not found`);
    const out = [];
    const stack = [{ el: first, selector: rootSelector }];
    while (stack.length > 0) {
      const item = stack.pop();
      if (!item) break;
      const style = getComputedStyle(item.el);
      const isRoot = item.el === first;
      if (!isRoot && (style.display === "none" || style.opacity === "0")) continue;
      const hidden = !isRoot && style.visibility === "hidden";
      const kids = Array.from(item.el.children);
      if (!hidden) {
        const rect = item.el.getBoundingClientRect();
        let own = "";
        for (const child of Array.from(item.el.childNodes)) {
          if (child.nodeType === 3) own += child.nodeValue ?? "";
        }
        own = own.trim();
        const testid = item.el.getAttribute("data-testid");
        let ink = null;
        if (item.el.children.length === 0 && own) {
          const range = document.createRange();
          range.selectNodeContents(item.el);
          const r = range.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.width <= rect.width + 0.5) {
            ink = { x: r.x, y: r.y, width: r.width, height: r.height };
          }
        }
        if (ink === null && item.el instanceof SVGGraphicsElement) {
          const b = item.el.getBBox();
          const own2 = item.el.getBoundingClientRect();
          if (b.width > 0 && b.height > 0 && own2.width > 0) {
            const root = item.el.ownerSVGElement ?? item.el;
            const rootRect = root.getBoundingClientRect();
            const vb = root.viewBox?.baseVal;
            const k = vb && vb.width > 0 ? rootRect.width / vb.width : 1;
            ink = {
              x: rootRect.x + (b.x - (vb?.x ?? 0)) * k,
              y: rootRect.y + (b.y - (vb?.y ?? 0)) * k,
              width: b.width * k,
              height: b.height * k
            };
          }
        }
        out.push({
          selector: item.selector,
          tag: item.el.tagName.toLowerCase(),
          ...testid ? { testid } : {},
          ...own ? { text: own } : {},
          ...ink ? { ink } : {},
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          style: {
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderTopWidth: style.borderTopWidth,
            borderRightWidth: style.borderRightWidth,
            borderBottomWidth: style.borderBottomWidth,
            borderLeftWidth: style.borderLeftWidth,
            borderTopLeftRadius: style.borderTopLeftRadius,
            borderTopRightRadius: style.borderTopRightRadius,
            borderBottomRightRadius: style.borderBottomRightRadius,
            borderBottomLeftRadius: style.borderBottomLeftRadius,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            boxShadow: style.boxShadow,
            filter: style.filter,
            backdropFilter: style.backdropFilter
          }
        });
      }
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({ el: kids[i], selector: `${item.selector} > :nth-child(${i + 1})` });
      }
    }
    return out;
  }, p.rootSelector);
  return { root: elements[0], elements };
}

// src/figma/fetch.ts
async function fetchNode(fileKey, nodeId, token) {
  const url = `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(nodeId)}`;
  const res = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (!res.ok) {
    throw new Error(`Figma API request failed with HTTP ${res.status}`);
  }
  return res.json();
}

// src/figma/read.ts
function readNode(json, nodeId) {
  const requireNode = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value) || typeof value.id !== "string" || value.id === "" || typeof value.type !== "string" || value.type === "") {
      throw new Error("Figma node must be an object with non-empty string id and type fields");
    }
    return value;
  };
  const raw = json;
  const nodes = raw?.nodes;
  if (nodes && typeof nodes === "object" && !Array.isArray(nodes)) {
    const map = nodes;
    const ids = Object.keys(map);
    if (ids.length === 0) throw new Error("Figma response contains no nodes");
    if (nodeId !== void 0) {
      const hit = map[nodeId];
      if (!hit) {
        throw new Error(
          `response has no node '${nodeId}'. present: ${ids.join(", ")}`
        );
      }
      if (!hit.document) throw new Error(`response node '${nodeId}' has no document`);
      return requireNode(hit.document);
    }
    if (ids.length > 1) {
      throw new Error(
        `response carries ${ids.length} nodes (${ids.join(", ")}); pass --node-id to say which one to measure`
      );
    }
    const only = map[ids[0]];
    if (!only?.document) throw new Error(`response node '${ids[0]}' has no document`);
    return requireNode(only.document);
  }
  return requireNode(json);
}
var hex = (n) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0");
function colour(c, extra = 1) {
  const a = Math.round((c.a ?? 1) * extra * 1e3) / 1e3;
  if (a >= 1) return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
  const ch = (n) => Math.round(Math.min(1, Math.max(0, n)) * 255);
  return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${a})`;
}
function firstSolidFill(fills) {
  const hit = fills?.find(
    (f) => f.type === "SOLID" && f.visible !== false && f.color
  );
  return hit?.color ? colour(hit.color, hit.opacity ?? 1) : void 0;
}
function effectStrings(effects) {
  const out = [];
  for (const e of effects ?? []) {
    if (e.visible === false || !e.type) continue;
    const parts = [e.type];
    if (e.offset) parts.push(e.offset.x, e.offset.y);
    if (e.radius !== void 0) parts.push(e.radius);
    if (e.spread) parts.push(e.spread);
    if (e.color) parts.push(colour(e.color));
    out.push(parts.join(" "));
  }
  return out;
}
function readOne(node, kids, parentId) {
  const self = {
    id: node.id,
    name: node.name,
    type: node.type,
    box: node.absoluteBoundingBox,
    ...parentId !== void 0 ? { parentId } : {},
    ...node.characters ? { text: node.characters } : {},
    // Spread rather than `hugsWidth: node.layoutSizingHorizontal === "HUG"`:
    // an explicit `false` and an absent field mean different things to the
    // verifier, and only the absent one means "Figma said nothing".
    ...node.layoutSizingHorizontal === "HUG" ? { hugsWidth: true } : {}
  };
  if (kids.length === 1 && kids[0].type === "TEXT") self.labelOnly = true;
  if (node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL") {
    self.layout = {
      mode: node.layoutMode,
      gap: node.itemSpacing ?? 0,
      padding: [
        node.paddingTop ?? 0,
        node.paddingRight ?? 0,
        node.paddingBottom ?? 0,
        node.paddingLeft ?? 0
      ]
    };
  }
  if (typeof node.cornerRadius === "number") self.radius = node.cornerRadius;
  if (node.rectangleCornerRadii) self.radii = [...node.rectangleCornerRadii];
  if (typeof node.strokeWeight === "number") self.strokeWeight = node.strokeWeight;
  const fill = firstSolidFill(node.fills);
  if (fill) self.fill = fill;
  if (node.style && typeof node.style.fontFamily === "string" && typeof node.style.fontSize === "number" && typeof node.style.fontWeight === "number") {
    self.font = {
      family: node.style.fontFamily,
      size: node.style.fontSize,
      weight: node.style.fontWeight,
      ...typeof node.style.lineHeightPx === "number" ? { lineHeight: node.style.lineHeightPx } : {}
    };
  }
  const effects = effectStrings(node.effects);
  if (effects.length) self.effects = effects;
  return self;
}
function flatten(root) {
  if (root.visible === false) throw new NotComparableError("design root is hidden");
  const nodes = [];
  const walk = (node, parentId) => {
    const kids = (node.children ?? []).filter((c) => c.visible !== false);
    nodes.push(readOne(node, kids, parentId));
    for (const k of kids) walk(k, node.id);
  };
  walk(root);
  return { root: nodes[0], nodes };
}

// src/geometry/detect.ts
async function detectGeometry(p, cfg) {
  const raw = await p.page.evaluate(
    ({ rootSelector, insetPx, nonScrolling, scale }) => {
      const first = document.querySelector(rootSelector);
      if (!first) throw new Error(`root ${rootSelector} not found`);
      const htmlStyle = getComputedStyle(document.documentElement);
      const TOL = 2 * scale;
      const out = [];
      const drawn = /* @__PURE__ */ new Map();
      const stack = [{ el: first, selector: rootSelector }];
      while (stack.length > 0) {
        const item = stack.pop();
        if (!item) break;
        const el = item.el;
        const style = getComputedStyle(el);
        const isRoot = el === first;
        if (!isRoot && (style.display === "none" || style.opacity === "0")) continue;
        const kids = Array.from(el.children);
        for (let i = kids.length - 1; i >= 0; i--) {
          stack.push({ el: kids[i], selector: `${item.selector} > :nth-child(${i + 1})` });
        }
        if (!isRoot && style.visibility === "hidden") continue;
        if (style.display === "contents") continue;
        drawn.set(el, item.selector);
        const ownNodes = [];
        let own = "";
        for (const child of Array.from(el.childNodes)) {
          if (child.nodeType === 3) {
            ownNodes.push(child);
            own += child.nodeValue ?? "";
          }
        }
        own = own.trim();
        const rect = el.getBoundingClientRect();
        const base = { selector: item.selector, text: own.slice(0, 80) };
        if (own) {
          if (rect.width === 0 || rect.height === 0) {
            out.push({
              ...base,
              kind: "zero-size",
              expected: "non-zero box",
              actual: `${rect.width}x${rect.height}px`,
              deltaPx: 0
            });
            continue;
          }
          let clipped = null;
          let n = el;
          while (n && n !== document.body && n !== document.documentElement) {
            const ns = getComputedStyle(n);
            const clipX = ns.overflowX === "hidden" || ns.overflowX === "clip";
            const clipY = ns.overflowY === "hidden" || ns.overflowY === "clip";
            if ((clipX || clipY) && ns.textOverflow !== "ellipsis") {
              if (n === el) {
                const overX = clipX ? el.scrollWidth - el.clientWidth : 0;
                const overY = clipY ? el.scrollHeight - el.clientHeight : 0;
                const over = Math.max(overX, overY);
                if (over > TOL) {
                  clipped = { ...base, kind: "clipped", expected: "all text inside its own box", actual: `${over}px cut off`, deltaPx: over };
                }
              } else {
                const r = n.getBoundingClientRect();
                const left = r.left + n.clientLeft;
                const top = r.top + n.clientTop;
                const right = left + n.clientWidth;
                const bottom = top + n.clientHeight;
                const overX = clipX ? Math.max(left - rect.left, rect.right - right) : 0;
                const overY = clipY ? Math.max(top - rect.top, rect.bottom - bottom) : 0;
                const over = Math.max(overX, overY);
                if (over > TOL) {
                  clipped = { ...base, kind: "clipped", expected: "inside the clipping ancestor", actual: `${Math.round(over * 10) / 10}px past it`, deltaPx: over };
                }
              }
              if (clipped) break;
            }
            n = n.parentElement;
          }
          if (clipped) {
            out.push(clipped);
            continue;
          }
        }
        let scrollsX = false;
        let scrollsY = false;
        for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
          const as = getComputedStyle(a);
          if ((as.overflowX === "auto" || as.overflowX === "scroll") && a.scrollWidth > a.clientWidth) scrollsX = true;
          if ((as.overflowY === "auto" || as.overflowY === "scroll") && a.scrollHeight > a.clientHeight) scrollsY = true;
        }
        const de = document.documentElement;
        const bodyStyle = getComputedStyle(document.body);
        const clipsY = [htmlStyle.overflowY, bodyStyle.overflowY].some((v) => v === "hidden" || v === "clip");
        const bottomChecked = clipsY || de.scrollHeight <= de.clientHeight;
        const past = Math.max(
          -(rect.left + window.scrollX),
          -(rect.top + window.scrollY),
          scrollsX ? 0 : rect.right + window.scrollX - de.clientWidth,
          !scrollsY && bottomChecked ? rect.bottom + window.scrollY - de.clientHeight : 0
        );
        if (past > TOL) {
          out.push({
            ...base,
            kind: "off-canvas",
            expected: "inside the viewport",
            actual: `${Math.round(past * 10) / 10}px outside`,
            deltaPx: past
          });
          continue;
        }
        if (!own) continue;
        let box = el;
        while (box && box !== document.body && box !== document.documentElement) {
          const bs = getComputedStyle(box);
          const bordered = parseFloat(bs.borderTopWidth) > 0 || parseFloat(bs.borderRightWidth) > 0 || parseFloat(bs.borderBottomWidth) > 0 || parseFloat(bs.borderLeftWidth) > 0;
          const bg = bs.backgroundColor;
          const filled = bg !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(bg) && bg !== "rgba(0, 0, 0, 0)";
          if (bordered || filled || bs.backgroundImage !== "none") break;
          box = box.parentElement;
        }
        if (box && box !== document.body && box !== document.documentElement) {
          let l = Infinity;
          let t = Infinity;
          let r = -Infinity;
          let b = -Infinity;
          for (const node of ownNodes) {
            if (!node.nodeValue || !node.nodeValue.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const q of Array.from(range.getClientRects())) {
              if (q.width === 0 || q.height === 0) continue;
              l = Math.min(l, q.left);
              t = Math.min(t, q.top);
              r = Math.max(r, q.right);
              b = Math.max(b, q.bottom);
            }
          }
          if (l !== Infinity) {
            const br = box.getBoundingClientRect();
            const pl = br.left + box.clientLeft;
            const pt = br.top + box.clientTop;
            const sides = [
              ["left", l - pl],
              ["top", t - pt],
              ["right", pl + box.clientWidth - r],
              ["bottom", pt + box.clientHeight - b]
            ];
            let worst = null;
            for (const s of sides) {
              if (s[1] >= 0 && s[1] < insetPx && (worst === null || s[1] < worst[1])) worst = s;
            }
            if (worst) {
              out.push({
                ...base,
                kind: "flush-edge",
                expected: `at least ${insetPx}px from the container edge`,
                actual: `${worst[0]} ${Math.round(worst[1] * 10) / 10}px`,
                deltaPx: Math.round((insetPx - worst[1]) * 10) / 10
              });
            }
          }
        }
      }
      for (const sel of nonScrolling) {
        const hits = Array.from(document.querySelectorAll(sel));
        for (const el of hits) {
          const selector = drawn.get(el);
          if (selector === void 0) continue;
          const overY = el.scrollHeight - el.clientHeight;
          const overX = el.scrollWidth - el.clientWidth;
          if (overY > 0 || overX > 0) {
            out.push({
              selector,
              kind: "scrollbar",
              expected: "content fits without scrolling",
              actual: `${overX > 0 ? `${overX}px wider` : ""}${overX > 0 && overY > 0 ? ", " : ""}${overY > 0 ? `${overY}px taller` : ""} than the box`,
              deltaPx: Math.max(overX, overY)
            });
          }
        }
      }
      return out;
    },
    { rootSelector: p.rootSelector, insetPx: cfg.insetPx, nonScrolling: cfg.nonScrolling, scale: p.scale }
  );
  return raw.map((r) => ({
    check: "geometry",
    kind: r.kind,
    status: "fail",
    target: { selector: r.selector, ...r.text ? { text: r.text } : {} },
    ...r.expected ? { expected: r.expected } : {},
    ...r.actual ? { actual: r.actual } : {},
    ...r.deltaPx !== void 0 ? { deltaPx: r.deltaPx } : {}
  }));
}

// src/report/write.ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname as dirname2 } from "node:path";
async function writeReport(file, report2) {
  await mkdir(dirname2(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report2, null, 2)}
`, "utf8");
}
function reportSummary(report2, maxLines = 20) {
  const failed = report2.findings.filter((f) => f.status === "fail").length;
  const unmeasured = report2.findings.filter((f) => f.status === "not_comparable").length;
  const lines = [
    `ui-measure ${report2.verdict}: ${failed} failed, ${unmeasured} not comparable; ${report2.coverage.pairsAccepted}/${report2.coverage.pairsProposed} pairs accepted, ${report2.coverage.dropped} dropped`
  ];
  const notable = report2.findings.filter((f) => f.status !== "pass");
  const shown = notable.slice(0, Math.max(0, maxLines - 2));
  for (const finding of shown) {
    const detail = finding.status === "not_comparable" ? finding.reason ?? "no reason supplied" : `${finding.expected ?? "mismatch"} -> ${finding.actual ?? "unavailable"}`;
    lines.push(
      `${finding.status}${finding.origin ? ` ${finding.origin}` : ""} ${finding.check}/${finding.kind} ${finding.target.selector}: ${detail}`.replaceAll("\n", " ")
    );
  }
  if (shown.length < notable.length && lines.length < maxLines) {
    lines.push(`... ${notable.length - shown.length} more findings`);
  }
  return lines.join("\n");
}

// src/tokens/index.ts
import { readFileSync as readFileSync3 } from "node:fs";

// src/tokens/dtcg.ts
function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function propertyFor(type, path2) {
  const segments = path2.toLowerCase().split(".");
  const has = (...names) => segments.some((s) => names.includes(s));
  const isFontSize = has("fontsize", "font-size", "font_size") || has("font", "typography") && has("size");
  const isLineHeight = has("lineheight", "line-height", "line_height", "leading");
  switch (type) {
    case "color":
      return "color";
    case "dimension":
    case "number": {
      if (isFontSize) return "fontSize";
      if (isLineHeight) return "lineHeight";
      if (type === "number") return void 0;
      const p = path2.toLowerCase();
      if (p.includes("radius")) return "radius";
      if (p.includes("border")) return "borderWidth";
      return "spacing";
    }
    case "fontFamily":
      return "fontFamily";
    case "fontWeight":
      return "fontWeight";
    case "shadow":
      return "effect";
    default:
      return void 0;
  }
}
var TYPOGRAPHY_MEMBERS = {
  fontFamily: "fontFamily",
  fontSize: "fontSize",
  fontWeight: "fontWeight",
  lineHeight: "lineHeight"
};
function stringify(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value.join(", ");
  if (isObject(value) && typeof value.value === "number" && typeof value.unit === "string") {
    return `${value.value}${value.unit}`;
  }
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return void 0;
}
function formatColor(components, alpha) {
  const channels = components.map((n) => Math.round(n * 255));
  const a = Math.round(alpha * 1e3) / 1e3;
  if (a >= 1) return `#${channels.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return `rgba(${channels.join(", ")}, ${a})`;
}
function colorObject(value) {
  if (!isObject(value)) throw new Error("color must be an srgb object or a string");
  if (value.colorSpace !== void 0 && value.colorSpace !== "srgb") {
    throw new Error(`unsupported color space ${JSON.stringify(value.colorSpace)}`);
  }
  let components;
  let hexAlpha = 1;
  if (value.hex !== void 0) {
    if (typeof value.hex !== "string") throw new Error("hex must be a string");
    const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.hex);
    if (!match) throw new Error("hex must be #rgb, #rgba, #rrggbb, or #rrggbbaa");
    let hex2 = match[1];
    if (hex2.length <= 4) hex2 = [...hex2].map((c) => c + c).join("");
    components = [0, 2, 4].map((i) => parseInt(hex2.slice(i, i + 2), 16) / 255);
    if (hex2.length === 8) hexAlpha = parseInt(hex2.slice(6, 8), 16) / 255;
  } else {
    if (value.colorSpace !== "srgb") throw new Error("color requires colorSpace srgb or a hex string");
    if (!Array.isArray(value.components) || value.components.length !== 3 || value.components.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1)) {
      throw new Error("srgb components must be three finite numbers from 0 to 1");
    }
    components = value.components;
  }
  if (value.alpha !== void 0 && (typeof value.alpha !== "number" || !Number.isFinite(value.alpha) || value.alpha < 0 || value.alpha > 1)) {
    throw new Error("alpha must be a finite number from 0 to 1");
  }
  const alpha = hexAlpha * (typeof value.alpha === "number" ? value.alpha : 1);
  return formatColor(components, alpha);
}
function shadowDimension(value, field) {
  const str = stringify(value);
  const match = str ? /^(-?(?:\d+(?:\.\d+)?|\.\d+))px$/.exec(str.trim()) : null;
  if (!match) throw new Error(`${field} must be a pixel dimension`);
  return Number(match[1]);
}
function shadowObject(value) {
  if (!isObject(value)) throw new Error("shadow must be an object or an effect string");
  if (value.inset !== void 0 && typeof value.inset !== "boolean") throw new Error("inset must be boolean");
  const x = shadowDimension(value.offsetX, "offsetX");
  const y = shadowDimension(value.offsetY, "offsetY");
  const blur = shadowDimension(value.blur, "blur");
  const spread = value.spread === void 0 ? 0 : shadowDimension(value.spread, "spread");
  const parts = [value.inset ? "INNER_SHADOW" : "DROP_SHADOW", x, y, blur];
  if (spread) parts.push(spread);
  parts.push(colorObject(value.color));
  return parts.join(" ");
}
function collect(node, prefix, inherited, out) {
  const type = typeof node.$type === "string" ? node.$type : inherited;
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$") || !isObject(child)) continue;
    const path2 = [...prefix, key];
    if ("$value" in child) {
      out.push({
        path: path2.join("."),
        type: typeof child.$type === "string" ? child.$type : type,
        value: child.$value
      });
    } else {
      collect(child, path2, type, out);
    }
  }
}
function parseDtcg(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { tokens: [], errors: [`not valid JSON (${error instanceof Error ? error.message : String(error)})`] };
  }
  if (!isObject(parsed)) return { tokens: [], errors: ["not a DTCG object"] };
  const raws = [];
  collect(parsed, [], void 0, raws);
  const byPath = new Map(raws.map((r) => [r.path, r]));
  const tokens = [];
  const errors = [];
  for (const raw of raws) {
    let value = raw.value;
    let type = raw.type;
    if (typeof value === "string" && /^\{[^{}]+\}$/.test(value)) {
      const target = byPath.get(value.slice(1, -1));
      if (!target) {
        errors.push(`token ${raw.path} aliases ${value}, which does not exist`);
        continue;
      }
      if (typeof target.value === "string" && /^\{[^{}]+\}$/.test(target.value)) {
        errors.push(`token ${raw.path} aliases ${value}, which is itself an alias (cycle or chain deeper than one level)`);
        continue;
      }
      value = target.value;
      type = type ?? target.type;
    }
    if (type === void 0) {
      errors.push(`token ${raw.path} has no $type and none to inherit`);
      continue;
    }
    if (type === "typography") {
      if (!isObject(value)) {
        errors.push(`token ${raw.path} has a typography $value that is not an object`);
        continue;
      }
      for (const [member, property2] of Object.entries(TYPOGRAPHY_MEMBERS)) {
        if (!(member in value)) continue;
        const str2 = stringify(value[member]);
        if (str2 === void 0) errors.push(`token ${raw.path}.${member} has an unusable value`);
        else tokens.push({ name: `${raw.path}.${member}`, property: property2, value: str2 });
      }
      continue;
    }
    const property = propertyFor(type, raw.path);
    if (property === void 0) {
      errors.push(`token ${raw.path} has unsupported $type "${type}"`);
      continue;
    }
    let str;
    try {
      if (property === "color" && typeof value !== "string") str = colorObject(value);
      else if (property === "effect" && typeof value !== "string") str = shadowObject(value);
      else str = stringify(value);
    } catch (error) {
      errors.push(`token ${raw.path} has an unusable $value: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (str === void 0) {
      errors.push(`token ${raw.path} has an unusable $value`);
      continue;
    }
    tokens.push({ name: raw.path, property, value: str });
  }
  return { tokens, errors };
}

// src/tokens/rows.ts
var KNOWN_PROPERTIES = [
  "color",
  "spacing",
  "radius",
  "fontSize",
  "lineHeight",
  "fontWeight",
  "fontFamily",
  "effect",
  "borderWidth"
];
function inferProperty(name) {
  if (name === null) return void 0;
  const n = name.toLowerCase();
  if (n.startsWith("base/") || n.startsWith("alpha/") || n.startsWith("tailwind colors/")) return "color";
  if (n.startsWith("spacing/")) return "spacing";
  if (n.startsWith("border radius/") || n.startsWith("border-radius/")) return "radius";
  if (n.includes("font-size")) return "fontSize";
  if (n.includes("line-height")) return "lineHeight";
  if (n.startsWith("font/weight/")) return "fontWeight";
  if (n.startsWith("font/family/") || n.includes("font-family")) return "fontFamily";
  if (n.includes("shadow")) return "effect";
  if (n.includes("border-width") || n.includes("border/width")) return "borderWidth";
  return void 0;
}
function parseRows(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { tokens: [], errors: [`not valid JSON (${error instanceof Error ? error.message : String(error)})`] };
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.tokens;
  if (!Array.isArray(rows)) {
    return { tokens: [], errors: ["neither an array of rows nor an object with a `tokens` array"] };
  }
  const tokens = [];
  const errors = [];
  for (const [index, row] of rows.entries()) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`row ${index} is not an object, so it was skipped`);
      continue;
    }
    const { figma, value, code, property } = row;
    if (typeof value !== "string") {
      errors.push(`row ${index} has no string \`value\`, so it was skipped`);
      continue;
    }
    if (typeof figma !== "string" && figma !== null && figma !== void 0) {
      errors.push(`row ${index} (${value}) has a \`figma\` that is neither a string nor null, so it was skipped`);
      continue;
    }
    const designName = typeof figma === "string" ? figma : null;
    const label = designName ?? value;
    let scope;
    if (property !== void 0) {
      const declared = Array.isArray(property) ? property : [property];
      if (declared.length === 0) {
        errors.push(`row ${index} (${label}) declares an empty \`property\` list, so it was skipped`);
        continue;
      }
      const unknown = declared.filter((p) => typeof p !== "string" || !KNOWN_PROPERTIES.includes(p));
      if (unknown.length > 0) {
        errors.push(
          `row ${index} (${label}) declares unknown property ${unknown.map(String).join(", ")}; known: ${KNOWN_PROPERTIES.join(", ")}. The row was skipped`
        );
        continue;
      }
      scope = declared;
    } else {
      const inferred = inferProperty(designName);
      if (inferred === void 0) {
        errors.push(
          `row ${index} (${label}) declares no \`property\` and its name gives none away, so nothing could scope it to a lookup; it was skipped`
        );
        continue;
      }
      scope = [inferred];
    }
    const name = designName ?? (typeof code === "string" ? code : value);
    for (const p of scope) tokens.push({ name, property: p, value });
  }
  return { tokens, errors };
}

// src/tokens/index.ts
function loadTokens(path2, format) {
  let text;
  try {
    text = readFileSync3(path2, "utf8");
  } catch (error) {
    return { tokens: [], errors: [`cannot read ${path2} (${error instanceof Error ? error.message : String(error)})`] };
  }
  return format === "rows" ? parseRows(text) : parseDtcg(text);
}
function normaliseColor(value) {
  const v = value.trim().toLowerCase();
  const m = /^#([0-9a-f]{3,4})$/.exec(v);
  return m ? `#${[...m[1]].map((c) => c + c).join("")}` : v;
}
function parseLength(value) {
  const m = /^\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:px)?\s*$/i.exec(value);
  return m ? Number(m[1]) : void 0;
}
function sameValue(property, a, b) {
  switch (property) {
    case "color":
      return normaliseColor(a) === normaliseColor(b);
    case "spacing":
    case "radius":
    case "fontSize":
    case "lineHeight":
    case "borderWidth": {
      const x = parseLength(a);
      const y = parseLength(b);
      if (x !== void 0 && y !== void 0) return x === y;
      return a.trim().toLowerCase() === b.trim().toLowerCase();
    }
    default:
      return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
}
function tokenFor(tokens, property, value) {
  return tokens.find((t) => t.property === property && sameValue(property, t.value, value));
}

// src/spec/compare.ts
var TOLERANCE_FLOOR_PX = 2;
var TEXT_TOLERANCE_PX = 0.5;
var COLOUR_CHANNEL_TOLERANCE = 1;
var COLOUR_ALPHA_TOLERANCE = 0.01;
var GRAPHIC_TYPES2 = /* @__PURE__ */ new Set(["VECTOR", "ELLIPSE", "LINE", "STAR", "BOOLEAN_OPERATION"]);
var round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
var px = (n) => `${round(n)}px`;
var dims = (w, h) => `${round(w)}x${round(h)}px`;
function parseColour(input) {
  const s = input.trim().toLowerCase();
  const hex2 = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hex2) {
    let h = hex2[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return void 0;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(s);
  if (!fn) return void 0;
  const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return void 0;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}
function formatColour(c) {
  const a = round(c[3], 3);
  if (a >= 1) return `#${c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
  return `rgba(${c.slice(0, 3).map(Math.round).join(", ")}, ${a})`;
}
var sameColour = (a, b) => [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= COLOUR_CHANNEL_TOLERANCE) && Math.abs(a[3] - b[3]) <= COLOUR_ALPHA_TOLERANCE;
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function parseCssShadow(s) {
  const inset = /\binset\b/.test(s);
  const colourText = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(s)?.[1];
  const colour2 = colourText ? parseColour(colourText) : void 0;
  const nums = (s.replace(/\binset\b/g, "").replace(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/gi, "").match(/-?[\d.]+(?=px|\s|$)/g) ?? []).map(Number);
  if (!colour2 || nums.length < 2) return void 0;
  return { inset, x: nums[0], y: nums[1], blur: nums[2] ?? 0, spread: nums[3] ?? 0, colour: colour2 };
}
function parseDesignEffect(s) {
  const type = s.split(" ")[0];
  const rest = s.slice(type.length).trim();
  if (type === "LAYER_BLUR" || type === "BACKGROUND_BLUR") {
    const r = Number(rest);
    return Number.isNaN(r) ? { kind: "unknown", type } : { kind: "blur", of: type === "LAYER_BLUR" ? "filter" : "backdropFilter", radius: r };
  }
  if (type === "DROP_SHADOW" || type === "INNER_SHADOW") {
    const colourAt = rest.search(/(rgba?\(|#)/i);
    const colour2 = colourAt >= 0 ? parseColour(rest.slice(colourAt)) : void 0;
    const nums = (colourAt >= 0 ? rest.slice(0, colourAt) : rest).trim().split(/\s+/).map(Number);
    if (!colour2 || nums.length < 3 || nums.some(Number.isNaN)) return { kind: "unknown", type };
    return {
      kind: "shadow",
      shadow: { inset: type === "INNER_SHADOW", x: nums[0], y: nums[1], blur: nums[2], spread: nums[3] ?? 0, colour: colour2 }
    };
  }
  return { kind: "unknown", type };
}
var length = (s) => {
  const m = /^(-?[\d.]+)px$/.exec(s.trim());
  return m ? Number(m[1]) : void 0;
};
function geomBox(node, el) {
  const box = el.box;
  if (node.hugsWidth !== true || !el.ink) return box;
  return { x: el.ink.x, y: box.y, width: el.ink.width, height: box.height };
}
var fmtBox = (b) => `${round(b.x, 1)},${round(b.y, 1)} ${round(b.width, 1)}x${round(b.height, 1)}`;
function compareSpec(design2, dom, v, opts) {
  const { scale } = opts;
  const tol = TOLERANCE_FLOOR_PX * scale;
  const textTol = TEXT_TOLERANCE_PX * scale;
  const tokens = opts.tokens ?? [];
  const unthemed = new Set(
    (opts.unthemed ?? []).map((c) => parseColour(c)).filter((c) => c !== void 0).map(formatColour)
  );
  const nodesById = new Map(design2.nodes.map((n) => [n.id, n]));
  const elements = new Map(dom.elements.map((e) => [e.selector, e]));
  const kept = [...v.accepted, ...v.sizeDiffers];
  const sizeDiffering = new Set(v.sizeDiffers.map((p) => p.nodeId));
  const pairOf = /* @__PURE__ */ new Map();
  for (const p of kept) {
    const node = nodesById.get(p.nodeId);
    const el = elements.get(p.selector);
    if (node && el) pairOf.set(node.id, { node, el });
  }
  const rootBox = design2.root.box;
  const domRootBox = dom.root.box;
  const findings = [];
  const targetOf = (node, el) => ({
    selector: el.selector,
    designNode: node.id,
    ...node.text ? { text: node.text } : {}
  });
  const named = (property, designValue, shown) => {
    const t = tokenFor(tokens, property, designValue);
    return t ? `${shown} (${t.name})` : shown;
  };
  const measure = (kindName, node, el, expected, actual, allowed, property, label = "") => {
    const delta = Math.abs(expected - actual);
    const shown = `${label}${px(expected)}`;
    findings.push({
      check: "spec",
      kind: kindName,
      status: delta > allowed ? "fail" : "pass",
      target: targetOf(node, el),
      expected: property ? named(property.name, property.designValue, shown) : shown,
      actual: `${label}${px(actual)}`,
      deltaPx: round(delta)
    });
  };
  const skip = (kindName, node, el, reason) => findings.push({ check: "spec", kind: kindName, status: "not_comparable", target: targetOf(node, el), reason });
  if (rootBox && domRootBox) {
    const dw = Math.abs(rootBox.width * scale - domRootBox.width);
    const dh = Math.abs(rootBox.height * scale - domRootBox.height);
    findings.push({
      check: "spec",
      kind: "root-size",
      status: Math.max(dw, dh) > tol ? "fail" : "pass",
      target: { selector: dom.root.selector, designNode: design2.root.id },
      expected: dims(rootBox.width * scale, rootBox.height * scale),
      actual: dims(domRootBox.width, domRootBox.height),
      deltaPx: round(Math.max(dw, dh))
    });
  } else {
    findings.push({
      check: "spec",
      kind: "root-size",
      status: "not_comparable",
      target: { selector: dom.root.selector, designNode: design2.root.id },
      reason: "the design root or the page root has no box"
    });
  }
  for (const node of design2.nodes) {
    const pair = pairOf.get(node.id);
    if (!pair) continue;
    const { el } = pair;
    const style = el.style;
    const isRoot = node.id === design2.root.id;
    if (!isRoot) {
      if (!node.box || !el.box || !rootBox || !domRootBox) {
        skip(sizeDiffering.has(node.id) ? "size" : "box", node, el, "no box on one side");
      } else {
        const want = normalise(node.box, rootBox, domRootBox, scale);
        const got = geomBox(node, el);
        if (sizeDiffering.has(node.id)) {
          const worst = Math.max(Math.abs(want.width - got.width), Math.abs(want.height - got.height));
          findings.push({
            check: "spec",
            kind: "size",
            status: "fail",
            target: targetOf(node, el),
            expected: dims(want.width, want.height),
            actual: dims(got.width, got.height),
            deltaPx: round(worst)
          });
          const shift = Math.max(Math.abs(want.x - got.x), Math.abs(want.y - got.y));
          findings.push({
            check: "spec",
            kind: "box",
            status: shift > tol ? "fail" : "pass",
            target: targetOf(node, el),
            expected: `${round(want.x, 1)},${round(want.y, 1)}`,
            actual: `${round(got.x, 1)},${round(got.y, 1)}`,
            deltaPx: round(shift)
          });
        } else {
          const worst = Math.max(
            Math.abs(want.x - got.x),
            Math.abs(want.y - got.y),
            Math.abs(want.width - got.width),
            Math.abs(want.height - got.height)
          );
          findings.push({
            check: "spec",
            kind: "box",
            status: worst > tol ? "fail" : "pass",
            target: targetOf(node, el),
            expected: fmtBox(want),
            actual: fmtBox(got),
            deltaPx: round(worst)
          });
        }
      }
    }
    if (!style) {
      skip("style", node, el, "the page walk recorded no computed style for this element");
      continue;
    }
    if (el.box) {
      const cap = Math.min(el.box.width, el.box.height) / 2;
      const designRadii = node.radii ?? [node.radius ?? 0, node.radius ?? 0, node.radius ?? 0, node.radius ?? 0];
      const expected = designRadii.map((r) => Math.min(r * scale, cap));
      const raw = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
      const corners = raw.map((r) => {
        const first = r.trim().split(/\s+/)[0];
        const pct = /^([\d.]+)%$/.exec(first);
        const n = pct ? Number(pct[1]) / 100 * Math.min(el.box?.width ?? 0, el.box?.height ?? 0) : length(first);
        return n === void 0 ? void 0 : Math.min(n, cap);
      });
      if (corners.some((c) => c === void 0)) {
        skip("radius", node, el, `radius ${raw.join(" ")} is not a length or percentage`);
      } else {
        const got = corners;
        const deltas = got.map((c, i) => Math.abs(c - expected[i]));
        const worst = Math.max(...deltas);
        const far = got[deltas.indexOf(worst)];
        const has = designRadii.some((r) => r > 0);
        if (has || worst > 0) {
          findings.push({
            check: "spec",
            kind: "radius",
            status: worst > (has ? tol : 0) ? "fail" : "pass",
            target: targetOf(node, el),
            expected: node.radii ? expected.map(px).join(", ") : has ? named("radius", String(node.radius), px(expected[0])) : "none",
            actual: node.radii ? got.map(px).join(", ") : px(far),
            deltaPx: round(worst)
          });
        }
      }
    }
    if (node.type !== "TEXT") {
      const sides = [
        ["top", style.borderTopWidth],
        ["right", style.borderRightWidth],
        ["bottom", style.borderBottomWidth],
        ["left", style.borderLeftWidth]
      ];
      const widths = sides.map(([label, w]) => ({ label, w: length(w) }));
      const has = node.strokeWeight !== void 0 && node.strokeWeight > 0;
      if (widths.some((x) => x.w === void 0)) {
        skip("border-width", node, el, `border width ${sides.map((x) => x[1]).join(" ")} is not a length`);
      } else if (has || widths.some((x) => (x.w ?? 0) > 0)) {
        const want = has ? node.strokeWeight * scale : 0;
        const off = widths.filter((x) => Math.abs((x.w ?? 0) - want) > (has ? tol : 0));
        const worst = Math.max(...widths.map((x) => Math.abs((x.w ?? 0) - want)));
        const shown = (off.length ? off : widths).map((x) => `${x.label} ${px(x.w ?? 0)}`).join(", ");
        findings.push({
          check: "spec",
          kind: "border-width",
          status: off.length ? "fail" : "pass",
          target: targetOf(node, el),
          expected: has ? named("borderWidth", String(node.strokeWeight), px(want)) : "none",
          actual: off.length ? shown : px(widths[0].w ?? 0),
          deltaPx: round(worst)
        });
      }
    }
    if (GRAPHIC_TYPES2.has(node.type)) {
      if (node.fill !== void 0) skip("colour", node, el, "graphic fill is not compared");
    } else if (node.fill !== void 0) {
      const want = parseColour(node.fill);
      const got = parseColour(node.type === "TEXT" ? style.color : style.backgroundColor);
      if (!want || !got) {
        skip("colour", node, el, `colour ${want ? node.type === "TEXT" ? style.color : style.backgroundColor : node.fill} is not parseable`);
      } else {
        const intentional = unthemed.has(formatColour(got)) || unthemed.has(formatColour(want));
        findings.push({
          check: "spec",
          kind: "colour",
          status: intentional || sameColour(want, got) ? "pass" : "fail",
          target: targetOf(node, el),
          expected: named("color", formatColour(want), formatColour(want)),
          actual: formatColour(got)
        });
      }
    } else if (node.type !== "TEXT") {
      const got = parseColour(style.backgroundColor);
      if (!got) {
        skip("colour", node, el, `colour ${style.backgroundColor} is not parseable`);
      } else if (got[3] > 0) {
        findings.push({
          check: "spec",
          kind: "colour",
          status: unthemed.has(formatColour(got)) ? "pass" : "fail",
          target: targetOf(node, el),
          expected: "none",
          actual: formatColour(got)
        });
      }
    }
    if (node.font) {
      const family = style.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
      findings.push({
        check: "spec",
        kind: "font-family",
        status: family.toLowerCase() === node.font.family.toLowerCase() ? "pass" : "fail",
        target: targetOf(node, el),
        expected: named("fontFamily", node.font.family, node.font.family),
        actual: family
      });
      const size2 = length(style.fontSize);
      if (size2 === void 0) skip("font-size", node, el, `font size ${style.fontSize} is not a length`);
      else measure("font-size", node, el, node.font.size * scale, size2, textTol, { name: "fontSize", designValue: String(node.font.size) });
      const weight = Number(style.fontWeight);
      findings.push({
        check: "spec",
        kind: "font-weight",
        status: weight === node.font.weight ? "pass" : "fail",
        target: targetOf(node, el),
        expected: named("fontWeight", String(node.font.weight), String(node.font.weight)),
        actual: String(weight)
      });
      if (node.font.lineHeight !== void 0) {
        const lh = length(style.lineHeight);
        if (lh === void 0) skip("line-height", node, el, `line height is ${style.lineHeight}, which has no pixel value to compare`);
        else measure("line-height", node, el, node.font.lineHeight * scale, lh, textTol, { name: "lineHeight", designValue: String(node.font.lineHeight) });
      }
    }
    if (!node.effects?.length) {
      const seen = [style.boxShadow, style.filter, style.backdropFilter].filter((x) => x && x !== "none");
      if (seen.length) {
        findings.push({
          check: "spec",
          kind: "effects",
          status: "fail",
          target: targetOf(node, el),
          expected: "none",
          actual: seen.join("; ")
        });
      }
    } else {
      const wanted = node.effects.map(parseDesignEffect);
      const unexpected = ["filter", "backdropFilter"].flatMap((property) => {
        const value = style[property];
        if (!value || value === "none") return [];
        const hasBlur = wanted.some((e) => e.kind === "blur" && e.of === property);
        const remainder = hasBlur ? value.replace(/blur\([^)]*\)/, "").trim() : value;
        return remainder ? [`${property}: ${remainder}`] : [];
      });
      if (unexpected.length) {
        findings.push({
          check: "spec",
          kind: "effects",
          status: "fail",
          target: targetOf(node, el),
          expected: "none",
          actual: unexpected.join("; ")
        });
      }
      const unknown = wanted.find((e) => e.kind === "unknown");
      if (unknown && unknown.kind === "unknown") {
        skip("effects", node, el, `effect type ${unknown.type} is not compared`);
      } else {
        const actualShadows = (style.boxShadow === "none" ? [] : splitTopLevel(style.boxShadow)).map(parseCssShadow);
        const wantShadows = wanted.flatMap((e) => e.kind === "shadow" ? [e.shadow] : []);
        let ok = actualShadows.length === wantShadows.length && actualShadows.every((s) => s !== void 0);
        const free = actualShadows.filter((s) => s !== void 0);
        for (const w of wantShadows) {
          const i = free.findIndex(
            (s) => s.inset === w.inset && Math.abs(s.x - w.x * scale) <= tol && Math.abs(s.y - w.y * scale) <= tol && Math.abs(s.blur - w.blur * scale) <= tol && Math.abs(s.spread - w.spread * scale) <= tol && sameColour(s.colour, w.colour)
          );
          if (i < 0) ok = false;
          else free.splice(i, 1);
        }
        for (const e of wanted) {
          if (e.kind !== "blur") continue;
          const m = /blur\(([\d.]+)px\)/.exec(style[e.of]);
          if (!m || Math.abs(Number(m[1]) - e.radius * scale) > tol) ok = false;
        }
        findings.push({
          check: "spec",
          kind: "effects",
          status: ok ? "pass" : "fail",
          target: targetOf(node, el),
          expected: named("effect", node.effects.join("; "), node.effects.join("; ")),
          actual: [style.boxShadow, style.filter, style.backdropFilter].filter((s) => s && s !== "none").join("; ") || "none"
        });
      }
    }
  }
  for (const node of design2.nodes) {
    if (!node.layout) continue;
    const kids = design2.nodes.filter((n) => n.parentId === node.id);
    const horizontal = node.layout.mode === "HORIZONTAL";
    const start = (b) => horizontal ? b.x : b.y;
    const end = (b) => horizontal ? b.x + b.width : b.y + b.height;
    for (let i = 0; i + 1 < kids.length; i++) {
      const a = pairOf.get(kids[i].id);
      const b = pairOf.get(kids[i + 1].id);
      if (!a || !b) {
        const missing = a ? kids[i + 1].id : kids[i].id;
        const holder = a ?? b;
        if (holder) skip("gap", holder.node, holder.el, `the sibling ${missing} has no accepted pair, so the gap between ${kids[i].id} and ${kids[i + 1].id} cannot be measured`);
        continue;
      }
      if (!a.el.box || !b.el.box) {
        skip("gap", b.node, b.el, "no box on one side");
        continue;
      }
      const actual = start(geomBox(b.node, b.el)) - end(geomBox(a.node, a.el));
      measure("gap", b.node, b.el, node.layout.gap * scale, actual, tol, { name: "spacing", designValue: String(node.layout.gap) });
    }
    const own = pairOf.get(node.id);
    if (!own || kids.length === 0 || !own.el.box) continue;
    if (!node.box || kids.some((k) => !k.box)) {
      skip("padding", own.node, own.el, "the design has no box for the container or one of its children");
      continue;
    }
    const parentDesign = node.box;
    const parentDom = own.el.box;
    const first = kids[0];
    const last = kids[kids.length - 1];
    const allPaired = kids.every((k) => pairOf.has(k.id));
    const domKids = kids.flatMap((k) => {
      const pr = pairOf.get(k.id);
      return pr?.el.box ? [geomBox(pr.node, pr.el)] : [];
    });
    const designKids = kids.map((k) => k.box);
    const minOf = (xs) => Math.min(...xs);
    const maxOf = (xs) => Math.max(...xs);
    const cross = (b) => horizontal ? b.y : b.x;
    const crossEnd = (b) => horizontal ? b.y + b.height : b.x + b.width;
    const sides = [
      {
        label: horizontal ? "left" : "top",
        need: [first],
        design: start(first.box) - start(parentDesign),
        dom: () => start(geomBox(pairOf.get(first.id)?.node, pairOf.get(first.id)?.el)) - start(parentDom)
      },
      {
        label: horizontal ? "right" : "bottom",
        need: [last],
        design: end(parentDesign) - end(last.box),
        dom: () => end(parentDom) - end(geomBox(pairOf.get(last.id)?.node, pairOf.get(last.id)?.el))
      },
      {
        label: horizontal ? "top" : "left",
        need: kids,
        design: minOf(designKids.map(cross)) - cross(parentDesign),
        dom: () => minOf(domKids.map(cross)) - cross(parentDom)
      },
      {
        label: horizontal ? "bottom" : "right",
        need: kids,
        design: crossEnd(parentDesign) - maxOf(designKids.map(crossEnd)),
        dom: () => crossEnd(parentDom) - maxOf(domKids.map(crossEnd))
      }
    ];
    for (const side of sides) {
      const missing = side.need.find((k) => !pairOf.get(k.id)?.el.box);
      if (missing || side.need.length > 1 && !allPaired) {
        skip("padding", own.node, own.el, `the ${side.label} padding is measured to ${missing?.id ?? "every child"}, which has no accepted pair`);
        continue;
      }
      measure("padding", own.node, own.el, side.design * scale, side.dom(), tol, { name: "spacing", designValue: String(round(side.design)) }, `${side.label} `);
    }
  }
  const proposed = v.pairs.length;
  return {
    findings,
    coverage: { pairsProposed: proposed, pairsAccepted: kept.length, dropped: proposed - kept.length, authoritative: opts.authoritative === true }
  };
}

// package.json
var package_default = {
  name: "ui-measure",
  version: "0.1.0",
  description: "Measure rendered UI geometry and design conformance without a model",
  type: "module",
  license: "MIT",
  exports: {
    ".": {
      types: "./dist/lib/src/index.d.ts",
      default: "./dist/lib/src/index.js"
    },
    "./version": {
      types: "./dist/lib/src/version.d.ts",
      default: "./dist/lib/src/version.js"
    }
  },
  bin: {
    "ui-measure": "./dist/ui-measure.mjs"
  },
  scripts: {
    test: "vitest run",
    "build:cli": "esbuild src/cli.ts --bundle --outfile=dist/ui-measure.mjs --platform=node --format=esm --external:playwright",
    "build:lib": "tsc -p tsconfig.lib.json",
    build: "pnpm run build:cli && pnpm run build:lib"
  },
  engines: {
    node: ">=24"
  },
  peerDependencies: {
    playwright: ">=1.50.0"
  },
  devDependencies: {
    "@types/node": "^24.10.0",
    esbuild: "^0.27.0",
    playwright: "^1.56.1",
    typescript: "^5.9.3",
    vitest: "^4.0.0"
  }
};

// src/version.ts
var VERSION = package_default.version;

// src/cli.ts
var USAGE = `Usage:
  ui-measure geometry --config C --target T [--json OUT]
  ui-measure spec --config C --target T [--node FILE | --figma NODE_ID]
    [--proposer recorded --proposal FILE | --proposer command -- ARGV...] [--json OUT]
  ui-measure baseline record|check --config C --target T [--mode geometry|spec]
    [--node FILE | --figma NODE_ID] [--proposer recorded --proposal FILE | --proposer command -- ARGV...]
    [--force] [--json OUT]`;
function parseOptions(args) {
  const out = { command: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      out.command = args.slice(i + 1);
      break;
    }
    if (arg === "--force") {
      out.force = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    const key = arg.replace(/^--/, "");
    if (!["config", "target", "json", "node", "figma", "proposer", "proposal", "mode"].includes(key)) {
      throw new SetupError(`unknown option ${arg}
${USAGE}`);
    }
    const value = args[++i];
    if (value === void 0 || value === "") throw new SetupError(`${arg} needs a value`);
    out[key] = value;
  }
  return out;
}
function selected(config, options) {
  if (!options.config) throw new SetupError(`--config is required
${USAGE}`);
  if (!options.target) throw new SetupError(`--target is required
${USAGE}`);
  const target = config.targets[options.target];
  if (!target) throw new SetupError(`unknown target ${JSON.stringify(options.target)}`);
  return target;
}
function report(target, opened, findings, coverage, verdict2) {
  return {
    tool: "ui-measure",
    version: VERSION,
    ranAt: (/* @__PURE__ */ new Date()).toISOString(),
    page: opened?.info ?? {
      url: adapterTarget(target.adapter).url,
      viewport: target.viewport,
      screen: target.screen ?? target.viewport,
      dpr: target.dpr ?? 1
    },
    scale: opened?.scale ?? 1,
    findings,
    coverage,
    verdict: verdict2
  };
}
function notComparable(target, check, reason) {
  return report(
    target,
    void 0,
    [{ check, kind: "page", status: "not_comparable", target: { selector: target.adapter.kind === "url" ? target.adapter.root : "root" }, reason }],
    { pairsProposed: 0, pairsAccepted: 0, dropped: 0, authoritative: false },
    "not_comparable"
  );
}
function verdict(findings, coverage) {
  if (findings.some((f) => f.status === "fail")) return "mismatches";
  if (findings.some((f) => f.status === "not_comparable") || coverage.pairsProposed === 0 && coverage.pairsAccepted === 0 && findings.some((f) => f.check === "spec") || coverage.dropped > coverage.pairsProposed / 2) {
    return "not_comparable";
  }
  return "clean";
}
async function geometry(target, config) {
  const opened = await openPage(target);
  if ("notComparable" in opened) return notComparable(target, "geometry", opened.notComparable);
  try {
    const findings = await detectGeometry(opened, config.geometry ?? { insetPx: 4, nonScrolling: [] });
    const coverage = { pairsProposed: 0, pairsAccepted: 0, dropped: 0, authoritative: false };
    return report(target, opened, findings, coverage, verdict(findings, coverage));
  } finally {
    await opened.close();
  }
}
async function proposer(options) {
  const kind = options.proposer ?? (options.proposal ? "recorded" : options.command.length ? "command" : void 0);
  if (kind === void 0) return void 0;
  if (kind === "recorded") {
    if (!options.proposal) throw new SetupError("recorded proposer needs --proposal FILE");
    return { kind, file: resolve2(options.proposal) };
  }
  if (kind === "command") {
    if (options.command.length === 0) throw new SetupError("command proposer needs arguments after --");
    return { kind, argv: options.command };
  }
  throw new SetupError("--proposer must be recorded or command");
}
async function design(target, options) {
  if (options.node && options.figma) throw new SetupError("--node and --figma are mutually exclusive");
  const nodeFile = options.node ?? (options.figma ? void 0 : target.node);
  if (nodeFile) {
    const json2 = JSON.parse(await readFile2(resolve2(nodeFile), "utf8"));
    return flatten(readNode(json2, target.figma?.nodeId));
  }
  const nodeId = options.figma ?? target.figma?.nodeId;
  if (!nodeId) throw new SetupError("spec needs --node FILE, --figma NODE_ID, or a configured design");
  const fileKey = target.figma?.fileKey ?? process.env.FIGMA_FILE_KEY;
  const token = process.env.FIGMA_TOKEN;
  if (!fileKey) throw new SetupError("Figma file key is required in target config or FIGMA_FILE_KEY");
  if (!token) throw new SetupError("FIGMA_TOKEN is required to fetch a design");
  const json = await fetchNode(fileKey, nodeId, token);
  return flatten(readNode(json, nodeId));
}
async function spec(target, config, options) {
  let designTree;
  let mappingProposer;
  try {
    ;
    [designTree, mappingProposer] = await Promise.all([design(target, options), proposer(options)]);
  } catch (error) {
    if (error instanceof NotComparableError) return notComparable(target, "spec", error.message);
    throw error;
  }
  let tokens;
  if (config.tokens) {
    const loaded = loadTokens(config.tokens.path, config.tokens.format);
    if (loaded.errors.length) throw new SetupError(loaded.errors.join("\n"));
    tokens = loaded.tokens;
  }
  const opened = await openPage(target);
  if ("notComparable" in opened) return notComparable(target, "spec", opened.notComparable);
  try {
    if (!mappingProposer) {
      return report(
        target,
        opened,
        [{ check: "spec", kind: "correspondence", status: "not_comparable", target: { selector: opened.rootSelector }, reason: "no correspondence proposer was selected" }],
        { pairsProposed: 0, pairsAccepted: 0, dropped: 0, authoritative: false },
        "not_comparable"
      );
    }
    const dom = await domTree(opened);
    let proposal = await propose(mappingProposer, designTree, dom);
    let notes;
    if (mappingProposer.kind === "recorded") {
      ;
      ({ proposal, notes } = await resolveProposal(opened, dom, proposal));
    }
    const verification = verifyMapping(proposal, designTree, dom, { scale: opened.scale, notes });
    const compared = compareSpec(designTree, dom, verification, {
      scale: opened.scale,
      tokens,
      unthemed: config.unthemed,
      authoritative: proposal.authoritative
    });
    return report(target, opened, compared.findings, compared.coverage, verdict(compared.findings, compared.coverage));
  } finally {
    await opened.close();
  }
}
function exitCode(result) {
  return result.verdict === "clean" ? 0 : result.verdict === "mismatches" ? 1 : 2;
}
async function main(argv = process.argv.slice(2)) {
  try {
    const command = argv[0];
    if (!command || command === "--help" || command === "-h") {
      console.log(USAGE);
      return command ? 0 : 3;
    }
    const isBaseline = command === "baseline";
    const action = isBaseline ? argv[1] : void 0;
    if (!["geometry", "spec", "baseline"].includes(command) || isBaseline && action !== "record" && action !== "check") {
      throw new SetupError(USAGE);
    }
    const options = parseOptions(argv.slice(isBaseline ? 2 : 1));
    if (options.help) {
      console.log(USAGE);
      return 0;
    }
    if (!options.config) throw new SetupError(`--config is required
${USAGE}`);
    if (!options.target) throw new SetupError(`--target is required
${USAGE}`);
    const config = loadConfig(options.config);
    const target = selected(config, options);
    if (!isBaseline && options.force) throw new SetupError("--force is only valid for baseline record");
    if (!isBaseline && options.mode) throw new SetupError("--mode is only valid for baseline commands");
    const mode = options.mode ?? "geometry";
    if (mode !== "geometry" && mode !== "spec") throw new SetupError("--mode must be geometry or spec");
    let result = command === "spec" || isBaseline && mode === "spec" ? await spec(target, config, options) : await geometry(target, config);
    if (options.json) await writeReport(resolve2(options.json), result);
    if (isBaseline) {
      if (!config.baselineDir) throw new SetupError("baselineDir is required for baseline commands");
      if (action === "record") {
        if (result.verdict === "not_comparable") console.log(reportSummary(result));
        recordBaseline(config.baselineDir, options.target, result, { force: options.force });
        console.log(reportSummary(result, 19));
        console.log(`recorded baseline for ${options.target}`);
        return exitCode(result);
      }
      const findings = classify(result.findings, readBaseline(config.baselineDir, options.target));
      result = {
        ...result,
        findings,
        verdict: verdict(findings.filter((f) => f.origin !== "inherited"), result.coverage)
      };
      if (options.json) await writeReport(resolve2(options.json), result);
    }
    console.log(reportSummary(result));
    return exitCode(result);
  } catch (error) {
    console.error(`ui-measure: ${error instanceof Error ? error.message : String(error)}`);
    return error instanceof PartialRunError ? 2 : 3;
  }
}
process.exitCode = await main();
export {
  main
};
