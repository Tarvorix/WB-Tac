import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Ellipse,
  Button,
  Control,
  Rectangle
} from '@babylonjs/gui';
import { InputActionType } from './InputActions';
import { GAME_CONSTANTS, COLORS } from '../utils/Constants';

export interface InputState {
  movement: { x: number; y: number };
  actions: Map<InputActionType, boolean>;
  actionsJustPressed: Map<InputActionType, boolean>;
}

interface JoystickState {
  isActive: boolean;
  touchId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export class TouchController {
  private scene: Scene;
  private canvas: HTMLCanvasElement;
  private inputState: InputState;
  private guiTexture: AdvancedDynamicTexture;

  private joystickOuter: Ellipse;
  private joystickInner: Ellipse;
  private joystickBase: Rectangle;
  private joystickState: JoystickState = {
    isActive: false,
    touchId: -1,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
  };

  private actionButtons: Map<InputActionType, Button> = new Map();
  private buttonTouchIds: Set<number> = new Set();

  // Responsive sizes
  private joystickOuterSize: number = GAME_CONSTANTS.JOYSTICK_OUTER_SIZE;
  private joystickInnerSize: number = GAME_CONSTANTS.JOYSTICK_INNER_SIZE;
  private actionButtonSize: number = GAME_CONSTANTS.ACTION_BUTTON_SIZE;
  private actionButtonSmallSize: number = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE;
  private isMobile: boolean = false;

  // Bound event handlers for cleanup
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;

  constructor(scene: Scene, canvas: HTMLCanvasElement, inputState: InputState) {
    this.scene = scene;
    this.canvas = canvas;
    this.inputState = inputState;

    // Calculate responsive sizes
    this.calculateResponsiveSizes();

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI('touchUI', true, this.scene);

    // Create visual elements
    this.joystickBase = this.createJoystickBase();
    this.joystickOuter = this.createJoystickOuter();
    this.joystickInner = this.createJoystickInner();

    // Create buttons
    this.createActionButtons();

    // Setup touch handling using window-level events (most reliable on iOS)
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);

    window.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    window.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    window.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    window.addEventListener('touchcancel', this.boundTouchEnd, { passive: false });
  }

  private calculateResponsiveSizes(): void {
    // Use multiple methods to detect screen size for iOS compatibility
    const screenWidth = Math.min(
      window.innerWidth || 0,
      document.documentElement.clientWidth || 0,
      screen.width || 0
    ) || window.innerWidth;

    // Check if touch device and small screen
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.isMobile = hasTouch && screenWidth < GAME_CONSTANTS.MOBILE_WIDTH_THRESHOLD;

    if (this.isMobile) {
      this.joystickOuterSize = GAME_CONSTANTS.JOYSTICK_OUTER_SIZE_MOBILE;
      this.joystickInnerSize = GAME_CONSTANTS.JOYSTICK_INNER_SIZE_MOBILE;
      this.actionButtonSize = GAME_CONSTANTS.ACTION_BUTTON_SIZE_MOBILE;
      this.actionButtonSmallSize = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE_MOBILE;
    } else {
      this.joystickOuterSize = GAME_CONSTANTS.JOYSTICK_OUTER_SIZE;
      this.joystickInnerSize = GAME_CONSTANTS.JOYSTICK_INNER_SIZE;
      this.actionButtonSize = GAME_CONSTANTS.ACTION_BUTTON_SIZE;
      this.actionButtonSmallSize = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE;
    }
  }

  private createJoystickBase(): Rectangle {
    const base = new Rectangle('joystickBase');
    base.width = `${this.joystickOuterSize + 20}px`;
    base.height = `${this.joystickOuterSize + 20}px`;
    base.thickness = 0;
    base.background = 'transparent';
    base.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    base.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    const leftOffset = this.isMobile ? 10 : 40;
    const bottomOffset = this.isMobile ? 30 : 90;
    base.left = `${leftOffset}px`;
    base.top = `${-bottomOffset}px`;
    base.isHitTestVisible = false;
    this.guiTexture.addControl(base);
    return base;
  }

  private createJoystickOuter(): Ellipse {
    const outer = new Ellipse('joystickOuter');
    outer.width = `${this.joystickOuterSize}px`;
    outer.height = `${this.joystickOuterSize}px`;
    outer.color = 'white';
    outer.thickness = 2;
    outer.background = COLORS.JOYSTICK_OUTER;
    outer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    outer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    outer.isHitTestVisible = false;
    this.joystickBase.addControl(outer);
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

      // Check if touch is on canvas
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
        continue;
      }

