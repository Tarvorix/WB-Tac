import {
  Scene,
  AnimationGroup,
  AbstractMesh,
  Skeleton
} from '@babylonjs/core';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationState, ANIMATION_CONFIGS, getAnimationConfig } from '../types/AnimationTypes';
import { ASSET_PATHS } from '../utils/Constants';

interface AnimationData {
  group: AnimationGroup;
  config: {
    loop: boolean;
    speedRatio: number;
    blendingSpeed: number;
  };
}

export class CharacterAnimationController {
  private scene: Scene;
  private assetLoader: AssetLoader;
  private characterId: string;
  private animations: Map<AnimationState, AnimationData> = new Map();
  private currentState: AnimationState = AnimationState.IDLE;
  private activeAnimation: AnimationGroup | null = null;
  private rootMesh: AbstractMesh | null = null;
  private skeleton: Skeleton | null = null;
  private isTransitioning: boolean = false;
  private queuedState: AnimationState | null = null;
  private onAnimationEndCallback: (() => void) | null = null;
  private ownedAnimationGroups: AnimationGroup[] = [];

  constructor(scene: Scene, assetLoader: AssetLoader, characterId: string = 'player') {
    this.scene = scene;
    this.assetLoader = assetLoader;
    this.characterId = characterId;
  }

  public async initialize(): Promise<{ rootMesh: AbstractMesh; skeleton: Skeleton | null }> {
    // Load the idle asset container first to ensure it's cached
    const container = await this.assetLoader.loadAssetContainer(ASSET_PATHS.CHARACTER_IDLE);

    // Instantiate a unique copy for this character (same pattern as EnemyAnimationController)
    const instances = container.instantiateModelsToScene(
      (name) => `${this.characterId}_${name}`,
      false,
      { doNotInstantiate: false }
    );

    if (instances.rootNodes.length === 0) {
      throw new Error('Failed to instantiate character model');
    }

    this.rootMesh = instances.rootNodes[0] as AbstractMesh;
    this.skeleton = instances.skeletons[0] || null;

    // Reset instanced mesh position to origin.
    // Keep the authored rotation so model-forward stays aligned with movement.
    this.rootMesh.position.setAll(0);

    console.log(`CharacterAnimationController ${this.characterId}: created rootMesh "${this.rootMesh.name}", skeleton: ${this.skeleton?.name || 'none'}`);
    console.log(`  rootNodes count: ${instances.rootNodes.length}, skeletons count: ${instances.skeletons.length}`);

    // Store the idle animation group for this character
    if (instances.animationGroups.length > 0) {
      const idleAnimGroup = instances.animationGroups[0];
      this.ownedAnimationGroups.push(idleAnimGroup);

      const idleConfig = getAnimationConfig(AnimationState.IDLE);
      this.animations.set(AnimationState.IDLE, {
        group: idleAnimGroup,
        config: {
          loop: idleConfig?.loop ?? true,
          speedRatio: idleConfig?.speedRatio ?? 1,
          blendingSpeed: idleConfig?.blendingSpeed ?? 0.05
        }
      });
    }

    await this.loadRemainingAnimations();

    this.playAnimation(AnimationState.IDLE, true);

    return { rootMesh: this.rootMesh, skeleton: this.skeleton };
  }

  private async loadRemainingAnimations(): Promise<void> {
    const animationsToLoad = ANIMATION_CONFIGS.filter(
      config => config.state !== AnimationState.IDLE
    );

    for (const config of animationsToLoad) {
      try {
        // Load the container for this animation
        const container = await this.assetLoader.loadAssetContainer(config.glbPath);

        if (container.animationGroups.length > 0) {
          // Clone the animation group for this character
          const sourceAnimGroup = container.animationGroups[0];
          const clonedAnimGroup = sourceAnimGroup.clone(
            `${this.characterId}_${config.state}`,
            (oldTarget) => {
              // Retarget to this character's skeleton
              if (this.skeleton && oldTarget?.name) {
                const bone = this.skeleton.bones.find(b => b.name === oldTarget.name);
                if (bone) {
                  return bone.getTransformNode() || oldTarget;
                }
              }
              return oldTarget;
            }
          );

          this.ownedAnimationGroups.push(clonedAnimGroup);

          this.animations.set(config.state, {
            group: clonedAnimGroup,
            config: {
              loop: config.loop,
              speedRatio: config.speedRatio,
              blendingSpeed: config.blendingSpeed
            }
          });
        }
      } catch (error) {
        console.error(`Failed to load animation ${config.state}:`, error);
      }
    }
  }

