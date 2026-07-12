const q = { query: '{ __type(name: "Page") { fields { name args { name type { name kind } } } } }' };
fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) }).then(r => r.json()).then(j => {
  const notifField = j.data.__type.fields.find(f => f.name === 'notifications');
  console.log('Notifications args:', JSON.stringify(notifField.args, null, 2));
});
