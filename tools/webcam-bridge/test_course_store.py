import os
import tempfile
import unittest
from course_store import CourseStore

class TestCourses(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=CourseStore(os.path.join(self.tmp.name,'courses.sqlite3'))
        self.lesson={'skill':'Draw a Star','summary':'A simple lesson', 'reviewed':True,
            'steps':[{'title':'Draw','tip':'Go slowly','render':{'kind':'path','strokes':[[[-0.2,-0.2],[0.2,0.2]]]},'check':{'kind':'trace'}} for _ in range(3)],
            'quiz':[{'question':'Which?','options':['A','B','C'],'answer':0} for _ in range(3)]}
    def tearDown(self): self.tmp.cleanup()
    def test_reuse_and_restart(self):
        a=self.store.save(' Draw  a  STAR ',self.lesson)
        b=self.store.save('draw a star',self.lesson)
        self.assertEqual(a['courseId'],b['courseId'])
        self.assertEqual(CourseStore(self.store.path).get('DRAW A STAR')['courseId'],a['courseId'])
    def test_progress_is_independent_and_persistent(self):
        course=self.store.save('star',self.lesson)
        cid=course['courseId']
        self.store.save_progress('alice',cid,2,[0,1],7)
        self.assertEqual(CourseStore(self.store.path).get_progress('alice',cid)['score'],7)
        self.assertEqual(self.store.get_progress('bob',cid)['score'],0)
    def test_reject_invalid_progress(self):
        cid=self.store.save('star',self.lesson)['courseId']
        with self.assertRaises(ValueError): self.store.save_progress('alice',cid,999,[],0)
    def test_unreviewed_not_cached(self):
        with self.assertRaises(ValueError): self.store.save('star',dict(self.lesson,reviewed=False))

if __name__=='__main__': unittest.main()
