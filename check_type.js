const q = { query: '{ __type(name: "ActivityType") { enumValues { name } } }' };
fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(q)
}).then(r => r.json()).then(j => console.log(j.data.__type.enumValues));
