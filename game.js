"use strict";

// 숫자를 바꾸면 난이도와 점수가 바로 달라집니다.
const CONFIG = {
  maxLives: 5,
  scorePerSecond: 10,
  dataScore: 50,
  vaccineScore: 100,
  jumpDuration: 0.52,
  laneLerp: 14,
  baseApproach: 0.38,
  metersPerSecond: 8,
  hitDepth: 0.9,
  invulnTime: 1.15,
  recoverDuration: 0.85,
  runFps: 9,
  runJumpFps: 12,
  hurtFps: 11,
};

const LEVELS = [
  { until: 30, name: "쉬움", speed: 1, spawn: 1.15 },
  { until: 60, name: "보통", speed: 1.25, spawn: 0.9 },
  { until: 90, name: "어려움", speed: 1.5, spawn: 0.72 },
  { until: Infinity, name: "매우 어려움", speed: 1.78, spawn: 0.56 },
];

const ZONES = [
  { at: 0, name: "CODE" },
  { at: 180, name: "DATA" },
  { at: 400, name: "SERVER" },
  { at: 680, name: "FIREWALL" },
  { at: 1000, name: "CLOUD" },
  { at: 1400, name: "AI CORE" },
];

const BEST_KEY = "ai-run-best-score";
const NAMES = { white: "화이트 AI", yellow: "옐로 AI" };

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const CHAR_IDS = ["white", "yellow"];
const animSets = {
  white: { front: null, run: [], recover: [], hurt: [], ready: false },
  yellow: { front: null, run: [], recover: [], hurt: [], ready: false },
};

const state = {
  phase: "title",
  character: null,
  lane: 1,
  lanePos: 1,
  jumpT: -1,
  lives: CONFIG.maxLives,
  score: 0,
  scoreAcc: 0,
  distance: 0,
  time: 0,
  dodged: 0,
  invuln: 0,
  recoverLeft: 0,
  entities: [],
  spawnTimer: 1.2,
  shake: 0,
  flash: 0,
  banner: 0,
  zone: "CODE",
  popups: [],
  dying: 0,
  isNewBest: false,
};

const bits = Array.from({ length: 26 }, () => ({
  x: Math.random(),
  y: Math.random(),
  v: 0.03 + Math.random() * 0.1,
  s: Math.random() < 0.5 ? "0" : "1",
  a: 0.18 + Math.random() * 0.4,
}));

let viewW = 480;
let viewH = 800;
let clock = 0;
let lastTs = 0;
const AUDIO = {
  unlocked: false,
  bgmMode: null,
  tracks: {},
};

function loadAudioAsset(name, file, options) {
  const opts = options || {};
  const audio = new Audio("audio/" + file);
  audio.preload = "auto";
  audio.loop = Boolean(opts.loop);
  audio.volume = typeof opts.volume === "number" ? opts.volume : 1;
  AUDIO.tracks[name] = audio;
  return audio;
}

function initAudio() {
  loadAudioAsset("bgmLobby", "bgm-lobby.mp3", { loop: true, volume: 0.42 });
  loadAudioAsset("bgmGame", "bgm-game.mp3", { loop: true, volume: 0.36 });
  loadAudioAsset("heal", "sfx-heal.wav", { volume: 0.55 });
  loadAudioAsset("hit", "sfx-hit.mp3", { volume: 0.68 });
  loadAudioAsset("data", "sfx-data.mp3", { volume: 0.52 });
}

function unlockAudio() {
  if (AUDIO.unlocked) return;
  AUDIO.unlocked = true;
  syncBgm();
}

