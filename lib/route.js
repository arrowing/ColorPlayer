/**
 * Created by Arrowing on 2016/4/7.
 */
var events = require('events'),
  os = require('os'),
  util = require('util'),
  path = require('path'),
  cp = require('child_process'),
  colors = require('colors'),
  inquirer = require('inquirer'),
  bottomBar = new inquirer.ui.BottomBar(),
  phantom = require('phantom'),
  c = require('../config'),
  play,
  proxyPort = c.proxyPort || 1337,
  descs = {
    selUrl: '请选择你要听的音乐网站',
    withoutSite: '请配置你的音乐网站'.red,
    inputUrl: '请输入你要听的音乐网站',
    urlError: 'URL地址错误，请重新选择',
    linkError: '连接网站出错，已返回主菜单'.red,
    linkSuccess: '# 连接 %s 成功'.green,
    loading: ' 载入中...',
    loadingTops: '加载榜单中...',
    selCatogary: '请选择你要听的榜单',
    zeroSelOfTops: '请至少选择一个榜单'.red,
    playTopsError: '播放出错，请尝试其他榜单'.red,
    playError: '播放出错，请尝试其他榜单'.red,
    playing: '播放中...'.green
  };

function Route() {

  this.page = null;
  this.ph = null;
  this.siteObj = null;

  this.useProxy = true;
  this.proxyCp = null;

  this.status = null; // ['ready', 'play']

  this.startup = function (){
    this.emit('startup');
  };

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
    
    return this;
  };

  this.clearBottomBar = function (){
    bottomBar.updateBottomBar('');
    return this;
  };

  this.clear = function (){
    process.stdout.write('\033c');
    return this;
  };

  this.playMusic = function (index){
    playMusic(index);
    return this;
  };

  events.call(this);
};
util.inherits(Route, events);

var route = new Route();

/* == 事件 == */
route.on('startup', function (){

  startup();

}).on('enterWeb', function (siteObj){

  route.siteObj = siteObj;
  enterWeb(siteObj);

}).on('enteredWeb', function (page, ph){

  updateStatus('connected');
  selectMusicList(page, ph);

}).on('enterWebErr', function (errMsg){

  console.log(errMsg);
  route.emit('startup');

}).on('selectTops', function (page, top){

  selectTops(page, top);

}).on('playTopsError', function (errMsg, page, top){

  console.log(errMsg);
  route.emit('selectTops', page, top);

}).on('statusChange', function (status){

  statusChange(status);

});

/* == 函数 == */
function startup(){
  
  player = require('./player');
  route.useProxy && useProxy();
  
  var selKey = 'music-site';
  var siteIndexList = [];

  if(c.autoPlay){
    return route.emit('enterWeb', c.sites[0]);
  };

  if(c.sites && c.sites.length){

    siteIndexList = c.sites.map(function (item){
      return item.url;
    });

    bottomBar.rl.output.mute();
    inquirer.prompt([{
      type: 'list',
      name: selKey,
      message: descs.selUrl,
      choices: siteIndexList,
      validate: function (value){
        var pass = value.match(/^(http|https:\/\/)?[.a-zA-Z0-9/]+$/i);

        if (pass) {
          return true;
        } else {
          return descs.urlError;
        };

      }
    }], function (answer){

      var site;
      c.sites.forEach(function (item){
        if(answer[selKey] == item.url){
          site = item;
        };
      });

      site && route.emit('enterWeb', site);
    });

  }else{
    console.log(descs.withoutSite);
  };
}

/*
 * 内部代理，以至于可以取到返回资源的body
 * 到目前为止，phantmjs提供获取返回资源body一直为空字符串
 */
function useProxy(){

  var proxyCp = cp.fork(path.join(__dirname, 'proxy.js'), [
    proxyPort
  ]);

  proxyCp.on('message', function (data){

    //console.log('来自代理的数据：', data);

    if(!data){
      return;
    };

    if (data.type == 'musicInfo'){
      player.startPlay(data.value, route.siteObj.name, bottomBar);
    }else if(data.type == 'lyric'){
      player.set('lrc', data.value);
      //player.saveLrc(data.value);
    };

  });

  route.proxyCp = proxyCp;
};

function enterWeb(siteObj){

  // 不加载图片，并使用本地代理，以取到资源的Body
  phantom.create(['--load-images=no', '--proxy=127.0.0.1:' + proxyPort])
    .then(function (ph){

      route.ph = ph;
      return ph.createPage();

    }).then(function (page){

    route.page = page;

    page.property('onConsoleMessage', onConsoleMessage);
    page.property('onResourceRequested', onResourceRequested);
    page.property('onResourceReceived', onResourceReceived);
    page.property('onResourceError', onResourceError);

    updateStatus('connect');

    return page.open(siteObj.url);

  }).then(function (status){

    if(status == 'success'){
      route.emit('enteredWeb', route.page, route.ph);
    }else{
      route.emit('enterWebErr', descs.linkError);
    };

  }).catch(function (error){
    route.emit('enterWebErr', descs.linkError);
  });
}

