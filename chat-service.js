let _ = require('lodash');
let mongoose = require('mongoose');
let redis = require('redis');

const roomsChannel = 'rooms_channel';
const usersChannel = 'users_channel';
let redisClient;
let redisSubscriberClient;

const chatService = {};

// A felhasználónk neve
let myUsername;
let myAvatar;

// Az üzenet model leírása
const Message = mongoose.model('Message', new mongoose.Schema({
    user: String,
    date: Date,
    content: String,
    room: String,
    avatarUrl: String
  }));

  const Channel = mongoose.model('Channel', new mongoose.Schema({
    name: String
  }));

  chatService.connect = function (username, serverAddress, password,avatar, successCb, failCb, messageCallback, userCallback) {
    myUsername = username;
    myAvatar = avatar;
    let dbReady = false;
    let mqReady = false;
  
    let db = mongoose.connect('mongodb://bilabor:' + password + '@' + serverAddress + ':27017/bilabor?authSource=admin', {useNewUrlParser: true, useUnifiedTopology: true});
    redisClient = redis.createClient({
      host: serverAddress, password: password, retry_strategy: function () {
      }
    });
  
    // Ha minden kapcsolat felépült
    function connectionSuccesfull() {
      // Felvesszük magunkat az online user listára
      redisClient.zadd(usersChannel, 0, username);
      // Szólunk a channelen hogy bejelentkeztünk
      redisClient.publish(usersChannel, username);
  
      // Feliratkozunk az eseményekre amiket figyelnünk kell
      // A subscribehoz külön kliens kell, ezért lemásoljuk az eredetit
      redisSubscriberClient = redisClient.duplicate();
      redisSubscriberClient.subscribe(roomsChannel);
      redisSubscriberClient.subscribe(usersChannel);
      redisSubscriberClient.on('message', function (channel, message) {
        if (channel === roomsChannel) {
          // Ha a szoba channel-be érkezik üzenet azt jelenti valamelyik szobába frissíteni kell az üzeneteket
          messageCallback(message);
        } else if (channel === usersChannel) {
          // Ha a user channelbe érkezik üzenet azt jelenti változott a user lista
          userCallback();
        }
      });
  
      successCb();
    }
  
    // Nem tudjuk a kettő CB közül melyik hívódik meg előszőr, így a második után fogunk csak visszahívni
    db.then(function () {
      dbReady = true;
      if (mqReady === true) {
        connectionSuccesfull();
      }
    }, failCb);
  
    // Redis kliens eseményei
    redisClient.on('ready', function () {
      mqReady = true;
      if (dbReady === true) {
        // Ha a DB kapcsolatot is felépítettük bejelentkezünk
        connectionSuccesfull();
      }
    });
    redisClient.on('error', failCb);
  };

// Lecsatlakozik a szerverről
chatService.disconnect = function () {
    if (!_.isUndefined(redisClient)) {
      redisClient.zrem(usersChannel, myUsername);
      redisClient.publish(usersChannel, myUsername);
    }
  };

// Visszaadja a szobában található üzeneteket
chatService.getMessages = function (roomId, cb) {
    Message.find({room: roomId}, function (err, msg) {
      cb(msg)
    });
  };

// Visszaadja a bejelentkezett usereket
chatService.getUsers = function (cb) {
    redisClient.zrange(usersChannel, 0, -1, function (error, result) {
      cb(result);
    });
  };

// Visszaadja a bejelentkezett usereket
chatService.getChannels = function (cb) {
    Channel.find({}, function (err, ch) {
        debugger;
        cb(ch)
      });
  };

// Üzenetet küld
chatService.sendMessage = function (roomId, message) {
    let msg = new Message({
      user: myUsername,
      date: message.date,
      content: message.content,
      room: roomId,
      avatarUrl: myAvatar
    });
    msg.save().then(function () {
      // Szólunk hogy frissítettük a szobában az üzeneteket
      redisClient.publish(roomsChannel, roomId)
    })
  };

module.exports = chatService;