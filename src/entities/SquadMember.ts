import {
  Scene,
  Vector3,
  Vector2,
  AbstractMesh,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3
} from '@babylonjs/core';
import { AssetLoader } from '../core/AssetLoader';
import { Unit } from './Unit';
import { CharacterAnimationController } from './CharacterAnimationController';
import { AnimationState } from '../types/AnimationTypes';
import { MuzzleFlash } from '../effects/MuzzleFlash';
import { GAME_CONSTANTS } from '../utils/Constants';
import {
  SquadMemberConfig,
  SquadOrder,
  SquadOrderType,
  OrderExecutionState,
  UnitStatus
} from '../types/SquadTypes';
import { NavigationSystem } from '../systems/NavigationSystem';

/**
 * SquadMember - A controllable squad unit that can switch between player input and AI control.
 * Extends the Unit base class with squad-specific functionality.
 */
export class SquadMember extends Unit {
  private config: SquadMemberConfig;
  private animationController: CharacterAnimationController;
  private muzzleFlash: MuzzleFlash | null = null;

  // Control state
  private isPlayerControlled: boolean = false;
  private isPerformingAction: boolean = false;
  private fireCooldown: number = 0;
  private readonly fireInterval: number = 0.7;
  private lastHitSource: Vector3 | null = null;
  private lastHitTimer: number = 0;
  private readonly hitMemoryDuration: number = 2.5;

  // Order system
  private currentOrder: SquadOrder | null = null;
  private orderState: OrderExecutionState = OrderExecutionState.IDLE;
  private completedOrder: SquadOrder | null = null;
  private reconTimer: number = 0;
  private readonly reconDuration: number = 3.0;
  private patrolCenter: Vector3 | null = null;
  private patrolWaypoints: Vector3[] = [];
  private patrolWaypointIndex: number = 0;
  private readonly patrolWaypointThreshold: number = 1.5;
  private readonly patrolRadius: number = 6;

  // Navigation for AI movement
  private navigationSystem: NavigationSystem | null = null;
  private agentIndex: number = -1;
  private lastNavTarget: Vector3 | null = null;
  private navStallTimer: number = 0;
  private lastNavSpeed: number | null = null;
  private navMovementRequested: boolean = false;

  // Selection indicator
  private selectionRing: Mesh | null = null;
  private isSelected: boolean = false;

  // AI follow target
  private followTarget: SquadMember | null = null;
  private formationOffset: Vector3 = Vector3.Zero();

  constructor(
    scene: Scene,
    assetLoader: AssetLoader,
    config: SquadMemberConfig,
    navigationSystem?: NavigationSystem
  ) {
    super(scene, assetLoader, config.id);
    this.config = config;
    this.animationController = new CharacterAnimationController(scene, assetLoader, config.id);
    if (navigationSystem) {
      this.navigationSystem = navigationSystem;
    }
  }

  public async initialize(): Promise<void> {
    // CharacterAnimationController now uses characterId from constructor for unique mesh instances
    const { rootMesh } = await this.animationController.initialize();

    if (rootMesh) {
      rootMesh.parent = this.rootNode;
      rootMesh.position = Vector3.Zero();
      this.collectMeshes(rootMesh);
    }

    this.setupCollisionMesh(2.0, 0.8);
    this.muzzleFlash = new MuzzleFlash(this.scene, this.rootNode);
    this.createSelectionRing();

    // Register with navigation system only when explicitly enabled
    if (this.navigationSystem && this.config.useNavAgent) {
      this.registerAsAgent();
    }
  }

  /**
   * Register this squad member as a navigation agent for AI pathfinding
   */
  private registerAsAgent(): void {
    if (!this.navigationSystem) return;

    const position = this.getPosition();
    this.agentIndex = this.navigationSystem.addAgent(position, this.rootNode, {
      radius: 0.5,
      height: 1.8,
      maxSpeed: this.stats.moveSpeed,
      maxAcceleration: 4.0
    });
    this.lastNavSpeed = this.stats.moveSpeed;
  }

