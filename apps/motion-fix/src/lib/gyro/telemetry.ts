// Telemetry probe: from a File (ranged reads only) to the camera motion the
// gyro stabiliser needs — orientation of the *image* frame over time, the
// lens, the rolling-shutter readout — or a reason why it cannot be used.
//
// Axis conventions were measured, not assumed (scripts in the v3 notes):
// tracking features through real clips and asking which rotation of the
// telemetry reproduces their motion. Camera frame: x right, y down, z
// forward. Orientations map camera -> world.
//
//  * GoPro CORI (camera) and IORI (image relative to camera, the in-camera
//    HyperSmooth correction) are stored world->camera in the camera frame:
//    image orientation = conj(IORI ⊗ CORI). Median reprojection error of
//    tracked features: HERO10 0.27 px (HS off), 0.36 px (HS High) at 1080p.
//    The footage is already rolling-shutter corrected in camera (fitted
//    readout 0 ms, forcing SROT makes it worse), so readout = 0.
//  * DJI fused attitude is body (FRD) -> world (NED); camera = body ⊗
//    (120° about (1,1,1)). Readout from the file fits (9.7 ms stated, 11 ms
//    fitted on an Avata clip) with row time = frame time + (y/H − ½)·readout.

import { extractCamm, extractDji, extractGoPro, telemetryTrackOf, videoTrackOf, type GoProRaw } from "./extract.ts";
import { DJI_EIS_NAMES } from "./dji-meta.ts";
import type { ImuLog } from "./imu-log.ts";
import { fitFisheye, scaleLens, thetaD, type LensModel } from "./lens.ts";
import { readMp4Index, type Mp4Index, type Mp4Track, type RangeReader } from "./mp4-index.ts";
import { qangle, qconj, qcontinuous, qexp, qmul, qnorm, qrot, type Quat, type Vec3 } from "./quat.ts";

/**
 * Where the motion came from: in-file camera telemetry (GoPro, DJI), a CAMM
 * track (Street View camera motion metadata), or a motion log the user
 * added next to the video (imu-log.ts).
 */
export type MotionSource = "gopro" | "dji" | "camm" | "imu-log";

export type CameraMotion = {
  source: MotionSource;
  /** Human-readable camera name ("GoPro HERO10 Black", "DJI FC8183"). */
  camera: string;
  /** Image-frame orientation samples, camera -> world, ascending times on the video timeline. */
  times: Float64Array;
  quats: Float64Array;
  /** Rolling-shutter readout top -> bottom, s (0 = corrected in camera). */
  readout: number;
  /** Added to the media time before sampling the orientation. */
  timeOffset: number;
  /** Lens at the video's coded size. */
  lens: LensModel;
  /** Unit "down" direction in the world frame, for horizon levelling (null = unknown). */
  down: Vec3 | null;
  /** In-camera stabilisation that was active while recording. */
  eis: { active: boolean; label: string };
  video: { width: number; height: number; rotation: 0 | 90 | 180 | 270; frameCount: number; duration: number; fps: number };
  notes: string[];
  /** Picture check (medium.ts): which medium explains the tracked motion, and how well the gyro matches the picture. */
  medium?: MediumCheck;
  /** Motion logs: timeOffset range (s) the picture check searches to sync the log's clock. */
  syncRange?: [number, number];
};

export type MediumCheck = {
  /** null when the check could not decide (too little texture or motion). */
  detected: "air" | "water" | null;
  /** Median reprojection error (px at the coded size) of tracked points predicted from the gyro: air / water lens; and with no rotation at all. */
  errAir: number;
  errWater: number;
  errStill: number;
  pairs: number;
  points: number;
  /** False when the gyro barely predicts the picture's motion (trimmed/edited file, EIS warp, sync off). */
  consistent: boolean;
  /** Per-window votes (windows where the camera moved and the gyro explains it): how many, and how many each lens won clearly. */
  windows?: { informative: number; air: number; water: number };
};

