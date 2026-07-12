const q = {
  query: `query ($userId: Int!, $page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      followers(userId: $userId, sort: ID) {
        id name
      }
    }
  }`,
  variables: { userId: 8121476, page: 1, perPage: 10 }
};

fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(q)
})
.then(r => { console.log('Status:', r.status); return r.json(); })
.then(j => console.dir(j, {depth: null}));
