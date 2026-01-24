import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Button,
  Grid,
  Control
} from '@babylonjs/gui';
import { SquadManager } from '../systems/SquadManager';
import { SquadMember } from '../entities/SquadMember';
import { HealthBar } from './HealthBar';
import { SquadOrderType, FormationType, UnitStatus } from '../types/SquadTypes';
import { detectDevice } from '../utils/DeviceDetection';

interface MemberCard {
  container: Rectangle;
  nameText: TextBlock;
  healthBar: HealthBar;
  statusText: TextBlock;
  roleText: TextBlock;
  memberId: string;
}

interface OrderButton {
  button: Button;
  orderType: SquadOrderType;
}

interface FormationButton {
  button: Button;
  formation: FormationType;
}

/**
 * Squad status panel UI showing all squad members and order buttons
 */
export class SquadPanel {
  private scene: Scene;
  private squadManager: SquadManager;
  private guiTexture: AdvancedDynamicTexture;

  private mainContainer: Rectangle;
  private memberCards: Map<string, MemberCard> = new Map();
  private orderButtons: OrderButton[] = [];
  private orderPanelWidth: number = 0;
  private formationButtons: FormationButton[] = [];
  private formationPanelWidth: number = 0;

  private isMobile: boolean = false;
  private cardWidth: number = 90;
  private cardHeight: number = 90;
  private panelHeight: number = 100;

