const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const ui = {
  cash: document.querySelector("#cash"),
  wanted: document.querySelector("#wanted"),
  health: document.querySelector("#health"),
  status: document.querySelector("#status"),
  ammo: document.querySelector("#ammo"),
  speed: document.querySelector("#speed"),
  missionTitle: document.querySelector("#missionTitle"),
  missionText: document.querySelector("#missionText"),
  notice: document.querySelector("#notice"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsOverlay: document.querySelector("#settingsOverlay"),
  closeSettings: document.querySelector("#closeSettings"),
  qualityButtons: document.querySelectorAll("[data-quality]"),
  controlButtons: document.querySelectorAll("[data-controls]"),
  effectsToggle: document.querySelector("#effectsToggle"),
  labelsToggle: document.querySelector("#labelsToggle"),
  mouseAimToggle: document.querySelector("#mouseAimToggle"),
  driveControlLabel: document.querySelector("#driveControlLabel"),
  aimControlLabel: document.querySelector("#aimControlLabel"),
  overlay: document.querySelector("#startOverlay"),
  start: document.querySelector("#startButton"),
  startSettings: document.querySelector("#startSettingsButton"),
};

const world = {
  width: 4200,
  height: 3200,
  block: 360,
  road: 96,
};

const spawnPoint = {
  x: 220,
  y: 220,
  angle: -0.5,
};

const safeZones = [
  { x: 112, y: 112, w: 228, h: 228, type: "garage" },
];

const parks = [
  { x: 844, y: 844, w: 560, h: 560 },
  { x: 2620, y: 480, w: 520, h: 410 },
  { x: 1880, y: 2120, w: 720, h: 500 },
];

const keys = new Set();
const mouse = { x: 0, y: 0, active: false };
const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const qualityProfiles = {
  low: {
    traffic: 22,
    patrols: 4,
    officers: 5,
    pedestrians: 26,
    particles: 0.38,
    labels: false,
    effects: false,
  },
  medium: {
    traffic: 34,
    patrols: 5,
    officers: 7,
    pedestrians: 46,
    particles: 0.7,
    labels: true,
    effects: true,
  },
  high: {
    traffic: 44,
    patrols: 7,
    officers: 10,
    pedestrians: 70,
    particles: 1,
    labels: true,
    effects: true,
  },
};

const defaultSettings = {
  quality: "high",
  controls: "zqsd",
  effects: true,
  labels: true,
  mouseAim: true,
};

const settings = loadSettings();

const player = {
  x: spawnPoint.x,
  y: spawnPoint.y,
  angle: spawnPoint.angle,
  speed: 0,
  mode: "car",
  cash: 0,
  wanted: 0,
  health: 100,
  stamina: 100,
  ammo: 24,
  weaponCooldown: 0,
  pulseCooldown: 0,
  heatCooldown: 0,
  escapeTimer: 0,
  bustedCooldown: 0,
  invulnerable: 0,
};

const vehicle = {
  x: player.x,
  y: player.y,
  angle: player.angle,
  speed: 0,
  color: "#f1c55d",
  role: "player",
  stolen: false,
};

const thief = {
  x: 900,
  y: 760,
  angle: 0,
  speed: 120,
  loot: 0,
  cooldown: 0,
  role: "thief",
};

const stats = {
  missions: 0,
  stolen: 0,
  stopped: 0,
  disabled: 0,
};

const camera = { x: 0, y: 0, shake: 0 };
const traffic = [];
const patrols = [];
const officers = [];
const pedestrians = [];
const pickups = [];
const projectiles = [];
const sparks = [];
const skidMarks = [];
const floatingTexts = [];
const buildings = [];
const decorations = [];

const missions = [
  {
    title: "Mission: Courier Run",
    text: "Drive or run to the yellow drop point before the timer ends.",
    target: { x: 3620, y: 2460 },
    reward: 450,
    time: 90,
    color: "#f1c55d",
  },
  {
    title: "Mission: Dockside Dash",
    text: "Reach the blue marker while police heat is low.",
    target: { x: 650, y: 2780 },
    reward: 700,
    time: 80,
    color: "#4cc9f0",
  },
  {
    title: "Mission: Uptown Pickup",
    text: "Cross town to the green pickup zone for a bonus payout.",
    target: { x: 3440, y: 640 },
    reward: 900,
    time: 75,
    color: "#8bd450",
  },
  {
    title: "Mission: Quiet Escape",
    text: "Lose one wanted level before reaching the orange safehouse.",
    target: { x: 1340, y: 1640 },
    reward: 1050,
    time: 95,
    color: "#ffb15c",
  },
];

let missionIndex = 0;
let missionTimer = missions[0].time;
let running = false;
let lastTime = performance.now();
let noticeMessage = "Stop the stealer before he empties the street cash.";
let noticeTimer = 4;

function resizeCanvas() {
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * scale);
  canvas.height = Math.floor(window.innerHeight * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function isRoad(x, y) {
  const bx = x % world.block;
  const by = y % world.block;
  return bx < world.road || by < world.road;
}

function nearRoad(x, y) {
  const bx = x % world.block;
  const by = y % world.block;
  return bx < world.road + 54 || by < world.road + 54;
}

function insideRect(x, y, rect, pad = 0) {
  return x > rect.x - pad && x < rect.x + rect.w + pad && y > rect.y - pad && y < rect.y + rect.h + pad;
}

function insideBuilding(x, y, pad = 0) {
  return buildings.some((building) => insideRect(x, y, building, pad));
}

function overlapsPark(x, y, w, h) {
  return parks.some((park) => x < park.x + park.w && x + w > park.x && y < park.y + park.h && y + h > park.y);
}

function overlapsSafeZone(x, y, w, h) {
  return safeZones.some((zone) => x < zone.x + zone.w && x + w > zone.x && y < zone.y + zone.h && y + h > zone.y);
}

function randomRoadPoint() {
  for (let i = 0; i < 120; i++) {
    const point = { x: rand(120, world.width - 120), y: rand(120, world.height - 120) };
    if (isRoad(point.x, point.y) && !insideBuilding(point.x, point.y, 12)) return point;
  }
  return { x: 520, y: 520 };
}

function randomRoadPointAwayFrom(center, radius) {
  for (let i = 0; i < 140; i++) {
    const point = randomRoadPoint();
    if (distance(point, center) > radius) return point;
  }
  return randomRoadPoint();
}

function randomWalkPoint() {
  for (let i = 0; i < 120; i++) {
    const point = { x: rand(120, world.width - 120), y: rand(120, world.height - 120) };
    if (nearRoad(point.x, point.y) && !insideBuilding(point.x, point.y, 18)) return point;
  }
  return randomRoadPoint();
}

function buildCity() {
  buildings.length = 0;
  decorations.length = 0;

  for (let x = world.road + 28; x < world.width; x += world.block) {
    for (let y = world.road + 28; y < world.height - 260; y += world.block) {
      const w = world.block - world.road - 62;
      const h = world.block - world.road - 62;
      if (overlapsPark(x, y, w, h) || overlapsSafeZone(x, y, w, h)) continue;
      buildings.push({
        x,
        y,
        w,
        h,
        levels: Math.floor(rand(2, 8)),
        color: ["#30343d", "#3b3f48", "#292f37", "#3f4550", "#423b42"][Math.floor(rand(0, 5))],
        windows: Math.floor(rand(3, 8)),
      });
    }
  }

  for (const park of parks) {
    for (let i = 0; i < 36; i++) {
      decorations.push({
        x: rand(park.x + 28, park.x + park.w - 28),
        y: rand(park.y + 28, park.y + park.h - 28),
        type: Math.random() > 0.25 ? "tree" : "bench",
      });
    }
  }

  for (let x = 120; x < world.width; x += 240) {
    for (let y = 120; y < world.height - 260; y += 240) {
      if (nearRoad(x, y) && !insideBuilding(x, y, 40) && Math.random() > 0.45) {
        decorations.push({ x, y, type: "lamp" });
      }
    }
  }
}

function spawnTraffic() {
  traffic.length = 0;
  for (let i = 0; i < qualityProfile().traffic; i++) {
    const vertical = Math.random() > 0.5;
    const maxLane = vertical ? world.width / world.block : world.height / world.block;
    const lane = Math.floor(rand(1, maxLane)) * world.block + 45;
    const point = randomRoadPointAwayFrom(player, 520);
    traffic.push({
      x: vertical ? lane : point.x,
      y: vertical ? point.y : lane,
      angle: vertical ? Math.PI / 2 : 0,
      speed: rand(60, 150) * (Math.random() > 0.5 ? 1 : -1),
      color: ["#e76f51", "#2a9d8f", "#e9c46a", "#8ab17d", "#9d4edd", "#f4a261"][Math.floor(rand(0, 6))],
      role: "traffic",
      hitCooldown: 0,
      driver: true,
      parked: false,
    });
  }
}

function spawnPatrols() {
  patrols.length = 0;
  for (let i = 0; i < qualityProfile().patrols; i++) {
    const point = randomRoadPointAwayFrom(player, 620);
    patrols.push({
      x: point.x,
      y: point.y,
      angle: rand(0, Math.PI * 2),
      speed: 0,
      role: "police",
      hitCooldown: 0,
      stun: 0,
      armor: 3,
      fireCooldown: rand(0.8, 2.4),
    });
  }
}

function spawnOfficers() {
  officers.length = 0;
  for (let i = 0; i < qualityProfile().officers; i++) {
    const point = randomRoadPointAwayFrom(player, 460);
    officers.push({
      x: point.x,
      y: point.y,
      angle: rand(0, Math.PI * 2),
      speed: rand(40, 70),
      wander: rand(0.3, 2),
      role: "officer",
      hitCooldown: 0,
      stun: 0,
      fireCooldown: rand(0.6, 2.8),
    });
  }
}

function spawnPedestrians() {
  pedestrians.length = 0;
  for (let i = 0; i < qualityProfile().pedestrians; i++) {
    const point = randomWalkPoint();
    pedestrians.push({
      x: point.x,
      y: point.y,
      angle: rand(0, Math.PI * 2),
      speed: rand(24, 58),
      flee: 0,
      bumpCooldown: 0,
      color: ["#f1d1b5", "#d7a982", "#8f6547", "#f2c6a0", "#b87b5f"][Math.floor(rand(0, 5))],
      shirt: ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd166"][Math.floor(rand(0, 6))],
      role: "pedestrian",
    });
  }
}

function spawnPickups() {
  pickups.length = 0;
  for (let i = 0; i < 34; i++) {
    const point = randomRoadPoint();
    const roll = Math.random();
    const type = roll < 0.2 ? "repair" : roll < 0.42 ? "ammo" : "cash";
    pickups.push({
      x: point.x,
      y: point.y,
      type,
      value: pickupValue(type),
    });
  }
}

function pickupValue(type) {
  if (type === "cash") return 100;
  if (type === "ammo") return 12;
  return 25;
}

function spawnThief() {
  const point = randomWalkPoint();
  thief.x = point.x;
  thief.y = point.y;
  thief.angle = rand(0, Math.PI * 2);
  thief.speed = 125;
  thief.cooldown = 0;
  thief.loot = 0;
}

function showNotice(message, seconds = 3) {
  noticeMessage = message;
  noticeTimer = seconds;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("neonBoroughSettings") || "{}");
    return {
      ...defaultSettings,
      ...saved,
      quality: qualityProfiles[saved.quality] ? saved.quality : defaultSettings.quality,
      controls: ["zqsd", "wasd", "arrows"].includes(saved.controls) ? saved.controls : defaultSettings.controls,
    };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings() {
  try {
    localStorage.setItem("neonBoroughSettings", JSON.stringify(settings));
  } catch {
    // Local file storage can be blocked in some browsers; the current session still works.
  }
}

function qualityProfile() {
  return qualityProfiles[settings.quality] || qualityProfiles.high;
}

function setQuality(quality) {
  const profile = qualityProfiles[quality];
  if (!profile) return;
  settings.quality = quality;
  settings.effects = profile.effects;
  settings.labels = profile.labels;
  applyQualityProfile(true);
  syncSettingsUi();
  saveSettings();
  showNotice(`${quality[0].toUpperCase()}${quality.slice(1)} quality applied.`, 2);
}

function applyQualityProfile(respawn = false) {
  if (respawn) {
    spawnTraffic();
    spawnPatrols();
    spawnOfficers();
    spawnPedestrians();
  } else {
    trimToQuality();
  }
}

function trimToQuality() {
  const profile = qualityProfile();
  traffic.length = Math.min(traffic.length, profile.traffic);
  patrols.length = Math.min(patrols.length, profile.patrols);
  officers.length = Math.min(officers.length, profile.officers);
  pedestrians.length = Math.min(pedestrians.length, profile.pedestrians);
}

function setControlLayout(controls) {
  if (!["zqsd", "wasd", "arrows"].includes(controls)) return;
  settings.controls = controls;
  syncSettingsUi();
  saveSettings();
  showNotice(`${controlLabel()} controls selected.`, 2);
}

function controlLabel() {
  if (settings.controls === "wasd") return "WASD / Arrows";
  if (settings.controls === "arrows") return "Arrow keys";
  return "ZQSD / Arrows";
}

function syncSettingsUi() {
  ui.qualityButtons.forEach((button) => button.classList.toggle("active", button.dataset.quality === settings.quality));
  ui.controlButtons.forEach((button) => button.classList.toggle("active", button.dataset.controls === settings.controls));
  ui.effectsToggle.checked = settings.effects;
  ui.labelsToggle.checked = settings.labels;
  ui.mouseAimToggle.checked = settings.mouseAim;
  ui.driveControlLabel.textContent = `${controlLabel()} drive`;
  ui.aimControlLabel.textContent = settings.mouseAim ? "J / Click stun shot" : "J stun shot";
}

function addFloatingText(text, x, y, color = "#f7f1e8") {
  if (!settings.effects) return;
  floatingTexts.push({
    text,
    x,
    y,
    vy: -28,
    life: 1.2,
    maxLife: 1.2,
    color,
  });
}

function addScreenShake(amount) {
  if (!settings.effects) return;
  camera.shake = clamp(camera.shake + amount, 0, 18);
}

function currentMission() {
  return missions[missionIndex % missions.length];
}

function nextMission() {
  const mission = currentMission();
  player.cash += mission.reward;
  stats.missions += 1;
  missionIndex += 1;
  missionTimer = currentMission().time;
  player.wanted = Math.max(0, player.wanted - 1);
  showNotice(`Mission complete. Earned $${mission.reward}.`, 3.5);
  addFloatingText(`+$${mission.reward}`, mission.target.x, mission.target.y - 35, mission.color);
  addScreenShake(6);
}

function resetPlayer(repair = true) {
  player.mode = "car";
  player.x = spawnPoint.x;
  player.y = spawnPoint.y;
  player.angle = spawnPoint.angle;
  player.speed = 0;
  if (repair) player.health = Math.min(100, player.health + 35);
  if (player.health <= 0) player.health = repair ? 35 : 72;
  player.wanted = Math.max(0, player.wanted - 1);
  player.invulnerable = 2.4;
  vehicle.x = player.x;
  vehicle.y = player.y;
  vehicle.angle = player.angle;
  vehicle.speed = 0;
  vehicle.color = "#f1c55d";
  vehicle.stolen = false;
  moveCrowdAwayFromPlayer();
  showNotice("Back at the garage.", 2);
}

function moveCrowdAwayFromPlayer() {
  for (const car of traffic) {
    if (distance(car, player) < 260) {
      const point = randomRoadPointAwayFrom(player, 520);
      car.x = point.x;
      car.y = point.y;
      car.hitCooldown = 1;
    }
  }
  for (const patrol of patrols) {
    if (distance(patrol, player) < 320) {
      const point = randomRoadPointAwayFrom(player, 620);
      patrol.x = point.x;
      patrol.y = point.y;
      patrol.hitCooldown = 1;
    }
  }
}

function toggleVehicle() {
  if (!running) return;
  if (player.mode === "car") {
    vehicle.x = player.x;
    vehicle.y = player.y;
    vehicle.angle = player.angle;
    vehicle.speed = 0;
    const sideX = Math.cos(player.angle) * 52;
    const sideY = Math.sin(player.angle) * 52;
    player.x = clamp(player.x + sideX, 30, world.width - 30);
    player.y = clamp(player.y + sideY, 30, world.height - 30);
    player.speed = 0;
    player.mode = "foot";
    showNotice("On foot. Press E near any car to take it.", 3);
    return;
  }

  const target = nearestEnterableCar(94);
  if (!target) {
    showNotice("No car close enough. Stand next to a door and press E.", 2);
    return;
  }

  if (target.type === "own") {
    enterVehicle(vehicle, "Back in the car.", false);
  } else if (target.type === "traffic") {
    takeTrafficCar(target.car, target.index);
  } else if (target.type === "police") {
    if (target.car.stun > 0) {
      takePoliceCar(target.car, target.index);
    } else {
      showNotice("Disable the police car first, then press E.", 2);
      raiseHeat(1);
    }
  }
}

function nearestEnterableCar(range) {
  const candidates = [];
  const ownDistance = distance(player, vehicle);
  if (ownDistance < range) candidates.push({ type: "own", car: vehicle, index: -1, d: ownDistance });

  for (let i = 0; i < traffic.length; i++) {
    const d = distance(player, traffic[i]);
    if (d < range) candidates.push({ type: "traffic", car: traffic[i], index: i, d });
  }

  for (let i = 0; i < patrols.length; i++) {
    const d = distance(player, patrols[i]);
    if (d < range) candidates.push({ type: "police", car: patrols[i], index: i, d });
  }

  candidates.sort((a, b) => a.d - b.d);
  return candidates[0];
}

function takeTrafficCar(car, index) {
  parkCurrentVehicle();
  if (car.driver !== false) {
    ejectDriver(car, "pedestrian");
    raiseHeat(2);
    showNotice("You booted the driver and took the car. Police heat is up.", 3);
  } else {
    showNotice("Entered a parked car.", 2);
  }
  traffic.splice(index, 1);
  enterVehicle(car, "", true);
}

function takePoliceCar(car, index) {
  parkCurrentVehicle();
  ejectDriver(car, "officer");
  patrols.splice(index, 1);
  raiseHeat(2);
  enterVehicle({ ...car, color: "#f5f7fa", speed: 0 }, "Took a disabled police cruiser.", true);
}

function parkCurrentVehicle() {
  if (!Number.isFinite(vehicle.x) || !Number.isFinite(vehicle.y)) return;
  traffic.push({
    x: vehicle.x,
    y: vehicle.y,
    angle: vehicle.angle,
    speed: 0,
    color: vehicle.color || "#f1c55d",
    role: "traffic",
    hitCooldown: 0.8,
    driver: false,
    parked: true,
  });
}

function enterVehicle(car, message, stolen) {
  const facingAngle = car.speed < -8 ? car.angle + Math.PI : car.angle;
  const entrySpeed = Math.min(Math.abs(car.speed || 0), 95);
  vehicle.x = car.x;
  vehicle.y = car.y;
  vehicle.angle = facingAngle;
  vehicle.speed = entrySpeed;
  vehicle.color = car.color || "#f1c55d";
  vehicle.stolen = stolen;
  player.mode = "car";
  player.x = vehicle.x;
  player.y = vehicle.y;
  player.angle = vehicle.angle;
  player.speed = entrySpeed;
  if (message) showNotice(message, 2.2);
}

function ejectDriver(car, role) {
  const sideX = Math.cos(car.angle) * 48;
  const sideY = Math.sin(car.angle) * 48;
  const driver = {
    x: clamp(car.x + sideX, 24, world.width - 24),
    y: clamp(car.y + sideY, 24, world.height - 300),
    angle: Math.atan2(sideX, -sideY),
    speed: rand(76, 118),
    flee: 4.2,
    bumpCooldown: 1,
    color: ["#f1d1b5", "#d7a982", "#8f6547", "#f2c6a0", "#b87b5f"][Math.floor(rand(0, 5))],
    shirt: ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd166"][Math.floor(rand(0, 6))],
    role: role === "officer" ? "officer" : "pedestrian",
    stun: role === "officer" ? 2.5 : 0,
    hitCooldown: 1,
    fireCooldown: 3,
    wander: 1.4,
  };

  if (role === "officer") officers.push(driver);
  else pedestrians.push(driver);
  addSparks(driver.x, driver.y, 8, "rgba(255, 231, 145, 0.85)");
}

function controlState() {
  if (joyActive) {
  return {
    accelerating: joyY < -0.2,
    reversing: joyY > 0.2,
    left: joyX < -0.2,
    right: joyX > 0.2,
    braking: false,
    boost: Math.hypot(joyX, joyY) > 0.8,
  };
}
  const useZqsd = settings.controls === "zqsd";
  const useWasd = settings.controls === "wasd";
  const arrows = settings.controls === "arrows";
  return {
    accelerating: keys.has("arrowup") || (!arrows && ((useZqsd && keys.has("z")) || (useWasd && keys.has("w")))),
    reversing: keys.has("arrowdown") || (!arrows && keys.has("s")),
    left: keys.has("arrowleft") || (!arrows && ((useZqsd && keys.has("q")) || (useWasd && keys.has("a")))),
    right: keys.has("arrowright") || (!arrows && keys.has("d")),
    braking: keys.has(" "),
    boost: keys.has("shift"),
  };
}

function playerAimAngle() {
  if (settings.mouseAim && mouse.active) {
    const worldMouse = { x: camera.x + mouse.x, y: camera.y + mouse.y };
    return Math.atan2(worldMouse.x - player.x, -(worldMouse.y - player.y));
  }
  return player.angle;
}

function shootWeapon() {
  if (!running || player.weaponCooldown > 0) return;
  if (player.ammo <= 0) {
    showNotice("Out of ammo. Find yellow ammo crates.", 1.8);
    player.weaponCooldown = 0.35;
    return;
  }

  const angle = playerAimAngle();
  const muzzle = player.mode === "car" ? 44 : 22;
  player.angle = player.mode === "foot" ? angle : player.angle;
  player.ammo -= 1;
  player.weaponCooldown = player.mode === "car" ? 0.22 : 0.28;
  raiseHeat(1);
  createProjectile({
    owner: "player",
    x: player.x + Math.sin(angle) * muzzle,
    y: player.y - Math.cos(angle) * muzzle,
    angle,
    speed: 840,
    life: 0.82,
    color: "#f1c55d",
  });
  addSparks(player.x + Math.sin(angle) * muzzle, player.y - Math.cos(angle) * muzzle, 4, "rgba(241, 197, 93, 0.95)");
}

function pulseHit() {
  if (!running || player.pulseCooldown > 0) return;
  player.pulseCooldown = 0.75;
  const radius = player.mode === "car" ? 58 : 82;
  let hit = false;

  if (thief.cooldown <= 0 && distance(player, thief) < radius + 8) {
    stopThief("Pulse hit stopped the stealer.");
    hit = true;
  }

  for (const officer of officers) {
    if (officer.stun <= 0 && distance(player, officer) < radius) {
      disableOfficer(officer);
      hit = true;
    }
  }

  for (const patrol of patrols) {
    if (patrol.stun <= 0 && distance(player, patrol) < radius + 12) {
      disablePatrol(patrol);
      hit = true;
    }
  }

  addPulse(player.x, player.y, radius);
  if (hit) {
    raiseHeat(1);
    showNotice("Pulse hit landed.", 1.8);
  } else {
    showNotice("No target in pulse range.", 1.4);
  }
}

function createProjectile(projectile) {
  projectiles.push({
    ...projectile,
    maxLife: projectile.life,
    radius: projectile.owner === "player" ? 9 : 7,
  });
}

function addPulse(x, y, radius) {
  if (!settings.effects) return;
  const count = Math.max(8, Math.round(34 * qualityProfile().particles));
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    sparks.push({
      x: x + Math.cos(angle) * radius * 0.28,
      y: y + Math.sin(angle) * radius * 0.28,
      vx: Math.cos(angle) * rand(90, 220),
      vy: Math.sin(angle) * rand(90, 220),
      life: rand(0.18, 0.42),
      maxLife: 0.42,
      color: "rgba(139, 212, 80, 0.9)",
    });
  }
}

function updatePlayer(dt) {
  if (player.mode === "car") updateCar(dt);
  else updateCharacter(dt);
}

function updateCar(dt) {
  const controls = controlState();
  const boosting = controls.boost && controls.accelerating && player.stamina > 1;
  const acceleration = boosting ? 430 : 270;

  if (controls.accelerating) player.speed += acceleration * dt;
  if (controls.reversing) player.speed -= 190 * dt;
  if (controls.braking) player.speed *= 0.91;

  if (boosting) player.stamina = clamp(player.stamina - 42 * dt, 0, 100);
  else player.stamina = clamp(player.stamina + 20 * dt, 0, 100);

  const onRoad = isRoad(player.x, player.y);
  player.speed *= onRoad ? 0.986 : 0.936;
  player.speed = clamp(player.speed, -180, boosting ? 540 : 430);

  const turn = clamp(player.speed / 210, -1, 1) * (controls.braking ? 3.3 : 2.45) * dt;
  if (controls.left) player.angle -= turn;
  if (controls.right) player.angle += turn;

  if (controls.braking && (controls.left || controls.right) && Math.abs(player.speed) > 120) {
    const rearX = player.x - Math.sin(player.angle) * 30;
    const rearY = player.y + Math.cos(player.angle) * 30;
    addSparks(rearX, rearY, 2, "rgba(214, 222, 218, 0.9)");
    addSkidMark(rearX + Math.cos(player.angle) * 12, rearY + Math.sin(player.angle) * 12, player.angle);
    addSkidMark(rearX - Math.cos(player.angle) * 12, rearY - Math.sin(player.angle) * 12, player.angle);
  }

  const nextX = player.x + Math.sin(player.angle) * player.speed * dt;
  const nextY = player.y - Math.cos(player.angle) * player.speed * dt;
  player.x = clamp(nextX, 30, world.width - 30);
  player.y = clamp(nextY, 30, world.height - 30);

  for (const building of buildings) {
    if (insideRect(player.x, player.y, building, 22)) {
      player.speed *= -0.36;
      player.x -= Math.sin(player.angle) * 22;
      player.y += Math.cos(player.angle) * 22;
      addSparks(player.x, player.y, 10);
      addScreenShake(7);
      damagePlayer(9);
      raiseHeat(1);
    }
  }

  vehicle.x = player.x;
  vehicle.y = player.y;
  vehicle.angle = player.angle;
  vehicle.speed = player.speed;
}

function updateCharacter(dt) {
  const controls = controlState();
  let dx = 0;
  let dy = 0;
  if (controls.accelerating) dy -= 1;
  if (controls.reversing) dy += 1;
  if (controls.left) dx -= 1;
  if (controls.right) dx += 1;

  const oldX = player.x;
  const oldY = player.y;
  const moving = dx !== 0 || dy !== 0;
  const sprinting = controls.boost && moving && player.stamina > 1;
  const moveSpeed = sprinting ? 218 : 132;

  if (moving) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    player.x = clamp(player.x + dx * moveSpeed * dt, 24, world.width - 24);
    player.y = clamp(player.y + dy * moveSpeed * dt, 24, world.height - 24);
    player.angle = Math.atan2(dx, -dy);
    player.speed = moveSpeed;
  } else {
    player.speed = 0;
  }

  if (insideBuilding(player.x, player.y, 10)) {
    player.x = oldX;
    player.y = oldY;
    player.speed = 0;
  }

  if (sprinting) player.stamina = clamp(player.stamina - 34 * dt, 0, 100);
  else player.stamina = clamp(player.stamina + 24 * dt, 0, 100);
}

