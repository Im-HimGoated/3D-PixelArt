const GRID = 16;
const MAX_LAYER = 15;
const STORAGE_KEY = "voxel-pop-studio-art";

const canvas = document.getElementById("voxelCanvas");
const ctx = canvas.getContext("2d");

const state = {
  voxels: new Map(),
  currentColor: "#38bdf8",
  tool: "brush",
  layer: 0,
  angle: 45,
  zoom: 52,
  panX: 0,
  panY: 18,
  mirror: "none",
  showGrid: true,
  shade: true,
  hover: null,
  drag: null,
  history: [],
  future: [],
  palette: ["#38bdf8", "#fb7185", "#84cc16", "#f59e0b", "#a78bfa", "#f8fafc", "#1f2937", "#ef4444", "#22c55e", "#facc15"]
};

const els = {
  saveStatus: document.getElementById("saveStatus"),
  toolReadout: document.getElementById("toolReadout"),
  cubeCount: document.getElementById("cubeCount"),
  colorInput: document.getElementById("colorInput"),
  palette: document.getElementById("palette"),
  layerRange: document.getElementById("layerRange"),
  layerValue: document.getElementById("layerValue"),
  zoomRange: document.getElementById("zoomRange"),
  angleRange: document.getElementById("angleRange"),
  templateSelect: document.getElementById("templateSelect")
};

function keyOf(x, y, z) {
  return `${x},${y},${z}`;
}

function parseKey(key) {
  return key.split(",").map(Number);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(640, Math.floor(rect.width * scale));
  canvas.height = Math.max(420, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  draw();
}

function center() {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width / 2 + state.panX,
    y: rect.height / 2 + state.panY
  };
}

function rotatePoint(x, z) {
  const a = state.angle * Math.PI / 180;
  const cx = x - (GRID - 1) / 2;
  const cz = z - (GRID - 1) / 2;
  return {
    x: cx * Math.cos(a) - cz * Math.sin(a),
    z: cx * Math.sin(a) + cz * Math.cos(a)
  };
}

function project(x, y, z) {
  const r = rotatePoint(x, z);
  const c = center();
  return {
    x: c.x + (r.x - r.z) * state.zoom * 0.5,
    y: c.y + (r.x + r.z) * state.zoom * 0.26 - y * state.zoom * 0.55
  };
}

function cubeFaces(x, y, z) {
  const p000 = project(x, y, z);
  const p100 = project(x + 1, y, z);
  const p010 = project(x, y + 1, z);
  const p110 = project(x + 1, y + 1, z);
  const p001 = project(x, y, z + 1);
  const p101 = project(x + 1, y, z + 1);
  const p011 = project(x, y + 1, z + 1);
  const p111 = project(x + 1, y + 1, z + 1);

  return {
    top: [p010, p110, p111, p011],
    left: [p000, p010, p011, p001],
    right: [p100, p101, p111, p110],
    footprint: [p000, p100, p101, p001]
  };
}

