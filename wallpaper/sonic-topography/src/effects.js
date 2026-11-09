// 涟漪 / 流星 / 粒子：槽位数、半径、速度、寿命、随机分布全部对齐原包。
// 注意两个容易看漏的细节：
//   1. 着色器只读取 uRipples[0..9]，但 JS 以 20 槽循环写入——第 11 次触发会覆盖到
//      永远不会被渲染的槽位。这是原实现的行为，照搬，不要"修"。
//   2. 拖尾粒子按 1ms 步进生成（每步 70% 概率），粒子上限 200，所以拖尾长度由
//      池覆盖速度决定。效果更新必须留在 1ms 节拍上，而不是每帧一次。

export const MAX_METEORS = 40;
export const MAX_PARTICLES = 200;
export const RIPPLE_SLOTS = 20;

export class Effects {
	constructor(clock) {
		this.clock = clock;
		this.ripples = new Array(RIPPLE_SLOTS).fill(null).map(() => ({
			posX: 0, posZ: 0, time: 0, strength: 0, isActive: 0, rippleType: 0,
		}));
		this.rippleIndex = 0;

		this.meteors = new Array(MAX_METEORS).fill(null).map(() => ({
			active: false, x: 0, y: -1000, z: 0, speed: 0, strength: 0,
		}));
		this.meteorIndex = 0;
		this.lastMeteorSpawn = -Infinity;

		this.particles = new Array(MAX_PARTICLES).fill(null).map(() => ({
			active: false, x: 0, y: -1000, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, scale: 1,
		}));
		this.particleIndex = 0;

		// 低频涟漪的落点簇：1.5s 内连续触发落在同一簇，避免满屏随机点。
		this.cluster = { x: 0, z: 0, initialized: false, lastTriggerTime: 0, hitsRemaining: 0 };
		this.cache = null; // 由 main 注入 { meteorTrigger, pulseTrigger, state }

		this.lastClickAt = -Infinity;
		this.counters = { ripples: 0, meteors: 0, particles: 0, clicks: 0 };
	}

	spawnRipple(x, z, strength, isMeteor = false) {
		const i = this.rippleIndex;
		this.ripples[i] = {
			posX: x,
			posZ: z,
			time: this.clock.now(),
			strength,
			isActive: 1,
			rippleType: isMeteor ? 1 : 0,
		};
		this.rippleIndex = (i + 1) % RIPPLE_SLOTS;
		this.counters.ripples++;
	}

	spawnMeteor(strength) {
		const t = this.clock.now();
		const cooldown = this.cache ? this.cache.meteorTrigger.cooldown / 60 : 1;
		if (t - this.lastMeteorSpawn < cooldown) return;
		this.lastMeteorSpawn = t;

		const i = this.meteorIndex;
		const m = this.meteors[i];
		const a = Math.random() * Math.PI * 2;
		const r = 10 + Math.random() * 35;
		m.active = true;
		m.x = Math.cos(a) * r;
		m.z = Math.sin(a) * r;
		m.y = 30 + Math.random() * 10;
		m.speed = 1 + Math.random() * 0.5 + strength * 2.5;
		m.strength = strength;
		this.meteorIndex = (i + 1) % MAX_METEORS;
		this.counters.meteors++;
	}

	spawnParticle(x, y, z, strength) {
		const i = this.particleIndex;
		const p = this.particles[i];
		p.active = true;
		p.x = x + (Math.random() - 0.5) * 1.5;
		p.y = y + (Math.random() - 0.5) * 1.5;
		p.z = z + (Math.random() - 0.5) * 1.5;
		p.vx = (Math.random() - 0.5) * 2;
		p.vy = Math.random() * 2 + strength * 10;
		p.vz = (Math.random() - 0.5) * 2;
		p.life = 0;
		p.maxLife = 0.5 + Math.random() * 0.5;
		p.scale = Math.random() * 0.6 + 0.2;
		this.particleIndex = (i + 1) % MAX_PARTICLES;
		this.counters.particles++;
	}

