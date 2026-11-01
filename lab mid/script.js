"use strict";
// ---------- Configuration ----------
const DIFF = {
  Easy:   { speed: 55,  maxBubbles: 5, spawnMs: 1200, limitMs: 3000 },
  Medium: { speed: 85,  maxBubbles: 6, spawnMs: 900,  limitMs: 2000 },
  Hard:   { speed: 125, maxBubbles: 8, spawnMs: 650,  limitMs: 1300 }
};
const KEYSETS = {                       // target keys come from JS arrays
  home:   ["A","S","D","F","J","K","L"],
  top:    ["Q","W","E","R","T","Y","U","I","O","P"],
  bottom: ["Z","X","C","V","B","N","M"],
  all:    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
};
const KB_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const COLORS = ["#12a594", "#ff6b57", "#6c5ce7", "#e17055", "#0984e3", "#d63384"];
const WIN_SCORE = 300, MISS_LIMIT = 6, B_ROUNDS = 20, B_LIVES = 5;

// ---------- State ----------
let sel = { mode: "A", diff: "Easy", set: "home" };
let g = null;          // current game session
let rafId = null, timeoutId = null;   // the ONLY timers; always cleared in stopAll()

const $ = id => document.getElementById(id);
const show = id => ["home", "game", "results"].forEach(s => $(s).classList.toggle("hidden", s !== id));

// ---------- Home screen ----------
function pickMode(m) {
  sel.mode = m;
  $("cardA").classList.toggle("sel", m === "A");
  $("cardB").classList.toggle("sel", m === "B");
  $("keysetBox").classList.toggle("hidden", m !== "B");
}
document.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => pickMode(b.dataset.pick));
function bindOpts(boxId, attr, key) {
  $(boxId).querySelectorAll("button").forEach(b => b.onclick = () => {
    $(boxId).querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); sel[key] = b.dataset[attr];
  });
}
bindOpts("diffOpts", "d", "diff");
bindOpts("setOpts", "s", "set");
$("startBtn").onclick = startGame;

// ---------- On-screen keyboard ----------
function buildKeyboard() {
  $("kb").innerHTML = "";
  KB_ROWS.forEach(r => {
    const row = document.createElement("div"); row.className = "row";
    r.split("").forEach(ch => {
      const k = document.createElement("button");
      k.className = "key"; k.textContent = ch; k.dataset.k = ch;
      k.onclick = () => handleKey(ch);
      row.appendChild(k);
    });
    $("kb").appendChild(row);
  });
}
function flashKey(ch, cls) {
  const k = document.querySelector('.key[data-k="' + ch + '"]');
  if (!k) return;
  k.classList.add(cls); setTimeout(() => k.classList.remove(cls), 200);
}
function hintKey(ch) {
  document.querySelectorAll(".key.hint").forEach(k => k.classList.remove("hint"));
  const k = document.querySelector('.key[data-k="' + ch + '"]');
  if (k) k.classList.add("hint");
}

// ---------- Common helpers ----------
function stopAll() {                    // prevents duplicate loops/timers
  if (rafId) cancelAnimationFrame(rafId);
  if (timeoutId) clearTimeout(timeoutId);
  rafId = timeoutId = null;
}
function flash(el, cls) { el.classList.remove("good", "bad"); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 250); }
function setMsg(t) { $("msg").textContent = t; }

function renderHud() {
  const items = [["Score", g.score], ["Difficulty", sel.diff]];
  if (g.mode === "A") items.push(["Misses", g.misses + " / " + MISS_LIMIT], ["Level", g.level], ["Wrong keys", g.wrong]);
  else items.push(["Lives", g.lives], ["Target", g.round + " / " + B_ROUNDS], ["Correct", g.correct], ["Wrong", g.wrong]);
  $("hud").innerHTML = items.map(i => "<div>" + i[0] + "<b>" + i[1] + "</b></div>").join("");
}

