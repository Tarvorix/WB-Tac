import {
  Scene,
  Vector3,
  Vector2,
  AbstractMesh,
  TransformNode,
  Mesh,
  MeshBuilder,
  Scalar
} from '@babylonjs/core';
import { AssetLoader } from '../core/AssetLoader';
import { CharacterAnimationController } from './CharacterAnimationController';
import { AnimationState } from '../types/AnimationTypes';
import { CharacterStats, createDefaultCharacterStats } from '../types/GameTypes';
import { GAME_CONSTANTS } from '../utils/Constants';
import { MuzzleFlash } from '../effects/MuzzleFlash';

export class Character {
  private _scene: Scene;
  private _assetLoader: AssetLoader;
  private name: string;

  private rootNode: TransformNode;
  private collisionMesh: Mesh | null = null;
  private animationController: CharacterAnimationController;
  private stats: CharacterStats;

  private currentVelocity: Vector3 = Vector3.Zero();
  private targetRotation: number = 0;
  private currentRotation: number = 0;

  private isPerformingAction: boolean = false;
  private meshes: AbstractMesh[] = [];
  private muzzleFlash: MuzzleFlash | null = null;

  constructor(scene: Scene, assetLoader: AssetLoader, name: string) {
    this._scene = scene;
    this._assetLoader = assetLoader;
    this.name = name;

    this.rootNode = new TransformNode(`${name}_root`, scene);
    this.animationController = new CharacterAnimationController(scene, assetLoader);
    this.stats = createDefaultCharacterStats();
  }

  public async initialize(): Promise<void> {
    const { rootMesh } = await this.animationController.initialize();

    if (rootMesh) {
      rootMesh.parent = this.rootNode;
      rootMesh.position = Vector3.Zero();

      this.collectMeshes(rootMesh);
    }

    this.setupCollisionMesh();
    this.muzzleFlash = new MuzzleFlash(this._scene, this.rootNode);
  }

  private setupCollisionMesh(): void {
    this.collisionMesh = MeshBuilder.CreateCapsule(
      `${this.name}_collision`,
      {
        height: 2.0,
        radius: 0.8
      },
      this._scene
    );

    this.collisionMesh.position = this.rootNode.position.clone();
    this.collisionMesh.position.y = 1.0;
    this.collisionMesh.isVisible = false;
    this.collisionMesh.isPickable = false;

    this.collisionMesh.checkCollisions = true;
    // Larger ellipsoid for better collision detection
    this.collisionMesh.ellipsoid = new Vector3(0.8, 1.0, 0.8);
    this.collisionMesh.ellipsoidOffset = new Vector3(0, 1.0, 0);
  }

  private collectMeshes(root: AbstractMesh): void {
    this.meshes = [root];
    const children = root.getChildMeshes();
    this.meshes.push(...children);
  }

  public handleInput(
    movement: Vector2,
    isSprinting: boolean,
    isShooting: boolean,
    isMelee: boolean,
    isCover: boolean
  ): void {
    if (!this.stats.isAlive) return;

    if (this.isPerformingAction) {
      return;
    }

    if (isShooting) {
      this.performShoot();
      return;
    }

    if (isMelee) {
      this.performMelee();
      return;
    }

    if (isCover) {
      this.toggleCover();
      return;
    }

    if (this.stats.isInCover) {
      return;
    }

    // ROTATION: A/D (movement.x) adjusts rotation - add to current, not set absolute
    const rotationInput = movement.x; // -1 for A (left), +1 for D (right)
    if (Math.abs(rotationInput) > 0.1) {
      const turnSpeed = GAME_CONSTANTS.CHARACTER_TURN_SPEED;
      // Approximate frame time for consistent turning (will be smoothed in update)
      this.targetRotation += rotationInput * turnSpeed * (1 / 60);
    }

    // FORWARD/BACKWARD: W/S (movement.y) moves in facing direction
    const forwardInput = movement.y; // +1 for W (forward), -1 for S (backward)

    if (Math.abs(forwardInput) > 0.1) {
      const speed = isSprinting
        ? this.stats.moveSpeed * this.stats.sprintMultiplier
        : this.stats.moveSpeed;

      // Move in the direction we're currently facing
      this.currentVelocity.x = Math.sin(this.currentRotation) * forwardInput * speed;
      this.currentVelocity.z = Math.cos(this.currentRotation) * forwardInput * speed;

      if (isSprinting && forwardInput > 0) {
        this.animationController.transition(AnimationState.RUN);
      } else {
        this.animationController.transition(AnimationState.WALK);
      }
    } else {
      this.currentVelocity.x = 0;
      this.currentVelocity.z = 0;

      // Only go to idle if not turning
      if (Math.abs(rotationInput) < 0.1) {
        this.animationController.transition(AnimationState.IDLE);
      }
    }
  }

  private performShoot(): void {
    this.isPerformingAction = true;
    this.currentVelocity.setAll(0);

    if (this.muzzleFlash) {
      this.muzzleFlash.trigger();
    }

    this.animationController.playOnce(AnimationState.SHOOT, () => {
      this.isPerformingAction = false;
    });
  }

