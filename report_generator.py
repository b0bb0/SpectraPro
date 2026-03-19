#!/usr/bin/env python3
"""
Report Generator for Vulnerability Analysis
Converts analysis results to multiple formats (JSON, CSV, HTML, TXT)
"""

import json
import csv
import html
import re
from typing import Dict, List, Any
from pathlib import Path
from datetime import datetime


class ReportGenerator:
    """Generate vulnerability analysis reports in multiple formats"""

    def __init__(self, results: Dict[str, Any]):
        """Initialize with analysis results"""
        self.results = results
        self.timestamp = datetime.now()

    def save_json(self, output_file: str) -> bool:
        """Save results as JSON"""
        try:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, 'w') as f:
                json.dump(self.results, f, indent=2)
            return True
        except Exception as e:
            print(f"✗ Error saving JSON: {e}")
            return False

    def save_csv(self, output_file: str) -> bool:
        """Save vulnerability analysis as CSV"""
        try:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            batch_analysis = self.results.get('batch_analysis', [])
            if not batch_analysis:
                print("✗ No batch analysis data to export as CSV")
                return False

            with open(output_file, 'w', newline='') as f:
                fieldnames = ['vulnerability_id', 'name', 'severity', 'analysis', 'timestamp']
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()

                for item in batch_analysis:
                    writer.writerow({
                        'vulnerability_id': item.get('vulnerability_id', 'N/A'),
                        'name': item.get('name', 'N/A'),
                        'severity': item.get('severity', 'N/A'),
                        'analysis': item.get('analysis', '')[:200],  # Truncate for CSV
                        'timestamp': item.get('timestamp', '')
                    })

            return True
        except Exception as e:
            print(f"✗ Error saving CSV: {e}")
            return False

    @staticmethod
    def _esc(text: str) -> str:
        """HTML-escape a string"""
        return (str(text)
                .replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;')
                .replace('"', '&quot;'))

    @staticmethod
    def _md(text: str) -> str:
        """Convert basic LLM markdown to HTML, applied after escaping"""
        if not text:
            return ''
        text = ReportGenerator._esc(text)
        import re
        # Bold
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        # Headings (##, ###)
        text = re.sub(r'^#{2,3}\s+(.+)$', r'<h4>\1</h4>', text, flags=re.MULTILINE)
        # Bullet lists: collapse consecutive lines into <ul>
        def replace_list(m):
            items = re.split(r'\n[*\-]\s+', m.group(0))
            items = [i.lstrip('*- ').strip() for i in items if i.strip()]
            return '<ul>' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>'
        text = re.sub(r'(?:^[*\-]\s+.+\n?)+', replace_list, text, flags=re.MULTILINE)
        # Numbered lists
        def replace_ol(m):
            items = re.split(r'\n\d+[.)]\s+', m.group(0))
            items = [re.sub(r'^\d+[.)]\s+', '', i).strip() for i in items if i.strip()]
            return '<ol>' + ''.join(f'<li>{i}</li>' for i in items) + '</ol>'
        text = re.sub(r'(?:^\d+[.)]\s+.+\n?)+', replace_ol, text, flags=re.MULTILINE)
        # Paragraphs: double newlines
        parts = re.split(r'\n{2,}', text)
        out = []
        for p in parts:
            p = p.strip()
            if not p:
                continue
            if p.startswith('<h4>') or p.startswith('<ul>') or p.startswith('<ol>'):
                out.append(p)
            else:
                out.append(f'<p>{p.replace(chr(10), "<br>")}</p>')
        return '\n'.join(out)

    def save_html(self, output_file: str) -> bool:
        """Save results as a clean, professional HTML report"""
        try:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            meta      = self.results.get('metadata', {})
            batch     = self.results.get('batch_analysis', [])
            risk      = self.results.get('risk_assessment', {})
            vectors   = self.results.get('attack_vectors', {})
            remediation = self.results.get('remediation', [])
            sev_analysis = self.results.get('severity_analysis', {})

            # Severity sort order
            _order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'info': 4}
            batch_sorted = sorted(batch, key=lambda x: _order.get(x.get('severity', 'info').lower(), 5))

            counts = {s: 0 for s in ('critical', 'high', 'medium', 'low', 'info')}
            for v in batch:
                s = v.get('severity', 'info').lower()
                if s in counts:
                    counts[s] += 1

            total = len(batch)
            scan_file = self._esc(meta.get('scan_file', 'N/A'))
            model     = self._esc(meta.get('model', 'N/A'))
            scan_date = self._esc(meta.get('scan_date', 'N/A')[:10] if meta.get('scan_date') else 'N/A')
            analysis_type = self._esc(meta.get('analysis_type', 'N/A'))
            generated = self.timestamp.strftime('%Y-%m-%d %H:%M:%S')

            # SVG donut chart (pure SVG, no JS library)
            # cx=60,cy=60,r=45  circumference=2*pi*45≈282.7
            C = 282.7
            colors = {'critical':'#dc2626','high':'#ea580c','medium':'#d97706','low':'#16a34a','info':'#2563eb'}
            offset = 0
            slices = ''
            for sev in ('critical','high','medium','low','info'):
                n = counts[sev]
                if n == 0 or total == 0:
                    continue
                dash = round((n / total) * C, 2)
                gap  = round(C - dash, 2)
                slices += (
                    f'<circle cx="60" cy="60" r="45" fill="none" stroke="{colors[sev]}" '
                    f'stroke-width="18" stroke-dasharray="{dash} {gap}" '
                    f'stroke-dashoffset="-{offset}" transform="rotate(-90 60 60)"/>'
                )
                offset += dash

            # Severity bars (pre-built to avoid nested f-string issues)
            sev_bar_rows = ''
            for s in ('critical', 'high', 'medium', 'low', 'info'):
                pct = round(counts[s] / total * 100) if total else 0
                sev_bar_rows += (
                    f'<div class="sev-row">'
                    f'<span class="sev-label c-{s}">{s.capitalize()}</span>'
                    f'<div class="sev-bar-track"><div class="sev-bar-fill c-{s}" style="width:{pct}%"></div></div>'
                    f'<span class="sev-count c-{s}">{counts[s]}</span>'
                    f'</div>'
                )

            # Nav links for each section
            nav_sections = [
                ('summary',      'Summary'),
                ('findings',     f'Findings ({total})'),
            ]
            if risk:      nav_sections.append(('risk',        'Risk Assessment'))
            if vectors:   nav_sections.append(('vectors',     'Attack Vectors'))
            if remediation: nav_sections.append(('remediation', 'Remediation'))
            if sev_analysis: nav_sections.append(('severity',  'Severity Analysis'))

            nav_html = ''.join(
                f'<a href="#{sid}">{label}</a>'
                for sid, label in nav_sections
            )

            # Vulnerability cards
            vuln_cards = ''
            for i, v in enumerate(batch_sorted):
                sev   = v.get('severity', 'info').lower()
                name  = self._esc(v.get('name', 'Unknown'))
                vid   = self._esc(v.get('vulnerability_id', 'N/A'))
                ts    = self._esc(v.get('timestamp', '')[:19].replace('T', ' '))
                analysis_html = self._md(v.get('analysis', ''))

                # Pull first sentence as summary for collapsed view
                raw = v.get('analysis', '')
                first_line = raw.strip().split('\n')[0].replace('**','').strip()
                if len(first_line) > 120:
                    first_line = first_line[:117] + '...'
                summary = self._esc(first_line)

                vuln_cards += f'''
        <details class="vuln-card sev-{sev}" {"open" if sev in ("critical","high") else ""}>
          <summary class="vuln-summary">
            <span class="badge badge-{sev}">{sev.upper()}</span>
            <span class="vuln-title">{name}</span>
            <span class="vuln-id">{vid}</span>
            <span class="vuln-chevron">&#8964;</span>
          </summary>
          <div class="vuln-body">
            <p class="vuln-preview">{summary}</p>
            <div class="vuln-analysis">{analysis_html}</div>
            <div class="vuln-meta-row">
              <span class="meta-pill">ID: {vid}</span>
              <span class="meta-pill">Analyzed: {ts}</span>
            </div>
          </div>
        </details>'''

            # Risk section
            risk_html = ''
            if risk and risk.get('assessment'):
                risk_html = f'''
      <section id="risk" class="report-section">
        <h2 class="section-heading">Risk Assessment</h2>
        <div class="prose">{self._md(risk.get("assessment",""))}</div>
      </section>'''

            # Attack vectors section
            vectors_html = ''
            if vectors and vectors.get('vectors'):
                vectors_html = f'''
      <section id="vectors" class="report-section">
        <h2 class="section-heading">Attack Vectors</h2>
        <div class="prose">{self._md(vectors.get("vectors",""))}</div>
      </section>'''

            # Remediation section
            rem_html = ''
            if remediation:
                cards = ''
                for idx, r in enumerate(remediation, 1):
                    rname = self._esc(r.get('vulnerability', 'Unknown'))
                    rtid  = self._esc(r.get('template_id', ''))
                    rcontent = self._md(r.get('recommendations', ''))
                    cards += f'''
          <div class="rem-card">
            <div class="rem-num">{str(idx).zfill(2)}</div>
            <div class="rem-body">
              <div class="rem-title">{rname}</div>
              <div class="rem-tid">{rtid}</div>
              <div class="prose">{rcontent}</div>
            </div>
          </div>'''
                rem_html = f'''
      <section id="remediation" class="report-section">
        <h2 class="section-heading">Remediation</h2>
        <div class="rem-grid">{cards}</div>
      </section>'''

            # Severity analysis section
            sev_html = ''
            if sev_analysis and sev_analysis.get('comparison'):
                sev_html = f'''
      <section id="severity" class="report-section">
        <h2 class="section-heading">Severity Analysis</h2>
        <div class="prose">{self._md(sev_analysis.get("comparison",""))}</div>
      </section>'''

            html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Security Report &mdash; {scan_file}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

  :root {{
    --c-bg:       #f8f9fa;
    --c-surface:  #ffffff;
    --c-border:   #e2e8f0;
    --c-text:     #1a202c;
    --c-muted:    #718096;
    --c-critical: #dc2626;
    --c-high:     #ea580c;
    --c-medium:   #d97706;
    --c-low:      #16a34a;
    --c-info:     #2563eb;
    --c-critical-bg: #fef2f2;
    --c-high-bg:     #fff7ed;
    --c-medium-bg:   #fffbeb;
    --c-low-bg:      #f0fdf4;
    --c-info-bg:     #eff6ff;
    --radius: 8px;
    --shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.05);
    --shadow-md: 0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.05);
  }}

  html {{ scroll-behavior: smooth; }}

  body {{
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    color: var(--c-text);
    background: var(--c-bg);
  }}

  /* ── NAV ── */
  .topnav {{
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--c-surface);
    border-bottom: 1px solid var(--c-border);
    padding: 0 32px;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    white-space: nowrap;
    box-shadow: var(--shadow);
  }}
  .topnav .brand {{
    font-weight: 600;
    font-size: 13px;
    color: var(--c-muted);
    margin-right: 16px;
    letter-spacing: .5px;
    text-transform: uppercase;
    flex-shrink: 0;
  }}
  .topnav a {{
    display: inline-block;
    padding: 14px 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--c-muted);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    transition: color .15s, border-color .15s;
    flex-shrink: 0;
  }}
  .topnav a:hover {{ color: var(--c-text); border-bottom-color: var(--c-text); }}

  /* ── LAYOUT ── */
  .page {{ max-width: 960px; margin: 0 auto; padding: 40px 24px 80px; }}

  /* ── HEADER ── */
  .report-header {{
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: 36px 40px;
    margin-bottom: 32px;
    box-shadow: var(--shadow);
  }}
  .report-header h1 {{
    font-size: 22px;
    font-weight: 600;
    color: var(--c-text);
    margin-bottom: 4px;
  }}
  .report-header .subtitle {{
    font-size: 13px;
    color: var(--c-muted);
    margin-bottom: 24px;
  }}
  .meta-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
    padding-top: 20px;
    border-top: 1px solid var(--c-border);
  }}
  .meta-item label {{
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .6px;
    color: var(--c-muted);
    margin-bottom: 4px;
  }}
  .meta-item span {{
    font-size: 13px;
    font-family: 'DM Mono', monospace;
    color: var(--c-text);
    word-break: break-all;
  }}

  /* ── SUMMARY SECTION ── */
  #summary {{
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 32px;
    align-items: center;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: 32px 40px;
    margin-bottom: 32px;
    box-shadow: var(--shadow);
  }}
  .chart-wrap {{ position: relative; width: 120px; height: 120px; flex-shrink: 0; }}
  .chart-wrap svg {{ width: 120px; height: 120px; }}
  .chart-total {{
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }}
  .chart-total .num {{ font-size: 26px; font-weight: 600; line-height: 1; }}
  .chart-total .lbl {{ font-size: 11px; color: var(--c-muted); margin-top: 2px; }}
  .sev-bars {{ display: flex; flex-direction: column; gap: 10px; }}
  .sev-row {{ display: grid; grid-template-columns: 72px 1fr 32px; gap: 10px; align-items: center; }}
  .sev-label {{ font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }}
  .sev-bar-track {{ height: 8px; background: var(--c-border); border-radius: 4px; overflow: hidden; }}
  .sev-bar-fill {{ height: 100%; border-radius: 4px; transition: width .5s ease; }}
  .sev-count {{ font-size: 13px; font-weight: 600; font-family: 'DM Mono', monospace; text-align: right; }}
  .sev-label.c-critical, .sev-count.c-critical {{ color: var(--c-critical); }}
  .sev-label.c-high,     .sev-count.c-high     {{ color: var(--c-high); }}
  .sev-label.c-medium,   .sev-count.c-medium   {{ color: var(--c-medium); }}
  .sev-label.c-low,      .sev-count.c-low      {{ color: var(--c-low); }}
  .sev-label.c-info,     .sev-count.c-info     {{ color: var(--c-info); }}
  .sev-bar-fill.c-critical {{ background: var(--c-critical); }}
  .sev-bar-fill.c-high     {{ background: var(--c-high); }}
  .sev-bar-fill.c-medium   {{ background: var(--c-medium); }}
  .sev-bar-fill.c-low      {{ background: var(--c-low); }}
  .sev-bar-fill.c-info     {{ background: var(--c-info); }}

  /* ── SECTION ── */
  .report-section {{
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: 32px 40px;
    margin-bottom: 24px;
    box-shadow: var(--shadow);
  }}
  .section-heading {{
    font-size: 16px;
    font-weight: 600;
    color: var(--c-text);
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--c-border);
  }}

  /* ── VULNERABILITY CARDS ── */
  .vuln-stack {{ display: flex; flex-direction: column; gap: 10px; }}

  details.vuln-card {{
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: box-shadow .2s;
  }}
  details.vuln-card[open] {{ box-shadow: var(--shadow-md); }}

  details.vuln-card.sev-critical {{ border-left: 4px solid var(--c-critical); }}
  details.vuln-card.sev-high     {{ border-left: 4px solid var(--c-high); }}
  details.vuln-card.sev-medium   {{ border-left: 4px solid var(--c-medium); }}
  details.vuln-card.sev-low      {{ border-left: 4px solid var(--c-low); }}
  details.vuln-card.sev-info     {{ border-left: 4px solid var(--c-info); }}

  details.vuln-card.sev-critical summary {{ background: var(--c-critical-bg); }}
  details.vuln-card.sev-high     summary {{ background: var(--c-high-bg); }}
  details.vuln-card.sev-medium   summary {{ background: var(--c-medium-bg); }}
  details.vuln-card.sev-low      summary {{ background: var(--c-low-bg); }}
  details.vuln-card.sev-info     summary {{ background: var(--c-info-bg); }}

  summary.vuln-summary {{
    list-style: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    cursor: pointer;
    user-select: none;
  }}
  summary.vuln-summary::-webkit-details-marker {{ display: none; }}

  .badge {{
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .6px;
    padding: 3px 8px;
    border-radius: 4px;
    flex-shrink: 0;
    color: #fff;
  }}
  .badge-critical {{ background: var(--c-critical); }}
  .badge-high     {{ background: var(--c-high); }}
  .badge-medium   {{ background: var(--c-medium); color: #7c2d00; }}
  .badge-low      {{ background: var(--c-low); }}
  .badge-info     {{ background: var(--c-info); }}

  .vuln-title {{
    font-size: 14px;
    font-weight: 500;
    flex: 1;
    color: var(--c-text);
  }}
  .vuln-id {{
    font-size: 12px;
    font-family: 'DM Mono', monospace;
    color: var(--c-muted);
    flex-shrink: 0;
  }}
  .vuln-chevron {{
    font-size: 18px;
    color: var(--c-muted);
    flex-shrink: 0;
    transition: transform .2s;
    margin-left: auto;
  }}
  details[open] .vuln-chevron {{ transform: rotate(180deg); }}

  .vuln-body {{
    padding: 20px 22px;
    border-top: 1px solid var(--c-border);
    background: var(--c-surface);
  }}
  .vuln-preview {{
    font-size: 13px;
    color: var(--c-muted);
    margin-bottom: 16px;
    font-style: italic;
  }}
  .vuln-meta-row {{
    margin-top: 16px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }}
  .meta-pill {{
    font-size: 11px;
    font-family: 'DM Mono', monospace;
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-radius: 4px;
    padding: 3px 8px;
    color: var(--c-muted);
  }}

  /* ── PROSE (LLM text) ── */
  .prose {{ font-size: 14px; line-height: 1.75; color: #374151; }}
  .prose p {{ margin-bottom: 12px; }}
  .prose p:last-child {{ margin-bottom: 0; }}
  .prose strong {{ font-weight: 600; color: var(--c-text); }}
  .prose h4 {{
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .4px;
    color: var(--c-muted);
    margin: 18px 0 8px;
  }}
  .prose ul, .prose ol {{ padding-left: 20px; margin-bottom: 12px; }}
  .prose li {{ margin-bottom: 6px; }}
  .prose br {{ display: block; margin-bottom: 4px; content: ''; }}

  /* ── REMEDIATION ── */
  .rem-grid {{ display: flex; flex-direction: column; gap: 20px; }}
  .rem-card {{
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 20px;
    padding: 20px;
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    background: var(--c-bg);
  }}
  .rem-num {{
    font-size: 28px;
    font-weight: 600;
    font-family: 'DM Mono', monospace;
    color: var(--c-border);
    line-height: 1;
    padding-top: 2px;
  }}
  .rem-title {{ font-size: 14px; font-weight: 600; margin-bottom: 4px; }}
  .rem-tid {{ font-size: 12px; font-family: 'DM Mono', monospace; color: var(--c-muted); margin-bottom: 14px; }}

  /* ── FOOTER ── */
  .report-footer {{
    text-align: center;
    padding: 24px;
    font-size: 12px;
    color: var(--c-muted);
    border-top: 1px solid var(--c-border);
    margin-top: 40px;
  }}

  /* ── PRINT ── */
  @media print {{
    .topnav {{ display: none; }}
    body {{ background: white; }}
    details.vuln-card {{ break-inside: avoid; }}
    details {{ open: true; }}
    .vuln-body {{ display: block !important; }}
  }}

  @media (max-width: 600px) {{
    #summary {{ grid-template-columns: 1fr; }}
    .chart-wrap {{ margin: 0 auto; }}
    .report-section, .report-header {{ padding: 24px 20px; }}
    .topnav {{ padding: 0 16px; }}
  }}
</style>
</head>
<body>

<nav class="topnav">
  <span class="brand">Security Report</span>
  {nav_html}
</nav>

<div class="page">

  <!-- HEADER -->
  <div class="report-header">
    <h1>Vulnerability Analysis Report</h1>
    <div class="subtitle">AI-powered security assessment &mdash; {scan_file}</div>
    <div class="meta-grid">
      <div class="meta-item"><label>Scan File</label><span>{scan_file}</span></div>
      <div class="meta-item"><label>Scan Date</label><span>{scan_date}</span></div>
      <div class="meta-item"><label>Model</label><span>{model}</span></div>
      <div class="meta-item"><label>Analysis Type</label><span>{analysis_type}</span></div>
      <div class="meta-item"><label>Generated</label><span>{generated}</span></div>
    </div>
  </div>

  <!-- SUMMARY -->
  <div id="summary">
    <div class="chart-wrap">
      <svg viewBox="0 0 120 120">
        {slices if slices else '<circle cx="60" cy="60" r="45" fill="none" stroke="#e2e8f0" stroke-width="18"/>'}
      </svg>
      <div class="chart-total">
        <span class="num">{total}</span>
        <span class="lbl">total</span>
      </div>
    </div>
    <div class="sev-bars">
      {sev_bar_rows}
    </div>
  </div>

  <!-- FINDINGS -->
  <section id="findings" class="report-section">
    <h2 class="section-heading">Findings &mdash; {total} vulnerabilities (sorted by severity)</h2>
    <div class="vuln-stack">
      {vuln_cards if vuln_cards else '<p style="color:var(--c-muted)">No findings to display.</p>'}
    </div>
  </section>

  {risk_html}
  {vectors_html}
  {rem_html}
  {sev_html}

</div>

<div class="report-footer">
  Generated {generated} &middot; {model} &middot; Ollama Vulnerability Analysis
</div>

</body>
</html>'''

            with open(output_file, 'w') as f:
                f.write(html_content)
            return True
        except Exception as e:
            print(f"✗ Error saving HTML: {e}")
            return False

    def save_txt(self, output_file: str) -> bool:
        """Save results as plain text report"""
        try:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            metadata = self.results.get('metadata', {})
            batch_analysis = self.results.get('batch_analysis', [])
            risk_assessment = self.results.get('risk_assessment', {})
            attack_vectors = self.results.get('attack_vectors', {})

            lines = []
            lines.append("=" * 80)
            lines.append("VULNERABILITY ANALYSIS REPORT")
            lines.append("=" * 80)
            lines.append("")

            lines.append("METADATA")
            lines.append("-" * 80)
            lines.append(f"Scan File: {metadata.get('scan_file', 'N/A')}")
            lines.append(f"Total Vulnerabilities: {metadata.get('vulnerability_count', 0)}")
            lines.append(f"Model: {metadata.get('model', 'N/A')}")
            lines.append(f"Analysis Type: {metadata.get('analysis_type', 'N/A')}")
            lines.append("")

            lines.append("RISK ASSESSMENT")
            lines.append("-" * 80)
            lines.append(risk_assessment.get('assessment', 'No assessment available'))
            lines.append("")

            lines.append("VULNERABILITIES")
            lines.append("-" * 80)
            for item in batch_analysis:
                lines.append(f"\n[{item.get('severity', 'UNKNOWN').upper()}] {item.get('name', 'Unknown')}")
                lines.append(f"ID: {item.get('vulnerability_id', 'N/A')}")
                lines.append("Analysis:")
                lines.append(item.get('analysis', 'N/A'))
                lines.append("-" * 80)

            if attack_vectors:
                lines.append("\nATTACK VECTORS")
                lines.append("-" * 80)
                lines.append(attack_vectors.get('vectors', 'No analysis available'))
                lines.append("")

            lines.append("=" * 80)
            lines.append(f"Report Generated: {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
            lines.append("=" * 80)

            with open(output_file, 'w') as f:
                f.write('\n'.join(lines))
            return True
        except Exception as e:
            print(f"✗ Error saving TXT: {e}")
            return False

    @staticmethod
    def _md_to_html(text: str) -> str:
        """Convert basic markdown to HTML with XSS prevention.

        Escapes HTML first to prevent XSS, then converts:
        - **bold** to <strong>
        - ### headers to <h3>
        - - list items to <ul><li>
        """
        # Escape HTML to prevent XSS
        text = html.escape(text)
        # Convert markdown bold **text** to <strong>text</strong>
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        # Convert markdown headers ### to <h3>
        text = re.sub(r'^###\s+(.+)$', r'<h3>\1</h3>', text, flags=re.MULTILINE)
        # Convert markdown list items to <ul><li>
        lines = text.split('\n')
        result = []
        in_list = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith('- '):
                if not in_list:
                    result.append('<ul>')
                    in_list = True
                result.append(f'<li>{stripped[2:]}</li>')
            else:
                if in_list:
                    result.append('</ul>')
                    in_list = False
                result.append(line)
        if in_list:
            result.append('</ul>')
        return '\n'.join(result).strip()

    @staticmethod
    def _generate_vulnerability_html(item_or_list) -> str:
        """Generate HTML for vulnerability items.

        Accepts a single vulnerability dict or a list of dicts.
        """
        if isinstance(item_or_list, dict):
            vulnerabilities = [item_or_list]
        else:
            vulnerabilities = item_or_list

        result = ""
        for item in vulnerabilities:
            severity = item.get('severity', 'info').lower()
            name = html.escape(item.get('name', 'Unknown'))
            vuln_id = html.escape(item.get('id', item.get('vulnerability_id', 'N/A')))
            analysis_raw = item.get('analysis', 'No analysis available')
            analysis_html = ReportGenerator._md_to_html(analysis_raw)
            result += f"""
        <div class="vulnerability-card severity-{severity}">
            <div class="vuln-name">{name}</div>
            <span class="vuln-severity badge-{severity}">{severity.upper()}</span>
            <div style="font-size: 0.85em; color: #666; margin: 10px 0;">
                <strong>ID:</strong> {vuln_id}
            </div>
            <div class="vuln-analysis">
                {analysis_html}
            </div>
        </div>
"""
        return result if result else "<p>No vulnerabilities to display</p>"

    def save(self, output_file: str, format: str = 'json') -> bool:
        """Save results in specified format"""
        format = format.lower().strip()

        if format == 'json':
            return self.save_json(output_file)
        elif format == 'csv':
            return self.save_csv(output_file)
        elif format == 'html':
            return self.save_html(output_file)
        elif format == 'txt':
            return self.save_txt(output_file)
        else:
            print(f"✗ Unknown format: {format}")
            return False
