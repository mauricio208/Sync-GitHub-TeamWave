const rp = require('request-promise');
const twApiKey = process.env.TEAMWAVE_API_KEY

const teamWaveApiRequest = (apiEndpoint, method, qs, body) => {
  return rp({
    method: method,
    uri: `https://app.teamwave.com/${apiEndpoint}?api_key=${twApiKey}`,
    qs: qs,
    body: body,
    headers: {
      Accept: 'application/json'
    },
    json: true
  });
}

module.exports = teamWaveApiRequest;