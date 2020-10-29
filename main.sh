#### CONSTANTS
host="https://qa.door43.org"
token="990fa26ab7770f665920d6c91c1e2a7728061a9c"
org="dcs-poc-org"
repo="dcs-poc-repo"

#### FILE CONTENT
file1_name="file1.md"
file1_content=$(cat "$file1_name")
user_modified_file1_content=$(cat "user_modified_${file1_name}")
master_modified_file1_content=$(cat "master_modified_${file1_name}")

file2_name="file2.tsv"
file2_content=$(cat "$file2_name")
user_modified_file2_content=$(cat "user_modified_${file2_name}")
master_modified_file2_content=$(cat "master_modified_${file2_name}")

echo "
=========
FILE 1 $file1_name:

"
echo "$file1_content"
echo "
=========
FILE 2 $file2_name:

"
echo "$file2_content"

file1_base64=`echo "$file1_content" | base64 -w 0 -`
user_modified_file1_base64=`echo "$user_modified_file1_content" | base64 -w 0 -`
master_modified_file1_base64=`echo "$master_modified_file1_content" | base64 -w 0 -`

file2_base64=`echo "$file2_content" | base64 -w 0 -`
user_modified_file2_base64=`echo "$user_modified_file2_content" | base64 -w 0 -`
master_modified_file2_base64=`echo "$master_modified_file2_content" | base64 -w 0 -`

echo "
=========
FILE 1 ENCODED:

"
echo "$file1_base64"
echo "
=========
FILE 2 ENCODED:

"
echo "$file2_base64"

#### INIT DCS (DELETE OLD REPO IF EXISTS)
echo "
=========
DELETING REPO $repo IF EXISTS:

"
response=$(curl --silent --write-out '%{http_code}' --output /dev/null -X DELETE "$host/api/v1/repos/$org/$repo?access_token=$token" -H "accept: application/json")
if [[ "$response" == "404" ]]; then
  echo "DOESN'T ALREADY EXIST, SKIPPING."
else
  echo "EXISTS. DELETED. $response"
fi

# CREATE REPO
echo "
=========
CREATING REPO $repo:

"
response=$(curl --silent -X POST "$host/api/v1/orgs/$org/repos?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"auto_init\": true, \"default_branch\": \"master\", \"description\": \"$repo\", \"license\": \"CC-BY-SA-4.0.md\", \"name\": \"$repo\", \"private\": false, \"readme\": \"Default\"}")
echo "$response"

#### CREATE FILE 1 IN master
echo "
=========
CREATING $file1_name IN master:

"
response=$(curl --silent -X POST "$host/api/v1/repos/$org/$repo/contents/$file1_name?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"branch\": \"master\", \"content\": \"$file1_base64\", \"message\": \"Creates file1.md\"}")
echo "$response"
file1_sha=$(echo "$response" | jq -r '.content.sha')
echo -e "\nFILE 1 SHA: $file1_sha\n\n"

#### CREATE FILE 2 IN master
echo "
=========
CREATING $file2_name IN master:

"
response=$(curl --silent -X POST "$host/api/v1/repos/$org/$repo/contents/file2.tsv?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"branch\": \"master\", \"content\": \"$file2_base64\", \"message\": \"Creates file2.tsv\"}")
echo "$response"
file2_sha=$(echo "$response" | jq -r '.content.sha')
echo -e "\nFILE 2 SHA: $file2_sha\n\n"

#### CREATE USER BRANCH
#### Done by updating FILE 1 with same content but new branch
echo "
=========
CREATING USER BRANCH:

"
response=$(curl --silent -X PUT "$host/api/v1/repos/$org/$repo/contents/file1.md?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"branch\": \"master\", \"content\": \"$file1_base64\", \"message\": \"Creates new branch\", \"new_branch\": \"test-tc-create-1\", \"sha\": \"$file1_sha\"}")
echo "$response"

#### MODIFY FILE 1 IN USER BRANCH
echo "
=========
MODIFYING $file1_name IN USER BRANCH:

"
response=$(curl --silent -X PUT "$host/api/v1/repos/$org/$repo/contents/$file1_name?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"branch\": \"test-tc-create-1\", \"content\": \"$user_modified_file1_base64\", \"message\": \"Updates $file1_name in user branch\", \"sha\": \"$file1_sha\"}")
echo "$response"

#### MODIFY FILE 2 IN USER BRANCH
echo "
=========
MODIFYING $file2_name IN USER BRANCH:

