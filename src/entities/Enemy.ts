import {
  Scene,
  Vector3,
  AbstractMesh,
  TransformNode,
  MeshBuilder,
  Mesh
} from '@babylonjs/core';
import { AssetLoader } from '../core/AssetLoader';
import { EnemyAnimationController } from './EnemyAnimationController';
import { AnimationState } from '../types/AnimationTypes';
import { NavigationSystem } from '../systems/NavigationSystem';
import { MuzzleFlash } from '../effects/MuzzleFlash';

export class Enemy {
  private scene: Scene;
  private assetLoader: AssetLoader;
  private name: string;
  private index: number;

  private rootNode: TransformNode;
  private animationController: EnemyAnimationController;
  private muzzleFlash: MuzzleFlash | null = null;
  private collisionMesh: Mesh | null = null;
  private meshes: AbstractMesh[] = [];

  private health: number = 100;
  private maxHealth: number = 100;
  private isAlive: boolean = true;
  private spawnPosition: Vector3;

  private fireCooldown: number = 0;
  private readonly fireInterval: number = 0.8;

  private onDeathCallback: (() => void) | null = null;

  // Navigation system
  private navigationSystem: NavigationSystem | null = null;
  private agentIndex: number = -1;

  // Patrol behavior
  private patrolWaypoints: Vector3[] = [];
  private currentWaypointIndex: number = 0;
  private isPatrolling: boolean = false;
  private readonly WAYPOINT_THRESHOLD: number = 1.5;
  private readonly ROTATION_SMOOTHING: number = 0.1;

  // Random wandering behavior
  private isWandering: boolean = false;
  private wanderCenter: Vector3 = Vector3.Zero();
  private wanderRadius: number = 10;
  private wanderWaitTime: number = 0;
  private readonly WANDER_MIN_WAIT: number = 1.0;  // Min seconds to wait at destination
  private readonly WANDER_MAX_WAIT: number = 3.0;  // Max seconds to wait at destination

  // Combat behavior
  private combatTarget: Vector3 | null = null;
  private isEngaging: boolean = false;
  private engageRepathTimer: number = 0;
  private readonly ENGAGE_REPATH_INTERVAL: number = 0.5;
  private readonly ENGAGE_RANGE: number = 12;
  private readonly ATTACK_RANGE: number = 8;

  constructor(scene: Scene, assetLoader: AssetLoader, name: string, index: number) {
    this.scene = scene;
    this.assetLoader = assetLoader;
    this.name = name;
    this.index = index;
    this.spawnPosition = Vector3.Zero();

    this.rootNode = new TransformNode(`${name}_root`, scene);
    this.animationController = new EnemyAnimationController(scene, assetLoader, name);
  }

  public async initialize(): Promise<void> {
    const { rootMesh } = await this.animationController.initialize();

    if (rootMesh) {
      rootMesh.parent = this.rootNode;
      rootMesh.position = Vector3.Zero();

      this.collectMeshes(rootMesh);

      // Make all meshes pickable for targeting
      for (const mesh of this.meshes) {
        mesh.isPickable = true;
        mesh.metadata = {
          type: 'enemy',
          index: this.index,
          enemyRef: this
        };
      }
    }

    this.setupCollisionMesh();
    this.muzzleFlash = new MuzzleFlash(this.scene, this.rootNode);
  }

  private setupCollisionMesh(): void {
    this.collisionMesh = MeshBuilder.CreateCapsule(
      `${this.name}_collision`,
      {
        height: 2.0,
        radius: 0.5
      },
      this.scene
    );

    this.collisionMesh.parent = this.rootNode;
    this.collisionMesh.position = new Vector3(0, 1.0, 0);
    this.collisionMesh.isVisible = false;
    this.collisionMesh.isPickable = false;
    this.collisionMesh.checkCollisions = true;
  }

  private collectMeshes(root: AbstractMesh): void {
    this.meshes = [root];
    const children = root.getChildMeshes();
    this.meshes.push(...children);
  }