function updateTraffic(dt) {
  for (const car of traffic) {
    car.hitCooldown = Math.max(0, car.hitCooldown - dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;

    if (car.x < 40) car.x = world.width - 40;
    if (car.x > world.width - 40) car.x = 40;
    if (car.y < 40) car.y = world.height - 320;
    if (car.y > world.height - 300) car.y = 40;

    const hitDistance = player.mode === "car" ? 42 : 28;
    if (car.hitCooldown <= 0 && distance(player, car) < hitDistance) {
      if (player.mode === "car") {
        player.speed *= -0.22;
        car.speed *= -1;
        damagePlayer(12);
      } else if (Math.abs(car.speed) < 35) {
        const pushAngle = Math.atan2(player.x - car.x, -(player.y - car.y));
        player.x += Math.sin(pushAngle) * 10;
        player.y -= Math.cos(pushAngle) * 10;
        car.hitCooldown = 0.35;
        continue;
      } else {
        player.x -= Math.sin(car.angle) * 20;
        player.y += Math.cos(car.angle) * 20;
        damagePlayer(18);
      }
      addSparks((player.x + car.x) / 2, (player.y + car.y) / 2, 12);
      raiseHeat(1);
      car.hitCooldown = 1.1;
    }
  }
}

function updatePatrols(dt) {
  for (const patrol of patrols) {
    patrol.hitCooldown = Math.max(0, patrol.hitCooldown - dt);
    patrol.fireCooldown -= dt;
    if (patrol.stun > 0) {
      patrol.stun -= dt;
      patrol.speed *= 0.92;
      continue;
    }
    const active = player.wanted > 0;
    if (active) {
      turnToward(patrol, player, 2.4, dt);
      patrol.speed += 260 * dt;
      patrol.speed *= 0.988;
      patrol.speed = clamp(patrol.speed, 60, 380 + player.wanted * 22);
      policeShootAtPlayer(patrol, 560, 1.7, "patrol");
    } else {
      patrol.angle += Math.sin(performance.now() / 1000 + patrol.x) * 0.3 * dt;
      patrol.speed += 80 * dt;
      patrol.speed *= 0.965;
      patrol.speed = clamp(patrol.speed, 40, 135);
    }

    patrol.x = clamp(patrol.x + Math.sin(patrol.angle) * patrol.speed * dt, 40, world.width - 40);
    patrol.y = clamp(patrol.y - Math.cos(patrol.angle) * patrol.speed * dt, 40, world.height - 320);

    if (active && patrol.hitCooldown <= 0 && distance(player, patrol) < (player.mode === "car" ? 50 : 36)) {
      player.speed *= -0.34;
      patrol.speed *= -0.45;
      addSparks((player.x + patrol.x) / 2, (player.y + patrol.y) / 2, 18);
      damagePlayer(player.mode === "car" ? 14 : 25);
      if (player.mode === "foot") bustPlayer("Police caught you on foot.");
      patrol.hitCooldown = 1.1;
    }
  }
}

function updateOfficers(dt) {
  for (const officer of officers) {
    officer.hitCooldown = Math.max(0, officer.hitCooldown - dt);
    officer.fireCooldown -= dt;
    if (officer.stun > 0) {
      officer.stun -= dt;
      officer.speed = 0;
      continue;
    }
    const active = player.wanted > 0 && distance(player, officer) < 680;
    if (active) {
      turnToward(officer, player, 4.2, dt);
      officer.speed = player.mode === "foot" ? 132 : 86;
      policeShootAtPlayer(officer, 390, 1.25, "officer");
    } else {
      officer.wander -= dt;
      if (officer.wander <= 0) {
        officer.angle += rand(-1.8, 1.8);
        officer.wander = rand(0.6, 2.4);
      }
      officer.speed = 42;
    }

    const oldX = officer.x;
    const oldY = officer.y;
    officer.x = clamp(officer.x + Math.sin(officer.angle) * officer.speed * dt, 24, world.width - 24);
    officer.y = clamp(officer.y - Math.cos(officer.angle) * officer.speed * dt, 24, world.height - 300);
    if (insideBuilding(officer.x, officer.y, 12)) {
      officer.x = oldX;
      officer.y = oldY;
      officer.angle += Math.PI * 0.55;
    }

    if (player.wanted > 0 && officer.hitCooldown <= 0 && distance(player, officer) < 30) {
      if (player.mode === "foot") bustPlayer("Police caught you on foot.");
      else raiseHeat(1);
      officer.hitCooldown = 1;
    }
  }
}

function updatePedestrians(dt) {
  for (const person of pedestrians) {
    person.bumpCooldown = Math.max(0, person.bumpCooldown - dt);
    const closeToCar = player.mode === "car" && distance(player, person) < 130 && Math.abs(player.speed) > 120;
    if (closeToCar) {
      person.flee = 2.2;
      const away = Math.atan2(person.x - player.x, -(person.y - player.y));
      person.angle = away;
    }

    person.flee = Math.max(0, person.flee - dt);
    const oldX = person.x;
    const oldY = person.y;
    const walkSpeed = person.flee > 0 ? 118 : person.speed;
    person.x = clamp(person.x + Math.sin(person.angle) * walkSpeed * dt, 24, world.width - 24);
    person.y = clamp(person.y - Math.cos(person.angle) * walkSpeed * dt, 24, world.height - 300);

    if (insideBuilding(person.x, person.y, 12) || Math.random() < 0.006) {
      person.x = oldX;
      person.y = oldY;
      person.angle += rand(-1.8, 1.8);
    }

    if (person.bumpCooldown <= 0 && player.mode === "car" && distance(player, person) < 32 && Math.abs(player.speed) > 95) {
      person.flee = 3;
      person.x += Math.sin(person.angle) * 42;
      person.y -= Math.cos(person.angle) * 42;
      addSparks(person.x, person.y, 5, "rgba(255, 229, 150, 0.85)");
      raiseHeat(1);
      showNotice("Pedestrians are calling the police.", 2.4);
      person.bumpCooldown = 1.5;
    }
  }
}

function updateThief(dt) {
  if (thief.cooldown > 0) {
    thief.cooldown -= dt;
    if (thief.cooldown <= 0) spawnThief();
    return;
  }

  const targetIndex = nearestPickupIndex("cash");
  if (targetIndex >= 0) {
    const target = pickups[targetIndex];
    turnToward(thief, target, 3.6, dt);
    thief.speed = 124 + Math.min(90, thief.loot * 0.05);
    thief.x = clamp(thief.x + Math.sin(thief.angle) * thief.speed * dt, 24, world.width - 24);
    thief.y = clamp(thief.y - Math.cos(thief.angle) * thief.speed * dt, 24, world.height - 300);

    if (distance(thief, target) < 24) {
      thief.loot += target.value;
      stats.stolen += target.value;
      pickups.splice(targetIndex, 1);
      showNotice(`The stealer grabbed $${target.value}. Stop him for the bonus.`, 2.6);
    }
  } else {
    thief.angle += Math.sin(performance.now() / 600) * 0.8 * dt;
    thief.x += Math.sin(thief.angle) * 90 * dt;
    thief.y -= Math.cos(thief.angle) * 90 * dt;
  }

  if (insideBuilding(thief.x, thief.y, 16)) thief.angle += Math.PI * 0.8;

  if (player.mode === "car" && distance(player, thief) < 46 && Math.abs(player.speed) > 70) {
    stopThief("You clipped the stealer and recovered the loot.");
  }
}

function nearestPickupIndex(type) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < pickups.length; i++) {
    if (pickups[i].type !== type) continue;
    const d = distance(thief, pickups[i]);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function tryStopThief() {
  if (!running || thief.cooldown > 0) return;
  if (distance(player, thief) < 78) {
    stopThief("Stealer stopped.");
  } else {
    showNotice("Get closer to the stealer first.", 1.8);
  }
}

function stopThief(message) {
  const reward = 250 + thief.loot;
  player.cash += reward;
  stats.stopped += 1;
  addSparks(thief.x, thief.y, 22, "rgba(139, 212, 80, 0.92)");
  addFloatingText(`+$${reward}`, thief.x, thief.y - 30, "#8bd450");
  addScreenShake(5);
  showNotice(`${message} Recovered $${reward}.`, 3.2);
  thief.x = -1000;
  thief.y = -1000;
  thief.loot = 0;
  thief.cooldown = 5;
}

function disableOfficer(officer) {
  officer.stun = 6;
  officer.speed = 0;
  officer.hitCooldown = 1;
  stats.disabled += 1;
  addSparks(officer.x, officer.y, 12, "rgba(241, 197, 93, 0.9)");
  addFloatingText("stunned", officer.x, officer.y - 28, "#f1c55d");
}

function disablePatrol(patrol) {
  patrol.stun = 6.5;
  patrol.speed = 0;
  patrol.armor = 3;
  patrol.hitCooldown = 1;
  stats.disabled += 1;
  addSparks(patrol.x, patrol.y, 18, "rgba(241, 197, 93, 0.95)");
  addFloatingText("disabled", patrol.x, patrol.y - 36, "#f1c55d");
  addScreenShake(7);
}

function updatePickups() {
  for (let i = pickups.length - 1; i >= 0; i--) {
    if (distance(player, pickups[i]) < (player.mode === "car" ? 42 : 28)) {
      if (pickups[i].type === "repair") {
        player.health = clamp(player.health + pickups[i].value, 0, 100);
        showNotice("Repair kit collected.", 1.6);
        addFloatingText("+Health", pickups[i].x, pickups[i].y - 24, "#8bd450");
      } else if (pickups[i].type === "ammo") {
        player.ammo = clamp(player.ammo + pickups[i].value, 0, 60);
        showNotice(`Ammo collected +${pickups[i].value}.`, 1.6);
        addFloatingText(`+${pickups[i].value} ammo`, pickups[i].x, pickups[i].y - 24, "#4cc9f0");
      } else {
        player.cash += pickups[i].value;
        addFloatingText(`+$${pickups[i].value}`, pickups[i].x, pickups[i].y - 24, "#f1c55d");
      }
      pickups.splice(i, 1);
    }
  }

  while (pickups.length < 16) {
    const point = randomRoadPoint();
    const roll = Math.random();
    const type = roll < 0.18 ? "repair" : roll < 0.44 ? "ammo" : "cash";
    pickups.push({ x: point.x, y: point.y, type, value: pickupValue(type) });
  }
}

function updateWanted(dt) {
  player.heatCooldown -= dt;
  player.bustedCooldown -= dt;
  player.invulnerable -= dt;

  if (player.wanted <= 0) {
    player.escapeTimer = 0;
    return;
  }

  const nearestPolice = Math.min(
    ...patrols.map((patrol) => distance(player, patrol)),
    ...officers.map((officer) => distance(player, officer)),
  );
  if (nearestPolice > 520 && player.heatCooldown <= 0) {
    player.escapeTimer += dt;
    if (player.escapeTimer > 7.5) {
      player.wanted = Math.max(0, player.wanted - 1);
      player.escapeTimer = 0;
      showNotice("You shook off one heat level.", 2.2);
    }
  } else {
    player.escapeTimer = Math.max(0, player.escapeTimer - dt * 0.5);
  }
}

function raiseHeat(amount = 1) {
  if (player.heatCooldown <= 0) {
    player.wanted = clamp(player.wanted + amount, 0, 5);
    player.heatCooldown = 1.25;
  }
}

function damagePlayer(amount) {
  if (player.invulnerable > 0 || player.bustedCooldown > 0) return;
  player.health = clamp(player.health - amount, 0, 100);
  addScreenShake(clamp(amount * 0.55, 3, 12));
  addFloatingText(`-${amount}`, player.x, player.y - 34, "#ff5a5f");
  if (player.health <= 0) bustPlayer("Your ride is wrecked.");
}

function bustPlayer(reason) {
  if (player.bustedCooldown > 0) return;
  player.bustedCooldown = 2;
  player.cash = Math.max(0, player.cash - 300);
  player.health = 72;
  player.wanted = Math.max(0, player.wanted - 2);
  resetPlayer(false);
  showNotice(`${reason} Paid $300 and respawned.`, 3.2);
}

function turnToward(entity, target, rate, dt) {
  const targetAngle = Math.atan2(target.x - entity.x, -(target.y - entity.y));
  let delta = targetAngle - entity.angle;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  entity.angle += clamp(delta, -rate * dt, rate * dt);
}

function policeShootAtPlayer(entity, range, delay, source) {
  if (player.invulnerable > 0 || entity.fireCooldown > 0 || distance(player, entity) > range) return;
  const angle = Math.atan2(player.x - entity.x, -(player.y - entity.y));
  entity.fireCooldown = delay + rand(0.1, 0.55);
  createProjectile({
    owner: "police",
    source,
    x: entity.x + Math.sin(angle) * 22,
    y: entity.y - Math.cos(angle) * 22,
    angle,
    speed: source === "patrol" ? 690 : 610,
    life: 0.78,
    color: "#ff5a5f",
  });
}

function addSparks(x, y, count, color = "rgba(255, 231, 145, 0.95)") {
  if (!settings.effects) return;
  const scaledCount = Math.max(1, Math.round(count * qualityProfile().particles));
  for (let i = 0; i < scaledCount; i++) {
    sparks.push({
      x,
      y,
      vx: rand(-180, 180),
      vy: rand(-180, 180),
      life: rand(0.25, 0.75),
      maxLife: 0.75,
      color,
    });
  }
}

function addSkidMark(x, y, angle) {
  if (!settings.effects || settings.quality === "low") return;
  skidMarks.push({
    x,
    y,
    angle,
    life: 3.5,
    maxLife: 3.5,
    length: rand(18, 30),
  });
  if (skidMarks.length > 180) skidMarks.shift();
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const shot = projectiles[i];
    shot.life -= dt;
    shot.x += Math.sin(shot.angle) * shot.speed * dt;
    shot.y -= Math.cos(shot.angle) * shot.speed * dt;

    if (
      shot.life <= 0 ||
      shot.x < 0 ||
      shot.x > world.width ||
      shot.y < 0 ||
      shot.y > world.height ||
      insideBuilding(shot.x, shot.y, 4)
    ) {
      projectiles.splice(i, 1);
      continue;
    }

    if (shot.owner === "player" && resolvePlayerShot(shot)) {
      projectiles.splice(i, 1);
      continue;
    }

    if (shot.owner === "police" && distance(shot, player) < (player.mode === "car" ? 38 : 23)) {
      damagePlayer(shot.source === "patrol" ? 8 : 6);
      addSparks(shot.x, shot.y, 8, "rgba(255, 90, 95, 0.9)");
      projectiles.splice(i, 1);
    }
  }
}

