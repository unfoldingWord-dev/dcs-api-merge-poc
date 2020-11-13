# node-diff3-wrapper

This is a small utility wrapper around the command line tool diff3. On windows this package will download and install the gnu32 equivilent.

## Install
```
npm install --save @cloudstitch/node-diff3-wrapper
```

## Usage
```js
var diff3 = require("@cloudstitch/node-diff3-wrapper");

// three files on disk
diff3.diff("/path/to/file/a", "/path/to/file/original", "/path/to/file/b").then((result) => {
  console.log(result);
})

// one file in memory
diff3.diff("-", "/path/to/file/original", "/path/to/file/b", "contents of file a").then((result) => {
  console.log(result);
})

// diff3 -m
diff3.diffM("/path/to/file/a", "/path/to/file/original", "/path/to/file/b").then((result) => {
  console.log(result);
})  
```