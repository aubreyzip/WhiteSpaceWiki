"use client";

import { useEffect, useRef } from "react";

/**
 * Web port of the mod's main-menu background (backgrounds/monochrome.lua).
 *
 * The mod reuses Balatro's built-in `splash` shader with
 * colour_1 = G.C.WHITE, colour_2 = G.C.BLACK (#374244), vort_speed = 0.4,
 * mid_flash = 0 and vort_offset = 0. This is a WebGL re-implementation of that
 * swirling smoke, including the game's chunky pixel look (screen diagonal / 700).
 */

const PIXEL_SIZE_FAC = 700;
// Balatro's splash intro ramps up over ~15s; start past it so the swirl is already settled.
const TIME_OFFSET = 20;
const FRAME_INTERVAL = 1000 / 30; // the motion is slow, 30fps is plenty

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_time;
uniform float u_vort_speed;
uniform vec2 u_screen;   // logical screen size in CSS px
uniform vec2 u_cells;    // canvas size in cells
uniform float u_pixel;   // size of one cell in CSS px

const vec4 COLOUR_1 = vec4(1.0);                                   // G.C.WHITE
const vec4 COLOUR_2 = vec4(55.0 / 255.0, 66.0 / 255.0, 68.0 / 255.0, 1.0); // G.C.BLACK
const vec3 MID = 0.6 * vec3(79.0 / 255.0, 99.0 / 255.0, 103.0 / 255.0);

void main() {
  // Top-left origin, snapped to the pixel grid like the original.
  vec2 cell = vec2(floor(gl_FragCoord.x), u_cells.y - 1.0 - floor(gl_FragCoord.y));
  float diag = length(u_screen);
  vec2 uv = (cell * u_pixel - 0.5 * u_screen) / diag;
  float uv_len = length(uv);

  // Centre swirl
  float speed = u_time * u_vort_speed;
  float angle = atan(uv.y, uv.x) + (2.2 + 0.4 * min(6.0, speed)) * uv_len - 1.0
    - speed * 0.05 - min(6.0, speed) * speed * 0.02;
  vec2 sv = vec2(uv_len * cos(angle), uv_len * sin(angle));

  // Smoke
  sv *= 30.0;
  speed = u_time * 6.0 * u_vort_speed + 1033.0;
  vec2 uv2 = vec2(sv.x + sv.y);
  for (int i = 0; i < 5; i++) {
    uv2 += sin(max(sv.x, sv.y)) + sv;
    sv += 0.5 * vec2(cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121), sin(uv2.x - 0.113 * speed));
    sv -= 1.0 * cos(sv.x + sv.y) - 1.0 * sin(sv.x * 0.711 - sv.y);
  }

  float smoke = min(2.0, max(-2.0, 1.5 + length(sv) * 0.12 - 0.17 * min(10.0, u_time * 1.2 - 4.0)));
  if (smoke < 0.2) smoke = (smoke - 0.2) * 0.6 + 0.2;

  float c1p = max(0.0, 1.0 - 2.0 * abs(1.0 - smoke));
  float c2p = max(0.0, 1.0 - 2.0 * smoke);
  float cb = 1.0 - min(1.0, c1p + c2p);

  vec4 col = COLOUR_1 * c1p + COLOUR_2 * c2p + vec4(cb * MID, cb);
  float flash = max(0.0, max(c1p, c2p) * 5.0 - 4.4);
  gl_FragColor = vec4(mix(col.rgb, vec3(1.0), flash), 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
  }
  return shader;
}

export function MonochromeBackground({ speed = 0.4 }: { speed?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!canvas || !gl) return; // no WebGL: the page background shows through

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "");
    } catch (error) {
      console.warn("MonochromeBackground disabled:", error);
      return;
    }
    gl.useProgram(program);

    // One triangle covering the whole viewport.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uTime = u("u_time");
    gl.uniform1f(u("u_vort_speed"), speed);

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = performance.now();
    let frame = 0;
    let last = 0;

    const draw = (now: number) => {
      gl.uniform1f(uTime, TIME_OFFSET + (motion.matches ? 0 : (now - start) / 1000));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const pixel = Math.hypot(width, height) / PIXEL_SIZE_FAC;
      canvas.width = Math.ceil(width / pixel);
      canvas.height = Math.ceil(height / pixel);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u("u_screen"), width, height);
      gl.uniform2f(u("u_cells"), canvas.width, canvas.height);
      gl.uniform1f(u("u_pixel"), pixel);
      draw(performance.now());
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < FRAME_INTERVAL) return;
      last = now;
      draw(now);
    };

    const syncMotion = () => {
      cancelAnimationFrame(frame);
      if (motion.matches) draw(performance.now()); // static frame
      else frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    syncMotion();
    motion.addEventListener("change", syncMotion);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener("change", syncMotion);
      // Don't lose the context here: the canvas keeps it, and React may re-run this effect
      // (Strict Mode, Fast Refresh) on the same canvas.
      gl.deleteProgram(program);
    };
  }, [speed]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh">
      <canvas ref={canvasRef} className="pixelated size-full" />
      {/* Veil in the page colour keeps text readable and the swirl subtle in both themes. */}
      <div className="absolute inset-0 bg-background/80" />
    </div>
  );
}
