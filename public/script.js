// ===== CONFIG =====
const API_URL = ""; // Usa el mismo servidor Express (rutas relativas)
const DEFAULT_CYCLE_LENGTH = 28;
const NOTIFICATION_THRESHOLD_DAYS = 3;

// ===== SELECTORES =====
const calendarGrid = document.getElementById("calendar");
const monthYearLabel = document.getElementById("monthYear");
const predictionLabel = document.querySelector(".big-text") || document.getElementById("countdownNumber");
const predictionSubtext = document.querySelector(".card.highlight p:last-child");

// Formulario
const regDateTitle = document.getElementById("reg-date-title");
const toggleMenstruationBtn = document.querySelector(".toggle-btn");
const intensityButtons = document.querySelectorAll(".btn-small");
const notesArea = document.getElementById("notesArea");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.querySelector(".reset-btn");
const moodFeedback = document.getElementById("moodFeedback");

// Voz de Dr. Latigo
const micBtn = document.getElementById("micBtn");
const muteBtn = document.getElementById("muteBtn");
const voiceSettingsBtn = document.getElementById("voiceSettingsBtn");
const voiceSettings = document.getElementById("voiceSettings");
const voiceRate = document.getElementById("voiceRate");
const voiceRateValue = document.getElementById("voiceRateValue");
const voiceLanguage = document.getElementById("voiceLanguage");
const voiceStatus = document.getElementById("voiceStatus");
const voiceWave = document.getElementById("voiceWave");
const voiceTranscript = document.getElementById("voiceTranscript");
const doctorGreeting = document.getElementById("doctorGreeting");

// Nuevos elementos
const quickRegisterBtn = document.getElementById("quickRegisterBtn");
const countdownNumber = document.getElementById("countdownNumber");
const countdownDate = document.getElementById("countdownDate");
const phaseRing = document.getElementById("phaseRing");
const phaseTitleEl = document.querySelector(".phase-info .phase-title");
const phaseDescEl = document.querySelector(".phase-info .phase-desc");
const phaseBadge = document.getElementById("phaseBadge");
const phaseDetail = document.getElementById("phaseDetail");
const phaseProgressFill = document.getElementById("phaseProgressFill");
const phaseDayInfo = document.getElementById("phaseDayInfo");
const notifToggle = document.getElementById("notifToggle");
const historyToggle = document.getElementById("historyToggle");
const historyContent = document.getElementById("historyContent");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const toast = document.getElementById("toast");

// ===== ESTADO =====
let currentDate = new Date();
let selectedDateKey = null;
let cycleData = {};
let cycleDbPromise = null;
let recognition = null;
let isListening = false;
let stopRequested = false;
let recognitionRestartTimer = null;
let isVoiceMuted = false;
let voiceConversation = [];
let currentIntensity = 2;
let chartInstance = null;
let isMenstruation = false;
let notificationsEnabled = false;
let moodNotificationTimers = [];
let cycleSettings = JSON.parse(localStorage.getItem("cycleSettings")) || {
    notifications: false,
    advanceDays: NOTIFICATION_THRESHOLD_DAYS
};

// ===== ALMACENAMIENTO INDEXEDDB =====
function openCycleDatabase() {
    if (cycleDbPromise) return cycleDbPromise;
    cycleDbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("IndexedDB no está disponible"));
            return;
        }
        let request = indexedDB.open("yosseling-cycle-db", 1);
        request.onupgradeneeded = () => {
            let database = request.result;
            if (!database.objectStoreNames.contains("cycle_logs")) {
                database.createObjectStore("cycle_logs", { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB"));
    });
    return cycleDbPromise;
}

function getData() {
    return cycleData;
}

async function persistCycleData(data) {
    cycleData = data;
    try {
        let database = await openCycleDatabase();
        let transaction = database.transaction("cycle_logs", "readwrite");
        let store = transaction.objectStore("cycle_logs");
        await new Promise((resolve, reject) => {
            let clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                Object.entries(data).forEach(([date, value]) => {
                    store.put({ id: date, date, ...value });
                });
            };
            clearRequest.onerror = () => reject(clearRequest.error);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
    } catch (error) {
        localStorage.setItem("cicloData", JSON.stringify(data));
        console.warn("IndexedDB no disponible:", error.message);
    }
}

async function hydrateCycleData() {
    try {
        let database = await openCycleDatabase();
        let rows = await new Promise((resolve, reject) => {
            let request = database.transaction("cycle_logs", "readonly").objectStore("cycle_logs").getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        cycleData = Object.fromEntries(rows.map(row => {
            let { id, date, ...value } = row;
            return [date || id, value];
        }));

        if (Object.keys(cycleData).length === 0) {
            let legacy = JSON.parse(localStorage.getItem("cicloData") || "{}");
            if (Object.keys(legacy).length > 0) await persistCycleData(legacy);
        }
    } catch (error) {
        cycleData = JSON.parse(localStorage.getItem("cicloData") || "{}");
        console.warn("Se usará almacenamiento local de respaldo:", error.message);
    }
}

function saveData(data) {
    cycleData = data;
    void persistCycleData(data);
}

// ===== TOAST =====
function showToast(message, duration = 3000) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), duration);
}

// ===== ESCAPE HTML para prevenir XSS =====
function escapeHtml(text) {
    let div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ===== OBTENER CICLOS REGISTRADOS (inicios de periodo) =====
function getCycleStarts(data) {
    return Object.keys(data)
        .filter(d => data[d].menstruation)
        .map(d => {
            let parts = d.split("-");
            return {
                key: d,
                date: new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])),
                intensity: data[d].intensity,
                notes: data[d].notes
            };
        })
        .sort((a, b) => a.date - b.date);
}

