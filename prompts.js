/**
 * Centralized prompts, schema and profile for the JD extractor + comparator.
 * - Use get_extraction_prompt(jd_text) to build the extraction prompt.
 * - Use get_compare_prompt(extracted_json, profile_json) to build the compare prompt.
 * - The single-source EXTRACTION_SCHEMA drives extraction template generation.
 */

// -----------------------
// Candidate profile (final my_profile JSON)
// -----------------------

export const my_profile = {
  "requirements": {
    "country": "Canada",
    "min_salary_cad": 45000,
    "max_salary_cad": 90000,
    "min_experience_years": 0,
    "max_experience_years": 2,
    "highest_education": "Bachelors in Computer Engineering",
    "spoken_languages": ["English"],
    "job_field": ["software development", "web development"],
    "employment_types_allowed": ["full-time", "internship"],
    "min_employees_in_company": 50
  },
  "preferences": {
    "desired_salary_cad": 65000,
    "preferred_work_mode": ["remote", "hybrid"],
    "preferred_locations": ["Vancouver"],
    "experience_range_preferred": [0, 1],
    "role_priority_order": ["backend", "frontend", "fullstack", "cloud", "data", "other"],
    "tech_stack": {
      "comfortable_with": ["python", "sql", "fastapi", "flask", "postgres", "react", "docker"]
    },
    "company": {
      "preferred_size": ["large"]
    },
    "preferred_seniority_levels": ["Entry", "Junior"]
  }
};

// -----------------------
// Extraction schema (single source of truth)
// -----------------------
export const EXTRACTION_SCHEMA = {
    "title": "string | null",
    "company_name": "string | null",
    "location": "string | null",
    "country_hint": "string | null",
    "remote": "string | null",
    "employment_type": "string | null",
    "salary_text": "string | null",
    "salary_min_cad": "number | null",
    "salary_max_cad": "number | null",
    "experience_required_text": "string | null",
    "experience_years_min": "number | null",
    "experience_years_max": "number | null",
    "spoken_languages": "list[string] | []",
    "programming_languages": "list[string] | []",
    "required_skills": "list[string] | []",
    "preferred_skills": "list[string] | []",
    "responsibilities": "list[string] | []",
    "qualifications": "list[string] | []",
    "min_education": "string | null",
    "seniority_level": "string | null",
    "company_size": "string | null",
    "posting_date": "string | null",
    "closing_date": "string | null",
    "application_instructions": "string | null",
    "job_field": "string | null"
};

// -----------------------
// Helpers for prompt generation
// -----------------------
function _schema_fields_text(schema) {
    return Object.entries(schema)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n");
}

export const EXTRACTION_SYSTEM =
    "You are a careful JSON extractor. Read the job description and return EXACTLY one JSON object " +
    "that follows the provided schema and template. Return ONLY valid JSON (no commentary). " +
    "If a numeric field cannot be reliably inferred, use null. If a list field is missing, return []. " +
    "Be conservative: prefer null/empty to inventing facts.";

export const EXTRACTION_INSTRUCTIONS_HEADER =
    "Extract the following fields from the job description and return them as a JSON object EXACTLY " +
    "following the schema below. If a field is missing, set it to null (scalar) or [] (list).";

export const EXPLANATION_SYSTEM = `You are a concise assistant that, given an extracted JD JSON and an ideal profile, gives (1) eligibility decision and reason(s) (if ineligible), (2) a score between 0 and 100 (if eligible), (3) 5 pros and 5 cons explaining why the score is not 100, and (4) any flagged missing fields. Return only JSON with keys: eligible (bool), eligibility_reasons (list), score (number or null), breakdown (object), pros(list), cons(list), flagged_missing(list). Use the structured data passed to you as truth; do not invent facts.`;

