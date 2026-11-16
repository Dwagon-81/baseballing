/* Name Every Ballplayer — guess MLB players (2000+) and watch them fill the field and the map. */

const STORE_KEY = "ballplayers.v1";
const POS_NAME = {
  C: "Catcher", "1B": "First base", "2B": "Second base", "3B": "Third base", SS: "Shortstop",
  LF: "Left field", CF: "Center field", RF: "Right field", DH: "Designated hitter",
  SP: "Starting pitcher", RP: "Relief pitcher", TWP: "Two-way player", PH: "Pinch hitter",
};
// Which spot on the diamond each position goes to.
const SPOT_OF = { TWP: "DH", PH: "DH" };

let players = [], byId = new Map(), keyIndex = new Map(), lastIndex = new Map();
let guessed = new Set(), order = [], revealed = false, justAdded = new Set();
let totalWar = 0;

// ---------- utils ----------
const norm = s => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/-/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const posWar = p => Math.max(0, p.war);
const spotOf = p => SPOT_OF[p.pos] || p.pos;
const yrs = p => p.from === p.to ? `${p.from}` : `${p.from}–${p.to}`;
const hash = n => { let x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

function addKey(map, k, p) {
  if (!k) return;
  if (!map.has(k)) map.set(k, []);
  if (!map.get(k).includes(p)) map.get(k).push(p);
}

// ---------- persistence ----------
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(order)); } catch {}
}
function load() {
  try {
    const ids = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    for (const id of ids) if (byId.has(id) && !guessed.has(id)) { guessed.add(id); order.push(id); }
  } catch {}
}

// ---------- guessing ----------
const input = document.getElementById("guess");
const feedback = document.getElementById("feedback");

function say(msg, cls = "") {
  feedback.textContent = msg;
  feedback.className = cls;
}

// ---------- analytics (GoatCounter events; no-op if the script is blocked or on localhost) ----------
// Kept to a few events per visit so we stay well under GoatCounter's free-tier limits.
const MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000];
let sessionNamed = 0, sessionSent = false;
const tracked = new Set();
function track(path, title = path) {
  try { window.goatcounter?.count?.({ path, title, event: true }); } catch {}
}
function trackOnce(path, title) {
  if (tracked.has(path)) return;
  tracked.add(path);
  track(path, title);
}
function bucket(n) {
  return n === 0 ? "0" : n < 10 ? "1-9" : n < 50 ? "10-49" : n < 100 ? "50-99" : n < 250 ? "100-249" : n < 500 ? "250-499" : "500+";
}
// One summary per visit: how many players were named during this visit.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden" || sessionSent) return;
  sessionSent = true;
  track(`visit-named-${bucket(sessionNamed)}`, `Named ${bucket(sessionNamed)} players in one visit`);
});

function accept(list) {
  const fresh = list.filter(p => !guessed.has(p.id));
  if (!fresh.length) {
    say(`Already got ${list[0].name}`, "bad");
    input.value = "";
    return;
  }
  justAdded = new Set(fresh.map(p => p.id));
  const before = guessed.size;
  for (const p of fresh) { guessed.add(p.id); order.push(p.id); }
  save();
  sessionNamed += fresh.length;
  for (const m of MILESTONES) {
    if (before < m && guessed.size >= m) track(`milestone-${m}`, `Reached ${m} players named`);
  }
  const names = fresh.map(p => `${p.name} (${p.pos}, ${p.war} WAR)`).join(" + ");
  say(`✓ ${names}`, "good");
  input.value = "";
  renderAll();
}

// Names that are the start of a longer name ("brandon wood" -> "brandon woodruff").
const prefixKeys = new Set();
let pendingAccept = null;

input.addEventListener("input", () => {
  clearTimeout(pendingAccept);
  const n = norm(input.value);
  if (!n.includes(" ") || !keyIndex.has(n)) return;
  // Auto-accept as soon as a full name matches, like cityquiz. If the name could still
  // grow into a longer one, wait until typing pauses (Enter accepts right away).
  if (!prefixKeys.has(n)) return accept(keyIndex.get(n));
  pendingAccept = setTimeout(() => {
    if (norm(input.value) === n) accept(keyIndex.get(n));
  }, 900);
});

