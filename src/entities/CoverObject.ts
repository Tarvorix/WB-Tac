import {
  Scene,
  Vector3,
  AbstractMesh,
  BoundingInfo,
  MeshBuilder,
  Mesh
} from '@babylonjs/core';
import { AssetLoader } from '../core/AssetLoader';
import { CoverConfig, CoverLevel } from '../types/GameTypes';
import { GAME_CONSTANTS } from '../utils/Constants';

export class CoverObject {
  private _scene: Scene;
  private meshes: AbstractMesh[] = [];
  private rootMesh: AbstractMesh | null = null;
  private collisionMesh: Mesh | null = null;
  private config: CoverConfig;
  private name: string;
  private boundingInfo: BoundingInfo | null = null;

  constructor(
    scene: Scene,
    assetLoader: AssetLoader,
    assetPath: string,
    name: string,
    config: CoverConfig
  ) {
    this._scene = scene;
    this.name = name;
    this.config = config;

    this.createFromAsset(assetLoader, assetPath);
  }

  private createFromAsset(assetLoader: AssetLoader, assetPath: string): void {
    const instances = assetLoader.instantiateFromContainer(assetPath, this.name);

    if (instances && instances.length > 0) {
      this.rootMesh = instances[0];

      const scale = this.config.scale
        ? this.config.scale.clone()
        : new Vector3(
            GAME_CONSTANTS.CARGO_CONTAINER_SCALE,
            GAME_CONSTANTS.CARGO_CONTAINER_SCALE,
            GAME_CONSTANTS.CARGO_CONTAINER_SCALE
          );
      this.rootMesh.scaling = scale;

      this.rootMesh.rotation.y = this.config.rotation;

      this.meshes = [this.rootMesh, ...this.rootMesh.getChildMeshes()];

      this.rootMesh.position = new Vector3(0, 0, 0);
      this.rootMesh.computeWorldMatrix(true);
      for (const mesh of this.meshes) {
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo({});
      }

      let globalMinY = Infinity;
      let globalMaxY = -Infinity;

      for (const mesh of this.meshes) {
        const bounds = mesh.getBoundingInfo();
        if (bounds && bounds.boundingBox) {
          const minWorld = bounds.boundingBox.minimumWorld;
          const maxWorld = bounds.boundingBox.maximumWorld;

          if (minWorld.y < globalMinY) {
            globalMinY = minWorld.y;
          }
          if (maxWorld.y > globalMaxY) {
            globalMaxY = maxWorld.y;
          }
        }
      }

      const meshHeight = globalMaxY - globalMinY;
      const yOffset = -globalMinY;

      const adjustedPosition = this.config.position.clone();
      adjustedPosition.y = this.config.position.y + yOffset;
      this.rootMesh.position = adjustedPosition;

      this.rootMesh.computeWorldMatrix(true);
      for (const mesh of this.meshes) {
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo({});
      }

      for (const mesh of this.meshes) {
        mesh.isPickable = true;
        // Don't use complex mesh geometry for collision - we'll create a simple box
        mesh.checkCollisions = false;

        mesh.metadata = {
          isCover: true,
          coverObject: this,
          coverLevel: this.config.coverLevel,
          meshHeight: meshHeight
        };
      }

      this.calculateBoundingInfo();

      // Create a simple box collision mesh instead of using complex geometry
      this.createCollisionMesh();
    }
  }

  private calculateBoundingInfo(): void {
    if (!this.rootMesh) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const mesh of this.meshes) {
      const bounds = mesh.getBoundingInfo();
      const worldMatrix = mesh.getWorldMatrix();

      const min = Vector3.TransformCoordinates(bounds.boundingBox.minimumWorld, worldMatrix);
      const max = Vector3.TransformCoordinates(bounds.boundingBox.maximumWorld, worldMatrix);

      minX = Math.min(minX, min.x, max.x);
      minY = Math.min(minY, min.y, max.y);
      minZ = Math.min(minZ, min.z, max.z);
      maxX = Math.max(maxX, min.x, max.x);
      maxY = Math.max(maxY, min.y, max.y);
      maxZ = Math.max(maxZ, min.z, max.z);
    }

    const minimum = new Vector3(minX, minY, minZ);
    const maximum = new Vector3(maxX, maxY, maxZ);

