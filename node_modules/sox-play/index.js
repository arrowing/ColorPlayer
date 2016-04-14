/*jslint node: true */

'use strict';

var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var split = require('split');

var PlayerPosition = require('./lib/PlayerPosition');


function AudioPlayer(opts){
  if(!(this instanceof AudioPlayer)){
    return new AudioPlayer(opts);
  }

  this.init(opts);

  return this;
};

util.inherits(AudioPlayer, EventEmitter);

AudioPlayer.prototype.init = function(opts){
  opts = opts || {};
  this.file = opts.file || null;
  this.position = new PlayerPosition();
};

// TODO: start from position
AudioPlayer.prototype.play = function(){
  if(this.ps){
    return this;
  }

  var filePath = this.file;
  if(!filePath){
    this.emit('error', 'no file specified');
    return this;
  }
  var ps = this.ps = spawn('play', [filePath]);
  var aPlayer = this;

  this.position.zero();
  aPlayer.__positionTick = Date.now();
  this.emit('start', filePath);

  ps.on('error', function(err){
    console.error('error playing file', err);
  });

  ps.stderr
    .pipe(split(/\r|\n/))
    .on('data', function(line){
      // we may get multiple lines in one event cycle iteration
      // TODO: no way to know another is coming?
      // overwrite the previous
      var status = findStatus(line);
      if(!status){
        return;
      }
      if(status.position){
        aPlayer.position = status.position;
        aPlayer.__positionTick = Date.now();
      }
      //console.log('status found:', status);
      aPlayer.emit('status', status);
    });

  // ps.on('exit', function(){
  //   aPlayer.emit('stop', filePath);
  // });
  ps.on('close', function(){
    aPlayer.emit('stop', filePath);
    aPlayer.position.neutralize();
  });

  return this;
};


var regex_playStatus = /In:(\d{1,2}\.\d{1,2})%\s+(\d{2}:\d{2}:\d{2}\.\d{2})\s+?\[(\d{2}:\d{2}:\d{2}\.\d{2})\]\s+?Out:([\d\.]+)(\w)/;
function findStatus(line){
  var matches = regex_playStatus.exec(line);

  if(!matches){
    return;
  }

  return {
    loaded: (+matches[1]) / 100,
    position: new PlayerPosition(matches[2]),
    remaining: new PlayerPosition(matches[3]),
    dataPlayed: matches[4]+matches[5]
  };
}

AudioPlayer.prototype.stop = function(){
  if(!this.ps){
    return this;
  }

  // request to stop the process
  this.ps.kill('SIGINT');

  return this;
};

AudioPlayer.prototype.stopHard = function(){
  if(!this.ps){
    return this;
  }

  // kill the process
  this.ps.kill('SIGKILL');

  return this;
};

AudioPlayer.prototype.guessPosition = function(){
  var lastPosition = this.position,
      lastTick = this.__positionTick,
      nowTick = Date.now();

  if(!lastPosition || !lastTick){
    return lastPosition;
  }

  var tickFrac = Math.round((nowTick - lastTick) / 10);

  return new PlayerPosition(lastPosition).addFrac(tickFrac);
};


module.exports = AudioPlayer;