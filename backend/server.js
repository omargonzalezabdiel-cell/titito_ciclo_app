require("dotenv").config();

const express = require("express");
const app = express();

const cors = require("cors");
const axios = require("axios");
const path = require("path");

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ===== SERVIR FRONTEND =====
app.use(express.static(path.join(__dirname, "..")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../index.html"));
});

// ===== API KEYS =====
const API_KEYS = {
    groq: process.env.GROQ_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    cerebras: process.env.CEREBRAS_API_KEY,
};

const DEFAULT_MODEL = process.env.AI_MODEL || "llama-3.1-8b-instant";
const DEFAULT_PROVIDER = process.env.AI_PROVIDER || "groq";

// ===== CONFIGURACIÓN DE PROVEEDORES =====
const PROVIDERS = {
    groq: {
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: API_KEYS.groq,
        model: "llama-3.1-8b-instant",
        buildHeaders: (key) => ({
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        }),
        buildBody: (messages, model) => ({ model: model || "llama-3.1-8b-instant", messages, temperature: 0.7 }),
        parseResponse: (data) => data.data.choices[0].message.content,
    },
    openai: {
        url: "https://api.openai.com/v1/chat/completions",
        key: API_KEYS.openai,
        model: "gpt-4o-mini",
        buildHeaders: (key) => ({
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        }),
        buildBody: (messages, model) => ({ model: model || "gpt-4o-mini", messages, temperature: 0.7 }),
        parseResponse: (data) => data.data.choices[0].message.content,
    },
    openrouter: {
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: API_KEYS.openrouter,
        model: "meta-llama/llama-3.1-8b-instruct:free",
        buildHeaders: (key) => ({
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        }),
        buildBody: (messages, model) => ({ model: model || "meta-llama/llama-3.1-8b-instruct:free", messages, temperature: 0.7 }),
        parseResponse: (data) => data.data.choices[0].message.content,
    },
    cerebras: {
        url: "https://api.cerebras.ai/v1/chat/completions",
        key: API_KEYS.cerebras,
        model: "llama-3.1-8b-instant",
        buildHeaders: (key) => ({
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        }),
        buildBody: (messages, model) => ({ model: model || "llama-3.1-8b-instant", messages, temperature: 0.7 }),
        parseResponse: (data) => data.data.choices[0].message.content,
    },
    gemini: {
        url: (key, model) =>
            `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-1.5-flash"}:generateContent?key=${key}`,
        key: API_KEYS.gemini,
        model: "gemini-1.5-flash",
        buildHeaders: () => ({ "Content-Type": "application/json" }),
        buildBody: (messages, model) => ({
            contents: messages.map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
            })),
            systemInstruction: messages.find((m) => m.role === "system")
                ? { parts: [{ text: messages.find((m) => m.role === "system").content }] }
                : undefined,
            generationConfig: { temperature: 0.7 },
        }),
        parseResponse: (data) => data.data.candidates[0].content.parts[0].text,
    },
};

// ===== ORDEN DE FALLBACK =====
const FALLBACK_ORDER = ["groq", "openrouter", "cerebras", "openai", "gemini"];

// ===== LLAMAR IA CON FALLBACK AUTOMÁTICO =====
async function callAI(messages, preferredProvider, preferredModel) {
    let order = FALLBACK_ORDER;

    if (preferredProvider && PROVIDERS[preferredProvider] && API_KEYS[preferredProvider]) {
        order = [preferredProvider, ...FALLBACK_ORDER.filter((p) => p !== preferredProvider)];
    }

    let lastError = null;

    for (let providerName of order) {
        let provider = PROVIDERS[providerName];
        if (!provider || !provider.key) continue;

        try {
            let url = typeof provider.url === "function"
                ? provider.url(provider.key, preferredModel)
                : provider.url;

            let body = provider.buildBody(messages, preferredModel);
            let headers = provider.buildHeaders(provider.key);

            let response = await axios.post(url, body, { headers, timeout: 15000 });

            if (response.data) {
                let content = provider.parseResponse(response);
                if (content) return { content, provider: providerName };
            }
        } catch (err) {
            lastError = err;
            console.warn(`Provider ${providerName} failed:`, err.response?.status || err.message);
            continue;
        }
    }

    throw new Error(lastError ? lastError.message : "All providers failed");
}

// ===== CONSTRUIR CONTEXTO DEL CICLO PARA LA IA =====
function buildCycleContextString(cycleContext) {
    if (!cycleContext || cycleContext.totalCycles === 0) {
        return "La usuaria aún no ha registrado ningún ciclo menstrual.";
    }

    let parts = [];
    parts.push(`Estado actual del ciclo: fase ${cycleContext.currentPhase}, día ${cycleContext.cycleDay} del ciclo.`);
    parts.push(`Duración promedio del ciclo: ${cycleContext.averageCycleLength} días.`);
    if (cycleContext.irregularCycle) {
        parts.push(`El patrón parece irregular: variación aproximada de ${cycleContext.cycleVariation || 0} días entre ciclos.`);
    }
    parts.push(`Total de ciclos registrados: ${cycleContext.totalCycles}.`);

    if (cycleContext.daysUntilNext !== null && cycleContext.daysUntilNext !== undefined) {
        if (cycleContext.daysUntilNext > 0) {
            parts.push(`Faltan ${cycleContext.daysUntilNext} días para el próximo periodo (estimado: ${cycleContext.nextPeriodDate}).`);
        } else {
            parts.push(`El próximo periodo debería haber comenzado (estimado: ${cycleContext.nextPeriodDate}).`);
        }
    }

    if (cycleContext.recentIntensities && cycleContext.recentIntensities.length > 0) {
        let intText = cycleContext.recentIntensities.map(i => i === 1 ? "leve" : i === 2 ? "media" : "fuerte").join(", ");
        parts.push(`Intensidades recientes: ${intText}.`);
    }

    if (cycleContext.lastNotes) {
        parts.push(`Últimas notas de la usuaria: "${cycleContext.lastNotes}".`);
    }

    return parts.join(" ");
}

