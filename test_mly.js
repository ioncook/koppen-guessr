fetch('https://graph.mapillary.com/images?access_token=MLY%7C5030248440364963%7Cf28946761030e2f5b33bc3a2d201ea1f&fields=id&bbox=-122.42,37.77,-122.41,37.78&limit=1')
  .then(r => r.json())
  .then(d => console.log("Mapillary Test SUCCESS:", d))
  .catch(e => console.error("Mapillary Test FAILED:", e));