  constructor(scene: Scene, squadManager: SquadManager) {
    this.scene = scene;
    this.squadManager = squadManager;

    this.calculateResponsiveSizes();

    // Create GUI texture
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI('squadPanelUI', true, this.scene);

    // Create main container
    this.mainContainer = this.createMainContainer();
    this.guiTexture.addControl(this.mainContainer);

    // Create order button panel
    this.createOrderButtons();

    // Create formation button panel
    this.createFormationButtons();

    // Create member cards
    this.createMemberCards();

    // Start update loop
    this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  private calculateResponsiveSizes(): void {
    const device = detectDevice();
    this.isMobile = device.isTouchDevice;

    if (this.isMobile) {
      this.cardWidth = 65;
      this.cardHeight = 75;
      this.panelHeight = 85;
    }
  }

  private createMainContainer(): Rectangle {
    const container = new Rectangle('squadPanelContainer');
    container.width = '100%';
    container.height = `${this.panelHeight}px`;
    container.thickness = 0;
    container.background = 'rgba(0, 0, 0, 0.7)';
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

    return container;
  }

  private createMemberCards(): void {
    const members = this.squadManager.getAllMembers();
    const cardSpacing = 5;
    const totalCardsWidth = (members.length * this.cardWidth) +
      (Math.max(0, members.length - 1) * cardSpacing);
    const leftOffset = this.formationPanelWidth > 0 ? this.formationPanelWidth / 2 : 0;
    const rightOffset = this.orderPanelWidth > 0 ? this.orderPanelWidth / 2 : 0;
    const startX = -(totalCardsWidth / 2) + (this.cardWidth / 2) + leftOffset - rightOffset;

    members.forEach((member, index) => {
      const card = this.createMemberCard(member, index, startX);
      this.memberCards.set(member.getConfig().id, card);
    });
  }

  private createMemberCard(member: SquadMember, index: number, startX: number): MemberCard {
    const config = member.getConfig();
    const cardSpacing = 5;
    const xPos = startX + index * (this.cardWidth + cardSpacing);

    // Card container
    const container = new Rectangle(`card_${config.id}`);
    container.width = `${this.cardWidth}px`;
    container.height = `${this.cardHeight}px`;
    container.thickness = 2;
    container.color = 'gray';
    container.background = 'rgba(30, 30, 30, 0.9)';
    container.cornerRadius = 5;
    container.left = `${xPos}px`;
    container.top = '-5px';
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

    // Make card clickable
    container.isPointerBlocker = true;
    container.onPointerClickObservable.add(() => {
      this.onMemberCardClicked(config.id);
    });

    container.onPointerEnterObservable.add(() => {
      if (!member.isUnderPlayerControl()) {
        container.background = 'rgba(50, 50, 50, 0.9)';
      }
    });

    container.onPointerOutObservable.add(() => {
      if (!member.isUnderPlayerControl()) {
        container.background = 'rgba(30, 30, 30, 0.9)';
      }
    });

    this.mainContainer.addControl(container);

    // Name text
    const nameText = new TextBlock(`name_${config.id}`);
    nameText.text = config.displayName;
    nameText.color = 'white';
    nameText.fontSize = this.isMobile ? 10 : 12;
    nameText.fontWeight = 'bold';
    nameText.height = '16px';
    nameText.top = '5px';
    nameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(nameText);

    // Health bar
    const healthBar = new HealthBar(`health_${config.id}`, {
      width: this.cardWidth - 10,
      height: 6,
      showText: true
    });
    const healthControl = healthBar.getControl();
    healthControl.top = '22px';
    healthControl.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    container.addControl(healthControl);

    // Role text
    const roleText = new TextBlock(`role_${config.id}`);
    roleText.text = this.formatRole(config.role);
    roleText.color = this.getRoleColor(config.role);
    roleText.fontSize = this.isMobile ? 8 : 9;
    roleText.height = '12px';
    roleText.top = '45px';
    roleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    roleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(roleText);

    // Status text
    const statusText = new TextBlock(`status_${config.id}`);
    statusText.text = 'IDLE';
    statusText.color = 'lime';
    statusText.fontSize = this.isMobile ? 8 : 10;
    statusText.height = '14px';
    statusText.top = '-5px';
    statusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    statusText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(statusText);

    return {
      container,
      nameText,
      healthBar,
      statusText,
      roleText,
      memberId: config.id
    };
  }

  private createOrderButtons(): void {
    const orders: { type: SquadOrderType; label: string; color: string }[] = [
      { type: SquadOrderType.FOLLOW, label: 'FORM', color: 'rgba(100, 100, 100, 0.8)' },
      { type: SquadOrderType.HOLD, label: 'HOLD', color: 'rgba(0, 100, 200, 0.8)' },
      { type: SquadOrderType.ADVANCE, label: 'ADV', color: 'rgba(0, 150, 0, 0.8)' },
      { type: SquadOrderType.TAKE_COVER, label: 'CVR', color: 'rgba(150, 100, 0, 0.8)' }
    ];

    const buttonWidth = this.isMobile ? 45 : 55;
    const buttonHeight = this.isMobile ? 35 : 40;
    const buttonPadding = this.isMobile ? 4 : 6;
    const titleHeight = this.isMobile ? 12 : 14;

    // Create order panel on the right side
    this.orderPanelWidth = (buttonWidth * 2) + buttonPadding;
    const orderPanel = new Rectangle('orderPanel');
    orderPanel.width = `${this.orderPanelWidth}px`;
    orderPanel.height = `${this.panelHeight}px`;
    orderPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    orderPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    orderPanel.left = '-10px';
    orderPanel.thickness = 0;
    this.mainContainer.addControl(orderPanel);

    // Title
    const titleText = new TextBlock('orderTitle');
    titleText.text = 'ORDERS';
    titleText.color = 'white';
    titleText.fontSize = this.isMobile ? 8 : 10;
    titleText.height = `${titleHeight}px`;
    titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    orderPanel.addControl(titleText);

    const gridHeight = Math.max(0, this.panelHeight - titleHeight);
    const buttonsGrid = new Grid('orderButtonsGrid');
    buttonsGrid.width = '100%';
    buttonsGrid.height = `${gridHeight}px`;
    buttonsGrid.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    buttonsGrid.addRowDefinition(buttonHeight, true);
    buttonsGrid.addRowDefinition(buttonHeight, true);
    buttonsGrid.addColumnDefinition(buttonWidth, true);
    buttonsGrid.addColumnDefinition(buttonWidth, true);
    orderPanel.addControl(buttonsGrid);

    // Create buttons
    for (let i = 0; i < orders.length; i++) {
      const orderConfig = orders[i];
      const button = Button.CreateSimpleButton(`order_${orderConfig.type}`, orderConfig.label);
      button.width = `${Math.max(10, buttonWidth - buttonPadding)}px`;
      button.height = `${Math.max(10, buttonHeight - buttonPadding)}px`;
      button.color = 'white';
      button.background = orderConfig.color;
      button.fontSize = this.isMobile ? 10 : 12;
      button.fontWeight = 'bold';
      button.cornerRadius = 3;
      button.thickness = 1;
      button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      button.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

      button.onPointerClickObservable.add(() => {
        this.onOrderButtonClicked(orderConfig.type);
      });

      button.onPointerEnterObservable.add(() => {
        button.alpha = 0.8;
      });

      button.onPointerOutObservable.add(() => {
        button.alpha = 1;
      });

      const row = Math.floor(i / 2);
      const column = i % 2;
      buttonsGrid.addControl(button, row, column);

      this.orderButtons.push({
        button,
        orderType: orderConfig.type
      });
    }
  }

  private createFormationButtons(): void {
    const formations: { type: FormationType; label: string; color: string }[] = [
      { type: 'wedge', label: 'WDG', color: 'rgba(90, 90, 90, 0.85)' },
      { type: 'vee', label: 'VEE', color: 'rgba(90, 90, 90, 0.85)' },
      { type: 'column', label: 'COL', color: 'rgba(90, 90, 90, 0.85)' },
      { type: 'online', label: 'ONL', color: 'rgba(90, 90, 90, 0.85)' },
      { type: 'echelon', label: 'ECH', color: 'rgba(90, 90, 90, 0.85)' }
    ];

    const buttonWidth = this.isMobile ? 45 : 55;
    const buttonHeight = this.isMobile ? 28 : 30;
    const buttonPadding = this.isMobile ? 4 : 6;
    const titleHeight = this.isMobile ? 12 : 14;
    const columnCount = formations.length;

    this.formationPanelWidth = (buttonWidth * columnCount) + buttonPadding;
    const formationPanel = new Rectangle('formationPanel');
    formationPanel.width = `${this.formationPanelWidth}px`;
    formationPanel.height = `${this.panelHeight}px`;
    formationPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    formationPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    formationPanel.left = '10px';
    formationPanel.thickness = 0;
    this.mainContainer.addControl(formationPanel);

    const titleText = new TextBlock('formationTitle');
    titleText.text = 'FORM';
    titleText.color = 'white';
    titleText.fontSize = this.isMobile ? 8 : 10;
    titleText.height = `${titleHeight}px`;
    titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    formationPanel.addControl(titleText);

    const gridHeight = Math.max(0, this.panelHeight - titleHeight);
    const buttonsGrid = new Grid('formationButtonsGrid');
    buttonsGrid.width = '100%';
    buttonsGrid.height = `${gridHeight}px`;
    buttonsGrid.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    buttonsGrid.addRowDefinition(buttonHeight, true);
    for (let i = 0; i < columnCount; i++) {
      buttonsGrid.addColumnDefinition(buttonWidth, true);
    }
    formationPanel.addControl(buttonsGrid);

    for (let i = 0; i < formations.length; i++) {
      const formationConfig = formations[i];
      const button = Button.CreateSimpleButton(`formation_${formationConfig.type}`, formationConfig.label);
      button.width = `${Math.max(10, buttonWidth - buttonPadding)}px`;
      button.height = `${Math.max(10, buttonHeight - buttonPadding)}px`;
      button.color = 'white';
      button.background = formationConfig.color;
      button.fontSize = this.isMobile ? 9 : 11;
      button.fontWeight = 'bold';
      button.cornerRadius = 3;
      button.thickness = 1;
      button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      button.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

      button.onPointerClickObservable.add(() => {
        this.onFormationButtonClicked(formationConfig.type);
      });

      button.onPointerEnterObservable.add(() => {
        button.alpha = 0.8;
      });

      button.onPointerOutObservable.add(() => {
        button.alpha = 1;
      });

      buttonsGrid.addControl(button, 0, i);

      this.formationButtons.push({
        button,
        formation: formationConfig.type
      });
    }
  }

  private onMemberCardClicked(memberId: string): void {
    const member = this.squadManager.getMember(memberId);
    if (member && member.isAlive()) {
      this.squadManager.selectMember(memberId);
    }
  }

  private onOrderButtonClicked(orderType: SquadOrderType): void {
    this.squadManager.issueOrderToAll(orderType);

    // Visual feedback
    console.log(`Order issued: ${orderType.toUpperCase()}`);
  }

  private onFormationButtonClicked(formation: FormationType): void {
    this.squadManager.setFormation(formation);
    console.log(`Formation set: ${formation.toUpperCase()}`);
  }

  /**
   * Update the panel each frame
   */
  private update(): void {
    for (const [memberId, card] of this.memberCards) {
      const member = this.squadManager.getMember(memberId);
      if (!member) continue;

      // Update health bar
      card.healthBar.setHealth(member.getHealth(), member.getMaxHealth());

      // Update status
      const status = member.getStatus();
      card.statusText.text = status;
      card.statusText.color = this.getStatusColor(status);

      // Update card border for active member
      if (member.isUnderPlayerControl()) {
        card.container.color = 'gold';
        card.container.thickness = 3;
        card.container.background = 'rgba(50, 40, 0, 0.9)';
      } else if (!member.isAlive()) {
        card.container.color = 'darkred';
        card.container.thickness = 2;
        card.container.background = 'rgba(40, 0, 0, 0.9)';
      } else {
        card.container.color = 'gray';
        card.container.thickness = 2;
        card.container.background = 'rgba(30, 30, 30, 0.9)';
      }
    }
  }

  private formatRole(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  private getRoleColor(role: string): string {
    switch (role) {
      case 'rifleman': return 'lightgray';
      case 'grenadier': return 'orange';
      case 'medic': return 'lightgreen';
      case 'heavy': return 'lightblue';
      default: return 'white';
    }
  }

  private getStatusColor(status: UnitStatus): string {
    switch (status) {
      case UnitStatus.ACTIVE: return 'gold';
      case UnitStatus.IDLE: return 'lime';
      case UnitStatus.MOVING: return 'cyan';
      case UnitStatus.IN_COVER: return 'dodgerblue';
      case UnitStatus.ATTACKING: return 'red';
      case UnitStatus.WOUNDED: return 'orange';
      case UnitStatus.DEAD: return 'darkred';
      default: return 'white';
    }
  }

  /**
   * Show or hide the panel
   */
  public setVisible(visible: boolean): void {
    this.mainContainer.isVisible = visible;
  }

  /**
   * Toggle panel visibility
   */
  public toggle(): void {
    this.mainContainer.isVisible = !this.mainContainer.isVisible;
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    for (const card of this.memberCards.values()) {
      card.healthBar.dispose();
      card.container.dispose();
    }
    this.memberCards.clear();

    for (const orderButton of this.orderButtons) {
      orderButton.button.dispose();
    }
    this.orderButtons = [];

    for (const formationButton of this.formationButtons) {
      formationButton.button.dispose();
    }
    this.formationButtons = [];

    this.guiTexture.dispose();
  }
}
