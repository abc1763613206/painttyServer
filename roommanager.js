var events = require('events');
var cluster = require('cluster');
// var http = require('http');
var util = require("util");
var fs = require('fs');
var crypto = require('crypto');
var _ = require('underscore');
var logger = require('tracer').console();
var common = require('./common.js');
var Router = require("./router.js");
var socket = require('./socket.js');
var Room = require('./room.js');

function RoomManager(options) {
  events.EventEmitter.call(this);

  var self = this;

  var defaultOptions = new
  function() {
    var self = this;
    self.name = ''; // Name of RoomManager
    self.maxRoom = 50; // Limits the rooms
    self.pubPort = 3030; // Default public port. This is used to connect with clients or master.
    self.log = false; // Log or not
  };

  if (_.isUndefined(options)) {
    var options = {};
  }
  self.op = _.defaults(options, defaultOptions);

  self.op.logLocation = function() {
    var hash = crypto.createHash('sha1');
    hash.update(self.op.name, 'utf8');
    hash = hash.digest('hex');
    return './logs/room-manager/' + hash + '.log';
  } ();

  fs.exists('./data/',
  function(exists) {
    if (!exists) {
      fs.mkdirSync('./data/');
    }
  });

  self.roomObjs = {};
  self.roomInfos = {};
  self.router = new Router();
  self._ispubServerConnected = false;
  self._isRegSocketConnected = false;

  self.router.reg('request', 'roomlist',
  function(cli, obj) {
    var r_self = this;
    var ret = {};
    var list = [];
    _.each(r_self.roomInfos, function(item) {
      if (_.isUndefined(item)) return;
      var r = {
        cmdport: item.cmdPort,
        serveraddress: r_self.pubServer.address().address,
        maxload: item.maxLoad,
        currentload: item.currentLoad,
        name: item.name,
        'private': item['private']
      };
      // logger.log(r);
      list.push(r);
    });
    ret['response'] = 'roomlist';
    ret['roomlist'] = list;
    ret['result'] = true;
    logger.log(ret);
    var jsString = JSON.stringify(ret);
    r_self.pubServer.sendData(cli, new Buffer(jsString));
  },
  self).reg('request', 'join',
  function(cli, obj) {
    // var r_self = this;
    // cli.end();
  },
  self).reg('request', 'newroom',
  function(cli, obj) {
    var r_self = this;
    var infoObj = obj['info'];
    if (!infoObj) {
      var ret = {
        response: 'newroom',
        result: false,
        errcode: 200
      };
      logger.log(ret);
      var jsString = JSON.stringify(ret);
      r_self.pubServer.sendData(cli, new Buffer(jsString));
      return;
    }

    // amount of room limit begin
    if (r_self.op.maxRoom) {
      if (r_self.roomInfos.length > r_self.op.maxRoom) {
        var ret = {
          response: 'newroom',
          result: false,
          errcode: 210
        };
        logger.log(ret);
        var jsString = JSON.stringify(ret);
        r_self.pubServer.sendData(cli, new Buffer(jsString));
        return;
      }
    }
    // amount of room limit end
    // name check begin
    if (!infoObj['name']) {
      var ret = {
        response: 'newroom',
        result: false,
        errcode: 203
      };
      logger.log(ret);
      var jsString = JSON.stringify(ret);
      r_self.pubServer.sendData(cli, new Buffer(jsString));
      return;
    }
    var name = _.isString(infoObj['name']) ? infoObj['name'] : false;
    if (!name) {
      var ret = {
        response: 'newroom',
        result: false,
        errcode: 203
      };
      logger.log(ret);
      var jsString = JSON.stringify(ret);
      r_self.pubServer.sendData(cli, new Buffer(jsString));
      return;
    }
    if (r_self.roomInfos[name]) {
      var ret = {
        response: 'newroom',
        result: false,
        errcode: 202
      };
      logger.log(ret);
      var jsString = JSON.stringify(ret);
      r_self.pubServer.sendData(cli, new Buffer(jsString));
      return;
    }
    // name check end
    // maxLoad check begin
    if (infoObj['maxload']) {
      var maxLoad = parseInt(infoObj['maxload'], 10);
      if (maxLoad < 0 || maxLoad > 17) {
        var ret = {
          response: 'newroom',
          result: false,
          errcode: 204
        };
        logger.log(ret);
        var jsString = JSON.stringify(ret);
        r_self.pubServer.sendData(cli, new Buffer(jsString));
        return;
      }
    } else {
      var ret = {
        response: 'newroom',
        result: false,
        errcode: 204
      };
      logger.log(ret);
      var jsString = JSON.stringify(ret);
      r_self.pubServer.sendData(cli, new Buffer(jsString));
      return;
    }
    // maxLoad check end
    // welcomemsg check begin
    if (infoObj['welcomemsg']) {
      if (!_.isString(infoObj['welcomemsg'])) {
        var ret = {
          response: 'newroom',
          result: false,
          errcode: 205
        };
        logger.log(ret);
        var jsString = JSON.stringify(ret);
        r_self.pubServer.sendData(cli, new Buffer(jsString));
        return;
      }
      var welcomemsg = infoObj['welcomemsg'];
      if (welcomemsg.length > 40) {
        var ret = {
          response: 'newroom',
          result: false,
          errcode: 205
        };
        logger.log(ret);
        var jsString = JSON.stringify(ret);
        r_self.pubServer.sendData(cli, new Buffer(jsString));
        return;
      }
    } else {
      var welcomemsg = '';
    }
    // welcomemsg check end
    // password check begin
    if (infoObj['password']) {
      if (!_.isString(infoObj['password'])) {
        var ret = {
          response: 'newroom',
          result: false,
          errcode: 207
        };
        logger.log(ret);
        var jsString = JSON.stringify(ret);
        r_self.pubServer.sendData(cli, new Buffer(jsString));
        return;
      }
      var password = infoObj['password'];
      if (password.length > 16) {
        var ret = {
          response: 'newroom',
          result: false,
          errcode: 207
        };
        logger.log(ret);
        var jsString = JSON.stringify(ret);
        r_self.pubServer.sendData(cli, new Buffer(jsString));
        return;
      }
    } else {
      var password = '';
    }
    // password check end
    // emptyclose check begin
    if (infoObj['emptyclose']) {
      if (!_.isBoolean(infoObj['emptyclose'])) {
        var ret = {
          response: 'newroom',
          result: false,
          errcode: 207
        };
        logger.log(ret);
        var jsString = JSON.stringify(ret);
        r_self.pubServer.sendData(cli, new Buffer(jsString));
        return;
      }
      var emptyclose = infoObj['emptyclose'];
    } else {
      var emptyclose = false;
    }
    // emptyclose check end
    // canvasSize check begin
    if (infoObj['size']) {
      if (!_.isObject(infoObj['size'])) {
        var ret = {
          response: 'newroom',
          result: false,
          errcode: 211
        };
        logger.log(ret);
        var jsString = JSON.stringify(ret);
        r_self.pubServer.sendData(cli, new Buffer(jsString));
        return;
      }
      var canvasWidth = infoObj['size']['width'];
      var canvasHeight = infoObj['size']['height'];
      // constrain mega canvas.
      canvasWidth = (canvasWidth + canvasHeight) > 12960 ? 0 : canvasWidth;
      if (!canvasWidth || !canvasHeight) {
        var ret = {
          response: 'newroom',
          result: false,
          errcode: 211
        };
        logger.log(ret);
        var jsString = JSON.stringify(ret);
        r_self.pubServer.sendData(cli, new Buffer(jsString));
        return;
      }
      var canvasSize = {
        width: parseInt(canvasWidth, 10),
        height: parseInt(canvasHeight, 10)
      };
    } else {
      var ret = {
        response: 'newroom',
        result: false,
        errcode: 211
      };
      logger.log(ret);
      var jsString = JSON.stringify(ret);
      r_self.pubServer.sendData(cli, new Buffer(jsString));
      return;
    }
    // canvasSize check end
    var room = new Room({
      'name': name,
      'maxLoad': maxLoad,
      'welcomemsg': welcomemsg,
      'emptyclose': emptyclose,
      'password': password,
      'canvasSize': canvasSize,
      'expiration': 72 // 72 hours to close itself
    });

    room.on('create', function(info) {
      var ret = {
        response: 'newroom',
        result: true,
        'info': {
          port: info['cmdPort'],
          key: info['key']
        }
      };
      logger.log(ret);
      logger.log(room.msgSocket.address());
      logger.log(room.dataSocket.address());
      logger.log(room.cmdSocket.address());
      var jsString = JSON.stringify(ret);
      r_self.pubServer.sendData(cli, new Buffer(jsString));
      r_self.roomObjs[infoObj['name']] = room;
      var infoBlock = {
        cmdPort: info['cmdPort'],
        name: info['name'],
        maxLoad: info['maxLoad'],
        'private': info['private'],
        currentLoad: 0
      };
      r_self.roomInfos[infoObj['name']] = infoBlock;
      if (cluster.isWorker) {
        cluster.worker.send({
          'message': 'newroom',
          'info': infoBlock
        });
      };
    }).on('close', function() {
      delete r_self.roomObjs[room.options.name];
      delete r_self.roomInfos[room.options.name];
    }).start();
  },
  self);

  self.pubServer = new socket.SocketServer({
    autoBroadcast: false,
    useAlternativeParser: function(cli, data) {
      var obj = JSON.parse(data);
      logger.log(obj);
      self.router.message(cli, obj);
    }
  });

  self.pubServer.on('listening', function() {
    self._ispubServerConnected = true;
    self.emit('listening');
  });

  if (cluster.isWorker) {
    cluster.worker.on('message', function(msg) {
      logger.log('cluster msg: ');
      logger.log(msg);
      if (msg['message'] == 'newroom') {
        self.roomInfos[msg['info']['name']] = msg['info'];
      }else if (msg['message'] == 'loadchange') {
        if (self.roomInfos[msg['info']['name']]) {
          self.roomInfos[msg['info']['name']]['currentLoad'] = msg['info']['currentLoad'];
        };
      }else if (msg['message'] == 'roomclose') {
        delete self.roomInfos[msg['info']['name']];
      };
    });
  };

  // self.regSocket = new net.Socket();
}

util.inherits(RoomManager, events.EventEmitter);

RoomManager.prototype.start = function() {
  // TODO
  // var options = {
  // hostname: 'dns.mrspaint.com',
  // port: 80,
  // path: '/master',
  // method: 'GET'
  // };
  // var req = http.request(options, function(res) {
  // common.log('Trying to get master address');
  // common.log('STATUS: ' + res.statusCode);
  // common.log('HEADERS: ' + JSON.stringify(res.headers));
  // res.setEncoding('utf8');
  // res.on('data', function (chunk) {
  // common.log('BODY: ' + chunk);
  // });
  // });
  // req.on('error', function(e) {
  // common.log('problem with request: ' + e.message);
  // });
  this.pubServer.listen(this.op.pubPort, '::'); // this will support both ipv6 and ipv4 address
  return this;
};

RoomManager.prototype.stop = function() {
  _.each(self.roomObjs,
  function(item) {
    item.close();
  });
  return this;
};

module.exports = RoomManager;
