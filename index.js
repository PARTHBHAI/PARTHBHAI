require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// 🛡️ CORS Config
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.options('*', cors());
app.use(express.json({ limit: '10mb' })); 

app.post('/api/solve', async (req, res) => {
    const { text, image, language } = req.body;

    if (!GEMINI_KEY) return res.status(500).json({ raw: "Server Error: API Key not configured on Render." });

    try {
        // ==========================================
        // 🧠 ADVANCED PROMPT ENGINEERING
        // ==========================================
        const langInstruction = language === 'hi' ? 'Hinglish (a simple, easy-to-understand mix of Hindi and English)' : 'Very simple, easy-to-understand English';
        
        const prompt = `You are an expert CBSE Board (10th & 12th Standard) Math Tutor. 
        Your goal is to explain concepts so simply that any student can understand them.
        Language to use: ${langInstruction}.
        
        CRITICAL FORMATTING INSTRUCTIONS:
        You must solve the problem strictly following the CBSE step-by-step marking pattern:
        1. "Given / Let": What information is provided.
        2. "Formula Used": The exact mathematical formulas needed.
        3. "Implementation": The step-by-step calculation with clear reasoning.
        4. "Final Answer": The final conclusion.

        EXTRA FEATURES TO INCLUDE (If applicable):
        - Graphs: If the problem involves functions, geometry, or calculus, explain the graph shape, key coordinates (x,y intercepts), or use simple ASCII art to represent it.
        - Tables: Use Markdown tables if comparing values or listing data points.
        - Video Links: Include a relevant YouTube search link at the end of the explanation using Markdown (e.g., [Watch Concept Video on YouTube](https://www.youtube.com/results?search_query=concept+name)).

        JSON STRUCTURE REQUIREMENT:
        {
            "steps": [
                { 
                    "title": "Step Title (e.g., Given, Formula, Step 1, Final Answer)", 
                    "math": "Latex equation without $ signs (leave empty if none)", 
                    "desc": "Detailed explanation in ${langInstruction}. Use inline math wrapped in $ signs. Include Markdown links or tables here." 
                }
            ]
        }
        
        Problem: ${text || "Solve the math problem shown in the attached image."}`;

        // Payload with Native JSON response config to prevent parsing crashes
        const payload = { 
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        if (image) {
            payload.contents[0].parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });
        }

        const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload)
        });

        const data = await apiRes.json();
        
        // Catch 429 Rate Limits
        if (data.error && data.error.code === 429) {
            const match = data.error.message.match(/retry in ([\d\.]+)s/i);
            return res.status(429).json({ rate_limit: true, retry_in: match ? Math.ceil(parseFloat(match[1])) : 45, raw: "AI Core cooling down." });
        }

        if (!data.candidates) return res.json({ raw: "AI could not process this request." });

        const rawText = data.candidates[0].content.parts[0].text;

        // ==========================================
        // 🛠️ PARSE RESPONSE
        // ==========================================
        try {
            // Because we used responseMimeType: "application/json", it should be perfectly parseable.
            const jsonResponse = JSON.parse(rawText);
            return res.json(jsonResponse);
        } catch (e) {
            console.error("JSON Parse Error:", e);
            // Fallback just in case
            res.json({ raw: rawText });
        }

    } catch (error) {
        console.error("Server Crash:", error);
        res.status(500).json({ raw: "Internal Server Error during processing." });
    }
});

app.listen(PORT, () => console.log(`🚀 Nebula Backend running on port ${PORT}`));
