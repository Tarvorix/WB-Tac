import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Ellipse,
  Button,
  Control
} from '@babylonjs/gui';
import { InputActionType } from './InputActions';
import { GAME_CONSTANTS, COLORS } from '../utils/Constants';
import { detectDevice } from '../utils/DeviceDetection';
import { InputState } from './KeyboardMouseController';

export class TouchController {
  private scene: Scene;
  private canvas: HTMLCanvasElement;
  private inputState: InputState;
  private guiTexture: AdvancedDynamicTexture;

  // Joystick visual elements
  private joystickOuter: Ellipse;
  private joystickInner: Ellipse;

  // Joystick touch state
  private joystickTouchId: number = -1;
  private joystickStartX: number = 0;
  private joystickStartY: number = 0;

  // Input smoothing for iOS touch jitter reduction
  private smoothedX: number = 0;
  private smoothedY: number = 0;
  private readonly SMOOTHING_FACTOR: number = 0.5; // Higher = more responsive (was 0.25)
  private readonly IOS_DEAD_ZONE: number = 0.12; // Dead zone for touch precision

  private actionButtons: Map<InputActionType, Button> = new Map();

  // Responsive sizes
  private joystickOuterSize: number = GAME_CONSTANTS.JOYSTICK_OUTER_SIZE;
  private joystickInnerSize: number = GAME_CONSTANTS.JOYSTICK_INNER_SIZE;
  private actionButtonSize: number = GAME_CONSTANTS.ACTION_BUTTON_SIZE;
  private actionButtonSmallSize: number = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE;
  private isMobile: boolean = false;

  // Bound handlers for cleanup
  private onTouchStart: (e: TouchEvent) => void;
  private onTouchMove: (e: TouchEvent) => void;
  private onTouchEnd: (e: TouchEvent) => void;

  constructor(scene: Scene, canvas: HTMLCanvasElement, inputState: InputState) {
    this.scene = scene;
    this.canvas = canvas;
    this.inputState = inputState;

    this.calculateResponsiveSizes();

    // Create GUI
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI('touchUI', true, this.scene);

    // Create joystick visuals
    this.joystickOuter = this.createJoystickOuter();
    this.joystickInner = this.createJoystickInner();

    // Create action buttons
    this.createActionButtons();

    // Setup window-level touch events (most reliable for iOS Safari)
    this.onTouchStart = this.handleTouchStart.bind(this);
    this.onTouchMove = this.handleTouchMove.bind(this);
    this.onTouchEnd = this.handleTouchEnd.bind(this);

    // Use window events with capture phase for reliable iOS handling
    window.addEventListener('touchstart', this.onTouchStart, { passive: false, capture: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false, capture: true });
    window.addEventListener('touchend', this.onTouchEnd, { passive: false, capture: true });
    window.addEventListener('touchcancel', this.onTouchEnd, { passive: false, capture: true });
  }

  private calculateResponsiveSizes(): void {
    const device = detectDevice();
    // Use mobile sizes on ALL touch devices (iOS, Android, etc.) regardless of screen size
    // This includes iPads which have large screens but still need touch-friendly controls
    this.isMobile = device.isTouchDevice;

    if (this.isMobile) {
      this.joystickOuterSize = GAME_CONSTANTS.JOYSTICK_OUTER_SIZE_MOBILE;
      this.joystickInnerSize = GAME_CONSTANTS.JOYSTICK_INNER_SIZE_MOBILE;
      this.actionButtonSize = GAME_CONSTANTS.ACTION_BUTTON_SIZE_MOBILE;
      this.actionButtonSmallSize = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE_MOBILE;
    }
  }

  private createJoystickOuter(): Ellipse {
    const outer = new Ellipse('joystickOuter');
    outer.width = `${this.joystickOuterSize}px`;
    outer.height = `${this.joystickOuterSize}px`;
    outer.color = 'white';
    outer.thickness = 2;
    outer.background = COLORS.JOYSTICK_OUTER;
    outer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    outer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    outer.left = `${this.isMobile ? 20 : 50}px`;
    outer.top = `${this.isMobile ? -40 : -100}px`;
    outer.isHitTestVisible = false; // Don't block touch events
    this.guiTexture.addControl(outer);
    return outer;
  }

  private createJoystickInner(): Ellipse {
    const inner = new Ellipse('joystickInner');
    inner.width = `${this.joystickInnerSize}px`;
    inner.height = `${this.joystickInnerSize}px`;
    inner.color = 'white';
    inner.thickness = 2;
    inner.background = COLORS.JOYSTICK_INNER;
    inner.isHitTestVisible = false;
    this.joystickOuter.addControl(inner);
    return inner;
  }

  private handleTouchStart(e: TouchEvent): void {
    const rect = this.canvas.getBoundingClientRect();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      // Check if touch is within canvas bounds
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
        continue;
      }

