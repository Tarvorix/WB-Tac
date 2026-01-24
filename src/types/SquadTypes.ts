import { Vector3 } from '@babylonjs/core';

// Squad member roles
export type SquadRole = 'rifleman' | 'grenadier' | 'medic' | 'heavy';

// Equipment configuration
export interface Equipment {
  primary: string;
  secondary: string;
  grenades: number;
}

// Squad member configuration
export interface SquadMemberConfig {
  id: string;
  displayName: string;
  role: SquadRole;
  equipment: Equipment;
  spawnOffset: Vector3;
  useNavAgent?: boolean;
}

// Order types for squad commands
export enum SquadOrderType {
  ADVANCE = 'advance',
  FALLBACK = 'fallback',
  HOLD = 'hold',
  ATTACK = 'attack',
  FOLLOW = 'follow',
  TAKE_COVER = 'takeCover'
}

// Order execution states
export enum OrderExecutionState {
  IDLE = 'idle',
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  INTERRUPTED = 'interrupted'
}

// Squad order with optional target
export interface SquadOrder {
  type: SquadOrderType;
  target?: Vector3;
  priority: number;
  interruptible: boolean;
  timeout?: number;
}

// Unit status for UI display
export enum UnitStatus {
  ACTIVE = 'ACTIVE',
  IDLE = 'IDLE',
  MOVING = 'MOVING',
  IN_COVER = 'IN COVER',
  ATTACKING = 'ATTACKING',
  WOUNDED = 'WOUNDED',
  DEAD = 'DEAD'
}

// Formation types
export type FormationType = 'wedge' | 'line' | 'column' | 'diamond' | 'spread' | 'vee' | 'online' | 'echelon';

// AI behavior states
export enum AIBehavior {
  IDLE = 'idle',
  FOLLOW_LEADER = 'followLeader',
  SEEK_COVER = 'seekCover',
  ENGAGE_ENEMY = 'engageEnemy',
  EXECUTE_ORDER = 'executeOrder'
}

// Default squad configuration
export const DEFAULT_SQUAD_CONFIG: SquadMemberConfig[] = [
  {
    id: 'alpha',
    displayName: 'Sgt. Kane',
    role: 'rifleman',
    equipment: { primary: 'rifle', secondary: 'pistol', grenades: 2 },
    spawnOffset: new Vector3(0, 0, 0)
  },
  {
    id: 'bravo',
    displayName: 'Cpl. Chen',
    role: 'rifleman',
    equipment: { primary: 'rifle', secondary: 'pistol', grenades: 2 },
    spawnOffset: new Vector3(-2, 0, -2)
  },
  {
    id: 'charlie',
    displayName: 'Pvt. Torres',
    role: 'grenadier',
    equipment: { primary: 'rifle', secondary: 'grenade_launcher', grenades: 4 },
    spawnOffset: new Vector3(2, 0, -2)
  },
  {
    id: 'delta',
    displayName: 'Pvt. Kim',
    role: 'medic',
    equipment: { primary: 'smg', secondary: 'medkit', grenades: 1 },
    spawnOffset: new Vector3(-4, 0, -4)
  },
  {
    id: 'echo',
    displayName: 'Pvt. Volkov',
    role: 'heavy',
    equipment: { primary: 'lmg', secondary: 'pistol', grenades: 1 },
    spawnOffset: new Vector3(4, 0, -4)
  }
];

// Formation offsets relative to leader
export function getFormationOffsets(formation: FormationType): Vector3[] {
  switch (formation) {
    case 'wedge':
      return [
        new Vector3(0, 0, 0),      // Leader (index 0)
        new Vector3(-3, 0, -6),    // Left rear
        new Vector3(3, 0, -6),     // Right rear
        new Vector3(-6, 0, -12),   // Far left rear
        new Vector3(6, 0, -12)     // Far right rear
      ];
    case 'line':
      return [
        new Vector3(0, 0, 0),
        new Vector3(-8, 0, 0),
        new Vector3(-4, 0, 0),
        new Vector3(4, 0, 0),
        new Vector3(8, 0, 0)
      ];
    case 'online':
      return [
        new Vector3(0, 0, 0),
        new Vector3(-8, 0, 0),
        new Vector3(-4, 0, 0),
        new Vector3(4, 0, 0),
        new Vector3(8, 0, 0)
      ];
    case 'column':
      return [
        new Vector3(0, 0, 0),
        new Vector3(0, 0, -2),
        new Vector3(0, 0, -4),
        new Vector3(0, 0, -6),
        new Vector3(0, 0, -8)
      ];
    case 'diamond':
      return [
        new Vector3(0, 0, 0),
        new Vector3(-2, 0, -2),
        new Vector3(2, 0, -2),
        new Vector3(0, 0, -4),
        new Vector3(0, 0, -6)
      ];
    case 'spread':
      return [
        new Vector3(0, 0, 0),
        new Vector3(-5, 0, -1),
        new Vector3(5, 0, -1),
        new Vector3(-5, 0, -5),
        new Vector3(5, 0, -5)
      ];
    case 'vee':
      return [
        new Vector3(0, 0, 0),
        new Vector3(-6, 0, 4),
        new Vector3(6, 0, 4),
        new Vector3(-12, 0, 8),
        new Vector3(12, 0, 8)
      ];
    case 'echelon':
      return [
        new Vector3(0, 0, 0),
        new Vector3(6, 0, -3),
        new Vector3(12, 0, -6),
        new Vector3(-6, 0, 3),
        new Vector3(-12, 0, 6)
      ];
    default:
      return [
        new Vector3(0, 0, 0),
        new Vector3(-2, 0, -2),
        new Vector3(2, 0, -2),
        new Vector3(-4, 0, -4),
        new Vector3(4, 0, -4)
      ];
  }
}

// Health bar color thresholds
export const HEALTH_COLORS = {
  FULL: '#00ff00',      // > 75%
  GOOD: '#88ff00',      // 50-75%
  WOUNDED: '#ffaa00',   // 25-50%
  CRITICAL: '#ff0000',  // < 25%
  DEAD: '#444444'
} as const;

export function getHealthColor(healthPercent: number): string {
  if (healthPercent <= 0) return HEALTH_COLORS.DEAD;
  if (healthPercent < 0.25) return HEALTH_COLORS.CRITICAL;
  if (healthPercent < 0.5) return HEALTH_COLORS.WOUNDED;
  if (healthPercent < 0.75) return HEALTH_COLORS.GOOD;
  return HEALTH_COLORS.FULL;
}
