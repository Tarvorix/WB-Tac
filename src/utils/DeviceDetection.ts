export interface DeviceInfo {
  isTouchDevice: boolean;
  isIOS: boolean;
  isSafari: boolean;
  isIPad: boolean;
  isIPhone: boolean;
  isMobile: boolean;
  pixelRatio: number;
  screenWidth: number;
  screenHeight: number;
}

export function detectDevice(): DeviceInfo {
  const userAgent = navigator.userAgent.toLowerCase();

  const isIOS = /ipad|iphone|ipod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isIPad = /ipad/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isIPhone = /iphone/.test(userAgent);

  const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);

  const isTouchDevice = 'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent) ||
    (isTouchDevice && window.innerWidth < 1024);

  return {
    isTouchDevice,
    isIOS,
    isSafari,
    isIPad,
    isIPhone,
    isMobile,
    pixelRatio: window.devicePixelRatio || 1,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight
  };
}

export function shouldDisableWebGL2(): boolean {
  const device = detectDevice();

  if (device.isIOS) {
    const match = navigator.userAgent.match(/OS (\d+)_/);
    if (match) {
      const iosVersion = parseInt(match[1], 10);
      if (iosVersion < 15) {
        return true;
      }
    }
  }

  return false;
}

export function getRecommendedHardwareScaling(device: DeviceInfo): number {
  if (device.pixelRatio > 2) {
    return 1.5;
  }
  if (device.isMobile && device.pixelRatio > 1) {
    return 1.25;
  }
  return 1;
}
