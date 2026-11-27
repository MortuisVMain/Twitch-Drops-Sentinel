// The LiquidCanvas frame loop: only the 3D backdrop with a relief mode draws anything.
export const needsFrameLoop = (backdropType, reliefMode) => backdropType === '3d' && reliefMode !== 'none';
export const canDrawFrame = (isVisible, docHidden, opacity) => isVisible && !docHidden && opacity > 0.01;