export type TelemetryProbe =
  | { status: "ok"; motion: CameraMotion }
  /** Telemetry exists but cannot drive the stabiliser (EIS on, unsupported lens mode, ...). */
  | { status: "unusable"; source: MotionSource; camera: string; reason: string; eisActive: boolean }
  | { status: "none"; reason: string };

/** DJI body (FRD) -> camera (x right, y down, z forward): 120° about (1,1,1). */
const DJI_BODY_TO_CAMERA: Quat = [0.5, 0.5, 0.5, 0.5];

/**
 * HERO10 Wide radial shape, fitted on the public HERO10 samples (HS off:
 * f 907.5 px, k1 0.0657, k2 −0.0051; HS High: f 996, k1 0.0613, k2 −0.0007,
 * both at 1920×1080). The two fits share the shape, the HyperSmooth crop
 * only scales f; the file's ZFOV then sets f for other modes.
 */
export const GOPRO_WIDE_K: [number, number, number, number] = [0.0635, -0.003, 0, 0];
/** Measured ratio of the model's corner radius at ZFOV/2 to the true half diagonal (1.035 HS off, 1.045 HS). */
const GOPRO_ZFOV_CORNER = 1.04;

/**
 * HERO11+ in-file calibration -> OpenCV fisheye. GoPro stores the radial
 * map as angle(p) = Σ poly_i pⁱ with p = ZMPL · r / half-diagonal (at the
 * calibration size VRES); we sample it out to the corner and least-squares
 * fit r = f θd(θ).
 */
export function fisheyeFromGoProPoly(poly: number[], zmpl: number, vw: number, vh: number): LensModel | null {
  const hd = Math.hypot(vw, vh) / 2;
  const samples: { theta: number; r: number }[] = [];
  for (let i = 1; i <= 60; i++) {
    const r = (i / 60) * hd * 1.02;
    const p = (zmpl * r) / hd;
    let th = 0;
    for (let k = poly.length - 1; k >= 0; k--) th = th * p + poly[k];
    samples.push({ theta: th, r });
  }
  const fit = fitFisheye(samples);
  if (!Number.isFinite(fit.f) || fit.f <= 0) return null;
  return { kind: "fisheye", width: vw, height: vh, fx: fit.f, fy: fit.f, cx: vw / 2, cy: vh / 2, k: fit.k, source: "in-file lens calibration" };
}

function goproLens(g: GoProRaw, width: number, height: number, eisOn: boolean): { lens: LensModel } | { error: string } {
  const gl = g.globals;
  const mode = gl.vfov ?? "W";
  const nonRadial = (gl.mapx && gl.mapx.length > 1 && gl.mapx.slice(1).some((c) => Math.abs(c) > 1e-9)) || (gl.arwa && gl.aruw && Math.abs(gl.arwa / gl.aruw - 1) > 1e-3);
  if (mode === "S" || mode === "H" || mode === "X" || nonRadial) {
    return { error: "SuperView / HyperView stretch the image non-uniformly; gyro stabilisation supports the Wide, Linear and Narrow lens modes" };
  }
  const halfDiag = Math.hypot(width, height) / 2;
  if (gl.poly && gl.poly.length >= 2 && gl.zmpl && gl.vres && gl.vres.length >= 2) {
    const lens = fisheyeFromGoProPoly(gl.poly, gl.zmpl, gl.vres[0], gl.vres[1]);
    if (lens) return { lens: scaleLens(lens, width, height) };
  }
  if (mode === "L") {
    // Linear: rectilinear in camera. ZFOV is the recorded diagonal.
    const fov = gl.zfov ?? 85;
    const f = halfDiag / Math.tan((fov * Math.PI) / 360);
    return { lens: { kind: "pinhole", width, height, fx: f, fy: f, cx: width / 2, cy: height / 2, k: [0, 0, 0, 0], source: "Linear lens mode (rectilinear)" } };
  }
  const k = GOPRO_WIDE_K;
  let f: number;
  let source: string;
  if (gl.zfov) {
    const th = (gl.zfov * Math.PI) / 360;
    f = (GOPRO_ZFOV_CORNER * halfDiag) / thetaD(k, th);
    source = `GoPro ${mode === "N" ? "Narrow" : "Wide"} profile (FOV ${gl.zfov.toFixed(1)}° from file)`;
  } else {
    // No udta (remuxed file): the HERO10 fits, scaled with the frame diagonal.
    f = ((eisOn ? 996 : 907.5) * halfDiag) / Math.hypot(960, 540);
    source = "GoPro Wide profile (no lens info in file)";
  }
  return { lens: { kind: "fisheye", width, height, fx: f, fy: f, cx: width / 2, cy: height / 2, k: [...k], source } };
}

