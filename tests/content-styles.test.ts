import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTENT_STYLE_GROUPS,
  contentStyleFeatureList,
  contentStyleGateClasses,
  contentStyleGates,
  contentStyleVariableNames,
  contentStyleVariables,
  enumOptions,
  optionValues,
  type ContentStyleSettings,
} from "../src/content-styles";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/settings";

const stylesheet = readFileSync(
  fileURLToPath(new URL("../styles.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, " ");

const features = contentStyleFeatureList();

/**
 * 默认值钉表。
 *
 * `satisfies` 让它必须覆盖注册表的每一个键——加了特性却忘了在这里登记，**测试文件本身编译
 * 不过**。这张表的意义不只是"有默认值"，而是钉住「默认值 = 插件此前写死的外观」：卡片那几项
 * 与 styles.css 里 `var(--home-tab-card-*, 兜底)` 的兜底值一一对应，任一侧被改动都会红。
 */
const EXPECTED_DEFAULTS = {
  cardTitle: true,
  cardRadius: 8,
  cardGap: 16,
  cardBorderStyle: "solid",
  cardBorderWidth: 1,
  cardShadow: "none",
  tableZebra: false,
  baseBar: false,
  baseHideToolbar: false,
} satisfies ContentStyleSettings;

describe("content style registry", () => {
  it("is not empty and has unique keys, class names and variables", () => {
    expect(features.length).toBeGreaterThan(0);
    expect(new Set(features.map((f) => f.key)).size).toBe(features.length);
    expect(new Set(CONTENT_STYLE_GROUPS.map((g) => g.id)).size).toBe(CONTENT_STYLE_GROUPS.length);

    const gateClasses = contentStyleGateClasses();
    expect(new Set(gateClasses).size, "two features share a gate class").toBe(gateClasses.length);
    const variables = contentStyleVariableNames();
    expect(new Set(variables).size, "two features share a CSS variable").toBe(variables.length);
  });

  /** 每个 kind 的必填字段都在，且取值范围自洽 */
  it("keeps every feature well formed for its kind", () => {
    for (const feature of features) {
      switch (feature.kind) {
        case "toggle": {
          expect(feature.className, `${feature.key} needs a gate class`).toMatch(/^is-[a-z0-9-]+$/);
          break;
        }
        case "number": {
          expect(feature.min).toBeLessThan(feature.max);
          expect(feature.step).toBeGreaterThan(0);
          expect(feature.variable).toMatch(/^--home-tab-[a-z-]+$/);
          const fallback = EXPECTED_DEFAULTS[feature.key];
          expect(typeof fallback).toBe("number");
          expect(fallback as number).toBeGreaterThanOrEqual(feature.min);
          expect(fallback as number).toBeLessThanOrEqual(feature.max);
          break;
        }
        case "enum": {
          const values = optionValues(feature.options);
          expect(values.length).toBeGreaterThan(1);
          expect(new Set(values).size, `${feature.key} has duplicate option values`).toBe(
            values.length,
          );
          // 默认值必须是合法选项，否则下拉框打开时显示空白
          expect(values).toContain(String(EXPECTED_DEFAULTS[feature.key]));
          break;
        }
        default: {
          const exhaustive: never = feature;
          throw new Error(`未覆盖的 kind：${JSON.stringify(exhaustive)}`);
        }
      }
    }
  });

  /**
   * 注册了特性却没写 CSS，就是一个开了也没反应的空开关——而且构建、类型检查、lint 全都抓不到。
   * 这里把注册表和样式表钉在一起。
   */
  it("ships a stylesheet rule for every gate class", () => {
    for (const gate of contentStyleGateClasses()) {
      expect(stylesheet, `no rule uses .${gate}`).toContain(gate);
    }
  });

  /** 反向：styles.css 里的开闸类都必须在注册表里，否则是改名后留下的死规则 */
  it("has no gate class in the stylesheet that the registry does not declare", () => {
    const declared = new Set(contentStyleGateClasses());
    const used = new Set(stylesheet.match(/is-[a-z0-9-]+/g) ?? []);
    // 以下都不是内容样式开关，而是别处自己管理的状态类：
    used.delete("is-dragging"); // card-grid 拖拽态，直接加在卡片上
    used.delete("is-missing"); // page-header 的 logo 加载失败态
    used.delete("is-column"); // 弹窗里设置行的纵向排列
    used.delete("is-column-layout"); // column-layout.ts 接上 ResizeObserver 后才加的布局态
    for (const gate of used) {
      expect(declared.has(gate), `stylesheet uses .${gate}, which no feature declares`).toBe(true);
    }
  });
});

describe("content style gates and variables", () => {
  /**
   * 枚举必须把**每个**候选类都产出一条（选中的 true、其余 false）。
   *
   * 只产出选中那一个的话，调用方 `toggleClass` 就摘不掉上一个值的类——而设置页重建之后
   * 那个"上一个值"已经没处可查了，表现是两种投影的类同时挂在根节点上。
   */
  it("reports every candidate class of an enum, so switching clears the old one", () => {
    const shadow = features.find((f) => f.key === "cardShadow");
    expect(shadow?.kind).toBe("enum");
    if (shadow?.kind !== "enum") {
      return;
    }
    const candidates = enumOptions(shadow.options)
      .map((option) => option.className)
      .filter((name): name is string => name !== undefined);
    expect(candidates.length).toBeGreaterThan(0);

    for (const option of enumOptions(shadow.options)) {
      // `enumOptions` 把 value 拓宽成了 string（它要能吃下任意枚举特性的 options），
      // 这里断言回本特性的字面量联合。合法性由上面那条 "well formed" 测试保证。
      const value = option.value as ContentStyleSettings["cardShadow"];
      const gates = contentStyleGates({ ...EXPECTED_DEFAULTS, cardShadow: value });
      for (const candidate of candidates) {
        const gate = gates.find((entry) => entry.className === candidate);
        expect(gate, `${candidate} is missing from the gate list`).toBeDefined();
        expect(gate?.on, `${candidate} should be ${String(candidate === option.className)}`).toBe(
          candidate === option.className,
        );
      }
    }
  });

  /** `invert` 的语义：默认外观即"开"，所以类只在值为 false 时挂 */
  it("inverts the gate for a feature whose default state is on", () => {
    const on = contentStyleGates({ ...EXPECTED_DEFAULTS, cardTitle: true });
    const off = contentStyleGates({ ...EXPECTED_DEFAULTS, cardTitle: false });
    expect(on.find((g) => g.className === "is-card-title-hidden")?.on).toBe(false);
    expect(off.find((g) => g.className === "is-card-title-hidden")?.on).toBe(true);
  });

  /** 数值必须带单位。少了 px，`border-radius: 8` 是无效声明，整条规则被丢弃且不报错 */
  it("appends the unit to every numeric variable", () => {
    const variables = contentStyleVariables(EXPECTED_DEFAULTS);
    const byName = new Map(variables.map((entry) => [entry.name, entry.value]));
    for (const feature of features) {
      if (feature.kind === "number") {
        expect(byName.get(feature.variable), `${feature.key} lost its unit`).toMatch(/^\d+px$/);
      }
    }
  });

  it("writes an enum that carries a variable as a bare value", () => {
    const variables = contentStyleVariables({ ...EXPECTED_DEFAULTS, cardBorderStyle: "dashed" });
    expect(variables).toContainEqual({ name: "--home-tab-card-border-style", value: "dashed" });
  });
});

describe("content style settings", () => {
  /**
   * 默认值逐键钉死。卡片那几项的意义是「升级后外观零变化」，所以它们必须等于插件此前
   * 写死在 styles.css 里的值，而不是某个"看起来不错"的新数字。
   */
  it("matches the pinned defaults", () => {
    for (const [key, expected] of Object.entries(EXPECTED_DEFAULTS)) {
      expect(DEFAULT_SETTINGS[key as keyof typeof EXPECTED_DEFAULTS], `${key} drifted`).toBe(
        expected,
      );
    }
    // 反向：注册表里的键必须都在钉表里（satisfies 已保证，这条防的是钉表多写了键）
    expect(Object.keys(EXPECTED_DEFAULTS).sort()).toEqual(features.map((f) => f.key).sort());
  });

  /**
   * 每个特性都要能被 `mergeSettings` 读回——这是「设置页能点、但重启后失效」的唯一防线。
   *
   * 探针值**必须与默认值不同**：从前靠"默认 false、探针 true"隐式成立，多类型之后如果探针
   * 恰好等于默认值，这条测试就成了空转——读不读都通过。所以按 kind 强制生成一个不同的值。
   */
  it("round-trips every feature through mergeSettings", () => {
    const raw: Record<string, boolean | number | string> = {};
    const probes = new Map<string, boolean | number | string>();
    for (const feature of features) {
      const current = EXPECTED_DEFAULTS[feature.key];
      let probe: boolean | number | string;
      switch (feature.kind) {
        case "toggle": {
          probe = current !== true;
          break;
        }
        case "number": {
          const value = current as number;
          probe = value >= feature.max ? feature.min : value + feature.step;
          break;
        }
        case "enum": {
          const other = optionValues(feature.options).find((value) => value !== current);
          expect(other, `${feature.key} has no alternative option to probe with`).toBeDefined();
          probe = other!;
          break;
        }
        default: {
          const exhaustive: never = feature;
          throw new Error(`未覆盖的 kind：${JSON.stringify(exhaustive)}`);
        }
      }
      expect(probe, `${feature.key} probe must differ from its default`).not.toBe(current);
      raw[feature.key] = probe;
      probes.set(feature.key, probe);
    }

    const merged = mergeSettings(raw);
    for (const feature of features) {
      expect(merged[feature.key], `${feature.key} was not read back`).toBe(probes.get(feature.key));
    }
  });

  it("falls back to the default for a wrong-typed value", () => {
    for (const feature of features) {
      // 每种 kind 都喂一个类型不对的值：toggle/number 喂字符串，enum 喂未登记的字符串
      const bogus = feature.kind === "enum" ? "not-an-option" : "yes";
      expect(mergeSettings({ [feature.key]: bogus })[feature.key], `${feature.key}`).toBe(
        EXPECTED_DEFAULTS[feature.key],
      );
    }
  });

  /** 数值越界要被钳到范围内，而不是回落默认值——用户手改 data.json 时能得到最接近的合法值 */
  it("clamps a numeric value that falls outside its range", () => {
    for (const feature of features) {
      if (feature.kind !== "number") {
        continue;
      }
      expect(mergeSettings({ [feature.key]: feature.min - 100 })[feature.key]).toBe(feature.min);
      expect(mergeSettings({ [feature.key]: feature.max + 100 })[feature.key]).toBe(feature.max);
    }
  });

  it("keeps the features independent of one another", () => {
    // 刻意做成彼此正交的独立设置，任意组合都要成立
    const target = features[features.length - 1]!;
    const probe =
      target.kind === "toggle"
        ? EXPECTED_DEFAULTS[target.key] !== true
        : target.kind === "number"
          ? feature_min(target)
          : optionValues(target.options).find((v) => v !== EXPECTED_DEFAULTS[target.key])!;
    const merged = mergeSettings({ [target.key]: probe });
    expect(merged[target.key]).toBe(probe);
    for (const feature of features) {
      if (feature.key !== target.key) {
        expect(merged[feature.key], `${feature.key} was disturbed`).toBe(
          EXPECTED_DEFAULTS[feature.key],
        );
      }
    }
  });
});

/** 取一个必定不同于默认值的数值探针 */
function feature_min(feature: { min: number; max: number; step: number; key: string }): number {
  const current = EXPECTED_DEFAULTS[feature.key as keyof typeof EXPECTED_DEFAULTS] as number;
  return current >= feature.max ? feature.min : current + feature.step;
}
