import { VIDEO_SCENES } from './video-scene-contract.mjs';

export const sceneSourceSpecs = Object.freeze(VIDEO_SCENES.map((scene) => scene.source));