export const EXPLANATION_USER_TEMPLATE = ` Extracted JD JSON: {extracted_json} Ideal profile JSON: {ideal_json} Compute eligibility and score using these rules in code: - Location must include "Canada" or be remote allowing Canada to be eligible. - Salary must not be < 45,000 CAD (if salary provided). - Experience requirement must not require more than 2 years. (But code will enforce exact decisions; here provide human readable reasons and the numeric score components.) Return only a JSON object conforming to the described keys. `;

export function get_extraction_prompt(jd_text, schema = EXTRACTION_SCHEMA) {
    const fields_text = _schema_fields_text(schema);
    const template_obj = {};
    for (const [k, v] of Object.entries(schema)) {
        template_obj[k] = v.includes("list") ? [] : null;
    }
    const template_json = JSON.stringify(template_obj, null, 2);
    const prompt =
        `${EXTRACTION_INSTRUCTIONS_HEADER}\n\n` +
        `Schema fields (name: type/hint):\n\n` +
        `${fields_text}\n\n` +
        `Please return a single JSON object following this template EXACTLY:\n\n` +
        `${template_json}\n\n` +
        `Job description:\n--------\n` +
        `${jd_text.trim()}\n` +
        `--------\n\n` +
        `Return ONLY the JSON object.`;
    return prompt;
}

export function get_extraction_schema() {
    return EXTRACTION_SCHEMA;
}

// -----------------------
// Utility: convert informal schema -> JSON Schema (basic)
// -----------------------
export function build_json_schema(schema) {
    const props = {};
    for (const [k, v] of Object.entries(schema)) {
        const v_lower = v.toLowerCase();
        if (v_lower.includes("number")) {
            props[k] = { "type": ["number", "null"] };
        } else if (v_lower.includes("list")) {
            props[k] = { "type": "array", "items": { "type": "string" } };
        } else {
            props[k] = { "type": ["string", "null"] };
        }
    }
    return { "type": "object", "properties": props, "additionalProperties": true };
}

// -----------------------
// Comparison / classification prompts and output schema
// -----------------------
export const COMPARE_SYSTEM =
    "You are a strict JSON classifier. Input: (1) a job posting extraction JSON (fields parsed from the JD), " +
    "and (2) the candidate's profile JSON. Task: Compare the job description fields to the candidate's " +
    "profile and classify each relevant field into one of four buckets: \"red\" (Not eligible), " +
    "\"yellow\" (Eligible but away from preferred), \"grey\" (Informational / unknown), " +
    "or \"green\" (Eligible and preferred). RETURN EXACTLY ONE JSON OBJECT following the provided output schema. " +
    "Do NOT invent numeric values or dates. If a field value is missing in the JD, set evidence to null. " +
    "For each field entry include: field name, color, an explanation string that cites the JD value and the relevant " +
    "profile constraint (e.g., \"salary offered (40000) < salary_min (50000)\"), and an evidence field (the raw value). " +
    "Do NOT output any text outside the JSON.";

export function get_compare_prompt(extracted_json, profile_json = my_profile) {
    const ej = JSON.stringify(extracted_json, null, 2);
    const pj = JSON.stringify(profile_json, null, 2);

    const output_template = {
        "overall_eligibility": "red|yellow|grey|green",
        "summary_explanation": "string",
        "fields": {
            "<field_name>": {
                "color": "red|yellow|grey|green",
                "explanation": "string (must cite evidence and comparison)",
                "evidence": null
            }
        }
    };
    const example = {
      "overall_eligibility": "yellow",
      "summary_explanation": "Location OK, experience OK, tech slightly off; salary not listed.",
      "fields": {
        "location": {"color":"green","explanation":"Location 'Vancouver' matches required country Canada.","evidence":"Vancouver"},
        "salary_min_cad": {"color":"grey","explanation":"Salary not provided in JD; unable to compare.","evidence": null}
      }
    };

    const user =
        `EXTRACTED_JD_JSON:\n${ej}\n\n` +
        `IDEAL_PROFILE_JSON:\n${pj}\n\n` +
        `IMPORTANT: Return ONLY a single JSON object that EXACTLY follows this OUTPUT TEMPLATE below. Do NOT output any additional text.\n\n` +
        `OUTPUT TEMPLATE (return EXACTLY this structure - use the 'fields' object to list only the fields you compare):\n` +
        `${JSON.stringify(output_template, null, 2)}\n\n` +
        `EXAMPLE (valid output):\n${JSON.stringify(example, null, 2)}\n\n` +
        `Now produce the JSON result comparing the EXTRACTED_JD_JSON to the IDEAL_PROFILE_JSON above. For each field you include, make the explanation concise and cite the evidence value exactly as it appears in EXTRACTED_JD_JSON (or null if missing).`;
    return user;
}

