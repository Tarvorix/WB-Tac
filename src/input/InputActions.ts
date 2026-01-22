export type InputActionType =
  | 'moveForward'
  | 'moveBackward'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'shoot'
  | 'melee'
  | 'cover'
  | 'reload';

export const INPUT_ACTIONS: Record<string, InputActionType> = {
  MOVE_FORWARD: 'moveForward',
  MOVE_BACKWARD: 'moveBackward',
  MOVE_LEFT: 'moveLeft',
  MOVE_RIGHT: 'moveRight',
  SPRINT: 'sprint',
  SHOOT: 'shoot',
  MELEE: 'melee',
  COVER: 'cover',
  RELOAD: 'reload'
} as const;

export interface KeyboardBindings {
  [action: string]: string[];
}

export interface MouseBindings {
  [action: string]: number[];
}

export const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindings = {
  moveForward: ['w', 'W', 'ArrowUp'],
  moveBackward: ['s', 'S', 'ArrowDown'],
  moveLeft: ['a', 'A', 'ArrowLeft'],
  moveRight: ['d', 'D', 'ArrowRight'],
  sprint: ['Shift'],
  melee: ['e', 'E'],
  cover: ['c', 'C'],
  reload: ['r', 'R']
};

export const DEFAULT_MOUSE_BINDINGS: MouseBindings = {
  shoot: [0]
};
