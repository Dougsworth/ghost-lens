import tempfile, os, unittest
from course_store import CourseStore

class CloudSyncTest(unittest.TestCase):
    def test_roundtrip_and_isolation(self):
        with tempfile.TemporaryDirectory() as d:
            a=CourseStore(os.path.join(d,'a.sqlite3'))
            lesson={'skill':'Draw a Star','summary':'A simple lesson','reviewed':True,'steps':[{'title':'Draw','tip':'Go slowly','render':{'kind':'path','strokes':[[[-0.2,-0.2],[0.2,0.2]]]},'check':{'kind':'trace'}} for _ in range(3)],'quiz':[{'question':'Which?','options':['A','B','C'],'answer':0} for _ in range(3)]}
            saved=a.save('Draw a Star',lesson)
            a.save_progress('alice',saved['courseId'],1,[0],10)
            snap=a.export_library('alice')
            b=CourseStore(os.path.join(d,'b.sqlite3'))
            result=b.import_library('alice',snap)
            self.assertEqual(result['courses'],1)
            self.assertEqual(b.get_progress('alice',saved['courseId'])['step'],1)
            self.assertEqual(b.get_progress('bob',saved['courseId'])['step'],0)
            self.assertEqual(b.get('Draw a Star')['courseId'],saved['courseId'])
    def test_invalid_snapshot(self):
        with tempfile.TemporaryDirectory() as d:
            store=CourseStore(os.path.join(d,'a.sqlite3'))
            with self.assertRaises(ValueError): store.import_library('alice',{'format':2})
if __name__=='__main__':unittest.main()
