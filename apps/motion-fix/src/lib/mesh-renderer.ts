// WebGL mesh-warp renderer: the single renderer for the preview and the
// export.
//
// Coordinate model:
//   * Vertex POSITIONS are static — each vertex sits at its identity grid
//     spot in NDC, so the output pixel under a vertex never moves.
//   * Vertex UVs are dynamic — each vertex samples the source where the
//     stabilising warp says that output point came from. A similarity is
//     exact under linear interpolation; the grid is dense enough that a
//     per-row homography blend (wobble suppression) would also be, which is
//     why warps are supplied as a per-vertex callback rather than a matrix.
//
// Moving UVs instead of positions keeps the geometry rock-solid at the frame
// edges: displaced positions push corner triangles outside [-1, 1] and
// stretch them into wedges.
//
// Sources: the <video> element for the preview (already upright) and
// VideoFrames straight from the decoder for the export. A VideoFrame is in
// coded orientation, so the container rotation is folded into the UVs
// instead of paying for a rotated copy of every 4K frame.

import type { Similarity } from "./tracker.ts";

export const GRID_W = 32;
export const GRID_H = 18;
const VERT_W = GRID_W + 1;
const VERT_H = GRID_H + 1;
const VERT_COUNT = VERT_W * VERT_H;

export type Rotation = 0 | 90 | 180 | 270;

/** Output pixel (centred, display px) -> source pixel (centred, display px). */
export type WarpFn = (x: number, y: number) => readonly [number, number];

export type RenderOptions = {
  /** Null renders the source untouched. */
  warp: WarpFn | Similarity | null;
  /** Rotation of the uploaded texture relative to display orientation. */
  rotation: Rotation;
  /** Compare wipe: fraction of the width (from the left) that shows the original; null = off. */
  split: number | null;
};

const VERT_SHADER = `
attribute vec2 a_pos;
attribute vec2 a_uv;
attribute vec2 a_uvId;
varying vec2 v_uv;
varying vec2 v_uvId;
void main() {
  v_uv = a_uv;
  v_uvId = a_uvId;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SHADER = `
