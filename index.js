const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

app.get("/", (req, res) => {
    res.send("OK");
});

function cleanJSON(text) {
    text = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .replace(/\n/g, "")
        .trim();

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start !== -1 && end !== -1) {
        text = text.substring(start, end + 1);
    }

    return text;
}

function validateActions(data) {
    if (!data || typeof data !== "object") return false;
    if (!Array.isArray(data.actions)) return false;

    for (const action of data.actions) {
        if (!action.type) return false;

        if (action.type === "create") {
            if (!action.class) return false;
        }
    }

    return true;
}

app.post("/generate", async (req, res) => {
    try {
        const prompt = req.body.prompt;
        const selected = req.body.selected;

        if (!prompt) {
            return res.status(400).json({ error: "No prompt" });
        }

        const fullPrompt = `
You are a Roblox Studio AI builder.

You MUST return ONLY valid JSON.

STRICT RULES:
- NO markdown
- NO backticks
- NO explanations
- NO comments
- NO trailing commas
- NO text outside JSON

The response MUST be parseable by JSON.parse().

========================
FORMAT:

{
  "actions": [
    {
      "type": "create | set | delete",
      "class": "Instance class name",
      "name": "object name",
      "parent": "Workspace | StarterGui | StarterPack",
      "target": "path",
      "properties": {},
      "children": []
    }
  ]
}

========================
SUPPORTED TYPES

- boolean
- number
- Vector3 → [x,y,z]
- Color3 → [r,g,b]
- NumberRange → [min,max]
- UDim2 → [scaleX, offsetX, scaleY, offsetY]
- Enum → string

========================
SYSTEMS

PARTS:
- Part
- Anchored, Size, Position, Color, Material

PARTICLES:
- ParticleEmitter inside Part
- Rate, Lifetime, Speed, Size, Color

UI:
- ScreenGui → Frame → TextButton/TextLabel
- Size [scaleX, offsetX, scaleY, offsetY]

TOOLS:
- Tool in StarterPack
- Must include Handle Part

ANIMATION (R6 ONLY):
- KeyframeSequence → Keyframe → Pose
- Must include Time
- Must include HumanoidRootPart → Torso → limbs

EASING:
- Only on Pose
- EasingStyle: Linear, Bounce, Elastic, Cubic
- EasingDirection: In, Out, InOut, OutIn

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

        let parsedAPI;
        try {
            parsedAPI = JSON.parse(raw);
        } catch {
            return res.json({ error: "Bad API response", raw });
        }

        let text = parsedAPI?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        text = cleanJSON(text);

        let final;
        try {
            final = JSON.parse(text);
        } catch {
            return res.json({
                error: "Invalid JSON from AI",
                raw: text
            });
        }

        if (!validateActions(final)) {
            return res.json({
                error: "Invalid action structure",
                raw: final
            });
        }

        res.json(final);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("Running on port " + PORT);
});
