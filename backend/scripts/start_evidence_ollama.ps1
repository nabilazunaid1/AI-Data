$ErrorActionPreference = 'Stop'
$env:OLLAMA_HOST = '127.0.0.1:11435'
$taskRoot = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $taskRoot 'data') | Out-Null
$taskProcess = Start-Process -FilePath "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" -ArgumentList 'serve' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRoot 'data/ollama-evidence.out.log') -RedirectStandardError (Join-Path $taskRoot 'data/ollama-evidence.err.log')
$taskProcess.Id | Set-Content (Join-Path $taskRoot 'data/ollama-evidence.pid')
Write-Output "Isolated Ollama process: $($taskProcess.Id)"