function resolvePlayerShot(shot) {
  if (thief.cooldown <= 0 && distance(shot, thief) < 24) {
    stopThief("Stun shot stopped the stealer.");
    return true;
  }

  for (const officer of officers) {
    if (officer.stun <= 0 && distance(shot, officer) < 24) {
      disableOfficer(officer);
      showNotice("Officer disabled with stun shot.", 1.8);
      return true;
    }
  }

  for (const patrol of patrols) {
    if (patrol.stun > 0 || distance(shot, patrol) >= 36) continue;
    patrol.armor -= 1;
    addSparks(shot.x, shot.y, 10, "rgba(241, 197, 93, 0.95)");
    if (patrol.armor <= 0) {
      disablePatrol(patrol);
      showNotice("Police car disabled.", 1.8);
    }
    return true;
  }

  return false;
}

function updateParticles(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    sparks[i].x += sparks[i].vx * dt;
    sparks[i].y += sparks[i].vy * dt;
    sparks[i].life -= dt;
    if (sparks[i].life <= 0) sparks.splice(i, 1);
  }

  for (let i = skidMarks.length - 1; i >= 0; i--) {
    skidMarks[i].life -= dt;
    if (skidMarks[i].life <= 0) skidMarks.splice(i, 1);
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    floatingTexts[i].y += floatingTexts[i].vy * dt;
    floatingTexts[i].life -= dt;
    if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
  }

  camera.shake = Math.max(0, camera.shake - 24 * dt);
}

