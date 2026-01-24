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

  // Order system
  private currentOrder: SquadOrder | null = null;
  private orderState: OrderExecutionState = OrderExecutionState.IDLE;

  // Navigation for AI movement
  private navigationSystem: NavigationSystem | null = null;
  private agentIndex: number = -1;

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

    if (this.isPlayerControlled) {
      // Player-controlled: apply rotation and movement from input
      this.applyRotation(deltaTime);

      if (!this.isPerformingAction && !this.stats.isInCover) {
        this.applyMovement(deltaTime);
      }
    } else {
      // AI-controlled: execute orders or follow leader
      this.updateAI(deltaTime);
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
      case SquadOrderType.HOLD:
        this.executeHold();
        break;
      case SquadOrderType.ADVANCE:
        this.executeAdvance(deltaTime);
        break;
      case SquadOrderType.FALLBACK:
        this.executeFallback(deltaTime);
        break;
      case SquadOrderType.FOLLOW:
        this.followLeader(deltaTime);
        break;
      case SquadOrderType.TAKE_COVER:
        this.executeTakeCover();
        break;
      case SquadOrderType.ATTACK:
        this.executeAttack(deltaTime);
        break;
    }
  }

  private executeHold(): void {
    this.targetVelocity.setAll(0);
    this.animationController.transition(AnimationState.IDLE);
    this.orderState = OrderExecutionState.EXECUTING;
  }

  private executeAdvance(deltaTime: number): void {
    if (!this.currentOrder?.target) return;

    const targetPos = this.currentOrder.target;
    const currentPos = this.getPosition();
    const distance = Vector3.Distance(currentPos, targetPos);

    if (distance < 1.0) {
      this.orderState = OrderExecutionState.COMPLETED;
      this.currentOrder = null;
      this.animationController.transition(AnimationState.IDLE);
      return;
    }

    this.moveToward(targetPos, deltaTime);
  }

  private executeFallback(deltaTime: number): void {
    if (!this.currentOrder?.target) return;

    const targetPos = this.currentOrder.target;
    const currentPos = this.getPosition();
    const distance = Vector3.Distance(currentPos, targetPos);

    if (distance < 1.0) {
      this.orderState = OrderExecutionState.COMPLETED;
      this.currentOrder = null;
      this.animationController.transition(AnimationState.IDLE);
      return;
    }

    this.moveToward(targetPos, deltaTime);
  }

  private executeTakeCover(): void {
    // For now, just go into cover stance
    if (!this.stats.isInCover) {
      this.stats.isInCover = true;
      this.animationController.transition(AnimationState.COVER);
    }
    this.orderState = OrderExecutionState.COMPLETED;
  }

  private executeAttack(deltaTime: number): void {
    // Move toward target and engage
    if (this.currentOrder?.target) {
      const targetPos = this.currentOrder.target;
      const currentPos = this.getPosition();
      const distance = Vector3.Distance(currentPos, targetPos);

      if (distance < 10.0) {
        // In range - attack
        this.targetVelocity.setAll(0);
        this.rotateToward(targetPos, deltaTime);
        // Periodic shooting would be handled here
      } else {
        this.moveToward(targetPos, deltaTime);
      }
    }
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

    const currentPos = this.getPosition();
    const distance = Vector3.Distance(currentPos, targetPos);
    const stopDistance = 0.2;
    const slowRadius = 4.0;

    if (distance > stopDistance) {
      const speedMultiplier = Math.min(1, Math.max(0.4, distance / slowRadius));
      this.moveToward(targetPos, deltaTime, speedMultiplier);
    } else {
      this.targetVelocity.setAll(0);
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

    // Exit cover if moving
    if (order.type !== SquadOrderType.HOLD && order.type !== SquadOrderType.TAKE_COVER) {
      if (this.stats.isInCover) {
        this.stats.isInCover = false;
        this.animationController.transition(AnimationState.IDLE);
      }
    }
  }

  public cancelOrder(): void {
    this.currentOrder = null;
    this.orderState = OrderExecutionState.IDLE;
  }

  public getCurrentOrder(): SquadOrder | null {
    return this.currentOrder;
  }

  public getOrderState(): OrderExecutionState {
    return this.orderState;
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
    if (this.currentOrder) return UnitStatus.MOVING;
    return UnitStatus.IDLE;
  }

  public getRootMesh(): AbstractMesh | null {
    return this.animationController.getRootMesh();
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
