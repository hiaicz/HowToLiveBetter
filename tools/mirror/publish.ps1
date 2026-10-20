# 构建公网镜像并发布到 gh-pages 分支（GitHub Pages 从该分支根目录发布）
# 用法：pwsh tools/mirror/publish.ps1 ["提交说明"]
# 前提：gh CLI 或 git 凭据已配置（本机已配 socks5 代理 + HTTPS 凭据）；Pages 只需首次在仓库设置里指定 gh-pages 分支
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path.Replace('\', '/')
$out = "$repo/dist-mirror"
$wt = Join-Path $env:TEMP 'htlb-gh-pages'
$msg = if ($args.Count -ge 1) { $args[0] } else { "mirror: sync $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

Write-Host '[1/4] 构建镜像页'
& node "$repo/tools/mirror/build.mjs" $out
if ($LASTEXITCODE -ne 0) { throw '构建失败' }

Write-Host '[2/4] 准备 gh-pages 工作区'
if (Test-Path $wt) {
  git -C $repo worktree remove --force $wt 2>$null | Out-Null
  if (Test-Path $wt) { Remove-Item -Recurse -Force $wt }
}
git -C $repo worktree prune | Out-Null
git -C $repo fetch origin gh-pages --quiet 2>$null | Out-Null

git -C $repo rev-parse --verify --quiet refs/heads/gh-pages | Out-Null
$hasLocal = ($LASTEXITCODE -eq 0)
git -C $repo rev-parse --verify --quiet refs/remotes/origin/gh-pages | Out-Null
$hasRemote = ($LASTEXITCODE -eq 0)

if ($hasLocal) {
  git -C $repo worktree add $wt gh-pages | Out-Null
} elseif ($hasRemote) {
  git -C $repo worktree add -b gh-pages $wt origin/gh-pages | Out-Null
} else {
  Write-Host '  首次发布：新建 gh-pages 孤儿分支'
  git -C $repo worktree add --detach $wt | Out-Null
  git -C $wt checkout --orphan gh-pages 2>&1 | Out-Null
  git -C $wt rm -rf --cached . 2>&1 | Out-Null
}

Write-Host '[3/4] 同步构建产物'
Get-ChildItem $wt -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
Copy-Item "$out/*" $wt -Recurse -Force
$files = (Get-ChildItem $wt -Recurse -File | Where-Object { $_.FullName -notmatch '\\\.git\\' } | Measure-Object).Count
Write-Host "  产物 $files 个文件"
git -C $wt add -A
git -C $wt -c core.autocrlf=false commit -m $msg --quiet 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host '  内容无变化，不产生新提交' }

Write-Host '[4/4] 推送到 origin'
git -C $wt push origin gh-pages 2>&1 | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { throw '推送失败' }
Write-Host '完成。Pages 地址：https://hiaicz.github.io/HowToLiveBetter/'
