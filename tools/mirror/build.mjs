// 公网镜像构建：把 index.html + selfcheck.html + README + book/*.md 打成自带正文的独立页面，
// 输出到 docs/（GitHub Pages 从 main 的 /docs 目录发布）。
//
// 与 tools/offline/build.mjs 的区别（那个是给「双击本地打开」用的，正文一字不动）：
//   1. 去掉原作者站点的广告位与微信赞赏入口（镜像不代作者变现），改成署名说明块
//   2. 去掉 Google Analytics（别人的统计不该记我们的访问）
//   3. 顶部插镜像说明、页脚注明同步版本（CC BY 4.0 要求署名 + 注明是否修改）
//   4. 正文本身一字不改：book/*.md、docs/*.md 原样内联进 window.__CORPUS__
//
// 用法：node tools/mirror/build.mjs [输出目录]   默认 dist-mirror/（.gitignore 已忽略）
// 发布：pwsh tools/mirror/publish.ps1 —— 构建产物推到 gh-pages 分支，Pages 从该分支根目录发布。
// 不写进 docs/：那个目录被上游用来放长文，混在一起以后 pull 会扯皮。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { ROOT, REPO, SITE, read, gitCommit, buildStamp } from '../lib/book.mjs';

const OUT = resolve(ROOT, process.argv[2] ?? 'dist-mirror');
const rel = relative(ROOT, OUT).split('\\').join('/');
if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`输出目录必须在仓库内：${OUT}`);
if (rel === '.' || rel === 'docs' || rel.startsWith('docs/') || rel === 'book' || rel.startsWith('book/')) {
  throw new Error(`输出目录不能落在 ${rel}：docs/ 和 book/ 是上游正文目录，镜像产物请放 dist-mirror/`);
}
const STAMP = buildStamp();
const COMMIT = gitCommit();
const MIRROR = 'https://github.com/hiaicz/HowToLiveBetter';

