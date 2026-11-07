"""GHOST webcam bridge, fast version.

Tracking runs in Chrome (GPU MediaPipe, smooth 30 fps camera). This script
serves that page and relays its hand data to the Lens.
  Page:  http://127.0.0.1:8766   (open in Chrome, allow camera)
  Lens:  ws://127.0.0.1:8765     (same message format as bridge.py)
"""
import asyncio, http.server, json, os, threading, webbrowser
import websockets

import lesson_llm

HOST, WS_PORT, HTTP_PORT = "127.0.0.1", 8765, 8766
HERE = os.path.dirname(os.path.abspath(__file__))
lenses, sources = set(), set()

async def handler(ws):
    role = "lens"
    try:
        first = await asyncio.wait_for(ws.recv(), timeout=1.0)
        if first == "source":
            role = "source"
    except asyncio.TimeoutError:
        pass
    except websockets.ConnectionClosed:
        return
    group = sources if role == "source" else lenses
    group.add(ws)
    print(f"{role} connected  (lenses: {len(lenses)}, tracker pages: {len(sources)})")
    try:
        async for msg in ws:
            if role == "source" and lenses:
                websockets.broadcast(lenses, msg)
                for s in sources:
                    pass
    except websockets.ConnectionClosed:
        pass
    finally:
        group.discard(ws)

def serve_http():
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=HERE, **k)
        def log_message(self, *a): pass
        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path in ("/", ""): self.path = "/tracker.html"
            if self.path == "/status":
                name, _ = lesson_llm.provider()
                return self._json(200, {"lenses": len(lenses), "llm": name or "none"})
            return super().do_GET()

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.end_headers()

        def do_POST(self):
            # POST /lesson  {"skill": "tie a bowline"}  ->  a validated lesson.
            # The Lens calls this over the localhost connection it already has.
            # On failure it returns an error and GHOST falls back to a bundled
            # lesson, so a dead key or no network never blocks the learner.
            if self.path.rstrip("/") != "/lesson":
                return self._json(404, {"error": "not found"})
            try:
                n = int(self.headers.get("Content-Length") or 0)
                skill = (json.loads(self.rfile.read(n) or b"{}").get("skill") or "").strip()
            except Exception as e:
                return self._json(400, {"error": "bad request body: %s" % e})
            if not skill:
                return self._json(400, {"error": "missing 'skill'"})
            if len(skill) > 200:
                return self._json(400, {"error": "'skill' too long"})

            print("lesson requested: %r" % skill)
            try:
                lesson = lesson_llm.build_lesson(skill)
            except lesson_llm.LessonInvalid as e:
                print("  rejected after retry: %s" % (e.args[0],))
                return self._json(422, {"error": "lesson failed validation",
                                        "problems": e.args[0]})
            except Exception as e:
                print("  failed: %s" % e)
                return self._json(502, {"error": str(e)})
            print("  ok: %d steps, reviewed=%s"
                  % (len(lesson.get("steps", [])), lesson.get("reviewed")))
            return self._json(200, lesson)
    http.server.ThreadingHTTPServer((HOST, HTTP_PORT), H).serve_forever()

async def main():
    threading.Thread(target=serve_http, daemon=True).start()
    async with websockets.serve(handler, HOST, WS_PORT):
        url = f"http://{HOST}:{HTTP_PORT}"
        print(f"Relay on ws://{HOST}:{WS_PORT}. Open {url} in Chrome and allow the camera.")
        try: webbrowser.get("chrome").open(url)
        except Exception:
            try: os.system(f'open -a "Google Chrome" {url}')
            except Exception: pass
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
