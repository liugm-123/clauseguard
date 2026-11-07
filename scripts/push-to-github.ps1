<#
.SYNOPSIS
    把 ClauseGuard 仓库推送到 GitHub（公开仓库）。

.DESCRIPTION
    1. 校验是否已初始化 Git、是否存在被误跟踪的 .env；
    2. 设置远程地址（自动去掉手误输入的尖括号）；
    3. 检查远程仓库是否已创建、是否为空；
    4. 推送 main 分支。

    推送前请先在 https://github.com/new 新建一个空仓库
    （名称 clauseguard，选 Public，不要勾选 README / .gitignore / License）。

.EXAMPLE
    .\scripts\push-to-github.ps1 -User liugm-123 -Repo clauseguard

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

# 允许直接粘贴带尖括号的写法，例如 <liugm-123>
$User = ($User -replace '[<>]', '').Trim()
$Repo = ($Repo -replace '[<>]', '').Trim()

<#
  执行 git 并安全捕获输出。
  Windows PowerShell 5.1 会把原生命令的 stderr 变成 ErrorRecord，
  在 $ErrorActionPreference='Stop' 下会直接终止脚本，因此这里单独降级处理。
#>
function Invoke-Git {
    param([string[]]$GitArgs)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = & git @GitArgs 2>&1 | ForEach-Object { "$_" }
        return [pscustomobject]@{ Code = $LASTEXITCODE; Output = ($lines -join "`n") }
    }
    finally {
        $ErrorActionPreference = $previous
    }
}

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    if (-not (Test-Path '.git')) { throw "当前目录不是 Git 仓库：$root" }

    if ($User -and $User -match '[^A-Za-z0-9\-]') {
        throw "GitHub 用户名不合法：'$User'（只允许字母、数字和连字符，不要带尖括号）"
    }
    if ($Repo -match '[^A-Za-z0-9\-_.]') {
        throw "仓库名不合法：'$Repo'"
    }

    # ---- 安全检查：敏感文件不得入库 ----
    $tracked = (Invoke-Git @('ls-files')).Output -split "`n"
    foreach ($sensitive in @('.env', 'server/.env')) {
        if ($tracked -contains $sensitive) {
            throw "检测到 $sensitive 已被 Git 跟踪！请先执行：git rm --cached $sensitive"
        }
    }
    if ((Invoke-Git @('diff', '--cached', '--name-only')).Output -match '\.env') {
        throw '暂存区包含 .env 文件，已中止推送。'
    }

    # ---- 远程设置 ----
    $remote = Invoke-Git @('remote', 'get-url', 'origin')
    $current = if ($remote.Code -eq 0) { $remote.Output.Trim() } else { '' }

    if ($User) {
        $url = "https://github.com/$User/$Repo.git"
        if ($current) { [void](Invoke-Git @('remote', 'set-url', 'origin', $url)) }
        else { [void](Invoke-Git @('remote', 'add', 'origin', $url)) }
        $current = $url
    }
    if (-not $current) {
        throw '未配置远程仓库。请传入 -User <GitHub用户名>，或先手动 git remote add origin <url>'
    }
    Write-Host "远程仓库：$current" -ForegroundColor Cyan

    # ---- 远程是否已创建、是否为空 ----
    $lsRemote = Invoke-Git @('ls-remote', '--heads', 'origin')
    if ($lsRemote.Code -ne 0) {
        $web = $current -replace '\.git$', ''
        Write-Host ''
        Write-Host '无法访问远程仓库，通常是还没有在 GitHub 上创建它。' -ForegroundColor Yellow
        Write-Host '请先打开下面这个页面，新建空仓库（名称与下面一致，选 Public）：' -ForegroundColor Yellow
        Write-Host '  https://github.com/new' -ForegroundColor Yellow
        Write-Host "  仓库地址应为：$web" -ForegroundColor Yellow
        Write-Host '  不要勾选 Add a README / .gitignore / License，否则首次推送会冲突。' -ForegroundColor Yellow
        Write-Host ''
        Write-Host "git 原始输出：$($lsRemote.Output)" -ForegroundColor DarkGray
        throw '远程仓库不存在或不可访问，已中止。'
    }
    if ($lsRemote.Output.Trim()) {
        Write-Host '远程已有提交记录，先尝试 pull --rebase。' -ForegroundColor Yellow
        $pull = Invoke-Git @('pull', '--rebase', 'origin', $Branch)
        Write-Host $pull.Output
        if ($pull.Code -ne 0) { throw 'pull --rebase 失败，请手动解决冲突后重试。' }
    }

    # ---- 工作区 ----
    $status = (Invoke-Git @('status', '--porcelain')).Output.Trim()
    if ($status) {
        Write-Host '工作区存在未提交改动：' -ForegroundColor Yellow
        Write-Host $status
        $answer = Read-Host '是否先自动提交？(y/N)'
        if ($answer -eq 'y') {
            [void](Invoke-Git @('add', '-A'))
            $commit = Invoke-Git @('commit', '-m', 'chore: 提交前同步改动')
            Write-Host $commit.Output
        }
        else {
            throw '存在未提交改动，已中止。'
        }
    }

    # ---- 推送 ----
    Write-Host '正在推送…（首次推送会弹出浏览器要求登录 GitHub）' -ForegroundColor Cyan
    $push = Invoke-Git @('push', '-u', 'origin', $Branch)
    Write-Host $push.Output
    if ($push.Code -ne 0) { throw '推送失败，请检查网络、账号授权或仓库权限。' }

    Write-Host ''
    Write-Host "推送完成：$($current -replace '\.git$', '')" -ForegroundColor Green
    Write-Host '请到仓库 Settings → General → 底部确认可见性为 Public。' -ForegroundColor Cyan
}
finally {
    Pop-Location
}
