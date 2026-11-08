"""Local preview multiplayer relay. Not internet-facing; no authentication.
Each participant polls events by sequence, so two Lens preview panels can share
lesson, strokes, stamps and race results without competing for a mailbox.
"""
import threading
import time

class RoomRelay:
    def __init__(self):
        self.lock = threading.Lock()
        self.rooms = {}
        # Optional hook (set by cloud_rooms.CloudRoomSync): called as
        # on_local_event(room_id, person_id, name, lesson, event) after a
        # locally produced event is stored, never for injected remote ones.
        self.on_local_event = None

    def _clean(self, room):
        now = time.time()
        room["people"] = {k:v for k,v in room["people"].items() if now-v["seen"] < 30}
        room["events"] = [e for e in room["events"] if now-e["at"] < 120][-500:]

    def update(self, room_id, person_id, name, lesson, event=None, _remote=False):
        if not (1 <= len(room_id) <= 40 and 1 <= len(person_id) <= 40):
            raise ValueError("invalid room or participant")
        with self.lock:
            room = self.rooms.setdefault(room_id, {"people":{}, "events":[], "seq":0})
            self._clean(room)
            if person_id not in room["people"] and len(room["people"]) >= 4:
                raise ValueError("room full (maximum 4)")
            # "remote": this person lives on another desktop (injected by
            # cloud_rooms), so this bridge must not re-announce them.
            room["people"][person_id] = {"name":str(name)[:40], "lesson":str(lesson)[:120],
                                         "seen":time.time(), "remote":bool(_remote)}
            if event is not None:
                if not isinstance(event, dict) or event.get("type") not in ("stroke", "stamp", "step", "cheer", "race", "join", "lesson", "path", "ink_live", "ink_end", "lesson_full"):
                    raise ValueError("invalid event")
                if event.get("type") in ("path", "ink_live"):
                    points = event.get("points")
                    if not isinstance(points, list) or not 2 <= len(points) <= 100:
                        raise ValueError("invalid stroke path")
                    for pt in points:
                        if not isinstance(pt, dict) or not all(
                            isinstance(pt.get(k), (int, float)) and
                            -30 <= pt[k] <= 30 for k in ("x", "y")
                        ):
                            raise ValueError("invalid path point")
                if len(str(event)) > 24000:
                    raise ValueError("event too large")
                if event.get("type") == "lesson":
                    room["people"][person_id]["lesson"] = str(event.get("skill", ""))[:120]
                room["seq"] += 1
                room["events"].append({"seq":room["seq"], "at":time.time(), "from":person_id, "data":event})
                self._clean(room)
            snap = self._snapshot(room, 0, person_id)
        cb = self.on_local_event
        if cb is not None and event is not None and not _remote:
            cb(room_id, person_id, str(name)[:40], str(lesson)[:120], event)
        return snap

    def inject_remote(self, room_id, person_id, name, lesson, event=None):
        """Apply a row written by another desktop's bridge (via cloud_rooms).
        Presence rows only refresh the person; real events go through the same
        validation as local ones. Never re-fires on_local_event (no echo)."""
        if isinstance(event, dict) and event.get("type") == "presence":
            event = None
        return self.update(room_id, person_id, name, lesson, event, _remote=True)

    def active_rooms(self):
        with self.lock:
            return [rid for rid, room in self.rooms.items() if room["people"]]

    def leave(self, room_id, person_id):
        with self.lock:
            room = self.rooms.get(room_id)
            if room:
                room["people"].pop(person_id, None)
                self._clean(room)
            return {"ok": True}

    def list_rooms(self, person_id=""):
        with self.lock:
            result = []
            for room_id, room in self.rooms.items():
                self._clean(room)
                if not room["people"]:
                    continue
                people = room["people"]
                result.append({"room": room_id, "count": len(people),
                               "capacity": 4, "joined": person_id in people,
                               "lesson": next((p["lesson"] for p in people.values() if p["lesson"]), ""),
                               "people": [p["name"] for p in people.values()]})
            return sorted(result, key=lambda x: (not x["joined"], x["room"]))

    def _snapshot(self, room, since, person_id):
        return {"people":room["people"], "seq":room["seq"],
                "events":[e for e in room["events"] if e["seq"] > since and e["from"] != person_id]}

    def poll(self, room_id, person_id, since):
        with self.lock:
            room = self.rooms.get(room_id)
            if not room: return {"people":{}, "events":[], "seq":0}
            self._clean(room)
            return self._snapshot(room, max(0,int(since)), person_id)