function shadeColor(hex, amount) {
  if (!state.shade) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawPoly(points, fill, stroke = "rgba(27, 36, 48, 0.16)") {
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGrid() {
  if (!state.showGrid) return;
  for (let x = 0; x < GRID; x += 1) {
    for (let z = 0; z < GRID; z += 1) {
      const faces = cubeFaces(x, state.layer, z);
      drawPoly(faces.footprint, "rgba(255, 255, 255, 0.36)", "rgba(70, 91, 104, 0.14)");
    }
  }
}

function drawCube(x, y, z, color) {
  const faces = cubeFaces(x, y, z);
  drawPoly(faces.left, shadeColor(color, -34));
  drawPoly(faces.right, shadeColor(color, -18));
  drawPoly(faces.top, shadeColor(color, 18), "rgba(27, 36, 48, 0.18)");
}

function sortedVoxels() {
  return [...state.voxels.entries()]
    .map(([key, color]) => ({ key, color, pos: parseKey(key) }))
    .sort((a, b) => {
      const ar = rotatePoint(a.pos[0], a.pos[2]);
      const br = rotatePoint(b.pos[0], b.pos[2]);
      return (ar.x + ar.z + a.pos[1] * 0.01) - (br.x + br.z + b.pos[1] * 0.01);
    });
}

function drawHover() {
  if (!state.hover) return;
  const { x, z } = state.hover;
  const faces = cubeFaces(x, state.layer, z);
  const fill = state.tool === "erase" ? "rgba(251, 113, 133, 0.32)" : "rgba(56, 189, 248, 0.28)";
  drawPoly(faces.top, fill, "rgba(23, 32, 51, 0.46)");
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  drawGrid();
  sortedVoxels().forEach(({ pos, color }) => drawCube(pos[0], pos[1], pos[2], color));
  drawHover();
}

function pointInPoly(point, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const hit = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 0.0001) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function cellAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const point = { x: clientX - rect.left, y: clientY - rect.top };
  const candidates = [];
  for (let x = 0; x < GRID; x += 1) {
    for (let z = 0; z < GRID; z += 1) {
      const top = cubeFaces(x, state.layer, z).footprint;
      if (pointInPoly(point, top)) {
        const r = rotatePoint(x, z);
        candidates.push({ x, z, depth: r.x + r.z });
      }
    }
  }
  candidates.sort((a, b) => b.depth - a.depth);
  return candidates[0] || null;
}

function snapshot() {
  return JSON.stringify([...state.voxels.entries()]);
}

function restore(snapshotText) {
  state.voxels = new Map(JSON.parse(snapshotText));
}

function pushHistory() {
  state.history.push(snapshot());
  if (state.history.length > 80) state.history.shift();
  state.future = [];
}

function mirrorCells(x, y, z) {
  const cells = [{ x, y, z }];
  if (state.mirror === "x" || state.mirror === "both") cells.push({ x: GRID - 1 - x, y, z });
  if (state.mirror === "z" || state.mirror === "both") cells.push({ x, y, z: GRID - 1 - z });
  if (state.mirror === "both") cells.push({ x: GRID - 1 - x, y, z: GRID - 1 - z });
  const seen = new Set();
  return cells.filter((cell) => {
    const key = keyOf(cell.x, cell.y, cell.z);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function paintCell(cell, record = true) {
  if (!cell) return;
  if (record) pushHistory();
  mirrorCells(cell.x, state.layer, cell.z).forEach(({ x, y, z }) => {
    const key = keyOf(x, y, z);
    if (state.tool === "erase") state.voxels.delete(key);
    if (state.tool === "brush") state.voxels.set(key, state.currentColor);
    if (state.tool === "picker") {
      const picked = state.voxels.get(key);
      if (picked) setColor(picked);
    }
  });
  updateReadouts();
  draw();
}

function fillLayer(cell) {
  if (!cell) return;
  pushHistory();
  const target = state.voxels.get(keyOf(cell.x, state.layer, cell.z)) || null;
  const stack = [cell];
  const seen = new Set();
  while (stack.length) {
    const next = stack.pop();
    const key = keyOf(next.x, state.layer, next.z);
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = state.voxels.get(key) || null;
    if (existing !== target) continue;
    state.voxels.set(key, state.currentColor);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
      const x = next.x + dx;
      const z = next.z + dz;
      if (x >= 0 && x < GRID && z >= 0 && z < GRID) stack.push({ x, z });
    });
  }
  updateReadouts();
  draw();
}

function handlePaint(clientX, clientY) {
  const cell = cellAt(clientX, clientY);
  state.hover = cell;
  if (!cell) {
    draw();
    return;
  }
  if (state.tool === "fill") fillLayer(cell);
  else paintCell(cell);
}

function setColor(color) {
  state.currentColor = color;
  els.colorInput.value = color;
  renderPalette();
}

function renderPalette() {
  els.palette.innerHTML = "";
  state.palette.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = `swatch${color.toLowerCase() === state.currentColor.toLowerCase() ? " active" : ""}`;
    btn.style.background = color;
    btn.title = color;
    btn.setAttribute("aria-label", color);
    btn.addEventListener("click", () => setColor(color));
    els.palette.appendChild(btn);
  });
}

