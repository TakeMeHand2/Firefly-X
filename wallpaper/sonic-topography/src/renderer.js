import { GLProgram, makeBox, perspective, lookAtView, writeTranslation } from "./glutil.js";
import { BASIC_FS, BASIC_VS, TERRAIN_FS, TERRAIN_VS } from "./shaders.js";

const HALF_EXTENT = 84; // 原包 De = 168/2，固定不随网格档变化
const GRID_EXTENT = 168; // 原包 Re = 168
export const MAX_METEORS = 40;
export const MAX_PARTICLES = 200;
export const RIPPLE_SLOTS = 20;

const FOG_NEAR = 30;
const FOG_FAR = 95;

function createInstanced(gl, geom, capacity) {
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	const pos = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, pos);
	gl.bufferData(gl.ARRAY_BUFFER, geom.positions, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	const nor = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, nor);
	gl.bufferData(gl.ARRAY_BUFFER, geom.normals, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(1);
	gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

	const uv = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, uv);
	gl.bufferData(gl.ARRAY_BUFFER, geom.uvs, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(2);
	gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

	const inst = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, inst);
	gl.bufferData(gl.ARRAY_BUFFER, capacity * 16 * 4, gl.DYNAMIC_DRAW);
	for (let i = 0; i < 4; i++) {
		gl.enableVertexAttribArray(3 + i);
		gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, 64, i * 16);
		gl.vertexAttribDivisor(3 + i, 1);
	}

	const idx = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geom.indices, gl.STATIC_DRAW);

	gl.bindVertexArray(null);
	return { vao, inst, count: geom.count, capacity };
}

export class Renderer {
	constructor(canvas) {
		this.canvas = canvas;
		this.gl = canvas.getContext("webgl2", {
			alpha: true,
			antialias: true,
			premultipliedAlpha: true,
			powerPreference: "high-performance",
			preserveDrawingBuffer: false,
		});
		if (!this.gl) throw new Error("WebGL2 不可用");
		const gl = this.gl;

		this.terrain = new GLProgram(gl, TERRAIN_VS, TERRAIN_FS);
		this.basic = new GLProgram(gl, BASIC_VS, BASIC_FS);

		this.view = new Float32Array(16);
		this.proj = new Float32Array(16);
		this.eye = [0, 0, 85];
		this.fov = 45;
		this.near = 0.1;
		this.far = 1000;

		this.grid = 0;
		this.terrainMesh = null;

		this.meteorGeom = makeBox(0.4, 1.2, 0.4);
		this.particleGeom = makeBox(0.8, 0.8, 0.8);
		this.meteorMesh = createInstanced(gl, this.meteorGeom, MAX_METEORS);
		this.particleMesh = createInstanced(gl, this.particleGeom, MAX_PARTICLES);
		this.meteorData = new Float32Array(MAX_METEORS * 16);
		this.particleData = new Float32Array(MAX_PARTICLES * 16);

		// 涟漪字段位置：着色器只读前 10 个槽，10..19 会被编译器裁掉，查不到就跳过。
		this.rippleLocs = [];
		for (let i = 0; i < RIPPLE_SLOTS; i++) {
			const p = `uRipples[${i}]`;
			this.rippleLocs.push({
				pos: this.terrain.loc(`${p}.pos`),
				time: this.terrain.loc(`${p}.time`),
				strength: this.terrain.loc(`${p}.strength`),
				isActive: this.terrain.loc(`${p}.isActive`),
				rippleType: this.terrain.loc(`${p}.rippleType`),
			});
		}

		gl.clearColor(0, 0, 0, 0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);
		gl.frontFace(gl.CCW);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
	}

