self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("message", event => {
    if (event.data?.type !== "SHOW_NOTIFICATION") return;
    let { title, options } = event.data;
    event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("periodicsync", event => {
    if (event.tag !== "titito-proactive-reminder") return;
    event.waitUntil(self.registration.showNotification("Titito Ciclo · Dr. Latigo", {
        body: "Recuerda tomar agua, respirar y escuchar cómo te sientes hoy.",
        icon: "/icon-app.png",
        badge: "/logo.png",
        tag: "cycle-alert"
    }));
});
self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
        let client = clientList.find(item => "focus" in item);
        return client ? client.focus() : clients.openWindow("/");
    }));
});
