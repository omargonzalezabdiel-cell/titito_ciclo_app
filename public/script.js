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
const briefingBtn = document.getElementById("briefingBtn");
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
const notificationActionBtn = document.getElementById("notificationActionBtn");
const notifDeniedBanner = document.getElementById("notifDeniedBanner");
const predictiveTip = document.getElementById("predictiveTip");
const predictiveTipText = document.getElementById("predictiveTipText");
const waterCups = document.getElementById("waterCups");
const waterCount = document.getElementById("waterCount");
const waterGoalText = document.getElementById("waterGoalText");
const waterGoalDisplay = document.getElementById("waterGoalDisplay");
const waterPlus = document.getElementById("waterPlus");
const waterMinus = document.getElementById("waterMinus");
const waterResetBtn = document.getElementById("waterResetBtn");
const historyToggle = document.getElementById("historyToggle");
const historyContent = document.getElementById("historyContent");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const toast = document.getElementById("toast");
const proactiveToast = document.getElementById("proactiveToast");
const proactiveToastMessage = document.getElementById("proactiveToastMessage");
const closeProactiveToast = document.getElementById("closeProactiveToast");

// ===== ESTADO =====
let currentDate = new Date();
let selectedDateKey = null;
let cycleData = {};
let cycleDbPromise = null;
let recognition = null;
let isListening = false;
let stopRequested = false;
let recognitionRestartTimer = null;
let silenceTimer = null;
let accumulatedTranscript = "";
const SILENCE_TIMEOUT_MS = 1800;
let isVoiceMuted = false;
let voiceConversation = [];
let currentIntensity = 2;
let chartInstance = null;
let isMenstruation = false;
let notificationsEnabled = false;
let moodNotificationTimers = [];
let proactiveNotificationTimer = null;
let proactiveToastTimer = null;
let serviceWorkerRegistration = null;
let selectedSpeechVoice = null;
let cycleSettings = JSON.parse(localStorage.getItem("cycleSettings")) || {
    notifications: false,
    advanceDays: NOTIFICATION_THRESHOLD_DAYS,
    cycleLength: DEFAULT_CYCLE_LENGTH
};
cycleSettings.cycleLength = Number(cycleSettings.cycleLength) || DEFAULT_CYCLE_LENGTH;

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

function calendarDaysBetween(laterDate, earlierDate) {
    let later = new Date(laterDate.getFullYear(), laterDate.getMonth(), laterDate.getDate());
    let earlier = new Date(earlierDate.getFullYear(), earlierDate.getMonth(), earlierDate.getDate());
    let laterUtc = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
    let earlierUtc = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
    return Math.round((laterUtc - earlierUtc) / (1000 * 60 * 60 * 24));
}

