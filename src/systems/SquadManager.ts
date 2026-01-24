import { Scene, Vector3, Vector2 } from '@babylonjs/core';
import { AssetLoader } from '../core/AssetLoader';
import { SquadMember } from '../entities/SquadMember';
import { NavigationSystem } from './NavigationSystem';
import {
  SquadMemberConfig,
  SquadOrder,
  SquadOrderType,
  FormationType,
  DEFAULT_SQUAD_CONFIG,
  getFormationOffsets
} from '../types/SquadTypes';

export interface SquadManagerCallbacks {
  onMemberSelected?: (member: SquadMember) => void;
  onMemberDied?: (member: SquadMember) => void;
  onOrderCompleted?: (member: SquadMember, order: SquadOrder) => void;
}

/**
 * SquadManager - Central orchestrator for all squad operations.
 * Manages squad member creation, selection, orders, and formations.
 */
export class SquadManager {
  private scene: Scene;
  private assetLoader: AssetLoader;
  private navigationSystem: NavigationSystem | null;

  private members: Map<string, SquadMember> = new Map();
  private memberOrder: string[] = []; // Track order for cycling
  private activeMemberId: string | null = null;
  private formation: FormationType = 'wedge';

  private callbacks: SquadManagerCallbacks = {};

  constructor(
    scene: Scene,
    assetLoader: AssetLoader,
    navigationSystem?: NavigationSystem
  ) {
    this.scene = scene;
    this.assetLoader = assetLoader;
    this.navigationSystem = navigationSystem || null;
  }

  /**
   * Create the full squad from config
   */
  public async createSquad(
    spawnPosition: Vector3,
    configs: SquadMemberConfig[] = DEFAULT_SQUAD_CONFIG
  ): Promise<void> {
    const formationOffsets = getFormationOffsets(this.formation);

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      const offset = formationOffsets[i] || Vector3.Zero();
      const memberPosition = spawnPosition.add(offset);

      await this.addMember(config, memberPosition);
    }

    // Set the first member as active
    if (this.memberOrder.length > 0) {
      this.selectMember(this.memberOrder[0]);
    }

