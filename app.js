// Mi Entreno — todo se guarda en este dispositivo (localStorage).

const STORE_KEY = 'mientreno:v1';
const REST_SECONDS = 90;

const state = load();
let tab = 'hoy';
let subview = null; // { type: 'edit-routine', id } | { type: 'session', id }
let tick = null;
let homeScroll = 0;
let restEnd = 0;

// ---------- Datos ----------

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && Array.isArray(data.routines)) return data;
  } catch (e) { /* datos vacíos o dañados */ }
  return { routines: [], sessions: [], active: null };
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* sin espacio */ }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? '' : n; };

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso) {
  const t = new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function sessionVolume(s) {
  return s.exercises.reduce((t, ex) => t + ex.sets.filter((x) => x.done).reduce((a, x) => a + (Number(x.reps) || 0) * (Number(x.weight) || 0), 0), 0);
}

function doneSets(s) {
  return s.exercises.reduce((t, ex) => t + ex.sets.filter((x) => x.done).length, 0);
}

function weekCount() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return state.sessions.filter((s) => new Date(s.date) >= monday).length;
}

function streakWeeks() {
  // Semanas seguidas (hasta esta o la anterior) con al menos un entreno.
  const weekKey = (d) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return x.toDateString();
  };
  const weeks = new Set(state.sessions.map((s) => weekKey(new Date(s.date))));
  let d = new Date();
  if (!weeks.has(weekKey(d))) d.setDate(d.getDate() - 7);
  let n = 0;
  while (weeks.has(weekKey(d))) { n++; d.setDate(d.getDate() - 7); }
  return n;
}

// Último peso/reps usados en un ejercicio, para sugerirlos.
function lastFor(name) {
  const key = name.trim().toLowerCase();
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const ex = state.sessions[i].exercises.find((e) => e.name.trim().toLowerCase() === key);
    if (ex) {
      const done = ex.sets.filter((s) => s.done);
      if (done.length) return done[done.length - 1];
    }
  }
  return null;
}

// ---------- Plan semanal ----------
// El usuario elige qué grupos entrena cada día. Cada semana se eligen
// ejercicios distintos de esos grupos, rotando por todos los disponibles.

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const todayIdx = () => (new Date().getDay() + 6) % 7;
const mondayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const weekNumber = () => Math.round((mondayOf(new Date()) - new Date(2024, 0, 1)) / 604800000);
const hasPlan = () => !!state.plan && state.plan.days.some((g) => g.length);

function getPlan() {
  if (!state.plan) {
    state.plan = { days: [[], [], [], [], [], [], []], perDay: 5, materials: [...MATERIALES], sets: 3, reps: 12, shuffles: {} };
  }
  return state.plan;
}

