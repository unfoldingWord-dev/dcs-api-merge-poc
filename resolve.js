const diff3Merge = require('node-diff3').diff3Merge;   // UMD import named
const fs = require('fs');
const prompt = require('prompt-sync')();
const https = require('https');
const { exit } = require('process');
var rp = require('request-promise');
var parse_diff = require('parse-diff');
var host = "https://qa.door43.org";
var token = "token c8b93b7ccf7018eee9fec586733a532c5f858cdd";
var org = "dcs-poc-org";
var repo = "dcs-resolve-conflict-poc";
var pr_num = "1";
var ternary_created = false;
var merge_base = null;

function main() {
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
  const repo_input = prompt(`Enter the name of the repo to use in the ${org} org [${repo}]): `);
  if (repo_input) {
    repo = repo_input;
  }
  const num_input = prompt(`Enter the PR # [${pr_num}]: `);
  if (num_input) {
    pr_num = num_input;
  }

  console.log("Org: "+org);
  console.log("Repo: "+repo);
  console.log("PR #: "+pr_num);
  console.log("PR URL: "+host+"/"+org+"/"+repo+"/pulls/"+pr_num);

  handleMergeConflict().then(() => {
    console.log("DONE!!");
  });
}

async function handleMergeConflict() {
  /* GET PR FOR pr_num */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/pulls/${pr_num}`, method: 'GET', headers: {'Authorization': token}, json: true});
    console.log(`GOT PR ${res.url}`);
  } catch (error) {
    console.log(`ERROR GET PR #${pr_num}:`);
    console.log(error.error);
    exit(1);
  }

  const pr_url = res.url;
  const diff_url = res.diff_url;
  const patch_url = res.patch_url;
  const mergeable = res.mergeable;
  merge_base = res.merge_base;

  if (mergeable) {
    merged = await doSquashMergePR();
    if (merged) {
      return;
    }
  }

  res = await rp({uri: diff_url});
  console.log(res);
  const files = parse_diff(res);

  files.forEach(file => {
    await resolveConflicts(file);
  }
}

function resolveConflicts(file, merge_base) {
  filename = file.from;
  
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${filename}?ref=${merge_base}`, method: 'GET', headers: {'Authorization': token}, json: true});
    console.log(`GOT FILE ${file1_name} FOR MERGE BreturnASE ${merge_base}`);
  } catch (error) {
    console.log(`ERROR GETTING FILE ${file1_name} FOR MERGE BASE ${merge_base}:`);
    console.log(error.error);
    exit(1);
  }

  console.log(merge_base);
  const orig_file1_content = Buffer.from(res.content, 'base64').toString('utf8');
  console.log('decoded', merge_base_file1_content);
  console.log('base64', res.content);
  exit(1);

  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${file1_name}?ref=master`, method: 'GET', headers: {'Authorization': token}, json: true});
    console.log(`GOT FILE ${file1_name} FOR master`);
  } catch (error) {
    console.log(`ERROR GETTING FILE ${file1_name} FOR master:`);
    console.log(error.error);
    exit(1);
  }

  const master_file1_content = Buffer.from(res.content, 'base64').toString('utf8');
  console.log('decoded', master_file1_content);
  console.log('base64', res.content);

  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${file1_name}?ref=${branch}`, method: 'GET', headers: {'Authorization': token}, json: true});
    console.log(`GOT FILE ${file1_name} FOR master`);
  } catch (error) {
    console.log(`ERROR GETTING FILE ${file1_name} FOR master:`);
    console.log(error.error);
    exit(1);
  }

  const user_file1_content = Buffer.from(res.content, 'base64').toString('utf8');
  console.log('decoded', user_file1_content);
  console.log('base64', res.content);

  resolveConflicts(user_file1_content, orig_file1_content, master_file1_content)
}

function resolveConflicts(user_file1, orig_file1, master_file1) {
  const items = diff3Merge(user_file1, orig_file1, master_file1);
  console.log(items);
  items.forEach(item => {
    if (item.hasOwnProperty('ok')) {
      merged = merged.concat(item.ok);
    } else if (item.hasOwnProperty('conflict')) {
      makePick(item);
    }
  });
  console.log("MERGED FILE:");
  merged.forEach((line, i) => {
    console.log((i + 1)+": "+line);
  });
}

function makePick(item) {
    console.log("\nMERGE CONFLICT:");
    console.log("1 (YOURS):");
    item.conflict.a.forEach((line, i) => {
      console.log((merged.length + i + 1)+": "+line);
    });
    console.log("\n\n2 (THEIRS):");
    item.conflict.b.forEach((line, i) => {
      console.log((merged.length + i + 1)+": "+line);
    });
    var choice = "";
    while(choice != "1" && choice != "2") {  
      choice = prompt("\nPlease pick 1 or 2: ").trim();
      console.log("CHOICE", choice);
      switch(choice) {
        case "1":
          merged = merged.concat(item.conflict.a);
          break;
        case "2":
          merged = merged.concat(item.conflict.b);
          break;
        default:
          console.log("Invalid choice. Please choose again.");
      }
    }
    return choice;
}

async function doSquashMergePR() {
  /* GET PR FOR pr_num */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/pulls/${pr_num}/merge`, method: 'POST', headers: {'Authorization': token}, json: {Do: 'squash'}});
    console.log(`MERGED PR ${res.url}`);
    return true;
  } catch (error) {
    console.log(`ERROR MERGING PR #${pr_num}:`);
    console.log(error.error);
    exit(1);
  }
}

main();

