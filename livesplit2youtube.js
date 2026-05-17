document.addEventListener('DOMContentLoaded', () => {

    const fileInput = document.getElementById('fileInput');
    const controls = document.getElementById('controls');
    const optionsPanel = document.getElementById('optionsPanel');
    const resultsRow = document.getElementById('resultsRow');
    const attemptSelect = document.getElementById('attemptSelect');
    const output = document.getElementById('output');
    const copyBtn = document.getElementById('copyBtn');
    const copyStatus = document.getElementById('copyStatus');
    const segmentPreview = document.getElementById('segmentPreview');
    const startLabelInput = document.getElementById('startLabel');
    const hideDnfCheckbox = document.getElementById('hideDnf');
    const offsetInput = document.getElementById('offsetInput');
    const showAttributionCheckbox = document.getElementById('showAttribution');

    let parsedData = null;

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        try {
            const text = await file.text();
            parseLiveSplit(text);
        } catch (err) {
            alert('Failed to read file: ' + err.message);
        }
    });

    attemptSelect.addEventListener('change', () => {
        if (attemptSelect.value) {
            optionsPanel.classList.remove('hidden');
            resultsRow.classList.remove('hidden');
            generateChapters();
        }
    });
    startLabelInput.addEventListener('input', generateChapters);
    offsetInput.addEventListener('input', generateChapters);
    showAttributionCheckbox.addEventListener('change', generateChapters);

    hideDnfCheckbox.addEventListener('change', () => {
        if (parsedData) {
            populateAttemptOptions();
            generateChapters();
        }
    });

    copyBtn.addEventListener('click', async () => {
        if (!output.value.trim()) {
            return;
        }

        try {
            await navigator.clipboard.writeText(output.value);
            copyStatus.classList.remove('hidden');

            setTimeout(() => {
                copyStatus.classList.add('hidden');
            }, 2000);
        } catch (err) {
            alert('Clipboard copy failed.');
        }
    });

    function parseLiveSplit(xmlText) {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, 'application/xml');

        const parseError = xml.querySelector('parsererror');
        if (parseError) {
            alert('Invalid LiveSplit file.');
            return;
        }

        const segments = [...xml.querySelectorAll('Segments > Segment')];
        const attempts = [...xml.querySelectorAll('AttemptHistory > Attempt')];

        if (segments.length === 0) {
            alert('No segments found in file.');
            return;
        }

        const splitSets = [];

        // Attempt history runs
        attempts.forEach((attempt, index) => {
            const id = attempt.getAttribute('id') || String(index + 1);
            const realTime = attempt.getAttribute('started');

            const cumulativeTimes = extractAttemptTimes(segments, id);

            if (cumulativeTimes.some(t => t !== null)) {
                const isDNF = cumulativeTimes[cumulativeTimes.length - 1] === null;
                splitSets.push({
                    id,
                    label: `Attempt ${id}${realTime ? ` (${new Date(realTime).toLocaleDateString()})` : ''}`,
                    cumulativeTimes,
                    isPB: false,
                    isDNF
                });
            }
        });

        // Mark the fastest completed run as PB
        let bestIndex = -1;
        let bestTime = Infinity;
        splitSets.forEach((set, index) => {
            if (set.isDNF) return;
            const validTimes = set.cumulativeTimes.filter(t => t !== null && t !== undefined);
            const finalTime = validTimes.length ? validTimes[validTimes.length - 1] : null;
            if (finalTime !== null && finalTime < bestTime) {
                bestTime = finalTime;
                bestIndex = index;
            }
        });
        if (bestIndex >= 0) {
            splitSets[bestIndex].isPB = true;
        }

        parsedData = {
            segments: segments.map(seg => seg.querySelector('Name')?.textContent?.trim() || 'Unnamed Segment'),
            splitSets
        };

        populateAttemptOptions();

        controls.classList.remove('hidden');
        optionsPanel.classList.add('hidden');
        resultsRow.classList.add('hidden');
    }

    function extractAttemptTimes(segments, attemptId) {
        return segments.map(segment => {
            const histories = [...segment.querySelectorAll('SegmentHistory > Time')];

            const match = histories.find(h => h.getAttribute('id') === attemptId);
            if (!match) return null;

            const realTime = match.querySelector('RealTime');
            if (!realTime || !realTime.textContent) return null;

            return parseLiveSplitDuration(realTime.textContent.trim());
        }).reduce((acc, segmentTime, index) => {
            if (segmentTime === null) {
                acc.push(null);
                return acc;
            }

            const previous = index > 0 && acc[index - 1] !== null
                ? acc[index - 1]
                : 0;

            acc.push(previous + segmentTime);
            return acc;
        }, []);
    }

    function populateAttemptOptions() {
        const previousValue = attemptSelect.value;
        attemptSelect.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a run...';
        placeholder.disabled = true;
        if (!previousValue) placeholder.selected = true;
        attemptSelect.appendChild(placeholder);

        const allDnf = parsedData.splitSets.every(set => set.isDNF);
        if (allDnf && hideDnfCheckbox.checked) {
            hideDnfCheckbox.checked = false;
        }

        parsedData.splitSets.forEach((set, index) => {
            if (hideDnfCheckbox.checked && set.isDNF) return;

            const validTimes = set.cumulativeTimes.filter(t => t !== null && t !== undefined);

            const totalTime = validTimes.length
                ? validTimes[validTimes.length - 1]
                : null;

            const timeText = totalTime !== null
                ? ' - ' + formatDuration(totalTime)
                : ' - N/A';

            let statusIcon;
            if (set.isPB) {
                statusIcon = '\uD83C\uDFC6';
            } else if (set.isDNF) {
                statusIcon = '\u2717';
            } else {
                statusIcon = '\u2713';
            }

            const option = document.createElement('option');
            option.value = index;
            option.textContent = statusIcon + ' ' + set.label + timeText;

            attemptSelect.appendChild(option);
        });

        // restore previous selection if still available
        const options = [...attemptSelect.options];
        if (options.some(o => o.value === previousValue)) {
            attemptSelect.value = previousValue;
        }
    }

    function generateChapters() {
        if (!parsedData){
            return; 
        }

        const selectedSet = parsedData.splitSets[attemptSelect.value];
        if (!selectedSet) {
            return;
        }

        const lines = [];
        const previewLines = [];

        const startLabel = startLabelInput.value.trim() || 'Start';

        const offset = parseFloat(offsetInput.value) || 0;

        if (offset > 0) {
            lines.push('0:00 ' + startLabel);
            previewLines.push('<div><strong>00:00:00.000</strong> - ' + escapeHtml(startLabel) + '</div>');
        }

        parsedData.segments.forEach((segmentName, index) => {
            const startOfSection = index === 0
                ? 0
                : selectedSet.cumulativeTimes[index - 1];

            if (startOfSection === null || startOfSection === undefined) {
                return;
            }

            const timestamp = formatYouTubeTimestamp(startOfSection + offset);

            lines.push(timestamp + ' ' + segmentName);

            const previewTimestamp = formatDuration(startOfSection);

            previewLines.push(
                '<div><strong>' + escapeHtml(previewTimestamp) + '</strong> - ' + escapeHtml(segmentName) + '</div>'
            );
        });

        if (showAttributionCheckbox.checked) {
            lines.push('');
            lines.push('');
            lines.push('Chapters generated with https://budditec.nz/livesplit-to-youtube-chapters/');
        }

        output.value = lines.join('\n');
        segmentPreview.innerHTML = previewLines.join('');

        // auto-size textarea to fit content
        output.style.height = 'auto';
        output.style.height = output.scrollHeight + 'px';
    }

    function parseLiveSplitDuration(duration) {
        // Example: 00:01:23.4567890
        const parts = duration.split(':');

        if (parts.length < 3) {
             return null;
        }

        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        const seconds = parseFloat(parts[2]) || 0;

        return (hours * 3600) + (minutes * 60) + seconds;
    }

    function formatYouTubeTimestamp(totalSeconds) {
        totalSeconds = Math.max(0, Math.floor(totalSeconds));

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        }

        return minutes + ':' + String(seconds).padStart(2, '0');
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDuration(totalSeconds) {
        totalSeconds = Math.max(0, totalSeconds);

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = Math.floor(totalSeconds % 60);
        const ms = Math.floor((totalSeconds % 1) * 1000);

        return String(hours).padStart(2, '0') + ':' +
               String(minutes).padStart(2, '0') + ':' +
               String(secs).padStart(2, '0') + '.' +
               String(ms).padStart(3, '0');
    }
});
