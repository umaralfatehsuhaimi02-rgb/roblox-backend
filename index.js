const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

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

async function callGemini(prompt) {
    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": API_KEY
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        }
    );

    const raw = await response.json();
    return raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function generateWithRetry(basePrompt) {
    let text = await callGemini(basePrompt);
    text = extractJSON(text);

    try {
        return JSON.parse(text);
    } catch {}

    const repairPrompt = `
Fix this JSON. Return ONLY valid JSON. Do not explain.

${text}
`;

    let fixed = await callGemini(repairPrompt);
    fixed = extractJSON(fixed);

    try {
        return JSON.parse(fixed);
    } catch {}

    throw new Error("Failed to produce valid JSON");
}

function validate(data) {
    if (!data || typeof data !== "object") return false;
    if (!Array.isArray(data.actions)) return false;

    for (const a of data.actions) {
        if (!a.type) return false;
        if (a.type === "create" && !a.class) return false;
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

Return ONLY valid JSON.

STRICT:
- No markdown
- No explanations
- No text outside JSON
- Must be valid JSON.parse()

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
ANIMATION RULES (R6 ONLY)

If user asks for R15:
Return:
{ "error": "Only R6 animations are supported" }

You MUST follow this EXACT hierarchy:

KeyframeSequence
 → Keyframe (Time REQUIRED)
   → Pose "HumanoidRootPart"
     → Pose "Torso" (MANDATORY)
       → Pose "Left Arm"
       → Pose "Right Arm"
       → Pose "Left Leg"
       → Pose "Right Leg"

CRITICAL REQUIREMENTS:

- Torso MUST ALWAYS exist under HumanoidRootPart
- If Torso is missing → OUTPUT IS INVALID
- HumanoidRootPart MUST have Torso child
- Limbs MUST be inside Torso (not directly under root)

- Minimum 2 Keyframes required
- Every Keyframe MUST include "Time"

========================
EASING RULES

- ONLY apply to Pose
- NEVER apply to Keyframe

EasingDirection:
"In", "Out", "InOut", "OutIn"

EasingStyle:
"Linear", "Bounce", "Elastic", "Cubic"

========================
TRANSFORMS

- Position [x,y,z]
- Orientation [x,y,z]

========================
VALID ANIMATION EXAMPLE (DO NOT BREAK STRUCTURE)

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
          "properties": {
            "Time": 0
          },
          "children": [
            {
              "class": "Pose",
              "name": "HumanoidRootPart",
              "children": [
                {
                  "class": "Pose",
                  "name": "Torso",
                  "children": [
                    {
                      "class": "Pose",
                      "name": "Left Arm"
                    },
                    {
                      "class": "Pose",
                      "name": "Right Arm"
                    },
                    {
                      "class": "Pose",
                      "name": "Left Leg"
                    },
                    {
                      "class": "Pose",
                      "name": "Right Leg"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "class": "Keyframe",
          "name": "End",
          "properties": {
            "Time": 1
          },
          "children": [
            {
              "class": "Pose",
              "name": "HumanoidRootPart",
              "children": [
                {
                  "class": "Pose",
                  "name": "Torso",
                  "children": [
                    {
                      "class": "Pose",
                      "name": "Left Arm"
                    },
                    {
                      "class": "Pose",
                      "name": "Right Arm"
                    },
                    {
                      "class": "Pose",
                      "name": "Left Leg"
                    },
                    {
                      "class": "Pose",
                      "name": "Right Leg"
                    }
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

Selected:
${selected || "none"}

User request:
${prompt}
`;

        const result = await generateWithRetry(fullPrompt);

        if (!validate(result)) {
            return res.json({ error: "Invalid structure", raw: result });
        }

        res.json(result);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("Running on port " + PORT);
});
