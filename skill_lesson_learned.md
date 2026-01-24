# Skill Lessons Learned - Babylon.js Development

## Table of Contents
1. [Creating Terrain Features (Trenches/Depressions)](#1-creating-terrain-features-trenchesdepressions)
2. [Smooth Character Movement System](#2-smooth-character-movement-system)
3. [Navigation Mesh with Static Obstacles (Cargo Containers)](#3-navigation-mesh-with-static-obstacles-cargo-containers)
4. [Keeping NavMesh Agents Grounded (Fixing Floating Characters)](#4-keeping-navmesh-agents-grounded-fixing-floating-characters)

---

## 1. Creating Terrain Features (Trenches/Depressions)

### Problem
We wanted to create a WW1-style trench that the player could walk down into. Initial implementation placed trench floor and walls below Y=0, but the player walked over it as if it wasn't there.

### Root Causes
1. **Ground mesh covered the trench**: The main ground was a single flat `MeshBuilder.CreateGround()` at Y=0, which visually covered everything below it
2. **Player Y position was hardcoded**: Character movement code had `this.rootNode.position.y = 0` hardcoded, preventing vertical movement

### Solution

#### Part 1: Create Ground with Gap for Trench

Instead of one large ground mesh, split it into multiple sections that leave a gap where the trench is:

```typescript
private createGround(): void {
  // Trench dimensions (must match createTrench)
  const trenchX = -20;
  const trenchLength = 20;
  const trenchWidth = 3;
  const halfGround = GAME_CONSTANTS.GROUND_SIZE / 2;

  // Create ground sections around the trench gap
  // Left section: everything to the left of the trench
  const leftWidth = halfGround + (trenchX - trenchWidth / 2);
  const groundLeft = MeshBuilder.CreateGround(
    'groundLeft',
    { width: leftWidth, height: GAME_CONSTANTS.GROUND_SIZE },
    this.scene
  );
  groundLeft.position.x = -halfGround + leftWidth / 2;

  // Right section: everything to the right of the trench
  const rightWidth = halfGround - (trenchX + trenchWidth / 2);
  const groundRight = MeshBuilder.CreateGround(
    'groundRight',
    { width: rightWidth, height: GAME_CONSTANTS.GROUND_SIZE },
    this.scene
  );
  groundRight.position.x = halfGround - rightWidth / 2;

  // Front section: fills gap in front of trench (negative Z)
  const frontDepth = halfGround - trenchLength / 2;
  const groundFront = MeshBuilder.CreateGround(
    'groundFront',
    { width: trenchWidth, height: frontDepth },
    this.scene
  );
  groundFront.position.x = trenchX;
  groundFront.position.z = -halfGround + frontDepth / 2;

  // Back section: fills gap behind trench (positive Z)
  const groundBack = MeshBuilder.CreateGround(
    'groundBack',
    { width: trenchWidth, height: frontDepth },
    this.scene
  );
  groundBack.position.x = trenchX;
  groundBack.position.z = halfGround - frontDepth / 2;
}
```

**Visual representation of ground sections:**
```
+------------------+---+------------------+
|                  |   |                  |
|                  | B |                  |
|                  | A |                  |
|                  | C |                  |
|      LEFT        | K |      RIGHT       |
|                  +---+                  |
|                  |   |                  |
|                  | T |                  |
|                  | R |                  |
|                  | E |                  |
|                  | N |                  |
|                  | C |                  |
|                  | H |                  |
|                  |   |                  |
|                  +---+                  |
|                  | F |                  |
|                  | R |                  |
|                  | O |                  |
|                  | N |                  |
|                  | T |                  |
+------------------+---+------------------+
```

#### Part 2: Dynamic Ground Height for Character

Add a method to calculate ground height based on X,Z position:

```typescript
// Trench parameters as class constants
private static readonly TRENCH_X = -20;
private static readonly TRENCH_WIDTH = 3;
private static readonly TRENCH_LENGTH = 20;
private static readonly TRENCH_DEPTH = 1.5;
private static readonly RAMP_LENGTH = 4;

/**
 * Calculate the ground height at a given X,Z position, accounting for trench
 */
private getGroundHeight(x: number, z: number): number {
  const trenchMinX = Character.TRENCH_X - Character.TRENCH_WIDTH / 2;
  const trenchMaxX = Character.TRENCH_X + Character.TRENCH_WIDTH / 2;
  const trenchMinZ = -Character.TRENCH_LENGTH / 2;
  const trenchMaxZ = Character.TRENCH_LENGTH / 2;
  const rampStartZ = trenchMaxZ;
  const rampEndZ = trenchMaxZ + Character.RAMP_LENGTH;

  // Check if in trench X bounds
  if (x >= trenchMinX && x <= trenchMaxX) {
    // Inside the main trench area
    if (z >= trenchMinZ && z <= trenchMaxZ) {
      return -Character.TRENCH_DEPTH;
    }
    // On the entry ramp (positive Z side)
    if (z > rampStartZ && z < rampEndZ) {
      // Linear interpolation from trench depth to ground level
      const rampProgress = (z - rampStartZ) / Character.RAMP_LENGTH;
      return -Character.TRENCH_DEPTH * (1 - rampProgress);
    }
  }

  // Default ground level
  return 0;
}
```

Then use it in the update loop:

```typescript
// In update():
const newGroundY = this.getGroundHeight(newX, newZ);
this.rootNode.position.y = newGroundY;
```

### Key Takeaways
- **Ground meshes are visual only** - they don't automatically create "holes" for things below them
- **Character Y position must be calculated dynamically** based on terrain features
- **Keep trench parameters in sync** between ground creation, trench creation, and character movement
- **Ramps need interpolation** for smooth transitions between heights

---

## 2. Smooth Character Movement System

### Problem
Movement was jerky and had multiple issues:
1. Character kept moving after releasing keys
2. Left/right rotation felt weird
3. Movement wasn't smooth - instant velocity changes
4. Touch (iOS) and keyboard inputs conflicted with each other

### Root Causes

#### Issue 1: Keyboard Input Not Clearing
```typescript
// OLD CODE - Problem:
if (hasKeyboardInput) {
  this.inputState.movement.x = x;
  this.inputState.movement.y = y;
}
// When no keys pressed, hasKeyboardInput is false,
// so old values persist!
```

#### Issue 2: No Input Source Tracking
Both keyboard and touch controllers wrote to the same `inputState.movement` object without knowing which was active, causing conflicts.

#### Issue 3: Instant Velocity Changes
```typescript
// OLD CODE - Jerky because velocity jumps instantly:
this.currentVelocity.x = Math.sin(this.currentRotation) * forwardInput * speed;
// or
this.currentVelocity.x = 0;
```

#### Issue 4: Touch Smoothing Too Aggressive
```typescript
// OLD CODE - 0.25 factor = too much lag:
private readonly SMOOTHING_FACTOR: number = 0.25;
```

### Solution

#### Part 1: Input Source Tracking

Add an `activeSource` field to track which input system is in control:

```typescript
// KeyboardMouseController.ts
export type InputSource = 'none' | 'keyboard' | 'touch';

export interface InputState {
  movement: { x: number; y: number };
  actions: Map<InputActionType, boolean>;
  actionsJustPressed: Map<InputActionType, boolean>;
  activeSource: InputSource;  // NEW
}
```

#### Part 2: Fix Keyboard Input Clearing

```typescript
// KeyboardMouseController.ts - updateMovementFromKeys()
if (hasKeyboardInput) {
  // Keyboard is actively being used - take control
  this.inputState.movement.x = x;
  this.inputState.movement.y = y;
  this.inputState.activeSource = 'keyboard';
} else if (this.inputState.activeSource === 'keyboard') {
  // Keyboard was active but no keys pressed now - clear movement
  this.inputState.movement.x = 0;
  this.inputState.movement.y = 0;
  this.inputState.activeSource = 'none';
}
// If activeSource is 'touch', don't interfere
```

#### Part 3: Touch Controller Updates

```typescript
// TouchController.ts
// More responsive smoothing (was 0.25)
private readonly SMOOTHING_FACTOR: number = 0.5;
private readonly IOS_DEAD_ZONE: number = 0.12;

// In updateJoystick():
this.inputState.activeSource = 'touch';

// In resetJoystick():
this.inputState.activeSource = 'none';
```

#### Part 4: Smooth Acceleration/Deceleration

Add constants for movement feel:

```typescript
// Constants.ts
CHARACTER_ACCELERATION: 12,      // How fast to reach target velocity
CHARACTER_DECELERATION: 15,      // How fast to stop (faster = snappier)
CHARACTER_ROTATION_ACCEL: 10,    // Rotation acceleration
```

Add target velocity tracking:

```typescript
// Character.ts
private currentVelocity: Vector3 = Vector3.Zero();
private targetVelocity: Vector3 = Vector3.Zero();  // NEW
private rotationVelocity: number = 0;
private targetRotationVelocity: number = 0;  // NEW
```

Set TARGET in handleInput (not current):

```typescript
// handleInput() - set targets, not current values
public handleInput(movement: Vector2, isSprinting: boolean, ...): void {
  // Rotation
  if (Math.abs(movement.x) > 0.1) {
    this.targetRotationVelocity = movement.x * GAME_CONSTANTS.CHARACTER_TURN_SPEED;
  } else {
    this.targetRotationVelocity = 0;
  }

  // Movement
  if (Math.abs(movement.y) > 0.1) {
    const speed = isSprinting ? ... : this.stats.moveSpeed;
    this.targetVelocity.x = Math.sin(this.currentRotation) * movement.y * speed;
    this.targetVelocity.z = Math.cos(this.currentRotation) * movement.y * speed;
  } else {
    this.targetVelocity.x = 0;
    this.targetVelocity.z = 0;
  }
}
```

Lerp current toward target in update():

```typescript
public update(deltaTime: number): void {
  // === SMOOTH ROTATION ===
  const rotationAccel = GAME_CONSTANTS.CHARACTER_ROTATION_ACCEL * deltaTime;
  if (Math.abs(this.targetRotationVelocity - this.rotationVelocity) < rotationAccel) {
    this.rotationVelocity = this.targetRotationVelocity;
  } else if (this.targetRotationVelocity > this.rotationVelocity) {
    this.rotationVelocity += rotationAccel;
  } else {
    this.rotationVelocity -= rotationAccel;
  }

  // Apply rotation
  this.currentRotation += this.rotationVelocity * deltaTime;

  // === SMOOTH MOVEMENT ===
  // Use faster deceleration when stopping
  const targetSpeed = Math.sqrt(this.targetVelocity.x ** 2 + this.targetVelocity.z ** 2);
  const currentSpeed = Math.sqrt(this.currentVelocity.x ** 2 + this.currentVelocity.z ** 2);

  const accelRate = targetSpeed > currentSpeed
    ? GAME_CONSTANTS.CHARACTER_ACCELERATION
    : GAME_CONSTANTS.CHARACTER_DECELERATION;

  // Lerp velocity components toward target
  const lerpFactor = Math.min(1, accelRate * deltaTime);
  this.currentVelocity.x = Scalar.Lerp(this.currentVelocity.x, this.targetVelocity.x, lerpFactor);
  this.currentVelocity.z = Scalar.Lerp(this.currentVelocity.z, this.targetVelocity.z, lerpFactor);

  // Snap to zero if very close (prevents tiny drift)
  if (Math.abs(this.currentVelocity.x) < 0.01) this.currentVelocity.x = 0;
  if (Math.abs(this.currentVelocity.z) < 0.01) this.currentVelocity.z = 0;

  // Apply movement...
}
```

### Key Takeaways

1. **Track input source** - When multiple input systems (keyboard, touch, gamepad) share state, track which one is active to avoid conflicts

2. **Use target + current pattern** - Never set velocity directly from input. Set a TARGET velocity, then lerp CURRENT toward it for smooth movement

3. **Separate acceleration and deceleration rates** - Stopping should feel snappier than starting. Use a higher deceleration rate.

4. **Snap to zero** - When velocity is very small (< 0.01), snap it to exactly 0 to prevent drift

5. **Touch smoothing tradeoff** - Lower smoothing factor = less jitter but more lag. Higher = more responsive but potentially jittery. 0.5 is a good balance.

6. **Dead zones are essential for touch** - Always apply dead zones to touch input to prevent unintended movement from finger position noise

7. **Frame-rate independence** - Always multiply velocities and accelerations by `deltaTime` for consistent behavior across different frame rates

### Babylon.js Specific Notes

- Use `Scalar.Lerp()` for smooth interpolation
- Use `Scalar.NormalizeRadians()` to keep rotation angles in -PI to PI range
- The `moveWithCollisions()` method handles collision detection but you must manage Y position separately for terrain height

### References
- [Babylon.js Character Movement Guide](https://doc.babylonjs.com/guidedLearning/createAGame/characterMovePt1/)
- [Virtual Joysticks Documentation](https://doc.babylonjs.com/features/featuresDeepDive/input/virtualJoysticks/)

---

## 3. Navigation Mesh with Static Obstacles (Cargo Containers)

### Problem
Patrolling enemies using the Babylon.js navigation system (crowd agents) were walking straight through cargo containers instead of navigating around them.

### Failed Approaches

#### Attempt 1: Including Obstacle Mesh in NavMesh Generation
```typescript
// WRONG - Creates navmesh ON TOP of obstacles
const allGeometry = [...groundMeshes, ...obstacleMeshes];
navigationPlugin.createNavMesh(allGeometry, params);
```
**Result**: Recast creates walkable navmesh on ANY flat surface, including the top of cargo containers. Enemies would path onto the container roofs and appear to float.

#### Attempt 2: Dynamic Obstacles Without Proper Parameters
```typescript
// WRONG - Missing tileSize parameter
const params = { cs: 0.2, ch: 0.2, walkableRadius: 3, ... };
// No tileSize = obstacles don't work
```
**Result**: `addBoxObstacle()` returns null or obstacles have no effect because TileCache isn't enabled.

### Root Cause
The Babylon.js Navigation Plugin uses Recast/Detour under the hood. There are TWO ways to handle obstacles:

1. **Static geometry in navmesh** - Recast creates navmesh on all walkable surfaces of the geometry. Good for ground, floors, ramps. BAD for obstacles you want to block (creates walkable surface on top).

2. **Dynamic obstacles via TileCache** - `addBoxObstacle()` carves out areas from the navmesh. Requires `tileSize` parameter to enable tiled navmesh.

### Solution

#### Step 1: Create NavMesh from ONLY Walkable Surfaces
Only include ground, floor, and ramp meshes - NOT obstacle meshes:

```typescript
// NavigationSystem parameters
const DEFAULT_NAVMESH_PARAMS = {
  cs: 0.2,                    // Cell size (XZ resolution)
  ch: 0.2,                    // Cell height (Y resolution)
  walkableSlopeAngle: 35,     // Max slope agents can walk
  walkableHeight: 10,         // Agent height in voxels (10 * 0.2 = 2m)
  walkableClimb: 2,           // Max step height in voxels
  walkableRadius: 3,          // Agent radius in voxels (3 * 0.2 = 0.6m)
  maxEdgeLen: 60,
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
  borderSize: 1,
  tileSize: 32                // CRITICAL: Enables TileCache for obstacles
};

// Only walkable surfaces
const walkableMeshes = [groundLeft, groundRight, groundFront, groundBack, roomFloor];
navigationPlugin.createNavMesh(walkableMeshes, params);
```

#### Step 2: Add Obstacles via addBoxObstacle()
After creating the navmesh, add obstacles to carve out blocked areas:

```typescript
// CoverObject.ts - Get obstacle parameters
public getObstacleParams(): { position: Vector3; extent: Vector3; angle: number } | null {
  if (!this.boundingInfo) return null;

  const min = this.boundingInfo.boundingBox.minimumWorld;
  const max = this.boundingInfo.boundingBox.maximumWorld;

  // Position is CENTER of the box (not base!)
  const position = new Vector3(
    (min.x + max.x) / 2,
    (min.y + max.y) / 2,
    (min.z + max.z) / 2
  );

  // Extent is HALF-extents (not full dimensions!)
  const margin = 0.3;  // Extra buffer around obstacle
  const extent = new Vector3(
    (max.x - min.x) / 2 + margin,
    (max.y - min.y) / 2 + margin,
    (max.z - min.z) / 2 + margin
  );

  return { position, extent, angle: this.config.rotation };
}

// Game.ts - Add obstacles after navmesh creation
private async setupNavigation(): Promise<void> {
  this.navigationSystem = new NavigationSystem(this.scene, 20, 0.6);
  await this.navigationSystem.initialize();

  // Create navmesh from ground/floor geometry only
  this.navigationSystem.createNavMesh(this.navMeshSources);

  // Add cargo containers as obstacles to carve out blocked areas
  if (this.coverSystem) {
    for (const cover of this.coverSystem.getCoverObjects()) {
      const params = cover.getObstacleParams();
      if (params) {
        this.navigationSystem.addBoxObstacle(params.position, params.extent, params.angle);
      }
    }
  }
}
```

#### Step 3: Fix Agent Y Position (Floating Fix)
The crowd system updates agent transform positions to match navmesh height, which may cause slight floating. Override Y in the update loop:

```typescript
// Enemy.ts
public update(deltaTime: number): void {
  if (this.isAlive && this.navigationSystem && this.agentIndex >= 0) {
    // Force Y to ground level (navmesh may have slight height offset)
    this.rootNode.position.y = 0;

    // ... rest of update logic
  }
}
```

### Key Parameters Explained

| Parameter | Unit | Description |
|-----------|------|-------------|
| `cs` | World units | Cell size - XZ resolution of voxelization |
| `ch` | World units | Cell height - Y resolution of voxelization |
| `walkableHeight` | Voxels | Agent height. `walkableHeight * ch` = meters |
| `walkableRadius` | Voxels | Agent radius. `walkableRadius * cs` = meters |
| `walkableClimb` | Voxels | Max step height agent can climb |
| `tileSize` | Voxels | Tile size for TileCache. **Required for obstacles** |

### addBoxObstacle() Parameters

```typescript
addBoxObstacle(position: Vector3, extent: Vector3, angle: number): IObstacle | null
```

- **position**: CENTER of the box (not the base/bottom!)
- **extent**: HALF-extents (half the width, half the height, half the depth)
- **angle**: Rotation in radians on Y axis

### Common Mistakes

1. **Forgetting `tileSize`** - Without this, TileCache isn't enabled and obstacles don't work
2. **Using full dimensions instead of half-extents** - Obstacle will be 2x the intended size
3. **Using base position instead of center** - Obstacle will be offset vertically
4. **Including obstacle meshes in navmesh generation** - Creates walkable surface on top
5. **Not forcing agent Y position** - Agents may float slightly above ground

### Debugging Tips

1. **Enable debug navmesh visualization**:
```typescript
navigationSystem.showDebugNavMesh(true);
```

2. **Check if obstacle was added successfully**:
```typescript
const obstacle = plugin.addBoxObstacle(pos, ext, angle);
if (!obstacle) {
  console.error('Obstacle failed - check tileSize parameter');
}
```

3. **Log obstacle parameters**:
```typescript
console.log('Obstacle:', {
  position: params.position,
  halfExtent: params.extent,
  fullSize: params.extent.scale(2)
});
```

### References
- [Babylon.js Creating Navigation Mesh](https://doc.babylonjs.com/features/featuresDeepDive/crowdNavigation/createNavMesh/)
- [Babylon.js Crowd Agents](https://doc.babylonjs.com/features/featuresDeepDive/crowdNavigation/crowdAgents/)
- [Babylon.js Obstacles Documentation](https://doc.babylonjs.com/features/featuresDeepDive/crowdNavigation/obstacles)
- [recast-navigation-js GitHub](https://github.com/isaac-mason/recast-navigation-js)

---

## 4. Keeping NavMesh Agents Grounded (Fixing Floating Characters)

### Problem
After implementing navmesh navigation with obstacles, characters controlled by the crowd system appeared to float slightly above the ground level. The idle enemy and sometimes the patrolling enemies hovered a few centimeters off the floor.

### Root Cause
The Babylon.js navigation crowd system automatically updates the transform node position of each agent to match the navmesh surface height. This happens internally during the crowd update tick.

The navmesh is generated from ground geometry, but:
1. **Voxelization creates slight height offsets** - The `ch` (cell height) parameter affects Y resolution. With `ch: 0.2`, the navmesh surface may be up to 0.2 units above or below the actual ground mesh.
2. **Detail sampling adds variation** - The `detailSampleDist` and `detailSampleMaxError` parameters can cause the final navmesh surface to deviate from the source geometry.
3. **Agents follow navmesh height exactly** - The crowd system sets agent Y position to the navmesh height at their current XZ position.

### Solution

Override the Y position in your character's update loop AFTER the crowd system has updated it:

```typescript
// Enemy.ts
public update(deltaTime: number): void {
  // The crowd system has already updated rootNode.position to match navmesh

  if (this.isAlive && this.navigationSystem && this.agentIndex >= 0) {
    // Force Y to ground level (navmesh may have slight height offset)
    this.rootNode.position.y = 0;

    // Get velocity for animation and rotation
    const velocity = this.navigationSystem.getAgentVelocity(this.agentIndex);

    if (velocity.length() > 0.2) {
      // Agent is moving - update rotation to face movement direction
      const targetRotation = Math.atan2(velocity.x, velocity.z);

      // Smooth rotation interpolation
      let currentRotation = this.rootNode.rotation.y;
      let rotationDiff = targetRotation - currentRotation;

      // Normalize angle difference to [-PI, PI]
      while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
      while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

      this.rootNode.rotation.y = currentRotation + rotationDiff * this.ROTATION_SMOOTHING;

      // Ensure walk animation is playing
      if (!this.animationController.isInState(AnimationState.WALK)) {
        this.animationController.transition(AnimationState.WALK);
      }
    }
  }

  this.animationController.update(deltaTime);
}
```

### Key Points

1. **Order matters**: The Y override must happen AFTER the crowd system updates. Since `scene.render()` triggers the crowd update, and your character `update()` is called in the render loop, placing the Y fix at the start of `update()` works.

2. **For terrain with elevation**: If your game has terrain height variation (trenches, ramps, hills), use a ground height function instead of a fixed value:

```typescript
// For flat ground with possible features
const groundY = this.getGroundHeight(this.rootNode.position.x, this.rootNode.position.z);
this.rootNode.position.y = groundY;
```

3. **For navmesh on elevated surfaces**: If agents walk on surfaces at different Y levels (multi-story buildings), you may need a different approach:

```typescript
// Round to nearest expected floor level
const FLOOR_LEVELS = [0, 3, 6]; // Ground, 1st floor, 2nd floor
const agentY = this.rootNode.position.y;
const closestFloor = FLOOR_LEVELS.reduce((prev, curr) =>
  Math.abs(curr - agentY) < Math.abs(prev - agentY) ? curr : prev
);
this.rootNode.position.y = closestFloor;
```

4. **Avoid fighting the crowd system**: Don't try to set Y position before the crowd update - it will just be overwritten. Set it after.

### When This Fix Is Needed

| Scenario | Fix Needed? |
|----------|-------------|
| Flat ground at Y=0 | Yes - hardcode `position.y = 0` |
| Terrain with known elevation function | Yes - use `getGroundHeight()` |
| Multi-story navmesh | Yes - snap to floor levels |
| Slope/ramp the agent walks on | Maybe - navmesh Y might be acceptable |
| Flying/floating characters | No - let navmesh Y be used |

### Alternative: Adjust NavMesh Parameters

If you want to minimize the height offset at the source, use smaller voxel heights:

```typescript
const params = {
  ch: 0.05,  // Smaller = more accurate Y, but slower generation
  // Note: walkableHeight and walkableClimb are in voxel units
  // so they need to be adjusted proportionally
  walkableHeight: 40,  // 2.0m / 0.05 = 40 voxels
  walkableClimb: 8,    // 0.4m / 0.05 = 8 voxels
  // ...
};
```

**Warning**: Smaller `ch` values significantly increase navmesh generation time and memory usage. The runtime Y fix is usually the better solution.

### References
- [Babylon.js Crowd Agents](https://doc.babylonjs.com/features/featuresDeepDive/crowdNavigation/crowdAgents/)
- [Recast NavMesh Parameters](https://recastnav.com/struct_rc_config.html)
