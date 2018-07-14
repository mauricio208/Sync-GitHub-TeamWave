
rr = require('request-promise');
var ttr = (apiEndpoint, method, qs,body) => {
//    qs['api_key'] = twApiKey;
   return rp({
    method: method,
    uri: `https://app.teamwave.com/${apiEndpoint}?api_key=${twApiKey}`,
    qs: qs,
    body:body,
    headers: {
    Accept: 'application/json',
    },
    json: true
   });
 }

ttr('api/projects/11699/taskgroups/23994/tasks/114094','GET').then(i=>console.log(i))
