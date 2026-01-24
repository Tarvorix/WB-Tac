import {
  Scene,
  Vector3,
  AbstractMesh,
  TransformNode,
  Mesh,
  MeshBuilder,
  Scalar
} from '@babylonjs/core';
import { AssetLoader } from '../core/AssetLoader';
import { GAME_CONSTANTS } from '../utils/Constants';

export interface UnitStats {
  health: number;
  maxHealth: number;
  moveSpeed: number;
  sprintMultiplier: number;
  isAlive: boolean;
  isInCover: boolean;
}

export function createDefaultUnitStats(): UnitStats {
  return {
    health: 100,
    maxHealth: 100,
    moveSpeed: 5,
    sprintMultiplier: 1.8,
    isAlive: true,
    isInCover: false
  };
}

/**
 * Abstract base class for all game units (squad members, enemies, etc.)
 * Provides common functionality for position, health, collision, and rendering.
 */
export abstract class Unit {
  protected scene: Scene;
  protected assetLoader: AssetLoader;
  protected name: string;

  protected rootNode: TransformNode;
  protected collisionMesh: Mesh | null = null;
  protected meshes: AbstractMesh[] = [];
  protected stats: UnitStats;

  // Movement state
  protected currentVelocity: Vector3 = Vector3.Zero();
  protected targetVelocity: Vector3 = Vector3.Zero();
  protected rotationVelocity: number = 0;
  protected targetRotationVelocity: number = 0;
  protected currentRotation: number = 0;

  // Trench parameters (must match Game.ts createTrench)
  protected static readonly TRENCH_X = -20;
  protected static readonly TRENCH_WIDTH = 3;
  protected static readonly TRENCH_LENGTH = 20;
  protected static readonly TRENCH_DEPTH = 1.5;
  protected static readonly RAMP_LENGTH = 4;

  constructor(scene: Scene, assetLoader: AssetLoader, name: string) {
    this.scene = scene;
    this.assetLoader = assetLoader;
    this.name = name;
    this.rootNode = new TransformNode(`${name}_root`, scene);
    this.stats = createDefaultUnitStats();
  }

  /**
   * Initialize the unit - must be implemented by subclasses
   */
  public abstract initialize(): Promise<void>;

  /**
   * Update the unit each frame - must be implemented by subclasses
   */
  public abstract update(deltaTime: number): void;

  /**
   * Set up the collision capsule mesh
   */
  protected setupCollisionMesh(height: number = 2.0, radius: number = 0.8): void {
    this.collisionMesh = MeshBuilder.CreateCapsule(
      `${this.name}_collision`,
      { height, radius },
      this.scene
    );

    this.collisionMesh.position = this.rootNode.position.clone();
    this.collisionMesh.position.y = height / 2;
    this.collisionMesh.isVisible = false;
    this.collisionMesh.isPickable = false;

    this.collisionMesh.checkCollisions = true;
    this.collisionMesh.ellipsoid = new Vector3(radius, height / 2, radius);
    this.collisionMesh.ellipsoidOffset = new Vector3(0, height / 2, 0);
  }

  /**
   * Collect all meshes from a root mesh for shadow casting etc.
   */
  protected collectMeshes(root: AbstractMesh): void {
    this.meshes = [root];
    const children = root.getChildMeshes();
    this.meshes.push(...children);
  }

  /**
   * Apply smooth rotation based on target rotation velocity
   */
  protected applyRotation(deltaTime: number): void {
    const rotationAccel = GAME_CONSTANTS.CHARACTER_ROTATION_ACCEL * deltaTime;

    if (Math.abs(this.targetRotationVelocity - this.rotationVelocity) < rotationAccel) {
      this.rotationVelocity = this.targetRotationVelocity;
    } else if (this.targetRotationVelocity > this.rotationVelocity) {
      this.rotationVelocity += rotationAccel;
    } else {
      this.rotationVelocity -= rotationAccel;
    }

    this.currentRotation += this.rotationVelocity * deltaTime;
    this.currentRotation = Scalar.NormalizeRadians(this.currentRotation);
    this.rootNode.rotation.y = this.currentRotation;
  }

