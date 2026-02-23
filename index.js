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
        
        // 🧠 THE CLEANED & STRICT PROMPT
        const prompt = `You are an expert CBSE Board (10th & 12th Standard) Math Tutor. 
        Language to use: ${langInstruction}.
        
        CRITICAL MATH FORMATTING RULES (MANDATORY):
        1. Inside the "desc" field, EVERY SINGLE mathematical equation, formula, or variable MUST be wrapped in $ signs (for inline) or $$ signs (for standalone lines).
           - Correct Example: The value of $x$ is $5$.
           - Correct Example: $$ \\sin^2(x) + \\cos^2(x) = 1 $$
           - INCORRECT (DO NOT DO THIS): \\sin(A+B) = \\sin A \\cos B (It is missing $ signs!)
        2. Use standard Markdown for tables and bold text. 
        3. Use normal line breaks. Do not use manual escape hacks.

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
                    "math": "A single major Latex equation for this step (no $ signs here)", 
                    "desc": "Explanation here. Use $ for ALL math inside this text. Markdown tables allowed." 
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

        // 🛡️ PARSER SAFETY NET: Strip out markdown wrappers and handle array vs object variations
        rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

        try {
            let jsonResponse = JSON.parse(rawText);
            
            // Safety check: if AI returns an array of steps instead of an object containing steps
            if (Array.isArray(jsonResponse)) {
                jsonResponse = { steps: jsonResponse };
            } else if (!jsonResponse.steps) {
                jsonResponse = { steps: [{ title: "Solution", math: "", desc: rawText }] };
            }
            
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
