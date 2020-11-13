import * as url from "url";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import * as fs from "fs";

import * as JSZip from "jszip";
import { sync as which } from "which"

/**
 * If something happens we will bail with error status code
 */
let cleanExit = false;
process.on("exit", () => {
  if(!cleanExit) {
    console.error("Install process did not exit cleanly");
    process.exit(1);
  }
});

/**
 * This is used to make http requests try to handle things in general.
 */
function makeRequest(httpModule, options): Promise<http.ClientResponse> {
  return new Promise((resolve, reject) => {
    console.log(`making request to ${options.path}`);
    let req = httpModule.request(options, (result: http.ClientResponse) => {
      let data: Buffer[] = [], total = 0;
      result.on("data", (datum: Buffer) => {
        total = total + datum.length;
        data.push(datum);
      });
      result.on("end", () => {
        result["data"] = Buffer.concat(data, total);
        if(result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result);
        } else {
          reject(result);
        }
      });
    });
    if(options.utf8) {
      req.setEncoding("utf8");
    }
    req.on("error", (error) => {
      reject(error);
    });
    if(options.method.toLowerCase() !== "get") {
      req.write(options.data);
    }
    req.end();
  });
}

/**
 * Get the resource at the given url
 */
async function getUrl(path: string, utf8?: boolean): Promise<Buffer> {
  let requestModule,
      parsedUrl = url.parse(path);
  if(parsedUrl.protocol === "http:") {
    requestModule = http;
  } else if(parsedUrl.protocol === "https:") {
    requestModule = https;
  }
  let req = {
    host: parsedUrl.host,
    port: parsedUrl.port,
    path: parsedUrl.path,
    protocol: parsedUrl.protocol,
    method: "GET",
    headers: {
      //Setting this user agent convices sf to work reasonably
      "User-Agent": "curl/7.52.1"
    },
    utf8
  };
  let body;
  let res;
  try {
    res = await makeRequest(requestModule, req);
  } catch(err) {
    if(err.statusCode) {
      res = <http.ClientResponse>err;
      if(res.statusCode === 302 || res.statusCode === 301) {
        console.log("redirecting to " + res.headers.location);
        return getUrl(res.headers.location, !!utf8);
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }
  return res.data;
}

let diff3Url = "https://sourceforge.net/projects/gnuwin32/files/diffutils/2.8.7-1/diffutils-2.8.7-1-bin.zip/download";
// bin/diff3
let libIntUrl = "https://sourceforge.net/projects/gnuwin32/files/libintl/0.14.4/libintl-0.14.4-bin.zip/download";
// bin/libintl3.dll
let libIconvUrl = "https://sourceforge.net/projects/gnuwin32/files/libiconv/1.9.2-1/libiconv-1.9.2-1-bin.zip/download";
// bin/libiconv2.dll
let getFile = async (url: string, filePaths: string[], outputPath: string) => {
  let data = await getUrl(url); 
  let zip = new JSZip();
  zip = await zip.loadAsync(data);
  for(let filePath of filePaths) {
    let fileData: Buffer = await zip.file(filePath).async("nodebuffer");
    let binDir = path.join(__dirname, "bin");
    let filePathParts = filePath.split("/");
    let fileName = filePathParts[filePathParts.length - 1];
    fs.writeFileSync(path.join(outputPath, fileName), fileData);
  }
};
let binDir = path.join(__dirname, "bin");

let getDiff3 = async () => {
  return getFile(diff3Url, ["bin/diff3.exe", "bin/diff.exe"], binDir);
};

let getLibInt = async () => {
  return getFile(libIntUrl, ["bin/libintl3.dll"], binDir);
};

let getLibIConv = async () => {
  return getFile(libIconvUrl, ["bin/libiconv2.dll"], binDir);
};

let diff3Path;

try {
  diff3Path = which("diff3");
} catch(e) {}// wasn't found

if(process.platform === "win32" && !diff3Path) {
  fs.mkdirSync(binDir);
  let promises = [getDiff3(), getLibInt(), getLibIConv()];
  Promise.all(promises).then(() => {
    console.log("ok");
    cleanExit = true;
  }, console.log).catch(console.log)
} else {
  console.log("This does not appear to be windows, skipping.");
  cleanExit = true;
}

