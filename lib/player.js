/**
 * Created by Arrowing on 2016/4/7.
 */

var events = require('events'),
  util = require('util'),
  path = require('path'),
  fs = require('fs'),
  cp = require('child_process'),
  request = require('request'),
  descs = {
    playing: '播放中...'.green
  };

function Player(music) {

  this.site = null;
  this.music = music;

  this.get = function (key){
    if(this.hasOwnProperty(key)){
      return this[key];
    };
  };

  this.set = function (key, val){
    var oldVal;

    if(this.hasOwnProperty(key)){
      oldVal = this[key];

      if(oldVal !== val){
        this[key] = val;
        this.emit( key + 'Change', val );
      };

      return val;
    };
  };

  this.setStatus = function (newStatus){
    this.set('status', newStatus);
  };

  this.play = function (music, siteName){
    this.emit('play', music, siteName || '163');
  };

  events.call(this);
};
util.inherits(Player, events);

var player = new Player();

/* == 事件 == */
player.on('play', function (music){

  play(music);

}).on('saveMusic', function (filename, callback){

  saveMusic(filename, callback);

});

/* == 函数 == */
function play(music, siteName){

  var pathname = path.join(__dirname, '../musics', siteName),
    filename = path.join(pathname, music.md5 + '.' + music.type);

  !fs.statSync(pathname).isDirectory() && fs.mkdirSync(pathname);

  if( !fs.statSync(filename).isFile() ){ // 音乐文件还未保存到本地
    player.emit('saveMusic', filename, function (err){

      if (err) {
        return console.log(descs.playError);
      };

      play(music, siteName);

    });
  };


  player.music = music;
  player.site = siteName;

  cp.spawn('play', [music.filename]);
  console.log(descs.playing);

}

function saveMusic(filename, callback){

  var writeStream = fs.createWriteStream(filename);
  writeStream.on('finish', callback || function(){});

  // 将文件流写到本地音乐文件
  request(music.url).pipe(writeStream);
}

module.exports = player;