// ===== CALCULAR LONGITUD PROMEDIO DEL CICLO =====
function getAverageCycleLength(data) {
    let starts = getCycleStarts(data);
    if (starts.length < 2) return DEFAULT_CYCLE_LENGTH;
    let diffs = [];
    for (let i = 1; i < starts.length; i++) {
        diffs.push((starts[i].date - starts[i - 1].date) / (1000 * 60 * 60 * 24));
    }
    return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
}

// ===== PREDICCIÓN DEL PRÓXIMO CICLO =====
function predictNextCycle(data) {
    let starts = getCycleStarts(data);
    if (starts.length === 0) return null;
    let avgLength = getAverageCycleLength(data);
    let lastStart = starts[starts.length - 1].date;
    let next = new Date(lastStart);
    next.setDate(next.getDate() + avgLength);
    return next;
}

// ===== FASE DEL CICLO =====
function getCyclePhase(data) {
    let starts = getCycleStarts(data);
    if (starts.length === 0) return null;

    let lastStart = starts[starts.length - 1].date;
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let diff = Math.floor((today - lastStart) / (1000 * 60 * 60 * 24));
    let cycleLen = getAverageCycleLength(data);

    if (diff < 0) return null;

    let phase, desc, dayInfo, progress;

    if (diff <= 5) {
        phase = "🩸 Menstruación";
        desc = "Descanso y recuperación";
        dayInfo = `Día ${diff + 1} de aproximadamente 5`;
        progress = ((diff + 1) / 5) * 100;
    } else if (diff <= 13) {
        phase = "🌱 Folicular";
        desc = "Energía en aumento";
        dayInfo = `Día ${diff + 1} del ciclo`;
        progress = ((diff - 5) / 8) * 100;
    } else if (diff <= 16) {
        phase = "🔥 Ovulación";
        desc = "Días fértiles, alta energía";
        dayInfo = `Día ${diff + 1} del ciclo`;
        progress = ((diff - 13) / 3) * 100;
    } else {
        phase = "🌙 Lútea";
        desc = "Relajación y preparación";
        dayInfo = `Día ${diff + 1} del ciclo (de ~${cycleLen})`;
        progress = ((diff - 16) / (cycleLen - 16)) * 100;
    }

    return { name: phase, desc, dayInfo, progress: Math.min(100, Math.max(0, progress)), cycleDay: diff + 1 };
}

// ===== RENDERIZAR FASE VISUAL =====
function renderPhase(data) {
    let phase = getCyclePhase(data);
    let starts = getCycleStarts(data);

    if (!phase || starts.length === 0) {
        if (phaseTitleEl) phaseTitleEl.textContent = "Sin datos";
        if (phaseDescEl) phaseDescEl.textContent = "Registra tu ciclo";
        if (phaseBadge) phaseBadge.textContent = "—";
        if (phaseDetail) phaseDetail.textContent = "Registra tu ciclo para ver tu fase";
        if (phaseProgressFill) phaseProgressFill.style.width = "0%";
        if (phaseDayInfo) phaseDayInfo.textContent = "";
        return;
    }

    if (phaseTitleEl) phaseTitleEl.textContent = phase.name;
    if (phaseDescEl) phaseDescEl.textContent = phase.desc;
    if (phaseBadge) phaseBadge.textContent = phase.name.split(" ")[0];
    if (phaseDetail) phaseDetail.textContent = phase.desc;
    if (phaseProgressFill) phaseProgressFill.style.width = phase.progress + "%";
    if (phaseDayInfo) phaseDayInfo.textContent = phase.dayInfo;

    if (phaseRing) {
        phaseRing.className = "phase-ring";
        if (phase.name.includes("Menstruación")) phaseRing.classList.add("ring-menstruation");
        else if (phase.name.includes("Folicular")) phaseRing.classList.add("ring-folicular");
        else if (phase.name.includes("Ovulación")) phaseRing.classList.add("ring-ovulation");
        else if (phase.name.includes("Lútea")) phaseRing.classList.add("ring-luteal");
    }
}