function hashStr(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Baraja siempre igual para la misma semilla.
function seededShuffle(arr, seed) {
  let a = seed;
  const rnd = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function planPool(g) {
  const p = state.plan;
  return seededShuffle(EJERCICIOS.filter((e) => e.grupo === g && p.materials.includes(e.material)), hashStr(g));
}

// Ejercicios de cada día de la semana actual.
function planWeek() {
  const p = state.plan;
  const w = weekNumber();
  // Cuántos ejercicios de cada grupo hay que poner cada día.
  const slots = p.days.map((groups) => {
    const count = {};
    const n = groups.length ? Math.max(p.perDay, groups.length) : 0;
    for (let k = 0; k < n; k++) { const g = groups[k % groups.length]; count[g] = (count[g] || 0) + 1; }
    return count;
  });
  const need = {};
  slots.forEach((c) => Object.entries(c).forEach(([g, n]) => { need[g] = (need[g] || 0) + n; }));
  const used = {};
  return p.days.map((groups, d) => {
    const salt = p.shuffles?.[`${w}-${d}`] || 0;
    let exercises = [];
    groups.forEach((g) => {
      const pool = planPool(g);
      const k = slots[d][g];
      // Cada semana empieza donde acabó la anterior, así no se repiten.
      const start = w * need[g] + (used[g] || 0) + salt * k;
      used[g] = (used[g] || 0) + k;
      for (let i = 0; i < Math.min(k, pool.length); i++) exercises.push(pool[(start + i) % pool.length]);
    });
    // Si el usuario ha cambiado o quitado ejercicios de este día, manda su lista.
    const custom = p.custom?.[`${w}-${d}`];
    if (custom && custom.sig === groups.join('|')) {
      exercises = custom.ids.map((id) => EJERCICIOS.find((e) => e.id === id)).filter(Boolean);
    }
    return { day: d, key: `${w}-${d}`, groups, exercises };
  });
}

// Solo guardamos los cambios de la semana actual.
function pruneWeekly(p) {
  const pre = `${weekNumber()}-`;
  for (const k of ['shuffles', 'custom']) {
    p[k] = Object.fromEntries(Object.entries(p[k] || {}).filter(([x]) => x.startsWith(pre)));
  }
}

function setDayExercises(d, ids) {
  const p = state.plan;
  pruneWeekly(p);
  p.custom[`${weekNumber()}-${d}`] = { sig: p.days[d].join('|'), ids };
}

// Pantalla para elegir un ejercicio nuevo (para cambiar uno o añadirlo).
function renderPlanPicker() {
  const { d, i } = subview;
  const day = planWeek()[d];
  const current = day.exercises[i];
  const taken = new Set(day.exercises.map((e) => e.id));
  title.textContent = current ? 'Cambiar ejercicio' : 'Añadir ejercicio';
  // Primero el grupo del ejercicio que se cambia.
  const groups = current ? [current.grupo, ...day.groups.filter((g) => g !== current.grupo)] : day.groups;
  view.innerHTML = `
    <button class="btn plain back" data-action="close-sub">‹ Volver</button>
    <p class="muted" style="margin:0 4px 12px">${current ? `Elige por cuál quieres cambiar <b>${esc(current.nombre)}</b> el ${DIAS[d].toLowerCase()}.` : `Elige qué ejercicio añadir el ${DIAS[d].toLowerCase()}.`}</p>
    ${groups.map((g) => {
      const list = EJERCICIOS.filter((e) => e.grupo === g && state.plan.materials.includes(e.material) && !taken.has(e.id));
      return `
        <div class="section-title">${g}</div>
        ${list.length ? `<div class="lib-grid">${list.map((e) => `
          <button class="lib-card" data-action="plan-pick" data-id="${e.id}">
            <span class="ex-img"><img src="${imgSrc(e)}" alt="" loading="lazy"></span>
            <span class="lib-name">${esc(e.nombre)}</span>
            <span class="lib-group">${e.material}</span>
          </button>`).join('')}</div>` : '<p class="muted" style="margin:0 4px">Ya están todos puestos.</p>'}`;
    }).join('')}
  `;
}

function planDone(key) {
  return state.sessions.some((s) => s.planKey === key);
}

function startPlanDay(d) {
  const p = state.plan;
  const day = planWeek()[d];
  startWorkout({
    id: null,
    name: `${DIAS[d]}: ${day.groups.join(', ')}`,
    exercises: day.exercises.map((e) => ({ name: e.nombre, sets: p.sets, reps: p.reps, weight: '' })),
  });
  state.active.planKey = day.key;
  save();
}

function planExList(exercises, d) {
  return `<div class="plan-ex">${exercises.map((e, i) => `
    <div class="plan-ex-row">
      <button class="plan-ex-open" data-action="open-exercise" data-id="${e.id}">
        <span class="ex-img thumb"><img src="${imgSrc(e)}" alt=""></span>
        <span class="grow">${esc(e.nombre)}</span>
      </button>
      <button class="icon-btn small-icon" data-action="plan-swap" data-d="${d}" data-i="${i}" aria-label="Cambiar ${esc(e.nombre)}">⇄</button>
      <button class="icon-btn small-icon" data-action="plan-remove" data-d="${d}" data-i="${i}" aria-label="Quitar ${esc(e.nombre)}">✕</button>
    </div>`).join('')}</div>
    <button class="btn plain small" data-action="plan-add" data-d="${d}">+ Añadir ejercicio</button>`;
}

const openDays = new Set(); // días de «Esta semana» desplegados

function renderPlanToday() {
  const week = planWeek();
  const t = todayIdx();
  const today = week[t];
  let html = `<div class="section-title">Hoy · ${DIAS[t]}</div>`;
  if (today.groups.length) {
    const done = planDone(today.key);
    html += `
      <div class="card">
        <div class="chips" style="margin-bottom:6px">${today.groups.map((g) => `<span class="chip">${g}</span>`).join('')}${done ? '<span class="chip done-chip">✓ Hecho</span>' : ''}</div>
        ${today.exercises.length ? '' : '<p class="muted">No hay ejercicios para hoy. Añade alguno o pulsa «Otros ejercicios».</p>'}
        ${planExList(today.exercises, t)}
        <div class="row between" style="margin-top:12px; gap:8px">
          <button class="btn plain small" data-action="plan-shuffle" data-d="${t}">↻ Otros ejercicios</button>
          ${today.exercises.length ? `<button class="btn" data-action="plan-start" data-d="${t}">${done ? 'Repetir' : 'Empezar'}</button>` : ''}
        </div>
      </div>`;
  } else {
    const next = [1, 2, 3, 4, 5, 6].map((k) => (t + k) % 7).find((d) => week[d].groups.length);
    html += `
      <div class="card">
        <h3>Hoy toca descanso 😌</h3>
        ${next !== undefined ? `<div class="muted">Próximo entreno: ${DIAS[next]} (${week[next].groups.join(', ')})</div>` : ''}
      </div>`;
  }
  const others = week.filter((d) => d.day !== t && d.groups.length);
  if (others.length) {
    html += `<div class="section-title">Esta semana</div>`;
    html += others.map((d) => `
      <div class="card">
        <div class="row between">
          <div class="grow">
            <h3>${DIAS[d.day]}${planDone(d.key) ? ' <span class="chip done-chip">✓ Hecho</span>' : ''}</h3>
            <div class="muted">${d.groups.join(', ')}</div>
          </div>
          ${d.exercises.length ? `<button class="btn small ghost" data-action="plan-start" data-d="${d.day}">Empezar</button>` : ''}
        </div>
        <details class="plan-more" data-day="${d.day}" ${openDays.has(d.day) ? 'open' : ''}>
          <summary>Ver ${d.exercises.length} ejercicio${d.exercises.length === 1 ? '' : 's'}</summary>
          ${planExList(d.exercises, d.day)}
        </details>
      </div>`).join('');
  }
  html += `<button class="btn plain block" data-action="plan-edit">Cambiar mi plan semanal</button>`;
  return html;
}

function renderPlanEditor() {
  const p = getPlan();
  title.textContent = 'Plan semanal';
  view.innerHTML = `
    <button class="btn plain back" data-action="close-sub">‹ Volver</button>
    <p class="muted" style="margin:0 4px 14px">Marca qué quieres entrenar cada día. Cada semana te pondré ejercicios distintos de esos grupos. Si no marcas nada, ese día es de descanso.</p>
    ${DIAS.map((name, d) => `
      <div class="card">
        <div class="row between"><h3>${name}</h3><span class="muted" data-rest="${d}" ${p.days[d].length ? 'hidden' : ''}>Descanso</span></div>
        <div class="chips" style="margin:6px 0 0">
          ${GRUPOS.map((g) => `<button class="chip-btn small ${p.days[d].includes(g) ? 'on' : ''}" data-action="plan-group" data-d="${d}" data-id="${g}">${g}</button>`).join('')}
        </div>
      </div>`).join('')}
    <div class="section-title">Ajustes</div>
    <div class="card">
      <div class="row between">
        <h3 class="grow" style="font-size:16px">Ejercicios por día</h3>
        <div class="stepper">
          <button class="icon-btn" data-action="plan-per" data-id="-1" aria-label="Menos">−</button>
          <b id="plan-per">${p.perDay}</b>
          <button class="icon-btn" data-action="plan-per" data-id="1" aria-label="Más">+</button>
        </div>
      </div>
      <h3 style="font-size:16px; margin-top:14px">Material que tienes</h3>
      <div class="chips" style="margin:6px 0 0">
        ${MATERIALES.map((m) => `<button class="chip-btn small ${p.materials.includes(m) ? 'on' : ''}" data-action="plan-mat" data-id="${m}">${m}</button>`).join('')}
      </div>
      <div class="ex-nums" style="grid-template-columns:1fr 1fr; margin-top:14px">
        <label><span>Series</span><input type="number" inputmode="numeric" min="1" data-bind="plan-sets" value="${esc(p.sets)}"></label>
        <label><span>Repeticiones</span><input type="number" inputmode="numeric" min="1" data-bind="plan-reps" value="${esc(p.reps)}"></label>
      </div>
    </div>
    <button class="btn block" data-action="plan-save" style="margin-top:8px">Guardar plan</button>
  `;
}

// ---------- Vistas ----------

const view = document.getElementById('view');
const title = document.getElementById('title');

// Al salir del editor (con Guardar o tocando otra pestaña), quita los
// ejercicios en blanco y borra las rutinas que se quedaron vacías.
function tidyRoutines() {
  const editing = subview?.type === 'edit-routine' ? subview.id : null;
  let changed = false;
  state.routines = state.routines.filter((r) => {
    if (r.id === editing) return true;
    const before = r.exercises.length;
    r.exercises = r.exercises.filter((e) => String(e.name).trim());
    if (r.exercises.length !== before) changed = true;
    if (!r.exercises.length && !r.name.trim()) { changed = true; return false; }
    if (!r.name.trim()) { r.name = 'Rutina sin nombre'; changed = true; }
    return true;
  });
  if (changed) save();
}

function render() {
  tidyRoutines();
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  clearInterval(tick);

  if (state.active && tab === 'hoy') return renderWorkout();
  if (subview?.type === 'edit-routine') return renderRoutineEditor();
  if (subview?.type === 'session') return renderSessionDetail();
  if (subview?.type === 'exercise') return renderExerciseDetail();
  if (subview?.type === 'plan') return renderPlanEditor();
  if (subview?.type === 'plan-pick') return renderPlanPicker();
  if (subview?.type === 'free') return renderFreeChooser();
  if (tab === 'hoy') return renderHome();
  if (tab === 'rutinas') return renderRoutines();
  if (tab === 'ejercicios') return renderLibrary();
  if (tab === 'historial') return renderHistory();
}

const imgSrc = (ej) => `img/ejercicios/${ej.id}.png`;
let libraryGroup = 'Todos';
let libraryMaterial = 'Todo';
const MATERIALES = ['Mancuernas', 'Peso corporal', 'Banda'];

function renderLibrary() {
  title.textContent = 'Ejercicios';
  view.innerHTML = `
    <input type="text" id="lib-search" placeholder="Buscar ejercicio…" style="margin-bottom:10px">
    <div class="chips">
      ${['Todos', ...GRUPOS].map((g) => `<button class="chip-btn ${g === libraryGroup ? 'on' : ''}" data-action="lib-group" data-id="${g}">${g}</button>`).join('')}
    </div>
    <div class="chips">
      ${['Todo', ...MATERIALES].map((m) => `<button class="chip-btn small ${m === libraryMaterial ? 'on' : ''}" data-action="lib-material" data-id="${m}">${m === 'Todo' ? 'Cualquier material' : m}</button>`).join('')}
    </div>
    <div class="lib-grid" id="lib-grid">
      ${EJERCICIOS.map((e) => `
        <button class="lib-card" data-action="open-exercise" data-id="${e.id}" data-grupo="${e.grupo}" data-material="${e.material}" data-q="${esc(e.nombre.toLowerCase())}">
          <span class="ex-img"><img src="${imgSrc(e)}" alt="" loading="lazy"></span>
          <span class="lib-name">${esc(e.nombre)}</span>
          <span class="lib-group">${e.grupo} · ${e.material}</span>
        </button>`).join('')}
    </div>
    <div class="empty" id="lib-empty" hidden><p>No hay ningún ejercicio con ese nombre.</p></div>
  `;
  filterLibrary();
}

function filterLibrary() {
  const q = (document.getElementById('lib-search')?.value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  let shown = 0;
  document.querySelectorAll('.lib-card').forEach((c) => {
    const name = c.dataset.q.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const ok = (libraryGroup === 'Todos' || c.dataset.grupo === libraryGroup)
      && (libraryMaterial === 'Todo' || c.dataset.material === libraryMaterial)
      && name.includes(q);
    c.hidden = !ok;
    if (ok) shown++;
  });
  document.getElementById('lib-empty').hidden = shown > 0;
}

function renderExerciseDetail() {
  const e = EJERCICIOS.find((x) => x.id === subview.id);
  if (!e) { subview = null; return render(); }
  title.textContent = e.nombre;
  const enRutinas = state.routines.filter((r) => r.exercises.some((x) => ejercicioPorNombre(x.name)?.id === e.id));
  view.innerHTML = `
    <button class="btn plain back" data-action="close-sub">‹ ${tab === 'ejercicios' ? 'Ejercicios' : 'Volver'}</button>
    <div class="card">
      <div class="ex-img big"><img src="${imgSrc(e)}" alt="Dibujo de ${esc(e.nombre)}"></div>
      <span class="chip" style="margin-top:14px">${e.grupo}</span>
      <span class="chip muted-chip">${e.material}</span>
      <h3 style="margin-top:8px">Cómo se hace</h3>
      <p class="how">${esc(e.resumen)}</p>
    </div>
    ${enRutinas.length ? `<div class="muted" style="margin:0 4px 12px">En tus rutinas: ${enRutinas.map((r) => esc(r.name)).join(', ')}</div>` : ''}
    ${state.routines.length ? `
      <div class="section-title">Añadir a una rutina</div>
      ${state.routines.map((r) => `
        <div class="card row between">
          <h3 class="grow">${esc(r.name)}</h3>
          <button class="btn small ghost" data-action="add-to-routine" data-id="${r.id}">+ Añadir</button>
        </div>`).join('')}` : ''}
    <button class="btn ghost block" data-action="new-routine-with">Crear rutina con este ejercicio</button>
  `;
}

// Ficha plegable con dibujo y explicación, para el editor y el entreno.
function howTo(name) {
  const e = ejercicioPorNombre(name);
  if (!e) return '';
  return `
    <details class="howto">
      <summary><span class="ex-img thumb"><img src="${imgSrc(e)}" alt=""></span> ¿Cómo se hace?</summary>
      <div class="ex-img big"><img src="${imgSrc(e)}" alt="Dibujo de ${esc(e.nombre)}"></div>
      <p class="how">${esc(e.resumen)}</p>
    </details>`;
}

function renderHome() {
  title.textContent = 'Mi Entreno';
  const routines = state.routines;
  view.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${weekCount()}</b><span>esta semana</span></div>
      <div class="stat"><b>${streakWeeks()}</b><span>semanas seguidas</span></div>
      <div class="stat"><b>${state.sessions.length}</b><span>en total</span></div>
    </div>
    ${hasPlan() ? renderPlanToday() : `
      <div class="card plan-promo">
        <h3>Plan semanal</h3>
        <p class="muted" style="margin:0 0 12px">Elige qué días entrenas y qué quieres trabajar. Cada semana te propongo ejercicios distintos.</p>
        <button class="btn" data-action="plan-edit">Crear mi plan</button>
      </div>`}
    ${hasPlan() ? '' : `
    <div class="section-title">Empieza un entreno</div>
    ${routines.length ? routines.map((r) => `
      <div class="card row between">
        <div class="grow">
          <h3>${esc(r.name)}</h3>
          <div class="muted">${r.exercises.length} ejercicio${r.exercises.length === 1 ? '' : 's'}</div>
        </div>
        <button class="btn" data-action="start" data-id="${r.id}">Empezar</button>
      </div>`).join('') : `
      <div class="card empty">
        <p>Todavía no tienes rutinas.<br>Crea la primera para empezar a entrenar.</p>
        <button class="btn" data-action="new-routine">Crear rutina</button>
      </div>`}`}
    <button class="btn ghost block" data-action="start-empty">Entreno libre</button>
  `;
}

// Al pulsar «Entreno libre»: elegir una rutina propia o empezar en blanco.
function renderFreeChooser() {
  title.textContent = 'Entreno libre';
  const list = state.routines.filter((r) => r.exercises.length);
  view.innerHTML = `
    <button class="btn plain back" data-action="close-sub">‹ Volver</button>
    <div class="section-title">Tus rutinas</div>
    ${list.map((r) => `
      <div class="card row between">
        <div class="grow">
          <h3>${esc(r.name)}</h3>
          <div class="muted">${r.exercises.map((e) => esc(e.name)).join(' · ')}</div>
        </div>
        <button class="btn" data-action="start" data-id="${r.id}">Empezar</button>
      </div>`).join('')}
    <div class="section-title">O sin rutina</div>
    <button class="btn ghost block" data-action="start-blank">Empezar en blanco</button>
  `;
}

function renderRoutines() {
  title.textContent = 'Rutinas';
  view.innerHTML = `
    <div class="card" data-action="plan-edit" style="cursor:pointer">
      <div class="row between"><h3>Plan semanal</h3><span class="muted">${hasPlan() ? 'Editar ›' : 'Crear ›'}</span></div>
      <div class="muted">${hasPlan() ? state.plan.days.map((g, d) => g.length ? `${DIAS[d].slice(0, 3)}: ${g.join(', ')}` : '').filter(Boolean).join(' · ') : 'Ejercicios distintos cada semana según los días y grupos que elijas.'}</div>
    </div>
    <button class="btn block" data-action="new-routine" style="margin-bottom:16px">+ Nueva rutina</button>
    ${state.routines.length ? state.routines.map((r) => `
      <div class="card" data-action="edit-routine" data-id="${r.id}" style="cursor:pointer">
        <div class="row between">
          <h3>${esc(r.name)}</h3>
          <span class="muted">Editar ›</span>
        </div>
        <div class="muted">${r.exercises.map((e) => esc(e.name)).join(' · ') || 'Sin ejercicios'}</div>
        ${r.exercises.length ? `<button class="btn small" data-action="start" data-id="${r.id}" style="margin-top:10px">Empezar</button>` : ''}
      </div>`).join('') : `<div class="empty"><p>Aquí verás tus rutinas.<br>Por ejemplo: «Pierna», «Torso» o «Cardio en casa».</p></div>`}
  `;
}

function renderRoutineEditor() {
  const r = state.routines.find((x) => x.id === subview.id);
  if (!r) { subview = null; return render(); }
  title.textContent = r.name || 'Nueva rutina';
  view.innerHTML = `
    <button class="btn plain back" data-action="close-sub">‹ Rutinas</button>
    <label class="field"><span>Nombre de la rutina</span>
      <input type="text" data-bind="routine-name" value="${esc(r.name)}" placeholder="Ej.: Pierna">
    </label>
    <div class="section-title">Ejercicios</div>
    ${r.exercises.map((e, i) => `
      <div class="card">
        <div class="ex-edit">
          <input type="text" list="lista-ejercicios" data-bind="ex-name" data-i="${i}" value="${esc(e.name)}" placeholder="Escribe o elige un ejercicio">
          <button class="icon-btn" data-action="del-ex" data-i="${i}" aria-label="Quitar ejercicio">✕</button>
        </div>
        <div data-howto="${i}">${howTo(e.name)}</div>
        <div class="ex-nums">
          <label><span>Series</span><input type="number" inputmode="numeric" min="1" data-bind="ex-sets" data-i="${i}" value="${esc(e.sets)}"></label>
          <label><span>Repeticiones</span><input type="number" inputmode="numeric" min="0" data-bind="ex-reps" data-i="${i}" value="${esc(e.reps)}"></label>
          <label><span>Peso (kg)</span><input type="number" inputmode="decimal" min="0" step="0.5" data-bind="ex-weight" data-i="${i}" value="${esc(e.weight)}" placeholder="—"></label>
        </div>
      </div>`).join('')}
    <button class="btn ghost block" data-action="add-ex">+ Añadir ejercicio</button>
    <div style="height:24px"></div>
    <button class="btn block" data-action="close-sub">Guardar</button>
    <button class="btn danger block" data-action="del-routine">Borrar rutina</button>
  `;
  if (!r.name) view.querySelector('[data-bind="routine-name"]').focus();
}

function renderWorkout() {
  const a = state.active;
  title.textContent = a.name;
  view.innerHTML = `
    <div class="card row between">
      <div><div class="muted">Tiempo</div><div class="timer" id="elapsed">0:00</div></div>
      <button class="btn" data-action="finish">Terminar</button>
    </div>
    ${a.exercises.map((ex, ei) => `
      <div class="card">
        <div class="ex-edit">
          <input type="text" list="lista-ejercicios" data-bind="w-name" data-ei="${ei}" value="${esc(ex.name)}" placeholder="Nombre del ejercicio" style="font-weight:600">
          <button class="icon-btn" data-action="w-del-ex" data-ei="${ei}" aria-label="Quitar ejercicio">✕</button>
        </div>
        <div data-howto-w="${ei}">${howTo(ex.name)}</div>
        ${ex.hint ? `<div class="muted" style="margin-top:6px">Última vez: ${esc(ex.hint)}</div>` : ''}
        <div class="set-head"><span>Serie</span><span>Kg</span><span>Reps</span><span></span></div>
        ${ex.sets.map((s, si) => `
          <div class="set-row ${s.done ? 'done' : ''}">
            <span class="n">${si + 1}</span>
            <input type="number" inputmode="decimal" step="0.5" min="0" data-bind="w-weight" data-ei="${ei}" data-si="${si}" value="${esc(s.weight)}" placeholder="—">
            <input type="number" inputmode="numeric" min="0" data-bind="w-reps" data-ei="${ei}" data-si="${si}" value="${esc(s.reps)}" placeholder="—">
            <button class="check" data-action="toggle-set" data-ei="${ei}" data-si="${si}" aria-label="Serie hecha">✓</button>
          </div>`).join('')}
        <div class="row between" style="margin-top:6px">
          <button class="btn plain small" data-action="add-set" data-ei="${ei}">+ Añadir serie</button>
          ${ex.sets.length > 1 ? `<button class="btn plain small" style="color:var(--muted)" data-action="del-set" data-ei="${ei}">Quitar serie</button>` : ''}
        </div>
      </div>`).join('')}
    <button class="btn ghost block" data-action="w-add-ex">+ Añadir ejercicio</button>
    <div style="height:12px"></div>
    <button class="btn danger block" data-action="cancel">Descartar entreno</button>
  `;
  const el = document.getElementById('elapsed');
  const upd = () => { el.textContent = fmtDuration(Math.floor((Date.now() - a.start) / 1000)); };
  upd();
  tick = setInterval(upd, 1000);
}

function renderHistory() {
  title.textContent = 'Historial';
  const list = [...state.sessions].reverse();
  view.innerHTML = list.length ? list.map((s) => `
    <div class="card" data-action="open-session" data-id="${s.id}" style="cursor:pointer">
      <div class="row between">
        <h3>${esc(s.name)}</h3>
        <span class="chip">${fmtDuration(s.duration)}</span>
      </div>
      <div class="muted">${fmtDate(s.date)}</div>
      <div class="muted">${doneSets(s)} serie${doneSets(s) === 1 ? '' : 's'}${sessionVolume(s) ? ` · ${Math.round(sessionVolume(s)).toLocaleString('es-ES')} kg movidos` : ''}</div>
    </div>`).join('') : `<div class="empty"><p>Cuando termines un entreno aparecerá aquí.</p></div>`;
}

function renderSessionDetail() {
  const s = state.sessions.find((x) => x.id === subview.id);
  if (!s) { subview = null; return render(); }
  title.textContent = s.name;
  view.innerHTML = `
    <button class="btn plain back" data-action="close-sub">‹ Historial</button>
    <div class="card">
      <div class="muted">${fmtDate(s.date)}</div>
      <div class="muted">Duración ${fmtDuration(s.duration)} · ${doneSets(s)} serie${doneSets(s) === 1 ? '' : 's'}</div>
    </div>
    ${s.exercises.filter((ex) => ex.sets.some((x) => x.done)).map((ex) => `
      <div class="card">
        <h3>${esc(ex.name || 'Ejercicio')}</h3>
        ${ex.sets.filter((x) => x.done).map((x, i) => `
          <div class="hist-ex"><span class="muted">Serie ${i + 1}</span><span>${x.weight !== '' ? `${esc(x.weight)} kg × ` : ''}${esc(x.reps || 0)} reps</span></div>`).join('')}
      </div>`).join('')}
    <button class="btn danger block" data-action="del-session">Borrar este entreno</button>
  `;
}

// ---------- Acciones ----------

// Ventana de confirmación propia: en el iPhone, con la app instalada,
// el aviso del sistema (confirm) a veces no aparece y el botón no hace nada.
function ask(message, okLabel = 'Sí') {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true">
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn ghost" data-m="0">Cancelar</button>
          <button class="btn danger-solid" data-m="1">${esc(okLabel)}</button>
        </div>
      </div>`;
    m.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const b = ev.target.closest('[data-m]');
      if (!b && ev.target !== m) return;
      m.remove();
      resolve(b?.dataset.m === '1');
    });
    document.body.appendChild(m);
  });
}

