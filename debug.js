// ─── AniList API Debug Tool ───────────────────────────────────────────────────
// Paste this into the AniList console to diagnose what's wrong
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  console.group('%c🔍 AniList API Debug', 'font-size:16px;font-weight:bold;color:#02a9ff');
  
  const TOKEN_KEY = 'alf_token';
  const token = localStorage.getItem(TOKEN_KEY);
  
  console.log('Stored token:', token ? `✅ Found (${token.length} chars)` : '❌ NOT FOUND — need to auth first');

  // Test 1: Public query (no auth needed)
  console.group('Test 1: Public GraphQL query (no auth)');
  try {
    const r1 = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: '{ Media(id: 1) { id title { romaji } } }' })
    });
    const j1 = await r1.json();
    console.log('HTTP Status:', r1.status);
    console.log('Response:', j1);
    if (r1.status === 200) console.log('%c✅ Endpoint works!', 'color:green;font-weight:bold');
    else console.log('%c❌ Endpoint failed', 'color:red;font-weight:bold');
  } catch(e) { console.error('Fetch failed:', e); }
  console.groupEnd();

  // Test 2: Auth query (needs token)
  if (token) {
    console.group('Test 2: Authenticated Viewer query');
    try {
      const r2 = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: '{ Viewer { id name } }' })
      });
      const j2 = await r2.json();
      console.log('HTTP Status:', r2.status);
      console.log('Response:', j2);
      if (j2.data?.Viewer) {
        console.log(`%c✅ Logged in as: ${j2.data.Viewer.name} (id: ${j2.data.Viewer.id})`, 'color:green;font-weight:bold');
      } else {
        console.log('%c❌ Auth failed — token invalid or expired', 'color:red;font-weight:bold');
        console.log('Hint: Clear token with: localStorage.removeItem("alf_token")');
      }
    } catch(e) { console.error('Fetch failed:', e); }
    console.groupEnd();
  } else {
    console.log('%c⚠️ Skipping auth test — no token stored', 'color:orange');
    console.log('Hint: Run the app first and complete the auth flow');
  }

  // Test 3: Check stored viewer
  const viewer = localStorage.getItem('alf_viewer');
  console.group('Test 3: Cached viewer profile');
  if (viewer) {
    try { console.log('Cached viewer:', JSON.parse(viewer)); }
    catch { console.log('Malformed viewer JSON in localStorage'); }
  } else {
    console.log('No cached viewer found');
  }
  console.groupEnd();

  // Summary
  console.group('LocalStorage keys set by AniFollows');
  ['alf_token','alf_viewer','alf_whitelist','alf_follow_history','alf_timings','alf_session_guard'].forEach(k => {
    const v = localStorage.getItem(k);
    console.log(k + ':', v ? `✅ Set (${v.length} chars)` : '— not set');
  });
  console.groupEnd();

  console.groupEnd();
})();
