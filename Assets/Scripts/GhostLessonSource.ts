/**
 * GhostLessonSource — where a lesson comes from.
 *
 * Owns:  the three tiers, in order, and the promise that one of them always
 *        answers.
 * Must not: play a lesson, or know what a step looks like. It returns validated
 *        data and nothing else.
 *
 * Tiers, exactly as the brief orders them:
 *   1. Remote Service Gateway  — the planner on real Spectacles.
 *   2. The webcam bridge       — POST /lesson in the Lens Studio preview,
 *                                which runs the same two-pass planner against
 *                                the user's own API key, held in their
 *                                environment and never in this project.
 *   3. The bundled bank        — four hand-written lessons, no network at all.
 *
 * Tier 3 is why "a lesson never fails". Every failure above it falls through
 * rather than surfacing: a dead key, no network, a model that returned prose,
 * or a lesson that did not validate all end the same way — the learner gets a
 * lesson. The only thing that changes is which one, and the UI says so.
 *
 * No key or token is read from, or written to, this project. The gateway holds
 * its own credential on device; the bridge reads the user's from their shell.
 */

import { bankLessonFor, BANK_KEYS, LESSON_BANK } from "./GhostLessonBank";
import { Lesson, validateLesson } from "./GhostLessonSchema";

export type LessonOrigin = "gateway" | "bridge" | "bank";

export type LessonResult = {
  lesson: Lesson;
  origin: LessonOrigin;
  /** Why the better tiers were skipped, for the log and the outline card. */
  note: string;
};

