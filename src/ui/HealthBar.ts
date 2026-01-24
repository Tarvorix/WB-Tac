import { Rectangle, TextBlock, Control } from '@babylonjs/gui';
import { getHealthColor } from '../types/SquadTypes';

export interface HealthBarConfig {
  width: number;
  height: number;
  showText?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  borderThickness?: number;
}

const DEFAULT_CONFIG: HealthBarConfig = {
  width: 60,
  height: 8,
  showText: true,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  borderColor: 'white',
  borderThickness: 1
};

/**
 * Reusable health bar UI component
 */
export class HealthBar {
  private container: Rectangle;
  private background: Rectangle;
  private fill: Rectangle;
  private text: TextBlock | null = null;
  private config: HealthBarConfig;

  private currentHealth: number = 100;
  private maxHealth: number = 100;

  constructor(name: string, config: Partial<HealthBarConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create container
    this.container = new Rectangle(`${name}_healthbar`);
    this.container.width = `${this.config.width}px`;
    this.container.height = `${this.config.height + (this.config.showText ? 12 : 0)}px`;
    this.container.thickness = 0;

    // Create background
    this.background = new Rectangle(`${name}_healthbar_bg`);
    this.background.width = `${this.config.width}px`;
    this.background.height = `${this.config.height}px`;
    this.background.background = this.config.backgroundColor!;
    this.background.color = this.config.borderColor!;
    this.background.thickness = this.config.borderThickness!;
    this.background.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(this.background);

    // Create fill bar
    this.fill = new Rectangle(`${name}_healthbar_fill`);
    this.fill.width = `${this.config.width - 2}px`;
    this.fill.height = `${this.config.height - 2}px`;
    this.fill.background = getHealthColor(1);
    this.fill.thickness = 0;
    this.fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.fill.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.fill.left = '1px';
    this.fill.top = '1px';
    this.container.addControl(this.fill);

    // Create text (optional)
    if (this.config.showText) {
      this.text = new TextBlock(`${name}_healthbar_text`);
      this.text.text = '100/100';
      this.text.color = 'white';
      this.text.fontSize = 10;
      this.text.height = '12px';
      this.text.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
      this.text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      this.container.addControl(this.text);
    }
  }

  /**
   * Update the health bar display
   */
  public setHealth(current: number, max: number): void {
    this.currentHealth = current;
    this.maxHealth = max;

    const percent = max > 0 ? current / max : 0;
    const clampedPercent = Math.max(0, Math.min(1, percent));

    // Update fill width
    const fillWidth = (this.config.width - 2) * clampedPercent;
    this.fill.width = `${fillWidth}px`;

    // Update fill color
    this.fill.background = getHealthColor(clampedPercent);

    // Update text
    if (this.text) {
      this.text.text = `${Math.round(current)}/${max}`;
    }
  }

  /**
   * Get the container control to add to a parent
   */
  public getControl(): Rectangle {
    return this.container;
  }

  /**
   * Set visibility
   */
  public setVisible(visible: boolean): void {
    this.container.isVisible = visible;
  }

  /**
   * Dispose the health bar
   */
  public dispose(): void {
    this.container.dispose();
  }
}
