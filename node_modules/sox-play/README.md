sox-play
========
node module to play sound files via sox's `play` command

You will need to install [sox](http://sox.sourceforge.net/) before use.

If you want to use MP3 files, you will also need [libsox-fmt-mp3](http://superuser.com/a/421168)

Usage
=====
```javascript
var AudioPlayer = require('sox-play');

var player = new AudioPlayer({file:'/home/pixnbits/Music/birds.ogg'}); // http://www.portal2sounds.com/2265

player.on('start', function(filePath){
  console.log('started playing', filePath);
});

player.on('status', function(status){
  console.log('status! ', status.position);
  /*
  status: {
    loaded: 0-1 (%)
    position: PlayerPosition instance (see below)
    remaining: PlayerPosition  instance
    dataPlayed: strings like '14k'
  }
  PlayerPosition : {
    hours
    minutes
    seconds
    frac
  }
  */
});

player.on('stop', function(filePath){
  console.log('stopped playing', filePath);
});

player.play();
```

In addition, you can use an interpolated position whenever you want:
```javascript
console.log('guessing position:', player.guessPosition());
```
The guess is simply the last reported position plus whatever time has transpired since then.

You can also stop easily:
```javascript
player.stop(); // SIGINT
// or
player.stopHard(); // SIGKILL
```
Due to the nature of the spawned process, `.stop()` will not end immediately. However, `.stopHard()` is done via `SIGKILL` so it is not without fault.
