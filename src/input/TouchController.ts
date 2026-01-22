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

  constructor(scene: Scene, _canvas: HTMLCanvasElement, inputState: InputState) {
    this._scene = scene;
    this.inputState = inputState;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI('touchUI', true, this._scene);

    this.joystickContainer = this.createJoystickContainer();
    this.joystickOuter = this.createJoystickOuter();
    this.joystickInner = this.createJoystickInner();

    this.setupJoystickContainer();

    this.createActionButtons();
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
    outer.width = `${GAME_CONSTANTS.JOYSTICK_OUTER_SIZE}px`;
    outer.height = `${GAME_CONSTANTS.JOYSTICK_OUTER_SIZE}px`;
    outer.color = 'white';
    outer.thickness = 2;
    outer.background = COLORS.JOYSTICK_OUTER;
    outer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    outer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    outer.left = '50px';
    outer.top = '-100px';
    this.guiTexture.addControl(outer);
    return outer;
  }

  private createJoystickInner(): Ellipse {
    const inner = new Ellipse('joystickInner');
    inner.width = `${GAME_CONSTANTS.JOYSTICK_INNER_SIZE}px`;
    inner.height = `${GAME_CONSTANTS.JOYSTICK_INNER_SIZE}px`;
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

  private updateJoystickPosition(): void {
    const dx = this.joystickState.currentX - this.joystickState.startX;
    const dy = this.joystickState.currentY - this.joystickState.startY;

    const maxRadius = GAME_CONSTANTS.JOYSTICK_OUTER_SIZE / 2 - GAME_CONSTANTS.JOYSTICK_INNER_SIZE / 2;
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
    const shootBtn = this.createActionButton(
      'shoot',
      'FIRE',
      COLORS.BUTTON_SHOOT,
      GAME_CONSTANTS.ACTION_BUTTON_SIZE,
      '-60px',
      '-100px'
    );
    this.actionButtons.set('shoot', shootBtn);

    const coverBtn = this.createActionButton(
      'cover',
      'COVER',
      COLORS.BUTTON_COVER,
      GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE,
      '-170px',
      '-100px'
    );
    this.actionButtons.set('cover', coverBtn);

    const meleeBtn = this.createActionButton(
      'melee',
      'MELEE',
      COLORS.BUTTON_MELEE,
      GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE,
      '-60px',
      '-210px'
    );
    this.actionButtons.set('melee', meleeBtn);

    const sprintBtn = this.createActionButton(
      'sprint',
      'RUN',
      COLORS.BUTTON_SPRINT,
      GAME_CONSTANTS.ACTION_BUTTON_SMALL_SIZE,
      '-170px',
      '-210px'
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
    button.thickness = 2;
    button.fontFamily = 'Arial';
    button.fontSize = size > 80 ? 18 : 14;

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