function bindAudioUnlock() {
  const unlock = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function setBgm(mode) {
  if (!AUDIO.unlocked) return;
  if (AUDIO.bgmMode === mode) return;
  const lobby = AUDIO.tracks.bgmLobby;
  const game = AUDIO.tracks.bgmGame;
  if (AUDIO.bgmMode === "lobby" && lobby) {
    lobby.pause();
    lobby.currentTime = 0;
  }
  if (AUDIO.bgmMode === "game" && game) {
    game.pause();
    game.currentTime = 0;
  }
  AUDIO.bgmMode = mode;
  const next = mode === "game" ? game : lobby;
  if (next) next.play().catch(() => {});
}

function syncBgm() {
  const lobby =
    state.phase === "title" ||
    state.phase === "help" ||
    state.phase === "select" ||
    state.phase === "over";
  setBgm(lobby ? "lobby" : "game");
}

function playSfx(name) {
  if (!AUDIO.unlocked) return;
  const src = AUDIO.tracks[name];
  if (!src) return;
  const sfx = src.cloneNode();
  sfx.loop = false;
  sfx.volume = src.volume;
  sfx.play().catch(() => {});
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function padFrame(n) {
  return String(n).padStart(2, "0");
}

async function loadCharacterSprites(charId) {
  const base = "images/sprites/" + charId;
  const set = { front: null, run: [], recover: [], hurt: [], ready: false };
  set.front = await loadImage(base + "/front.png");
  for (let i = 0; i < 5; i++) set.run.push(await loadImage(base + "/run-" + padFrame(i) + ".png"));
  for (let i = 0; i < 4; i++) set.recover.push(await loadImage(base + "/recover-" + padFrame(i) + ".png"));
  for (let i = 0; i < 4; i++) set.hurt.push(await loadImage(base + "/hurt-" + padFrame(i) + ".png"));
  set.run = set.run.filter(Boolean);
  set.recover = set.recover.filter(Boolean);
  set.hurt = set.hurt.filter(Boolean);
  set.ready = set.run.length > 0;
  animSets[charId] = set;
  const pick = document.querySelector('.char[data-id="' + charId + '"] img');
  if (pick && set.front) pick.src = base + "/front.png";
}

function loadAllSprites() {
  return Promise.all(CHAR_IDS.map(loadCharacterSprites));
}

function playerSprite() {
  const set = animSets[state.character];
  if (!set || !set.ready) return null;
  if (state.recoverLeft > 0 && set.recover.length) {
    const t = 1 - state.recoverLeft / CONFIG.recoverDuration;
    const idx = Math.min(set.recover.length - 1, Math.floor(t * set.recover.length));
    return set.recover[idx];
  }
  if (state.invuln > 0 && set.hurt.length) {
    return set.hurt[Math.floor(clock * CONFIG.hurtFps) % set.hurt.length];
  }
  const fps = state.jumpT >= 0 ? CONFIG.runJumpFps : CONFIG.runFps;
  return set.run[Math.floor(clock * fps) % set.run.length];
}

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  viewW = rect.width;
  viewH = rect.height;
}

function loadBest() {
  const value = Number(localStorage.getItem(BEST_KEY) || 0);
  return Number.isFinite(value) ? value : 0;
}

function saveBest(score) {
  const prev = loadBest();
  const best = Math.max(prev, score);
  localStorage.setItem(BEST_KEY, String(best));
  state.isNewBest = score > prev && score > 0;
  return best;
}

function fmt(n) {
  return Math.floor(n).toLocaleString("ko-KR");
}

function currentLevel() {
  const t = state.time;
  for (let i = 0; i < LEVELS.length; i++) {
    if (t < LEVELS[i].until || i === LEVELS.length - 1) {
      const bonus = t > 90 ? Math.min(0.5, (t - 90) * 0.01) : 0;
      return {
        name: LEVELS[i].name,
        speed: LEVELS[i].speed + bonus,
        spawn: LEVELS[i].spawn,
        index: i,
      };
    }
  }
  return { name: "쉬움", speed: 1, spawn: 1.15, index: 0 };
}

function zoneName(distance) {
  let name = ZONES[0].name;
  for (const zone of ZONES) {
    if (distance >= zone.at) name = zone.name;
  }
  return name;
}

function zoneIndex(distance) {
  let index = 0;
  ZONES.forEach((zone, i) => {
    if (distance >= zone.at) index = i;
  });
  return index;
}

function resetRun() {
  state.lane = 1;
  state.lanePos = 1;
  state.jumpT = -1;
  state.lives = CONFIG.maxLives;
  state.score = 0;
  state.scoreAcc = 0;
  state.distance = 0;
  state.time = 0;
  state.dodged = 0;
  state.invuln = 0;
  state.recoverLeft = 0;
  state.entities = [];
  state.spawnTimer = 1.15;
  state.shake = 0;
  state.flash = 0;
  state.banner = 0;
  state.zone = "CODE";
  state.popups = [];
  state.dying = 0;
  state.isNewBest = false;
}

function showScreen(id) {
  ["screen-title", "screen-help", "screen-select", "screen-over"].forEach((screenId) => {
    document.getElementById(screenId).classList.toggle("hidden", screenId !== id);
  });
  const playing = state.phase === "run" || state.phase === "dying";
  document.getElementById("hud").classList.toggle("hidden", !playing);
  document.getElementById("controls").classList.toggle("hidden", state.phase !== "run");
  syncBgm();
}

function refreshBest() {
  const best = loadBest();
  const box = document.getElementById("title-best");
  box.classList.toggle("hidden", best <= 0);
  document.getElementById("title-best-num").textContent = fmt(best);
}

function openSelect() {
  state.phase = "select";
  showScreen("screen-select");
  document.querySelectorAll(".char").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === state.character);
  });
  document.getElementById("btn-play").disabled = !state.character;
}