input.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  clearTimeout(pendingAccept);
  const n = norm(input.value);
  if (!n) return;
  if (keyIndex.has(n)) return accept(keyIndex.get(n));
  const byLast = lastIndex.get(n);
  if (byLast && byLast.length === 1) return accept(byLast);
  if (byLast && byLast.length > 1) {
    const left = byLast.filter(p => !guessed.has(p.id)).length;
    return say(`${byLast.length} players named ${input.value.trim()} (${left} left) — add a first name`, "bad");
  }
  say(`Nobody named “${input.value.trim()}” since 2000`, "bad");
  input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
});

// ---------- scoreboard + list ----------
function renderScore() {
  const got = players.filter(p => guessed.has(p.id));
  const war = got.reduce((s, p) => s + posWar(p), 0);
  document.getElementById("warPct").textContent = (100 * war / totalWar).toFixed(1) + "%";
  document.getElementById("count").textContent = got.length.toLocaleString();
  document.getElementById("countries").textContent = new Set(got.map(p => p.country)).size;
  document.getElementById("hof").textContent = got.filter(p => p.hof).length;
}

function li(p, cls = "") {
  const el = document.createElement("li");
  el.className = cls;
  el.innerHTML = `<span class="n"></span><span class="w">${p.war.toFixed(1)}</span><span class="m"></span>`;
  el.querySelector(".n").textContent = p.name + (p.hof ? " ★" : "");
  el.querySelector(".m").textContent = `${p.pos} · ${teamsShort(p)} · ${yrs(p)} · ${p.born}`;
  return el;
}
const teamsShort = p => p.teams.length > 1 ? `${p.team} +${p.teams.length - 1}` : p.team;

function renderList() {
  const list = document.getElementById("list");
  list.replaceChildren();
  document.getElementById("clearTeam").hidden = !selectedTeam;
  if (selectedTeam) {
    const t = TEAM_INFO[selectedTeam];
    const onTeam = p => p.teams.includes(selectedTeam);
    const named = [...order].reverse().map(id => byId.get(id)).filter(onTeam);
    document.getElementById("listTitle").textContent = `${t.name} · ${named.length}`;
    named.forEach(p => list.append(li(p, justAdded.has(p.id) ? "new" : "")));
    if (revealed) players.filter(p => onTeam(p) && !guessed.has(p.id)).slice(0, 200).forEach(p => list.append(li(p, "missed")));
  } else if (revealed) {
    document.getElementById("listTitle").textContent = "Biggest misses";
    players.filter(p => !guessed.has(p.id)).slice(0, 200).forEach(p => list.append(li(p, "missed")));
  } else {
    document.getElementById("listTitle").textContent = "Named";
    [...order].reverse().forEach(id => list.append(li(byId.get(id), justAdded.has(id) ? "new" : "")));
  }
}

