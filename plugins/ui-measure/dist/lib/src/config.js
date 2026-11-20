import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { SetupError } from "./errors.js";
const object = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new SetupError("config must contain objects");
    }
    return value;
};
const string = (value, name) => {
    if (typeof value !== "string" || value === "")
        throw new SetupError(`${name} must be a non-empty string`);
    return value;
};
const size = (value, name) => {
    if (!Array.isArray(value) ||
        value.length !== 2 ||
        value.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0)) {
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
            if (adapter[key] !== undefined)
                string(adapter[key], `${name}.${key}`);
        }
    }
    else if (kind === "designharness") {
        string(adapter.baseUrl, `${name}.baseUrl`);
        string(adapter.component, `${name}.component`);
        if (adapter.state !== undefined)
            string(adapter.state, `${name}.state`);
    }
    else if (kind === "storybook") {
        string(adapter.baseUrl, `${name}.baseUrl`);
        string(adapter.storyId, `${name}.storyId`);
    }
    else {
        throw new SetupError(`${name}.kind must be url, designharness, or storybook`);
    }
    return adapter;
}
function localPath(base, value) {
    return isAbsolute(value) ? value : resolve(base, value);
}
export function loadConfig(file) {
    const filename = resolve(file);
    let raw;
    try {
        raw = JSON.parse(readFileSync(filename, "utf8"));
    }
    catch (error) {
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
        if (target.screen !== undefined)
            target.screen = size(target.screen, `${prefix}.screen`);
        for (const key of ["designRootFontPx", "dpr"]) {
            const n = target[key];
            if (n !== undefined && (typeof n !== "number" || !Number.isFinite(n) || n <= 0)) {
                throw new SetupError(`${prefix}.${key} must be a positive number`);
            }
        }
        if (target.node !== undefined)
            target.node = localPath(base, string(target.node, `${prefix}.node`));
        if (target.figma !== undefined) {
            const figma = object(target.figma);
            string(figma.nodeId, `${prefix}.figma.nodeId`);
            if (figma.fileKey !== undefined)
                string(figma.fileKey, `${prefix}.figma.fileKey`);
        }
        const adapter = target.adapter;
        if (adapter.kind === "url") {
            if (adapter.mock)
                adapter.mock = localPath(base, adapter.mock);
            if (adapter.steps)
                adapter.steps = localPath(base, adapter.steps);
        }
    }
    if (config.tokens !== undefined) {
        const tokens = object(config.tokens);
        tokens.path = localPath(base, string(tokens.path, "tokens.path"));
        if (tokens.format !== "rows" && tokens.format !== "dtcg") {
            throw new SetupError("tokens.format must be rows or dtcg");
        }
    }
    if (config.unthemed !== undefined) {
        if (!Array.isArray(config.unthemed) || config.unthemed.some((c) => typeof c !== "string")) {
            throw new SetupError("unthemed must be an array of strings");
        }
    }
    if (config.geometry !== undefined) {
        const geometry = object(config.geometry);
        if (typeof geometry.insetPx !== "number" || !Number.isFinite(geometry.insetPx) || geometry.insetPx < 0) {
            throw new SetupError("geometry.insetPx must be a non-negative number");
        }
        if (!Array.isArray(geometry.nonScrolling) || geometry.nonScrolling.some((s) => typeof s !== "string")) {
            throw new SetupError("geometry.nonScrolling must be an array of selectors");
        }
    }
    if (config.baselineDir !== undefined) {
        config.baselineDir = localPath(base, string(config.baselineDir, "baselineDir"));
    }
    return config;
}