// ===== RENDERIZAR CUENTA REGRESIVA =====
function renderCountdown(data) {
    let prediction = predictNextCycle(data);
    let starts = getCycleStarts(data);

    if (!prediction || starts.length === 0) {
        if (countdownNumber) countdownNumber.textContent = "—";
        if (countdownDate) countdownDate.textContent = "Registra tu ciclo para empezar";
        return;
    }

    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let diff = Math.ceil((prediction - today) / (1000 * 60 * 60 * 24));

    if (countdownNumber) countdownNumber.textContent = diff > 0 ? diff : "Hoy";
    if (countdownDate) {
        let opts = { day: "numeric", month: "long", year: "numeric" };
        countdownDate.textContent = "Fecha estimada: " + prediction.toLocaleDateString("es-ES", opts);
    }
}

// ===== REGISTRO RÁPIDO =====
function quickRegisterToday() {
    let today = new Date();
    let dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    let data = getData();

    data[dateKey] = {
        menstruation: true,
        intensity: currentIntensity,
        notes: notesArea.value.trim() || "Registro rápido de inicio"
    };

    saveData(data);
    selectedDateKey = dateKey;
    renderAll();
    showToast("Registro guardado: inicio de periodo hoy");
    checkNotificationAlert(data);

    // Si hay notas, analizar mood
    if (notesArea.value.trim()) {
        analyzeMood(notesArea.value.trim());
    }
}

// ===== RENDERIZAR HISTORIAL =====
function renderHistory() {
    let data = getData();
    let starts = getCycleStarts(data);

    if (!historyList) return;

    if (starts.length === 0) {
        if (historyEmpty) historyEmpty.style.display = "block";
        historyList.innerHTML = "";
        return;
    }

    if (historyEmpty) historyEmpty.style.display = "none";

    let avgLen = getAverageCycleLength(data);
    historyList.innerHTML = starts.slice().reverse().map((s, idx) => {
        let realIdx = starts.length - 1 - idx;
        let cycleNum = realIdx + 1;
        if (realIdx < starts.length - 1) {
            let days = Math.round((starts[realIdx + 1].date - s.date) / (1000 * 60 * 60 * 24));
            return `
                <li class="history-item">
                    <div class="history-item-header">
                        <span class="history-cycle-num">Ciclo ${cycleNum}</span>
                        <span class="history-date">${s.date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    <div class="history-item-details">
                        <span class="history-duration">Duración: ${days} días</span>
                        <span class="history-intensity">Intensidad: ${s.intensity}/3</span>
                    </div>
                    ${s.notes ? `<p class="history-notes">${escapeHtml(s.notes)}</p>` : ""}
                </li>`;
        } else {
            return `
                <li class="history-item">
                    <div class="history-item-header">
                        <span class="history-cycle-num">Ciclo ${cycleNum} (actual)</span>
                        <span class="history-date">${s.date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    <div class="history-item-details">
                        <span class="history-duration">Próximo: ~${avgLen} días</span>
                        <span class="history-intensity">Intensidad: ${s.intensity}/3</span>
                    </div>
                    ${s.notes ? `<p class="history-notes">${escapeHtml(s.notes)}</p>` : ""}
                </li>`;
        }
    }).join("");
}

// ===== TOGGLE HISTORIAL =====
if (historyToggle) {
    historyToggle.onclick = () => {
        historyContent.classList.toggle("collapsed");
        let icon = historyToggle.querySelector("i");
        if (icon) {
            icon.classList.toggle("fa-chevron-down");
            icon.classList.toggle("fa-chevron-up");
        }
    };
}