    this.boundingInfo = new BoundingInfo(minimum, maximum);
  }

  /**
   * Creates a simple invisible box collision mesh based on bounding info.
   * This prevents the player from getting stuck in complex mesh geometry.
   */
  private createCollisionMesh(): void {
    if (!this.boundingInfo) return;

    const min = this.boundingInfo.boundingBox.minimumWorld;
    const max = this.boundingInfo.boundingBox.maximumWorld;

    // Calculate box dimensions with a small margin to prevent clipping
    const margin = 0.1;
    const width = (max.x - min.x) + margin * 2;
    const height = (max.y - min.y) + margin * 2;
    const depth = (max.z - min.z) + margin * 2;

    // Create the collision box
    this.collisionMesh = MeshBuilder.CreateBox(
      `${this.name}_collision`,
      { width, height, depth },
      this._scene
    );

    // Position at center of bounding box
    this.collisionMesh.position = new Vector3(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2
    );

    // Make invisible but enable collision
    this.collisionMesh.isVisible = false;
    this.collisionMesh.isPickable = false;
    this.collisionMesh.checkCollisions = true;

    // Copy metadata for cover system
    this.collisionMesh.metadata = {
      isCover: true,
      coverObject: this,
      coverLevel: this.config.coverLevel
    };
  }

  public getPosition(): Vector3 {
    return this.config.position.clone();
  }

  public setPosition(position: Vector3): void {
    this.config.position = position.clone();
    if (this.rootMesh) {
      this.rootMesh.position = position;
      this.calculateBoundingInfo();
      this.updateCollisionMesh();
    }
  }

  /**
   * Updates the collision mesh position/size after the visual mesh moves
   */
  private updateCollisionMesh(): void {
    if (!this.collisionMesh || !this.boundingInfo) return;

    const min = this.boundingInfo.boundingBox.minimumWorld;
    const max = this.boundingInfo.boundingBox.maximumWorld;

    // Reposition collision mesh to center of bounding box
    this.collisionMesh.position = new Vector3(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2
    );
  }

  public getRotation(): number {
    return this.config.rotation;
  }

  public setRotation(rotation: number): void {
    this.config.rotation = rotation;
    if (this.rootMesh) {
      this.rootMesh.rotation.y = rotation;
      // Recompute world matrices after rotation
      this.rootMesh.computeWorldMatrix(true);
      for (const mesh of this.meshes) {
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo({});
      }
      this.calculateBoundingInfo();
      this.recreateCollisionMesh();
    }
  }

  /**
   * Recreates the collision mesh after rotation (since box dimensions change with rotation)
   */
  private recreateCollisionMesh(): void {
    if (this.collisionMesh) {
      this.collisionMesh.dispose();
      this.collisionMesh = null;
    }
    this.createCollisionMesh();
  }

  public getCoverLevel(): CoverLevel {
    return this.config.coverLevel;
  }

  public getBoundingInfo(): BoundingInfo | null {
    return this.boundingInfo;
  }

  public getMeshes(): AbstractMesh[] {
    return this.meshes;
  }

  public getRootMesh(): AbstractMesh | null {
    return this.rootMesh;
  }

  public getName(): string {
    return this.name;
  }

  public containsPoint(point: Vector3, margin: number = 0): boolean {
    if (!this.boundingInfo) return false;

    const min = this.boundingInfo.boundingBox.minimumWorld;
    const max = this.boundingInfo.boundingBox.maximumWorld;

    return (
      point.x >= min.x - margin && point.x <= max.x + margin &&
      point.y >= min.y - margin && point.y <= max.y + margin &&
      point.z >= min.z - margin && point.z <= max.z + margin
    );
  }

  public getClosestPointOnSurface(point: Vector3): Vector3 {
    if (!this.boundingInfo) return this.config.position.clone();

    const min = this.boundingInfo.boundingBox.minimumWorld;
    const max = this.boundingInfo.boundingBox.maximumWorld;

    return new Vector3(
      Math.max(min.x, Math.min(max.x, point.x)),
      Math.max(min.y, Math.min(max.y, point.y)),
      Math.max(min.z, Math.min(max.z, point.z))
    );
  }

  public setVisible(visible: boolean): void {
    for (const mesh of this.meshes) {
      mesh.isVisible = visible;
    }
  }

  public setPickable(pickable: boolean): void {
    for (const mesh of this.meshes) {
      mesh.isPickable = pickable;
    }
  }

  public dispose(): void {
    if (this.collisionMesh) {
      this.collisionMesh.dispose();
      this.collisionMesh = null;
    }
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    this.meshes = [];
    this.rootMesh = null;
    this.boundingInfo = null;
  }
}
