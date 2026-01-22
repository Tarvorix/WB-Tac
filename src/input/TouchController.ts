import { Scene, Vector2, PointerEventTypes } from '@babylonjs/core';
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
  pointerId: number;
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
  private joystickBase: Rectangle; // Visual base, not for hit detection
  private joystickState: JoystickState = {
    isActive: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
  };

  private actionButtons: Map<InputActionType, Button> = new Map();
  private buttonPointerIds: Set<number> = new Set(); // Track which pointers are on buttons

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

    // Create visual joystick elements (no hit detection on these)
    this.joystickBase = this.createJoystickBase();
    this.joystickOuter = this.createJoystickOuter();
    this.joystickInner = this.createJoystickInner();

    // Create action buttons first (they have their own hit detection)
    this.createActionButtons();

    // Setup unified pointer handling at scene level
    this.setupPointerHandling();
  }

  private calculateResponsiveSizes(): void {
    const screenWidth = window.innerWidth;

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

  private createJoystickBase(): Rectangle {
    // This is just a visual indicator area, not used for hit detection
    const base = new Rectangle('joystickBase');
    base.width = `${this.joystickOuterSize + 20}px`;
    base.height = `${this.joystickOuterSize + 20}px`;
    base.thickness = 0;
    base.background = 'transparent';
    base.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    base.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    const leftOffset = this.isMobile ? 10 : 40;
    const bottomOffset = this.isMobile ? 50 : 90;
    base.left = `${leftOffset}px`;
    base.top = `${-bottomOffset}px`;
    base.isHitTestVisible = false; // Don't capture pointer events
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
    outer.isHitTestVisible = false; // Don't capture pointer events
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
    inner.isHitTestVisible = false; // Don't capture pointer events
    this.joystickOuter.addControl(inner);
    return inner;
  }

  private setupPointerHandling(): void {
    // Use scene-level pointer observable for joystick
    // This captures all pointer events before GUI processes them
    this._scene.onPointerObservable.add((pointerInfo) => {
      const event = pointerInfo.event as PointerEvent;
      const pointerId = event.pointerId || 0;

      // Get canvas-relative coordinates
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const isLeftHalf = x < rect.width / 2;

      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          // Only handle left-half touches for joystick
          // Skip if this pointer is already tracked as a button press
          if (isLeftHalf && !this.joystickState.isActive && !this.buttonPointerIds.has(pointerId)) {
            this.joystickState.isActive = true;
            this.joystickState.pointerId = pointerId;
            this.joystickState.startX = event.clientX;
            this.joystickState.startY = event.clientY;
            this.joystickState.currentX = event.clientX;
            this.joystickState.currentY = event.clientY;
            this.updateJoystickVisual();
          }
          break;

        case PointerEventTypes.POINTERMOVE:
          // Update joystick if this is the joystick pointer
          if (this.joystickState.isActive && this.joystickState.pointerId === pointerId) {
            this.joystickState.currentX = event.clientX;
            this.joystickState.currentY = event.clientY;
            this.updateJoystickVisual();
          }
          break;

        case PointerEventTypes.POINTERUP:
          // Release joystick if this is the joystick pointer
          if (this.joystickState.isActive && this.joystickState.pointerId === pointerId) {
            this.resetJoystick();
          }
          // Clean up button pointer tracking
          this.buttonPointerIds.delete(pointerId);
          break;
      }
    });
  }

  private updateJoystickVisual(): void {
    const dx = this.joystickState.currentX - this.joystickState.startX;
    const dy = this.joystickState.currentY - this.joystickState.startY;

    // Calculate max movement radius
    const maxRadius = this.joystickOuterSize / 2 - this.joystickInnerSize / 2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDistance = Math.min(distance, maxRadius);

    let normalizedX = 0;
    let normalizedY = 0;

    if (distance > 0) {
      // Calculate normalized direction
      const dirX = dx / distance;
      const dirY = dy / distance;

      // Calculate visual position (clamped to radius)
      const innerX = dirX * clampedDistance;
      const innerY = dirY * clampedDistance;

      // Update inner joystick visual position
      this.joystickInner.left = `${innerX}px`;
      this.joystickInner.top = `${innerY}px`;

      // Calculate normalized input (-1 to 1)
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

    // Update input state (invert Y for game coordinates)
    this.inputState.movement.x = normalizedX;
    this.inputState.movement.y = -normalizedY;
  }

  private resetJoystick(): void {
    this.joystickState.isActive = false;
    this.joystickState.pointerId = -1;

    // Reset visual
    this.joystickInner.left = '0px';
    this.joystickInner.top = '0px';

    // Reset input
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
    button.fontSize = this.isMobile ? (size > 55 ? 12 : 10) : (size > 80 ? 18 : 14);
    button.isPointerBlocker = true; // Block pointer events from passing through

    button.onPointerDownObservable.add((info) => {
      // Track this pointer as a button press
      const pointerId = (info as any).pointerId || 0;
      this.buttonPointerIds.add(pointerId);

      this.inputState.actions.set(action, true);
      this.inputState.actionsJustPressed.set(action, true);
      button.alpha = 0.7;
    });

    button.onPointerUpObservable.add((info) => {
      const pointerId = (info as any).pointerId || 0;
      this.buttonPointerIds.delete(pointerId);

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
    this.guiTexture.dispose();
    this.actionButtons.clear();
    this.buttonPointerIds.clear();
  }
}
