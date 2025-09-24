import { EXTRACTION_SYSTEM, get_extraction_prompt, EXTRACTION_SCHEMA, sampleExtractedData } from './prompts.js';
import { tryParseJson } from './utils.js';
import { USE_SAMPLE_DATA, OPENAI_API_KEY } from './config.js';

// IMPORTANT: Replace with your actual OpenAI API key.
const EXTRACTION_MODEL = "gpt-4.1-mini";

/**
 * Calls the LLM to extract structured info from a job description.
 * @param {string} jd_text The job description text.
 * @param {number} max_retries The maximum number of times to retry the API call.
 * @returns {Promise<object>} A promise that resolves to an object containing the extracted data and usage stats.
 */
async function extractWithLlm(jd_text, max_retries = 2) {
    if (USE_SAMPLE_DATA) {
        console.log("USING SAMPLE EXTRACTED DATA");
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
        return Promise.resolve({ data: sampleExtractedData, usage: { total_tokens: 0 } });
    }

    console.log("extractWithLlm called");
    
    const prompt = get_extraction_prompt(jd_text);
    const messages = [
        { "role": "system", "content": EXTRACTION_SYSTEM },
        { "role": "user", "content": prompt }
    ];

    for (let attempt = 1; attempt <= max_retries; attempt++) {
        try {
            console.log(`Sending request to LLM (attempt ${attempt})`);
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: EXTRACTION_MODEL,
                    messages: messages,
                    // Using response_format to encourage JSON output.
                    response_format: { "type": "json_object" } 
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content;
            
            if (content) {
                const parsed = tryParseJson(content);
                if (parsed && typeof parsed === 'object') {
                    console.log("Successfully parsed JSON from LLM", parsed);
                    return { data: parsed, usage: data.usage };
                }
            }
            console.log("LLM returned no usable JSON, will retry if attempts remain.");

        } catch (error) {
            console.error("LLM call exception:", error);
            if (attempt === max_retries) {
                throw error; // rethrow error on last attempt
            }
            await new Promise(resolve => setTimeout(resolve, 500)); // wait before retrying
        }
    }

    // Fallback: return an empty schema if all attempts fail.
    console.log("All LLM attempts failed — returning fallback empty schema");
    const empty = {};
    for (const [k, v] of Object.entries(EXTRACTION_SCHEMA)) {
        empty[k] = v.includes("list") ? [] : null;
    }
    return { data: empty, usage: { total_tokens: 0 } };
}

/**
 * Primary entrypoint for extraction.
 * @param {string} jd_text The job description text.
 * @returns {Promise<object>} A promise that resolves to an object with `data` and `usage` properties.
 */
export function extract(jd_text) {
    return extractWithLlm(jd_text);
}
