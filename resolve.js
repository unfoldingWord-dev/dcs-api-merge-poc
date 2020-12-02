const diff3Merge = require('node-diff3').diff3Merge;   // UMD import named
const prompt = require('prompt-sync')();
const { exit } = require('process');
var rp = require('request-promise');
var parse_diff = require('parse-diff');

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
    console.log("DONE!");
  });
};

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

  if (pr.mergeable) {
    merged = await doSquashMergePR();
    if (merged) {
      console.log(`PR WAS MERGEABLE (NO CONFLICTS) SO master WAS MERGED INTO ${pr.base.label}.`)
      return;
    }
  }

  diff = await rp({uri: pr.diff_url});
  const files = parse_diff(diff);

  console.log(`\nPARSED DIFF OF ${pr.diff_url}:`);
  console.log(JSON.stringify(files, null, 4), "\n");


  ternary_branch_name = `${pr.base.label}_ternary_branch`;
  /* DELETE TERNARY BRANCH IF IT EXISTS */
  try {
    await rp({uri: `${host}/api/v1/repos/${org}/${repo}/branches/${ternary_branch_name}`, method: 'DELETE', headers: {'Authorization': token}, json: true});
  } catch (error) {
    if (error.statusCode != "404") {
      console.log(`ERROR DELETING TERNARY BRANCH ${ternary_branch_name}:`)
      console.log(error.error);
      exit(1);
    }
  }

  for(var i = 0; i < files.length; i++) {
    await resolvedMergeContent(files[i].from);
  }

  console.log(`NEW USER BRANCH REBASED WITH master: ${host}/${org}/${repo}/src/branch/${ternary_branch_name} (should be renamed to ${pr.base.label})`);
  console.log("NEXT STEPS WOULD BE\n1) DELETE OLD USER BRANCH\n2) RENAME TERNARY BRANCH TO OLD USER BRANCH NAME\n3) CLOSE PR WITHOUT MERGING (NO NEED TO MAKE A PR NOW)")
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
  
  console.log(`DIFF3 MERGE OF ${filename}`)
  console.log(JSON.stringify(diff_merge, null, 4), "\n");

  var merged_lines = [];
  if (diff_merge.length == 1 && diff_merge[0].hasOwnProperty('ok')) {
    merged_lines = diff_merge[0].ok;
    console.log("\nNO-CONFLICT FILE:");
  } else {
    diff_merge.forEach(group => {
      if (group.hasOwnProperty('ok')) {
        group.ok.forEach((line, index) => {
          console.log(`${merged_lines.length + index + 1}: ${line}`);
        })
        merged_lines = merged_lines.concat(group.ok);
      } else if (group.hasOwnProperty('conflict')) {
        merged_lines = merged_lines.concat(makePick(group));
      }
    });
    console.log("\nMERGED CONFLICT FILE:");
  }
  merged_lines.forEach((line, i) => {
    console.log((i + 1)+": "+line);
  });
  console.log("\n");

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
    console.log("\nMERGE CONFLICT:\n");
    console.log("1 (YOURS):\n");
    conflict_group.conflict.a.forEach((line, i) => {
      console.log((conflict_group.conflict.aIndex + i)+": "+line);
    });
    console.log("\n\n2 (THEIRS):\n");
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

