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
    this.createTrench();
    this.createRoom();

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

  private createTrench(): void {
    // Create a trench in one area of the map (negative X side)
    // Trench dimensions: 15 units long, 3 units wide, 1.5 units deep
    const trenchLength = 15;
    const trenchWidth = 3;
    const trenchDepth = 1.5;
    const trenchPosition = new Vector3(-20, 0, 0);

    // Create trench floor (lowered ground)
    const trenchFloor = MeshBuilder.CreateGround(
      'trenchFloor',
      {
        width: trenchWidth,
        height: trenchLength,
        subdivisions: 1
      },
      this.scene
    );
    trenchFloor.position = new Vector3(
      trenchPosition.x,
      -trenchDepth,
      trenchPosition.z
    );

    const trenchFloorMaterial = new StandardMaterial('trenchFloorMaterial', this.scene);
    trenchFloorMaterial.diffuseColor = new Color3(0.15, 0.1, 0.08); // Dark brown/dirt
    trenchFloorMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
    trenchFloor.material = trenchFloorMaterial;
    trenchFloor.receiveShadows = true;
    trenchFloor.checkCollisions = true;

    // Create trench walls (left and right sides)
    const wallThickness = 0.3;

    // Left trench wall
    const leftWall = MeshBuilder.CreateBox(
      'trenchLeftWall',
      {
        width: wallThickness,
        height: trenchDepth,
        depth: trenchLength
      },
      this.scene
    );
    leftWall.position = new Vector3(
      trenchPosition.x - trenchWidth / 2 - wallThickness / 2,
      -trenchDepth / 2,
      trenchPosition.z
    );

    // Right trench wall
    const rightWall = MeshBuilder.CreateBox(
      'trenchRightWall',
      {
        width: wallThickness,
        height: trenchDepth,
        depth: trenchLength
      },
      this.scene
    );
    rightWall.position = new Vector3(
      trenchPosition.x + trenchWidth / 2 + wallThickness / 2,
      -trenchDepth / 2,
      trenchPosition.z
    );

    // Trench wall material (earth/dirt)
    const trenchWallMaterial = new StandardMaterial('trenchWallMaterial', this.scene);
    trenchWallMaterial.diffuseColor = new Color3(0.25, 0.18, 0.12); // Brown earth
    trenchWallMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

    leftWall.material = trenchWallMaterial;
    rightWall.material = trenchWallMaterial;

    leftWall.receiveShadows = true;
    rightWall.receiveShadows = true;
    leftWall.checkCollisions = true;
    rightWall.checkCollisions = true;

    // Add trench walls to shadow casters
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(leftWall);
      this.shadowGenerator.addShadowCaster(rightWall);
    }

    // Create ramp to enter trench at one end
    const rampLength = 4;
    const ramp = MeshBuilder.CreateBox(
      'trenchRamp',
      {
        width: trenchWidth,
        height: 0.1,
        depth: rampLength
      },
      this.scene
    );
    ramp.position = new Vector3(
      trenchPosition.x,
      -trenchDepth / 2,
      trenchPosition.z + trenchLength / 2 + rampLength / 2 - 0.5
    );
    ramp.rotation.x = Math.atan(trenchDepth / rampLength);
    ramp.material = trenchWallMaterial;
    ramp.receiveShadows = true;
    ramp.checkCollisions = true;
  }

  private createRoom(): void {
    // Create a room with walls in another area of the map (positive X, negative Z)
    // Room dimensions: 8x8 units, 3 units high, with one doorway
    const roomSize = 8;
    const wallHeight = 3;
    const wallThickness = 0.4;
    const roomPosition = new Vector3(20, 0, -15);
    const doorWidth = 2;

    // Wall material
    const wallMaterial = new StandardMaterial('roomWallMaterial', this.scene);
    wallMaterial.diffuseColor = new Color3(0.5, 0.5, 0.55); // Gray concrete
    wallMaterial.specularColor = new Color3(0.2, 0.2, 0.2);

    // North wall (full wall)
    const northWall = MeshBuilder.CreateBox(
      'roomNorthWall',
      {
        width: roomSize,
        height: wallHeight,
        depth: wallThickness
      },
      this.scene
    );
    northWall.position = new Vector3(
      roomPosition.x,
      wallHeight / 2,
      roomPosition.z + roomSize / 2
    );
    northWall.material = wallMaterial;
    northWall.receiveShadows = true;
    northWall.checkCollisions = true;

    // South wall (with doorway - split into two sections)
    const southWallLeftWidth = (roomSize - doorWidth) / 2;
    const southWallLeft = MeshBuilder.CreateBox(
      'roomSouthWallLeft',
      {
        width: southWallLeftWidth,
        height: wallHeight,
        depth: wallThickness
      },
      this.scene
    );
    southWallLeft.position = new Vector3(
      roomPosition.x - roomSize / 2 + southWallLeftWidth / 2,
      wallHeight / 2,
      roomPosition.z - roomSize / 2
    );
    southWallLeft.material = wallMaterial;
    southWallLeft.receiveShadows = true;
    southWallLeft.checkCollisions = true;

    const southWallRight = MeshBuilder.CreateBox(
      'roomSouthWallRight',
      {
        width: southWallLeftWidth,
        height: wallHeight,
        depth: wallThickness
      },
      this.scene
    );
    southWallRight.position = new Vector3(
      roomPosition.x + roomSize / 2 - southWallLeftWidth / 2,
      wallHeight / 2,
      roomPosition.z - roomSize / 2
    );
    southWallRight.material = wallMaterial;
    southWallRight.receiveShadows = true;
    southWallRight.checkCollisions = true;

    // East wall (full wall)
    const eastWall = MeshBuilder.CreateBox(
      'roomEastWall',
      {
        width: wallThickness,
        height: wallHeight,
        depth: roomSize
      },
      this.scene
    );
    eastWall.position = new Vector3(
      roomPosition.x + roomSize / 2,
      wallHeight / 2,
      roomPosition.z
    );
    eastWall.material = wallMaterial;
    eastWall.receiveShadows = true;
    eastWall.checkCollisions = true;

    // West wall (full wall)
    const westWall = MeshBuilder.CreateBox(
      'roomWestWall',
      {
        width: wallThickness,
        height: wallHeight,
        depth: roomSize
      },
      this.scene
    );
    westWall.position = new Vector3(
      roomPosition.x - roomSize / 2,
      wallHeight / 2,
      roomPosition.z
    );
    westWall.material = wallMaterial;
    westWall.receiveShadows = true;
    westWall.checkCollisions = true;

    // Room floor (slightly raised to distinguish from ground)
    const roomFloor = MeshBuilder.CreateGround(
      'roomFloor',
      {
        width: roomSize - wallThickness,
        height: roomSize - wallThickness,
        subdivisions: 1
      },
      this.scene
    );
    roomFloor.position = new Vector3(
      roomPosition.x,
      0.02, // Slightly above ground to avoid z-fighting
      roomPosition.z
    );

    const floorMaterial = new StandardMaterial('roomFloorMaterial', this.scene);
    floorMaterial.diffuseColor = new Color3(0.4, 0.38, 0.35); // Concrete floor
    floorMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
    roomFloor.material = floorMaterial;
    roomFloor.receiveShadows = true;
    roomFloor.checkCollisions = true;

    // Add all walls to shadow casters
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(northWall);
      this.shadowGenerator.addShadowCaster(southWallLeft);
      this.shadowGenerator.addShadowCaster(southWallRight);
      this.shadowGenerator.addShadowCaster(eastWall);
      this.shadowGenerator.addShadowCaster(westWall);
    }
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

    // Reduced to 2 cargo containers as requested
    const coverPositions = [
      { position: new Vector3(10, 0, 10), rotation: 0 },
      { position: new Vector3(-10, 0, -10), rotation: -Math.PI / 4 }
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