  private performMelee(): void {
    this.isPerformingAction = true;
    this.currentVelocity.setAll(0);

    this.animationController.playOnce(AnimationState.MELEE, () => {
      this.isPerformingAction = false;
    });
  }

  private toggleCover(): void {
    if (this.stats.isInCover) {
      this.stats.isInCover = false;
      this.animationController.transition(AnimationState.IDLE);
    } else {
      this.stats.isInCover = true;
      this.currentVelocity.setAll(0);
      this.animationController.transition(AnimationState.COVER);
    }
  }

  public update(deltaTime: number): void {
    if (!this.stats.isAlive) return;

    // Use Babylon.js Scalar.LerpAngle for smooth rotation interpolation
    // This handles angle wrapping automatically and provides frame-rate independent smoothing
    const lerpFactor = Math.min(1, GAME_CONSTANTS.CHARACTER_ROTATION_SPEED * deltaTime);
    this.currentRotation = Scalar.LerpAngle(
      this.currentRotation,
      this.targetRotation,
      lerpFactor
    );
    // Normalize to keep angle in -PI to PI range
    this.currentRotation = Scalar.NormalizeRadians(this.currentRotation);

    this.rootNode.rotation.y = this.currentRotation;

    if (!this.isPerformingAction && !this.stats.isInCover) {
      const moveVector = this.currentVelocity.scale(deltaTime);

      if (this.collisionMesh && (moveVector.x !== 0 || moveVector.z !== 0)) {
        // Sync collision mesh to character position
        this.collisionMesh.position.x = this.rootNode.position.x;
        this.collisionMesh.position.y = 1.0;
        this.collisionMesh.position.z = this.rootNode.position.z;

        // Store position before collision check
        const beforeX = this.collisionMesh.position.x;
        const beforeZ = this.collisionMesh.position.z;

        this.collisionMesh.moveWithCollisions(moveVector);

        // Clamp to ground bounds
        const halfGround = GAME_CONSTANTS.GROUND_SIZE / 2 - 1;
        let newX = Math.max(-halfGround, Math.min(halfGround, this.collisionMesh.position.x));
        let newZ = Math.max(-halfGround, Math.min(halfGround, this.collisionMesh.position.z));

        // If collision pushed us too far (stuck inside), revert to before position
        const movedX = Math.abs(newX - beforeX);
        const movedZ = Math.abs(newZ - beforeZ);
        const expectedMove = Math.abs(moveVector.x) + Math.abs(moveVector.z);

        // If we moved much less than expected (blocked) or backwards, that's fine
        // But if Y changed drastically, we might be stuck - reset Y
        if (this.collisionMesh.position.y < 0.5 || this.collisionMesh.position.y > 2.0) {
          // Character got pushed underground or launched - reset to safe position
          this.collisionMesh.position.y = 1.0;
        }

        this.rootNode.position.x = newX;
        this.rootNode.position.z = newZ;
        this.rootNode.position.y = 0; // Keep character grounded
      }
    }

    this.animationController.update(deltaTime);
  }

  public setPosition(position: Vector3): void {
    this.rootNode.position = position.clone();
  }

  public getPosition(): Vector3 {
    return this.rootNode.position.clone();
  }

  public setRotation(rotation: number): void {
    this.currentRotation = rotation;
    this.targetRotation = rotation;
    this.rootNode.rotation.y = rotation;
  }

  public getRotation(): number {
    return this.currentRotation;
  }

  public getForwardDirection(): Vector3 {
    return new Vector3(
      Math.sin(this.currentRotation),
      0,
      Math.cos(this.currentRotation)
    );
  }

  public getRootMesh(): AbstractMesh | null {
    return this.animationController.getRootMesh();
  }

  public getRootNode(): TransformNode {
    return this.rootNode;
  }

  public getAllMeshes(): AbstractMesh[] {
    return this.meshes;
  }

  public getStats(): CharacterStats {
    return { ...this.stats };
  }

  public takeDamage(amount: number): void {
    if (!this.stats.isAlive) return;

    this.stats.health = Math.max(0, this.stats.health - amount);

    if (this.stats.health <= 0) {
      this.die();
    }
  }

  public heal(amount: number): void {
    if (!this.stats.isAlive) return;

    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount);
  }

  private die(): void {
    this.stats.isAlive = false;
    this.stats.isInCover = false;
    this.currentVelocity.setAll(0);
    this.isPerformingAction = true;

    this.animationController.playOnce(AnimationState.DEATH);
  }

  public isAlive(): boolean {
    return this.stats.isAlive;
  }

  public isInCover(): boolean {
    return this.stats.isInCover;
  }

  public getName(): string {
    return this.name;
  }

  public getCollisionMesh(): Mesh | null {
    return this.collisionMesh;
  }

  public dispose(): void {
    if (this.collisionMesh) {
      this.collisionMesh.dispose();
    }
    if (this.muzzleFlash) {
      this.muzzleFlash.dispose();
    }
    this.animationController.dispose();
    this.rootNode.dispose();
    this.meshes = [];
  }
}
