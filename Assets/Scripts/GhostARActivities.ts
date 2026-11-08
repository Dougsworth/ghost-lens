/** Native Spectacles activity panel: pinchable quiz/matching and 3D exploration. */
import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { WebcamHandBridge } from "./WebcamHandBridge";
import { GhostNativeHandInput } from "./GhostNativeHandInput";
import { Lesson, LessonQuizItem } from "./GhostLessonSchema";
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";

@component
export class GhostARActivities extends BaseScriptComponent {
  @input @allowUndefined @hint("Optional box RenderMeshVisual (mesh/material configured in scene).") boxModel: SceneObject;
  @input @allowUndefined @hint("Optional sphere model.") sphereModel: SceneObject;
  @input @allowUndefined @hint("Optional cylinder model.") cylinderModel: SceneObject;
  private root: SceneObject;
  private heading: Text;
  private detail: Text;
  private choices: {node: SceneObject; label: Text}[] = [];
  private current: Lesson | null = null;
  private quizIndex = 0;
  private matches: {left: string; right: string}[] = [];
  private selectedLeft = -1;
  private solved: {[key: number]: boolean} = {};
  private mode = "";
  private model: SceneObject | null = null;
  private matchRightOrder: number[] = [];
  private grabbing = false;
  private grabOffset: vec3 | null = null;
  private lastPinch = false;
  @input @hint("Enable freehand 3D grabbing with native Spectacles tracking, or webcam in Preview.") freehandGrab: boolean = true;
  @input @hint("Prefer native Spectacles hand tracking when available.") preferNativeHand: boolean = true;
  @input @hint("Maximum distance in cm from the model to begin grabbing.") grabRadiusCm: number = 12;
  private angle = 0;
  private scale = 1;
  private readonly done = new Event<void>();
  get onFinished(): PublicApi<void> { return this.done.publicApi(); }

