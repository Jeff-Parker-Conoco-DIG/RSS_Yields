/**
 * WITS Channel Diagnostic — paste this into the browser console
 * while the YieldTracker app is running on Nabors X04.
 * 
 * It fetches the latest record from both raw WITS and summary-1ft,
 * merges them, and dumps ALL data.* fields grouped by category.
 */
(async () => {
  const assetId = 74307056;
  const apiKey = ''; // Leave empty if using Corva SDK in-app
  
  const headers = apiKey 
    ? { 'Authorization': `API ${apiKey}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  const fetchData = async (path) => {
    try {
      const url = `https://data.corva.ai${path}?query=${encodeURIComponent(JSON.stringify({asset_id: assetId}))}&sort=${encodeURIComponent(JSON.stringify({timestamp: -1}))}&limit=1`;
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.[0]?.data ?? null;
    } catch { return null; }
  };

  console.log('Fetching raw WITS + summary-1ft...');
  const [raw, summary] = await Promise.all([
    fetchData('/api/v1/data/corva/wits/'),
    fetchData('/api/v1/data/corva/wits.summary-1ft/'),
  ]);

  const merged = { ...summary, ...raw };
  const entries = Object.entries(merged)
    .filter(([_, v]) => v != null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b));

  // Categorize channels
  const categories = {
    'RSS/iCruise': [],
    'MWD': [],
    'Toolface': [],
    'Shock/Vibe': [],
    'Survey': [],
    'Depth/Position': [],
    'Drilling Parameters': [],
    'AutoDriller': [],
    'Other': [],
  };

  for (const [key, value] of entries) {
    const k = key.toLowerCase();
    if (k.includes('rss') || k.includes('icruise') || k.includes('ic_') || k.includes('possum') || k.includes('psum')) {
      categories['RSS/iCruise'].push([key, value]);
    } else if (k.includes('tool_face') || k.includes('toolface') || k.includes('tf')) {
      categories['Toolface'].push([key, value]);
    } else if (k.includes('shock') || k.includes('vib') || k.includes('lateral') || k.includes('axial') || k.includes('hfto') || k.includes('whirl') || k.includes('slip') || k.includes('stick')) {
      categories['Shock/Vibe'].push([key, value]);
    } else if (k.includes('mwd') || k.includes('gamma') || k.includes('telemetry')) {
      categories['MWD'].push([key, value]);
    } else if (k.includes('inc') || k.includes('azi') || k.includes('survey') || k.includes('dip') || k.includes('magnetic')) {
      categories['Survey'].push([key, value]);
    } else if (k.includes('depth') || k.includes('position') || k.includes('bit_') || k.includes('hole_')) {
      categories['Depth/Position'].push([key, value]);
    } else if (k.includes('ad_') || k.includes('setpoint') || k.includes('autodriller')) {
      categories['AutoDriller'].push([key, value]);
    } else if (k.includes('wob') || k.includes('rop') || k.includes('rpm') || k.includes('torque') || k.includes('pressure') || k.includes('flow') || k.includes('weight') || k.includes('spp')) {
      categories['Drilling Parameters'].push([key, value]);
    } else {
      categories['Other'].push([key, value]);
    }
  }

  // Print results
  console.log(`\n${'='.repeat(80)}`);
  console.log(`WITS CHANNEL DIAGNOSTIC — Asset ${assetId} — ${new Date().toLocaleString()}`);
  console.log(`Total channels with data: ${entries.length}`);
  console.log(`${'='.repeat(80)}\n`);

  for (const [category, channels] of Object.entries(categories)) {
    if (channels.length === 0) continue;
    console.log(`\n--- ${category} (${channels.length} channels) ---`);
    for (const [key, value] of channels) {
      const v = typeof value === 'number' ? value.toFixed(4) : String(value);
      console.log(`  ${key.padEnd(45)} ${v}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('Done. Copy this output and share it.');
  console.log(`${'='.repeat(80)}\n`);
})();
