const Diff3 = require('node-diff3');                   // UMD import all
const diff3Merge = require('node-diff3').diff3Merge;   // UMD import named
const fs = require('fs');
const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.on("close", function() {
    console.log("\nBYE BYE !!!");
    process.exit(0);
});

const host = "https://qa.door43.org";
const token = "c8b93b7ccf7018eee9fec586733a532c5f858cdd";
const org = "dcs-poc-org";
var repo = "dcs-resolve-conflict-poc";
var branch = "user-tc-create-1";

var orig_file1;
var master_file1;
var user_file1;

var lines = [];
var merged = [];
var pick1 = [];
var pick2 = [];
var state = 0;

function main() {
    console.log("Org: "+org);
    console.log("Repo: "+repo);
    console.log("User branch: "+branch);
    console.log("DCS URL: "+host+"/"+org+"/"+repo);

    const r = diff3Merge(user_file1, orig_file1, master_file1);
    console.log(r);
    lines = r.result;
    printLinesPromptForConflicts(function () {
      console.log("MERGED FILE:");
      for(var i=0; i < merged.length; i++) {
        process.stdout.write((i + 1)+": "+merged[i]+"\n");
      }
    });
}

function makePick(callback) {
    'use strict';
    process.stdin.resume();
    process.stdout.write("\nMERGE CONFLICT:\n");
    process.stdout.write("1 (YOURS):\n");
    for(var i=0; i < pick1.length; i++) {
      process.stdout.write((merged.length + i + 1)+": "+pick1[i]+"\n");
    }
    process.stdout.write("\n\n2 (THEIRS):\n");
    for(var i=0; i < pick2.length; i++) {
      process.stdout.write((merged.length + i + 1)+": "+pick2[i]+"\n");
    }
    process.stdout.write("\nPlease pick 1 or 2: \n");
    process.stdin.once("data", function (data) {
      const choice = data.toString().trim();
      console.log("CHOICE", choice);
        if (choice != "1" && choice != "2") {
          process.stdout.write("Choice invalid. Please chose again.\n");
          makePick(callback);
        } else {
          console.log("choice", choice);
          callback(choice);
        }
    });
}

function printLinesPromptForConflicts(callback) {
    'use strict';

    function continueProcessing() {
        if (lines.length) {
            var line = lines.shift();
            printNextLine(line);
        } else {
            callback();
        }
    }

    function printNextLine(line) {
      switch(line) {
        case "\n<<<<<<<<<\n":
          state = 1;
          break;
        case "\n=========\n":
          state = 2;
          break;
        case "\n>>>>>>>>>\n":
          state = 0;
          const pickCallback = function(choice) {
            switch(choice) {
              case "1":
                merged = merged.concat(pick1);
                break;
              case "2":
                merged = merged.concat(pick2);
                break;
              default:
                print.stdout.write("Choice not valid\n");
                makePick(pickCallback);
                return;
            }
            pick1 = [];
            pick2 = [];
            process.stdin.pause();
            continueProcessing();
          };
          makePick(pickCallback);
          return;
        default:
          if (state == 1) {
            pick1.push(line);
          } else if (state == 2) {
            pick2.push(line);
         } else {
           console.log((merged.length + 1) + ":", line);
           merged.push(line);
         }
      }
      continueProcessing();
    }

    continueProcessing();
}
  
if (process.argv.length > 4) {
    var filename1 = process.argv[2];
    var filename2 = process.argv[3];
    var filename3 = process.argv[4];
    
    orig_file1 = fs.readFileSync(process.argv[2], 'utf8').split('\n');
    user_file1 = fs.readFileSync(process.argv[3], 'utf8').split('\n');
    master_file1 = fs.readFileSync(process.argv[4], 'utf8').split('\n');

    rl.question("Enter the name of the repo to use in the dcs-poc-org org ["+repo+"]: ",      function(repo_input) {
        if (repo_input) {
          repo = repo_input;
        }
        rl.question("Enter the name of the user branch ["+branch+"]: ", function(branch_input) {
          if (branch_input) {
            branch = branch_input;
          }
          main();
          rl.close();
        });
      }
    );    
} else {
    console.error("File name must be supplied on command line.");
    process.exit(1);
}