  public setNavigationSystem(navSystem: NavigationSystem): void {
    this.navigationSystem = navSystem;
  }

  public registerAsAgent(): void {
    if (!this.navigationSystem || !this.navigationSystem.isReady()) {
      console.warn('Cannot register agent: Navigation system not ready');
      return;
    }

    // Register this enemy as a crowd agent
    this.agentIndex = this.navigationSystem.addAgent(
      this.rootNode.position,
      this.rootNode,
      {
        radius: 0.5,
        height: 1.8,
        maxAcceleration: 4.0,
        maxSpeed: 2.0,
        collisionQueryRange: 2.5,
        pathOptimizationRange: 0.0,
        separationWeight: 1.0
      }
    );

    // Listen for when agent reaches target
    this.navigationSystem.onAgentReachTarget((agentIdx) => {
      if (agentIdx === this.agentIndex && this.isPatrolling) {
        this.goToNextWaypoint();
      }
    });

    console.log(`Enemy ${this.name} registered as agent ${this.agentIndex}`);
  }

  public setPosition(position: Vector3): void {
    this.rootNode.position = position.clone();
    this.spawnPosition = position.clone();

    // If using navigation, teleport the agent
    if (this.navigationSystem && this.agentIndex >= 0) {
      this.navigationSystem.agentTeleport(this.agentIndex, position);
    }
  }

  public getPosition(): Vector3 {
    return this.rootNode.position.clone();
  }

  public setRotation(rotation: number): void {
    this.rootNode.rotation.y = rotation;
  }

  public setPatrolWaypoints(waypoints: Vector3[], startingIndex: number = 0): void {
    this.patrolWaypoints = waypoints.map(w => w.clone());
    if (waypoints.length > 0) {
      this.isPatrolling = true;
      // Allow starting at any waypoint index for variety
      this.currentWaypointIndex = startingIndex % waypoints.length;
      this.animationController.transition(AnimationState.WALK);

      // Start navigating to first waypoint
      this.goToNextWaypoint();
    }
  }

  private goToNextWaypoint(): void {
    if (!this.isPatrolling || this.patrolWaypoints.length === 0) return;

    const targetWaypoint = this.patrolWaypoints[this.currentWaypointIndex];

    if (this.navigationSystem && this.agentIndex >= 0) {
      this.navigationSystem.agentGoto(this.agentIndex, targetWaypoint);
    }

    // Move to next waypoint index for next time
    this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.patrolWaypoints.length;
  }

  public stopPatrol(): void {
    this.isPatrolling = false;
    this.isWandering = false;
    this.animationController.transition(AnimationState.IDLE);
  }

  public setCombatTarget(target: Vector3): void {
    this.combatTarget = target.clone();
    this.isEngaging = true;
    this.isPatrolling = false;
    this.isWandering = false;
    this.wanderWaitTime = 0;
    this.engageRepathTimer = 0;
  }

  public clearCombatTarget(): void {
    this.isEngaging = false;
    this.combatTarget = null;
  }

  public isEngagingTarget(): boolean {
    return this.isEngaging;
  }

  public isPatrollingActive(): boolean {
    return this.isPatrolling;
  }

  public isWanderingActive(): boolean {
    return this.isWandering;
  }

  /**
   * Start random wandering behavior within a radius of a center point
   */
  public startWandering(center: Vector3, radius: number): void {
    this.wanderCenter = center.clone();
    this.wanderRadius = radius;
    this.isWandering = true;
    this.isPatrolling = false;
    this.wanderWaitTime = 0;
    this.animationController.transition(AnimationState.WALK);

    // Pick first random destination
    this.pickRandomWanderTarget();
  }

  private pickRandomWanderTarget(): void {
    if (!this.navigationSystem || this.agentIndex < 0) return;

    // Pick a random point within the wander radius
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.wanderRadius;

    const targetX = this.wanderCenter.x + Math.cos(angle) * distance;
    const targetZ = this.wanderCenter.z + Math.sin(angle) * distance;
    const target = new Vector3(targetX, 0, targetZ);

    // Try to find closest point on navmesh
    const closestPoint = this.navigationSystem.getClosestPoint(target);
    if (closestPoint) {
      this.navigationSystem.agentGoto(this.agentIndex, closestPoint);
    } else {
      // Fallback to original target
      this.navigationSystem.agentGoto(this.agentIndex, target);
    }
  }