// ===== NOTIFICACIONES WEB =====
function requestNotificationPermission() {
    if (!("Notification" in window)) {
        showToast("Tu navegador no soporta notificaciones");
        return false;
    }

    if (Notification.permission === "granted") {
        notificationsEnabled = true;
        return true;
    }

    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            notificationsEnabled = true;
            cycleSettings.notifications = true;
            localStorage.setItem("cycleSettings", JSON.stringify(cycleSettings));
            showToast("Notificaciones activadas");
            sendNotification("Titito Ciclo", "Te avisaremos antes de tu próximo periodo");
        } else {
            notificationsEnabled = false;
            cycleSettings.notifications = false;
            localStorage.setItem("cycleSettings", JSON.stringify(cycleSettings));
            if (notifToggle) notifToggle.checked = false;
            showToast("Notificaciones desactivadas");
        }
    });
}

function sendNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
        new Notification(title, { body, tag: "cycle-alert" });
    } catch (e) {
        console.warn("Notification error:", e);
    }
}

function checkNotificationAlert(data) {
    if (!cycleSettings.notifications || !notificationsEnabled) return;

    let prediction = predictNextCycle(data);
    if (!prediction) return;

    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let diff = Math.ceil((prediction - today) / (1000 * 60 * 60 * 24));
    let threshold = cycleSettings.advanceDays || NOTIFICATION_THRESHOLD_DAYS;

    let todayKey = today.toDateString();
    let lastNotif = localStorage.getItem("lastNotifDate");

    if (lastNotif === todayKey) return;

    if (diff > 0 && diff <= threshold) {
        sendNotification("🌸 Tu periodo se acerca", `Faltan ${diff} días para tu próximo periodo. ¡Prepárate!`);
        localStorage.setItem("lastNotifDate", todayKey);
    } else if (diff <= 0) {
        sendNotification("🩸 Tu periodo podría haber empezado", "¿Inició tu periodo hoy? Recuerda registrarlo.");
        localStorage.setItem("lastNotifDate", todayKey);
    }
}

// ===== TOGGLE NOTIFICACIONES =====
if (notifToggle) {
    notifToggle.checked = cycleSettings.notifications;
    notifToggle.onchange = () => {
        if (notifToggle.checked) {
            requestNotificationPermission();
        } else {
            notificationsEnabled = false;
            cycleSettings.notifications = false;
            localStorage.setItem("cycleSettings", JSON.stringify(cycleSettings));
            clearMoodTimers();
            showToast("Notificaciones desactivadas");
        }
    };
}

// ===== ALERTAS =====
function renderAlerts(data) {
    let list = document.getElementById("alertsList");
    if (!list) return;

    list.innerHTML = "";
    let prediction = predictNextCycle(data);
    let starts = getCycleStarts(data);

    if (starts.length === 0) {
        list.innerHTML = `<li class="alert-info">Registra el inicio de tu periodo para recibir alertas</li>`;
        return;
    }

    if (prediction) {
        let today = new Date();
        today.setHours(0, 0, 0, 0);
        let diff = Math.ceil((prediction - today) / (1000 * 60 * 60 * 24));

        if (diff > 0 && diff <= cycleSettings.advanceDays) {
            list.innerHTML += `<li class="alert-warn">🩸 Tu periodo podría empezar en ${diff} día(s). ¡Prepárate!</li>`;
        } else if (diff > 0) {
            list.innerHTML += `<li class="alert-info">📅 Próximo periodo estimado en ${diff} días</li>`;
        } else if (diff <= 0) {
            list.innerHTML += `<li class="alert-warn">🩸 Tu periodo debería haber empezado. ¿Lo registraste?</li>`;
        }
    }

    let phase = getCyclePhase(data);
    if (phase && phase.name.includes("Ovulación")) {
        list.innerHTML += `<li class="alert-fertile">🔥 Estás en días fértiles (ovulación)</li>`;
    }
    if (phase && phase.name.includes("Lútea")) {
        list.innerHTML += `<li class="alert-info">🌙 Fase lútea: cuidado con los cambios de humor</li>`;
    }
}

