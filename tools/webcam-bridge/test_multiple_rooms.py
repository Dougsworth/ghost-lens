import unittest
from room_relay import RoomRelay

class MultipleRoomsTests(unittest.TestCase):
    def test_isolation_and_listing(self):
        relay=RoomRelay()
        relay.update('ABC234','a','Alice','Guitar',{'type':'cheer'})
        relay.update('XYZ789','b','Bob','Math',{'type':'race','score':1})
        self.assertEqual(len(relay.list_rooms()),2)
        self.assertEqual(relay.poll('ABC234','a',0)['events'],[])
        self.assertEqual(relay.poll('XYZ789','b',0)['events'],[])
        self.assertTrue(relay.list_rooms('a')[0]['joined'])
        relay.leave('ABC234','a')
        self.assertEqual(len(relay.list_rooms()),1)

    def test_independent_capacity(self):
        relay=RoomRelay()
        for i in range(4):relay.update('ABC234',str(i),'Learner','')
        relay.update('XYZ789','fifth','Learner','')
        with self.assertRaises(ValueError):relay.update('ABC234','fifth','Learner','')

if __name__=='__main__': unittest.main()
