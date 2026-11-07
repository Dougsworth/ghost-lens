"""GHOST webcam hand bridge.

Preview only dev tool. Reads your real hand from the Mac webcam with MediaPipe
and streams it to the Lens over a local WebSocket, so you can test with real
hands in the Lens Studio SPECS preview. On real Specs the Lens uses native
hand tracking and ignores this.

Message (JSON, ~30 per second):
{"t": time, "hands": [{"side": "Right", "pinch": true, "pinchDist": 0.03,
  "points": [[x, y, z], ... 21 points]}]}
x, y are 0..1 of the camera frame (x already mirrored so it matches you), z is depth relative to wrist.
Point 4 = thumb tip, 8 = index tip. See MediaPipe hand landmark diagram.
"""
import asyncio, json, os, queue, threading, time, urllib.request
import cv2
import mediapipe as mp
import websockets

HOST, PORT = "127.0.0.1", 8765
MODEL = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
PINCH_ON, PINCH_OFF = 0.045, 0.065  # thumb to index distance, with hysteresis

clients = set()
latest = {"t": 0, "hands": []}

async def handler(ws):
    clients.add(ws)
    print(f"Lens connected ({len(clients)})")
    try:
        await ws.wait_closed()
    finally:
        clients.discard(ws)

def make_landmarker():
    if not os.path.exists(MODEL):
        print("Downloading hand model...")
        urllib.request.urlretrieve(MODEL_URL, MODEL)
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision
    opts = vision.HandLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=MODEL),
        running_mode=vision.RunningMode.VIDEO, num_hands=int(os.environ.get("GHOST_HANDS", "1")),
        min_hand_detection_confidence=0.5, min_tracking_confidence=0.5)
    return vision.HandLandmarker.create_from_options(opts)

class Grabber(threading.Thread):
    """Reads the webcam nonstop on its own thread and keeps only the newest frame."""
    def __init__(self):
        super().__init__(daemon=True)
        self.cap = cv2.VideoCapture(int(os.environ.get("GHOST_CAM", "0")), cv2.CAP_AVFOUNDATION)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 360)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        self.frame, self.n, self.lock = None, 0, threading.Lock()
        self.cam_fps, self._t = 0.0, time.time()
    def run(self):
        while True:
            ok, f = self.cap.read()
            if ok:
                t = time.time(); self.cam_fps = 0.9 * self.cam_fps + 0.1 / max(1e-3, t - self._t); self._t = t
                with self.lock:
                    self.frame, self.n = f, self.n + 1

def tracker_thread(loop, show_q):
    g = Grabber()
    if not g.cap.isOpened():
        print("Could not open webcam. Allow camera access for Terminal in System Settings > Privacy & Security > Camera.")
        os._exit(1)
    g.start()
    lm = make_landmarker()
    pinching, start, seen, last, fps = {}, time.time(), -1, time.time(), 0.0
    while True:
        with g.lock:
            f, n = g.frame, g.n
        if f is None or n == seen:
            time.sleep(0.002); continue
        seen = n
        f = cv2.flip(f, 1)
        if f.shape[1] > 640:
            f = cv2.resize(f, (640, int(640 * f.shape[0] / f.shape[1])))
        rgb = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
        res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int((time.time() - start) * 1000))
        hands = []
        for i, pts in enumerate(res.hand_landmarks or []):
            side = res.handedness[i][0].category_name if res.handedness else "Right"
            p = [[round(q.x, 4), round(q.y, 4), round(q.z, 4)] for q in pts]
            d = ((p[4][0]-p[8][0])**2 + (p[4][1]-p[8][1])**2) ** 0.5
            was = pinching.get(side, False)
            now = d < PINCH_ON if not was else d < PINCH_OFF
            pinching[side] = now
            hands.append({"side": side, "pinch": now, "pinchDist": round(d, 4), "points": p})
        msg = json.dumps({"t": round(time.time(), 3), "hands": hands})
        loop.call_soon_threadsafe(lambda m=msg: clients and websockets.broadcast(clients, m))
        now_t = time.time(); fps = 0.9 * fps + 0.1 / max(1e-3, now_t - last); last = now_t
        if show_q is not None and show_q.empty():
            show_q.put((f, hands, fps, g.cam_fps))

def show_loop(show_q):
    """Preview window on the main thread (macOS needs this). Only draws the newest result."""
    while True:
        f, hands, fps, cam = show_q.get()
        h, w = f.shape[:2]
        for hd in hands:
            for x, y, _ in hd["points"]:
                cv2.circle(f, (int(x*w), int(y*h)), 3, (40, 40, 40), -1)
            ix, iy, _ = hd["points"][8]
            cv2.circle(f, (int(ix*w), int(iy*h)), 10, (0, 0, 220) if hd["pinch"] else (220, 220, 220), 2)
        cv2.putText(f, f"GHOST bridge  lenses: {len(clients)}  camera {cam:3.0f} fps  tracking {fps:3.0f} fps  (q quits)", (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 1)
        cv2.imshow("GHOST webcam bridge", f)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            os._exit(0)

def main():
    import sys
    show = "--headless" not in sys.argv
    show_q = queue.Queue(maxsize=1) if show else None
    loop = asyncio.new_event_loop()
    def serve():
        asyncio.set_event_loop(loop)
        loop.run_until_complete(websockets.serve(handler, HOST, PORT))
        print(f"Bridge running on ws://{HOST}:{PORT}")
        loop.run_forever()
    threading.Thread(target=serve, daemon=True).start()
    threading.Thread(target=tracker_thread, args=(loop, show_q), daemon=True).start()
    if show:
        show_loop(show_q)
    else:
        threading.Event().wait()

if __name__ == "__main__":
    main()