// ===== RESUMEN =====
function renderSummary(data) {
    let container = document.getElementById("cycleSummary");
    if (!container) return;

    let starts = getCycleStarts(data);

    if (starts.length < 2) {
        container.innerHTML = "<p class='summary-empty'>Registra al menos 2 ciclos para ver estadísticas</p>";
        return;
    }

    let durations = [];
    for (let i = 1; i < starts.length; i++) {
        durations.push((starts[i].date - starts[i - 1].date) / (1000 * 60 * 60 * 24));
    }

    let avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    let intensities = starts.map(s => s.intensity);
    let avgInt = (intensities.reduce((a, b) => a + b, 0) / intensities.length).toFixed(1);

    container.innerHTML = `
        <div class="summary-grid">
            <div class="summary-item"><span class="summary-num">${avg}</span><span class="summary-label">días promedio</span></div>
            <div class="summary-item"><span class="summary-num">${avgInt}</span><span class="summary-label">intensidad prom.</span></div>
            <div class="summary-item"><span class="summary-num">${starts.length}</span><span class="summary-label">ciclos registrados</span></div>
        </div>
    `;
}

// ===== CONTEXTO DEL CICLO PARA IA =====
function getCycleContext() {
    let data = getData();
    let starts = getCycleStarts(data);
    let prediction = predictNextCycle(data);
    let phase = getCyclePhase(data);
    let avgLen = getAverageCycleLength(data);

    return {
        totalCycles: starts.length,
        averageCycleLength: avgLen,
        currentPhase: phase ? phase.name : "desconocida",
        cycleDay: phase ? phase.cycleDay : null,
        nextPeriodDate: prediction ? prediction.toLocaleDateString("es-ES") : null,
        daysUntilNext: prediction ? Math.ceil((prediction - new Date()) / (1000 * 60 * 60 * 24)) : null,
        recentIntensities: starts.slice(-3).map(s => s.intensity),
        lastNotes: starts.length > 0 ? starts[starts.length - 1].notes : null
    };
}

// ===== TOGGLE =====
function updateToggle(isOn) {
    isMenstruation = isOn;
    if (toggleMenstruationBtn) {
        toggleMenstruationBtn.textContent = isOn ? "Sí" : "No";
        toggleMenstruationBtn.style.background = isOn ? "var(--accent)" : "var(--border)";
        toggleMenstruationBtn.style.color = isOn ? "white" : "var(--text-muted)";
    }
}

if (toggleMenstruationBtn) {
    toggleMenstruationBtn.onclick = () => updateToggle(!isMenstruation);
}

// ===== INTENSIDAD =====
function setIntensity(level) {
    currentIntensity = level;
    intensityButtons.forEach((btn, i) => {
        btn.classList.toggle("active", i + 1 === level);
    });
}

intensityButtons.forEach((btn, i) => {
    btn.onclick = () => setIntensity(i + 1);
});

