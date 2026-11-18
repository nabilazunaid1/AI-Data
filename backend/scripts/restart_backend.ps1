$ErrorActionPreference = 'Stop'
$taskBackend = Split-Path -Parent $PSScriptRoot
$taskPython = Join-Path $taskBackend '.venv/Scripts/python.exe'
$listeners = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
    $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if (-not $taskProcess) { continue }
    $parentProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskProcess.ParentProcessId)"
    if ($parentProcess.ExecutablePath -ne $taskPython -or $parentProcess.CommandLine -notmatch 'uvicorn' -or $parentProcess.CommandLine -notmatch 'app.main:app') {
        throw 'Port 8000 is not owned by the verified workspace backend; nothing was stopped.'
    }
    # Uvicorn reload workers inherit the listening socket; stop them before
    # the verified parent so a stale worker cannot keep serving old routes.
    $taskChildren = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($taskProcess.ProcessId)"
    foreach ($taskChild in $taskChildren) {
        if ($taskChild.Name -eq 'python.exe' -and $taskChild.CommandLine -match 'spawn_main|resource_tracker') {
            Stop-Process -Id $taskChild.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
    Stop-Process -Id $taskProcess.ProcessId -Force
    Stop-Process -Id $parentProcess.ProcessId -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path (Join-Path $taskBackend 'data') | Out-Null
$newBackend = Start-Process -FilePath $taskPython -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000','--reload','--reload-dir','app' -WorkingDirectory $taskBackend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskBackend 'data/backend.out.log') -RedirectStandardError (Join-Path $taskBackend 'data/backend.err.log')
$newBackend.Id | Set-Content (Join-Path $taskBackend 'data/backend.pid')
Write-Output "Workspace backend restarted with process $($newBackend.Id)."
