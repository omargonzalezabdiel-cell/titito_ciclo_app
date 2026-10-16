require("dotenv").config();

const express = require("express");
const app = express();

const cors = require("cors");
const axios = require("axios");
const path = require("path");

app.use(cors());
app.use(express.json());

// ===== SERVIR FRONTEND =====
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ✅ Usar la API KEY desde .env
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ===== CONSTRUIR CONTEXTO DEL CICLO PARA LA IA =====
function buildCycleContextString(cycleContext) {
    if (!cycleContext || cycleContext.totalCycles === 0) {
        return "La usuaria aún no ha registrado ningún ciclo menstrual.";
    }

    let parts = [];
    parts.push(`Estado actual del ciclo: fase ${cycleContext.currentPhase}, día ${cycleContext.cycleDay} del ciclo.`);
    parts.push(`Duración promedio del ciclo: ${cycleContext.averageCycleLength} días.`);
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
app.post("/chat", async (req, res) => {
    try {
        const cycleContext = req.body.cycleContext || null;
        const contextStr = buildCycleContextString(cycleContext);

        const systemContent = `Eres un asistente experto en salud menstrual, ovulación y fases del ciclo. Responde claro, empático y útil.\n\nContexto actual del ciclo de la usuaria:\n${contextStr}\n\nUsa este contexto para responder preguntas como "¿Cuándo me toca?" o "¿Cuántos días faltan?" de forma personalizada.`;

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: systemContent
                    },
                    {
                        role: "user",
                        content: req.body.message
                    }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        res.json({
            reply: response.data.choices[0].message.content
        });

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.json({ reply: "Lo siento, no pude responder en este momento. Intenta de nuevo más tarde." });
    }
});

// ===== ANÁLISIS DE CICLO =====
app.post("/analyze", async (req, res) => {
    try {
        const data = req.body.data;
        const cycleContext = req.body.cycleContext || null;
        const contextStr = buildCycleContextString(cycleContext);

        const systemContent = `Eres un experto en ciclos menstruales. Analiza datos y predice menstruación, ovulación y fases.\n\nContexto actual del ciclo:\n${contextStr}`;

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: systemContent
                    },
                    {
                        role: "user",
                        content: `Analiza estos datos del ciclo: ${JSON.stringify(data)}`
                    }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        res.json({
            result: response.data.choices[0].message.content
        });

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.json({ result: "No pude analizar los datos en este momento. Intenta más tarde." });
    }
});

// ===== INICIAR SERVIDOR =====
app.listen(3000, () => {
    console.log("Servidor corriendo en http://localhost:3000");
});
