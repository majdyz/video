export const WARP_WGSL = /* wgsl */ `
struct Params {
  srcSize: vec2<f32>,
  fFish: f32,
  fOut: f32,
  k1: f32,
  strength: f32,
  zoom: f32,
  projection: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var src: texture_external;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  // One triangle covering the clip space, uv in [0,1] with y down like the picture.
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4(p[i], 0.0, 1.0);
  o.uv = vec2(p[i].x * 0.5 + 0.5, 1.0 - (p[i].y * 0.5 + 0.5));
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let c = params.srcSize * 0.5;
  let p = (in.uv * params.srcSize - c) / params.zoom;
  let r = length(p);
  if (r < 0.5) {
    return textureSampleBaseClampToEdge(src, samp, c / params.srcSize);
  }
  let theta = select(atan(r / params.fOut), 2.0 * atan(r / (2.0 * params.fOut)), params.projection > 0.5);
  let thetaD = theta * (1.0 + params.k1 * theta * theta);
  let rFish = params.fFish * thetaD;
  let rs = r + (rFish - r) * params.strength;
  let s = c + p / r * rs;
  let suv = s / params.srcSize;
  if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) {
    return vec4(0.0, 0.0, 0.0, 1.0);
  }
  return textureSampleBaseClampToEdge(src, samp, suv);
}
`;