function updateMission(dt) {
  missionTimer -= dt;
  if (missionTimer <= 0) {
    raiseHeat(1);
    missionTimer = currentMission().time;
    showNotice("Mission timer expired. Heat increased.", 2.4);
  }

  const mission = currentMission();
  if (mission.title === "Mission: Quiet Escape" && player.wanted > 0) return;
  if (distance(player, mission.target) < (player.mode === "car" ? 72 : 42)) nextMission();
}

function updateWorld(dt) {
  if (!running) return;
  player.weaponCooldown = Math.max(0, player.weaponCooldown - dt);
  player.pulseCooldown = Math.max(0, player.pulseCooldown - dt);
  updatePlayer(dt);
  updateTraffic(dt);
  updatePatrols(dt);
  updateOfficers(dt);
  updatePedestrians(dt);
  updateThief(dt);
  updateProjectiles(dt);
  updatePickups();
  updateWanted(dt);
  updateMission(dt);
  updateParticles(dt);

  noticeTimer = Math.max(0, noticeTimer - dt);
}

function drawRoads() {
  ctx.fillStyle = "#1e2328";
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.fillStyle = "#24485c";
  ctx.fillRect(0, world.height - 270, world.width, 270);
  ctx.fillStyle = "#2d3138";
  ctx.fillRect(0, world.height - 330, world.width, 72);

  for (const park of parks) {
    ctx.fillStyle = "#244f3c";
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    for (let x = park.x + 28; x < park.x + park.w; x += 70) ctx.fillRect(x, park.y + 20, 9, park.h - 40);
    for (let y = park.y + 28; y < park.y + park.h; y += 70) ctx.fillRect(park.x + 20, y, park.w - 40, 9);
  }

  for (const zone of safeZones) {
    ctx.fillStyle = "#2d3339";
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.strokeStyle = "rgba(241, 197, 93, 0.55)";
    ctx.lineWidth = 4;
    ctx.strokeRect(zone.x + 8, zone.y + 8, zone.w - 16, zone.h - 16);
    ctx.fillStyle = "rgba(241, 197, 93, 0.22)";
    for (let x = zone.x + 26; x < zone.x + zone.w - 30; x += 36) {
      ctx.fillRect(x, zone.y + 30, 5, zone.h - 60);
    }
  }

  for (let x = 0; x < world.width; x += world.block) {
    ctx.fillStyle = "#3b3f45";
    ctx.fillRect(x, 0, world.road, world.height - 260);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let y = 40; y < world.height - 300; y += 80) ctx.fillRect(x + 46, y, 4, 34);
  }

  for (let y = 0; y < world.height - 260; y += world.block) {
    ctx.fillStyle = "#3b3f45";
    ctx.fillRect(0, y, world.width, world.road);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let x = 40; x < world.width; x += 80) ctx.fillRect(x, y + 46, 34, 4);
  }

  ctx.fillStyle = "rgba(255,255,255,0.26)";
  for (let x = 0; x < world.width; x += world.block) {
    for (let y = 0; y < world.height - 300; y += world.block) {
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(x + 108 + i * 22, y + 16, 13, 64);
        ctx.fillRect(x + 16, y + 108 + i * 22, 64, 13);
      }
    }
  }
}

