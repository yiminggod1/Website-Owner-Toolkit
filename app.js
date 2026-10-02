const $ = (s, r = document) => r.querySelector(s);

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

const normalizeUrl = (value) => {
  let text = (value || '').trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) text = 'https://' + text;
  try { return new URL(text).href; } catch { return ''; }
};

function analyzeHtml(html) {
  const rawHtml = String(html || '');
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const title = (doc.querySelector('title')?.textContent || '').trim();
  const description = (doc.querySelector('meta[name="description" i]')?.getAttribute('content') || '').trim();
  const canonical = doc.querySelector('link[rel="canonical" i]')?.getAttribute('href') || '';
  const viewport = doc.querySelector('meta[name="viewport" i]')?.getAttribute('content') || '';
  const lang = doc.documentElement.getAttribute('lang') || '';
  const h1 = [...doc.querySelectorAll('h1')];
  const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const images = [...doc.querySelectorAll('img')];
  const missingAlt = images.filter((img) => !img.hasAttribute('alt') || !img.getAttribute('alt').trim());
  const links = [...doc.querySelectorAll('a[href]')];
  const emptyLinks = links.filter((a) => !a.textContent.trim() && !a.getAttribute('aria-label'));
  const linkStats = { absolute: 0, relative: 0, anchors: 0, special: 0 };
  links.forEach((a) => {
    const href = (a.getAttribute('href') || '').trim();
    if (!href) return;
    if (/^#/.test(href)) linkStats.anchors++;
    else if (/^(mailto:|tel:|javascript:)/i.test(href)) linkStats.special++;
    else if (/^https?:\/\//i.test(href)) linkStats.absolute++;
    else linkStats.relative++;
  });
  const og = [...doc.querySelectorAll('meta[property^="og:" i]')];
  const jsonld = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  const robots = doc.querySelector('meta[name="robots" i]')?.getAttribute('content') || '';
  const bodyText = doc.body?.innerText || '';
  const words = (bodyText.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu) || []).length;
  const issues = [];

  if (!title) issues.push(['high', 'Missing title']);
  else if (title.length < 30 || title.length > 65) issues.push(['med', 'Title is ' + title.length + ' characters']);
  if (!description) issues.push(['high', 'Missing meta description']);
  else if (description.length < 70 || description.length > 170) issues.push(['med', 'Meta description is ' + description.length + ' characters']);
  if (!h1.length) issues.push(['high', 'No H1 found']);
  if (h1.length > 1) issues.push(['med', h1.length + ' H1 headings found']);
  if (!canonical) issues.push(['med', 'No canonical link found']);
  if (!viewport) issues.push(['med', 'No viewport meta tag found']);
  if (!lang) issues.push(['low', 'HTML lang attribute missing']);
  if (missingAlt.length) issues.push(['med', missingAlt.length + ' image(s) missing useful alt text']);
  if (emptyLinks.length) issues.push(['low', emptyLinks.length + ' link(s) have no accessible text']);
  if (!og.length) issues.push(['low', 'No Open Graph tags found']);
  if (!jsonld.length) issues.push(['low', 'No JSON-LD block found']);
  if (/noindex/i.test(robots)) issues.push(['high', 'Robots meta contains noindex']);

  return {
    doc, title, description, canonical, viewport, lang, h1, headings,
    images, missingAlt, links, emptyLinks, linkStats, og, jsonld, robots, words,
    sourceChars: rawHtml.length,
    sourceBytes: typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(rawHtml).length : rawHtml.length,
    issues,
    score: Math.round(Math.max(0, 13 - issues.length) / 13 * 100)
  };
}

function reportShell(title, badge, body) {
  return '<div class="result-head"><strong>' + escapeHtml(title) +
    '</strong><span class="badge">' + escapeHtml(badge) +
    '</span></div>' + body;
}
function metric(label, value) {
  return '<div class="metric"><small>' + escapeHtml(label) +
    '</small><strong>' + escapeHtml(value) + '</strong></div>';
}
function renderAuditReport(a) {
  return reportShell('Audit summary', a.issues.length ? a.issues.length + ' findings' : 'No findings',
    '<div class="result-grid">' +
      metric('Health score', a.score + '/100') +
      metric('Title chars', a.title.length) +
      metric('H1 count', a.h1.length) +
      metric('Images', a.images.length) +
      metric('Links', a.links.length) +
      metric('Text words', a.words.toLocaleString()) +
    '</div>' +
    a.issues.map((i) =>
      '<div class="finding"><span class="sev ' + i[0] + '"></span><div><strong>' +
      escapeHtml(i[1]) + '</strong></div><small>' + escapeHtml(i[0]) +
      '</small></div>'
    ).join(''));
}
function renderSpecific(kind, a) {
  if (kind === 'meta-title-checker') {
    return reportShell('Title check', a.title ? 'Present' : 'Missing',
      '<div class="result-grid">' +
      metric('Characters', a.title.length) +
      metric('H1 count', a.h1.length) +
      metric('Title', a.title || '—') +
      '</div><p class="note">A practical drafting range is roughly 30–65 characters. Search engines may display different lengths.</p>');
  }
  if (kind === 'meta-description-checker') {
    return reportShell('Description check', a.description ? 'Present' : 'Missing',
      '<div class="result-grid">' +
      metric('Characters', a.description.length) +
      metric('Words', (a.description.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu)||[]).length) +
      metric('Preview', a.description || '—') +
      '</div>');
  }
  if (kind === 'meta-tag-checker') {
    const essentials = [
      ['title', !!a.title, a.title || 'Missing'],
      ['description', !!a.description, a.description || 'Missing'],
      ['canonical', !!a.canonical, a.canonical || 'Missing'],
      ['viewport', !!a.viewport, a.viewport || 'Missing'],
      ['lang', !!a.lang, a.lang || 'Missing'],
      ['robots', !!a.robots, a.robots || 'Not set'],
      ['Open Graph', !!a.og.length, a.og.length + ' tag(s)'],
      ['JSON-LD', !!a.jsonld.length, a.jsonld.length + ' block(s)']
    ];
    const missing = essentials.filter((x) => !x[1]).length;
    return reportShell('Head tag inventory', missing ? missing + ' gaps' : 'Core signals present',
      '<div class="result-grid">' + essentials.map((x) => metric(x[0], x[2])).join('') +
      '</div><p class="note">This is a practical head-tag inventory, not a search-engine ranking test.</p>');
  }
  if (kind === 'favicon-checker') {
    const iconLinks = [...a.doc.querySelectorAll('link')].filter((m) => /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(m.getAttribute('rel') || ''));
    const manifest = a.doc.querySelector('link[rel="manifest" i]');
    return reportShell('Favicon inventory', iconLinks.length ? iconLinks.length + ' icon link(s)' : 'No icon link',
      '<div class="result-grid">' + metric('Icon links', iconLinks.length) +
      metric('Manifest', manifest ? 'Found' : 'Not found') +
      metric('HTML lang', a.lang || 'Missing') + '</div>' +
      (iconLinks.length ? iconLinks.map((m) => '<div class="finding"><span class="sev low"></span><div><strong>' +
        escapeHtml(m.getAttribute('rel') || 'icon') + '</strong></div><small>' +
        escapeHtml(m.getAttribute('href') || 'No href') + '</small></div>').join('') :
        '<p class="note">Add at least one favicon link and verify its referenced asset is published.</p>'));
  }
  if (kind === 'hreflang-checker') {
    const links = [...a.doc.querySelectorAll('link[rel="alternate" i][hreflang]')];
    const values = links.map((m) => (m.getAttribute('hreflang') || '').trim().toLowerCase());
    const duplicates = [...new Set(values.filter((v,i)=>values.indexOf(v)!==i))];
    const hasDefault = values.includes('x-default');
    return reportShell('Hreflang inventory', links.length + ' alternate link(s)',
      '<div class="result-grid">' + metric('Alternates', links.length) +
      metric('x-default', hasDefault ? 'Found' : 'Not found') +
      metric('Duplicate values', duplicates.length) + '</div>' +
      (duplicates.length ? duplicates.map((v) => '<div class="finding"><span class="sev med"></span><div><strong>Duplicate hreflang: ' +
        escapeHtml(v) + '</strong></div><small>review</small></div>').join('') :
        '<p class="note">Review the language-region values and make sure each alternate points to the intended URL.</p>'));
  }
  if (kind === 'analytics-tag-checker') {
    const source = (a.doc.documentElement?.outerHTML || '').toLowerCase();
    const patterns = [
      ['Google Tag / GTM', /googletagmanager|gtag\(/],
      ['Google Analytics', /google-analytics|googleanalytics|ga\(['"]create/],
      ['Meta Pixel', /connect\.facebook\.net|fbq\(/],
      ['Plausible', /plausible\.io/],
      ['Hotjar', /hotjar/],
      ['Matomo', /matomo|piwik/
    ];
    const found = patterns.filter((x)=>x[1].test(source)).map((x)=>x[0]);
    return reportShell('Analytics tag scan', found.length ? found.length + ' detected' : 'No common tags detected',
      found.map((v) => '<div class="finding"><span class="sev low"></span><div><strong>' +
        escapeHtml(v) + '</strong></div><small>detected</small></div>').join('') ||
      '<p class="note">No common analytics or tag-manager signatures were detected in the pasted HTML.</p>');
  }
  if (kind === 'image-dimensions-checker') {
    const missingDimensions = a.images.filter((img) => !img.getAttribute('width') || !img.getAttribute('height'));
    return reportShell('Image dimensions', missingDimensions.length ? missingDimensions.length + ' missing dimensions' : 'Dimensions present',
      '<div class="result-grid">' + metric('Images', a.images.length) +
      metric('Missing width/height', missingDimensions.length) +
      metric('Alt coverage', a.images.length ? Math.round((a.images.length-a.missingAlt.length)/a.images.length*100) + '%' : '100%') +
      '</div><p class="note">Width and height attributes give the browser useful layout information before an image finishes loading.</p>');
  }
  if (kind === 'page-size-checker') {
    return reportShell('HTML source size', a.sourceBytes.toLocaleString() + ' bytes',
      '<div class="result-grid">' + metric('Characters', a.sourceChars.toLocaleString()) +
      metric('Bytes', a.sourceBytes.toLocaleString()) +
      metric('Approx. KB', (a.sourceBytes/1024).toFixed(1) + ' KB') + '</div>' +
      '<p class="note">This measures the pasted HTML source only; it does not include images, CSS, JavaScript, fonts, or third-party requests.</p>');
  }
  if (kind === 'canonical-checker') {
    return reportShell('Canonical check', a.canonical ? 'Found' : 'Missing',
      '<div class="result-grid">' + metric('Canonical', a.canonical || '—') +
      metric('Robots', a.robots || '—') + metric('Viewport', a.viewport ? 'Yes' : 'No') + '</div>');
  }
  if (kind === 'heading-checker') {
    return reportShell('Heading structure', a.headings.length + ' headings',
      a.headings.map((h) =>
        '<div class="finding"><span class="sev low"></span><div><strong>' +
        h.tagName + '</strong> ' + escapeHtml(h.textContent.trim().slice(0, 120)) +
        '</div><small>heading</small></div>').join('') +
      (a.h1.length === 1 ? '<p class="note">One H1 found.</p>' :
        '<p class="note status-warn">Review the H1 count.</p>'));
  }
  if (kind === 'image-alt-checker') {
    return reportShell('Image inventory',
      a.missingAlt.length ? a.missingAlt.length + ' missing alt' : 'All have alt',
      '<div class="result-grid">' +
      metric('Total images', a.images.length) +
      metric('Missing alt', a.missingAlt.length) +
      metric('Coverage', a.images.length ? Math.round((a.images.length-a.missingAlt.length)/a.images.length*100) + '%' : '100%') +
      '</div>');
  }
  if (kind === 'link-checker') {
    return reportShell('Link inventory', a.links.length + ' links',
      '<div class="result-grid">' +
      metric('Links', a.links.length) +
      metric('Relative', a.linkStats.relative) +
      metric('Absolute', a.linkStats.absolute) +
      metric('Anchors', a.linkStats.anchors) +
      metric('Empty text', a.emptyLinks.length) +
      '</div><p class="note">Relative links are commonly used for internal navigation; absolute URLs may be internal or external, depending on the site.</p>');
  }
  if (kind === 'schema-validator') {
    const rows = a.jsonld.map((s, i) => {
      try {
        const data = JSON.parse(s.textContent);
        return '<div class="finding"><span class="sev low"></span><div><strong>Block ' +
          (i+1) + '</strong></div><small>' + escapeHtml(data['@type'] || 'No @type') +
          '</small></div>';
      } catch {
        return '<div class="finding"><span class="sev high"></span><div><strong>Block ' +
          (i+1) + ' has invalid JSON</strong></div><small>error</small></div>';
      }
    }).join('');
    return reportShell('JSON-LD blocks', a.jsonld.length + ' found',
      rows || '<p class="note">No JSON-LD blocks found.</p>');
  }
  if (kind === 'open-graph-checker') {
    return reportShell('Open Graph', a.og.length + ' tags',
      a.og.map((m) =>
        '<div class="finding"><span class="sev low"></span><div><strong>' +
        escapeHtml(m.getAttribute('property') || '') + '</strong></div><small>' +
        escapeHtml(m.getAttribute('content') || '') + '</small></div>'
      ).join('') || '<p class="note">No Open Graph tags found.</p>');
  }
  if (kind === 'viewport-checker') {
    return reportShell('Viewport signal', a.viewport ? 'Found' : 'Missing',
      '<div class="codebox">' + escapeHtml(a.viewport || 'No viewport meta tag found') + '</div>');
  }
  return renderAuditReport(a);
}

function renderHtmlChecker(kind, host) {
  host.innerHTML =
    '<h2>Paste page HTML</h2><p class="note">Use view-source or paste the full HTML document.</p>' +
    '<div class="field"><label>HTML source</label><textarea id="html-input" placeholder="&lt;!doctype html&gt;..."></textarea></div>' +
    '<div class="actions"><button class="run-button" id="run">Analyze page</button>' +
    '<button class="clear-button" id="sample">Load sample</button></div>' +
    '<div class="result" id="result">' + reportShell('Results','Waiting','') + '</div>';

  $('#sample').onclick = () => {
    $('#html-input').value =
      '<!doctype html><html lang="en"><head><title>Example Website — Practical Guide</title>' +
      '<meta name="description" content="A practical description for an example page that is long enough to preview well.">' +
      '<link rel="canonical" href="https://example.com/"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta property="og:title" content="Example Website">' +
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example Website"}</script>' +
      '</head><body><h1>Example Website</h1><h2>Guide</h2><img src="/hero.jpg" alt="A sample image">' +
      '<img src="/missing-alt.jpg"></body></html>';
    run();
  };
  $('#run').onclick = run;

  function run() {
    const analysis = analyzeHtml($('#html-input').value);
    $('#result').innerHTML = renderSpecific(kind, analysis);
  }
}

function renderTool(kind, host) {
  const htmlCheckers = [
    'meta-title-checker','meta-description-checker','meta-tag-checker',
    'canonical-checker','heading-checker','image-alt-checker','link-checker',
    'schema-validator','open-graph-checker','viewport-checker',
    'favicon-checker','hreflang-checker','analytics-tag-checker','image-dimensions-checker','page-size-checker'
  ];
  if (htmlCheckers.includes(kind)) return renderHtmlChecker(kind, host);

  if (kind === 'website-audit') {
    host.innerHTML =
      '<h2>Audit a public URL</h2><p class="note">We try a browser fetch first. Cross-origin pages may require the HTML fallback.</p>' +
      '<div class="field"><label>Website URL</label><input id="url-input" placeholder="https://example.com"></div>' +
      '<div class="actions"><button class="run-button" id="run-url">Run audit</button>' +
      '<button class="clear-button" id="load-demo">Load sample HTML</button></div>' +
      '<div class="ad-in-tool">Advertisement</div><details><summary>HTML fallback</summary>' +
      '<div class="field"><label>Paste HTML source</label><textarea id="html-fallback"></textarea></div>' +
      '<button class="clear-button" id="run-html">Analyze pasted HTML</button></details>' +
      '<div class="result" id="result">' + reportShell('Audit results','Waiting','') + '</div>';

    $('#load-demo').onclick = () => {
      const sample = '<!doctype html><html lang="en"><head><title>Sample Site — Owner Guide</title><meta name="description" content="A sample page used to demonstrate the audit report and common website signals."><link rel="canonical" href="https://example.com/guide"><meta name="viewport" content="width=device-width, initial-scale=1"><meta property="og:title" content="Sample Site"><script type="application/ld+json">{\"@context\":\"https://schema.org\",\"@type\":\"Article\",\"headline\":\"Sample Site\"}</script></head><body><h1>Sample Site</h1><h2>Guide</h2><p>This sample demonstrates a local audit.</p><img src="/hero.jpg" alt="Sample hero"></body></html>';
      $('#html-fallback').value = sample;
      host.querySelector('details').open = true;
      $('#result').innerHTML = renderAuditReport(analyzeHtml(sample));
    };
    $('#run-html').onclick = () =>
      $('#result').innerHTML = renderAuditReport(analyzeHtml($('#html-fallback').value));
    $('#run-url').onclick = async () => {
      const url = normalizeUrl($('#url-input').value);
      if (!url) { $('#result').innerHTML = reportShell('Check the URL','Invalid',''); return; }
      $('#result').innerHTML = reportShell('Fetching page…','Working','');
      try {
        const response = await fetch(url, { mode: 'cors' });
        const html = await response.text();
        $('#result').innerHTML = renderAuditReport(analyzeHtml(html));
      } catch {
        $('#result').innerHTML = reportShell('Browser fetch blocked','Use fallback',
          '<p class="note">The target page does not allow a browser cross-origin read. Paste its page source above to continue locally.</p>');
        host.querySelector('details').open = true;
      }
    };
    return;
  }

  if (kind === 'robots-txt-checker') {
    host.innerHTML =
      '<h2>Analyze robots.txt</h2><p class="note">Paste the complete file.</p>' +
      '<textarea id="robots" placeholder="User-agent: *\nDisallow: /private/\nSitemap: https://example.com/sitemap.xml"></textarea>' +
      '<div class="actions"><button class="run-button" id="run">Analyze rules</button>' +
      '<button class="clear-button" id="sample">Load sample</button></div><div class="result" id="result"></div>';
    $('#sample').onclick = () =>
      $('#robots').value = 'User-agent: *\nDisallow: /private/\nDisallow: /tmp/\nSitemap: https://example.com/sitemap.xml';
    $('#run').onclick = () => {
      const lines = $('#robots').value.split(/\r?\n/);
      const rules = lines.filter((x) => /^(user-agent|allow|disallow):/i.test(x));
      const sitemaps = lines.filter((x) => /^sitemap:/i.test(x));
      const blockedRoot = lines.some((x) => /^disallow:\s*\/$/i.test(x));
      const findings = [];
      if (blockedRoot) findings.push(['high','Disallow: / blocks crawling for the matching user-agent']);
      if (!/^user-agent:/im.test($('#robots').value)) findings.push(['med','No User-agent group found']);
      if (!sitemaps.length) findings.push(['low','No Sitemap directive found']);
      $('#result').innerHTML = reportShell('robots.txt report', rules.length + ' directives',
        '<div class="result-grid">' + metric('Rules',rules.length) + metric('Sitemaps',sitemaps.length) +
        metric('Lines',lines.length) + '</div>' +
        findings.map((i) => '<div class="finding"><span class="sev '+i[0]+'"></span><div><strong>'+
          escapeHtml(i[1])+'</strong></div><small>'+i[0]+'</small></div>').join(''));
    };
    return;
  }

  if (kind === 'sitemap-checker') {
    host.innerHTML =
      '<h2>Validate sitemap XML</h2><p class="note">Paste sitemap.xml or a sitemap index.</p>' +
      '<textarea id="xml" placeholder="&lt;urlset&gt;...&lt;/urlset&gt;"></textarea>' +
      '<div class="actions"><button class="run-button" id="run">Validate XML</button>' +
      '<button class="clear-button" id="sample">Load sample</button></div><div class="result" id="result"></div>';
    $('#sample').onclick = () =>
      $('#xml').value = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url><url><loc>https://example.com/about</loc></url></urlset>';
    $('#run').onclick = () => {
      const parsed = new DOMParser().parseFromString($('#xml').value.trim(), 'application/xml');
      const error = parsed.querySelector('parsererror');
      const urls = [...parsed.querySelectorAll('url loc')];
      const childMaps = [...parsed.querySelectorAll('sitemap loc')];
      const problems = [];
      if (error) problems.push(['high','XML parser reported an error']);
      if (!urls.length && !childMaps.length) problems.push(['med','No URL or child-sitemap entries found']);
      $('#result').innerHTML = reportShell('Sitemap report',
        problems.length ? 'Review needed' : 'Looks valid',
        '<div class="result-grid">' + metric('URLs',urls.length) + metric('Child sitemaps',childMaps.length) +
        metric('Findings',problems.length) + '</div>' +
        problems.map((i) => '<div class="finding"><span class="sev '+i[0]+'"></span><div><strong>'+
          escapeHtml(i[1])+'</strong></div><small>'+i[0]+'</small></div>').join(''));
    };
    return;
  }

  if (kind === 'serp-preview') {
    host.innerHTML =
      '<h2>Draft the snippet</h2><p class="note">A visual drafting aid, not a guarantee of the exact search result.</p>' +
      '<div class="row"><div class="field"><label>Title</label><input id="title" maxlength="80" placeholder="Example Website — Helpful Guide"></div>' +
      '<div class="field"><label>URL</label><input id="url" placeholder="https://example.com/guide"></div></div>' +
      '<div class="field"><label>Description</label><textarea id="desc" style="min-height:110px"></textarea></div>' +
      '<div class="result" id="result"></div>';
    ['title','url','desc'].forEach((id) => $('#'+id).addEventListener('input', draw));
    function draw() {
      const title = $('#title').value || 'Example Website — Helpful Guide';
      const url = $('#url').value || 'https://example.com/guide';
      const desc = $('#desc').value || 'A useful description that tells searchers what the page provides.';
      $('#result').innerHTML =
        reportShell('Search preview', title.length + ' title chars',
          '<div style="padding:20px 0"><div style="font-size:13px;color:#1a5f8b">'+escapeHtml(title.slice(0,68))+
          '</div><div style="font-size:10px;color:#55605e;margin:6px 0">'+escapeHtml(url)+'</div>' +
          '<div style="font-size:11px;color:#5f6764;max-width:700px">'+escapeHtml(desc.slice(0,170))+
          '</div></div><div class="result-grid">'+metric('Title length',title.length)+
          metric('Description length',desc.length)+metric('URL length',url.length)+'</div>');
    }
    draw(); return;
  }

  if (kind === 'utm-builder') {
    host.innerHTML =
      '<h2>Build a campaign URL</h2><div class="field"><label>Destination URL</label>' +
      '<input id="base" placeholder="https://example.com/landing-page"></div><div class="row">' +
      '<div class="field"><label>Source</label><input id="source" placeholder="newsletter"></div>' +
      '<div class="field"><label>Medium</label><input id="medium" placeholder="email"></div></div><div class="row">' +
      '<div class="field"><label>Campaign</label><input id="campaign" placeholder="fall-launch"></div>' +
      '<div class="field"><label>Term</label><input id="term" placeholder="optional"></div></div>' +
      '<div class="field"><label>Content</label><input id="content" placeholder="optional"></div>' +
      '<button class="run-button" id="build">Build URL</button><div class="result" id="result"></div>';
    $('#build').onclick = () => {
      const url = normalizeUrl($('#base').value);
      if (!url) { $('#result').innerHTML = reportShell('Enter a valid destination','Needed',''); return; }
      const output = new URL(url);
      [['utm_source','source'],['utm_medium','medium'],['utm_campaign','campaign'],['utm_term','term'],['utm_content','content']]
        .forEach(([key,id]) => { const value = $('#'+id).value.trim(); if (value) output.searchParams.set(key,value); });
      $('#result').innerHTML = reportShell('Campaign URL','Ready','<div class="codebox">'+escapeHtml(output.href)+'</div>');
    };
    return;
  }

  if (kind === 'dns-lookup') {
    host.innerHTML =
      '<h2>Query DNS</h2><p class="note">Browser query through DNS-over-HTTPS.</p><div class="row">' +
      '<div class="field"><label>Domain</label><input id="domain" placeholder="example.com"></div>' +
      '<div class="field"><label>Type</label><select id="type"><option>A</option><option>AAAA</option><option>MX</option><option>TXT</option><option>CNAME</option><option>NS</option></select></div></div>' +
      '<button class="run-button" id="run">Lookup</button><div class="result" id="result"></div>';
    $('#run').onclick = async () => {
      const domain = $('#domain').value.trim(), type = $('#type').value;
      $('#result').innerHTML = reportShell('DNS query','Working','');
      try {
        const response = await fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(domain)+'&type='+encodeURIComponent(type),
          {headers:{accept:'application/dns-json'}});
        const data = await response.json();
        const answers = (data.Answer || []).map((x) => x.data);
        $('#result').innerHTML = reportShell('DNS results',answers.length+' answers',
          answers.map((v) => '<div class="finding"><span class="sev low"></span><div><strong>'+
            escapeHtml(v)+'</strong></div><small>'+type+'</small></div>').join('') ||
          '<p class="note">No answer records were returned.</p>');
      } catch { $('#result').innerHTML = reportShell('Lookup failed','Error',
          '<p class="note">The DNS-over-HTTPS request was blocked or unavailable.</p>'); }
    };
    return;
  }

  if (kind === 'http-headers-checker') {
    host.innerHTML =
      '<h2>Review raw HTTP headers</h2><p class="note">Paste a response header block.</p>' +
      '<textarea id="headers" placeholder="HTTP/2 200\ncontent-type: text/html\ncache-control: public, max-age=3600"></textarea>' +
      '<button class="run-button" id="run" style="margin-top:14px">Analyze headers</button><div class="result" id="result"></div>';
    $('#run').onclick = () => {
      const text = $('#headers').value.toLowerCase();
      const checks = [
        ['content-type',/content-type\s*:/],['cache-control',/cache-control\s*:/],
        ['strict-transport-security',/strict-transport-security\s*:/],
        ['content-security-policy',/content-security-policy\s*:/],
        ['x-content-type-options',/x-content-type-options\s*:/],['x-frame-options',/x-frame-options\s*:/]
      ];
      $('#result').innerHTML = reportShell('Header review',
        checks.filter((x)=>!x[1].test(text)).length+' notable gaps',
        checks.map((x) => {
          const found = x[1].test(text);
          return '<div class="finding"><span class="sev '+(found?'low':'med')+'"></span><div><strong>'+
            escapeHtml(x[0])+'</strong></div><small>'+(found?'found':'not found')+'</small></div>';
        }).join(''));
    };
    return;
  }

  if (kind === 'json-formatter') {
    host.innerHTML = '<h2>Format JSON</h2><p class="note">Validate and pretty-print JSON.</p>' +
      '<textarea id="json" placeholder="{&quot;name&quot;:&quot;Example&quot;}"></textarea>' +
      '<div class="actions"><button class="run-button" id="run">Format</button></div><div class="result" id="result"></div>';
    $('#run').onclick = () => {
      try {
        const output = JSON.stringify(JSON.parse($('#json').value), null, 2);
        $('#result').innerHTML = reportShell('Valid JSON','Ready','<div class="codebox">'+escapeHtml(output)+'</div>');
      } catch (e) {
        $('#result').innerHTML = reportShell('Invalid JSON','Check syntax','<p class="note">'+escapeHtml(e.message)+'</p>');
      }
    };
    return;
  }

  if (kind === 'html-formatter') {
    host.innerHTML = '<h2>Format HTML</h2><p class="note">Format pasted markup for readable inspection.</p>' +
      '<textarea id="html" placeholder="&lt;div&gt;&lt;h1&gt;Hello&lt;/h1&gt;&lt;/div&gt;"></textarea>' +
      '<div class="actions"><button class="run-button" id="run">Format</button></div><div class="result" id="result"></div>';
    $('#run').onclick = () => {
      const input = $('#html').value.trim().replace(/>\s*</g,'><').replace(/></g,'>\n<');
      let depth = 0;
      const output = input.split('\n').map((line) => {
        if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
        const padded = '  '.repeat(depth) + line;
        if (/^<[^!/?][^>]*[^/]?>$/.test(line) && !/<\/[A-Za-z][^>]*>$/.test(line)) depth++;
        return padded;
      }).join('\n');
      $('#result').innerHTML = reportShell('Formatted HTML','Ready','<div class="codebox">'+escapeHtml(output)+'</div>');
    };
    return;
  }

  if (kind === 'word-counter') {
    host.innerHTML = '<h2>Count web copy</h2><p class="note">Paste text or an article draft.</p>' +
      '<textarea id="text" placeholder="Paste text here…"></textarea><div class="result" id="result"></div>';
    $('#text').addEventListener('input', () => {
      const text = $('#text').value;
      const words = (text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu)||[]).length;
      const sentences = (text.match(/[.!?]+(?=\s|$)/g)||[]).length;
      const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/).length : 0;
      $('#result').innerHTML = reportShell('Text count',words+' words',
        '<div class="result-grid">'+metric('Words',words.toLocaleString())+
        metric('Characters',text.length.toLocaleString())+metric('Sentences',sentences)+
        metric('Paragraphs',paragraphs)+metric('Reading time',Math.max(1,Math.ceil(words/200))+' min')+
        '</div>');
    });
    return;
  }

  if (kind === 'json-ld-generator') {
    host.innerHTML =
      '<h2>Generate structured data</h2><div class="row"><div class="field"><label>Type</label>' +
      '<select id="stype"><option>Organization</option><option>Article</option><option>WebSite</option><option>LocalBusiness</option></select></div>' +
      '<div class="field"><label>Name / headline</label><input id="name" placeholder="Example Company"></div></div>' +
      '<div class="row"><div class="field"><label>URL</label><input id="url" placeholder="https://example.com"></div>' +
      '<div class="field"><label>Description</label><input id="desc" placeholder="What the page is about"></div></div>' +
      '<button class="run-button" id="run">Generate JSON-LD</button><div class="result" id="result"></div>';
    $('#run').onclick = () => {
      const type=$('#stype').value, name=$('#name').value||'Example Company',
        url=normalizeUrl($('#url').value)||'https://example.com/', description=$('#desc').value||'';
      const data={'@context':'https://schema.org','@type':type,name,url,description};
      if (type === 'Article') data.headline = name;
      $('#result').innerHTML = reportShell('JSON-LD','Ready','<div class="codebox">'+escapeHtml(JSON.stringify(data,null,2))+'</div>');
    };
    return;
  }

  if (kind === 'robots-generator') {
    host.innerHTML =
      '<h2>Generate robots.txt</h2><div class="row"><div class="field"><label>User-agent</label><input id="ua" value="*"></div>' +
      '<div class="field"><label>Sitemap URL</label><input id="site" placeholder="https://example.com/sitemap.xml"></div></div>' +
      '<div class="field"><label>Disallow paths — one per line</label><textarea id="disallow"></textarea></div>' +
      '<button class="run-button" id="run">Generate file</button><div class="result" id="result"></div>';
    $('#run').onclick = () => {
      const ua=$('#ua').value||'*', site=normalizeUrl($('#site').value),
        paths=$('#disallow').value.split(/\r?\n/).map((x)=>x.trim()).filter(Boolean);
      let out='User-agent: '+ua+'\n'+paths.map((p)=>'Disallow: '+p).join('\n')+'\n';
      if(site) out+='\nSitemap: '+site+'\n';
      $('#result').innerHTML = reportShell('robots.txt','Ready','<div class="codebox">'+escapeHtml(out)+'</div>');
    };
    return;
  }

  if (kind === 'sitemap-generator') {
    host.innerHTML =
      '<h2>Generate an XML sitemap</h2><p class="note">One absolute URL per line.</p>' +
      '<textarea id="urls"></textarea><button class="run-button" id="run" style="margin-top:14px">Generate XML</button>' +
      '<div class="result" id="result"></div>';
    $('#run').onclick = () => {
      const urls=$('#urls').value.split(/\r?\n/).map(normalizeUrl).filter(Boolean);
      const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map((u)=>'  <url><loc>'+escapeHtml(u)+'</loc></url>').join('\n')+'\n</urlset>';
      $('#result').innerHTML = reportShell('Sitemap XML',urls.length+' URLs','<div class="codebox">'+xml+'</div>');
    };
    return;
  }

  if (kind === 'redirect-checker') {
    host.innerHTML =
      '<h2>Inspect redirect headers</h2><p class="note">Paste the first response line and headers from a redirect response.</p>' +
      '<textarea id="redirect" placeholder="HTTP/1.1 301 Moved Permanently\nLocation: https://example.com/new-page"></textarea>' +
      '<button class="run-button" id="run" style="margin-top:14px">Analyze redirect</button><div class="result" id="result"></div>';
    $('#run').onclick = () => {
      const raw = $('#redirect').value.trim();
      const match = raw.match(/^HTTP\/\S+\s+(\d{3})\b/im);
      const status = match ? Number(match[1]) : 0;
      const location = (raw.match(/^location\s*:\s*(.+)$/im) || [,''])[1].trim();
      const isRedirect = status >= 300 && status < 400;
      const finding = !status ? '<p class="note">Could not read an HTTP status line.</p>' :
        isRedirect && !location ? '<div class="finding"><span class="sev med"></span><div><strong>Redirect status without Location</strong></div><small>review</small></div>' :
        isRedirect ? '<div class="finding"><span class="sev low"></span><div><strong>Redirect target</strong></div><small>'+escapeHtml(location)+'</small></div>' :
        '<div class="finding"><span class="sev low"></span><div><strong>No redirect status detected</strong></div><small>HTTP '+status+'</small></div>';
      $('#result').innerHTML = reportShell('Redirect review', status ? 'HTTP '+status : 'Incomplete', finding);
    };
    return;
  }

  if (kind === 'email-dns-checker') {
    host.innerHTML =
      '<h2>Check email DNS records</h2><p class="note">We query DNS over HTTPS for MX, SPF, DMARC, and an optional DKIM selector.</p>' +
      '<div class="row"><div class="field"><label>Domain</label><input id="domain" placeholder="example.com"></div>' +
      '<div class="field"><label>DKIM selector</label><input id="selector" value="default"></div></div>' +
      '<button class="run-button" id="run">Check records</button><div class="result" id="result"></div>';
    $('#run').onclick = async () => {
      const domain = $('#domain').value.trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,'');
      const selector = $('#selector').value.trim();
      if (!domain) { $('#result').innerHTML = reportShell('Enter a domain','Needed',''); return; }
      $('#result').innerHTML = reportShell('Email DNS','Working','');
      const query = async (name,type) => {
        const r = await fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(name)+'&type='+type,{headers:{accept:'application/dns-json'}});
        return (await r.json()).Answer || [];
      };
      try {
        const [mx,txt,dmarc,dkim] = await Promise.all([
          query(domain,'MX'),
          query(domain,'TXT'),
          query('_dmarc.'+domain,'TXT'),
          selector ? query(selector+'._domainkey.'+domain,'TXT') : Promise.resolve([])
        ]);
        const spf = txt.filter(x => /v=spf1/i.test(x.data));
        const records = [
          ['MX', mx.map(x=>x.data).join(' | ') || 'Not found'],
          ['SPF', spf.map(x=>x.data).join(' | ') || 'Not found'],
          ['DMARC', dmarc.map(x=>x.data).join(' | ') || 'Not found'],
          ['DKIM', dkim.map(x=>x.data).join(' | ') || 'Not found']
        ];
        const missing = records.filter(x=>x[1]==='Not found').length;
        $('#result').innerHTML = reportShell('Email DNS report', missing ? missing + ' missing' : 'Records found',
          records.map((x)=>'<div class="finding"><span class="sev '+(x[1]==='Not found'?'med':'low')+'"></span><div><strong>'+escapeHtml(x[0])+'</strong></div><small>'+escapeHtml(x[1])+'</small></div>').join(''));
      } catch {
        $('#result').innerHTML = reportShell('DNS request failed','Error','<p class="note">The DNS-over-HTTPS request was blocked or unavailable.</p>');
      }
    };
    return;
  }

  host.innerHTML = '<h2>Tool ready</h2><p class="note">This focused page is wired into the toolkit and ready for the next implementation pass.</p>';
}

function frame(kind) {
  const names = {
    'website-audit':['Website Audit','AUDIT / 01','A practical page-level health check.'],
    'meta-title-checker':['Meta Title Checker','SEO / 01','Check title presence and length from pasted HTML.'],
    'meta-description-checker':['Meta Description Checker','SEO / 02','Inspect description presence, length, and preview.'],
    'meta-tag-checker':['Meta Tag Checker','SEO / 03','Inspect important HTML head metadata.'],
    'canonical-checker':['Canonical Checker','SEO / 04','Find the rel=canonical URL in pasted HTML.'],
    'heading-checker':['Heading Checker','SEO / 05','Review H1–H6 structure.'],
    'image-alt-checker':['Image Alt Checker','SEO / 06','Find missing or empty image alt text.'],
    'link-checker':['Link Structure Checker','SEO / 07','Review link counts and empty accessible text.'],
    'robots-txt-checker':['Robots.txt Checker','TECH / 01','Analyze directives and sitemap references.'],
    'sitemap-checker':['Sitemap Checker','TECH / 02','Validate sitemap XML.'],
    'schema-validator':['Schema Validator','SEARCH / 01','Inspect JSON-LD blocks.'],
    'open-graph-checker':['Open Graph Checker','SEARCH / 02','Inspect Open Graph metadata.'],
    'serp-preview':['SERP Preview','SEARCH / 03','Draft a search result snippet.'],
    'utm-builder':['UTM Builder','GROWTH / 01','Build campaign URLs.'],
    'dns-lookup':['DNS Lookup','TECH / 03','Query DNS-over-HTTPS.'],
    'http-headers-checker':['HTTP Headers Checker','TECH / 04','Review raw HTTP response headers.'],
    'json-formatter':['JSON Formatter','UTILITY / 01','Validate and pretty-print JSON.'],
    'html-formatter':['HTML Formatter','UTILITY / 02','Format pasted HTML.'],
    'word-counter':['Web Text Counter','CONTENT / 01','Count words and reading time.'],
    'json-ld-generator':['JSON-LD Generator','GENERATORS / 01','Generate JSON-LD schema.'],
    'robots-generator':['Robots.txt Generator','GENERATORS / 02','Generate a robots.txt starter.'],
    'sitemap-generator':['Sitemap Generator','GENERATORS / 03','Generate an XML sitemap.'],
    'viewport-checker':['Viewport Checker','MOBILE / 01','Check viewport metadata.'],
    'favicon-checker':['Favicon Checker','SEO / 08','Review favicon, touch icon, and manifest links.'],
    'hreflang-checker':['Hreflang Checker','SEO / 09','Review multilingual alternate links.'],
    'analytics-tag-checker':['Analytics Tag Checker','GROWTH / 02','Detect common analytics and tag-manager snippets.'],
    'image-dimensions-checker':['Image Dimensions Checker','TECH / 05','Find images missing width or height attributes.'],
    'page-size-checker':['Page Size Checker','TECH / 06','Measure pasted HTML source size.'],
    'redirect-checker':['Redirect Inspector','TECH / 07','Review redirect status and Location headers.'],
    'email-dns-checker':['Email DNS Checker','TECH / 08','Inspect MX, SPF, DMARC, and optional DKIM records.']
  };
  const meta = names[kind] || [kind,'TOOL','Focused website utility'];
  document.title = meta[0] + ' — Website Owner Toolkit';
  const root = $('#tool-app');
  root.innerHTML =
    '<div class="breadcrumb"><a href="../">HOME</a> / '+escapeHtml(meta[1])+'</div>' +
    '<section class="tool-hero"><div><p class="eyebrow">'+escapeHtml(meta[1])+
    '</p><h1>'+escapeHtml(meta[0])+'</h1><p>'+escapeHtml(meta[2])+
    '</p></div><div class="tool-meta"><div><span>01</span><strong>Focused check</strong></div>' +
    '<div><span>02</span><strong>No account</strong></div><div><span>03</span><strong>Browser-first</strong></div></div></section>' +
    '<div class="tool-shell"><div class="panel" id="tool-panel"></div><aside><div class="ad-in-tool">Advertisement</div>' +
    '<div class="side-card"><h3>How to use it</h3><p>Start with one page or source, review the finding, then make the next fix.</p>' +
    '<ul><li>Use one source at a time.</li><li>Fix critical findings first.</li><li>Re-check after publishing.</li></ul></div>' +
    '<div class="side-card"><h3>Privacy-first</h3><p>Browser tools process your input locally where possible. No account is required.</p></div></aside>' +
    '<div class="tool-content"><h2>What this tool checks</h2><p>This page focuses on one practical website job. Results are informational and should be reviewed alongside your normal development and SEO workflow.</p>' +
    '<div class="faq"><article><h3>Does this guarantee rankings?</h3><p>No. Technical checks cannot guarantee search placement.</p></article>' +
    '<article><h3>Can every URL be fetched?</h3><p>No. Browser cross-origin rules can block a direct read; use the relevant fallback.</p></article>' +
    '<article><h3>What should I fix first?</h3><p>Start with missing or contradictory page-level signals, then review structure, links, images, and indexability.</p></article></div></div></div>';
  renderTool(kind, $('#tool-panel'));
}
document.addEventListener('DOMContentLoaded', () => {
  const kind = document.body.dataset.tool;
  if (kind) frame(kind);
});
