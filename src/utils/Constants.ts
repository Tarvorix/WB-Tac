export const GAME_CONSTANTS = {
  GROUND_SIZE: 100,
  GROUND_SUBDIVISIONS: 1,

  CHARACTER_SCALE: 1,
  CHARACTER_MOVE_SPEED: 5,
  CHARACTER_SPRINT_MULTIPLIER: 1.8,
  CHARACTER_ROTATION_SPEED: 10,
  CHARACTER_TURN_SPEED: 3.0,

  // Smooth movement parameters
  CHARACTER_ACCELERATION: 12,      // How fast to reach target velocity (units/sec²)
  CHARACTER_DECELERATION: 15,      // How fast to stop (units/sec²) - slightly faster than accel
  CHARACTER_ROTATION_ACCEL: 10,    // Rotation acceleration (rad/sec²)

  CARGO_CONTAINER_SCALE: 3.0,

  CAMERA_RADIUS: 10,
  CAMERA_HEIGHT_OFFSET: 4,
  CAMERA_ROTATION_OFFSET: 180,
  CAMERA_ACCELERATION: 0.05,
  CAMERA_MAX_SPEED: 20,
  CAMERA_LOWER_RADIUS_LIMIT: 5,
  CAMERA_UPPER_RADIUS_LIMIT: 20,
  CAMERA_LOWER_HEIGHT_LIMIT: 2,
  CAMERA_UPPER_HEIGHT_LIMIT: 10,

  COVER_DETECTION_RADIUS: 3,

  // Base joystick sizes (will be scaled for mobile)
  JOYSTICK_OUTER_SIZE: 150,
  JOYSTICK_INNER_SIZE: 60,
  JOYSTICK_DEAD_ZONE: 0.1,

  // Mobile joystick sizes (smaller for phone screens)
  JOYSTICK_OUTER_SIZE_MOBILE: 100,
  JOYSTICK_INNER_SIZE_MOBILE: 40,

  // Base action button sizes (will be scaled for mobile)
  ACTION_BUTTON_SIZE: 100,
  ACTION_BUTTON_SMALL_SIZE: 80,

  // Mobile action button sizes (smaller for phone screens)
  ACTION_BUTTON_SIZE_MOBILE: 60,
  ACTION_BUTTON_SMALL_SIZE_MOBILE: 50,

  // Screen width threshold for mobile sizing (iPhone ~390px, iPad ~768px+)
  MOBILE_WIDTH_THRESHOLD: 500,

  // Squad panel UI sizes
  SQUAD_PANEL_HEIGHT: 100,
  SQUAD_PANEL_HEIGHT_MOBILE: 85,
  MEMBER_CARD_WIDTH: 90,
  MEMBER_CARD_WIDTH_MOBILE: 65,
  MEMBER_CARD_HEIGHT: 90,
  MEMBER_CARD_HEIGHT_MOBILE: 75
} as const;

export const ASSET_PATHS = {
  CHARACTER_IDLE: 'models/shock_troops_Idle.glb',
  CHARACTER_WALK: 'models/shock_troops_Walk.glb',
  CHARACTER_RUN: 'models/shock_troops_Run.glb',
  CHARACTER_SHOOT: 'models/shock_troops_Shoot.glb',
  CHARACTER_COVER: 'models/shock_troops_Cover.glb',
  CHARACTER_MELEE: 'models/shock_troops_Melee.glb',
  CHARACTER_DEATH: 'models/shock_troops_Death.glb',
  CARGO_CONTAINER: 'models/Cargo_Container.glb'
} as const;

export const REBEL_ASSET_PATHS = {
  IDLE: 'models/rebel_Idle.glb',
  WALK: 'models/rebel_Walk.glb',
  RUN: 'models/rebel_Run.glb',
  SHOOT: 'models/rebel_Shoot.glb',
  COVER: 'models/rebel_Cover.glb',
  MELEE: 'models/rebel_Melee.glb',
  DEATH: 'models/rebel_Death.glb'
} as const;

export const COLORS = {
  GROUND: '#2a4a2a',
  SKY: '#87CEEB',
  JOYSTICK_OUTER: 'rgba(255, 255, 255, 0.2)',
  JOYSTICK_INNER: 'rgba(255, 255, 255, 0.5)',
  BUTTON_SHOOT: 'rgba(255, 0, 0, 0.5)',
  BUTTON_COVER: 'rgba(0, 100, 255, 0.5)',
  BUTTON_MELEE: 'rgba(255, 165, 0, 0.5)',
  BUTTON_SPRINT: 'rgba(0, 255, 0, 0.5)'
} as const;
