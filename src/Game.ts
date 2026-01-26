import {
  Scene,
  Vector3,
  Vector2,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  ArcRotateCamera,
  MeshBuilder,
  StandardMaterial,
  ShadowGenerator,
  Texture,
  AbstractMesh,
  Mesh,
  PointerEventTypes,
  KeyboardEventTypes,
  Matrix
} from '@babylonjs/core';
import { EngineWrapper } from './core/Engine';
import { AssetLoader, LoadProgress } from './core/AssetLoader';
import { CameraSystem } from './systems/CameraSystem';
import { InputManager } from './input/InputManager';
import { Character } from './entities/Character';
import { Enemy } from './entities/Enemy';
import { CoverSystem } from './systems/CoverSystem';
import { CoverObject } from './entities/CoverObject';
import { NavigationSystem } from './systems/NavigationSystem';
import { SquadManager } from './systems/SquadManager';
import { SquadMember } from './entities/SquadMember';
import { SquadPanel } from './ui/SquadPanel';
import { GAME_CONSTANTS, ASSET_PATHS, REBEL_ASSET_PATHS } from './utils/Constants';
import { CoverLevel } from './types/GameTypes';
import { SquadOrderType } from './types/SquadTypes';

export class Game {
  private engineWrapper: EngineWrapper;
  private scene: Scene;
  private assetLoader: AssetLoader;
  private cameraSystem: CameraSystem | null = null;
  private inputManager: InputManager | null = null;
  private player: Character | null = null;
  private squadManager: SquadManager | null = null;
  private squadPanel: SquadPanel | null = null;
  private coverSystem: CoverSystem | null = null;
  private shadowGenerator: ShadowGenerator | null = null;
  private navigationSystem: NavigationSystem | null = null;

  // Meshes for navigation mesh generation
  private navMeshSources: Mesh[] = [];

  // Enemy targets
  private enemies: Enemy[] = [];
  private selectedEnemy: Enemy | null = null;
  private pendingRespawns: { position: Vector3; index: number; respawnTime: number }[] = [];
  private readonly RESPAWN_DELAY: number = 5000; // 5 seconds in milliseconds
  private readonly AIM_ANGLE_THRESHOLD: number = 15; // degrees - how accurate aim must be

  private isRunning: boolean = false;
  private lastTime: number = 0;

  private progressCallbacks: ((progress: LoadProgress) => void)[] = [];

  private isPlanningModeActive: boolean = false;
  private isPlanningToggleActive: boolean = false;
  private planningCamera: ArcRotateCamera | null = null;
  private isOrderDragActive: boolean = false;
  private orderDragPointerId: number | null = null;
  private orderDragTarget: Vector3 | null = null;
  private orderDragMemberId: string | null = null;
  private planningIndicatorMemberId: string | null = null;
  private planningMarker: Mesh | null = null;
  private planningLine: Mesh | null = null;
  private hasPlanningTarget: boolean = false;
  private planningFitRadius: number | null = null;
  private planningFitTarget: Vector3 | null = null;
  private planningPanEnabled: boolean = false;
  private planningMapMin: Vector3 | null = null;
  private planningMapMax: Vector3 | null = null;

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

    // Setup cover objects first so they can be added to navmesh
    this.setupCover();

    // Initialize navigation system after all geometry is created
    await this.setupNavigation();

    await this.createPlayer();
    await this.createSquad();
    await this.createEnemies();
    this.setupCamera();
    this.setupInput();

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

    // Load concrete floor texture
    const diffuseTexture = new Texture(
      'textures/concrete_floor_worn_001_4k/concrete_floor_worn_001_diff_4k.jpg',
      this.scene
    );
    diffuseTexture.uScale = 10;
    diffuseTexture.vScale = 10;
    groundMaterial.diffuseTexture = diffuseTexture;
    groundMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

    const ground = MeshBuilder.CreateGround(
      'ground',
      {
        width: GAME_CONSTANTS.GROUND_SIZE,
        height: GAME_CONSTANTS.GROUND_SIZE,
        subdivisions: GAME_CONSTANTS.GROUND_SUBDIVISIONS
      },
      this.scene
    );
    ground.metadata = { type: 'ground' };
    ground.material = groundMaterial;
    ground.receiveShadows = true;
    ground.checkCollisions = true;
    this.navMeshSources.push(ground);
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
    this.navMeshSources.push(leftBerm);

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
    this.navMeshSources.push(rightBerm);

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
    this.navMeshSources.push(northWall);

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
    this.navMeshSources.push(southWallLeft);

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
    this.navMeshSources.push(southWallRight);

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
    this.navMeshSources.push(eastWall);

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
    this.navMeshSources.push(westWall);

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
    this.navMeshSources.push(roomFloor);

