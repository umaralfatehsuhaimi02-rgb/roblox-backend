const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

app.get("/", (req, res) => {
    console.log("PING");
    res.send("Server is alive");
});

app.post("/generate", async (req, res) => {
    try {
        const prompt = req.body.prompt;
        const selected = req.body.selected;

        if (!prompt) {
            return res.status(400).json({ error: "No prompt" });
        }

        const fullPrompt = `
You are a Roblox AI builder.

You MUST return ONLY valid JSON.

NO explanations.
NO markdown.
ONLY JSON.

========================
FORMAT:

{
  "actions": [
    {
      "type": "create | set | delete",
      "class": "Instance class name",
      "name": "object name",
      "parent": "Workspace",
      "target": "Workspace.ObjectName",
      "properties": {},
      "children": []
    }
  ]
}

========================
SUPPORTED PROPERTY TYPES:

- boolean → true/false
- number → 0.5
- Vector3 → [x, y, z]
- Color3 → [r, g, b] (0–1)
- NumberRange → [min, max]
- Enum → "Neon", "SmoothPlastic", etc.

========================
IMPORTANT RULES:

- ALWAYS return valid JSON
- ALWAYS include "actions"
- NEVER include text outside JSON
- Use correct Roblox class names
- Use correct property names
- Anchor parts unless told otherwise
- Prefer modifying selected object if given

========================
HIERARCHY:

Use "children" to create nested objects.

========================
EXAMPLES:

-- Create part
{
  "actions": [
    {
      "type": "create",
      "class": "Part",
      "name": "Platform",
      "parent": "Workspace",
      "properties": {
        "Anchored": true,
        "Size": [10,1,10],
        "Position": [0,5,0],
        "Material": "Neon",
        "Color": [0,0,1]
      }
    }
  ]
}

-- UI Example
{
  "actions": [
    {
      "type": "create",
      "class": "ScreenGui",
      "parent": "StarterGui",
      "children": [
        {
          "class": "TextButton",
          "name": "Button",
          "properties": {
            "Text": "Click Me",
            "Size": [0.3,0,0.1,0]
          }
        }
      ]
    }
  ]
}

-- Particle Example
{
  "actions": [
    {
      "type": "create",
      "class": "Part",
      "name": "EmitterPart",
      "parent": "Workspace",
      "properties": {
        "Anchored": true
      },
      "children": [
        {
          "class": "ParticleEmitter",
          "properties": {
            "Rate": 50,
            "Lifetime": [1,2]
          }
        }
      ]
    }
  ]
}

-- Animation Example
{
  "actions": [
    {
      "type": "create",
      "class": "KeyframeSequence",
      "name": "SimpleAnim",
      "parent": "Workspace",
      "children": [
        {
          "class": "Keyframe",
          "properties": { "Time": 0 },
          "children": [
            {
              "class": "Pose",
              "properties": {
                "Name": "Torso"
              }
            }
          ]
        }
      ]
    }
  ]
}

-- Tool Example
{
  "actions": [
    {
      "type": "create",
      "class": "Tool",
      "name": "Sword",
      "parent": "StarterPack",
      "children": [
        {
          "class": "Part",
          "name": "Handle",
          "properties": {
            "Size": [1,4,1]
          }
        }
      ]
    }
  ]
}

========================

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
                    contents: [{ parts: [{ text: fullPrompt }] }]
                })
            }
        );

        const raw = await response.text();

        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            return res.json({ error: "Bad API response", raw });
        }

        let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            return res.json({ error: "Invalid JSON from AI", raw: text });
        }

        if (!parsed.actions) {
            return res.json({ error: "No actions returned", raw: parsed });
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
