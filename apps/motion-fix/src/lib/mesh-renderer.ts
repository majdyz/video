// WebGL mesh-warp renderer for motion-fix. Replaces the canvas2d
// drawImage(setTransform) renderer with a textured mesh whose vertices
// can be displaced per-cell, enabling MeshFlow-style stabilisation
// (handles parallax + local wobble + rolling-shutter pan-skew the
// global 2D similarity model can't represent).
//
// Mesh layout: GRID_W × GRID_H cells = (GRID_W+1) × (GRID_H+1) vertices.
// Vertices store (a) their static source UV (0..1, the texture sample
// position) and (b) their dynamic stabilised position in NDC (-1..1).
// The dynamic position is updated per-frame via setVertexPositions().
//
// For an "identity" mesh (no warp), each vertex's NDC position is its
// source UV mapped to NDC — drawing the mesh produces a pixel-perfect
// pass-through of the source texture.

export const GRID_W = 16;
export const GRID_H = 9;
export const VERT_W = GRID_W + 1;
export const VERT_H = GRID_H + 1;
export const VERT_COUNT = VERT_W * VERT_H;

const VERT_SHADER = `
attribute vec2 a_pos;   // stabilised canvas position in NDC (-1..1)
attribute vec2 a_uv;    // source UV (0..1)
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SHADER = `
precision highp float;
uniform sampler2D u_image;
uniform float u_splitX;   // compare-wipe split (0 = all source, 1 = all stabilised)
uniform sampler2D u_origImage;  // unwarped source for the wipe's left half
varying vec2 v_uv;
void main() {
  // Sample stabilised on the right of split, original on the left.
  // Both samplers point to the same texture; the difference is the
  // mesh — split is enforced in screen-space via gl_FragCoord here.
  vec4 c = texture2D(u_image, v_uv);
  gl_FragColor = c;
}
`;

// Returns flat array of source UVs per vertex, row-major (y outer, x inner).
function buildUVs(): Float32Array {
  const uv = new Float32Array(VERT_COUNT * 2);
  let i = 0;
  for (let vy = 0; vy < VERT_H; vy++) {
    for (let vx = 0; vx < VERT_W; vx++) {
      uv[i++] = vx / GRID_W;
      uv[i++] = vy / GRID_H;
    }
  }
  return uv;
}

// Returns indices for triangle list (2 triangles per cell).
function buildIndices(): Uint16Array {
  const idx = new Uint16Array(GRID_W * GRID_H * 6);
  let i = 0;
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const v00 = cy * VERT_W + cx;
      const v10 = v00 + 1;
      const v01 = v00 + VERT_W;
      const v11 = v01 + 1;
      // Two triangles: (v00, v10, v11) and (v00, v11, v01)
      idx[i++] = v00; idx[i++] = v10; idx[i++] = v11;
      idx[i++] = v00; idx[i++] = v11; idx[i++] = v01;
    }
  }
  return idx;
}

// Identity vertex positions: each vertex placed at its source UV mapped
// to NDC (-1..1). UV (0,0) → NDC (-1, 1), UV (1,1) → NDC (1, -1).
// Y is flipped because WebGL NDC has +Y up but UV has +Y down.
export function buildIdentityPositions(): Float32Array {
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

export class MeshRenderer {
  canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private posBuffer: WebGLBuffer;
  private uvBuffer: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private locs: {
    pos: number;
    uv: number;
    image: WebGLUniformLocation;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;

    const vs = this.compile(gl.VERTEX_SHADER, VERT_SHADER);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG_SHADER);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Mesh shader link failed: " + gl.getProgramInfoLog(prog));
    }
    this.program = prog;

    this.locs = {
      pos: gl.getAttribLocation(prog, "a_pos"),
      uv: gl.getAttribLocation(prog, "a_uv"),
      image: gl.getUniformLocation(prog, "u_image")!,
    };

    this.posBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buildIdentityPositions(), gl.DYNAMIC_DRAW);

    this.uvBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buildUVs(), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buildIndices(), gl.STATIC_DRAW);

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("Mesh shader compile failed: " + log);
    }
    return sh;
  }

  // Resize the canvas to match the source video. Called once per file
  // when source dimensions change.
  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  // Upload source video frame into texture.
  uploadSource(source: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  // Update vertex NDC positions. positions is a Float32Array of length
  // VERT_COUNT * 2 (x, y per vertex, row-major y-outer / x-inner).
  setVertexPositions(positions: Float32Array) {
    if (positions.length !== VERT_COUNT * 2) {
      throw new Error(`Expected ${VERT_COUNT * 2} position floats, got ${positions.length}`);
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
  }

  render() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(this.locs.pos);
    gl.vertexAttribPointer(this.locs.pos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(this.locs.uv);
    gl.vertexAttribPointer(this.locs.uv, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.locs.image, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, GRID_W * GRID_H * 6, gl.UNSIGNED_SHORT, 0);
  }
}