	handleTrigger(strength, type, action) {
		if (action === "Meteor") {
			const intensity = this.cache ? this.cache.state.meteorIntensity : 1;
			this.spawnMeteor(Math.min(strength * 20, 4) * intensity);
			return;
		}
		const now = this.clock.nowMs();
		const c = this.cluster;
		if (!c.initialized || now - c.lastTriggerTime > 1500 || c.hitsRemaining <= 0) {
			c.x = (Math.random() - 0.5) * 50;
			c.z = (Math.random() - 0.5) * 50;
			c.hitsRemaining = 5 + Math.floor(Math.random() * 9);
			c.initialized = true;
		}
		c.hitsRemaining--;
		c.lastTriggerTime = now;

		let x, z;
		if (type === "Kick") {
			x = c.x + (Math.random() - 0.5) * 8;
			z = c.z + (Math.random() - 0.5) * 8;
		} else {
			const a = Math.random() * Math.PI * 2;
			const r = 15 + Math.random() * 45;
			x = Math.cos(a) * r;
			z = Math.sin(a) * r;
		}
		const intensity = this.cache ? this.cache.state.pulseIntensity : 1;
		this.spawnRipple(x, z, Math.min(strength * 40, 8) * intensity);
	}

	clickAt(clientX, clientY, camera, canvasRect, meteorIntensity) {
		const now = this.clock.now();
		if (now - this.lastClickAt < 0.3) return;
		const ndcX = ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
		const ndcY = -(((clientY - canvasRect.top) / canvasRect.height) * 2 - 1);

		// 与 three.Raycaster 等价：从相机穿过像素，与 y=0 平面求交。
		const eye = camera.eye;
		const ax = (camera.angleX * Math.PI) / 180;
		const ay = (camera.angleY * Math.PI) / 180;
		const forward = [-Math.sin(ax) * Math.cos(ay), -Math.sin(ay), -Math.cos(ax) * Math.cos(ay)];
		const right = [Math.cos(ax), 0, -Math.sin(ax)];
		// up = right × forward（右手系；反向会让点击落点镜像到画面另一侧）
		const up = [
			right[1] * forward[2] - right[2] * forward[1],
			right[2] * forward[0] - right[0] * forward[2],
			right[0] * forward[1] - right[1] * forward[0],
		];
		const tan = Math.tan((camera.fov * Math.PI) / 360);
		const aspect = camera.aspect || 1;
		const dir = [
			forward[0] + right[0] * ndcX * tan * aspect + up[0] * ndcY * tan,
			forward[1] + right[1] * ndcX * tan * aspect + up[1] * ndcY * tan,
			forward[2] + right[2] * ndcX * tan * aspect + up[2] * ndcY * tan,
		];
		const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
		dir[0] /= len; dir[1] /= len; dir[2] /= len;
		if (Math.abs(dir[1]) < 1e-5) return;
		const t = -eye[1] / dir[1];
		if (t <= 0) return;
		const x = eye[0] + dir[0] * t;
		const z = eye[2] + dir[2] * t;
		if (!Number.isFinite(x) || !Number.isFinite(z)) return;

		this.lastClickAt = now;
		this.counters.clicks++;
		const i = this.meteorIndex;
		const m = this.meteors[i];
		m.active = true;
		m.x = x;
		m.z = z;
		m.y = 30 + Math.random() * 10;
		m.speed = 1 + Math.random() * 0.5 + 2.5;
		m.strength = 1 * meteorIntensity;
		this.meteorIndex = (i + 1) % MAX_METEORS;
	}

	tick(dt) {
		for (let i = 0; i < MAX_METEORS; i++) {
			const m = this.meteors[i];
			if (!m.active) continue;
			m.y -= m.speed * 60 * dt;
			if (m.y <= 0) {
				m.active = false;
				this.spawnRipple(m.x, m.z, m.strength * 1.5, true);
				for (let k = 0; k < 10; k++) this.spawnParticle(m.x, 0.5, m.z, m.speed * 1.5);
			} else if (Math.random() > 0.3) {
				this.spawnParticle(m.x, m.y, m.z, m.speed * 0.2);
			}
		}

		for (let i = 0; i < MAX_PARTICLES; i++) {
			const p = this.particles[i];
			if (!p.active) continue;
			p.life += dt;
			if (p.life >= p.maxLife) {
				p.active = false;
			} else {
				p.x += p.vx * dt * 10;
				p.y += p.vy * dt * 10;
				p.z += p.vz * dt * 10;
			}
		}
	}

	activeMeteors() {
		let n = 0;
		for (const m of this.meteors) if (m.active) n++;
		return n;
	}

	activeParticles() {
		let n = 0;
		for (const p of this.particles) if (p.active) n++;
		return n;
	}
}
