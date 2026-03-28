document.addEventListener('DOMContentLoaded', () => {
    // Scope inside the WP container to avoid conflicts
    const container = document.querySelector('.iesco-wp-container');
    if (!container) return;

    const form = container.querySelector('#iescoForm');
    const input = container.querySelector('#refNo');
    const inputLabel = container.querySelector('#iescoInputLabel');
    const submitBtn = container.querySelector('#iescoSubmitBtn');
    const btnText = container.querySelector('.iesco-btn-text');
    const tabs = container.querySelectorAll('.iesco-tab');
    const searchTypeInput = container.querySelector('#searchType');
    
    // New History Elements
    const recentContainer = container.querySelector('#recentSearches');
    const recentChips = container.querySelector('#recentChips');

    // Local state to store both inputs separately
    let savedRefNo = '';
    let savedCustId = '';

    // History Functions
    const getHistory = (type) => JSON.parse(localStorage.getItem(`iesco_${type}_hist`) || '[]');
    
    const saveHistory = (type, val) => {
        if (!val) return;
        let hist = getHistory(type);
        hist = hist.filter(h => h !== val); // Remove duplicate
        hist.unshift(val); // Add to front
        if (hist.length > 4) hist.pop(); // Keep only 4 recent
        localStorage.setItem(`iesco_${type}_hist`, JSON.stringify(hist));
    };

    const renderHistoryChips = (type) => {
        const hist = getHistory(type);
        if (hist.length === 0) {
            recentContainer.style.display = 'none';
            return;
        }
        
        recentContainer.style.display = 'flex';
        recentChips.innerHTML = '';
        hist.forEach(val => {
            const chip = document.createElement('div');
            chip.className = 'recent-chip';
            chip.innerText = val;
            chip.onclick = () => {
                input.value = val;
                // auto-update the saved states so they don't break
                if (type === 'customerid') savedCustId = val;
                else savedRefNo = val;
            };
            recentChips.appendChild(chip);
        });
    };

    // Handle Tab Switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const type = tab.dataset.tab;
            searchTypeInput.value = type;

            if (type === 'customerid') {
                inputLabel.innerHTML = 'Customer ID <span class="format-hint">(10 Digit Number)</span>';
                input.placeholder = "e.g. 1234567890";
                input.setAttribute('maxlength', '10');
                input.setAttribute('pattern', '\\d{10}');
                input.setAttribute('title', 'Must be exactly 10 digits');
                
                input.value = savedCustId;
            } else {
                inputLabel.innerHTML = 'Reference Number <span class="format-hint">(14 Digit Number)</span>';
                input.placeholder = "e.g. 04143410141600";
                input.setAttribute('maxlength', '14');
                input.setAttribute('pattern', '\\d{14}');
                input.setAttribute('title', 'Must be exactly 14 digits');
                
                input.value = savedRefNo;
            }
            
            renderHistoryChips(type);
            input.focus();
        });
    });

    // Enforce Numeric Input only and Save State
    input.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, ''); 
        const type = searchTypeInput.value;
        const maxLen = type === 'customerid' ? 10 : 14;
        
        if (val.length > maxLen) val = val.substring(0, maxLen);
        e.target.value = val;
        
        // Save to respective variable proactively
        if (type === 'customerid') savedCustId = val;
        else savedRefNo = val;
        
        input.classList.remove('invalid');
    });

    // Form Submission
    form.addEventListener('submit', (e) => {
        const type = searchTypeInput.value;
        const reqLength = type === 'customerid' ? 10 : 14;

        if (input.value.length !== reqLength) {
            e.preventDefault();
            input.classList.add('invalid');
            return;
        }

        // On successful validate: save to history!
        saveHistory(type, input.value);
        // And instantly re-render chips so it feels snappy
        renderHistoryChips(type);

        const originalText = btnText.innerText;
        btnText.innerText = "Checking...";
        submitBtn.style.opacity = '0.8';
        submitBtn.style.pointerEvents = 'none';

        setTimeout(() => {
            btnText.innerText = originalText;
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'auto';
        }, 3000);
    });

    // Initialize state on page load for the default active tab
    renderHistoryChips(searchTypeInput.value);
});
