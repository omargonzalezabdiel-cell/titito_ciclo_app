const MOTIVATIONAL_MESSAGES = [
    "Hola Yosseling, pásate un tecito caliente y regálate cinco minutos de calma.",
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
];

const NOTIFICATION_TAG = "titito-ciclo-motivation";
const MOTIVATIONAL_INTERVAL_MS = 30 * 60 * 1000;
let motivationalTimerId = null;

function buildNotificationOptions(body) {
    return {
        body: body,
        icon: "/icon-app.png",
        badge: "/logo.png",
        vibrate: [200, 100, 200],
        tag: NOTIFICATION_TAG,
        renotify: true,
        requireInteraction: false,
        data: { timestamp: Date.now() }
    };
}

function getRandomMotivationalMessage() {
    return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
}

function startMotivationalTimer() {
    if (motivationalTimerId) clearInterval(motivationalTimerId);
    motivationalTimerId = setInterval(() => {
        let message = getRandomMotivationalMessage();
        self.registration.showNotification("Titito Ciclo · Dr. Latigo", buildNotificationOptions(message));
    }, MOTIVATIONAL_INTERVAL_MS);
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim().then(() => {
        startMotivationalTimer();
    }));
});

self.addEventListener("message", event => {
    if (!event.data) return;
    if (event.data.type === "SHOW_NOTIFICATION") {
        let { title, body } = event.data;
        event.waitUntil(self.registration.showNotification(title, buildNotificationOptions(body)));
    }
    if (event.data.type === "START_MOTIVATIONAL_TIMER") {
        startMotivationalTimer();
    }
    if (event.data.type === "STOP_MOTIVATIONAL_TIMER") {
        if (motivationalTimerId) { clearInterval(motivationalTimerId); motivationalTimerId = null; }
    }
});

self.addEventListener("push", event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
    let title = data.title || "Titito Ciclo · Dr. Latigo";
    let body = data.body || getRandomMotivationalMessage();
    event.waitUntil(self.registration.showNotification(title, buildNotificationOptions(body)));
});

self.addEventListener("periodicsync", event => {
    if (event.tag !== "titito-proactive-reminder") return;
    event.waitUntil(self.registration.showNotification(
        "Titito Ciclo · Dr. Latigo",
        buildNotificationOptions(getRandomMotivationalMessage())
    ));
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
            for (let client of clientList) {
                if ("focus" in client) return client.focus();
            }
            return self.clients.openWindow("/");
        })
    );
});