      // Left 40% of screen = joystick area (avoid conflict with buttons)
      if (x < rect.width * 0.4 && this.joystickTouchId === -1) {
        e.preventDefault();
        this.joystickTouchId = touch.identifier;
        this.joystickStartX = touch.clientX;
        this.joystickStartY = touch.clientY;
        this.updateJoystick(touch.clientX, touch.clientY);
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        e.preventDefault();
        this.updateJoystick(touch.clientX, touch.clientY);
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        this.resetJoystick();
      }
    }
  }

  private updateJoystick(touchX: number, touchY: number): void {
    const dx = touchX - this.joystickStartX;
    const dy = touchY - this.joystickStartY;

    // Max radius for joystick movement
    const maxRadius = this.joystickOuterSize / 2 - this.joystickInnerSize / 2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDistance = Math.min(distance, maxRadius);

    let rawX = 0;
    let rawY = 0;

    if (distance > 0) {
      const dirX = dx / distance;
      const dirY = dy / distance;

      // Update visual position
      const visualX = dirX * clampedDistance;
      const visualY = dirY * clampedDistance;
      this.joystickInner.left = `${visualX}px`;
      this.joystickInner.top = `${visualY}px`;

      // Calculate normalized input (-1 to 1)
      rawX = dirX * (clampedDistance / maxRadius);
      rawY = dirY * (clampedDistance / maxRadius);
    }

    // Apply dead zone (use larger iOS dead zone for touch precision)
    const deadZone = this.IOS_DEAD_ZONE;
    if (Math.abs(rawX) < deadZone) rawX = 0;
    if (Math.abs(rawY) < deadZone) rawY = 0;

    // Apply exponential smoothing (low-pass filter) to reduce iOS touch jitter
    // This prevents the twitchy/spinning behavior by filtering out rapid input changes
    this.smoothedX = rawX * this.SMOOTHING_FACTOR + this.smoothedX * (1 - this.SMOOTHING_FACTOR);
    this.smoothedY = rawY * this.SMOOTHING_FACTOR + this.smoothedY * (1 - this.SMOOTHING_FACTOR);

    // Apply dead zone again after smoothing to prevent drift when near center
    let finalX = this.smoothedX;
    let finalY = this.smoothedY;
    if (Math.abs(finalX) < deadZone * 0.5) finalX = 0;
    if (Math.abs(finalY) < deadZone * 0.5) finalY = 0;

    // Update input state (invert Y: screen down = game backward)
    this.inputState.movement.x = finalX;
    this.inputState.movement.y = -finalY;
    this.inputState.activeSource = 'touch';
  }

  private resetJoystick(): void {
    this.joystickTouchId = -1;
    this.joystickInner.left = '0px';
    this.joystickInner.top = '0px';
    // Reset smoothed values immediately to prevent lingering movement
    this.smoothedX = 0;
    this.smoothedY = 0;
    this.inputState.movement.x = 0;
    this.inputState.movement.y = 0;
    this.inputState.activeSource = 'none';
  }

  private createActionButtons(): void {
    const rightOffset = this.isMobile ? 10 : 60;
    const bottomOffset = this.isMobile ? 30 : 100;
    const buttonSpacing = this.isMobile ? 5 : 10;

    const shootBtn = this.createActionButton('shoot', 'FIRE', COLORS.BUTTON_SHOOT,
      this.actionButtonSize, `${-rightOffset}px`, `${-bottomOffset}px`);
    this.actionButtons.set('shoot', shootBtn);

    const coverLeftOffset = rightOffset + this.actionButtonSize + buttonSpacing;
    const coverBtn = this.createActionButton('cover', 'CVR', COLORS.BUTTON_COVER,
      this.actionButtonSmallSize, `${-coverLeftOffset}px`, `${-bottomOffset}px`);
    this.actionButtons.set('cover', coverBtn);

    const meleeTopOffset = bottomOffset + this.actionButtonSize + buttonSpacing;
    const meleeBtn = this.createActionButton('melee', 'HIT', COLORS.BUTTON_MELEE,
      this.actionButtonSmallSize, `${-rightOffset}px`, `${-meleeTopOffset}px`);
    this.actionButtons.set('melee', meleeBtn);

    const sprintLeftOffset = rightOffset + this.actionButtonSize + buttonSpacing;
    const sprintTopOffset = bottomOffset + this.actionButtonSize + buttonSpacing;
    const sprintBtn = this.createActionButton('sprint', 'RUN', COLORS.BUTTON_SPRINT,
      this.actionButtonSmallSize, `${-sprintLeftOffset}px`, `${-sprintTopOffset}px`);
    this.actionButtons.set('sprint', sprintBtn);
  }

  private createActionButton(
    action: InputActionType, label: string, backgroundColor: string,
    size: number, left: string, top: string
  ): Button {
    const button = Button.CreateSimpleButton(`${action}Btn`, label);
    button.width = `${size}px`;
    button.height = `${size}px`;
    button.color = 'white';
    button.cornerRadius = size / 2;
    button.background = backgroundColor;
    button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    button.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    button.left = left;
    button.top = top;
    button.thickness = this.isMobile ? 1 : 2;
    button.fontFamily = 'Arial';
    button.fontSize = this.isMobile ? 10 : (size > 80 ? 18 : 14);

    button.onPointerDownObservable.add(() => {
      this.inputState.actions.set(action, true);
      this.inputState.actionsJustPressed.set(action, true);
      button.alpha = 0.7;
    });

    button.onPointerUpObservable.add(() => {
      this.inputState.actions.set(action, false);
      button.alpha = 1;
    });

    button.onPointerOutObservable.add(() => {
      this.inputState.actions.set(action, false);
      button.alpha = 1;
    });

    this.guiTexture.addControl(button);
    return button;
  }

  public setButtonVisible(action: InputActionType, visible: boolean): void {
    const button = this.actionButtons.get(action);
    if (button) button.isVisible = visible;
  }

  public setJoystickVisible(visible: boolean): void {
    this.joystickOuter.isVisible = visible;
  }

  public dispose(): void {
    window.removeEventListener('touchstart', this.onTouchStart, { capture: true });
    window.removeEventListener('touchmove', this.onTouchMove, { capture: true });
    window.removeEventListener('touchend', this.onTouchEnd, { capture: true });
    window.removeEventListener('touchcancel', this.onTouchEnd, { capture: true });
    this.guiTexture.dispose();
    this.actionButtons.clear();
  }
}
