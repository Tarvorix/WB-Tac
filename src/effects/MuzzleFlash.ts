import {
  Scene,
  Vector3,
  ParticleSystem,
  Texture,
  Color4,
  AbstractMesh,
  TransformNode,
  PointLight,
  Color3,
  MeshBuilder
} from '@babylonjs/core';

export class MuzzleFlash {
  private scene: Scene;
  private particleSystem: ParticleSystem;
  private emitterMesh: AbstractMesh;
  private flashLight: PointLight;

  constructor(scene: Scene, parent: TransformNode | AbstractMesh) {
    this.scene = scene;

    this.emitterMesh = MeshBuilder.CreateBox('muzzleFlashEmitter', { size: 0.01 }, scene);
    this.emitterMesh.parent = parent;
    this.emitterMesh.position = new Vector3(0, 1.2, 0.8);
    this.emitterMesh.isVisible = false;
    this.emitterMesh.isPickable = false;

    this.particleSystem = new ParticleSystem('muzzleFlash', 100, scene);

    this.particleSystem.particleTexture = this.createFlareTexture();

    this.particleSystem.emitter = this.emitterMesh;

    this.particleSystem.minEmitBox = new Vector3(-0.05, -0.05, 0);
    this.particleSystem.maxEmitBox = new Vector3(0.05, 0.05, 0.1);

    this.particleSystem.color1 = new Color4(1.0, 0.9, 0.3, 1.0);
    this.particleSystem.color2 = new Color4(1.0, 0.6, 0.1, 1.0);
    this.particleSystem.colorDead = new Color4(1.0, 0.3, 0.0, 0.0);

    this.particleSystem.minSize = 0.1;
    this.particleSystem.maxSize = 0.4;

    this.particleSystem.minLifeTime = 0.05;
    this.particleSystem.maxLifeTime = 0.15;

    this.particleSystem.emitRate = 0;

    this.particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;

    this.particleSystem.gravity = new Vector3(0, 0, 0);

    this.particleSystem.direction1 = new Vector3(-0.2, 0.2, 1);
    this.particleSystem.direction2 = new Vector3(0.2, 0.4, 1.5);

    this.particleSystem.minEmitPower = 1;
    this.particleSystem.maxEmitPower = 3;

    this.particleSystem.updateSpeed = 0.01;

    this.particleSystem.start();

    this.flashLight = new PointLight('muzzleFlashLight', Vector3.Zero(), scene);
    this.flashLight.parent = this.emitterMesh;
    this.flashLight.diffuse = new Color3(1.0, 0.8, 0.3);
    this.flashLight.specular = new Color3(1.0, 0.8, 0.3);
    this.flashLight.intensity = 0;
    this.flashLight.range = 5;
  }

  private createFlareTexture(): Texture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const gradient = ctx.createRadialGradient(
        size / 2, size / 2, 0,
        size / 2, size / 2, size / 2
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.2, 'rgba(255, 220, 100, 1)');
      gradient.addColorStop(0.5, 'rgba(255, 150, 50, 0.5)');
      gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }

    const texture = new Texture('data:' + canvas.toDataURL(), this.scene);
    texture.hasAlpha = true;

    return texture;
  }

  public trigger(): void {
    this.particleSystem.manualEmitCount = 30;

    this.flashLight.intensity = 3;

    setTimeout(() => {
      this.flashLight.intensity = 0;
    }, 50);
  }

  public setPosition(position: Vector3): void {
    this.emitterMesh.position = position;
  }

  public dispose(): void {
    this.particleSystem.dispose();
    this.flashLight.dispose();
    this.emitterMesh.dispose();
  }
}