@component
export class GhostLessonSource extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostLessonSource &ndash; plans a lesson, or falls back to one</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Internet Module. Without it only the bundled lessons are available, which is a working state, not an error.")
  internetModule: InternetModule;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("The webcam bridge's lesson endpoint, used in the Lens Studio preview. Needs Experimental API enabled for a plain http:// URL, the same setting the hand bridge needs.")
  bridgeUrl: string = "http://127.0.0.1:8766/lesson";

  @input
  @hint("Ask the bridge to plan a lesson when the gateway is unavailable. Turn off to force the bundled lessons.")
  useBridge: boolean = true;

  @input
  @hint("Seconds to wait for a planned lesson before falling back to a bundled one. Two LLM calls take a while; too short and every lesson is offline.")
  @widget(new SliderWidget(5, 120, 5))
  timeoutSec: number = 75;
  @ui.group_end

  /** Set while a request is in flight, so the UI can show it is thinking. */
  private inFlight = false;

  /** The bundled lesson nearest a skill. Always returns one. */
  bundledFor(skill: string): Lesson {
    return bankLessonFor(skill) || LESSON_BANK[BANK_KEYS[0]];
  }

  /** Skills offered when nothing can be planned. */
  offlineSkills(): string[] {
    return BANK_KEYS;
  }

  get busy(): boolean {
    return this.inFlight;
  }

  /**
   * Fetch a lesson for `skill`, calling back exactly once.
   *
   * Deliberately callback-based rather than async: the caller is a scene
   * component that may be torn down (Packs pinched, notebook closed) while a
   * request is in flight, and `cancelled` lets it drop a late answer without
   * the lesson arriving into a dead UI.
   */
  request(skill: string, onDone: (r: LessonResult) => void): { cancel: () => void } {
    let done = false;
    let cancelled = false;
    this.inFlight = true;

    const finish = (r: LessonResult) => {
      if (done || cancelled) return;
      done = true;
      this.inFlight = false;
      onDone(r);
    };

    const toBank = (note: string) => {
      const l = bankLessonFor(skill) || LESSON_BANK[BANK_KEYS[0]];
      finish({ lesson: l, origin: "bank", note: note });
    };

    // A hard deadline, independent of the request itself: a socket that never
    // errors and never answers would otherwise leave the learner on a spinner.
    const deadline = this.createEvent("DelayedCallbackEvent");
    deadline.bind(() => toBank("the planner took too long"));
    deadline.reset(this.timeoutSec);

    if (!this.internetModule) {
      toBank("no Internet Module, so lessons are the bundled ones");
      return { cancel: () => { cancelled = true; this.inFlight = false; } };
    }

    // Tier 1 is a seam, not a stub: when the Remote Service Gateway package is
    // present on device, plan through it here and fall through on failure.
    // It is not installed in this project, so today every live lesson is
    // planned by the bridge.

    if (!this.useBridge) {
      toBank("planning is switched off, so lessons are the bundled ones");
      return { cancel: () => { cancelled = true; this.inFlight = false; } };
    }

    this.askBridge(
      skill,
      (lesson) => finish({
        lesson: lesson,
        origin: "bridge",
        note: lesson.reviewed ? "planned and checked" : "planned",
      }),
      (why) => toBank(why)
    );

    return { cancel: () => { cancelled = true; this.inFlight = false; } };
  }

  /**
   * The same lesson, in two visible stages.
   *
   * `onPlanned` fires as soon as stage 1 lands, so the step titles can be
   * inked on while stage 2 runs behind them; `onDone` fires with the reviewed
   * lesson, which may have changed and should be updated quietly. If anything
   * fails, onDone still arrives — with the planned lesson, or a bundled one.
   *
   * Why two calls rather than one: the whole point is that the learner sees
   * real step titles at about seven seconds instead of staring at a frozen
   * line for fourteen. Same work, same result, shown in the middle.
   */
  requestStaged(
    skill: string,
    onPlanned: (lesson: Lesson) => void,
    onDone: (r: LessonResult) => void
  ): { cancel: () => void } {
    let done = false;
    let cancelled = false;
    this.inFlight = true;

    const finish = (r: LessonResult) => {
      if (done || cancelled) return;
      done = true;
      this.inFlight = false;
      onDone(r);
    };
    const toBank = (note: string) => {
      const l = bankLessonFor(skill) || LESSON_BANK[BANK_KEYS[0]];
      finish({ lesson: l, origin: "bank", note: note });
    };

    const deadline = this.createEvent("DelayedCallbackEvent");
    deadline.bind(() => toBank("the planner took too long"));
    deadline.reset(this.timeoutSec);

    if (!this.internetModule || !this.useBridge) {
      toBank(this.internetModule
        ? "planning is switched off, so lessons are the bundled ones"
        : "no Internet Module, so lessons are the bundled ones");
      return { cancel: () => { cancelled = true; this.inFlight = false; } };
    }

    this.askStage(
      "/lesson/plan",
      { skill: skill },
      (planned) => {
        if (cancelled) return;
        onPlanned(planned);
        // A reviewed cached course is already canonical: do not pay for review again.
        if ((planned as any).courseId && (planned as any).reviewed === true) {
          finish({ lesson: planned, origin: "bridge", note: "loaded from saved courses" });
          return;
        }
        // Stage 2. A failure here is not fatal: the planned lesson already
        // validated, so it is shipped as-is with reviewed left false.
        this.askStage(
          "/lesson/review",
          { skill: skill, lesson: planned },
          (reviewed) => finish({
            lesson: reviewed,
            origin: "bridge",
            note: reviewed.reviewed ? "planned and checked" : "planned",
          }),
          () => finish({ lesson: planned, origin: "bridge", note: "planned" })
        );
      },
      (why) => toBank(why)
    );

    return { cancel: () => { cancelled = true; this.inFlight = false; } };
  }

  /** One staged POST. Shares askBridge's error handling, different path. */
  private askStage(
    path: string,
    body: any,
    ok: (l: Lesson) => void,
    fail: (why: string) => void
  ): void {
    const base = this.bridgeUrl.replace(/\/lesson.*$/, "");
    let req: Request;
    try {
      req = new Request(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      fail("could not build the request: " + e);
      return;
    }

    this.internetModule
      .fetch(req)
      .then((response: Response) => {
        if (response.status !== 200) {
          response.text()
            .then((t: string) => fail(this.describe(response.status, t)))
            .catch(() => fail("the planner replied " + response.status));
          return;
        }
        response.text()
          .then((text: string) => {
            let raw: any;
            try {
              raw = JSON.parse(text);
            } catch (e) {
              fail("the planner's reply was not JSON");
              return;
            }
            const check = validateLesson(raw);
            if (!check.ok) {
              print("[GhostLessonSource] rejected a lesson from " + path + ": " +
                check.problems.join("; "));
              fail("the planned lesson did not fit the schema");
              return;
            }
            // The bridge reports what the call cost. Logged, never shown: the
            // learner is not the one paying attention to tokens.
            if (raw.usage) {
              print("[GhostLessonSource] " + path + " " +
                raw.usage.total_tokens + " tokens, about $" +
                raw.usage.estimated_usd + ", " + raw.seconds + "s");
            }
            ok(raw as Lesson);
          })
          .catch((e: any) => fail("could not read the planner's reply: " + e));
      })
      .catch((e: any) => {
        const s = String(e);
        if (s.indexOf("not secure") >= 0 || s.indexOf("Experimental") >= 0) {
          fail("the planner needs Project Settings > Experimental API");
          return;
        }
        fail("could not reach the planner");
      });
  }

  private askBridge(
    skill: string,
    ok: (l: Lesson) => void,
    fail: (why: string) => void
  ): void {
    let req: Request;
    try {
      req = new Request(this.bridgeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: skill }),
      });
    } catch (e) {
      fail("could not build the request: " + e);
      return;
    }

    this.internetModule
      .fetch(req)
      .then((response: Response) => {
        if (response.status !== 200) {
          // The bridge answers 400/422/502 with a readable reason. Read the
          // body before giving up so the log says WHY, not just the number.
          response
            .text()
            .then((t: string) => fail(this.describe(response.status, t)))
            .catch(() => fail("the planner replied " + response.status));
          return;
        }
        response
          .text()
          .then((text: string) => {
            let raw: any;
            try {
              raw = JSON.parse(text);
            } catch (e) {
              fail("the planner's reply was not JSON");
              return;
            }
            const check = validateLesson(raw);
            if (!check.ok) {
              // Both sides validate. The bridge already retried once; if it
              // still fails here the schemas have drifted apart, which is
              // worth saying plainly rather than silently using the bank.
              print("[GhostLessonSource] rejected a planned lesson: " +
                check.problems.join("; "));
              fail("the planned lesson did not fit the schema");
              return;
            }
            ok(raw as Lesson);
          })
          .catch((e: any) => fail("could not read the planner's reply: " + e));
      })
      .catch((e: any) => {
        const s = String(e);
        if (s.indexOf("not secure") >= 0 || s.indexOf("Experimental") >= 0) {
          fail("the planner needs Project Settings > Experimental API");
          return;
        }
        fail("could not reach the planner");
      });
  }

  private describe(status: number, body: string): string {
    if (status === 502 && body.indexOf("No LLM key") >= 0) {
      return "no API key set for the planner";
    }
    if (status === 422) return "the planner could not produce a valid lesson";
    if (status === 404) return "the bridge is running without the lesson endpoint";
    return "the planner replied " + status;
  }
}
