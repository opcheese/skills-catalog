import { describe, expect, it } from "vitest";
import { loadTokens, tokenFor } from "../../src/tokens";
import { parseDtcg } from "../../src/tokens/dtcg";

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

describe("dtcg typography classification", () => {
  const { tokens, errors } = loadTokens(fx("dtcg.json"), "dtcg");
  const get = (n: string) => tokens.find((t) => t.name === n);

  it("classifies font sizes and line heights by path segment", () => {
    expect(get("type.fontSize.body")?.property).toBe("fontSize");
    expect(get("font.size.lg")?.property).toBe("fontSize");
    expect(get("type.line-height.body")?.property).toBe("lineHeight");
    expect(get("type.leading.tight")).toMatchObject({ property: "lineHeight", value: "1.25" });
    expect(tokenFor(tokens, "fontSize", "16px")?.name).toBe("type.fontSize.body");
  });

  it("expands a typography composite into member tokens", () => {
    expect(get("type.heading.fontFamily")).toMatchObject({ property: "fontFamily", value: "Inter" });
    expect(get("type.heading.fontSize")).toMatchObject({ property: "fontSize", value: "32px" });
    expect(get("type.heading.fontWeight")).toMatchObject({ property: "fontWeight", value: "700" });
    expect(get("type.heading.lineHeight")).toMatchObject({ property: "lineHeight", value: "1.2" });
    expect(errors.some((e) => e.includes("type.heading"))).toBe(false);
  });

  it("keeps plain dimensions as spacing", () => {
    expect(get("space.md")?.property).toBe("spacing");
  });
});

describe("dtcg object values", () => {
  it("normalises srgb and hex color objects and shadow objects for tokenFor", () => {
    const { tokens, errors } = parseDtcg(JSON.stringify({
      color: {
        $type: "color",
        object: { $value: { colorSpace: "srgb", components: [0.1, 0.2, 0.3] } },
        translucent: { $value: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.1 } },
        hex: { $value: { hex: "#0A84FF" } },
      },
      elevation: {
        $type: "shadow",
        card: {
          $value: {
            color: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.1 },
            offsetX: "0px",
            offsetY: { value: 4, unit: "px" },
            blur: "8px",
            spread: "0px",
          },
        },
      },
    }))
    expect(errors).toEqual([])
    expect(tokenFor(tokens, "color", "#1a334d")?.name).toBe("color.object")
    expect(tokenFor(tokens, "color", "rgba(0, 0, 0, 0.1)")?.name).toBe("color.translucent")
    expect(tokenFor(tokens, "color", "#0a84ff")?.name).toBe("color.hex")
    expect(tokenFor(tokens, "effect", "DROP_SHADOW 0 4 8 rgba(0, 0, 0, 0.1)")?.name).toBe("elevation.card")
  })

  it("reports unsupported color spaces and malformed object forms with token names", () => {
    const { errors } = parseDtcg(JSON.stringify({
      color: {
        $type: "color",
        wide: { $value: { colorSpace: "display-p3", components: [1, 0, 0] } },
        broken: { $value: { colorSpace: "srgb", components: [1, 0] } },
      },
    }))
    expect(errors.some((e) => e.includes("color.wide") && e.includes("display-p3"))).toBe(true)
    expect(errors.some((e) => e.includes("color.broken"))).toBe(true)
  })
});

describe("tokenFor leading decimals", () => {
  const t = [{ name: "half", property: "spacing" as const, value: "0.5px" }];
  it("matches .5 and 0.5px", () => {
    expect(tokenFor(t, "spacing", ".5")?.name).toBe("half");
    expect(tokenFor([{ ...t[0], value: ".5" }], "spacing", "0.5px")?.name).toBe("half");
  });
});