    // Set up follow relationships for non-active members
    this.updateFollowRelationships();
  }

  /**
   * Add a single squad member
   */
  public async addMember(
    config: SquadMemberConfig,
    position: Vector3
  ): Promise<SquadMember> {
    console.log(`Creating squad member ${config.id} at position:`, position.toString());

    const member = new SquadMember(
      this.scene,
      this.assetLoader,
      config,
      this.navigationSystem || undefined
    );

    await member.initialize();
    member.setPosition(position);

    // Debug: verify position was set
    const actualPos = member.getPosition();
    console.log(`Squad member ${config.id} actual position after setPosition:`, actualPos.toString());

    // Debug: check mesh info
    const rootMesh = member.getRootMesh();
    if (rootMesh) {
      console.log(`Squad member ${config.id} rootMesh name: ${rootMesh.name}, position: ${rootMesh.absolutePosition.toString()}`);
    }

    this.members.set(config.id, member);
    this.memberOrder.push(config.id);

    return member;
  }

  /**
   * Remove a squad member
   */
  public removeMember(memberId: string): void {
    const member = this.members.get(memberId);
    if (member) {
      member.dispose();
      this.members.delete(memberId);
      this.memberOrder = this.memberOrder.filter(id => id !== memberId);

      // If active member was removed, select another
      if (this.activeMemberId === memberId && this.memberOrder.length > 0) {
        this.selectMember(this.memberOrder[0]);
      }
    }
  }

  /**
   * Select a squad member to control
   */
  public selectMember(memberId: string): void {
    const newMember = this.members.get(memberId);
    if (!newMember || !newMember.isAlive()) return;

    // Deactivate previous member
    if (this.activeMemberId && this.activeMemberId !== memberId) {
      const prevMember = this.members.get(this.activeMemberId);
      if (prevMember) {
        prevMember.setPlayerControlled(false);
        prevMember.setSelected(false);
      }
    }

    // Activate new member
    newMember.setPlayerControlled(true);
    newMember.setSelected(true);
    this.activeMemberId = memberId;

    // Update follow relationships
    this.updateFollowRelationships();

    // Notify callback
    if (this.callbacks.onMemberSelected) {
      this.callbacks.onMemberSelected(newMember);
    }
  }

  /**
   * Select the next squad member (cycle through)
   */
  public selectNext(): void {
    if (this.memberOrder.length === 0) return;

    const currentIndex = this.activeMemberId
      ? this.memberOrder.indexOf(this.activeMemberId)
      : -1;

    // Find next alive member
    for (let i = 1; i <= this.memberOrder.length; i++) {
      const nextIndex = (currentIndex + i) % this.memberOrder.length;
      const nextMember = this.members.get(this.memberOrder[nextIndex]);
      if (nextMember && nextMember.isAlive()) {
        this.selectMember(this.memberOrder[nextIndex]);
        return;
      }
    }
  }

  /**
   * Select the previous squad member
   */
  public selectPrevious(): void {
    if (this.memberOrder.length === 0) return;

    const currentIndex = this.activeMemberId
      ? this.memberOrder.indexOf(this.activeMemberId)
      : 0;

    // Find previous alive member
    for (let i = 1; i <= this.memberOrder.length; i++) {
      const prevIndex = (currentIndex - i + this.memberOrder.length) % this.memberOrder.length;
      const prevMember = this.members.get(this.memberOrder[prevIndex]);
      if (prevMember && prevMember.isAlive()) {
        this.selectMember(this.memberOrder[prevIndex]);
        return;
      }
    }
  }

  /**
   * Select member by number (1-5)
   */
  public selectByNumber(num: number): void {
    const index = num - 1;
    if (index >= 0 && index < this.memberOrder.length) {
      const member = this.members.get(this.memberOrder[index]);
      if (member && member.isAlive()) {
        this.selectMember(this.memberOrder[index]);
      }
    }
  }

  /**
   * Get the currently active squad member
   */
  public getActiveMember(): SquadMember | null {
    if (!this.activeMemberId) return null;
    return this.members.get(this.activeMemberId) || null;
  }

  /**
   * Get all squad members
   */
  public getAllMembers(): SquadMember[] {
    return Array.from(this.members.values());
  }

  /**
   * Get all alive squad members
   */
  public getAliveMembers(): SquadMember[] {
    return this.getAllMembers().filter(m => m.isAlive());
  }

  /**
   * Get member by ID
   */
  public getMember(memberId: string): SquadMember | undefined {
    return this.members.get(memberId);
  }

  /**
   * Get member by index (0-4)
   */
  public getMemberByIndex(index: number): SquadMember | undefined {
    if (index >= 0 && index < this.memberOrder.length) {
      return this.members.get(this.memberOrder[index]);
    }
    return undefined;
  }

  /**
   * Issue an order to all non-active members
   */
  public issueOrderToAll(orderType: SquadOrderType, target?: Vector3): void {
    const activeMember = this.getActiveMember();
    if (!target && activeMember && (orderType === SquadOrderType.ADVANCE || orderType === SquadOrderType.FALLBACK)) {
      const distance = orderType === SquadOrderType.ADVANCE ? 6 : -6;
      const formationOffsets = getFormationOffsets(this.formation);
      let offsetIndex = 1;

      for (const [id, member] of this.members) {
        if (id !== this.activeMemberId && member.isAlive()) {
          const offset = formationOffsets[offsetIndex] || Vector3.Zero();
          offsetIndex++;

          const order: SquadOrder = {
            type: orderType,
            target: this.computeOrderTarget(activeMember, offset, distance),
            priority: 1,
            interruptible: true
          };

          member.issueOrder(order);
        }
      }

      return;
    }

    const order: SquadOrder = {
      type: orderType,
      target,
      priority: 1,
      interruptible: true
    };

    for (const [id, member] of this.members) {
      if (id !== this.activeMemberId && member.isAlive()) {
        member.issueOrder(order);
      }
    }
  }

  /**
   * Issue an order to a specific member
   */
  public issueOrderToMember(memberId: string, orderType: SquadOrderType, target?: Vector3): void {
    const member = this.members.get(memberId);
    if (!member || !member.isAlive() || memberId === this.activeMemberId) return;

    const activeMember = this.getActiveMember();
    let resolvedTarget = target;
    if (!resolvedTarget && activeMember && (orderType === SquadOrderType.ADVANCE || orderType === SquadOrderType.FALLBACK)) {
      const distance = orderType === SquadOrderType.ADVANCE ? 6 : -6;
      const offset = this.getFormationOffsetForMember(memberId);
      resolvedTarget = this.computeOrderTarget(activeMember, offset, distance);
    }

    const order: SquadOrder = {
      type: orderType,
      target: resolvedTarget,
      priority: 1,
      interruptible: true
    };

    member.issueOrder(order);
  }

  /**
   * Cancel all orders for non-active members
   */
  public cancelAllOrders(): void {
    for (const [id, member] of this.members) {
      if (id !== this.activeMemberId) {
        member.cancelOrder();
      }
    }
  }

  /**
   * Set formation type
   */
  public setFormation(formation: FormationType): void {
    this.formation = formation;
    this.updateFollowRelationships();
  }

  /**
   * Update follow relationships based on current formation
   */
  private updateFollowRelationships(): void {
    const activeMember = this.getActiveMember();
    if (!activeMember) return;

    const formationOffsets = getFormationOffsets(this.formation);
    let offsetIndex = 1; // Start at 1, leader is at 0

    for (const [id, member] of this.members) {
      if (id !== this.activeMemberId && member.isAlive()) {
        const offset = formationOffsets[offsetIndex] || Vector3.Zero();
        member.setFollowTarget(activeMember, offset);
        offsetIndex++;
      }
    }
  }

  private getFormationOffsetForMember(memberId: string): Vector3 {
    const formationOffsets = getFormationOffsets(this.formation);
    let offsetIndex = 1;

    for (const [id, member] of this.members) {
      if (id === this.activeMemberId || !member.isAlive()) {
        continue;
      }

      if (id === memberId) {
        return formationOffsets[offsetIndex] || Vector3.Zero();
      }

      offsetIndex++;
    }

    return Vector3.Zero();
  }

  private computeOrderTarget(leader: SquadMember, offset: Vector3, distance: number): Vector3 {
    const leaderPos = leader.getPosition();
    const leaderRotation = leader.getRotation();

    const offsetX = offset.x * Math.cos(leaderRotation) - offset.z * Math.sin(leaderRotation);
    const offsetZ = offset.x * Math.sin(leaderRotation) + offset.z * Math.cos(leaderRotation);
    const forward = leader.getForwardDirection().scale(distance);

    return new Vector3(
      leaderPos.x + forward.x + offsetX,
      leaderPos.y,
      leaderPos.z + forward.z + offsetZ
    );
  }

  /**
   * Handle input for the active member
   */
  public handleInput(
    movement: Vector2,
    isSprinting: boolean,
    isShooting: boolean,
    isMelee: boolean,
    isCover: boolean
  ): void {
    const activeMember = this.getActiveMember();
    if (activeMember) {
      activeMember.handleInput(movement, isSprinting, isShooting, isMelee, isCover);
    }
  }

  /**
   * Update all squad members
   */
  public update(deltaTime: number): void {
    for (const member of this.members.values()) {
      member.update(deltaTime);

      // Check for deaths and notify
      if (!member.isAlive() && this.callbacks.onMemberDied) {
        // Only notify once by checking if we need to select a new member
        if (this.activeMemberId === member.getConfig().id) {
          this.callbacks.onMemberDied(member);
          this.selectNext();
        }
      }
    }
  }

  /**
   * Get all meshes for shadow casting etc.
   */
  public getAllMeshes(): any[] {
    const meshes: any[] = [];
    for (const member of this.members.values()) {
      meshes.push(...member.getAllMeshes());
    }
    return meshes;
  }

  /**
   * Set event callbacks
   */
  public setCallbacks(callbacks: SquadManagerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    for (const member of this.members.values()) {
      member.dispose();
    }
    this.members.clear();
    this.memberOrder = [];
    this.activeMemberId = null;
  }
}
