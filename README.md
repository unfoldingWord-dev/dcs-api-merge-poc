# Proof of Concept to use DCS API to resolve two files that have conflicts from a common original file.

This is a proof of concept for showing how one can give a PR number for a repo that has conflicts and those conflicts can be resolved through the Gitea API making a new branch that has been rebased from master with the user's changes so it no longer conflicts with master.

GitHube Repo for POC scripts/files: https://github.com/unfoldingWord-dev/dcs-api-merge-poc/tree/resolve-conflicts

Runnable copy can be found here: https://repl.it/@richmahn/dcs-api-resolve-conflicts

Resulting repo is at: https://qa.door43.org/dcs-poc-org/dcs-resolve-conflict-poc (unless you change any of the settings when running resolve.js)
