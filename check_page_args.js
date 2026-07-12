const q = { query: '{ __schema { queryType { fields { name args { name } } } } }' };
fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) }).then(r => r.json()).then(j => {
  const pageArgs = j.data.__schema.queryType.fields.find(f => f.name === 'Page').args;
  console.log('Page args:', pageArgs);
});
