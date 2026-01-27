import { Vector3 } from '@babylonjs/core';
import { SquadManager } from '../systems/SquadManager';
import { SquadMember } from '../entities/SquadMember';
import { Enemy } from '../entities/Enemy';
import { SquadOrderType, OrderExecutionState } from '../types/SquadTypes';
import { Blackboard } from './Blackboard';
import {
  HTNPlanner,
  HTNTask,
  HTNMethod,
  PrimitiveTaskType,
  SquadWorldState
} from './htn/HTNPlanner';
import {
  BehaviorTree,
  BehaviorStatus,
  ActionNode,
  BehaviorContext
} from './bt/BehaviorTree';

interface OrderPlan {
  tasks: PrimitiveTaskType[];
  index: number;
}

interface MemberTaskState {
  task: PrimitiveTaskType | null;
  tree: BehaviorTree | null;
  issued: boolean;
  target: Vector3 | null;
}

interface IndividualOrder {
  orderType: SquadOrderType;
  target: Vector3 | null;
  plan: OrderPlan;
}

export class SquadAIController {
  private squadManager: SquadManager;
  private blackboard: Blackboard = new Blackboard();
  private planner: HTNPlanner = new HTNPlanner();
  private rootTasks: Map<SquadOrderType, HTNTask> = new Map();
  private memberStates: Map<string, MemberTaskState> = new Map();
  private squadOrder: SquadOrderType | null = null;
  private squadTarget: Vector3 | null = null;
  private squadPlan: OrderPlan | null = null;
  private individualOrders: Map<string, IndividualOrder> = new Map();
  private readonly squadAttackRange: number = 10;
  private readonly squadShotDamage: number = 12;

  constructor(squadManager: SquadManager) {
    this.squadManager = squadManager;
    this.buildRootTasks();
  }

  public setOrder(orderType: SquadOrderType, target?: Vector3, memberId?: string | null): void {
    const resolvedTarget = target ? target.clone() : null;
    if (memberId) {
      const plan = this.buildPlan(orderType, resolvedTarget);
      this.individualOrders.set(memberId, {
        orderType,
        target: resolvedTarget,
        plan
      });
      this.resetMemberState(memberId);
      return;
    }

    this.squadOrder = orderType;
    this.squadTarget = resolvedTarget;
    this.squadPlan = this.buildPlan(orderType, resolvedTarget);
    this.resetAllMemberStates();
  }

  public clearOrders(): void {
    this.squadOrder = null;
    this.squadTarget = null;
    this.squadPlan = null;
    this.individualOrders.clear();
    this.resetAllMemberStates();
  }

  public update(deltaTime: number, enemies: Enemy[]): void {
    const members = this.squadManager.getAliveMembers();
    this.blackboard.updateFromSquad(members);
    this.blackboard.orderTarget = this.squadTarget;
    this.blackboard.updateEnemyContact(enemies);

    for (const member of members) {
      if (member.isUnderPlayerControl()) continue;
      const hitSource = member.consumeHitSource();
      if (hitSource) {
        this.setOrder(SquadOrderType.ENGAGE, hitSource, member.getConfig().id);
      }
    }

    for (const [memberId, order] of this.individualOrders) {
      const member = this.squadManager.getMember(memberId);
      if (!member || !member.isAlive()) {
        this.individualOrders.delete(memberId);
        continue;
      }
      const completed = this.tickPlanForMember(member, order.plan, order.orderType, order.target, deltaTime);
      if (completed && !this.isPersistentOrder(order.orderType)) {
        this.individualOrders.delete(memberId);
      }
    }

    if (!this.squadOrder || !this.squadPlan) {
      this.handleSquadFiring(members, enemies);
      return;
    }

    const activeMemberId = this.squadManager.getActiveMemberId();
    const eligibleMembers = members.filter(member => member.getConfig().id !== activeMemberId);
    const currentTask = this.squadPlan.tasks[this.squadPlan.index] || null;
    if (!currentTask) {
      this.squadPlan = null;
      return;
    }

    let allSucceeded = true;
    for (const member of eligibleMembers) {
      if (this.individualOrders.has(member.getConfig().id)) {
        allSucceeded = false;
        continue;
      }
      const completed = this.tickTask(member, currentTask, this.squadOrder, this.squadTarget, deltaTime);
      if (!completed) {
        allSucceeded = false;
      }
    }

    if (allSucceeded) {
      this.squadPlan.index += 1;
      if (this.squadPlan.index >= this.squadPlan.tasks.length) {
        if (!this.isPersistentOrder(this.squadOrder)) {
          this.squadPlan = null;
          this.squadOrder = null;
          this.squadTarget = null;
        }
      } else {
        this.resetAllMemberStates();
      }
    }

    this.handleSquadFiring(members, enemies);
  }