  /**
   * Create a selection ring indicator under the squad member
   */
  private createSelectionRing(): void {
    this.selectionRing = MeshBuilder.CreateTorus(
      `${this.name}_selection_ring`,
      {
        diameter: 1.5,
        thickness: 0.08,
        tessellation: 32
      },
      this.scene
    );

    this.selectionRing.parent = this.rootNode;
    this.selectionRing.position.y = 0.05;
    this.selectionRing.rotation.x = Math.PI / 2;

    const material = new StandardMaterial(`${this.name}_selection_material`, this.scene);
    material.emissiveColor = new Color3(0, 1, 0);
    material.disableLighting = true;
    material.alpha = 0.7;
    this.selectionRing.material = material;

    this.selectionRing.isVisible = false;
  }

  /**
   * Handle player input when this member is being controlled
   */
  public handleInput(
    movement: Vector2,
    isSprinting: boolean,
    isShooting: boolean,
    isMelee: boolean,
    isCover: boolean
  ): void {
    if (!this.stats.isAlive) return;
    if (!this.isPlayerControlled) return;

    if (this.isPerformingAction) {
      return;
    }

    if (isShooting) {
      this.performShoot();
      return;
    }

    if (isMelee) {
      this.performMelee();
      return;
    }

    if (isCover) {
      this.toggleCover();
      return;
    }

    if (this.stats.isInCover) {
      return;
    }

    // Rotation: movement.x controls turn speed
    const rotationInput = movement.x;
    if (Math.abs(rotationInput) > 0.1) {
      this.targetRotationVelocity = rotationInput * GAME_CONSTANTS.CHARACTER_TURN_SPEED;
    } else {
      this.targetRotationVelocity = 0;
    }

    // Forward/Backward movement
    const forwardInput = movement.y;

    if (Math.abs(forwardInput) > 0.1) {
      const speed = isSprinting
        ? this.stats.moveSpeed * this.stats.sprintMultiplier
        : this.stats.moveSpeed;

      this.targetVelocity.x = Math.sin(this.currentRotation) * forwardInput * speed;
      this.targetVelocity.z = Math.cos(this.currentRotation) * forwardInput * speed;

      if (isSprinting && forwardInput > 0) {
        this.animationController.transition(AnimationState.RUN);
      } else {
        this.animationController.transition(AnimationState.WALK);
      }
    } else {
      this.targetVelocity.x = 0;
      this.targetVelocity.z = 0;

      const currentSpeed = Math.sqrt(
        this.currentVelocity.x * this.currentVelocity.x +
        this.currentVelocity.z * this.currentVelocity.z
      );
      if (currentSpeed < 0.5 && Math.abs(this.rotationVelocity) < 0.1) {
        this.animationController.transition(AnimationState.IDLE);
      }
    }
  }

  private performShoot(): void {
    this.isPerformingAction = true;
    this.currentVelocity.setAll(0);
    this.targetVelocity.setAll(0);

    if (this.muzzleFlash) {
      this.muzzleFlash.trigger();
    }

    this.animationController.playOnce(AnimationState.SHOOT, () => {
      this.isPerformingAction = false;
    });
  }

  private performMelee(): void {
    this.isPerformingAction = true;
    this.currentVelocity.setAll(0);
    this.targetVelocity.setAll(0);

    this.animationController.playOnce(AnimationState.MELEE, () => {
      this.isPerformingAction = false;
    });
  }

  public tryShoot(): boolean {
    if (!this.stats.isAlive) return false;
    if (this.fireCooldown > 0 || this.isPerformingAction) return false;

    this.fireCooldown = this.fireInterval;
    this.performShoot();
    return true;
  }

  private toggleCover(): void {
    if (this.stats.isInCover) {
      this.stats.isInCover = false;
      this.animationController.transition(AnimationState.IDLE);
    } else {
      this.stats.isInCover = true;
      this.currentVelocity.setAll(0);
      this.targetVelocity.setAll(0);
      this.animationController.transition(AnimationState.COVER);
    }
  }