// ===== CALENDARIO =====
function renderCalendar() {
    if (!calendarGrid) return;
    calendarGrid.innerHTML = "";

    let year = currentDate.getFullYear();
    let month = currentDate.getMonth();

    const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    monthYearLabel.textContent = `${months[month]} ${year}`;

    let firstDay = new Date(year, month, 1).getDay();
    let daysInMonth = new Date(year, month + 1, 0).getDate();

    let data = getData();
    let prediction = predictNextCycle(data);

    const days = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
    days.forEach(d => {
        let div = document.createElement("div");
        div.classList.add("day-name");
        div.textContent = d;
        calendarGrid.appendChild(div);
    });

    for (let i = 0; i < firstDay; i++) {
        calendarGrid.appendChild(document.createElement("div"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        let dateKey = `${year}-${month+1}-${day}`;
        let div = document.createElement("div");
        div.classList.add("day");

        // Marcar si tiene registro (cualquier tipo)
        if (data[dateKey]) {
            div.classList.add("has-log");
        }

        if (data[dateKey]?.menstruation) {
            div.classList.add("menstruation");
            div.innerHTML = "🩸";
        } else {
            div.textContent = day;
        }

        if (prediction) {
            let predDay = prediction.getDate();
            let predMonth = prediction.getMonth();
            if (day === predDay && month === predMonth) {
                div.classList.add("predicted-day");
            }
        }

        let today = new Date();
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            div.classList.add("today");
        }

        if (selectedDateKey === dateKey) {
            div.classList.add("active-day");
        }

        div.onclick = () => selectDay(dateKey);
        calendarGrid.appendChild(div);
    }

    renderChart(data);
    renderPhase(data);
    renderAlerts(data);
    renderSummary(data);
    renderCountdown(data);
}

// ===== SELECCIÓN DE DÍA — carga datos en el panel de registro =====
function selectDay(dateKey) {
    selectedDateKey = dateKey;

    let data = getData();

    if (data[dateKey]) {
        updateToggle(data[dateKey].menstruation);
        isMenstruation = data[dateKey].menstruation;
        setIntensity(data[dateKey].intensity);
        if (notesArea) notesArea.value = data[dateKey].notes || "";
    } else {
        updateToggle(false);
        isMenstruation = false;
        setIntensity(2);
        if (notesArea) notesArea.value = "";
    }

    if (regDateTitle) {
        let parts = dateKey.split("-");
        let d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        regDateTitle.textContent = `(${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })})`;
    }

    // Limpiar mood feedback anterior
    if (moodFeedback) {
        moodFeedback.classList.remove("show");
        moodFeedback.innerHTML = "";
    }

    renderCalendar();
}

// ===== GUARDAR REGISTRO + ANÁLISIS DE MOOD =====
if (saveBtn) {
    saveBtn.onclick = async () => {
        if (!selectedDateKey) return showToast("Selecciona un día primero");

        let data = getData();
        let notes = notesArea.value.trim();

        data[selectedDateKey] = {
            menstruation: isMenstruation,
            intensity: currentIntensity,
            notes: notes
        };

        saveData(data);
        renderAll();
        showToast("Registro guardado");

        // Analizar mood si hay notas
        if (notes) {
            notifyEmpathyForNotes(notes);
            await analyzeMood(notes);
        }
    };
}

// ===== RESET =====
if (resetBtn) {
    resetBtn.onclick = () => {
        if (!selectedDateKey) return showToast("Selecciona un día primero");

        let data = getData();
        delete data[selectedDateKey];

        saveData(data);
        renderAll();

        updateToggle(false);
        isMenstruation = false;
        if (notesArea) notesArea.value = "";
        setIntensity(2);
        if (moodFeedback) {
            moodFeedback.classList.remove("show");
            moodFeedback.innerHTML = "";
        }
        showToast("Día reseteado");
    };
}

// ===== REGISTRO RÁPIDO =====
if (quickRegisterBtn) {
    quickRegisterBtn.onclick = quickRegisterToday;
}

// ===== ANÁLISIS DE ESTADO DE ÁNIMO POR IA =====
function notifyEmpathyForNotes(notes) {
    let concernDetected = /(dolor|maread|mareo|malestar|cansad|fatiga|triste|bajonead|ánimo|humor|agotad)/i.test(notes);
    if (!concernDetected || !notificationsEnabled) return;
    sendNotification("Titito Ciclo · Dr. Latigo", "Mucho ánimo, Yosseling. Tómate un té caliente y descansa.");
}

async function analyzeMood(notes) {
    if (!notes || !notes.trim()) return;
    let concernDetected = /(dolor|maread|mareo|malestar|cansad|fatiga|triste|bajonead|ánimo|humor|agotad)/i.test(notes);

    try {
        let res = await fetch(`${API_URL}/analyze-mood`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                notes: notes,
                cycleContext: getCycleContext()
            })
        });

        if (!res.ok) throw new Error("HTTP " + res.status);
        let result = await res.json();

        if (result.message && result.message.trim()) {
            // Mostrar feedback empático en el panel
            if (moodFeedback) {
                moodFeedback.innerHTML = `<div class="mood-msg ${result.mood}">${escapeHtml(result.message)}</div>`;
                moodFeedback.classList.add("show");
            }

            // Enviar notificación empática inmediatamente
            if (notificationsEnabled && result.notification && (result.mood === "negative" || concernDetected)) {
                sendNotification("🌸 El Dr. Latigo está contigo", result.notification);
            }

            // Programar notificaciones de ánimo durante el día
            if (notificationsEnabled && (result.mood === "negative" || concernDetected)) {
                scheduleMoodNotifications();
            }
        }
    } catch (err) {
        console.warn("Mood analysis failed:", err.message);
        // Fallback local: mensaje empático genérico
        if (moodFeedback) {
            moodFeedback.innerHTML = `<div class="mood-msg negative">💛 Un abrazo fuerte. Descansa y sé amable contigo hoy.</div>`;
            moodFeedback.classList.add("show");
        }
        if (notificationsEnabled && concernDetected) {
            sendNotification("🌸 El Dr. Latigo está contigo", "Tómate un té caliente, descansa y recuerda que no estás sola.");
            scheduleMoodNotifications();
        }
    }
}

// ===== PROGRAMAR NOTIFICACIONES DE ÁNIMO =====
function clearMoodTimers() {
    moodNotificationTimers.forEach(t => clearTimeout(t));
    moodNotificationTimers = [];
}

