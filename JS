const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

app.post("/generate", async (req, res) => {
    try {
        const prompt = req.body.prompt;

        if (!prompt) {
            return res.status(400).json({ error: "No prompt sent" });
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: "Return ONLY Roblox Lua code. No explanations.\n" + prompt }
                            ]
                        }
                    ]
                })
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            return res.status(500).json({ error: errText });
        }

        const data = await response.json();

        const code =
            data?.candidates?.[0]?.content?.parts?.[0]?.text || "-- no response";

        res.json({ code });

    } catch (err) {
        console.log("ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