  public update(deltaTime: number): void {
    if (!this.stats.isAlive) return;

    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - deltaTime);
    }
    if (this.lastHitTimer > 0) {
      this.lastHitTimer = Math.max(0, this.lastHitTimer - deltaTime);
      if (this.lastHitTimer === 0) {
        this.lastHitSource = null;
      }
    }

    this.navMovementRequested = false;

    if (this.isPlayerControlled) {
      // Player-controlled: apply rotation and movement from input
      this.applyRotation(deltaTime);

      if (!this.isPerformingAction && !this.stats.isInCover) {
        this.applyMovement(deltaTime);
      }

      if (this.canUseNavAgent()) {
        // Keep nav agent in sync so the crowd doesn't override player movement.
        this.navigationSystem!.agentTeleport(this.agentIndex, this.rootNode.position);
      }
    } else {
      // AI-controlled: execute orders or follow leader
      this.updateAI(deltaTime);
    }

    if (!this.isPlayerControlled && this.canUseNavAgent()) {
      this.updateNavRotation(deltaTime);
      this.syncCollisionMesh();
    }

    this.animationController.update(deltaTime);

    // Update selection ring visibility
    if (this.selectionRing) {
      this.selectionRing.isVisible = this.isPlayerControlled || this.isSelected;

      // Different color for active vs selected
      const material = this.selectionRing.material as StandardMaterial;
      if (this.isPlayerControlled) {
        material.emissiveColor = new Color3(1, 0.84, 0); // Gold for active
      } else if (this.isSelected) {
        material.emissiveColor = new Color3(0, 1, 0); // Green for selected
      }
    }
  }

  /**
   * AI update when not player-controlled
   */
  private updateAI(deltaTime: number): void {
    // If we have an order, execute it
    if (this.currentOrder) {
      this.executeOrder(deltaTime);
      return;
    }

    // Default behavior: follow the leader (if set)
    if (this.followTarget) {
      this.followLeader(deltaTime);
    } else {
      // No order, no leader - just idle
      this.animationController.transition(AnimationState.IDLE);
    }
  }

  /**
   * Execute the current order
   */
  private executeOrder(deltaTime: number): void {
    if (!this.currentOrder) return;

    switch (this.currentOrder.type) {
      case SquadOrderType.ENGAGE:
        this.executeEngage(deltaTime);
        break;
      case SquadOrderType.FALLBACK:
        this.executeFallback(deltaTime);
        break;
      case SquadOrderType.RECON:
        this.executeRecon(deltaTime);
        break;
      case SquadOrderType.SECURE:
        this.executeSecure(deltaTime);
        break;
      case SquadOrderType.PATROL:
        this.executePatrol(deltaTime);
        break;
    }
  }

  private executeEngage(deltaTime: number): void {
    if (!this.currentOrder?.target) {
      this.orderState = OrderExecutionState.FAILED;
      return;
    }
    this.orderState = OrderExecutionState.EXECUTING;

    const targetPos = this.currentOrder.target;
    const navTarget = this.resolveNavTarget(targetPos);
    const currentPos = this.getPosition();
    const distance = Vector3.Distance(currentPos, navTarget);

    if (distance <= 10.0) {
      this.targetVelocity.setAll(0);
      this.stopNavMovement();
      this.resetNavState();
      this.rotateToward(targetPos, deltaTime);
      if (!this.isPerformingAction && !this.animationController.isInState(AnimationState.IDLE)) {
        this.animationController.transition(AnimationState.IDLE);
      }
      return;
    }

    this.moveWithNavigation(navTarget, deltaTime);
  }

  private executeFallback(deltaTime: number): void {
    if (!this.currentOrder?.target) {
      this.orderState = OrderExecutionState.FAILED;
      return;
    }
    this.orderState = OrderExecutionState.EXECUTING;

    const targetPos = this.resolveNavTarget(this.currentOrder.target);
    const currentPos = this.getPosition();
    const distance = Vector3.Distance(currentPos, targetPos);

    if (distance < 1.0) {
      const finishedOrder = this.currentOrder;
      this.orderState = OrderExecutionState.COMPLETED;
      this.currentOrder = null;
      this.completedOrder = finishedOrder;
      this.stopNavMovement();
      this.resetNavState();
      this.animationController.transition(AnimationState.IDLE);
      return;
    }

    this.moveWithNavigation(targetPos, deltaTime);
  }

  private executeRecon(deltaTime: number): void {
    if (!this.currentOrder?.target) {
      this.orderState = OrderExecutionState.FAILED;
      return;
    }

    this.orderState = OrderExecutionState.EXECUTING;
    const targetPos = this.resolveNavTarget(this.currentOrder.target);
    const currentPos = this.getPosition();
    const distance = Vector3.Distance(currentPos, targetPos);

    if (distance < 1.0) {
      this.targetVelocity.setAll(0);
      this.stopNavMovement();
      this.resetNavState();
      this.reconTimer += deltaTime;
      if (!this.animationController.isInState(AnimationState.IDLE)) {
        this.animationController.transition(AnimationState.IDLE);
      }
      if (this.reconTimer >= this.reconDuration) {
        const finishedOrder = this.currentOrder;
        this.orderState = OrderExecutionState.COMPLETED;
        this.currentOrder = null;
        this.completedOrder = finishedOrder;
        this.reconTimer = 0;
      }
      return;
    }

    this.reconTimer = 0;
    this.moveWithNavigation(targetPos, deltaTime, 0.7);
  }

  private executeSecure(deltaTime: number): void {
    if (!this.currentOrder?.target) {
      this.orderState = OrderExecutionState.FAILED;
      return;
    }

    this.orderState = OrderExecutionState.EXECUTING;
    const targetPos = this.resolveNavTarget(this.currentOrder.target);
    const currentPos = this.getPosition();
    const distance = Vector3.Distance(currentPos, targetPos);

    if (distance < 1.0) {
      this.targetVelocity.setAll(0);
      this.stopNavMovement();
      this.resetNavState();
      if (!this.stats.isInCover) {
        this.stats.isInCover = true;
        this.animationController.transition(AnimationState.COVER);
      }
      const finishedOrder = this.currentOrder;
      this.orderState = OrderExecutionState.COMPLETED;
      this.currentOrder = null;
      this.completedOrder = finishedOrder;
      return;
    }

    this.moveWithNavigation(targetPos, deltaTime);
  }

  private executePatrol(deltaTime: number): void {
    if (!this.currentOrder?.target) {
      this.orderState = OrderExecutionState.FAILED;
      return;
    }

    this.orderState = OrderExecutionState.EXECUTING;

    if (!this.patrolCenter || Vector3.DistanceSquared(this.patrolCenter, this.currentOrder.target) > 0.1) {
      this.initializePatrolRoute(this.currentOrder.target);
    }

    if (this.patrolWaypoints.length === 0) {
      return;
    }

    const waypoint = this.patrolWaypoints[this.patrolWaypointIndex];
    const currentPos = this.getPosition();
    const distance = Vector3.Distance(currentPos, waypoint);

    if (distance < this.patrolWaypointThreshold) {
      this.patrolWaypointIndex = (this.patrolWaypointIndex + 1) % this.patrolWaypoints.length;
    }

    this.moveWithNavigation(waypoint, deltaTime, 0.8);
  }

  private initializePatrolRoute(center: Vector3): void {
    this.patrolCenter = center.clone();
    this.patrolWaypoints = [];
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI * 2 * i) / 4;
      const x = center.x + Math.cos(angle) * this.patrolRadius;
      const z = center.z + Math.sin(angle) * this.patrolRadius;
      this.patrolWaypoints.push(new Vector3(x, center.y, z));
    }
    this.patrolWaypointIndex = 0;
  }

  /**
   * Follow the squad leader maintaining formation offset
   */
  private followLeader(deltaTime: number): void {
    if (!this.followTarget) return;

    const leaderPos = this.followTarget.getPosition();
    const leaderRotation = this.followTarget.getRotation();

    // Calculate formation position relative to leader
    const offsetX = this.formationOffset.x * Math.cos(leaderRotation) -
                    this.formationOffset.z * Math.sin(leaderRotation);
    const offsetZ = this.formationOffset.x * Math.sin(leaderRotation) +
                    this.formationOffset.z * Math.cos(leaderRotation);

    const targetPos = new Vector3(
      leaderPos.x + offsetX,
      leaderPos.y,
      leaderPos.z + offsetZ
    );

    const navTarget = this.resolveNavTarget(targetPos);
    const currentPos = this.getPosition();
    const distance = Vector3.Distance(currentPos, navTarget);
    const stopDistance = 0.2;
    const slowRadius = 4.0;

    if (distance > stopDistance) {
      const speedMultiplier = Math.min(1, Math.max(0.4, distance / slowRadius));
      this.moveWithNavigation(navTarget, deltaTime, speedMultiplier);
    } else {
      this.targetVelocity.setAll(0);
      this.stopNavMovement();
      this.resetNavState();
      this.alignToRotation(leaderRotation, deltaTime);
      this.animationController.transition(AnimationState.IDLE);
    }
  }

  /**
   * Move toward a target position
   */
  private moveToward(target: Vector3, deltaTime: number, speedMultiplier: number = 1.0): void {
    const currentPos = this.getPosition();
    const direction = target.subtract(currentPos);
    direction.y = 0;
    direction.normalize();

    // Rotate toward target
    const targetAngle = Math.atan2(direction.x, direction.z);
    const angleDiff = targetAngle - this.currentRotation;
    const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

    if (Math.abs(normalizedDiff) > 0.1) {
      this.targetRotationVelocity = Math.sign(normalizedDiff) * GAME_CONSTANTS.CHARACTER_TURN_SPEED;
    } else {
      this.targetRotationVelocity = 0;
      this.currentRotation = targetAngle;
    }

    this.applyRotation(deltaTime);

    // Move forward
    const speed = this.stats.moveSpeed * speedMultiplier;
    this.targetVelocity.x = Math.sin(this.currentRotation) * speed;
    this.targetVelocity.z = Math.cos(this.currentRotation) * speed;

    this.applyMovement(deltaTime);
    this.animationController.transition(speedMultiplier > 0.7 ? AnimationState.WALK : AnimationState.WALK);
  }

  private canUseNavAgent(): boolean {
    return !!this.navigationSystem &&
      this.config.useNavAgent === true &&
      this.agentIndex >= 0 &&
      this.navigationSystem.isReady();
  }

  private resolveNavTarget(target: Vector3): Vector3 {
    if (this.navigationSystem && this.config.useNavAgent) {
      return this.navigationSystem.getClosestPoint(target);
    }
    return target;
  }

  private resetNavState(): void {
    this.lastNavTarget = null;
    this.navStallTimer = 0;
    this.navMovementRequested = false;
  }

  private updateNavSpeed(speedMultiplier: number): void {
    if (!this.canUseNavAgent()) return;
    const nav = this.navigationSystem;
    if (!nav) return;

    const desiredSpeed = this.stats.moveSpeed * speedMultiplier;
    if (this.lastNavSpeed === null || Math.abs(desiredSpeed - this.lastNavSpeed) > 0.05) {
      nav.updateAgentParameters(this.agentIndex, { maxSpeed: desiredSpeed });
      this.lastNavSpeed = desiredSpeed;
    }
  }

  private stopNavMovement(): void {
    if (!this.canUseNavAgent()) return;
    const nav = this.navigationSystem;
    if (!nav) return;
    const currentPos = this.getPosition();
    nav.agentTeleport(this.agentIndex, currentPos);
  }

  private syncCollisionMesh(): void {
    if (!this.collisionMesh) return;
    this.collisionMesh.position.x = this.rootNode.position.x;
    this.collisionMesh.position.z = this.rootNode.position.z;
    this.collisionMesh.position.y = this.rootNode.position.y + 1.0;
  }

  private updateNavRotation(deltaTime: number): void {
    if (!this.canUseNavAgent()) return;
    const nav = this.navigationSystem;
    if (!nav) return;

    const velocity = nav.getAgentVelocity(this.agentIndex);
    if (velocity.length() > 0.05) {
      const targetRotation = Math.atan2(velocity.x, velocity.z);
      this.alignToRotation(targetRotation, deltaTime);
      if (this.navMovementRequested && !this.animationController.isInState(AnimationState.WALK)) {
        this.animationController.transition(AnimationState.WALK);
      }
    } else if (!this.navMovementRequested && !this.isPerformingAction && !this.stats.isInCover) {
      if (!this.animationController.isInState(AnimationState.IDLE)) {
        this.animationController.transition(AnimationState.IDLE);
      }
    }
  }

  private moveWithNavigation(target: Vector3, deltaTime: number, speedMultiplier: number = 1.0): void {
    if (!this.canUseNavAgent()) {
      this.moveToward(target, deltaTime, speedMultiplier);
      return;
    }
    const nav = this.navigationSystem;
    if (!nav) {
      this.moveToward(target, deltaTime, speedMultiplier);
      return;
    }

    this.navMovementRequested = true;
    this.updateNavSpeed(speedMultiplier);

    const navTarget = this.resolveNavTarget(target);
    const targetChanged = !this.lastNavTarget ||
      Vector3.DistanceSquared(this.lastNavTarget, navTarget) > 0.25;

    if (targetChanged) {
      nav.agentGoto(this.agentIndex, navTarget);
      this.lastNavTarget = navTarget.clone();
      this.navStallTimer = 0;
    } else {
      const distance = Vector3.Distance(this.getPosition(), navTarget);
      const velocity = nav.getAgentVelocity(this.agentIndex);
      if (distance > 1.0 && velocity.length() < 0.05) {
        this.navStallTimer += deltaTime;
        if (this.navStallTimer > 0.5) {
          nav.agentGoto(this.agentIndex, navTarget);
          this.navStallTimer = 0;
        }
      } else {
        this.navStallTimer = 0;
      }
    }

    if (!this.animationController.isInState(AnimationState.WALK)) {
      this.animationController.transition(AnimationState.WALK);
    }
  }

  /**
   * Rotate to face a target position
   */
  private rotateToward(target: Vector3, deltaTime: number): void {
    const currentPos = this.getPosition();
    const direction = target.subtract(currentPos);
    direction.y = 0;
    direction.normalize();

    const targetAngle = Math.atan2(direction.x, direction.z);
    const angleDiff = targetAngle - this.currentRotation;
    const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

    if (Math.abs(normalizedDiff) > 0.1) {
      this.targetRotationVelocity = Math.sign(normalizedDiff) * GAME_CONSTANTS.CHARACTER_TURN_SPEED;
    } else {
      this.targetRotationVelocity = 0;
    }

    this.applyRotation(deltaTime);
  }

  private alignToRotation(targetRotation: number, deltaTime: number): void {
    const angleDiff = targetRotation - this.currentRotation;
    const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

    if (Math.abs(normalizedDiff) > 0.05) {
      this.targetRotationVelocity = Math.sign(normalizedDiff) * GAME_CONSTANTS.CHARACTER_TURN_SPEED;
    } else {
      this.targetRotationVelocity = 0;
      this.rotationVelocity = 0;
      this.currentRotation = targetRotation;
    }

    this.applyRotation(deltaTime);
  }

  public takeDamage(amount: number, source?: Vector3): void {
    if (!this.stats.isAlive) return;

    super.takeDamage(amount);

    if (!this.stats.isAlive) return;
    if (!source) return;
    this.lastHitSource = source.clone();
    this.lastHitTimer = this.hitMemoryDuration;
  }

  protected die(): void {
    this.stats.isAlive = false;
    this.stats.isInCover = false;
    this.currentVelocity.setAll(0);
    this.isPerformingAction = true;
    this.currentOrder = null;

    this.animationController.playOnce(AnimationState.DEATH);

    // Hide selection ring
    if (this.selectionRing) {
      this.selectionRing.isVisible = false;
    }
  }

  // === Control State ===

  public setPlayerControlled(controlled: boolean): void {
    this.isPlayerControlled = controlled;

    if (controlled) {
      // Taking control - cancel any AI orders
      this.currentOrder = null;
      this.orderState = OrderExecutionState.IDLE;
      this.stopNavMovement();
      this.resetNavState();
    }
  }

  public isUnderPlayerControl(): boolean {
    return this.isPlayerControlled;
  }

  public setSelected(selected: boolean): void {
    this.isSelected = selected;
  }

  public isUnitSelected(): boolean {
    return this.isSelected;
  }

  // === Order System ===

  public issueOrder(order: SquadOrder): void {
    this.currentOrder = order;
    this.orderState = OrderExecutionState.PENDING;
    this.completedOrder = null;
    this.resetNavState();
    this.reconTimer = 0;
    if (order.type !== SquadOrderType.PATROL) {
      this.patrolWaypoints = [];
      this.patrolWaypointIndex = 0;
      this.patrolCenter = null;
    }

    if (this.stats.isInCover) {
      this.stats.isInCover = false;
      this.animationController.transition(AnimationState.IDLE);
    }
  }

  public cancelOrder(): void {
    this.currentOrder = null;
    this.orderState = OrderExecutionState.IDLE;
    this.stopNavMovement();
    this.resetNavState();
  }

  public getCurrentOrder(): SquadOrder | null {
    return this.currentOrder;
  }

  public getOrderState(): OrderExecutionState {
    return this.orderState;
  }

  public consumeHitSource(): Vector3 | null {
    if (!this.lastHitSource) return null;
    const source = this.lastHitSource.clone();
    this.lastHitSource = null;
    this.lastHitTimer = 0;
    return source;
  }

  public consumeCompletedOrder(): SquadOrder | null {
    const finishedOrder = this.completedOrder;
    this.completedOrder = null;
    return finishedOrder;
  }

  // === Follow System ===

  public setFollowTarget(target: SquadMember | null, offset: Vector3 = Vector3.Zero()): void {
    this.followTarget = target;
    this.formationOffset = offset;
  }

  // === Config & Status ===

  public getConfig(): SquadMemberConfig {
    return this.config;
  }

  public getDisplayName(): string {
    return this.config.displayName;
  }

  public getRole(): string {
    return this.config.role;
  }

  public getStatus(): UnitStatus {
    if (!this.stats.isAlive) return UnitStatus.DEAD;
    if (this.isPlayerControlled) return UnitStatus.ACTIVE;
    if (this.stats.isInCover) return UnitStatus.IN_COVER;
    if (this.stats.health < this.stats.maxHealth * 0.5) return UnitStatus.WOUNDED;
    if (this.currentOrder) {
      if (this.currentOrder.type === SquadOrderType.ENGAGE) return UnitStatus.ATTACKING;
      return UnitStatus.MOVING;
    }
    return UnitStatus.IDLE;
  }

  public getRootMesh(): AbstractMesh | null {
    return this.animationController.getRootMesh();
  }

  public setPosition(position: Vector3): void {
    super.setPosition(position);

    if (this.navigationSystem && this.config.useNavAgent && this.agentIndex >= 0) {
      this.navigationSystem.agentTeleport(this.agentIndex, position);
    }
  }

  public dispose(): void {
    if (this.muzzleFlash) {
      this.muzzleFlash.dispose();
    }
    if (this.selectionRing) {
      this.selectionRing.dispose();
    }
    this.animationController.dispose();
    super.dispose();
  }
}
