// ===== CONFIG =====
const API_URL = "https://retail-cartridge-unearth.ngrok-free.dev";
const DEFAULT_CYCLE_LENGTH = 28;
const NOTIFICATION_THRESHOLD_DAYS = 3;

// ===== SELECTORES =====
const calendarGrid = document.getElementById("calendar");
const monthYearLabel = document.getElementById("monthYear");
const predictionLabel = document.querySelector(".big-text");
const predictionSubtext = document.querySelector(".card.highlight p:last-child");

// Formulario
const regDateTitle = document.getElementById("reg-date-title");
const toggleMenstruationBtn = document.querySelector(".toggle-btn");
const intensityButtons = document.querySelectorAll(".btn-small");
const notesArea = document.querySelector("textarea");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.querySelector(".reset-btn");

// Chat
const chatBox = document.getElementById("chatBox");
const chatInput = document.querySelector(".chat-input input");
const sendMsgBtn = document.querySelector(".chat-input button");

// Nuevos elementos
const quickRegisterBtn = document.getElementById("quickRegisterBtn");
const countdownNumber = document.getElementById("countdownNumber");
const countdownDate = document.getElementById("countdownDate");
const phaseIndicator = document.getElementById("phaseIndicator");
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
let currentIntensity = 2;
let chartInstance = null;
let isMenstruation = false;
let notificationsEnabled = false;
let cycleSettings = JSON.parse(localStorage.getItem("cycleSettings")) || {
    notifications: false,
    advanceDays: NOTIFICATION_THRESHOLD_DAYS
};

// ===== ALMACENAMIENTO =====
function getData() {
    return JSON.parse(localStorage.getItem("cicloData")) || {};
}

function saveData(data) {
    localStorage.setItem("cicloData", JSON.stringify(data));
}

// ===== TOAST =====
function showToast(message, duration = 3000) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), duration);
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

    // Color del anillo según fase
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

    if (countdownNumber) {
        countdownNumber.textContent = diff > 0 ? diff : "Hoy";
    }
    if (countdownDate) {
        let opts = { day: "numeric", month: "long", year: "numeric" };
        countdownDate.textContent = "Fecha estimada: " + prediction.toLocaleDateString("es-ES", opts);
    }
}

