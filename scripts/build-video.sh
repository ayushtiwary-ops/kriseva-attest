#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VIDEO_DIR="$PROJECT_ROOT/video"
OUTPUT_VIDEO="$VIDEO_DIR/KRISEVA_ATTEST_DEMO_90S.mp4"
OUTPUT_THUMBNAIL="$VIDEO_DIR/KRISEVA_ATTEST_DEMO_THUMBNAIL.png"
OUTPUT_VERBATIM_CAPTIONS="$VIDEO_DIR/captions-verbatim.srt"
# Preferred narration engine: edge-tts neural voice; macOS `say` remains the
# offline fallback so a clean checkout without network can still rebuild.
NEURAL_VOICE="${ATTEST_NEURAL_VOICE:-en-US-AndrewNeural}"
VOICE="${ATTEST_VOICE:-Rishi}"
SPEECH_RATE="${ATTEST_SPEECH_RATE:-170}"
EDGE_RATE="${ATTEST_EDGE_RATE:-+0%}"
USE_NEURAL=0
if [ "${ATTEST_FORCE_SAY:-0}" != "1" ] && command -v edge-tts >/dev/null 2>&1; then
  USE_NEURAL=1
fi
TASK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/attest-video.XXXXXX")"

cleanup() {
  if [ "${ATTEST_KEEP_TASK_DIR:-0}" = "1" ]; then
    echo "Kept build workspace: $TASK_DIR" >&2
  else
    rm -rf "$TASK_DIR"
  fi
}
trap cleanup EXIT

for command_name in node ffmpeg ffprobe say awk; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

mkdir -p "$VIDEO_DIR" "$TASK_DIR/scenes" "$TASK_DIR/interaction" "$TASK_DIR/segments" "$TASK_DIR/audio"
CANDIDATE_VIDEO="$TASK_DIR/KRISEVA_ATTEST_DEMO_90S.mp4"
CANDIDATE_THUMBNAIL="$TASK_DIR/KRISEVA_ATTEST_DEMO_THUMBNAIL.png"
CANDIDATE_VERBATIM_CAPTIONS="$TASK_DIR/captions-verbatim.srt"
CONCAT_VIDEO="$TASK_DIR/concatenated-silent.mp4"
NARRATION_TRACK="$TASK_DIR/audio/narration-track.wav"
NOISE_BED="$TASK_DIR/audio/noise-bed.wav"
MIXED_AUDIO="$TASK_DIR/audio/mixed.wav"
MASTERED_AUDIO="$TASK_DIR/audio/mastered.wav"
SEGMENT_LIST="$TASK_DIR/segments.txt"
AUDIO_SEGMENT_LIST="$TASK_DIR/audio-segments.txt"
: > "$SEGMENT_LIST"
: > "$AUDIO_SEGMENT_LIST"

# 1. Build the seven deterministic scene stills / recording caption bands and
#    the per-scene narration text files, from the canonical scene contract.
node "$SCRIPT_DIR/build-video-scenes.mjs" "$TASK_DIR/scenes"

# 2. Record (or, on failure, fall back for) the two real-interaction scenes
#    (4: conflict decision, 5: sign-off + receipt) against the local
#    prototype. Produces exact-target-length silent 1920x914 clips.
node "$SCRIPT_DIR/build-video-interaction.mjs" "$TASK_DIR/interaction"

# 3. Narrate every scene, verify the narration fits its scene window, and
#    build each scene's exact-frame-count silent 1920x1080 video segment plus
#    its exact-scene-duration narration audio segment (silence-padded).
#    Scene durations/kinds are read from video-scene-contract.mjs so this
#    script can never drift from the canonical seven-scene design.
SCENE_MANIFEST="$(node "$SCRIPT_DIR/build-video-scene-manifest.mjs")" \
  || { echo "Failed to read the video scene manifest" >&2; exit 1; }
