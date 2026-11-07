<#
.SYNOPSIS
    把 ClauseGuard 仓库推送到 GitHub（公开仓库）。

.DESCRIPTION
    1. 校验是否已初始化 Git、是否存在 .env 等敏感文件；
    2. 断言 .env 未被 Git 跟踪（防止密钥泄露）；
    3. 设置远程地址并推送 main 分支。

    推送前请先在 GitHub 网页上新建一个空仓库（不要勾选 README / .gitignore / License）。

.EXAMPLE
    .\scripts\push-to-github.ps1 -User "liujianyu" -Repo "clauseguard"

.EXAMPLE
    # 已配置好远程时，仅重新推送
    .\scripts\push-to-github.ps1
#>
[CmdletBinding()]
param(
    [string]$User,
    [string]$Repo = 'clauseguard',
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    if (-not (Test-Path '.git')) {
        throw "当前目录不是 Git 仓库：$root"
    }

    # ---- 安全检查：敏感文件不得入库 ----
    $tracked = git ls-files
    foreach ($sensitive in @('.env', 'server/.env')) {
        if ($tracked -contains $sensitive) {
            throw "检测到 $sensitive 已被 Git 跟踪！请先执行：git rm --cached $sensitive"
        }
    }
    $staged = git diff --cached --name-only
    if ($staged -match '\.env$') {
        throw "暂存区包含 .env 文件，已中止推送。"
    }

    # ---- 远程设置 ----
    $current = git remote get-url origin 2>$null
    if ($User) {
        $url = "https://github.com/$User/$Repo.git"
        if ($current) { git remote set-url origin $url } else { git remote add origin $url }
        $current = $url
    }
    if (-not $current) {
        throw "未配置远程仓库。请传入 -User <GitHub用户名>，或先手动 git remote add origin <url>"
    }

    # ---- 推送 ----
    $status = git status --porcelain
    if ($status) {
        Write-Host '工作区存在未提交改动：' -ForegroundColor Yellow
        Write-Host $status
        $answer = Read-Host '是否先自动提交？(y/N)'
        if ($answer -eq 'y') {
            git add -A
            git commit -m "chore: 提交前同步改动"
        }
        else {
            throw '存在未提交改动，已中止。'
        }
    }

    git push -u origin $Branch
    Write-Host ""
    Write-Host "推送完成：$($current -replace '\.git$','')" -ForegroundColor Green
    Write-Host "请到仓库 Settings → Visibility 确认已设为 Public。" -ForegroundColor Cyan
}
finally {
    Pop-Location
}