// Output schema (informal string form and a basic json-schema-like structure for validation)
export const OUTPUT_SCHEMA_INFORMAL = {
  "overall_eligibility": "red|yellow|grey|green",
  "summary_explanation": "string",
  "fields": "object mapping field_name -> {color, explanation, evidence}"
};

export const OUTPUT_JSON_SCHEMA = {
  "type": "object",
  "properties": {
    "overall_eligibility": {"type": "string"},
    "summary_explanation": {"type": "string"},
    "fields": {"type": "object"}
  },
  "required": ["overall_eligibility", "fields"]
};

// Convenience getters
export function get_compare_system() {
    return COMPARE_SYSTEM;
}

export function get_output_json_schema() {
    return OUTPUT_JSON_SCHEMA;
}

export function get_my_profile() {
    return my_profile;
}

export const sampleExtractedData = {
    "title": "Full Stack Developer - Trauma-Informed Solutions",
    "company_name": "VESTA Social Innovation Technologies",
    "location": "Toronto",
    "country_hint": "Canada",
    "remote": "Flexible remote with occasional in-person collaboration",
    "employment_type": null,
    "salary_text": "$100,000-$115,000 + benefits (commensurate with experience)",
    "salary_min_cad": 100000,
    "salary_max_cad": 115000,
    "experience_required_text": "3+ years of experience as a full stack developer",
    "experience_years_min": 3,
    "experience_years_max": null,
    "spoken_languages": [],
    "programming_languages": [
        "JavaScript",
        "TypeScript",
        "HTML5",
        "CSS3"
    ],
    "required_skills": [
        "Full stack development",
        "JavaScript/TypeScript",
        "HTML5",
        "CSS3",
        "React JS",
        "Node.js",
        "Express",
        "MySQL",
        "MariaDB or similar databases",
        "Version control (Git)",
        "CI/CD practices",
        "Cloud platforms (AWS, Azure, GCP)",
        "Web security",
        "Authentication and authorization",
        "Accessibility standards (WCAG 2.1)",
        "Responsive design",
        "Excellent communication",
        "Teamwork",
        "Self-direction",
        "Emotional intelligence",
        "Cross-cultural sensitivity"
    ],
    "preferred_skills": [
        "Passion for technology for social impact",
        "Commitment to inclusive, ethical product development"
    ],
    "responsibilities": [
        "Design, deploy, and maintain reliable and scalable full-stack software solutions with emphasis on security, performance, and usability",
        "Work closely with the VESTA team and fractional development team to integrate user-focused and culturally sensitive solutions",
        "Monitor, test, and optimize application performance and security",
        "Troubleshoot, debug, and resolve full stack issues",
        "Continuously enhance platform functionality to meet evolving user and project needs"
    ],
    "qualifications": [],
    "min_education": null,
    "seniority_level": "Senior",
    "company_size": null,
    "posting_date": null,
    "closing_date": null,
    "application_instructions": "To apply, send your resume and a brief cover letter to ContactUs@vestasit.com with subject line “Full Stack Developer – Application.”",
    "job_field": "Software Development"
};

