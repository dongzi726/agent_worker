param(
    [Nullable[int]]$Port = $null,
    [string]$BindAddress = '',
    [switch]$SkipBuild,
    [int]$StartupTimeoutSeconds = 25
)

$ErrorActionPreference = 'Stop'

function Resolve-Executable {
    param(
        [string[]]$CommandNames,
        [string[]]$FallbackPaths = @()
    )

    foreach ($name in $CommandNames) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command -and $command.Source) {
            return $command.Source
        }
    }

    foreach ($path in $FallbackPaths) {
        if (Test-Path $path) {
            return $path
        }
    }

    throw "Unable to find executable: $($CommandNames -join ', ')"
}

function Read-AppConfig {
    param([string]$ConfigFilePath)

    if (-not (Test-Path $ConfigFilePath)) {
        throw "Config file not found: $ConfigFilePath"
    }

    return Get-Content $ConfigFilePath -Raw | ConvertFrom-Json
}

function Stop-ListeningProcesses {
    param([int]$TargetPort)

    $pids = @()

    try {
        $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction Stop
        if ($connections) {
            $pids += $connections | Select-Object -ExpandProperty OwningProcess -Unique
        }
    } catch {
        $netstatLines = cmd /c "netstat -ano | findstr :$TargetPort"
        foreach ($line in $netstatLines) {
            if ($line -match 'LISTENING\s+(\d+)$') {
                $pids += [int]$Matches[1]
            }
        }
    }

    $pids = $pids | Where-Object { $_ -gt 0 } | Select-Object -Unique

    foreach ($processId in $pids) {
        Write-Host "Stopping process on port $TargetPort (PID=$processId)..."
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$configPath = Join-Path $ProjectRoot 'config.json'
$appConfig = Read-AppConfig -ConfigFilePath $configPath

if (-not $Port.HasValue) {
    if ($null -ne $appConfig.port) {
        $Port = [int]$appConfig.port
    } else {
        $Port = 3000
    }
}

if ([string]::IsNullOrWhiteSpace($BindAddress)) {
    if ($null -ne $appConfig.bindAddress -and -not [string]::IsNullOrWhiteSpace([string]$appConfig.bindAddress)) {
        $BindAddress = [string]$appConfig.bindAddress
    } else {
        $BindAddress = '127.0.0.1'
    }
}

$nodePath = Resolve-Executable -CommandNames @('node') -FallbackPaths @(
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe'
)

$npmPath = Resolve-Executable -CommandNames @('npm.cmd', 'npm') -FallbackPaths @(
    'C:\Program Files\nodejs\npm.cmd',
    'C:\Program Files (x86)\nodejs\npm.cmd'
)

$env:Path = (Split-Path $nodePath -Parent) + ';' + $env:Path

$nodeVersion = (& $nodePath -p "process.versions.node").Trim()
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 22) {
    throw "Node.js >= 22 is required. Current version: $nodeVersion"
}


if (-not (Test-Path 'node_modules')) {
    Write-Host 'Installing dependencies...'
    & $npmPath install
    if ($LASTEXITCODE -ne 0) {
        throw 'npm install failed'
    }
}

$distEntry = Join-Path $ProjectRoot 'dist\index.js'
$packageJson = Join-Path $ProjectRoot 'package.json'
$latestSourceTime = (Get-ChildItem (Join-Path $ProjectRoot 'src') -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
$needsBuild = (-not (Test-Path $distEntry)) -or ((Get-Item $packageJson).LastWriteTime -gt (Get-Item $distEntry).LastWriteTime) -or ($latestSourceTime -gt (Get-Item $distEntry).LastWriteTime)

if (-not $SkipBuild -and $needsBuild) {
    Write-Host 'Building project...'
    & $npmPath run build
    if ($LASTEXITCODE -ne 0) {
        throw 'npm run build failed'
    }
}

Stop-ListeningProcesses -TargetPort $Port

$logsDir = Join-Path $ProjectRoot 'logs'
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutLog = Join-Path $logsDir "tokenmerge.$timestamp.stdout.log"
$stderrLog = Join-Path $logsDir "tokenmerge.$timestamp.stderr.log"

Write-Host 'Starting service...'
$serviceRunner = Join-Path $ProjectRoot 'run-service.ps1'
$process = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $serviceRunner
) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Hidden -PassThru

$readyUri = "http://${BindAddress}:$Port/ready"
$healthUri = "http://${BindAddress}:$Port/health"
$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
$ready = $false

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 750

    if ($process.HasExited) {
        $stderr = if (Test-Path $stderrLog) { Get-Content $stderrLog -Raw } else { '' }
        throw "Service exited early with code $($process.ExitCode). $stderr"
    }

    try {
        $response = Invoke-RestMethod -Uri $readyUri -TimeoutSec 3
        if ($response.data.ready -eq $true) {
            $ready = $true
            break
        }
    } catch {
    }
}

if (-not $ready) {
    $stderr = if (Test-Path $stderrLog) { Get-Content $stderrLog -Raw } else { '' }
    throw "Service did not become ready within $StartupTimeoutSeconds seconds. $stderr"
}

$health = Invoke-RestMethod -Uri $healthUri -TimeoutSec 5

Write-Host ''
Write-Host 'TokenMerge restarted successfully.'
Write-Host "PID: $($process.Id)"
Write-Host "Ready URL: $readyUri"
Write-Host "Health URL: $healthUri"
Write-Host "stdout log: $stdoutLog"
Write-Host "stderr log: $stderrLog"
Write-Host "Health status: $($health.data.status)"