  onAwake(): void {
    this.root = this.sceneObject;
    this.root.enabled = false;
    this.heading = this.text("Heading", 6, 36);
    this.detail = this.text("Detail", 3.6, 27);
    for (let i = 0; i < 6; i++) {
      const node = global.scene.createSceneObject("Choice " + i);
      node.setParent(this.root);
      node.getTransform().setLocalPosition(new vec3((i % 2) * 8 - 4, -0.3 - Math.floor(i / 2) * 2.7, 0));
      const btn = node.createComponent(Button.getTypeName()) as Button;
      btn.setVariant({theme:"SnapOS2", shape:"Rectangle", style:"PrimaryNeutral"});
      btn.size = new vec3(7.4, 2.25, 1);
      const index = i;
      btn.onTriggerUp.add(() => this.choose(index));
      const label = this.text("Label " + i, 0, 25, node);
      this.choices.push({node, label});
    }
    this.hideModels();
    this.createEvent("UpdateEvent").bind(() => this.updateGrab());
  }
  private text(name: string, y: number, size: number, parent?: SceneObject): Text {
    const node = global.scene.createSceneObject(name);
    node.setParent(parent || this.root);
    node.getTransform().setLocalPosition(new vec3(0, y, 0.1));
    const t = node.createComponent("Component.Text") as Text;
    t.text = ""; t.size = size; t.textFill.color = new vec4(0.96,0.93,0.85,1);
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.layoutRect = Rect.create(-9, 9, -1.1, 1.1);
    return t;
  }
  private hideModels(): void {
    if (this.boxModel) this.boxModel.enabled = false;
    if (this.sphereModel) this.sphereModel.enabled = false;
    if (this.cylinderModel) this.cylinderModel.enabled = false;
  }
  private labels(items: string[]): void {
    for (let i=0;i<this.choices.length;i++) {
      this.choices[i].node.enabled = i < items.length;
      this.choices[i].label.text = i < items.length ? items[i].slice(0,36) : "";
    }
  }
  openQuiz(lesson: Lesson): boolean {
    if (!lesson.quiz || lesson.quiz.length === 0) return false;
    this.current = lesson; this.quizIndex = 0; this.mode = "quiz";
    this.root.enabled = true; this.hideModels(); this.renderQuiz(); return true;
  }
  private renderQuiz(): void {
    if (!this.current || this.quizIndex >= this.current.quiz.length) {
      this.close(); this.done.invoke(); return;
    }
    const q: LessonQuizItem = this.current.quiz[this.quizIndex];
    this.heading.text = "QUICK CHECK  " + (this.quizIndex+1) + "/" + this.current.quiz.length;
    this.detail.text = q.question.slice(0,105);
    this.labels(q.options.slice(0,4));
  }
  openMatching(pairs: {left:string;right:string}[]): boolean {
    if (!pairs || pairs.length < 2 || pairs.length > 3) return false;
    this.matches = pairs; this.selectedLeft = -1; this.solved = {};
    // Shuffle the meanings, rather than presenting each answer beside its term.
    this.matchRightOrder = pairs.map((_, i) => i).reverse();
    this.mode="match"; this.root.enabled=true; this.hideModels(); this.renderMatch(); return true;
  }
  private renderMatch(): void {
    this.heading.text="MATCH THE PAIRS";
    this.detail.text="Choose a term, then its meaning";
    const n=this.matches.length;
    this.labels(this.matches.map((p,i)=> (this.solved[i]?"✓ ":"")+p.left).concat(this.matchRightOrder.map(i=>this.matches[i].right)));
  }
  openExplore(shape: string, title: string): boolean {
    this.hideModels();
    this.model = shape==="sphere"?this.sphereModel:shape==="cylinder"?this.cylinderModel:this.boxModel;
    if (!this.model) return false;
    this.mode="explore"; this.root.enabled=true; this.model.enabled=true;
    this.heading.text=title.slice(0,45); this.detail.text="Pinch to turn or resize the model";
    this.angle=0; this.scale=1; this.grabbing=false; this.lastPinch=false; this.grabOffset=null;
    this.labels(["↶ Turn left", "Turn right ↷", "− Smaller", "+ Larger", "Done"]);
    return true;
  }
  private choose(i: number): void {
    if (this.mode==="quiz" && this.current) {
      const q=this.current.quiz[this.quizIndex];
      if (i===q.answer) { this.quizIndex++; this.renderQuiz(); }
      else this.detail.text="Try again · " + q.question.slice(0,80);
    } else if (this.mode==="match") {
      const n=this.matches.length;
      if (i<n) { if (!this.solved[i]) this.selectedLeft=i; }
      else if (this.selectedLeft>=0) {
        if (this.matchRightOrder[i-n]===this.selectedLeft) {
          this.solved[this.selectedLeft]=true;
          if (Object.keys(this.solved).length===n) {this.close();this.done.invoke();return;}
          this.selectedLeft=-1; this.renderMatch();
        } else this.detail.text="Not quite. Try another meaning.";
      }
    } else if (this.mode==="explore" && this.model) {
      if(i===4) {this.close();this.done.invoke();return;}
      if(i<2) this.angle += i===0?-20:20;
      else this.scale=Math.max(0.5,Math.min(1.8,this.scale+(i===2?-0.15:0.15)));
      const t=this.model.getTransform();
      t.setLocalRotation(quat.fromEulerAngles(0,this.angle,0));
      t.setLocalScale(new vec3(this.scale,this.scale,this.scale));
    }
  }
  /** Follow a held pinch while it begins near the 3D model (Preview hand bridge). */
  private updateGrab(): void {
    if (this.mode !== "explore" || !this.model || !this.freehandGrab) return;
    const nativeFrame = this.preferNativeHand && GhostNativeHandInput.instance
      ? GhostNativeHandInput.instance.getFrame() : null;
    const bridge = WebcamHandBridge.instance;
    const fingerWorld = nativeFrame ? nativeFrame.point
      : (bridge && bridge.hand ? bridge.fingertipWorld : null);
    if (!fingerWorld) {
      this.grabbing = false; this.grabOffset = null; this.lastPinch = false; return;
    }
    const pressed = nativeFrame ? nativeFrame.pinching : !!(bridge && bridge.isPinching);
    const modelTransform = this.model.getTransform();
    const parent = this.model.getParent();
    if (!parent) return;
    const fingerLocal = parent.getTransform().getInvertedWorldTransform().multiplyPoint(fingerWorld);
    const modelPos = modelTransform.getLocalPosition();
    if (pressed && !this.lastPinch) {
      const separation = fingerLocal.sub(modelPos);
      if (separation.length <= this.grabRadiusCm) {
        this.grabbing = true;
        this.grabOffset = modelPos.sub(fingerLocal);
      }
    }
    if (!pressed) { this.grabbing = false; this.grabOffset = null; }
    if (pressed && this.grabbing && this.grabOffset) {
      const next = fingerLocal.add(this.grabOffset);
      // Keep the object within a reachable region of the activity panel.
      modelTransform.setLocalPosition(new vec3(
        Math.max(-20, Math.min(20, next.x)),
        Math.max(-15, Math.min(15, next.y)),
        Math.max(-15, Math.min(15, next.z))));
    }
    this.lastPinch = pressed;
  }
  close(): void { this.grabbing=false; this.grabOffset=null; this.hideModels(); this.root.enabled=false; this.mode=""; }
}
