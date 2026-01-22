import {
  Scene,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  Mesh,
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
    // Create a WW1-style trench in one area of the map (negative X side)
    // Trench dimensions: 20 units long, 3 units wide at bottom, 1.8 units deep
    const trenchLength = 20;
    const trenchWidthBottom = 2.5;
    const trenchWidthTop = 4;
    const trenchDepth = 1.8;
    const trenchPosition = new Vector3(-20, 0, 0);

    // Materials for trench components
    const earthMaterial = new StandardMaterial('trenchEarthMaterial', this.scene);
    earthMaterial.diffuseColor = new Color3(0.35, 0.25, 0.15); // Brown earth
    earthMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    const dirtFloorMaterial = new StandardMaterial('trenchFloorMaterial', this.scene);
    dirtFloorMaterial.diffuseColor = new Color3(0.2, 0.15, 0.1); // Dark dirt
    dirtFloorMaterial.specularColor = new Color3(0.02, 0.02, 0.02);

    const sandbagMaterial = new StandardMaterial('sandbagMaterial', this.scene);
    sandbagMaterial.diffuseColor = new Color3(0.55, 0.5, 0.35); // Tan/khaki sandbags
    sandbagMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    const woodMaterial = new StandardMaterial('trenchWoodMaterial', this.scene);
    woodMaterial.diffuseColor = new Color3(0.4, 0.3, 0.2); // Dark wood
    woodMaterial.specularColor = new Color3(0.1, 0.08, 0.05);

    // === TRENCH FLOOR ===
    const trenchFloor = MeshBuilder.CreateGround(
      'trenchFloor',
      {
        width: trenchWidthBottom,
        height: trenchLength,
        subdivisions: 4
      },
      this.scene
    );
    trenchFloor.position = new Vector3(trenchPosition.x, -trenchDepth, trenchPosition.z);
    trenchFloor.material = dirtFloorMaterial;
    trenchFloor.receiveShadows = true;
    trenchFloor.checkCollisions = true;

    // === SLOPED TRENCH WALLS using ExtrudeShape ===
    // Create a cross-section profile for one trench wall (sloped inward)
    const wallProfile = [
      new Vector3(0, 0, 0),                    // Top outer edge (ground level)
      new Vector3(0.8, 0, 0),                  // Top of berm
      new Vector3(0.6, -0.3, 0),               // Inner edge of berm
      new Vector3(0.3, -trenchDepth * 0.3, 0), // Start of slope
      new Vector3(0, -trenchDepth, 0)          // Bottom at trench floor
    ];

    // Path along the trench length
    const wallPath: Vector3[] = [];
    for (let i = 0; i <= trenchLength; i += 0.5) {
      wallPath.push(new Vector3(0, 0, i - trenchLength / 2));
    }

    // Left wall (extruded shape)
    const leftWall = MeshBuilder.ExtrudeShape(
      'trenchLeftWall',
      {
        shape: wallProfile,
        path: wallPath,
        sideOrientation: Mesh.DOUBLESIDE,
        cap: Mesh.CAP_ALL
      },
      this.scene
    );
    leftWall.position = new Vector3(
      trenchPosition.x - trenchWidthBottom / 2,
      0,
      trenchPosition.z
    );
    leftWall.material = earthMaterial;
    leftWall.receiveShadows = true;
    leftWall.checkCollisions = true;

    // Right wall (mirror the profile)
    const rightWallProfile = wallProfile.map(v => new Vector3(-v.x, v.y, v.z));
    const rightWall = MeshBuilder.ExtrudeShape(
      'trenchRightWall',
      {
        shape: rightWallProfile,
        path: wallPath,
        sideOrientation: Mesh.DOUBLESIDE,
        cap: Mesh.CAP_ALL
      },
      this.scene
    );
    rightWall.position = new Vector3(
      trenchPosition.x + trenchWidthBottom / 2,
      0,
      trenchPosition.z
    );
    rightWall.material = earthMaterial;
    rightWall.receiveShadows = true;
    rightWall.checkCollisions = true;

    // === SANDBAG BERMS along trench edges ===
    const createSandbagRow = (name: string, xOffset: number, zStart: number, count: number): void => {
      for (let i = 0; i < count; i++) {
        // Individual sandbag (rounded box shape)
        const sandbag = MeshBuilder.CreateBox(
          `${name}_${i}`,
          {
            width: 0.5,
            height: 0.25,
            depth: 0.35
          },
          this.scene
        );

        // Stagger position slightly for realism
        const stagger = (i % 2) * 0.1;
        sandbag.position = new Vector3(
          trenchPosition.x + xOffset + stagger,
          0.12,
          zStart + i * 0.55
        );

        // Slight random rotation for organic look
        sandbag.rotation.y = (Math.random() - 0.5) * 0.3;
        sandbag.rotation.z = (Math.random() - 0.5) * 0.1;

        sandbag.material = sandbagMaterial;
        sandbag.receiveShadows = true;
        // Sandbags are decorative only - no collision to prevent character getting stuck

        if (this.shadowGenerator) {
          this.shadowGenerator.addShadowCaster(sandbag);
        }
      }
    };

    // Create sandbag rows on both sides
    const sandbagCount = Math.floor(trenchLength / 0.55) - 2;
    createSandbagRow('sandbagLeft', -trenchWidthTop / 2 - 0.3, -trenchLength / 2 + 1, sandbagCount);
    createSandbagRow('sandbagRight', trenchWidthTop / 2 + 0.3, -trenchLength / 2 + 1, sandbagCount);

    // Second layer of sandbags (stacked)
    for (let i = 0; i < sandbagCount - 4; i += 2) {
      const leftStackBag = MeshBuilder.CreateBox(
        `sandbagLeftStack_${i}`,
        { width: 0.5, height: 0.25, depth: 0.35 },
        this.scene
      );
      leftStackBag.position = new Vector3(
        trenchPosition.x - trenchWidthTop / 2 - 0.25,
        0.37,
        -trenchLength / 2 + 1.5 + i * 0.55
      );
      leftStackBag.rotation.y = (Math.random() - 0.5) * 0.2;
      leftStackBag.material = sandbagMaterial;
      leftStackBag.receiveShadows = true;
      if (this.shadowGenerator) {
        this.shadowGenerator.addShadowCaster(leftStackBag);
      }

      const rightStackBag = MeshBuilder.CreateBox(
        `sandbagRightStack_${i}`,
        { width: 0.5, height: 0.25, depth: 0.35 },
        this.scene
      );
      rightStackBag.position = new Vector3(
        trenchPosition.x + trenchWidthTop / 2 + 0.25,
        0.37,
        -trenchLength / 2 + 1.5 + i * 0.55
      );
      rightStackBag.rotation.y = (Math.random() - 0.5) * 0.2;
      rightStackBag.material = sandbagMaterial;
      rightStackBag.receiveShadows = true;
      if (this.shadowGenerator) {
        this.shadowGenerator.addShadowCaster(rightStackBag);
      }
    }

    // === WOODEN SUPPORT PLANKS on walls ===
    const plankSpacing = 3;
    for (let i = 0; i < trenchLength / plankSpacing; i++) {
      // Vertical support posts
      const leftPost = MeshBuilder.CreateBox(
        `trenchPostLeft_${i}`,
        { width: 0.15, height: trenchDepth * 0.8, depth: 0.15 },
        this.scene
      );
      leftPost.position = new Vector3(
        trenchPosition.x - trenchWidthBottom / 2 + 0.1,
        -trenchDepth / 2,
        trenchPosition.z - trenchLength / 2 + 1 + i * plankSpacing
      );
      leftPost.material = woodMaterial;
      leftPost.receiveShadows = true;

      const rightPost = MeshBuilder.CreateBox(
        `trenchPostRight_${i}`,
        { width: 0.15, height: trenchDepth * 0.8, depth: 0.15 },
        this.scene
      );
      rightPost.position = new Vector3(
        trenchPosition.x + trenchWidthBottom / 2 - 0.1,
        -trenchDepth / 2,
        trenchPosition.z - trenchLength / 2 + 1 + i * plankSpacing
      );
      rightPost.material = woodMaterial;
      rightPost.receiveShadows = true;

      if (this.shadowGenerator) {
        this.shadowGenerator.addShadowCaster(leftPost);
        this.shadowGenerator.addShadowCaster(rightPost);
      }
    }

    // Horizontal duckboards on floor
    for (let i = 0; i < trenchLength - 1; i += 1.5) {
      const duckboard = MeshBuilder.CreateBox(
        `duckboard_${i}`,
        { width: trenchWidthBottom * 0.8, height: 0.05, depth: 0.6 },
        this.scene
      );
      duckboard.position = new Vector3(
        trenchPosition.x,
        -trenchDepth + 0.03,
        trenchPosition.z - trenchLength / 2 + 0.5 + i
      );
      duckboard.material = woodMaterial;
      duckboard.receiveShadows = true;
      duckboard.checkCollisions = true;
    }

    // === ENTRY RAMP ===
    const rampLength = 5;
    const rampWidth = trenchWidthBottom;

    // Create ramp as a sloped box
    const ramp = MeshBuilder.CreateBox(
      'trenchRamp',
      {
        width: rampWidth,
        height: 0.15,
        depth: rampLength
      },
      this.scene
    );
    ramp.position = new Vector3(
      trenchPosition.x,
      -trenchDepth / 2,
      trenchPosition.z + trenchLength / 2 + rampLength / 2 - 0.3
    );
    ramp.rotation.x = Math.atan(trenchDepth / rampLength);
    ramp.material = earthMaterial;
    ramp.receiveShadows = true;
    ramp.checkCollisions = true;

    // Ramp side walls
    const rampSideHeight = trenchDepth * 0.6;
    const rampSideLeft = MeshBuilder.CreateBox(
      'rampSideLeft',
      { width: 0.3, height: rampSideHeight, depth: rampLength },
      this.scene
    );
    rampSideLeft.position = new Vector3(
      trenchPosition.x - rampWidth / 2 - 0.15,
      -trenchDepth / 2,
      trenchPosition.z + trenchLength / 2 + rampLength / 2 - 0.3
    );
    rampSideLeft.material = earthMaterial;
    rampSideLeft.receiveShadows = true;
    rampSideLeft.checkCollisions = true;

    const rampSideRight = MeshBuilder.CreateBox(
      'rampSideRight',
      { width: 0.3, height: rampSideHeight, depth: rampLength },
      this.scene
    );
    rampSideRight.position = new Vector3(
      trenchPosition.x + rampWidth / 2 + 0.15,
      -trenchDepth / 2,
      trenchPosition.z + trenchLength / 2 + rampLength / 2 - 0.3
    );
    rampSideRight.material = earthMaterial;
    rampSideRight.receiveShadows = true;
    rampSideRight.checkCollisions = true;

    // Add main walls to shadow casters
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(leftWall);
      this.shadowGenerator.addShadowCaster(rightWall);
      this.shadowGenerator.addShadowCaster(ramp);
      this.shadowGenerator.addShadowCaster(rampSideLeft);
      this.shadowGenerator.addShadowCaster(rampSideRight);
    }
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
