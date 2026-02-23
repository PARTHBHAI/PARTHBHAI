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
        const langInstruction = language === 'hi' 
            ? 'Hinglish (Hindi written STRICTLY in the English alphabet. Example: "Ye ek formula hai". DO NOT use Devanagari script.)' 
            : 'Very simple, easy-to-understand English';
        
        // 🧠 THE ULTIMATE PROMPT FIX
        const prompt = `You are an expert CBSE Board (10th & 12th Standard) Math Tutor. 
        Language to use: ${langInstruction}.
        
        CRITICAL JSON & LATEX ESCAPING RULES (MANDATORY):
        1. You are generating JSON. Every single LaTeX backslash MUST be double-escaped. 
           - Write \\\\frac instead of \\frac
           - Write \\\\sin instead of \\sin
           - Write \\\\pi instead of \\pi
           - Write \\\\theta instead of \\theta
        2. DO NOT use \\n or \\\\n for line breaks. If you need a line break in a math equation or text description, use the exact word [NEWLINE].
        3. DO NOT use LaTeX like \\text{} in the description field. Use standard Markdown tables for charts (like the ASTC rule) and ASCII for graphs.

        FORMATTING INSTRUCTIONS:
        1. "Given / Let": Information provided.
        2. "Formula Used": Mathematical formulas.
        3. "Implementation / Steps": Step-by-step calculation.
        4. "Final Answer": The final conclusion.

        JSON STRUCTURE REQUIREMENT:
        {
            "steps": [
                { 
                    "title": "Step Title", 
                    "math": "Latex equation here (double escaped, use [NEWLINE] for line breaks)", 
                    "desc": "Explanation here. Use [NEWLINE] for line breaks. Markdown tables allowed." 
                }
            ]
        }
        
        Problem: ${text || "Solve the math problem shown in the attached image."}`;

        const payload = { 
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        };

        if (image) payload.contents[0].parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });

        const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });

        const data = await apiRes.json();
        
        if (data.error && data.error.code === 429) {
            const match = data.error.message.match(/retry in ([\d\.]+)s/i);
            return res.status(429).json({ rate_limit: true, retry_in: match ? Math.ceil(parseFloat(match[1])) : 45, raw: "AI Core cooling down." });
        }
        if (!data.candidates) return res.json({ raw: "AI could not process this request." });

        let rawText = data.candidates[0].content.parts[0].text;
        
        // 🛡️ PRE-PARSER SAFETY NET: Strip out any markdown wrapper Gemini tries to add
        rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

        try {
            const jsonResponse = JSON.parse(rawText);
            return res.json(jsonResponse);
        } catch (e) {
            console.error("JSON Parse Error:", e);
            res.json({ raw: rawText });
        }

    } catch (error) {
        console.error("Server Crash:", error);
        res.status(500).json({ raw: "Internal Server Error during processing." });
    }
});

app.listen(PORT, () => console.log(`🚀 MathAI Backend running on port ${PORT}`));
