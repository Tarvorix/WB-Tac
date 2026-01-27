import { Vector3 } from '@babylonjs/core';
import { SquadMember } from '../entities/SquadMember';
import { Enemy } from '../entities/Enemy';

export class Blackboard {
  public squadCenter: Vector3 = Vector3.Zero();
  public lastKnownEnemy: Vector3 | null = null;
  public enemyVisible: boolean = false;
  public orderTarget: Vector3 | null = null;

  private readonly detectionRange: number = 20;

  public updateFromSquad(squadMembers: SquadMember[]): void {
    if (squadMembers.length === 0) {
      this.squadCenter = Vector3.Zero();
      return;
    }
    let sum = new Vector3(0, 0, 0);
    let count = 0;
    for (const member of squadMembers) {
      if (!member.isAlive()) continue;
      sum = sum.add(member.getPosition());
      count += 1;
    }
    if (count === 0) {
      this.squadCenter = Vector3.Zero();
      return;
    }
    this.squadCenter = sum.scale(1 / count);
  }

  public updateEnemyContact(enemies: Enemy[]): void {
    let closest: Enemy | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      if (!enemy.isEnemyAlive()) continue;
      const distance = Vector3.Distance(enemy.getPosition(), this.squadCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = enemy;
      }
    }

    if (closest && closestDistance <= this.detectionRange) {
      this.lastKnownEnemy = closest.getPosition();
      this.enemyVisible = true;
      return;
    }

    this.enemyVisible = false;
  }
}