function startGame() {
  if (!state.character) return;
  unlockAudio();
  resetRun();
  state.phase = "run";
  showScreen(null);
  renderHud();
}

function finishGame() {
  state.phase = "over";
  state.entities = [];
  const best = saveBest(state.score);
  document.getElementById("over-who").textContent = NAMES[state.character] || "";
  document.getElementById("over-score").textContent = fmt(state.score);
  document.getElementById("over-distance").textContent = fmt(state.distance) + "m";
  document.getElementById("over-virus").textContent = fmt(state.dodged);
  document.getElementById("over-best").textContent = fmt(best);
  document.getElementById("new-best").classList.toggle("hidden", !state.isNewBest);
  showScreen("screen-over");
  refreshBest();
}

function renderHud() {
  let hearts = "";
  for (let i = 0; i < CONFIG.maxLives; i++) hearts += i < state.lives ? "❤️" : "🖤";
  document.getElementById("lives").textContent = hearts;
  document.getElementById("score").textContent = fmt(state.score);
  document.getElementById("level").textContent = currentLevel().name;
  document.getElementById("zone").textContent = state.zone;
  document.getElementById("distance").textContent = fmt(state.distance) + "m";
}

function moveLane(dir) {
  if (state.phase !== "run") return;
  state.lane = Math.max(0, Math.min(2, state.lane + dir));
}

function jump() {
  if (state.phase !== "run" || state.jumpT >= 0) return;
  state.jumpT = 0;
}

function popup(text, color) {
  const point = roadPoint(state.lanePos, 1);
  state.popups.push({
    text,
    color,
    life: 0.85,
    max: 0.85,
    x: point.x,
    y: point.y - viewH * 0.18,
  });
}

