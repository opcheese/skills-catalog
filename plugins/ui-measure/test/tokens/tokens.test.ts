import { describe, expect, it } from "vitest";
import { loadTokens, tokenFor } from "../../src/tokens";

const fx = (n: string) => new URL(`../fixtures/tokens/${n}`, import.meta.url).pathname;

describe("rows format", () => {
  const { tokens, errors } = loadTokens(fx("rows.json"), "rows");

  it("unknown property -> error naming the row, other rows kept", () => {
    expect(errors.some((e) => e.includes("brand/size") && e.includes("sparkle"))).toBe(true);
    expect(tokens.map((t) => t.name)).toContain("base/primary");
    expect(tokens.map((t) => t.name)).toContain("rounded-lg");
  });

  it("null row -> error, other rows kept", () => {
    expect(errors.some((e) => e.includes("row 4"))).toBe(true);
    expect(tokens.find((t) => t.name === "font/weight/bold")?.property).toBe("fontWeight");
  });

  it("row with no usable property is reported", () => {
    expect(errors.some((e) => e.includes("scale/mystery"))).toBe(true);
  });

  it("unreadable file is an error, not a throw", () => {
    expect(loadTokens(fx("nope.json"), "rows").errors).toHaveLength(1);
  });
});

describe("dtcg format", () => {
  const { tokens, errors } = loadTokens(fx("dtcg.json"), "dtcg");
  const get = (n: string) => tokens.find((t) => t.name === n);

  it("nested groups flatten to dot names, $type maps to property", () => {
    expect(get("color.primary")).toEqual({ name: "color.primary", property: "color", value: "#0A84FF" });
    expect(get("space.md")?.property).toBe("spacing");
    expect(get("space.radius.md")?.property).toBe("radius");
    expect(get("space.border.thin")?.property).toBe("borderWidth");
    expect(get("font.body")?.property).toBe("fontFamily");
    expect(get("font.bold")).toMatchObject({ property: "fontWeight", value: "700" });
    expect(get("elevation.card")?.property).toBe("effect");
  });

  it("resolves a one-level alias", () => {
    expect(get("color.accent")?.value).toBe("#0A84FF");
  });

  it("reports cycles, missing refs and unknown $type naming the token", () => {
    expect(errors.some((e) => e.includes("color.loop-a"))).toBe(true);
    expect(errors.some((e) => e.includes("color.ghost"))).toBe(true);
    expect(errors.some((e) => e.includes("odd.duration") && e.includes("duration"))).toBe(true);
  });
});

describe("tokenFor", () => {
  const tokens = loadTokens(fx("rows.json"), "rows").tokens;
  it("matches #FFF and #ffffff", () => {
    const t = [{ name: "white", property: "color" as const, value: "#FFF" }];
    expect(tokenFor(t, "color", "#ffffff")?.name).toBe("white");
    expect(tokenFor(t, "color", "#FFFFFF")?.name).toBe("white");
    expect(tokenFor(t, "color", "#000")).toBeUndefined();
  });
  it("compares lengths numerically and scopes by property", () => {
    expect(tokenFor(tokens, "spacing", "16px")?.name).toBe("spacing/4");
    expect(tokenFor(tokens, "radius", "16")).toBeUndefined();
  });
});