function updateReadouts() {
  const toolName = state.tool.charAt(0).toUpperCase() + state.tool.slice(1);
  els.toolReadout.textContent = toolName;
  els.cubeCount.textContent = `${state.voxels.size} cube${state.voxels.size === 1 ? "" : "s"}`;
  els.layerValue.textContent = String(state.layer + 1);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function saveArt() {
  const data = {
    voxels: [...state.voxels.entries()],
    palette: state.palette,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  els.saveStatus.textContent = "Saved locally";
}

function loadArt() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    els.saveStatus.textContent = "No saved artwork";
    return;
  }
  const data = JSON.parse(saved);
  pushHistory();
  state.voxels = new Map(data.voxels || []);
  state.palette = data.palette || state.palette;
  els.saveStatus.textContent = "Loaded";
  renderPalette();
  updateReadouts();
  draw();
}

function exportPng() {
  const link = document.createElement("a");
  link.download = "voxel-pop-art.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function cubeObj(x, y, z, index) {
  const verts = [
    [x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z],
    [x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]
  ];
  const faces = [[1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 8, 4], [5, 1, 4, 8]];
  return {
    vertices: verts.map((v) => `v ${v[0]} ${v[1]} ${v[2]}`).join("\n"),
    faces: faces.map((face) => `f ${face.map((n) => n + index).join(" ")}`).join("\n")
  };
}

function exportObj() {
  let obj = "# 3D-pixel art OBJ\n";
  let offset = 0;
  state.voxels.forEach((color, key) => {
    const [x, y, z] = parseKey(key);
    const cube = cubeObj(x, y, z, offset);
    obj += `\n# ${color}\n${cube.vertices}\n${cube.faces}\n`;
    offset += 8;
  });
  download("voxel-pop-art.obj", obj, "text/plain");
}

function clearArt() {
  if (!state.voxels.size) return;
  pushHistory();
  state.voxels.clear();
  updateReadouts();
  draw();
}

function undo() {
  if (!state.history.length) return;
  state.future.push(snapshot());
  restore(state.history.pop());
  updateReadouts();
  draw();
}

function redo() {
  if (!state.future.length) return;
  state.history.push(snapshot());
  restore(state.future.pop());
  updateReadouts();
  draw();
}

function addVoxel(x, y, z, color) {
  state.voxels.set(keyOf(x, y, z), color);
}

function loadTemplate(name) {
  pushHistory();
  state.voxels.clear();
  if (name === "character") {
    for (let y = 0; y < 6; y += 1) for (let x = 6; x <= 9; x += 1) addVoxel(x, y, 8, "#38bdf8");
    [[6, 6], [7, 6], [8, 6], [9, 6], [7, 7], [8, 7]].forEach(([x, y]) => addVoxel(x, y, 8, "#facc15"));
    addVoxel(7, 7, 7, "#1f2937");
    addVoxel(8, 7, 7, "#1f2937");
    addVoxel(5, 3, 8, "#fb7185");
    addVoxel(10, 3, 8, "#fb7185");
  }
  if (name === "item") {
    for (let y = 0; y < 8; y += 1) addVoxel(8, y, 8, "#a78bfa");
    for (let x = 5; x <= 11; x += 1) addVoxel(x, 5, 8, "#f59e0b");
    addVoxel(8, 8, 8, "#f8fafc");
  }
  if (name === "building") {
    for (let y = 0; y < 5; y += 1) {
      for (let x = 5; x <= 10; x += 1) {
        for (let z = 5; z <= 10; z += 1) {
          if (x === 5 || x === 10 || z === 5 || z === 10) addVoxel(x, y, z, "#84cc16");
        }
      }
    }
    for (let x = 4; x <= 11; x += 1) for (let z = 4; z <= 11; z += 1) addVoxel(x, 5, z, "#ef4444");
  }
  els.saveStatus.textContent = name === "blank" ? "Blank" : "Template ready";
  updateReadouts();
  draw();
}

document.querySelectorAll(".tool").forEach((button) => {
  button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    document.querySelectorAll(".tool").forEach((b) => b.classList.toggle("active", b === button));
    updateReadouts();
  });
});

