# modules/integrations/maintenance/applyUpdate.ps1
# Runs detached, independent of the NekoSuneAPPS process that spawned it,
# since that process is about to quit (msiexec can't replace files it still
# has open). Waits for it to fully exit, runs the downloaded .msi, then
# relaunches the newly-installed exe.

param(
  [Parameter(Mandatory=$true)][string]$MsiPath,
  [Parameter(Mandatory=$true)][string]$ExePath,
  [int]$WaitProcessId = 0
)

if ($WaitProcessId -gt 0) {
  try { Wait-Process -Id $WaitProcessId -Timeout 30 -ErrorAction SilentlyContinue } catch {}
}
# Small grace period for file handles to fully release even after exit.
Start-Sleep -Seconds 1

Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', "`"$MsiPath`"", '/passive', '/norestart') -Wait

if (Test-Path $ExePath) {
  Start-Process -FilePath $ExePath
}
