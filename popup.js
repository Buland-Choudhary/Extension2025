import { extract } from './extractor.js';
import { simpleCacheSet } from './utils.js';
import { compareJd } from './compare.js';

document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const jobDescription = document.getElementById('jobDescription');
    const inputView = document.getElementById('inputView');
    const resultsView = document.getElementById('resultsView');
    const statusText = document.getElementById('statusText');
    const usageInfo = document.getElementById('usageInfo');
    const comparisonSummary = document.getElementById('comparisonSummary');
    const filterControls = document.getElementById('filterControls');
    const comparisonFields = document.getElementById('comparisonFields');
    const resultsContainer = document.getElementById('resultsContainer');

    function updateStatus(message) {
        statusText.textContent = message;
    }

    function renderComparisonData(data) {
        // Clear previous results
        comparisonSummary.innerHTML = '';
        filterControls.innerHTML = '';
        comparisonFields.innerHTML = '';
        if (!data) return;

        // 1. Render summary with color-coded background
        const eligibility = data.overall_eligibility || 'grey';
        comparisonSummary.className = `summary-${eligibility}`;
        comparisonSummary.textContent = data.summary_explanation || 'No summary available.';

        // 2. Create and render filter buttons
        const colors = ['green', 'yellow', 'red', 'grey'];
        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = `filter-btn color-${color}`;
            btn.textContent = color.charAt(0).toUpperCase() + color.slice(1);
            btn.dataset.color = color;
            filterControls.appendChild(btn);
        });

        // 3. Render all field items
        const fieldItems = [];
        for (const [key, field] of Object.entries(data.fields)) {
            const item = document.createElement('div');
            item.className = `comparison-item color-${field.color}`;
            item.dataset.color = field.color;
            item.style.display = 'none'; // Initially hide all

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

        // 4. Add event listeners to filter buttons
        filterControls.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') return;

            const activeColor = e.target.dataset.color;

            // Update active button style
            filterControls.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            e.target.classList.add('active');

            // Show/hide field items
            fieldItems.forEach(item => {
                item.style.display = (item.dataset.color === activeColor) ? 'block' : 'none';
            });
        });

        // 5. Initially click the first relevant filter button
        const firstRelevantColor = colors.find(c => data.fields && Object.values(data.fields).some(f => f.color === c));
        const buttonToClick = filterControls.querySelector(`.filter-btn[data-color="${firstRelevantColor || 'grey'}"]`);
        if (buttonToClick) {
            buttonToClick.click();
        }
    }

    function renderExtractedData(data) {
        resultsContainer.innerHTML = ''; // Clear previous results
        if (!data) {
            resultsContainer.textContent = 'No extracted data to display.';
            return;
        }

        const title = document.createElement('h4');
        title.textContent = 'Extracted Data';
        resultsContainer.appendChild(title);

        for (const [key, value] of Object.entries(data)) {
            if (value === null || (Array.isArray(value) && value.length === 0)) {
                continue; // Don't display empty fields
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

    analyzeBtn.addEventListener('click', async function() {
        const jdText = jobDescription.value;
        if (jdText.trim() === '') {
            alert('Please paste a job description.');
            return;
        }

        try {
            await chrome.storage.local.set({ 'pending_jd_text': jdText });
            await chrome.windows.create({
                type: 'popup',
                url: chrome.runtime.getURL('results.html'),
                width: 900,
                height: 900
            });
        } catch (openErr) {
            console.error('Failed to open results window, falling back to inline rendering:', openErr);
            // Switch to loading view (fallback)
            inputView.style.display = 'none';
            resultsView.style.display = 'block';
            resultsContainer.innerHTML = '';
            usageInfo.innerHTML = '';
            comparisonSummary.innerHTML = '';
            filterControls.innerHTML = '';
            comparisonFields.innerHTML = '';
            analyzeBtn.disabled = true;
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
                usageInfo.textContent = `Total tokens used: ${totalTokens}`;
            } catch (error) {
                console.error('An error occurred during analysis:', error);
                updateStatus('An error occurred. See console for details.');
                alert('An error occurred. Check the console for details.');
            } finally {
                analyzeBtn.disabled = false;
            }
        }
    });
});