// ===== CHAT IA =====
app.post(["/chat", "/api/chat"], async (req, res) => {
    try {
        const { message, cycleContext, provider, model, messages: fullMessages } = req.body;

        let contextStr = buildCycleContextString(cycleContext);

        const systemContent = `Eres el Dr. Latigo, un médico especialista en salud femenina y bienestar altamente empático, amable y cercano. Respondes de forma clara, directa y tranquilizadora a dudas sobre el ciclo menstrual, síntomas, nutrición y descanso. No sustituyes una consulta médica y recomiendas atención profesional ante síntomas intensos o preocupantes.

Sobre ciclos irregulares: se considera irregular un ciclo menor de 21 días, mayor de 35 días o con variaciones superiores a 7-9 días. Puede relacionarse con estrés, cambios de peso o dieta, SOP, tiroides, falta de sueño, anticonceptivos recientes o ejercicio extremo. También puede haber manchado entre periodos, ausencia temporal del flujo, cambios de humor o dolor pélvico variable. Sugiere registrar síntomas y consultar si persiste más de 3 meses, hay dolor intenso, sangrado abundante, desmayo o posible embarazo.

Contexto actual del ciclo de la usuaria:\n${contextStr}\n\nSé breve, cálido y personalizado (2-4 frases).`;

        let apiMessages = [
            { role: "system", content: systemContent },
            { role: "user", content: message },
        ];

        // Si viene con historial completo, usarlo
        if (fullMessages && Array.isArray(fullMessages) && fullMessages.length > 0) {
            apiMessages = [
                { role: "system", content: systemContent },
                ...fullMessages.filter(m => m.role !== "system"),
            ];
        }

        const result = await callAI(apiMessages, provider, model);

        res.json({ reply: result.content, provider: result.provider });
    } catch (error) {
        console.error("Chat error:", error.message);
        res.status(200).json({
            reply: "Lo siento, no pude responder en este momento. Pero estoy aquí para ti. 💛 Intenta de nuevo en un momento.",
            provider: null,
        });
    }
});

// ===== ANÁLISIS DE CICLO =====
app.post("/analyze", async (req, res) => {
    try {
        const { data, cycleContext, provider, model } = req.body;
        const contextStr = buildCycleContextString(cycleContext);

        const systemContent = `Eres un experto en ciclos menstruales. Analiza datos y predice menstruación, ovulación y fases. Da consejos útiles y breves.\n\nContexto actual del ciclo:\n${contextStr}`;

        const apiMessages = [
            { role: "system", content: systemContent },
            { role: "user", content: `Analiza estos datos del ciclo: ${JSON.stringify(data)}` },
        ];

        const result = await callAI(apiMessages, provider, model);

        res.json({ result: result.content, provider: result.provider });
    } catch (error) {
        console.error("Analyze error:", error.message);
        res.status(200).json({
            result: "No pude analizar los datos en este momento. Intenta más tarde.",
            provider: null,
        });
    }
});

// ===== ANÁLISIS DE ESTADO DE ÁNIMO =====
app.post("/analyze-mood", async (req, res) => {
    try {
        const { notes, cycleContext, provider, model } = req.body;

        if (!notes || !notes.trim()) {
            return res.json({
                mood: "neutral",
                message: "",
                notification: "",
                provider: null,
            });
        }

        let contextStr = buildCycleContextString(cycleContext);

        const systemContent = `Eres Yosseling, un asistente empático de salud menstrual. Analizas las notas de la usuaria sobre su estado físico y emocional durante el ciclo.

Tu tarea:
1. Detectar el tono emocional y físico del mensaje (dolor, malestar, cansancio, mareos, tristeza, cambios de humor, etc.)
2. Generar una respuesta empática, bonita, corta y motivadora para alegrarle el día.
3. Generar un mensaje corto para una notificación del navegador (máximo 100 caracteres).

Responde SIEMPRE en formato JSON exacto:
{"mood": "negative|neutral|positive", "message": "respuesta empática", "notification": "mensaje corto para notificación"}

Contexto del ciclo: ${contextStr}`;

        const apiMessages = [
            { role: "system", content: systemContent },
            { role: "user", content: `Notas de la usuaria: "${notes}"` },
        ];

        const result = await callAI(apiMessages, provider, model);
        let parsed;

        try {
            // Intentar parsear JSON directamente
            parsed = JSON.parse(result.content);
        } catch {
            // Intentar extraer JSON de la respuesta
            let jsonMatch = result.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch {
                    parsed = null;
                }
            } else {
                parsed = null;
            }
        }

        if (parsed && parsed.mood && parsed.message) {
            res.json({
                mood: parsed.mood,
                message: parsed.message,
                notification: parsed.notification || parsed.message.substring(0, 100),
                provider: result.provider,
            });
        } else {
            // Fallback: usar la respuesta como mensaje directo
            res.json({
                mood: "neutral",
                message: result.content,
                notification: result.content.substring(0, 100),
                provider: result.provider,
            });
        }
    } catch (error) {
        console.error("Mood analysis error:", error.message);
        res.status(200).json({
            mood: "neutral",
            message: "",
            notification: "",
            provider: null,
        });
    }
});

// Vercel importa la aplicación como función serverless; localmente se inicia con npm start.
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
}

module.exports = app;
