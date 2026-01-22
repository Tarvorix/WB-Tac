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
  private targetVelocity: Vector3 = Vector3.Zero();  // What we're accelerating toward
  private rotationVelocity: number = 0;  // Current rotation speed
  private targetRotationVelocity: number = 0;  // Target rotation speed
  private currentRotation: number = 0;

  private isPerformingAction: boolean = false;

  // Trench parameters (must match Game.ts createTrench)
  private static readonly TRENCH_X = -20;
  private static readonly TRENCH_WIDTH = 3;
  private static readonly TRENCH_LENGTH = 20;
  private static readonly TRENCH_DEPTH = 1.5;
  private static readonly RAMP_LENGTH = 4;
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

    // ROTATION: movement.x controls turn speed (not accumulated position)
    const rotationInput = movement.x; // -1 for left, +1 for right
    if (Math.abs(rotationInput) > 0.1) {
      // Set TARGET rotation velocity - will be smoothly applied in update()
      this.targetRotationVelocity = rotationInput * GAME_CONSTANTS.CHARACTER_TURN_SPEED;
    } else {
      // No input = target zero rotation
      this.targetRotationVelocity = 0;
    }

    // FORWARD/BACKWARD: W/S (movement.y) moves in facing direction
    const forwardInput = movement.y; // +1 for W (forward), -1 for S (backward)

    if (Math.abs(forwardInput) > 0.1) {
      const speed = isSprinting
        ? this.stats.moveSpeed * this.stats.sprintMultiplier
        : this.stats.moveSpeed;

      // Set TARGET velocity in facing direction - will be smoothly applied in update()
      this.targetVelocity.x = Math.sin(this.currentRotation) * forwardInput * speed;
      this.targetVelocity.z = Math.cos(this.currentRotation) * forwardInput * speed;

      if (isSprinting && forwardInput > 0) {
        this.animationController.transition(AnimationState.RUN);
      } else {
        this.animationController.transition(AnimationState.WALK);
      }
    } else {
      // No input = target zero velocity
      this.targetVelocity.x = 0;
      this.targetVelocity.z = 0;

      // Check current velocity magnitude to determine animation
      const currentSpeed = Math.sqrt(this.currentVelocity.x * this.currentVelocity.x +
                                      this.currentVelocity.z * this.currentVelocity.z);
      if (currentSpeed < 0.5 && Math.abs(this.rotationVelocity) < 0.1) {
        this.animationController.transition(AnimationState.IDLE);
      }
    }
  }

  private performShoot(): void {
    this.isPerformingAction = true;
    this.currentVelocity.setAll(0);
    this.targetVelocity.setAll(0);

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
    this.targetVelocity.setAll(0);

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
      this.targetVelocity.setAll(0);
      this.animationController.transition(AnimationState.COVER);
    }
  }

  public update(deltaTime: number): void {
    if (!this.stats.isAlive) return;

    // === SMOOTH ROTATION ===
    // Lerp rotation velocity toward target with acceleration
    const rotationAccel = GAME_CONSTANTS.CHARACTER_ROTATION_ACCEL * deltaTime;
    if (Math.abs(this.targetRotationVelocity - this.rotationVelocity) < rotationAccel) {
      this.rotationVelocity = this.targetRotationVelocity;
    } else if (this.targetRotationVelocity > this.rotationVelocity) {
      this.rotationVelocity += rotationAccel;
    } else {
      this.rotationVelocity -= rotationAccel;
    }

    // Apply rotation
    this.currentRotation += this.rotationVelocity * deltaTime;
    this.currentRotation = Scalar.NormalizeRadians(this.currentRotation);
    this.rootNode.rotation.y = this.currentRotation;

    // === SMOOTH MOVEMENT ===
    if (!this.isPerformingAction && !this.stats.isInCover) {
      // Calculate whether we're accelerating or decelerating
      const targetSpeed = Math.sqrt(this.targetVelocity.x * this.targetVelocity.x +
                                     this.targetVelocity.z * this.targetVelocity.z);
      const currentSpeed = Math.sqrt(this.currentVelocity.x * this.currentVelocity.x +
                                      this.currentVelocity.z * this.currentVelocity.z);

      // Use faster deceleration when stopping, slower acceleration when starting
      const accelRate = targetSpeed > currentSpeed
        ? GAME_CONSTANTS.CHARACTER_ACCELERATION
        : GAME_CONSTANTS.CHARACTER_DECELERATION;

      // Lerp velocity components toward target
      const lerpFactor = Math.min(1, accelRate * deltaTime);
      this.currentVelocity.x = Scalar.Lerp(this.currentVelocity.x, this.targetVelocity.x, lerpFactor);
      this.currentVelocity.z = Scalar.Lerp(this.currentVelocity.z, this.targetVelocity.z, lerpFactor);

      // Snap to zero if very close (prevents tiny drift)
      if (Math.abs(this.currentVelocity.x) < 0.01) this.currentVelocity.x = 0;
      if (Math.abs(this.currentVelocity.z) < 0.01) this.currentVelocity.z = 0;

      // Apply movement
      const moveVector = this.currentVelocity.scale(deltaTime);

      if (this.collisionMesh && (moveVector.x !== 0 || moveVector.z !== 0)) {
        // Calculate current ground height
        const currentGroundY = this.getGroundHeight(this.rootNode.position.x, this.rootNode.position.z);

        // Sync collision mesh to character position
        this.collisionMesh.position.x = this.rootNode.position.x;
        this.collisionMesh.position.y = currentGroundY + 1.0;
        this.collisionMesh.position.z = this.rootNode.position.z;

        this.collisionMesh.moveWithCollisions(moveVector);

        // Clamp to ground bounds
        const halfGround = GAME_CONSTANTS.GROUND_SIZE / 2 - 1;
        let newX = Math.max(-halfGround, Math.min(halfGround, this.collisionMesh.position.x));
        let newZ = Math.max(-halfGround, Math.min(halfGround, this.collisionMesh.position.z));

        // Calculate ground height at new position
        const newGroundY = this.getGroundHeight(newX, newZ);

        // Reset collision mesh Y if it went too far from expected ground level
        const expectedY = newGroundY + 1.0;
        if (this.collisionMesh.position.y < expectedY - 0.5 || this.collisionMesh.position.y > expectedY + 1.0) {
          this.collisionMesh.position.y = expectedY;
        }

        this.rootNode.position.x = newX;
        this.rootNode.position.z = newZ;
        this.rootNode.position.y = newGroundY;
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
    this.rotationVelocity = 0;
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

  /**
   * Calculate the ground height at a given X,Z position, accounting for trench
   */
  private getGroundHeight(x: number, z: number): number {
    const trenchMinX = Character.TRENCH_X - Character.TRENCH_WIDTH / 2;
    const trenchMaxX = Character.TRENCH_X + Character.TRENCH_WIDTH / 2;
    const trenchMinZ = -Character.TRENCH_LENGTH / 2;
    const trenchMaxZ = Character.TRENCH_LENGTH / 2;
    const rampStartZ = trenchMaxZ;
    const rampEndZ = trenchMaxZ + Character.RAMP_LENGTH;

    // Check if in trench X bounds
    if (x >= trenchMinX && x <= trenchMaxX) {
      // Inside the main trench area
      if (z >= trenchMinZ && z <= trenchMaxZ) {
        return -Character.TRENCH_DEPTH;
      }
      // On the entry ramp (positive Z side)
      if (z > rampStartZ && z < rampEndZ) {
        // Linear interpolation from trench depth to ground level
        const rampProgress = (z - rampStartZ) / Character.RAMP_LENGTH;
        return -Character.TRENCH_DEPTH * (1 - rampProgress);
      }
    }

    // Default ground level
    return 0;
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
