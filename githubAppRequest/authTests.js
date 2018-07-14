const fs = require('fs')
const jwt = require('jsonwebtoken');
const rp = require('request-promise')

const cert = fs.readFileSync('private-key.pem');

var requestJWT = (puri, method) =>{
  var token = jwt.sign({}, cert, { algorithm: 'RS256',expiresIn:'10m',issuer:'8798'})
  var testr = rp({
    method:method,
    uri: `https://api.github.com/${puri}`,
    qs: {
    },
    headers: {
      'User-Agent': 'WaveGitSyncroTest',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.machine-man-preview+json'
    }
  });
  return testr;
}

var requestAsInstalation = (puri, method, token) =>{
  var testr = rp({
    method:method,
    uri: `https://api.github.com/${puri}`,
    qs: {
    },
    headers: {
      'User-Agent': 'WaveGitSyncroTest',
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.machine-man-preview+json'
    }
  });
  return testr;
}

var test = ()=>{
  //First TEST
  requestJWT('installations/85520/access_tokens','POST').then(data=>{
    requestAsInstalation('repos/mauricio208/freelance/issues','GET',data.token).then(issues=>{
      console.log(issues)
      return issues;
    })
  })
}