      // Left half = joystick
      if (x < rect.width / 2) {
        if (!this.joystickState.isActive) {
          e.preventDefault(); // Prevent scrolling
          this.joystickState.isActive = true;
          this.joystickState.touchId = touch.identifier;
          this.joystickState.startX = touch.clientX;
          this.joystickState.startY = touch.clientY;
          this.joystickState.currentX = touch.clientX;
          this.joystickState.currentY = touch.clientY;
          this.updateJoystick();
        }
      }
      // Right half = buttons (handled by GUI, but track touch IDs)
      else {
        this.buttonTouchIds.add(touch.identifier);
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (this.joystickState.isActive && touch.identifier === this.joystickState.touchId) {
        e.preventDefault(); // Prevent scrolling while using joystick
        this.joystickState.currentX = touch.clientX;
        this.joystickState.currentY = touch.clientY;
        this.updateJoystick();
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickState.touchId) {
        this.resetJoystick();
      }

      this.buttonTouchIds.delete(touch.identifier);
    }
  }

  private updateJoystick(): void {
    const dx = this.joystickState.currentX - this.joystickState.startX;
    const dy = this.joystickState.currentY - this.joystickState.startY;

    const maxRadius = this.joystickOuterSize / 2 - this.joystickInnerSize / 2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDistance = Math.min(distance, maxRadius);

    let normalizedX = 0;
    let normalizedY = 0;

    if (distance > 0) {
      const dirX = dx / distance;
      const dirY = dy / distance;

      // Visual position
      const innerX = dirX * clampedDistance;
      const innerY = dirY * clampedDistance;
      this.joystickInner.left = `${innerX}px`;
      this.joystickInner.top = `${innerY}px`;

      // Normalized input
      normalizedX = dirX * (clampedDistance / maxRadius);
      normalizedY = dirY * (clampedDistance / maxRadius);
    } else {
      this.joystickInner.left = '0px';
      this.joystickInner.top = '0px';
    }

    // Apply dead zone
    if (Math.abs(normalizedX) < GAME_CONSTANTS.JOYSTICK_DEAD_ZONE) {
      normalizedX = 0;
    }
    if (Math.abs(normalizedY) < GAME_CONSTANTS.JOYSTICK_DEAD_ZONE) {
      normalizedY = 0;
    }

    // Update input state (Y inverted for game coordinates)
    this.inputState.movement.x = normalizedX;
    this.inputState.movement.y = -normalizedY;
  }

  private resetJoystick(): void {
    this.joystickState.isActive = false;
    this.joystickState.touchId = -1;
    this.joystickInner.left = '0px';
    this.joystickInner.top = '0px';
    this.inputState.movement.x = 0;
    this.inputState.movement.y = 0;
  }

  private createActionButtons(): void {
    const rightOffset = this.isMobile ? 10 : 60;
    const bottomOffset = this.isMobile ? 30 : 100;
    const buttonSpacing = this.isMobile ? 5 : 10;

    // FIRE button
    const shootBtn = this.createActionButton(
      'shoot',
      'FIRE',
      COLORS.BUTTON_SHOOT,
      this.actionButtonSize,
      `${-rightOffset}px`,
      `${-bottomOffset}px`
    );
    this.actionButtons.set('shoot', shootBtn);

    // COVER button
    const coverLeftOffset = rightOffset + this.actionButtonSize + buttonSpacing;
    const coverBtn = this.createActionButton(
      'cover',
      'CVR',
      COLORS.BUTTON_COVER,
      this.actionButtonSmallSize,
      `${-coverLeftOffset}px`,
      `${-bottomOffset}px`
    );
    this.actionButtons.set('cover', coverBtn);

    // MELEE button
    const meleeTopOffset = bottomOffset + this.actionButtonSize + buttonSpacing;
    const meleeBtn = this.createActionButton(
      'melee',
      'HIT',
      COLORS.BUTTON_MELEE,
      this.actionButtonSmallSize,
      `${-rightOffset}px`,
      `${-meleeTopOffset}px`
    );
    this.actionButtons.set('melee', meleeBtn);

    // RUN button
    const sprintLeftOffset = rightOffset + this.actionButtonSize + buttonSpacing;
    const sprintTopOffset = bottomOffset + this.actionButtonSize + buttonSpacing;
    const sprintBtn = this.createActionButton(
      'sprint',
      'RUN',
      COLORS.BUTTON_SPRINT,
      this.actionButtonSmallSize,
      `${-sprintLeftOffset}px`,
      `${-sprintTopOffset}px`
    );
    this.actionButtons.set('sprint', sprintBtn);
  }

  private createActionButton(
    action: InputActionType,
    label: string,
    backgroundColor: string,
    size: number,
    left: string,
    top: string
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
    button.isPointerBlocker = true;

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
    if (button) {
      button.isVisible = visible;
    }
  }

  public setJoystickVisible(visible: boolean): void {
    this.joystickBase.isVisible = visible;
  }

  public dispose(): void {
    window.removeEventListener('touchstart', this.boundTouchStart);
    window.removeEventListener('touchmove', this.boundTouchMove);
    window.removeEventListener('touchend', this.boundTouchEnd);
    window.removeEventListener('touchcancel', this.boundTouchEnd);

    this.guiTexture.dispose();
    this.actionButtons.clear();
    this.buttonTouchIds.clear();
  }
}
