# Run the e2e suite without the VS Code window showing up.
#
# Why this exists:
#   VS Code has no headless / silent / start-minimized flag (verified against
#   `code --help`), and @vscode/test-electron just spawns it normally.
#   But e2e MUST start a real VS Code -- language binding, activation and
#   DiagnosticCollection can only be verified in a real host -- so the window
#   cannot be avoided. What CAN be avoided is the window showing on the
#   user's desktop.
#
# Why not a hidden desktop:
#   The clean way would be CreateDesktopW + STARTUPINFO.lpDesktop, so the whole
#   process tree lives on an invisible desktop. CreateDesktopW works here, but
#   a P/Invoked CreateProcessW always fails with win32 error 3 in this
#   environment (even the minimal signature, absolute path, no desktop) while
#   .NET's own Process.Start works fine -- so that path is closed.
#
# What this does instead:
#   Runs the suite in the FOREGROUND and hides windows from a background job.
#   Foreground matters: Start-Process -PassThru reported a bogus ExitCode of 1
#   for a run that plainly succeeded, so the suite runs as a plain child
#   command and we read $LASTEXITCODE.
#
#   The job polls for Code.exe processes whose command line carries OUR test
#   profile (--user-data-dir=<repo>/.vscode-test/user-data) and hides their
#   main window. Matching on the profile path matters: the user may well have
#   their own VS Code open, and that one must not be touched.
#
# Usage: npm run test:e2e:silent
#        pwsh -File scripts/run-e2e-silent.ps1 [-NoHide]
#
# NOTE: keep this file ASCII-only. Windows PowerShell reads .ps1 as ANSI
#       unless there is a BOM, and non-ASCII bytes have broken this script
#       (and its C# here-string) before.

param(
    [string]$Script = 'test:e2e',
    [int]$PollMs = 250
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$profileMarker = Join-Path $repo '.vscode-test\user-data'

Write-Host "[e2e] starting (VS Code windows for the test profile will be hidden)"
Write-Host "[e2e] profile marker: $profileMarker"

$hider = Start-Job -ArgumentList $profileMarker, $PollMs -ScriptBlock {
    param($marker, $pollMs)

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WinHide {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    public const int SW_HIDE = 0;
}
'@

    $count = 0
    $maxCand = 0
    $maxVisible = 0
    while ($true) {
        try {
            $cands = @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" -ErrorAction SilentlyContinue |
                Where-Object { $_.CommandLine -and $_.CommandLine.Contains($marker) })
            if ($cands.Count -gt $maxCand) { $maxCand = $cands.Count }
            $vis = 0
            foreach ($c in $cands) {
                $p = Get-Process -Id $c.ProcessId -ErrorAction SilentlyContinue
                if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero -and [WinHide]::IsWindowVisible($p.MainWindowHandle)) {
                    $vis++
                    [void][WinHide]::ShowWindow($p.MainWindowHandle, [WinHide]::SW_HIDE)
                    $count++
                    # Emit on every hide so the parent can read the total from
                    # buffered job output (the job loops forever otherwise).
                    Write-Output $count
                }
            }
            if ($vis -gt $maxVisible) { $maxVisible = $vis }
            Write-Output "STATS candidates=$maxCand visible=$maxVisible hidden=$count"
        } catch {
            # Enumeration failing must not abort the run.
        }
        Start-Sleep -Milliseconds $pollMs
    }
}

$code = 1
try {
    # npm writes progress to stderr; with ErrorActionPreference=Stop that turns
    # into a terminating NativeCommandError and the run dies before the tests
    # even start. Relax it for the duration of the child command.
    $ErrorActionPreference = 'Continue'
    & npm run $Script
    $code = $LASTEXITCODE
} finally {
    $all = @(Receive-Job $hider -ErrorAction SilentlyContinue)
    $hides = @($all | Where-Object { $_ -is [int] }) | Select-Object -Last 1
    $stats = @($all | Where-Object { $_ -is [string] -and $_ -like 'STATS*' }) | Select-Object -Last 1
    Stop-Job $hider -ErrorAction SilentlyContinue
    Remove-Job $hider -Force -ErrorAction SilentlyContinue
    if ($null -eq $hides) { $hides = 0 }
    Write-Host "[e2e] done, exit code $code (hid the window $hides time(s))"
    if ($stats) { Write-Host "[e2e] $stats" }
}

if ($null -eq $code) { $code = 1 }
exit $code
