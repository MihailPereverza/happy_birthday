/** A radial bulge (strength > 0 magnifies, < 0 pinches) in frame pixels. */
export interface Bulge {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

export const MAX_BULGES = 16;

const VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_px;
uniform vec2 u_size;
void main() {
  v_px = (a_pos * 0.5 + 0.5) * u_size;
  v_px.y = u_size.y - v_px.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Each bulge pulls sampling towards its centre: sample = c + d * (1 - s * (1 - |d|/r)^2), smooth at the rim.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_px;
out vec4 outColor;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform bool u_mirror;
uniform int u_count;
uniform vec4 u_bulges[${MAX_BULGES}];
void main() {
  vec2 p = v_px;
  for (int i = 0; i < ${MAX_BULGES}; i++) {
    if (i >= u_count) break;
    vec4 b = u_bulges[i];
    vec2 d = p - b.xy;
    float t = length(d) / b.z;
    if (t < 1.0) {
      float k = 1.0 - t;
      p = b.xy + d * (1.0 - b.w * k * k);
    }
  }
  vec2 uv = p / u_size;
  if (u_mirror) uv.x = 1.0 - uv.x;
  outColor = texture(u_tex, clamp(uv, 0.0, 1.0));
}`;

/** Re-renders the camera frame through a bulge shader on its own WebGL2 canvas. */
export class Warper {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null>;

  private constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = gl;
    this.program = link(gl);
    gl.useProgram(this.program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.loc = Object.fromEntries(
      ['u_size', 'u_mirror', 'u_count', 'u_bulges'].map((n) => [n, gl.getUniformLocation(this.program, n)]),
    );
  }

  static create(): Warper | null {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return null;
    try {
      return new Warper(gl, canvas);
    } catch {
      return null;
    }
  }

  render(source: TexImageSource, width: number, height: number, mirrored: boolean, bulges: Bulge[]): HTMLCanvasElement {
    const { gl } = this;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const used = bulges.slice(0, MAX_BULGES);
    const data = new Float32Array(MAX_BULGES * 4);
    used.forEach((b, i) => data.set([b.x, b.y, Math.max(1, b.radius), b.strength], i * 4));
    gl.uniform2f(this.loc.u_size, width, height);
    gl.uniform1i(this.loc.u_mirror, mirrored ? 1 : 0);
    gl.uniform1i(this.loc.u_count, used.length);
    gl.uniform4fv(this.loc.u_bulges, data);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
  return shader;
}

function link(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
  return program;
}
