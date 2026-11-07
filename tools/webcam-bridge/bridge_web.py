"""GHOST webcam bridge, fast version.

Tracking runs in Chrome (GPU MediaPipe, smooth 30 fps camera). This script
serves that page and relays its hand data to the Lens.
  Page:  http://127.0.0.1:8766   (open in Chrome, allow camera)
  Lens:  ws://127.0.0.1:8765     (same message format as bridge.py)
"""
import asyncio, http.server, os, threading, webbrowser
import websockets

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
        def do_GET(self):
            if self.path in ("/", ""): self.path = "/tracker.html"
            if self.path == "/status":
                body = f'{{"lenses": {len(lenses)}}}'.encode()
                self.send_response(200); self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(body); return
            return super().do_GET()
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
