"""GHOST webcam bridge, fast version.

Tracking runs in Chrome (GPU MediaPipe, smooth 30 fps camera). This script
serves that page and relays its hand data to the Lens.
  Page:  http://127.0.0.1:8766   (open in Chrome, allow camera)
  Lens:  ws://127.0.0.1:8765     (same message format as bridge.py)

It also serves the preview-time AI routes:
  GET  /status   {"lenses", "llm", "model"}  -- provider name only, never a key
  POST /lesson   {"skill"}                   -- a validated lesson
  POST /coach    {"skill","step","reason"}   -- one short line after an attempt

The LLM provider is chosen by lesson_llm from the environment: GEMINI_API_KEY,
then ANTHROPIC_API_KEY, then OPENAI_API_KEY, then GHOST's bundled lessons.
Copy credentials.env.example to credentials.env (gitignored) and source it.
"""
import asyncio, http.server, json, os, threading, time, webbrowser
import websockets

import lesson_llm

HOST, WS_PORT, HTTP_PORT = "127.0.0.1", 8765, 8766
HERE = os.path.dirname(os.path.abspath(__file__))
lenses, sources = set(), set()


class Spend(object):
    """What this bridge session has cost so far, across every lesson and tip.

    Counts are exact; the dollar figure is only as good as the rates in
    lesson_llm, which are documented there as needing checking.
    """

    def __init__(self):
        self.lessons = 0
        self.prompt = 0
        self.output = 0

    def add(self, usage):
        self.lessons += 1
        self.prompt += usage.prompt
        self.output += usage.output

    @property
    def usd(self):
        return lesson_llm.estimate_cost(self.prompt, self.output)

    def as_dict(self):
        return {"requests": self.lessons,
                "prompt_tokens": self.prompt,
                "output_tokens": self.output,
                "estimated_usd": round(self.usd, 6),
                "estimated_usd_per_request":
                    round(self.usd / self.lessons, 6) if self.lessons else 0.0}

    def __str__(self):
        per = (self.usd / self.lessons) if self.lessons else 0.0
        return ("%d request(s), %d tokens, about $%.5f total, $%.5f each"
                % (self.lessons, self.prompt + self.output, self.usd, per))


_spend = Spend()


class Speech(object):
    """A one-slot mailbox between the Lens and the tracker page.

    The Lens cannot reach the browser and the browser cannot reach the Lens, so
    the bridge holds two flags between them: "someone asked to listen" and
    "here is what was heard". Both are one-shot — read clears them — so a
    transcript can never be delivered twice and a stale request cannot start
    the microphone an hour later.

    Deliberately polled rather than pushed over the websocket: that socket
    carries hand frames at 30 fps into a parser that expects nothing else, and
    speech is not worth risking it.
    """

    def __init__(self):
        self.listen_requested = False
        self.heard = ""
        self.listening = False

    def request_listen(self):
        self.listen_requested = True
        self.heard = ""

    def take_request(self):
        was = self.listen_requested
        self.listen_requested = False
        return was

    def say_heard(self, text):
        self.heard = (text or "").strip()
        self.listening = False

    def take_heard(self):
        t = self.heard
        self.heard = ""
        return t