# Read into an array up front rather than looping over `<<< "$SCENE_MANIFEST"`
# directly: ffmpeg reads stdin for interactive control by default, and a
# `while read ... done <<< ...` loop shares its stdin with every command
# inside the loop body, so an in-loop ffmpeg call would silently steal bytes
# meant for the next `read` and desync the whole manifest. -nostdin on every
# ffmpeg call below is the belt; this array is the suspenders. (Split on
# newline only, bash-3.2-compatible: macOS ships bash 3.2, which has no
# `mapfile`/`readarray`.)
PREVIOUS_IFS="$IFS"
IFS=$'\n'
SCENE_LINES=($SCENE_MANIFEST)
IFS="$PREVIOUS_IFS"
if [ "${#SCENE_LINES[@]}" -ne 7 ]; then
  echo "Expected 7 scenes from the manifest, got ${#SCENE_LINES[@]}" >&2
  exit 1
fi

for scene_line in "${SCENE_LINES[@]}"; do
  read -r scene_id duration kind <<< "$scene_line"
  padded_id="$(printf '%02d' "$scene_id")"
  frame_count="$((duration * 30))"
  fade_out="$(awk -v d="$duration" 'BEGIN { printf "%.2f", d - 0.35 }')"

  if [ "$USE_NEURAL" = "1" ]; then
    edge-tts --voice "$NEURAL_VOICE" --rate "$EDGE_RATE" --file "$TASK_DIR/scenes/scene-$padded_id.txt" \
      --write-media "$TASK_DIR/audio/voice-$padded_id.mp3"
    ffmpeg -hide_banner -loglevel error -nostdin -y -i "$TASK_DIR/audio/voice-$padded_id.mp3" \
      -ar 48000 -ac 1 "$TASK_DIR/audio/voice-$padded_id.aiff"
  else
    say -v "$VOICE" -r "$SPEECH_RATE" -o "$TASK_DIR/audio/voice-$padded_id.aiff" -f "$TASK_DIR/scenes/scene-$padded_id.txt"
  fi
  node "$SCRIPT_DIR/verify-narration-fit.mjs" "$TASK_DIR/audio/voice-$padded_id.aiff" "$duration" \
    > "$TASK_DIR/audio/narration-fit-$padded_id.json"

  if [ "$kind" = "design" ]; then
    ffmpeg -hide_banner -loglevel error -nostdin -y \
      -loop 1 -framerate 30 -i "$TASK_DIR/scenes/scene-$padded_id.png" \
      -filter_complex "[0:v]zoompan=z='min(zoom+0.00006,1.022)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$frame_count:s=1920x1080:fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st=$fade_out:d=0.35,format=yuv420p[v]" \
      -map '[v]' -an -t "$duration" -r 30 -vframes "$frame_count" \
      -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p \
      "$TASK_DIR/segments/segment-$padded_id.mp4"
  else
    interaction_clip="$TASK_DIR/interaction/interaction-conflict.mp4"
    if [ "$scene_id" = "5" ]; then
      interaction_clip="$TASK_DIR/interaction/interaction-signoff.mp4"
    fi
    # tpad clones the last real frame well past the target duration so a
    # slightly-short recording (real timing always varies a little) never
    # runs out before the hard -t/-vframes cut below; it never truncates the
    # genuine recorded action, only extends the trailing hold if needed. The
    # static caption band is overlaid across the full clip length.
    ffmpeg -hide_banner -loglevel error -nostdin -y \
      -i "$interaction_clip" \
      -loop 1 -i "$TASK_DIR/scenes/scene-$padded_id-band.png" \
      -filter_complex "[0:v]scale=1920:914:force_original_aspect_ratio=decrease,pad=1920:914:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,tpad=stop_mode=clone:stop_duration=6,pad=1920:1080:0:0:color=black[iv];[iv][1:v]overlay=0:914,format=yuv420p[v]" \
      -map '[v]' -an -t "$duration" -r 30 -vframes "$frame_count" \
      -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p \
      "$TASK_DIR/segments/segment-$padded_id.mp4"
  fi
  printf "file '%s'\n" "$TASK_DIR/segments/segment-$padded_id.mp4" >> "$SEGMENT_LIST"

  # Exact-duration narration audio segment: EQ, a small lead-in, then
  # silence-pad/trim to fill the scene's slot precisely. These concatenate
  # below into one continuous 90s narration track; the master pass (step 5)
  # adds the constant low-level noise bed and loudnorms the whole thing once.
  ffmpeg -hide_banner -loglevel error -nostdin -y \
    -i "$TASK_DIR/audio/voice-$padded_id.aiff" \
    -af "highpass=f=70,lowpass=f=12000,adelay=120,apad,atrim=duration=$duration" \
    -ar 48000 -ac 1 \
    "$TASK_DIR/audio/scene-audio-$padded_id.wav"
  printf "file '%s'\n" "$TASK_DIR/audio/scene-audio-$padded_id.wav" >> "$AUDIO_SEGMENT_LIST"