"
response=$(curl --silent -X PUT "$host/api/v1/repos/$org/$repo/contents/$file2_name?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"branch\": \"test-tc-create-1\", \"content\": \"$user_modified_file2_base64\", \"message\": \"Updates $file2_name in user branch\", \"sha\": \"$file2_sha\"}")
echo "$response"

#### MODIFY FILE 1 IN master BRANCH
echo "
=========
MODIFYING $file1_name IN master BRANCH:

"
response=$(curl --silent -X PUT "$host/api/v1/repos/$org/$repo/contents/$file1_name?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"branch\": \"master\", \"content\": \"$master_modified_file1_base64\", \"message\": \"Updates $file1_name in master branch\", \"sha\": \"$file1_sha\"}")
echo "$response"

#### MODIFY FILE 2 IN USER BRANCH
echo "
=========
MODIFYING $file2_name IN master BRANCH:

"
response=$(curl --silent -X PUT "$host/api/v1/repos/$org/$repo/contents/$file2_name?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"branch\": \"master\", \"content\": \"$master_modified_file2_base64\", \"message\": \"Updates $file2_name in master branch\", \"sha\": \"$file2_sha\"}")
echo "$response"

#### MAKE PR FOR test-tc-create-1 into master
echo "
=========
MAKING PR FOR USER BRANCH INTO master:

"
response=$(curl --silent -X POST "$host/api/v1/repos/$org/$repo/pulls?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"base\": \"master\", \"body\": \"Merging user branch into master\", \"head\": \"test-tc-create-1\", \"title\": \"test-tc-create-1 into master\"}")
echo "$response"

pr_num=$(echo "$response" | jq -r '.number')
pr_url=$(echo "$response" | jq -r '.url')
diff_url=$(echo "$response" | jq -r '.diff_url')
patch_url=$(echo "$response" | jq -r '.path_url')
mergeable=$(echo "$response" | jq -r '.mergeable')

echo -e "\n\nPR URL: $pr_url\nDIFF URL: $diff_url\nPATCH URL: $patch_url\nMERGEABLE: $mergeable\n"

if [[ $mergeable == "false" ]]; then
  echo -e "\nIS NOT MERGEABLE!"
  exit
fi
echo -e "\nIS MERGEABLE!"

#### MERGE PR
echo "
=========
MERGING PR:

"
response=$(curl --silent --write-out '%{http_code}' --output /dev/null -X POST "$host/api/v1/repos/$org/$repo/pulls/$pr_num/merge?access_token=$token" -H "accept: application/json" -H "Content-Type: application/json" -d "{ \"Do\": \"merge\", \"force_merge\": false}")
if [[ "$response" != "200" ]]; then
  echo "WAS NOT ABLE TO MERGE!! RESPONSE CODE: $response" 
  exit
fi
echo -e "MERGE WAS SUCCESSFUL!\n\n"

#### GET MERGED MASTER FILE 1
echo "
=========
GETTING MERGED MASTER FILE 1:

"
response=$(curl --silent -X GET "$host/api/v1/repos/$org/$repo/contents/$file1_name?ref=master&access_token=$token" -H "accept: application/json")
merged_file1_content=$(echo "$response" | jq -r ".content" | base64 -d)
echo "$merged_file1_content"

##### COMPARE MERGED master FILE 1 CONTENT WITH EXPECTED CONTENT
echo "
=========
COMPARING MERGED master FILE 1 CONTENT WITH EXPECTED CONTENT:

"
expected_file1_content=$(cat "expected_merged_$file1_name")
if [[ "$expected_file1_content" == "$merged_file1_content" ]]; then
  echo "SAME!"
else
  echo -e "DIFFERENT:\n\n"
  diff <(echo "$expected_file1_content") <(echo "$merged_file1_content")
fi

#### GET MERGED MASTER FILE 2
echo "
=========
GETTING MERGED MASTER FILE 2:

"
response=$(curl --silent -X GET "$host/api/v1/repos/$org/$repo/contents/$file2_name?ref=master&access_token=$token" -H "accept: application/json")
merged_file2_content=$(echo "$response" | jq -r ".content" | base64 -d)
echo "$merged_file2_content"

##### COMPARE MERGED master FILE 2 CONTENT WITH EXPECTED CONTENT
echo "
=========
COMPARING MERGED master FILE 2 CONTENT WITH EXPECTED CONTENT:

"
expected_file2_content=$(cat "expected_merged_$file2_name")
if [[ "$expected_file2_content" == "$merged_file2_content" ]]; then
  echo "SAME!"
else
  echo -e "DIFFERENT:\n\n"
  diff <(echo "$expected_file2_content") <(echo "$merged_file2_content")
fi

echo "
==========
DONE

See Repo/PR at $pr_url"
