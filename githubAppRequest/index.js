const fs = require('fs');
const jwt = require('jsonwebtoken');
const rp = require('request-promise');
const appId = process.env.GIT_APP_ID;
const appName = process.env.GIT_APP_NAME;
const installationId = process.env.GIT_APP_INSTALLATION_ID;
console.log(process.env.GIT_APP_RSA_KEY)
const cert = fs.readFileSync(process.env.GIT_APP_RSA_KEY);

const requestJWT = (endpointUri, method) => {
  var token = jwt.sign({}, cert, { algorithm: 'RS256', expiresIn: '10m', issuer: appId });
  return rp({
    method: method,
    uri: `https://api.github.com/${endpointUri}`,
    qs: {},
    headers: {
      'User-Agent': appName,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.machine-man-preview+json'
    },
    json: true
  });
}

const requestAsInstalation = (endpointUri, method, qs, body, token) => {
  qs = qs||{};
  body = body||{};
  return rp({
    method: method,
    uri: `https://api.github.com/${endpointUri}`,
    qs: qs,
    body: body,
    headers: {
      'User-Agent': appName,
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.machine-man-preview+json'
    },
    json: true
  });
}

const installationTokenRequest = () => {
  return requestJWT(`installations/${installationId}/access_tokens`, 'POST');
}

const requestGithubApi = (apiEndpoint, method, qs, body) => {
  return installationTokenRequest().then((data)=>{
    return requestAsInstalation(apiEndpoint, method, qs, body, data.token);
  })
}

module.exports = requestGithubApi;