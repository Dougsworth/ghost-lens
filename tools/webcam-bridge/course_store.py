"""Persistent, versioned course library and independent learner progress (stdlib SQLite)."""
import contextlib
import hashlib
import json
import os
import re
import sqlite3
import threading
import time

class CourseStore:
    def __init__(self, path=None):
        self.path = path or os.environ.get('GHOST_COURSE_DB') or os.path.join(os.path.dirname(__file__), 'courses.sqlite3')
        self.lock = threading.RLock()
        with self._db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS courses (
              id TEXT PRIMARY KEY, skill_key TEXT NOT NULL, version INTEGER NOT NULL,
              lesson_json TEXT NOT NULL, created_at REAL NOT NULL,
              UNIQUE(skill_key, version));
            CREATE INDEX IF NOT EXISTS courses_by_skill ON courses(skill_key, version DESC);
            CREATE TABLE IF NOT EXISTS progress (
              learner TEXT NOT NULL, course_id TEXT NOT NULL, step INTEGER NOT NULL DEFAULT 0,
              completed_json TEXT NOT NULL DEFAULT '[]', score INTEGER NOT NULL DEFAULT 0,
              updated_at REAL NOT NULL, PRIMARY KEY(learner,course_id),
              FOREIGN KEY(course_id) REFERENCES courses(id));
            ''')

    @contextlib.contextmanager
    def _db(self):
        # `with sqlite3.connect(...)` only commits or rolls back; it never
        # closes. A leaked connection keeps the file open, which on Windows
        # locks it (the tests' temp dirs could not be deleted) and slowly piles
        # up handles in the long-running bridge. Commit AND close, every time.
        db = sqlite3.connect(self.path, timeout=15)
        try:
            db.execute('PRAGMA busy_timeout=15000')
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def key(skill):
        return re.sub(r'\s+', ' ', skill.casefold().strip())

    def get(self, skill):
        with self.lock, self._db() as db:
            row = db.execute('SELECT lesson_json FROM courses WHERE skill_key=? ORDER BY version DESC LIMIT 1', (self.key(skill),)).fetchone()
        return json.loads(row[0]) if row else None

    def save(self, skill, lesson, replace=False):
        from lesson_llm import validate
        try:
            validate(lesson)
        except Exception as exc:
            raise ValueError('invalid lesson: ' + str(exc)) from exc
        # Do not persist failed reviews as canonical shared courses.
        if lesson.get('reviewed') is not True:
            raise ValueError('only reviewed lessons can enter the shared library')
        key = self.key(skill)
        with self.lock, self._db() as db:
            existing = db.execute('SELECT version,lesson_json FROM courses WHERE skill_key=? ORDER BY version DESC LIMIT 1', (key,)).fetchone()
            if existing and not replace:
                return json.loads(existing[1])
            version = (existing[0] + 1) if existing else 1
            course_id = hashlib.sha256((key + ':' + str(version)).encode()).hexdigest()[:20]
            stored = dict(lesson)
            stored['courseId'], stored['courseVersion'] = course_id, version
            db.execute('INSERT INTO courses VALUES (?,?,?,?,?)', (course_id, key, version, json.dumps(stored), time.time()))
            return stored

    def list_courses(self, learner=None):
        with self.lock, self._db() as db:
            rows = db.execute('''SELECT c.id,c.skill_key,c.version,c.created_at,p.step,p.completed_json,p.score
                FROM courses c LEFT JOIN progress p ON p.course_id=c.id AND p.learner=?
                ORDER BY c.created_at DESC LIMIT 100''', (learner or '',)).fetchall()
        return [{'courseId':r[0], 'skill':r[1], 'version':r[2], 'createdAt':r[3],
                 'totalSteps':len(self.by_id(r[0])['steps']), 'step':r[4] or 0, 'completed':json.loads(r[5]) if r[5] else [], 'score':r[6] or 0} for r in rows]

    def by_id(self, course_id):
        with self.lock, self._db() as db:
            row = db.execute('SELECT lesson_json FROM courses WHERE id=?', (course_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def save_progress(self, learner, course_id, step, completed, score):
        if not isinstance(learner,str) or not (1 <= len(learner) <= 80):
            raise ValueError('learner must be 1–80 characters')
        lesson = self.by_id(course_id)
        if lesson is None: raise ValueError('unknown courseId')
        max_steps = len(lesson['steps'])
        if not isinstance(step,int) or isinstance(step,bool) or not (0 <= step <= max_steps):
            raise ValueError('step out of range')
        if not isinstance(completed,list) or len(completed)>max_steps or any(type(x)!=int or x<0 or x>=max_steps for x in completed):
            raise ValueError('invalid completed steps')
        if type(score)!=int or not (0 <= score <= 100000): raise ValueError('invalid score')
        with self.lock, self._db() as db:
            db.execute('''INSERT INTO progress VALUES (?,?,?,?,?,?) ON CONFLICT(learner,course_id)
                DO UPDATE SET step=excluded.step,completed_json=excluded.completed_json,
                score=excluded.score,updated_at=excluded.updated_at''',
                (learner,course_id,step,json.dumps(sorted(set(completed))),score,time.time()))
        return self.get_progress(learner,course_id)

    def get_progress(self,learner,course_id):
        with self.lock, self._db() as db:
            row=db.execute('SELECT step,completed_json,score,updated_at FROM progress WHERE learner=? AND course_id=?', (learner,course_id)).fetchone()
        return {'learner':learner,'courseId':course_id,'step':row[0], 'completed':json.loads(row[1]), 'score':row[2], 'updatedAt':row[3]} if row else {'learner':learner,'courseId':course_id,'step':0,'completed':[],'score':0}

    def export_library(self, learner):
        """Portable learner snapshot. Do not expose this endpoint outside localhost."""
        items = self.list_courses(learner)
        return {'format': 1, 'courses': [self.by_id(x['courseId']) for x in items],
                'progress': [self.get_progress(learner, x['courseId']) for x in items]}

    def import_library(self, learner, snapshot):
        """Merge a cloud snapshot into SQLite, preserving course versions and local progress."""
        if not isinstance(learner, str) or not (1 <= len(learner) <= 80):
            raise ValueError('invalid learner')
        if not isinstance(snapshot, dict) or snapshot.get('format') != 1:
            raise ValueError('invalid snapshot format')
        courses = snapshot.get('courses', [])
        progress = snapshot.get('progress', [])
        if not isinstance(courses, list) or len(courses) > 100 or not isinstance(progress, list) or len(progress) > 100:
            raise ValueError('snapshot too large')
        from lesson_llm import validate
        with self.lock, self._db() as db:
            for course in courses:
                if not isinstance(course, dict) or course.get('reviewed') is not True:
                    raise ValueError('unreviewed course')
                validate(course)
                skill = course.get('skill') or course.get('title')
                course_id = course.get('courseId')
                version = course.get('courseVersion')
                if not isinstance(skill, str) or not skill.strip() or not isinstance(course_id, str) or len(course_id) != 20 or type(version) != int or version < 1:
                    raise ValueError('invalid course identity')
                if hashlib.sha256((self.key(skill) + ':' + str(version)).encode()).hexdigest()[:20] != course_id:
                    raise ValueError('course ID does not match skill/version')
                db.execute('INSERT OR IGNORE INTO courses VALUES (?,?,?,?,?)',
                           (course_id, self.key(skill), version, json.dumps(course), time.time()))
        imported = 0
        for item in progress:
            if not isinstance(item, dict):
                raise ValueError('invalid progress entry')
            cid = item.get('courseId')
            old = self.get_progress(learner, cid)
            if item.get('updatedAt', 0) > old.get('updatedAt', 0):
                self.save_progress(learner, cid, item.get('step', 0), item.get('completed', []), item.get('score', 0))
                imported += 1
        return {'courses': len(courses), 'progressMerged': imported}
