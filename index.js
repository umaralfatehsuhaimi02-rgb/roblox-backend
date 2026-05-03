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

You MUST return ONLY valid JSON.

STRICT RULES:
- NO markdown
- NO backticks
- NO explanations
- NO comments
- NO trailing commas
- NO text outside JSON

If you break JSON format, the system will reject your response.

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
SUPPORTED PROPERTY TYPES

- boolean → true/false
- number → 0.5
- Vector3 → [x,y,z]
- Color3 → [r,g,b]
- NumberRange → [min,max]
- UDim2 → [scaleX, offsetX, scaleY, offsetY]
- Enum → string

========================
GENERAL RULES

- ALWAYS return JSON
- ALWAYS include "actions"
- NEVER include text outside JSON
- Use correct Roblox class names
- Use correct property names
- Use "children" for hierarchy
- Anchor parts unless told otherwise
- Do not invent invalid properties
- Prefer selected object if provided

========================
PART RULES

Class: Part

Common properties:
- Anchored
- CanCollide
- Size [x,y,z]
- Position [x,y,z]
- Color [r,g,b]
- Material (string)
- Transparency

========================
PARTICLE RULES

Use ParticleEmitter inside a Part

Properties:
- Rate
- Lifetime [min,max]
- Speed [min,max]
- Size [min,max]
- Color [r,g,b]

========================
UI RULES

Hierarchy:
ScreenGui → Frame → UI elements

Classes:
- ScreenGui
- Frame
- TextLabel
- TextButton

Size format:
[scaleX, offsetX, scaleY, offsetY]

========================
TOOL RULES

Class: Tool
Parent: StarterPack

Tool MUST contain:
- Handle (Part)

========================
ANIMATION RULES (R6 ONLY)

If user asks for R15:
Return:
{ "error": "Only R6 animations are supported" }

Use:
- KeyframeSequence
- Keyframe
- Pose

Hierarchy:
KeyframeSequence
 → Keyframe
   → Pose (HumanoidRootPart)
     → Pose (Torso)
       → Pose (Left Arm, Right Arm, Left Leg, Right Leg)

STRICT RULES:

- MUST use at least 2 Keyframes
- EVERY Keyframe MUST include "Time"
- Root Pose MUST be "HumanoidRootPart"
- Torso is REQUIRED
- Limbs:
  "Left Arm", "Right Arm", "Left Leg", "Right Leg"

EASING RULES:

- EasingStyle and EasingDirection are ONLY allowed on Pose
- NEVER put easing on Keyframe or KeyframeSequence

EasingDirection:
"In", "Out", "InOut", "OutIn"

EasingStyle:
"Linear", "Bounce", "Elastic", "Cubic"

TRANSFORMS:

- Position [x,y,z]
- Orientation [x,y,z]

========================
EXAMPLES

PART:

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

PARTICLE:

{
  "actions": [
    {
      "type": "create",
      "class": "Part",
      "name": "FirePart",
      "parent": "Workspace",
      "properties": {
        "Anchored": true
      },
      "children": [
        {
          "class": "ParticleEmitter",
          "properties": {
            "Rate": 50,
            "Lifetime": [1,2],
            "Speed": [5,10],
            "Color": [1,0.5,0]
          }
        }
      ]
    }
  ]
}

UI:

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

TOOL:

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

ANIMATION:

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
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Running on port " + PORT);
});
