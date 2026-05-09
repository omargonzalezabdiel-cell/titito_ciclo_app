// ===== CONFIG =====
const API_URL = "https://retail-cartridge-unearth.ngrok-free.dev";

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

// ===== ESTADO =====
let currentDate = new Date();
let selectedDateKey = null;
let currentIntensity = 2;
let chartInstance = null;
let isMenstruation = false;

// ===== ALMACENAMIENTO =====
function getData() {
    return JSON.parse(localStorage.getItem("cicloData")) || {};
}

function saveData(data) {
    localStorage.setItem("cicloData", JSON.stringify(data));
}

// ===== PREDICCIÓN =====
function predictNextCycle(data) {
    let dates = Object.keys(data)
        .filter(d => data[d].menstruation)
        .map(d => new Date(d))
        .sort((a, b) => a - b);

    if (dates.length < 2) return null;

    let diffs = [];
    for (let i = 1; i < dates.length; i++) {
        diffs.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }

    let avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    let next = new Date(dates[dates.length - 1]);
    next.setDate(next.getDate() + Math.round(avg));
    return next;
}

// ===== FASE DEL CICLO =====
function getCyclePhase(data) {
    let dates = Object.keys(data)
        .filter(d => data[d].menstruation)
        .map(d => new Date(d))
        .sort((a, b) => a - b);

    if (dates.length < 2) return null;

    let last = dates[dates.length - 1];
    let today = new Date();
    let diff = Math.floor((today - last) / (1000 * 60 * 60 * 24));

    if (diff <= 5) return {name: "🩸 Menstruación", desc: "Descanso y recuperación"};
    if (diff <= 13) return {name: "🌱 Folicular", desc: "Energía en aumento"};
    if (diff <= 16) return {name: "🔥 Ovulación", desc: "Alta energía"};
    return {name: "🌙 Lútea", desc: "Relajación"};
}

function renderPhase(data) {
    let phase = getCyclePhase(data);
    if (!phase) return;

    let title = document.querySelector(".phase-title");
    let desc = document.querySelector(".phase-desc");

    if (!title || !desc) return;

    title.textContent = phase.name;
    desc.textContent = phase.desc;
}

// ===== ALERTAS =====
function renderAlerts(data) {
    let list = document.getElementById("alertsList");
    if (!list) return;

    list.innerHTML = "";
    let prediction = predictNextCycle(data);

    if (prediction) {
        let diff = Math.ceil((prediction - new Date()) / (1000 * 60 * 60 * 24));

        if (diff <= 2 && diff >= 0) {
            list.innerHTML += `<li>🩸 Tu ciclo podría empezar pronto</li>`;
        }

        if (diff >= 12 && diff <= 16) {
            list.innerHTML += `<li>🔥 Estás en días fértiles</li>`;
        }
    }
}

// ===== RESUMEN =====
function renderSummary(data) {
    let container = document.getElementById("cycleSummary");
    if (!container) return;

    let dates = Object.keys(data)
        .filter(d => data[d].menstruation)
        .map(d => new Date(d))
        .sort((a, b) => a - b);

    if (dates.length < 2) {
        container.innerHTML = "Registra más datos";
        return;
    }

    let durations = [];
    for (let i = 1; i < dates.length; i++) {
        durations.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }

    let avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);

    let intensities = Object.values(data)
        .filter(d => d.menstruation)
        .map(d => d.intensity);

    let avgInt = Math.round(intensities.reduce((a, b) => a + b, 0) / intensities.length);

    container.innerHTML = `
        <p>Duración promedio: <b>${avg} días</b></p>
        <p>Intensidad promedio: <b>${avgInt}</b></p>
    `;
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

        // 🔥 EFECTO GOTAS
        if (data[dateKey]?.menstruation) {
            div.classList.add("menstruation");
            div.innerHTML = "🩸";
        } else {
            div.textContent = day;
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

    renderCalendar();
}

// ===== GUARDAR =====
saveBtn.onclick = () => {
    if (!selectedDateKey) return alert("Selecciona un día");

    let data = getData();

    data[selectedDateKey] = {
        menstruation: isMenstruation,
        intensity: currentIntensity,
        notes: notesArea.value.trim()
    };

    saveData(data);
    renderCalendar();
};

// ===== RESET =====
if (resetBtn) {
    resetBtn.onclick = () => {
        if (!selectedDateKey) return alert("Selecciona un día");

        let data = getData();
        delete data[selectedDateKey];

        saveData(data);
        renderCalendar();

        updateToggle(false);
        isMenstruation = false;
        notesArea.value = "";
        setIntensity(2);
    };
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
        }
    });
}

// ===== IA =====
async function analyzeCycle() {
    try {
        let res = await fetch(`${API_URL}/analyze`, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({data: getData()})
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

// ===== CHAT =====
async function sendMessage() {
    let msg = chatInput.value.trim();
    if (!msg) return;

    chatBox.innerHTML += `<div class="msg user">${msg}</div>`;
    chatInput.value = "";

    try {
        let res = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({message: msg})
        });

        let data = await res.json();
        chatBox.innerHTML += `<div class="msg ai">${data.reply}</div>`;
    } catch {
        chatBox.innerHTML += `<div class="msg ai">⚠️ Error</div>`;
    }
}

// ===== INIT =====
sendMsgBtn.onclick = sendMessage;
renderCalendar();
analyzeCycle();