function confirmThen(message, okLabel, fn) {
  ask(message, okLabel).then((ok) => {
    if (!ok) return;
    fn();
    save();
    render();
  });
}

function startWorkout(routine) {
  state.active = {
    routineId: routine?.id || null,
    name: routine?.name || 'Entreno libre',
    start: Date.now(),
    exercises: (routine?.exercises || []).map((e) => {
      const last = lastFor(e.name);
      const weight = last && last.weight !== '' ? last.weight : e.weight;
      return {
        name: e.name,
        hint: last ? `${last.weight !== '' ? last.weight + ' kg × ' : ''}${last.reps} reps` : '',
        sets: Array.from({ length: Math.max(1, Number(e.sets) || 1) }, () => ({ weight, reps: e.reps, done: false })),
      };
    }),
  };
  if (!state.active.exercises.length) state.active.exercises.push({ name: '', hint: '', sets: [{ weight: '', reps: '', done: false }] });
  tab = 'hoy';
  subview = null;
  save();
  render();
}

async function finishWorkout() {
  const a = state.active;
  if (!doneSets(a)) {
    if (!(await ask('No has marcado ninguna serie como hecha. ¿Terminar igualmente sin guardar?', 'Terminar'))) return;
    state.active = null;
  } else {
    state.sessions.push({
      id: uid(),
      routineId: a.routineId,
      name: a.name,
      date: new Date(a.start).toISOString(),
      duration: Math.floor((Date.now() - a.start) / 1000),
      exercises: a.exercises.map((ex) => ({ name: ex.name, sets: ex.sets })),
      ...(a.planKey ? { planKey: a.planKey } : {}),
    });
    state.active = null;
    tab = 'historial';
  }
  stopRest();
  save();
  render();
}

