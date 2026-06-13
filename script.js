const GRID = 16;
const MAX_LAYER = 15;
const STORAGE_KEY = "voxel-pop-studio-art";
const DESIGNS_STORAGE_KEY = "voxel-pop-studio-designs";

const canvas = document.getElementById("voxelCanvas");
const ctx = canvas.getContext("2d");

const state = {
  voxels: new Map(),
  currentColor: "#38bdf8",
  tool: "brush",
  layer: 0,
  angle: 45,
  pitch: 32,
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
  currentDesignId: null,
  designName: "Untitled design",
  designs: [],
  palette: ["#ef4444", "#fb7185", "#f59e0b", "#facc15", "#84cc16", "#22c55e", "#38bdf8", "#a78bfa", "#1f2937", "#f8fafc"]
};

const els = {
  saveStatus: document.getElementById("saveStatus"),
  toolReadout: document.getElementById("toolReadout"),
  layerReadout: document.getElementById("layerReadout"),
  cubeCount: document.getElementById("cubeCount"),
  colorInput: document.getElementById("colorInput"),
  palette: document.getElementById("palette"),
  dashboard: document.getElementById("dashboard"),
  designName: document.getElementById("designName"),
  designGrid: document.getElementById("designGrid"),
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
  const pitch = state.pitch * Math.PI / 180;
  const groundScale = 0.12 + Math.sin(pitch) * 0.26;
  const heightScale = 0.34 + Math.cos(pitch) * 0.26;
  const layerFocus = state.layer * heightScale * 0.72;
  return {
    x: c.x + (r.x - r.z) * state.zoom * 0.5,
    y: c.y + (r.x + r.z) * state.zoom * groundScale + layerFocus * state.zoom - y * state.zoom * heightScale
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
    xMin: [p000, p010, p011, p001],
    xMax: [p100, p101, p111, p110],
    zMin: [p000, p100, p110, p010],
    zMax: [p001, p011, p111, p101],
    footprint: [p000, p100, p101, p001]
  };
}

function depthAt(x, y, z) {
  const r = rotatePoint(x, z);
  return r.x + r.z + y * 0.01;
}

