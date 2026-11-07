#!/bin/bash
# Fast webcam bridge: tracking runs in Chrome on the GPU.
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv && ./.venv/bin/pip install -q websockets; fi
./.venv/bin/python bridge_web.py
