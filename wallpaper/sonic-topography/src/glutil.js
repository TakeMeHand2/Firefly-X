// 最小 WebGL2 工具层：程序编译、uniform 缓存、mat4、盒体几何。
// 不引第三方库是刻意的：原壁纸唯一的重依赖是 three，而本项目只用到
// 「实例化 + 自定义着色器 + 两个 basic 材质」，用原生 GL 能把依赖面收敛到 0。

function compile(gl, type, src) {
	const sh = gl.createShader(type);
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(sh);
		const numbered = src.split("\n").map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join("\n");
		throw new Error(`着色器编译失败: ${log}\n${numbered}`);
	}
	return sh;
}

export class GLProgram {
	constructor(gl, vsSrc, fsSrc) {
		this.gl = gl;
		const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
		const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
		const p = gl.createProgram();
		gl.attachShader(p, vs);
		gl.attachShader(p, fs);
		// 显式固定属性槽：链接器默认分配不保证顺序，而 VAO 布局是按槽位写死的。
		// 不固定会出现「位置属性读到实例矩阵」→ 单实例被拉伸成贯穿全屏的巨大三角形。
		gl.bindAttribLocation(p, 0, "position");
		gl.bindAttribLocation(p, 1, "normal");
		gl.bindAttribLocation(p, 2, "uv");
		gl.bindAttribLocation(p, 3, "instanceMatrix");
		gl.linkProgram(p);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
			throw new Error(`程序链接失败: ${gl.getProgramInfoLog(p)}`);
		}
		this.program = p;
		this.uniforms = new Map();
		const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
		for (let i = 0; i < n; i++) {
			const info = gl.getActiveUniform(p, i);
			const name = info.name.replace(/\[0\]$/, "");
			this.uniforms.set(name, gl.getUniformLocation(p, info.name));
		}
	}

	use() {
		this.gl.useProgram(this.program);
	}

	loc(name) {
		return this.uniforms.get(name) ?? null;
	}

	f(name, v) {
		const l = this.uniforms.get(name);
		if (l) this.gl.uniform1f(l, v);
	}

	v3(name, c) {
		const l = this.uniforms.get(name);
		if (l) this.gl.uniform3f(l, c[0], c[1], c[2]);
	}

	m4(name, m) {
		const l = this.uniforms.get(name);
		if (l) this.gl.uniformMatrix4fv(l, false, m);
	}
}

// ---- mat4（列主序，与 three / WebGL 一致）----
export function perspective(fovDeg, aspect, near, far) {
	const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
	const nf = 1 / (near - far);
	return new Float32Array([
		f / aspect, 0, 0, 0,
		0, f, 0, 0,
		0, 0, (far + near) * nf, -1,
		0, 0, 2 * far * near * nf, 0,
	]);
}

export function lookAtView(eye, target, up = [0, 1, 0]) {
	let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
	let zl = Math.hypot(zx, zy, zz) || 1;
	zx /= zl; zy /= zl; zz /= zl;

	let xx = up[1] * zz - up[2] * zy;
	let xy = up[2] * zx - up[0] * zz;
	let xz = up[0] * zy - up[1] * zx;
	let xl = Math.hypot(xx, xy, xz) || 1;
	xx /= xl; xy /= xl; xz /= xl;

	const yx = zy * xz - zz * xy;
	const yy = zz * xx - zx * xz;
	const yz = zx * xy - zy * xx;

	// 列主序：第 r 行第 c 列位于 m[c*4+r]。
	// 行空间为 [x; y; z]，平移在第四列，故前三列写成 (xx,yx,zx) / (xy,yy,zy) / (xz,yz,zz)。
	return new Float32Array([
		xx, yx, zx, 0,
		xy, yy, zy, 0,
		xz, yz, zz, 0,
		-(xx * eye[0] + xy * eye[1] + xz * eye[2]),
		-(yx * eye[0] + yy * eye[1] + yz * eye[2]),
		-(zx * eye[0] + zy * eye[1] + zz * eye[2]),
		1,
	]);
}

// 对应 three 的实例矩阵：只有平移（x, 0.5, z）。
export function writeTranslation(out, offset, x, y, z, sx = 1, sy = 1, sz = 1) {
	out[offset] = sx; out[offset + 1] = 0; out[offset + 2] = 0; out[offset + 3] = 0;
	out[offset + 4] = 0; out[offset + 5] = sy; out[offset + 6] = 0; out[offset + 7] = 0;
	out[offset + 8] = 0; out[offset + 9] = 0; out[offset + 10] = sz; out[offset + 11] = 0;
	out[offset + 12] = x; out[offset + 13] = y; out[offset + 14] = z; out[offset + 15] = 1;
}

// three.BoxGeometry 的等价实现：每面 4 顶点 / 6 索引，UV 每面 0..1，外向 CCW。
export function makeBox(sx, sy, sz) {
	const hx = sx / 2, hy = sy / 2, hz = sz / 2;
	// su/sv 是该面在 u/v 方向上的半长，必须按面取对应轴，不能统一用 hx/hy。
	const faces = [
		{ n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], su: hz, sv: hy },
		{ n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], su: hz, sv: hy },
		{ n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], su: hx, sv: hz },
		{ n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], su: hx, sv: hz },
		{ n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], su: hx, sv: hy },
		{ n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], su: hx, sv: hy },
	];
	const positions = [], normals = [], uvs = [], indices = [];
	for (let f = 0; f < faces.length; f++) {
		const { n, u, v, su, sv } = faces[f];
		const base = f * 4;
		for (let i = 0; i < 4; i++) {
			const cu = (i === 1 || i === 2) ? 1 : -1;
			const cv = (i === 2 || i === 3) ? 1 : -1;
			positions.push(
				n[0] * hx + u[0] * su * cu + v[0] * sv * cv,
				n[1] * hy + u[1] * su * cu + v[1] * sv * cv,
				n[2] * hz + u[2] * su * cu + v[2] * sv * cv,
			);
			normals.push(n[0], n[1], n[2]);
			uvs.push((cu + 1) / 2, (cv + 1) / 2);
		}
		indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
	}
	return {
		positions: new Float32Array(positions),
		normals: new Float32Array(normals),
		uvs: new Float32Array(uvs),
		indices: new Uint16Array(indices),
		count: indices.length,
	};
}
