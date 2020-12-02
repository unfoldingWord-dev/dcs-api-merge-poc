const diff3Merge = require('node-diff3').diff3Merge;   // UMD import named
const fs = require('fs');
const prompt = require('prompt-sync')();
const https = require('https');
const { exit, memoryUsage } = require('process');
var rp = require('request-promise');
var parse_diff = require('parse-diff');
const { constants } = require('perf_hooks');
var host = "https://qa.door43.org";
var token = "token c8b93b7ccf7018eee9fec586733a532c5f858cdd";
var org = "dcs-poc-org";
var repo = "dcs-resolve-conflict-poc";
var pr_num = "1";
var pr;
var ternary_branch_name = null;
var ternary_branch_made = false;
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

  handleMergeConflicts().then(() => {
    console.log("DONE!!");
  });
};

async function getTempBranchName() {
  var i = 1;
  while(true) {
    temp_name = `${pr.base.label}_temp_branch-${i}`;
    /* SEE IF BRANCH EXISTS */
    try {
      await rp({uri: `${host}/api/v1/repos/${org}/${repo}/branches/${temp_name}`, method: 'GET', headers: {'Authorization': token}, json: true});
      console.log(`BRANCH EXISTS, ${temp_name}, TRYING ANOTHER NAME...`);
      ++i;
    } catch (error) {
      if (error.statusCode == "404") {
        console.log(`BRANCH ${temp_name} DOESN'T EXIST...USING IT AS OUR TERNARY BRANCH.`);
        return temp_name;
      } else {
        console.log(`ERROR SEEING IF BRANCH ${temp_name} EXISTS:`)
        console.log(error.error);
        exit(1);
      }
    }
  }
}

async function handleMergeConflicts() {
  /* GET PR FOR pr_num */
  try {
    pr = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/pulls/${pr_num}`, method: 'GET', headers: {'Authorization': token}, json: true});
    console.log(`GOT PR ${pr.url}`);
  } catch (error) {
    console.log(`ERROR GETTING PR #${pr_num}:`);
    console.log(error.error);
    exit(1);
  }

  ternary_branch_name = await getTempBranchName();

  if (pr.mergeable) {
    merged = await doSquashMergePR();
    if (merged) {
      return;
    }
  }

  diff = await rp({uri: pr.diff_url});
  console.log(diff);
  const files = parse_diff(diff);

  for(var i = 0; i < files.length; i++) {
    await resolvedMergeContent(files[i].from);
  }
}

async function resolvedMergeContent(filename) {
  /* GET MERGE BASE FILE CONTENT */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${filename}?ref=${pr.merge_base}`, method: 'GET', headers: {'Authorization': token}, json: true});
    console.log(`GOT FILE ${filename} FOR MERGE BASE ${pr.merge_base}`);
  } catch (error) {
    console.log(`ERROR GETTING FILE ${filename} FOR MERGE BASE ${pr.merge_base}:`);
    console.log(error.error);
    exit(1);
  }

  const base_content = Buffer.from(res.content, 'base64').toString('utf8');

  /* GET MASTER FILE CONTENT */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${filename}?ref=${pr.head.sha}`, method: 'GET', headers: {'Authorization': token}, json: true});
    console.log(`GOT FILE ${filename} FOR master (${pr.head.sha})`);
  } catch (error) {
    console.log(`ERROR GETTING FILE ${filename} FOR master (${pr.head.sha}):`);
    console.log(error.error);
    exit(1);
  }

  const master_content = Buffer.from(res.content, 'base64').toString('utf8');
  const sha = res.sha;

  /* GET USER BRANCH FILE CONTENT */
  try {
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${filename}?ref=${pr.base.label}`, method: 'GET', headers: {'Authorization': token}, json: true});
    console.log(`GOT FILE ${filename} FOR ${pr.base.label}`);
  } catch (error) {
    console.log(`ERROR GETTING FILE ${filename} FOR ${pr.base.label}:`);
    console.log(error.error);
    exit(1);
  }

  const user_content = Buffer.from(res.content, 'base64').toString('utf8');

  const diff_merge = diff3Merge(user_content.split("\n"), base_content.split("\n"), master_content.split("\n"));
  console.log(diff_merge);

  var merged_lines = [];
  if (diff_merge.length == 1 && diff_merge[0].hasOwnProperty('ok')) {
    merged_lines = diff_merge[0].ok;
  } else {
    diff_merge.forEach(group => {
      if (group.hasOwnProperty('ok')) {
        merged_lines = merged_lines.concat(group.ok);
      } else if (group.hasOwnProperty('conflict')) {
        merged_lines = merged_lines.concat(makePick(group));
      }
    });
  }
  console.log("MERGED FILE:");
  merged_lines.forEach((line, i) => {
    console.log((i + 1)+": "+line);
  });

  var branch = ternary_branch_name;
  var new_branch = null;
  if (! ternary_branch_made) {
    new_branch = ternary_branch_name;
    branch = pr.head.label;
    ternary_branch_made = true;
  }

  /* COMMIT MERGED FILE TO TERNARY BRANCH */
  try { 
    res = await rp({uri: `${host}/api/v1/repos/${org}/${repo}/contents/${filename}`, method: 'PUT', headers: {'Authorization': token}, json: {
      sha, branch, new_branch, content: Buffer.from(merged_lines.join('\n')).toString('base64'),
    }});
    console.log(`UPDATED FILE ${filename} IN TERNARY BRANCH ${ternary_branch_name}`);
  } catch (error) {
    console.log(`ERROR UPDATING FILE ${filename} IN TERNARY BRANCH ${ternary_branch_name}:`);
    console.log(error.error);
    exit(1);
  }
}

function makePick(conflict_group) {
    console.log("\nMERGE CONFLICT:");
    console.log("1 (YOURS):");
    conflict_group.conflict.a.forEach((line, i) => {
      console.log((conflict_group.conflict.aIndex + i)+": "+line);
    });
    console.log("\n\n2 (THEIRS):");
    conflict_group.conflict.b.forEach((line, i) => {
      console.log((conflict_group.conflict.bIndex + i)+": "+line);
    });
    while(true) {
      var choice = prompt("\nPlease pick 1 or 2: ").trim();
      console.log("CHOICE", choice);
      switch(choice) {
        case "1":
          return conflict_group.conflict.a;
        case "2":
          return conflict_group.conflict.b;
      }
      console.log("Invalid choice. Please choose again.");
    }
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

