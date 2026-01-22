export enum InputAction {
  MOVE_FORWARD = 'moveForward',
  MOVE_BACKWARD = 'moveBackward',
  MOVE_LEFT = 'moveLeft',
  MOVE_RIGHT = 'moveRight',
  SPRINT = 'sprint',
  SHOOT = 'shoot',
  MELEE = 'melee',
  COVER = 'cover',
  RELOAD = 'reload'
}

export interface MovementInput {
  x: number;
  y: number;
}

export interface InputState {
  movement: MovementInput;
  actions: Map<InputAction, boolean>;
  actionJustPressed: Map<InputAction, boolean>;
}

export function createDefaultInputState(): InputState {
  return {
    movement: { x: 0, y: 0 },
    actions: new Map<InputAction, boolean>(),
    actionJustPressed: new Map<InputAction, boolean>()
  };
}

export interface KeyBindings {
  forward: string[];
  backward: string[];
  left: string[];
  right: string[];
  sprint: string[];
  shoot: number[];
  melee: string[];
  cover: string[];
  reload: string[];
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: ['w', 'arrowup'],
  backward: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  sprint: ['shift'],
  shoot: [0],
  melee: ['e'],
  cover: ['c'],
  reload: ['r']
};