done

# 4. Concatenate the seven silent segments (identical codec/profile/pix_fmt,
#    so a stream copy is exact) into one 2700-frame, 90.000s silent video.
ffmpeg -hide_banner -loglevel error -nostdin -y \
  -f concat -safe 0 -i "$SEGMENT_LIST" -c copy \
  "$CONCAT_VIDEO"

# 5. Master audio: concatenate the seven exact-duration narration segments
#    into one 90s track, mix in a continuous very low (~-50dBFS) pink-noise
#    bed so no gap ever touches digital zero, then loudnorm the combined
#    signal once to the release target and fold to stereo.
ffmpeg -hide_banner -loglevel error -nostdin -y \
  -f concat -safe 0 -i "$AUDIO_SEGMENT_LIST" \
  -c:a pcm_s16le -ar 48000 -ac 1 \
  "$NARRATION_TRACK"

ffmpeg -hide_banner -loglevel error -nostdin -y \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.0032:duration=90:sample_rate=48000" \
  -ac 1 "$NOISE_BED"

ffmpeg -hide_banner -loglevel error -nostdin -y \
  -i "$NARRATION_TRACK" -i "$NOISE_BED" \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[mixed]" \
  -map "[mixed]" -ar 48000 -ac 1 \
  "$MIXED_AUDIO"

node "$SCRIPT_DIR/build-video-loudnorm.mjs" "$MIXED_AUDIO" "$TASK_DIR/audio/loudnormed.wav" -16 -1.5
ffmpeg -hide_banner -loglevel error -nostdin -y \
  -i "$TASK_DIR/audio/loudnormed.wav" \
  -ar 48000 -ac 2 -t 90 \
  "$MASTERED_AUDIO"

# 6. Final mux/encode: the silent concatenated picture plus the mastered
#    audio, tagged BT.709 and capped at ~5 Mbps, forced to exactly 2700
#    frames at 30 fps so the release contract is exact regardless of any
#    rounding in the intermediate stages.
ffmpeg -hide_banner -loglevel error -nostdin -y \
  -i "$CONCAT_VIDEO" -i "$MASTERED_AUDIO" \
  -map 0:v -map 1:a \
  -r 30 -vframes 2700 \
  -c:v libx264 -profile:v high -level 4.1 -preset medium \
  -b:v 5M -maxrate 5M -bufsize 10M -pix_fmt yuv420p \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -shortest \
  -metadata title="KRISEVA ATTEST · 90-second synthetic prototype demonstration" \
  -metadata comment="Research-stage prototype; synthetic demo data; not a regulatory filing; not connected to IFSCA systems." \
  -movflags +faststart \
  "$CANDIDATE_VIDEO"

# 7. Dedicated thumbnail design (not a video frame) and the verbatim caption
#    sidecar, built from the measured per-scene narration durations.
node "$SCRIPT_DIR/build-video-thumbnail.mjs" "$CANDIDATE_THUMBNAIL"
node "$SCRIPT_DIR/build-video-captions.mjs" "$TASK_DIR/audio" "$CANDIDATE_VERBATIM_CAPTIONS"

# 8. Verify the release media contract and install atomically; only after
#    that succeeds does the verbatim caption sidecar land next to it.
node "$SCRIPT_DIR/install-video-release-cli.mjs" "$CANDIDATE_VIDEO" "$CANDIDATE_THUMBNAIL" "$OUTPUT_VIDEO" "$OUTPUT_THUMBNAIL"
cp "$CANDIDATE_VERBATIM_CAPTIONS" "$OUTPUT_VERBATIM_CAPTIONS"

echo "Built $OUTPUT_VIDEO"
