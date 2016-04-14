var http = require('http'),
  httpProxy = require('http-proxy'),
  fs = require('fs'),
  c = require('../config');

//
// Create a proxy server with custom application logic
//
var proxy = httpProxy.createProxyServer();

proxy.on('proxyRes', function (proxyRes, req, res) {
  
  var buf;

  proxyRes.on('data', function (chunk) {
    buf = buf ? Buffer.concat([buf, chunk]) : chunk;
  }).on('end', function (){

    // if(req.url.indexOf('wshc_tag=1') > -1){
    //   console.log(buf);
    // }

    buf = buf.toString();
    if(req.url.indexOf('http://music.163.com/weapi/song/enhance/player/url?csrf_token=') > -1 && buf[0] == '{'){ // json
      buf = JSON.parse(buf);
      if(buf.code == 200 && buf.data[0].type == 'mp3'){
        console.log(buf.data[0].url);
      };
    };

  });

});

//
// Create your custom server and just call `proxy.web()` to proxy
// a web request to the target passed in the options
// also you can use `proxy.ws()` to proxy a websockets request
//
var server = http.createServer(function(req, res) {
  // You can define here your custom logic to handle the request
  // and then proxy the request.
  proxy.web(req, res, { target: 'http://127.0.0.1:8080' });
});

var port = c.proxyPort || 1337;
server.listen(port);
//console.log("listening on port", port);