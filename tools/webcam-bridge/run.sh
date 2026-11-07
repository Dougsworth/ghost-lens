#!/bin/bash
# Start the GHOST webcam bridge. First run sets up a Python environment (about a minute).
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv && ./.venv/bin/pip install -q --upgrade pip && ./.venv/bin/pip install -q mediapipe opencv-python websockets
fi
./.venv/bin/python bridge.py "$@"
