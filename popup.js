const scanBtn    = document.getElementById('scan-btn');
const statusEl   = document.getElementById('status');
const countEl    = document.getElementById('count');
const resultsEl  = document.getElementById('results');
const emptyEl    = document.getElementById('empty');

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

function renderResults(links) {
  resultsEl.innerHTML = '';

  if (!links.length) {
    countEl.textContent = '';
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  countEl.textContent = `${links.length} hidden link${links.length !== 1 ? 's' : ''} found`;

  links.forEach(link => {
    const card = document.createElement('div');
    card.className = 'card';

    // URL row
    const urlRow = document.createElement('div');
    urlRow.className = 'url-row';

    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.title = link.href;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(link.href).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    });

    urlRow.appendChild(anchor);
    urlRow.appendChild(copyBtn);

    // Link text
    const textEl = document.createElement('div');
    textEl.className = 'link-text';
    textEl.textContent = link.text;

    // Reason badge
    const meta = document.createElement('div');
    meta.className = 'meta';

    const reasonBadge = document.createElement('span');
    reasonBadge.className = 'badge badge-reason';
    reasonBadge.textContent = link.reason;

    const sourceBadge = document.createElement('span');
    sourceBadge.className = 'badge badge-source';
    sourceBadge.textContent = link.source === 'self' ? 'link itself' : `via ${link.source}`;

    meta.appendChild(reasonBadge);
    meta.appendChild(sourceBadge);

    if (link.rel) {
      const relBadge = document.createElement('span');
      relBadge.className = 'badge badge-rel';
      relBadge.textContent = `rel="${link.rel}"`;
      meta.appendChild(relBadge);
    }

    card.appendChild(urlRow);
    card.appendChild(textEl);
    card.appendChild(meta);
    resultsEl.appendChild(card);
  });
}

async function scan() {
  scanBtn.disabled = true;
  scanBtn.textContent = 'Scanning…';
  setStatus('Injecting scanner…');
  countEl.textContent = '';
  resultsEl.innerHTML = '';
  emptyEl.hidden = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      setStatus('No active tab found.', 'error');
      return;
    }

    // Inject content script (idempotent if already injected)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scan' });

    if (!response || !Array.isArray(response.links)) {
      setStatus('Unexpected response from page.', 'error');
      return;
    }

    setStatus(
      response.links.length
        ? 'Scan complete.'
        : 'Scan complete — no hidden links detected.',
      response.links.length ? 'ok' : ''
    );

    renderResults(response.links);
  } catch (err) {
    // chrome:// pages and the new tab page block scripting
    if (err.message?.includes('Cannot access') || err.message?.includes('chrome://')) {
      setStatus('Cannot scan this page (restricted URL).', 'error');
    } else {
      setStatus(`Error: ${err.message}`, 'error');
    }
    console.error('[Hidden Links Grabber]', err);
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = 'Scan Page';
  }
}

scanBtn.addEventListener('click', scan);

// Auto-scan when popup opens
scan();
