const path = require('path');
require('dotenv').config({path: path.join(__dirname, ".env")});
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const rp = require('request-promise');
const CronJob = require('cron').CronJob;
const grq = require('./githubAppRequest');
const trq = require('./teamwaveRequest');
const gitTag = process.env.TEAMWAVE_GIT_LABEL
const teamwaveTag = process.env.GIT_TEAMWAVE_LABEL
const twApiKey = process.env.TEAMWAVE_API_KEY
const adapter = new FileSync('db.json')
const usersadapter = new FileSync('githubUsers.json');
const db = low(adapter);
const dbUsers = low(usersadapter);

db.defaults({tasksIssues:[],
  unsyncTasks:[],
  gettingTasks:false,
  requestsCount: 0,
  projectRotation:2,
  githubUsers:{}  
}).write()

const updateReqCount = ()=>{
  db.update('requestsCount', n => n + 1).write();
}

const githubApiRequest = (...args)=>{
  updateReqCount();
  return grq.apply(this,args);
}
const teamWaveApiRequest = (...args)=>{
  updateReqCount();
  return trq.apply(this,args);
}

const getGithubUser = (taskTitle)=>{
  var githubLogin = null;
  var userRe = /\[(\s*\w+\s*)\]/g;
  var bracketName = taskTitle.match(userRe)
  if (bracketName) {
    var teamwaveName = bracketName[0].match(/\w+/)[0];
    var login = dbUsers.get('githubUsers')
      .find({'teamwaveRef':teamwaveName.toLowerCase()})
      .value()
    githubLogin = login ? login.githubLogin:null;
  }
  return githubLogin;
}

const resetCount = ()=>{
  db.update('requestsCount',n=>0)
  .write()
}
const delay = (milliseconds) => {
  return function(result) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        resolve(result);
      }, milliseconds);
    });
  };
}
const storeTasks = (tasks) =>{
  tasks = tasks.map(t=>{return {id:t.id, url:t.resource_url}});
  return db.get('unsyncTasks')
    .push(...tasks)
    .write()
}

const deleteTask = (taskId) => {
  return db.get('unsyncTasks').remove({id:taskId}).write()
} 

const syncTasks = () =>{
  var syncTaskLess = Math.floor((500 - db.get('requestsCount').value())/2);
  if (syncTaskLess > 0) {
    var tasks=db.get('unsyncTasks').value().slice(0,syncTaskLess);
    for(t of tasks){
      syncTaskToIssue(t)
    }
  }
}
const twDelay = () =>{
  return delay(process.env.TEAMWAVE_REQUEST_DELAY)
}

const getTags = (tags)=>{
  return Object.values(tags).map((t)=>t.tag)
}

const createGithubTask = (body) => {
  return githubApiRequest(`repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/issues`, 'POST', {}, body)
}
const getAttachments = (attachments_detail) =>{
  
  var markdownLink = (attach) =>`<a href="${attach.attachment}">${attach.title}</a>`;
  var attachments = attachments_detail.map(attach=>markdownLink(attach))
  return '<br><br>Attachments:<br>'+attachments.join('<br>')
}
const syncTaskToIssue = (task)=>{
  //Because task object dont have description :/
  return teamWaveApiRequest(`api${task.url}`, 'GET')
  .then(twDelay())
  .then(task=>{
    //Now this task objec should have description
    var ttags = getTags(task.tags);
    ttags.splice(ttags.indexOf(gitTag),1);
    ttags.push(teamwaveTag, task.project_name);
    var assignees = [];
    var dueDate = "";
    var githubUser = getGithubUser(task.name);
    if (githubUser) {
      assignees.push(githubUser);
    }
    if (task.due_date) {
      dueDate = ` [Due date: ${task.due_date}]`;
    }
    var issueData ={
      'title': task.name+dueDate,
      'body': task.description+getAttachments(task.attachments_detail),
      'labels': ttags,
      'assignees':assignees
    }
    createGithubTask(issueData).then(issue=>{
      deleteTask(task.id);
      var actualDesc = task.description||'';
      var issueLink = `<a href="${issue.html_url}">Go to issue on Github</a><br><br>`;
      var taskDesc = issueLink+actualDesc;
      teamWaveApiRequest(`api${task.resource_url}`, 'PATCH', {}, { description: taskDesc}).then(()=>{
        db.get('tasksIssues')
          .push({ teamwaveTaskId: task.id, githubIssueId: issue.id, teamwaveTaskUrl: task.resource_url, githubIssueUrl: issue.html_url})
          .write()
      });
    })
  });
}

