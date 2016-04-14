var http = require('http'),
  httpProxy = require('http-proxy'),
  fs = require('fs'),
  playStatus;

var port = process.argv[2];

//
// Create a proxy server with custom application logic
//
var proxy = httpProxy.createProxyServer();

proxy.on('proxyRes', function (proxyRes, req, res) {

  var buf;

  proxyRes.on('data', function (chunk) {

    buf = buf ? Buffer.concat([buf, chunk]) : chunk;

  }).on('end', function (){

    buf = buf.toString();

    if(playStatus == 'ready' && req.url.indexOf('http://music.163.com/weapi/song/enhance/player/url?csrf_token=') > -1){ // 加载音乐
      loadMusic(buf);
    }else if(/*playStatus == 'play' && */req.url.indexOf('http://music.163.com/weapi/song/lyric?csrf_token=') > -1){ // 加载歌词
      loadLrc(buf);
    };

  });

});

function loadMusic(buf){

  buf = JSON.parse(buf);

  if(buf.code == 200 && buf.data[0].type == 'mp3'){
    process.send({
      type: 'musicInfo',
      value: buf.data[0]
    });
  };

}

function loadLrc(buf){

  buf = JSON.parse(buf);

  if(buf.code == 200 && buf.lrc && buf.lrc.lyric){
    process.send({
      type: 'lyric',
      value: buf.lrc.lyric // 歌词内容
    });
  };

}

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

server.listen(port);
//console.log("listening on port", port);

process.on('message', function (data){

  if(data && data.type == 'status'){
    playStatus = data.value;
  };

});