precision highp float;
uniform sampler2D u_image;
uniform float u_split;   // < 0: off
uniform float u_width;
varying vec2 v_uv;
varying vec2 v_uvId;
void main() {
  vec2 uv = (u_split >= 0.0 && gl_FragCoord.x < u_split * u_width) ? v_uvId : v_uv;
  // Honest black where the warp asks for pixels outside the source: an
  // edge-clamp smear is far more distracting than a bar.
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  gl_FragColor = texture2D(u_image, uv);
}
`;

function buildIdentityPositions(): Float32Array {
  const pos = new Float32Array(VERT_COUNT * 2);
  let i = 0;
  for (let vy = 0; vy < VERT_H; vy++) {
    for (let vx = 0; vx < VERT_W; vx++) {
      pos[i++] = (vx / GRID_W) * 2 - 1;
      pos[i++] = 1 - (vy / GRID_H) * 2;
    }
  }
  return pos;
}

// CCW winding so a caller enabling CULL_FACE would not drop everything.
function buildIndices(): Uint16Array {
  const idx = new Uint16Array(GRID_W * GRID_H * 6);
  let i = 0;
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const v00 = cy * VERT_W + cx;
      const v10 = v00 + 1;
      const v01 = v00 + VERT_W;
      const v11 = v01 + 1;
      idx[i++] = v00; idx[i++] = v11; idx[i++] = v10;
      idx[i++] = v00; idx[i++] = v01; idx[i++] = v11;
    }
  }
  return idx;
}

/** Display-normalised (x, y) -> texture UV for a source stored rotated by `rotation` clockwise. */
function displayToTexture(nx: number, ny: number, rotation: Rotation): [number, number] {
  switch (rotation) {
    case 90: return [ny, 1 - nx];
    case 180: return [1 - nx, 1 - ny];
    case 270: return [1 - ny, nx];
    default: return [nx, ny];
  }
}

function similarityFn(s: Similarity): WarpFn {
  return (x, y) => [s.a * x - s.b * y + s.tx, s.b * x + s.a * y + s.ty];
}

export class MeshRenderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly posBuffer: WebGLBuffer;
  private readonly uvBuffer: WebGLBuffer;
  private readonly uvIdBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly locs: { pos: number; uv: number; uvId: number; image: WebGLUniformLocation; split: WebGLUniformLocation; width: WebGLUniformLocation };
  private readonly uv = new Float32Array(VERT_COUNT * 2);
  private readonly uvId = new Float32Array(VERT_COUNT * 2);
  private texW = 0;
  private texH = 0;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas;
    const attrs: WebGLContextAttributes = { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false, alpha: false };
    const gl = (canvas.getContext("webgl2", attrs) ?? canvas.getContext("webgl", attrs)) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;

    const vs = this.compile(gl.VERTEX_SHADER, VERT_SHADER);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG_SHADER);
    const prog = gl.createProgram();
    if (!prog) throw new Error("WebGL program allocation failed");
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.detachShader(prog, vs);
    gl.detachShader(prog, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("Mesh shader link failed: " + gl.getProgramInfoLog(prog));
    this.program = prog;
    const uniform = (name: string): WebGLUniformLocation => {
      const loc = gl.getUniformLocation(prog, name);
      if (!loc) throw new Error(`uniform ${name} missing`);
      return loc;
    };
    this.locs = {
      pos: gl.getAttribLocation(prog, "a_pos"),
      uv: gl.getAttribLocation(prog, "a_uv"),
      uvId: gl.getAttribLocation(prog, "a_uvId"),
      image: uniform("u_image"),
      split: uniform("u_split"),
      width: uniform("u_width"),
    };

    const buffer = (): WebGLBuffer => {
      const b = gl.createBuffer();
      if (!b) throw new Error("WebGL buffer allocation failed");
      return b;
    };
    this.posBuffer = buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buildIdentityPositions(), gl.STATIC_DRAW);
    this.uvBuffer = buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.uv, gl.DYNAMIC_DRAW);
    this.uvIdBuffer = buffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvIdBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.uvId, gl.DYNAMIC_DRAW);
    this.indexBuffer = buffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buildIndices(), gl.STATIC_DRAW);

    const tex = gl.createTexture();
    if (!tex) throw new Error("WebGL texture allocation failed");
    this.texture = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) throw new Error("WebGL shader allocation failed");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("Mesh shader compile failed: " + log);
    }
    return sh;
  }

  /** Output size in pixels (display orientation). */
  resize(width: number, height: number): void {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  /**
   * Uploads a frame. `width`/`height` are the texture's own dimensions (coded
   * orientation for a VideoFrame). Returns false when the browser refused
   * the source, so the caller can fall back to a canvas copy.
   */
  upload(source: TexImageSource, width: number, height: number): boolean {
    const gl = this.gl;
    if (width === 0 || height === 0) return false;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.getError(); // clear any stale flag so the check below is ours
    if (width === this.texW && height === this.texH) {
      // Same size as last time: texSubImage2D reuses the GPU storage. If the
      // browser disagrees about the source's size it raises INVALID_VALUE
      // and we fall through to a fresh allocation.
      try {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
        if (gl.getError() === gl.NO_ERROR) return true;
      } catch {
        // fall through
      }
    }
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      this.texW = 0;
      return false;
    }
    if (gl.getError() !== gl.NO_ERROR) {
      this.texW = 0;
      return false;
    }
    this.texW = width;
    this.texH = height;
    return true;
  }

  /** Draws the uploaded frame through the warp into the canvas. */
  render(opts: RenderOptions): void {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const warp: WarpFn | null = opts.warp === null ? null : typeof opts.warp === "function" ? opts.warp : similarityFn(opts.warp);
    let i = 0;
    for (let vy = 0; vy < VERT_H; vy++) {
      for (let vx = 0; vx < VERT_W; vx++) {
        const nx = vx / GRID_W;
        const ny = vy / GRID_H;
        const [ix, iy] = displayToTexture(nx, ny, opts.rotation);
        this.uvId[i] = ix;
        this.uvId[i + 1] = iy;
        if (warp) {
          const [sx, sy] = warp((nx - 0.5) * W, (ny - 0.5) * H);
          const [ux, uy] = displayToTexture(sx / W + 0.5, sy / H + 0.5, opts.rotation);
          this.uv[i] = ux;
          this.uv[i + 1] = uy;
        } else {
          this.uv[i] = ix;
          this.uv[i + 1] = iy;
        }
        i += 2;
      }
    }
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(this.locs.pos);
    gl.vertexAttribPointer(this.locs.pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.uv);
    gl.enableVertexAttribArray(this.locs.uv);
    gl.vertexAttribPointer(this.locs.uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvIdBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.uvId);
    gl.enableVertexAttribArray(this.locs.uvId);
    gl.vertexAttribPointer(this.locs.uvId, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.locs.image, 0);
    gl.uniform1f(this.locs.split, opts.split === null ? -1 : opts.split);
    gl.uniform1f(this.locs.width, W);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, GRID_W * GRID_H * 6, gl.UNSIGNED_SHORT, 0);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.posBuffer);
    gl.deleteBuffer(this.uvBuffer);
    gl.deleteBuffer(this.uvIdBuffer);
    gl.deleteBuffer(this.indexBuffer);
  }
}