  private buildRootTasks(): void {
    const engageTask = new HTNTask('OrderEngage', [
      new HTNMethod('engage_on_contact', world => world.hasEnemyContact, [
        HTNTask.primitive('ENGAGE')
      ]),
      new HTNMethod('recon_then_engage', world => world.hasOrderTarget, [
        HTNTask.primitive('RECON'),
        HTNTask.primitive('ENGAGE')
      ])
    ]);

    const reconTask = new HTNTask('OrderRecon', [
      new HTNMethod('recon', _world => true, [
        HTNTask.primitive('RECON')
      ])
    ]);

    const secureTask = new HTNTask('OrderSecure', [
      new HTNMethod('recon_then_secure', world => world.hasOrderTarget, [
        HTNTask.primitive('RECON'),
        HTNTask.primitive('SECURE')
      ]),
      new HTNMethod('secure', _world => true, [
        HTNTask.primitive('SECURE')
      ])
    ]);

    const fallbackTask = new HTNTask('OrderFallback', [
      new HTNMethod('fallback_then_secure', _world => true, [
        HTNTask.primitive('FALLBACK'),
        HTNTask.primitive('SECURE')
      ])
    ]);

    const patrolTask = new HTNTask('OrderPatrol', [
      new HTNMethod('patrol', _world => true, [
        HTNTask.primitive('PATROL')
      ])
    ]);

    this.rootTasks.set(SquadOrderType.ENGAGE, engageTask);
    this.rootTasks.set(SquadOrderType.RECON, reconTask);
    this.rootTasks.set(SquadOrderType.SECURE, secureTask);
    this.rootTasks.set(SquadOrderType.FALLBACK, fallbackTask);
    this.rootTasks.set(SquadOrderType.PATROL, patrolTask);
  }

  private buildPlan(orderType: SquadOrderType, target: Vector3 | null): OrderPlan {
    const world: SquadWorldState = {
      hasEnemyContact: this.blackboard.enemyVisible,
      hasOrderTarget: target !== null,
      isUnderFire: this.blackboard.enemyVisible
    };

    const rootTask = this.rootTasks.get(orderType);
    if (!rootTask) {
      return { tasks: [], index: 0 };
    }

    const plan = this.planner.plan(rootTask, world);
    const tasks = plan ? plan.map(item => item.name) : [];
    return { tasks, index: 0 };
  }

  private tickPlanForMember(
    member: SquadMember,
    plan: OrderPlan,
    orderType: SquadOrderType,
    target: Vector3 | null,
    deltaTime: number
  ): boolean {
    const currentTask = plan.tasks[plan.index];
    if (!currentTask) return true;
    const completed = this.tickTask(member, currentTask, orderType, target, deltaTime);
    if (completed) {
      plan.index += 1;
    }
    return completed;
  }

  private tickTask(
    member: SquadMember,
    task: PrimitiveTaskType,
    orderType: SquadOrderType,
    target: Vector3 | null,
    deltaTime: number
  ): boolean {
    const memberId = member.getConfig().id;
    const state = this.getMemberState(memberId);
    if (state.task !== task) {
      state.task = task;
      state.issued = false;
      state.target = null;
      state.tree = this.buildTreeForTask(member, task, orderType, target);
    }

    if (!state.tree) return false;

    const status = state.tree.tick({ deltaTime });
    return status === BehaviorStatus.SUCCESS;
  }