export const sampleComparisonResult = {
    "overall_eligibility": "red",
    "summary_explanation": "Major disqualifiers: JD requires 3+ years and 'Senior' level while candidate has max 2 years and prefers Entry/Junior. Location, remote, job field, and salary are favorable; several JD fields are unknown.",
    "fields": {
        "location": {
            "color": "green",
            "explanation": "location 'Toronto' with country_hint 'Canada' matches candidate country 'Canada'.",
            "evidence": "Toronto"
        },
        "remote": {
            "color": "green",
            "explanation": "remote 'Flexible remote with occasional in-person collaboration' matches candidate preferred_work_mode ['remote','hybrid'].",
            "evidence": "Flexible remote with occasional in-person collaboration"
        },
        "salary_min_cad": {
            "color": "green",
            "explanation": "salary_min_cad (100000) is above candidate desired_salary_cad (65000) and above candidate max_salary_cad (90000), so pay is favorable to the candidate.",
            "evidence": 100000
        },
        "salary_max_cad": {
            "color": "green",
            "explanation": "salary_max_cad (115000) is above candidate desired_salary_cad (65000) and above candidate max_salary_cad (90000), so pay is favorable to the candidate.",
            "evidence": 115000
        },
        "experience_years_min": {
            "color": "red",
            "explanation": "experience_years_min (3) > candidate max_experience_years (2), indicating the candidate does not meet the JD's minimum experience requirement.",
            "evidence": 3
        },
        "seniority_level": {
            "color": "red",
            "explanation": "seniority_level 'Senior' conflicts with candidate preferred_seniority_levels ['Entry','Junior'] and candidate experience range.",
            "evidence": "Senior"
        },
        "programming_languages": {
            "color": "yellow",
            "explanation": "programming_languages ['JavaScript','TypeScript','HTML5','CSS3'] partially overlap with candidate tech stack (comfortable_with includes 'react' but candidate profile does not explicitly list 'JavaScript' or 'TypeScript').",
            "evidence": [
                "JavaScript",
                "TypeScript",
                "HTML5",
                "CSS3"
            ]
        },
        "required_skills": {
            "color": "yellow",
            "explanation": "required_skills include backend frameworks and DBs ('Node.js','Express','MySQL','MariaDB') while candidate comfortable_with includes ['react','sql','docker'] — partial overlap (sql/react) but missing many listed backend specifics.",
            "evidence": [
                "Full stack development",
                "JavaScript/TypeScript",
                "HTML5",
                "CSS3",
                "React JS",
                "Node.js",
                "Express",
                "MySQL",
                "MariaDB or similar databases",
                "Version control (Git)",
                "CI/CD practices",
                "Cloud platforms (AWS, Azure, GCP)",
                "Web security",
                "Authentication and authorization",
                "Accessibility standards (WCAG 2.1)",
                "Responsive design",
                "Excellent communication",
                "Teamwork",
                "Self-direction",
                "Emotional intelligence",
                "Cross-cultural sensitivity"
            ]
        },
        "job_field": {
            "color": "green",
            "explanation": "job_field 'Software Development' matches candidate job_field ['software development','web development'].",
            "evidence": "Software Development"
        },
        "employment_type": {
            "color": "grey",
            "explanation": "employment_type is null in JD; candidate allows ['full-time','internship'], unable to confirm match.",
            "evidence": null
        },
        "min_education": {
            "color": "grey",
            "explanation": "min_education is null in JD; candidate highest_education is 'Bachelors in Computer Engineering', unable to compare.",
            "evidence": null
        },
        "company_size": {
            "color": "grey",
            "explanation": "company_size is null in JD; candidate prefers companies with min_employees_in_company 50 and large companies, unable to compare.",
            "evidence": null
        },
        "spoken_languages": {
            "color": "grey",
            "explanation": "spoken_languages is [] (unspecified) in JD versus candidate spoken_languages ['English'], unable to confirm language requirements.",
            "evidence": []
        }
    }
};