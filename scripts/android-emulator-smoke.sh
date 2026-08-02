#!/usr/bin/env bash
set -euo pipefail

APK_PATH="${1:?APK path is required}"
SCREEN_SIZE="${2:-360x640}"
SCREEN_DENSITY="${3:-320}"
PACKAGE_ID="com.narrativeark.client"
ACTIVITY_ID="${PACKAGE_ID}/.MainActivity"

test -f "${APK_PATH}"
adb wait-for-device
adb shell wm size "${SCREEN_SIZE}"
adb shell wm density "${SCREEN_DENSITY}"
adb install -r "${APK_PATH}"

adb shell am force-stop "${PACKAGE_ID}"
adb shell am start -W -n "${ACTIVITY_ID}"
sleep 8

PID="$(adb shell pidof "${PACKAGE_ID}" | tr -d '\r')"
if [[ -z "${PID}" ]]; then
  adb logcat -d -t 300
  echo "Android application process did not stay alive" >&2
  exit 1
fi

adb shell dumpsys package "${PACKAGE_ID}" | grep -E "versionName=|versionCode=|minSdk="
adb shell dumpsys activity activities | grep -E "mResumedActivity.*${PACKAGE_ID}|topResumedActivity.*${PACKAGE_ID}"
adb exec-out screencap -p > "android-smoke-api-${ANDROID_API_LEVEL:-unknown}.png"

if adb logcat -d -t 500 | grep -E "FATAL EXCEPTION:.*|Process: ${PACKAGE_ID}.*has died"; then
  echo "Fatal Android log entry detected" >&2
  exit 1
fi

echo "Android install and cold-start smoke test passed on API ${ANDROID_API_LEVEL:-unknown}, ${SCREEN_SIZE} @ ${SCREEN_DENSITY} dpi."
