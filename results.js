import { compareJd } from './compare.js';
import { extract } from './extractor.js';
import { simpleCacheGet, simpleCacheSet } from './utils.js';

function updateStatus(message) {
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = message;
    }
}

function renderComparisonData(data) {
    const comparisonSummary = document.getElementById('comparisonSummary');
    const filterControls = document.getElementById('filterControls');
    const comparisonFields = document.getElementById('comparisonFields');
    if (!comparisonSummary || !filterControls || !comparisonFields) return;

    comparisonSummary.innerHTML = '';
    filterControls.innerHTML = '';
    comparisonFields.innerHTML = '';
    if (!data) return;

    const eligibility = data.overall_eligibility || 'grey';
    comparisonSummary.className = `summary-${eligibility}`;
    comparisonSummary.textContent = data.summary_explanation || 'No summary available.';

    const colors = ['green', 'yellow', 'red', 'grey'];
    colors.forEach(color => {
        const btn = document.createElement('button');
        btn.className = `filter-btn color-${color}`;
        btn.textContent = color.charAt(0).toUpperCase() + color.slice(1);
        btn.dataset.color = color;
        filterControls.appendChild(btn);
    });

    const fieldItems = [];
    for (const [key, field] of Object.entries(data.fields || {})) {
        const item = document.createElement('div');
        item.className = `comparison-item color-${field.color}`;
        item.dataset.color = field.color;
        item.style.display = 'none';

        const keyEl = document.createElement('div');
        keyEl.className = 'comparison-item-key';
        keyEl.textContent = key.replace(/_/g, ' ');

        const explanationEl = document.createElement('div');
        explanationEl.className = 'comparison-item-explanation';
        explanationEl.textContent = field.explanation;

        item.appendChild(keyEl);
        item.appendChild(explanationEl);
        comparisonFields.appendChild(item);
        fieldItems.push(item);
    }

    filterControls.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const activeColor = e.target.dataset.color;
        filterControls.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');
        fieldItems.forEach(item => {
            item.style.display = (item.dataset.color === activeColor) ? 'block' : 'none';
        });
    });

    const colorsOrder = ['green', 'yellow', 'red', 'grey'];
    const firstRelevantColor = colorsOrder.find(c => data.fields && Object.values(data.fields).some(f => f.color === c));
    const buttonToClick = filterControls.querySelector(`.filter-btn[data-color="${firstRelevantColor || 'grey'}"]`);
    if (buttonToClick) {
        buttonToClick.click();
    }
}

function renderExtractedData(data) {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '';
    if (!data) {
        resultsContainer.textContent = 'No extracted data to display.';
        return;
    }

    const title = document.createElement('h4');
    title.textContent = 'Extracted Data';
    resultsContainer.appendChild(title);

    for (const [key, value] of Object.entries(data)) {
        if (value === null || (Array.isArray(value) && value.length === 0)) {
            continue;
        }
        const item = document.createElement('div');
        item.className = 'result-item';

        const keyEl = document.createElement('div');
        keyEl.className = 'result-item-key';
        keyEl.textContent = key.replace(/_/g, ' ');

        const valueEl = document.createElement('div');
        valueEl.className = 'result-item-value';

        if (Array.isArray(value)) {
            valueEl.textContent = value.join(', ');
        } else {
            valueEl.textContent = value;
        }

        item.appendChild(keyEl);
        item.appendChild(valueEl);
        resultsContainer.appendChild(item);
    }
}

async function runIfPendingJob() {
    const usageInfo = document.getElementById('usageInfo');
    const pending = await simpleCacheGet('pending_jd_text');
    if (!pending) {
        updateStatus('No analysis request found. Paste a job description in the popup.');
        return;
    }

    const jdText = pending;
    await simpleCacheSet('pending_jd_text', null);

    updateStatus('Analyzing...');
    try {
        updateStatus('Extracting job details from description...');
        const { data: extractedData, usage: extractionUsage } = await extract(jdText);
        await simpleCacheSet('last_extracted_data', extractedData);
        renderExtractedData(extractedData);

        updateStatus('Comparing with your profile...');
        const { data: comparisonResult, usage: comparisonUsage } = await compareJd(extractedData);
        await simpleCacheSet('last_comparison_result', comparisonResult);
        updateStatus('Analysis Complete');
        renderComparisonData(comparisonResult);

        const totalTokens = (extractionUsage?.total_tokens || 0) + (comparisonUsage?.total_tokens || 0);
        if (usageInfo) usageInfo.textContent = `Total tokens used: ${totalTokens}`;
    } catch (error) {
        console.error('An error occurred during analysis:', error);
        updateStatus('An error occurred. See console for details.');
        alert('An error occurred. Check the console for details.');
    }
}

window.addEventListener('DOMContentLoaded', runIfPendingJob); 