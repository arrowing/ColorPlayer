/**
 * Created by Arrowing on 2016/4/7.
 */

var events = require('events'),
  util = require('util'),
  path = require('path'),
  fs = require('fs'),
  cp = require('child_process'),
  request = require('request'),
  inquirer = require('inquirer'),
  c = require('../config.js'),
  route = require('./route'),
  bottomBar,
  descs = {
    loadingMusic: ' 载入音乐中...',
    menu: '菜单选择：',
    driverError: '请确认设置sox的全局变量与默认播放器，具体方式请查看README.md'.red,
    noLrc: '暂无歌词'
  },
  menu = {
    menuStart: '==== 菜单 ====',
    menuEnd:   '==============',
    toTops:    '- 返回榜单列表',
    play:      '- 暂停/播放'
  };

function Player(music) {

  this.status = null; // ['ready', 'play']

  this.music = music;
  this.lrc = null;
  this.playList = null;
  this.playIndex = 0;
  this.title = null;
  this.author = null;

  this.sox = null;
  this.loadingTimter = null;
  this.progressTimter = null;

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

  this.startPlay = function (music, siteName, uiBar){
    this.emit('startPlay', music, siteName || '163');
    bottomBar = uiBar;
  };

  this.saveLrc = function (lyric){
    this.emit('saveLrc', lyric);
  };

  this.isPlay = function (){
    return this.status == 'play';
  }

  events.call(this);
};
util.inherits(Player, events);

var player = new Player();

/* == 事件 == */
player.on('startPlay', function (music, siteName){

  startPlay(music, siteName);

}).on('play', function (music){

  play(music);

}).on('pause', function (isBackTops){

  pause(isBackTops);

}).on('saveMusic', function (musicUrl, fileName, callback){

  saveMusic(musicUrl, fileName, callback);

}).on('saveLrc', function (lyric){

  saveLrc(lyric, formatLrc);

}).on('progress', function (pos, totalPos){

  progress(pos, totalPos);

}).on('playEnd', function (totalPos){

  playEnd(totalPos);

}).on('statusChange', function (){

  statusChange();

}).on('musicChange', function (){

  musicChange();

});

/* == 函数 == */
function startPlay(music, siteName){

  if(!player.loadingTimter){
    
    var loadingIconIndex = 0;
    player.loadingTimter = setInterval(function (){
      bottomBar.rl.output.unmute();
      bottomBar.updateBottomBar(c.loadingIcon[loadingIconIndex++ % c.loadingIcon.length] + descs.loadingMusic);
    }, 100);

  };

  var pathName = path.join(__dirname, '../musics', siteName),
    fileName = path.join(pathName, music.md5 + '.' + music.type);

  music.pathName = pathName;
  music.fileName = fileName;
  music.siteName = siteName;

  try{
    fs.statSync(pathName);
  }catch (e){
    fs.mkdirSync(pathName);
  };

  try{
    fs.statSync(fileName);
  }catch (e){ // 音乐文件还未保存到本地

    // TODO 有时候下载文件出错！！！
    player.emit('saveMusic', music.url, fileName, function (err){

      if (err) {
        return console.log(descs.playError);
      };
      
      startPlay(music, siteName);
    });

    return;
  };

  clearInterval(player.loadingTimter);
  player.loadingTimter = null;
  
  player.emit('play', music);

}

function play(music){

  var playOpts = [ music.fileName ];

  if(music == player.lastMusic){ // 从上次暂停的位置播放
    playOpts.push('trim');
    playOpts.push( sec2time(player.lastPos / 1000, true) );
  };

  // 3分钟50秒起播，调试
  //playOpts.push('trim');
  //playOpts.push('03:30');

  player.sox = cp.spawn('play', playOpts /*, {stdio: 'inherit'}*/);

  // 已知BUG: 需要保持与子进程sox的联系（打开其stderr流），不然播放到3分钟以后就没声音了！
  player.sox.stderr.on('data', function (data){
    //console.log(data.toString());
  });

  player.music = music;
  route.setStatus('play');

  if(music == player.lastMusic){ // 显示上次的播放进度
    showPlayInfo( Date.now() - player.lastPos, player.music.totalPos );
  };
  
  player.lastMusic = null;
}

