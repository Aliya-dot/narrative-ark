param(
  [string]$NdkVersion = "29.0.14206865",
  [int]$AndroidApi = 28
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sourceSdk = if ($env:ANDROID_HOME) {
  (Resolve-Path $env:ANDROID_HOME).Path
} elseif ($env:ANDROID_SDK_ROOT) {
  (Resolve-Path $env:ANDROID_SDK_ROOT).Path
} else {
  (Resolve-Path (Join-Path $workspace ".android-sdk")).Path
}

# Android's Windows native tools still have edge cases around non-ASCII paths.
# Keep reusable SDK and Cargo caches under an ASCII-only LocalAppData path.
$asciiRoot = Join-Path $env:LOCALAPPDATA "NarrativeArk\android-build"
$asciiSdk = Join-Path $asciiRoot "sdk"
$cargoTarget = Join-Path $asciiRoot "cargo-target"
$sessionId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$workLink = Join-Path $env:TEMP "narrative-ark-work-$sessionId"
$androidProject = Join-Path $env:TEMP "narrative-ark-android-$sessionId"

New-Item -ItemType Directory -Path $asciiSdk, $cargoTarget -Force | Out-Null
foreach ($component in @(
  "build-tools",
  "platforms",
  "platform-tools",
  "cmdline-tools",
  "licenses",
  "ndk"
)) {
  $source = Join-Path $sourceSdk $component
  $destination = Join-Path $asciiSdk $component
  if (!(Test-Path -LiteralPath $source)) {
    throw "Android SDK component is missing: $source"
  }
  Copy-Item -LiteralPath $source -Destination $asciiSdk -Recurse -Force
}

New-Item -ItemType Junction -Path $workLink -Target $workspace | Out-Null
$env:ANDROID_HOME = $asciiSdk
$env:ANDROID_SDK_ROOT = $asciiSdk
$env:NDK_HOME = Join-Path $asciiSdk "ndk\$NdkVersion"
$env:CARGO_TARGET_DIR = $cargoTarget
$toolchain = Join-Path $env:NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\bin"
$cargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
$manifest = Join-Path $workLink "src-tauri\Cargo.toml"

# Tauri embeds the Vite output in the Rust library. Build it before Cargo so
# Android releases always contain the current UI rather than a stale dist.
Push-Location $workspace
try {
  & npm.cmd run client:build
  if ($LASTEXITCODE -ne 0) {
    throw "Client asset build failed"
  }
} finally {
  Pop-Location
}

function Build-RustTarget {
  param(
    [string]$RustTarget,
    [string]$CompilerPrefix,
    [string]$EnvironmentSuffix
  )

  $linker = Join-Path $toolchain "$CompilerPrefix$AndroidApi-clang.cmd"
  $cxx = Join-Path $toolchain "$CompilerPrefix$AndroidApi-clang++.cmd"
  Set-Item "Env:CARGO_TARGET_$($EnvironmentSuffix.ToUpper())_LINKER" $linker
  Set-Item "Env:CC_$EnvironmentSuffix" $linker
  Set-Item "Env:CXX_$EnvironmentSuffix" $cxx
  Set-Item "Env:AR_$EnvironmentSuffix" (Join-Path $toolchain "llvm-ar.exe")
  Set-Item "Env:RANLIB_$EnvironmentSuffix" (Join-Path $toolchain "llvm-ranlib.exe")

  & $cargo build --manifest-path $manifest --target $RustTarget --release `
    --features "custom-protocol"
  if ($LASTEXITCODE -ne 0) {
    throw "Rust build failed for $RustTarget"
  }
}

Build-RustTarget "aarch64-linux-android" "aarch64-linux-android" "aarch64_linux_android"
Build-RustTarget "armv7-linux-androideabi" "armv7a-linux-androideabi" "armv7_linux_androideabi"

$jniRoot = Join-Path $workspace "src-tauri\gen\android\app\src\main\jniLibs"
$libraries = @{
  "arm64-v8a" = Join-Path $cargoTarget "aarch64-linux-android\release\libnarrative_ark_lib.so"
  "armeabi-v7a" = Join-Path $cargoTarget "armv7-linux-androideabi\release\libnarrative_ark_lib.so"
}
foreach ($entry in $libraries.GetEnumerator()) {
  $destination = Join-Path $jniRoot $entry.Key
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Copy-Item -LiteralPath $entry.Value -Destination (
    Join-Path $destination "libnarrative_ark_lib.so"
  ) -Force
}

Copy-Item -LiteralPath (Join-Path $workspace "src-tauri\gen\android") `
  -Destination $androidProject -Recurse
$copiedBuildDirectory = Join-Path $androidProject "app\build"
$verifiedProjectRoot = [IO.Path]::GetFullPath($androidProject).TrimEnd("\") + "\"
$verifiedBuildDirectory = [IO.Path]::GetFullPath($copiedBuildDirectory)
if (
  (Test-Path -LiteralPath $verifiedBuildDirectory) -and
  $verifiedBuildDirectory.StartsWith(
    $verifiedProjectRoot,
    [StringComparison]::OrdinalIgnoreCase
  )
) {
  Remove-Item -LiteralPath $verifiedBuildDirectory -Recurse -Force
}
$env:GRADLE_USER_HOME = Join-Path $workspace ".gradle-home"
New-Item -ItemType Directory -Path $env:GRADLE_USER_HOME -Force | Out-Null

Push-Location $androidProject
try {
  & ".\gradlew.bat" assembleUniversalRelease bundleUniversalRelease `
    "-PskipRustBuild=true" `
    "-PabiList=arm64-v8a,armeabi-v7a" `
    "-ParchList=arm64,arm" `
    "-PtargetList=aarch64,armv7" `
    --no-daemon
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle Android release build failed"
  }
} finally {
  Pop-Location
}

$generated = @(
  Join-Path $androidProject "app\build\outputs\apk\universal\release\app-universal-release.apk"
  Join-Path $androidProject "app\build\outputs\bundle\universalRelease\app-universal-release.aab"
)
foreach ($artifact in $generated) {
  if (!(Test-Path -LiteralPath $artifact -PathType Leaf)) {
    throw "Expected release artifact was not generated: $artifact"
  }
}

$output = Join-Path $workspace "src-tauri\gen\android\app\build\outputs\ascii-local"
New-Item -ItemType Directory -Path $output -Force | Out-Null
foreach ($artifact in $generated) {
  Copy-Item -LiteralPath $artifact -Destination (
    Join-Path $output ([IO.Path]::GetFileName($artifact))
  ) -Force
}

Write-Host "Android APK/AAB copied to $output"
