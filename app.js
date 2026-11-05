// Mi Entreno — todo se guarda en este dispositivo (localStorage).

const STORE_KEY = 'mientreno:v1';
const REST_SECONDS = 90;

const state = load();
let tab = 'hoy';
let subview = null; // { type: 'edit-routine', id } | { type: 'session', id }
let tick = null;
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

// ---------- Vistas ----------

const view = document.getElementById('view');
const title = document.getElementById('title');

function render() {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  clearInterval(tick);

  if (state.active && tab === 'hoy') return renderWorkout();
  if (subview?.type === 'edit-routine') return renderRoutineEditor();
  if (subview?.type === 'session') return renderSessionDetail();
  if (tab === 'hoy') return renderHome();
  if (tab === 'rutinas') return renderRoutines();
  if (tab === 'historial') return renderHistory();
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
      </div>`}
    <button class="btn ghost block" data-action="start-empty">Entreno libre</button>
  `;
}

function renderRoutines() {
  title.textContent = 'Rutinas';
  view.innerHTML = `
    <button class="btn block" data-action="new-routine" style="margin-bottom:16px">+ Nueva rutina</button>
    ${state.routines.length ? state.routines.map((r) => `
      <div class="card" data-action="edit-routine" data-id="${r.id}" style="cursor:pointer">
        <div class="row between">
          <h3>${esc(r.name)}</h3>
          <span class="muted">Editar ›</span>
        </div>
        <div class="muted">${r.exercises.map((e) => esc(e.name)).join(' · ') || 'Sin ejercicios'}</div>
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
          <input type="text" data-bind="ex-name" data-i="${i}" value="${esc(e.name)}" placeholder="Ej.: Sentadilla">
          <button class="icon-btn" data-action="del-ex" data-i="${i}" aria-label="Quitar ejercicio">✕</button>
        </div>
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
          <input type="text" data-bind="w-name" data-ei="${ei}" value="${esc(ex.name)}" placeholder="Nombre del ejercicio" style="font-weight:600">
          <button class="icon-btn" data-action="w-del-ex" data-ei="${ei}" aria-label="Quitar ejercicio">✕</button>
        </div>
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

function finishWorkout() {
  const a = state.active;
  if (!doneSets(a)) {
    if (!confirm('No has marcado ninguna serie como hecha. ¿Terminar igualmente sin guardar?')) return;
    state.active = null;
  } else {
    state.sessions.push({
      id: uid(),
      routineId: a.routineId,
      name: a.name,
      date: new Date(a.start).toISOString(),
      duration: Math.floor((Date.now() - a.start) / 1000),
      exercises: a.exercises.map((ex) => ({ name: ex.name, sets: ex.sets })),
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
      if (!confirm('¿Borrar esta rutina? Tus entrenos guardados no se borran.')) return;
      state.routines = state.routines.filter((r) => r.id !== subview.id);
      subview = null;
      break;
    case 'start': startWorkout(state.routines.find((r) => r.id === id)); return;
    case 'start-empty': startWorkout(null); return;
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
      if (!confirm('¿Descartar este entreno? No se guardará nada.')) return;
      state.active = null;
      stopRest();
      break;
    case 'rest-add': restEnd += 15000; updateRest(); return;
    case 'rest-skip': stopRest(); return;
    case 'open-session': subview = { type: 'session', id }; break;
    case 'del-session':
      if (!confirm('¿Borrar este entreno del historial?')) return;
      state.sessions = state.sessions.filter((s) => s.id !== subview.id);
      subview = null;
      break;
    default: return;
  }
  save();
  render();
});

// Guardar lo que se escribe sin volver a pintar la pantalla (para no perder el foco).
document.addEventListener('input', (ev) => {
  const el = ev.target;
  const bind = el.dataset.bind;
  if (!bind) return;
  const routine = subview?.type === 'edit-routine' ? state.routines.find((r) => r.id === subview.id) : null;
  const a = state.active;
  const i = Number(el.dataset.i), ei = Number(el.dataset.ei), si = Number(el.dataset.si);

  switch (bind) {
    case 'routine-name': routine.name = el.value; title.textContent = el.value || 'Nueva rutina'; break;
    case 'ex-name': routine.exercises[i].name = el.value; break;
    case 'ex-sets': routine.exercises[i].sets = num(el.value); break;
    case 'ex-reps': routine.exercises[i].reps = num(el.value); break;
    case 'ex-weight': routine.exercises[i].weight = num(el.value); break;
    case 'w-name': a.exercises[ei].name = el.value; break;
    case 'w-weight': a.exercises[ei].sets[si].weight = num(el.value); break;
    case 'w-reps': a.exercises[ei].sets[si].reps = num(el.value); break;
  }
  save();
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