  public getSpawnPosition(): Vector3 {
    return this.spawnPosition.clone();
  }

  public getIndex(): number {
    return this.index;
  }

  public getHealth(): number {
    return this.health;
  }

  public getMaxHealth(): number {
    return this.maxHealth;
  }

  public getAttackRange(): number {
    return this.ATTACK_RANGE;
  }

  public isEnemyAlive(): boolean {
    return this.isAlive;
  }

  public takeDamage(amount: number, _source?: Vector3): void {
    if (!this.isAlive) return;

    this.health = Math.max(0, this.health - amount);

    if (this.health <= 0) {
      this.die();
    }
  }

  public tryShoot(): boolean {
    if (!this.isAlive) return false;
    if (this.fireCooldown > 0) return false;

    this.fireCooldown = this.fireInterval;
    if (this.muzzleFlash) {
      this.muzzleFlash.trigger();
    }
    this.animationController.playOnce(AnimationState.SHOOT);
    return true;
  }

  public onDeath(callback: () => void): void {
    this.onDeathCallback = callback;
  }

  private die(): void {
    this.isAlive = false;
    this.isPatrolling = false;

    // Remove from navigation crowd
    if (this.navigationSystem && this.agentIndex >= 0) {
      this.navigationSystem.removeAgent(this.agentIndex);
      this.agentIndex = -1;
    }

    // Disable collision when dead
    if (this.collisionMesh) {
      this.collisionMesh.checkCollisions = false;
    }

    // Play death animation
    this.animationController.playOnce(AnimationState.DEATH, () => {
      // After death animation completes, notify callback
      if (this.onDeathCallback) {
        this.onDeathCallback();
      }
    });
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

  public getName(): string {
    return this.name;
  }

  public update(deltaTime: number): void {
    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - deltaTime);
    }

    // Update rotation based on agent velocity (for smooth turning)
    if (this.isAlive && this.navigationSystem && this.agentIndex >= 0) {
      // Force Y to ground level (navmesh may have slight height offset)
      this.rootNode.position.y = 0;

      if (this.isEngaging && this.combatTarget) {
        this.updateEngagement(deltaTime);
      } else if (this.isPatrolling) {
        const velocity = this.navigationSystem.getAgentVelocity(this.agentIndex);
        const isMoving = velocity.length() > 0.2;

        if (isMoving) {
          // Agent is moving - update rotation to face movement direction
          const targetRotation = Math.atan2(velocity.x, velocity.z);

          // Smooth rotation
          let currentRotation = this.rootNode.rotation.y;
          let rotationDiff = targetRotation - currentRotation;

          // Normalize angle difference to [-PI, PI]
          while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
          while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

          this.rootNode.rotation.y = currentRotation + rotationDiff * this.ROTATION_SMOOTHING;

          // Ensure walk animation is playing while moving
          if (!this.animationController.isInState(AnimationState.WALK)) {
            this.animationController.transition(AnimationState.WALK);
          }

          // Reset wander wait time when moving
          this.wanderWaitTime = 0;
        }

        // Agent stopped but patrolling - check if we need to go to next waypoint
        const currentPos = this.rootNode.position;
        const targetWaypoint = this.patrolWaypoints[
          (this.currentWaypointIndex + this.patrolWaypoints.length - 1) % this.patrolWaypoints.length
        ];
        const distance = Vector3.Distance(
          new Vector3(currentPos.x, 0, currentPos.z),
          new Vector3(targetWaypoint.x, 0, targetWaypoint.z)
        );

        if (distance < this.WAYPOINT_THRESHOLD) {
          // Reached waypoint, go to next
          this.goToNextWaypoint();
        }
      } else if (this.isWandering) {
        const velocity = this.navigationSystem.getAgentVelocity(this.agentIndex);
        const isMoving = velocity.length() > 0.2;

        if (isMoving) {
          const targetRotation = Math.atan2(velocity.x, velocity.z);
          let currentRotation = this.rootNode.rotation.y;
          let rotationDiff = targetRotation - currentRotation;

          while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
          while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

          this.rootNode.rotation.y = currentRotation + rotationDiff * this.ROTATION_SMOOTHING;

          if (!this.animationController.isInState(AnimationState.WALK)) {
            this.animationController.transition(AnimationState.WALK);
          }
          this.wanderWaitTime = 0;
          return;
        }

        // Agent stopped while wandering - wait then pick new destination
        this.wanderWaitTime += deltaTime;

        // Play idle animation while waiting
        if (!this.animationController.isInState(AnimationState.IDLE)) {
          this.animationController.transition(AnimationState.IDLE);
        }

        // Random wait time between min and max
        const waitDuration = this.WANDER_MIN_WAIT + Math.random() * (this.WANDER_MAX_WAIT - this.WANDER_MIN_WAIT);
        if (this.wanderWaitTime >= waitDuration) {
          this.wanderWaitTime = 0;
          this.pickRandomWanderTarget();
          this.animationController.transition(AnimationState.WALK);
        }
      }
    }