function drawDecorations() {
  for (const item of decorations) {
    if (item.type === "tree") {
      ctx.fillStyle = "#15392c";
      ctx.beginPath();
      ctx.arc(item.x, item.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2f7c4f";
      ctx.beginPath();
      ctx.arc(item.x - 4, item.y - 4, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.type === "bench") {
      ctx.fillStyle = "#9d6b45";
      ctx.fillRect(item.x - 13, item.y - 4, 26, 8);
      ctx.fillStyle = "#5c4033";
      ctx.fillRect(item.x - 11, item.y + 5, 22, 4);
    } else {
      ctx.fillStyle = "rgba(255, 232, 154, 0.45)";
      ctx.beginPath();
      ctx.arc(item.x, item.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1b1d21";
      ctx.fillRect(item.x - 2, item.y - 14, 4, 28);
    }
  }
}

function drawBuildings() {
  for (const b of buildings) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(b.x + b.w - 18, b.y, 18, b.h);
    ctx.fillRect(b.x, b.y + b.h - 18, b.w, 18);
    ctx.fillStyle = "rgba(241,197,93,0.34)";
    for (let i = 0; i < b.windows; i++) {
      for (let j = 0; j < b.levels; j++) {
        ctx.fillRect(b.x + 18 + i * 30, b.y + 20 + j * 28, 10, 14);
      }
    }
  }
}

function drawCar(car, role = car.role || "traffic") {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  if (settings.effects && (role === "player" || role === "police")) {
    ctx.fillStyle = role === "police" ? "rgba(76, 201, 240, 0.13)" : "rgba(255, 238, 192, 0.15)";
    ctx.beginPath();
    ctx.moveTo(-11, -28);
    ctx.lineTo(-48, -142);
    ctx.lineTo(48, -142);
    ctx.lineTo(11, -28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fillRect(-20, -24, 40, 60);

  if (role === "police") {
    ctx.fillStyle = "#f5f7fa";
    ctx.fillRect(-17, -29, 34, 58);
    ctx.fillStyle = "#20242b";
    ctx.fillRect(-17, -4, 34, 14);
    ctx.fillStyle = "#ff4c5a";
    ctx.fillRect(-13, -11, 11, 5);
    ctx.fillStyle = "#4cc9f0";
    ctx.fillRect(2, -11, 11, 5);
  } else {
    ctx.fillStyle = role === "player" ? car.color || "#f1c55d" : car.color;
    ctx.fillRect(-17, -28, 34, 56);
  }

  ctx.fillStyle = role === "player" ? "#15171c" : "#c9e8ff";
  ctx.fillRect(-11, -18, 22, 17);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(-20, -20, 5, 13);
  ctx.fillRect(15, -20, 5, 13);
  ctx.fillRect(-20, 13, 5, 13);
  ctx.fillRect(15, 13, 5, 13);
  ctx.fillStyle = "#ffeec0";
  ctx.fillRect(-13, -31, 9, 5);
  ctx.fillRect(4, -31, 9, 5);
  if (car.stun > 0) {
    ctx.strokeStyle = "#f1c55d";
    ctx.lineWidth = 3;
    ctx.strokeRect(-22, -34, 44, 68);
  }
  ctx.restore();
}

function drawHuman(person, role = person.role || "pedestrian") {
  const colors = {
    player: { shirt: "#f1c55d", skin: "#f0c8a4", pants: "#22272e" },
    pedestrian: { shirt: person.shirt, skin: person.color, pants: "#26313d" },
    officer: { shirt: "#1f4d7a", skin: "#e2b68e", pants: "#172737" },
    thief: { shirt: "#ef476f", skin: "#d7a982", pants: "#211820" },
  };
  const palette = colors[role];
  ctx.save();
  ctx.translate(person.x, person.y);
  ctx.rotate(person.angle);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 5, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.pants;
  ctx.fillRect(-6, 2, 12, 16);
  ctx.fillStyle = palette.shirt;
  ctx.fillRect(-8, -12, 16, 18);
  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.arc(0, -19, 8, 0, Math.PI * 2);
  ctx.fill();
  if (role === "officer") {
    ctx.fillStyle = "#f1c55d";
    ctx.fillRect(-2, -7, 4, 4);
  }
  if (role === "thief") {
    ctx.fillStyle = "#191a1f";
    ctx.fillRect(7, -6, 9, 13);
  }
  if (person.stun > 0) {
    ctx.strokeStyle = "#f1c55d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -4, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMarkers() {
  const mission = currentMission();
  const pulse = 0.75 + Math.sin(performance.now() / 180) * 0.25;
  ctx.fillStyle = hexToRgba(mission.color, 0.26 + pulse * 0.22);
  ctx.beginPath();
  ctx.arc(mission.target.x, mission.target.y, 62 + pulse * 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = mission.color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(mission.target.x, mission.target.y, 54, 0, Math.PI * 2);
  ctx.stroke();

  for (const p of pickups) {
    ctx.fillStyle = p.type === "repair" ? "#8bd450" : p.type === "ammo" ? "#f1c55d" : "#4cc9f0";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111317";
    if (p.type === "repair") {
      ctx.fillRect(p.x - 8, p.y - 3, 16, 6);
      ctx.fillRect(p.x - 3, p.y - 8, 6, 16);
    } else if (p.type === "ammo") {
      ctx.fillRect(p.x - 7, p.y - 6, 14, 12);
      ctx.fillStyle = "#f1c55d";
      ctx.fillRect(p.x - 4, p.y - 3, 8, 6);
    } else {
      ctx.fillRect(p.x - 3, p.y - 8, 6, 16);
    }
  }
}

function drawSkidMarks() {
  for (const mark of skidMarks) {
    ctx.save();
    ctx.translate(mark.x, mark.y);
    ctx.rotate(mark.angle);
    ctx.globalAlpha = clamp((mark.life / mark.maxLife) * 0.34, 0, 0.34);
    ctx.fillStyle = "#0e1014";
    ctx.fillRect(-2, -mark.length / 2, 4, mark.length);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawWorldLabels() {
  if (!settings.labels) return;
  if (player.mode === "foot") {
    const entry = nearestEnterableCar(118);
    if (entry) {
      drawLabel("E", entry.car.x, entry.car.y - 58, entry.type === "police" ? "#4cc9f0" : "#f1c55d");
    }
  }

  const mission = currentMission();
  if (distance(player, mission.target) > 210) {
    drawLabel(`${Math.round(distance(player, mission.target) / 10)}m`, mission.target.x, mission.target.y - 82, mission.color);
  }

  for (const p of pickups) {
    if (distance(player, p) < 170) {
      const label = p.type === "repair" ? "repair" : p.type === "ammo" ? "ammo" : "$100";
      drawLabel(label, p.x, p.y - 28, p.type === "repair" ? "#8bd450" : p.type === "ammo" ? "#4cc9f0" : "#f1c55d");
    }
  }
}

function drawLabel(text, x, y, color) {
  ctx.save();
  ctx.font = "800 13px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + 18;
  ctx.fillStyle = "rgba(12, 14, 17, 0.76)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - 13, width, 26, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function drawMissionArrow() {
  const mission = currentMission();
  if (distance(player, mission.target) < 170) return;
  const angle = Math.atan2(mission.target.x - player.x, -(mission.target.y - player.y));
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(angle);
  ctx.fillStyle = mission.color;
  ctx.beginPath();
  ctx.moveTo(0, -98);
  ctx.lineTo(-14, -70);
  ctx.lineTo(14, -70);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const spark of sparks) {
    ctx.fillStyle = spark.color;
    ctx.globalAlpha = clamp(spark.life / spark.maxLife, 0, 1);
    ctx.fillRect(spark.x, spark.y, 4, 4);
    ctx.globalAlpha = 1;
  }
}

function drawFloatingTexts() {
  ctx.save();
  ctx.font = "900 18px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const item of floatingTexts) {
    ctx.globalAlpha = clamp(item.life / item.maxLife, 0, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillText(item.text, item.x + 2, item.y + 2);
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, item.x, item.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawProjectiles() {
  for (const shot of projectiles) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(shot.angle);
    ctx.fillStyle = shot.color;
    ctx.fillRect(-3, -12, 6, 20);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillRect(-1, -17, 2, 8);
    ctx.restore();
  }
}

function drawScreenEffects(width, height) {
  if (!settings.effects) return;
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.68);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  if (player.health < 34) {
    ctx.fillStyle = `rgba(255, 90, 95, ${(34 - player.health) / 220})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (player.wanted > 0) {
    const pulse = 0.035 + Math.sin(performance.now() / 160) * 0.02;
    ctx.fillStyle = `rgba(255, 90, 95, ${pulse * player.wanted})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawMinimap() {
  const w = 184;
  const h = 138;
  const x = Math.max(12, window.innerWidth - w - 24);
  const y = Math.max(92, window.innerHeight - h - 92);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#101317";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#f1c55d";
  ctx.fillRect(x + (player.x / world.width) * w - 3, y + (player.y / world.height) * h - 3, 6, 6);
  ctx.fillStyle = currentMission().color;
  const target = currentMission().target;
  ctx.fillRect(x + (target.x / world.width) * w - 4, y + (target.y / world.height) * h - 4, 8, 8);
  ctx.fillStyle = "#ef476f";
  ctx.fillRect(x + (thief.x / world.width) * w - 3, y + (thief.y / world.height) * h - 3, 6, 6);
  ctx.fillStyle = "#ff5a5f";
  for (const patrol of patrols) {
    ctx.fillRect(x + (patrol.x / world.width) * w - 2, y + (patrol.y / world.height) * h - 2, 4, 4);
  }
  ctx.restore();
}

function render() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.clearRect(0, 0, width, height);
  const lookAhead = player.mode === "car" ? Math.min(Math.abs(player.speed), 360) * 0.18 : 0;
  const maxCameraX = Math.max(0, world.width - width);
  const maxCameraY = Math.max(0, world.height - height);
  const targetX = clamp(player.x - width / 2 + Math.sin(player.angle) * lookAhead, 0, maxCameraX);
  const targetY = clamp(player.y - height / 2 - Math.cos(player.angle) * lookAhead, 0, maxCameraY);
  camera.x += (targetX - camera.x) * 0.14;
  camera.y += (targetY - camera.y) * 0.14;
  const shakeX = camera.shake > 0 ? rand(-camera.shake, camera.shake) : 0;
  const shakeY = camera.shake > 0 ? rand(-camera.shake, camera.shake) : 0;

  ctx.save();
  ctx.translate(-camera.x + shakeX, -camera.y + shakeY);
  drawRoads();
  drawSkidMarks();
  drawDecorations();
  drawBuildings();
  drawMarkers();
  for (const person of pedestrians) drawHuman(person, "pedestrian");
  for (const officer of officers) drawHuman(officer, "officer");
  if (thief.cooldown <= 0) drawHuman(thief, "thief");
  for (const car of traffic) drawCar(car);
  for (const patrol of patrols) drawCar(patrol, "police");
  drawCar(vehicle, "player");
  if (player.mode === "foot") drawHuman(player, "player");
  drawProjectiles();
  drawMissionArrow();
  drawWorldLabels();
  drawParticles();
  drawFloatingTexts();
  ctx.restore();

  drawScreenEffects(width, height);
  drawMinimap();
  updateHud();
}

function updateHud() {
  const mission = currentMission();
  const stars = "*".repeat(player.wanted).padEnd(5, "-");
  ui.cash.textContent = `$${player.cash}`;
  ui.wanted.textContent = `Wanted ${stars}`;
  ui.health.textContent = `Health ${Math.round(player.health)}`;
  ui.ammo.textContent = `Ammo ${player.ammo}`;
  ui.health.style.setProperty("--level", `${player.health}%`);
  ui.ammo.style.setProperty("--level", `${(player.ammo / 60) * 100}%`);
  ui.status.style.setProperty("--level", `${player.mode === "car" ? player.stamina : player.pulseCooldown > 0 ? 18 : 100}%`);
  ui.status.textContent =
    player.mode === "car"
      ? `${vehicle.stolen ? "Taken car" : "Car"} | Boost ${Math.round(player.stamina)}`
      : `On foot | Pulse ${player.pulseCooldown > 0 ? "wait" : "ready"}`;
  ui.speed.textContent =
    player.mode === "car" ? `${Math.round(Math.abs(player.speed))} km/h` : `${Math.round(player.speed)} pace`;
  ui.missionTitle.textContent = mission.title;
  ui.missionText.textContent = `${mission.text} ${Math.ceil(missionTimer)}s`;
  ui.notice.textContent =
    noticeTimer > 0
      ? noticeMessage
      : `Stealer loot $${thief.loot} | Disabled ${stats.disabled} | Stolen $${stats.stolen}`;
}

function hexToRgba(hex, alpha) {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  updateWorld(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["z", "q", "s", "d", "w", "a", "j", "f", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift"].includes(key)) {
    event.preventDefault();
  }
  keys.add(key);
  if (event.repeat) return;
  if (key === "escape") ui.settingsOverlay.classList.add("hidden");
  if (key === "r") resetPlayer();
  if (key === "e") toggleVehicle();
  if (key === "f") pulseHit();
  if (key === "j") shootWeapon();
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = event.clientX - rect.left;
  mouse.y = event.clientY - rect.top;
  mouse.active = true;
});
canvas.addEventListener("mouseleave", () => {
  mouse.active = false;
});
canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0) {
    event.preventDefault();
    shootWeapon();
  }
});
ui.start.addEventListener("click", () => {
  running = true;
  ui.overlay.classList.add("hidden");
  showNotice("Protect cash, complete missions, and keep police heat low.", 3.5);
});
ui.settingsButton.addEventListener("click", () => {
  syncSettingsUi();
  ui.settingsOverlay.classList.remove("hidden");
});
ui.startSettings.addEventListener("click", () => {
  syncSettingsUi();
  ui.settingsOverlay.classList.remove("hidden");
});
ui.closeSettings.addEventListener("click", () => ui.settingsOverlay.classList.add("hidden"));
ui.settingsOverlay.addEventListener("click", (event) => {
  if (event.target === ui.settingsOverlay) ui.settingsOverlay.classList.add("hidden");
});
ui.qualityButtons.forEach((button) => {
  button.addEventListener("click", () => setQuality(button.dataset.quality));
});
ui.controlButtons.forEach((button) => {
  button.addEventListener("click", () => setControlLayout(button.dataset.controls));
});
ui.effectsToggle.addEventListener("change", () => {
  settings.effects = ui.effectsToggle.checked;
  syncSettingsUi();
  saveSettings();
});
ui.labelsToggle.addEventListener("change", () => {
  settings.labels = ui.labelsToggle.checked;
  syncSettingsUi();
  saveSettings();
});
ui.mouseAimToggle.addEventListener("change", () => {
  settings.mouseAim = ui.mouseAimToggle.checked;
  syncSettingsUi();
  saveSettings();
});

buildCity();
syncSettingsUi();
spawnTraffic();
spawnPatrols();
spawnOfficers();
spawnPedestrians();
spawnPickups();
spawnThief();
resizeCanvas();
requestAnimationFrame(loop);

// ================= NPC FEATURES =================

// --- NPC Types ---
function assignNPCType(npc) {
  const r = Math.random();
  if (r < 0.9) {
    npc.type = "fighter";
    npc.canKick = true;
  } else if (r < 0.95) {
    npc.type = "heavy";
    npc.weapon = "heavy";
  } else {
    npc.type = "civilian";
    npc.weapon = "simple";
  }
  // assign health based on type
  npc.health = npc.type === "heavy" ? 40 : npc.type === "fighter" ? 25 : 15;
}

// Wrap spawnPedestrians to assign NPC types after spawning
const _origSpawnPedestrians = spawnPedestrians;
spawnPedestrians = function () {
  _origSpawnPedestrians();
  for (const p of pedestrians) assignNPCType(p);
};

// --- NPC Fight System ---
function npcAttackPlayer(npc) {
  if (distance(npc, player) < 40) {
    const damage = npc.type === "fighter" ? 5 : npc.type === "heavy" ? 12 : 2;
    damagePlayer(damage);
    addFloatingText(`-${damage}`, player.x, player.y - 20, "#ff0000");
  }
}

const _origUpdatePedestrians = updatePedestrians;
updatePedestrians = function (dt) {
  _origUpdatePedestrians(dt);
  for (const p of pedestrians) {
    if (p.type === "fighter" || p.type === "heavy") npcAttackPlayer(p);
  }
};

// --- NPC Kill & Respawn ---
function killNPC(index) {
  const p = pedestrians[index];
  addFloatingText("KO", p.x, p.y - 20, "#ff4444");
  pedestrians.splice(index, 1);
  setTimeout(spawnOneNPC, 3000);
}

function spawnOneNPC() {
  const point = randomWalkPoint();
  const npc = {
    x: point.x, y: point.y,
    angle: rand(0, Math.PI * 2),
    speed: rand(24, 58),
    flee: 0, bumpCooldown: 0,
    role: "pedestrian",
  };
  assignNPCType(npc);
  pedestrians.push(npc);
}

// Wrap resolvePlayerShot to damage NPCs
const _origResolvePlayerShot = resolvePlayerShot;
resolvePlayerShot = function (shot) {
  for (let i = 0; i < pedestrians.length; i++) {
    const p = pedestrians[i];
    if (distance(shot, p) < 20) {
      p.health -= 10;
      if (p.health <= 0) killNPC(i);
      return true;
    }
  }
  return _origResolvePlayerShot(shot);
};

// --- Mission NPC ---
const missionNPC = { x: 500, y: 500, role: "mission_giver" };
let missionAccepted = false;

function checkMissionNPCInteraction() {
  if (distance(player, missionNPC) < 60 && keys.has("e")) {
    missionAccepted = !missionAccepted;
    showNotice(missionAccepted ? "Mission accepted!" : "Mission rejected.", 2);
  }
}

// --- Smarter Police ---
const _origUpdatePatrols = updatePatrols;
updatePatrols = function (dt) {
  _origUpdatePatrols(dt);
  if (player.wanted > 0) {
    for (const patrol of patrols) patrol.speed = Math.min(patrol.speed * 1.005, 280);
  }
};

// --- Prevent NPCs entering buildings ---
function forceOutsideBuildings(entity) {
  if (insideBuilding(entity.x, entity.y, 10)) {
    const point = randomWalkPoint();
    entity.x = point.x;
    entity.y = point.y;
  }
}

const _origUpdateOfficers = updateOfficers;
updateOfficers = function (dt) {
  _origUpdateOfficers(dt);
  for (const o of officers) forceOutsideBuildings(o);
};

// --- Draw Mission NPC ---
const _origDrawDecorations = drawDecorations;
drawDecorations = function () {
  _origDrawDecorations();
  ctx.fillStyle = "#00ffcc";
  ctx.beginPath();
  ctx.arc(missionNPC.x, missionNPC.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText("M", missionNPC.x - 4, missionNPC.y + 4);
};

// --- Maintain NPC Population & Hook World Update ---
const _origUpdateWorld = updateWorld;
updateWorld = function (dt) {
  _origUpdateWorld(dt);
  checkMissionNPCInteraction();
  if (pedestrians.length < 60) spawnOneNPC();
};

// ================= END NPC FEATURES =================
// ===== MOBILE JOYSTICK =====
const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");

let joyActive = false;
let joyX = 0;
let joyY = 0;

joystick.addEventListener("touchstart", () => joyActive = true);

joystick.addEventListener("touchmove", (e) => {
  const rect = joystick.getBoundingClientRect();
  const touch = e.touches[0];

  let x = touch.clientX - rect.left - 60;
  let y = touch.clientY - rect.top - 60;

  const dist = Math.hypot(x, y);
  const max = 40;

  if (dist > max) {
    x = (x / dist) * max;
    y = (y / dist) * max;
  }

  stick.style.transform = `translate(${x}px, ${y}px)`;

  joyX = x / max;
  joyY = y / max;
});

joystick.addEventListener("touchend", () => {
  joyActive = false;
  joyX = 0;
  joyY = 0;
  stick.style.transform = `translate(0px, 0px)`;
});
// AIM
const aimZone = document.getElementById("aimZone");

aimZone.addEventListener("touchmove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];

  mouse.x = touch.clientX - rect.left;
  mouse.y = touch.clientY - rect.top;
  mouse.active = true;
});

// SHOOT
document.getElementById("shootBtn").addEventListener("touchstart", (e) => {
  e.preventDefault();
  shootWeapon();
});