import { Scene, Vector2 } from '@babylonjs/core';
import { DeviceInfo } from '../utils/DeviceDetection';
import { KeyboardMouseController, InputState } from './KeyboardMouseController';
import { TouchController } from './TouchController';
import { InputActionType } from './InputActions';

export class InputManager {
  private scene: Scene;
  private canvas: HTMLCanvasElement;
  private deviceInfo: DeviceInfo;

  private touchController: TouchController | null = null;
  private keyboardMouseController: KeyboardMouseController | null = null;

  private inputState: InputState;

  // Zoom state
  private zoomDelta: number = 0;
  private onWheelHandler: (e: WheelEvent) => void;

  // Pinch zoom state
  private pinchStartDistance: number = 0;
  private lastPinchDistance: number = 0;
  private onPinchStartHandler: (e: TouchEvent) => void;
  private onPinchMoveHandler: (e: TouchEvent) => void;
  private onPinchEndHandler: (e: TouchEvent) => void;

  constructor(scene: Scene, canvas: HTMLCanvasElement, deviceInfo: DeviceInfo) {
    this.scene = scene;
    this.canvas = canvas;
    this.deviceInfo = deviceInfo;

    this.inputState = {
      movement: { x: 0, y: 0 },
      actions: new Map<InputActionType, boolean>(),
      actionsJustPressed: new Map<InputActionType, boolean>(),
      activeSource: 'none'
    };

    // Initialize zoom handlers
    this.onWheelHandler = this.handleWheel.bind(this);
    this.onPinchStartHandler = this.handlePinchStart.bind(this);
    this.onPinchMoveHandler = this.handlePinchMove.bind(this);
    this.onPinchEndHandler = this.handlePinchEnd.bind(this);

    this.initializeControllers();
    this.initializeZoomControls();
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

  private initializeZoomControls(): void {
    // Mouse wheel zoom for desktop
    this.canvas.addEventListener('wheel', this.onWheelHandler, { passive: false });

    // Pinch zoom for touch devices
    if (this.deviceInfo.isTouchDevice) {
      this.canvas.addEventListener('touchstart', this.onPinchStartHandler, { passive: false });
      this.canvas.addEventListener('touchmove', this.onPinchMoveHandler, { passive: false });
      this.canvas.addEventListener('touchend', this.onPinchEndHandler, { passive: false });
      this.canvas.addEventListener('touchcancel', this.onPinchEndHandler, { passive: false });
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    // Normalize wheel delta across browsers
    const delta = e.deltaY > 0 ? 1 : -1;
    this.zoomDelta = delta;
  }

  private getTouchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private handlePinchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      this.pinchStartDistance = this.getTouchDistance(e.touches);
      this.lastPinchDistance = this.pinchStartDistance;
    }
  }

  private handlePinchMove(e: TouchEvent): void {
    if (e.touches.length === 2) {
      const currentDistance = this.getTouchDistance(e.touches);
      const delta = this.lastPinchDistance - currentDistance;

      // Convert pinch to zoom (pinch in = zoom out, pinch out = zoom in)
      if (Math.abs(delta) > 5) { // Threshold to avoid jitter
        this.zoomDelta = delta > 0 ? 0.5 : -0.5;
        this.lastPinchDistance = currentDistance;
      }
    }
  }

  private handlePinchEnd(_e: TouchEvent): void {
    this.pinchStartDistance = 0;
    this.lastPinchDistance = 0;
  }

  /**
   * Get and consume the zoom delta (call once per frame)
   * Positive = zoom out, Negative = zoom in
   */
  public consumeZoomDelta(): number {
    const delta = this.zoomDelta;
    this.zoomDelta = 0;
    return delta;
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
    // Remove zoom listeners
    this.canvas.removeEventListener('wheel', this.onWheelHandler);
    if (this.deviceInfo.isTouchDevice) {
      this.canvas.removeEventListener('touchstart', this.onPinchStartHandler);
      this.canvas.removeEventListener('touchmove', this.onPinchMoveHandler);
      this.canvas.removeEventListener('touchend', this.onPinchEndHandler);
      this.canvas.removeEventListener('touchcancel', this.onPinchEndHandler);
    }

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