function scheduleMoodNotifications() {
    clearMoodTimers();

    let messages = [
        { delay: 2 * 60 * 60 * 1000, title: "☕ Yosseling", body: "Tomate un descanso y un té caliente. Te mereces un momento para ti." },
        { delay: 5 * 60 * 60 * 1000, title: "🌿 Yosseling", body: "Recuerda respirar profundo. Este malestar es temporal. ¡Eres fuerte!" },
        { delay: 8 * 60 * 60 * 1000, title: "✨ Yosseling", body: "Hola de nuevo. ¿Cómo te sientes ahora? Cuídate mucho hoy." },
    ];

    messages.forEach(m => {
        let timer = setTimeout(() => {
            if (notificationsEnabled) {
                sendNotification(m.title, m.body);
            }
        }, m.delay);
        moodNotificationTimers.push(timer);
    });
}

// ===== GRÁFICO =====
function renderChart(data) {
    const canvas = document.getElementById("chart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    let labels = [];
    let values = [];

    Object.keys(data).forEach(d => {
        if (data[d].menstruation) {
            labels.push(d);
            values.push(data[d].intensity);
        }
    });

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: "#ec4899",
                borderRadius: 6,
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    max: 3,
                    ticks: {
                        callback: function(v) { return ["", "Leve", "Media", "Fuerte"][v] || v; },
                        color: "#a1a1aa",
                    },
                    grid: { color: "rgba(63,63,70,0.3)" },
                },
                x: {
                    ticks: { color: "#a1a1aa" },
                    grid: { color: "rgba(63,63,70,0.2)" },
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// ===== IA: ANÁLISIS DE CICLO =====
async function analyzeCycle() {
    if (predictionSubtext) {
        predictionSubtext.innerHTML = "<b>Analizando...</b>";
    }
    try {
        let res = await fetch(`${API_URL}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                data: getData(),
                cycleContext: getCycleContext()
            })
        });

        if (!res.ok) throw new Error("HTTP " + res.status);
        let result = await res.json();
        if (predictionSubtext) {
            predictionSubtext.innerHTML = `<b>${escapeHtml(result.result)}</b>`;
        }
    } catch {
        if (predictionSubtext) {
            predictionSubtext.innerHTML = "IA no disponible ahora mismo. Intenta más tarde.";
        }
    }
}

const analyzeBtn = document.getElementById("analyzeBtn");
if (analyzeBtn) {
    analyzeBtn.onclick = analyzeCycle;
}

// ===== DR. LATIGO: ASISTENTE POR VOZ =====
function addVoiceBubble(text, role) {
    if (!voiceTranscript) return;
    let bubble = document.createElement("div");
    bubble.className = `voice-bubble ${role === "user" ? "user-bubble" : "doctor-bubble"}`;
    bubble.textContent = text;
    voiceTranscript.appendChild(bubble);
    voiceTranscript.scrollTop = voiceTranscript.scrollHeight;
}

function speakDoctor(text) {
    if (isVoiceMuted || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLanguage ? voiceLanguage.value : "es-ES";
    utterance.rate = voiceRate ? Number(voiceRate.value) : 1;
    utterance.pitch = 1.02;
    utterance.onstart = () => voiceWave && voiceWave.classList.add("active");
    utterance.onend = () => voiceWave && voiceWave.classList.remove("active");
    window.speechSynthesis.speak(utterance);
}

async function askDoctor(transcript) {
    let message = transcript.trim();
    if (!message) return;
    addVoiceBubble(message, "user");
    voiceConversation.push({ role: "user", content: message });
    if (voiceStatus) voiceStatus.textContent = "Dr. Latigo está pensando...";
    if (doctorGreeting) doctorGreeting.textContent = "Estoy revisando lo que me cuentas...";

    try {
        let response = await fetch(`${API_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: voiceConversation,
                message,
                model: "llama-3.1-8b-instant",
                provider: "groq",
                settings: { voice: true, language: voiceLanguage ? voiceLanguage.value : "es-ES" },
                cycleContext: getCycleContext()
            })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let result = await response.json();
        let reply = typeof result.reply === "string" && result.reply.trim()
            ? result.reply.trim()
            : "Estoy aquí contigo. Cuéntame un poco más.";
        voiceConversation.push({ role: "assistant", content: reply });
        addVoiceBubble(reply, "assistant");
        speakDoctor(reply);
        if (voiceStatus) voiceStatus.textContent = `Conectado · ${result.provider || "asistente"}`;
        if (doctorGreeting) doctorGreeting.textContent = "Puedes volver a hablar cuando quieras.";
    } catch (error) {
        let fallback = "No pude conectar ahora mismo, pero sigo aquí contigo. Inténtalo de nuevo en un momento.";
        addVoiceBubble(fallback, "assistant");
        speakDoctor(fallback);
        if (voiceStatus) voiceStatus.textContent = "Revisa la conexión";
        console.warn("Voice assistant error:", error.message);
    }
}

function stopListeningUi() {
    isListening = false;
    if (micBtn) {
        micBtn.classList.remove("listening");
        micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Hablar</span>';
    }
    if (voiceWave) voiceWave.classList.remove("active");
}

function stopListening() {
    stopRequested = true;
    if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
    if (recognition) {
        try { recognition.stop(); } catch (error) { console.debug("Recognition already stopped", error.message); }
    }
    stopListeningUi();
    if (voiceStatus) voiceStatus.textContent = "Micrófono detenido";
}

function createRecognitionSession(Recognition) {
    recognition = new Recognition();
    recognition.lang = voiceLanguage ? voiceLanguage.value : "es-ES";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onstart = () => {
        isListening = true;
        if (voiceStatus) voiceStatus.textContent = "Escuchando...";
        if (micBtn) {
            micBtn.classList.add("listening");
            micBtn.innerHTML = '<i class="fa-solid fa-stop"></i><span>Parar</span>';
        }
        if (voiceWave) voiceWave.classList.add("active");
    };
    recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            let text = event.results[index][0].transcript;
            if (event.results[index].isFinal) finalText += text;
            else interimText += text;
        }
        if (interimText && doctorGreeting) doctorGreeting.textContent = `Te escucho: ${interimText}`;
        if (finalText.trim()) void askDoctor(finalText.trim());
    };
    recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            stopRequested = true;
            stopListeningUi();
            if (voiceStatus) voiceStatus.textContent = "Permiso de micrófono denegado";
            return;
        }
        if (voiceStatus) voiceStatus.textContent = "Sigo escuchando...";
    };
    recognition.onend = () => {
        if (stopRequested) {
            stopListeningUi();
            return;
        }
        if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
        recognitionRestartTimer = setTimeout(() => {
            if (stopRequested || !recognition) return;
            try {
                recognition.start();
            } catch (error) {
                recognitionRestartTimer = setTimeout(() => {
                    if (!stopRequested && recognition) {
                        try { recognition.start(); } catch (retryError) { console.debug("Recognition restart pending", retryError.message); }
                    }
                }, 500);
            }
        }, 180);
    };
    try {
        recognition.start();
    } catch (error) {
        stopListeningUi();
        if (voiceStatus) voiceStatus.textContent = "No se pudo activar el micrófono";
        console.warn("Recognition start error:", error.message);
    }
}

