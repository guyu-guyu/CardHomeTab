import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * 构建与测试用的不是同一套打包器：esbuild.config.mjs 里配的 `.css` text loader
 * 只作用于构建产物，而 vitest 跑在 Vite 下，Vite 默认不把 `.css` 当文本。
 *
 * 更麻烦的是，vitest 自己有两个内置插件专门把 `.css` 变成空模块
 * （`test.css` 默认为 false）：
 *   - "vitest:css-disable"    enforce "pre"  返回 { code: "" }
 *   - "vitest:css-empty-post" enforce "post" 返回 `export default ""`
 * 它们分别守在 pre / post 两端，且都按 id 的扩展名判断，所以用户插件无论设成哪个
 * enforce 都会被覆盖（实测：pre 与 post 都试过，见任务报告）。
 *
 * 因此这里不靠 enforce 抢顺序，而是在 resolveId 阶段把 `*.css` 换成不以 `.css`
 * 结尾的虚拟 id。cssLangRE 不再命中之后，上述两个内置插件与 vite:css 都会跳过，
 * 只剩下面的 load 把文件原文当纯文本导出。src/snippets.ts 的 import 保持原样，
 * esbuild 侧的 ".css": "text" loader 也不受影响。
 */
const VIRTUAL_PREFIX = "\0card-home-tab-css-text:";
const VIRTUAL_SUFFIX = "!raw";

export default defineConfig({
  plugins: [
    {
      name: "card-home-tab-css-as-text",
      enforce: "pre",
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith(".css") || importer === undefined) {
          return null;
        }
        const absolute = isAbsolute(source) ? source : resolve(dirname(importer), source);
        return `${VIRTUAL_PREFIX}${absolute}${VIRTUAL_SUFFIX}`;
      },
      load(id: string) {
        if (!id.startsWith(VIRTUAL_PREFIX) || !id.endsWith(VIRTUAL_SUFFIX)) {
          return null;
        }
        const file = id.slice(VIRTUAL_PREFIX.length, -VIRTUAL_SUFFIX.length);
        return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
      },
    },
  ],
});