function startRest() {
  restEnd = Date.now() + REST_SECONDS * 1000;
  document.getElementById('rest').hidden = false;
  updateRest();
}

function stopRest() {
  restEnd = 0;
  document.getElementById('rest').hidden = true;
}

function updateRest() {
  if (!restEnd) return;
  const left = Math.ceil((restEnd - Date.now()) / 1000);
  if (left <= 0) {
    stopRest();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    return;
  }
  document.getElementById('rest-time').textContent = fmtDuration(left);
}
setInterval(updateRest, 250);

document.addEventListener('click', (ev) => {
  const tabBtn = ev.target.closest('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab; subview = null; render(); window.scrollTo(0, 0); return; }

  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  const ei = Number(el.dataset.ei), i = Number(el.dataset.i), si = Number(el.dataset.si);
  const routine = subview?.type === 'edit-routine' ? state.routines.find((r) => r.id === subview.id) : null;
  const a = state.active;

  switch (action) {
    case 'new-routine': {
      const r = { id: uid(), name: '', exercises: [{ name: '', sets: 3, reps: 10, weight: '' }] };
      state.routines.push(r);
      tab = 'rutinas';
      subview = { type: 'edit-routine', id: r.id };
      break;
    }
    case 'edit-routine': subview = { type: 'edit-routine', id }; break;
    case 'close-sub':
      if (routine) {
        routine.exercises = routine.exercises.filter((e) => e.name.trim());
        if (!routine.name.trim()) routine.name = 'Rutina sin nombre';
      }
      subview = null;
      break;
    case 'add-ex': routine.exercises.push({ name: '', sets: 3, reps: 10, weight: '' }); break;
    case 'del-ex': routine.exercises.splice(i, 1); break;
    case 'del-routine':
      confirmThen('¿Borrar esta rutina? Tus entrenos guardados no se borran.', 'Borrar', () => {
        state.routines = state.routines.filter((r) => r.id !== subview.id);
        subview = null;
      });
      return;
    case 'start': startWorkout(state.routines.find((r) => r.id === id)); return;
    case 'start-empty':
      // Si tiene rutinas propias, primero le dejamos elegir.
      if (state.routines.some((r) => r.exercises.length)) { subview = { type: 'free' }; window.scrollTo(0, 0); break; }
      startWorkout(null);
      return;
    case 'start-blank': startWorkout(null); return;
    case 'toggle-set': {
      const s = a.exercises[ei].sets[si];
      s.done = !s.done;
      if (s.done) startRest();
      break;
    }
    case 'add-set': {
      const sets = a.exercises[ei].sets;
      const prev = sets[sets.length - 1] || {};
      sets.push({ weight: prev.weight ?? '', reps: prev.reps ?? '', done: false });
      break;
    }
    case 'del-set': a.exercises[ei].sets.pop(); break;
    case 'w-add-ex': a.exercises.push({ name: '', hint: '', sets: [{ weight: '', reps: '', done: false }] }); break;
    case 'w-del-ex': a.exercises.splice(ei, 1); break;
    case 'finish': finishWorkout(); return;
    case 'cancel':
      confirmThen('¿Descartar este entreno? No se guardará nada.', 'Descartar', () => {
        state.active = null;
        stopRest();
      });
      return;
    case 'rest-add': restEnd += 15000; updateRest(); return;
    case 'rest-skip': stopRest(); return;
    case 'open-session': subview = { type: 'session', id }; break;
    case 'open-exercise': subview = { type: 'exercise', id }; window.scrollTo(0, 0); break;
    case 'lib-group':
      libraryGroup = id;
      document.querySelectorAll('[data-action="lib-group"]').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      filterLibrary();
      return;
    case 'lib-material':
      libraryMaterial = id;
      document.querySelectorAll('[data-action="lib-material"]').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      filterLibrary();
      return;
    case 'add-to-routine': {
      const ej = EJERCICIOS.find((x) => x.id === subview.id);
      const r = state.routines.find((x) => x.id === id);
      r.exercises.push({ name: ej.nombre, sets: 3, reps: 10, weight: '' });
      el.textContent = '✓ Añadido';
      el.disabled = true;
      save();
      return;
    }
    case 'new-routine-with': {
      const ej = EJERCICIOS.find((x) => x.id === subview.id);
      const r = { id: uid(), name: '', exercises: [{ name: ej.nombre, sets: 3, reps: 10, weight: '' }] };
      state.routines.push(r);
      tab = 'rutinas';
      subview = { type: 'edit-routine', id: r.id };
      break;
    }
    case 'plan-edit': getPlan(); subview = { type: 'plan' }; window.scrollTo(0, 0); break;
    case 'plan-start': startPlanDay(Number(el.dataset.d)); return;
    case 'plan-shuffle': {
      const p = state.plan, key = `${weekNumber()}-${el.dataset.d}`;
      pruneWeekly(p);
      p.shuffles[key] = (p.shuffles[key] || 0) + 1;
      delete p.custom[key];
      break;
    }
    case 'plan-swap': subview = { type: 'plan-pick', d: Number(el.dataset.d), i }; homeScroll = window.scrollY; window.scrollTo(0, 0); break;
    case 'plan-add': subview = { type: 'plan-pick', d: Number(el.dataset.d), i: -1 }; homeScroll = window.scrollY; window.scrollTo(0, 0); break;
    case 'plan-remove': {
      const d = Number(el.dataset.d);
      const ids = planWeek()[d].exercises.map((e) => e.id);
      ids.splice(i, 1);
      setDayExercises(d, ids);
      break;
    }
    case 'plan-pick': {
      const { d, i: at } = subview;
      const ids = planWeek()[d].exercises.map((e) => e.id);
      if (at >= 0) ids[at] = id; else ids.push(id);
      setDayExercises(d, ids);
      subview = null;
      save();
      render();
      window.scrollTo(0, homeScroll);
      return;
    }
    case 'plan-group': {
      const days = state.plan.days[Number(el.dataset.d)];
      const at = days.indexOf(id);
      if (at >= 0) days.splice(at, 1); else days.push(id);
      days.sort((x, y) => GRUPOS.indexOf(x) - GRUPOS.indexOf(y));
      el.classList.toggle('on', at < 0);
      document.querySelector(`[data-rest="${el.dataset.d}"]`).hidden = days.length > 0;
      save();
      return;
    }
    case 'plan-mat': {
      const mats = state.plan.materials;
      const at = mats.indexOf(id);
      if (at >= 0) { if (mats.length === 1) return; mats.splice(at, 1); } else mats.push(id);
      el.classList.toggle('on', at < 0);
      save();
      return;
    }
    case 'plan-per': {
      const p = state.plan;
      p.perDay = Math.min(10, Math.max(2, p.perDay + Number(id)));
      document.getElementById('plan-per').textContent = p.perDay;
      save();
      return;
    }
    case 'plan-save': subview = null; tab = 'hoy'; window.scrollTo(0, 0); break;
    case 'del-session':
      confirmThen('¿Borrar este entreno del historial?', 'Borrar', () => {
        state.sessions = state.sessions.filter((s) => s.id !== subview.id);
        subview = null;
      });
      return;
    default: return;
  }
  save();
  render();
});

document.addEventListener('toggle', (ev) => {
  const day = ev.target.dataset?.day;
  if (day === undefined) return;
  if (ev.target.open) openDays.add(Number(day)); else openDays.delete(Number(day));
}, true);

// Guardar lo que se escribe sin volver a pintar la pantalla (para no perder el foco).
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id === 'lib-search') return filterLibrary();
  const bind = el.dataset.bind;
  if (!bind) return;
  const routine = subview?.type === 'edit-routine' ? state.routines.find((r) => r.id === subview.id) : null;
  const a = state.active;
  const i = Number(el.dataset.i), ei = Number(el.dataset.ei), si = Number(el.dataset.si);

  switch (bind) {
    case 'routine-name': routine.name = el.value; title.textContent = el.value || 'Nueva rutina'; break;
    case 'ex-name':
      routine.exercises[i].name = el.value;
      document.querySelector(`[data-howto="${i}"]`).innerHTML = howTo(el.value);
      break;
    case 'ex-sets': routine.exercises[i].sets = num(el.value); break;
    case 'ex-reps': routine.exercises[i].reps = num(el.value); break;
    case 'ex-weight': routine.exercises[i].weight = num(el.value); break;
    case 'w-name':
      a.exercises[ei].name = el.value;
      document.querySelector(`[data-howto-w="${ei}"]`).innerHTML = howTo(el.value);
      break;
    case 'w-weight': a.exercises[ei].sets[si].weight = num(el.value); break;
    case 'w-reps': a.exercises[ei].sets[si].reps = num(el.value); break;
    case 'plan-sets': state.plan.sets = num(el.value) || 3; break;
    case 'plan-reps': state.plan.reps = num(el.value) || 12; break;
  }
  save();
});

document.getElementById('lista-ejercicios').innerHTML =
  EJERCICIOS.map((e) => `<option value="${esc(e.nombre)}">${e.grupo}</option>`).join('');

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
