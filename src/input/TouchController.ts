import { Scene, VirtualJoystick } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Button,
  Control
} from '@babylonjs/gui';
import { InputActionType } from './InputActions';
import { GAME_CONSTANTS, COLORS } from '../utils/Constants';

export interface InputState {
  movement: { x: number; y: number };
  actions: Map<InputActionType, boolean>;
  actionsJustPressed: Map<InputActionType, boolean>;
}

export class TouchController {
  private scene: Scene;
  private inputState: InputState;
  private guiTexture: AdvancedDynamicTexture;

  // Built-in Babylon.js VirtualJoystick - proven to work on iOS
  private leftJoystick: VirtualJoystick;

  private actionButtons: Map<InputActionType, Button> = new Map();

  // Responsive sizes
  private actionButtonSize: number = GAME_CONSTANTS.ACTION_BUTTON_SIZE;
  private actionButtonSmallSize: number = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE;
  private isMobile: boolean = false;

  constructor(scene: Scene, canvas: HTMLCanvasElement, inputState: InputState) {
    this.scene = scene;
    this.inputState = inputState;

    // Calculate responsive sizes
    this.calculateResponsiveSizes();

    // Create the built-in VirtualJoystick (left side = true)
    this.leftJoystick = new VirtualJoystick(true);

    // Style the joystick canvas
    if (VirtualJoystick.Canvas) {
      VirtualJoystick.Canvas.style.zIndex = '5';
      // Make the joystick canvas only cover left half for buttons to work
      VirtualJoystick.Canvas.style.width = '50%';
      VirtualJoystick.Canvas.style.left = '0';
    }

    // Create GUI for action buttons (right side)
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI('touchUI', true, this.scene);
    this.createActionButtons();

    // Update input state from joystick in render loop
    this.scene.onBeforeRenderObservable.add(() => {
      this.updateFromJoystick();
    });
  }

  private calculateResponsiveSizes(): void {
    const screenWidth = Math.min(
      window.innerWidth || 0,
      document.documentElement.clientWidth || 0,
      screen.width || 0
    ) || window.innerWidth;

    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.isMobile = hasTouch && screenWidth < GAME_CONSTANTS.MOBILE_WIDTH_THRESHOLD;

    if (this.isMobile) {
      this.actionButtonSize = GAME_CONSTANTS.ACTION_BUTTON_SIZE_MOBILE;
      this.actionButtonSmallSize = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE_MOBILE;
    } else {
      this.actionButtonSize = GAME_CONSTANTS.ACTION_BUTTON_SIZE;
      this.actionButtonSmallSize = GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE;
    }
  }

  private updateFromJoystick(): void {
    if (this.leftJoystick.pressed) {
      // deltaPosition gives us the joystick offset
      // x = left/right, y = up/down (but we need to invert for forward)
      const dx = this.leftJoystick.deltaPosition.x;
      const dy = this.leftJoystick.deltaPosition.y;

      // Normalize to -1 to 1 range (deltaPosition can exceed 1)
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      const maxMagnitude = 50; // Typical max delta

      let normalizedX = 0;
      let normalizedY = 0;

      if (magnitude > 0) {
        const clampedMagnitude = Math.min(magnitude, maxMagnitude);
        normalizedX = (dx / magnitude) * (clampedMagnitude / maxMagnitude);
        normalizedY = (dy / magnitude) * (clampedMagnitude / maxMagnitude);
      }

      // Apply dead zone
      if (Math.abs(normalizedX) < GAME_CONSTANTS.JOYSTICK_DEAD_ZONE) {
        normalizedX = 0;
      }
      if (Math.abs(normalizedY) < GAME_CONSTANTS.JOYSTICK_DEAD_ZONE) {
        normalizedY = 0;
      }

      // Update input state (invert Y for game: up on joystick = forward)
      this.inputState.movement.x = normalizedX;
      this.inputState.movement.y = -normalizedY;
    } else {
      // Joystick released - stop movement
      this.inputState.movement.x = 0;
      this.inputState.movement.y = 0;
    }
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
    if (VirtualJoystick.Canvas) {
      VirtualJoystick.Canvas.style.display = visible ? 'block' : 'none';
    }
  }

  public dispose(): void {
    this.leftJoystick.releaseCanvas();
    this.guiTexture.dispose();
    this.actionButtons.clear();
  }
}
