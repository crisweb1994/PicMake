/**
 * 界面文案必须走 i18n 资源：扫描 src 下的源码，发现写死的中日韩文字就报错。
 * 用 TypeScript 编译器解析语法树，只检查字符串字面量、模板字符串和 JSX 文本——注释天然不在其中。
 * 跳过：翻译资源本身（src/i18n/resources）和测试文件（测试里断言中文原文是有意的）。
 * 用法：node scripts/check-i18n.mjs（pnpm check 会调用）
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcDir = join(root, "src");

/** 汉字、日文假名、中日韩标点与全角字符 */
const CJK = /[　-ヿ㐀-䶿一-鿿＀-￯]/;

const isSkipped = (path) =>
  /[\\/]src[\\/]i18n[\\/]resources[\\/]/.test(path) ||
  /\.test\.tsx?$/.test(path);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !isSkipped(path) ? [path] : [];
  });
}

/** 一个语法节点里的文字（字符串字面量、模板片段、JSX 文本），没有就返回 undefined */
function textOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  )
    return node.text;
  if (ts.isJsxText(node)) return node.text;
  return undefined;
}

const found = [];
for (const path of sourceFiles(srcDir)) {
  const text = readFileSync(path, "utf8");
  const kind = path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const visit = (node) => {
    const value = textOf(node);
    if (value !== undefined && CJK.test(value)) {
      const { line, character } = file.getLineAndCharacterOfPosition(
        node.getStart(file),
      );
      found.push(
        `${relative(root, path)}:${line + 1}:${character + 1}  ${JSON.stringify(value.trim())}`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}

if (found.length) {
  console.error(
    `发现 ${found.length} 处写死的中文，请改走 src/i18n/resources 的资源（用 t("...")）：\n`,
  );
  console.error(found.join("\n"));
  process.exit(1);
}
console.log("check-i18n：没有写死的界面文案");
