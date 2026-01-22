import { Scene, Vector2 } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Ellipse,
  Button,
  Control,
  Rectangle,
  Vector2WithInfo
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
  pointerId: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export class TouchController {
  private _scene: Scene;
  private canvas: HTMLCanvasElement;
  private inputState: InputState;
  private guiTexture: AdvancedDynamicTexture;

  private joystickOuter: Ellipse;
  private joystickInner: Ellipse;
  private joystickContainer: Rectangle;
  private joystickState: JoystickState = {
    isActive: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
  };

  private actionButtons: Map<InputActionType, Button> = new Map();

  // Responsive sizes calculated based on screen
  private joystickOuterSize: number = GAME_CONSTANTS.JOYSTICK_OUTER_SIZE;
  private joystickInnerSize: number = GAME_CONSTANTS.JOYSTICK_INNER_SIZE;
  private actionButtonSize: number = GAME_CONSTANTS.ACTION_BUTTON_SIZE;
  private actionButtonSmallSize: number = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE;
  private isMobile: boolean = false;

  constructor(scene: Scene, canvas: HTMLCanvasElement, inputState: InputState) {
    this._scene = scene;
    this.canvas = canvas;
    this.inputState = inputState;

    // Calculate responsive sizes based on screen width
    this.calculateResponsiveSizes();

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI('touchUI', true, this._scene);

    this.joystickContainer = this.createJoystickContainer();
    this.joystickOuter = this.createJoystickOuter();
    this.joystickInner = this.createJoystickInner();

    this.setupJoystickContainer();
    this.setupScenePointerEvents();
    this.setupNativeTouchEvents();

    this.createActionButtons();
  }

  private calculateResponsiveSizes(): void {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const minDimension = Math.min(screenWidth, screenHeight);

    // Determine if this is a mobile phone (smaller screen)
    this.isMobile = screenWidth < GAME_CONSTANTS.MOBILE_WIDTH_THRESHOLD;

    if (this.isMobile) {
      // Use mobile-specific smaller sizes
      this.joystickOuterSize = GAME_CONSTANTS.JOYSTICK_OUTER_SIZE_MOBILE;
      this.joystickInnerSize = GAME_CONSTANTS.JOYSTICK_INNER_SIZE_MOBILE;
      this.actionButtonSize = GAME_CONSTANTS.ACTION_BUTTON_SIZE_MOBILE;
      this.actionButtonSmallSize = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE_MOBILE;
    } else {
      // Use standard sizes for tablets/desktop
      this.joystickOuterSize = GAME_CONSTANTS.JOYSTICK_OUTER_SIZE;
      this.joystickInnerSize = GAME_CONSTANTS.JOYSTICK_INNER_SIZE;
      this.actionButtonSize = GAME_CONSTANTS.ACTION_BUTTON_SIZE;
      this.actionButtonSmallSize = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE;
    }
  }

  private createJoystickContainer(): Rectangle {
    const container = new Rectangle('joystickContainer');
    container.width = '50%';
    container.height = '100%';
    container.thickness = 0;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    container.isPointerBlocker = true;
    this.guiTexture.addControl(container);
    return container;
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
    // Responsive positioning based on screen size
    const leftOffset = this.isMobile ? 20 : 50;
    const bottomOffset = this.isMobile ? 60 : 100;
    outer.left = `${leftOffset}px`;
    outer.top = `${-bottomOffset}px`;
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
    this.joystickOuter.addControl(inner);
    return inner;
  }

  private setupJoystickContainer(): void {
    this.joystickContainer.onPointerDownObservable.add((eventData: Vector2WithInfo) => {
      if (this.joystickState.isActive) return;

      this.joystickState.isActive = true;
      this.joystickState.pointerId = (eventData as Vector2WithInfo & { buttonIndex?: number }).buttonIndex ?? 0;
      this.joystickState.startX = eventData.x;
      this.joystickState.startY = eventData.y;
      this.joystickState.currentX = eventData.x;
      this.joystickState.currentY = eventData.y;

      this.updateJoystickPosition();
    });

    this.joystickContainer.onPointerMoveObservable.add((eventData: Vector2) => {
      if (!this.joystickState.isActive) return;

      this.joystickState.currentX = eventData.x;
      this.joystickState.currentY = eventData.y;

      this.updateJoystickPosition();
    });

    this.joystickContainer.onPointerUpObservable.add(() => {
      this.resetJoystick();
    });

    this.joystickContainer.onPointerOutObservable.add(() => {
      this.resetJoystick();
    });
  }

  // Additional scene-level pointer events for better iOS/mobile touch handling
  private setupScenePointerEvents(): void {
    // Handle touch move at scene level as backup
    this._scene.onPointerObservable.add((pointerInfo) => {
      if (!this.joystickState.isActive) return;

      const event = pointerInfo.event as PointerEvent;

      // Only handle pointer move events
      if (pointerInfo.type === 4) { // POINTERMOVE
        // Check if touch is in the left half of the screen (joystick area)
        const canvasRect = this.canvas.getBoundingClientRect();
        const x = event.clientX - canvasRect.left;

        if (x < canvasRect.width / 2) {
          this.joystickState.currentX = event.clientX;
          this.joystickState.currentY = event.clientY;
          this.updateJoystickPosition();
        }
      }

      // Handle pointer up at scene level
      if (pointerInfo.type === 2) { // POINTERUP
        if (this.joystickState.isActive) {
          this.resetJoystick();
        }
      }
    });
  }

  // Native canvas touch events - most reliable for iOS Safari
  private setupNativeTouchEvents(): void {
    let joystickTouchId: number | null = null;

    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      // Find a touch in the left half of the screen
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const canvasRect = this.canvas.getBoundingClientRect();
        const x = touch.clientX - canvasRect.left;

        // Left half of screen is joystick area
        if (x < canvasRect.width / 2 && joystickTouchId === null) {
          joystickTouchId = touch.identifier;

          if (!this.joystickState.isActive) {
            this.joystickState.isActive = true;
            this.joystickState.startX = touch.clientX;
            this.joystickState.startY = touch.clientY;
            this.joystickState.currentX = touch.clientX;
            this.joystickState.currentY = touch.clientY;
            this.updateJoystickPosition();
          }
          break;
        }
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      if (joystickTouchId === null || !this.joystickState.isActive) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) {
          this.joystickState.currentX = touch.clientX;
          this.joystickState.currentY = touch.clientY;
          this.updateJoystickPosition();
          break;
        }
      }
    }, { passive: true });

    this.canvas.addEventListener('touchend', (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) {
          joystickTouchId = null;
          this.resetJoystick();
          break;
        }
      }
    }, { passive: true });

    this.canvas.addEventListener('touchcancel', (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) {
          joystickTouchId = null;
          this.resetJoystick();
          break;
        }
      }
    }, { passive: true });
  }

  private updateJoystickPosition(): void {
    const dx = this.joystickState.currentX - this.joystickState.startX;
    const dy = this.joystickState.currentY - this.joystickState.startY;

    // Use responsive sizes for max radius calculation
    const maxRadius = this.joystickOuterSize / 2 - this.joystickInnerSize / 2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDistance = Math.min(distance, maxRadius);

    let normalizedX = 0;
    let normalizedY = 0;

    if (distance > 0) {
      normalizedX = (dx / distance) * (clampedDistance / maxRadius);
      normalizedY = (dy / distance) * (clampedDistance / maxRadius);

      const innerX = (dx / distance) * clampedDistance;
      const innerY = (dy / distance) * clampedDistance;

      this.joystickInner.left = `${innerX}px`;
      this.joystickInner.top = `${innerY}px`;
    }

    if (Math.abs(normalizedX) < GAME_CONSTANTS.JOYSTICK_DEAD_ZONE) {
      normalizedX = 0;
    }
    if (Math.abs(normalizedY) < GAME_CONSTANTS.JOYSTICK_DEAD_ZONE) {
      normalizedY = 0;
    }

    this.inputState.movement.x = normalizedX;
    this.inputState.movement.y = -normalizedY;
  }

  private resetJoystick(): void {
    this.joystickState.isActive = false;
    this.joystickState.pointerId = null;

    this.joystickInner.left = '0px';
    this.joystickInner.top = '0px';

    this.inputState.movement.x = 0;
    this.inputState.movement.y = 0;
  }

  private createActionButtons(): void {
    // Calculate responsive positioning based on screen size
    const rightOffset = this.isMobile ? 15 : 60;
    const bottomOffset = this.isMobile ? 50 : 100;
    const buttonSpacing = this.isMobile ? 10 : 10;

    // FIRE button (primary, larger) - bottom right
    const shootBtn = this.createActionButton(
      'shoot',
      'FIRE',
      COLORS.BUTTON_SHOOT,
      this.actionButtonSize,
      `${-rightOffset}px`,
      `${-bottomOffset}px`
    );
    this.actionButtons.set('shoot', shootBtn);

    // COVER button - to the left of FIRE
    const coverLeftOffset = rightOffset + this.actionButtonSize + buttonSpacing;
    const coverBtn = this.createActionButton(
      'cover',
      'COVER',
      COLORS.BUTTON_COVER,
      this.actionButtonSmallSize,
      `${-coverLeftOffset}px`,
      `${-bottomOffset}px`
    );
    this.actionButtons.set('cover', coverBtn);

    // MELEE button - above FIRE
    const meleeTopOffset = bottomOffset + this.actionButtonSize + buttonSpacing;
    const meleeBtn = this.createActionButton(
      'melee',
      'MELEE',
      COLORS.BUTTON_MELEE,
      this.actionButtonSmallSize,
      `${-rightOffset}px`,
      `${-meleeTopOffset}px`
    );
    this.actionButtons.set('melee', meleeBtn);

    // RUN button - above COVER (diagonal from FIRE)
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
    // Responsive font size based on button size
    button.fontSize = this.isMobile ? (size > 55 ? 12 : 10) : (size > 80 ? 18 : 14);

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
    this.joystickOuter.isVisible = visible;
    this.joystickContainer.isVisible = visible;
  }

  public dispose(): void {
    this.guiTexture.dispose();
    this.actionButtons.clear();
  }
}
