const diff3Merge = require('node-diff3').diff3Merge;   // UMD import named
const fs = require('fs');
const prompt = require('prompt-sync')();
const https = require('https');
const { exit } = require('process');
var rp = require('request-promise');

const file1_name = "file1.md";
const file2_name = "file2.tsv";

var host = "https://qa.door43.org";
var token = "token c8b93b7ccf7018eee9fec586733a532c5f858cdd";
var org = "dcs-poc-org";
var repo = "dcs-resolve-conflict-poc";
var branch = "user-tc-create-1";

async function setup() {
  const host_input = prompt(`Enter host URL [${host}]: `);
  if (host_input) {
    host = host_input;
  }
  const token_input = prompt(`Enter your API token [use token for dcs-poc user]: `);
  if (token_input) {
    token = token_input;
  }
  const org_input = prompt(`Enter the name of an org owned by token user [${org}]: `);
  if (org_input) {
    org = org_input;
  }
  const repo_input = prompt(`Enter the name of the repo to use in the ${org} org [${repo}] (If repo exists, it will be deleted!): `);
  if (repo_input) {
    repo = repo_input;
  }
  const branch_input = prompt(`Enter the name of the user branch [${branch}]: `);
  if (branch_input) {
    branch = branch_input;
  }

  console.log("Org: "+org);
  console.log("Repo: "+repo);
  console.log("User branch: "+branch);
  console.log("DCS URL: "+host+"/"+org+"/"+repo);

  /* DELETE REPO IF EXISTS */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}`, method: 'DELETE', headers: {'Authorization': token}, json:true});
    console.log("DELETED EXISING REPO.");
  } catch (error) {
    if (error.statusCode == "404") {
      console.log("REPO DOESN'T EXIST, SKIPPING");
    } else {
      console.log("ERROR DELETING REPO:");
      console.log(error.error);
      exit(1);
    }
  }

  /* CREATE REPO*/
  try {
    res = await rp({uri: `${host}/api/v1/orgs/${org}/repos`, method: 'POST', headers: {'Authorization': token}, json: {
      auto_init: true, 
      default_branch: "master", 
      description: repo, 
      license: "CC-BY-SA-4.0.md", 
      name: repo, 
      private: false, 
      readme: "Default"
    }});
    console.log("CREATED REPO.");
  } catch (error) {
    console.log("ERROR CREATING REPO:");
    console.log(error.error);
    exit(1);
  }

  process.chdir(__dirname);

  file1 = fs.readFileSync(file1_name, 'utf8');
  user_file1 = fs.readFileSync(`user_modified_${file1_name}`, 'utf8');
  master_file1 = fs.readFileSync(`master_modified_${file1_name}`, 'utf8');

  file2 = fs.readFileSync(file2_name, 'utf8');
  user_file2 = fs.readFileSync(`user_modified_${file2_name}`, 'utf8');
  master_file2 = fs.readFileSync(`master_modified_${file2_name}`, 'utf8');

  /* CREATE file1.md IN master */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${file1_name}`, method: 'POST', headers: {'Authorization': token}, json: {
      branch: "master",
      content: Buffer.from(file1).toString('base64'),
      message: `Creates ${file1_name}`
    }});
    console.log(`CREATED ${file1_name}.`);
  } catch (error) {
    console.log(`ERROR CREATING FILE ${file1_name}:`);
    console.log(error.error);
    exit(1);
  }

  const file1_sha = res.content.sha;
  
  /* CREATE file2.tsv IN master */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${file2_name}`, method: 'POST', headers: {'Authorization': token}, json: {
      branch: "master",
      content: Buffer.from(file2).toString('base64'),
      message: `Creates ${file2_name}`
    }});
    console.log(`CREATED ${file2_name}.`);
  } catch (error) {
    console.log(`ERROR CREATING FILE ${file2_name}:`);
    console.log(error.error);
    exit(1);
  }

  const file2_sha = res.content.sha;
  
  /* CHANGE file1.md IN USER BRANCH*/
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${file1_name}`, method: 'PUT', headers: {'Authorization': token}, json: {
      branch: "master",
      content: Buffer.from(user_file1).toString('base64'),
      message: `Modifies ${file1_name} in branch ${branch}`,
      new_branch: branch,
      sha: file1_sha
    }});
    console.log(`UPDATED ${file1_name} IN NEW BRANCH ${branch}.`);
  } catch (error) {
    console.log(`ERROR UPDATING FILE ${file1_name} AND CREATING BRANCH ${branch}:`);
    console.log(error.error);
    exit(1);
  }
 
   /* CHANGE file2.tsv IN USER BRANCH*/
   try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${file2_name}`, method: 'PUT', headers: {'Authorization': token}, json: {
      branch: branch,
      content: Buffer.from(user_file2).toString('base64'),
      message: `Modifies ${file2_name} in branch ${branch}`,
      sha: file2_sha
    }});
    console.log(`UPDATED ${file1_name} IN ${branch}.`);
  } catch (error) {
    console.log(`ERROR UPDATING FILE ${file1_name} AND CREATING BRANCH ${branch}:`);
    console.log(error.error);
    exit(1);
  }
 
  /* CHANGE file1.md IN master */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${file1_name}`, method: 'PUT', headers: {'Authorization': token}, json: {
      branch: "master",
      content: Buffer.from(master_file1).toString('base64'),
      message: `Modifies ${file1_name} in branch master`,
      sha: file1_sha
    }});
    console.log(`UPDATED ${file1_name} IN master.`);
  } catch (error) {
    console.log(`ERROR UPDATING FILE ${file1_name} IN master:`);
    console.log(error.error);
    exit(1);
  }

  /* CHANGE file2.tsv IN master */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${file2_name}`, method: 'PUT', headers: {'Authorization': token}, json: {
      branch: "master",
      content: Buffer.from(master_file1).toString('base64'),
      message: `Modifies ${file2_name} in branch master`,
      sha: file2_sha
    }});
    console.log(`UPDATED ${file2_name} IN master.`);
  } catch (error) {
    console.log(`ERROR UPDATING FILE ${file1_name} IN master:`);
    console.log(error.error);
    exit(1);
  }

  /* CREATE PR FOR master INTO user branch */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/pulls`, method: 'POST', headers: {'Authorization': token}, json: {
      base: branch,
      head: "master",
      title: `master into ${branch}`,
      body: `Merging master into ${branch}`,
    }});
    console.log(`CREATED PR ${res.url}`);
  } catch (error) {
    console.log(`ERROR CREATING PR FOR master INTO ${branch}:`);
    console.log(error.error);
    exit(1);
  }

  const pr_num = res.number;
  const pr_url = res.url;
  const diff_url = res.diff_url;
  const patch_url = res.patch_url;
  const mergeable = res.mergeable;
  const merge_base = res.merge_base;
  
  console.log("PR NUM:", pr_num);
  console.log("PR URL:", pr_url);
  console.log("DIFF URL:", diff_url);
  console.log("PATCH URL:", patch_url);
  console.log("IS MERGEABLE", mergeable);

  return pr_num;
}

setup().then(pr_num => {
  console.log(`Setup complete! PR #: ${pr_num}`);
});
