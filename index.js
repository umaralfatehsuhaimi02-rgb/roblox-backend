const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

app.get("/", (req, res) => {
    res.send("OK");
});

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
NO markdown.
NO explanations.

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

SUPPORTED TYPES:

- boolean → true/false
- number → 0.5
- Vector3 → [x,y,z]
- Color3 → [r,g,b]
- NumberRange → [min,max]
- Enum → string

========================
PARTICLE EFFECT RULES

Use ParticleEmitter inside a Part.

Supported properties:
- Rate (number)
- Lifetime [min,max]
- Speed [min,max]
- Size [min,max]
- Color [r,g,b]
- Transparency (number)

Example:

{
  "actions": [
    {
      "type": "create",
      "class": "Part",
      "name": "FirePart",
      "parent": "Workspace",
      "properties": {
        "Anchored": true,
        "Position": [0,5,0]
      },
      "children": [
        {
          "class": "ParticleEmitter",
          "properties": {
            "Rate": 50,
            "Lifetime": [1,2],
            "Speed": [5,10],
            "Color": [1,0.5,0],
            "Size": [1,2]
          }
        }
      ]
    }
  ]
}

========================
TOOL RULES

Use Tool with Handle part.

Example:

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
UI RULES

Use ScreenGui → UI elements.

Supported classes:
- ScreenGui
- Frame
- TextLabel
- TextButton

UI Size format:
- [scaleX, offsetX, scaleY, offsetY]

Example:

{
  "actions": [
    {
      "type": "create",
      "class": "ScreenGui",
      "parent": "StarterGui",
      "children": [
        {
          "class": "Frame",
          "name": "MainFrame",
          "properties": {
            "Size": [0.3,0,0.3,0],
            "BackgroundColor3": [0,0,0]
          },
          "children": [
            {
              "class": "TextButton",
              "name": "PlayButton",
              "properties": {
                "Text": "Play",
                "Size": [1,0,0.3,0]
              }
            }
          ]
        }
      ]
    }
  ]
}

========================
KEYFRAME SEQUENCE RULES (R6 ONLY)

-If the user asks for R15 respond them:
"Error, R15 not supported"

You MUST follow this EXACT structure.

- Only R6 rigs are supported
- Required limbs:
  "Torso", "Left Arm", "Right Arm", "Left Leg", "Right Leg"
- Root must be "HumanoidRootPart"
- Every Keyframe MUST have "Time"
- Use at least 2 keyframes
- Use children hierarchy EXACTLY as shown

Easing enums:
- EasingDirection: "In", "Out", "InOut", "OutIn"
- EasingStyle: "Linear", "Bounce", "Elastic", "Cubic"

Position = [x,y,z]
Orientation = [x,y,z]

========================
VALID EXAMPLE:

{
  "actions": [
    {
      "type": "create",
      "class": "KeyframeSequence",
      "name": "Wave",
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
              "properties": {
                "EasingStyle": "Linear",
                "EasingDirection": "In"
              },
              "children": [
                {
                  "class": "Pose",
                  "name": "Torso",
                  "children": [
                    {
                      "class": "Pose",
                      "name": "Left Arm",
                      "properties": {
                        "Orientation": [0,0,-45]
                      }
                    },
                    {
                      "class": "Pose",
                      "name": "Right Arm",
                      "properties": {
                        "Orientation": [0,0,45]
                      }
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
              "properties": {
                "EasingStyle": "Linear",
                "EasingDirection": "Out"
              },
              "children": [
                {
                  "class": "Pose",
                  "name": "Torso",
                  "children": [
                    {
                      "class": "Pose",
                      "name": "Left Arm",
                      "properties": {
                        "Orientation": [0,0,-170]
                      }
                    },
                    {
                      "class": "Pose",
                      "name": "Right Arm",
                      "properties": {
                        "Orientation": [0,0,170]
                      }
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

================================================

GENERAL RULES

- If a models orientation needs to be changed, gets the models pivot, use CFrame.Angles and use PivotTo
- ALWAYS return JSON
- ALWAYS include actions
- USE children for hierarchy
- DO NOT include invalid properties
- Anchor parts unless told otherwise

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
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Running on port " + PORT);
});
