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
    "Tu ciclo no define tu día. Tú decides el ritmo que necesitas ahora.",
    "🌸 Dr. Latigo: Leí tu registro. Si tienes molestias hoy, recuéstate unos minutos y aplica un poco de calor en el abdomen.",
    "❤️ Dr. Latigo: Es un día para ir despacio. No te exijas de más, un té de manzanilla o descanso te sentará muy bien.",
    "🤗 Dr. Latigo: Estoy al pendiente de ti. Recuerda que es normal tener altibajos en esta fase, abraza tu ritmo.",
    "🌙 Dr. Latigo: Regálate una pausa y respira profundo 3 veces. Tu bienestar es lo más importante hoy.",
    "💛 Dr. Latigo: Lo que sientes es válido. Date permiso para descansar sin culpa; mañana será un nuevo comienzo.",
    "🫖 Dr. Latigo: Una bebida tibia, una manta suave y cero prisas. Tu cuerpo te está pidiendo calma, escúchalo.",
    "🌊 Dr. Latigo: Las emociones vienen y van como olas. No tienes que resolverlas todas ahora; solo respira y deja pasar.",
    "🕯️ Dr. Latigo: Si el día pesa, baja las luces, pon música suave y regálate diez minutos solo para ti.",
    "✨ Dr. Latigo: Me alegra ver que te sientes bien hoy. ¡Aprovecha esa energía para disfrutar tu día!",
    "🌿 Dr. Latigo: Tu cuerpo está en un gran momento. ¡Avanza a tu ritmo y sigue brillando!",
    "💪 Dr. Latigo: Mantén esa buena actitud y recuerda mantenerte bien hidratada durante la jornada.",
    "🌸 Dr. Latigo: Qué bonito leer que estás bien. Guárdate este momento para los días más pesados.",
    "☀️ Dr. Latigo: Tu energía contagia hoy. Aprovecha para hacer algo que te haga feliz.",
    "🩺 Dr. Latigo: Un flujo o intensidad fuerte requiere hidratación extra y pausas activas. Escucha a tu cuerpo.",
    "💧 Dr. Latigo: Intensidad fuerte hoy: descansa lo que puedas, toma agua y no dudes en pedir ayuda si lo necesitas.",
    "💧 Dr. Latigo: Todo dentro de lo habitual. Recuerda beber suficiente agua y registrar cualquier cambio.",
    "📝 Dr. Latigo: ¿Cómo va tu tarde? Si sientes algún síntoma nuevo, no olvides anotarlo en tu Check-in.",
    "🍵 Dr. Latigo: Pasa a saludarme cuando quieras, estoy listo en el micrófono para escucharte.",
    "🌙 Dr. Latigo: Si ya vas a descansar, revisa que tu habitación esté cómoda. Un buen sueño también es cuidarte.",
    "🧘 Dr. Latigo: Antes de seguir con tu día, estira el cuello y los hombros. La tensión se acumula sin darse cuenta."
];

const NOTIFICATION_TAG = "titito-ciclo-alert";
const MOTIVATIONAL_INTERVAL_MS = 30 * 60 * 1000;
let motivationalTimerId = null;
let lastSentMessage = null;
let recentHistory = [];

function buildNotificationOptions(body) {
    return {
        body: body,
        icon: "/icon-app.png",
        badge: "/logo.png",
        vibrate: [200, 100, 200],
        tag: NOTIFICATION_TAG,
        renotify: true,
        requireInteraction: true,
        data: { timestamp: Date.now() }
    };
}

function getNonRepeatingMessage() {
    let available = MOTIVATIONAL_MESSAGES.filter(msg => msg !== lastSentMessage && !recentHistory.includes(msg));
    if (available.length === 0) {
        available = MOTIVATIONAL_MESSAGES.filter(msg => msg !== lastSentMessage);
    }
    if (available.length === 0) available = MOTIVATIONAL_MESSAGES;
    let selected = available[Math.floor(Math.random() * available.length)];
    lastSentMessage = selected;
    recentHistory.push(selected);
    if (recentHistory.length > 15) recentHistory = recentHistory.slice(-15);
    return selected;
}

function startMotivationalTimer() {
    if (motivationalTimerId) clearInterval(motivationalTimerId);
    motivationalTimerId = setInterval(() => {
        let message = getNonRepeatingMessage();
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
    if (event.data.type === "SEND_CONTEXT_NOTIFICATION") {
        let message = event.data.body || getNonRepeatingMessage();
        event.waitUntil(self.registration.showNotification(
            event.data.title || "Titito Ciclo · Dr. Latigo",
            buildNotificationOptions(message)
        ));
    }
});

self.addEventListener("push", event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
    let title = data.title || "Titito Ciclo · Dr. Latigo";
    let body = data.body || getNonRepeatingMessage();
    event.waitUntil(self.registration.showNotification(title, buildNotificationOptions(body)));
});

self.addEventListener("periodicsync", event => {
    if (event.tag !== "titito-proactive-reminder") return;
    event.waitUntil(self.registration.showNotification(
        "Titito Ciclo · Dr. Latigo",
        buildNotificationOptions(getNonRepeatingMessage())
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
