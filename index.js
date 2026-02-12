require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Middleware
app.use(cors()); // Allows your HTML file to communicate with this server
app.use(express.json({ limit: '10mb' })); // Increased limit to allow image uploads

// API Route
app.post('/api/solve', async (req, res) => {
    const { text, image, language } = req.body;

    // Security check
    if (!GEMINI_KEY) {
        console.error("Missing API Key!");
        return res.status(500).json({ raw: "Server Error: API Key not configured on Render." });
    }

    try {
        const prompt = `You are an expert math tutor. Solve this step-by-step.
        Language: ${language === 'hi' ? 'Hindi' : 'English'}.
        
        IMPORTANT: Return ONLY a valid JSON object. No markdown formatting or extra text.
        Structure:
        {
            "steps": [
                { "title": "Step Title", "math": "Latex equation without $ signs", "desc": "Explanation" }
            ]
        }
        
        Problem: ${text || "Solve the math problem in the image."}`;

        const payload = {
            contents: [{
                parts: [{ text: prompt }]
            }]
        };

        // Attach image if the user uploaded one
        if (image) {
            payload.contents[0].parts.push({
                inline_data: { mime_type: "image/jpeg", data: image }
            });
        }

        // Call Google Gemini (Using Node 18+ native fetch)
        const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await apiRes.json();
        
        if (!data.candidates) {
            console.error("Gemini API Error:", data);
            return res.json({ raw: "AI could not process this request. Ensure the image is clear or the problem is valid." });
        }

        // Clean up the response to ensure it's pure JSON
        let rawText = data.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const json = JSON.parse(rawText);
            res.json(json);
        } catch (e) {
            // If AI didn't return perfect JSON, send back the raw text
            res.json({ raw: rawText });
        }

    } catch (error) {
        console.error("Server Crash:", error);
        res.status(500).json({ raw: "Internal Server Error during processing." });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Nebula Backend running on port ${PORT}`);
});
