document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const sidebar = document.getElementById('sidebar');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');

    const assetBtns = document.querySelectorAll('#assetGroup .pill-btn');
    const timeframeBtns = document.querySelectorAll('#timeframeGroup .pill-btn');
    const quickRangeBtns = document.querySelectorAll('.quick-range-btn');

    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    
    const drawdownSlider = document.getElementById('drawdownSlider');
    const drawdownValueDisplay = document.getElementById('drawdownValueDisplay');

    const analyzeBtn = document.getElementById('analyzeBtn');
    const resetBtn = document.getElementById('resetBtn');
    const errorBox = document.getElementById('errorBox');

    const statEvents = document.getElementById('statEvents');
    const statAvgDrop = document.getElementById('statAvgDrop');
    const statAccuracy = document.getElementById('statAccuracy');

    const aiDepth = document.getElementById('aiDepth');
    const aiTime = document.getElementById('aiTime');

    const assetTitle = document.getElementById('assetTitle');
    const dateRangeDisplay = document.getElementById('dateRangeDisplay');
    const candleCountDisplay = document.getElementById('candleCountDisplay');

    const tvchart = document.getElementById('tvchart');
    const loadingOverlay = document.getElementById('loadingOverlay');

    // Premium Toolbar & Tooltip Elements
    const toggleSmaBtn = document.getElementById('toggleSmaBtn');
    const toggleVolumeBtn = document.getElementById('toggleVolumeBtn');
    const chartTooltip = document.getElementById('chartTooltip');
    const tooltipDate = document.getElementById('tooltipDate');
    const tooltipOpen = document.getElementById('tooltipOpen');
    const tooltipHigh = document.getElementById('tooltipHigh');
    const tooltipLow = document.getElementById('tooltipLow');
    const tooltipClose = document.getElementById('tooltipClose');
    const tooltipVolume = document.getElementById('tooltipVolume');

    // --- State ---
    let currentAsset = 'gold';
    let currentTimeframe = '1d';
    let chart = null;
    let candleSeries = null;
    let volumeSeries = null;
    let smaSeries = null;
    let markers = [];
    let showSma = true;
    let showVolume = true;

    // --- Mobile Toggle ---
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
    });
    closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.remove('open');
    });

    // --- UI Interactions ---
    assetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            assetBtns.forEach(b => {
                b.classList.remove('active', 'gold', 'cyan', 'purple');
            });
            btn.classList.add('active', 'gold'); // Use gold theme for active
            currentAsset = btn.dataset.value;
            updateTitle();
            runAnalysis();
        });
    });

    timeframeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            timeframeBtns.forEach(b => {
                b.classList.remove('active', 'cyan');
            });
            btn.classList.add('active', 'cyan');
            currentTimeframe = btn.dataset.value;
            runAnalysis();
        });
    });

    quickRangeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const days = btn.dataset.days;
            const today = new Date(); // Use today or a specific max date
            toDateInput.value = today.toISOString().split('T')[0];

            if (days === 'all') {
                fromDateInput.value = '2010-01-01';
            } else {
                const past = new Date(today);
                past.setDate(today.getDate() - parseInt(days));
                fromDateInput.value = past.toISOString().split('T')[0];
            }
            runAnalysis();
        });
    });

    drawdownSlider.addEventListener('input', (e) => {
        drawdownValueDisplay.innerText = parseFloat(e.target.value).toFixed(1) + '%';
    });
    drawdownSlider.addEventListener('change', () => {
        runAnalysis();
    });

    resetBtn.addEventListener('click', () => {
        // Reset to gold daily
        assetBtns[0].click();
        timeframeBtns[1].click();
        fromDateInput.value = '2010-01-01';
        toDateInput.value = new Date().toISOString().split('T')[0];
        drawdownSlider.value = 5.0;
        drawdownValueDisplay.innerText = '5.0%';
        runAnalysis();
    });

    analyzeBtn.addEventListener('click', runAnalysis);

    toggleVolumeBtn.addEventListener('click', () => {
        showVolume = !showVolume;
        toggleVolumeBtn.classList.toggle('active', showVolume);
        if (volumeSeries) {
            volumeSeries.applyOptions({ visible: showVolume });
        }
    });

    toggleSmaBtn.addEventListener('click', () => {
        showSma = !showSma;
        toggleSmaBtn.classList.toggle('active', showSma);
        if (smaSeries) {
            smaSeries.applyOptions({ visible: showSma });
        }
    });

    function updateTitle() {
        const names = { gold: 'Gold', silver: 'Silver', bitcoin: 'Bitcoin' };
        assetTitle.innerText = `${names[currentAsset]} Drawdown Visualization`;
    }

    // --- Chart Initialization ---
    function initChart() {
        if (chart) chart.remove();
        
        chart = LightweightCharts.createChart(tvchart, {
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: 'rgba(255, 255, 255, 0.5)',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    color: 'rgba(0, 217, 255, 0.3)',
                    width: 1,
                    style: 3, // dashed
                },
                horzLine: {
                    color: 'rgba(0, 217, 255, 0.3)',
                    width: 1,
                    style: 3, // dashed
                }
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                timeVisible: true,
            },
        });

        // Initialize Candlestick Series
        candleSeries = chart.addCandlestickSeries({
            upColor: '#10B981',
            downColor: '#EF4444',
            borderVisible: false,
            wickUpColor: '#10B981',
            wickDownColor: '#EF4444',
        });

        // Initialize Volume Series (Overlayed on main pane, positioned at the bottom)
        volumeSeries = chart.addHistogramSeries({
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '', // Draw on the main pane overlay
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: {
                top: 0.8, // Leave top 80% free for candles
                bottom: 0,
            },
        });

        // Initialize 20-period SMA Line Series
        smaSeries = chart.addLineSeries({
            color: '#A78BFA', // Purple
            lineWidth: 2,
            priceScaleId: 'right',
            crosshairMarkerVisible: false,
        });

        // Apply initial toggle visibility states
        volumeSeries.applyOptions({ visible: showVolume });
        smaSeries.applyOptions({ visible: showSma });

        // Tooltip Crosshair Movement Subscriber
        chart.subscribeCrosshairMove(param => {
            if (
                param.point === undefined ||
                !param.time ||
                param.point.x < 0 ||
                param.point.x > tvchart.clientWidth ||
                param.point.y < 0 ||
                param.point.y > tvchart.clientHeight
            ) {
                chartTooltip.style.opacity = '0';
                setTimeout(() => {
                    if (chartTooltip.style.opacity === '0') {
                        chartTooltip.style.display = 'none';
                    }
                }, 150);
                return;
            }

            const candleData = param.seriesData.get(candleSeries);
            const volumeData = param.seriesData.get(volumeSeries);

            if (!candleData) {
                chartTooltip.style.opacity = '0';
                return;
            }

            chartTooltip.style.display = 'block';
            chartTooltip.style.opacity = '1';

            // Set Date
            const dateStr = new Date(param.time * 1000).toISOString().split('T')[0];
            tooltipDate.innerText = dateStr;

            // Set OHLC
            tooltipOpen.innerText = candleData.open.toFixed(2);
            tooltipHigh.innerText = candleData.high.toFixed(2);
            tooltipLow.innerText = candleData.low.toFixed(2);
            tooltipClose.innerText = candleData.close.toFixed(2);

            // Style Open/Close colors dynamically in tooltip
            if (candleData.close >= candleData.open) {
                tooltipOpen.className = 'val text-success';
                tooltipClose.className = 'val text-success';
            } else {
                tooltipOpen.className = 'val text-danger';
                tooltipClose.className = 'val text-danger';
            }

            // Set Volume
            if (volumeData && volumeData.value !== undefined) {
                const vol = volumeData.value;
                if (vol >= 1e6) {
                    tooltipVolume.innerText = (vol / 1e6).toFixed(2) + 'M';
                } else if (vol >= 1e3) {
                    tooltipVolume.innerText = (vol / 1e3).toFixed(2) + 'K';
                } else {
                    tooltipVolume.innerText = vol.toLocaleString();
                }
            } else {
                tooltipVolume.innerText = '0';
            }

            // Position Tooltip beautifully beside the crosshair cursor
            const tooltipWidth = 180;
            const tooltipHeight = 130;
            const margin = 15;

            let left = param.point.x + margin;
            let top = param.point.y + margin;

            // Flip tooltip position if it overflows the boundaries
            if (left + tooltipWidth > tvchart.clientWidth) {
                left = param.point.x - tooltipWidth - margin;
            }
            if (top + tooltipHeight > tvchart.clientHeight) {
                top = param.point.y - tooltipHeight - margin;
            }

            chartTooltip.style.left = left + 'px';
            chartTooltip.style.top = top + 'px';
        });

        // Resize Listener
        window.addEventListener('resize', () => {
            if (chart && tvchart.clientWidth) {
                chart.applyOptions({ width: tvchart.clientWidth });
            }
        });
    }

    // --- Data Fetching ---
    async function fetchPredictions() {
        try {
            // predictions.json is in static/data so it's accessible at /static/data/predictions.json
            const res = await fetch(`data/predictions.json`);
            if (res.ok) {
                const data = await res.json();
                if (data && data[currentAsset]) {
                    const pred = data[currentAsset];
                    aiDepth.innerText = `${pred.expected_depth}%`;
                    aiTime.innerText = `${pred.days_until}d`;
                    return;
                }
            }
        } catch (e) {
            console.warn("Prediction fetch failed", e);
        }
        aiDepth.innerText = '--%';
        aiTime.innerText = '--d';
    }

    function calculateSMA(data, count) {
        let result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < count - 1) {
                continue;
            }
            let sum = 0;
            for (let j = 0; j < count; j++) {
                sum += data[i - j].close;
            }
            result.push({
                time: data[i].time,
                value: sum / count,
            });
        }
        return result;
    }

    async function runAnalysis() {
        errorBox.style.display = 'none';
        loadingOverlay.style.opacity = '1';
        loadingOverlay.style.pointerEvents = 'auto';

        try {
            await fetchPredictions();

            const ddThresh = parseFloat(drawdownSlider.value);
            const sd = fromDateInput.value;
            const ed = toDateInput.value;

            let url = `/api/analyze?asset=${currentAsset}&timeframe=${currentTimeframe}&drawdown_pct=${ddThresh}`;
            if (sd) url += `&start_date=${sd}`;
            if (ed) url += `&end_date=${ed}`;

            const response = await fetch(url);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Failed to fetch analysis");
            }

            const data = await response.json();
            const events_count = data.events_count || 0;
            const chartData = data.chart_data || [];
            const occurrences = data.occurrences || [];

            if (chartData.length > 0) {
                candleSeries.setData(chartData);

                // Add Volume Data
                const volumeData = chartData.map(item => ({
                    time: item.time,
                    value: item.volume || 0,
                    color: item.close >= item.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
                }));
                volumeSeries.setData(volumeData);

                // Add SMA Data (20 periods)
                if (chartData.length >= 20) {
                    const smaData = calculateSMA(chartData, 20);
                    smaSeries.setData(smaData);
                } else {
                    smaSeries.setData([]);
                }

                // Add markers for drawdown events
                markers = occurrences.map(occ => ({
                    time: occ.date, // Timestamp
                    position: 'belowBar',
                    color: '#FDB813',
                    shape: 'arrowUp',
                    text: 'Drawdown'
                }));
                
                candleSeries.setMarkers(markers);
                chart.timeScale().fitContent();

                // Convert timestamp back to string for display
                const startStr = new Date(chartData[0].time * 1000).toISOString().split('T')[0];
                const endStr = new Date(chartData[chartData.length - 1].time * 1000).toISOString().split('T')[0];
                dateRangeDisplay.innerText = `${startStr} → ${endStr}`;
                candleCountDisplay.innerText = `${chartData.length} Candles`;
            } else {
                candleSeries.setData([]);
                candleSeries.setMarkers([]);
                volumeSeries.setData([]);
                smaSeries.setData([]);
                dateRangeDisplay.innerText = `-- → --`;
                candleCountDisplay.innerText = `0 Candles`;
            }

            let total_drops = 0;
            occurrences.forEach(occ => {
                total_drops += ((occ.peak - occ.dip) / occ.peak) * 100;
            });

            statEvents.innerText = events_count;
            statAvgDrop.innerText = events_count > 0 ? `-${(total_drops / events_count).toFixed(1)}%` : '0%';

        } catch (err) {
            errorBox.innerText = err.message || "Error analyzing data";
            errorBox.style.display = 'block';
            candleSeries.setData([]);
            candleSeries.setMarkers([]);
            volumeSeries.setData([]);
            smaSeries.setData([]);
        } finally {
            loadingOverlay.style.opacity = '0';
            loadingOverlay.style.pointerEvents = 'none';
        }
    }

    // --- Initialization ---
    // Set default dates
    fromDateInput.value = '2010-01-01';
    toDateInput.value = new Date().toISOString().split('T')[0];
    
    // Setup pill defaults
    assetBtns[0].classList.add('active', 'gold');
    timeframeBtns[1].classList.add('active', 'cyan');

    initChart();
    updateTitle();
    runAnalysis(); // Run initial analysis
});
