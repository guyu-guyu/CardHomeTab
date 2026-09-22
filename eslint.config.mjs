import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },
  {
    // `obsidianmd/no-nodejs-modules` 的理由是「移动端没有 Node API」，针对的是会被打包进
    // main.js 的运行时代码。测试文件不进打包产物、只在 node 下由 vitest 跑，该理由不成立，
    // 而读取仓库里的 styles.css 做守卫断言本来就只能靠 node:fs。
    // 仅对 tests/ 生效、且只关这一条规则，src/ 的门禁不受影响。
    files: ["tests/**/*.ts"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
]);
