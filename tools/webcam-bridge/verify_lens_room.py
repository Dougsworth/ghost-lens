"""Does a real Lens actually join a real room, and are its events relayed?

test_rooms.py proves the relay against Python clients. This proves the OTHER
half: that GhostRoom.ts - the TypeScript in the Lens - speaks the same protocol
correctly against a live relay. Those are different risks, and only this one
exercises the handshake, the join and the event shape as the Lens actually
sends them.

How to run it:

  1. ./.venv/bin/python verify_lens_room.py
     It stands up a relay on PORT below, creates a room as a Python peer, and
     prints the code. Then it waits.

  2. In Lens Studio set, on the GHOST/Room object's GhostRoom component:
         url           ws://127.0.0.1:8899
         autoJoinCode  <the code printed in step 1>
     and reset the Preview panel.

  3. Watch this script. It reports what the Lens did.

Deliberately a separate port from the bridge so it cannot disturb a running
tracker page: this stands up its own relay rather than talking to yours.

Exit code is 0 only if the Lens joined and was seen. Anything else is a real
failure and should not be reported as a working feature.
"""
import asyncio
import json
import sys

import websockets
import bridge_web

PORT = 8899
WAIT_SECONDS = 90


async def main():
    seen_join = False
    seen_event = False
    peer_name = ""

    async with websockets.serve(bridge_web.handler, "127.0.0.1", PORT):
        ws = await websockets.connect("ws://127.0.0.1:%d" % PORT)
        await ws.send("room")
        await ws.send(json.dumps({"op": "create", "name": "Verifier"}))
        made = json.loads(await asyncio.wait_for(ws.recv(), 5))
        if made.get("op") != "created":
            print("FAIL  could not create a room: %s" % made)
            return 1
        code = made["room"]

        print("")
        print("  Room is open.  CODE: %s" % code)
        print("")
        print("  Now, in Lens Studio, on GHOST / Room (GhostRoom):")
        print("      url           ws://127.0.0.1:%d" % PORT)
        print("      autoJoinCode  %s" % code)
        print("  then reset the Preview panel.")
        print("")
        print("  Waiting up to %ds..." % WAIT_SECONDS)
        print("")

        loop = asyncio.get_event_loop()
        deadline = loop.time() + WAIT_SECONDS
        while loop.time() < deadline:
            remaining = deadline - loop.time()
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), remaining))
            except asyncio.TimeoutError:
                break

            op = msg.get("op")
            if op == "peer_joined":
                seen_join = True
                peer_name = msg.get("name", "?")
                print("PASS  the Lens joined the room  (id=%s name=%r)"
                      % (msg.get("id"), peer_name))
                # Answer, so the Lens's own receive path is exercised too. If
                # the Lens is on a lesson its sheet should show indigo ink.
                await ws.send(json.dumps({"op": "event", "data": {
                    "kind": "stroke", "index": 0,
                    "pts": [[-0.2, -0.2], [0.0, 0.1], [0.2, -0.2]],
                }}))
                print("      sent a stroke back - check the Lens sheet for indigo ink")
            elif op == "event":
                seen_event = True
                d = msg.get("data") or {}
                print("PASS  the Lens broadcast an event  (from=%s kind=%r pts=%d)"
                      % (msg.get("from"), d.get("kind"),
                         len(d.get("pts") or [])))
            elif op == "peer_left":
                print("      the Lens left the room")
                break

    print("")
    if seen_join:
        print("RESULT: the Lens speaks the relay protocol. Join confirmed%s."
              % (", and a stroke was relayed from it" if seen_event
                 else "; no stroke seen (draw one to confirm that half)"))
        return 0
    print("RESULT: FAILED - no Lens joined. Check url and autoJoinCode on the "
          "GhostRoom component, and that the Preview was reset.")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