function pause(isBackTops){

  player.sox && player.sox.kill();

  clearProgressTimer();
  route.setStatus('pause');

  if(isBackTops){
    player.lastPos = null;
    player.lastMusic = null;
    return;
  };

  player.lastPos = player.music.pos;
  player.lastMusic = player.music;

  showMenu(true);
}

function saveMusic(musicUrl, fileName, callback){

  var writeStream = fs.createWriteStream(fileName);
  writeStream.on('finish', callback || function(){});

  // 将文件流写到本地
  request(musicUrl).pipe(writeStream);

  // 请求歌词
}

function saveLrc(lyric, callback){

  var lrcName = path.join(player.music.pathName, player.music.md5 + '.lrc');

  try{
    fs.statSync(lrcName);
  }catch (e){

    // 如果找不到歌词，就将歌词文件写到本地
    return lyric && fs.writeFile(lrcName, lyric, function (err){
      if(err) console.log(err);

      callback && callback(lyric);
    });

  };

  fs.readFile(lrcName, function (err, lyric){
    if(err) console.log(err);

    callback && callback(lyric);
  });

}

function getLrc(){

  // 保存歌词
  if( player.get('lrc') ){
    player.saveLrc( player.get('lrc'), formatLrc);
  };

}

function getTotalPos(callback){ // 获取音乐总时长

  cp.spawn('soxi', [ '-D', player.music.fileName])
    .stdout.on('data', callback);

}

function inProgress(totalPos){

  player.music.pos = Date.now() - player.music.progressStart;
  player.emit('progress', player.music.pos, totalPos);

  if(player.music.pos >= totalPos){
    player.music.pos = totalPos;
    player.emit('playEnd', totalPos);
  };

}

function startProgress(totalPos, lastPosTime){

  totalPos *= 1000;
  player.music.totalPos = totalPos;

  player.music.progressStart = lastPosTime || Date.now();
  //player.music.progressStart = (Date.now() - 230000); /*3分钟50秒*/

  clearProgressTimer();

  inProgress(totalPos);
  player.progressTimter = setInterval(function (){
    inProgress(totalPos);
  }, 500);

}

function progress(pos, totalPos, isPause){

  try{
    bottomBar.rl.output.unmute();
    bottomBar.updateBottomBar([
      ' [ '+ (isPause ? '▷' : '▶') +' ', // ▶ ▷
      sec2time(pos / 1000),
      ' / ',
      sec2time(totalPos / 1000).green,
      ' ] ',
      getPosLrc(pos)
    ].join(''));
  }catch (e){
    // ctrl + c 会导致此处报错，捕获该异常不使其显示报错信息
  }

}

function getPosLrc(pos){

  if(!player.music.lrc){
    getLrc();
    return descs.noLrc;
  };

  var nextLineLrc = player.music.lrc[ player.music.currLrcIndex + 1 ];

  if(nextLineLrc){ // 大于500毫秒以上的歌词提前 c.lrcMoveUp 毫秒，一般为500
    var nextLinePos = nextLineLrc.pos > c.lrcMoveUp ? nextLineLrc.pos - c.lrcMoveUp : nextLineLrc.pos;
  };

  if( typeof nextLineLrc == 'undefined' || typeof nextLineLrc.pos == 'undefined' ) { // 没有歌词了

  }else if( pos >= nextLinePos || isNaN(nextLinePos) ){
    player.music.currLrcIndex++;
  };

  return player.music.lrc[ player.music.currLrcIndex ] && player.music.lrc[ player.music.currLrcIndex ].text || '';

}

function statusChange(){



}

// 获得音乐信息和音乐列表
function musicChange(){

  if(player.isPlay()){
    showPlayInfo();
  };

}

