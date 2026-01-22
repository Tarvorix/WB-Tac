import {
  Scene,
  PointerEventTypes
} from '@babylonjs/core';
import {
  InputActionType,
  DEFAULT_KEYBOARD_BINDINGS,
  DEFAULT_MOUSE_BINDINGS,
  KeyboardBindings,
  MouseBindings
} from './InputActions';

export interface InputState {
  movement: { x: number; y: number };
  actions: Map<InputActionType, boolean>;
  actionsJustPressed: Map<InputActionType, boolean>;
}

export class KeyboardMouseController {
  private scene: Scene;
  private inputState: InputState;
  private inputMap: Record<string, boolean> = {};
  private keyboardBindings: KeyboardBindings;
  private mouseBindings: MouseBindings;
  private keyDownHandler: (evt: KeyboardEvent) => void;
  private keyUpHandler: (evt: KeyboardEvent) => void;
  private blurHandler: () => void;

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    inputState: InputState,
    keyboardBindings?: KeyboardBindings,
    mouseBindings?: MouseBindings
  ) {
    this.scene = scene;
    this.inputState = inputState;
    this.keyboardBindings = keyboardBindings || DEFAULT_KEYBOARD_BINDINGS;
    this.mouseBindings = mouseBindings || DEFAULT_MOUSE_BINDINGS;

    this.keyDownHandler = (evt: KeyboardEvent) => this.onKeyDown(evt);
    this.keyUpHandler = (evt: KeyboardEvent) => this.onKeyUp(evt);
    this.blurHandler = () => this.onBlur();

    this.setupKeyboardListeners();
    this.setupPointerObservable();
    this.setupUpdateLoop();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
    window.addEventListener('blur', this.blurHandler);
  }

  private onKeyDown(evt: KeyboardEvent): void {
    const key = evt.key.toLowerCase();
    const wasPressed = this.inputMap[key];
    this.inputMap[key] = true;
    if (!wasPressed) {
      this.checkActionJustPressed(key);
    }
  }

  private onKeyUp(evt: KeyboardEvent): void {
    const key = evt.key.toLowerCase();
    this.inputMap[key] = false;
  }

  private onBlur(): void {
    this.inputMap = {};
    this.inputState.movement.x = 0;
    this.inputState.movement.y = 0;
  }

  private setupPointerObservable(): void {
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        const button = pointerInfo.event.button;
        this.checkMouseAction(button, true);
      } else if (pointerInfo.type === PointerEventTypes.POINTERUP) {
        const button = pointerInfo.event.button;
        this.checkMouseAction(button, false);
      } else if (pointerInfo.type === PointerEventTypes.POINTERTAP) {
        this.checkMouseAction(0, true);
        setTimeout(() => {
          this.checkMouseAction(0, false);
        }, 50);
      }
    });
  }

  private setupUpdateLoop(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      this.updateMovementFromKeys();
      this.updateActionsFromKeys();
    });
  }

  private checkActionJustPressed(key: string): void {
    const lowerKey = key.toLowerCase();
    for (const [action, keys] of Object.entries(this.keyboardBindings)) {
      if (keys.some(k => k.toLowerCase() === lowerKey)) {
        this.inputState.actionsJustPressed.set(action as InputActionType, true);
      }
    }
  }

  private checkMouseAction(button: number, pressed: boolean): void {
    for (const [action, buttons] of Object.entries(this.mouseBindings)) {
      if (buttons.includes(button)) {
        this.inputState.actions.set(action as InputActionType, pressed);
        if (pressed) {
          this.inputState.actionsJustPressed.set(action as InputActionType, true);
        }
      }
    }
  }

  private updateMovementFromKeys(): void {
    let x = 0;
    let y = 0;
    let hasKeyboardInput = false;

    for (const key of this.keyboardBindings.moveForward || []) {
      if (this.inputMap[key.toLowerCase()]) {
        y = 1;
        hasKeyboardInput = true;
        break;
      }
    }

    for (const key of this.keyboardBindings.moveBackward || []) {
      if (this.inputMap[key.toLowerCase()]) {
        y = y === 1 ? 0 : -1;
        hasKeyboardInput = true;
        break;
      }
    }

    for (const key of this.keyboardBindings.moveRight || []) {
      if (this.inputMap[key.toLowerCase()]) {
        x = 1;
        hasKeyboardInput = true;
        break;
      }
    }

    for (const key of this.keyboardBindings.moveLeft || []) {
      if (this.inputMap[key.toLowerCase()]) {
        x = x === 1 ? 0 : -1;
        hasKeyboardInput = true;
        break;
      }
    }

    // Only update movement if keyboard input detected, to avoid overwriting touch input
    if (hasKeyboardInput) {
      this.inputState.movement.x = x;
      this.inputState.movement.y = y;
    }
  }

  private updateActionsFromKeys(): void {
    for (const [action, keys] of Object.entries(this.keyboardBindings)) {
      if (action.startsWith('move')) continue;

      let isPressed = false;
      for (const key of keys) {
        if (this.inputMap[key.toLowerCase()]) {
          isPressed = true;
          break;
        }
      }
      this.inputState.actions.set(action as InputActionType, isPressed);
    }
  }

  public getKeysPressed(): Set<string> {
    const keys = new Set<string>();
    for (const [key, pressed] of Object.entries(this.inputMap)) {
      if (pressed) keys.add(key);
    }
    return keys;
  }

  public isKeyPressed(key: string): boolean {
    return this.inputMap[key.toLowerCase()] || false;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('keyup', this.keyUpHandler);
    window.removeEventListener('blur', this.blurHandler);
    this.inputMap = {};
  }
}
