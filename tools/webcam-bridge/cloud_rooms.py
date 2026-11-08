"""Multi-desktop Study Together: mirror the local RoomRelay through Supabase.

Each desktop runs its own bridge. When SUPABASE_URL and SUPABASE_ANON_KEY are
set, every local room event is also inserted into the ghost_room_events table,
and a poller injects rows written by *other* bridges into the local relay. The
Lens never changes: it keeps polling its own local bridge, and remote learners
simply appear in the room.

Security model (demo-grade, documented in MULTIDESKTOP_V12.md):
- Uses the anon key ONLY, over REST, with row-level security enabled.
- Anyone holding the anon key can read/write room events, so rooms are shared
  spaces; use random codes and clean old rows. NEVER use a service-role key.
- All incoming rows pass through RoomRelay.update()'s existing validation
  (event whitelist, path bounds, size caps, 4-person room cap).

No third-party dependencies: stdlib urllib only, same as lesson_llm.
"""
import collections
import json
import os
import threading
import time
import urllib.error
import urllib.request
import uuid

TABLE = "ghost_room_events"
UPLOAD_BATCH = 20
POLL_LIMIT = 200
HEARTBEAT_EVERY = 10.0   # seconds between presence uploads per local person
DISCOVER_EVERY = 3.0     # seconds between "which rooms are open elsewhere?" looks
DISCOVER_WINDOW = 35.0   # a room counts as open if someone was seen this recently
INTERVAL = 0.5           # seconds between cloud polls (matches ~live ink feel)
BACKOFF_MAX = 15.0


