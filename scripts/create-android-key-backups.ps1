[CmdletBinding()]
param(
  [string]$SecretRoot = ".release-secrets/android",
  [string]$BackupRoot = ".release-secrets/android/offline-backups"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path ".").Path
$secretRootPath = (Resolve-Path -LiteralPath $SecretRoot).Path
$backupRootPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $BackupRoot))
if (
  -not $secretRootPath.StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase) -or
  -not $backupRootPath.StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase)
) {
  throw "Android key backup paths must stay inside the workspace"
}

$keystore = Join-Path $secretRootPath "narrative-ark-release.jks"
$passwordFile = Join-Path $secretRootPath "narrative-ark-release.password"
$certificate = Join-Path $secretRootPath "narrative-ark-release-cert.pem"
foreach ($required in @($keystore, $passwordFile, $certificate)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required signing file is missing: $required"
  }
}

$keystoreHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $keystore).Hash.ToLowerInvariant()
$certificateHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $certificate).Hash.ToLowerInvariant()
$password = [System.IO.File]::ReadAllText($passwordFile).Trim()
New-Item -ItemType Directory -Force -Path $backupRootPath | Out-Null

$readme = @(
  "Narrative Ark Android release signing recovery kit"
  ""
  "Application ID: com.narrativeark.client"
  "Key alias: narrative-ark-release"
  ""
  "Recovery:"
  "1. Restore narrative-ark-release.jks to .release-secrets/android/."
  "2. Save storePassword from credentials.properties as"
  "   .release-secrets/android/narrative-ark-release.password."
  "3. Run npm run android:signing:prepare."
  "4. Run npm run release:preflight:android."
  ""
  "Copy each ZIP to a separate encrypted offline medium. Never commit it."
) -join "`n"

foreach ($label in @("A", "B", "C")) {
  $directory = Join-Path $backupRootPath "Narrative-Ark-Android-Key-Backup-$label"
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  Copy-Item -LiteralPath $keystore -Destination (Join-Path $directory "narrative-ark-release.jks") -Force
  Copy-Item -LiteralPath $certificate -Destination (Join-Path $directory "narrative-ark-release-cert.pem") -Force
  [System.IO.File]::WriteAllText(
    (Join-Path $directory "credentials.properties"),
    "storePassword=$password`nkeyPassword=$password`nkeyAlias=narrative-ark-release`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $directory "README.txt"),
    $readme,
    [System.Text.UTF8Encoding]::new($false)
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $directory "SHA256SUMS.txt"),
    "$keystoreHash  narrative-ark-release.jks`n$certificateHash  narrative-ark-release-cert.pem`n",
    [System.Text.UTF8Encoding]::new($false)
  )

  $archive = "$directory.zip"
  Compress-Archive -Path (Join-Path $directory "*") -DestinationPath $archive -CompressionLevel Optimal -Force
  $archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  Write-Output "$archive`t$archiveHash"
}
