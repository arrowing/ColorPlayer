/**
 * Created by Arrowing on 2016/3/26.
 */

var config = {
  
  sites: [
    {
      url: 'http://music.163.com',
      name: '163'
    },
    {
      url: 'http://music.163.com',
      name: '163'
    }
  ],


  maxCache: 500,                      // 最大缓存空间，单位MB
  lrcMoveUp: 0,                       // 歌词提前，单位毫秒
  loadingIcon: ['/', '|', '\\', '-'], // 加载标识
  proxyPort: 1337                     // 子进程网络代理端口
};

module.exports = config;