const syncTasksGroupsList = (results, actualTasksSync, tasksToSync) =>{
  var allTasks = results.reduce((ta,t)=>{
    if(t){
      return [...ta,...t.tasks]
    }else{
      return [...ta]
    }
  },[]);
  var tasksTeamW = allTasks.filter((t) => { 
    return (t.tags && 
      getTags(t.tags).includes(gitTag) && 
      !actualTasksSync.includes(t.id) &&
      !tasksToSync.includes(t.id)
      )
  });
  console.log('taskstosync', allTasks.length)
  console.log('after filter', tasksTeamW.length)
  
  if (tasksTeamW.length>0) {
    console.log(`Syncronizing ${tasksTeamW.length} tasks`);
  }
  storeTasks(tasksTeamW);
  
  // return tasksTeamW.reduce((lastPromisedTask, actualTask)=>{
  //   return lastPromisedTask.then(5000)
  //     .then(()=>syncTaskToIssue(actualTask))
  // },Promise.resolve())
}

const syncProject = (tasksGroupsList, actualTasksSync, tasksToSync) => {
  var twRp = [];
  var results = tasksGroupsList.results;
  if (results[0]){
    console.log('TOSYNC THIS GROUPS',tasksGroupsList.results[0].name)
    var re = /\d+/i;
    var projectId = re.exec(results[0].resource_url)[0];
    var pages = [...Array(tasksGroupsList.count).keys()].slice(2).map(i=>new Promise(r=>r(i)));
    return pages.reduce((promiseChain, currentPage) => {
      return promiseChain.then(chainResults =>
        currentPage.then(delay(5000)).then(page =>{
          return teamWaveApiRequest(`api/projects/${projectId}/taskgroups`, 'GET', {page:page});
        }).then(currentResult=>[...chainResults, currentResult.results[0]])
      );
    }, Promise.resolve(results)).then(results=>syncTasksGroupsList(results, actualTasksSync, tasksToSync))
  }
  return Promise.resolve();
};

const sync = () => {
  requestsCount = db.get('requestsCount').value();
  if (requestsCount<450) {
    teamWaveApiRequest('api/projects', 'GET')
    .then((projectsList)=>{
      var rotation=db.get('projectRotation').value();
      if (rotation >= projectsList.length) {
        db.update('projectRotation', r=>0).write();
      }else{
        db.update('projectRotation', r=>r+2).write();
      }
      var tail=projectsList.splice(0,rotation);
      projectsList = projectsList.concat(tail);
      db.update('gettingTasks', b=>true).write();
      console.log('PROJECTS TO SYNC:',projectsList.length)
      var actualTasksSync = db.get('tasksIssues').map('teamwaveTaskId').value();
      var tasksToSync = db.get('unsyncTasks').map('id').value();
      projectsList.reduce((promiseChain, currentProject)=>{
        return promiseChain.then(delay(15000))
          .then(()=>{
            return teamWaveApiRequest(`api/projects/${currentProject.id}/taskgroups`, 'GET')
              .then(tasksGroupsList =>{
                console.log('tgl sync ->')
                return syncProject(tasksGroupsList,actualTasksSync, tasksToSync);
              })
          })
      },Promise.resolve()).then(()=>{
        db.update('gettingTasks', b=>false).write();
      })

    })
  }
};

var jobResetRequestCount = new CronJob(process.env.JOB_RESET_COUNT , resetCount, null, true, 'Europe/Copenhagen');
var jobSyncTasksFirst = new CronJob(process.env.JOB_ST_F , syncTasks, null, true, 'Europe/Copenhagen');
var jobGetTasks = new CronJob(process.env.JOB_GET_TS, sync, null, true, 'Europe/Copenhagen');
var jobSyncTasks = new CronJob(process.env.JOB_ST, syncTasks, null, true, 'Europe/Copenhagen');

// setInterval(sync, process.env.INTERVAL_MILLISECS);
// setInterval(syncTasks, process.env.INTERVAL_MILLISECS);
