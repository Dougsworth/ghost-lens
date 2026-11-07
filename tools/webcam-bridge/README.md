# GHOST webcam bridge (preview only)
The SPECS preview has no camera hand tracking, so this streams your real hand from the Mac webcam into the Lens.

Run:  bash tools/webcam-bridge/run.sh   (first run installs MediaPipe, about a minute; allow camera access for Terminal)
Check it works without Lens Studio:  tools/webcam-bridge/.venv/bin/python tools/webcam-bridge/test_client.py
Pinch = touch thumb and index finger. Index fingertip drives the brush.

In the Lens: Assets/Scripts/WebcamHandBridge.ts connects to ws://127.0.0.1:8765 and fires onPinchStart / onPinchMove / onPinchEnd with world positions. The brush stroke code should listen to both SIK pinch drag and this bridge, so mouse, webcam and real Specs hands all work.
On real Specs, turn enabledInPreview off; native hand tracking is used.
