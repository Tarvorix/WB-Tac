import { Engine, Scene } from '@babylonjs/core';
import { detectDevice, shouldDisableWebGL2, getRecommendedHardwareScaling, DeviceInfo } from '../utils/DeviceDetection';

export interface EngineWrapperOptions {
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
  stencil?: boolean;
  adaptToDeviceRatio?: boolean;
}

export class EngineWrapper {
  private engine: Engine;
  private canvas: HTMLCanvasElement;
  private deviceInfo: DeviceInfo;
  private fpsHistory: number[] = [];
  private readonly FPS_HISTORY_SIZE = 60;
  private readonly LOW_FPS_THRESHOLD = 25;
  private autoScalingEnabled: boolean = true;

  constructor(canvas: HTMLCanvasElement, options: EngineWrapperOptions = {}) {
    this.canvas = canvas;
    this.deviceInfo = detectDevice();

    const disableWebGL2 = shouldDisableWebGL2();

    const engineOptions = {
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      stencil: options.stencil ?? true,
      disableWebGL2Support: disableWebGL2,
      powerPreference: this.deviceInfo.isMobile ? 'high-performance' as const : 'default' as const,
      failIfMajorPerformanceCaveat: false,
      antialias: options.antialias ?? !this.deviceInfo.isMobile
    };

    this.engine = new Engine(
      canvas,
      engineOptions.antialias,
      engineOptions,
      options.adaptToDeviceRatio ?? true
    );

    const recommendedScaling = getRecommendedHardwareScaling(this.deviceInfo);
    if (recommendedScaling > 1) {
      this.engine.setHardwareScalingLevel(recommendedScaling);
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    window.addEventListener('resize', () => {
      this.engine.resize();
    });

    this.engine.onContextLostObservable.add(() => {
      console.warn('WebGL context lost - pausing render loop');
    });

    this.engine.onContextRestoredObservable.add(() => {
      console.log('WebGL context restored - resuming render loop');
    });

    if (this.deviceInfo.isIOS) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.engine.stopRenderLoop();
        } else {
          this.startRenderLoop();
        }
      });
    }
  }

  private startRenderLoop(): void {
    const scenes = this.engine.scenes;
    if (scenes.length > 0) {
      this.engine.runRenderLoop(() => {
        for (const scene of scenes) {
          if (scene.activeCamera) {
            scene.render();
          }
        }
        this.monitorPerformance();
      });
    }
  }

  private monitorPerformance(): void {
    if (!this.autoScalingEnabled) return;

    const fps = this.engine.getFps();
    this.fpsHistory.push(fps);

    if (this.fpsHistory.length > this.FPS_HISTORY_SIZE) {
      this.fpsHistory.shift();
    }

    if (this.fpsHistory.length === this.FPS_HISTORY_SIZE) {
      const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

      if (avgFps < this.LOW_FPS_THRESHOLD) {
        const currentScaling = this.engine.getHardwareScalingLevel();
        if (currentScaling < 2) {
          this.engine.setHardwareScalingLevel(currentScaling + 0.25);
          console.log(`Performance warning: FPS ${avgFps.toFixed(1)}, increasing hardware scaling to ${this.engine.getHardwareScalingLevel()}`);
          this.fpsHistory.length = 0;
        }
      }
    }
  }

  public createScene(): Scene {
    return new Scene(this.engine);
  }

  public runRenderLoop(renderFunc?: () => void): void {
    if (renderFunc) {
      this.engine.runRenderLoop(() => {
        renderFunc();
        this.monitorPerformance();
      });
    } else {
      this.startRenderLoop();
    }
  }

  public stopRenderLoop(): void {
    this.engine.stopRenderLoop();
  }

  public resize(): void {
    this.engine.resize();
  }

  public getEngine(): Engine {
    return this.engine;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getDeviceInfo(): DeviceInfo {
    return this.deviceInfo;
  }

  public setAutoScaling(enabled: boolean): void {
    this.autoScalingEnabled = enabled;
  }

  public setHardwareScalingLevel(level: number): void {
    this.engine.setHardwareScalingLevel(level);
  }

  public getFps(): number {
    return this.engine.getFps();
  }

  public dispose(): void {
    this.engine.stopRenderLoop();
    this.engine.dispose();
  }
}