// ---------- tooltip ----------
const tip = document.getElementById("tooltip");
const stage = document.querySelector(".stage");
function showTip(e, p) {
  tip.innerHTML = `<b></b><span></span>`;
  tip.querySelector("b").textContent = guessed.has(p.id) ? p.name : "???";
  tip.querySelector("span").textContent = (guessed.has(p.id)
    ? `${POS_NAME[p.pos] || p.pos} · ${p.team} · ${yrs(p)} · ${p.war} WAR · born ${p.born}`
    : `${POS_NAME[p.pos] || p.pos} · ${p.team} · ${yrs(p)} · ${p.war} WAR`)
    + (p.teams.length > 1 ? ` · played for ${p.teams.length} teams` : "") + (p.hof ? " · Hall of Famer" : "");
  if (revealed) tip.querySelector("b").textContent = p.name;
  tip.hidden = false;
  moveTip(e);
}
function moveTip(e) {
  const r = stage.getBoundingClientRect();
  let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
  if (x + 270 > r.width) x -= 290;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
const hideTip = () => { tip.hidden = true; };

// =====================================================================
// Diamond view
// =====================================================================
const W = 1300, H = 780;
const HOME = [650, 610], FENCE = 420;
const SPOTS = {
  C:  { x: 650, y: 672, R: 34 },
  "1B": { x: 785, y: 455, R: 42 },
  "2B": { x: 722, y: 362, R: 42, labelAbove: true },
  SS: { x: 578, y: 362, R: 42, labelAbove: true },
  "3B": { x: 515, y: 455, R: 42 },
  LF: { x: 435, y: 292, R: 56, labelAbove: true },
  CF: { x: 650, y: 242, R: 52, labelAbove: true },
  RF: { x: 865, y: 292, R: 56, labelAbove: true },
  DH: { x: 500, y: 672, R: 34 },
};
const PENS = {
  SP: { x: 30, y: 470, w: 290, h: 250, title: "Dugout", sub: "starting pitchers" },
  RP: { x: 980, y: 470, w: 290, h: 250, title: "Bullpen", sub: "relievers" },
};

let dSvg, dDots, dLabels;

function polar(r, deg) {
  const a = deg * Math.PI / 180;
  return [HOME[0] + r * Math.cos(a), HOME[1] + r * Math.sin(a)];
}
function sector(r) {
  const [x1, y1] = polar(r, -135), [x2, y2] = polar(r, -45);
  return `M${HOME}L${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}Z`;
}

function drawField() {
  dSvg = d3.select("#diamond").append("svg").attr("viewBox", `0 120 ${W} ${H - 120}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const defs = dSvg.append("defs");
  const stripes = defs.append("pattern").attr("id", "mow").attr("patternUnits", "userSpaceOnUse")
    .attr("width", 60).attr("height", 60).attr("patternTransform", "rotate(45)");
  stripes.append("rect").attr("width", 60).attr("height", 60).attr("fill", "var(--grass)");
  stripes.append("rect").attr("width", 30).attr("height", 60).attr("fill", "var(--grass2)");

  const f = dSvg.append("g");
  // warning track + outfield grass
  f.append("path").attr("d", sector(FENCE + 14)).attr("fill", "var(--dirt)").attr("opacity", .85);
  f.append("path").attr("d", sector(FENCE)).attr("fill", "url(#mow)");
  // fence
  const [fx1, fy1] = polar(FENCE + 14, -135), [fx2, fy2] = polar(FENCE + 14, -45);
  f.append("path").attr("d", `M${fx1},${fy1}A${FENCE + 14},${FENCE + 14} 0 0 1 ${fx2},${fy2}`)
    .attr("fill", "none").attr("stroke", "#1a3d26").attr("stroke-width", 6);
  // infield dirt
  f.append("path").attr("d", sector(250)).attr("fill", "var(--dirt)");
  const b = 106; // 90 ft
  const base1 = [HOME[0] + b, HOME[1] - b], base2 = [HOME[0], HOME[1] - 2 * b], base3 = [HOME[0] - b, HOME[1] - b];
  const c = [HOME[0], HOME[1] - b];
  const inset = pt => [c[0] + (pt[0] - c[0]) * .78, c[1] + (pt[1] - c[1]) * .78];
  f.append("path").attr("d", `M${inset(HOME)}L${inset(base1)}L${inset(base2)}L${inset(base3)}Z`).attr("fill", "var(--grass2)");
  // home-plate dirt circle
  f.append("circle").attr("cx", HOME[0]).attr("cy", HOME[1]).attr("r", 26).attr("fill", "var(--dirt)");
  // foul lines
  for (const deg of [-135, -45]) {
    const [x, y] = polar(FENCE + 14, deg);
    f.append("line").attr("x1", HOME[0]).attr("y1", HOME[1]).attr("x2", x).attr("y2", y)
      .attr("stroke", "#fff").attr("stroke-width", 2).attr("opacity", .85);
  }
  // mound + bases
  f.append("circle").attr("cx", c[0]).attr("cy", c[1] + 8).attr("r", 16).attr("fill", "var(--dirt)").attr("stroke", "#9a6a3e");
  f.append("rect").attr("x", c[0] - 5).attr("y", c[1] + 6).attr("width", 10).attr("height", 3).attr("fill", "#fff");
  for (const [x, y] of [base1, base2, base3]) {
    f.append("rect").attr("x", x - 6).attr("y", y - 6).attr("width", 12).attr("height", 12)
      .attr("fill", "#fff").attr("transform", `rotate(45 ${x} ${y})`);
  }
  f.append("path").attr("d", `M${HOME[0] - 7},${HOME[1] - 6}h14v6l-7,6l-7,-6z`).attr("fill", "#fff");

  // dugout and bullpen
  for (const [k, p] of Object.entries(PENS)) {
    const g = f.append("g");
    g.append("rect").attr("x", p.x).attr("y", p.y).attr("width", p.w).attr("height", p.h).attr("rx", 10)
      .attr("fill", k === "SP" ? "#1a2c42" : "var(--grass)").attr("stroke", k === "SP" ? "#335277" : "#1a3d26").attr("stroke-width", 2);
    if (k === "SP") g.append("rect").attr("x", p.x).attr("y", p.y).attr("width", p.w).attr("height", 10).attr("rx", 4).attr("fill", "#335277");
    else {
      g.append("circle").attr("cx", p.x + p.w - 22).attr("cy", p.y + 22).attr("r", 10).attr("fill", "var(--dirt)");
      g.append("circle").attr("cx", p.x + p.w - 50).attr("cy", p.y + 22).attr("r", 10).attr("fill", "var(--dirt)");
    }
  }

  dDots = dSvg.append("g");
  dLabels = dSvg.append("g");
}

// Lay out players for a spot: stars in the middle (phyllotaxis spiral) or a grid for dugout/bullpen.
function layoutSpot(key, list) {
  list.sort((a, b) => b.war - a.war);
  const n = list.length;
  if (!n) return [];
  if (PENS[key]) {
    const p = PENS[key], top = 52, pad = 10;
    const aw = p.w - 2 * pad, ah = p.h - top - pad;
    const cell = Math.min(16, Math.sqrt(aw * ah / n));
    const cols = Math.max(1, Math.floor(aw / cell));
    return list.map((pl, i) => ({
      p: pl, x: p.x + pad + cell * (i % cols) + cell / 2, y: p.y + top + cell * Math.floor(i / cols) + cell / 2,
      r: Math.max(1.4, cell * .42 * (0.6 + 0.4 * Math.min(1, Math.sqrt(posWar(pl)) / 7))),
    }));
  }
  const s = SPOTS[key];
  const sp = Math.min(15, s.R / Math.sqrt(n));
  return list.map((pl, i) => {
    const r = sp * Math.sqrt(i + .5), a = i * 2.39996;
    return {
      p: pl, x: s.x + r * Math.cos(a), y: s.y + r * Math.sin(a),
      r: Math.max(1.4, sp * .55 * (0.55 + 0.45 * Math.min(1, Math.sqrt(posWar(pl)) / 7))),
    };
  });
}

function renderDiamond() {
  const groups = {};
  for (const k of [...Object.keys(SPOTS), ...Object.keys(PENS)]) groups[k] = { all: 0, list: [] };
  for (const p of players) {
    const g = groups[spotOf(p)];
    if (!g) continue;
    g.all++;
    if (guessed.has(p.id) || revealed) g.list.push(p);
  }
  const nodes = [];
  for (const [k, g] of Object.entries(groups)) nodes.push(...layoutSpot(k, g.list));

  dDots.selectAll("circle").data(nodes, d => d.p.id).join("circle")
    .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", d => d.r)
    .attr("class", d => "dot " + (guessed.has(d.p.id) ? "hit" : "missed") + (justAdded.has(d.p.id) ? " pop" : ""))
    .on("mouseenter", (e, d) => showTip(e, d.p)).on("mousemove", moveTip).on("mouseleave", hideTip);
  // Draw named players on top of missed ones.
  dDots.selectAll("circle.hit").raise();

  // labels
  const labels = [];
  for (const [k, s] of Object.entries(SPOTS)) {
    const g = groups[k], got = g.list.filter(p => guessed.has(p.id));
    labels.push({ k, x: s.x, s, title: k, sub: `${got.length} / ${g.all}`, star: got[0]?.name || "" });
  }
  for (const [k, p] of Object.entries(PENS)) {
    const g = groups[k], got = g.list.filter(q => guessed.has(q.id));
    labels.push({ k, x: p.x + p.w / 2, title: p.title.toUpperCase(), sub: `${p.sub} · ${got.length} / ${g.all}`, star: "", pen: p });
  }
  dLabels.selectAll("g.lab").data(labels, d => d.k).join(enter => {
    const g = enter.append("g").attr("class", "lab");
    g.append("text").attr("class", "pos-label");
    g.append("text").attr("class", "pos-count");
    g.append("text").attr("class", "star-name");
    return g;
  }).each(function (d) {
    const g = d3.select(this);
    let ty, cy, sy;
    if (d.pen) { ty = d.pen.y + 22; cy = ty + 15; sy = 0; }
    else if (d.s.labelAbove) { cy = d.s.y - d.s.R - 8; ty = cy - 14; sy = ty - 16; }
    else { ty = d.s.y + d.s.R + 16; cy = ty + 14; sy = cy + 15; }
    g.select(".pos-label").attr("x", d.x).attr("y", ty).text(d.title);
    g.select(".pos-count").attr("x", d.x).attr("y", cy).text(d.sub);
    g.select(".star-name").attr("x", d.x).attr("y", sy).text(d.star);
  });
}

// =====================================================================
// Birthplace map
// =====================================================================
let mSvg, mG, mDots, projection, zoomK = 1;

async function drawMap() {
  const el = document.getElementById("map");
  const w = 1200, h = 640;
  mSvg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("preserveAspectRatio", "xMidYMid meet");
  mSvg.append("rect").attr("width", w).attr("height", h).attr("fill", "var(--ocean)");
  mG = mSvg.append("g");

  const [world, us] = await Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json"),
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json"),
  ]);
  const countries = topojson.feature(world, world.objects.countries);
  countries.features = countries.features.filter(f => f.id !== "010"); // no Antarctica
  projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [w - 10, h - 10]], countries);
  const path = d3.geoPath(projection);

  mG.append("g").selectAll("path").data(countries.features).join("path")
    .attr("d", path).attr("fill", "var(--land)").attr("stroke", "#2c4d70").attr("stroke-width", .5)
    .attr("vector-effect", "non-scaling-stroke");
  mG.append("path").datum(topojson.mesh(us, us.objects.states, (a, b) => a !== b))
    .attr("d", path).attr("fill", "none").attr("stroke", "#2c4d70").attr("stroke-width", .4)
    .attr("vector-effect", "non-scaling-stroke");
  mDots = mG.append("g");

  const zoom = d3.zoom().scaleExtent([1, 60]).translateExtent([[0, 0], [w, h]]).on("zoom", e => {
    zoomK = e.transform.k;
    mG.attr("transform", e.transform);
    mDots.selectAll("circle").attr("r", d => mapR(d) / Math.sqrt(zoomK)).attr("stroke-width", .6 / zoomK);
  });
  mSvg.call(zoom);
  // Start zoomed on the Americas, where most players are from.
  const [ax, ay] = projection([-82, 24]);
  mSvg.call(zoom.transform, d3.zoomIdentity.translate(w / 2, h / 2).scale(2.4).translate(-ax, -ay));
  renderMap();
}

const mapR = p => 1.6 + Math.sqrt(posWar(p)) * .45;

function renderMap() {
  if (!projection) return;
  const shown = players.filter(p => p.ll && (guessed.has(p.id) || revealed));
  mDots.selectAll("circle").data(shown, d => d.id).join("circle")
    .attr("cx", d => projection([d.ll[1] + (hash(d.id) - .5) * .12, d.ll[0] + (hash(d.id + 7) - .5) * .12])[0])
    .attr("cy", d => projection([d.ll[1] + (hash(d.id) - .5) * .12, d.ll[0] + (hash(d.id + 7) - .5) * .12])[1])
    .attr("r", d => mapR(d) / Math.sqrt(zoomK)).attr("stroke-width", .6 / zoomK)
    .attr("class", d => "dot " + (guessed.has(d.id) ? "hit" : "missed") + (justAdded.has(d.id) ? " pop" : ""))
    .sort((a, b) => (guessed.has(a.id) - guessed.has(b.id)) || (b.war - a.war))
    .on("mouseenter", showTip).on("mousemove", moveTip).on("mouseleave", hideTip);
}

// =====================================================================
// Teams view: one tile per franchise, counting every team a player was on since 2000
// =====================================================================
// [abbr shown, name, primary color, secondary color]
const DIVISIONS = {
  "American League": {
    East: [["BAL", "Orioles", "#DF4601", "#000000"], ["BOS", "Red Sox", "#BD3039", "#0C2340"], ["NYY", "Yankees", "#0C2340", "#C4CED3"], ["TBR", "Rays", "#092C5C", "#8FBCE6"], ["TOR", "Blue Jays", "#134A8E", "#E8291C"]],
    Central: [["CHW", "White Sox", "#27251F", "#C4CED4"], ["CLE", "Guardians", "#00385D", "#E50022"], ["DET", "Tigers", "#0C2340", "#FA4616"], ["KCR", "Royals", "#004687", "#BD9B60"], ["MIN", "Twins", "#002B5C", "#D31145"]],
    West: [["ATH", "Athletics", "#003831", "#EFB21E"], ["HOU", "Astros", "#002D62", "#EB6E1F"], ["LAA", "Angels", "#BA0021", "#003263"], ["SEA", "Mariners", "#0C2C56", "#005C5C"], ["TEX", "Rangers", "#003278", "#C0111F"]],
  },
  "National League": {
    East: [["ATL", "Braves", "#CE1141", "#13274F"], ["MIA", "Marlins", "#00A3E0", "#EF3340"], ["NYM", "Mets", "#002D72", "#FF5910"], ["PHI", "Phillies", "#E81828", "#002D72"], ["WSN", "Nationals / Expos", "#AB0003", "#14225A"]],
    Central: [["CHC", "Cubs", "#0E3386", "#CC3433"], ["CIN", "Reds", "#C6011F", "#000000"], ["MIL", "Brewers", "#12284B", "#FFC52F"], ["PIT", "Pirates", "#27251F", "#FDB827"], ["STL", "Cardinals", "#C41E3A", "#0C2340"]],
    West: [["ARI", "Diamondbacks", "#A71930", "#E3D4AD"], ["COL", "Rockies", "#33006F", "#C4CED4"], ["LAD", "Dodgers", "#005A9C", "#EF3E42"], ["SDP", "Padres", "#2F241D", "#FFC425"], ["SFG", "Giants", "#FD5A1E", "#27251F"]],
  },
};
const TEAM_INFO = {};
for (const divs of Object.values(DIVISIONS))
  for (const teams of Object.values(divs))
    for (const [code, name, c1, c2] of teams) TEAM_INFO[code] = { name, c1, c2 };

let selectedTeam = null;
const tileEls = {};

function drawTeams() {
  const root = document.getElementById("teams");
  for (const [league, divs] of Object.entries(DIVISIONS)) {
    const sec = document.createElement("section");
    sec.className = "league";
    sec.innerHTML = `<h3>${league}</h3><div class="divisions"></div>`;
    for (const [div, teams] of Object.entries(divs)) {
      const col = document.createElement("div");
      col.className = "division";
      col.innerHTML = `<h4>${div}</h4>`;
      for (const [code] of teams) {
        const t = TEAM_INFO[code];
        const b = document.createElement("button");
        b.className = "team";
        b.innerHTML = `<span class="badge" style="background:${t.c1};border-color:${t.c2}">${code}</span>
          <span class="tname">${t.name}</span><span class="tnum"></span>
          <span class="bar"><i></i></span><span class="twar"></span>`;
        b.addEventListener("click", () => {
          selectedTeam = selectedTeam === code ? null : code;
          renderTeams(); renderList();
          input.focus();
        });
        tileEls[code] = b;
        col.append(b);
      }
      sec.querySelector(".divisions").append(col);
    }
    root.append(sec);
  }
}

function renderTeams() {
  const all = {}, got = {}, warAll = {}, warGot = {}, bumped = new Set();
  for (const p of players) {
    for (const t of p.teams) {
      all[t] = (all[t] || 0) + 1;
      warAll[t] = (warAll[t] || 0) + posWar(p);
      if (guessed.has(p.id)) {
        got[t] = (got[t] || 0) + 1;
        warGot[t] = (warGot[t] || 0) + posWar(p);
        if (justAdded.has(p.id)) bumped.add(t);
      }
    }
  }
  for (const [code, el] of Object.entries(tileEls)) {
    const g = got[code] || 0, a = all[code] || 0;
    el.querySelector(".tnum").innerHTML = `${g} <small>/ ${a}</small>`;
    el.querySelector(".bar i").style.width = `${a ? 100 * g / a : 0}%`;
    el.querySelector(".twar").textContent = `${(100 * (warGot[code] || 0) / (warAll[code] || 1)).toFixed(0)}% WAR`;
    el.classList.toggle("selected", code === selectedTeam);
    el.classList.remove("bump");
    if (bumped.has(code)) { void el.offsetWidth; el.classList.add("bump"); }
  }
}

document.getElementById("clearTeam").addEventListener("click", () => {
  selectedTeam = null;
  renderTeams(); renderList();
});

// =====================================================================
function renderAll() {
  renderScore();
  renderList();
  renderDiamond();
  renderMap();
  renderTeams();
  justAdded = new Set();
}

document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === t.dataset.view));
  trackOnce(`view-${t.dataset.view}`, `Opened ${t.textContent} view`);
  input.focus();
}));

document.getElementById("giveUp").addEventListener("click", e => {
  revealed = !revealed;
  e.target.textContent = revealed ? "Hide answers" : "Give up";
  if (revealed) trackOnce("give-up", "Gave up");
  renderAll();
});

document.getElementById("reset").addEventListener("click", () => {
  if (!confirm("Clear every player you've named?")) return;
  track("reset", "Reset progress");
  guessed.clear(); order = []; save(); say("");
  renderAll();
});

(async function init() {
  players = await (await fetch("data/players.json")).json();
  for (const p of players) {
    byId.set(p.id, p);
    for (const k of p.keys) {
      addKey(keyIndex, k, p);
      addKey(keyIndex, k.replace(/ (jr|sr|ii|iii|iv)$/, ""), p);
    }
    addKey(lastIndex, p.last.replace(/ (jr|sr|ii|iii|iv)$/, ""), p);
  }
  // In sorted order, any key that starts another key sits right before it.
  const sorted = [...keyIndex.keys()].sort();
  sorted.forEach((k, i) => { if (sorted[i + 1]?.startsWith(k)) prefixKeys.add(k); });
  totalWar = players.reduce((s, p) => s + posWar(p), 0);
  document.getElementById("total").textContent = players.length.toLocaleString();
  document.getElementById("hofTotal").textContent = players.filter(p => p.hof).length;
  load();
  drawField();
  drawTeams();
  renderAll();
  drawMap();
})();
