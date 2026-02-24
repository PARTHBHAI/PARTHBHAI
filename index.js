require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Fetch the comma-separated keys and turn them into an array
const MATH_KEYS = process.env.MATH_API_KEYS ? process.env.MATH_API_KEYS.split(',') : [];

// 2. Variable to keep track of whose turn it is
let currentMathKeyIndex = 0;

// 3. Function to get the next key (Round-Robin Rotation)
function getNextMathKey() {
    if (MATH_KEYS.length === 0) return null;
    const key = MATH_KEYS[currentMathKeyIndex];
    // Move to the next key, and loop back to 0 if we reach the end
    currentMathKeyIndex = (currentMathKeyIndex + 1) % MATH_KEYS.length;
    return key;
}

// 🛡️ CORS Config
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.options('*', cors());
app.use(express.json({ limit: '10mb' })); 

app.post('/api/solve', async (req, res) => {
    const { text, image, language } = req.body;

    // 🔑 GRAB THE NEXT AVAILABLE KEY
    const ACTIVE_KEY = getNextMathKey();

    if (!ACTIVE_KEY) return res.status(500).json({ raw: "Server Error: No API Keys configured on Render." });

    try {
        const langInstruction = language === 'hi' 
            ? 'Hinglish (Hindi written STRICTLY in the English alphabet. Example: "Ye ek formula hai". DO NOT use Devanagari script.)' 
            : 'Very simple, easy-to-understand English';
        
        const prompt = `You are an expert CBSE Board (10th & 12th Standard) Math Tutor. 
        Language to use: ${langInstruction}.
        
        CRITICAL MATH FORMATTING RULES:
        1. "desc" field: EVERY SINGLE mathematical variable, fraction, or equation MUST be wrapped in $ signs (inline) or $$ signs (standalone). 
        2. "math" field: DO NOT use $ signs here. Provide pure LaTeX. If the equation has multiple lines, you MUST wrap it in \\begin{aligned} ... \\end{aligned}.
        3. ASCII Graphs vs Tables: ONLY use \`\`\`text ... \`\`\` blocks for drawing visual x-y coordinate geometry plots. For the ASTC rule, quadrant grids, or standard text data, YOU MUST use standard Markdown tables. NEVER put markdown lists or textual rules inside \`\`\`text blocks.

        CBSE FORMATTING STEPS:
        1. "Given / Let": Information provided.
        2. "Formula Used": Mathematical formulas.
        3. "Implementation / Steps": Step-by-step calculation.
        4. "Final Answer": The final conclusion.
        
        Problem: ${text || "Solve the math problem shown in the attached image."}`;

        const payload = { 
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        steps: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    title: { type: "STRING", description: "The step title" },
                                    math: { type: "STRING", description: "Pure LaTeX formula. Use aligned environment for multiple lines." },
                                    desc: { type: "STRING", description: "Explanation with $math$ and markdown." }
                                },
                                required: ["title", "math", "desc"]
                            }
                        }
                    },
                    required: ["steps"]
                }
            }
        };

        if (image) payload.contents[0].parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });

        // Use the ACTIVE_KEY that was randomly selected for this specific request
        const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${ACTIVE_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });

        const data = await apiRes.json();
        
        if (data.error && data.error.code === 429) {
            const match = data.error.message.match(/retry in ([\d\.]+)s/i);
            return res.status(429).json({ rate_limit: true, retry_in: match ? Math.ceil(parseFloat(match[1])) : 45, raw: "AI Core cooling down." });
        }
        if (!data.candidates) return res.json({ raw: "AI could not process this request." });

        let rawText = data.candidates[0].content.parts[0].text;

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

app.listen(PORT, () => console.log(`🚀 SpaceTech Backend running on port ${PORT} with ${MATH_KEYS.length} Math Keys active.`));