// ---------- Game lifecycle ----------
function startGame() {
  stopAll();
  buildKeyboard();
  g = {
    mode: sel.mode, score: 0, wrong: 0, correct: 0, misses: 0, lives: B_LIVES,
    round: 0, level: 1, bubbles: [], times: [], paused: false, over: false,
    startTime: performance.now(), pausedAt: 0, pausedTotal: 0, last: 0, lastSpawn: 0
  };
  $("arena").innerHTML = "";
  $("arena").style.display = g.mode === "A" ? "block" : "none";
  $("bTarget").style.display = g.mode === "B" ? "block" : "none";
  $("pauseBtn").textContent = "Pause";
  setMsg(g.mode === "A" ? "Type the letters before they reach the top." : "Press the highlighted key.");
  show("game"); renderHud();
  if (g.mode === "A") { g.last = performance.now(); rafId = requestAnimationFrame(tickA); }
  else nextTarget();
}
function restartGame() { startGame(); }                // same mode, fresh state
function resetGame() { stopAll(); g = null; $("arena").innerHTML = ""; show("home"); }  // back to home, everything cleared

function togglePause() {
  if (!g || g.over) return;
  g.paused = !g.paused;
  $("pauseBtn").textContent = g.paused ? "Resume" : "Pause";
  if (g.paused) {
    stopAll(); g.pausedAt = performance.now(); setMsg("Paused");
  } else {
    const d = performance.now() - g.pausedAt; g.pausedTotal += d; g.targetStart += d;
    setMsg("");
    if (g.mode === "A") { g.last = performance.now(); rafId = requestAnimationFrame(tickA); }
    else armTargetTimer(g.limitLeft);
  }
}