function startListening() {
    let Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
        showToast("Tu navegador no admite reconocimiento de voz");
        return;
    }
    if (isListening) {
        stopListening();
        return;
    }
    stopRequested = false;
    createRecognitionSession(Recognition);
}

if (micBtn) micBtn.onclick = startListening;
if (muteBtn) muteBtn.onclick = () => {
    isVoiceMuted = !isVoiceMuted;
    if (isVoiceMuted && "speechSynthesis" in window) window.speechSynthesis.cancel();
    muteBtn.innerHTML = isVoiceMuted
        ? '<i class="fa-solid fa-volume-xmark"></i><span>Activar voz</span>'
        : '<i class="fa-solid fa-volume-high"></i><span>Silenciar voz</span>';
};
if (voiceSettingsBtn && voiceSettings) voiceSettingsBtn.onclick = () => {
    voiceSettings.hidden = !voiceSettings.hidden;
};
if (voiceRate) voiceRate.oninput = () => {
    if (voiceRateValue) voiceRateValue.value = Number(voiceRate.value).toFixed(1);
};

// ===== NAVEGACIÓN CALENDARIO =====
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");

if (prevBtn) {
    prevBtn.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    };
}
if (nextBtn) {
    nextBtn.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    };
}

// ===== RENDERIZAR TODO =====
function renderAll() {
    renderCalendar();
    renderHistory();
    renderCountdown(getData());
}

// ===== INIT =====
if ("Notification" in window) {
    requestNotificationPermission();
}

if (cycleSettings.notifications && "Notification" in window && Notification.permission === "granted") {
    notificationsEnabled = true;
    if (notifToggle) notifToggle.checked = true;
}

void hydrateCycleData().then(() => {
    renderAll();
    checkNotificationAlert(getData());
});