  public transition(toState: AnimationState, immediate: boolean = false): void {
    if (toState === this.currentState && !immediate) {
      return;
    }

    if (this.isTransitioning && !immediate) {
      this.queuedState = toState;
      return;
    }

    const animData = this.animations.get(toState);
    if (!animData) {
      console.warn(`Animation not found for state: ${toState}`);
      return;
    }

    if (this.activeAnimation && !immediate) {
      this.isTransitioning = true;
      this.crossFadeToAnimation(animData, toState);
    } else {
      this.playAnimation(toState, animData.config.loop);
    }
  }

  private crossFadeToAnimation(animData: AnimationData, toState: AnimationState): void {
    const newAnim = animData.group;

    newAnim.enableBlending = true;
    newAnim.blendingSpeed = animData.config.blendingSpeed;

    if (this.activeAnimation) {
      this.activeAnimation.stop();
    }

    newAnim.start(
      animData.config.loop,
      animData.config.speedRatio,
      newAnim.from,
      newAnim.to,
      false
    );

    this.activeAnimation = newAnim;
    this.currentState = toState;
    this.isTransitioning = false;

    if (!animData.config.loop) {
      this.setupAnimationEndHandler(newAnim);
    }

    if (this.queuedState) {
      const nextState = this.queuedState;
      this.queuedState = null;
      this.transition(nextState);
    }
  }

  private playAnimation(state: AnimationState, loop: boolean): void {
    const animData = this.animations.get(state);
    if (!animData) return;

    if (this.activeAnimation) {
      this.activeAnimation.stop();
    }

    const anim = animData.group;
    anim.enableBlending = false;

    anim.start(loop, animData.config.speedRatio, anim.from, anim.to, false);

    this.activeAnimation = anim;
    this.currentState = state;

    if (!loop) {
      this.setupAnimationEndHandler(anim);
    }
  }

  private setupAnimationEndHandler(anim: AnimationGroup): void {
    let hasEnded = false;

    const onEnd = () => {
      if (hasEnded) return;
      hasEnded = true;

      if (this.onAnimationEndCallback) {
        const callback = this.onAnimationEndCallback;
        this.onAnimationEndCallback = null;
        callback();
      } else {
        this.transition(AnimationState.IDLE);
      }
    };

    anim.onAnimationGroupEndObservable.addOnce(onEnd);

    anim.onAnimationGroupLoopObservable.addOnce(onEnd);

    setTimeout(onEnd, 1200);
  }

  public playOnce(state: AnimationState, onComplete?: () => void): void {
    this.onAnimationEndCallback = onComplete || (() => this.transition(AnimationState.IDLE));
    this.transition(state, true);
  }

  public getCurrentState(): AnimationState {
    return this.currentState;
  }

  public isPlaying(): boolean {
    return this.activeAnimation?.isPlaying ?? false;
  }

  public isInState(state: AnimationState): boolean {
    return this.currentState === state;
  }

  public getRootMesh(): AbstractMesh | null {
    return this.rootMesh;
  }

  public getSkeleton(): Skeleton | null {
    return this.skeleton;
  }

  public setSpeedRatio(state: AnimationState, speedRatio: number): void {
    const animData = this.animations.get(state);
    if (animData) {
      animData.config.speedRatio = speedRatio;
      if (this.currentState === state && this.activeAnimation) {
        this.activeAnimation.speedRatio = speedRatio;
      }
    }
  }

  public stopAll(): void {
    for (const animData of this.animations.values()) {
      animData.group.stop();
    }
    this.activeAnimation = null;
  }

  public update(_deltaTime: number): void {
  }

  public dispose(): void {
    this.stopAll();

    // Dispose all owned animation groups
    for (const animGroup of this.ownedAnimationGroups) {
      animGroup.dispose();
    }
    this.ownedAnimationGroups = [];

    // Dispose the root mesh and its children, but NOT the materials (they're shared)
    if (this.rootMesh) {
      const children = this.rootMesh.getChildMeshes();
      for (const child of children) {
        child.dispose(false, false);
      }
      this.rootMesh.dispose(false, false);
    }

    this.animations.clear();
    this.rootMesh = null;
    this.skeleton = null;
  }
}
