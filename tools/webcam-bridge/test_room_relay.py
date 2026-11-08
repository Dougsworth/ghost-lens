import unittest
from room_relay import RoomRelay

class RoomTests(unittest.TestCase):
    def test_presence_and_incremental_events(self):
        r=RoomRelay()
        r.update('demo','a','A','Japanese',{'type':'join'})
        r.update('demo','b','B','Guitar',{'type':'stroke','a':{'x':0,'y':0},'b':{'x':1,'y':1}})
        data=r.poll('demo','a',1)
        self.assertEqual(len(data['people']),2)
        self.assertEqual(len(data['events']),1)
        self.assertEqual(data['events'][0]['data']['type'],'stroke')
        self.assertEqual(r.poll('demo','a',data['seq'])['events'],[])
    def test_capacity(self):
        r=RoomRelay()
        for n in range(4):r.update('demo',str(n),'Name','Lesson')
        with self.assertRaisesRegex(ValueError,'full'):r.update('demo','fifth','Name','Lesson')
    def test_reject_invalid_events(self):
        r=RoomRelay()
        with self.assertRaises(ValueError):r.update('demo','a','A','L',{'type':'arbitrary'})

if __name__=='__main__': unittest.main()

class MoreRoomTests(unittest.TestCase):
    def test_lesson_event_updates_presence(self):
        r = RoomRelay()
        r.update('class', 'a', 'Alice', 'Japanese')
        r.update('class', 'a', 'Alice', 'Japanese', {'type': 'lesson', 'skill': 'Drawing stars'})
        state = r.poll('class', 'b', 0)
        self.assertEqual(state['people']['a']['lesson'], 'Drawing stars')
        self.assertEqual(state['events'][0]['data']['type'], 'lesson')

    def test_remote_events_are_not_duplicated(self):
        r = RoomRelay()
        r.update('class', 'a', 'Alice', 'A', {'type': 'cheer'})
        first = r.poll('class', 'b', 0)
        self.assertEqual(len(first['events']), 1)
        self.assertEqual(r.poll('class', 'b', first['seq'])['events'], [])
        self.assertEqual(r.poll('class', 'a', 0)['events'], [])

class PathTests(unittest.TestCase):
    def test_peer_path_delivery(self):
        r = RoomRelay()
        r.update('study','a','A','Stars', {'type':'path','points':[{'x':0,'y':0},{'x':1,'y':2}]})
        data = r.poll('study','b',0)
        self.assertEqual(data['events'][0]['data']['type'],'path')
        self.assertEqual(len(data['events'][0]['data']['points']),2)
    def test_reject_bad_paths(self):
        r=RoomRelay()
        with self.assertRaises(ValueError):
            r.update('study','a','A','Stars',{'type':'path','points':[{'x':0,'y':0}]})
        with self.assertRaises(ValueError):
            r.update('study','a','A','Stars',{'type':'path','points':[{'x':999,'y':0},{'x':1,'y':1}]})

class LiveRoomTests(unittest.TestCase):
    def test_live_ink_order_and_finish(self):
        relay = RoomRelay()
        pts = [{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 1.0}]
        relay.update("duo", "a", "Alice", "Star", {"type": "ink_live", "strokeId": 0, "points": pts})
        relay.update("duo", "a", "Alice", "Star", {"type": "ink_end", "strokeId": 0})
        events = relay.poll("duo", "b", 0)["events"]
        self.assertEqual([e["data"]["type"] for e in events], ["ink_live", "ink_end"])

    def test_full_lesson_and_race(self):
        relay = RoomRelay()
        lesson = {"skill": "Star", "summary": "Draw a star", "steps": [], "quiz": []}
        relay.update("duo", "a", "Alice", "Star", {"type": "lesson_full", "lesson": lesson})
        relay.update("duo", "a", "Alice", "Star", {"type": "race", "score": 2})
        events = relay.poll("duo", "b", 0)["events"]
        self.assertEqual(events[0]["data"]["lesson"], lesson)
        self.assertEqual(events[1]["data"]["score"], 2)