    this.animationController.update(deltaTime);
  }

  private updateEngagement(deltaTime: number): void {
    if (!this.navigationSystem || this.agentIndex < 0 || !this.combatTarget) return;

    const currentPos = this.rootNode.position;
    const distance = Vector3.Distance(currentPos, this.combatTarget);

    if (distance > this.ATTACK_RANGE) {
      this.engageRepathTimer += deltaTime;
      if (this.engageRepathTimer >= this.ENGAGE_REPATH_INTERVAL) {
        const navTarget = this.navigationSystem.getClosestPoint(this.combatTarget) || this.combatTarget;
        this.navigationSystem.agentGoto(this.agentIndex, navTarget);
        this.engageRepathTimer = 0;
      }

      const velocity = this.navigationSystem.getAgentVelocity(this.agentIndex);
      if (velocity.length() > 0.2) {
        const targetRotation = Math.atan2(velocity.x, velocity.z);
        let currentRotation = this.rootNode.rotation.y;
        let rotationDiff = targetRotation - currentRotation;

        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

        this.rootNode.rotation.y = currentRotation + rotationDiff * this.ROTATION_SMOOTHING;
      }

      if (!this.animationController.isInState(AnimationState.WALK)) {
        this.animationController.transition(AnimationState.WALK);
      }
      return;
    }

    // In attack range: stop movement and face target
    this.navigationSystem.agentTeleport(this.agentIndex, currentPos);

    const direction = this.combatTarget.subtract(currentPos);
    direction.y = 0;
    if (direction.length() > 0.1) {
      direction.normalize();
      const targetRotation = Math.atan2(direction.x, direction.z);
      let currentRotation = this.rootNode.rotation.y;
      let rotationDiff = targetRotation - currentRotation;

      while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
      while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

      this.rootNode.rotation.y = currentRotation + rotationDiff * this.ROTATION_SMOOTHING;
    }

    if (!this.animationController.isInState(AnimationState.IDLE) &&
        !this.animationController.isInState(AnimationState.SHOOT)) {
      this.animationController.transition(AnimationState.IDLE);
    }
  }

  public dispose(): void {
    // Remove from navigation crowd before disposing
    if (this.navigationSystem && this.agentIndex >= 0) {
      this.navigationSystem.removeAgent(this.agentIndex);
      this.agentIndex = -1;
    }

    if (this.collisionMesh) {
      this.collisionMesh.dispose();
      this.collisionMesh = null;
    }
    if (this.muzzleFlash) {
      this.muzzleFlash.dispose();
      this.muzzleFlash = null;
    }
    this.animationController.dispose();
    this.rootNode.dispose();
    this.meshes = [];
  }
}
