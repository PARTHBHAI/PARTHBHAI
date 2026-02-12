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
        const prompt = `You are an expert math tutor. Solve this step-by-step.
        Language: ${language === 'hi' ? 'Hindi' : 'English'}.
        
        CRITICAL INSTRUCTION: Return ONLY a raw JSON object. NO markdown, NO \`\`\`json, NO text outside the JSON. 
        Do NOT use literal newlines (\\n) inside the JSON string values.
        
        Structure:
        {
            "steps": [
                { "title": "Step Title", "math": "Latex equation without $ signs", "desc": "Explanation with inline math wrapped in $ signs" }
            ]
        }
        
        Problem: ${text || "Solve the math problem in the image."}`;

        const payload = { contents: [{ parts: [{ text: prompt }] }] };

        if (image) payload.contents[0].parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });

        const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });

        const data = await apiRes.json();
        
        // Catch 429 Rate Limits
        if (data.error && data.error.code === 429) {
            const match = data.error.message.match(/retry in ([\d\.]+)s/i);
            return res.status(429).json({ rate_limit: true, retry_in: match ? Math.ceil(parseFloat(match[1])) : 45, raw: "AI Core cooling down." });
        }

        if (!data.candidates) return res.json({ raw: "AI could not process this request." });

        let rawText = data.candidates[0].content.parts[0].text;

        // ==========================================
        // 🛠️ BULLETPROOF JSON EXTRACTOR
        // ==========================================
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            let jsonStr = rawText.substring(firstBrace, lastBrace + 1);
            // Remove raw newlines that break JSON.parse
            jsonStr = jsonStr.replace(/[\n\r]/g, ' '); 
            
            try {
                return res.json(JSON.parse(jsonStr));
            } catch (e) {
                console.error("JSON Parse Error:", e);
                // Fall through to raw output if it still fails
            }
        }
        
        res.json({ raw: rawText });

    } catch (error) {
        console.error("Server Crash:", error);
        res.status(500).json({ raw: "Internal Server Error during processing." });
    }
});

app.listen(PORT, () => console.log(`🚀 Nebula Backend running on port ${PORT}`));