function getTodayStart() {
    let today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

// ===== CALCULAR LONGITUD PROMEDIO DEL CICLO =====
function getAverageCycleLength(data) {
    let starts = getCycleStarts(data);
    if (starts.length < 2) return Number(cycleSettings.cycleLength) || DEFAULT_CYCLE_LENGTH;
    let diffs = [];
    for (let i = 1; i < starts.length; i++) {
        diffs.push(calendarDaysBetween(starts[i].date, starts[i - 1].date));
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
    let today = getTodayStart();
    let diff = calendarDaysBetween(today, lastStart);
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

// ===== MOTOR DE PREDICCIÓN DE SÍNTOMAS =====
const SYMPTOM_PATTERNS = /(dolor|cólico|colico|calambre|migraña|migraña|fatiga|cansancio|cansada|acne|acné|mareo|hinchazón|hinchazon|nausea|náusea|antojo|antojos|humor|triste|irritada|sensible|estresada|dolor de cabeza|retención|retencion)/i;

function buildSymptomPredictions(data) {
    let starts = getCycleStarts(data);
    if (starts.length === 0) return [];

    let patterns = {};
    Object.keys(data).forEach(dateKey => {
        let entry = data[dateKey];
        if (!entry || !entry.notes || !entry.notes.trim()) return;
        let parts = dateKey.split("-");
        let entryDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        let lastStart = starts.filter(s => s.date <= entryDate).pop();
        if (!lastStart) return;
        let cycleDay = calendarDaysBetween(entryDate, lastStart.date) + 1;
        let matches = entry.notes.match(SYMPTOM_PATTERNS);
        if (!matches) return;
        let symptom = matches[0].toLowerCase();
        if (!patterns[symptom]) patterns[symptom] = [];
        patterns[symptom].push(cycleDay);
    });

    let predictions = [];
    Object.keys(patterns).forEach(symptom => {
        let days = patterns[symptom];
        if (days.length < 1) return;
        let avgDay = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
        predictions.push({ symptom, avgCycleDay: avgDay, occurrences: days.length });
    });
    return predictions.sort((a, b) => b.occurrences - a.occurrences);
}

function getActiveSymptomPredictions(data) {
    let phase = getCyclePhase(data);
    if (!phase) return [];
    let currentCycleDay = phase.cycleDay;
    let allPredictions = buildSymptomPredictions(data);
    return allPredictions
        .map(p => ({ ...p, daysUntil: p.avgCycleDay - currentCycleDay }))
        .filter(p => p.daysUntil >= 1 && p.daysUntil <= 2);
}

function renderPredictiveTip(data) {
    if (!predictiveTip || !predictiveTipText) return;
    let upcoming = getActiveSymptomPredictions(data);
    if (upcoming.length === 0) {
        predictiveTip.hidden = true;
        return;
    }
    let top = upcoming[0];
    let dayWord = top.daysUntil === 1 ? "mañana" : `en ${top.daysUntil} días`;
    let symptomDisplay = top.symptom.replace(/dolor de cabeza/i, "dolor de cabeza").replace(/cólico|colico/i, "cólicos");
    predictiveTipText.textContent = `💡 En ${dayWord} sueles experimentar ${symptomDisplay} según tu historial. Te sugiero descansar mejor hoy e hidratarte bien.`;
    predictiveTip.hidden = false;
}

function getPredictiveTipForVoice() {
    let data = getData();
    let upcoming = getActiveSymptomPredictions(data);
    if (upcoming.length === 0) return "";
    let top = upcoming[0];
    let dayWord = top.daysUntil === 1 ? "mañana" : `en ${top.daysUntil} días`;
    return `Según tu historial, en ${dayWord} sueles tener ${top.symptom}. Te recomiendo descansar e hidratarte bien hoy como prevención.`;
}

// ===== RASTREADOR DE AGUA =====
const WATER_GOAL_DEFAULT = 8;
let waterGoal = WATER_GOAL_DEFAULT;
let waterIntake = 0;

function getTodayWaterKey() {
    let today = getTodayStart();
    return `water-${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

function loadWaterIntake() {
    let savedGoal = parseInt(localStorage.getItem("waterGoal")) || WATER_GOAL_DEFAULT;
    waterGoal = savedGoal;
    let todayKey = getTodayWaterKey();
    let saved = localStorage.getItem(todayKey);
    if (saved !== null) {
        waterIntake = parseInt(saved) || 0;
    } else {
        waterIntake = 0;
    }
    let data = getData();
    let todayDateKey = `${getTodayStart().getFullYear()}-${getTodayStart().getMonth() + 1}-${getTodayStart().getDate()}`;
    if (data[todayDateKey] && typeof data[todayDateKey].waterIntake === "number") {
        waterIntake = data[todayDateKey].waterIntake;
    }
}

function saveWaterIntake() {
    let todayKey = getTodayWaterKey();
    localStorage.setItem(todayKey, String(waterIntake));
    localStorage.setItem("waterGoal", String(waterGoal));
    let data = getData();
    let todayDateKey = `${getTodayStart().getFullYear()}-${getTodayStart().getMonth() + 1}-${getTodayStart().getDate()}`;
    if (!data[todayDateKey]) {
        data[todayDateKey] = { menstruation: false, intensity: 2, notes: "", waterIntake };
    } else {
        data[todayDateKey].waterIntake = waterIntake;
    }
    saveData(data);
}

function renderWaterTracker() {
    if (!waterCups || !waterCount || !waterGoalText || !waterGoalDisplay) return;
    waterCount.textContent = waterIntake;
    waterGoalText.textContent = waterGoal;
    waterGoalDisplay.textContent = waterGoal;
    waterCups.innerHTML = "";
    for (let i = 0; i < waterGoal; i++) {
        let cup = document.createElement("div");
        cup.className = "water-cup" + (i < waterIntake ? " filled" : "");
        cup.innerHTML = '<i class="fa-solid fa-glass-water"></i>';
        cup.onclick = () => {
            waterIntake = i < waterIntake ? i : i + 1;
            saveWaterIntake();
            renderWaterTracker();
            checkHydrationReminder();
        };
        waterCups.appendChild(cup);
    }
    if (waterIntake >= waterGoal) {
        waterCups.classList.add("goal-reached");
    } else {
        waterCups.classList.remove("goal-reached");
    }
}

if (waterPlus) {
    waterPlus.onclick = () => {
        if (waterIntake < waterGoal + 4) {
            waterIntake++;
            saveWaterIntake();
            renderWaterTracker();
            checkHydrationReminder();
        }
    };
}
if (waterMinus) {
    waterMinus.onclick = () => {
        if (waterIntake > 0) {
            waterIntake--;
            saveWaterIntake();
            renderWaterTracker();
        }
    };
}
if (waterResetBtn) {
    waterResetBtn.onclick = () => {
        waterIntake = 0;
        saveWaterIntake();
        renderWaterTracker();
        showToast("Conteo de agua reiniciado");
    };
}

function checkHydrationReminder() {
    if (!notificationsEnabled) return;
    let hour = new Date().getHours();
    if (hour < 15) return;
    if (waterIntake >= Math.ceil(waterGoal / 2)) return;
    let lastReminder = localStorage.getItem("lastHydrationReminder");
    let todayKey = getTodayWaterKey();
    if (lastReminder === todayKey) return;
    sendNotification("💧 Dr. Latigo", "Veo que llevas pocos vasos de agua hoy. Beber un poco de agua ahora te ayudará a prevenir cólicos y fatiga.");
    localStorage.setItem("lastHydrationReminder", todayKey);
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

    let today = getTodayStart();
    let diff = calendarDaysBetween(prediction, today);

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
            let days = calendarDaysBetween(starts[realIdx + 1].date, s.date);
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

    if (Notification.permission === "denied") {
        showDeniedBanner();
        showToast("Las notificaciones están bloqueadas. Revisa los permisos de tu navegador.");
        return false;
    }

    const proceed = () => {
        enableNotifications();
        if (!("serviceWorker" in navigator)) {
            showToast("Tu navegador no soporta notificaciones en segundo plano");
            return;
        }
        navigator.serviceWorker.register("/sw.js").then(reg => {
            serviceWorkerRegistration = reg;
            if ("periodicSync" in reg) {
                void reg.periodicSync.register("titito-proactive-reminder", { minInterval: 30 * 60 * 1000 }).catch(() => {});
            }
            navigator.serviceWorker.ready.then(readyReg => {
                const title = "Titito Ciclo · Dr. Latigo";
                const body = "¡Notificaciones activadas! Ya recibirás mis mensajes cada 30 minutos en tu celular.";
                const options = {
                    body,
                    icon: "/icon-app.png",
                    badge: "/logo.png",
                    vibrate: [200, 100, 200],
                    tag: "titito-ciclo-alert",
                    renotify: true,
                    requireInteraction: true,
                    data: { timestamp: Date.now() }
                };
                void readyReg.showNotification(title, options).then(() => {
                    showToast("Notificación enviada: minimiza la app para verla en la barra de tu celular");
                }).catch(err => {
                    console.warn("Test notification failed:", err.message);
                    showToast("No se pudo enviar la notificación de prueba");
                });
            });
        }).catch(err => {
            console.warn("SW registration failed:", err.message);
            showToast("No se pudo registrar el Service Worker");
        });
    };

    if (Notification.permission === "granted") {
        proceed();
        return true;
    }

    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            proceed();
        } else {
            notificationsEnabled = false;
            cycleSettings.notifications = false;
            localStorage.setItem("cycleSettings", JSON.stringify(cycleSettings));
            if (notifToggle) notifToggle.checked = false;
            if (Notification.permission === "denied") showDeniedBanner();
            showToast("Notificaciones no activadas");
        }
    });
}

function enableNotifications() {
    notificationsEnabled = true;
    cycleSettings.notifications = true;
    localStorage.setItem("cycleSettings", JSON.stringify(cycleSettings));
    if (notifToggle) notifToggle.checked = true;
    if (notificationActionBtn) {
        notificationActionBtn.classList.add("is-enabled");
        notificationActionBtn.querySelector("span").textContent = "Notificaciones activadas";
    }
    hideDeniedBanner();
    startProactiveNotifications();
}

function sendTestNotification() {
    let title = "Titito Ciclo · Dr. Latigo";
    let body = "¡Notificaciones activadas! Ya recibirás mis mensajes cada 30 minutos en tu celular.";
    if (!("serviceWorker" in navigator)) {
        showToast("Tu navegador no soporta notificaciones en segundo plano");
        return;
    }
    navigator.serviceWorker.ready.then(reg => {
        const options = {
            body,
            icon: "/icon-app.png",
            badge: "/logo.png",
            vibrate: [200, 100, 200],
            tag: "titito-ciclo-alert",
            renotify: true,
            requireInteraction: true,
            data: { timestamp: Date.now() }
        };
        void reg.showNotification(title, options).then(() => {
            showToast("Notificación enviada: minimiza la app para verla en la barra de tu celular");
        }).catch(err => {
            console.warn("Test notification failed:", err.message);
            showToast("No se pudo enviar la notificación de prueba");
        });
    }).catch(err => {
        console.warn("SW not ready for test:", err.message);
        showToast("El Service Worker no está listo aún");
    });
}

function showDeniedBanner() {
    if (notifDeniedBanner) notifDeniedBanner.hidden = false;
}

function hideDeniedBanner() {
    if (notifDeniedBanner) notifDeniedBanner.hidden = true;
}

function sendNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
        const options = {
            body,
            icon: "/icon-app.png",
            badge: "/logo.png",
            vibrate: [200, 100, 200],
            tag: "titito-ciclo-alert",
            renotify: true,
            requireInteraction: true,
            data: { timestamp: Date.now() }
        };
        void reg.showNotification(title, options).catch(err => console.warn("SW showNotification failed:", err.message));
    }).catch(err => console.warn("SW not ready:", err.message));
}

function getRecentMessageHistory() {
    try { return JSON.parse(localStorage.getItem("proactiveMessageHistory") || "[]"); } catch { return []; }
}

function addToMessageHistory(message) {
    let history = getRecentMessageHistory();
    history.push(message);
    if (history.length > 15) history = history.slice(-15);
    localStorage.setItem("proactiveMessageHistory", JSON.stringify(history));
}

function pickContextAwareMessage() {
    let moodState = { mood: "neutral", tags: [] };
    try { moodState = JSON.parse(localStorage.getItem("todayMoodState") || '{"mood":"neutral","tags":[]}'); } catch {}
    let phase = getCyclePhase(getData());
    let phaseName = phase ? phase.name : "";
    let intensity = currentIntensity;
    let pool = getMoodAwareMessages(moodState.mood, intensity, phaseName);
    let history = getRecentMessageHistory();
    let available = pool.filter(msg => !history.includes(msg));
    if (available.length === 0) {
        available = pool.filter(msg => msg !== history[history.length - 1]);
    }
    if (available.length === 0) available = pool;
    let selected = available[Math.floor(Math.random() * available.length)];
    addToMessageHistory(selected);
    return selected;
}

function showProactiveToast(message) {
    if (!proactiveToast || !proactiveToastMessage) return;
    proactiveToastMessage.textContent = message;
    proactiveToast.classList.add("show");
    if (proactiveToastTimer) clearTimeout(proactiveToastTimer);
    proactiveToastTimer = setTimeout(() => proactiveToast.classList.remove("show"), 10000);
}

function sendProactiveReminder() {
    if (!notificationsEnabled) return;
    let message = pickContextAwareMessage();
    showProactiveToast(message);
    sendNotification("Titito Ciclo · Dr. Latigo", message);
}

function startProactiveNotifications() {
    if (proactiveNotificationTimer) clearInterval(proactiveNotificationTimer);
    if (!notificationsEnabled) return;
    if (serviceWorkerRegistration && serviceWorkerRegistration.active) {
        serviceWorkerRegistration.active.postMessage({ type: "START_MOTIVATIONAL_TIMER" });
    } else if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then(reg => {
            if (reg.active) reg.active.postMessage({ type: "START_MOTIVATIONAL_TIMER" });
        }).catch(() => {});
    }
    proactiveNotificationTimer = setInterval(sendProactiveReminder, 30 * 60 * 1000);
}

if (closeProactiveToast) closeProactiveToast.onclick = () => proactiveToast?.classList.remove("show");

function checkNotificationAlert(data) {
    if (!cycleSettings.notifications || !notificationsEnabled) return;

    let prediction = predictNextCycle(data);
    if (!prediction) return;

    let today = getTodayStart();
    let diff = calendarDaysBetween(prediction, today);
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
if (notificationActionBtn) notificationActionBtn.onclick = () => requestNotificationPermission();
if (notifToggle) {
    notifToggle.checked = cycleSettings.notifications && "Notification" in window && Notification.permission === "granted";
    notifToggle.onchange = () => {
        if (notifToggle.checked) {
            requestNotificationPermission();
        } else {
            notificationsEnabled = false;
            cycleSettings.notifications = false;
            localStorage.setItem("cycleSettings", JSON.stringify(cycleSettings));
            clearMoodTimers();
            if (proactiveNotificationTimer) clearInterval(proactiveNotificationTimer);
            proactiveNotificationTimer = null;
            if (serviceWorkerRegistration && serviceWorkerRegistration.active) {
                serviceWorkerRegistration.active.postMessage({ type: "STOP_MOTIVATIONAL_TIMER" });
            }
            proactiveToast?.classList.remove("show");
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
        let today = getTodayStart();
        let diff = calendarDaysBetween(prediction, today);

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
        durations.push(calendarDaysBetween(starts[i].date, starts[i - 1].date));
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
    let cycleLengths = [];
    for (let index = 1; index < starts.length; index += 1) {
        cycleLengths.push(calendarDaysBetween(starts[index].date, starts[index - 1].date));
    }
    let variation = cycleLengths.length > 1 ? Math.max(...cycleLengths) - Math.min(...cycleLengths) : 0;

    let recentLogs = [];
    let sortedKeys = Object.keys(data).sort();
    let last30 = sortedKeys.slice(-30);
    last30.forEach(dateKey => {
        let entry = data[dateKey];
        if (!entry) return;
        let parts = [dateKey];
        if (entry.menstruation) parts.push("menstruaci\u00f3n");
        if (entry.intensity) parts.push("intensidad " + (entry.intensity === 1 ? "leve" : entry.intensity === 2 ? "media" : "fuerte"));
        if (entry.notes && entry.notes.trim()) parts.push("notas: \"" + entry.notes.trim() + "\"");
        if (parts.length > 1) recentLogs.push(parts.join(" - "));
    });

    let notesWithDates = [];
    starts.forEach(s => {
        if (s.notes && s.notes.trim()) notesWithDates.push(`${s.dateKey}: "${s.notes.trim()}"`);
    });

    return {
        totalCycles: starts.length,
        averageCycleLength: avgLen,
        currentPhase: phase ? phase.name : "desconocida",
        cycleDay: phase ? phase.cycleDay : null,
        nextPeriodDate: prediction ? prediction.toLocaleDateString("es-ES") : null,
        daysUntilNext: prediction ? calendarDaysBetween(prediction, getTodayStart()) : null,
        cycleVariation: variation,
        irregularCycle: avgLen < 21 || avgLen > 35 || variation > 7,
        recentIntensities: starts.slice(-3).map(s => s.intensity),
        lastNotes: starts.length > 0 ? starts[starts.length - 1].notes : null,
        recentLogs: recentLogs,
        cycleStartDates: starts.map(s => s.dateKey),
        notesHistory: notesWithDates.slice(-10)
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

// ===== ANÁLISIS SEMÁNTICO DEL CHECK-IN =====
const PHYSICAL_KEYWORDS = /(dolor|cólico|colico|calambre|mareo|marea|hinchazón|hinchazon|migraña|migraña|fatiga|cansancio|cansada|sangrado|nausea|náusea|vomito|vómito|acne|acné|antojo|antojos|fiebre|calor|frio|frío|pesadez|retención|retencion)/i;
const EMOTIONAL_NEGATIVE_KEYWORDS = /(triste|tristeza|ansiosa|ansiedad|irritada|irritable|estresada|estres|estrés|sensible|deprimida|deprimido|abrumada|abrumada|llorar|lloro|bajón|bajo ánimo|mal humor|enojada|enojo|frágil|fragil|soledad|sola|desanimada)/i;
const EMOTIONAL_POSITIVE_KEYWORDS = /(feliz|alegre|bien|motivada|tranquila|calmada|energica|enérgica|optimista|contenta|agradecida|relajada|floreciendo|fuerte|animada| vital|radiante)/i;

function analyzeCheckinText(text) {
    if (!text || !text.trim()) return { mood: "neutral", tags: [] };
    let tags = [];
    let physicalMatches = text.match(PHYSICAL_KEYWORDS);
    if (physicalMatches) tags.push(physicalMatches[0].toLowerCase());
    let negativeMatches = text.match(EMOTIONAL_NEGATIVE_KEYWORDS);
    if (negativeMatches) tags.push(negativeMatches[0].toLowerCase());
    let positiveMatches = text.match(EMOTIONAL_POSITIVE_KEYWORDS);
    if (positiveMatches) tags.push(positiveMatches[0].toLowerCase());
    let hasNegative = negativeMatches || (physicalMatches && /(dolor|cólico|colico|migraña|nausea|náusea|fatiga|cansancio|fiebre|calambre)/i.test(text));
    let hasPositive = positiveMatches && !hasNegative;
    let mood = hasNegative ? "negative" : hasPositive ? "positive" : "neutral";
    return { mood, tags };
}

function getMoodAwareMessages(mood, intensity, phaseName) {
    let pool = [];
    if (mood === "negative" || intensity === 3) {
        pool = pool.concat([
            "🌸 Dr. Latigo: Leí tu registro. Si tienes molestias hoy, recuéstate unos minutos y aplica un poco de calor en el abdomen.",
            "❤️ Dr. Latigo: Es un día para ir despacio. No te exijas de más, un té de manzanilla o descanso te sentará muy bien.",
            "🤗 Dr. Latigo: Estoy al pendiente de ti. Recuerda que es normal tener altibajos en esta fase, abraza tu ritmo.",
            "🌙 Dr. Latigo: Regálate una pausa y respira profundo 3 veces. Tu bienestar es lo más importante hoy.",
            "💛 Dr. Latigo: Lo que sientes es válido. Date permiso para descansar sin culpa; mañana será un nuevo comienzo.",
            "🫖 Dr. Latigo: Una bebida tibia, una manta suave y cero prisas. Tu cuerpo te está pidiendo calma, escúchalo.",
            "🌊 Dr. Latigo: Las emociones vienen y van como olas. No tienes que resolverlas todas ahora; solo respira y deja pasar.",
            "🕯️ Dr. Latigo: Si el día pesa, baja las luces, pon música suave y regálate diez minutos solo para ti."
        ]);
    }
    if (mood === "positive") {
        pool = pool.concat([
            "✨ Dr. Latigo: Me alegra ver que te sientes bien hoy. ¡Aprovecha esa energía para disfrutar tu día!",
            "🌿 Dr. Latigo: Tu cuerpo está en un gran momento. ¡Avanza a tu ritmo y sigue brillando!",
            "💪 Dr. Latigo: Mantén esa buena actitud y recuerda mantenerte bien hidratada durante la jornada.",
            "🌸 Dr. Latigo: Qué bonito leer que estás bien. Guárdate este momento para los días más pesados.",
            "☀️ Dr. Latigo: Tu energía contagia hoy. Aprovecha para hacer algo que te haga feliz."
        ]);
    }
    if (intensity === 3) {
        pool = pool.concat([
            "🩺 Dr. Latigo: Un flujo o intensidad fuerte requiere hidratación extra y pausas activas. Escucha a tu cuerpo.",
            "💧 Dr. Latigo: Intensidad fuerte hoy: descansa lo que puedas, toma agua y no dudes en pedir ayuda si lo necesitas."
        ]);
    }
    if (intensity === 1 || intensity === 2) {
        pool = pool.concat([
            "💧 Dr. Latigo: Todo dentro de lo habitual. Recuerda beber suficiente agua y registrar cualquier cambio."
        ]);
    }
    pool = pool.concat([
        "📝 Dr. Latigo: ¿Cómo va tu tarde? Si sientes algún síntoma nuevo, no olvides anotarlo en tu Check-in.",
        "🍵 Dr. Latigo: Pasa a saludarme cuando quieras, estoy listo en el micrófono para escucharte.",
        "🌙 Dr. Latigo: Si ya vas a descansar, revisa que tu habitación esté cómoda. Un buen sueño también es cuidarte.",
        "🧘 Dr. Latigo: Antes de seguir con tu día, estira el cuello y los hombros. La tensión se acumula sin darse cuenta.",
        "🌸 Dr. Latigo: Hola Yosseling, pásate un tecito caliente y regálate cinco minutos de calma.",
        "Respira hondo: lo estás haciendo increíble. Tu bienestar también merece espacio.",
        "Dr. Latigo te recuerda tomar agua y escuchar lo que tu cuerpo necesita hoy.",
        "Una pausa suave puede cambiar tu momento. Estira los hombros y vuelve a ti.",
        "No tienes que poder con todo a la vez. Vamos paso a paso, estoy contigo.",
        "Tu cuerpo está haciendo mucho. Trátalo con paciencia, descanso y cariño.",
        "Comprueba cómo te sientes: ¿necesitas agua, algo ligero o unos minutos de descanso?",
        "Yosseling, cuidar de ti no es perder tiempo; es recuperar energía.",
        "Si tu día pesa, baja el ritmo. Tu salud y tu tranquilidad van primero.",
        "Recuerda registrar cómo te sientes; cada dato te ayuda a conocerte mejor.",
        "Un respiro, una bebida tibia y un poco de calma. Aquí sigo acompañándote.",
        "Tu ciclo no define tu día. Tú decides el ritmo que necesitas ahora."
    ]);
    return pool;
}

// ===== GUARDAR REGISTRO + ANÁLISIS DE MOOD =====
if (saveBtn) {
    saveBtn.onclick = async () => {
        if (!selectedDateKey) return showToast("Selecciona un día primero");

        let data = getData();
        let notes = notesArea.value.trim();
        let checkin = analyzeCheckinText(notes);
        let phase = getCyclePhase(getData());

        data[selectedDateKey] = {
            menstruation: isMenstruation,
            intensity: currentIntensity,
            notes: notes,
            mood: checkin.mood,
            moodTags: checkin.tags,
            phaseAtSave: phase ? phase.name : null
        };

        localStorage.setItem("todayMoodState", JSON.stringify({ date: selectedDateKey, mood: checkin.mood, tags: checkin.tags }));

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

function findMaleSpanishVoice() {
    if (!("speechSynthesis" in window)) return null;
    let voices = window.speechSynthesis.getVoices();
    let spanishVoices = voices.filter(voice => /^es([-_]|$)/i.test(voice.lang));
    let maleKeywords = /(jorge|pablo|raul|raúl|diego|tomas|tomás|david|carlos|miguel|male|masculin|standard-b|es-ES-Standard-B|es-MX-Standard-B)/i;
    return spanishVoices.find(voice => maleKeywords.test(voice.name)) || spanishVoices.find(voice => /es-ES|es-MX/i.test(voice.lang)) || null;
}

function refreshSpeechVoice() {
    selectedSpeechVoice = findMaleSpanishVoice();
}

function speakDoctor(text, opts = {}) {
    if (isVoiceMuted || !("speechSynthesis" in window)) return;
    refreshSpeechVoice();
    window.speechSynthesis.cancel();
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLanguage ? voiceLanguage.value : "es-ES";
    if (selectedSpeechVoice) utterance.voice = selectedSpeechVoice;
    let isNativeMale = selectedSpeechVoice && /(jorge|pablo|raul|raúl|diego|tomas|tomás|david|carlos|miguel|male|masculin|standard-b)/i.test(selectedSpeechVoice.name);
    if (opts.pitch !== undefined) {
        utterance.pitch = opts.pitch;
    } else if (isNativeMale) {
        utterance.pitch = 0.9;
    } else {
        utterance.pitch = 0.72;
    }
    if (opts.rate !== undefined) {
        utterance.rate = opts.rate;
    } else {
        let baseRate = voiceRate ? Number(voiceRate.value) : 0.95;
        utterance.rate = isNativeMale ? baseRate : Math.min(baseRate, 0.92);
    }
    utterance.onstart = () => voiceWave && voiceWave.classList.add("speaking");
    utterance.onend = () => voiceWave && voiceWave.classList.remove("speaking");
    window.speechSynthesis.speak(utterance);
}

function getDynamicVoiceParams() {
    let data = getData();
    let phase = getCyclePhase(data);
    let phaseName = phase ? phase.name : "";
    let moodState = "neutral";
    try { moodState = JSON.parse(localStorage.getItem("todayMoodState") || '{"mood":"neutral"}').mood || "neutral"; } catch {}
    if (/(triste|deprimid|mal|ansios)/i.test(moodState) || /dolor fuerte|intensidad.*fuerte/i.test(moodState)) {
        return { pitch: 0.78, rate: 0.88 };
    }
    if (phaseName.includes("Folicular") || phaseName.includes("Ovulación") || /bien|energía|energia|feliz|positiv/i.test(moodState)) {
        return { pitch: 0.85, rate: 0.95 };
    }
    return {};
}

// ===== COMANDOS DE VOZ MANOS LIBRES =====
function getTodayDateKey() {
    let today = getTodayStart();
    return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

function voiceCommandAddSymptom(transcript) {
    let match = transcript.match(/(?:anota|tengo|me siento|siento|estoy|me duele|me duelen)\s+(.+)/i);
    if (!match) return false;
    let symptom = match[1].trim();
    let dateKey = getTodayDateKey();
    let data = getData();
    if (!data[dateKey]) {
        data[dateKey] = { menstruation: false, intensity: currentIntensity, notes: "" };
    }
    let existingNotes = data[dateKey].notes ? data[dateKey].notes.trim() : "";
    data[dateKey].notes = existingNotes ? `${existingNotes}; ${symptom}` : symptom;
    saveData(data);
    if (notesArea) notesArea.value = data[dateKey].notes;
    renderAll();
    return true;
}

function voiceCommandAddWater(transcript) {
    if (!/tome?\s+.*vaso\s+de\s+agua|tomé?\s+.*vaso\s+de\s+agua|suma\s+agua|ya\s+tomé?\s+agua|ya\s+tome\s+agua|bebí?\s+agua|bebi\s+agua/i.test(transcript)) return false;
    if (waterIntake < waterGoal + 4) {
        waterIntake++;
        saveWaterIntake();
        renderWaterTracker();
        checkHydrationReminder();
    }
    return true;
}

function voiceCommandStartPeriod(transcript) {
    if (!/inició?\s+mi\s+periodo|inicio\s+mi\s+periodo|me\s+bajó|me\s+bajo|hoy\s+me\s+bajó|empezó?\s+mi\s+periodo|empezo\s+mi\s+periodo/i.test(transcript)) return false;
    let dateKey = getTodayDateKey();
    let data = getData();
    if (!data[dateKey]) {
        data[dateKey] = { menstruation: true, intensity: currentIntensity, notes: "Inicio de periodo registrado por voz" };
    } else {
        data[dateKey].menstruation = true;
        if (!data[dateKey].notes) data[dateKey].notes = "Inicio de periodo registrado por voz";
    }
    saveData(data);
    selectedDateKey = dateKey;
    renderAll();
    checkNotificationAlert(data);
    return true;
}

function tryVoiceCommand(transcript) {
    let normalized = transcript.toLowerCase().trim();
    if (voiceCommandStartPeriod(normalized)) {
        return "He registrado el inicio de tu periodo hoy en el calendario. Recuerda descansar, hidratarte y tomar agua. Si el dolor es fuerte, no dudes en buscar ayuda médica.";
    }
    if (voiceCommandAddWater(normalized)) {
        let remaining = waterGoal - waterIntake;
        if (remaining > 0) {
            return `He sumado un vaso de agua a tu contador. Vas ${waterIntake} de ${waterGoal} vasos. Te faltan ${remaining} para tu meta de hoy.`;
        }
        return `He sumado un vaso de agua. ¡Felicidades, has alcanzado tu meta de ${waterGoal} vasos hoy! Tu cuerpo te lo agradece.`;
    }
    if (voiceCommandAddSymptom(normalized)) {
        return "He anotado eso en tu Check-in de hoy. Gracias por compartirlo conmigo. ¿Quieres que te dé algún consejo para aliviarlo?";
    }
    return null;
}

// ===== RESUMEN DIARIO HABLADO =====
function buildDailyBriefing() {
    let data = getData();
    let phase = getCyclePhase(data);
    let predictions = getActiveSymptomPredictions(data);
    let remaining = waterGoal - waterIntake;
    let parts = [];

    if (phase) {
        parts.push(`Hola Yosseling. Hoy estás en la fase ${phase.name}, ${phase.desc.toLowerCase()}. ${phase.dayInfo}.`);
    } else {
        parts.push("Hola Yosseling. Aún no tienes un ciclo registrado, pero estoy aquí para acompañarte.");
    }

    if (predictions.length > 0) {
        let top = predictions[0];
        let dayWord = top.daysUntil === 1 ? "mañana" : `en ${top.daysUntil} días`;
        parts.push(`Según tu historial, ${dayWord} sueles presentar ${top.symptom}. Te recomiendo descansar e hidratarte bien como prevención.`);
    }

    if (remaining > 0) {
        parts.push(`Llevas ${waterIntake} de ${waterGoal} vasos de agua hoy. Te faltan ${remaining} para tu meta.`);
    } else if (waterIntake > 0) {
        parts.push(`¡Felicidades! Has alcanzado tu meta de ${waterGoal} vasos de agua hoy.`);
    }

    parts.push("Recuerda escucharte con cariño. Cada síntoma es información valiosa para conocerte mejor. Estoy aquí contigo.");
    return parts.join(" ");
}

function playDailyBriefing() {
    let briefing = buildDailyBriefing();
    if (voiceStatus) voiceStatus.textContent = "Resumen del día en curso...";
    if (doctorGreeting) doctorGreeting.textContent = "Aquí tienes tu resumen del día...";
    addVoiceBubble(briefing, "assistant");
    voiceConversation.push({ role: "assistant", content: briefing });
    let params = getDynamicVoiceParams();
    speakDoctor(briefing, params);
    if (voiceStatus) voiceStatus.textContent = "Listo · resumen del día";
    if (doctorGreeting) doctorGreeting.textContent = "Puedes volver a hablar cuando quieras.";
}

if (briefingBtn) briefingBtn.onclick = playDailyBriefing;

// ===== FEEDBACK HÁPTICO Y SONORO =====
function playHapticFeedback() {
    if ("vibrate" in navigator) {
        try { navigator.vibrate(50); } catch (e) { console.debug("Vibrate failed", e.message); }
    }
}

let audioFeedbackCtx = null;
function playSoundFeedback(freq = 600, duration = 150) {
    try {
        if (!audioFeedbackCtx) audioFeedbackCtx = new (window.AudioContext || window.webkitAudioContext)();
        let ctx = audioFeedbackCtx;
        if (ctx.state === "suspended") ctx.resume();
        let osc = ctx.createOscillator();
        let gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration / 1000);
    } catch (e) {
        console.debug("Audio feedback failed", e.message);
    }
}

function playMicStartFeedback() {
    playHapticFeedback();
    playSoundFeedback(700, 120);
}

function playMicStopFeedback() {
    playHapticFeedback();
    playSoundFeedback(400, 120);
}

function getLocalDoctorReply(message) {
    let normalizedMessage = message.toLowerCase();
    let context = getCycleContext();
    let predictiveTip = getPredictiveTipForVoice();
    if (/(cómo ha estado|como ha estado|mi ciclo este|este mes|mi mes|resumen|cómo va|como va)/i.test(normalizedMessage)) {
        if (context.totalCycles === 0) return "Aún no tienes registros en tu calendario, Yosseling. Cuando anotes tu próximo periodo, podré darte un resumen personalizado de cómo va tu ciclo.";
        let summary = `Según tus registros, llevas ${context.totalCycles} ciclo(s) con un promedio de ${context.averageCycleLength} días. Estás en fase ${context.currentPhase}`;
        if (context.daysUntilNext !== null) summary += context.daysUntilNext > 0 ? ` y faltan ${context.daysUntilNext} días para tu próximo periodo.` : ` y tu periodo debería estar por llegar.`;
        else summary += ".";
        if (context.irregularCycle) summary += ` He notado variaciones de ${context.cycleVariation} días entre ciclos; vale la pena vigilarlo.`;
        if (context.recentLogs && context.recentLogs.length > 0) summary += ` Tus últimos registros: ${context.recentLogs.slice(-5).join("; ")}.`;
        if (predictiveTip) summary += ` ${predictiveTip}`;
        return summary;
    }
    if (/(dolor de cabeza|me dolía|me dolia|martes|jueves|ayer|antier)/i.test(normalizedMessage) && context.recentLogs.length > 0) {
        let matching = context.recentLogs.filter(log => /dolor|mareo|malestar|cansad|fatiga/i.test(log));
        if (matching.length > 0) return `Según tus notas, registraste: ${matching.slice(-3).join("; ")}. Si el dolor de cabeza fue intenso o diferente a lo habitual, conviene hidratación, descanso y consultar si se repite con frecuencia.`;
    }
    if (/(remedio|qué tomar|que tomar|aliviar|calmar|tratamiento)/i.test(normalizedMessage) && /(dolor|cólico|colico|periodo|regla)/i.test(normalizedMessage)) {
        return "Para molestias leves puedes probar calor local, descanso, hidratación y movimiento suave. No tomes medicamentos nuevos sin confirmar que son seguros para ti; si el dolor es intenso, repentino o no mejora, busca atención médica.";
    }
    if (/(dolor|cólico|colico|calambre)/i.test(normalizedMessage)) {
        let base = "Siento que tengas dolor. Para molestias leves, prueba calor local, hidratación y descanso. Si el dolor es intenso, repentino, diferente a lo habitual o viene con fiebre o desmayo, busca atención médica.";
        if (predictiveTip) base += ` ${predictiveTip}`;
        return base;
    }
    if (/(mareo|desmayo|náusea|nausea|vómito|vomito)/i.test(normalizedMessage)) {
        return "Gracias por contármelo. Siéntate o recuéstate, toma agua en pequeños sorbos y evita levantarte rápido. Si te desmayas o empeora, busca ayuda médica.";
    }
    if (/(triste|ansiedad|ansiosa|preocup|llorar|ánimo|animo)/i.test(normalizedMessage)) {
        return "Te escucho, Yosseling. No tienes que resolverlo todo ahora. Respira despacio, date un momento y recuerda que pedir apoyo también es cuidarte.";
    }
    if (/(cansad|fatiga|agotad|sueño|sueno)/i.test(normalizedMessage)) {
        let base = "Tu cuerpo merece una pausa. Toma agua, come algo suave si lo necesitas y busca un momento de descanso sin exigirte de más.";
        if (predictiveTip) base += ` ${predictiveTip}`;
        return base;
    }
    if (/(irregular|retraso|no me baja|se me adelantó|se me atraso|se me atrasó|período loco|periodo loco)/i.test(normalizedMessage)) {
        let context = getCycleContext();
        if (context.irregularCycle) {
            return `Entiendo tu preocupación, Yosseling. Tus registros muestran variaciones de ${context.cycleVariation} días; conviene orientarnos por tu promedio de ${context.averageCycleLength} días y no asumir un ciclo fijo de 28. Anota síntomas, descanso y estrés, y consulta con tu ginecóloga si dura más de 3 meses o aparece dolor intenso, sangrado abundante o desmayo.`;
        }
        return "Entiendo tu preocupación, Yosseling. Un retraso puntual puede relacionarse con estrés o cambios en tu rutina. Registra tus fechas y síntomas; si la irregularidad persiste más de 3 meses, hay dolor intenso, sangrado abundante o posibilidad de embarazo, consulta con tu ginecóloga.";
    }
    if (/(ciclo|periodo|regla|ovul|fértil|fertil)/i.test(normalizedMessage)) {
        let phase = getCycleContext();
        return phase.currentPhase === "desconocida"
            ? "Puedo orientarte mejor si registras el inicio de tu último periodo. Así estimamos tu fase y la próxima fecha, aunque una predicción nunca sustituye una prueba o una consulta médica."
            : `Según tus registros estás en la fase ${phase.currentPhase}. Tu ciclo es único; usa esta estimación como orientación y registra cualquier cambio importante.`;
    }
    if (/(embaraz|prueba|test)/i.test(normalizedMessage)) {
        return "Si hay posibilidad de embarazo y tienes retraso, una prueba suele ser más fiable desde el primer día de falta. Si presentas dolor fuerte o sangrado abundante, busca atención médica urgente.";
    }
    return "Entiendo lo que me cuentas. Para orientarte mejor, dime qué síntoma tienes, desde cuándo empezó y si es diferente a lo habitual. Estoy aquí contigo.";
}

async function askDoctor(transcript) {
    let message = transcript.trim();
    if (!message) return;
    if (voiceWave) voiceWave.classList.remove("active");
    addVoiceBubble(message, "user");
    voiceConversation.push({ role: "user", content: message });
    if (voiceStatus) voiceStatus.textContent = "Dr. Latigo está pensando...";
    if (doctorGreeting) doctorGreeting.textContent = "Estoy revisando lo que me cuentas...";

    let commandReply = tryVoiceCommand(message);
    if (commandReply) {
        let reply = commandReply;
        voiceConversation.push({ role: "assistant", content: reply });
        addVoiceBubble(reply, "assistant");
        speakDoctor(reply, getDynamicVoiceParams());
        if (voiceStatus) voiceStatus.textContent = "Listo · comando ejecutado";
        if (doctorGreeting) doctorGreeting.textContent = "Puedes volver a hablar cuando quieras.";
        return;
    }

    let reply = getLocalDoctorReply(message);
    let provider = "respuesta local";
    if (API_URL) {
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
            if (response.ok) {
                let result = await response.json();
                if (typeof result.reply === "string" && result.reply.trim()) {
                    reply = result.reply.trim();
                    provider = result.provider || "asistente";
                }
            }
        } catch (error) {
            console.warn("Voice assistant API unavailable; using local response.", error.message);
        }
    }

    voiceConversation.push({ role: "assistant", content: reply });
    addVoiceBubble(reply, "assistant");
    speakDoctor(reply, getDynamicVoiceParams());
    if (voiceStatus) voiceStatus.textContent = `Listo · ${provider}`;
    if (doctorGreeting) doctorGreeting.textContent = "Puedes volver a hablar cuando quieras.";
}

function stopListeningUi() {
    isListening = false;
    if (micBtn) {
        micBtn.classList.remove("listening");
        micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Hablar</span>';
    }
    if (voiceWave) { voiceWave.classList.remove("active"); voiceWave.classList.remove("speaking"); }
}

function stopListening() {
    stopRequested = true;
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
    if (recognition) {
        try { recognition.stop(); } catch (error) { console.debug("Recognition already stopped", error.message); }
    }
    stopListeningUi();
    playMicStopFeedback();
    if (voiceStatus) voiceStatus.textContent = "Micrófono detenido";
}

function createRecognitionSession(Recognition) {
    recognition = new Recognition();
    recognition.lang = voiceLanguage ? voiceLanguage.value : "es-ES";
    recognition.interimResults = true;
    recognition.continuous = false;
    accumulatedTranscript = "";
    recognition.onstart = () => {
        isListening = true;
        if (voiceStatus) voiceStatus.textContent = "Escuchando...";
        if (micBtn) {
            micBtn.classList.add("listening");
            micBtn.innerHTML = '<i class="fa-solid fa-stop"></i><span>Parar</span>';
        }
        if (voiceWave) { voiceWave.classList.remove("speaking"); voiceWave.classList.add("active"); }
    };
    recognition.onresult = (event) => {
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            let text = event.results[index][0].transcript;
            if (event.results[index].isFinal) {
                accumulatedTranscript += text + " ";
            } else {
                interimText += text;
            }
        }
        let displayText = (accumulatedTranscript + interimText).trim();
        if (displayText && doctorGreeting) doctorGreeting.textContent = `Te escucho: ${displayText}`;
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
            let finalText = (accumulatedTranscript + interimText).trim();
            if (finalText) {
                accumulatedTranscript = "";
                try { recognition.stop(); } catch (e) { console.debug("Recognition stop on silence", e.message); }
                void askDoctor(finalText);
            }
        }, SILENCE_TIMEOUT_MS);
    };
    recognition.onerror = (event) => {
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            stopRequested = true;
            stopListeningUi();
            if (voiceStatus) voiceStatus.textContent = "Permiso de micrófono denegado";
            return;
        }
        if (voiceStatus) voiceStatus.textContent = "Sigo escuchando...";
    };
    recognition.onend = () => {
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        if (voiceWave) voiceWave.classList.remove("active");
        if (stopRequested) {
            stopListeningUi();
            return;
        }
        let pending = accumulatedTranscript.trim();
        if (pending) {
            accumulatedTranscript = "";
            void askDoctor(pending);
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
        }, 300);
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
    playMicStartFeedback();
    createRecognitionSession(Recognition);
}

if (micBtn) micBtn.onclick = startListening;
if (muteBtn) muteBtn.onclick = () => {
    isVoiceMuted = !isVoiceMuted;
    if (isVoiceMuted && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (isVoiceMuted && voiceWave) voiceWave.classList.remove("speaking");
    muteBtn.innerHTML = isVoiceMuted
        ? '<i class="fa-solid fa-volume-xmark"></i><span>Activar voz</span>'
        : '<i class="fa-solid fa-volume-high"></i><span>Silenciar voz</span>';
};
if (voiceSettingsBtn && voiceSettings) voiceSettingsBtn.onclick = () => {
    voiceSettings.hidden = !voiceSettings.hidden;
};
if ("speechSynthesis" in window) {
    refreshSpeechVoice();
    window.speechSynthesis.onvoiceschanged = refreshSpeechVoice;
}
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

// ===== ORDEN DEL DASHBOARD =====
const layoutStorageKey = "tititoDashboardOrder";
const defaultCardOrder = ["voice", "cycle", "register", "calendar", "alerts", "phase", "summary", "history"];
let draggedCard = null;
let touchDragTimer = null;

function saveDashboardOrder(grid) {
    let order = [...grid.querySelectorAll("[data-card-id]")].map(card => card.dataset.cardId);
    localStorage.setItem(layoutStorageKey, JSON.stringify(order));
}

function applyDashboardOrder(grid) {
    let savedOrder;
    try { savedOrder = JSON.parse(localStorage.getItem(layoutStorageKey) || "null"); } catch { savedOrder = null; }
    let order = Array.isArray(savedOrder) ? savedOrder : defaultCardOrder;
    let cards = [...grid.querySelectorAll("[data-card-id]")];
    let orderedCards = order.map(id => cards.find(card => card.dataset.cardId === id)).filter(Boolean);
    cards.filter(card => !orderedCards.includes(card)).forEach(card => orderedCards.push(card));
    orderedCards.forEach(card => { card.style.order = ""; grid.appendChild(card); });
}

function setupDashboardLayout() {
    let grid = document.querySelector(".bento-grid");
    if (!grid) return;
    let cards = [...grid.querySelectorAll("[data-card-id]")];
    applyDashboardOrder(grid);

    cards.forEach(card => {
        card.draggable = true;
        let grip = document.createElement("button");
        grip.type = "button";
        grip.className = "card-grip";
        grip.textContent = "⋮⋮";
        grip.title = "Arrastrar tarjeta";
        grip.setAttribute("aria-label", `Mover tarjeta ${card.dataset.cardId}`);
        card.prepend(grip);

        card.addEventListener("dragstart", event => {
            draggedCard = card;
            card.classList.add("is-dragging");
            event.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragover", event => {
            event.preventDefault();
            if (draggedCard && draggedCard !== card) {
                let rect = card.getBoundingClientRect();
                let insertBefore = event.clientY < rect.top + rect.height / 2;
                grid.insertBefore(draggedCard, insertBefore ? card : card.nextSibling);
            }
        });
        card.addEventListener("dragend", () => {
            card.classList.remove("is-dragging");
            draggedCard = null;
            saveDashboardOrder(grid);
        });

        grip.addEventListener("pointerdown", event => {
            if (event.pointerType === "mouse") return;
            event.preventDefault();
            touchDragTimer = setTimeout(() => {
                draggedCard = card;
                card.classList.add("is-dragging");
                grip.setPointerCapture(event.pointerId);
            }, 350);
        });
        grip.addEventListener("pointermove", event => {
            if (draggedCard !== card) return;
            let target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-card-id]");
            if (!target || target === card || !grid.contains(target)) return;
            let rect = target.getBoundingClientRect();
            grid.insertBefore(card, event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
        });
        grip.addEventListener("pointerup", () => {
            clearTimeout(touchDragTimer);
            if (draggedCard === card) {
                card.classList.remove("is-dragging");
                draggedCard = null;
                saveDashboardOrder(grid);
            }
        });
        grip.addEventListener("pointercancel", () => {
            clearTimeout(touchDragTimer);
            card.classList.remove("is-dragging");
            draggedCard = null;
        });
    });
}

const resetLayoutBtn = document.getElementById("resetLayoutBtn");
if (resetLayoutBtn) {
    resetLayoutBtn.onclick = () => {
        localStorage.removeItem(layoutStorageKey);
        let grid = document.querySelector(".bento-grid");
        if (grid) applyDashboardOrder(grid);
        showToast("Diseño original restaurado");
    };
}

// ===== RENDERIZAR TODO =====
function renderAll() {
    let data = getData();
    renderCalendar();
    renderHistory();
    renderPhase(data);
    renderAlerts(data);
    renderSummary(data);
    renderCountdown(data);
    renderPredictiveTip(data);
    renderWaterTracker();
}

// ===== INIT =====
setupDashboardLayout();
if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").then(registration => {
        serviceWorkerRegistration = registration;
        if ("periodicSync" in registration) {
            void registration.periodicSync.register("titito-proactive-reminder", { minInterval: 30 * 60 * 1000 }).catch(() => {});
        }
        if (cycleSettings.notifications && "Notification" in window && Notification.permission === "granted") {
            navigator.serviceWorker.ready.then(readyReg => {
                if (readyReg.active) readyReg.active.postMessage({ type: "START_MOTIVATIONAL_TIMER" });
            }).catch(() => {});
        }
    }).catch(error => console.warn("Service Worker unavailable:", error.message));
}

if (cycleSettings.notifications && "Notification" in window && Notification.permission === "granted") {
    notificationsEnabled = true;
    if (notifToggle) notifToggle.checked = true;
    if (notificationActionBtn) { notificationActionBtn.classList.add("is-enabled"); notificationActionBtn.querySelector("span").textContent = "Notificaciones activadas"; }
    startProactiveNotifications();
}

if ("Notification" in window && Notification.permission === "denied") {
    showDeniedBanner();
}

void hydrateCycleData().then(() => {
    loadWaterIntake();
    renderAll();
    checkNotificationAlert(getData());
    checkHydrationReminder();
});