// ---------- 正文语料 ----------
const readme = read('README.md');
const files = [...new Set([...readme.matchAll(/\]\((book\/[^)]+\.md)\)/g)].map(m => m[1]))].sort();
if (!files.length) throw new Error('README 目录里没找到 book/ 文件，镜像页会是空的');
const docs = [...new Set([...readme.matchAll(/\]\((docs\/[^)#/]+\.md)\)/g)].map(m => m[1]))].sort();
const corpus = {
  readme,
  parts: Object.fromEntries(files.map(f => [f, read(f)])),
  docs: Object.fromEntries(docs.map(f => [f, read(f)])),
  updates: JSON.parse(read('updates.json')),
};
const corpusJson = JSON.stringify(corpus).replace(/<\/script/gi, '<\\/script');

// 任何一处锚点找不到就当场失败，别悄悄产出个残页
const must = (html, needle, label) => {
  if (!html.includes(needle)) throw new Error(`找不到${label}，上游页面结构变了，镜像脚本要跟着改：${needle}`);
  return html;
};

// ---------- 去掉 GA ----------
function stripGa(html, label) {
  const A = '<!-- ga:start', B = '<!-- ga:end -->';
  if (!html.includes(A)) return html;
  const out = html.slice(0, html.indexOf(A)) + html.slice(html.indexOf(B) + B.length);
  if (/googletagmanager|google-analytics/.test(out)) throw new Error(`${label} 剥掉标记后仍有统计域名残留`);
  return out;
}

// ---------- 署名文字 ----------
const noteTop = `
      <div class="mirror-note">
        <b>镜像说明</b>：本页是《高性价比人生指南》的公网镜像。正文版权归原作者
        <a href="https://github.com/eternity4719" target="_blank" rel="noopener">eternity4719</a> 所有，按
        <a href="https://creativecommons.org/licenses/by/4.0/deed.zh-hans" target="_blank" rel="noopener">CC BY 4.0</a>
        许可转载；原文仓库 <a href="${REPO}" target="_blank" rel="noopener">eternity4719/HowToLiveBetter</a>，
        在线原版 <a href="${SITE}" target="_blank" rel="noopener">${SITE}</a>。
        本镜像<b>移除了原站点的广告位与微信赞赏入口</b>，正文、标签、证据等级未作改动。
        同步于 ${STAMP}（北京时间）${COMMIT ? `，对应正文提交 ${COMMIT.slice(0, 7)}` : ''}；书里法条与补贴标准常改，以原版为准。
      </div>`;

const noteCss = `
  .mirror-note{margin:14px 0 18px;padding:10px 12px;border:1px solid var(--divider);border-left:3px solid var(--brand-1);border-radius:6px;background:var(--bg-soft);font-size:12.5px;line-height:1.7;color:var(--t2)}
  .mirror-note a{color:var(--brand-1)}
  .mirror-link{margin:0;font-size:12px;line-height:1.7;color:var(--t3)}
  .mirror-link a{color:var(--brand-1)}
`;

// ---------- index.html ----------
let html = read('index.html');
must(html, '<!-- ga:start', ' GA 起始标记');
html = stripGa(html, 'index.html');

// 广告位 + 赞赏按钮：整块换成署名说明（连同 #tip-open 一起走，JS 里那段同步置空）
const AD_START = '  <div class="group ad">';
const AD_END = '  </div>\n</aside>';
must(html, AD_START, ' 广告位起始');
must(html, AD_END, ' 侧栏结束');
const adBlock = html.slice(html.indexOf(AD_START), html.indexOf(AD_END) + AD_END.length);
if (!/ads\/mcyyy-side\.webp/.test(adBlock) || !/tip-open/.test(adBlock)) {
  throw new Error('侧栏 ad 块的结构和预期不符，先看一眼再改镜像脚本');
}
html = html.replace(adBlock, `  <div class="group ad">
    <div class="gt">原文与作者</div>
    <p class="mirror-link">镜像版已去掉原站点的广告位和微信赞赏入口。<br>
      作者原站 <a href="${SITE}" target="_blank" rel="noopener">eternity4719.github.io/HowToLiveBetter</a><br>
      正文按 CC BY 4.0 转载，署名见页面顶部说明。</p>
  </div>
</aside>`);

// 赞赏码弹窗整块删除
const TIP_START = '<div id="tip-mask" hidden>';
const TIP_END = '</div>\n\n<div id="xref-pop"';
must(html, TIP_START, ' 赞赏码弹窗起始');
must(html, TIP_END, ' 赞赏码弹窗结束');
const tipBlock = html.slice(html.indexOf(TIP_START), html.indexOf(TIP_END) + '</div>'.length);
if (!/wechat-reward\.png/.test(tipBlock)) throw new Error('赞赏码弹窗结构和预期不符');
html = html.replace(tipBlock + '\n\n', '');

// 弹窗 JS：元素已删，整段换成空实现，否则 getElementById(...).addEventListener 直接抛错、整页不渲染
const JS_START = "/* ---------- 赞赏码弹窗 ---------- */";
const JS_END = "document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !TIP.hidden){ ev.stopPropagation(); tipClose(); } }, true);";
must(html, JS_START, ' 赞赏码 JS 起始');
must(html, JS_END, ' 赞赏码 JS 结束');
const jsBlock = html.slice(html.indexOf(JS_START), html.indexOf(JS_END) + JS_END.length);
if (!/tip-open/.test(jsBlock)) throw new Error('赞赏码 JS 结构和预期不符');
html = html.replace(jsBlock, `/* ---------- 赞赏码弹窗：镜像版已移除（原站点广告位/赞赏入口不代作者变现） ---------- */`);

// 顶部镜像说明
must(html, '<div class="stat" aria-live="polite">', ' 统计行');
html = html.replace('<div class="stat" aria-live="polite">', `${noteTop}
      <div class="stat" aria-live="polite">`);

// 样式
must(html, '</style>', ' 样式结尾');
html = html.replace('</style>', `${noteCss}</style>`);

// 相对链接在 Pages 的 /docs 目录下也没有参照物了，一律指回上游
html = html
  .replaceAll('href="README.md"', `href="${REPO}/blob/main/README.md"`)
  .replaceAll('href="book/"', `href="${REPO}/tree/main/book"`)
  .replaceAll('<a class="title" href="./"', `<a class="title" href="${MIRROR}"`);

// 页脚注明这是镜像副本
const foot = '<div class="foot">';
must(html, foot, ' 页脚');
html = html.replace(foot, `${foot}本文是镜像副本，同步于 ${STAMP}${COMMIT ? `（正文提交 ${COMMIT.slice(0, 7)}）` : ''}，原作者 <a href="${REPO}">eternity4719</a>，正文 <a href="https://creativecommons.org/licenses/by/4.0/deed.zh-hans">CC BY 4.0</a>；本镜像仅移除原站广告与赞赏入口，未改动正文，最新内容以 <a href="${SITE}">原版</a> 为准。<br>`);

// 正文语料要在主脚本之前就位
const mainScript = '\n<script>\n/* ---------- 调试面板';
must(html, mainScript, ' 主脚本开头');
html = html.replace(mainScript, `\n<script>window.__CORPUS__=${corpusJson}</script>${mainScript}`);

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'index.html'), html);

// ---------- selfcheck.html ----------
let sc = read('selfcheck.html');
sc = stripGa(sc, 'selfcheck.html');
if (/ads\//.test(sc)) throw new Error('selfcheck.html 里出现了广告位，先看一眼');
// selfcheck.html 的主脚本是一整块，init 不是独立的 <script>：把语料赋在它前面即可
const scAnchor = '\n(async function init(){\n  const status = document.getElementById(\'status\');';
must(sc, scAnchor, ' selfcheck 主脚本开头');
sc = sc.replace(scAnchor, `\nwindow.__CORPUS__=${corpusJson};\n(async function init(){\n  const status = document.getElementById('status');`);
writeFileSync(resolve(OUT, 'selfcheck.html'), sc);

writeFileSync(resolve(OUT, '.nojekyll'), '');

const kb = n => (n / 1024 | 0) + ' KB';
console.log(`镜像已生成 → ${OUT}`);
console.log(`  正文 ${files.length} 篇、长文 ${docs.length} 篇，index.html ${kb(Buffer.byteLength(html))}，selfcheck.html ${kb(Buffer.byteLength(sc))}`);
console.log(`  同步时间 ${STAMP}${COMMIT ? `，正文提交 ${COMMIT.slice(0, 7)}` : ''}`);
console.log(`  署名：eternity4719（CC BY 4.0）；已移除广告位、赞赏入口、Google Analytics`);