function endGame(won) {
  stopAll(); g.over = true;
  const secs = ((performance.now() - g.startTime - g.pausedTotal) / 1000);
  const total = g.correct + g.wrong;
  const acc = total ? Math.round(g.correct / total * 100) : 0;
  const avg = g.times.length ? Math.round(g.times.reduce((a, b) => a + b, 0) / g.times.length) : 0;
  $("rTitle").textContent = (won ? "You win! " : "Game over. ") + (g.mode === "A" ? "Bubbles" : "KeyMagnet") + " (" + sel.diff + ")";
  const rows = [["Final score", g.score], ["Correct keypresses", g.correct], ["Incorrect keypresses", g.wrong], ["Accuracy", acc + "%"], ["Time played", secs.toFixed(1) + " s"]];
  if (g.mode === "A") rows.push(["Missed bubbles", g.misses], ["Level reached", g.level]);
  else rows.push(["Average response time", avg + " ms"], ["Targets completed", g.round]);
  $("rTable").innerHTML = rows.map(r => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>").join("");
  show("results");
}
$("againBtn").onclick = startGame;
$("homeBtn").onclick = resetGame;
$("restartBtn").onclick = restartGame;
$("resetBtn").onclick = resetGame;
$("pauseBtn").onclick = togglePause;

// ---------- Mode A: Bubbles ----------
function spawnBubble() {
  const arena = $("arena");
  const used = g.bubbles.map(b => b.ch);
  const pool = KEYSETS.all.filter(c => !used.includes(c));   // letters stay unique on screen
  const ch = pool[Math.floor(Math.random() * pool.length)];
  const el = document.createElement("div");
  el.className = "bubble"; el.textContent = ch;
  el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
  const x = Math.random() * (arena.clientWidth - 60) + 3;
  const b = { ch, el, x, y: arena.clientHeight };
  el.style.transform = "translate(" + x + "px," + b.y + "px)";
  arena.appendChild(el); g.bubbles.push(b);
}
function tickA(now) {
  if (g.paused || g.over) return;
  const dt = Math.min((now - g.last) / 1000, 0.05); g.last = now;
  const cfg = DIFF[sel.diff];
  const elapsed = (now - g.startTime - g.pausedTotal) / 1000;
  const newLevel = 1 + Math.floor(elapsed / 15);                 // difficulty rises every 15 s
  if (newLevel !== g.level) { g.level = newLevel; renderHud(); setMsg("Level " + g.level + ": faster bubbles!"); }
  const speed = cfg.speed * (1 + 0.2 * (g.level - 1));
  const maxB = Math.min(cfg.maxBubbles + Math.floor((g.level - 1) / 2), 12);
  const spawnMs = Math.max(300, cfg.spawnMs - 60 * (g.level - 1));

  if (g.bubbles.length < 5 || (g.bubbles.length < maxB && now - g.lastSpawn > spawnMs)) {
    spawnBubble(); g.lastSpawn = now;
  }
  for (let i = g.bubbles.length - 1; i >= 0; i--) {
    const b = g.bubbles[i];
    b.y -= speed * dt;
    b.el.style.transform = "translate(" + b.x + "px," + b.y + "px)";
    if (b.y < -56) {                                             // reached top = miss
      b.el.remove(); g.bubbles.splice(i, 1); g.misses++;
      flash($("arena"), "bad"); renderHud();
      if (g.misses >= MISS_LIMIT) return endGame(false);
    }
  }
  rafId = requestAnimationFrame(tickA);
}
function keyA(ch) {
  const i = g.bubbles.findIndex(b => b.ch === ch);
  if (i >= 0) {
    const b = g.bubbles[i]; g.bubbles.splice(i, 1);
    b.el.classList.add("pop"); setTimeout(() => b.el.remove(), 150);
    g.score += 10; g.correct++; flash($("arena"), "good"); flashKey(ch, "ok");
    if (g.score >= WIN_SCORE) { renderHud(); return endGame(true); }
  } else {
    g.score = Math.max(0, g.score - 5); g.wrong++;               // penalty
    flash($("arena"), "bad"); flashKey(ch, "no"); setMsg("Wrong key: -5 points");
  }
  renderHud();
}

// ---------- Mode B: KeyMagnet ----------
function nextTarget() {
  if (g.round >= B_ROUNDS) return endGame(true);
  const set = KEYSETS[sel.set];
  let k; do { k = set[Math.floor(Math.random() * set.length)]; } while (k === g.target && set.length > 1);
  g.target = k; g.round++;
  $("kbtarget").textContent = k; hintKey(k); renderHud();
  g.targetStart = performance.now();
  armTargetTimer(DIFF[sel.diff].limitMs);
}
function armTargetTimer(ms) {
  if (timeoutId) clearTimeout(timeoutId);
  g.limitLeft = ms;
  const bar = $("timeBar");
  bar.style.transition = "none"; bar.style.width = (ms / DIFF[sel.diff].limitMs * 100) + "%";
  void bar.offsetWidth;
  bar.style.transition = "width " + ms + "ms linear"; bar.style.width = "0%";
  timeoutId = setTimeout(() => {                                 // too slow = incorrect
    g.wrong++; g.lives--; flash($("kbtarget"), "bad"); setMsg("Too slow!");
    if (g.lives <= 0) { renderHud(); return endGame(false); }
    nextTarget();
  }, ms);
}
function keyB(ch) {
  if (ch === g.target) {
    const rt = performance.now() - g.targetStart;
    g.times.push(rt); g.correct++;
    g.score += 10 + Math.max(0, Math.round((DIFF[sel.diff].limitMs - rt) / 100)); // speed bonus
    flash($("kbtarget"), "good"); flashKey(ch, "ok"); setMsg("Correct! " + Math.round(rt) + " ms");
    nextTarget();
  } else {
    g.wrong++; g.lives--; flash($("kbtarget"), "bad"); flashKey(ch, "no"); setMsg("Wrong key: you pressed " + ch);
    renderHud();
    if (g.lives <= 0) { stopAll(); endGame(false); }
  }
}

// ---------- Input ----------
function handleKey(ch) {
  if (!g || g.over || g.paused) return;
  ch = ch.toUpperCase();
  if (g.mode === "A") keyA(ch); else keyB(ch);
}
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[a-zA-Z]$/.test(e.key) && !$("game").classList.contains("hidden")) handleKey(e.key);
});

pickMode("A");