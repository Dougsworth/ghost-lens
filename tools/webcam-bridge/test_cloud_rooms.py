import unittest

import cloud_rooms
from cloud_rooms import CloudRoomSync
from room_relay import RoomRelay


class FakeSupabase(object):
    """In-memory stand-in for the ghost_room_events REST table."""

    def __init__(self):
        self.rows = []
        self.fail = False

    def insert(self, room, origin, person, name="", lesson="", event=None):
        self.rows.append({"id": len(self.rows) + 1, "room": room,
                          "origin": origin, "person": person, "name": name,
                          "lesson": lesson, "event": event or {"type": "presence"}})

    def __call__(self, method, path_and_query, body=None):
        if self.fail:
            raise RuntimeError("cloud down")
        if method == "POST":
            for r in body:
                self.insert(**r)
            return 201, None
        # GET: parse the two query shapes cloud_rooms uses.
        import urllib.parse
        q = urllib.parse.parse_qs(path_and_query.split("?", 1)[1])
        room = q["room"][0].split("eq.")[1]
        rows = [r for r in self.rows if r["room"] == room]
        if "id" in q and q["id"][0].startswith("gt."):
            since = int(q["id"][0][3:])
            rows = [r for r in rows if r["id"] > since]
            return 200, rows
        return 200, rows[-1:][::-1]  # order=id.desc&limit=1


def make(relay=None, cloud=None, origin="me"):
    relay = relay or RoomRelay()
    cloud = cloud or FakeSupabase()
    sync = CloudRoomSync(relay, transport=cloud, origin=origin)
    return relay, cloud, sync


class CloudRoomTests(unittest.TestCase):
    def test_local_event_uploads_once_with_origin(self):
        relay, cloud, sync = make()
        relay.update("AB12", "a", "Ana", "Japanese",
                     {"type": "stroke", "a": {"x": 0, "y": 0}, "b": {"x": 1, "y": 1}})
        sync.pump_once()
        strokes = [r for r in cloud.rows if r["event"]["type"] == "stroke"]
        self.assertEqual(len(strokes), 1)
        self.assertEqual(strokes[0]["origin"], "me")

    def test_remote_rows_injected_and_visible_without_echo(self):
        relay, cloud, sync = make()
        relay.update("AB12", "a", "Ana", "Japanese")   # local person joins
        sync.pump_once()                               # sets watermark at current max
        cloud.insert("AB12", "other-bridge", "b", "Ben", "Japanese",
                     {"type": "path", "points": [{"x": 0, "y": 0}, {"x": 2, "y": 2}]})
        sync.pump_once()
        state = relay.poll("AB12", "a", 0)
        self.assertIn("b", state["people"])
        self.assertEqual([e["data"]["type"] for e in state["events"]], ["path"])
        before = len(cloud.rows)
        sync.pump_once()                               # injected event must not re-upload
        after = [r for r in cloud.rows[before:] if r["event"]["type"] != "presence"]
        self.assertEqual(after, [])
        self.assertEqual(sync.stats["received"], 1)

    def test_own_rows_and_old_history_are_skipped(self):
        relay, cloud, sync = make()
        cloud.insert("AB12", "other-bridge", "z", "Old", "",
                     {"type": "cheer"})                # history before we join
        relay.update("AB12", "a", "Ana", "Japanese")
        sync.pump_once()                               # watermark starts past history
        state = relay.poll("AB12", "a", 0)
        self.assertNotIn("z", state["people"])
        self.assertEqual(state["events"], [])
        self.assertEqual(sync.stats["received"], 0)

    def test_presence_heartbeat_keeps_remote_person_listed(self):
        relay, cloud, sync = make()
        relay.update("AB12", "a", "Ana", "Japanese")
        sync.pump_once()
        cloud.insert("AB12", "other-bridge", "b", "Ben", "Guitar")  # presence row
        sync.pump_once()
        people = relay.poll("AB12", "a", 0)["people"]
        self.assertEqual(people["b"]["name"], "Ben")
        self.assertEqual(people["b"]["lesson"], "Guitar")

    def test_invalid_remote_event_is_dropped_not_fatal(self):
        relay, cloud, sync = make()
        relay.update("AB12", "a", "Ana", "Japanese")
        sync.pump_once()
        cloud.insert("AB12", "other-bridge", "b", "Ben", "",
                     {"type": "arbitrary-nonsense"})
        sync.pump_once()
        self.assertEqual(sync.stats["rejected"], 1)
        # The bad event is dropped; presence alone may remain, same as local.
        self.assertEqual(relay.poll("AB12", "a", 0)["events"], [])

    def test_room_cap_holds_across_desktops(self):
        relay, cloud, sync = make()
        for n in range(4):
            relay.update("AB12", "p%d" % n, "P", "L")
        sync.pump_once()
        cloud.insert("AB12", "other-bridge", "fifth", "F", "")
        sync.pump_once()
        self.assertEqual(sync.stats["rejected"], 1)
        self.assertEqual(len(relay.poll("AB12", "p0", 0)["people"]), 4)

    def test_cloud_outage_requeues_and_recovers(self):
        relay, cloud, sync = make()
        relay.update("AB12", "a", "Ana", "Japanese", {"type": "cheer"})
        cloud.fail = True
        with self.assertRaises(Exception):
            sync.pump_once()
        self.assertFalse(sync.ok)
        cloud.fail = False
        sync.pump_once()
        self.assertTrue(sync.ok)
        self.assertEqual(len([r for r in cloud.rows
                              if r["event"]["type"] == "cheer"]), 1)

    def test_service_role_key_refused(self):
        import os
        os.environ["SUPABASE_URL"] = "https://x.supabase.co"
        os.environ["SUPABASE_ANON_KEY"] = "abc.service_role.def"
        try:
            self.assertIsNone(cloud_rooms.start_if_configured(RoomRelay()))
        finally:
            del os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"]


if __name__ == "__main__":
    unittest.main()
