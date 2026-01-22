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
  Texture,
  AbstractMesh,
  Mesh
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

  // Dummy targets for testing
  private dummyTargets: { mesh: AbstractMesh; health: number; spawnPosition: Vector3; index: number }[] = [];
  private selectedTarget: { mesh: AbstractMesh; health: number; spawnPosition: Vector3; index: number } | null = null;
  private pendingRespawns: { position: Vector3; index: number; respawnTime: number }[] = [];
  private readonly RESPAWN_DELAY: number = 5000; // 5 seconds in milliseconds
  private readonly AIM_ANGLE_THRESHOLD: number = 15; // degrees - how accurate aim must be

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
    this.createDummyTargets();

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
    const groundMaterial = new StandardMaterial('groundMaterial', this.scene);

    // Load moon texture
    const diffuseTexture = new Texture('textures/moon/diffuse.jpg', this.scene);
    diffuseTexture.uScale = 10;
    diffuseTexture.vScale = 10;
    groundMaterial.diffuseTexture = diffuseTexture;
    groundMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

    // Trench dimensions (must match createTrench)
    const trenchX = -20;
    const trenchLength = 20;
    const trenchWidth = 3;
    const halfGround = GAME_CONSTANTS.GROUND_SIZE / 2;

    // Create ground sections around the trench gap
    // Left section: everything to the left of the trench
    const leftWidth = halfGround + (trenchX - trenchWidth / 2);
    const groundLeft = MeshBuilder.CreateGround(
      'groundLeft',
      { width: leftWidth, height: GAME_CONSTANTS.GROUND_SIZE },
      this.scene
    );
    groundLeft.position.x = -halfGround + leftWidth / 2;
    groundLeft.material = groundMaterial;
    groundLeft.receiveShadows = true;
    groundLeft.checkCollisions = true;

    // Right section: everything to the right of the trench
    const rightWidth = halfGround - (trenchX + trenchWidth / 2);
    const groundRight = MeshBuilder.CreateGround(
      'groundRight',
      { width: rightWidth, height: GAME_CONSTANTS.GROUND_SIZE },
      this.scene
    );
    groundRight.position.x = halfGround - rightWidth / 2;
    groundRight.material = groundMaterial;
    groundRight.receiveShadows = true;
    groundRight.checkCollisions = true;

    // Front section: fills gap in front of trench (negative Z)
    const frontDepth = halfGround - trenchLength / 2;
    const groundFront = MeshBuilder.CreateGround(
      'groundFront',
      { width: trenchWidth, height: frontDepth },
      this.scene
    );
    groundFront.position.x = trenchX;
    groundFront.position.z = -halfGround + frontDepth / 2;
    groundFront.material = groundMaterial;
    groundFront.receiveShadows = true;
    groundFront.checkCollisions = true;

    // Back section: fills gap behind trench (positive Z)
    const groundBack = MeshBuilder.CreateGround(
      'groundBack',
      { width: trenchWidth, height: frontDepth },
      this.scene
    );
    groundBack.position.x = trenchX;
    groundBack.position.z = halfGround - frontDepth / 2;
    groundBack.material = groundMaterial;
    groundBack.receiveShadows = true;
    groundBack.checkCollisions = true;
  }

  private createTrench(): void {
    // Create a WW1-style trench - a depression in the ground with raised earth berms
    const trenchLength = 20;
    const trenchWidth = 3;
    const trenchDepth = 1.5;
    const trenchPosition = new Vector3(-20, 0, 0);
    const bermHeight = 0.6; // Raised earth around trench edges

    // Materials
    const dirtMaterial = new StandardMaterial('trenchDirtMaterial', this.scene);
    dirtMaterial.diffuseColor = new Color3(0.25, 0.18, 0.12);
    dirtMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    const sandbagMaterial = new StandardMaterial('sandbagMaterial', this.scene);
    sandbagMaterial.diffuseColor = new Color3(0.55, 0.5, 0.35);
    sandbagMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    const woodMaterial = new StandardMaterial('trenchWoodMaterial', this.scene);
    const woodTexture = new Texture('textures/worn_planks/worn_planks_diff_4k.jpg', this.scene);
    woodTexture.uScale = 0.5;  // Scale for duckboard size
    woodTexture.vScale = 2;
    woodMaterial.diffuseTexture = woodTexture;
    woodMaterial.specularColor = new Color3(0.08, 0.06, 0.04);

    // === TRENCH FLOOR (below ground level) ===
    const trenchFloor = MeshBuilder.CreateGround(
      'trenchFloor',
      { width: trenchWidth, height: trenchLength, subdivisions: 2 },
      this.scene
    );
    trenchFloor.position = new Vector3(trenchPosition.x, -trenchDepth, trenchPosition.z);
    trenchFloor.material = dirtMaterial;
    trenchFloor.receiveShadows = true;

    // === TRENCH INNER WALLS (visible dirt walls going down) ===
    const wallHeight = trenchDepth;

    const leftInnerWall = MeshBuilder.CreateBox(
      'trenchLeftInnerWall',
      { width: 0.1, height: wallHeight, depth: trenchLength },
      this.scene
    );
    leftInnerWall.position = new Vector3(
      trenchPosition.x - trenchWidth / 2,
      -wallHeight / 2,
      trenchPosition.z
    );
    leftInnerWall.material = dirtMaterial;
    leftInnerWall.receiveShadows = true;

    const rightInnerWall = MeshBuilder.CreateBox(
      'trenchRightInnerWall',
      { width: 0.1, height: wallHeight, depth: trenchLength },
      this.scene
    );
    rightInnerWall.position = new Vector3(
      trenchPosition.x + trenchWidth / 2,
      -wallHeight / 2,
      trenchPosition.z
    );
    rightInnerWall.material = dirtMaterial;
    rightInnerWall.receiveShadows = true;

    // === RAISED EARTH BERMS (above ground, makes it look like dug out) ===
    const bermWidth = 1.2;

    const leftBerm = MeshBuilder.CreateBox(
      'trenchLeftBerm',
      { width: bermWidth, height: bermHeight, depth: trenchLength },
      this.scene
    );
    leftBerm.position = new Vector3(
      trenchPosition.x - trenchWidth / 2 - bermWidth / 2,
      bermHeight / 2,
      trenchPosition.z
    );
    leftBerm.material = dirtMaterial;
    leftBerm.receiveShadows = true;

    const rightBerm = MeshBuilder.CreateBox(
      'trenchRightBerm',
      { width: bermWidth, height: bermHeight, depth: trenchLength },
      this.scene
    );
    rightBerm.position = new Vector3(
      trenchPosition.x + trenchWidth / 2 + bermWidth / 2,
      bermHeight / 2,
      trenchPosition.z
    );
    rightBerm.material = dirtMaterial;
    rightBerm.receiveShadows = true;

    // === SANDBAG ROWS on top of berms ===
    const sandbagHeight = 0.3;
    const sandbagWidth = 0.8;

    const leftSandbags = MeshBuilder.CreateBox(
      'trenchLeftSandbags',
      { width: sandbagWidth, height: sandbagHeight, depth: trenchLength - 2 },
      this.scene
    );
    leftSandbags.position = new Vector3(
      trenchPosition.x - trenchWidth / 2 - bermWidth / 2,
      bermHeight + sandbagHeight / 2,
      trenchPosition.z
    );
    leftSandbags.material = sandbagMaterial;
    leftSandbags.receiveShadows = true;

    const rightSandbags = MeshBuilder.CreateBox(
      'trenchRightSandbags',
      { width: sandbagWidth, height: sandbagHeight, depth: trenchLength - 2 },
      this.scene
    );
    rightSandbags.position = new Vector3(
      trenchPosition.x + trenchWidth / 2 + bermWidth / 2,
      bermHeight + sandbagHeight / 2,
      trenchPosition.z
    );
    rightSandbags.material = sandbagMaterial;
    rightSandbags.receiveShadows = true;

    // === WOODEN DUCKBOARDS on floor ===
    for (let i = 0; i < trenchLength - 1; i += 2) {
      const duckboard = MeshBuilder.CreateBox(
        `duckboard_${i}`,
        { width: trenchWidth * 0.7, height: 0.08, depth: 0.8 },
        this.scene
      );
      duckboard.position = new Vector3(
        trenchPosition.x,
        -trenchDepth + 0.04,
        trenchPosition.z - trenchLength / 2 + 1 + i
      );
      duckboard.material = woodMaterial;
      duckboard.receiveShadows = true;
    }

    // === ENTRY RAMP ===
    const rampLength = 4;
    const ramp = MeshBuilder.CreateBox(
      'trenchRamp',
      { width: trenchWidth, height: 0.15, depth: rampLength },
      this.scene
    );
    ramp.position = new Vector3(
      trenchPosition.x,
      -trenchDepth / 2,
      trenchPosition.z + trenchLength / 2 + rampLength / 2 - 0.5
    );
    ramp.rotation.x = Math.atan(trenchDepth / rampLength);
    ramp.material = dirtMaterial;
    ramp.receiveShadows = true;

    // Add shadow casters
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(leftBerm);
      this.shadowGenerator.addShadowCaster(rightBerm);
      this.shadowGenerator.addShadowCaster(leftSandbags);
      this.shadowGenerator.addShadowCaster(rightSandbags);
      this.shadowGenerator.addShadowCaster(ramp);
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

  private createDummyTargets(): void {
    // Create enemy-like dummy targets for testing shooting
    const targetPositions = [
      new Vector3(8, 0, 0),
      new Vector3(12, 0, 5),
      new Vector3(-5, 0, 8)
    ];

    // Enemy material - dark red/crimson for grimdark feel
    const enemyMaterial = new StandardMaterial('enemyMaterial', this.scene);
    enemyMaterial.diffuseColor = new Color3(0.5, 0.1, 0.1);
    enemyMaterial.specularColor = new Color3(0.2, 0.2, 0.2);

    // Highlight material for when targeted
    const targetedMaterial = new StandardMaterial('targetedMaterial', this.scene);
    targetedMaterial.diffuseColor = new Color3(0.8, 0.2, 0.2);
    targetedMaterial.emissiveColor = new Color3(0.3, 0.05, 0.05);
    targetedMaterial.specularColor = new Color3(0.3, 0.3, 0.3);

    for (let i = 0; i < targetPositions.length; i++) {
      const pos = targetPositions[i];

      // Create a simple humanoid shape (body + head)
      const body = MeshBuilder.CreateCylinder(
        `dummy_body_${i}`,
        { height: 1.5, diameter: 0.6, tessellation: 12 },
        this.scene
      );
      body.position = new Vector3(pos.x, 0.75, pos.z);
      body.material = enemyMaterial;
      body.receiveShadows = true;
      body.isPickable = true;
      body.metadata = { type: 'enemy', index: i, targetedMaterial, originalMaterial: enemyMaterial };

      const head = MeshBuilder.CreateSphere(
        `dummy_head_${i}`,
        { diameter: 0.4, segments: 12 },
        this.scene
      );
      head.position = new Vector3(pos.x, 1.7, pos.z);
      head.material = enemyMaterial;
      head.receiveShadows = true;
      head.isPickable = true;
      head.parent = null; // Keep independent for picking
      head.metadata = { type: 'enemy', index: i, parentBody: body };

      // Add to shadow casters
      if (this.shadowGenerator) {
        this.shadowGenerator.addShadowCaster(body);
        this.shadowGenerator.addShadowCaster(head);
      }

      this.dummyTargets.push({ mesh: body, health: 100, spawnPosition: pos.clone(), index: i });
    }
  }

  /**
   * Spawn a single dummy target at the given position
   */
  private spawnDummyTarget(pos: Vector3, index: number): void {
    // Get or create materials
    let enemyMaterial = this.scene.getMaterialByName('enemyMaterial') as StandardMaterial;
    let targetedMaterial = this.scene.getMaterialByName('targetedMaterial') as StandardMaterial;

    if (!enemyMaterial) {
      enemyMaterial = new StandardMaterial('enemyMaterial', this.scene);
      enemyMaterial.diffuseColor = new Color3(0.5, 0.1, 0.1);
      enemyMaterial.specularColor = new Color3(0.2, 0.2, 0.2);
    }

    if (!targetedMaterial) {
      targetedMaterial = new StandardMaterial('targetedMaterial', this.scene);
      targetedMaterial.diffuseColor = new Color3(0.8, 0.2, 0.2);
      targetedMaterial.emissiveColor = new Color3(0.3, 0.05, 0.05);
      targetedMaterial.specularColor = new Color3(0.3, 0.3, 0.3);
    }

    // Create body
    const body = MeshBuilder.CreateCylinder(
      `dummy_body_${index}`,
      { height: 1.5, diameter: 0.6, tessellation: 12 },
      this.scene
    );
    body.position = new Vector3(pos.x, 0.75, pos.z);
    body.material = enemyMaterial;
    body.receiveShadows = true;
    body.isPickable = true;
    body.metadata = { type: 'enemy', index: index, targetedMaterial, originalMaterial: enemyMaterial };

    // Create head
    const head = MeshBuilder.CreateSphere(
      `dummy_head_${index}`,
      { diameter: 0.4, segments: 12 },
      this.scene
    );
    head.position = new Vector3(pos.x, 1.7, pos.z);
    head.material = enemyMaterial;
    head.receiveShadows = true;
    head.isPickable = true;
    head.parent = null;
    head.metadata = { type: 'enemy', index: index, parentBody: body };

    // Add to shadow casters
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(body);
      this.shadowGenerator.addShadowCaster(head);
    }

    this.dummyTargets.push({ mesh: body, health: 100, spawnPosition: pos.clone(), index: index });
  }

  /**
   * Check if player is aiming at the selected target
   * Returns true if the angle between player's forward direction and target is within threshold
   */
  private isAimingAtTarget(target: { mesh: AbstractMesh }): boolean {
    if (!this.player) return false;

    const playerPos = this.player.getPosition();
    const targetPos = target.mesh.position;

    // Get direction from player to target (on XZ plane)
    const directionToTarget = new Vector3(
      targetPos.x - playerPos.x,
      0,
      targetPos.z - playerPos.z
    ).normalize();

    // Get player's forward direction
    const playerForward = this.player.getForwardDirection();

    // Calculate angle between them using dot product
    const dot = Vector3.Dot(playerForward, directionToTarget);
    const angleRad = Math.acos(Math.min(1, Math.max(-1, dot))); // Clamp to avoid NaN
    const angleDeg = angleRad * (180 / Math.PI);

    return angleDeg <= this.AIM_ANGLE_THRESHOLD;
  }

  /**
   * Process pending target respawns
   */
  private processRespawns(): void {
    const currentTime = performance.now();
    const respawned: number[] = [];

    for (let i = 0; i < this.pendingRespawns.length; i++) {
      const respawn = this.pendingRespawns[i];
      if (currentTime >= respawn.respawnTime) {
        this.spawnDummyTarget(respawn.position, respawn.index);
        respawned.push(i);
        console.log(`Enemy ${respawn.index} respawned!`);
      }
    }

    // Remove processed respawns (in reverse order to maintain indices)
    for (let i = respawned.length - 1; i >= 0; i--) {
      this.pendingRespawns.splice(respawned[i], 1);
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

    // Setup click-to-target picking
    this.scene.onPointerDown = (_evt, pickResult) => {
      if (pickResult.hit && pickResult.pickedMesh) {
        const metadata = pickResult.pickedMesh.metadata;
        if (metadata && metadata.type === 'enemy') {
          this.selectTarget(pickResult.pickedMesh);
        }
      }
    };
  }

  private selectTarget(mesh: AbstractMesh): void {
    // Deselect previous target
    if (this.selectedTarget) {
      const prevMeta = this.selectedTarget.mesh.metadata;
      if (prevMeta && prevMeta.originalMaterial) {
        this.selectedTarget.mesh.material = prevMeta.originalMaterial;
      }
    }

    // Find the target data
    const metadata = mesh.metadata;
    let targetMesh = mesh;

    // If we clicked the head, get the parent body
    if (metadata.parentBody) {
      targetMesh = metadata.parentBody;
    }

    // Find in dummyTargets array
    const targetData = this.dummyTargets.find(t => t.mesh === targetMesh);
    if (targetData) {
      this.selectedTarget = targetData;

      // Apply targeted material (highlight)
      const meta = targetMesh.metadata;
      if (meta && meta.targetedMaterial) {
        targetMesh.material = meta.targetedMaterial;
      }

      console.log(`Target selected: Enemy ${meta?.index}, Health: ${targetData.health}`);
    }
  }

  private damageSelectedTarget(damage: number): void {
    if (!this.selectedTarget) {
      console.log('No target selected!');
      return;
    }

    this.selectedTarget.health -= damage;
    console.log(`Hit! Enemy health: ${this.selectedTarget.health}`);

    if (this.selectedTarget.health <= 0) {
      // Target destroyed
      console.log('Enemy destroyed! Will respawn in 5 seconds.');
      const mesh = this.selectedTarget.mesh;
      const metadata = mesh.metadata;
      const spawnPosition = this.selectedTarget.spawnPosition;
      const targetIndex = this.selectedTarget.index;

      // Find and remove the head too
      const headMesh = this.scene.getMeshByName(`dummy_head_${metadata?.index}`);
      if (headMesh) {
        headMesh.dispose();
      }

      // Remove from targets array
      const index = this.dummyTargets.indexOf(this.selectedTarget);
      if (index > -1) {
        this.dummyTargets.splice(index, 1);
      }

      // Schedule respawn
      this.pendingRespawns.push({
        position: spawnPosition,
        index: targetIndex,
        respawnTime: performance.now() + this.RESPAWN_DELAY
      });

      mesh.dispose();
      this.selectedTarget = null;
    }
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

      // Damage selected target when shooting - only if aiming at it
      if (isShooting && this.selectedTarget) {
        if (this.isAimingAtTarget(this.selectedTarget)) {
          this.damageSelectedTarget(25); // 25 damage per shot, 4 shots to kill
        } else {
          console.log('Missed! Not aiming at target.');
        }
      }

      // Handle camera zoom
      const zoomDelta = this.inputManager.consumeZoomDelta();
      if (zoomDelta !== 0 && this.cameraSystem) {
        if (zoomDelta > 0) {
          this.cameraSystem.zoomOut(zoomDelta);
        } else {
          this.cameraSystem.zoomIn(-zoomDelta);
        }
      }

      this.inputManager.clearJustPressed();
    }

    if (this.cameraSystem) {
      this.cameraSystem.update(deltaTime);
    }

    // Process any pending target respawns
    this.processRespawns();
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
