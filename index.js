const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 10000;

let lastCall = 0;

app.get("/", (req, res) => {
    res.send("OK");
});

function extractJSON(text) {
    text = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start !== -1 && end !== -1) {
        return text.substring(start, end + 1);
    }

    return text;
}

app.post("/generate", async (req, res) => {
    try {
        const now = Date.now();

        if (now - lastCall < 2500) {
            return res.json({ error: "Rate limited, wait a moment" });
        }

        lastCall = now;

        const prompt = req.body.prompt;
        const selected = req.body.selected;

        if (!prompt) {
            return res.status(400).json({ error: "No prompt" });
        }

        if (!API_KEY) {
            return res.status(500).json({ error: "Missing API key" });
        }

       const fullPrompt = `
You are a Roblox Studio AI builder.

Return ONLY valid JSON.
The response MUST be parseable by JSON.parse().

STRICT RULES:
- No markdown
- No explanations
- No comments
- No text outside JSON
- No trailing commas

========================
OUTPUT FORMAT

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
GENERAL RULES

- Always return "actions"
- Use valid Roblox class names
- Use correct property names
- Use "children" for hierarchy
- Do not invent properties

========================
ANIMATION RULES (R6 ONLY)

If user requests R15:
Return:
{ "error": "Only R6 animations are supported" }

REQUIRED HIERARCHY:

KeyframeSequence
  → Keyframe (MUST include Time)
    → Pose "HumanoidRootPart"
      → Pose "Torso"
        → Pose "Left Arm"
        → Pose "Right Arm"
        → Pose "Left Leg"
        → Pose "Right Leg"

CRITICAL:

- Torso is MANDATORY
- HumanoidRootPart MUST contain Torso
- Limbs MUST be inside Torso
- Minimum 2 Keyframes
- Every Keyframe MUST have "Time"
- Missing Torso = INVALID OUTPUT

========================
EASING RULES

- Only apply easing to Pose
- Do NOT apply easing to Keyframe or KeyframeSequence

EasingDirection:
"In", "Out", "InOut", "OutIn"

EasingStyle:
"Linear", "Bounce", "Elastic", "Cubic"

========================
TRANSFORM RULES

- Position: [x, y, z]
- Orientation: [x, y, z]

========================
VALID EXAMPLE (DO NOT BREAK STRUCTURE)

{
  "actions": [
    {
      "type": "create",
      "class": "KeyframeSequence",
      "name": "Example",
      "parent": "Workspace",
      "children": [
        {
          "class": "Keyframe",
          "name": "Start",
          "properties": { "Time": 0 },
          "children": [
            {
              "class": "Pose",
              "name": "HumanoidRootPart",
              "children": [
                {
                  "class": "Pose",
                  "name": "Torso",
                  "children": [
                    { "class": "Pose", "name": "Left Arm" },
                    { "class": "Pose", "name": "Right Arm" },
                    { "class": "Pose", "name": "Left Leg" },
                    { "class": "Pose", "name": "Right Leg" }
                  ]
                }
              ]
            }
          ]
        },
        {
          "class": "Keyframe",
          "name": "End",
          "properties": { "Time": 1 },
          "children": [
            {
              "class": "Pose",
              "name": "HumanoidRootPart",
              "children": [
                {
                  "class": "Pose",
                  "name": "Torso",
                  "children": [
                    { "class": "Pose", "name": "Left Arm" },
                    { "class": "Pose", "name": "Right Arm" },
                    { "class": "Pose", "name": "Left Leg" },
                    { "class": "Pose", "name": "Right Leg" }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

========================
CONTEXT

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
                            parts: [
                                { text: fullPrompt }
                            ]
                        }
                    ]
                })
            }
        );

        if (response.status === 429) {
            return res.json({ error: "Gemini rate limited (429)" });
        }

        const data = await response.json();

        let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return res.json({ error: "No response from AI", raw: data });
        }

        text = extractJSON(text);

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            return res.json({
                error: "Invalid JSON from AI",
                raw: text
            });
        }

        res.json(parsed);

    } catch (err) {
        console.log("SERVER ERROR:", err);
        res.status(500).json({
            error: err.message
        });
    }
});

app.listen(PORT, () => {
    console.log("Running on port " + PORT);
});
