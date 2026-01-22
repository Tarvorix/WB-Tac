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
  { state: AnimationState.IDLE, glbPath: 'models/shock_troops_Idle.glb', loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.WALK, glbPath: 'models/shock_troops_Walk.glb', loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.RUN, glbPath: 'models/shock_troops_Run.glb', loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.SHOOT, glbPath: 'models/shock_troops_Shoot.glb', loop: false, speedRatio: 1, blendingSpeed: 0.1 },
  { state: AnimationState.COVER, glbPath: 'models/shock_troops_Cover.glb', loop: true, speedRatio: 1, blendingSpeed: 0.05 },
  { state: AnimationState.MELEE, glbPath: 'models/shock_troops_Melee.glb', loop: false, speedRatio: 1, blendingSpeed: 0.1 },
  { state: AnimationState.DEATH, glbPath: 'models/shock_troops_Death.glb', loop: false, speedRatio: 1, blendingSpeed: 0.1 }
];

export function getAnimationConfig(state: AnimationState): AnimationConfig | undefined {
  return ANIMATION_CONFIGS.find(config => config.state === state);
}
