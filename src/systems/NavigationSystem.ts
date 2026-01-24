import {
  Scene,
  Vector3,
  Mesh,
  TransformNode,
  StandardMaterial,
  Color3
} from '@babylonjs/core';
import { CreateNavigationPluginAsync } from '@babylonjs/addons';
import type { INavigationEnginePlugin, ICrowd, IAgentParameters } from '@babylonjs/core';

export interface NavMeshParameters {
  cs: number;           // Cell size (width/depth of voxel) in world units
  ch: number;           // Cell height in world units
  walkableSlopeAngle: number;  // Max walkable slope in degrees
  walkableHeight: number;      // Agent height in voxel units
  walkableClimb: number;       // Max step height in voxel units
  walkableRadius: number;      // Agent radius in voxel units
  maxEdgeLen: number;          // Max edge length in voxel units
  maxSimplificationError: number;
  minRegionArea: number;
  mergeRegionArea: number;
  maxVertsPerPoly: number;
  detailSampleDist: number;    // Detail sampling distance in world units
  detailSampleMaxError: number;
  borderSize?: number;         // Border size for tiled navmesh
  tileSize?: number;           // Tile size for dynamic obstacles support (required for obstacles)
}

export interface AgentConfig {
  radius: number;
  height: number;
  maxAcceleration: number;
  maxSpeed: number;
  collisionQueryRange: number;
  pathOptimizationRange: number;
  separationWeight: number;
}

const DEFAULT_NAVMESH_PARAMS: NavMeshParameters = {
  cs: 0.2,
  ch: 0.2,                // Voxel height - back to 0.2 for better performance
  walkableSlopeAngle: 35,
  walkableHeight: 10,      // 2.0 meters / 0.2 ch = 10 voxels
  walkableClimb: 2,        // 0.4 meters / 0.2 ch = 2 voxels
  walkableRadius: 3,       // 0.6 meters / 0.2 cs = 3 voxels
  maxEdgeLen: 60,          // 12 meters / 0.2 cs = 60 voxels
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
  borderSize: 1,
  tileSize: 32             // Larger tiles (32-64 recommended by docs) for obstacle support
};

const DEFAULT_AGENT_PARAMS: AgentConfig = {
  radius: 0.5,
  height: 1.8,
  maxAcceleration: 4.0,
  maxSpeed: 2.0,
  collisionQueryRange: 2.5,
  pathOptimizationRange: 0.0,
  separationWeight: 1.0
};

export class NavigationSystem {
  private scene: Scene;
  private navigationPlugin: INavigationEnginePlugin | null = null;
  private crowd: ICrowd | null = null;
  private debugMesh: Mesh | null = null;
  private isInitialized: boolean = false;
  private maxAgents: number;
  private maxAgentRadius: number;

