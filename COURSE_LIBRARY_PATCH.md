# GHOST persistent course library — implementation notes

This patch builds on Study Together V2. Apply the paths in this ZIP over the matching paths in your latest GHOST project. **Do not overwrite the entire project with an older ZIP.** Restart `./tools/webcam-bridge/run_fast.sh`.

## Implemented
- SQLite course store at `tools/webcam-bridge/courses.sqlite3` (automatically created). Back up this file to preserve courses and progress.
- Reviewed, schema-validated AI lessons are saved by normalized skill; repeat requests load the saved course, including after bridge restarts.
- Staged Lens requests recognize a reviewed cached course and skip the second AI review call.
- Course ID and version remain stable for reuse; `regenerate: true` on `/lesson/plan` bypasses the cache, but **only a reviewed generation** is saved as a new version when `/lesson/review` receives `regenerate: true`.
- Separate learner progress stored by learner ID + course ID.
- API: `GET /courses?learner=alice`, `GET /courses/find?skill=draw%20a%20star`, `GET /courses/get?id=...`, `GET /progress?learner=alice&courseId=...`, `POST /progress` with `{"learner":"alice","courseId":"...","step":1,"completed":[0],"score":5}`.
- `POST /lesson` and staged `/lesson/plan` + `/lesson/review` reuse cached lessons.

## Important limits
- **The Lens course-picker and automatic progress-save hooks are NOT wired yet.** The persistence API is implemented and tested, but an AR learner library UI and automatic resume require additional Lens scene work.
- This is a local preview server, not an authenticated multi-user cloud backend. Learner IDs are caller supplied. Do not expose the HTTP port publicly or treat IDs as authentication.
- Cache lookup is exact after case/whitespace normalization; semantic matches and cross-device sync need a hosted service.
- No live Gemini/OpenAI/Anthropic calls or Lens Studio preview tests were possible here. Validation and persistence unit tests ran locally.
- For multiplayer, share the returned `courseId` and `courseVersion` with room members to guarantee identical content; the existing room transport still needs UI-side course selection and per-learner progress binding.

## Test
`cd tools/webcam-bridge && python3 -m unittest test_course_store test_room_relay -v`

## Privacy
Keep `courses.sqlite3` out of Git and out of public distributions; it contains learners' progress and lesson content. Add `tools/webcam-bridge/*.sqlite3*` to `.gitignore`.
