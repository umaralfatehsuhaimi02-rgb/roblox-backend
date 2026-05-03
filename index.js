const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;

const RULES = `
You are a Roblox Studio AI builder.

STRICT:
- Return ONLY valid JSON
- No markdown
- No explanations
- Must be valid JSON.parse()

FORMAT:
{
  "actions": [
    {
      "type": "create | set | delete",
      "class": "Instance class name",
      "name": "object name",
      "parent": "Workspace | StarterGui | StarterPack",
      "properties": {},
      "children": []
    }
  ]
}

GENERAL RULES:
- Always use valid Roblox classes
- Always use correct hierarchy
- Use children for nesting
- Do not invent properties

PART RULES:
- Parts must be Anchored = true unless specified
- Use Size [x,y,z]
- Use Position [x,y,z]

SCRIPT RULES:
- Scripts must include Source
- Source must be valid Lua code

TOOL RULES:
- Tools go in StarterPack
- Must include Handle (Part)

UI RULES:
- ScreenGui → Frame → TextLabel
- Use UDim2 for size/position

PARTICLE RULES:
- Use ParticleEmitter
- Must be parented to a Part
- Include Rate, Lifetime

ANIMATION RULES (R6 ONLY):
- KeyframeSequence → Keyframe → Pose
- Must include HumanoidRootPart → Torso → limbs
- Minimum 2 keyframes
- Every Keyframe must include Time
- Missing Torso = INVALID
`;

let lastCall = 0;
let memory = [];

let lastRequestTime = Date.now();

app.use((req, res, next) => {
	lastRequestTime = Date.now();
	next();
});

app.get("/status", (req, res) => {
	const now = Date.now();
	const inactiveMs = now - lastRequestTime;

	res.json({
		status: "online",
		inactiveSeconds: Math.floor(inactiveMs / 1000)
	});
});

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

        if (now - lastCall < 2000) {
            return res.json({ error: "Rate limited, wait..." });
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

       const examples = memory.slice(-5).map(e => `
User: ${e.prompt}
Output:
${JSON.stringify(e.result)}
`).join("\n");

const fullPrompt = `
${RULES}

GOOD EXAMPLES:
${examples}

CONTEXT:
Selected: ${selected || "none"}

USER REQUEST:
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

app.post("/feedback", (req, res) => {
    const { rating, prompt, result } = req.body;

    if (rating === "good" && prompt && result) {
        memory.push({
            prompt,
            result
        });

        if (memory.length > 50) {
            memory.shift();
        }
    }

    res.json({
        status: "Feedback received. This helps improve future AI results."
    });
});

app.listen(PORT, () => {
    console.log("Running on port " + PORT);
});
