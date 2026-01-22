import {
  Scene,
  FollowCamera,
  Vector3,
  TransformNode,
  AbstractMesh,
  Animation,
  EasingFunction,
  QuadraticEase,
  AnimationGroup
} from '@babylonjs/core';
import { GAME_CONSTANTS } from '../utils/Constants';

export class CameraSystem {
  private camera: FollowCamera;
  private scene: Scene;
  private target: TransformNode | AbstractMesh | null = null;
  private shakeAnimationGroup: AnimationGroup | null = null;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;

    this.camera = new FollowCamera(
      'thirdPersonCamera',
      new Vector3(0, GAME_CONSTANTS.CAMERA_HEIGHT_OFFSET, -GAME_CONSTANTS.CAMERA_RADIUS),
      scene
    );

    this.camera.radius = GAME_CONSTANTS.CAMERA_RADIUS;
    this.camera.heightOffset = GAME_CONSTANTS.CAMERA_HEIGHT_OFFSET;
    this.camera.rotationOffset = GAME_CONSTANTS.CAMERA_ROTATION_OFFSET;
    this.camera.cameraAcceleration = GAME_CONSTANTS.CAMERA_ACCELERATION;
    this.camera.maxCameraSpeed = GAME_CONSTANTS.CAMERA_MAX_SPEED;

    this.camera.lowerRadiusLimit = GAME_CONSTANTS.CAMERA_LOWER_RADIUS_LIMIT;
    this.camera.upperRadiusLimit = GAME_CONSTANTS.CAMERA_UPPER_RADIUS_LIMIT;
    this.camera.lowerHeightOffsetLimit = GAME_CONSTANTS.CAMERA_LOWER_HEIGHT_LIMIT;
    this.camera.upperHeightOffsetLimit = GAME_CONSTANTS.CAMERA_UPPER_HEIGHT_LIMIT;

    this.camera.inputs.clear();

    scene.activeCamera = this.camera;
  }

  public setTarget(target: TransformNode | AbstractMesh): void {
    this.target = target;
    this.camera.lockedTarget = target as AbstractMesh;
  }

  public getTarget(): TransformNode | AbstractMesh | null {
    return this.target;
  }

  public setRadius(radius: number): void {
    this.camera.radius = Math.max(
      GAME_CONSTANTS.CAMERA_LOWER_RADIUS_LIMIT,
      Math.min(GAME_CONSTANTS.CAMERA_UPPER_RADIUS_LIMIT, radius)
    );
  }

  public setHeightOffset(height: number): void {
    this.camera.heightOffset = Math.max(
      GAME_CONSTANTS.CAMERA_LOWER_HEIGHT_LIMIT,
      Math.min(GAME_CONSTANTS.CAMERA_UPPER_HEIGHT_LIMIT, height)
    );
  }

  public setRotationOffset(rotation: number): void {
    this.camera.rotationOffset = rotation;
  }

  public getRadius(): number {
    return this.camera.radius;
  }

  public getHeightOffset(): number {
    return this.camera.heightOffset;
  }

  public getRotationOffset(): number {
    return this.camera.rotationOffset;
  }

  public setCameraAcceleration(acceleration: number): void {
    this.camera.cameraAcceleration = acceleration;
  }

  public setMaxCameraSpeed(speed: number): void {
    this.camera.maxCameraSpeed = speed;
  }

  public zoomIn(amount: number = 1): void {
    this.setRadius(this.camera.radius - amount);
  }

  public zoomOut(amount: number = 1): void {
    this.setRadius(this.camera.radius + amount);
  }

  public getCameraPosition(): Vector3 {
    return this.camera.position.clone();
  }

  public getCameraDirection(): Vector3 {
    return this.camera.getForwardRay().direction;
  }

  public getCamera(): FollowCamera {
    return this.camera;
  }

  public update(_deltaTime: number): void {
  }

  /**
   * Camera shake using Babylon.js Animation system
   * More efficient than observable polling and frame-rate independent
   */
  public shake(intensity: number, duration: number): void {
    // Stop any existing shake animation
    if (this.shakeAnimationGroup) {
      this.shakeAnimationGroup.stop();
      this.shakeAnimationGroup.dispose();
    }

    const originalRadius = this.camera.radius;
    const originalHeight = this.camera.heightOffset;
    const frameRate = 60;
    const totalFrames = Math.round(duration * frameRate);

    // Create easing function for decay
    const easingFunction = new QuadraticEase();
    easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);

    // Generate shake keyframes for radius
    const radiusAnimation = new Animation(
      'cameraShakeRadius',
      'radius',
      frameRate,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    const radiusKeyframes = [];
    for (let frame = 0; frame <= totalFrames; frame++) {
      const progress = frame / totalFrames;
      const decay = 1 - progress; // Linear decay, easing applied separately
      const shakeOffset = (Math.random() - 0.5) * intensity * decay;
      radiusKeyframes.push({
        frame: frame,
        value: originalRadius + shakeOffset
      });
    }
    // Ensure final frame returns to original
    radiusKeyframes[radiusKeyframes.length - 1].value = originalRadius;
    radiusAnimation.setKeys(radiusKeyframes);
    radiusAnimation.setEasingFunction(easingFunction);

    // Generate shake keyframes for height
    const heightAnimation = new Animation(
      'cameraShakeHeight',
      'heightOffset',
      frameRate,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    const heightKeyframes = [];
    for (let frame = 0; frame <= totalFrames; frame++) {
      const progress = frame / totalFrames;
      const decay = 1 - progress;
      const shakeOffset = (Math.random() - 0.5) * intensity * 0.5 * decay;
      heightKeyframes.push({
        frame: frame,
        value: originalHeight + shakeOffset
      });
    }
    // Ensure final frame returns to original
    heightKeyframes[heightKeyframes.length - 1].value = originalHeight;
    heightAnimation.setKeys(heightKeyframes);
    heightAnimation.setEasingFunction(easingFunction);

    // Create animation group for coordinated playback
    this.shakeAnimationGroup = new AnimationGroup('cameraShakeGroup', this.scene);
    this.shakeAnimationGroup.addTargetedAnimation(radiusAnimation, this.camera);
    this.shakeAnimationGroup.addTargetedAnimation(heightAnimation, this.camera);

    // Play the animation group
    this.shakeAnimationGroup.play(false);

    // Clean up when done
    this.shakeAnimationGroup.onAnimationGroupEndObservable.addOnce(() => {
      // Ensure camera returns to exact original values
      this.camera.radius = originalRadius;
      this.camera.heightOffset = originalHeight;
      if (this.shakeAnimationGroup) {
        this.shakeAnimationGroup.dispose();
        this.shakeAnimationGroup = null;
      }
    });
  }

  public dispose(): void {
    if (this.shakeAnimationGroup) {
      this.shakeAnimationGroup.stop();
      this.shakeAnimationGroup.dispose();
    }
    this.camera.dispose();
  }
}