  private buildTreeForTask(
    member: SquadMember,
    task: PrimitiveTaskType,
    orderType: SquadOrderType,
    target: Vector3 | null
  ): BehaviorTree {
    const memberId = member.getConfig().id;
    const state = this.getMemberState(memberId);
    const resolvedTarget = this.resolveTaskTarget(member, task, target);

    const action = new ActionNode((context: BehaviorContext) => {
      if (!state.issued || (state.target && resolvedTarget && Vector3.Distance(state.target, resolvedTarget) > 0.5)) {
        const order: SquadOrderType = this.mapTaskToOrder(task, orderType);
        member.issueOrder({
          type: order,
          target: resolvedTarget ?? undefined,
          priority: 1,
          interruptible: true
        });
        state.issued = true;
        state.target = resolvedTarget ? resolvedTarget.clone() : null;
      }

      if (this.isPersistentOrder(this.mapTaskToOrder(task, orderType))) {
        if (this.shouldCompletePersistent(task)) {
          return BehaviorStatus.SUCCESS;
        }
        return BehaviorStatus.RUNNING;
      }

      const orderState = member.getOrderState();
      if (orderState === OrderExecutionState.COMPLETED) {
        return BehaviorStatus.SUCCESS;
      }
      if (orderState === OrderExecutionState.FAILED) {
        return BehaviorStatus.FAILURE;
      }
      return BehaviorStatus.RUNNING;
    }, () => {
      state.issued = false;
      state.target = null;
    });

    return new BehaviorTree(action);
  }

  private mapTaskToOrder(task: PrimitiveTaskType, fallbackOrder: SquadOrderType): SquadOrderType {
    switch (task) {
      case 'ENGAGE':
        return SquadOrderType.ENGAGE;
      case 'FALLBACK':
        return SquadOrderType.FALLBACK;
      case 'RECON':
        return SquadOrderType.RECON;
      case 'SECURE':
        return SquadOrderType.SECURE;
      case 'PATROL':
        return SquadOrderType.PATROL;
      default:
        return fallbackOrder;
    }
  }

  private resolveTaskTarget(member: SquadMember, task: PrimitiveTaskType, target: Vector3 | null): Vector3 | null {
    if (task === 'ENGAGE') {
      if (this.blackboard.lastKnownEnemy) {
        return this.blackboard.lastKnownEnemy.clone();
      }
      if (target) return target.clone();
      return member.getPosition();
    }

    if (task === 'FALLBACK') {
      if (target) return target.clone();
      if (this.blackboard.lastKnownEnemy) {
        const away = member.getPosition().subtract(this.blackboard.lastKnownEnemy);
        away.y = 0;
        if (away.length() > 0.1) {
          away.normalize();
        }
        return member.getPosition().add(away.scale(8));
      }
      return member.getPosition();
    }

    if (target) return target.clone();
    return this.blackboard.squadCenter.clone();
  }

  private shouldCompletePersistent(task: PrimitiveTaskType): boolean {
    if (task === 'ENGAGE') {
      return !this.blackboard.enemyVisible;
    }
    return false;
  }

  private isPersistentOrder(orderType: SquadOrderType): boolean {
    return orderType === SquadOrderType.ENGAGE || orderType === SquadOrderType.PATROL;
  }

  private getMemberState(memberId: string): MemberTaskState {
    let state = this.memberStates.get(memberId);
    if (!state) {
      state = {
        task: null,
        tree: null,
        issued: false,
        target: null
      };
      this.memberStates.set(memberId, state);
    }
    return state;
  }

  private resetMemberState(memberId: string): void {
    const state = this.getMemberState(memberId);
    state.task = null;
    state.issued = false;
    state.target = null;
    state.tree = null;
  }

  private resetAllMemberStates(): void {
    for (const memberId of this.memberStates.keys()) {
      this.resetMemberState(memberId);
    }
  }

  private handleSquadFiring(members: SquadMember[], enemies: Enemy[]): void {
    if (enemies.length === 0) return;

    for (const member of members) {
      if (member.isUnderPlayerControl()) continue;
      const order = member.getCurrentOrder();
      if (!order || order.type !== SquadOrderType.ENGAGE) continue;

      const targetEnemy = this.findNearestEnemy(member, enemies);
      if (!targetEnemy) continue;

      const distance = Vector3.Distance(member.getPosition(), targetEnemy.getPosition());
      if (distance > this.squadAttackRange) continue;

      if (member.tryShoot()) {
        targetEnemy.takeDamage(this.squadShotDamage, member.getPosition());
      }
    }
  }

  private findNearestEnemy(member: SquadMember, enemies: Enemy[]): Enemy | null {
    let closest: Enemy | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      if (!enemy.isEnemyAlive()) continue;
      const distance = Vector3.Distance(member.getPosition(), enemy.getPosition());
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = enemy;
      }
    }

    return closest;
  }
}
