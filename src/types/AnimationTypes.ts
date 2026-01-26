import { ASSET_PATHS } from '../utils/Constants';

export enum AnimationState {
  IDLE = 'idle',
  WALK = 'walk',
  RUN = 'run',
  SHOOT = 'shoot',
  COVER = 'cover',
  MELEE = 'melee',
  DEATH = 'death'
}

export interface AnimationConfig {
  state: AnimationState;
  glbPath: string;
  loop: boolean;
  speedRatio: number;
  blendingSpeed: number;
}

export interface AnimationTransition {
  from: AnimationState;
  to: AnimationState;
  blendDuration: number;
  canInterrupt: boolean;
}

export const ANIMATION_CONFIGS: AnimationConfig[] = [
  { state: AnimationState.IDLE, glbPath: ASSET_PATHS.CHARACTER_IDLE, loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.WALK, glbPath: ASSET_PATHS.CHARACTER_WALK, loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.RUN, glbPath: ASSET_PATHS.CHARACTER_RUN, loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.SHOOT, glbPath: ASSET_PATHS.CHARACTER_SHOOT, loop: false, speedRatio: 1, blendingSpeed: 0.1 },
  { state: AnimationState.COVER, glbPath: ASSET_PATHS.CHARACTER_COVER, loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.MELEE, glbPath: ASSET_PATHS.CHARACTER_MELEE, loop: false, speedRatio: 1, blendingSpeed: 0.1 },
  { state: AnimationState.DEATH, glbPath: ASSET_PATHS.CHARACTER_DEATH, loop: false, speedRatio: 1, blendingSpeed: 0.1 }
];

export const REBEL_ANIMATION_CONFIGS: AnimationConfig[] = [
  { state: AnimationState.IDLE, glbPath: 'models/rebel_Idle.glb', loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.WALK, glbPath: 'models/rebel_Walk.glb', loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.RUN, glbPath: 'models/rebel_Run.glb', loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.SHOOT, glbPath: 'models/rebel_Shoot.glb', loop: false, speedRatio: 1, blendingSpeed: 0.1 },
  { state: AnimationState.COVER, glbPath: 'models/rebel_Cover.glb', loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.MELEE, glbPath: 'models/rebel_Melee.glb', loop: false, speedRatio: 1, blendingSpeed: 0.1 },
  { state: AnimationState.DEATH, glbPath: 'models/rebel_Death.glb', loop: false, speedRatio: 1, blendingSpeed: 0.1 }
];

export function getAnimationConfig(state: AnimationState): AnimationConfig | undefined {
  return ANIMATION_CONFIGS.find(config => config.state === state);
}

export function getRebelAnimationConfig(state: AnimationState): AnimationConfig | undefined {
  return REBEL_ANIMATION_CONFIGS.find(config => config.state === state);
}
