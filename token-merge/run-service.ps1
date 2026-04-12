$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot


$nodePath = if (Test-Path 'C:\Program Files\nodejs\node.exe') {
    'C:\Program Files\nodejs\node.exe'
} elseif (Test-Path 'C:\Program Files (x86)\nodejs\node.exe') {
    'C:\Program Files (x86)\nodejs\node.exe'
} else {
    'node'
}

& $nodePath 'dist/index.js'
exit $LASTEXITCODE

