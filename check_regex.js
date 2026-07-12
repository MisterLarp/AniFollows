const re = /(?:anilist\.co\/user\/|^)([a-zA-Z0-9_]+)(?:\/|$)/i;
console.log("Msin".match(re));
console.log("https://anilist.co/user/Msin/".match(re));
