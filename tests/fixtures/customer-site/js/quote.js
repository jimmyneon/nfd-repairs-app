/**
 * NFD Quote System — Main UI Logic
 * Uses the flat JSON catalogue via NFD_CatalogueLoader.
 * Cascade: Category → Brand → Model → Repair → Part Option
 */
(function () {
    'use strict';

    var IM = window.NFD_IMAGE_MAP;
    var CL = window.NFD_CatalogueLoader;

    var state = {
        step: 1,
        category: null,
        brand: null,
        model: null,
        repair: null,
        pendingRepair: null,
        selectedOption: null,
        price: null,
        quoteType: null,
        customerInfo: null,
        enquiryRef: null,
        expandedSeries: null,
        showAllModels: false,
        additionalRepairs: [],
        deviceColour: null,
        journeyMode: 'guided'
    };

    var el = {};
    var catalogueReady = false;
    var catalogueLoadFailed = false;

    function saveState() {
        try {
            sessionStorage.setItem('nfd-quote-state', JSON.stringify({
                step: state.step,
                category: state.category,
                brand: state.brand,
                model: state.model,
                repair: state.repair,
                selectedOption: state.selectedOption,
                price: state.price,
                quoteType: state.quoteType,
                deviceColour: state.deviceColour,
                warranty: state.warranty,
                partOption: state.partOption,
                displayPrice: state.displayPrice,
                enquiryRef: state.enquiryRef,
                expandedSeries: state.expandedSeries,
                quoteRevealed: state._quoteRevealed || false,
                additionalRepairs: state.additionalRepairs || [],
                journeyMode: state.journeyMode || 'guided',
                timestamp: Date.now()
            }));
        } catch(e) { console.error('[QUOTE] Failed to save state:', e); }
        updateShareableUrl();
    }

    // Update the browser address bar with a shareable URL as the user
    // navigates the quote flow. e.g. /quote/?device=iPhone+14&repair=Screen+replacement
    // This lets staff copy the URL at any point and text it to a customer.
    function updateShareableUrl() {
        try {
            var params = [];
            if (state.model) params.push('device=' + encodeURIComponent(state.model));
            if (state.repair) params.push('repair=' + encodeURIComponent(state.repair));
            var newUrl = '/quote/' + (params.length ? '?' + params.join('&') : '');
            if (state.step > 1) newUrl += (params.length ? '&' : '?') + 'step=' + state.step;
            // Use replaceState so we don't fill the browser history
            window.history.replaceState({
                quoteStep: state.step,
                category: state.category,
                brand: state.brand,
                model: state.model,
                repair: state.repair
            }, '', newUrl);
        } catch(e) {}
    }

    function init() {
        cacheElements();
        bindEvents();
        // Re-run updateMobileBar when footer is loaded (taskbar lives in footer.html)
        document.addEventListener('nfd:footer-loaded', function() {
            updateMobileBar();
        });
        CL.load().then(function () {
            catalogueReady = true;
            catalogueLoadFailed = false;
            if (el.globalSearchInput && el.globalSearchInput.value.trim().length >= 2) {
                handleGlobalSearch(el.globalSearchInput.value);
            }

            // Check for deep-link URL params (e.g. ?category=Phones&brand=Apple&model=iPhone+14&repair=Screen+replacement)
            var urlParams = null;
            try { urlParams = new URLSearchParams(window.location.search); } catch(e) {}

            // ?new=1 — force a fresh quote (clears any persisted state)
            if (urlParams && urlParams.get('new')) {
                console.log('[QUOTE] ?new=1 — clearing saved state for fresh quote');
                try { sessionStorage.removeItem('nfd-quote-state'); } catch(e) {}
                state.journeyMode = 'guided';
                if (window.NFD_Analytics && window.NFD_Analytics.setJourneyMode) window.NFD_Analytics.setJourneyMode('guided');
                // Clean the URL so a refresh doesn't keep forcing new
                try { window.history.replaceState({}, '', '/quote/'); } catch(e) {}
                renderCategories();
                updateProgress();
                window.history.replaceState({ quoteStep: 1 }, '', '#step-1');
                return;
            }

            if (urlParams && (urlParams.get('category') || urlParams.get('brand') || urlParams.get('model') || urlParams.get('repair') || urlParams.get('series') || urlParams.get('device'))) {
                var dlCategory = urlParams.get('category');
                var dlBrand = urlParams.get('brand');
                var dlModel = urlParams.get('model');
                var dlRepair = urlParams.get('repair');
                var dlSeries = urlParams.get('series');
                // Simple one-click format: ?device=iPhone+14&repair=Screen+replacement
                // The loader searches the catalogue to resolve the device to category/brand/model
                var dlDevice = urlParams.get('device');
                if (dlDevice && !dlCategory) {
                    console.log('[QUOTE] One-click device param:', dlDevice);
                    // Search the catalogue for a matching model
                    var allModels = CL.allModels ? CL.allModels() : [];
                    var match = null;
                    for (var mi = 0; mi < allModels.length; mi++) {
                        var m = allModels[mi];
                        if (m && m.toLowerCase() === dlDevice.toLowerCase()) {
                            match = m;
                            break;
                        }
                    }
                    // If no exact match, try partial match (e.g. "iPhone 14" matches "iPhone 14 Pro")
                    // But prefer exact match first
                    if (!match) {
                        for (var mi2 = 0; mi2 < allModels.length; mi2++) {
                            var m2 = allModels[mi2];
                            if (m2 && m2.toLowerCase().indexOf(dlDevice.toLowerCase()) !== -1) {
                                match = m2;
                                break;
                            }
                        }
                    }
                    if (match) {
                        // Resolve to category/brand/model using the catalogue
                        var allQuotes = CL.allQuotes ? CL.allQuotes() : [];
                        var resolved = allQuotes.find(function(q) { return q.model === match; });
                        if (resolved) {
                            dlCategory = resolved.category || dlCategory;
                            dlBrand = resolved.brand || dlBrand;
                            dlModel = match;
                            console.log('[QUOTE] Resolved device to:', dlCategory, dlBrand, dlModel);
                        }
                    } else {
                        console.log('[QUOTE] No model match found for device:', dlDevice);
                    }
                }

                // Resolve repair alias to full repair name
                // e.g. "screen" → "Screen replacement", "battery" → "Battery replacement"
                if (dlRepair && dlCategory && dlBrand && dlModel) {
                    var availableRepairs = CL.repairs(dlCategory, dlBrand, dlModel) || [];
                    var repairMatch = null;
                    // Try exact match first
                    for (var ri = 0; ri < availableRepairs.length; ri++) {
                        if (availableRepairs[ri].toLowerCase() === dlRepair.toLowerCase()) {
                            repairMatch = availableRepairs[ri];
                            break;
                        }
                    }
                    // Try "contains" match (e.g. "screen" matches "Screen replacement")
                    if (!repairMatch) {
                        for (var ri2 = 0; ri2 < availableRepairs.length; ri2++) {
                            if (availableRepairs[ri2].toLowerCase().indexOf(dlRepair.toLowerCase()) !== -1) {
                                repairMatch = availableRepairs[ri2];
                                break;
                            }
                        }
                    }
                    // Try common aliases
                    if (!repairMatch) {
                        var aliases = {
                            'screen': 'Screen replacement',
                            'screen-replacement': 'Screen replacement',
                            'lcd': 'Screen replacement',
                            'display': 'Screen replacement',
                            'glass': 'Screen replacement',
                            'battery': 'Battery replacement',
                            'battery-replacement': 'Battery replacement',
                            'charging-port': 'Charging port repair',
                            'charging': 'Charging port repair',
                            'port': 'Charging port repair',
                            'hdmi': 'HDMI port replacement',
                            'hdmi-port': 'HDMI port replacement',
                            'hdmi-port-replacement': 'HDMI port replacement',
                            'camera': 'Rear camera replacement',
                            'rear-camera': 'Rear camera replacement',
                            'front-camera': 'Front camera replacement',
                            'speaker': 'Loudspeaker replacement',
                            'loudspeaker': 'Loudspeaker replacement',
                            'back-glass': 'Back glass replacement',
                            'back': 'Back glass replacement',
                            'button': 'Power / volume / mute button repair',
                            'buttons': 'Power / volume / mute button repair',
                            'water': 'Liquid-damage assessment',
                            'liquid': 'Liquid-damage assessment',
                            'water-damage': 'Liquid-damage assessment'
                        };
                        var aliasKey = dlRepair.toLowerCase().replace(/[-_]/g, '-');
                        var aliasTarget = aliases[aliasKey] || aliases[dlRepair.toLowerCase()];
                        if (aliasTarget) {
                            for (var ri3 = 0; ri3 < availableRepairs.length; ri3++) {
                                if (availableRepairs[ri3].toLowerCase() === aliasTarget.toLowerCase()) {
                                    repairMatch = availableRepairs[ri3];
                                    break;
                                }
                            }
                        }
                    }
                    if (repairMatch) {
                        console.log('[QUOTE] Resolved repair alias "' + dlRepair + '" to:', repairMatch);
                        dlRepair = repairMatch;
                    } else {
                        console.log('[QUOTE] No repair match found for:', dlRepair, '— will show repair list instead');
                        dlRepair = null;  // Clear so we fall back to repair list
                    }
                }

                console.log('[QUOTE] Deep-link params found:', dlCategory, dlBrand, dlModel, dlRepair, dlSeries);
                state.journeyMode = 'deep_link';
                if (window.NFD_Analytics && window.NFD_Analytics.setJourneyMode) window.NFD_Analytics.setJourneyMode('deep_link');

                // Clear any saved state so deep-link takes priority
                try { sessionStorage.removeItem('nfd-quote-state'); } catch(e) {}

                if (dlCategory) {
                    state.category = dlCategory;
                    if (dlBrand) {
                        state.brand = dlBrand;
                        if (dlModel) {
                            state.model = dlModel;
                            if (dlRepair) {
                                state.repair = dlRepair;
                                state.step = 5;
                                renderBrands(state.category);
                                renderModels();
                                selectRepair(dlRepair);
                            } else {
                                state.step = 4;
                                renderBrands(state.category);
                                renderModels();
                                renderRepairs();
                            }
                        } else {
                            state.step = 3;
                            state.pendingRepair = dlRepair || null;
                            renderBrands(state.category);
                            renderModels();
                            // Auto-open the model sheet for the specified series
                            if (dlSeries) {
                                var seriesModels = CL.models(state.category, state.brand).filter(function(m) {
                                    return extractSeriesKey(m) === dlSeries;
                                });
                                console.log('[QUOTE] Series deep-link:', dlSeries, 'found', seriesModels.length, 'models');
                                if (seriesModels.length > 0) {
                                    var displayLabel = dlSeries + ' Series';
                                    setTimeout(function() {
                                        console.log('[QUOTE] Opening model sheet for series:', dlSeries);
                                        showModelSheet(dlSeries, displayLabel);
                                    }, 200);
                                }
                            }
                        }
                    } else {
                        state.step = 2;
                        renderBrands(state.category);
                    }

                    el.steps.forEach(function(elm) {
                        elm.classList.toggle('active', parseInt(elm.dataset.step, 10) === state.step);
                    });
                    updateProgress();
                    window.history.replaceState({
                        quoteStep: state.step,
                        category: state.category,
                        brand: state.brand,
                        model: state.model,
                        repair: state.repair
                    }, '', '#step-' + state.step);
                    saveState();
                    return;
                }
            }

            // Try to restore state from sessionStorage (persists across refresh, cleared on new session)
            var restored = false;
            try {
                var saved = sessionStorage.getItem('nfd-quote-state');
                if (saved) {
                    var s = JSON.parse(saved);
                    console.log('[QUOTE] Saved state found:', s);
                    // Restore if past step 1 and state is less than 30 minutes old
                    if (s.timestamp && (Date.now() - s.timestamp) < 1800000 && s.step > 1) {
                        state.step = s.step;
                        state.category = s.category;
                        state.brand = s.brand;
                        state.model = s.model;
                        state.repair = s.repair;
                        state.selectedOption = s.selectedOption || null;
                        state.price = s.price || null;
                        state.quoteType = s.quoteType || null;
                        state.deviceColour = s.deviceColour || null;
                        state.warranty = s.warranty || '';
                        state.partOption = s.partOption || '';
                        state.displayPrice = s.displayPrice || '';
                        state.enquiryRef = s.enquiryRef || null;
                        state.expandedSeries = s.expandedSeries || null;
                        state.additionalRepairs = s.additionalRepairs || [];
                        state.journeyMode = 'restored';
                        if (window.NFD_Analytics && window.NFD_Analytics.setJourneyMode) window.NFD_Analytics.setJourneyMode('restored');
                        if (state.step >= 2 && state.category) renderBrands(state.category);
                        if (state.step >= 3 && state.brand) renderModels();
                        if (state.step >= 4 && state.model && state.model !== 'Model not listed') renderRepairs();
                        if (state.step === 5 && state.repair) {
                            // If we have a selectedOption and enquiryRef, the quote was already revealed
                            if (s.quoteRevealed && state.selectedOption) {
                                revealFullQuote();
                                // Re-select the previously chosen option after render
                                setTimeout(function() {
                                    var optEl = el.resultArea.querySelector('.quote-screen-option[data-quotekey="' + CSS.escape(state.selectedOption) + '"]');
                                    if (optEl) {
                                        optEl.click();
                                    } else if (state.price) {
                                        // Single-option or simple breakdown — actions should already be rendered
                                        // but make sure they're shown
                                        var actionsContainer = document.getElementById('breakdown-actions');
                                        if (actionsContainer && !actionsContainer.innerHTML) {
                                            if (window.NFD_QUOTE_ACTIONS) window.NFD_QUOTE_ACTIONS.renderPostQuoteActions(state, actionsContainer);
                                        }
                                    }
                                }, 100);
                            } else {
                                selectRepair(state.repair);
                            }
                        }
                        el.steps.forEach(function(elm) {
                            elm.classList.toggle('active', parseInt(elm.dataset.step, 10) === state.step);
                        });
                        updateProgress();
                        window.history.replaceState({
                            quoteStep: state.step,
                            category: state.category,
                            brand: state.brand,
                            model: state.model,
                            repair: state.repair
                        }, '', '#step-' + state.step);
                        restored = true;
                    }
                }
            } catch(e) { console.error('[QUOTE] State restore error:', e); }
            if (!restored) {
                state.journeyMode = state.journeyMode || 'guided';
                if (window.NFD_Analytics && window.NFD_Analytics.setJourneyMode) window.NFD_Analytics.setJourneyMode(state.journeyMode);
                renderCategories();
                updateProgress();
                window.history.replaceState({ quoteStep: 1 }, '', '#step-1');
            }
        }).catch(function (err) {
            console.error('Failed to load catalogue:', err);
            catalogueLoadFailed = true;
            el.categoryGrid.innerHTML = '<p class="quote-empty-msg">Could not load pricing data. Please refresh the page.</p>';
            if (el.globalSearchInput && el.globalSearchInput.value.trim().length >= 2) {
                handleGlobalSearch(el.globalSearchInput.value);
            }
        });
    }

    function cacheElements() {
        el.steps = document.querySelectorAll('.quote-step');
        el.progressSteps = document.querySelector('.quote-progress-steps');
        el.progressbar = document.getElementById('quote-progress-bar');
        el.breadcrumbRow = document.getElementById('quote-breadcrumb-row');
        el.startAgain = document.getElementById('quote-start-again');
        el.breadcrumb = document.getElementById('quote-breadcrumb');
        el.categoryGrid = document.getElementById('category-grid');
        el.makeGrid = document.getElementById('make-grid');
        el.modelList = document.getElementById('model-list');
        el.repairList = document.getElementById('repair-list');
        el.resultArea = document.getElementById('quote-result-area');
        el.repairModal = document.getElementById('quote-repair-modal');
        el.repairModalContent = document.getElementById('quote-repair-modal-content');
        el.repairModalBackdrop = document.getElementById('quote-repair-modal-backdrop');
        el.sheetModal = document.getElementById('quote-sheet-modal');
        el.sheetContent = document.getElementById('quote-sheet-content');
        el.sheetBackdrop = document.getElementById('quote-sheet-backdrop');
        el.globalSearch = document.getElementById('quote-global-search');
        el.globalSearchInput = document.getElementById('quote-global-search-input');
        el.globalSearchResults = document.getElementById('quote-global-search-results');
        el.mobileContext = document.getElementById('quote-mobile-context');
    }

    function bindEvents() {
        el.categoryGrid.addEventListener('click', function(e) {
            var card = e.target.closest('.quote-card');
            if (card) selectCategory(card.dataset.id);
        });
        el.makeGrid.addEventListener('click', function(e) {
            var card = e.target.closest('.quote-card');
            if (card && card.dataset.id) selectBrand(card.dataset.id);
        });
        el.modelList.addEventListener('click', function(e) {
            var item = e.target.closest('.quote-card');
            if (!item) return;
            if (item.dataset.action === 'back-to-series') {
                state.expandedSeries = null;
                renderModels();
                return;
            }
            if (item.dataset.series) {
                // Open slide-up sheet with models in this series
                var seriesKey = item.dataset.series;
                var displayLabel = item.querySelector('.quote-card-label').textContent;
                showModelSheet(seriesKey, displayLabel);
                return;
            }
            if (item.dataset.id) selectModel(item.dataset.id);
        });
        el.repairList.addEventListener('click', function(e) {
            var card = e.target.closest('.quote-card');
            if (card && card.dataset.id) showRepairModal(card.dataset.id);
        });
        el.progressbar.addEventListener('click', function(e) {
            var step = e.target.closest('.quote-progress-step');
            if (step && step.classList.contains('clickable')) {
                goToStep(parseInt(step.dataset.step, 10));
            }
        });
        el.breadcrumbRow.addEventListener('click', function(e) {
            if (e.target.closest('.quote-start-again')) {
                resetQuote();
                return;
            }
            var chip = e.target.closest('.quote-breadcrumb-chip');
            if (chip) {
                var stepNum = parseInt(chip.dataset.step, 10);
                if (stepNum === 1) {
                    state.brand = null;
                    state.model = null;
                    state.repair = null;
                    state.expandedSeries = null;
                    state.showAllModels = false;
                } else if (stepNum === 2) {
                    state.model = null;
                    state.repair = null;
                    state.expandedSeries = null;
                    state.showAllModels = false;
                } else if (stepNum === 3) {
                    state.repair = null;
                    state.expandedSeries = null;
                }
                goToStep(stepNum);
            }
        });
        el.repairModalBackdrop.addEventListener('click', function() {
            closeRepairModal();
        });
        if (el.sheetBackdrop) {
            el.sheetBackdrop.addEventListener('click', closeSheet);
        }
        // Global touchmove handler: block pull-to-refresh whenever a modal/sheet is open
        document.addEventListener('touchmove', function(e) {
            if (!document.body.classList.contains('quote-modal-open')) return;
            // Allow scrolling inside the sheet content if it can scroll
            var sheetContent = e.target.closest('.quote-repair-modal-content');
            if (sheetContent) {
                var canScroll = sheetContent.scrollHeight > sheetContent.clientHeight;
                if (canScroll) {
                    // Allow scroll, but block overscroll at top (which triggers refresh)
                    if (sheetContent.scrollTop <= 0 && e.touches[0].clientY > (sheetContent._touchStartY || 0)) {
                        e.preventDefault();
                    }
                    return;
                }
            }
            // Block all other touchmove when modal is open
            e.preventDefault();
        }, { passive: false });
        // Track touch start position for overscroll detection
        document.addEventListener('touchstart', function(e) {
            if (!document.body.classList.contains('quote-modal-open')) return;
            var sheetContent = e.target.closest('.quote-repair-modal-content');
            if (sheetContent) {
                sheetContent._touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });
        // Global search
        if (el.globalSearchInput) {
            el.globalSearchInput.addEventListener('input', function() {
                // If on model step, filter models for current brand AND show global results
                if (state.step === 3) {
                    renderModels(this.value);
                    // Also show global search results from other brands
                    var term = this.value.trim();
                    if (term.length >= 2) {
                        handleGlobalSearch(this.value);
                    } else {
                        el.globalSearchResults.classList.remove('active');
                        el.globalSearchResults.innerHTML = '';
                    }
                    return;
                }
                handleGlobalSearch(this.value);
            });
            el.globalSearchInput.addEventListener('focus', function() {
                if (this.value.length >= 2) handleGlobalSearch(this.value);
            });
            document.addEventListener('click', function(e) {
                if (!e.target.closest('.quote-global-search')) {
                    el.globalSearchResults.classList.remove('active');
                }
            });
            el.globalSearchResults.addEventListener('click', function(e) {
                var result = e.target.closest('.quote-search-result');
                if (!result) return;
                var cat = result.dataset.category;
                var brand = result.dataset.brand;
                var model = result.dataset.model;
                var repair = result.dataset.repair;
                el.globalSearchInput.value = '';
                el.globalSearchResults.classList.remove('active');
                state.category = cat;
                state.brand = brand;
                state.model = model;
                state.repair = repair;
                state.expandedSeries = null;
                state.journeyMode = 'search';
                if (window.NFD_Analytics) {
                    if (window.NFD_Analytics.setJourneyMode) window.NFD_Analytics.setJourneyMode('search');
                    window.NFD_Analytics.track('quote_search_result_selected', {
                        device_category: cat || null,
                        device_make: brand || null,
                        device_model: model || null,
                        repair_type: repair || null,
                        result_position: result.parentNode ? (Array.prototype.indexOf.call(result.parentNode.children, result) + 1) : null
                    });
                }
                // selectRepair() renders the quote and moves to step 5 itself.
                selectRepair(repair);
            });
        }
        // Persist state on browser back/forward
        window.addEventListener('popstate', function(e) {
            // If a sheet or modal is open, handle back intelligently
            var sheetOpen = el.sheetModal && el.sheetModal.classList.contains('active');
            var modalOpen = el.repairModal && el.repairModal.classList.contains('active');
            if (sheetOpen) {
                // If on a page > 1, go back a page instead of closing
                if (_repairsPageState.currentPage > 0) {
                    _repairsPageState.currentPage--;
                    renderRepairsSheetPage();
                    window.history.pushState({ sheetOpen: true }, '', '#sheet');
                    return;
                }
                if (_modelsPageState.currentPage > 0) {
                    _modelsPageState.currentPage--;
                    renderModelsSheetPage();
                    window.history.pushState({ sheetOpen: true }, '', '#sheet');
                    return;
                }
                // On page 1 — close the sheet
                closeSheetInstant();
                window.history.pushState({
                    quoteStep: state.step,
                    category: state.category,
                    brand: state.brand,
                    model: state.model,
                    repair: state.repair
                }, '', '#step-' + state.step);
                return;
            }
            if (modalOpen) {
                closeRepairModalInstant();
                window.history.pushState({
                    quoteStep: state.step,
                    category: state.category,
                    brand: state.brand,
                    model: state.model,
                    repair: state.repair
                }, '', '#step-' + state.step);
                return;
            }
            if (e.state && e.state.quoteStep) {
                state.step = e.state.quoteStep;
                state.category = e.state.category || null;
                state.brand = e.state.brand || null;
                var restoredModel = e.state.model;
                // Treat 'Model not listed' as no model for rendering purposes
                if (restoredModel === 'Model not listed') restoredModel = null;
                state.model = restoredModel;
                state.repair = e.state.repair || null;
                state.expandedSeries = null;
                state.showAllModels = false;
                if (state.step === 1) renderCategories();
                if (state.step >= 2 && state.category) renderBrands(state.category);
                if (state.step >= 3 && state.brand) renderModels();
                if (state.step >= 4 && state.model) renderRepairs();
                if (state.step === 5 && state.repair) selectRepair(state.repair);
                el.steps.forEach(function(s) {
                    s.classList.toggle('active', parseInt(s.dataset.step, 10) === state.step);
                });
                updateProgress();
            }
        });
    }

    // Step Navigation
    function goToStep(step) {
        var prevStep = state.step;
        state.step = step;
        el.steps.forEach(function(s) {
            s.classList.toggle('active', parseInt(s.dataset.step, 10) === step);
        });
        // Analytics: track step enter
        if (window.NFD_Analytics) {
            window.NFD_Analytics.trackStepEnter(step, {
                category: state.category,
                brand: state.brand,
                model: state.model,
                repair: state.repair,
                journey_mode: state.journeyMode || 'guided',
            });
            // Track back navigation if going to a previous step
            if (prevStep > step) {
                window.NFD_Analytics.trackBackNav(prevStep, step);
            }
        }
        // Push state for back navigation
        if (window.history.state && window.history.state.quoteStep !== step) {
            window.history.pushState({
                quoteStep: step,
                category: state.category,
                brand: state.brand,
                model: state.model,
                repair: state.repair
            }, '', '#step-' + step);
        }
        // Save to localStorage for persistence (survives tab close/refresh)
        saveState();
        updateProgress();
        // Scroll to top on step change — instant, no animation
        window.scrollTo(0, 0);
    }

    function updateProgress() {
        var fillPct = ((state.step - 1) / 4) * 72;
        el.progressSteps.style.setProperty('--progress-fill', fillPct + '%');
        var stepBtns = el.progressSteps.querySelectorAll('.quote-progress-step');
        stepBtns.forEach(function(s) {
            var sNum = parseInt(s.dataset.step, 10);
            s.classList.toggle('active', sNum === state.step);
            s.classList.toggle('completed', sNum < state.step);
            s.classList.toggle('clickable', sNum < state.step);
        });
        updateBreadcrumb();
        updateMobileBar();
    }

    function updateMobileBar() {
        var taskbar = document.querySelector('.hc-mobile-taskbar');
        if (!taskbar) return;

        if (state.step >= 2) {
            // Replace taskbar buttons with quote-specific ones
            taskbar.innerHTML = '';
            taskbar.dataset.initialized = 'true';

            var backBtn = document.createElement('button');
            backBtn.className = 'hc-taskbar-btn';
            backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i><span>Back</span>';
            backBtn.addEventListener('click', function() {
                if (state.step > 1) {
                    // From step 5 (quote summary) — go back to the right step based on how we got here
                    if (state.step === 5) {
                        state.repair = null;
                        if (!state.brand && (!state.model || state.model === 'Model not listed')) {
                            // Came from 'Other devices' — go back to categories
                            state.model = null;
                            goToStep(1);
                            renderCategories();
                        } else if (state.brand && (!state.model || state.model === 'Model not listed')) {
                            // Came from 'Model not listed' or 'Any other' brand — go back to models
                            state.model = null;
                            state.expandedSeries = null;
                            state.showAllModels = false;
                            goToStep(3);
                            renderModels();
                        } else {
                            // Came from a repair selection or 'Issue not listed' — go back to repairs
                            state.expandedSeries = null;
                            goToStep(4);
                            renderRepairs();
                        }
                        return;
                    }
                    var prevStep = state.step - 1;
                    if (prevStep === 1) {
                        state.brand = null; state.model = null; state.repair = null;
                        state.expandedSeries = null; state.showAllModels = false;
                    } else if (prevStep === 2) {
                        state.model = null; state.repair = null;
                        state.expandedSeries = null; state.showAllModels = false;
                    } else if (prevStep === 3) {
                        state.repair = null; state.expandedSeries = null;
                    }
                    goToStep(prevStep);
                    if (prevStep === 1) renderCategories();
                    else if (prevStep === 2) renderBrands(state.category);
                    else if (prevStep === 3) renderModels();
                    else if (prevStep === 4) renderRepairs();
                }
            });

            var searchBtn = document.createElement('button');
            searchBtn.className = 'hc-taskbar-btn';
            searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><span>Search</span>';
            searchBtn.addEventListener('click', showSearchSheet);

            var resetBtn = document.createElement('button');
            resetBtn.className = 'hc-taskbar-btn';
            resetBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i><span>Reset</span>';
            resetBtn.addEventListener('click', function() {
                if (state.step <= 1) return;
                showResetConfirm();
            });

            var savedBtn = document.createElement('a');
            savedBtn.className = 'hc-taskbar-btn';
            savedBtn.href = '/saved/';
            savedBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i><span>Saved</span>';

            taskbar.appendChild(backBtn);
            taskbar.appendChild(searchBtn);
            taskbar.appendChild(resetBtn);
            taskbar.appendChild(savedBtn);
        } else {
            // Restore default taskbar by letting dynamic-quick-actions rebuild it
            taskbar.innerHTML = '';
            taskbar.dataset.initialized = 'false';
            // Re-trigger dynamic population (guard against infinite recursion)
            if (window.updateQuickActions) {
                window.updateQuickActions();
            } else if (!taskbar.dataset.rebuilding) {
                taskbar.dataset.rebuilding = 'true';
                document.dispatchEvent(new Event('nfd:footer-loaded'));
                setTimeout(function() { delete taskbar.dataset.rebuilding; }, 100);
            }
        }

        // Update mobile context — show what's been selected so far
        if (el.mobileContext) {
            var parts = [];
            if (state.category) parts.push(state.category);
            if (state.brand) parts.push(CL.brandDisplayName(state.brand, state.category));
            if (state.model) parts.push(CL.modelDisplayName(state.model));
            if (state.repair) {
                parts.push(state.repair === 'Manual quote request' ? 'Manual quote' : state.repair === 'Issue not listed' ? 'Describe issue' : CL.repairDisplayName(state.repair));
            }
            el.mobileContext.textContent = parts.length > 0 ? parts.join(' › ') : '';
            el.mobileContext.style.display = parts.length > 0 ? '' : 'none';
        }
    }

    // Search slide-up sheet for mobile
    function showSearchSheet() {
        var html = '<h3 class="quote-sheet-title">Search</h3>';
        html += '<p class="quote-sheet-subtitle">Find your device and repair</p>';
        html += '<div class="quote-sheet-search">';
        html += '<i class="fas fa-magnifying-glass quote-sheet-search-icon"></i>';
        html += '<input type="text" class="quote-sheet-search-input" id="quote-sheet-search-input" placeholder="e.g. iPhone 13 screen, PS5 HDMI..." autocomplete="off">';
        html += '</div>';
        html += '<div class="quote-sheet-search-results" id="quote-sheet-search-results"></div>';
        showSheet(html);

        var searchInput = document.getElementById('quote-sheet-search-input');
        var searchResults = document.getElementById('quote-sheet-search-results');
        if (searchInput) {
            setTimeout(function() { searchInput.focus(); searchInput.click(); }, 300);
            searchInput.addEventListener('input', function() {
                var term = this.value.trim();
                if (term.length < 2) {
                    searchResults.innerHTML = '';
                    return;
                }
                var results = CL.searchAll(term);
                if (results.length === 0) {
                    searchResults.innerHTML = '<div class="quote-search-result"><div class="quote-search-result-text"><div class="quote-search-result-model">No results found</div></div></div>';
                    return;
                }
                var rhtml = '';
                results.forEach(function(r) {
                    var icon = IM.getRepairIcon(r.repair);
                    var priceHint = r.priceType === 'fixed' && r.customerPriceGbp ? r.displayPrice : 'Quote';
                    rhtml += '<div class="quote-search-result" data-category="' + r.category + '" data-brand="' + r.brand + '" data-model="' + r.model + '" data-repair="' + r.repair + '">' +
                        '<div class="quote-search-result-icon"><i class="fas ' + icon + '"></i></div>' +
                        '<div class="quote-search-result-text">' +
                        '<div class="quote-search-result-model">' + CL.modelDisplayName(r.model) + '</div>' +
                        '<div class="quote-search-result-repair">' + CL.repairDisplayName(r.repair) + '</div>' +
                        '</div>' +
                        '<div class="quote-search-result-price">' + priceHint + '</div>' +
                        '</div>';
                });
                searchResults.innerHTML = rhtml;

                // Bind result clicks — navigate to that repair
                searchResults.querySelectorAll('[data-model]').forEach(function(item) {
                    item.addEventListener('click', function() {
                        closeSheetInstant();
                        state.category = this.dataset.category;
                        state.brand = this.dataset.brand;
                        state.model = this.dataset.model;
                        state.repair = this.dataset.repair;
                        state.journeyMode = 'search';
                        if (window.NFD_Analytics) {
                            if (window.NFD_Analytics.setJourneyMode) window.NFD_Analytics.setJourneyMode('search');
                            window.NFD_Analytics.track('quote_search_result_selected', {
                                device_category: state.category || null,
                                device_make: state.brand || null,
                                device_model: state.model || null,
                                repair_type: state.repair || null
                            });
                        }
                        state.step = 5;
                        renderQuoteResult();
                        goToStep(5);
                    });
                });
            });
        }
        var closeBtn = el.sheetContent.querySelector('.quote-sheet-close');
        if (closeBtn) closeBtn.addEventListener('click', closeSheet);
    }

    function resetQuote() {
        // Analytics: track start again
        if (window.NFD_Analytics) {
            window.NFD_Analytics.trackStartAgain(state.step);
        }
        state.step = 1;
        state.category = null;
        state.brand = null;
        state.model = null;
        state.repair = null;
        state.selectedOption = null;
        state.price = null;
        state.quoteType = null;
        state.customerInfo = null;
        state.enquiryRef = null;
        state.expandedSeries = null;
        state.showAllModels = false;
        state.journeyMode = 'guided';
        if (window.NFD_Analytics && window.NFD_Analytics.setJourneyMode) window.NFD_Analytics.setJourneyMode('guided');
        el.resultArea.innerHTML = '';
        if (el.globalSearch) el.globalSearch.style.display = '';
        if (el.globalSearchInput) el.globalSearchInput.value = '';
        try { sessionStorage.removeItem('nfd-quote-state'); } catch(e) {}
        window.history.replaceState({ quoteStep: 1 }, '', '#step-1');
        el.steps.forEach(function(s) {
            s.classList.toggle('active', parseInt(s.dataset.step, 10) === 1);
        });
        renderCategories();
        updateProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateBreadcrumb() {
        if (!state.category) {
            el.breadcrumbRow.style.display = 'none';
            return;
        }
        el.breadcrumbRow.style.display = 'flex';
        var chips = '';
        if (state.category) chips += '<button class="quote-breadcrumb-chip" data-step="1"><i class="fas fa-mobile-alt"></i>' + state.category + '</button>';
        if (state.brand) chips += '<button class="quote-breadcrumb-chip" data-step="2"><i class="fas fa-tag"></i>' + CL.brandDisplayName(state.brand, state.category) + '</button>';
        if (state.model) chips += '<button class="quote-breadcrumb-chip" data-step="3"><i class="fas fa-mobile-screen"></i>' + CL.modelDisplayName(state.model) + '</button>';
        if (state.repair) chips += '<button class="quote-breadcrumb-chip" data-step="4"><i class="fas fa-wrench"></i>' + CL.repairDisplayName(state.repair) + '</button>';
        el.breadcrumb.innerHTML = chips;
    }

    // Helper: render icon or image for a card
    function renderCardIcon(image, icon) {
        if (image) {
            return '<div class="quote-card-icon"><img src="' + image + '" alt="" loading="lazy"></div>';
        }
        return '<div class="quote-card-icon"><i class="fas ' + (icon || 'fa-tag') + '"></i></div>';
    }

    // Step 1: Categories
    function renderCategories() {
        var cats = CL.categories();
        var html = '';
        cats.forEach(function(cat) {
            var img = IM.getCategoryImage(cat);
            var icon = IM.getCategoryIcon(cat);
            html += '<div class="quote-card" data-id="' + cat + '">' +
                renderCardIcon(img, icon) +
                '<div class="quote-card-label">' + CL.categoryDisplayName(cat) + '</div>' +
                '</div>';
        });
        el.categoryGrid.innerHTML = html;
    }

    function selectCategory(cat) {
        state.category = cat;
        state.brand = null;
        state.model = null;
        state.repair = null;
        state.selectedOption = null;
        state.price = null;
        state.quoteType = null;
        // 'Other devices' has no real brand/model choices — go straight to manual quote
        if (cat === 'Other devices') {
            state.repair = 'Manual quote request';
            selectRepair('Manual quote request');
            return;
        }
        renderBrands(cat);
        goToStep(2);
    }


    // Step 2: Brands — popular brands first, rest behind "More Brands" button
    function renderBrands(category) {
        // Computers: show simplified platform choice first (Apple Mac / Windows Laptop / Other)
        if (category === 'Computers') {
            renderComputerPlatforms();
            return;
        }

        var allBrands = CL.brands(category);
        var popular = CL.popularBrands(category);
        var popularSet = {};
        popular.forEach(function(b) { popularSet[b] = true; });

        var topBrands = allBrands.filter(function(b) { return popularSet[b]; });
        var otherBrands = allBrands.filter(function(b) { return !popularSet[b]; });

        // If 4 or fewer brands total, show all without toggle
        if (allBrands.length <= 5 || otherBrands.length === 0) {
            topBrands = allBrands;
            otherBrands = [];
        }

        var html = '';
        topBrands.forEach(function(brand) {
            var img = IM.getBrandImage(brand, state.category);
            var icon = IM.getBrandIcon(brand);
            var displayName = CL.brandDisplayName(brand, state.category);
            html += '<div class="quote-card" data-id="' + brand + '">' +
                renderCardIcon(img, icon) +
                '<div class="quote-card-label">' + displayName + '</div>' +
                '</div>';
        });

        if (otherBrands.length > 0) {
            html += '<div class="quote-card" data-action="more-brands">' +
                '<div class="quote-card-icon"><i class="fas fa-plus-circle"></i></div>' +
                '<div class="quote-card-label">More</div>' +
                '</div>';
        }

        el.makeGrid.innerHTML = html;

        // Bind "More" card — opens slide-up with ALL brands
        var moreCard = el.makeGrid.querySelector('[data-action="more-brands"]');
        if (moreCard) {
            moreCard.addEventListener('click', function(e) {
                e.stopPropagation();
                showMoreBrandsSheet(allBrands);
            });
        }
    }

    // Computers: simplified platform selection (Apple Mac / Windows Laptop / Other)
    function renderComputerPlatforms() {
        var html = '';
        // Apple Mac
        html += '<div class="quote-card" data-id="Apple">' +
            renderCardIcon(IM.getBrandImage('Apple', 'Computers'), IM.getBrandIcon('Apple')) +
            '<div class="quote-card-label">Apple Mac</div>' +
            '</div>';
        // Windows Laptop (maps to Multi-brand)
        html += '<div class="quote-card" data-id="Multi-brand">' +
            renderCardIcon(IM.getBrandImage('Multi-brand', 'Computers'), IM.getBrandIcon('Multi-brand')) +
            '<div class="quote-card-label">Windows Laptop</div>' +
            '</div>';
        // Other / Not Sure — opens full brand list
        html += '<div class="quote-card" data-action="more-brands">' +
            '<div class="quote-card-icon"><i class="fas fa-question-circle"></i></div>' +
            '<div class="quote-card-label">Other / Not Sure</div>' +
            '</div>';

        el.makeGrid.innerHTML = html;

        // Bind "Other / Not Sure" card
        var moreCard = el.makeGrid.querySelector('[data-action="more-brands"]');
        if (moreCard) {
            moreCard.addEventListener('click', function(e) {
                e.stopPropagation();
                var allBrands = CL.brands('Computers');
                // Remove Apple and Multi-brand from the full list since they're already shown as platforms
                var otherBrands = allBrands.filter(function(b) { return b !== 'Apple' && b !== 'Multi-brand'; });
                showMoreBrandsSheet(otherBrands);
            });
        }
    }

    function selectBrand(brand) {
        state.brand = brand;
        state.model = null;
        state.repair = null;
        state.selectedOption = null;
        state.price = null;
        state.quoteType = null;
        state.showAllModels = false;
        // "Other" brands only have "Model not listed" — skip straight to manual quote
        if (brand === 'Any other phone' || brand === 'Any other tablet' || brand === 'Any other computer' || brand === 'Any other console/handheld' || brand === 'Other electronic device') {
            state.repair = 'Manual quote request';
            selectRepair('Manual quote request');
            return;
        }
        renderModels();
        goToStep(3);
    }

    // Slide-up sheet showing all other brands with search
    function showMoreBrandsSheet(allBrandsList) {
        var sheetTitle = state.category === 'Computers' ? 'All Computer Brands' : 'All Brands';
        var html = '<h3 class="quote-sheet-title">' + sheetTitle + '</h3>';
        html += '<div class="quote-sheet-search">';
        html += '<i class="fas fa-magnifying-glass quote-sheet-search-icon"></i>';
        html += '<input type="text" class="quote-sheet-search-input" id="quote-brands-search-input" placeholder="Search brands..." autocomplete="off">';
        html += '</div>';
        html += '<div class="quote-sheet-search-results" id="quote-brands-results">';
        html += '<div class="quote-card-grid quote-card-grid--compact quote-brands-grid">';
        allBrandsList.forEach(function(brand) {
            var img = IM.getBrandImage(brand, state.category);
            var icon = IM.getBrandIcon(brand);
            var displayName = CL.brandDisplayName(brand, state.category);
            html += '<div class="quote-card quote-card--compact" data-id="' + brand + '">' +
                renderCardIcon(img, icon) +
                '<div class="quote-card-label">' + displayName + '</div>' +
                '</div>';
        });
        html += '</div>';
        html += '</div>';
        showSheet(html);

        // Bind brand card clicks
        el.sheetContent.querySelectorAll('[data-id]').forEach(function(card) {
            card.addEventListener('click', function() {
                var brand = this.dataset.id;
                closeSheetInstant();
                selectBrand(brand);
            });
        });

        // Bind search filtering
        var searchInput = document.getElementById('quote-brands-search-input');
        var resultsContainer = document.getElementById('quote-brands-results');
        if (searchInput && resultsContainer) {
            searchInput.addEventListener('input', function() {
                var term = this.value.toLowerCase().trim();
                var cards = resultsContainer.querySelectorAll('[data-id]');
                cards.forEach(function(card) {
                    var label = card.querySelector('.quote-card-label').textContent.toLowerCase();
                    card.style.display = (!term || label.indexOf(term) !== -1) ? '' : 'none';
                });
            });
        }

    }

    // Step 3: Models (searchable, with series grouping for large lists)
    function extractSeriesKey(model) {
        // iPhone: "iPhone 12 Pro Max" → "iPhone 12"
        var iphoneMatch = model.match(/^(iPhone \d+)/);
        if (iphoneMatch) return iphoneMatch[1];
        // iPhone SE: "iPhone SE (1st gen)" → "iPhone SE"
        var iphoneSEMatch = model.match(/^(iPhone SE)/);
        if (iphoneSEMatch) return iphoneSEMatch[1];
        // iPhone X/XR/XS/XS Max: all group under "iPhone X"
        var iphoneXMatch = model.match(/^iPhone X/);
        if (iphoneXMatch) return 'iPhone X';
        // iPhone Air → group with iPhone 17
        if (model === 'iPhone Air') return 'iPhone 17';
        // iPad Pro: "iPad Pro 11-inch (M4)" → "iPad Pro"
        var ipadProMatch = model.match(/^iPad Pro/);
        if (ipadProMatch) return 'iPad Pro';
        // iPad Air: "iPad Air 11-inch (M2)" → "iPad Air"
        var ipadAirMatch = model.match(/^iPad Air/);
        if (ipadAirMatch) return 'iPad Air';
        // iPad mini: "iPad mini 6" → "iPad mini"
        var ipadMiniMatch = model.match(/^iPad mini/);
        if (ipadMiniMatch) return 'iPad mini';
        // iPad (numbered): "iPad 10th generation", "iPad (A16 / 11th generation)" → "iPad"
        var ipadMatch = model.match(/^iPad (\d|\(A)/);
        if (ipadMatch) return 'iPad';
        // Samsung S series: "S22 Ultra" → "S22"
        var sMatch = model.match(/^(S\d+)/);
        if (sMatch) return sMatch[1];
        // Samsung Note: "Note 20 Ultra" → "Note 20"
        var noteMatch = model.match(/^(Note \d+)/);
        if (noteMatch) return noteMatch[1];
        // Samsung Z Flip/Fold: "Z Flip 4" → "Z Flip"
        var zMatch = model.match(/^(Z (?:Flip|Fold))/);
        if (zMatch) return zMatch[1];
        // Samsung A series: "A13 5G" → "A1x Series"
        var aMatch = model.match(/^A(\d)/);
        if (aMatch) return 'A' + aMatch[1] + 'x Series';
        // Samsung M series: "M12" → "M Series"
        var mMatch = model.match(/^M\d/);
        if (mMatch) return 'M Series';
        // Motorola Moto: "Moto G Power" → "Moto G"
        var motoGMatch = model.match(/^(Moto [A-Z])/);
        if (motoGMatch) return motoGMatch[1];
        // Google Pixel: "Pixel 7 Pro" → "Pixel 7"
        var pixelMatch = model.match(/^(Pixel \d+)/);
        if (pixelMatch) return pixelMatch[1];
        // Surface Pro: "Surface Pro 9" → "Surface Pro"
        var surfaceProMatch = model.match(/^Surface Pro/);
        if (surfaceProMatch) return 'Surface Pro';
        // Default: no grouping
        return model;
    }

    function groupModelsBySeries(models) {
        var groups = {};
        var order = [];
        models.forEach(function(m) {
            var key = extractSeriesKey(m);
            if (!groups[key]) {
                groups[key] = [];
                order.push(key);
            }
            groups[key].push(m);
        });
        // Only group series with >1 model; single models stay as individual cards
        var multiSeries = order.filter(function(k) { return groups[k].length > 1; });
        if (multiSeries.length === 0) return null;
        // Build the result with only multi-model series + single models as individual entries
        var seriesOrder = [];
        var singles = [];
        order.forEach(function(k) {
            if (groups[k].length > 1) {
                seriesOrder.push(k);
            } else {
                singles.push(groups[k][0]);
            }
        });
        // Sort series by MODEL_POPULAR order (use best-ranked model in each series)
        var popList = CL.modelPopular();
        function bestPopIndex(modelList) {
            var best = 999;
            modelList.forEach(function(m) {
                var idx = popList.indexOf(m);
                if (idx !== -1 && idx < best) best = idx;
            });
            return best;
        }
        seriesOrder.sort(function(a, b) {
            var pa = bestPopIndex(groups[a]), pb = bestPopIndex(groups[b]);
            if (pa !== pb) return pa - pb;
            return b.localeCompare(a, undefined, { numeric: true });
        });
        // Sort singles by MODEL_POPULAR order too
        singles.sort(function(a, b) {
            var pa = popList.indexOf(a), pb = popList.indexOf(b);
            if (pa === -1) pa = 999; if (pb === -1) pb = 999;
            if (pa !== pb) return pa - pb;
            return b.localeCompare(a, undefined, { numeric: true });
        });
        return { groups: groups, order: seriesOrder, singles: singles };
    }

    var MODEL_PREVIEW_COUNT = 8;
    var POPULAR_IPHONE_SERIES = ['iPhone 13', 'iPhone 14', 'iPhone 12', 'iPhone 11', 'iPhone 15'];

    function isMobile() {
        return window.innerWidth <= 600;
    }

    function renderModels(filter) {
        var models = CL.models(state.category, state.brand);
        var term = (filter || '').toLowerCase().trim();

        // When searching, show all matching models flat
        if (term) {
            models = models.filter(function(m) {
                return m.toLowerCase().indexOf(term) !== -1;
            });
            renderModelCards(models, false);
            return;
        }

        // If expandedSeries is set, show models in that series
        if (state.expandedSeries) {
            renderModelCards(models.filter(function(m) {
                return extractSeriesKey(m) === state.expandedSeries;
            }), true);
            return;
        }

        // If many models, group into series
        if (models.length > 8) {
            var grouped = groupModelsBySeries(models);
            if (grouped) {
                // On mobile, show popular series + "More" card → slide-up for the rest
                if (isMobile()) {
                    var totalCards = grouped.order.length + grouped.singles.length;
                    if (totalCards > 8) {
                        // Determine popular series for this brand
                        var popularSeries;
                        if (state.brand === 'Apple' && state.category === 'Phones') {
                            popularSeries = grouped.order.filter(function(k) {
                                return POPULAR_IPHONE_SERIES.indexOf(k) !== -1;
                            });
                        } else {
                            // For non-Apple: first 7 series/singles are "popular" (already sorted by popularity)
                            var allKeys = grouped.order.concat(grouped.singles);
                            var popularCount = Math.min(7, allKeys.length - 1);
                            popularSeries = grouped.order.slice(0, popularCount);
                        }
                        var otherSeries = grouped.order.filter(function(k) {
                            return popularSeries.indexOf(k) === -1;
                        });
                        if (otherSeries.length > 0) {
                            renderSeriesCardsMobile(grouped, popularSeries, otherSeries);
                            return;
                        }
                    }
                }
                // If not showAllModels, only show first MODEL_PREVIEW_COUNT series + singles
                if (!state.showAllModels) {
                    var totalCards = grouped.order.length + grouped.singles.length;
                    if (totalCards > MODEL_PREVIEW_COUNT) {
                        renderSeriesCardsPreview(grouped, MODEL_PREVIEW_COUNT);
                        return;
                    }
                }
                renderSeriesCards(grouped);
                // Add "Show Fewer" button if we expanded from a preview
                if (state.showAllModels) {
                    appendShowFewerButton();
                }
                return;
            }
        }

        // For flat lists > MODEL_PREVIEW_COUNT, show preview
        if (!state.showAllModels && models.length > MODEL_PREVIEW_COUNT) {
            renderModelCardsPreview(models, MODEL_PREVIEW_COUNT);
            return;
        }

        // Default: show all models flat
        renderModelCards(models, false);
        // Add "Show Fewer" button if we expanded from a preview
        if (state.showAllModels && models.length > MODEL_PREVIEW_COUNT) {
            appendShowFewerButton();
        }
    }

    function appendShowFewerButton() {
        var btn = document.createElement('button');
        btn.className = 'quote-model-fewer';
        btn.innerHTML = 'Show Fewer <i class="fas fa-chevron-up"></i>';
        btn.addEventListener('click', function() {
            state.showAllModels = false;
            renderModels();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        el.modelList.appendChild(btn);
    }

    function renderSeriesCards(grouped) {
        var html = '';
        var brandImg = IM.getModelImage(state.category, state.brand);
        var modelIcon = IM.getModelIcon(state.category);
        // Render multi-model series first (in popularity order)
        grouped.order.forEach(function(key) {
            var count = grouped.groups[key].length;
            var displayLabel = key;
            // Clean up series labels
            if (key.indexOf('iPhone') === 0) displayLabel = key + ' Series';
            else if (key.match(/^S\d/)) displayLabel = 'Galaxy S' + key.substring(1) + ' Series';
            else if (key.indexOf('Note') === 0) displayLabel = 'Galaxy ' + key + ' Series';
            else if (key.indexOf('Z ') === 0) displayLabel = 'Galaxy ' + key + ' Series';
            else if (key.indexOf('A') === 0 && key.indexOf('x Series') > 0) displayLabel = 'Galaxy ' + key;
            else if (key === 'M Series') displayLabel = 'Galaxy M Series';
            else if (key.indexOf('Moto') === 0) displayLabel = key + ' Series';
            else if (key.indexOf('Pixel') === 0) displayLabel = key + ' Series';

            // Use first model in series for a representative image
            var seriesImg = IM.getModelImage(state.category, state.brand, grouped.groups[key][0]) || brandImg;
            var iconHtml = seriesImg
                ? '<div class="quote-card-icon"><img src="' + seriesImg + '" alt="" loading="lazy"></div>'
                : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
            html += '<div class="quote-card quote-card--series" data-series="' + key + '">' +
                iconHtml +
                '<div class="quote-card-label">' + displayLabel + '</div>' +
                '</div>';
        });
        // Then render single models (not part of any series) as individual cards
        if (grouped.singles && grouped.singles.length > 0) {
            grouped.singles.forEach(function(m) {
                var displayLabel = CL.modelDisplayName(m);
                var mImg = IM.getModelImage(state.category, state.brand, m) || brandImg;
                var iconHtml = mImg
                    ? '<div class="quote-card-icon"><img src="' + mImg + '" alt="" loading="lazy"></div>'
                    : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
                html += '<div class="quote-card" data-id="' + m + '">' +
                    iconHtml +
                    '<div class="quote-card-label">' + displayLabel + '</div>' +
                    '</div>';
            });
        }
        // Add "My model isn't listed" button
        var unlistedLabel = CL.customerUiValue('unlistedModelAction', 'My model isn\'t listed');
        html += '<button class="quote-model-not-listed" id="quote-model-not-listed-btn"><i class="fas fa-question-circle"></i> ' + unlistedLabel.replace(/</g, '&lt;') + '</button>';
        el.modelList.innerHTML = html;

        var notListedBtn = document.getElementById('quote-model-not-listed-btn');
        if (notListedBtn) {
            notListedBtn.addEventListener('click', function() {
                selectModel('Model not listed');
            });
        }
    }

    function renderSeriesCardsPreview(grouped, limit) {
        var brandImg = IM.getModelImage(state.category, state.brand);
        var modelIcon = IM.getModelIcon(state.category);
        var allItems = []; // {type: 'series'|'single', key/model, count, displayLabel}
        grouped.order.forEach(function(key) {
            var displayLabel = key;
            if (key.indexOf('iPhone') === 0) displayLabel = key + ' Series';
            else if (key.match(/^S\d/)) displayLabel = 'Galaxy S' + key.substring(1) + ' Series';
            else if (key.indexOf('Note') === 0) displayLabel = 'Galaxy ' + key + ' Series';
            else if (key.indexOf('Z ') === 0) displayLabel = 'Galaxy ' + key + ' Series';
            else if (key.indexOf('A') === 0 && key.indexOf('x Series') > 0) displayLabel = 'Galaxy ' + key;
            else if (key === 'M Series') displayLabel = 'Galaxy M Series';
            else if (key.indexOf('Moto') === 0) displayLabel = key + ' Series';
            else if (key.indexOf('Pixel') === 0) displayLabel = key + ' Series';
            allItems.push({ type: 'series', key: key, count: grouped.groups[key].length, displayLabel: displayLabel });
        });
        if (grouped.singles) {
            grouped.singles.forEach(function(m) {
                allItems.push({ type: 'single', model: m, displayLabel: CL.modelDisplayName(m) });
            });
        }

        var preview = allItems.slice(0, limit);
        var remaining = allItems.length - limit;
        var html = '';

        preview.forEach(function(item) {
            if (item.type === 'series') {
                var seriesImg = IM.getModelImage(state.category, state.brand, grouped.groups[item.key][0]) || brandImg;
                var sIconHtml = seriesImg
                    ? '<div class="quote-card-icon"><img src="' + seriesImg + '" alt="" loading="lazy"></div>'
                    : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
                html += '<div class="quote-card quote-card--series" data-series="' + item.key + '">' +
                    sIconHtml +
                    '<div class="quote-card-label">' + item.displayLabel + '</div>' +
                    '</div>';
            } else {
                var mImg = IM.getModelImage(state.category, state.brand, item.model) || brandImg;
                var mIconHtml = mImg
                    ? '<div class="quote-card-icon"><img src="' + mImg + '" alt="" loading="lazy"></div>'
                    : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
                html += '<div class="quote-card" data-id="' + item.model + '">' +
                    mIconHtml +
                    '<div class="quote-card-label">' + item.displayLabel + '</div>' +
                    '</div>';
            }
        });

        if (remaining > 0) {
            html += '<button class="quote-model-more" id="quote-model-more-btn">' +
                'Show All ' + allItems.length + ' Models <i class="fas fa-chevron-down"></i></button>';
        }

        el.modelList.innerHTML = html;

        var moreBtn = document.getElementById('quote-model-more-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', function() {
                state.showAllModels = true;
                renderModels();
            });
        }
    }

    // Mobile: show popular series on screen, rest in slide-up
    function renderSeriesCardsMobile(grouped, popularKeys, otherKeys) {
        var brandImg = IM.getModelImage(state.category, state.brand);
        var modelIcon = IM.getModelIcon(state.category);

        // Helper to get display label for a series key
        function seriesLabel(key) {
            if (key.indexOf('iPhone') === 0) return key + ' Series';
            if (key.match(/^S\d/)) return 'Galaxy S' + key.substring(1) + ' Series';
            if (key.indexOf('Note') === 0) return 'Galaxy ' + key + ' Series';
            if (key.indexOf('Z ') === 0) return 'Galaxy ' + key + ' Series';
            if (key.indexOf('A') === 0 && key.indexOf('x Series') > 0) return 'Galaxy ' + key;
            if (key === 'M Series') return 'Galaxy M Series';
            if (key.indexOf('Moto') === 0) return key + ' Series';
            if (key.indexOf('Pixel') === 0) return key + ' Series';
            return key;
        }

        // Build items for popular series + singles
        var popularItems = [];
        popularKeys.forEach(function(key) {
            var modelList = grouped.groups[key];
            popularItems.push({
                type: 'series',
                key: key,
                displayLabel: seriesLabel(key),
                count: modelList.length
            });
        });
        // Add singles too
        grouped.singles.forEach(function(m) {
            popularItems.push({ type: 'single', model: m, displayLabel: CL.modelDisplayName(m) });
        });

        var html = '';
        popularItems.forEach(function(item) {
            if (item.type === 'series') {
                var seriesImg = IM.getModelImage(state.category, state.brand, grouped.groups[item.key][0]) || brandImg;
                var sIconHtml = seriesImg
                    ? '<div class="quote-card-icon"><img src="' + seriesImg + '" alt="" loading="lazy"></div>'
                    : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
                html += '<div class="quote-card quote-card--series" data-series="' + item.key + '">' +
                    sIconHtml +
                    '<div class="quote-card-label">' + item.displayLabel + '</div>' +
                    '</div>';
            } else {
                var mImg = IM.getModelImage(state.category, state.brand, item.model) || brandImg;
                var mIconHtml = mImg
                    ? '<div class="quote-card-icon"><img src="' + mImg + '" alt="" loading="lazy"></div>'
                    : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
                html += '<div class="quote-card" data-id="' + item.model + '">' +
                    mIconHtml +
                    '<div class="quote-card-label">' + item.displayLabel + '</div>' +
                    '</div>';
            }
        });

        // More Models button — looks like a card, same style as others
        if (otherKeys.length > 0) {
            html += '<div class="quote-card" data-action="more-models">' +
                '<div class="quote-card-icon"><i class="fas fa-plus-circle"></i></div>' +
                '<div class="quote-card-label">More</div>' +
                '</div>';
        }

        el.modelList.innerHTML = html;

        // Bind series card clicks — open slide-up sheet
        el.modelList.querySelectorAll('[data-series]').forEach(function(card) {
            card.addEventListener('click', function() {
                showModelSheet(this.dataset.series, this.querySelector('.quote-card-label').textContent);
            });
        });
        // Bind single model clicks
        el.modelList.querySelectorAll('[data-id]').forEach(function(card) {
            card.addEventListener('click', function() {
                selectModel(this.dataset.id);
            });
        });
        // Bind more models card — opens slide-up with remaining series
        var moreCard = el.modelList.querySelector('[data-action="more-models"]');
        if (moreCard) {
            moreCard.addEventListener('click', function(e) {
                e.stopPropagation();
                showMoreModelsSheet(grouped, otherKeys);
            });
        }
    }

    // Slide-up sheet showing remaining model series — paginated 4 per page
    var _moreModelsPageState = { items: [], currentPage: 0, totalPages: 0 };

    function showMoreModelsSheet(grouped, otherKeys) {
        var brandImg = IM.getModelImage(state.category, state.brand);
        var modelIcon = IM.getModelIcon(state.category);

        // Build a flat list of all items (series + singles)
        var items = [];
        otherKeys.forEach(function(key) {
            var modelList = grouped.groups[key];
            items.push({ type: 'series', key: key, label: key + ' Series', img: IM.getModelImage(state.category, state.brand, modelList[0]) || brandImg });
        });
        grouped.singles.forEach(function(m) {
            items.push({ type: 'model', key: m, label: CL.modelDisplayName(m), img: IM.getModelImage(state.category, state.brand, m) || brandImg });
        });

        var totalPages = Math.max(1, Math.ceil(items.length / MODELS_PER_PAGE));
        _moreModelsPageState = { items: items, currentPage: 0, totalPages: totalPages };
        renderMoreModelsSheetPage();
    }

    function renderMoreModelsSheetPage() {
        var items = _moreModelsPageState.items;
        var page = _moreModelsPageState.currentPage;
        var totalPages = _moreModelsPageState.totalPages;
        var startIdx = page * MODELS_PER_PAGE;
        var endIdx = Math.min(startIdx + MODELS_PER_PAGE, items.length);
        var pageItems = items.slice(startIdx, endIdx);
        var modelIcon = IM.getModelIcon(state.category);

        var html = '<h3 class="quote-sheet-title">More Models</h3>';
        html += '<div class="quote-sheet-swipe-wrap quote-sheet-swipe-wrap--models" id="more-models-swipe-wrap">';
        html += '<div class="quote-card-grid quote-card-grid--compact" id="more-models-sheet-grid">';
        pageItems.forEach(function(item) {
            var iconHtml = item.img
                ? '<div class="quote-card-icon"><img src="' + item.img + '" alt="" loading="lazy"></div>'
                : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
            if (item.type === 'series') {
                html += '<div class="quote-card quote-card--compact quote-card--series" data-series="' + item.key + '">' +
                    iconHtml + '<div class="quote-card-label">' + item.label + '</div></div>';
            } else {
                html += '<div class="quote-card quote-card--compact" data-model="' + item.key + '">' +
                    iconHtml + '<div class="quote-card-label">' + item.label + '</div></div>';
            }
        });
        // Pad to 4 items
        for (var p = pageItems.length; p < MODELS_PER_PAGE; p++) {
            html += '<div class="quote-card quote-card--compact" style="visibility:hidden"></div>';
        }
        html += '</div>';
        html += '</div>';

        // Page indicators + nav buttons
        if (totalPages > 1) {
            html += '<div class="quote-sheet-page-dots" id="more-models-page-dots">';
            for (var i = 0; i < totalPages; i++) {
                html += '<span class="quote-sheet-page-dot' + (i === page ? ' active' : '') + '" data-page="' + i + '"></span>';
            }
            html += '</div>';
            html += '<div class="quote-sheet-nav-buttons">';
            html += '<button type="button" class="quote-sheet-nav-btn' + (page === 0 ? ' disabled' : '') + '" id="more-models-prev-btn"' + (page === 0 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
            html += '<button type="button" class="quote-sheet-nav-btn' + (page >= totalPages - 1 ? ' disabled' : '') + '" id="more-models-next-btn"' + (page >= totalPages - 1 ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
            html += '</div>';
        }

        showSheet(html);

        // Bind series clicks
        el.sheetContent.querySelectorAll('[data-series]').forEach(function(card) {
            card.addEventListener('click', function() {
                var seriesKey = this.dataset.series;
                var label = this.querySelector('.quote-card-label').textContent;
                closeSheetInstant();
                showModelSheet(seriesKey, label);
            });
        });
        // Bind single model clicks
        el.sheetContent.querySelectorAll('[data-model]').forEach(function(card) {
            card.addEventListener('click', function() {
                closeSheetInstant();
                selectModel(this.dataset.model);
            });
        });

        // Bind prev/next
        var prevBtn = el.sheetContent.querySelector('#more-models-prev-btn');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (_moreModelsPageState.currentPage > 0) { _moreModelsPageState.currentPage--; renderMoreModelsSheetPage(); }
            });
        }
        var nextBtn = el.sheetContent.querySelector('#more-models-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (_moreModelsPageState.currentPage < _moreModelsPageState.totalPages - 1) { _moreModelsPageState.currentPage++; renderMoreModelsSheetPage(); }
            });
        }

        // Bind page dots
        el.sheetContent.querySelectorAll('#more-models-page-dots .quote-sheet-page-dot').forEach(function(dot) {
            dot.addEventListener('click', function() {
                _moreModelsPageState.currentPage = parseInt(this.dataset.page, 10);
                renderMoreModelsSheetPage();
            });
        });

        // Swipe handlers
        var swipeWrap = el.sheetContent.querySelector('#more-models-swipe-wrap');
        if (swipeWrap && totalPages > 1) {
            var startX = 0, startY = 0, swiping = false;
            swipeWrap.addEventListener('touchstart', function(e) {
                startX = e.touches[0].clientX; startY = e.touches[0].clientY; swiping = true;
            }, { passive: true });
            swipeWrap.addEventListener('touchend', function(e) {
                if (!swiping) return;
                swiping = false;
                var deltaX = e.changedTouches[0].clientX - startX;
                var deltaY = e.changedTouches[0].clientY - startY;
                if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
                    if (deltaX < 0 && _moreModelsPageState.currentPage < _moreModelsPageState.totalPages - 1) { _moreModelsPageState.currentPage++; renderMoreModelsSheetPage(); }
                    else if (deltaX > 0 && _moreModelsPageState.currentPage > 0) { _moreModelsPageState.currentPage--; renderMoreModelsSheetPage(); }
                }
            }, { passive: true });
        }
    }

    function renderModelCardsPreview(models, limit) {
        var brandImg = IM.getModelImage(state.category, state.brand);
        var modelIcon = IM.getModelIcon(state.category);

        var preview = models.slice(0, limit);
        var remaining = models.length - limit;
        var html = '';
        preview.forEach(function(m) {
            var mImg = IM.getModelImage(state.category, state.brand, m) || brandImg;
            var iconHtml = mImg
                ? '<div class="quote-card-icon"><img src="' + mImg + '" alt="" loading="lazy"></div>'
                : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
            html += '<div class="quote-card" data-id="' + m + '">' +
                iconHtml +
                '<div class="quote-card-label">' + CL.modelDisplayName(m) + '</div>' +
                '</div>';
        });

        if (remaining > 0) {
            html += '<button class="quote-model-more" id="quote-model-more-btn">' +
                'Show All ' + models.length + ' Models <i class="fas fa-chevron-down"></i></button>';
        }

        el.modelList.innerHTML = html;

        var moreBtn = document.getElementById('quote-model-more-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', function() {
                state.showAllModels = true;
                renderModels();
            });
        }
    }

    function renderModelCards(models, showBack) {
        var html = '';
        var brandImg = IM.getModelImage(state.category, state.brand);
        var modelIcon = IM.getModelIcon(state.category);
        if (showBack) {
            html += '<div class="quote-card quote-card--back" data-action="back-to-series">' +
                '<div class="quote-card-icon"><i class="fas fa-arrow-left"></i></div>' +
                '<div class="quote-card-label">All Series</div>' +
                '</div>';
        }
        if (models.length === 0) {
            html = '<p class="quote-empty-msg">No models found. Try a different search.</p>';
        } else {
            models.forEach(function(m) {
                var displayName = CL.modelDisplayName(m);
                var mImg = IM.getModelImage(state.category, state.brand, m) || brandImg;
                var iconHtml = mImg
                    ? '<div class="quote-card-icon"><img src="' + mImg + '" alt="" loading="lazy"></div>'
                    : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
                var ipadHint = '';
                if (state.category === 'Tablets' && state.brand === 'Apple') {
                    if (m === 'iPad 5th generation') ipadHint = 'Standard iPad (2017) — not iPad Air 5';
                    else if (m === 'iPad Air 5') ipadHint = 'iPad Air (2022) — not standard iPad 5';
                }
                html += '<div class="quote-card" data-id="' + m + '">' +
                    iconHtml +
                    '<div class="quote-card-label">' + displayName + '</div>' +
                    (ipadHint ? '<small style="display:block;font-size:12px;line-height:1.35;margin-top:5px;opacity:.8">' + ipadHint + '</small>' : '') +
                    '</div>';
            });
        }
        // Add "My model isn't listed" button (only when not showing back button / not in series expanded view)
        if (!showBack) {
            var unlistedLabelFlat = CL.customerUiValue('unlistedModelAction', 'My model isn\'t listed');
            html += '<button class="quote-model-not-listed" id="quote-model-not-listed-btn"><i class="fas fa-question-circle"></i> ' + unlistedLabelFlat.replace(/</g, '&lt;') + '</button>';
        }
        el.modelList.innerHTML = html;

        var notListedBtnFlat = document.getElementById('quote-model-not-listed-btn');
        if (notListedBtnFlat) {
            notListedBtnFlat.addEventListener('click', function() {
                selectModel('Model not listed');
            });
        }
    }

    function filterModels(term) { renderModels(term); }

    // Make global search also filter models when on model step
    function handleGlobalSearchForModels(query) {
        if (state.step === 3) {
            renderModels(query);
            return true;
        }
        return false;
    }

    function selectModel(model) {
        state.model = model;
        state.expandedSeries = null;
        // If "Model not listed", skip repairs and go to manual quote
        if (model === 'Model not listed') {
            state.pendingRepair = null;
            state.repair = 'Manual quote request';
            selectRepair('Manual quote request');
            return;
        }

        // A service/SEO page can deep-link to a model family + repair, e.g.
        // ?category=Phones&brand=Apple&series=iPhone+15&repair=Battery+replacement.
        // Once the customer chooses the exact model, skip the repair picker if
        // that repair exists for the selected model.
        if (state.pendingRepair) {
            var pending = state.pendingRepair;
            state.pendingRepair = null;
            var available = CL.repairs(state.category, state.brand, state.model) || [];
            var pendingMatch = null;
            for (var pi = 0; pi < available.length; pi++) {
                if (available[pi].toLowerCase() === pending.toLowerCase()) {
                    pendingMatch = available[pi];
                    break;
                }
            }
            if (!pendingMatch) {
                for (var pi2 = 0; pi2 < available.length; pi2++) {
                    if (available[pi2].toLowerCase().indexOf(pending.toLowerCase()) !== -1) {
                        pendingMatch = available[pi2];
                        break;
                    }
                }
            }
            if (pendingMatch) {
                selectRepair(pendingMatch);
                return;
            }
        }

        renderRepairs();
        goToStep(4);
    }

    // Global search — searches all quotes and shows dropdown results
    // Prioritizes current brand/category but shows everything
    function handleGlobalSearch(query) {
        var term = query.trim();
        if (term.length < 2) {
            el.globalSearchResults.classList.remove('active');
            el.globalSearchResults.innerHTML = '';
            return;
        }
        if (!catalogueReady) {
            var statusText = catalogueLoadFailed ? 'Could not load repair prices. Please refresh the page.' : 'Loading repair prices…';
            el.globalSearchResults.innerHTML = '<div class="quote-search-result"><div class="quote-search-result-text"><div class="quote-search-result-model">' + statusText + '</div></div></div>';
            el.globalSearchResults.classList.add('active');
            return;
        }
        var results = CL.searchAll(term);
        // Analytics: track search
        if (window.NFD_Analytics) {
            window.NFD_Analytics.trackSearch(term, results.length);
        }
        if (results.length === 0) {
            el.globalSearchResults.innerHTML = '<div class="quote-search-result"><div class="quote-search-result-text"><div class="quote-search-result-model">No results found</div></div></div>';
            el.globalSearchResults.classList.add('active');
            return;
        }
        // Sort: current brand first, then current category, then everything else
        var currentBrand = state.brand ? state.brand.toLowerCase() : '';
        var currentCategory = state.category || '';
        results.sort(function(a, b) {
            var aBrand = (a.brand || '').toLowerCase();
            var bBrand = (b.brand || '').toLowerCase();
            var aMatchBrand = aBrand === currentBrand ? 0 : 1;
            var bMatchBrand = bBrand === currentBrand ? 0 : 1;
            if (aMatchBrand !== bMatchBrand) return aMatchBrand - bMatchBrand;
            var aMatchCat = a.category === currentCategory ? 0 : 1;
            var bMatchCat = b.category === currentCategory ? 0 : 1;
            return aMatchCat - bMatchCat;
        });
        var html = '';
        results.forEach(function(r) {
            var icon = IM.getRepairIcon(r.repair);
            var priceHint = '';
            if (r.priceType === 'fixed' && r.customerPriceGbp) {
                priceHint = r.displayPrice;
            } else {
                priceHint = 'Quote';
            }
            html += '<div class="quote-search-result" data-category="' + r.category + '" data-brand="' + r.brand + '" data-model="' + r.model + '" data-repair="' + r.repair + '">' +
                '<div class="quote-search-result-icon"><i class="fas ' + icon + '"></i></div>' +
                '<div class="quote-search-result-text">' +
                '<div class="quote-search-result-model">' + CL.modelDisplayName(r.model) + '</div>' +
                '<div class="quote-search-result-repair">' + CL.repairDisplayName(r.repair) + '</div>' +
                '</div>' +
                '<div class="quote-search-result-price">' + priceHint + '</div>' +
                '</div>';
        });
        el.globalSearchResults.innerHTML = html;
        el.globalSearchResults.classList.add('active');
    }

    // Step 4: Repairs (common repairs first, other repairs behind expandable button)
    function renderRepairs() {
        var grouped = CL.groupedRepairs(state.category, state.brand, state.model);
        var html = '';
        if (grouped.allCount === 0) {
            html = '<p class="quote-empty-msg">No specific repairs listed. Describe your issue below.</p>';
            html += '<button class="quote-repair-manual" id="quote-repair-manual"><i class="fas fa-keyboard"></i> Describe Your Issue</button>';
        } else {
            var primaryLimit = CL.customerUiValue('maxPrimaryRepairCards', 3);
            var topCount = Math.min(primaryLimit, grouped.common.length);
            var topRepairs = grouped.common.slice(0, topCount);
            var restCommon = grouped.common.slice(topCount);
            // All remaining repairs (rest of common + other) go in the slide-up sheet
            var moreRepairs = restCommon.concat(grouped.other);

            if (topRepairs.length > 0 || moreRepairs.length > 0) {
                html += '<div class="quote-repair-top-grid">';
                topRepairs.forEach(function(r) {
                    html += buildRepairCard(r, true);
                });
                // More repairs button — inline as last card in the grid
                if (moreRepairs.length > 0) {
                    var moreLabel = CL.customerUiValue('remainingRepairsControl', 'More Repairs');
                    html += '<div class="quote-card quote-card--more quote-card--top" id="quote-repair-more-btn">';
                    html += '<div class="quote-card-icon"><i class="fas fa-plus-circle"></i></div>';
                    html += '<div class="quote-card-label">' + moreLabel + '</div>';
                    html += '<div class="quote-card-hint">' + moreRepairs.length + ' more</div>';
                    html += '</div>';
                }
                html += '</div>';
            }

            // "Can't see your issue?" button
            html += '<button class="quote-repair-manual" id="quote-repair-manual"><i class="fas fa-keyboard"></i> Can\'t see your issue?</button>';
        }
        el.repairList.innerHTML = html;

        // Bind "More repairs" card — opens slide-up sheet
        var moreBtn = document.getElementById('quote-repair-more-btn');
        if (moreBtn) {
            moreBtn.style.display = '';
            moreBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                showMoreRepairsSheet(moreRepairs);
            });
        }

        // Bind "Can't see your issue" button — we know the device, just need the issue
        var manualBtn = document.getElementById('quote-repair-manual');
        if (manualBtn) {
            manualBtn.addEventListener('click', function() {
                state.repair = 'Issue not listed';
                selectRepair('Issue not listed');
            });
        }
    }

    function buildRepairCard(r, isTop) {
        var img = IM.getRepairImage(r, state.category, state.brand);
        var icon = IM.getRepairIcon(r);
        var opts = CL.options(state.category, state.brand, state.model, r);
        var priceHint = getRepairPriceHint(opts);
        var displayName = CL.repairDisplayName(r);
        var tooltip = CL.repairTooltip(r);
        var tooltipHtml = '';
        var topClass = isTop ? ' quote-card--top quote-card--hero' : '';
        var hoverTooltip = displayName + (priceHint ? ' — ' + priceHint : '');
        return '<div class="quote-card' + topClass + '" data-id="' + r + '"' +
            ' data-tooltip="' + hoverTooltip.replace(/"/g, '&quot;') + '"' +
            (tooltip ? ' title="' + tooltip.replace(/"/g, '&quot;') + '"' : '') + '>' +
            renderCardIcon(img, icon) +
            '<div class="quote-card-label">' + displayName + '</div>' +
            '<div class="quote-card-hint">' + priceHint + '</div>' +
            tooltipHtml +
            '</div>';
    }

    function getRepairPriceHint(opts) {
        var fixedPrices = opts.filter(function(o) { return o.priceType === 'fixed' && o.customerPriceGbp !== null; });
        // Check if all fixed options are diagnostic fees (not real repair prices)
        var isDiagnosticOnly = fixedPrices.length > 0 && fixedPrices.every(function(o) {
            var dp = (o.displayPrice || '').toLowerCase();
            var pg = (o.partGrade || '').toLowerCase();
            return dp.indexOf('diagnostic') !== -1 || pg.indexOf('diagnostic') !== -1;
        });
        if (isDiagnosticOnly) return 'Quote on request';
        if (fixedPrices.length > 0) {
            var min = Math.min.apply(null, fixedPrices.map(function(o) { return o.customerPriceGbp; }));
            return 'From \u00a3' + min;
        }
        var hasQuote = opts.some(function(o) { return o.priceType === 'quote'; });
        if (hasQuote) return 'Quote on request';
        return '';
    }

    function showRepairModal(repair) {
        var img = IM.getRepairImage(repair, state.category, state.brand);
        var icon = IM.getRepairIcon(repair);
        var displayName = CL.repairDisplayName(repair);
        var tooltip = CL.repairTooltip(repair);
        var opts = CL.options(state.category, state.brand, state.model, repair);
        var fixedPrices = opts.filter(function(o) { return o.priceType === 'fixed' && o.customerPriceGbp !== null; });
        var isDiagnosticOnly = fixedPrices.length > 0 && fixedPrices.every(function(o) {
            var dp = (o.displayPrice || '').toLowerCase();
            var pg = (o.partGrade || '').toLowerCase();
            return dp.indexOf('diagnostic') !== -1 || pg.indexOf('diagnostic') !== -1;
        });
        var priceLabel = '';
        var priceValue = '';
        var priceHint = '';

        if (isDiagnosticOnly) {
            priceLabel = '';
            priceValue = 'Quote on Request';
            priceHint = '';
        } else if (fixedPrices.length > 0) {
            var min = Math.min.apply(null, fixedPrices.map(function(o) { return o.customerPriceGbp; }));
            priceLabel = CL.isScreenRepair(repair) && fixedPrices.length > 1 ? 'Screen options from' : 'From';
            priceValue = '\u00a3' + min;
            priceHint = '';
        } else {
            priceLabel = '';
            priceValue = 'Quote on Request';
            priceHint = '';
        }

        var iconHtml = img
            ? '<img src="' + img + '" alt="" style="width:100%;height:100%;object-fit:contain">'
            : '<i class="fas ' + icon + '"></i>';

        var modelDisplay = CL.modelDisplayName(state.model);
        var fullTitle = modelDisplay ? modelDisplay + ' ' + displayName : displayName;

        var html = '<div class="quote-repair-modal-layout">' +
            '<h3 class="quote-repair-modal-title">' + fullTitle + '</h3>';
        if (tooltip) {
            html += '<div class="quote-repair-modal-desc">' + tooltip + '</div>';
        }
        html += '<div class="quote-repair-modal-body-wrap">' +
            '<div class="quote-repair-modal-body">' +
            '<div class="quote-repair-modal-info">' +
            (priceLabel ? '<div class="quote-repair-modal-price-label">' + priceLabel + '</div>' : '') +
            '<div class="quote-repair-modal-price">' + priceValue + '</div>' +
            (priceHint ? '<div class="quote-repair-modal-price-hint">' + priceHint + '</div>' : '');

        html += '</div>' +
            '<div class="quote-repair-modal-image">' + iconHtml + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="quote-repair-modal-actions">' +
            '<button type="button" class="quote-repair-modal-select" data-repair="' + repair + '">Select This Repair</button>' +
            '</div>' +
            '</div>';

        _savedScrollY = window.scrollY;
        el.repairModalContent.innerHTML = html;
        el.repairModal.classList.add('active');
        document.body.classList.add('quote-modal-open');
        document.documentElement.style.overflow = 'hidden';
        // Push history state so hardware back closes the modal
        window.history.pushState({ modalOpen: true }, '', '#modal');
        el.repairModalContent.querySelector('.quote-repair-modal-select').addEventListener('click', function() {
            closeRepairModalInstant();
            selectRepair(repair);
        });
        // Enable drag-down-to-dismiss from anywhere on the sheet
        var repairSheet = el.repairModal.querySelector('.quote-repair-modal-sheet');
        if (repairSheet) {
            attachDragToDismiss(repairSheet, closeRepairModal);
        }
    }

    // Drag-to-dismiss helper — attaches to the entire sheet so user can
    // pull down from anywhere (handle, title, cards, etc.) to close.
    // Ignores horizontal swipes (so swipe-left/right pagination still works)
    // and only drags when content is scrolled to the top.
    function attachDragToDismiss(sheetEl, dismissFn) {
        var startY = 0, startX = 0, currentY = 0, dragging = false, isHorizontal = false, hasMoved = false;
        var backdrop = null;
        var sheetHeight = 0;
        sheetEl.addEventListener('touchstart', function(e) {
            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
            currentY = startY;
            dragging = true;
            isHorizontal = false;
            hasMoved = false;
            var modal = sheetEl.closest('.quote-repair-modal');
            backdrop = modal ? modal.querySelector('.quote-repair-modal-backdrop') : null;
            sheetHeight = sheetEl.offsetHeight || 400;
        }, { passive: true });
        sheetEl.addEventListener('touchmove', function(e) {
            if (!dragging) return;
            currentY = e.touches[0].clientY;
            var currentX = e.touches[0].clientX;
            var deltaY = currentY - startY;
            var deltaX = currentX - startX;
            // Determine direction on first significant movement
            if (!hasMoved && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
                hasMoved = true;
                isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
            }
            if (isHorizontal) return; // Let swipe pagination handle it
            // Only drag down if content is scrolled to top
            var content = sheetEl.querySelector('.quote-repair-modal-content');
            var scrollTop = content ? content.scrollTop : 0;
            if (deltaY > 0 && scrollTop <= 0) {
                e.preventDefault();
                sheetEl.style.transition = 'none';
                sheetEl.style.transform = 'translate(-50%, ' + deltaY + 'px)';
                // Progressive: fade backdrop AND scale background back up proportionally
                var progress = Math.min(deltaY / sheetHeight, 1);
                if (backdrop) {
                    var opacity = 0.55 * (1 - progress);
                    backdrop.style.opacity = opacity;
                    backdrop.style.transition = 'none';
                }
                // Scale background from 0.96 back toward 1.0 as user drags
                var bgScale = 0.96 + (0.04 * progress);
                var bgEls = document.querySelectorAll('.quote-main');
                bgEls.forEach(function(el) {
                    el.style.transition = 'none';
                    el.style.transform = 'scale(' + bgScale + ')';
                });
            }
        }, { passive: false });
        sheetEl.addEventListener('touchend', function() {
            if (!dragging) return;
            dragging = false;
            if (!isHorizontal) {
                var delta = currentY - startY;
                if (delta > 80) {
                    // Remove body class to trigger background scale-back in sync
                    document.body.classList.remove('quote-modal-open');
                    if (backdrop) {
                        backdrop.style.opacity = '0';
                        backdrop.style.transition = 'opacity 0.5s ease';
                    }
                    sheetEl.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
                    sheetEl.style.transform = 'translate(-50%, 100vh)';
                    // Animate background back to scale(1) — clear inline transform with transition
                    var dismissEls = document.querySelectorAll('.quote-main');
                    dismissEls.forEach(function(el) {
                        el.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
                        el.style.transform = '';
                    });
                    setTimeout(function() {
                        sheetEl.style.transform = '';
                        sheetEl.style.transition = '';
                        if (backdrop) { backdrop.style.opacity = ''; backdrop.style.transition = ''; }
                        dismissEls.forEach(function(el) { el.style.transition = ''; el.style.transform = ''; });
                        dismissFn();
                    }, 500);
                    return;
                }
            }
            // Snap back with a smooth transition
            sheetEl.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            sheetEl.style.transform = '';
            if (backdrop) {
                backdrop.style.transition = 'opacity 0.3s ease';
                backdrop.style.opacity = '';
                setTimeout(function() { backdrop.style.transition = ''; }, 300);
            }
            // Snap background scale back to 0.96
            var snapEls = document.querySelectorAll('.quote-main');
            snapEls.forEach(function(el) {
                el.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
                el.style.transform = '';
            });
            setTimeout(function() {
                snapEls.forEach(function(el) { el.style.transition = ''; });
            }, 300);
            setTimeout(function() { sheetEl.style.transition = ''; }, 300);
        }, { passive: true });
    }

    function closeRepairModal() {
        var sheet = el.repairModal.querySelector('.quote-repair-modal-sheet');
        var backdrop = el.repairModal.querySelector('.quote-repair-modal-backdrop');
        // Animate sheet down and backdrop out
        if (sheet) {
            sheet.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
            sheet.style.transform = window.innerWidth >= 600
                ? 'translate(-50%, 50%) scale(0.92)'
                : 'translate(-50%, 100vh)';
            sheet.style.opacity = '0';
        }
        if (backdrop) {
            backdrop.style.transition = 'opacity 0.5s ease';
            backdrop.style.opacity = '0';
        }
        // Remove body class to trigger background scale-back in sync
        document.body.classList.remove('quote-modal-open');
        document.documentElement.style.overflow = '';
        // Clean up after animation
        setTimeout(function() {
            el.repairModal.classList.remove('active');
            if (sheet) { sheet.style.transition = ''; sheet.style.transform = ''; sheet.style.opacity = ''; }
            if (backdrop) { backdrop.style.transition = ''; backdrop.style.opacity = ''; }
            // Clear any inline styles on background elements from drag
            document.querySelectorAll('.quote-main').forEach(function(el) {
                el.style.transition = ''; el.style.transform = '';
            });
        }, 500);
    }

    // Instant close — no animation, used when navigating forward
    function closeRepairModalInstant() {
        el.repairModal.classList.remove('active');
        document.body.classList.remove('quote-modal-open');
        document.documentElement.style.overflow = '';
        var sheet = el.repairModal.querySelector('.quote-repair-modal-sheet');
        var backdrop = el.repairModal.querySelector('.quote-repair-modal-backdrop');
        if (sheet) { sheet.style.transition = ''; sheet.style.transform = ''; sheet.style.opacity = ''; }
        if (backdrop) { backdrop.style.transition = ''; backdrop.style.opacity = ''; }
        document.querySelectorAll('.quote-main').forEach(function(el) {
            el.style.transition = ''; el.style.transform = '';
        });
    }

    // Generic bottom sheet for series models, more repairs, etc.
    var _savedScrollY = 0;
    function showSheet(html) {
        _savedScrollY = window.scrollY;
        el.sheetContent.innerHTML = html;
        el.sheetModal.classList.add('active');
        document.body.classList.add('quote-modal-open');
        // Lock scroll on html too for iOS Safari
        document.documentElement.style.overflow = 'hidden';
        // Push history state so hardware back closes the sheet
        window.history.pushState({ sheetOpen: true }, '', '#sheet');
        // Auto-bind any .quote-sheet-close buttons so all callers get close for free
        var closeBtns = el.sheetContent.querySelectorAll('.quote-sheet-close');
        closeBtns.forEach(function(btn) {
            btn.addEventListener('click', closeSheet);
        });
        // Enable drag-down-to-dismiss from anywhere on the sheet
        var sheet = el.sheetModal.querySelector('.quote-repair-modal-sheet');
        if (sheet) {
            attachDragToDismiss(sheet, closeSheet);
        }
    }

    function closeSheet() {
        var sheet = el.sheetModal.querySelector('.quote-repair-modal-sheet');
        var backdrop = el.sheetModal.querySelector('.quote-repair-modal-backdrop');
        // Animate sheet down and backdrop out
        if (sheet) {
            sheet.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
            sheet.style.transform = window.innerWidth >= 600
                ? 'translate(-50%, 50%) scale(0.92)'
                : 'translate(-50%, 100vh)';
            sheet.style.opacity = '0';
        }
        if (backdrop) {
            backdrop.style.transition = 'opacity 0.5s ease';
            backdrop.style.opacity = '0';
        }
        // Remove body class to trigger background scale-back in sync
        document.body.classList.remove('quote-modal-open');
        document.documentElement.style.overflow = '';
        // Clean up after animation
        setTimeout(function() {
            el.sheetModal.classList.remove('active');
            if (sheet) { sheet.style.transition = ''; sheet.style.transform = ''; sheet.style.opacity = ''; }
            if (backdrop) { backdrop.style.transition = ''; backdrop.style.opacity = ''; }
            // Clear any inline styles on background elements from drag
            document.querySelectorAll('.quote-main').forEach(function(el) {
                el.style.transition = ''; el.style.transform = '';
            });
        }, 500);
        // Clear any stale search input and re-render if on model step
        if (el.globalSearchInput && el.globalSearchInput.value) {
            el.globalSearchInput.value = '';
            if (state.step === 3) renderModels();
        }
    }

    // Instant close — no animation, used when navigating forward
    function closeSheetInstant() {
        el.sheetModal.classList.remove('active');
        document.body.classList.remove('quote-modal-open');
        document.documentElement.style.overflow = '';
        // Clear all inline styles
        var sheet = el.sheetModal.querySelector('.quote-repair-modal-sheet');
        var backdrop = el.sheetModal.querySelector('.quote-repair-modal-backdrop');
        if (sheet) { sheet.style.transition = ''; sheet.style.transform = ''; sheet.style.opacity = ''; }
        if (backdrop) { backdrop.style.transition = ''; backdrop.style.opacity = ''; }
        document.querySelectorAll('.quote-main').forEach(function(el) {
            el.style.transition = ''; el.style.transform = '';
        });
        if (el.globalSearchInput && el.globalSearchInput.value) {
            el.globalSearchInput.value = '';
            if (state.step === 3) renderModels();
        }
    }

    function showResetConfirm() {
        var html = '<div class="quote-reset-confirm"><h3 class="quote-sheet-title">Start Again?</h3>';
        html += '<p class="quote-sheet-subtitle">Your selections will be cleared.</p>';
        html += '<div class="quote-confirm-actions">';
        html += '<button type="button" class="quote-confirm-yes" id="quote-reset-yes">Yes, Start Again</button>';
        html += '<button type="button" class="quote-sheet-close" id="quote-reset-no">Cancel</button>';
        html += '</div></div>';
        showSheet(html);
        var yesBtn = el.sheetContent.querySelector('#quote-reset-yes');
        var noBtn = el.sheetContent.querySelector('#quote-reset-no');
        if (yesBtn) yesBtn.addEventListener('click', function() {
            closeSheetInstant();
            resetQuote();
        });
        if (noBtn) noBtn.addEventListener('click', closeSheet);
    }

    var MODELS_PER_PAGE = 4;
    var _modelsPageState = { models: [], currentPage: 0, totalPages: 0, displayLabel: '' };

    // Slide-up sheet showing models within a series (e.g. iPhone 17 Series → all variants)
    function showModelSheet(seriesKey, displayLabel) {
        var models = CL.models(state.category, state.brand);
        var seriesModels = models.filter(function(m) {
            return extractSeriesKey(m) === seriesKey;
        });

        var totalPages = Math.max(1, Math.ceil(seriesModels.length / MODELS_PER_PAGE));
        _modelsPageState = { models: seriesModels, currentPage: 0, totalPages: totalPages, displayLabel: displayLabel, seriesKey: seriesKey };
        renderModelsSheetPage();
    }

    function renderModelsSheetPage() {
        var seriesModels = _modelsPageState.models;
        var page = _modelsPageState.currentPage;
        var totalPages = _modelsPageState.totalPages;
        var displayLabel = _modelsPageState.displayLabel;
        var seriesKey = _modelsPageState.seriesKey || '';
        var startIdx = page * MODELS_PER_PAGE;
        var endIdx = Math.min(startIdx + MODELS_PER_PAGE, seriesModels.length);
        var pageModels = seriesModels.slice(startIdx, endIdx);

        var brandImg = IM.getModelImage(state.category, state.brand);
        var modelIcon = IM.getModelIcon(state.category);

        var html = '<h3 class="quote-sheet-title">' + displayLabel + '</h3>';

        // Swipeable container — sizes to content, padded so all pages match
        html += '<div class="quote-sheet-swipe-wrap quote-sheet-swipe-wrap--models" id="models-swipe-wrap">';
        html += '<div class="quote-card-grid quote-card-grid--compact" id="models-sheet-grid">';
        pageModels.forEach(function(m) {
            var label = CL.modelDisplayName(m);
            var mImg = IM.getModelImage(state.category, state.brand, m) || brandImg;
            var iconHtml = mImg
                ? '<div class="quote-card-icon"><img src="' + mImg + '" alt="" loading="lazy"></div>'
                : '<div class="quote-card-icon"><i class="fas ' + modelIcon + '"></i></div>';
            html += '<div class="quote-card quote-card--compact" data-model="' + m + '">' +
                iconHtml +
                '<div class="quote-card-label">' + label + '</div>' +
                '</div>';
        });
        // Add "Not sure?" card on the last page if we have identification data
        var hasIdentify = page === totalPages - 1 && window.NFD_MODEL_IDENTIFY && seriesKey && window.NFD_MODEL_IDENTIFY[seriesKey];
        if (hasIdentify) {
            html += '<div class="quote-card quote-card--compact quote-card--identify" id="identify-trigger">' +
                '<div class="quote-card-icon"><i class="fas fa-circle-question"></i></div>' +
                '<div class="quote-card-label">Not sure which model?</div>' +
                '</div>';
            // Adjust padding: one fewer placeholder needed
            var placeholdersNeeded = MODELS_PER_PAGE - pageModels.length - 1;
            for (var p = 0; p < Math.max(0, placeholdersNeeded); p++) {
                html += '<div class="quote-card quote-card--compact" style="visibility:hidden"></div>';
            }
        } else {
            // Pad with invisible placeholders so every page has 4 items (same height)
            for (var p = pageModels.length; p < MODELS_PER_PAGE; p++) {
                html += '<div class="quote-card quote-card--compact" style="visibility:hidden"></div>';
            }
        }
        html += '</div>';
        html += '</div>';

        // Page indicators (dots) + nav buttons
        if (totalPages > 1) {
            html += '<div class="quote-sheet-page-dots" id="models-page-dots">';
            for (var i = 0; i < totalPages; i++) {
                html += '<span class="quote-sheet-page-dot' + (i === page ? ' active' : '') + '" data-page="' + i + '"></span>';
            }
            html += '</div>';
            html += '<div class="quote-sheet-nav-buttons">';
            html += '<button type="button" class="quote-sheet-nav-btn' + (page === 0 ? ' disabled' : '') + '" id="models-prev-btn"' + (page === 0 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
            html += '<button type="button" class="quote-sheet-nav-btn' + (page >= totalPages - 1 ? ' disabled' : '') + '" id="models-next-btn"' + (page >= totalPages - 1 ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
            html += '</div>';
        }

        showSheet(html);

        // Bind model selection within the sheet
        el.sheetContent.querySelectorAll('[data-model]').forEach(function(card) {
            card.addEventListener('click', function() {
                var model = this.dataset.model;
                closeSheetInstant();
                selectModel(model);
            });
        });

        // Bind "Not sure?" identify trigger
        var identifyTrigger = el.sheetContent.querySelector('#identify-trigger');
        if (identifyTrigger) {
            identifyTrigger.addEventListener('click', function() {
                renderIdentifyPanel(seriesKey, displayLabel);
            });
        }

        var closeBtn = el.sheetContent.querySelector('.quote-sheet-close');
        if (closeBtn) closeBtn.addEventListener('click', closeSheet);

        // Bind prev/next buttons
        var prevBtn = el.sheetContent.querySelector('#models-prev-btn');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (_modelsPageState.currentPage > 0) {
                    _modelsPageState.currentPage--;
                    renderModelsSheetPage();
                }
            });
        }
        var nextBtn = el.sheetContent.querySelector('#models-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (_modelsPageState.currentPage < _modelsPageState.totalPages - 1) {
                    _modelsPageState.currentPage++;
                    renderModelsSheetPage();
                }
            });
        }

        // Bind page dots
        el.sheetContent.querySelectorAll('#models-page-dots .quote-sheet-page-dot').forEach(function(dot) {
            dot.addEventListener('click', function() {
                _modelsPageState.currentPage = parseInt(this.dataset.page, 10);
                renderModelsSheetPage();
            });
        });

        // Swipe left/right handlers
        var swipeWrap = el.sheetContent.querySelector('#models-swipe-wrap');
        if (swipeWrap && totalPages > 1) {
            var startX = 0, startY = 0, swiping = false;
            swipeWrap.addEventListener('touchstart', function(e) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                swiping = true;
            }, { passive: true });
            swipeWrap.addEventListener('touchend', function(e) {
                if (!swiping) return;
                swiping = false;
                var endX = e.changedTouches[0].clientX;
                var endY = e.changedTouches[0].clientY;
                var deltaX = endX - startX;
                var deltaY = endY - startY;
                if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
                    if (deltaX < 0 && _modelsPageState.currentPage < _modelsPageState.totalPages - 1) {
                        _modelsPageState.currentPage++;
                        renderModelsSheetPage();
                    } else if (deltaX > 0 && _modelsPageState.currentPage > 0) {
                        _modelsPageState.currentPage--;
                        renderModelsSheetPage();
                    }
                }
            }, { passive: true });
        }
    }

    // Render the "Not sure which model?" identification panel inside the sheet
    function renderIdentifyPanel(seriesKey, displayLabel) {
        var data = window.NFD_MODEL_IDENTIFY && window.NFD_MODEL_IDENTIFY[seriesKey];
        if (!data) return;

        var html = '<h3 class="quote-sheet-title">Which ' + displayLabel.replace(' Series', '') + ' do I have?</h3>';
        html += '<div class="quote-identify-panel">';

        // Model identification cards
        data.models.forEach(function(m) {
            html += '<div class="quote-identify-model">';
            html += '<strong>' + m.name + '</strong>';
            html += '<span>' + m.desc + '</span>';
            html += '</div>';
        });

        // Settings tip
        html += '<div class="quote-identify-tip">';
        html += '<i class="fas fa-gear"></i>';
        html += '<p><strong>Quickest way:</strong> Go to <strong>' + data.settings + '</strong> on your device — it tells you the exact model name.</p>';
        html += '</div>';

        // Back button to return to model selection
        html += '<button type="button" class="quote-identify-back" id="identify-back-btn">';
        html += '<i class="fas fa-arrow-left"></i> Back to models';
        html += '</button>';

        html += '</div>';

        showSheet(html);

        var backBtn = el.sheetContent.querySelector('#identify-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                _modelsPageState.currentPage = 0;
                renderModelsSheetPage();
            });
        }
        var closeBtn = el.sheetContent.querySelector('.quote-sheet-close');
        if (closeBtn) closeBtn.addEventListener('click', closeSheet);
    }

    // Slide-up sheet showing additional repairs — swipeable pages (left/right)
    var REPAIRS_PER_PAGE = 4;
    var _repairsPageState = { repairs: [], currentPage: 0, totalPages: 0 };

    function showMoreRepairsSheet(otherRepairs) {
        // Sort by priority so most important repairs appear first
        var sorted = otherRepairs.slice().sort(function(a, b) {
            var aP = CL.repairPriority ? CL.repairPriority(a, state.category, state.brand, state.model) : 999;
            var bP = CL.repairPriority ? CL.repairPriority(b, state.category, state.brand, state.model) : 999;
            return aP - bP;
        });

        var totalPages = Math.max(1, Math.ceil(sorted.length / REPAIRS_PER_PAGE));
        _repairsPageState = { repairs: sorted, currentPage: 0, totalPages: totalPages };
        renderRepairsSheetPage();
    }

    function renderRepairsSheetPage() {
        var sorted = _repairsPageState.repairs;
        var page = _repairsPageState.currentPage;
        var totalPages = _repairsPageState.totalPages;
        var startIdx = page * REPAIRS_PER_PAGE;
        var endIdx = Math.min(startIdx + REPAIRS_PER_PAGE, sorted.length);
        var pageRepairs = sorted.slice(startIdx, endIdx);

        var html = '<h3 class="quote-sheet-title">More Repairs</h3>';

        // Swipeable container — sizes to content, padded so all pages match
        html += '<div class="quote-sheet-swipe-wrap quote-sheet-swipe-wrap--repairs" id="repairs-swipe-wrap">';
        html += '<div class="quote-card-grid quote-card-grid--compact" id="repairs-sheet-grid">';
        pageRepairs.forEach(function(r) {
            html += buildRepairCard(r, false);
        });
        // Pad with invisible placeholders so every page has 4 items (same height)
        var manualSlots = isMobile() ? 2 : 1;
        var itemsOnPage = pageRepairs.length;
        if (page >= totalPages - 1) itemsOnPage += manualSlots;
        for (var p = itemsOnPage; p < REPAIRS_PER_PAGE; p++) {
            html += '<div class="quote-card quote-card--compact" style="visibility:hidden"></div>';
        }
        // "Can't see your issue?" as the last card — dark, text only, no icon
        if (page >= totalPages - 1) {
            html += '<div class="quote-card quote-card--compact quote-card--manual" id="quote-repair-manual" style="cursor:pointer">' +
                '<div class="quote-card-label">Can\'t see your issue?</div>' +
                '</div>';
        }
        html += '</div>';
        html += '</div>';

        // Page indicators (dots) + nav buttons
        if (totalPages > 1) {
            html += '<div class="quote-sheet-page-dots" id="repairs-page-dots">';
            for (var i = 0; i < totalPages; i++) {
                html += '<span class="quote-sheet-page-dot' + (i === page ? ' active' : '') + '" data-page="' + i + '"></span>';
            }
            html += '</div>';
            html += '<div class="quote-sheet-nav-buttons">';
            html += '<button type="button" class="quote-sheet-nav-btn' + (page === 0 ? ' disabled' : '') + '" id="repairs-prev-btn"' + (page === 0 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
            html += '<button type="button" class="quote-sheet-nav-btn' + (page >= totalPages - 1 ? ' disabled' : '') + '" id="repairs-next-btn"' + (page >= totalPages - 1 ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
            html += '</div>';
        }

        showSheet(html);

        // Bind repair card clicks
        el.sheetContent.querySelectorAll('[data-id]').forEach(function(card) {
            card.addEventListener('click', function(e) {
                e.stopPropagation();
                var repair = this.dataset.id;
                closeSheetInstant();
                showRepairModal(repair);
            });
        });

        // Bind "Can't see your issue?" card
        var manualCard = el.sheetContent.querySelector('#quote-repair-manual');
        if (manualCard) {
            manualCard.addEventListener('click', function() {
                closeSheetInstant();
                state.repair = 'Issue not listed';
                selectRepair('Issue not listed');
            });
        }

        // Bind prev/next buttons
        var prevBtn = el.sheetContent.querySelector('#repairs-prev-btn');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (_repairsPageState.currentPage > 0) {
                    _repairsPageState.currentPage--;
                    renderRepairsSheetPage();
                }
            });
        }
        var nextBtn = el.sheetContent.querySelector('#repairs-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (_repairsPageState.currentPage < _repairsPageState.totalPages - 1) {
                    _repairsPageState.currentPage++;
                    renderRepairsSheetPage();
                }
            });
        }

        // Bind page dots
        el.sheetContent.querySelectorAll('.quote-sheet-page-dot').forEach(function(dot) {
            dot.addEventListener('click', function() {
                _repairsPageState.currentPage = parseInt(this.dataset.page, 10);
                renderRepairsSheetPage();
            });
        });

        // Swipe left/right handlers on the swipe container
        var swipeWrap = el.sheetContent.querySelector('#repairs-swipe-wrap');
        if (swipeWrap && totalPages > 1) {
            var startX = 0, startY = 0, swiping = false;
            swipeWrap.addEventListener('touchstart', function(e) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                swiping = true;
            }, { passive: true });
            swipeWrap.addEventListener('touchend', function(e) {
                if (!swiping) return;
                swiping = false;
                var endX = e.changedTouches[0].clientX;
                var endY = e.changedTouches[0].clientY;
                var deltaX = endX - startX;
                var deltaY = endY - startY;
                // Only trigger on horizontal swipes (not vertical scroll)
                if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
                    if (deltaX < 0 && _repairsPageState.currentPage < _repairsPageState.totalPages - 1) {
                        _repairsPageState.currentPage++;
                        renderRepairsSheetPage();
                    } else if (deltaX > 0 && _repairsPageState.currentPage > 0) {
                        _repairsPageState.currentPage--;
                        renderRepairsSheetPage();
                    }
                }
            }, { passive: true });
        }

    }

    function selectRepair(repair) {
        state.repair = repair;
        state.additionalRepairs = [];
        state._quoteRevealed = false;

        // Check if this is a personalized/manual quote (no fixed price to show)
        var personalized = isPersonalized();
        var isManual = repair === 'Manual quote request';
        var isIssueNotListed = repair === 'Issue not listed';

        if (personalized || isManual || isIssueNotListed) {
            // These repairs have no fixed price — show the issue description form
            // (customer details collected only when they submit)
            renderPersonalizedQuoteForm();
        } else {
            // Fixed-price repair — show the full quote immediately (no form needed)
            revealFullQuote();
        }

        goToStep(5);
    }

    window.NFD_QUOTE_STATE = state;

    // Step 5 Phase A: Quote Summary + Form
    function getRepairOptions() {
        return CL.options(state.category, state.brand, state.model, state.repair);
    }

    function getStartingPrice() {
        var opts = getRepairOptions();
        var fixed = opts.filter(function(o) { return o.priceType === 'fixed' && o.customerPriceGbp !== null; });
        if (fixed.length === 0) return null;
        var isDiagnosticOnly = fixed.every(function(o) {
            var dp = (o.displayPrice || '').toLowerCase();
            var pg = (o.partGrade || '').toLowerCase();
            return dp.indexOf('diagnostic') !== -1 || pg.indexOf('diagnostic') !== -1;
        });
        if (isDiagnosticOnly) return null;
        return Math.min.apply(null, fixed.map(function(o) { return o.customerPriceGbp; }));
    }

    function isPersonalized() {
        var opts = getRepairOptions();
        var fixed = opts.filter(function(o) { return o.priceType === 'fixed' && o.customerPriceGbp !== null; });
        if (fixed.length === 0) return true;
        var isDiagnosticOnly = fixed.every(function(o) {
            var dp = (o.displayPrice || '').toLowerCase();
            var pg = (o.partGrade || '').toLowerCase();
            return dp.indexOf('diagnostic') !== -1 || pg.indexOf('diagnostic') !== -1;
        });
        return isDiagnosticOnly;
    }

    function renderUpsellSection() {
        // Use smart upsells — top 3 repairs that pair well with the selected one
        var topUpsells = CL.getTopUpsells(state.category, state.brand, state.model, state.repair, state.additionalRepairs, 3);
        if (!topUpsells || topUpsells.length === 0) return '';

        // Icon mapping for repair types
        var iconFor = function(repairName) {
            var lower = (repairName || '').toLowerCase();
            if (lower.indexOf('battery') !== -1) return 'fa-battery-half';
            if (lower.indexOf('screen') !== -1 || lower.indexOf('display') !== -1) return 'fa-mobile-screen';
            if (lower.indexOf('charging') !== -1) return 'fa-plug';
            if (lower.indexOf('back') !== -1) return 'fa-mobile';
            if (lower.indexOf('camera') !== -1) return 'fa-camera';
            if (lower.indexOf('speaker') !== -1) return 'fa-volume-high';
            if (lower.indexOf('microphone') !== -1) return 'fa-microphone';
            if (lower.indexOf('port') !== -1) return 'fa-plug';
            if (lower.indexOf('button') !== -1) return 'fa-circle-dot';
            if (lower.indexOf('hinge') !== -1) return 'fa-link';
            if (lower.indexOf('keyboard') !== -1) return 'fa-keyboard';
            if (lower.indexOf('trackpad') !== -1) return 'fa-hand-pointer';
            if (lower.indexOf('fan') !== -1 || lower.indexOf('cooling') !== -1) return 'fa-fan';
            if (lower.indexOf('drive') !== -1) return 'fa-compact-disc';
            if (lower.indexOf('joystick') !== -1 || lower.indexOf('stick') !== -1) return 'fa-gamepad';
            if (lower.indexOf('hdmi') !== -1) return 'fa-plug';
            if (lower.indexOf('data') !== -1) return 'fa-database';
            if (lower.indexOf('ssd') !== -1 || lower.indexOf('storage') !== -1) return 'fa-hard-drive';
            if (lower.indexOf('software') !== -1) return 'fa-code';
            if (lower.indexOf('diagnostic') !== -1 || lower.indexOf('inspection') !== -1) return 'fa-magnifying-glass';
            return 'fa-screwdriver-wrench';
        };

        var html = '<details class="quote-upsell"' + (state.additionalRepairs.length ? ' open' : '') + '>' +
            '<summary class="quote-upsell-title" style="cursor:pointer;">Optional: add another repair to this device</summary>' +
            '<div class="quote-upsell-desc">Get 25% off any second repair on the same device when booked together.</div>' +
            '<div class="quote-upsell-list">';

        topUpsells.forEach(function(item) {
            // Check if already added
            var isAdded = state.additionalRepairs.some(function(r) { return r.repair === item.repair; });
            var checkedAttr = isAdded ? ' checked' : '';
            var priceHtml = item.hasDiscount
                ? '<span class="quote-upsell-price">\u00a3' + item.discountPrice + '</span><span class="quote-upsell-was">\u00a3' + item.originalPrice + '</span>'
                : '<span class="quote-upsell-price quote-upsell-price--nodiscount">\u00a3' + item.originalPrice + '</span>';
            var badge = item.hasDiscount ? '<span class="quote-upsell-badge">Save \u00a3' + item.saving + '</span>' : '';
            html += '<label class="quote-upsell-item' + (isAdded ? ' quote-upsell-item--added' : '') + '">' +
                '<input type="checkbox" class="quote-upsell-checkbox" data-repair="' + item.repair + '" data-price="' + item.discountPrice + '" data-display="' + item.displayName.replace(/"/g, '&quot;') + '"' + checkedAttr + '>' +
                '<div class="quote-upsell-item-content">' +
                '<div class="quote-upsell-item-name"><i class="fas ' + iconFor(item.repair) + '"></i> ' + item.displayName + '</div>' +
                '<div class="quote-upsell-item-pricing">' + priceHtml + ' ' + badge + '</div>' +
                '</div>' +
                '</label>';
        });

        html += '<button type="button" class="quote-upsell-add-more" id="upsell-add-more-btn">' +
            '<i class="fas fa-plus-circle"></i> Browse All Repairs' +
            '</button>';
        html += '</div></details>';
        return html;
    }

    /**
     * New Phase 1 flow — renders the personalized quote form (issue description only).
     * NO customer details collected here. Customer details are collected inline
     * only when the customer clicks "Get My Quote".
     */
    function renderPersonalizedQuoteForm() {
        var modelDisplay = CL.modelDisplayName(state.model);
        var repairDisplay = CL.repairDisplayName(state.repair);
        var preQuoteDeviceImg = IM.getModelImage(state.category, state.brand, state.model) || IM.getModelImage(state.category, state.brand);
        var preQuoteRepairImg = IM.getRepairImage(state.repair, state.category, state.brand);
        var preQuoteImg = preQuoteDeviceImg || preQuoteRepairImg;
        var preQuoteIcon = IM.getRepairIcon(state.repair);

        var isManual = state.repair === 'Manual quote request';
        var isIssueNotListed = state.repair === 'Issue not listed';

        // Track quote view (anonymous analytics)
        if (window.NFD_Analytics) {
            window.NFD_Analytics.trackReveal({
                quote_type: 'personalized',
                option_count: 0,
                starting_price: null,
                device_category: state.category,
                device_make: state.brand,
                device_model: state.model,
                repair_type: state.repair,
            });
        }

        var html = '<div class="quote-result-card">';

        if (isManual) {
            var preQuoteIconHtml = preQuoteImg
                ? '<img src="' + preQuoteImg + '" alt="">'
                : '<i class="fas ' + preQuoteIcon + '"></i>';
            html += '<div class="quote-pq-step-header">' +
                '<div class="quote-pq-step-icon">' +
                '<i class="fas fa-screwdriver-wrench"></i>' +
                '</div>' +
                '<h2>What needs fixing?</h2>' +
                '</div>';
            html += '<div class="quote-pq-info-box" style="margin-bottom:12px;">' +
                '<i class="fas fa-circle-info"></i>' +
                '<div>' +
                '<p>We repair <strong>phones, tablets, computers, consoles and small electronics</strong>. Our minimum diagnostic fee is <strong>&pound;40</strong> — if we can\u2019t fix it, you only pay the diagnostic.</p>' +
                '</div>' +
                '</div>';
            var knownType = state.category === 'Phones' ? 'Phone'
                : state.category === 'Tablets' ? 'Tablet'
                : state.category === 'Computers' ? 'Computer'
                : state.category === 'Gaming & Controllers' ? 'Console'
                : state.category === 'Wearables' ? 'Smartwatch' : 'Other';
            html += '<select id="manual-device-type" style="display:none"><option value="' + knownType + '" selected>' + knownType + '</option></select>';
            html += '<input type="hidden" id="manual-brand" value="">';
            html += '<input type="hidden" id="manual-model" value="">';
            html += '<input type="text" class="quote-pq-input" id="manual-search-input" placeholder="What is it? e.g. baby monitor, drone..." autocomplete="off">';
            html += '<div class="quote-manual-search-results" id="manual-search-results"></div>';
            html += '<textarea class="quote-pq-input quote-pq-textarea" id="issue-description" rows="3" placeholder="What\'s wrong with it? (required)"></textarea>';
        } else if (isIssueNotListed) {
            html += '<div class="quote-pq-step-header">' +
                '<div class="quote-pq-step-icon">' +
                (preQuoteImg ? '<img src="' + preQuoteImg + '" alt="">' : '<i class="fas fa-mobile-screen"></i>') +
                '</div>' +
                '<h2>' + modelDisplay + '</h2>' +
                '<p>What\'s the issue?</p>' +
                '</div>';
            var iType = state.category === 'Phones' ? 'Phone' : state.category === 'Tablets' ? 'Tablet' : state.category === 'Computers' ? 'Computer' : state.category === 'Gaming & Controllers' ? 'Console' : state.category === 'Wearables' ? 'Smartwatch' : 'Other';
            html += '<select id="manual-device-type" style="display:none"><option value="' + iType + '" selected></option></select>';
            html += '<input type="hidden" id="manual-brand" value="' + (state.brand || '') + '">';
            html += '<input type="hidden" id="manual-model" value="' + (state.model || '') + '">';
            html += '<textarea class="quote-pq-input quote-pq-textarea" id="issue-description" rows="3" placeholder="Describe what\'s wrong with it... (required)"></textarea>';
            html += '<div class="quote-pq-reset-row"><button type="button" id="quote-summary-reset-btn" class="quote-inline-link">Not the right device? Start again</button></div>';
        } else {
            // Personalized quote — repair selected but no fixed price available
            // The price for this repair changes frequently (genuine parts, market fluctuations)
            // so we need to get an up-to-date price and call them back
            html += '<div class="quote-pq-step-header">' +
                '<div class="quote-pq-step-icon">' +
                (preQuoteImg ? '<img src="' + preQuoteImg + '" alt="">' : '<i class="fas fa-wrench"></i>') +
                '</div>' +
                '<h2>' + modelDisplay + '</h2>' +
                '<p>' + repairDisplay + '</p>' +
                '</div>';
            html += '<div class="quote-pq-info-box">' +
                '<i class="fas fa-circle-info"></i>' +
                '<div>' +
                '<p><strong>Get an up-to-date price for this repair</strong></p>' +
                '<p>Part prices for this repair change frequently, so we\'ll check our current supplier pricing and get back to you with a quote — usually within an hour during working hours.</p>' +
                '</div>' +
                '</div>';
            var pType = state.category === 'Phones' ? 'Phone' : state.category === 'Tablets' ? 'Tablet' : state.category === 'Computers' ? 'Computer' : state.category === 'Gaming & Controllers' ? 'Console' : state.category === 'Wearables' ? 'Smartwatch' : 'Other';
            html += '<select id="manual-device-type" style="display:none"><option value="' + pType + '" selected></option></select>';
            html += '<input type="hidden" id="manual-brand" value="' + (state.brand || '') + '">';
            html += '<input type="hidden" id="manual-model" value="' + (state.model || '') + '">';
            html += '<textarea class="quote-pq-input quote-pq-textarea" id="issue-description" rows="2" placeholder="Any extra details about the damage? (optional)"></textarea>';
            html += '<div class="quote-pq-reset-row"><button type="button" id="quote-summary-reset-btn" class="quote-inline-link">Not the right device? Start again</button></div>';
        }

        // Submit button — collects customer details inline via a slide-up panel
        html += '<button type="button" class="quote-submit-btn" id="quote-submit-btn" data-action="submit-personalized">' +
            '<span class="btn-text"><i class="fas fa-paper-plane"></i> Get My Quote</span>' +
            '<span class="btn-loading" style="display:none;"><i class="fas fa-spinner fa-spin"></i> Sending...</span>' +
            '</button>';
        html += '<p class="quote-form-footer">No obligation.</p>';
        html += '</div>';

        el.resultArea.innerHTML = html;
        if (el.globalSearch) el.globalSearch.style.display = 'none';
        if (window.NFD_QUOTE_SUBMIT) window.NFD_QUOTE_SUBMIT.bindSubmit();

        // Bind manual search
        var manualSearchInput = document.getElementById('manual-search-input');
        var manualSearchResults = document.getElementById('manual-search-results');
        if (manualSearchInput && manualSearchResults) {
            var bannedKeywords = ['washing machine', 'washer', 'washing', 'fridge', 'freezer', 'dishwasher', 'oven', 'cooker', 'hob', 'tumble dryer', 'dryer', 'boiler', 'radiator', 'lawn mower', 'mower', 'vacuum', 'hoover', 'iron', 'toaster', 'toaster', 'kettle', 'microwave', 'television', 'tv', 'sewing machine', 'sewing', 'car', 'motorbike', 'motorcycle', 'bicycle', 'scooter', 'truck', 'van', 'lorry', 'tractor', 'power tool', 'drill', 'sander', 'generator', 'heater', 'fireplace', 'shower', 'toilet', 'plumb', 'roof', 'furniture', 'sofa', 'mattress', 'carpet', 'curtain', 'blind', 'radio', 'clock', 'watch', 'wristwatch', 'lamp', 'light', 'bulb', 'fan', 'extractor', 'range hood', 'cooktop', 'stove', 'grill', 'fryer', 'coffee machine', 'coffee maker', 'espresso', 'blender', 'mixer', 'food processor', 'slow cooker', 'pressure cooker', 'air fryer', 'bread maker', 'dehumidifier', 'humidifier', 'air conditioner', 'air con', 'evaporative cooler', 'patio heater', 'bbq', 'barbecue', 'garage door', 'gate', 'alarm', 'cctv', 'doorbell', 'lock', 'safe', 'exercise', 'treadmill', 'elliptical', 'bike trainer', 'rowing machine', 'weights', 'dumbbell', 'guitar', 'piano', 'keyboard', 'drum', 'amplifier', 'speaker', 'hi-fi', 'hifi', 'stereo', 'turntable', 'record player', 'camcorder', 'projector', 'camera', 'lens', 'tripod', 'binoculars', 'telescope', 'microscope', '3d printer', 'laser cutter', 'cnc', 'plotter', 'scanner', 'photocopier', 'printer ink', 'toner'];
            manualSearchInput.addEventListener('input', function() {
                var term = this.value.trim().toLowerCase();
                if (term.length < 2) {
                    manualSearchResults.innerHTML = '';
                    manualSearchResults.classList.remove('active');
                    return;
                }
                var banned = false;
                if (term.length >= 3) {
                    var termWords = term.split(/\s+/);
                    for (var w = 0; w < termWords.length; w++) {
                        if (bannedKeywords.indexOf(termWords[w]) !== -1) { banned = true; break; }
                    }
                }
                if (banned) {
                    manualSearchResults.innerHTML = '<div class="quote-pq-banned-msg"><i class="fas fa-circle-info"></i> Sorry, we don\'t repair that. We fix phones, tablets, computers, consoles and small electronics.</div>';
                    manualSearchResults.classList.add('active');
                    return;
                }
                var results = CL.searchAll(term);
                if (results.length === 0) {
                    manualSearchResults.innerHTML = '';
                    manualSearchResults.classList.remove('active');
                    return;
                }
                var rhtml = '';
                results.slice(0, 10).forEach(function(r) {
                    var icon = IM.getRepairIcon(r.repair);
                    var priceHint = r.priceType === 'fixed' && r.customerPriceGbp ? r.displayPrice : 'Quote';
                    rhtml += '<div class="quote-search-result" data-category="' + r.category + '" data-brand="' + r.brand + '" data-model="' + r.model + '" data-repair="' + r.repair + '">' +
                        '<div class="quote-search-result-icon"><i class="fas ' + icon + '"></i></div>' +
                        '<div class="quote-search-result-text">' +
                        '<div class="quote-search-result-model">' + CL.modelDisplayName(r.model) + '</div>' +
                        '<div class="quote-search-result-repair">' + CL.repairDisplayName(r.repair) + '</div>' +
                        '</div>' +
                        '<div class="quote-search-result-price">' + priceHint + '</div>' +
                        '</div>';
                });
                rhtml += '<div class="quote-pq-search-hint">We\'ve got that — tap to get your quote</div>';
                manualSearchResults.innerHTML = rhtml;
                manualSearchResults.classList.add('active');

                manualSearchResults.querySelectorAll('.quote-search-result[data-category]').forEach(function(result) {
                    result.addEventListener('click', function() {
                        state.category = this.dataset.category;
                        state.brand = this.dataset.brand;
                        state.model = this.dataset.model;
                        state.repair = this.dataset.repair;
                        state.expandedSeries = null;
                        selectRepair(this.dataset.repair);
                    });
                });
            });
        }

        // Bind reset button
        var resetBtn = document.getElementById('quote-summary-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                state.category = null;
                state.brand = null;
                state.model = null;
                state.repair = null;
                state.selectedOption = null;
                state.price = null;
                state.additionalRepairs = [];
                saveState();
                goToStep(1);
            });
        }
    }

    function renderQuoteSummary() {
        var startingPrice = getStartingPrice();
        var personalized = isPersonalized();

        // Analytics: track form start (user reached the details form)
        if (window.NFD_Analytics) {
            window.NFD_Analytics.trackFormStart();
        }

        var modelDisplay = CL.modelDisplayName(state.model);
        var repairDisplay = CL.repairDisplayName(state.repair);
        var categoryDisplay = state.category ? state.category.charAt(0).toUpperCase() + state.category.slice(1) : '';
        var brandDisplay = state.brand || '';

        var html = '<div class="quote-result-card">';

        var preQuoteDeviceImg = IM.getModelImage(state.category, state.brand, state.model) || IM.getModelImage(state.category, state.brand);
        var preQuoteRepairImg = IM.getRepairImage(state.repair, state.category, state.brand);
        var preQuoteImg = preQuoteDeviceImg || preQuoteRepairImg;
        var preQuoteIcon = IM.getRepairIcon(state.repair);

        if (personalized || state.repair === 'Manual quote request' || state.repair === 'Issue not listed') {
            var preQuoteIconHtml = preQuoteImg
                ? '<img src="' + preQuoteImg + '" alt="">'
                : '<i class="fas ' + preQuoteIcon + '"></i>';

            var isManual = state.repair === 'Manual quote request';
            var isIssueNotListed = state.repair === 'Issue not listed';

            if (isManual) {
                // ===== MANUAL QUOTE =====
                // For other repairs — things not in the catalogue
                // The input doubles as a search — if we have it, offer it

                // Simple header
                html += '<div class="quote-pq-step-header">' +
                    '<div class="quote-pq-step-icon">' +
                    '<i class="fas fa-screwdriver-wrench"></i>' +
                    '</div>' +
                    '<h2>What needs fixing?</h2>' +
                    '</div>';

                // Hidden device type
                var knownType = state.category === 'Phones' ? 'Phone'
                    : state.category === 'Tablets' ? 'Tablet'
                    : state.category === 'Computers' ? 'Computer'
                    : state.category === 'Gaming & Controllers' ? 'Console'
                    : state.category === 'Wearables' ? 'Smartwatch' : 'Other';
                html += '<select id="manual-device-type" style="display:none"><option value="' + knownType + '" selected>' + knownType + '</option></select>';
                html += '<input type="hidden" id="manual-brand" value="">';
                html += '<input type="hidden" id="manual-model" value="">';

                // What is it — doubles as search
                html += '<input type="text" class="quote-pq-input" id="manual-search-input" placeholder="What is it? e.g. baby monitor, drone..." autocomplete="off">';
                html += '<div class="quote-manual-search-results" id="manual-search-results"></div>';

                // What's wrong with it?
                html += '<textarea class="quote-pq-input quote-pq-textarea" id="issue-description" rows="3" placeholder="What\'s wrong with it?"></textarea>';

            } else if (isIssueNotListed) {
                // ===== ISSUE NOT LISTED =====
                // They picked a model but couldn't find their issue
                // We know the device — just ask what's wrong

                html += '<div class="quote-pq-step-header">' +
                    '<div class="quote-pq-step-icon">' +
                    (preQuoteImg ? '<img src="' + preQuoteImg + '" alt="">' : '<i class="fas fa-mobile-screen"></i>') +
                    '</div>' +
                    '<h2>' + modelDisplay + '</h2>' +
                    '<p>What\'s the issue?</p>' +
                    '</div>';

                // Hidden fields — we know these
                var iType = state.category === 'Phones' ? 'Phone' : state.category === 'Tablets' ? 'Tablet' : state.category === 'Computers' ? 'Computer' : state.category === 'Gaming & Controllers' ? 'Console' : state.category === 'Wearables' ? 'Smartwatch' : 'Other';
                html += '<select id="manual-device-type" style="display:none"><option value="' + iType + '" selected></option></select>';
                html += '<input type="hidden" id="manual-brand" value="' + (state.brand || '') + '">';
                html += '<input type="hidden" id="manual-model" value="' + (state.model || '') + '">';

                // Just one thing: describe the issue
                html += '<textarea class="quote-pq-input quote-pq-textarea" id="issue-description" rows="3" placeholder="Describe what\'s wrong with it..."></textarea>';

                // Reset
                html += '<div class="quote-pq-reset-row"><button type="button" id="quote-summary-reset-btn" class="quote-inline-link">Not the right device? Start again</button></div>';

            } else {
                // ===== PERSONALIZED QUOTE (repair selected, no fixed price) =====
                // We know everything — just ask what's wrong

                html += '<div class="quote-pq-step-header">' +
                    '<div class="quote-pq-step-icon">' +
                    (preQuoteImg ? '<img src="' + preQuoteImg + '" alt="">' : '<i class="fas fa-wrench"></i>') +
                    '</div>' +
                    '<h2>' + modelDisplay + '</h2>' +
                    '<p>' + repairDisplay + '</p>' +
                    '</div>';

                // Hidden fields
                var pType = state.category === 'Phones' ? 'Phone' : state.category === 'Tablets' ? 'Tablet' : state.category === 'Computers' ? 'Computer' : state.category === 'Gaming & Controllers' ? 'Console' : state.category === 'Wearables' ? 'Smartwatch' : 'Other';
                html += '<select id="manual-device-type" style="display:none"><option value="' + pType + '" selected></option></select>';
                html += '<input type="hidden" id="manual-brand" value="' + (state.brand || '') + '">';
                html += '<input type="hidden" id="manual-model" value="' + (state.model || '') + '">';

                // Just one thing: what's wrong
                html += '<textarea class="quote-pq-input quote-pq-textarea" id="issue-description" rows="3" placeholder="What\'s the problem?"></textarea>';

                // Reset
                html += '<div class="quote-pq-reset-row"><button type="button" id="quote-summary-reset-btn" class="quote-inline-link">Not the right device? Start again</button></div>';
            }
        } else {
            // Title at top — device name and repair name, both big, centered
            html += '<div class="quote-summary-title">' +
                '<div class="quote-summary-device">' + modelDisplay + '</div>' +
                '<div class="quote-summary-repair">' + repairDisplay + '</div>' +
                '</div>';

            // From + price on left, image on right — centered together like the modal
            if (startingPrice !== null) {
                var preQuoteIconHtml = preQuoteImg
                    ? '<img src="' + preQuoteImg + '" alt="">'
                    : '<i class="fas ' + preQuoteIcon + '"></i>';
                html += '<div class="quote-summary-body-wrap">' +
                    '<div class="quote-summary-body">' +
                    '<div class="quote-summary-price-info">' +
                    '<div class="quote-summary-price-label">' + (CL.isScreenRepair(state.repair) && getRepairOptions().filter(function(o) { return o.priceType === 'fixed' && o.customerPriceGbp !== null; }).length > 1 ? 'Screen options from' : 'From') + '</div>' +
                    '<div class="quote-summary-price">\u00a3' + startingPrice + '</div>' +
                    '</div>' +
                    '<div class="quote-summary-device-img">' + preQuoteIconHtml + '</div>' +
                    '</div>' +
                    '</div>';
            }

            // Teaser text in its own div below
            if (startingPrice !== null) {
                html += '<div class="quote-summary-teaser-wrap">Enter your details to see the full breakdown.</div>';
            }
        }

        // Multi-repair add-on section — moved to Phase B (post-quote), not here

        html += '<div class="quote-details-form">' +
            '<h3 class="quote-form-title">Your Details</h3>' +
            '<div class="quote-form-group" id="fg-name">' +
            '<label for="cust-name">Full Name <span class="required">*</span></label>' +
            '<input type="text" id="cust-name" placeholder="e.g. John Smith" autocomplete="name">' +
            '<span class="quote-form-error">Please enter your name</span>' +
            '</div>' +
            '<div class="quote-form-group" id="fg-phone">' +
            '<label for="cust-phone">Mobile Number <span class="required">*</span></label>' +
            '<input type="tel" id="cust-phone" placeholder="07123 456789" autocomplete="tel">' +
            '<span class="quote-form-error">Please enter a valid mobile number</span>' +
            '</div>' +
            '<div class="quote-form-group" id="fg-email">' +
            '<label for="cust-email">Email Address <span class="required">*</span></label>' +
            '<input type="email" id="cust-email" placeholder="your.email@example.com" autocomplete="email">' +
            '<span class="quote-form-hint">Just in case your text doesn\'t come through</span>' +
            '<span class="quote-form-error">Please enter a valid email</span>' +
            '</div>' +
            '<div class="quote-toggles">' +
            '<label class="quote-toggle">' +
            '<input type="checkbox" id="toggle-terms">' +
            '<span class="quote-toggle-label">I agree to the <a href="/terms-and-conditions/" target="_blank" rel="noopener">Terms &amp; Conditions</a> <span class="toggle-required">(required)</span></span>' +
            '</label>' +
            '<label class="quote-toggle">' +
            '<input type="checkbox" id="toggle-marketing">' +
            '<span class="quote-toggle-label"><strong>Yes! Send me exclusive repair deals &amp; money-saving tips</strong><br><span style="font-size:0.85em;color:#666;">Be first to hear about price drops, seasonal offers, and free repair tips. Max 1–2 messages a month — unsubscribe anytime.</span></span>' +
            '</label>' +
            '</div>';

        if (personalized || state.repair === 'Issue not listed') {
            html += '<button type="button" class="quote-submit-btn" id="quote-submit-btn" data-action="submit-personalized">' +
                '<span class="btn-text"><i class="fas fa-paper-plane"></i> Get My Quote</span>' +
                '<span class="btn-loading" style="display:none;"><i class="fas fa-spinner fa-spin"></i> Sending...</span>' +
                '</button>';
        } else {
            html += '<button type="button" class="quote-submit-btn" id="quote-submit-btn" data-action="reveal-quote">' +
                '<span class="btn-text"><i class="fas fa-arrow-right"></i> Get My Quote</span>' +
                '<span class="btn-loading" style="display:none;"><i class="fas fa-spinner fa-spin"></i> Loading...</span>' +
                '</button>';
        }

        // Save for Later link (only for real repairs, not manual/issue-not-listed)
        if (state.repair !== 'Manual quote request' && state.repair !== 'Issue not listed') {
            html += '<div style="text-align:center;margin-top:0.75rem;">' +
                '<button type="button" id="quote-summary-save-btn" style="background:none;border:none;color:#009B4D;cursor:pointer;font-size:0.88rem;font-weight:600;">' +
                '<i class="fas fa-bookmark"></i> Save this quote for later</button>' +
                '</div>';
        }

        if (personalized || state.repair === 'Manual quote request' || state.repair === 'Issue not listed') {
            html += '<p class="quote-form-footer">No obligation.</p>' +
                '</div></div>';
        } else {
            html += '<p class="quote-form-footer">No obligation. No deposit until everything\'s confirmed.</p>' +
                '</div></div>';
        }

        el.resultArea.innerHTML = html;
        if (el.globalSearch) el.globalSearch.style.display = 'none';
        if (window.NFD_QUOTE_SUBMIT) window.NFD_QUOTE_SUBMIT.bindSubmit();

        // Bind "Save this quote for later" button
        var saveBtn = document.getElementById('quote-summary-save-btn');
        if (saveBtn && window.NFD_SavedQuotes) {
            saveBtn.addEventListener('click', function() {
                if (window.NFD_SavedQuotes.saveCurrent(state)) {
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved! View in My Saved Quotes';
                    saveBtn.disabled = true;
                    saveBtn.style.opacity = '0.6';
                }
            });
        }

        // Bind manual search — input doubles as device search
        var manualSearchInput = document.getElementById('manual-search-input');
        var manualSearchResults = document.getElementById('manual-search-results');
        if (manualSearchInput && manualSearchResults) {
            var bannedKeywords = ['washing machine', 'washer', 'washing', 'fridge', 'freezer', 'dishwasher', 'oven', 'cooker', 'hob', 'tumble dryer', 'dryer', 'boiler', 'radiator', 'lawn mower', 'mower', 'vacuum', 'hoover', 'iron', 'toaster', 'toaster', 'kettle', 'microwave', 'television', 'tv', 'sewing machine', 'sewing', 'car', 'motorbike', 'motorcycle', 'bicycle', 'scooter', 'truck', 'van', 'lorry', 'tractor', 'power tool', 'drill', 'sander', 'generator', 'heater', 'fireplace', 'shower', 'toilet', 'plumb', 'roof', 'furniture', 'sofa', 'mattress', 'carpet', 'curtain', 'blind', 'radio', 'clock', 'watch', 'wristwatch', 'lamp', 'light', 'bulb', 'fan', 'extractor', 'range hood', 'cooktop', 'stove', 'grill', 'fryer', 'coffee machine', 'coffee maker', 'espresso', 'blender', 'mixer', 'food processor', 'slow cooker', 'pressure cooker', 'air fryer', 'bread maker', 'dehumidifier', 'humidifier', 'air conditioner', 'air con', 'evaporative cooler', 'patio heater', 'bbq', 'barbecue', 'garage door', 'gate', 'alarm', 'cctv', 'doorbell', 'lock', 'safe', 'exercise', 'treadmill', 'elliptical', 'bike trainer', 'rowing machine', 'weights', 'dumbbell', 'guitar', 'piano', 'keyboard', 'drum', 'amplifier', 'speaker', 'hi-fi', 'hifi', 'stereo', 'turntable', 'record player', 'camcorder', 'projector', 'camera', 'lens', 'tripod', 'binoculars', 'telescope', 'microscope', '3d printer', 'laser cutter', 'cnc', 'plotter', 'scanner', 'photocopier', 'printer ink', 'toner'];
            manualSearchInput.addEventListener('input', function() {
                var term = this.value.trim().toLowerCase();
                if (term.length < 2) {
                    manualSearchResults.innerHTML = '';
                    manualSearchResults.classList.remove('active');
                    return;
                }

                // Check banned keywords — match on partial words (3+ chars)
                var banned = false;
                var bannedWord = '';
                if (term.length >= 3) {
                    var termWords = term.split(/\s+/);
                    for (var w = 0; w < termWords.length; w++) {
                        var tw = termWords[w];
                        if (tw.length < 3) continue;
                        for (var i = 0; i < bannedKeywords.length; i++) {
                            var bk = bannedKeywords[i];
                            if (bk.indexOf(tw) === 0 || tw.indexOf(bk) === 0) {
                                banned = true;
                                bannedWord = bk;
                                break;
                            }
                        }
                        if (banned) break;
                    }
                }
                if (banned) {
                    // Pluralise nicely — skip words that are already plural or don't need s
                    var noPlural = ['washing machine', 'tumble dryer', 'lawn mower', 'sewing machine', 'power tool', 'washing', 'sewing', 'plumb', 'roof'];
                    var displayWord = bannedWord;
                    if (noPlural.indexOf(bannedWord) === -1) {
                        if (bannedWord.slice(-1) === 'y' && bannedWord.slice(-2) !== 'ey') {
                            displayWord = bannedWord.slice(0, -1) + 'ies';
                        } else if (bannedWord.slice(-1) === 's' || bannedWord.slice(-2) === 'ch' || bannedWord.slice(-2) === 'sh') {
                            displayWord = bannedWord + 'es';
                        } else {
                            displayWord = bannedWord + 's';
                        }
                    }
                    manualSearchResults.innerHTML = '<div class="quote-pq-banned-msg"><i class="fas fa-circle-info"></i> Sorry, we don\'t repair ' + displayWord + '. We fix phones, tablets, computers, consoles and small electronics.</div>';
                    manualSearchResults.classList.add('active');
                    return;
                }

                var results = CL.searchAll(term);
                if (results.length === 0) {
                    manualSearchResults.innerHTML = '';
                    manualSearchResults.classList.remove('active');
                    return;
                }
                var rhtml = '';
                results.slice(0, 10).forEach(function(r) {
                    var icon = IM.getRepairIcon(r.repair);
                    var priceHint = r.priceType === 'fixed' && r.customerPriceGbp ? r.displayPrice : 'Quote';
                    rhtml += '<div class="quote-search-result" data-category="' + r.category + '" data-brand="' + r.brand + '" data-model="' + r.model + '" data-repair="' + r.repair + '">' +
                        '<div class="quote-search-result-icon"><i class="fas ' + icon + '"></i></div>' +
                        '<div class="quote-search-result-text">' +
                        '<div class="quote-search-result-model">' + CL.modelDisplayName(r.model) + '</div>' +
                        '<div class="quote-search-result-repair">' + CL.repairDisplayName(r.repair) + '</div>' +
                        '</div>' +
                        '<div class="quote-search-result-price">' + priceHint + '</div>' +
                        '</div>';
                });
                rhtml += '<div class="quote-pq-search-hint">We\'ve got that — tap to get your quote</div>';
                manualSearchResults.innerHTML = rhtml;
                manualSearchResults.classList.add('active');

                manualSearchResults.querySelectorAll('.quote-search-result[data-category]').forEach(function(result) {
                    result.addEventListener('click', function() {
                        state.category = this.dataset.category;
                        state.brand = this.dataset.brand;
                        state.model = this.dataset.model;
                        state.repair = this.dataset.repair;
                        state.expandedSeries = null;
                        selectRepair(this.dataset.repair);
                    });
                });
            });
        }

        var resetBtn = document.getElementById('quote-summary-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                state.category = null;
                state.brand = null;
                state.model = null;
                state.repair = null;
                state.additionalRepairs = [];
                state.showAllModels = false;
                state.expandedSeries = null;
                state.quoteType = null;
                goToStep(1);
            });
        }
    }

    function bindUpsellToggles() {
        var checkboxes = document.querySelectorAll('.quote-upsell-checkbox');
        var totalEl = document.getElementById('upsell-total');
        var totalValueEl = document.getElementById('upsell-total-value');
        var totalSavingEl = document.getElementById('upsell-total-saving');

        // Bind "Add another repair" button — opens slide-up modal
        var addMoreBtn = document.getElementById('upsell-add-more-btn');
        if (addMoreBtn) {
            addMoreBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                showAddRepairPicker();
            });
        }

        if (!checkboxes.length) return;
        checkboxes.forEach(function (cb) {
            cb.addEventListener('change', function () {
                // Analytics: track addon added
                if (window.NFD_Analytics && cb.checked) {
                    window.NFD_Analytics.trackAddonAdded(cb.dataset.repair, parseInt(cb.dataset.price, 10));
                }
                updateUpsellTotal();
            });
        });
    }

    function updateUpsellTotal() {
        var checkboxes = document.querySelectorAll('.quote-upsell-checkbox');
        state.additionalRepairs = [];
        var total = 0;
        var totalSaving = 0;
        checkboxes.forEach(function (c) {
            if (c.checked) {
                var repair = c.dataset.repair;
                var price = parseInt(c.dataset.price, 10);
                var display = c.dataset.display;
                var addOns = CL.getAdditionalRepairs(state.category, state.brand, state.model, state.repair);
                var match = addOns.find(function (a) { return a.repair === repair; });
                var original = match ? match.originalPrice : price;
                total += price;
                totalSaving += (original - price);
                state.additionalRepairs.push({ repair: repair, displayName: display, price: price });
            }
        });

        // Update the quote total summary on the full quote page if it exists
        var totalSummary = document.getElementById('quote-total-summary');
        if (totalSummary && state.price) {
            totalSummary.innerHTML = renderSelectedOptionPriceSummary();
        }
    }

    var _addRepairPageState = { addOns: [], currentPage: 0, totalPages: 0 };
    var ADD_REPAIRS_PER_PAGE = 4;

    function showAddRepairPicker() {
        var addOns = CL.getAdditionalRepairs(state.category, state.brand, state.model, state.repair);
        if (!addOns.length) return;

        var totalPages = Math.max(1, Math.ceil(addOns.length / ADD_REPAIRS_PER_PAGE));
        _addRepairPageState = { addOns: addOns, currentPage: 0, totalPages: totalPages };
        renderAddRepairSheetPage();
    }

    function renderAddRepairSheetPage() {
        var addOns = _addRepairPageState.addOns;
        var page = _addRepairPageState.currentPage;
        var totalPages = _addRepairPageState.totalPages;
        var startIdx = page * ADD_REPAIRS_PER_PAGE;
        var endIdx = Math.min(startIdx + ADD_REPAIRS_PER_PAGE, addOns.length);
        var pageItems = addOns.slice(startIdx, endIdx);

        var html = '<h3 class="quote-sheet-title">Add Another Repair</h3>';
        html += '<p class="quote-sheet-subtitle">Same device — 25% off any second repair</p>';
        html += '<div class="quote-sheet-swipe-wrap quote-sheet-swipe-wrap--repairs" id="add-repair-swipe-wrap">';
        html += '<div class="quote-card-grid quote-card-grid--compact" id="add-repair-sheet-grid">';

        pageItems.forEach(function(item) {
            var priceLabel = item.hasDiscount
                ? '\u00a3' + item.discountPrice
                : '\u00a3' + item.originalPrice;
            var img = IM.getRepairImage(item.repair, state.category, state.brand);
            var icon = IM.getRepairIcon(item.repair);
            var iconHtml = img
                ? '<img src="' + img + '" alt="">'
                : '<i class="fas ' + icon + '"></i>';
            var isSelected = state.additionalRepairs && state.additionalRepairs.some(function(r) { return r.repair === item.repair; });
            html += '<div class="quote-card quote-card--compact' + (isSelected ? ' quote-card--selected' : '') + '" data-repair="' + item.repair + '" data-price="' + item.discountPrice + '" data-display="' + item.displayName.replace(/"/g, '&quot;') + '">' +
                renderCardIcon(img, icon) +
                '<div class="quote-card-label">' + item.displayName + '</div>' +
                '<div class="quote-card-hint">' + (item.hasDiscount ? '<span style="text-decoration:line-through;color:#999;">\u00a3' + item.originalPrice + '</span> \u00a3' + item.discountPrice : '\u00a3' + item.originalPrice) + '</div>' +
                '</div>';
        });
        // Pad with invisible placeholders so every page has 4 items (same height)
        var itemsOnPage = pageItems.length;
        for (var p = itemsOnPage; p < ADD_REPAIRS_PER_PAGE; p++) {
            html += '<div class="quote-card quote-card--compact" style="visibility:hidden"></div>';
        }
        html += '</div>';
        html += '</div>';

        // Page indicators (dots) + nav buttons
        if (totalPages > 1) {
            html += '<div class="quote-sheet-page-dots" id="add-repair-page-dots">';
            for (var i = 0; i < totalPages; i++) {
                html += '<span class="quote-sheet-page-dot' + (i === page ? ' active' : '') + '" data-page="' + i + '"></span>';
            }
            html += '</div>';
            html += '<div class="quote-sheet-nav-buttons">';
            html += '<button type="button" class="quote-sheet-nav-btn' + (page === 0 ? ' disabled' : '') + '" id="add-repair-prev-btn"' + (page === 0 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
            html += '<button type="button" class="quote-sheet-nav-btn' + (page >= totalPages - 1 ? ' disabled' : '') + '" id="add-repair-next-btn"' + (page >= totalPages - 1 ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
            html += '</div>';
        }

        showSheet(html);

        // Bind repair card clicks
        el.sheetContent.querySelectorAll('[data-repair]').forEach(function(card) {
            card.addEventListener('click', function() {
                var repair = this.dataset.repair;
                var price = parseInt(this.dataset.price, 10);
                var display = this.dataset.display;

                // Check if already selected — toggle off
                var existing = state.additionalRepairs.find(function(r) { return r.repair === repair; });
                if (existing) {
                    state.additionalRepairs = state.additionalRepairs.filter(function(r) { return r.repair !== repair; });
                    // Uncheck battery checkbox if it exists
                    var batteryCb = document.querySelector('.quote-upsell-checkbox[data-repair="' + repair + '"]');
                    if (batteryCb) batteryCb.checked = false;
                    closeSheetInstant();
                    updateUpsellTotal();
                    return;
                }

                // Add to additional repairs
                if (!state.additionalRepairs) state.additionalRepairs = [];
                state.additionalRepairs.push({ repair: repair, displayName: display, price: price });

                // Also check the battery checkbox if it's battery
                var batteryCb = document.querySelector('.quote-upsell-checkbox[data-repair="' + repair + '"]');
                if (batteryCb) {
                    batteryCb.checked = true;
                } else {
                    // Add a hidden checkbox for this repair so updateUpsellTotal picks it up
                    var hiddenCb = document.createElement('input');
                    hiddenCb.type = 'checkbox';
                    hiddenCb.className = 'quote-upsell-checkbox';
                    hiddenCb.dataset.repair = repair;
                    hiddenCb.dataset.price = price;
                    hiddenCb.dataset.display = display;
                    hiddenCb.checked = true;
                    hiddenCb.style.display = 'none';
                    var upsellList = document.querySelector('.quote-upsell-list');
                    if (upsellList) upsellList.appendChild(hiddenCb);
                }

                // Analytics
                if (window.NFD_Analytics) {
                    window.NFD_Analytics.trackAddonAdded(repair, price);
                }

                closeSheetInstant();
                updateUpsellTotal();
            });
        });

        // Bind prev/next buttons
        var prevBtn = el.sheetContent.querySelector('#add-repair-prev-btn');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (_addRepairPageState.currentPage > 0) {
                    _addRepairPageState.currentPage--;
                    renderAddRepairSheetPage();
                }
            });
        }
        var nextBtn = el.sheetContent.querySelector('#add-repair-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (_addRepairPageState.currentPage < _addRepairPageState.totalPages - 1) {
                    _addRepairPageState.currentPage++;
                    renderAddRepairSheetPage();
                }
            });
        }

        // Bind page dots
        el.sheetContent.querySelectorAll('.quote-sheet-page-dot').forEach(function(dot) {
            dot.addEventListener('click', function() {
                _addRepairPageState.currentPage = parseInt(this.dataset.page, 10);
                renderAddRepairSheetPage();
            });
        });

        // Swipe left/right handlers
        var swipeWrap = el.sheetContent.querySelector('#add-repair-swipe-wrap');
        if (swipeWrap && totalPages > 1) {
            var startX = 0, startY = 0, swiping = false;
            swipeWrap.addEventListener('touchstart', function(e) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                swiping = true;
            }, { passive: true });
            swipeWrap.addEventListener('touchend', function(e) {
                if (!swiping) return;
                swiping = false;
                var endX = e.changedTouches[0].clientX;
                var endY = e.changedTouches[0].clientY;
                var deltaX = endX - startX;
                var deltaY = endY - startY;
                if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
                    if (deltaX < 0 && _addRepairPageState.currentPage < _addRepairPageState.totalPages - 1) {
                        _addRepairPageState.currentPage++;
                        renderAddRepairSheetPage();
                    } else if (deltaX > 0 && _addRepairPageState.currentPage > 0) {
                        _addRepairPageState.currentPage--;
                        renderAddRepairSheetPage();
                    }
                }
            }, { passive: true });
        }
    }

    function renderAdditionalRepairsSummary() {
        if (!state.additionalRepairs || state.additionalRepairs.length === 0) return '';
        var addTotal = state.additionalRepairs.reduce(function(s, r) { return s + r.price; }, 0);
        var mainPrice = state.price || 0;
        var grandTotal = mainPrice + addTotal;
        var html = '<div class="quote-additional-repairs">' +
            '<div class="quote-additional-repairs-grand-total">' +
            '<span>Total cost:</span>' +
            '<span>\u00a3' + grandTotal + '</span>' +
            '</div></div>';
        return html;
    }

    function renderQuotePaymentOptions() {
        return '<div class="quote-payment-options" style="margin:12px 0;padding:12px 14px;border-radius:10px;background:#f5f7f6;color:#34483b;font-size:14px;line-height:1.6">' +
            '<span style="display:inline-block;background:#ffb3c7;color:#171717;padding:2px 9px;border-radius:5px;font-weight:600">Pay with Klarna</span>' +
            ' <span>· Card · Cash on collection</span>' +
            '<div style="margin-top:5px">No payment needed now. We confirm parts first; Klarna is offered on eligible full payments at checkout.</div>' +
            '</div>';
    }

    function renderSelectedOptionPriceSummary() {
        var selectedLabel = state.partOption || 'Selected repair option';
        if (!state.price) {
            if (state.quoteType === 'personalized' && state.partOption) {
                return '<div class="quote-selected-option-summary">' +
                    '<div class="quote-selected-option-kicker">Your selection</div>' +
                    '<div class="quote-selected-option-row">' +
                    '<div class="quote-selected-option-name">' + selectedLabel + '</div>' +
                    '<div class="quote-selected-option-price">Personalised quote</div>' +
                    '</div>' +
                    '<div class="quote-selected-option-difference">We’ll confirm the current fitted price and part availability before ordering.</div>' +
                    '</div>';
            }
            return '';
        }
        var selectedPrice = Number(state.price);
        var differenceHtml = '';

        if (CL.isScreenRepair(state.repair)) {
            var fixedOptions = getRepairOptions().filter(function(o) {
                return o.priceType === 'fixed' && o.customerPriceGbp !== null;
            });
            if (fixedOptions.length > 1) {
                var lowestPrice = Math.min.apply(null, fixedOptions.map(function(o) { return o.customerPriceGbp; }));
                var difference = selectedPrice - lowestPrice;
                differenceHtml = difference > 0
                    ? '<div class="quote-selected-option-difference">This screen is <strong>\u00a3' + difference + ' more</strong> than the lowest-price screen (\u00a3' + lowestPrice + ').</div>'
                    : '<div class="quote-selected-option-difference quote-selected-option-difference--base">You selected the lowest-price screen option.</div>';
            }
        }

        var html = '<div class="quote-selected-option-summary">' +
            '<div class="quote-selected-option-kicker">Your selection</div>' +
            '<div class="quote-selected-option-row">' +
            '<div class="quote-selected-option-name">' + selectedLabel + '</div>' +
            '<div class="quote-selected-option-price">\u00a3' + selectedPrice + '</div>' +
            '</div>' +
            differenceHtml +
            '</div>';

        if (state.additionalRepairs && state.additionalRepairs.length > 0) {
            html += renderAdditionalRepairsSummary();
        } else {
            html += '<div class="quote-additional-repairs">' +
                '<div class="quote-additional-repairs-grand-total">' +
                '<span>Total cost:</span>' +
                '<span>\u00a3' + selectedPrice + '</span>' +
                '</div></div>';
        }
        html += renderQuotePaymentOptions();
        return html;
    }

    // Step 5 Phase B: Full Quote Breakdown
    function revealFullQuote() {
        state._quoteRevealed = true;
        saveState();
        var opts = getRepairOptions();
        var fixedOpts = opts.filter(function(o) { return o.priceType === 'fixed' && o.customerPriceGbp !== null; });
        var isDiagnosticOnly = fixedOpts.length > 0 && fixedOpts.every(function(o) {
            var dp = (o.displayPrice || '').toLowerCase();
            var pg = (o.partGrade || '').toLowerCase();
            return dp.indexOf('diagnostic') !== -1 || pg.indexOf('diagnostic') !== -1;
        });

        // Analytics: track quote reveal
        if (window.NFD_Analytics) {
            window.NFD_Analytics.trackReveal({
                quote_type: fixedOpts.length > 0 && !isDiagnosticOnly ? 'instant' : 'personalized',
                option_count: fixedOpts.length,
                starting_price: fixedOpts.length > 0 && !isDiagnosticOnly ? Math.min.apply(null, fixedOpts.map(function(o) { return o.customerPriceGbp; })) : null,
                device_category: state.category,
                device_make: state.brand,
                device_model: state.model,
                repair_type: state.repair,
            });
        }

        if (isDiagnosticOnly) {
            showSuccessMessage(true);
        } else if (fixedOpts.length > 0 && opts.length > 1) {
            // Keep quote-only alternatives visible alongside instant-price options
            // (e.g. Genuine Apple displays or very new models).
            renderMultiOptionBreakdown(opts);
        } else if (fixedOpts.length === 1) {
            renderSimpleBreakdown(fixedOpts[0]);
        } else {
            showSuccessMessage(true);
        }
    }

    function renderMultiOptionBreakdown(optionList) {
        var fixedOpts = optionList.filter(function(o) {
            return o.priceType === 'fixed' && o.customerPriceGbp !== null;
        });
        var deviceImg = IM.getModelImage(state.category, state.brand, state.model) || IM.getModelImage(state.category, state.brand);
        var repairImg = IM.getRepairImage(state.repair, state.category, state.brand);
        var repairIcon = IM.getRepairIcon(state.repair);
        var breakdownImg = deviceImg || repairImg;
        var breakdownIconHtml = breakdownImg
            ? '<img src="' + breakdownImg + '" alt="">'
            : '<i class="fas ' + repairIcon + '"></i>';
        var html = '<div class="quote-result-card">' +
            '<div class="quote-breakdown-header">' +
            '<h3>Your Quote</h3>' +
            '<div class="quote-breakdown-body">' +
            '<div class="quote-breakdown-info">' +
            '<div class="quote-breakdown-device">' + CL.modelDisplayName(state.model) + '</div>' +
            '<div class="quote-breakdown-repair">' + CL.repairDisplayName(state.repair) + '</div>' +
            '</div>' +
            '<div class="quote-breakdown-device-img">' + breakdownIconHtml + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="quote-screen-options">';

        var isScreenRepair2 = CL.isScreenRepair(state.repair);
        var disclosureText = isScreenRepair2
            ? 'Choose a screen quality below. Fixed prices are the total fitted price; options marked Personalised quote are confirmed with you first.'
            : 'Choose an option below.';
        html += '<div class="quote-quality-disclosure">' + disclosureText + '</div>';

        var lowestScreenPrice = isScreenRepair2 ? Math.min.apply(null, fixedOpts.map(function(o) { return o.customerPriceGbp; })) : null;

        optionList.forEach(function(o, idx) {
            var isCommonChoice = (o.partOption || '').toLowerCase().indexOf('touchscreen glass only') !== -1 ||
                                 (o.partOption || '').toLowerCase().indexOf('glass-only refurbishment') !== -1;
            var bulletsHtml = '';
            var optionDifferenceHtml = '';
            if (isScreenRepair2 && lowestScreenPrice !== null && o.customerPriceGbp !== null) {
                var optionDifference = o.customerPriceGbp - lowestScreenPrice;
                optionDifferenceHtml = optionDifference > 0
                    ? '<div class="quote-screen-option-difference">+\u00a3' + optionDifference + ' vs lowest-price screen (\u00a3' + lowestScreenPrice + ')</div>'
                    : '<div class="quote-screen-option-difference quote-screen-option-difference--base">Lowest-price screen option</div>';
            }
            if (o.warranty) bulletsHtml += '<li><i class="fas fa-check"></i> ' + o.warranty + '</li>';
            if (o.estimatedTime) bulletsHtml += '<li><i class="fas fa-check"></i> ' + o.estimatedTime + '</li>';
            html += '<div class="quote-screen-option" data-quotekey="' + o.quoteKey + '" data-price="' + (o.customerPriceGbp || '') + '"' +
                ' data-warranty="' + (o.warranty || '').replace(/"/g, '&quot;') + '"' +
                ' data-part-option="' + (o.partOption || '').replace(/"/g, '&quot;') + '"' +
                ' data-display-price="' + (o.displayPrice || '').replace(/"/g, '&quot;') + '"' +
                '>' +
                '<div class="quote-screen-option-radio"></div>' +
                '<div class="quote-screen-option-content">' +
                '<div class="quote-screen-option-label">' + o.partOption +
                (isCommonChoice ? ' <span class="quote-screen-option-badge quote-screen-option-badge-common">Most common repair</span>' : '') +
                '</div>' +
                (bulletsHtml ? '<ul class="quote-screen-option-bullets">' + bulletsHtml + '</ul>' : '') +
                (o.customerExplanation ? '<div class="quote-screen-option-explanation">' + humanizeExplanation(o.customerExplanation) + '</div>' : '') +
                optionDifferenceHtml +
                '</div>' +
                '<div class="quote-screen-option-price">' + o.displayPrice + '</div>' +
                '</div>';
        });

        html += '<div id="quote-select-hint" class="quote-select-hint"><i class="fas fa-hand-pointer"></i> Please select an option above to see your full quote.</div>';
        html += '<div id="quote-colour-picker"></div>';
        html += '<div id="quote-total-summary"></div>';
        html += '<div class="quote-breakdown-actions" id="breakdown-actions" style="display:none;"></div>';
        html += renderUpsellSection();
        html += '</div>';
        html += '</div>';

        el.resultArea.innerHTML = html;
        bindUpsellToggles();

        el.resultArea.querySelector('.quote-screen-options').addEventListener('click', function(e) {
            var opt = e.target.closest('.quote-screen-option');
            if (!opt) return;
            document.querySelectorAll('.quote-screen-option').forEach(function(o) { o.classList.remove('selected'); });
            opt.classList.add('selected');
            var hint = document.getElementById('quote-select-hint');
            if (hint) hint.style.display = 'none';
            var price = opt.dataset.price;
            state.selectedOption = opt.dataset.quotekey;
            state.deviceColour = null;
            // Analytics: track option selected
            if (window.NFD_Analytics) {
                window.NFD_Analytics.trackOptionSelected({
                    quote_key: opt.dataset.quotekey,
                    price: price ? parseFloat(price) : null,
                    device_category: state.category,
                    device_make: state.brand,
                    device_model: state.model,
                    repair_type: state.repair,
                });
            }
            if (price && price !== '') {
                state.price = parseFloat(price);
                state.quoteType = 'instant';
            } else {
                state.price = null;
                state.quoteType = 'personalized';
            }
            // Store warranty and part_option for email/SMS
            state.warranty = opt.dataset.warranty || '';
            state.partOption = opt.dataset.partOption || '';
            state.displayPrice = opt.dataset.displayPrice || '';
            window.NFD_QUOTE_STATE = state;
            saveState();

            // Check if colour selection is required for this option
            var colourPickerContainer = document.getElementById('quote-colour-picker');
            var colourConfig = CL.getQuoteColour ? CL.getQuoteColour(state.selectedOption) : null;
            if (colourPickerContainer && colourConfig) {
                renderColourPicker(colourPickerContainer, colourConfig, function() {
                    var totalSummary = document.getElementById('quote-total-summary');
                    if (totalSummary) {
                        totalSummary.innerHTML = renderSelectedOptionPriceSummary();
                    }
                    var actionsContainer = document.getElementById('breakdown-actions');
                    actionsContainer.style.display = 'block';
                    if (window.NFD_QUOTE_ACTIONS) window.NFD_QUOTE_ACTIONS.renderPostQuoteActions(state, actionsContainer);
                });
            } else {
                // No colour required — clear picker and show summary + actions immediately
                if (colourPickerContainer) colourPickerContainer.innerHTML = '';
                var totalSummary = document.getElementById('quote-total-summary');
                if (totalSummary) {
                    totalSummary.innerHTML = renderSelectedOptionPriceSummary();
                }
                var actionsContainer = document.getElementById('breakdown-actions');
                actionsContainer.style.display = 'block';
                if (window.NFD_QUOTE_ACTIONS) window.NFD_QUOTE_ACTIONS.renderPostQuoteActions(state, actionsContainer);
            }
        });
    }

    function renderColourPicker(container, colourConfig, onComplete) {
        var fieldHtml = '<div class="quote-colour-field-wrap">' +
            '<label class="quote-colour-field-label">' + colourConfig.prompt + '</label>' +
            '<button type="button" class="quote-colour-field" id="quote-colour-field-btn">' +
            '<span class="quote-colour-field-value" id="quote-colour-field-value">Tap to select</span>' +
            '<i class="fas fa-chevron-right quote-colour-field-arrow"></i>' +
            '</button>' +
            '</div>';
        container.innerHTML = fieldHtml;

        var fieldBtn = container.querySelector('#quote-colour-field-btn');
        var valueSpan = container.querySelector('#quote-colour-field-value');

        fieldBtn.addEventListener('click', function() {
            var sheetHtml = '<h3 class="quote-sheet-title">' + colourConfig.prompt + '</h3>';
            sheetHtml += '<div class="quote-colour-sheet-list">';
            colourConfig.options.forEach(function(c) {
                sheetHtml += '<button type="button" class="quote-colour-sheet-item" data-colour="' + c.replace(/"/g, '&quot;') + '">' + c + '</button>';
            });
            if (colourConfig.allowCustom) {
                sheetHtml += '<button type="button" class="quote-colour-sheet-item quote-colour-sheet-custom" data-colour="__custom__">' + colourConfig.unknownLabel + '</button>';
            }
            sheetHtml += '</div>';
            if (colourConfig.allowCustom) {
                sheetHtml += '<div class="quote-colour-custom-wrap" id="quote-colour-custom-wrap" style="display:none;">' +
                    '<input type="text" class="quote-colour-custom-input" id="quote-colour-sheet-custom-input" placeholder="Enter colour...">' +
                    '<button type="button" class="quote-colour-custom-confirm" id="quote-colour-custom-confirm">Confirm</button>' +
                    '</div>';
            }
            sheetHtml += '<button type="button" class="quote-sheet-close">Cancel</button>';
            showSheet(sheetHtml);

            var colourItems = el.sheetContent.querySelectorAll('.quote-colour-sheet-item');
            var customWrap = el.sheetContent.querySelector('#quote-colour-custom-wrap');
            var customInput = el.sheetContent.querySelector('#quote-colour-sheet-custom-input');
            var customConfirm = el.sheetContent.querySelector('#quote-colour-custom-confirm');

            colourItems.forEach(function(item) {
                item.addEventListener('click', function() {
                    var val = item.dataset.colour;
                    if (val === '__custom__') {
                        if (customWrap) {
                            customWrap.style.display = 'flex';
                            if (customInput) customInput.focus();
                        }
                        return;
                    }
                    state.deviceColour = val;
                    window.NFD_QUOTE_STATE = state;
                    saveState();
                    if (valueSpan) valueSpan.textContent = val;
                    fieldBtn.classList.add('has-value');
                    closeSheet();
                    if (onComplete) onComplete();
                });
            });

            if (customConfirm && customInput) {
                customConfirm.addEventListener('click', function() {
                    var val = customInput.value.trim();
                    if (!val) return;
                    state.deviceColour = val;
                    window.NFD_QUOTE_STATE = state;
                    saveState();
                    if (valueSpan) valueSpan.textContent = val;
                    fieldBtn.classList.add('has-value');
                    closeSheet();
                    if (onComplete) onComplete();
                });
                customInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') { e.preventDefault(); customConfirm.click(); }
                });
            }
        });
    }

    function humanizeExplanation(text) {
        if (!text) return '';
        var t = text.trim();
        // Make it more conversational
        t = t.replace(/^Replaces a damaged or faulty screen\.?$/i, "We\'ll swap out your damaged screen for a fresh one \u2014 your display will be back to normal in no time.");
        t = t.replace(/^Replaces a worn or faulty battery\.?$/i, "We\'ll fit a brand-new battery so your phone holds charge like it used to. No more carrying a power bank everywhere!");
        t = t.replace(/^Replaces the charging socket and tests charging\.?$/i, "We\'ll replace the charging port and make sure your phone charges properly before you leave.");
        t = t.replace(/^Genuine inspected Apple housing fitted in the selected colour\.?$/i, "We\'ll fit a genuine Apple back panel in your device\'s colour \u2014 inspected and in great condition. Your phone will look like new again.");
        t = t.replace(/^Genuine inspected Apple glass fitted in the selected colour\.?$/i, "We\'ll fit genuine Apple back glass in your device\'s colour \u2014 inspected and in great condition. Your phone will look like new again.");
        t = t.replace(/^Replaces a damaged or faulty\.\.?$/i, "We\'ll replace the damaged part and get your device working properly again.");
        // Generic: if it starts with "Replaces" and is short, make it friendlier
        if (/^Replaces /i.test(t) && t.length < 80) {
            t = t.replace(/^Replaces /i, 'We\'ll replace ');
            if (!/[.!?]$/.test(t)) t += '.';
        }
        return t;
    }

    function renderSimpleBreakdown(opt) {
        state.price = opt.customerPriceGbp;
        state.quoteType = 'instant';
        state.selectedOption = opt.quoteKey;
        state.warranty = opt.warranty || '';
        state.partOption = opt.partOption || '';
        state.displayPrice = opt.displayPrice || '';
        state.deviceColour = null;
        window.NFD_QUOTE_STATE = state;

        var repairIcon = IM.getRepairIcon(state.repair);
        var repairImg = IM.getRepairImage(state.repair, state.category, state.brand);
        var deviceImg = IM.getModelImage(state.category, state.brand, state.model) || IM.getModelImage(state.category, state.brand);
        var breakdownImg = deviceImg || repairImg;
        var breakdownIconHtml = breakdownImg
            ? '<img src="' + breakdownImg + '" alt="">'
            : '<i class="fas ' + repairIcon + '"></i>';
        var html = '<div class="quote-result-card">' +
            '<div class="quote-breakdown-header">' +
            '<h3>Your Quote</h3>' +
            '<div class="quote-breakdown-body">' +
            '<div class="quote-breakdown-info">' +
            '<div class="quote-breakdown-device">' + CL.modelDisplayName(state.model) + '</div>' +
            '<div class="quote-breakdown-repair">' + CL.repairDisplayName(state.repair) + '</div>' +
            '</div>' +
            '<div class="quote-breakdown-device-img">' + breakdownIconHtml + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="quote-simple-price">' +
            '<span class="quote-simple-price-value">' + opt.displayPrice + '</span>' +
            (opt.warranty ? '<span class="quote-simple-price-warranty"><i class="fas fa-shield-alt"></i> ' + opt.warranty + '</span>' : '') +
            (opt.estimatedTime ? '<span class="quote-simple-price-time"><i class="fas fa-clock"></i> ' + opt.estimatedTime + '</span>' : '') +
            '</div>' +
            (opt.customerExplanation ? '<div class="quote-quality-disclosure">' + humanizeExplanation(opt.customerExplanation) + '</div>' : '') +
            '<div id="quote-colour-picker"></div>' +
            '<div id="quote-total-summary">' + renderAdditionalRepairsSummary() + '</div>' +
            renderQuotePaymentOptions() +
            '<div class="quote-breakdown-actions" id="breakdown-actions"></div>' +
            renderUpsellSection() +
            '</div>';

        el.resultArea.innerHTML = html;
        bindUpsellToggles();

        var colourPickerContainer = document.getElementById('quote-colour-picker');
        var colourConfig = CL.getQuoteColour ? CL.getQuoteColour(state.selectedOption) : null;
        if (colourPickerContainer && colourConfig) {
            renderColourPicker(colourPickerContainer, colourConfig, function() {
                var actionsContainer = document.getElementById('breakdown-actions');
                if (window.NFD_QUOTE_ACTIONS) window.NFD_QUOTE_ACTIONS.renderPostQuoteActions(state, actionsContainer);
            });
        } else {
            var actionsContainer = document.getElementById('breakdown-actions');
            if (window.NFD_QUOTE_ACTIONS) window.NFD_QUOTE_ACTIONS.renderPostQuoteActions(state, actionsContainer);
        }
    }

    function showSuccessMessage(isPersonalizedFlag) {
        var isInstant = state.quoteType === 'instant' && state.price;
        // Clear persisted quote state — quote has been submitted/sent
        try { sessionStorage.removeItem('nfd-quote-state'); } catch(e) {}
        var priceText = isInstant ? '\u00a3' + state.price : 'Personalized Quote';
        var html = '<div class="quote-success">' +
            '<div class="quote-success-icon"><i class="fas fa-check"></i></div>' +
            '<h3>All Set!</h3>';
        if (isInstant) {
            html += '<p>Your quote for your <strong>' + CL.modelDisplayName(state.model) + '</strong> ' +
                CL.repairDisplayName(state.repair) + ' is <strong>' + priceText + '</strong>.</p>' +
                '<p>We\'ve sent your quote to your phone' + (state.customerInfo && state.customerInfo.email ? ' and email' : '') + '. Use the buttons below to book or explore other options.</p>';
        } else {
            var hasEmail = state.customerInfo && state.customerInfo.email;
            html += '<p>Thanks! We\'ve got your request for a <strong>' + CL.modelDisplayName(state.model) + '</strong> repair.</p>' +
                '<p>We\'ve sent a confirmation text' + (hasEmail ? ' and email' : '') + '. We\'ll get back to you with a personalised quote within working hours.</p>';
        }
        html += renderAdditionalRepairsSummary();
        html += '<div class="quote-success-actions">' +
            '<a href="/" class="quote-success-btn primary">Back to Home</a>' +
            '<a href="/quote/?new=1" class="quote-success-btn secondary">Start a New Quote</a>' +
            '</div>' +
            '<div style="text-align:center;margin-top:1rem;">' +
            '<a href="/saved/" style="color:#009B4D;text-decoration:none;font-size:0.9rem;font-weight:600;"><i class="fas fa-folder-open"></i> View My Saved Quotes</a>' +
            '</div></div>';
        el.resultArea.innerHTML = html;
        var htmlEl = document.documentElement;
        htmlEl.style.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
        setTimeout(function() { htmlEl.style.scrollBehavior = ''; }, 100);
    }

    window.NFD_QUOTE_REVEAL = {
        revealFullQuote: revealFullQuote,
        showSuccessMessage: showSuccessMessage
    };
    window.NFD_QUOTE_SHEET = {
        showSheet: showSheet,
        closeSheet: closeSheet
    };

    // Analytics: track initial step 1 enter on page load
    if (window.NFD_Analytics) {
        window.NFD_Analytics.trackStepEnter(1, {});
    }
    // Analytics: track exit intent on desktop
    if (window.NFD_Analytics && !/Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        var exitIntentTracked = false;
        document.addEventListener('mouseleave', function(e) {
            if (exitIntentTracked) return;
            if (e.clientY <= 0) {
                exitIntentTracked = true;
                window.NFD_Analytics.trackExitIntent();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