function pickLane(avoidPlayer) {
  let pool = [0, 1, 2].filter((lane) => !laneBusy(lane));
  if (!pool.length) pool = [0, 1, 2];
  if (avoidPlayer) {
    const safer = pool.filter((lane) => lane !== state.lane);
    if (safer.length) pool = safer;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function laneBusy(lane) {
  return state.entities.some((entity) => {
    const current = entity.variant === "moving" ? entity.laneFloat : entity.lane;
    return Math.abs(current - lane) < 0.75 && entity.depth < 0.45;
  });
}

function rollVirus(index) {
  const roll = Math.random();
  if (index <= 0) return "normal";
  if (index === 1) return roll < 0.28 ? "moving" : "normal";
  if (index === 2) {
    if (roll < 0.2) return "large";
    if (roll < 0.45) return "moving";
    return "normal";
  }
  if (roll < 0.28) return "large";
  if (roll < 0.58) return "moving";
  return "normal";
}

function pushEntity(kind, variant, lane) {
  state.entities.push({
    kind,
    variant,
    lane,
    laneFloat: lane,
    moveDir: Math.random() < 0.5 ? -1 : 1,
    depth: 0,
    resolved: false,
  });
}

function spawnWave() {
  const level = currentLevel();
  const roll = Math.random();
  const avoidPlayer = state.time < 8;
  if (roll < 0.18) {
    pushEntity("data", "normal", pickLane(false));
    return;
  }
  if (roll < 0.28) {
    pushEntity("vaccine", "normal", pickLane(false));
    return;
  }

  const laneA = pickLane(avoidPlayer);
  pushEntity("virus", rollVirus(level.index), laneA);
  if (level.index >= 2 && Math.random() < 0.42) {
    const options = [0, 1, 2].filter((lane) => lane !== laneA);
    pushEntity("virus", "normal", options[Math.floor(Math.random() * options.length)]);
  }
}

function jumpHeight() {
  if (state.jumpT < 0 || state.jumpT > 1) return 0;
  return Math.sin(state.jumpT * Math.PI);
}

function damage() {
  if (state.phase !== "run" || state.invuln > 0) return;
  state.lives -= 1;
  state.invuln = CONFIG.invulnTime;
  state.shake = 12;
  state.flash = 1;
  playSfx("hit");
  if (state.lives <= 0) {
    state.lives = 0;
    state.phase = "dying";
    state.dying = 0.7;
  }
}

function resolveEntity(entity) {
  entity.resolved = true;
  if (state.phase !== "run") return;

  const lane = entity.variant === "moving" ? entity.laneFloat : entity.lane;
  const sameLane = Math.abs(lane - state.lane) < 0.45;
  if (entity.kind === "virus") {
    const need = entity.variant === "large" ? 0.62 : 0.22;
    const cleared = sameLane && jumpHeight() >= need;
    if (!sameLane || cleared || state.invuln > 0) state.dodged += 1;
    else damage();
    return;
  }

  if (!sameLane) return;
  if (entity.kind === "vaccine") {
    state.score += CONFIG.vaccineScore;
    if (state.lives < CONFIG.maxLives) {
      state.lives += 1;
      popup("+100  ♥", "#8ad8ff");
    } else {
      popup("+100", "#8ad8ff");
    }
    state.recoverLeft = CONFIG.recoverDuration;
    playSfx("heal");
    return;
  }

  state.score += CONFIG.dataScore;
  popup("+50", "#9dffc4");
  playSfx("data");
}

function update(dt) {
  const playing = state.phase === "run";
  const level = currentLevel();

  if (playing) {
    state.time += dt;
    state.distance += CONFIG.metersPerSecond * level.speed * dt;
    state.scoreAcc += dt;
    while (state.scoreAcc >= 1) {
      state.scoreAcc -= 1;
      state.score += CONFIG.scorePerSecond;
    }
    const nextZone = zoneName(state.distance);
    if (nextZone !== state.zone) {
      state.zone = nextZone;
      state.banner = 1.35;
    }
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnWave();
      state.spawnTimer = level.spawn;
    }
  }

  if (state.phase === "dying") {
    state.dying -= dt;
    if (state.dying <= 0) finishGame();
  }

  state.lanePos += (state.lane - state.lanePos) * Math.min(1, dt * CONFIG.laneLerp);
  if (state.jumpT >= 0) {
    state.jumpT += dt / CONFIG.jumpDuration;
    if (state.jumpT >= 1) state.jumpT = -1;
  }
  if (state.invuln > 0) state.invuln -= dt;
  if (state.recoverLeft > 0) state.recoverLeft -= dt;
  if (state.shake > 0) state.shake *= Math.pow(0.05, dt);
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.8);
  if (state.banner > 0 && playing) state.banner -= dt;

  const speed = state.phase === "dying" ? level.speed * 0.45 : level.speed;
  if (state.phase === "run" || state.phase === "dying") {
    for (const entity of state.entities) {
      if (entity.variant === "moving") {
        const sway = 0.8 + level.index * 0.16;
        entity.laneFloat += entity.moveDir * sway * dt;
        if (entity.laneFloat <= 0) {
          entity.laneFloat = 0;
          entity.moveDir = 1;
        }
        if (entity.laneFloat >= 2) {
          entity.laneFloat = 2;
          entity.moveDir = -1;
        }
      }
      entity.depth += CONFIG.baseApproach * speed * dt;
      if (!entity.resolved && entity.depth >= CONFIG.hitDepth) resolveEntity(entity);
    }
    state.entities = state.entities.filter((entity) => entity.depth < 1.15);
  }

  state.popups.forEach((item) => {
    item.life -= dt;
    item.y -= dt * 42;
  });
  state.popups = state.popups.filter((item) => item.life > 0);

  bits.forEach((bit) => {
    bit.y += bit.v * dt;
    if (bit.y > 1) {
      bit.y = 0;
      bit.x = Math.random();
    }
  });
}