  /**
   * Apply smooth movement with acceleration/deceleration
   */
  protected applyMovement(deltaTime: number): void {
    const targetSpeed = Math.sqrt(
      this.targetVelocity.x * this.targetVelocity.x +
      this.targetVelocity.z * this.targetVelocity.z
    );
    const currentSpeed = Math.sqrt(
      this.currentVelocity.x * this.currentVelocity.x +
      this.currentVelocity.z * this.currentVelocity.z
    );

    const accelRate = targetSpeed > currentSpeed
      ? GAME_CONSTANTS.CHARACTER_ACCELERATION
      : GAME_CONSTANTS.CHARACTER_DECELERATION;

    const lerpFactor = Math.min(1, accelRate * deltaTime);
    this.currentVelocity.x = Scalar.Lerp(this.currentVelocity.x, this.targetVelocity.x, lerpFactor);
    this.currentVelocity.z = Scalar.Lerp(this.currentVelocity.z, this.targetVelocity.z, lerpFactor);

    if (Math.abs(this.currentVelocity.x) < 0.01) this.currentVelocity.x = 0;
    if (Math.abs(this.currentVelocity.z) < 0.01) this.currentVelocity.z = 0;

    const moveVector = this.currentVelocity.scale(deltaTime);

    if (this.collisionMesh && (moveVector.x !== 0 || moveVector.z !== 0)) {
      const currentGroundY = this.getGroundHeight(this.rootNode.position.x, this.rootNode.position.z);

      this.collisionMesh.position.x = this.rootNode.position.x;
      this.collisionMesh.position.y = currentGroundY + 1.0;
      this.collisionMesh.position.z = this.rootNode.position.z;

      this.collisionMesh.moveWithCollisions(moveVector);

      const halfGround = GAME_CONSTANTS.GROUND_SIZE / 2 - 1;
      const newX = Math.max(-halfGround, Math.min(halfGround, this.collisionMesh.position.x));
      const newZ = Math.max(-halfGround, Math.min(halfGround, this.collisionMesh.position.z));

      const newGroundY = this.getGroundHeight(newX, newZ);
      const expectedY = newGroundY + 1.0;

      if (this.collisionMesh.position.y < expectedY - 0.5 || this.collisionMesh.position.y > expectedY + 1.0) {
        this.collisionMesh.position.y = expectedY;
      }

      this.rootNode.position.x = newX;
      this.rootNode.position.z = newZ;
      this.rootNode.position.y = newGroundY;
    }
  }

  /**
   * Calculate the ground height at a given X,Z position.
   */
  protected getGroundHeight(_x: number, _z: number): number {
    return 0;
  }

  // === Position/Rotation Getters and Setters ===

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

  // === Health System ===

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

  protected abstract die(): void;

  // === Getters ===

  public isAlive(): boolean {
    return this.stats.isAlive;
  }

  public isInCover(): boolean {
    return this.stats.isInCover;
  }

  public getHealth(): number {
    return this.stats.health;
  }

  public getMaxHealth(): number {
    return this.stats.maxHealth;
  }

  public getHealthPercent(): number {
    return this.stats.health / this.stats.maxHealth;
  }

  public getStats(): UnitStats {
    return { ...this.stats };
  }

  public getName(): string {
    return this.name;
  }

  public getRootNode(): TransformNode {
    return this.rootNode;
  }

  public getCollisionMesh(): Mesh | null {
    return this.collisionMesh;
  }

  public getAllMeshes(): AbstractMesh[] {
    return this.meshes;
  }

  public abstract getRootMesh(): AbstractMesh | null;

  // === Cleanup ===

  public dispose(): void {
    if (this.collisionMesh) {
      this.collisionMesh.dispose();
    }
    this.rootNode.dispose();
    this.meshes = [];
  }
}
