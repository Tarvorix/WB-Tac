import {
  Scene,
  AssetContainer,
  AbstractMesh,
  AnimationGroup,
  Skeleton
} from '@babylonjs/core';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic';

export interface LoadedCharacterAssets {
  meshes: AbstractMesh[];
  rootMesh: AbstractMesh;
  animationGroups: AnimationGroup[];
  skeletons: Skeleton[];
}

export interface LoadProgress {
  loaded: number;
  total: number;
  percentage: number;
  currentAsset: string;
}

export type ProgressCallback = (progress: LoadProgress) => void;

export class AssetLoader {
  private scene: Scene;
  private cache: Map<string, AssetContainer> = new Map();
  private loadersRegistered: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private async ensureLoadersRegistered(): Promise<void> {
    if (!this.loadersRegistered) {
      await registerBuiltInLoaders();
      this.loadersRegistered = true;
    }
  }

  public async loadAssetContainer(path: string): Promise<AssetContainer> {
    await this.ensureLoadersRegistered();

    if (this.cache.has(path)) {
      return this.cache.get(path)!;
    }

    const { loadAssetContainerAsync } = await import('@babylonjs/core/Loading/sceneLoader');

    const container = await loadAssetContainerAsync(path, this.scene);

    this.cache.set(path, container);

    return container;
  }

  public async loadCharacterWithAnimation(glbPath: string): Promise<LoadedCharacterAssets> {
    const container = await this.loadAssetContainer(glbPath);

    container.addAllToScene();

    const rootMesh = container.meshes[0];
    if (!rootMesh) {
      throw new Error(`No meshes found in ${glbPath}`);
    }

    return {
      meshes: container.meshes,
      rootMesh,
      animationGroups: container.animationGroups,
      skeletons: container.skeletons
    };
  }

  public async loadAnimationOnly(glbPath: string): Promise<AnimationGroup[]> {
    const container = await this.loadAssetContainer(glbPath);

    return container.animationGroups;
  }

  public async loadEnvironmentMesh(glbPath: string): Promise<AbstractMesh[]> {
    const container = await this.loadAssetContainer(glbPath);

    container.addAllToScene();

    return container.meshes;
  }

  public instantiateFromContainer(containerPath: string, name: string): AbstractMesh[] | null {
    const container = this.cache.get(containerPath);
    if (!container) {
      console.error(`Container not found in cache: ${containerPath}`);
      return null;
    }

    const instances = container.instantiateModelsToScene(
      (sourceName) => `${name}_${sourceName}`,
      false
    );

    return instances.rootNodes as AbstractMesh[];
  }

  /**
   * Instantiate a character from a cached container with unique meshes, skeleton, and animations.
   * This is used for creating multiple instances of the same character model (e.g., squad members).
   */
  public instantiateCharacter(containerPath: string, instanceName: string): LoadedCharacterAssets | null {
    const container = this.cache.get(containerPath);
    if (!container) {
      console.error(`Container not found in cache: ${containerPath}`);
      return null;
    }

    const instances = container.instantiateModelsToScene(
      (sourceName) => `${instanceName}_${sourceName}`,
      false
    );

    if (!instances.rootNodes || instances.rootNodes.length === 0) {
      console.error(`No root nodes created for ${instanceName}`);
      return null;
    }

    const rootMesh = instances.rootNodes[0] as AbstractMesh;

    // Get all child meshes from the root
    const meshes: AbstractMesh[] = [rootMesh, ...rootMesh.getChildMeshes()];

    return {
      meshes,
      rootMesh,
      animationGroups: instances.animationGroups || [],
      skeletons: instances.skeletons || []
    };
  }

  public async loadMultipleAssets(
    paths: string[],
    onProgress?: ProgressCallback
  ): Promise<Map<string, AssetContainer>> {
    const results = new Map<string, AssetContainer>();
    const total = paths.length;

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];

      if (onProgress) {
        onProgress({
          loaded: i,
          total,
          percentage: (i / total) * 100,
          currentAsset: path
        });
      }

      const container = await this.loadAssetContainer(path);
      results.set(path, container);
    }

    if (onProgress) {
      onProgress({
        loaded: total,
        total,
        percentage: 100,
        currentAsset: 'Complete'
      });
    }

    return results;
  }

  public getFromCache(path: string): AssetContainer | undefined {
    return this.cache.get(path);
  }

  public isInCache(path: string): boolean {
    return this.cache.has(path);
  }

  public clearCache(): void {
    for (const container of this.cache.values()) {
      container.dispose();
    }
    this.cache.clear();
  }

  public removeFromCache(path: string): void {
    const container = this.cache.get(path);
    if (container) {
      container.dispose();
      this.cache.delete(path);
    }
  }

  public dispose(): void {
    this.clearCache();
  }
}
