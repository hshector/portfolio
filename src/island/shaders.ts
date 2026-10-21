// Shader pieces shared by the island's materials.

import * as THREE from 'three';

export const FOG_PARS = 'uniform vec3 uFogColor; uniform float uFogDensity; varying float vFogDepth;';
export const FOG_APPLY = 'float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth); gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, fogF);';
/** Tone mapping and colour space, like three's built-in materials (each include on its own line). */
export const OUT = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

/** Uniforms every island material can read; updated once per frame. */
export interface Shared {
  time: { value: number };
  /** The bull's feet (ground point under its body). */
  bull: { value: THREE.Vector3 };
  /** CSS-pixel scale for point sprites: canvas height / 700 × device pixel ratio. */
  pixelScale: { value: number };
  /** For the see-through trees: camera position, the point it must keep in sight, and an on/off switch. */
  cam: { value: THREE.Vector3 };
  focus: { value: THREE.Vector3 };
  occlusion: { value: number };
  wind: { value: number };
}

export function createShared(): Shared {
  return {
    time: { value: 0 }, bull: { value: new THREE.Vector3() }, pixelScale: { value: 1 },
    cam: { value: new THREE.Vector3() }, focus: { value: new THREE.Vector3() }, occlusion: { value: 1 },
    wind: { value: 0.55 },
  };
}

// Anything standing between the camera and the bull turns see-through, so the camera never loses it.
// Each object (each tree, rock or building) fades as a whole: the vertex shader measures how close its
// bounding sphere comes to the sight line, and the fragment shader drops pixels in an ordered-dither
// pattern. Shadows still use the solid depth material, so faded trees keep their shadow.
// Measured (21 Oct 2026, 80 random spots in the dehesa): the bull was more than half hidden in 19 of
// 80 views before, 0 of 80 after.
const SEE_VERT = /* glsl */ `
vec4 occC = vec4(uOccCenter, 1.0);
float occR = uOccRadius;
#ifdef USE_INSTANCING
occC = instanceMatrix * occC;
occR *= max(length(instanceMatrix[0].xyz), max(length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)));
#endif
occC = modelMatrix * occC;
occR *= max(length(modelMatrix[0].xyz), max(length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)));
vec3 occAB = uOccFocus - uOccCam;
float occLen = length(occAB);
float occAlong = dot(occC.xyz - uOccCam, occAB) / occLen;
float occGap = distance(uOccCam + occAB * clamp(occAlong / occLen, 0.0, 1.0), occC.xyz) - occR;
// close to the sight line, and its near side is in front of the bull
vOcc = uOccOn * smoothstep(1.2, 0.2, occGap) * (1.0 - smoothstep(occLen - 0.4, occLen + 0.4, occAlong - occR * 0.7));
`;
const SEE_FRAG = /* glsl */ `
const float OCC_BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
ivec2 occPx = ivec2(mod(gl_FragCoord.xy, 4.0));
if (vOcc * 0.8 > (OCC_BAYER[occPx.x + occPx.y * 4] + 0.5) / 16.0) discard;
`;

// Tree crowns sway in the wind: the top of each crown moves more than its base.
const SWAY_VERT = /* glsl */ `
{
  vec4 swC = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float swPh = swC.x * 0.13 + swC.z * 0.11;
  float swH = max(0.0, position.y + 0.6);
  vec3 sw = vec3(sin(uTime * 1.3 + swPh), 0.0, cos(uTime * 1.05 + swPh * 1.3)) * 0.06 * swH * uWind;
  transformed += (inverse(mat3(instanceMatrix)) * sw);
}
`;

export interface PatchOptions {
  seeThrough?: boolean;
  sway?: boolean;
}

/** Adds see-through and/or wind sway to a standard material used by one mesh. */
export function patchMaterial(mesh: THREE.Mesh, shared: Shared, opts: PatchOptions) {
  const base = mesh.material as THREE.MeshStandardMaterial;
  mesh.geometry.computeBoundingSphere();
  const bs = mesh.geometry.boundingSphere!;
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    let vert = sh.vertexShader, frag = sh.fragmentShader;
    if (opts.sway) {
      Object.assign(sh.uniforms, { uTime: shared.time, uWind: shared.wind });
      vert = 'uniform float uTime; uniform float uWind;\n' + vert.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY_VERT);
    }
    if (opts.seeThrough) {
      Object.assign(sh.uniforms, { uOccCam: shared.cam, uOccFocus: shared.focus, uOccOn: shared.occlusion, uOccCenter: { value: bs.center }, uOccRadius: { value: bs.radius } });
      vert = 'uniform vec3 uOccCam; uniform vec3 uOccFocus; uniform float uOccOn; uniform vec3 uOccCenter; uniform float uOccRadius; varying float vOcc;\n' +
        vert.replace('#include <project_vertex>', '#include <project_vertex>\n' + SEE_VERT);
      frag = 'varying float vOcc;\n' + frag.replace('void main() {', 'void main() {\n' + SEE_FRAG);
    }
    sh.vertexShader = vert; sh.fragmentShader = frag;
  };
  m.customProgramCacheKey = () => `island:${opts.seeThrough ? 's' : ''}${opts.sway ? 'w' : ''}`;
  mesh.material = m;
}
