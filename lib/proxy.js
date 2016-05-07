var http = require('http'),
  httpProxy = require('http-proxy'),
  playStatus;

var port = process.argv[2];

//
// Create a proxy server with custom application logic
//
var proxy = httpProxy.createProxyServer();
proxy.on('proxyRes', response);

function response(proxyRes, req, res){
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
};

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

http.createServer(function(req, res) {
  proxy.web(req, res, { target: 'http://'+ req.headers.host } );
}).listen(port);

process.on('message', function (data){

  if(data && data.type == 'status'){
    playStatus = data.value;
  };

});