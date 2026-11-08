# GHOST — My Learning V3

## Native spatial library

The front door's notebook row now includes **My Learning**. Pinch it to load the first three saved courses from `/courses?learner=<GhostMain.learnerId>`. Pinch a saved course to open the cached reviewed lesson; progress restoration follows the existing course progress path. Pinch **My Learning** again to return to the default suggestions.

The UI reuses the project's actual Spectacles UIKit buttons and paper/ink styling, rather than creating untested collider-only controls. It is a **three-course first page**, not a complete paginated library. Set `GhostMain.learnerId` consistently. Pinch behavior still requires verification in Lens Studio and on device.

## Optional Supabase cloud accounts and synchronization

Local SQLite remains the default. To enable cross-device **manual backup/restore**:

1. Create a Supabase project, enable email/password authentication and configure confirmation emails.
2. Run `tools/webcam-bridge/supabase_schema.sql` in the project's SQL Editor. This creates a `ghost_notebooks` table with per-user Row Level Security.
3. Run `./tools/webcam-bridge/run_fast.sh` and open `http://127.0.0.1:8766/library.html`.
4. Enter your **project URL** and **publishable/anon key** (never the service-role key), sign up/sign in.
5. Use **Back up to cloud** on the source computer, then **Restore from cloud** on the destination computer. Use the same learner ID on both computers and in Lens Studio.

The browser talks directly to Supabase with the user's short-lived access token. The Python bridge does **not** receive passwords or cloud tokens. Cloud access is gated by Supabase Auth and SQL RLS. Passwords and tokens are not persisted in browser localStorage by this UI. Sign in again after reloading.

**Limits:** This is an explicit backup/restore workflow, not automatic real-time synchronization. Backups replace the cloud snapshot for that learner; restoring merges local courses and adopts cloud progress only if its timestamp is newer. There is no automatic account binding in Lens itself. `localhost` bridge endpoints are intentionally unauthenticated and **must not be exposed publicly**. No production cloud deployment or live Supabase authentication was tested.

## Verification

`cd tools/webcam-bridge && python -m unittest test_course_store test_room_relay test_cloud_sync -q`

15 Python tests pass. Lens Studio build/runtime and live Supabase network are unverified.
