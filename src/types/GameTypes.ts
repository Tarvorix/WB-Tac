import { Vector3 } from '@babylonjs/core';

export enum CoverLevel {
  NONE = 0,
  HALF = 1,
  FULL = 2
}

export interface CoverConfig {
  position: Vector3;
  rotation: number;
  coverLevel: CoverLevel;
  scale?: Vector3;
}

export interface CharacterStats {
  health: number;
  maxHealth: number;
  moveSpeed: number;
  sprintMultiplier: number;
  isAlive: boolean;
  isInCover: boolean;
}

export function createDefaultCharacterStats(): CharacterStats {
  return {
    health: 100,
    maxHealth: 100,
    moveSpeed: 5,
    sprintMultiplier: 1.8,
    isAlive: true,
    isInCover: false
  };
}

export interface GameConfig {
  groundSize: number;
  cameraRadius: number;
  cameraHeightOffset: number;
  cameraRotationOffset: number;
  cameraAcceleration: number;
  cameraMaxSpeed: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  groundSize: 100,
  cameraRadius: 10,
  cameraHeightOffset: 4,
  cameraRotationOffset: 180,
  cameraAcceleration: 0.05,
  cameraMaxSpeed: 20
};
