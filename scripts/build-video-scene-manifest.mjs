// Prints "<id> <duration> <kind>" per line for every scene in the canonical
// video scene contract. build-video.sh reads this instead of hardcoding
// scene durations, so the shell pipeline can never drift from
// video-scene-contract.mjs (the single source of truth). Deliberately a
// dedicated file rather than `node -e` inline, to keep the build script
// shell-safe and testable.
import { VIDEO_SCENES } from './video-scene-contract.mjs';

for (const scene of VIDEO_SCENES) {
  process.stdout.write(`${scene.id} ${scene.duration} ${scene.kind}\n`);
}
