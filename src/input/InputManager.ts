import { Scene, Vector2 } from '@babylonjs/core';
import { DeviceInfo } from '../utils/DeviceDetection';
import { KeyboardMouseController, InputState as KMInputState } from './KeyboardMouseController';
import { TouchController, InputState as TouchInputState } from './TouchController';
import { InputActionType } from './InputActions';

type InputState = KMInputState | TouchInputState;

export class InputManager {
  private scene: Scene;
  private canvas: HTMLCanvasElement;
  private deviceInfo: DeviceInfo;

  private touchController: TouchController | null = null;
  private keyboardMouseController: KeyboardMouseController | null = null;

  private inputState: InputState;

  constructor(scene: Scene, canvas: HTMLCanvasElement, deviceInfo: DeviceInfo) {
    this.scene = scene;
    this.canvas = canvas;
    this.deviceInfo = deviceInfo;

    this.inputState = {
      movement: { x: 0, y: 0 },
      actions: new Map<InputActionType, boolean>(),
      actionsJustPressed: new Map<InputActionType, boolean>()
    };

    this.initializeControllers();
  }

  private initializeControllers(): void {
    if (this.deviceInfo.isTouchDevice) {
      this.touchController = new TouchController(
        this.scene,
        this.canvas,
        this.inputState
      );
    }

    this.keyboardMouseController = new KeyboardMouseController(
      this.scene,
      this.canvas,
      this.inputState
    );
  }

  public getMovementVector(): Vector2 {
    return new Vector2(this.inputState.movement.x, this.inputState.movement.y);
  }

  public getMovementMagnitude(): number {
    const { x, y } = this.inputState.movement;
    return Math.sqrt(x * x + y * y);
  }

  public isMoving(): boolean {
    return this.getMovementMagnitude() > 0.1;
  }

  public isActionPressed(action: InputActionType): boolean {
    return this.inputState.actions.get(action) || false;
  }

  public isActionJustPressed(action: InputActionType): boolean {
    return this.inputState.actionsJustPressed.get(action) || false;
  }

  public clearJustPressed(): void {
    this.inputState.actionsJustPressed.clear();
  }

  public isTouchDevice(): boolean {
    return this.deviceInfo.isTouchDevice;
  }

  public getDeviceInfo(): DeviceInfo {
    return this.deviceInfo;
  }

  public setTouchControlsVisible(visible: boolean): void {
    if (this.touchController) {
      this.touchController.setJoystickVisible(visible);
    }
  }

  public setActionButtonVisible(action: InputActionType, visible: boolean): void {
    if (this.touchController) {
      this.touchController.setButtonVisible(action, visible);
    }
  }

  public dispose(): void {
    if (this.touchController) {
      this.touchController.dispose();
      this.touchController = null;
    }

    if (this.keyboardMouseController) {
      this.keyboardMouseController.dispose();
      this.keyboardMouseController = null;
    }

    this.inputState.actions.clear();
    this.inputState.actionsJustPressed.clear();
  }
}
