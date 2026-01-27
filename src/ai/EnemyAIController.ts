import { Vector3 } from '@babylonjs/core';
import { Enemy } from '../entities/Enemy';
import { SquadMember } from '../entities/SquadMember';
import {
  BehaviorTree,
  BehaviorStatus,
  ConditionNode,
  SelectorNode,
  SequenceNode,
  ActionNode,
  BehaviorContext
} from './bt/BehaviorTree';

interface EnemyState {
  tree: BehaviorTree;
  targetPosition: Vector3 | null;
  targetMember: SquadMember | null;
}

export class EnemyAIController {
  private enemyStates: Map<string, EnemyState> = new Map();
  private readonly detectionRange: number = 18;
  private readonly shotDamage: number = 8;

  public update(deltaTime: number, enemies: Enemy[], squadMembers: SquadMember[]): void {
    for (const enemy of enemies) {
      if (!enemy.isEnemyAlive()) continue;
      const enemyState = this.getEnemyState(enemy);
      const targetMember = this.findNearestTargetMember(enemy, squadMembers);
      enemyState.targetMember = targetMember;
      enemyState.targetPosition = targetMember ? targetMember.getPosition() : null;
      enemyState.tree.tick({ deltaTime });
      this.handleFiring(enemy, enemyState);
    }
  }

  private getEnemyState(enemy: Enemy): EnemyState {
    const key = enemy.getName();
    let state = this.enemyStates.get(key);
    if (!state) {
      state = {
        tree: this.buildTree(enemy),
        targetPosition: null,
        targetMember: null
      };
      this.enemyStates.set(key, state);
    }
    return state;
  }

  private buildTree(enemy: Enemy): BehaviorTree {
    const hasTarget = new ConditionNode(() => {
      const state = this.enemyStates.get(enemy.getName());
      return !!state?.targetPosition;
    });

    const engageAction = new ActionNode((_context: BehaviorContext) => {
      const state = this.enemyStates.get(enemy.getName());
      const target = state?.targetPosition ?? null;
      if (target) {
        enemy.setCombatTarget(target);
        return BehaviorStatus.RUNNING;
      }
      enemy.clearCombatTarget();
      return BehaviorStatus.FAILURE;
    });

    const patrolAction = new ActionNode((_context: BehaviorContext) => {
      enemy.clearCombatTarget();
      if (!enemy.isPatrollingActive() && !enemy.isWanderingActive()) {
        enemy.startWandering(enemy.getSpawnPosition(), 10);
      }
      return BehaviorStatus.RUNNING;
    });

    const engageSequence = new SequenceNode([hasTarget, engageAction]);
    const root = new SelectorNode([engageSequence, patrolAction]);

    return new BehaviorTree(root);
  }

  private findNearestTargetMember(enemy: Enemy, squadMembers: SquadMember[]): SquadMember | null {
    let closest: SquadMember | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const member of squadMembers) {
      if (!member.isAlive()) continue;
      const distance = Vector3.Distance(enemy.getPosition(), member.getPosition());
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = member;
      }
    }

    if (!closest) return null;
    if (closestDistance > this.detectionRange) return null;
    return closest;
  }

  private handleFiring(enemy: Enemy, state: EnemyState): void {
    const targetMember = state.targetMember;
    if (!targetMember || !targetMember.isAlive()) return;
    if (!enemy.isEngagingTarget()) return;

    const distance = Vector3.Distance(enemy.getPosition(), targetMember.getPosition());
    if (distance > enemy.getAttackRange()) return;

    if (enemy.tryShoot()) {
      targetMember.takeDamage(this.shotDamage, enemy.getPosition());
    }
  }
}
