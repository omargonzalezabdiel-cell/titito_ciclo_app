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

// ===== CHAT IA =====
app.post("/chat", async (req, res) => {
    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: "Eres un asistente experto en salud menstrual, ovulación y fases del ciclo. Responde claro y útil."
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
        res.json({ reply: "Error con la IA" });
    }
});

// ===== ANÁLISIS DE CICLO =====
app.post("/analyze", async (req, res) => {
    try {
        const data = req.body.data;

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: "Eres un experto en ciclos menstruales. Analiza datos y predice menstruación, ovulación y fases."
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
        res.json({ result: "Error analizando datos" });
    }
});

// ===== INICIAR SERVIDOR =====
app.listen(3000, () => {
    console.log("Servidor corriendo en http://localhost:3000");
});