  constructor(scene: Scene, maxAgents: number = 20, maxAgentRadius: number = 0.6) {
    this.scene = scene;
    this.maxAgents = maxAgents;
    this.maxAgentRadius = maxAgentRadius;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.navigationPlugin = await CreateNavigationPluginAsync();
      this.isInitialized = true;
      console.log('Navigation Plugin V2 initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Navigation Plugin V2:', error);
      throw error;
    }
  }

  public createNavMesh(meshes: Mesh[], params?: Partial<NavMeshParameters>): void {
    if (!this.navigationPlugin) {
      console.error('Navigation plugin not initialized');
      return;
    }

    const navMeshParams = { ...DEFAULT_NAVMESH_PARAMS, ...params };

    try {
      this.navigationPlugin.createNavMesh(meshes, navMeshParams);

      // Create crowd after navmesh is ready
      this.crowd = this.navigationPlugin.createCrowd(
        this.maxAgents,
        this.maxAgentRadius,
        this.scene
      );

      console.log('NavMesh created successfully');
    } catch (error) {
      console.error('Failed to create NavMesh:', error);
      throw error;
    }
  }

  public showDebugNavMesh(visible: boolean = true): void {
    if (!this.navigationPlugin) return;

    if (visible && !this.debugMesh) {
      this.debugMesh = this.navigationPlugin.createDebugNavMesh(this.scene);
      const debugMaterial = new StandardMaterial('navmeshDebugMat', this.scene);
      debugMaterial.diffuseColor = new Color3(0.1, 0.2, 1);
      debugMaterial.alpha = 0.3;
      debugMaterial.backFaceCulling = false;
      this.debugMesh.material = debugMaterial;
    }

    if (this.debugMesh) {
      this.debugMesh.isVisible = visible;
    }
  }

  public addAgent(
    position: Vector3,
    transform: TransformNode,
    config?: Partial<AgentConfig>
  ): number {
    if (!this.crowd || !this.navigationPlugin) {
      console.error('Crowd not initialized');
      return -1;
    }

    const agentParams: IAgentParameters = {
      ...DEFAULT_AGENT_PARAMS,
      ...config
    };

    // Get closest point on navmesh to desired position
    const navPosition = this.navigationPlugin.getClosestPoint(position);

    const agentIndex = this.crowd.addAgent(navPosition, agentParams, transform);
    console.log(`Agent added at index ${agentIndex}`);

    return agentIndex;
  }

  public removeAgent(agentIndex: number): void {
    if (!this.crowd) return;
    this.crowd.removeAgent(agentIndex);
  }

  public agentGoto(agentIndex: number, destination: Vector3): void {
    if (!this.crowd || !this.navigationPlugin) return;

    // Clamp destination to navmesh
    const navDestination = this.navigationPlugin.getClosestPoint(destination);
    this.crowd.agentGoto(agentIndex, navDestination);
  }

  public agentTeleport(agentIndex: number, position: Vector3): void {
    if (!this.crowd || !this.navigationPlugin) return;

    const navPosition = this.navigationPlugin.getClosestPoint(position);
    this.crowd.agentTeleport(agentIndex, navPosition);
  }

  public getAgentPosition(agentIndex: number): Vector3 {
    if (!this.crowd) return Vector3.Zero();
    return this.crowd.getAgentPosition(agentIndex);
  }

  public getAgentVelocity(agentIndex: number): Vector3 {
    if (!this.crowd) return Vector3.Zero();
    return this.crowd.getAgentVelocity(agentIndex);
  }

  public updateAgentParameters(agentIndex: number, params: Partial<AgentConfig>): void {
    if (!this.crowd) return;
    // Merge with defaults to ensure all required fields are present
    const fullParams: IAgentParameters = {
      ...DEFAULT_AGENT_PARAMS,
      ...params
    };
    this.crowd.updateAgentParameters(agentIndex, fullParams);
  }

  public getClosestPoint(position: Vector3): Vector3 {
    if (!this.navigationPlugin) return position;
    return this.navigationPlugin.getClosestPoint(position);
  }

  public getRandomPointAround(position: Vector3, radius: number): Vector3 {
    if (!this.navigationPlugin) return position;
    return this.navigationPlugin.getRandomPointAround(position, radius);
  }

  public computePath(start: Vector3, end: Vector3): Vector3[] {
    if (!this.navigationPlugin) return [];
    return this.navigationPlugin.computePath(
      this.navigationPlugin.getClosestPoint(start),
      this.navigationPlugin.getClosestPoint(end)
    );
  }

  public onAgentReachTarget(callback: (agentIndex: number) => void): void {
    if (!this.crowd) return;
    // The onReachTargetObservable exists on the concrete crowd implementation
    // but not on the ICrowd interface - use type assertion to access it
    const crowdWithObservable = this.crowd as ICrowd & {
      onReachTargetObservable?: {
        add: (callback: (agentInfos: { agentIndex: number }) => void) => void;
      };
    };
    if (crowdWithObservable.onReachTargetObservable) {
      crowdWithObservable.onReachTargetObservable.add((agentInfos: { agentIndex: number }) => {
        callback(agentInfos.agentIndex);
      });
    } else {
      console.warn('onReachTargetObservable not available on this crowd implementation');
    }
  }

  public getCrowd(): ICrowd | null {
    return this.crowd;
  }

  public getPlugin(): INavigationEnginePlugin | null {
    return this.navigationPlugin;
  }

  public isReady(): boolean {
    return this.isInitialized && this.navigationPlugin !== null && this.crowd !== null;
  }

  public update(): void {
    // Crowd update is handled automatically by Babylon.js
    // This method is here for future extensions if needed
  }

  /**
   * Add a box-shaped obstacle to the navmesh.
   * Requires tileSize to be set in navmesh parameters.
   * Returns an obstacle reference that can be used to remove it later.
   */
  public addBoxObstacle(position: Vector3, extent: Vector3, angle: number = 0): unknown {
    if (!this.navigationPlugin) {
      console.warn('Cannot add obstacle: Navigation plugin not initialized');
      return null;
    }

    // Use type assertion to access the obstacle methods
    const pluginWithObstacles = this.navigationPlugin as INavigationEnginePlugin & {
      addBoxObstacle?: (position: Vector3, extent: Vector3, angle: number) => unknown;
    };

    if (pluginWithObstacles.addBoxObstacle) {
      return pluginWithObstacles.addBoxObstacle(position, extent, angle);
    }
    return null;
  }

  /**
   * Add a cylinder-shaped obstacle to the navmesh.
   * Requires tileSize to be set in navmesh parameters.
   * Returns an obstacle reference that can be used to remove it later.
   */
  public addCylinderObstacle(position: Vector3, radius: number, height: number): unknown {
    if (!this.navigationPlugin) {
      console.warn('Cannot add obstacle: Navigation plugin not initialized');
      return null;
    }

    // Use type assertion to access the obstacle methods
    const pluginWithObstacles = this.navigationPlugin as INavigationEnginePlugin & {
      addCylinderObstacle?: (position: Vector3, radius: number, height: number) => unknown;
    };

    if (pluginWithObstacles.addCylinderObstacle) {
      const obstacle = pluginWithObstacles.addCylinderObstacle(position, radius, height);
      console.log(`Cylinder obstacle added at (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
      return obstacle;
    } else {
      console.warn('addCylinderObstacle not available on this navigation plugin');
      return null;
    }
  }

  /**
   * Remove an obstacle from the navmesh.
   */
  public removeObstacle(obstacle: unknown): void {
    if (!this.navigationPlugin || !obstacle) return;

    // Use type assertion to access the obstacle methods
    const pluginWithObstacles = this.navigationPlugin as INavigationEnginePlugin & {
      removeObstacle?: (obstacle: unknown) => void;
    };

    if (pluginWithObstacles.removeObstacle) {
      pluginWithObstacles.removeObstacle(obstacle);
      console.log('Obstacle removed');
    }
  }

  public dispose(): void {
    if (this.debugMesh) {
      this.debugMesh.dispose();
      this.debugMesh = null;
    }

    if (this.crowd) {
      this.crowd.dispose();
      this.crowd = null;
    }

    if (this.navigationPlugin) {
      this.navigationPlugin.dispose();
      this.navigationPlugin = null;
    }

    this.isInitialized = false;
  }
}