def _default_transport(url, key):
    """Returns transport(method, path_and_query, body) -> (status, parsed-json)."""
    base = url.rstrip("/") + "/rest/v1/"

    def transport(method, path_and_query, body=None):
        req = urllib.request.Request(
            base + path_and_query,
            data=None if body is None else json.dumps(body).encode(),
            method=method,
            headers={
                "apikey": key,
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raise RuntimeError("supabase %s %s -> %d: %s"
                               % (method, path_and_query.split("?")[0], e.code,
                                  e.read()[:200])) from e
    return transport


class CloudRoomSync(object):
    def __init__(self, relay, url=None, key=None, transport=None, origin=None):
        self.relay = relay
        self.origin = origin or ("bridge-" + uuid.uuid4().hex[:12])
        self.transport = transport or _default_transport(url, key)
        self.queue = collections.deque()
        self.lock = threading.Lock()
        self.watermarks = {}          # room -> last cloud row id injected
        self.last_heartbeat = 0.0
        self.last_discover = 0.0
        self.stats = {"sent": 0, "received": 0, "rejected": 0, "errors": 0}
        self.last_error = ""
        self.ok = True
        self._stop = threading.Event()
        # Hook: RoomRelay calls this after each locally produced event.
        relay.on_local_event = self.queue_local

    # ---- local -> cloud ----------------------------------------------------
    def queue_local(self, room, person, name, lesson, event):
        with self.lock:
            self.queue.append({"room": room, "origin": self.origin,
                               "person": person, "name": name or "",
                               "lesson": lesson or "", "event": event})

    def _drain_uploads(self):
        rows = []
        with self.lock:
            while self.queue and len(rows) < UPLOAD_BATCH:
                rows.append(self.queue.popleft())
        if not rows:
            return
        try:
            self.transport("POST", TABLE, rows)
            self.stats["sent"] += len(rows)
        except Exception:
            with self.lock:                      # put back, retry next pump
                self.queue.extendleft(reversed(rows))
            raise

    def heartbeat_once(self, now=None):
        """Upload a presence row per local person so other desktops list them."""
        now = time.time() if now is None else now
        if now - self.last_heartbeat < HEARTBEAT_EVERY:
            return
        self.last_heartbeat = now
        for room in self.relay.active_rooms():
            snap = self.relay.poll(room, "", 10 ** 12)
            for pid, p in snap["people"].items():
                if p.get("remote"):
                    continue    # another desktop's learner: theirs to announce
                self.queue_local(room, pid, p.get("name", ""),
                                 p.get("lesson", ""), {"type": "presence"})

    def discover_once(self, now=None):
        """List rooms opened on OTHER desktops, so the Study Together screen
        can offer them. Recent presence/join rows from other bridges are
        injected as presence; the room then becomes active locally and the
        normal per-room poll takes over (starting at the newest row, so no
        history is replayed)."""
        now = time.time() if now is None else now
        if now - self.last_discover < DISCOVER_EVERY:
            return
        self.last_discover = now
        cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ",
                               time.gmtime(now - DISCOVER_WINDOW))
        status, rows = self.transport(
            "GET",
            "%s?created_at=gt.%s&event->>type=in.(presence,join)"
            "&order=id.desc&limit=%d&select=room,origin,person,name,lesson"
            % (TABLE, cutoff, POLL_LIMIT))
        local = set(self.relay.active_rooms())
        seen = set()
        for row in rows or []:
            room, person = str(row.get("room", "")), str(row.get("person", ""))
            if row.get("origin") == self.origin or room in local:
                continue
            if (room, person) in seen:
                continue
            seen.add((room, person))
            try:
                self.relay.inject_remote(room, person, str(row.get("name", "")),
                                         str(row.get("lesson", "")),
                                         {"type": "presence"})
            except ValueError:
                pass            # bad code or full room: just not offered

    # ---- cloud -> local ----------------------------------------------------
    def _watermark(self, room):
        if room in self.watermarks:
            return self.watermarks[room]
        # First look at a room: start at the newest row so history isn't replayed.
        status, rows = self.transport(
            "GET", "%s?room=eq.%s&select=id&order=id.desc&limit=1" % (TABLE, room))
        self.watermarks[room] = rows[0]["id"] if rows else 0
        return self.watermarks[room]

    def _poll_room(self, room):
        since = self._watermark(room)
        status, rows = self.transport(
            "GET",
            "%s?room=eq.%s&id=gt.%d&order=id.asc&limit=%d&select=*"
            % (TABLE, room, since, POLL_LIMIT))
        for row in rows or []:
            self.watermarks[room] = max(self.watermarks[room], int(row["id"]))
            if row.get("origin") == self.origin:
                continue                         # our own upload echoed back
            try:
                self.relay.inject_remote(
                    room, str(row.get("person", "")), str(row.get("name", "")),
                    str(row.get("lesson", "")), row.get("event"))
                self.stats["received"] += 1
            except ValueError:
                self.stats["rejected"] += 1      # invalid or room full: drop

    def pump_once(self):
        """One sync cycle: heartbeat, upload queue, poll every active room."""
        try:
            self.heartbeat_once()
            self._drain_uploads()
            self.discover_once()
            for room in self.relay.active_rooms():
                self._poll_room(room)
            self.ok, self.last_error = True, ""
        except Exception as e:
            self.ok = False
            self.last_error = str(e)[:300]
            self.stats["errors"] += 1
            raise

    # ---- background loop ----------------------------------------------------
    def start(self):
        def loop():
            backoff = INTERVAL
            while not self._stop.is_set():
                try:
                    self.pump_once()
                    backoff = INTERVAL
                except Exception:
                    backoff = min(backoff * 2, BACKOFF_MAX)
                self._stop.wait(backoff)
        threading.Thread(target=loop, daemon=True).start()
        return self

    def stop(self):
        self._stop.set()

    def status(self):
        with self.lock:
            pending = len(self.queue)
        return {"enabled": True, "ok": self.ok, "origin": self.origin,
                "pending": pending, "lastError": self.last_error,
                **self.stats}


def _is_admin_key(key):
    """True for keys that bypass row-level security and must never leave the
    dashboard. Supabase keys are encoded, so a plain substring test never
    matches a real one: new-style secret keys start with sb_secret_, and
    legacy JWT keys carry their role base64-encoded in the payload."""
    if "service_role" in key or key.startswith("sb_secret_"):
        return True
    parts = key.split(".")
    if len(parts) == 3 and parts[0].startswith("eyJ"):
        import base64
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        try:
            role = json.loads(base64.urlsafe_b64decode(payload)).get("role", "")
        except Exception:
            return False
        return role == "service_role"
    return False


def start_if_configured(relay):
    """Called by bridge_web at startup. Returns a running sync or None."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    if not url or not key:
        return None
    if _is_admin_key(key):
        print("[GHOST cloud] REFUSING to start: that looks like a service-role "
              "key. Use the anon public key only.")
        return None
    sync = CloudRoomSync(relay, url=url, key=key).start()
    print("[GHOST cloud] Study Together cloud sync on (%s). Rooms are shared "
          "across desktops using this Supabase project." % sync.origin)
    return sync
