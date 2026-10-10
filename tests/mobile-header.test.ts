import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss, { type Rule, type AnyNode } from "postcss";

const source = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const marker = "/* Mobile masthead: one editorial hierarchy";
const base = postcss.parse(source.slice(0, source.indexOf(marker)));
const current = postcss.parse(source);

function applies(rule: Rule, width: number) {
  for (let parent: AnyNode | undefined = rule.parent; parent; parent = parent.parent) {
    if (parent.type !== "atrule" || parent.name !== "media") continue;
    for (const match of parent.params.matchAll(/(min|max)-width:\s*(\d+)px/g)) {
      if (match[1] === "max" && width > Number(match[2])) return false;
      if (match[1] === "min" && width < Number(match[2])) return false;
    }
  }
  return true;
}

function declarations(css: typeof current, selector: string, width: number) {
  const result: Record<string, string> = {};
  css.walkRules((rule) => {
    if (!rule.selectors.includes(selector) || !applies(rule, width)) return;
    rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
  });
  return result;
}

const selectors = [".masthead", ".masthead-body", ".masthead-summary", ".masthead-daily-signal", ".briefing-bar", ".briefing-heading", ".briefing-title", ".briefing-updated", ".briefing-actions", ".briefing-actions .view-toggle", ".briefing-actions button", ".editorial-feed", ".lead-section", ".lead-story"];

test("mobile header has a full-width heading, subordinate status and safe grouped controls", () => {
  assert.ok(source.includes(marker));
  for (const width of [320, 375, 390, 620]) {
    assert.equal(declarations(current, ".briefing-heading", width).display, "grid");
    assert.equal(declarations(current, ".briefing-title", width)["text-transform"], "none");
    assert.equal(declarations(current, ".briefing-updated", width)["text-transform"], "none");
    assert.equal(declarations(current, ".briefing-bar", width).padding, "1rem 1rem 0.5rem");
    const actions = declarations(current, ".briefing-actions", width);
    assert.equal(actions.display, "flex");
    assert.equal(actions["flex-wrap"], "wrap");
    const buttons = declarations(current, ".briefing-actions button", width);
    assert.equal(buttons["min-height"], "2.75rem");
    assert.equal(buttons["flex-shrink"], "0");
    assert.equal(buttons["white-space"], "nowrap");
  }
});

test("mobile refinement leaves tablet and desktop declarations unchanged", () => {
  for (const width of [621, 650, 768, 820, 1024, 1440]) {
    for (const selector of selectors) {
      assert.deepEqual(declarations(current, selector, width), declarations(base, selector, width), `${selector} at ${width}px`);
    }
  }
});