function showPlayInfo(lastPosTime, totalPos){

  function _show(totalPos){
    showMenu();
    showTitleInfo();
    startProgress(totalPos.toString(), lastPosTime);
  }

  if(totalPos){
    _show(totalPos / 1000); // 传秒数
  }else{
    getTotalPos(_show);
  };

}

function showMenu(isPause){

  var menuList = [
    new inquirer.Separator(menu.menuStart),
    menu.play,
    menu.toTops,
    new inquirer.Separator(menu.menuEnd)
  ];

  menuList = menuList.concat( player.playList );

  route.clear();
  inquirer.prompt([
    {
      type: "list",
      name: "playOpt",
      message: descs.menu,
      choices: menuList
      /*
      [
        {
          key: "p",
          value: "p",
          name: "播放/暂停"
        },
        {
          key: "b",
          value: "b",
          name: "返回榜单列表"
        },
        {
          key: "l",
          value: "l",
          name: "当前榜单音乐列表"
        }
      ]
      */
    }
  ], function( answers ) {

    selMenu(answers.playOpt);

  });

  if(isPause){
    showTitleInfo();
    progress(player.lastPos, player.music.totalPos, isPause);
  };

}

function selMenu( val ){

  var playIndex;
  
  switch (val){
    case menu.toTops:
      route.clear();
      player.emit('pause', true);
      route.emit('selectTops');
      break;

    case menu.play:
    case player.title:
      player.isPlay() ?
        player.emit('pause') :
        player.lastMusic && player.emit('play', player.lastMusic) ;
      break;
    
    // 其他歌曲
    default:
      clearProgressTimer();
      playIndex = player.playList.indexOf(val);
      player.playIndex = playIndex;

      player.sox && player.sox.kill();
      player.set('lrc', null); // 清除歌词
      route.playMusic( playIndex );
      break;
  }

}

function showTitleInfo(){

  var titleAndAuthor = [
    ' [ ',
    player.title.yellow,
    ' , By ',
    player.author.magenta,
    ' ]'
  ].join('');

  console.log('');
  console.log(titleAndAuthor);

}

function playEnd(totalPos){

  clearProgressTimer();

  progress(totalPos, totalPos);
  player.playIndex++;
  if(player.playIndex == player.playList.length){
    player.playIndex = 0;
  };
  selMenu( player.playList[player.playIndex] );

}

function clearProgressTimer(){
  bottomBar.updateBottomBar('');
  clearInterval(player.progressTimter);
  player.progressTimter = null;
}

function sec2time(secs, noHour){
  var hou, min, time;

  secs = parseInt(secs);

  if(secs < 3600){
    hou = '00';
  }else{
    hou = Math.floor(secs / 3600);

    secs -= hou * 3600;

    if(hou < 10){
      hou = '0' + hou;
    };
  };

  if(secs < 60){
    min = '00';
  }else{
    min = Math.floor(secs / 60);

    secs -= min * 60;

    if(min < 10){
      min = '0' + min;
    };
  };

  if(secs < 10){
    secs = '0' + secs;
  };

  time = [min, secs];
  !noHour && time.unshift(hou);

  return time.join(':');
}

function time2ms(msTime){
  var time, secs;

  msTime = msTime.split('.');
  time = msTime[0].split(':');

  secs = +time[0] * 60000 + +time[1] * 1000;

  return secs + +msTime[1];
}

function formatLrc(lrcData){

  if(player.music.lrc){
    return;
  };

  var posArr = [], spliter;

  lrcData = lrcData.toString().split( /\n|\r\n/ );

  lrcData.forEach(function (lrc){
    if(lrc != ''){

      spliter = lrc.match(/^\[(.*)\]([\s\S]*)$/);

      if(spliter){
        var pos = spliter[1];
        var text = spliter[2];

        // 没有时间线，定义为歌词解释性文字
        if(text == '' && spliter[0].indexOf('[')){
          pos = '00:00.00';
          text = spliter[0];
        };

        posArr.push({
          pos: time2ms(pos),
          text: text
        });
      };

    };
  });

  player.music.lrc = posArr;
  player.music.currLrcIndex = 0;

}

module.exports = player;