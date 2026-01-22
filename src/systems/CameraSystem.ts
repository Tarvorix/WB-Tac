import {
  Scene,
  FollowCamera,
  Vector3,
  TransformNode,
  AbstractMesh
} from '@babylonjs/core';
import { GAME_CONSTANTS } from '../utils/Constants';

export class CameraSystem {
  private camera: FollowCamera;
  private scene: Scene;
  private target: TransformNode | AbstractMesh | null = null;

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

  public shake(intensity: number, duration: number): void {
    const originalRadius = this.camera.radius;
    const originalHeight = this.camera.heightOffset;
    const startTime = performance.now();

    const shakeObserver = this.scene.onBeforeRenderObservable.add(() => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / (duration * 1000);

      if (progress >= 1) {
        this.camera.radius = originalRadius;
        this.camera.heightOffset = originalHeight;
        this.scene.onBeforeRenderObservable.remove(shakeObserver);
        return;
      }

      const decay = 1 - progress;
      const shakeAmount = intensity * decay;

      this.camera.radius = originalRadius + (Math.random() - 0.5) * shakeAmount;
      this.camera.heightOffset = originalHeight + (Math.random() - 0.5) * shakeAmount * 0.5;
    });
  }

  public dispose(): void {
    this.camera.dispose();
  }
}