	setGrid(n) {
		n = Number(n) | 0;
		if (this.grid === n) return;
		const gl = this.gl;
		if (this.terrainMesh) {
			gl.deleteVertexArray(this.terrainMesh.vao);
			gl.deleteBuffer(this.terrainMesh.inst);
		}
		const spacing = GRID_EXTENT / n;
		const size = spacing * 0.857; // 原包 ne = q * 0.857
		const geom = makeBox(size, 1, size);
		this.terrainMesh = createInstanced(gl, geom, n * n);

		const half = (n * spacing) / 2;
		// 一次组装、一次上传：逐实例 bufferSubData 在 640² 档会变成 40 万次调用。
		const buf = new Float32Array(n * n * 16);
		let k = 0;
		for (let x = 0; x < n; x++) {
			for (let z = 0; z < n; z++) {
				writeTranslation(buf, k * 16, x * spacing - half, 0.5, z * spacing - half);
				k++;
			}
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.terrainMesh.inst);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf);
		this.grid = n;
		this.count = n * n;
	}

	resize(cssW, cssH, dpr) {
		const w = Math.max(1, Math.floor(cssW * dpr));
		const h = Math.max(1, Math.floor(cssH * dpr));
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w;
			this.canvas.height = h;
		}
		this.aspect = w / h;
	}

	setCamera(angleX, angleY, dist) {
		const ax = (angleX * Math.PI) / 180;
		const ay = (angleY * Math.PI) / 180;
		const r = dist * Math.cos(ay);
		this.eye = [r * Math.sin(ax), dist * Math.sin(ay), r * Math.cos(ax)];
	}

	updateMatrices() {
		this.view = lookAtView(this.eye, [0, 0, 0], [0, 1, 0]);
		this.proj = perspective(this.fov, this.aspect || 1, this.near, this.far);
	}

	render(frame) {
		if (!this.terrainMesh) return;
		const gl = this.gl;
		const { u, ripples, meteors, particles, fogColor, meteorColor, particleColor } = frame;
		this.updateMatrices();

		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		// ---- 流星（不透明，先画）----
		for (let i = 0; i < MAX_METEORS; i++) {
			const m = meteors[i];
			if (m.active) writeTranslation(this.meteorData, i * 16, m.x, Math.max(0, m.y), m.z, 1.5, 1.5, 1.5);
			else writeTranslation(this.meteorData, i * 16, 0, -1000, 0, 0, 0, 0);
		}
		gl.disable(gl.BLEND);
		gl.depthMask(true);
		this.basic.use();
		this.basic.m4("viewMatrix", this.view);
		this.basic.m4("projectionMatrix", this.proj);
		this.basic.v3("uColor", meteorColor);
		this.basic.f("uOpacity", 1);
		this.basic.v3("uFogColor", fogColor);
		this.basic.f("uFogNear", FOG_NEAR);
		this.basic.f("uFogFar", FOG_FAR);
		gl.bindVertexArray(this.meteorMesh.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.meteorMesh.inst);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.meteorData);
		gl.drawElementsInstanced(gl.TRIANGLES, this.meteorMesh.count, gl.UNSIGNED_SHORT, 0, MAX_METEORS);

		// ---- 地形（透明 + 写深度，与 three 的 transparent/depthWrite 同构）----
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask(true);

		this.terrain.use();
		this.terrain.m4("viewMatrix", this.view);
		this.terrain.m4("projectionMatrix", this.proj);

		this.terrain.f("uTime", u.uTime);
		this.terrain.f("uIdleWave", u.uIdleWave);
		this.terrain.f("uCentralIntensity", u.uCentralIntensity);
		this.terrain.f("uRingIntensity", u.uRingIntensity);
		this.terrain.f("uFlowIntensity", u.uFlowIntensity);
		this.terrain.f("uRiverIntensity", u.uRiverIntensity);
		this.terrain.f("uSpikeIntensity", u.uSpikeIntensity);
		this.terrain.f("uResponseRange", u.uResponseRange);
		this.terrain.f("uHalfExtent", HALF_EXTENT);

		this.terrain.f("uSubBass", u.uSubBass);
		this.terrain.f("uBass", u.uBass);
		this.terrain.f("uLowMid", u.uLowMid);
		this.terrain.f("uMid", u.uMid);
		this.terrain.f("uHighMid", u.uHighMid);

		this.terrain.f("uSmoothness", u.uSmoothness);
		this.terrain.f("uDensity", u.uDensity);
		this.terrain.f("uEnergy", u.uEnergy);

		this.terrain.f("uPresence", u.uPresence);
		this.terrain.f("uBrilliance", u.uBrilliance);
		this.terrain.f("uAir", u.uAir);
		this.terrain.f("uWarmth", u.uWarmth);
		this.terrain.f("uBrightness", u.uBrightness);
		this.terrain.f("uSharpness", u.uSharpness);

		this.terrain.v3("uBaseColor1", u.uBaseColor1);
		this.terrain.v3("uBaseColor2", u.uBaseColor2);
		this.terrain.v3("uCoolCore", u.uCoolCore);
		this.terrain.v3("uCoolEdge", u.uCoolEdge);
		this.terrain.v3("uWarmCore", u.uWarmCore);
		this.terrain.v3("uWarmEdge", u.uWarmEdge);
		this.terrain.v3("uRippleColor", u.uRippleColor);
		this.terrain.v3("uPeakColor", u.uPeakColor);
		this.terrain.f("uGlowIntensity", u.uGlowIntensity);
		this.terrain.f("uPeakEnabled", u.uPeakEnabled);
		this.terrain.f("uPeakIntensity", u.uPeakIntensity);
		this.terrain.f("uLightMode", u.uLightMode);

		for (let i = 0; i < RIPPLE_SLOTS; i++) {
			const l = this.rippleLocs[i];
			const r = ripples[i];
			if (!l.isActive) continue;
			gl.uniform2f(l.pos, r.posX, r.posZ);
			gl.uniform1f(l.time, r.time);
			gl.uniform1f(l.strength, r.strength);
			gl.uniform1f(l.isActive, r.isActive);
			gl.uniform1f(l.rippleType, r.rippleType);
		}

		gl.bindVertexArray(this.terrainMesh.vao);
		gl.drawElementsInstanced(gl.TRIANGLES, this.terrainMesh.count, gl.UNSIGNED_SHORT, 0, this.count);

		// ---- 粒子（透明，后画）----
		for (let i = 0; i < MAX_PARTICLES; i++) {
			const p = particles[i];
			if (!p.active) writeTranslation(this.particleData, i * 16, 0, -1000, 0, 0, 0, 0);
			else {
				const s = p.scale * (1 - p.life / p.maxLife);
				writeTranslation(this.particleData, i * 16, p.x, p.y, p.z, s, s, s);
			}
		}
		this.basic.use();
		this.basic.m4("viewMatrix", this.view);
		this.basic.m4("projectionMatrix", this.proj);
		this.basic.v3("uColor", particleColor);
		this.basic.f("uOpacity", 0.6);
		this.basic.v3("uFogColor", fogColor);
		this.basic.f("uFogNear", FOG_NEAR);
		this.basic.f("uFogFar", FOG_FAR);
		gl.bindVertexArray(this.particleMesh.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.particleMesh.inst);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particleData);
		gl.drawElementsInstanced(gl.TRIANGLES, this.particleMesh.count, gl.UNSIGNED_SHORT, 0, MAX_PARTICLES);

		gl.bindVertexArray(null);
	}
}
