const MAX_SPECTRUM_LEVEL = 0.92;
const LIMITER_START_LEVEL = 0.8;
const LIMITER_CURVE = 0.4;

function limitSpectrumLevel(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value <= LIMITER_START_LEVEL) return value;

    const limitedRange = MAX_SPECTRUM_LEVEL - LIMITER_START_LEVEL;
    const overLimit = value - LIMITER_START_LEVEL;
    const compressed = LIMITER_START_LEVEL + (1 - Math.exp(-overLimit / LIMITER_CURVE)) * limitedRange;
    return Math.min(MAX_SPECTRUM_LEVEL, compressed);
}

function calculateLevels(dataArray, sampleRate) {
    const fftLength = 2048;
    const binSize = sampleRate / fftLength;
    
    const frequencyBands = {
        low: [20, 120],
        bass: [120, 250],
        mid: [250, 4000],
        treble: [4000, 20000]
    };

    // Get gain values from sliders
    const gain = parseFloat(document.getElementById('gainSlider').value || 2.0);
    const lowBoostSlider = parseFloat(document.getElementById('lowBoostSlider').value || 2.6);
    const bassBoostSlider = parseFloat(document.getElementById('bassBoostSlider').value || 3.0);
    const midBoostSlider = parseFloat(document.getElementById('midBoostSlider').value || 2.0);
    const trebleBoostSlider = parseFloat(document.getElementById('trebleBoostSlider').value || 3.4);

    // Scale boosts like in the reference
    const lowBoost = Math.round(lowBoostSlider / 10 * 50);
    const bassBoost = Math.round(bassBoostSlider / 10 * 100);
    const midBoost = Math.round(midBoostSlider / 10 * 1000);
    const trebleBoost = Math.round(trebleBoostSlider / 10 * 1000);

    const volumeBoost = 8.0;

    const levels = [];

    for (const [band, [lowFreq, highFreq]] of Object.entries(frequencyBands)) {
        let energy = 0;
        let bins = 0;

        for (let i = 1; i < fftLength / 2; i++) {
            const frequency = i * binSize;
            if (frequency >= lowFreq && frequency < highFreq) {
                const magnitude = Math.pow(10, dataArray[i] / 20); // Convert dB to magnitude
                energy += magnitude;
                bins++;
            }
        }

        let normalizedLevel = 0;
        if (bins > 0) {
            let boost = 1;
            switch (band) {
                case 'low':
                    boost = lowBoost;
                    break;
                case 'bass':
                    boost = bassBoost;
                    break;
                case 'mid':
                    boost = midBoost;
                    break;
                case 'treble':
                    boost = trebleBoost;
                    break;
            }
            normalizedLevel = limitSpectrumLevel((energy / bins) * boost * gain * volumeBoost);
        }

        levels.push(normalizedLevel);
    }

    return levels;
}

function updateWaveform(levels) {
    const canvas = document.getElementById('audioCanvas');
    // Skip drawing entirely when the canvas isn't visible (other tab / minimized) -
    // this is the single biggest perf win for an always-running app.
    if (!canvas || canvas.offsetParent === null) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const colors = ['red', 'green', 'blue', 'purple']; // Low, Bass, Mid, Treble
    levels.forEach((level, i) => {
        ctx.fillStyle = colors[i];
        ctx.fillRect(i * (canvas.width / 4), canvas.height - level * canvas.height, canvas.width / 4 - 10, level * canvas.height);
    });
}

module.exports = {
    updateWaveform,
    calculateLevels
};
