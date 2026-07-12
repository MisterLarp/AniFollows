const q = { query: '{ __type(name: "ActivityLikeNotification") { fields { name type { name kind } } } }' };
fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) }).then(r => r.json()).then(j => console.log(JSON.stringify(j.data.__type.fields, null, 2)));