document.querySelectorAll(".mirror").forEach((button) => {
  button.addEventListener("click", () => {
    state.mirror = button.dataset.mirror;
    document.querySelectorAll(".mirror").forEach((b) => b.classList.toggle("active", b === button));
  });
});

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  if (event.button === 1 || event.shiftKey || event.metaKey || event.ctrlKey) {
    state.drag = { type: "pan", x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
  } else if (event.altKey) {
    state.drag = { type: "orbit", x: event.clientX, angle: state.angle };
  } else {
    state.drag = { type: "paint" };
    handlePaint(event.clientX, event.clientY);
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (state.drag?.type === "pan") {
    state.panX = state.drag.panX + event.clientX - state.drag.x;
    state.panY = state.drag.panY + event.clientY - state.drag.y;
    draw();
    return;
  }
  if (state.drag?.type === "orbit") {
    state.angle = (state.drag.angle + (event.clientX - state.drag.x) * 0.6 + 360) % 360;
    els.angleRange.value = String(Math.round(state.angle));
    draw();
    return;
  }
  const cell = cellAt(event.clientX, event.clientY);
  state.hover = cell;
  if (state.drag?.type === "paint" && state.tool !== "fill" && state.tool !== "picker") paintCell(cell);
  else draw();
});

canvas.addEventListener("pointerup", (event) => {
  canvas.releasePointerCapture(event.pointerId);
  state.drag = null;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.zoom = Math.max(34, Math.min(78, state.zoom - Math.sign(event.deltaY) * 4));
  els.zoomRange.value = String(state.zoom);
  draw();
}, { passive: false });

els.colorInput.addEventListener("input", (event) => setColor(event.target.value));
document.getElementById("addColorBtn").addEventListener("click", () => {
  if (!state.palette.includes(state.currentColor)) state.palette.unshift(state.currentColor);
  state.palette = state.palette.slice(0, 15);
  renderPalette();
});
document.getElementById("saveBtn").addEventListener("click", saveArt);
document.getElementById("loadBtn").addEventListener("click", loadArt);
document.getElementById("pngBtn").addEventListener("click", exportPng);
document.getElementById("objBtn").addEventListener("click", exportObj);
document.getElementById("undoBtn").addEventListener("click", undo);
document.getElementById("redoBtn").addEventListener("click", redo);
document.getElementById("clearBtn").addEventListener("click", clearArt);
document.getElementById("gridBtn").addEventListener("click", (event) => {
  state.showGrid = !state.showGrid;
  event.currentTarget.classList.toggle("active", state.showGrid);
  draw();
});
document.getElementById("shadowBtn").addEventListener("click", (event) => {
  state.shade = !state.shade;
  event.currentTarget.classList.toggle("active", state.shade);
  draw();
});
document.getElementById("layerDown").addEventListener("click", () => {
  state.layer = Math.max(0, state.layer - 1);
  els.layerRange.value = String(state.layer);
  updateReadouts();
  draw();
});
document.getElementById("layerUp").addEventListener("click", () => {
  state.layer = Math.min(MAX_LAYER, state.layer + 1);
  els.layerRange.value = String(state.layer);
  updateReadouts();
  draw();
});
els.layerRange.addEventListener("input", (event) => {
  state.layer = Number(event.target.value);
  updateReadouts();
  draw();
});
els.zoomRange.addEventListener("input", (event) => {
  state.zoom = Number(event.target.value);
  draw();
});
els.angleRange.addEventListener("input", (event) => {
  state.angle = Number(event.target.value);
  draw();
});
document.getElementById("templateBtn").addEventListener("click", () => loadTemplate(els.templateSelect.value));

window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select")) return;
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  }
  if (key === "b") document.querySelector('[data-tool="brush"]').click();
  if (key === "e") document.querySelector('[data-tool="erase"]').click();
  if (key === "f") document.querySelector('[data-tool="fill"]').click();
  if (key === "p") document.querySelector('[data-tool="picker"]').click();
  if (key === "[" || key === "-") document.getElementById("layerDown").click();
  if (key === "]" || key === "=") document.getElementById("layerUp").click();
});

window.addEventListener("resize", resizeCanvas);
renderPalette();
updateReadouts();
resizeCanvas();
