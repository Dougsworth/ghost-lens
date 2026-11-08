import unittest
from learning_engine import compile_lesson, next_activity, hint_for

class TestLearningEngine(unittest.TestCase):
    def test_activity_mapping_and_resume(self):
        lesson={'courseId':'course123','courseVersion':2,'skill':'Drawing', 'steps':[
            {'title':'Trace', 'tip':'Follow', 'render':{'kind':'path','strokes':[[[0,0],[.2,.2]]]}},
            {'title':'Explore', 'tip':'Inspect', 'render':{'kind':'objects','objects':[{'id':'x','shape':'box'}]}},
            {'title':'Finish', 'tip':'Review', 'render':{'kind':'tip'}}]}
        result=compile_lesson(lesson)
        self.assertEqual([x['type'] for x in result['activities']], ['TRACE','EXPLORE_3D','SEQUENCE'])
        self.assertEqual(result['version'],2)
        self.assertEqual(next_activity(result,{'step':1})['title'],'Explore')
        self.assertEqual(next_activity(result,{'step':99})['title'],'Finish')
    def test_quiz_is_playable_activity(self):
        lesson={'skill':'Science','steps':[{'title':'Intro','tip':'Learn','render':{'kind':'tip'}}],
                'quiz':[{'question':'Which is a gas?','options':['Rock','Oxygen','Iron'],'answer':1}]}
        result=compile_lesson(lesson)
        self.assertEqual(result['activities'][-1]['type'],'QUIZ')
        self.assertEqual(result['activities'][-1]['render']['answer'],1)
    def test_invalid_quiz_is_ignored(self):
        lesson={'skill':'Science','steps':[{'title':'Intro','render':{'kind':'tip'}}],
                'quiz':[{'question':'Broken','options':['a'],'answer':99}]}
        self.assertEqual(len(compile_lesson(lesson)['activities']),1)
    def test_invalid_lesson(self):
        with self.assertRaises(ValueError):compile_lesson({'steps':[]})
    def test_hint(self):
        self.assertIn('smaller',hint_for({'title':'Trace'},3))
if __name__=='__main__':unittest.main()