function selectMusicList(page, ph){

  var jQueryPath = path.join(__dirname, 'jquery-1.12.2.min.js');

  page.injectJs(jQueryPath)
    .then(function (){

      //console.log(descs.loadingTops);

      page.evaluate(function() {

        // 屏蔽网易云音乐网页报错，暂时不知道原因
        // (evaluating 'bQG.addCallback')
        window.onerror = function(){ return true; };

        var $win = $(window.frames['g_iframe'].contentWindow.document),
          titles = $win.find('.tit.f-ff2.f-tdn'),
          catogaries = [],
          separatorIndexs = [],
          playBtns = {},
          catIndex = 0;

        // 触发元素点击事件
        function clickElement(el){
          var ev = document.createEvent("MouseEvent");
          ev.initMouseEvent(
            "click",
            true /* bubble */, true /* cancelable */,
            window, null,
            0, 0, 0, 0, /* coordinates */
            false, false, false, false, /* modifier keys */
            0 /* left */, null
          );

          el.dispatchEvent(ev); // 网易的播放按钮总是返回false，不知道为啥，好像是有个阻止动作
          return true;
        }

        // 加载榜单
        function _loadTops(isBottomTops){
          var playBtn,
            tmpCatogary,
            $this,
            aLink;

          isBottomTops ?
            catogaries.push(titles.eq(2).text()) :  // 底部榜单标题
            catogaries.push(titles.first().text()); // 热门推荐标题

          separatorIndexs.push(catogaries.length - 1);

          if(isBottomTops){ // 底部榜单列表

            $win.find('#top-flag .blk')
              .each(function (){
                $this = $(this);
                playBtn = $this.find('.btn [title="播放"]');
                playBtns[catIndex] = playBtn;

                tmpCatogary = {
                  name: $this.find('h3.f-thide').text(),
                  value: catIndex++
                };

                catogaries.push( tmpCatogary );
              });

          }else{ // 热门推荐列表

            $win.find('.n-rcmd .u-cover')
              .each(function (){
                $this = $(this);
                aLink = $this.find('a.msk');
                playBtn = $this.find('.bottom [title="播放"]');
                playBtns[catIndex] = playBtn;

                tmpCatogary = {
                  name: '['+ $this.find('span.nb').text() +']' + aLink.attr('title'),
                  value: catIndex++
                };

                catogaries.push( tmpCatogary );
              });
          };
        }

        _loadTops(true);// 底部榜单
        _loadTops();    // 热门推荐

        window.playBtns = playBtns;
        window.clickElement = clickElement;

        return {catogaries: catogaries, separatorIndexs: separatorIndexs};

      }).then(function(data){
        route.emit('selectTops', page, data);
      });
    });
}

function selectTops(page, top){

  if(c.autoPlay && !selectTops.comed){ // 第一次进来自动播放
    selectTops.top = top;
    selectTops.comed = true;
    return _confirmTop({index: 1}); // 自动播放第一个榜单
  };

  page = page || route.page;
  top = top || selectTops.top;

  // 构造榜单标题分割线
  top.separatorIndexs.forEach(function (val){
    top.catogaries[val] = new inquirer.Separator( '===' + top.catogaries[val] + '===' );
  });

  bottomBar.rl.output.mute();
  inquirer.prompt([{
    type: 'list',
    name: 'index',
    message: descs.selCatogary,
    choices: top.catogaries
  }], _confirmTop);

  function _confirmTop(catogary){
    page.evaluate(function (btnIndex){

        var playBtn = window.playBtns[btnIndex];
        return window.clickElement(playBtn[0]);

      }, catogary.index)
      .then(function (play){

        if(play){ // 播放音乐

          route.setStatus('ready');

        }else{
          route.emit('playTopsError', descs.playTopsError, page, top);
        };

      });
  };

}

function statusChange(status){

  if(status == 'play'){
    getLrcAndPlayInfo();
  };
  player.set('status', status);

  route.proxyCp.send({
    type: 'status',
    value: status
  });

}

function getLrcAndPlayInfo(){

  if(!route.page){
    return;
  };

  route.page.evaluate(function (){

    // 打开播放面板，会发出歌词请求
    $('#g_playlist').length == 0 && window.clickElement( $('a.icn.icn-list.s-fc3')[0] );

    var titleNode = $('.f-thide.name'),
      authorNode = $('.by.f-thide').find('a'),
      list = [];

    // 保存播放列表
    window.playList = $('#g_playlist').find('li[data-action="play"]')
      .each(function (){
        list.push( $(this).find('.col.col-2').text() );
      });

    return {
      title: titleNode.length > 0 ? titleNode.text() : '',
      author: authorNode.length > 0 ? authorNode.text() : '',
      list: list
    };

  }).then(function (data){

    player.set('playList', data.list);
    player.set('title', data.title);
    player.set('author', data.author);
    player.emit('musicChange');

  });
}

function playMusic(index){

  if(!route.page){
    return;
  };

  route.setStatus('ready');
  route.page.evaluate(function (index){

    // 播放音乐
    window.clickElement( window.playList[index] );

  }, index);

}

function onResourceError(resourceError) {
  // console.log('Unable to load resource (#' + resourceError.id + 'URL:' + resourceError.url + ')');
  // console.log('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
}

function onResourceRequested(requestData, networkRequest) {
}

function onResourceReceived(response){
}

function onConsoleMessage(msg) {
  console.log('网站控制台输出：', msg);
}

function updateStatus( type ){

  bottomBar.rl.output.unmute(); // bug from inquirer.ui.BottomBar

  switch ( type ){

    case 'connect':
      updateStatus.loadingIndex = updateStatus.loadingIndex || 0;

      updateStatus.timter = setInterval(function (){
        bottomBar.updateBottomBar(c.loadingIcon[updateStatus.loadingIndex++ % c.loadingIcon.length] + descs.loading);
      }, 100);
      break;

    case 'connected':
      updateStatus.timter && clearInterval(updateStatus.timter);
      route.clearBottomBar();
      console.log(descs.linkSuccess, route.siteObj.url);
      break;
  };
}

module.exports = route;