function seriesQuat(v: Float64Array, i: number): Quat {
  return [v[4 * i], v[4 * i + 1], v[4 * i + 2], v[4 * i + 3]];
}

/**
 * GoPro GYRO (rad/s, channels named by ORIN, lowercase = negated) -> camera
 * orientation by integration. Measured on HERO10 against CORI: camera x =
 * −X, y = −Z, z = −Y in GoPro's axis letters, and the integrated path lines
 * up with CORI when the samples (timed by STMP) move 6 ms earlier — that
 * includes the half-sample lag of this end-point integrator. Residual
 * against CORI: 0.008°/frame.
 */
export const GOPRO_GYRO_LEAD = 0.006;

/**
 * Channel order for bodies that write no ORIN, measured by tracking
 * features through public clips and searching all 48 signed axis orders
 * (scratchpad uw-axes.ts, 25 Oct 2026): HERO5 Black ZXY (gpmf-parser
 * sample 1.12 px vs 5.37 px with no rotation; underwater GOPR0507 too),
 * HERO6 Black YxZ (gpmf-parser sample 1.81 vs 4.02 px, Gyroflow test clip
 * 7.3 vs 29.3 px; ZXY made the HERO6 picture shake worse than no
 * stabilisation at all).
 */
export function defaultGoProOrin(model: string | null | undefined): string {
  return model && /HERO6/i.test(model) ? "YxZ" : "ZXY";
}

export function integrateGoProGyro(times: Float64Array, values: Float64Array, orin: string | null, model?: string | null): { times: Float64Array; quats: Float64Array } | null {
  const o = orin && /^[XYZxyz]{3}$/.test(orin) ? orin : defaultGoProOrin(model);
  // Camera axis (0 x, 1 y, 2 z) and sign for each GoPro letter.
  const axisOf: Record<string, [number, number]> = { X: [0, -1], Z: [1, -1], Y: [2, -1] };
  const map = [...o].map((ch) => {
    const [axis, sign] = axisOf[ch.toUpperCase()];
    return [axis, ch === ch.toUpperCase() ? sign : -sign] as [number, number];
  });
  if (new Set(map.map((m) => m[0])).size !== 3) return null;
  const n = times.length;
  if (n < 2) return null;
  const outT = new Float64Array(n);
  const outQ = new Float64Array(4 * n);
  let q: Quat = [1, 0, 0, 0];
  const w: Vec3 = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      const h = Math.min(0.05, Math.max(0, times[k] - times[k - 1]));
      for (let c = 0; c < 3; c++) w[map[c][0]] = map[c][1] * values[3 * k + c] * h;
      q = qnorm(qmul(q, qexp(w)));
    }
    outT[k] = times[k] - GOPRO_GYRO_LEAD;
    outQ.set(q, 4 * k);
  }
  return { times: outT, quats: outQ };
}

