[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CurrentInstaller,
  [string]$PreviousInstaller,
  [switch]$AllowExistingInstall
)

$ErrorActionPreference = "Stop"
$productPattern = "叙界|Narrative Ark"
$dataDirectory = Join-Path $env:APPDATA "com.narrativeark.client"
$markerName = "release-smoke-$([guid]::NewGuid().ToString('N')).json"
$markerPath = Join-Path $dataDirectory $markerName
$installedByTest = $false

function Get-UninstallEntry {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  foreach ($root in $roots) {
    $entry = Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -match $productPattern } |
      Select-Object -First 1
    if ($entry) { return $entry }
  }
  return $null
}

function Install-Nsis([string]$Path, [switch]$Update) {
  $resolved = (Resolve-Path -LiteralPath $Path).Path
  if (-not $resolved.EndsWith(".exe", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Smoke test expects an NSIS setup executable: $resolved"
  }
  $arguments = @("/S")
  if ($Update) { $arguments += "/UPDATE" }
  $process = Start-Process -FilePath $resolved -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Installer exited with code $($process.ExitCode): $resolved"
  }
}

function Wait-ForUninstallEntry([bool]$Present) {
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $entry = Get-UninstallEntry
    if (($Present -and $entry) -or (-not $Present -and -not $entry)) {
      return $entry
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for uninstall registry state: present=$Present"
}

function Resolve-InstalledExecutable($Entry) {
  if ($Entry.DisplayIcon) {
    $candidate = ($Entry.DisplayIcon -replace ',\d+$', '').Trim('"')
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  if ($Entry.InstallLocation) {
    $candidate = Get-ChildItem -LiteralPath $Entry.InstallLocation -Filter "*.exe" -File |
      Where-Object { $_.Name -notmatch "uninstall" } |
      Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
  }
  throw "Installed application executable was not found"
}

function Launch-And-Stop($Entry) {
  $executable = Resolve-InstalledExecutable $Entry
  $process = Start-Process -FilePath $executable -PassThru
  Start-Sleep -Seconds 5
  if ($process.HasExited) {
    if ($process.ExitCode -ne 0) {
      throw "Application exited during smoke test with code $($process.ExitCode)"
    }
  } else {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
}

function Uninstall-Application($Entry) {
  $command = [string]$Entry.UninstallString
  if (-not $command) { throw "UninstallString is missing" }
  if ($command -match '^"([^"]+)"(.*)$') {
    $file = $matches[1]
    $extra = $matches[2].Trim()
  } else {
    $parts = $command -split '\s+', 2
    $file = $parts[0]
    $extra = if ($parts.Length -gt 1) { $parts[1] } else { "" }
  }
  $arguments = @()
  if ($extra) { $arguments += $extra }
  $arguments += "/S"
  $process = Start-Process -FilePath $file -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Uninstaller exited with code $($process.ExitCode)"
  }
}

$existing = Get-UninstallEntry
if ($existing -and -not $AllowExistingInstall) {
  throw "An existing Narrative Ark installation was found. Use a clean runner or -AllowExistingInstall."
}

try {
  if ($PreviousInstaller) {
    Install-Nsis $PreviousInstaller
  } else {
    Install-Nsis $CurrentInstaller
  }
  $installedByTest = $true
  $entry = Wait-ForUninstallEntry $true
  Launch-And-Stop $entry

  New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null
  @{
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    purpose = "install-upgrade-uninstall-persistence"
  } | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8

  Install-Nsis $CurrentInstaller -Update
  $entry = Wait-ForUninstallEntry $true
  Launch-And-Stop $entry
  if (-not (Test-Path -LiteralPath $markerPath)) {
    throw "Application data marker was lost during upgrade"
  }

  Uninstall-Application $entry
  Wait-ForUninstallEntry $false | Out-Null
  if (-not (Test-Path -LiteralPath $markerPath)) {
    throw "Application data marker was lost during uninstall"
  }

  Write-Output "Windows install/upgrade/uninstall smoke test passed; app data was preserved."
} finally {
  if ($installedByTest) {
    $remaining = Get-UninstallEntry
    if ($remaining) {
      try { Uninstall-Application $remaining } catch { Write-Warning $_ }
    }
  }
  if (Test-Path -LiteralPath $markerPath) {
    Remove-Item -LiteralPath $markerPath -Force
  }
}
