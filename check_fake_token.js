const q = { query: '{ User(name: "Msin") { id name } }' };
fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer fake' },
  body: JSON.stringify(q)
}).then(r => { console.log(r.status); return r.json(); }).then(console.log);
