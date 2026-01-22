import {
  Scene,
  Vector3,
  Ray
} from '@babylonjs/core';
import { CoverObject } from '../entities/CoverObject';
import { CoverLevel } from '../types/GameTypes';
import { GAME_CONSTANTS } from '../utils/Constants';

export class CoverSystem {
  private scene: Scene;
  private coverObjects: CoverObject[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public addCoverObject(cover: CoverObject): void {
    this.coverObjects.push(cover);
  }

  public removeCoverObject(cover: CoverObject): void {
    const index = this.coverObjects.indexOf(cover);
    if (index !== -1) {
      this.coverObjects.splice(index, 1);
    }
  }

  public getCoverObjects(): CoverObject[] {
    return [...this.coverObjects];
  }

  public findNearestCover(
    position: Vector3,
    maxDistance: number = GAME_CONSTANTS.COVER_DETECTION_RADIUS
  ): CoverObject | null {
    let nearest: CoverObject | null = null;
    let nearestDist = maxDistance;

    for (const cover of this.coverObjects) {
      const dist = Vector3.Distance(position, cover.getPosition());
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = cover;
      }
    }

    return nearest;
  }

  public findCoversInRadius(position: Vector3, radius: number): CoverObject[] {
    const covers: CoverObject[] = [];

    for (const cover of this.coverObjects) {
      const dist = Vector3.Distance(position, cover.getPosition());
      if (dist <= radius) {
        covers.push(cover);
      }
    }

    return covers;
  }

  public hasLineOfSight(from: Vector3, to: Vector3): boolean {
    const direction = to.subtract(from);
    const distance = direction.length();
    direction.normalize();

    const ray = new Ray(from, direction, distance);

    const hit = this.scene.pickWithRay(ray, (mesh) => {
      return mesh.metadata?.isCover === true;
    });

    return !hit?.hit;
  }

  public getCoverBetweenPoints(from: Vector3, to: Vector3): CoverObject | null {
    const direction = to.subtract(from);
    const distance = direction.length();
    direction.normalize();

    const ray = new Ray(from, direction, distance);

    const hit = this.scene.pickWithRay(ray, (mesh) => {
      return mesh.metadata?.isCover === true;
    });

    if (hit?.hit && hit.pickedMesh?.metadata?.coverObject) {
      return hit.pickedMesh.metadata.coverObject as CoverObject;
    }

    return null;
  }

  public getCoverBonus(
    defenderPos: Vector3,
    attackerPos: Vector3
  ): CoverLevel {
    const attackDirection = attackerPos.subtract(defenderPos).normalize();

    for (const cover of this.coverObjects) {
      const toCover = cover.getPosition().subtract(defenderPos);
      const distToCover = toCover.length();

      if (distToCover > GAME_CONSTANTS.COVER_DETECTION_RADIUS) continue;

      toCover.normalize();

      const dot = Vector3.Dot(toCover, attackDirection);
      if (dot > 0.3) {
        return cover.getCoverLevel();
      }
    }

    return CoverLevel.NONE;
  }

  public findBestCoverAgainstThreat(
    currentPos: Vector3,
    threatPos: Vector3,
    maxSearchRadius: number = 20
  ): CoverObject | null {
    const covers = this.findCoversInRadius(currentPos, maxSearchRadius);

    if (covers.length === 0) return null;

    let bestCover: CoverObject | null = null;
    let bestScore = -Infinity;

    const threatDirection = threatPos.subtract(currentPos).normalize();

    for (const cover of covers) {
      const coverPos = cover.getPosition();
      const toCover = coverPos.subtract(currentPos);
      const distToCover = toCover.length();
      toCover.normalize();

      const dot = Vector3.Dot(toCover, threatDirection);

      const hasSightBlock = !this.hasLineOfSight(
        coverPos.add(new Vector3(0, 1, 0)),
        threatPos.add(new Vector3(0, 1, 0))
      );

      let score = 0;

      if (hasSightBlock) {
        score += 100;
      }

      score += cover.getCoverLevel() * 20;

      score -= distToCover * 2;

      if (dot > 0.5) {
        score -= 30;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCover = cover;
      }
    }

    return bestCover;
  }

  public getCoverPositionForDefender(
    cover: CoverObject,
    threatPos: Vector3
  ): Vector3 {
    const coverPos = cover.getPosition();
    const toThreat = threatPos.subtract(coverPos).normalize();

    const offsetDistance = 1.5;
    const defenderPos = coverPos.subtract(toThreat.scale(offsetDistance));
    defenderPos.y = 0;

    return defenderPos;
  }

  public dispose(): void {
    for (const cover of this.coverObjects) {
      cover.dispose();
    }
    this.coverObjects = [];
  }
}