function visibleSideFaces(faces, x, y, z, color) {
  const a = state.angle * Math.PI / 180;
  const xFacing = Math.cos(a) + Math.sin(a) >= 0 ? "xMax" : "xMin";
  const zFacing = Math.cos(a) - Math.sin(a) >= 0 ? "zMax" : "zMin";
  const sideConfig = {
    xMin: { center: [x, y + 0.5, z + 0.5], shade: -34 },
    xMax: { center: [x + 1, y + 0.5, z + 0.5], shade: -22 },
    zMin: { center: [x + 0.5, y + 0.5, z], shade: -34 },
    zMax: { center: [x + 0.5, y + 0.5, z + 1], shade: -22 }
  };

  return [...new Set([xFacing, zFacing])]
    .map((name) => ({ name, ...sideConfig[name] }))
    .sort((aFace, bFace) => depthAt(...aFace.center) - depthAt(...bFace.center))
    .map((face) => ({ points: faces[face.name], fill: shadeColor(color, face.shade) }));
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

function drawLine(from, to, stroke, width = 1, dash = []) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function drawGrid() {
  if (!state.showGrid) return;
  if (state.layer > 0) {
    for (let x = 0; x < GRID; x += 1) {
      for (let z = 0; z < GRID; z += 1) {
        const faces = cubeFaces(x, 0, z);
        drawPoly(faces.footprint, "rgba(255, 255, 255, 0.1)", "rgba(70, 91, 104, 0.08)");
      }
    }
  }
  for (let x = 0; x < GRID; x += 1) {
    for (let z = 0; z < GRID; z += 1) {
      const faces = cubeFaces(x, state.layer, z);
      drawPoly(faces.footprint, "rgba(255, 255, 255, 0.42)", "rgba(27, 36, 48, 0.22)");
    }
  }
}

function drawCube(x, y, z, color) {
  const faces = cubeFaces(x, y, z);
  visibleSideFaces(faces, x, y, z, color).forEach((face) => drawPoly(face.points, face.fill));
  drawPoly(faces.top, shadeColor(color, 18), "rgba(27, 36, 48, 0.18)");
}

function drawLayerGuide() {
  if (state.layer > 0) {
    const scaffoldPoints = [
      [0, 0],
      [GRID, 0],
      [GRID, GRID],
      [0, GRID],
      [GRID / 2, 0],
      [GRID, GRID / 2],
      [GRID / 2, GRID],
      [0, GRID / 2]
    ];
    scaffoldPoints.forEach(([x, z]) => {
      drawLine(project(x, 0, z), project(x, state.layer, z), "rgba(23, 32, 51, 0.26)", 1.25, [5, 6]);
    });
  }

  const baseCorners = [
    project(0, 0, 0),
    project(GRID, 0, 0),
    project(GRID, 0, GRID),
    project(0, 0, GRID)
  ];
  drawPoly(baseCorners, "rgba(255, 255, 255, 0.08)", "rgba(70, 91, 104, 0.18)");

  const corners = [
    project(0, state.layer, 0),
    project(GRID, state.layer, 0),
    project(GRID, state.layer, GRID),
    project(0, state.layer, GRID)
  ];
  drawPoly(corners, "rgba(251, 113, 133, 0.1)", "rgba(251, 113, 133, 0.62)");

  const labelAnchor = project(0, state.layer, 0);
  ctx.save();
  ctx.fillStyle = "rgba(23, 32, 51, 0.82)";
  ctx.font = "800 13px Inter, ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`Layer ${state.layer + 1}`, labelAnchor.x + 10, labelAnchor.y - 10);
  ctx.restore();
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
  if (state.layer > 0) {
    const bottom = project(x + 0.5, 0, z + 0.5);
    const top = project(x + 0.5, state.layer, z + 0.5);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(23, 32, 51, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    ctx.restore();
  }
  visibleSideFaces(faces, x, state.layer, z, state.currentColor).forEach((face) => drawPoly(face.points, fill, "rgba(23, 32, 51, 0.32)"));
  drawPoly(faces.top, fill, "rgba(23, 32, 51, 0.58)");
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  drawLayerGuide();
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

function serializeArtwork() {
  return {
    voxels: [...state.voxels.entries()],
    palette: state.palette,
    updatedAt: new Date().toISOString()
  };
}

function applyArtwork(data) {
  state.voxels = new Map(data.voxels || []);
  state.palette = data.palette || state.palette;
  renderPalette();
  updateReadouts();
  draw();
}

function makeDesignId() {
  return `design-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizedDesignName() {
  return (els.designName.value || "").trim() || "Untitled design";
}

function sortedDesigns() {
  return [...state.designs].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function saveDesignStore() {
  localStorage.setItem(DESIGNS_STORAGE_KEY, JSON.stringify(state.designs));
}

function loadDesignStore() {
  let designs = [];
  try {
    designs = JSON.parse(localStorage.getItem(DESIGNS_STORAGE_KEY) || "[]");
  } catch {
    designs = [];
  }

  if (!designs.length) {
    try {
      const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (legacy?.voxels?.length) {
        designs.push({
          id: makeDesignId(),
          name: "Recovered design",
          voxels: legacy.voxels,
          palette: legacy.palette || state.palette,
          updatedAt: legacy.savedAt || new Date().toISOString()
        });
      }
    } catch {
      designs = [];
    }
  }

  state.designs = designs;
  saveDesignStore();
}

function designColors(design) {
  const counts = new Map();
  (design.voxels || []).forEach(([, color]) => counts.set(color, (counts.get(color) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)
    .slice(0, 12);
}

function renderDesignDashboard() {
  els.designName.value = state.designName;
  els.designGrid.innerHTML = "";

  if (!state.designs.length) {
    const empty = document.createElement("p");
    empty.className = "empty-designs";
    empty.textContent = "No saved designs yet.";
    els.designGrid.appendChild(empty);
    return;
  }

  sortedDesigns().forEach((design) => {
    const card = document.createElement("article");
    card.className = `design-card${design.id === state.currentDesignId ? " active" : ""}`;

    const preview = document.createElement("div");
    preview.className = "design-preview";
    const colors = designColors(design);
    const previewColors = colors.length ? colors : ["#f8fafc"];
    previewColors.forEach((color) => {
      const chip = document.createElement("span");
      chip.className = "preview-cube";
      chip.style.background = color;
      preview.appendChild(chip);
    });

    const meta = document.createElement("div");
    meta.className = "design-meta";
    const title = document.createElement("h2");
    title.className = "design-title";
    title.textContent = design.name || "Untitled design";
    const count = document.createElement("div");
    count.className = "design-detail";
    const cubeCount = (design.voxels || []).length;
    count.textContent = `${cubeCount} cube${cubeCount === 1 ? "" : "s"}`;
    const updated = document.createElement("div");
    updated.className = "design-detail";
    updated.textContent = design.updatedAt ? `Saved ${new Date(design.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Not saved";
    meta.append(title, count, updated);

    const actions = document.createElement("div");
    actions.className = "design-card-actions";
    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = "Load";
    loadButton.addEventListener("click", () => loadDesign(design.id));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteDesign(design.id));
    actions.append(loadButton, deleteButton);

    card.append(preview, meta, actions);
    els.designGrid.appendChild(card);
  });
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
  state.palette = sortPalette(state.palette);
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

function colorInfo(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const chroma = max - min;
  let hue = 0;
  if (chroma) {
    if (max === r / 255) hue = ((g - b) / 255 / chroma + 6) % 6;
    else if (max === g / 255) hue = (b - r) / 255 / chroma + 2;
    else hue = (r - g) / 255 / chroma + 4;
    hue *= 60;
  }
  return { hue, chroma, lightness: (max + min) / 2 };
}

function sortPalette(colors) {
  return [...colors].sort((a, b) => {
    const ai = colorInfo(a);
    const bi = colorInfo(b);
    const aNeutral = ai.chroma < 0.15;
    const bNeutral = bi.chroma < 0.15;
    if (aNeutral !== bNeutral) return aNeutral ? 1 : -1;
    if (aNeutral && bNeutral) return ai.lightness - bi.lightness;
    const aHue = ai.hue >= 330 ? ai.hue - 315 : ai.hue;
    const bHue = bi.hue >= 330 ? bi.hue - 315 : bi.hue;
    return aHue - bHue || bi.chroma - ai.chroma;
  });
}

function updateReadouts() {
  const toolName = state.tool === "erase" ? "Eraser" : state.tool.charAt(0).toUpperCase() + state.tool.slice(1);
  els.toolReadout.textContent = toolName;
  els.cubeCount.textContent = `${state.voxels.size} cube${state.voxels.size === 1 ? "" : "s"}`;
  els.layerValue.textContent = String(state.layer + 1);
  els.layerReadout.textContent = `Layer ${state.layer + 1}`;
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

function saveArt({ forceNew = false } = {}) {
  const name = normalizedDesignName();
  const data = serializeArtwork();
  let design = !forceNew && state.currentDesignId
    ? state.designs.find((item) => item.id === state.currentDesignId)
    : null;

  if (!design) {
    design = { id: makeDesignId(), name, ...data };
    state.designs.push(design);
    state.currentDesignId = design.id;
  } else {
    Object.assign(design, { name, ...data });
  }

  state.designName = name;
  saveDesignStore();
  renderDesignDashboard();
  els.saveStatus.textContent = forceNew ? `Saved copy: ${name}` : `Saved: ${name}`;
}

function loadDesign(designId) {
  const design = state.designs.find((item) => item.id === designId);
  if (!design) return;
  pushHistory();
  state.currentDesignId = design.id;
  state.designName = design.name || "Untitled design";
  els.designName.value = state.designName;
  applyArtwork(design);
  renderDesignDashboard();
  els.saveStatus.textContent = `Loaded: ${state.designName}`;
}

function deleteDesign(designId) {
  const design = state.designs.find((item) => item.id === designId);
  if (!design) return;
  const shouldDelete = window.confirm(`Delete "${design.name || "Untitled design"}"?`);
  if (!shouldDelete) return;

  state.designs = state.designs.filter((item) => item.id !== designId);
  if (state.currentDesignId === designId) {
    state.currentDesignId = null;
    state.designName = "Untitled design";
    els.designName.value = state.designName;
  }
  saveDesignStore();
  renderDesignDashboard();
  els.saveStatus.textContent = "Design deleted";
}

function newDesign() {
  pushHistory();
  state.voxels.clear();
  state.currentDesignId = null;
  state.designName = "Untitled design";
  els.designName.value = state.designName;
  els.templateSelect.value = "blank";
  state.future = [];
  updateReadouts();
  renderDesignDashboard();
  draw();
  els.saveStatus.textContent = "New unsaved design";
}

function loadArt() {
  els.dashboard.classList.toggle("collapsed");
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
  const templateNames = {
    blank: "Blank grid",
    character: "Stick figure",
    item: "Sword",
    building: "House"
  };
  if (name === "character") {
    [[7, 10], [8, 10], [6, 9], [7, 9], [8, 9], [9, 9], [7, 8], [8, 8]].forEach(([x, y]) => addVoxel(x, y, 8, "#facc15"));
    for (let y = 4; y <= 7; y += 1) addVoxel(8, y, 8, "#38bdf8");
    for (let x = 5; x <= 11; x += 1) addVoxel(x, 6, 8, "#38bdf8");
    [[7, 3], [6, 2], [9, 3], [10, 2]].forEach(([x, y]) => addVoxel(x, y, 8, "#1f2937"));
    addVoxel(7, 9, 7, "#1f2937");
    addVoxel(8, 9, 7, "#1f2937");
  }
  if (name === "item") {
    for (let y = 0; y < 8; y += 1) addVoxel(8, y, 8, "#a78bfa");
    for (let z = 5; z <= 11; z += 1) addVoxel(8, 5, z, "#f59e0b");
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
    for (let y = 0; y <= 2; y += 1) addVoxel(10, y, 7, "#1f2937");
    [[10, 3, 5], [10, 3, 10]].forEach(([x, y, z]) => addVoxel(x, y, z, "#38bdf8"));
  }
  els.saveStatus.textContent = `${templateNames[name] || "Template"} applied (${state.voxels.size} cubes)`;
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

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  if (event.button === 2 || event.altKey) {
    state.drag = { type: "orbit", x: event.clientX, y: event.clientY, angle: state.angle, pitch: state.pitch };
    canvas.classList.add("orbiting");
  } else if (event.button === 1 || event.shiftKey || event.metaKey || event.ctrlKey) {
    state.drag = { type: "pan", x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
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
    state.pitch = Math.max(16, Math.min(64, state.drag.pitch - (event.clientY - state.drag.y) * 0.22));
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
  canvas.classList.remove("orbiting");
});

canvas.addEventListener("pointercancel", () => {
  state.drag = null;
  canvas.classList.remove("orbiting");
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.zoom = Math.max(34, Math.min(78, state.zoom - Math.sign(event.deltaY) * 4));
  els.zoomRange.value = String(state.zoom);
  draw();
}, { passive: false });

els.colorInput.addEventListener("input", (event) => setColor(event.target.value));
els.designName.addEventListener("input", () => {
  state.designName = normalizedDesignName();
});
document.getElementById("addColorBtn").addEventListener("click", () => {
  if (!state.palette.includes(state.currentColor)) state.palette.unshift(state.currentColor);
  state.palette = state.palette.slice(0, 15);
  renderPalette();
});
document.getElementById("newDesignBtn").addEventListener("click", newDesign);
document.getElementById("saveBtn").addEventListener("click", saveArt);
document.getElementById("saveCopyBtn").addEventListener("click", () => saveArt({ forceNew: true }));
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
els.templateSelect.addEventListener("change", () => loadTemplate(els.templateSelect.value));

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
loadDesignStore();
const initialDesign = sortedDesigns()[0];
if (initialDesign) {
  state.currentDesignId = initialDesign.id;
  state.designName = initialDesign.name || "Untitled design";
  els.saveStatus.textContent = `Loaded: ${state.designName}`;
  applyArtwork(initialDesign);
} else {
  renderPalette();
  updateReadouts();
}
renderDesignDashboard();
resizeCanvas();
