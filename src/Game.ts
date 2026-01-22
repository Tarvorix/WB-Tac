import {
  Scene,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  ShadowGenerator,
  Texture
} from '@babylonjs/core';
import { EngineWrapper } from './core/Engine';
import { AssetLoader, LoadProgress } from './core/AssetLoader';
import { CameraSystem } from './systems/CameraSystem';
import { InputManager } from './input/InputManager';
import { Character } from './entities/Character';
import { CoverSystem } from './systems/CoverSystem';
import { CoverObject } from './entities/CoverObject';
import { GAME_CONSTANTS, ASSET_PATHS, COLORS } from './utils/Constants';
import { CoverLevel } from './types/GameTypes';

export class Game {
  private engineWrapper: EngineWrapper;
  private scene: Scene;
  private assetLoader: AssetLoader;
  private cameraSystem: CameraSystem | null = null;
  private inputManager: InputManager | null = null;
  private player: Character | null = null;
  private coverSystem: CoverSystem | null = null;
  private shadowGenerator: ShadowGenerator | null = null;

  private isRunning: boolean = false;
  private lastTime: number = 0;

  private progressCallbacks: ((progress: LoadProgress) => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.engineWrapper = new EngineWrapper(canvas, {
      antialias: true,
      stencil: true
    });

    this.scene = this.engineWrapper.createScene();
    this.assetLoader = new AssetLoader(this.scene);
  }