// ===== REGISTRO RÁPIDO: Marcar inicio de regla hoy =====
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
    renderCalendar();
    renderHistory();
    renderCountdown(data);
    showToast("✅ Registro guardado: inicio de periodo hoy");

    // Verificar notificaciones después de registrar
    checkNotificationAlert(data);
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
        let nextDate = null;
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
                    ${s.notes ? `<p class="history-notes">${s.notes}</p>` : ""}
                </li>`;
        } else {
            return `
                <li class="history-item">
                    <div class="history-item-header">
                        <span class="history-cycle-num">Ciclo ${cycleNum} (actual)</span>
                        <span class="history-date">${s.date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    <div class="history-item-details">
                        <span class="history-duration">Próximo estimado: ~${avgLen} días</span>
                        <span class="history-intensity">Intensidad: ${s.intensity}/3</span>
                    </div>
                    ${s.notes ? `<p class="history-notes">${s.notes}</p>` : ""}
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
            sendNotification("Ciclo Inteligente", "Te avisaremos antes de tu próximo periodo");
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
        new Notification(title, {
            body: body,
            icon: "🌸",
            tag: "cycle-alert"
        });
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

    if (diff > 0 && diff <= threshold) {
        let lastNotif = localStorage.getItem("lastNotifDate");
        let todayKey = today.toDateString();
        if (lastNotif !== todayKey) {
            sendNotification(
                "🌸 Tu periodo se acerca",
                `Faltan ${diff} días para tu próximo periodo estimado. ¡Prepárate!`
            );
            localStorage.setItem("lastNotifDate", todayKey);
        }
    } else if (diff <= 0) {
        let lastNotif = localStorage.getItem("lastNotifDate");
        let todayKey = today.toDateString();
        if (lastNotif !== todayKey) {
            sendNotification(
                "🩸 Tu periodo podría haber empezado",
                "¿Inició tu periodo hoy? Recuerda registrarlo en la app."
            );
            localStorage.setItem("lastNotifDate", todayKey);
        }
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
        list.innerHTML = `<li class="alert-info">📋 Registra el inicio de tu periodo para recibir alertas</li>`;
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

    let context = {
        totalCycles: starts.length,
        averageCycleLength: avgLen,
        currentPhase: phase ? phase.name : "desconocida",
        cycleDay: phase ? phase.cycleDay : null,
        nextPeriodDate: prediction ? prediction.toLocaleDateString("es-ES") : null,
        daysUntilNext: prediction ? Math.ceil((prediction - new Date()) / (1000 * 60 * 60 * 24)) : null,
        recentIntensities: starts.slice(-3).map(s => s.intensity),
        lastNotes: starts.length > 0 ? starts[starts.length - 1].notes : null
    };

    return context;
}

function buildCycleContextString() {
    let ctx = getCycleContext();
    let parts = [];

    if (ctx.totalCycles === 0) {
        parts.push("La usuario aún no ha registrado ningún ciclo menstrual.");
    } else {
        parts.push(`Estado actual del ciclo: fase ${ctx.currentPhase}, día ${ctx.cycleDay} del ciclo.`);
        parts.push(`Duración promedio del ciclo: ${ctx.averageCycleLength} días.`);
        parts.push(`Total de ciclos registrados: ${ctx.totalCycles}.`);

        if (ctx.daysUntilNext !== null) {
            if (ctx.daysUntilNext > 0) {
                parts.push(`Faltan ${ctx.daysUntilNext} días para el próximo periodo (estimado: ${ctx.nextPeriodDate}).`);
            } else {
                parts.push(`El próximo periodo debería haber comenzado (estimado: ${ctx.nextPeriodDate}).`);
            }
        }

        if (ctx.recentIntensities.length > 0) {
            let intText = ctx.recentIntensities.map(i => i === 1 ? "leve" : i === 2 ? "media" : "fuerte").join(", ");
            parts.push(`Intensidades recientes: ${intText}.`);
        }

        if (ctx.lastNotes) {
            parts.push(`Últimas notas: "${ctx.lastNotes}".`);
        }
    }

    return parts.join(" ");
}

// ===== TOGGLE =====
function updateToggle(isOn) {
    isMenstruation = isOn;
    toggleMenstruationBtn.textContent = isOn ? "Sí" : "No";
    toggleMenstruationBtn.style.background = isOn ? "#d63384" : "#ddd";
    toggleMenstruationBtn.style.color = isOn ? "white" : "#666";
}

toggleMenstruationBtn.onclick = () => {
    updateToggle(!isMenstruation);
};

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
    calendarGrid.innerHTML = "";

    let year = currentDate.getFullYear();
    let month = currentDate.getMonth();

    const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    monthYearLabel.textContent = `${months[month]} ${year}`;

    let firstDay = new Date(year, month, 1).getDay();
    let daysInMonth = new Date(year, month + 1, 0).getDate();

    let data = getData();
    let prediction = predictNextCycle(data);

    if (prediction) {
        let diff = Math.ceil((prediction - new Date()) / (1000*60*60*24));
        predictionLabel.textContent = diff > 0 ? `Faltan ${diff} días` : "Ciclo en curso";
    }

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

        if (data[dateKey]?.menstruation) {
            div.classList.add("menstruation");
            div.innerHTML = "🩸";
        } else {
            div.textContent = day;
        }

        // Marcar día predicho
        if (prediction) {
            let predDay = prediction.getDate();
            let predMonth = prediction.getMonth();
            if (day === predDay && month === predMonth) {
                div.classList.add("predicted-day");
            }
        }

        // Marcar hoy
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

// ===== SELECCIÓN =====
function selectDay(dateKey) {
    selectedDateKey = dateKey;

    let data = getData();

    if (data[dateKey]) {
        updateToggle(data[dateKey].menstruation);
        isMenstruation = data[dateKey].menstruation;
        setIntensity(data[dateKey].intensity);
        notesArea.value = data[dateKey].notes || "";
    } else {
        updateToggle(false);
        isMenstruation = false;
        setIntensity(2);
        notesArea.value = "";
    }

    if (regDateTitle) {
        let parts = dateKey.split("-");
        let d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        regDateTitle.textContent = `(${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })})`;
    }

    renderCalendar();
}

// ===== GUARDAR =====
saveBtn.onclick = () => {
    if (!selectedDateKey) return showToast("⚠️ Selecciona un día primero");

    let data = getData();

    data[selectedDateKey] = {
        menstruation: isMenstruation,
        intensity: currentIntensity,
        notes: notesArea.value.trim()
    };

    saveData(data);
    renderCalendar();
    renderHistory();
    renderCountdown(data);
    showToast("✅ Registro guardado");
};

// ===== RESET =====
if (resetBtn) {
    resetBtn.onclick = () => {
        if (!selectedDateKey) return showToast("⚠️ Selecciona un día primero");

        let data = getData();
        delete data[selectedDateKey];

        saveData(data);
        renderCalendar();
        renderHistory();
        renderCountdown(data);

        updateToggle(false);
        isMenstruation = false;
        notesArea.value = "";
        setIntensity(2);
        showToast("Día reseteado");
    };
}

// ===== REGISTRO RÁPIDO =====
if (quickRegisterBtn) {
    quickRegisterBtn.onclick = quickRegisterToday;
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
                backgroundColor: "#ec4899"
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    max: 3,
                    ticks: {
                        callback: function(v) {
                            return ["", "Leve", "Media", "Fuerte"][v] || v;
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// ===== IA: ANÁLISIS DE CICLO CON CONTEXTO =====
async function analyzeCycle() {
    try {
        let res = await fetch(`${API_URL}/analyze`, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                data: getData(),
                cycleContext: getCycleContext()
            })
        });

        let result = await res.json();
        predictionSubtext.innerHTML = `<b>${result.result}</b>`;
    } catch {
        predictionSubtext.innerHTML = "⚠️ IA no disponible";
    }
}

// ===== BOTÓN IA =====
const analyzeBtn = document.getElementById("analyzeBtn");
if (analyzeBtn) {
    analyzeBtn.onclick = analyzeCycle;
}

// ===== CHAT CON CONTEXTO DEL CICLO =====
async function sendMessage() {
    let msg = chatInput.value.trim();
    if (!msg) return;

    chatBox.innerHTML += `<div class="msg user">${escapeHtml(msg)}</div>`;
    chatInput.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        let res = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                message: msg,
                cycleContext: getCycleContext()
            })
        });

        let data = await res.json();
        chatBox.innerHTML += `<div class="msg ai">${escapeHtml(data.reply)}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch {
        chatBox.innerHTML += `<div class="msg ai">⚠️ Error de conexión</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// ===== ESCAPE HTML para prevenir XSS =====
function escapeHtml(text) {
    let div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

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

// ===== ENTER PARA ENVIAR CHAT =====
if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });
}

// ===== INIT =====
sendMsgBtn.onclick = sendMessage;

// Inicializar notificaciones si ya estaban activadas
if (cycleSettings.notifications && "Notification" in window && Notification.permission === "granted") {
    notificationsEnabled = true;
    if (notifToggle) notifToggle.checked = true;
}

renderCalendar();
renderHistory();
checkNotificationAlert(getData());