function roadPoint(lane, depth) {
  const horizonY = viewH * 0.34;
  const groundY = viewH - 118;
  const y = horizonY + (groundY - horizonY) * depth;
  const spread = viewW * (0.055 + 0.3 * depth);
  const x = viewW / 2 + (lane - 1) * spread;
  return { x, y, scale: 0.28 + 0.72 * depth };
}

function scrollDistance() {
  if (state.phase === "run" || state.phase === "dying" || state.phase === "over") return state.distance;
  return clock * 36;
}

function drawSky() {
  const colors = [
    ["#071426", "#12345a"],
    ["#071022", "#16325a"],
    ["#0c1024", "#2a1858"],
    ["#140818", "#3a1848"],
    ["#061422", "#0e4a62"],
    ["#120818", "#2a1060"],
  ];
  const pair = colors[zoneIndex(scrollDistance())];
  const sky = ctx.createLinearGradient(0, 0, 0, viewH);
  sky.addColorStop(0, pair[0]);
  sky.addColorStop(0.42, pair[1]);
  sky.addColorStop(1, "#05070f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, viewW, viewH);

  const glow = ctx.createRadialGradient(viewW / 2, viewH * 0.34, 8, viewW / 2, viewH * 0.36, viewW * 0.48);
  glow.addColorStop(0, "rgba(90, 230, 255, 0.38)");
  glow.addColorStop(1, "rgba(90, 230, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, viewW, viewH);
}

function drawBits() {
  ctx.textAlign = "center";
  ctx.font = "700 13px Orbitron, sans-serif";
  bits.forEach((bit) => {
    ctx.globalAlpha = bit.a;
    ctx.fillStyle = bit.s === "1" ? "#7ef0ff" : "#ff8ad8";
    ctx.fillText(bit.s, bit.x * viewW, bit.y * viewH * 0.42);
  });
  ctx.globalAlpha = 1;
}

function drawServers() {
  const offset = (scrollDistance() * 0.004) % 1;
  for (let i = 0; i < 5; i++) {
    const depth = (i / 5 + 1 - offset) % 1;
    const scale = 0.3 + depth * 0.85;
    const y = roadPoint(0, depth).y;
    const h = 78 * scale;
    const w = 34 * scale;
    [-1, 1].forEach((side) => {
      const edge = side < 0 ? roadPoint(-0.85, depth) : roadPoint(2.85, depth);
      const x = side < 0 ? edge.x - w - 10 : edge.x + 10;
      ctx.fillStyle = "rgba(8, 20, 42, 0.92)";
      ctx.strokeStyle = "rgba(62, 224, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.fillRect(x, y - h, w, h);
      ctx.strokeRect(x, y - h, w, h);
      for (let light = 8; light < h - 8; light += 14) {
        ctx.fillStyle = (i + light) % 3 === 0 ? "#ff4fd8" : "#3ee0ff";
        ctx.fillRect(x + 5, y - h + light, w - 10, Math.max(2, 3 * scale));
      }
    });
  }
}

function drawRoad() {
  const farL = roadPoint(-0.7, 0);
  const farR = roadPoint(2.7, 0);
  const nearR = roadPoint(2.7, 1);
  const nearL = roadPoint(-0.7, 1);
  const road = ctx.createLinearGradient(0, farL.y, 0, nearL.y);
  road.addColorStop(0, "rgba(40, 90, 140, 0.15)");
  road.addColorStop(1, "rgba(6, 16, 36, 0.96)");
  ctx.fillStyle = road;
  ctx.beginPath();
  ctx.moveTo(farL.x, farL.y);
  ctx.lineTo(farR.x, farR.y);
  ctx.lineTo(nearR.x, nearR.y);
  ctx.lineTo(nearL.x, nearL.y);
  ctx.closePath();
  ctx.fill();

  if (state.phase === "run" || state.phase === "dying") {
    const left = state.lanePos - 0.5;
    const right = state.lanePos + 0.5;
    ctx.fillStyle = "rgba(62, 224, 255, 0.1)";
    ctx.beginPath();
    const a = roadPoint(left, 0.12);
    const b = roadPoint(right, 0.12);
    const c = roadPoint(right, 1);
    const d = roadPoint(left, 1);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  [-0.5, 0.5, 1.5, 2.5].forEach((lane, index) => {
    ctx.strokeStyle = index === 0 || index === 3 ? "rgba(62, 224, 255, 0.9)" : "rgba(62, 224, 255, 0.28)";
    ctx.lineWidth = index === 0 || index === 3 ? 2.5 : 1.5;
    const from = roadPoint(lane, 0);
    const to = roadPoint(lane, 1);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  });

  const offset = (scrollDistance() * 0.006) % 1;
  ctx.strokeStyle = "rgba(210, 255, 255, 0.7)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  [0.5, 1.5].forEach((lane) => {
    for (let i = 0; i < 7; i++) {
      const start = (i / 7 + offset) % 1;
      const end = Math.min(0.99, start + 0.035);
      const p0 = roadPoint(lane, start);
      const p1 = roadPoint(lane, end);
      ctx.globalAlpha = 0.35 + start * 0.65;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawVirus(variant) {
  const large = variant === "large";
  const moving = variant === "moving";
  const radius = large ? 36 : 25;
  const color = large ? "#ff3b5c" : moving ? "#c084fc" : "#ff4f9a";
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  const spikes = large ? 9 : 6;
  for (let i = 0; i < spikes; i++) {
    const angle = (Math.PI * 2 * i) / spikes + clock * (moving ? 2 : 0.7);
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.92, large ? 9 : 6.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#2a1020";
  ctx.beginPath();
  ctx.arc(-8, -2, 3.3, 0, Math.PI * 2);
  ctx.arc(8, -2, 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2a1020";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (large) {
    ctx.moveTo(-8, 12);
    ctx.lineTo(8, 12);
  } else {
    ctx.arc(0, 6, 6, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  ctx.stroke();
  if (moving) {
    ctx.fillStyle = "#fff";
    ctx.font = "700 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("↔", 0, -radius - 2);
  }
}

function drawVaccine() {
  const body = ctx.createLinearGradient(0, -34, 0, 34);
  body.addColorStop(0, "#e7fbff");
  body.addColorStop(0.4, "#3ecbff");
  body.addColorStop(1, "#2a62ff");
  roundRect(-16, -34, 32, 68, 16);
  ctx.fillStyle = body;
  ctx.shadowColor = "#3ecbff";
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 18px Orbitron, sans-serif";
  ctx.fillText("+", 0, -4);
  ctx.font = "700 8px Orbitron, sans-serif";
  ctx.fillText("VAC", 0, 16);
}

function drawData() {
  roundRect(-24, -16, 48, 32, 8);
  ctx.fillStyle = "rgba(6, 28, 24, 0.92)";
  ctx.strokeStyle = "#7cffb2";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#7cffb2";
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#d9ffe8";
  ctx.font = "800 14px Orbitron, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("01", 0, 1);
}

function drawEntity(entity) {
  const lane = entity.variant === "moving" ? entity.laneFloat : entity.lane;
  const point = roadPoint(lane, Math.min(1, entity.depth));
  const hover = entity.kind === "virus" ? 0 : Math.sin(clock * 5 + entity.depth * 6) * 7 * point.scale;
  ctx.save();
  ctx.translate(point.x, point.y + hover * 0.15);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 26 * point.scale, 8 * point.scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -30 * point.scale - hover);
  const extra = entity.variant === "large" ? 1.28 : 1;
  ctx.scale(point.scale * extra, point.scale * extra);
  if (entity.kind === "virus") drawVirus(entity.variant);
  else if (entity.kind === "vaccine") drawVaccine();
  else drawData();
  ctx.restore();
}

function drawFallback(color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -70, 58, 68, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f7dff";
  roundRect(-46, -108, 92, 22, 11);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 12px Orbitron, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("AI", 0, -96);
}

function drawPlayer() {
  const point = roadPoint(state.lanePos, 1);
  const height = jumpHeight();
  const lift = height * viewH * 0.16;
  const bob = height === 0 ? Math.sin(state.time * 14) * 7 : 0;
  const img = playerSprite();
  const ready = img && img.complete && img.naturalWidth > 0;
  const pw = viewW * 0.36;
  const ph = ready ? pw * (img.naturalHeight / img.naturalWidth) : pw * 1.25;

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 0, pw * 0.24 * (1 - height * 0.35), 11 * (1 - height * 0.35), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(point.x, point.y - lift + bob);
  ctx.rotate(Math.sin(state.time * 14) * (height > 0 ? 0.02 : 0.05));
  if (ready) {
    ctx.drawImage(img, -pw / 2, -ph, pw, ph);
  } else {
    drawFallback(state.character === "yellow" ? "#ffd84a" : "#f4f7fb");
  }
  ctx.restore();
}

function drawBanner() {
  if (state.banner <= 0 || state.phase !== "run") return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.banner);
  ctx.fillStyle = "#d8fbff";
  ctx.font = "800 32px Orbitron, sans-serif";
  ctx.textAlign = "center";
  ctx.shadowColor = "#3ee0ff";
  ctx.shadowBlur = 16;
  ctx.fillText(state.zone, viewW / 2, viewH * 0.3);
  ctx.restore();
}

function drawPopups() {
  state.popups.forEach((item) => {
    ctx.globalAlpha = Math.max(0, item.life / item.max);
    ctx.fillStyle = item.color;
    ctx.font = "800 22px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(item.text, item.x, item.y);
  });
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.save();
  if (state.shake > 0.6) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawSky();
  drawBits();
  drawServers();
  drawRoad();

  const playing = state.phase === "run" || state.phase === "dying";
  if (playing) {
    const ordered = state.entities.slice().sort((a, b) => a.depth - b.depth);
    ordered.forEach(drawEntity);
    drawPlayer();
    if (state.time < 5) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.font = "700 15px \"Noto Sans KR\", sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("←  →  로 피하고,  ↑  로 점프", viewW / 2, viewH * 0.46);
    }

    if (state.banner <= 0) {
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = "#bff6ff";
      ctx.font = "700 22px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.zone, viewW / 2, viewH * 0.31);
      ctx.globalAlpha = 1;
    }
  }

  drawBanner();
  drawPopups();

  if (state.flash > 0) {
    ctx.fillStyle = "rgba(255, 50, 80, " + (state.flash * 0.28).toFixed(3) + ")";
    ctx.fillRect(0, 0, viewW, viewH);
  }
  if (state.phase === "run" && state.lives <= 2) {
    ctx.fillStyle = "rgba(255, 40, 70, 0.1)";
    ctx.fillRect(0, 0, viewW, viewH);
  }
  ctx.restore();
}

function loop(ts) {
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (dt > 0.05) dt = 0.05;
  clock += dt;
  if (state.phase === "run" || state.phase === "dying") {
    update(dt);
    renderHud();
  } else {
    bits.forEach((bit) => {
      bit.y += bit.v * dt;
      if (bit.y > 1) bit.y = 0;
    });
  }
  draw();
  requestAnimationFrame(loop);
}

function bind(id, fn) {
  document.getElementById(id).addEventListener("click", fn);
}

bind("btn-start", openSelect);
bind("btn-help", () => {
  state.phase = "help";
  showScreen("screen-help");
});
bind("btn-help-back", () => {
  state.phase = "title";
  showScreen("screen-title");
});
bind("btn-select-back", () => {
  state.phase = "title";
  showScreen("screen-title");
});
bind("btn-play", startGame);
bind("btn-retry", startGame);
bind("btn-change", openSelect);
bind("pad-left", () => moveLane(-1));
bind("pad-jump", jump);
bind("pad-right", () => moveLane(1));

document.querySelectorAll(".char").forEach((button) => {
  button.addEventListener("click", () => {
    state.character = button.dataset.id;
    openSelect();
    unlockAudio();
  });
});

window.addEventListener("keydown", (event) => {
  if (state.phase === "run" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) {
    event.preventDefault();
  }
  if (event.repeat) return;
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") moveLane(-1);
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") moveLane(1);
  if (event.key === "ArrowUp" || event.key === "w" || event.key === "W" || event.key === " ") jump();
});

let touchX = 0;
let touchY = 0;
canvas.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  touchX = touch.clientX;
  touchY = touch.clientY;
}, { passive: true });
canvas.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchX;
  const dy = touch.clientY - touchY;
  if (Math.abs(dx) < 36 && Math.abs(dy) < 36) return;
  if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
  else if (dy < 0) jump();
}, { passive: true });

window.addEventListener("resize", fitCanvas);
refreshBest();
initAudio();
bindAudioUnlock();
showScreen("screen-title");
fitCanvas();
loadAllSprites();
requestAnimationFrame(loop);