  public onLoadProgress(callback: (progress: LoadProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  private reportProgress(progress: LoadProgress): void {
    for (const callback of this.progressCallbacks) {
      callback(progress);
    }
  }

  public async initialize(): Promise<void> {
    this.setupScene();
    this.setupLighting();
    this.createGround();

    await this.loadAssets();

    await this.createPlayer();
    this.setupCamera();
    this.setupInput();
    this.setupCover();

    this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  private setupScene(): void {
    this.scene.clearColor = new Color4(0.53, 0.81, 0.92, 1);

    this.scene.collisionsEnabled = true;
    this.scene.gravity = new Vector3(0, -9.81, 0);
  }

  private setupLighting(): void {
    const hemisphericLight = new HemisphericLight(
      'hemisphericLight',
      new Vector3(0, 1, 0),
      this.scene
    );
    hemisphericLight.intensity = 0.6;
    hemisphericLight.groundColor = new Color3(0.2, 0.2, 0.3);

    const directionalLight = new DirectionalLight(
      'directionalLight',
      new Vector3(-1, -2, -1),
      this.scene
    );
    directionalLight.position = new Vector3(20, 40, 20);
    directionalLight.intensity = 0.8;

    this.shadowGenerator = new ShadowGenerator(1024, directionalLight);
    this.shadowGenerator.useBlurExponentialShadowMap = true;
    this.shadowGenerator.blurKernel = 32;
  }

  private createGround(): void {
    const ground = MeshBuilder.CreateGround(
      'ground',
      {
        width: GAME_CONSTANTS.GROUND_SIZE,
        height: GAME_CONSTANTS.GROUND_SIZE,
        subdivisions: GAME_CONSTANTS.GROUND_SUBDIVISIONS
      },
      this.scene
    );

    const groundMaterial = new StandardMaterial('groundMaterial', this.scene);

    // Load moon texture
    const diffuseTexture = new Texture('textures/moon/diffuse.jpg', this.scene);
    diffuseTexture.uScale = 10;
    diffuseTexture.vScale = 10;
    groundMaterial.diffuseTexture = diffuseTexture;

    groundMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
    ground.material = groundMaterial;

    ground.receiveShadows = true;
    ground.checkCollisions = true;
  }

  private async loadAssets(): Promise<void> {
    const assetsToLoad = [
      ASSET_PATHS.CHARACTER_IDLE,
      ASSET_PATHS.CHARACTER_WALK,
      ASSET_PATHS.CHARACTER_RUN,
      ASSET_PATHS.CHARACTER_SHOOT,
      ASSET_PATHS.CHARACTER_COVER,
      ASSET_PATHS.CHARACTER_MELEE,
      ASSET_PATHS.CHARACTER_DEATH,
      ASSET_PATHS.CARGO_CONTAINER
    ];

    await this.assetLoader.loadMultipleAssets(assetsToLoad, (progress) => {
      this.reportProgress(progress);
    });
  }

  private async createPlayer(): Promise<void> {
    this.player = new Character(this.scene, this.assetLoader, 'player');
    await this.player.initialize();

    this.player.setPosition(new Vector3(0, 0, 0));

    if (this.shadowGenerator && this.player.getRootMesh()) {
      const meshes = this.player.getAllMeshes();
      for (const mesh of meshes) {
        this.shadowGenerator.addShadowCaster(mesh);
      }
    }
  }

  private setupCamera(): void {
    if (!this.player) return;

    this.cameraSystem = new CameraSystem(
      this.scene,
      this.engineWrapper.getCanvas()
    );

    const playerRoot = this.player.getRootMesh();
    if (playerRoot) {
      this.cameraSystem.setTarget(playerRoot);
    }
  }

  private setupInput(): void {
    this.inputManager = new InputManager(
      this.scene,
      this.engineWrapper.getCanvas(),
      this.engineWrapper.getDeviceInfo()
    );
  }

  private setupCover(): void {
    this.coverSystem = new CoverSystem(this.scene);

    const containerMeshes = this.assetLoader.getFromCache(ASSET_PATHS.CARGO_CONTAINER);
    if (!containerMeshes) {
      console.warn('Cargo container not loaded');
      return;
    }

    const coverPositions = [
      { position: new Vector3(10, 0, 10), rotation: 0 },
      { position: new Vector3(-10, 0, 10), rotation: Math.PI / 4 },
      { position: new Vector3(10, 0, -10), rotation: Math.PI / 2 },
      { position: new Vector3(-10, 0, -10), rotation: -Math.PI / 4 },
      { position: new Vector3(0, 0, 15), rotation: 0 },
      { position: new Vector3(15, 0, 0), rotation: Math.PI / 2 }
    ];

    for (let i = 0; i < coverPositions.length; i++) {
      const pos = coverPositions[i];
      const coverObject = new CoverObject(
        this.scene,
        this.assetLoader,
        ASSET_PATHS.CARGO_CONTAINER,
        `cover_${i}`,
        {
          position: pos.position,
          rotation: pos.rotation,
          coverLevel: CoverLevel.FULL
        }
      );

      if (this.shadowGenerator) {
        const meshes = coverObject.getMeshes();
        for (const mesh of meshes) {
          this.shadowGenerator.addShadowCaster(mesh);
          mesh.receiveShadows = true;
        }
      }

      this.coverSystem.addCoverObject(coverObject);
    }
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();

    this.engineWrapper.runRenderLoop(() => {
      this.scene.render();
    });
  }

  public stop(): void {
    this.isRunning = false;
    this.engineWrapper.stopRenderLoop();
  }

  private update(): void {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    if (this.inputManager && this.player) {
      const movement = this.inputManager.getMovementVector();
      const isSprinting = this.inputManager.isActionPressed('sprint');
      const isShooting = this.inputManager.isActionJustPressed('shoot');
      const isMelee = this.inputManager.isActionJustPressed('melee');
      const isCover = this.inputManager.isActionJustPressed('cover');

      this.player.handleInput(movement, isSprinting, isShooting, isMelee, isCover);
      this.player.update(deltaTime);

      this.inputManager.clearJustPressed();
    }

    if (this.cameraSystem) {
      this.cameraSystem.update(deltaTime);
    }
  }

  public getScene(): Scene {
    return this.scene;
  }

  public getPlayer(): Character | null {
    return this.player;
  }

  public getCoverSystem(): CoverSystem | null {
    return this.coverSystem;
  }

  public dispose(): void {
    this.stop();

    if (this.player) {
      this.player.dispose();
    }

    if (this.coverSystem) {
      this.coverSystem.dispose();
    }

    if (this.inputManager) {
      this.inputManager.dispose();
    }

    this.assetLoader.dispose();
    this.scene.dispose();
    this.engineWrapper.dispose();
  }
}