_speech = Speech()

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
            # The tracker page polls this twice a second; true means the Lens
            # asked for the microphone. Reading it clears it.
            if self.path == "/listen":
                return self._json(200, {"listen": _speech.take_request()})

            # The Lens polls this while it is waiting for a transcript.
            if self.path == "/heard":
                return self._json(200, {"text": _speech.take_heard(),
                                        "listening": _speech.listening})

            if self.path == "/status":
                # "llm" is the provider NAME only -- never the key, and never
                # anything derived from it.
                name, _ = lesson_llm.provider()
                return self._json(200, {
                    "lenses": len(lenses),
                    "llm": name or "none",
                    "model": lesson_llm.model_name() if name else None,
                    "spend": _spend.as_dict(),
                })
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
            route = self.path.rstrip("/")

            # POST /listen  -- the Lens's mic button. Arms the page.
            if route == "/listen":
                _speech.request_listen()
                _speech.listening = True
                print("listen requested by the Lens")
                return self._json(200, {"ok": True})

            # POST /heard {"text"} -- the page hands over what it recognised.
            if route == "/heard":
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    body = json.loads(self.rfile.read(n) or b"{}")
                except Exception as e:
                    return self._json(400, {"error": "bad request body: %s" % e})
                text = (body.get("text") or "").strip()[:200]
                _speech.say_heard(text)
                print("heard: %r" % text)
                return self._json(200, {"ok": True, "text": text})

            # POST /coach  {"skill","step","reason","detail"}  ->  {"tip": "..."}
            # One short line after an attempt, from the same provider the
            # planner uses. coach_tip never raises: with no key, or a dead one,
            # it returns a reason-specific bundled line, so the lesson carries
            # on either way and this route always answers 200.
            if route == "/coach":
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    req = json.loads(self.rfile.read(n) or b"{}")
                except Exception as e:
                    return self._json(400, {"error": "bad request body: %s" % e})
                tip = lesson_llm.coach_tip(
                    (req.get("skill") or "")[:200],
                    (req.get("step") or "")[:200],
                    (req.get("reason") or "")[:60],
                    (req.get("detail") or "")[:200] or None,
                )
                print("coach tip (%s): %s" % (req.get("reason") or "?", tip))
                return self._json(200, {"tip": tip})

            # POST /lesson/plan    {"skill"}            -> stage 1, fast
            # POST /lesson/review  {"skill","lesson"}   -> stage 2, quiet fix
            #
            # Split so the Lens can show the step titles as soon as stage 1
            # lands and run stage 2 behind them. /lesson still does both in one
            # call for anything that just wants the finished article.
            if route in ("/lesson/plan", "/lesson/review"):
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    req = json.loads(self.rfile.read(n) or b"{}")
                except Exception as e:
                    return self._json(400, {"error": "bad request body: %s" % e})
                skill = (req.get("skill") or "").strip()
                if not skill:
                    return self._json(400, {"error": "missing 'skill'"})
                if len(skill) > 200:
                    return self._json(400, {"error": "'skill' too long"})

                usage = lesson_llm.Usage()
                t0 = time.time()
                try:
                    if route == "/lesson/plan":
                        print("plan requested: %r" % skill)
                        lesson = lesson_llm.plan_lesson(skill, usage=usage)
                    else:
                        planned = req.get("lesson")
                        if not isinstance(planned, dict):
                            return self._json(400, {"error": "missing 'lesson'"})
                        print("review requested: %r" % skill)
                        # review_lesson never raises; a failed review returns
                        # the planned lesson with reviewed=false.
                        lesson = lesson_llm.review_lesson(skill, planned, usage=usage)
                except lesson_llm.LessonInvalid as e:
                    print("  rejected after retry: %s" % (e.args[0],))
                    return self._json(422, {"error": "lesson failed validation",
                                            "problems": e.args[0]})
                except Exception as e:
                    print("  failed: %s" % e)
                    return self._json(502, {"error": str(e)})

                dt = time.time() - t0
                print("  %s ok in %.1fs: %s" % (route, dt, usage))
                _spend.add(usage)
                print("  session so far: %s" % _spend)
                lesson["usage"] = usage.as_dict()
                lesson["seconds"] = round(dt, 2)
                return self._json(200, lesson)

            if route != "/lesson":
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
            usage = lesson_llm.Usage()
            t0 = time.time()
            try:
                lesson = lesson_llm.build_lesson(skill, usage=usage)
            except lesson_llm.LessonInvalid as e:
                print("  rejected after retry: %s" % (e.args[0],))
                return self._json(422, {"error": "lesson failed validation",
                                        "problems": e.args[0]})
            except Exception as e:
                print("  failed: %s" % e)
                return self._json(502, {"error": str(e)})
            dt = time.time() - t0
            print("  ok in %.1fs: %d steps, reviewed=%s | %s"
                  % (dt, len(lesson.get("steps", [])), lesson.get("reviewed"), usage))
            _spend.add(usage)
            print("  session so far: %s" % _spend)
            lesson["usage"] = usage.as_dict()
            lesson["seconds"] = round(dt, 2)
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
