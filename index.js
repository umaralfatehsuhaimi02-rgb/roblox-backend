const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

let memory = [];
let lastCall = 0;

function extractJSON(text) {
	text = text.replace(/```json/g, "").replace(/```/g, "").trim();
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start !== -1 && end !== -1) {
		return text.substring(start, end + 1);
	}
	return text;
}

async function callGemini(prompt) {
	try {
		const res = await fetch(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-goog-api-key": GEMINI_KEY
				},
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }]
				})
			}
		);

		const data = await res.json();
		let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

		console.log("Gemini:", text);

		return text;
	} catch (err) {
		console.log("Gemini error:", err);
		return null;
	}
}

async function callOpenRouter(prompt) {
	try {
		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${OPENROUTER_KEY}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: "deepseek/deepseek-chat",
				messages: [
					{ role: "system", content: "Return ONLY valid JSON." },
					{ role: "user", content: prompt }
				]
			})
		});

		const data = await res.json();

		if (!res.ok) {
			console.log("OpenRouter error:", data);
			return null;
		}

		let text = data?.choices?.[0]?.message?.content;

		console.log("OpenRouter:", text);

		return text;
	} catch (err) {
		console.log("OpenRouter crash:", err);
		return null;
	}
}

function buildPrompt(userPrompt, selected) {
	const examples = memory.slice(-5).map(e => `
User: ${e.prompt}
Output:
${JSON.stringify(e.result)}
`).join("\n");

	return `
You are a Roblox Studio AI builder.

Return ONLY valid JSON.

${examples}

Selected: ${selected || "none"}

User: ${userPrompt}
`;
}

app.get("/", (req, res) => {
	res.send("OK");
});

app.post("/generate", async (req, res) => {
	try {
		const now = Date.now();
		if (now - lastCall < 500) {
			return res.json({ error: "Rate limited" });
		}
		lastCall = now;

		const { prompt, selected } = req.body;
		const fullPrompt = buildPrompt(prompt, selected);

		let text = await callGemini(fullPrompt);

		if (!text || text.length < 10) {
			console.log("Falling back to OpenRouter");
			text = await callOpenRouter(fullPrompt);
		}

		if (!text) {
			return res.json({ error: "All models failed" });
		}

		text = extractJSON(text);

		let parsed;

		try {
			parsed = JSON.parse(text);
		} catch (e) {
			console.log("INVALID JSON:", text);
			return res.json({ error: "Invalid JSON", raw: text });
		}

		res.json(parsed);

	} catch (err) {
		console.log("SERVER ERROR:", err);
		res.status(500).json({ error: err.message });
	}
});

app.post("/feedback", (req, res) => {
	const { rating, prompt, result } = req.body;

	if (rating === "good") {
		memory.push({ prompt, result });
		if (memory.length > 50) memory.shift();
	}

	res.json({ ok: true });
});

app.listen(PORT, () => {
	console.log("Running on port " + PORT);
});
