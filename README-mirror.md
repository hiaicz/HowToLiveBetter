# 镜像说明（Mirror Notice）

本仓库是 [eternity4719/HowToLiveBetter](https://github.com/eternity4719/HowToLiveBetter)（《高性价比人生指南》）的**公网镜像**，由 [hiaicz](https://github.com/hiaicz) 维护，目的是在国内网络下有一个稳定可打开的只读副本。

## 属主与许可

- **正文版权与著作权归原作者 [eternity4719](https://github.com/eternity4719) 所有。**
- 正文按 **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.zh-hans)** 许可使用：保留署名、附许可链接、注明是否修改。
- 工具脚本（`tools/`、`index.html`、`selfcheck.html`、`.github/`）按上游声明为 **MIT**；本镜像新增的 `tools/mirror/` 同样 MIT。
- 原版在线阅读：<https://eternity4719.github.io/HowToLiveBetter/>　｜　原文仓库：<https://github.com/eternity4719/HowToLiveBetter>

## 镜像站点

- 地址：<https://hiaicz.github.io/HowToLiveBetter/>（GitHub Pages，源分支 `gh-pages` 根目录）
- 内容：`index.html`（全书阅读页）+ `selfcheck.html`（生活自查），**正文全部内联**，单文件自包含，不依赖任何外部请求。

## 相对上游做了哪些修改

仅限页面外壳与发布方式，**正文（`book/*.md`、`docs/*.md`、`README.md`）一字未改**：

1. 移除原站点的**广告位**与**微信赞赏入口**（不代原作者变现）；侧栏改为"原文与作者"说明块。
2. 移除 **Google Analytics** 统计（原作者的统计不该记录本镜像的访问者）。
3. 页面顶部加镜像说明、页脚标注同步时间与对应正文 commit。
4. 站内相对链接改指上游仓库，避免镜像下出现死链。

## 更新方式

```powershell
cd D:\Data\Git\HowToLiveBetter
git pull upstream main          # 拉原作者最新正文
pwsh tools/mirror/publish.ps1   # 重建镜像页并推到 gh-pages
```

`tools/mirror/build.mjs` 会校验上游页面结构的关键锚点：原作者改版导致锚点失效时脚本会直接报错，不会静默产出残页。

## 分支结构

| 分支 | 内容 |
|---|---|
| `main` | 上游正文 + 本镜像的构建脚本（`tools/mirror/`） |
| `gh-pages` | 构建产物（自动生成，勿手改），Pages 发布源 |

---
发现正文有问题，请到**上游仓库**提 issue：<https://github.com/eternity4719/HowToLiveBetter/issues>（本镜像不接收正文纠错）
