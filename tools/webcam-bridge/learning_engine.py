"""Deterministic activity contracts for GHOST's existing validated lessons.

No extra API key or remote model required. The Lens retains its existing
renderers; companion clients can use this representation for accessible practice.
"""
import copy
import hashlib
import json
import re

KINDS = ('TRACE', 'EXPLORE_3D', 'SEQUENCE', 'MATCH', 'PRACTICE', 'QUIZ')


def activity_for_step(step, index):
    if not isinstance(step, dict):
        raise ValueError('step must be an object')
    render = step.get('render') or {}
    kind = render.get('kind', 'tip')
    if kind == 'path':
        activity = 'TRACE'
    elif kind in ('objects', 'snap3d'):
        activity = 'EXPLORE_3D'
    elif kind in ('quiz', 'choice'):
        activity = 'QUIZ'
    elif kind in ('match', 'pairs'):
        activity = 'MATCH'
    elif kind in ('practice', 'fretboard', 'chord'):
        activity = 'PRACTICE'
    else:
        activity = 'SEQUENCE'
    return {'id': 'step-%d' % (index + 1), 'type': activity,
            'title': step.get('title', 'Step %d' % (index + 1)),
            'instruction': step.get('tip', ''), 'render': copy.deepcopy(render),
            'completion': 'trace' if activity == 'TRACE' else 'manual'}


def compile_lesson(lesson):
    if not isinstance(lesson, dict) or not isinstance(lesson.get('steps'), list):
        raise ValueError('validated lesson with steps required')
    if not lesson['steps']:
        raise ValueError('lesson has no steps')
    activities = [activity_for_step(step, i) for i, step in enumerate(lesson['steps'])]
    # Validated GHOST lessons carry their knowledge checks at the lesson level.
    # Expose them as actual interactive activities rather than dropping them.
    for i, item in enumerate(lesson.get('quiz') or []):
        if not isinstance(item, dict):
            continue
        options = item.get('options')
        answer = item.get('answer')
        if (isinstance(item.get('question'), str) and isinstance(options, list)
                and 2 <= len(options) <= 6 and all(isinstance(x, str) for x in options)
                and type(answer) is int and 0 <= answer < len(options)):
            activities.append({'id': 'quiz-%d' % (i + 1), 'type': 'QUIZ',
                'title': 'Knowledge check %d' % (i + 1), 'instruction': item['question'],
                'render': {'kind': 'quiz', 'question': item['question'],
                           'options': copy.deepcopy(options), 'answer': answer},
                'completion': 'correct_answer'})
    identity = lesson.get('courseId') or hashlib.sha256(
        json.dumps(lesson, sort_keys=True, default=str).encode('utf-8')).hexdigest()[:16]
    return {'courseId': identity, 'version': lesson.get('courseVersion', 1),
            'skill': lesson.get('skill', ''), 'summary': lesson.get('summary', ''),
            'activities': activities, 'supportedTypes': list(KINDS)}


def next_activity(compiled, progress=None):
    activities = compiled.get('activities', [])
    progress = progress or {}
    index = progress.get('step', 0)
    try:
        index = int(index)
    except (TypeError, ValueError):
        index = 0
    return activities[max(0, min(index, len(activities) - 1))] if activities else None


def hint_for(activity, attempt=0):
    title = re.sub(r'\s+', ' ', str(activity.get('title', 'this step'))).strip()[:80]
    if attempt >= 2:
        return 'Try a smaller movement. Watch the example for %s, then try again.' % title
    return 'Look closely at the example, then try %s one part at a time.' % title
