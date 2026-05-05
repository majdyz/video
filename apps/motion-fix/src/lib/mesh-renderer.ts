// WebGL mesh-warp renderer for motion-fix.
//
// Coordinate model:
//   * Vertex POSITIONS are static — each vertex sits at its identity grid
//     spot in NDC. The OUTPUT pixel under each vertex never moves.
//   * Vertex UVs are dynamic — each vertex samples a different point in
//     the source per frame to compensate for camera motion. Identity UV
//     = (vx/GRID_W, vy/GRID_H); the stabiliser shifts this per-vertex
//     to undo the camera's actual motion.
//
// Why this model and not the inverse: putting per-frame motion on the
// VERTEX POSITIONS pushes the mesh geometry off-screen at the edges
// (any displacement carries the corner triangles outside [-1, 1] NDC),
// so the corners get stretched into hideous shapes. Moving UVs leaves
// geometry rock-solid; the source texture is sampled with bilinear
// hardware interpolation between the moved UVs.

export const GRID_W = 16;
export const GRID_H = 9;
export const VERT_W = GRID_W + 1;
export const VERT_H = GRID_H + 1;
export const VERT_COUNT = VERT_W * VERT_H;

const VERT_SHADER = `
attribute vec2 a_pos;   // static NDC position
attribute vec2 a_uv;    // dynamic source UV (0..1)
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SHADER = `
precision highp float;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
  // Sampling outside [0, 1] would wrap or clamp depending on texture
  // wrap mode. We use CLAMP_TO_EDGE so out-of-range UVs read the edge
  // pixel — which becomes visible black bands when stabilisation
  // demands more crop than the user's budget. Better to show the band
  // than to repeat content.
  vec4 c = texture2D(u_image, v_uv);
  gl_FragColor = c;
}
`;

// Identity NDC positions per vertex (row-major, y-outer / x-inner).
// UV (0,0) → NDC (-1, +1); UV (1,1) → NDC (+1, -1) — y-flipped because
// WebGL NDC is +y up while UV is +y down.
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

// Identity UVs (sample directly from each vertex's grid spot in source).
export function buildIdentityUVs(): Float32Array {
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

// Triangle list indices — 2 triangles per cell.
function buildIndices(): Uint16Array {
  const idx = new Uint16Array(GRID_W * GRID_H * 6);
  let i = 0;
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const v00 = cy * VERT_W + cx;
      const v10 = v00 + 1;
      const v01 = v00 + VERT_W;
      const v11 = v01 + 1;
      idx[i++] = v00; idx[i++] = v10; idx[i++] = v11;
      idx[i++] = v00; idx[i++] = v11; idx[i++] = v01;
    }
  }
  return idx;
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

    // Positions: static identity grid.
    this.posBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buildIdentityPositions(), gl.STATIC_DRAW);

    // UVs: identity to start; will be replaced per-frame by setVertexUVs.
    this.uvBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buildIdentityUVs(), gl.DYNAMIC_DRAW);

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

  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  uploadSource(source: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  // Replace per-vertex UVs (length = VERT_COUNT * 2; row-major, y-outer).
  setVertexUVs(uvs: Float32Array) {
    if (uvs.length !== VERT_COUNT * 2) {
      throw new Error(`Expected ${VERT_COUNT * 2} UV floats, got ${uvs.length}`);
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, uvs);
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