export async function probeTelemetry(read: RangeReader, fileSize: number, opts: { signal?: AbortSignal; onProgress?: (f: number) => void; ignoreCori?: boolean } = {}): Promise<TelemetryProbe> {
  let index;
  try {
    index = await readMp4Index(read, fileSize);
  } catch (e) {
    return { status: "none", reason: `container not readable (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!index) return { status: "none", reason: "not an MP4/MOV file" };
  const video = videoTrackOf(index);
  if (!video || !video.samples.length) return { status: "none", reason: "no video track" };
  const found = telemetryTrackOf(index);
  if (!found) return { status: "none", reason: "no motion data track" };
  const videoInfo = videoInfoOf(video);
  const coded = { w: videoInfo.width, h: videoInfo.height };

  if (found.kind === "camm") {
    const c = await extractCamm(found.track, read, opts);
    return cammProbe(c, index, videoInfo);
  }

  if (found.kind === "gopro") {
    const g = await extractGoPro(index, found.track, read, opts);
    const camera = `GoPro ${g.globals.model ?? ""}`.trim();
    if (opts.ignoreCori) g.cori = null;
    if (!g.cori || g.cori.times.length < 2) {
      // Older bodies (HERO5–HERO8): integrate the raw gyro. Without IORI
      // there is no record of what HyperSmooth did to the picture.
      if (g.globals.eise === "Y") {
        return { status: "unusable", source: "gopro", camera, reason: "HyperSmooth was on and this GoPro does not record its correction; turn HyperSmooth off for gyro stabilisation", eisActive: true };
      }
      const integrated = g.gyro ? integrateGoProGyro(g.gyro.times, g.gyro.values, g.gyroOrin, g.globals.model) : null;
      if (!integrated) return { status: "unusable", source: "gopro", camera, reason: "no usable gyro stream in the GoPro metadata", eisActive: false };
      const lensR = goproLens(g, coded.w, coded.h, false);
      if ("error" in lensR) return { status: "unusable", source: "gopro", camera, reason: lensR.error, eisActive: false };
      return {
        status: "ok",
        motion: {
          source: "gopro",
          camera,
          times: integrated.times,
          quats: integrated.quats,
          readout: 0,
          timeOffset: 0,
          lens: lensR.lens,
          down: null,
          eis: { active: false, label: "off" },
          video: videoInfo,
          notes: ["orientation integrated from the raw gyro"],
        },
      };
    }
    const n = g.cori.times.length;
    // HyperSmooth: EISE flag, or a non-trivial IORI correction.
    let ioriP95 = 0;
    if (g.iori && g.iori.times.length === n) {
      const ang: number[] = [];
      for (let i = 0; i < n; i++) ang.push(qangle(seriesQuat(g.iori.values, i)));
      ang.sort((a, b) => a - b);
      ioriP95 = (ang[Math.floor(0.95 * (n - 1))] * 180) / Math.PI;
    }
    const eisOn = g.globals.eise === "Y" || ioriP95 > 1;
    const lensR = goproLens(g, coded.w, coded.h, eisOn);
    if ("error" in lensR) return { status: "unusable", source: "gopro", camera, reason: lensR.error, eisActive: eisOn };
    const quats = new Float64Array(4 * n);
    const useIori = !!g.iori && g.iori.times.length === n;
    for (let i = 0; i < n; i++) {
      const c = seriesQuat(g.cori.values, i);
      const q = useIori ? qconj(qmul(seriesQuat(g.iori!.values, i), c)) : qconj(c);
      quats.set(qnorm(q), 4 * i);
    }
    qcontinuous(quats);
    // Gravity: GRAV is in the camera frame; carried to the world by conj(CORI).
    let down: Vec3 | null = null;
    if (g.grav && g.grav.times.length === n) {
      const m: Vec3 = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const v = qrot(qconj(seriesQuat(g.cori.values, i)), [g.grav.values[3 * i], g.grav.values[3 * i + 1], g.grav.values[3 * i + 2]]);
        m[0] += v[0];
        m[1] += v[1];
        m[2] += v[2];
      }
      const len = Math.hypot(...m);
      if (len > 0.5 * n) down = [m[0] / len, m[1] / len, m[2] / len];
    }
    const notes: string[] = [];
    if (eisOn) notes.push(`HyperSmooth was on (${g.globals.eisa ?? "active"}); its correction is read from the file and refined`);
    return {
      status: "ok",
      motion: {
        source: "gopro",
        camera,
        times: Float64Array.from(g.cori.times),
        quats,
        readout: 0,
        timeOffset: 0,
        lens: lensR.lens,
        down,
        eis: { active: eisOn, label: eisOn ? `HyperSmooth (${g.globals.eisa ?? "on"})` : "off" },
        video: videoInfo,
        notes,
      },
    };
  }

  const d = await extractDji(found.track, read, opts);
  const clip = d.clip;
  const camera = `DJI ${clip?.productName?.replace(/^DJI\s*/, "") ?? ""}`.trim();
  const eisStatus = clip?.eisStatus ?? 0;
  const eisActive = eisStatus !== 0 && eisStatus !== 7;
  if (eisActive) {
    const name = DJI_EIS_NAMES[eisStatus] ?? `mode ${eisStatus}`;
    return { status: "unusable", source: "dji", camera, reason: `EIS was on in camera (${name}): the recorded frames are already warped, so the gyro data no longer matches them`, eisActive: true };
  }
  if (d.attitude.times.length < 10) return { status: "unusable", source: "dji", camera, reason: "no attitude samples in the DJI metadata", eisActive: false };
  if (!clip?.focalLength || !clip.distortion || clip.distortion.length < 4) {
    return { status: "unusable", source: "dji", camera, reason: "no lens calibration in the DJI metadata", eisActive: false };
  }
  const n = d.attitude.times.length;
  const quats = new Float64Array(4 * n);
  for (let i = 0; i < n; i++) quats.set(qnorm(qmul(seriesQuat(d.attitude.values, i), DJI_BODY_TO_CAMERA)), 4 * i);
  qcontinuous(quats);
  const cw = clip.videoWidth || coded.w;
  const ch = clip.videoHeight || coded.h;
  const k = clip.distortion.slice(0, 4) as [number, number, number, number];
  const lens = scaleLens({ kind: "fisheye", width: cw, height: ch, fx: clip.focalLength, fy: clip.focalLength, cx: cw / 2, cy: ch / 2, k, source: "in-file lens calibration" }, coded.w, coded.h);
  const sensorFps = clip.sensorFps || clip.videoFps || videoInfo.fps;
  const videoFps = clip.videoFps || sensorFps;
  const readout = clip.readoutNs ? (clip.readoutNs / 1e9) * (sensorFps / videoFps) : 0;
  return {
    status: "ok",
    motion: {
      source: "dji",
      camera,
      times: Float64Array.from(d.attitude.times),
      quats,
      readout,
      timeOffset: 0,
      lens,
      down: [0, 0, 1],
      eis: { active: false, label: "off" },
      video: videoInfo,
      notes: readout ? [`rolling shutter ${(readout * 1000).toFixed(1)} ms corrected`] : [],
    },
  };
}

type VideoInfo = CameraMotion["video"];

export function videoInfoOf(video: Mp4Track): VideoInfo {
  // Lens and orientation live in coded (sensor) orientation. The tkhd size is
  // the track's size before its matrix (ISO 14496-12), i.e. coded: a portrait
  // Pixel clip reads 3840×2160 with a 90° matrix (checked 25 Oct 2026), as do
  // iPhone clips (AVFoundation's naturalSize + preferredTransform).
  const coded = { w: Math.round(video.width), h: Math.round(video.height) };
  const frameCount = video.samples.length;
  const duration = video.duration || frameCount / 30;
  return { width: coded.w, height: coded.h, rotation: video.rotation, frameCount, duration, fps: frameCount / duration };
}

/**
 * Body rates already in the camera frame (rad/s, x right, y down, z
 * forward) -> camera -> world orientation, integrated like the GoPro gyro
 * (end-point rule; `lead` moves the result earlier, s).
 */
export function integrateRates(times: Float64Array, values: Float64Array, lead = 0): { times: Float64Array; quats: Float64Array } | null {
  const n = times.length;
  if (n < 2) return null;
  const outT = new Float64Array(n);
  const outQ = new Float64Array(4 * n);
  let q: Quat = [1, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      const h = Math.min(0.05, Math.max(0, times[k] - times[k - 1]));
      q = qnorm(qmul(q, qexp([values[3 * k] * h, values[3 * k + 1] * h, values[3 * k + 2] * h])));
    }
    outT[k] = times[k] - lead;
    outQ.set(q, 4 * k);
  }
  return { times: outT, quats: outQ };
}

/** Typical phone main camera: 26 mm equivalent on a 4:3 sensor. */
export const PHONE_DEFAULT_F35 = 26;

/**
 * Rectilinear lens for phone footage. Phones correct their distortion in
 * camera, so a pinhole fits; the focal comes from the 35 mm-equivalent
 * focal length when the file states it (iPhone moov/meta), else 26 mm.
 * 35 mm equivalence is defined on the diagonal of a 4:3 still; a 16:9
 * video keeps the sensor width, so f = f35 / 43.27 · (1.25 · long side).
 * The picture check refines the focal (EIS crops the frame further).
 */
export function phoneLens(width: number, height: number, f35: number | null, source: string): LensModel {
  const long = Math.max(width, height);
  const f = ((f35 ?? PHONE_DEFAULT_F35) / 43.27) * 1.25 * long;
  return { kind: "pinhole", width, height, fx: f, fy: f, cx: width / 2, cy: height / 2, k: [0, 0, 0, 0], source };
}

/** 35 mm-equivalent focal length from QuickTime metadata keys, when present. */
export function focal35FromMeta(keys: Record<string, string>): number | null {
  for (const k of ["com.apple.quicktime.camera.focal_length.35mm_equivalent", "com.android.capture.focal_length_35mm"]) {
    const v = Number(keys[k]);
    if (Number.isFinite(v) && v > 8 && v < 400) return v;
  }
  // "iPhone 15 Pro back camera 6.765mm f/1.78" names the real focal only.
  return null;
}

function deviceName(index: Mp4Index): string | null {
  const k = index.metaKeys;
  const make = k["com.apple.quicktime.make"]?.trim();
  const model = k["com.apple.quicktime.model"]?.trim();
  if (model) return make && !model.startsWith(make) ? `${make} ${model}` : model;
  return null;
}

function cammProbe(c: import("./camm.ts").CammRaw, index: Mp4Index, videoInfo: VideoInfo): TelemetryProbe {
  const camera = "Phone motion data (CAMM)";
  const { width: w, height: h } = videoInfo;
  if (Math.abs(w / h - 2) < 0.02) {
    return { status: "unusable", source: "camm", camera, reason: "360° (equirectangular) footage: gyro stabilisation needs a normal lens", eisActive: false };
  }
  let times: Float64Array;
  let quats: Float64Array;
  const notes: string[] = [];
  if (c.gyro && c.gyro.times.length >= 10) {
    const r = integrateRates(c.gyro.times, c.gyro.values)!;
    times = r.times;
    quats = r.quats;
    notes.push("orientation integrated from the CAMM gyro");
  } else if (c.orientation && c.orientation.times.length >= 10) {
    times = Float64Array.from(c.orientation.times);
    quats = Float64Array.from(c.orientation.values);
    qcontinuous(quats);
    notes.push("CAMM orientation");
  } else {
    return { status: "unusable", source: "camm", camera, reason: "the CAMM track has no gyro or orientation samples", eisActive: false };
  }
  const f35 = focal35FromMeta(index.metaKeys);
  const lens = phoneLens(w, h, f35, f35 ? `rectilinear, ${f35} mm equivalent from file` : "rectilinear, focal estimated");
  const readout = c.readoutNs ? c.readoutNs / 1e9 : 0;
  if (readout) notes.push(`rolling shutter ${(readout * 1000).toFixed(1)} ms from CAMM`);
  const dev = deviceName(index);
  return {
    status: "ok",
    motion: {
      source: "camm",
      camera: dev ? `${camera} · ${dev}` : camera,
      times,
      quats,
      readout,
      timeOffset: 0,
      lens,
      down: null,
      eis: { active: false, label: "off" },
      video: videoInfo,
      notes,
    },
  };
}

/**
 * Camera motion from a sidecar motion log for the video in `read`. The
 * log runs on its own clock: the first guess for the offset (telemetry
 * time = media time + timeOffset) comes from the two wall clocks when both
 * are known (log start, video creation time), else the log is taken to
 * start with the video. medium.ts then syncs it to the picture.
 */
export async function probeWithLog(read: RangeReader, fileSize: number, log: ImuLog): Promise<TelemetryProbe> {
  const camera = log.format === "gcsv" ? "Motion log (.gcsv)" : `Motion log (${log.label})`;
  let index;
  try {
    index = await readMp4Index(read, fileSize);
  } catch (e) {
    return { status: "none", reason: `container not readable (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!index) return { status: "none", reason: "not an MP4/MOV file" };
  const video = videoTrackOf(index);
  if (!video || !video.samples.length) return { status: "none", reason: "no video track" };
  const videoInfo = videoInfoOf(video);
  const integrated = integrateRates(log.gyro.times, log.gyro.values);
  if (!integrated) return { status: "unusable", source: "imu-log", camera, reason: "the motion log has too few gyro samples", eisActive: false };
  const { width: w, height: h } = videoInfo;
  let lens: LensModel;
  const info = (log.lensInfo ?? "").toLowerCase();
  if (/wide|fisheye|super|ultra/.test(info) && log.format === "gcsv" && !/linear/.test(info)) {
    // Action-cam loggers (RunCam, Caddx, ...): fisheye, about 150° across the diagonal, refined by the picture check.
    const th = (150 * Math.PI) / 360;
    const f = Math.hypot(w, h) / 2 / th;
    lens = { kind: "fisheye", width: w, height: h, fx: f, fy: f, cx: w / 2, cy: h / 2, k: [0, 0, 0, 0], source: `generic fisheye (${log.lensInfo})` };
  } else {
    const f35 = focal35FromMeta(index.metaKeys);
    lens = phoneLens(w, h, f35, f35 ? `rectilinear, ${f35} mm equivalent from file` : "rectilinear, focal estimated");
  }
  const notes = [...log.notes];
  if (log.device) notes.unshift(`logged by ${log.device}`);
  let timeOffset = 0;
  if (log.wallStart !== null && index.creationTime !== null) {
    const off = index.creationTime - log.wallStart;
    const logEnd = log.gyro.times[log.gyro.times.length - 1];
    // Only when it puts the clip inside the log (creation times are whole seconds, and some phones stamp the end).
    if (off > -2 && off < logEnd + 2) {
      timeOffset = off;
      notes.push(`log clock placed by the wall clocks (${off.toFixed(1)} s into the log)`);
    }
  }
  const coverStart = log.gyro.times[0] - timeOffset;
  const coverEnd = log.gyro.times[log.gyro.times.length - 1] - timeOffset;
  if (coverEnd < 0.5 || coverStart > videoInfo.duration - 0.5) notes.push("the log may not cover this clip");
  // Picture sync range: ±3 s around a wall-clock placement, else anywhere the clip fits inside the log.
  const logStart = log.gyro.times[0], logEnd = log.gyro.times[log.gyro.times.length - 1];
  const fitLo = logStart - 1, fitHi = Math.max(fitLo, logEnd - videoInfo.duration + 1);
  const syncRange: [number, number] = timeOffset !== 0 ? [Math.max(fitLo, timeOffset - 3), Math.min(fitHi, timeOffset + 3)] : [fitLo, Math.min(fitHi, fitLo + 600)];
  if (syncRange[1] < syncRange[0]) syncRange[1] = syncRange[0];
  const dev = deviceName(index);
  return {
    status: "ok",
    motion: {
      syncRange,
      source: "imu-log",
      camera: dev ? `${camera} · ${dev}` : camera,
      times: integrated.times,
      quats: integrated.quats,
      readout: log.readout ?? 0,
      timeOffset,
      lens,
      down: null,
      eis: { active: false, label: "off" },
      video: videoInfo,
      notes,
    },
  };
}
