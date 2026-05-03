const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

// health check
app.get("/", (req, res) => {
    console.log("PING");
    res.send("Server is alive");
});

app.post("/generate", async (req, res) => {
    try {
        console.log("Incoming:", req.body);

        const prompt = req.body.prompt;
        const selected = req.body.selected;

        if (!prompt) {
            return res.status(400).json({ error: "No prompt provided" });
        }

        const fullPrompt = `
You are a Roblox AI builder.

Return ONLY valid JSON in this format:

{
  "actions": [
    {
      "type": "create | set | delete",
      "class": "Instance class name",
      "name": "object name",
      "parent": "Workspace",
      "target": "Workspace.ObjectName",
      "properties": {}
    }
  ]
}

Rules:
- No explanations
- No markdown
- Only JSON
- Vector3 = [x, y, z]
- Color3 = [r, g, b] (0–1)
- NumberRange = [min, max]

If a selected object is provided, prefer modifying it.

Selected:
${selected || "none"}

User request:
${prompt}
`;

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-goog-api-key": API_KEY
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: fullPrompt }]
                        }
                    ]
                })
            }
        );

        const raw = await response.text();
        console.log("RAW:", raw);

        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            return res.json({ error: "Invalid API response", raw });
        }

        let text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        text = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            console.log("Bad JSON from AI:", text);
            return res.json({
                error: "AI returned invalid JSON",
                raw: text
            });
        }

        if (!parsed.actions) {
            return res.json({
                error: "No actions returned",
                raw: parsed
            });
        }

        res.json(parsed);

    } catch (err) {
        console.log("SERVER ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Running on port " + PORT);
});
