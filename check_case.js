const q1 = { query: '{ User(name: "msin") { id name } }' };
const q2 = { query: '{ User(name: "Msin") { id name } }' };

Promise.all([
  fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q1) }).then(r => r.json()),
  fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q2) }).then(r => r.json())
]).then(console.log);
