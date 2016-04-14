/**
 * Created by Arrowing on 2016/3/23.
 */
var c = require('./config');
var _ = require('underscore');
var colors = require('colors');
var program = require('commander');
var inquirer = require('inquirer');
var phantom = require('phantom');
var bottomBar = new inquirer.ui.BottomBar();
var webUrl;

main();

function main(){
  welcome();
  selectSite();
}

// TO DO
function welcome(){
  
}

function selectSite(){
  var selKey = 'music-site';

  if(c.sites && c.sites.length){
    inquirer.prompt([{
      type: 'list',
      name: selKey,
      message: 'Which music site do you want to listen?',
      choices: c.sites
    }], function (answer){
      linkSite(answer[selKey]);
    });
  }else{
    inquirer.prompt([{
      type: 'input',
      name: selKey,
      default: c.defaultWeb,
      message: 'Please input your music site what you want to listen',
      validate: function (value){
        var pass = value.match(/^(http|https):\/\/[.a-zA-Z0-9/]+/i);
        if (pass) {
          return true;
        } else {
          return 'Please enter a url';
        }
      }
    }], function (answer){
      linkSite(answer[selKey]);
    });
  };

};

function clickElement(el){
  var ev = document.createEvent("MouseEvent");
  ev.initMouseEvent(
    "click",
    true /* bubble */, true /* cancelable */,
    window, null,
    0, 0, 0, 0, /* coordinates */
    false, false, false, false, /* modifier keys */
    0 /*left*/, null
  );
  el.dispatchEvent(ev);
}

function selectMusicList(page, ph){
  page.injectJs('lib/jquery-1.12.2.min.js')
    .then(function (){

      console.log('\r\nLoading the music top...');

      page.evaluate(function() {
        var $win = $(window.frames['g_iframe'].contentWindow.document),
          titles = $win.find('.tit.f-ff2.f-tdn'),
          valueKey = 'data-res-id',
          catogaries = [],
          separatorIndexs = [],
          playBtns = {},
          playBtn,
          tmpCatogary,
          $this,
          aLink;

        // top-flag
        catogaries.push(titles.eq(2).text());
        separatorIndexs.push(catogaries.length - 1);
        $win.find('#top-flag .blk')
          .each(function (){
            $this = $(this);
            playBtn = $this.find('.btn [title="播放"]');

            tmpCatogary = {
              name: $this.find('h3.f-thide').text(),
              value: playBtn.attr(valueKey)
            };

            catogaries.push( tmpCatogary );
            playBtns[tmpCatogary.value] = playBtn;
          });

        // hot-flag
        catogaries.push(titles.first().text());
        separatorIndexs.push(catogaries.length - 1);
        $win.find('.n-rcmd .u-cover')
          .each(function (){
            $this = $(this);
            aLink = $this.find('a.msk');
            playBtn = $this.find('.bottom [title="播放"]');

            tmpCatogary = {
              name: '['+ $this.find('span.nb').text() +']' + aLink.attr('title'),
              value: aLink.attr(valueKey)
            };

            catogaries.push( tmpCatogary );
            playBtns[tmpCatogary.value] = playBtn;
          });

        return {catogaries: catogaries, separatorIndexs: separatorIndexs, playBtns: playBtns, valueKey: valueKey};
      }).then(function(data){

        data.separatorIndexs.forEach(function (val){
          data.catogaries[val] = new inquirer.Separator( '===' + data.catogaries[val] + '===' );
        });

        inquirer.prompt([{
          type: 'list',
          name: 'catogary',
          message: 'Which top do you want to listen?',
          choices: data.catogaries,
          validate: function ( answer ){
            if ( answer.length < 1 ) {
              return "You must choose one catogary.";
            }
            return true;
          }
        }], function (answer){

          page.evaluate(function (catogary, valueKey){

              var clickElement = function (el){
                var ev = document.createEvent("MouseEvent");
                ev.initMouseEvent(
                  "click",
                  true /* bubble */, true /* cancelable */,
                  window, null,
                  0, 0, 0, 0, /* coordinates */
                  false, false, false, false, /* modifier keys */
                  0 /*left*/, null
                );
                el.dispatchEvent(ev);
              };

              var playBtns = $(window.frames['g_iframe'].contentWindow.document).find('a.icon-play['+ valueKey +'="'+ catogary +'"]');
              clickElement(playBtns.first()[0]);

          }, answer.catogary, data.valueKey);

        });

      });
    });
}

function updateStatus( page, ph, type ){
  var status, timer;

  switch ( type ){
    case 'connected':
      status = ('Connect ' + webUrl + ' success.').green;
      bottomBar.updateBottomBar(status);
      selectMusicList(page, ph);
      break;
    default:
      timer = setInterval(function (){

        page.property('loadingProgress')
          .then(function (percentage){

            page.property('loading')
              .then(function (loading){

                if(!loading){
                  percentage = 100;
                  clearInterval(timer);
                  page.close();
                  ph.exit();
                };
                status = 'Loading...' + percentage + '%...';

                bottomBar.updateBottomBar(status);
              });

          });
      }, 50);
  };

}

function linkSite( url ){

  webUrl = url;
  var sitepage = null;
  var phInstance = null;

  phantom.create(['--load-images=no', '--local-to-remote-url-access=yes'])
    .then(function (instance){
      phInstance = instance;
      return instance.createPage();
    })
    .then(function (page){
      sitepage = page;

      page.property('captureContent', ['/weapi/v3/playlist/detail']);

      page.property('onResourceError', function(resourceError) {
        console.log('Unable to load resource (#' + resourceError.id + 'URL:' + resourceError.url + ')');
        console.log('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
      });

      page.property('onResourceRequested', function(requestData, networkRequest) {
        networkRequest.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.153 Safari/537.36');

        // if(requestData.url.indexOf('http://music.163.com/weapi/v3/playlist/detail?csrf_token=') > -1){
        //   console.log('change url........', requestData.url);
        //   networkRequest.abort();
        //
        //   page.close();
        //   page = phInstance.createPage();
        //   page.open(requestData.url, function(){
        //     console.log(100, page.property('status'), page.property('content'));
        //   });
        // };

        //console.log(Date.now(), requestData.url);
      });

      page.property('onResourceReceived', function(response) {
        // id : the number of the requested resource
        // url : the URL of the requested resource
        // time : Date object containing the date of the response
        // headers : list of http headers
        // bodySize : size of the received content decompressed (entire content or chunk content)
        // contentType : the content type if specified
        //   redirectURL : if there is a redirection, the redirected URL
        // stage : "start", "end" (FIXME: other value for intermediate chunk?)
        // status : http status code. ex: 200
        // statusText : http status text. ex: OK

        if(response.url.indexOf('http://music.163.com/weapi/v3/playlist/detail?csrf_token=') > -1){
          if(response.status == 200){
console.log(JSON.stringify(response, null, 2));
          }else{
            console.log('Play error.');
          };
        };

      });

      page.property('onConsoleMessage', function(msg) {
        console.log(new Date(), msg);
      });

      //updateStatus(sitepage, phInstance);
      return page.open(url);
    })
    .then(function (status){

      if(status == 'success'){
        updateStatus(sitepage, phInstance, 'connected');
      }else{
        console.log(status.red);
        sitepage.close();
        phInstance.exit();
        selectSite();
      };

      //return sitepage.property('content');
    })
    .catch(function (error){
      console.log(error.red);
      phInstance.exit();
    });

}
