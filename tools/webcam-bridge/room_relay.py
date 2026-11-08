"""GHOST room relay: the smallest server that makes Study Together real.

Two or more GHOST clients (Lens previews, or Lenses on devices pointed at an
ngrok URL) join a room by a short spoken code and exchange small JSON lesson
events. The relay never interprets the events; it only guarantees that what
one member sends, every other member of the SAME room receives, with the
sender identified. Hand frames and camera data never pass through here.

Protocol, over the bridge's existing websocket port:
  first frame:  the literal text  room
  then JSON ops from the client:
    {"op":"create","name":"Maya"}                 -> {"op":"created","room":"TIGER","you":1}
    {"op":"join","room":"TIGER","name":"Leo"}     -> {"op":"joined","room":"TIGER","you":2,
                                                      "peers":[{"id":1,"name":"Maya"}]}
    {"op":"event", ...anything small...}          -> others get {"op":"event","from":2,
                                                      "name":"Leo","data":{...}}
    {"op":"leave"}                                -> acknowledged with {"op":"left"}
  pushed by the relay:
    {"op":"peer_joined","id":2,"name":"Leo"}
    {"op":"peer_left","id":2,"name":"Leo"}
    {"op":"error","error":"..."}  (bad op, unknown room, room full)

Rules the tests pin down:
  - Rooms are isolated: an event never crosses room codes.
  - A room holds at most MAX_MEMBERS people; the fifth join is refused.
  - An empty room lingers for EMPTY_ROOM_TTL seconds so a crashed client can
    reconnect to the same code, then it is forgotten.
  - Codes are short real words (easy to say out loud in a demo), never reused
    while live.
"""
import asyncio, json, random, time

MAX_MEMBERS = 4
EMPTY_ROOM_TTL = 600.0  # seconds a room survives with nobody in it

# Short, unambiguous, speakable. No two sound alike.
WORDS = ["TIGER", "MANGO", "RIVER", "CEDAR", "NORTH", "PEARL", "SUNNY",
         "FLAME", "OTTER", "MAPLE", "CORAL", "RIDGE", "PLUMB", "QUILL",
         "ZEBRA", "DELTA", "EMBER", "GROVE", "HAZEL", "LEMON"]


class Room(object):
    def __init__(self, code):
        self.code = code
        self.members = {}          # id -> (ws, name)
        self.next_id = 1
        self.emptied_at = None     # when the last member left

    def peers_of(self, member_id):
        return [{"id": i, "name": n} for i, (_, n) in self.members.items()
                if i != member_id]


class Relay(object):
    def __init__(self):
        self.rooms = {}            # code -> Room

    # -- housekeeping ------------------------------------------------------
    def _sweep(self):
        now = time.time()
        for code in [c for c, r in self.rooms.items()
                     if not r.members and r.emptied_at
                     and now - r.emptied_at > EMPTY_ROOM_TTL]:
            del self.rooms[code]

    def _new_code(self):
        self._sweep()
        free = [w for w in WORDS if w not in self.rooms]
        if free:
            return random.choice(free)
        # Every word is live (unlikely); fall back to word+digit.
        while True:
            code = "%s%d" % (random.choice(WORDS), random.randrange(10))
            if code not in self.rooms:
                return code

    # -- the per-connection loop -------------------------------------------
    async def serve(self, ws):
        """Handle one 'room' client from after its handshake to disconnect."""
        room, me, name = None, None, ""
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                    op = msg.get("op")
                except Exception:
                    await ws.send(json.dumps({"op": "error", "error": "not json"}))
                    continue

                if op == "create" and room is None:
                    name = str(msg.get("name") or "Learner")[:24]
                    code = self._new_code()
                    room = self.rooms[code] = Room(code)
                    me = room.next_id; room.next_id += 1
                    room.members[me] = (ws, name)
                    await ws.send(json.dumps(
                        {"op": "created", "room": code, "you": me}))
                    print("room %s created by %s" % (code, name))

                elif op == "join" and room is None:
                    name = str(msg.get("name") or "Learner")[:24]
                    code = str(msg.get("room") or "").strip().upper()
                    self._sweep()
                    r = self.rooms.get(code)
                    if r is None:
                        await ws.send(json.dumps(
                            {"op": "error", "error": "no such room"}))
                        continue
                    if len(r.members) >= MAX_MEMBERS:
                        await ws.send(json.dumps(
                            {"op": "error", "error": "room full"}))
                        continue
                    room, me = r, r.next_id; r.next_id += 1
                    r.emptied_at = None
                    peers = r.peers_of(me)
                    r.members[me] = (ws, name)
                    await ws.send(json.dumps(
                        {"op": "joined", "room": code, "you": me, "peers": peers}))
                    await self._tell_others(room, me, {
                        "op": "peer_joined", "id": me, "name": name})
                    print("room %s: %s joined (%d inside)"
                          % (code, name, len(r.members)))

                elif op == "event" and room is not None:
                    await self._tell_others(room, me, {
                        "op": "event", "from": me, "name": name,
                        "data": msg.get("data", msg)})

                elif op == "leave" and room is not None:
                    await ws.send(json.dumps({"op": "left"}))
                    break

                else:
                    await ws.send(json.dumps(
                        {"op": "error",
                         "error": "bad op %r here" % (op,)}))
        finally:
            if room is not None and me in room.members:
                del room.members[me]
                if not room.members:
                    room.emptied_at = time.time()
                else:
                    await self._tell_others(room, me, {
                        "op": "peer_left", "id": me, "name": name})
                print("room %s: %s left (%d inside)"
                      % (room.code, name, len(room.members)))

    async def _tell_others(self, room, sender_id, obj):
        raw = json.dumps(obj)
        for i, (w, _) in list(room.members.items()):
            if i == sender_id:
                continue
            try:
                await w.send(raw)
            except Exception:
                pass  # their own close handler will clean them up

    def status(self):
        self._sweep()
        return [{"room": r.code, "members": [n for _, n in r.members.values()]}
                for r in self.rooms.values() if r.members]
