const Diff3 = require('node-diff3');                   // UMD import all
const diff3Merge = require('node-diff3').diff3Merge;   // UMD import named
const fs = require('fs');

var orig_file1;
var master_file1;
var user_file1;

var lines = [];
var merged = [];
var pick1 = [];
var pick2 = [];
var state = 0;

function makePick(callback) {
    'use strict';
    console.log(pick1);
    console.log(pick2);
    process.stdin.resume();
    process.stdout.write("Please pick 1 or 2:\n");
    process.stdout.write("1:\n" + pick1.join("\n") + "\n\n");
    process.stdout.write("2:\n" + pick2.join("\n") + "\n\n");
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
        console.log("LINES ("+lines.length+")", lines);
        if (lines.length) {
            var line = lines.shift();
            console.log("MY LINE", line);
            printNextLine(line);
        } else {
            console.log("CALLING CALLBACK");
            callback();
        }
    }

    function printNextLine(line) {
      console.log("line " + (merged.length + 1), line);
      switch(line) {
        case "\n<<<<<<<<<\n":
          state = 1;
          console.log("In state 1");
          break;
        case "\n=========\n":
          state = 2;
          console.log("In state 2");
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
          console.log("STATE: "+state);
          if (state == 1) {
            pick1.push(line);
            console.log("PICK1", pick1);
          } else if (state == 2) {
            pick2.push(line);
            console.log("PICK2", pick2);
         } else {
           merged.push(line);
           console.log("ADD LINE TO MERGED", line);
         }
      }
      console.log("CALLING CONTINUE!!!");
      continueProcessing();
    }

    console.log("HERE ONCE!!!");
    continueProcessing();
}
  
if (process.argv.length > 2) {
    var filename1 = process.argv[2];
    var filename2 = process.argv[3];
    var filename3 = process.argv[4];
    
    orig_file1 = fs.readFileSync(process.argv[2], 'utf8').split('\n');
    user_file1 = fs.readFileSync(process.argv[3], 'utf8').split('\n');
    master_file1 = fs.readFileSync(process.argv[4], 'utf8').split('\n');
    const r = Diff3.merge(user_file1, orig_file1, master_file1);
    console.log(r);
    lines = r.result;
    printLinesPromptForConflicts(function () {
      console.log('Were done now');

      console.log("MERGED", merged);
    });
} else {
    console.error("File name must be supplied on command line.");
    process.exit(1);
}
