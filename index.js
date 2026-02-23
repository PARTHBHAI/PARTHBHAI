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
        // --- STRICT HINGLISH RULE ADDED ---
        const langInstruction = language === 'hi' 
            ? 'Hinglish (Hindi written STRICTLY in the English alphabet. Example: "Ye ek formula hai". DO NOT use Devanagari script.)' 
            : 'Very simple, easy-to-understand English';
        
        // --- 🛠️ THE PROMPT FIX: Double Escaping Demanded ---
        const prompt = `You are an expert CBSE Board (10th & 12th Standard) Math Tutor. 
        Your goal is to explain concepts so simply that any student can understand them.
        Language to use: ${langInstruction}.
        
        CRITICAL JSON & LATEX RULES (MUST FOLLOW OR SYSTEM CRASHES):
        1. You MUST double-escape ALL LaTeX backslashes inside strings. 
           - Write \\\\frac instead of \\frac
           - Write \\\\times instead of \\times
           - Write \\\\sin instead of \\sin
        2. DO NOT wrap the output in markdown \`\`\`json blocks. Return raw JSON text only.
        
        CRITICAL FORMATTING INSTRUCTIONS:
        You must solve the problem strictly following the CBSE step-by-step marking pattern:
        1. "Given / Let": What information is provided.
        2. "Formula Used": The exact mathematical formulas needed.
        3. "Implementation / Steps": The step-by-step calculation.
        4. "Final Answer": The final conclusion.

        GRAPH AND TABLE INSTRUCTIONS:
        - Graphs: If needed, provide a text-based ASCII graph. Wrap it inside triple backticks like this: \`\`\`text [graph] \`\`\`
        - Tables: Use Markdown tables if needed.

        JSON STRUCTURE REQUIREMENT:
        {
            "steps": [
                { 
                    "title": "Step Title", 
                    "math": "Latex equation here (double escaped, no $ signs)", 
                    "desc": "Detailed explanation. Use inline math wrapped in $ signs (e.g., $\\\\cos A$). Put ASCII graphs here." 
                }
            ]
        }
        
        Problem: ${text || "Solve the math problem shown in the attached image."}`;

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
        
        if (data.error && data.error.code === 429) {
            const match = data.error.message.match(/retry in ([\d\.]+)s/i);
            return res.status(429).json({ rate_limit: true, retry_in: match ? Math.ceil(parseFloat(match[1])) : 45, raw: "AI Core cooling down." });
        }

        if (!data.candidates) return res.json({ raw: "AI could not process this request." });

        let rawText = data.candidates[0].content.parts[0].text;

        // ==========================================
        // 🛠️ THE PARSING FIX: Strip Markdown from JSON
        // ==========================================
        // Gemini sometimes adds ```json to the start of the text, which breaks JSON.parse
        rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

        try {
            const jsonResponse = JSON.parse(rawText);
            return res.json(jsonResponse);
        } catch (e) {
            console.error("JSON Parse Error:", e);
            console.error("Raw Text Received:", rawText); // Logs to Render console for debugging
            res.json({ raw: rawText });
        }

    } catch (error) {
        console.error("Server Crash:", error);
        res.status(500).json({ raw: "Internal Server Error during processing." });
    }
});

app.listen(PORT, () => console.log(`🚀 Nebula Backend running on port ${PORT}`));