    // Add all walls to shadow casters
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(northWall);
      this.shadowGenerator.addShadowCaster(southWallLeft);
      this.shadowGenerator.addShadowCaster(southWallRight);
      this.shadowGenerator.addShadowCaster(eastWall);
      this.shadowGenerator.addShadowCaster(westWall);
    }
  }

  private async setupNavigation(): Promise<void> {
    this.navigationSystem = new NavigationSystem(this.scene, 20, 0.6);
    await this.navigationSystem.initialize();

    // Create navmesh from ground/floor geometry only
    this.navigationSystem.createNavMesh(this.navMeshSources);

    // Add cargo containers as obstacles to carve out blocked areas
    if (this.coverSystem) {
      for (const cover of this.coverSystem.getCoverObjects()) {
        const params = cover.getObstacleParams();
        if (params) {
          this.navigationSystem.addBoxObstacle(params.position, params.extent, params.angle);
        }
      }
    }
  }

  // Different patrol routes for each enemy
  // Note: Avoid cargo container positions at (10, 0, 10) and (-10, 0, -10)

  // Route 1: East side patrol (right side of map)
  private readonly PATROL_ROUTE_EAST: Vector3[] = [
    new Vector3(15, 0, 12),
    new Vector3(15, 0, -12),
    new Vector3(5, 0, -12),
    new Vector3(5, 0, 12)
  ];

  // Route 2: West side patrol (left side of map)
  private readonly PATROL_ROUTE_WEST: Vector3[] = [
    new Vector3(-15, 0, -12),
    new Vector3(-15, 0, 12),
    new Vector3(-5, 0, 12),
    new Vector3(-5, 0, -12)
  ];

  // Route 3: North-South center patrol
  private readonly PATROL_ROUTE_CENTER: Vector3[] = [
    new Vector3(0, 0, 15),
    new Vector3(0, 0, -15)
  ];

  private async createEnemies(): Promise<void> {
    // Enemy 1: Patrols east side of map
    const patrolEast = await this.spawnEnemy(new Vector3(15, 0, 0), 0, 1);
    patrolEast.setPatrolWaypoints(this.PATROL_ROUTE_EAST, 0);

    // Enemy 2: Patrols west side of map
    const patrolWest = await this.spawnEnemy(new Vector3(-15, 0, 0), Math.PI, 2);
    patrolWest.setPatrolWaypoints(this.PATROL_ROUTE_WEST, 0);

    // Enemy 3: Random wanderer in center area
    const wanderer = await this.spawnEnemy(new Vector3(0, 0, 5), 0, 3);
    wanderer.startWandering(new Vector3(0, 0, 0), 12);
  }

  /**
   * Spawn a single enemy at the given position
   */
  private async spawnEnemy(pos: Vector3, rotation: number, index: number): Promise<Enemy> {
    const enemy = new Enemy(this.scene, this.assetLoader, `enemy_${index}`, index);
    await enemy.initialize();

    // Connect enemy to navigation system for pathfinding
    if (this.navigationSystem) {
      enemy.setNavigationSystem(this.navigationSystem);
      enemy.setPosition(pos);
      enemy.setRotation(rotation);
      enemy.registerAsAgent();
    } else {
      enemy.setPosition(pos);
      enemy.setRotation(rotation);
    }

    // Add shadow casters for enemy meshes
    if (this.shadowGenerator) {
      const meshes = enemy.getAllMeshes();
      for (const mesh of meshes) {
        this.shadowGenerator.addShadowCaster(mesh);
        mesh.receiveShadows = true;
      }
    }

    // Set up death callback for respawning
    enemy.onDeath(() => {
      const spawnPos = enemy.getSpawnPosition();
      const enemyIndex = enemy.getIndex();

      // Remove from enemies array
      const idx = this.enemies.indexOf(enemy);
      if (idx > -1) {
        this.enemies.splice(idx, 1);
      }

      // Clear selection if this was the selected enemy
      if (this.selectedEnemy === enemy) {
        this.selectedEnemy = null;
      }

      // Schedule respawn - index 1 is the patrolling enemy
      this.pendingRespawns.push({
        position: spawnPos,
        index: enemyIndex,
        respawnTime: performance.now() + this.RESPAWN_DELAY
      });

      console.log(`Enemy ${enemyIndex} destroyed! Will respawn in 5 seconds.`);

      // Dispose after a short delay to let death animation show
      setTimeout(() => {
        enemy.dispose();
      }, 1500);
    });

    this.enemies.push(enemy);
    return enemy;
  }

  /**
   * Check if player is aiming at the selected target
   * Returns true if the angle between player's forward direction and target is within threshold
   */
  private isAimingAtTarget(enemy: Enemy): boolean {
    if (!this.player) return false;

    const playerPos = this.player.getPosition();
    const targetPos = enemy.getPosition();

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
   * Check if a squad member is aiming at the selected target
   */
  private isAimingAtTargetFromMember(member: SquadMember, enemy: Enemy): boolean {
    const memberPos = member.getPosition();
    const targetPos = enemy.getPosition();

    // Get direction from member to target (on XZ plane)
    const directionToTarget = new Vector3(
      targetPos.x - memberPos.x,
      0,
      targetPos.z - memberPos.z
    ).normalize();

    // Get member's forward direction
    const memberForward = member.getForwardDirection();

    // Calculate angle between them using dot product
    const dot = Vector3.Dot(memberForward, directionToTarget);
    const angleRad = Math.acos(Math.min(1, Math.max(-1, dot)));
    const angleDeg = angleRad * (180 / Math.PI);

    return angleDeg <= this.AIM_ANGLE_THRESHOLD;
  }

  /**
   * Process pending target respawns
   */
  private async processRespawns(): Promise<void> {
    const currentTime = performance.now();
    const respawned: number[] = [];

    for (let i = 0; i < this.pendingRespawns.length; i++) {
      const respawn = this.pendingRespawns[i];
      if (currentTime >= respawn.respawnTime) {
        // Spawn with default rotation facing the player spawn point
        const rotationToCenter = Math.atan2(-respawn.position.x, -respawn.position.z);

        const enemy = await this.spawnEnemy(respawn.position, rotationToCenter, respawn.index);

        // Restore behavior based on enemy index
        switch (respawn.index) {
          case 1:
            // East side patrol
            enemy.setPatrolWaypoints(this.PATROL_ROUTE_EAST, 0);
            break;
          case 2:
            // West side patrol
            enemy.setPatrolWaypoints(this.PATROL_ROUTE_WEST, 0);
            break;
          case 3:
            // Random wanderer
            enemy.startWandering(new Vector3(0, 0, 0), 12);
            break;
          // Index 0 is idle guard - no patrol
        }

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
      // Player (shock troops) assets
      ASSET_PATHS.CHARACTER_IDLE,
      ASSET_PATHS.CHARACTER_WALK,
      ASSET_PATHS.CHARACTER_RUN,
      ASSET_PATHS.CHARACTER_SHOOT,
      ASSET_PATHS.CHARACTER_COVER,
      ASSET_PATHS.CHARACTER_MELEE,
      ASSET_PATHS.CHARACTER_DEATH,
      ASSET_PATHS.CARGO_CONTAINER,
      // Enemy (rebel) assets
      REBEL_ASSET_PATHS.IDLE,
      REBEL_ASSET_PATHS.WALK,
      REBEL_ASSET_PATHS.RUN,
      REBEL_ASSET_PATHS.SHOOT,
      REBEL_ASSET_PATHS.COVER,
      REBEL_ASSET_PATHS.MELEE,
      REBEL_ASSET_PATHS.DEATH
    ];

    await this.assetLoader.loadMultipleAssets(assetsToLoad, (progress) => {
      this.reportProgress(progress);
    });
  }

  private async createPlayer(): Promise<void> {
    // Legacy player creation - now handled by SquadManager
    // Keeping method for backwards compatibility but not creating player
    // since squad system is the primary control mechanism
  }

  private async createSquad(): Promise<void> {
    this.squadManager = new SquadManager(
      this.scene,
      this.assetLoader,
      this.navigationSystem || undefined
    );

    // Create squad at spawn position (offset from single player)
    const squadSpawnPosition = new Vector3(5, 0, 5);
    await this.squadManager.createSquad(squadSpawnPosition);

    // Add shadow casters for all squad members
    if (this.shadowGenerator) {
      const meshes = this.squadManager.getAllMeshes();
      for (const mesh of meshes) {
        this.shadowGenerator.addShadowCaster(mesh);
        if (mesh.receiveShadows !== undefined) {
          mesh.receiveShadows = true;
        }
      }
    }

    // Set up callbacks
    this.squadManager.setCallbacks({
      onMemberSelected: (member: SquadMember) => {
        console.log(`Selected: ${member.getDisplayName()}`);
        // Update camera to follow new member
        if (this.cameraSystem) {
          const rootMesh = member.getRootMesh();
          if (rootMesh) {
            this.cameraSystem.setTarget(rootMesh);
          }
        }
      },
      onMemberDied: (member: SquadMember) => {
        console.log(`${member.getDisplayName()} has been killed!`);
      },
      onOrderCompleted: (member: SquadMember) => {
        if (this.planningIndicatorMemberId === member.getConfig().id) {
          this.clearPlanningIndicators();
        }
      }
    });

    // Create squad panel UI
    this.squadPanel = new SquadPanel(this.scene, this.squadManager, {
      onPlanningModeChanged: () => {
        this.isPlanningToggleActive = !this.isPlanningToggleActive;
        this.updatePlanningMode();
      }
    });
  }

  private setupCamera(): void {
    this.cameraSystem = new CameraSystem(
      this.scene,
      this.engineWrapper.getCanvas()
    );

    // Set camera to follow active squad member if available, otherwise player
    if (this.squadManager) {
      const activeMember = this.squadManager.getActiveMember();
      if (activeMember) {
        const rootMesh = activeMember.getRootMesh();
        if (rootMesh) {
          this.cameraSystem.setTarget(rootMesh);
        }
      }
    } else if (this.player) {
      const playerRoot = this.player.getRootMesh();
      if (playerRoot) {
        this.cameraSystem.setTarget(playerRoot);
      }
    }

    this.setupPlanningCamera();
  }

  private setupPlanningCamera(): void {
    const planningCamera = new ArcRotateCamera(
      'planningCamera',
      GAME_CONSTANTS.CAMERA_PLANNING_ARC_ALPHA,
      GAME_CONSTANTS.CAMERA_PLANNING_ARC_BETA,
      GAME_CONSTANTS.CAMERA_PLANNING_ARC_RADIUS,
      Vector3.Zero(),
      this.scene
    );

    planningCamera.inputs.clear();
    planningCamera.inputs.addPointers();
    planningCamera.inputs.addMouseWheel();
    const pointerInput = planningCamera.inputs.attached.pointers;
    if (pointerInput) {
      // Allow touch gestures while keeping right-drag for panning; left stays for orders.
      pointerInput.buttons = [0, 2];
      pointerInput.multiTouchPanning = true;
      pointerInput.multiTouchPanAndZoom = true;
      pointerInput.pinchZoom = true;
    }
    planningCamera.lowerAlphaLimit = GAME_CONSTANTS.CAMERA_PLANNING_ARC_ALPHA;
    planningCamera.upperAlphaLimit = GAME_CONSTANTS.CAMERA_PLANNING_ARC_ALPHA;
    planningCamera.lowerBetaLimit = GAME_CONSTANTS.CAMERA_PLANNING_ARC_BETA;
    planningCamera.upperBetaLimit = GAME_CONSTANTS.CAMERA_PLANNING_ARC_BETA;
    planningCamera.lowerRadiusLimit = GAME_CONSTANTS.CAMERA_PLANNING_ARC_MIN_RADIUS;
    planningCamera.upperRadiusLimit = GAME_CONSTANTS.CAMERA_PLANNING_ARC_MAX_RADIUS;
    planningCamera.panningSensibility = GAME_CONSTANTS.CAMERA_PLANNING_PAN_SENSIBILITY;
    planningCamera.inertia = 0;

    this.planningCamera = planningCamera;
    this.computePlanningFit();
  }

  private computePlanningFit(): void {
    if (!this.planningCamera) return;

    const bounds = this.computePlanningBounds();
    if (!bounds) {
      this.planningFitRadius = GAME_CONSTANTS.CAMERA_PLANNING_ARC_RADIUS;
      this.planningFitTarget = Vector3.Zero();
      return;
    }

    this.planningMapMin = bounds.min;
    this.planningMapMax = bounds.max;

    const center = bounds.min.add(bounds.max).scale(0.5);
    const target = new Vector3(center.x, 0, center.z);
    this.planningFitTarget = target;

    const minRadius = GAME_CONSTANTS.CAMERA_PLANNING_ARC_MIN_RADIUS;
    const extents = bounds.max.subtract(bounds.min);
    const mapDiagonal = Math.sqrt(extents.x * extents.x + extents.z * extents.z);
    const maxRadius = Math.max(GAME_CONSTANTS.CAMERA_PLANNING_ARC_MAX_RADIUS, mapDiagonal * 4);
    let low = minRadius;
    let high = maxRadius;
    let best = minRadius;

    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (this.arePlanningCornersInsideMap(mid, target)) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    this.planningFitRadius = best;
  }

  private computePlanningBounds(): { min: Vector3; max: Vector3 } | null {
    let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    let hasBounds = false;

    for (const mesh of this.navMeshSources) {
      if (!mesh) continue;
      const bounds = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, bounds.minimumWorld);
      max = Vector3.Maximize(max, bounds.maximumWorld);
      hasBounds = true;
    }

    if (!hasBounds) return null;
    return { min, max };
  }

  private getPlanningCornerOffsets(radius: number, target: Vector3): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    if (!this.planningCamera) return null;

    const camera = this.planningCamera;
    const canvas = this.engineWrapper.getCanvas();
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const previousRadius = camera.radius;
    const previousTarget = camera.getTarget().clone();

    camera.radius = radius;
    camera.setTarget(target);
    camera.computeWorldMatrix(true);

    const corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height }
    ];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const corner of corners) {
      const ray = this.scene.createPickingRay(corner.x, corner.y, Matrix.Identity(), camera);
      if (Math.abs(ray.direction.y) < 1e-5) {
        continue;
      }
      const distance = (0 - ray.origin.y) / ray.direction.y;
      if (distance <= 0) {
        continue;
      }

      const hitPoint = ray.origin.add(ray.direction.scale(distance));
      const offset = hitPoint.subtract(target);
      minX = Math.min(minX, offset.x);
      maxX = Math.max(maxX, offset.x);
      minZ = Math.min(minZ, offset.z);
      maxZ = Math.max(maxZ, offset.z);
    }

    camera.radius = previousRadius;
    camera.setTarget(previousTarget);

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      return null;
    }

    return { minX, maxX, minZ, maxZ };
  }

  private arePlanningCornersInsideMap(radius: number, target: Vector3): boolean {
    if (!this.planningMapMin || !this.planningMapMax) return false;
    const offsets = this.getPlanningCornerOffsets(radius, target);
    if (!offsets) return false;

    const minX = target.x + offsets.minX;
    const maxX = target.x + offsets.maxX;
    const minZ = target.z + offsets.minZ;
    const maxZ = target.z + offsets.maxZ;

    return minX >= this.planningMapMin.x &&
      maxX <= this.planningMapMax.x &&
      minZ >= this.planningMapMin.z &&
      maxZ <= this.planningMapMax.z;
  }

  private setupInput(): void {
    this.inputManager = new InputManager(
      this.scene,
      this.engineWrapper.getCanvas(),
      this.engineWrapper.getDeviceInfo()
    );

    // Setup click-to-target picking
    this.scene.onPointerDown = (_evt, pickResult) => {
      if (this.isPlanningModeActive) {
        return;
      }
      if (pickResult.hit && pickResult.pickedMesh) {
        const metadata = pickResult.pickedMesh.metadata;
        if (metadata && metadata.type === 'enemy') {
          this.selectTarget(pickResult.pickedMesh);
        }
      }
    };

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (!this.isPlanningModeActive || !this.squadManager) return;

      const pickInfo = pointerInfo.pickInfo;
      const event = pointerInfo.event as PointerEvent | undefined;

      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        if (this.isOrderDragActive) return;
        if (event && event.button !== 0) return;

        const selectedMemberId = this.squadManager.getCommandSelectedMemberId();
        if (!selectedMemberId) return;

        if (!pickInfo?.hit || !pickInfo.pickedPoint || !pickInfo.pickedMesh?.metadata?.type) return;
        if (pickInfo.pickedMesh.metadata.type !== 'ground') return;

        this.isOrderDragActive = true;
        this.orderDragPointerId = event.pointerId ?? null;
        this.orderDragTarget = pickInfo.pickedPoint.clone();
        this.orderDragMemberId = selectedMemberId;
        this.updatePlanningIndicators(this.orderDragTarget, this.squadManager.getMember(selectedMemberId) || null);
      }

      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        if (!this.isOrderDragActive) return;
        if (this.orderDragPointerId !== null && event && event.pointerId !== this.orderDragPointerId) return;

        if (pickInfo?.hit && pickInfo.pickedPoint) {
          this.orderDragTarget = pickInfo.pickedPoint.clone();
          this.updatePlanningIndicators(this.orderDragTarget, this.squadManager.getMember(this.orderDragMemberId || '') || null);
        }
      }

      if (pointerInfo.type === PointerEventTypes.POINTERUP) {
        if (!this.isOrderDragActive) return;
        if (this.orderDragPointerId !== null && event && event.pointerId !== this.orderDragPointerId) return;

        if (this.orderDragMemberId && this.orderDragTarget) {
          this.squadManager.issueOrderToMember(
            this.orderDragMemberId,
            SquadOrderType.ADVANCE,
            this.orderDragTarget
          );
          this.planningIndicatorMemberId = this.orderDragMemberId;
        }

        this.isOrderDragActive = false;
        this.orderDragPointerId = null;
        this.orderDragTarget = null;
        this.orderDragMemberId = null;
        this.hasPlanningTarget = true;
      }
    });

    // Setup keyboard shortcuts for squad selection
    this.scene.onKeyboardObservable.add((kbInfo) => {
      if (kbInfo.type === KeyboardEventTypes.KEYDOWN) { // Key down
        const key = kbInfo.event.key;

        if (key === 'Alt') {
          if (!kbInfo.event.repeat) {
            this.isPlanningToggleActive = !this.isPlanningToggleActive;
            this.updatePlanningMode();
          }
        }

        // Number keys 1-5 to select squad members
        if (key >= '1' && key <= '5' && this.squadManager) {
          this.squadManager.selectByNumber(parseInt(key));
        }

        // Tab to cycle through squad
        if (key === 'Tab' && this.squadManager) {
          kbInfo.event.preventDefault();
          this.squadManager.selectNext();
        }

        // Order shortcuts (when not typing)
        if (this.squadManager) {
          switch (key.toLowerCase()) {
            case 'h': // Hold
              this.squadManager.issueOrderToAll(SquadOrderType.HOLD);
              console.log('Squad: HOLD position');
              break;
            case 'g': // Follow/Regroup
              this.squadManager.issueOrderToAll(SquadOrderType.FOLLOW);
              console.log('Squad: FOLLOW leader');
              break;
            case 'c': // Take cover
              this.squadManager.issueOrderToAll(SquadOrderType.TAKE_COVER);
              console.log('Squad: TAKE COVER');
              break;
          }
        }
      }

      if (kbInfo.type === KeyboardEventTypes.KEYUP) {
        // No-op for toggle mode
      }
    });
  }

  private updatePlanningMode(): void {
    const shouldBeActive = this.isPlanningToggleActive;
    if (shouldBeActive === this.isPlanningModeActive) return;

    this.isPlanningModeActive = shouldBeActive;

    if (this.isPlanningModeActive) {
      this.enterPlanningMode();
    } else {
      this.exitPlanningMode();
    }

    if (this.squadPanel) {
      this.squadPanel.setPlanningMode(this.isPlanningModeActive);
    }
  }

  private enterPlanningMode(): void {
    if (this.planningCamera) {
      this.computePlanningFit();
      const target = this.planningFitTarget ?? Vector3.Zero();
      this.planningCamera.setTarget(target);
      if (this.planningFitRadius !== null) {
        const maxRadius = this.planningFitRadius;
        this.planningCamera.upperRadiusLimit = maxRadius;
        this.planningCamera.radius = Math.max(
          GAME_CONSTANTS.CAMERA_PLANNING_ARC_MIN_RADIUS,
          Math.min(maxRadius, this.planningFitRadius)
        );
      }
      this.updatePlanningPanState();
      this.planningCamera.attachControl(this.engineWrapper.getCanvas(), false, false, 2);
      this.scene.activeCamera = this.planningCamera;
    }

    if (this.squadManager) {
      this.squadManager.handleInput(Vector2.Zero(), false, false, false, false);
    }
  }

  private exitPlanningMode(): void {
    if (this.cameraSystem) {
      if (this.planningCamera) {
        this.planningCamera.detachControl();
      }
      this.scene.activeCamera = this.cameraSystem.getCamera();
    }

    this.isOrderDragActive = false;
    this.orderDragPointerId = null;
    this.orderDragTarget = null;
    this.orderDragMemberId = null;
    this.clearPlanningIndicators();
  }

  private updatePlanningPanState(): void {
    if (!this.planningCamera || this.planningFitRadius === null) return;

    const shouldEnable = true;
    if (shouldEnable === this.planningPanEnabled) return;

    this.planningPanEnabled = shouldEnable;
    this.planningCamera.panningSensibility = shouldEnable
      ? GAME_CONSTANTS.CAMERA_PLANNING_PAN_SENSIBILITY
      : Number.POSITIVE_INFINITY;
  }

  private clampPlanningTarget(): void {
    if (!this.planningCamera || !this.planningMapMin || !this.planningMapMax) return;

    const target = this.planningCamera.getTarget();
    const offsets = this.getPlanningCornerOffsets(this.planningCamera.radius, target);
    if (!offsets) return;

    const minX = this.planningMapMin.x - offsets.minX;
    const maxX = this.planningMapMax.x - offsets.maxX;
    const minZ = this.planningMapMin.z - offsets.minZ;
    const maxZ = this.planningMapMax.z - offsets.maxZ;

    const clampedX = Math.min(maxX, Math.max(minX, target.x));
    const clampedZ = Math.min(maxZ, Math.max(minZ, target.z));

    if (clampedX !== target.x || clampedZ !== target.z) {
      this.planningCamera.setTarget(new Vector3(clampedX, target.y, clampedZ));
    }
  }

  private ensurePlanningIndicators(): void {
    if (!this.planningMarker) {
      const marker = MeshBuilder.CreateTorus(
        'planningMarker',
        { diameter: 1.5, thickness: 0.08, tessellation: 32 },
        this.scene
      );
      marker.rotation.x = Math.PI / 2;
      marker.isPickable = false;
      marker.isVisible = false;
      const markerMaterial = new StandardMaterial('planningMarkerMaterial', this.scene);
      markerMaterial.emissiveColor = new Color3(1, 0.9, 0.2);
      markerMaterial.disableLighting = true;
      markerMaterial.alpha = 0.9;
      marker.material = markerMaterial;
      this.planningMarker = marker;
    }
  }

  private updatePlanningIndicators(target: Vector3, member: SquadMember | null): void {
    this.ensurePlanningIndicators();
    if (this.planningMarker) {
      this.planningMarker.position.set(target.x, target.y + 0.15, target.z);
      this.planningMarker.isVisible = true;
    }

    if (this.planningLine) {
      this.planningLine.dispose();
      this.planningLine = null;
    }

    if (member) {
      const start = member.getPosition().clone();
      start.y += 0.15;
      const end = target.clone();
      end.y += 0.15;
      const points = [start.clone(), end];
      const line = MeshBuilder.CreateLines('planningLine', { points }, this.scene);
      line.isPickable = false;
      line.color = new Color3(1, 0.9, 0.2);
      this.planningLine = line;
    }
  }

  private clearPlanningIndicators(): void {
    if (this.planningMarker) {
      this.planningMarker.isVisible = false;
    }
    if (this.planningLine) {
      this.planningLine.dispose();
      this.planningLine = null;
    }
    this.planningIndicatorMemberId = null;
    this.hasPlanningTarget = false;
  }

  private selectTarget(mesh: AbstractMesh): void {
    // Find the enemy from the mesh metadata
    const metadata = mesh.metadata;
    if (!metadata || !metadata.enemyRef) {
      return;
    }

    const enemy = metadata.enemyRef as Enemy;

    // Check if enemy is still alive
    if (!enemy.isEnemyAlive()) {
      return;
    }

    this.selectedEnemy = enemy;
    console.log(`Target selected: Enemy ${enemy.getIndex()}, Health: ${enemy.getHealth()}`);
  }

  private damageSelectedTarget(damage: number): void {
    if (!this.selectedEnemy) {
      console.log('No target selected!');
      return;
    }

    if (!this.selectedEnemy.isEnemyAlive()) {
      this.selectedEnemy = null;
      return;
    }

    this.selectedEnemy.takeDamage(damage);
    console.log(`Hit! Enemy health: ${this.selectedEnemy.getHealth()}`);
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

      // Note: Do NOT add collision mesh to navMeshSources - those define WALKABLE surfaces
      // Instead, we add cover objects as dynamic obstacles in setupNavigation()

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

    if (this.inputManager) {
      const movement = this.inputManager.getMovementVector();
      const isSprinting = this.inputManager.isActionPressed('sprint');
      const isShooting = this.inputManager.isActionJustPressed('shoot');
      const isMelee = this.inputManager.isActionJustPressed('melee');
      const isCover = this.inputManager.isActionJustPressed('cover');

      // Route input to squad manager (active member)
      if (this.squadManager) {
        if (this.isPlanningModeActive) {
          this.squadManager.handleInput(Vector2.Zero(), false, false, false, false);
        } else {
          this.squadManager.handleInput(movement, isSprinting, isShooting, isMelee, isCover);

          // Damage selected target when shooting - only if aiming at it
          const activeMember = this.squadManager.getActiveMember();
          if (isShooting && this.selectedEnemy && this.selectedEnemy.isEnemyAlive() && activeMember) {
            if (this.isAimingAtTargetFromMember(activeMember, this.selectedEnemy)) {
              this.damageSelectedTarget(25);
            } else {
              console.log('Missed! Not aiming at target.');
            }
          }
        }
      } else if (this.player) {
        // Fallback to legacy player if no squad
        if (this.isPlanningModeActive) {
          this.player.handleInput(Vector2.Zero(), false, false, false, false);
        } else {
          this.player.handleInput(movement, isSprinting, isShooting, isMelee, isCover);

          if (isShooting && this.selectedEnemy && this.selectedEnemy.isEnemyAlive()) {
            if (this.isAimingAtTarget(this.selectedEnemy)) {
              this.damageSelectedTarget(25);
            } else {
              console.log('Missed! Not aiming at target.');
            }
          }
        }

        this.player.update(deltaTime);
      }

      // Handle camera zoom
      const zoomDelta = this.inputManager.consumeZoomDelta();
      if (zoomDelta !== 0) {
        if (!this.isPlanningModeActive && this.cameraSystem) {
          if (zoomDelta > 0) {
            this.cameraSystem.zoomOut(zoomDelta);
          } else {
            this.cameraSystem.zoomIn(-zoomDelta);
          }
        }
      }

      this.inputManager.clearJustPressed();
    }

    if (this.cameraSystem) {
      this.cameraSystem.update(deltaTime);
    }

    if (this.isPlanningModeActive && this.planningCamera) {
      this.clampPlanningTarget();
    }

    // Update squad
    if (this.squadManager) {
      this.squadManager.update(deltaTime);
    }

    // Update enemies
    for (const enemy of this.enemies) {
      enemy.update(deltaTime);
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

  public getSquadManager(): SquadManager | null {
    return this.squadManager;
  }

  public getCoverSystem(): CoverSystem | null {
    return this.coverSystem;
  }

  public dispose(): void {
    this.stop();

    if (this.player) {
      this.player.dispose();
    }

    if (this.squadManager) {
      this.squadManager.dispose();
    }

    if (this.squadPanel) {
      this.squadPanel.dispose();
    }

    for (const enemy of this.enemies) {
      enemy.dispose();
    }
    this.enemies = [];

    if (this.coverSystem) {
      this.coverSystem.dispose();
    }

    if (this.navigationSystem) {
      this.navigationSystem.dispose();
    }

    if (this.inputManager) {
      this.inputManager.dispose();
    }

    this.assetLoader.dispose();
    this.scene.dispose();
    this.engineWrapper.dispose();
  }
}
