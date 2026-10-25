// Container facts the <video> element doesn't expose: rotation metadata (the
// lens model lives in the coded frame), coded size, frame rate, audio.

import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { turnsOf, type QuarterTurns } from "./geometry-math.ts";

export type ClipInfo = {
  rot: QuarterTurns;
  /** Upright size (what the viewer sees). */
  displayW: number;
  displayH: number;
  /** Stored (sensor) orientation size, square pixels. */
  codedW: number;
  codedH: number;
  fps: number;
  duration: number;
  codec: string | null;
  hasAudio: boolean;
  /** RFC 6381 codec string (e.g. "hvc1.2.4.L153.B0"): profile and bit depth. */
  codecString?: string | null;
  /** Colour description from the codec config / container (primaries, transfer, matrix, range). */
  colorTags?: { primaries?: string | null; transfer?: string | null; matrix?: string | null; fullRange?: boolean | null } | null;
  /** Whether this browser's WebCodecs can decode the track (export, motion analysis). */
  canDecode?: boolean;
};

export async function probeClip(file: File): Promise<ClipInfo | null> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const rot = turnsOf(await track.getRotation());
    const displayW = await track.getDisplayWidth();
    const displayH = await track.getDisplayHeight();
    const [codedW, codedH] = rot % 2 === 1 ? [displayH, displayW] : [displayW, displayH];
    const stats = await track.computePacketStats(90).catch(() => null);
    const audio = await input.getPrimaryAudioTrack().catch(() => null);
    const colorTags = await track.getColorSpace().catch(() => null);
    return {
      rot,
      displayW,
      displayH,
      codedW,
      codedH,
      fps: stats?.averagePacketRate ?? 30,
      duration: await input.computeDuration().catch(() => 0),
      codec: await track.getCodec().catch(() => null),
      hasAudio: !!audio,
      codecString: await track.getCodecParameterString().catch(() => null),
      colorTags: colorTags ? { primaries: colorTags.primaries ?? null, transfer: colorTags.transfer ?? null, matrix: colorTags.matrix ?? null, fullRange: colorTags.fullRange ?? null } : null,
      canDecode: await track.canDecode().catch(() => false),
    };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}
