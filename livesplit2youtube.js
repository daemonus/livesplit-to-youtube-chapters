
const fileInput = document.getElementById('fileInput');
const controls = document.getElementById('controls');
const previewCard = document.getElementById('previewCard');
const outputCard = document.getElementById('outputCard');
const attemptSelect = document.getElementById('attemptSelect');
const generateBtn = document.getElementById('generateBtn');
const output = document.getElementById('output');
const copyBtn = document.getElementById('copyBtn');
const copyStatus = document.getElementById('copyStatus');
const segmentPreview = document.getElementById('segmentPreview');
const startLabelInput = document.getElementById('startLabel');

let parsedData = null;

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    parseLiveSplit(text);
  } catch (err) {
    alert('Failed to read file: ' + err.message);
  }
});

generateBtn.addEventListener('click', generateChapters);

copyBtn.addEventListener('click', async () => {
  if (!output.value.trim()) return;

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

  // Personal Best from split times
  splitSets.push({
    id: 'pb',
    label: 'Personal Best Splits',
    cumulativeTimes: extractSegmentSplitTimes(segments)
  });

  // Attempt history runs
  attempts.forEach((attempt, index) => {
    const id = attempt.getAttribute('id') || String(index + 1);
    const realTime = attempt.getAttribute('started');

    const cumulativeTimes = extractAttemptTimes(segments, id);

    if (cumulativeTimes.some(t => t !== null)) {
      splitSets.push({
        id,
        label: `Attempt ${id}${realTime ? ` (${new Date(realTime).toLocaleDateString()})` : ''}`,
        cumulativeTimes
      });
    }
  });

  parsedData = {
    segments: segments.map(seg => seg.querySelector('Name')?.textContent?.trim() || 'Unnamed Segment'),
    splitSets
  };

  populateAttemptOptions();

  controls.classList.remove('hidden');
  previewCard.classList.remove('hidden');
  outputCard.classList.remove('hidden');

  generateChapters();
}

function extractSegmentSplitTimes(segments) {
  return segments.map(segment => {
    const splitTime = segment.querySelector('SplitTimes > SplitTime[name="Personal Best"] > RealTime');
    if (!splitTime || !splitTime.textContent) return null;
    return parseLiveSplitDuration(splitTime.textContent.trim());
  });
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
  attemptSelect.innerHTML = '';

  parsedData.splitSets.forEach((set, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = set.label;
    attemptSelect.appendChild(option);
  });
}

function generateChapters() {
  if (!parsedData) return;

  const selectedSet = parsedData.splitSets[attemptSelect.value];
  if (!selectedSet) return;

  const lines = [];
  const previewLines = [];

  const startLabel = startLabelInput.value.trim() || 'Start';

  lines.push(`0:00 ${startLabel}`);

  previewLines.push(`<div><strong>0:00</strong> — ${escapeHtml(startLabel)}</div>`);

  parsedData.segments.forEach((segmentName, index) => {
    const totalSeconds = selectedSet.cumulativeTimes[index];

    if (totalSeconds === null || totalSeconds === undefined) {
      return;
    }

    const timestamp = formatYouTubeTimestamp(totalSeconds);

    lines.push(`${timestamp} ${segmentName}`);

    previewLines.push(
      `<div><strong>${escapeHtml(timestamp)}</strong> — ${escapeHtml(segmentName)}</div>`
    );
  });

  output.value = lines.join('\n');
  segmentPreview.innerHTML = previewLines.join('');
}

function parseLiveSplitDuration(duration) {
  // Example: 00:01:23.4567890
  const parts = duration.split(':');

  if (parts.length < 3) return null;

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;

  return Math.floor((hours * 3600) + (minutes * 60) + seconds);
}

function formatYouTubeTimestamp(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}