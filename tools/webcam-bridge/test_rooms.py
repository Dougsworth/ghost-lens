"""Exercises the room relay with real websocket clients. Run:
   ./.venv/bin/python test_rooms.py
Every line should say PASS."""
import asyncio, json, sys
import websockets
import bridge_web

PORT = 8899
fails = []

def check(name, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + name + ("  " + extra if extra else ""))
    if not cond:
        fails.append(name)

async def client():
    ws = await websockets.connect("ws://127.0.0.1:%d" % PORT)
    await ws.send("room")
    return ws

async def say(ws, **obj):
    await ws.send(json.dumps(obj))

async def hear(ws, timeout=2.0):
    return json.loads(await asyncio.wait_for(ws.recv(), timeout))

async def main():
    async with websockets.serve(bridge_web.handler, "127.0.0.1", PORT):
        # create + join + presence
        a = await client(); await say(a, op="create", name="Maya")
        made = await hear(a)
        check("create returns a room code", made.get("op") == "created" and len(made.get("room","")) >= 4, str(made))
        code = made["room"]

        b = await client(); await say(b, op="join", room=code.lower(), name="Leo")
        joined = await hear(b)
        check("join works, case-insensitive, lists peers",
              joined.get("op") == "joined" and joined.get("peers") == [{"id": 1, "name": "Maya"}], str(joined))
        check("creator hears peer_joined", (await hear(a)).get("op") == "peer_joined")

        # events flow one way, with identity, and only inside the room
        o = await client(); await say(o, op="create", name="Zoe")
        other_code = (await hear(o))["room"]
        check("second room gets a different code", other_code != code)

        await say(b, op="event", data={"stroke": 1, "pts": [[0,0],[1,1]]})
        got = await hear(a)
        check("peer receives event with sender identity",
              got.get("op") == "event" and got.get("from") == 2 and got.get("name") == "Leo"
              and got.get("data", {}).get("stroke") == 1, str(got))
        try:
            await hear(o, timeout=0.4); check("rooms are isolated", False, "Zoe heard a foreign event")
        except asyncio.TimeoutError:
            check("rooms are isolated", True)
        try:
            await hear(b, timeout=0.3); check("sender does not echo", False)
        except asyncio.TimeoutError:
            check("sender does not echo", True)

        # capacity: 4 in, the 5th refused
        extras = []
        for name in ("P3", "P4"):
            w = await client(); await say(w, op="join", room=code, name=name)
            check("join %s" % name, (await hear(w)).get("op") == "joined")
            extras.append(w)
            await hear(a); await hear(b)       # drain their peer_joined
            for e in extras[:-1]: await hear(e)
        fifth = await client(); await say(fifth, op="join", room=code, name="P5")
        check("fifth join refused", (await hear(fifth)).get("error") == "room full")

        # unknown room
        u = await client(); await say(u, op="join", room="NOPE", name="X")
        check("unknown room refused", (await hear(u)).get("error") == "no such room")

        # leave + reconnection to a temporarily empty room
        await say(b, op="leave")
        check("leave acknowledged", (await hear(b)).get("op") == "left")
        check("others hear peer_left", (await hear(a)).get("op") == "peer_left")
        for e in extras: await hear(e)
        for w in (a, *extras):  await w.close()
        await asyncio.sleep(0.2)
        r = await client(); await say(r, op="join", room=code, name="Maya")
        check("empty room survives for reconnection", (await hear(r)).get("op") == "joined")

        print("\n%d failure(s)" % len(fails))
        sys.exit(1 if fails else 0)

asyncio.run(main())
