var oauth = require('oauth');
var qs = require('querystring');


var supported = {
  'statuses/mentions_timeline': { method: 'GET' },
  'statuses/user_timeline': { method: 'GET' },
  'statuses/home_timeline': { method: 'GET' },
  'statuses/retweets_of_me': { method: 'GET' },
  'statuses/retweets/:id': { method: 'GET' },
  'statuses/show/:id': { method: 'GET' },
  'statuses/destroy/:id': { method: 'POST' },
  'statuses/update': { method: 'POST' },
  'statuses/retweet/:id': { method: 'POST' },
  'statuses/update_with_media': { method: 'POST' },
  'statuses/oembed': { method: 'GET' },
  'search/tweets': { method: 'GET' },
  'statuses/filter': { method: 'POST' },
  // stream
  // 'statuses/filter'
  // 'statuses/sample'
  // 'statuses/firehose'
  // 'user'
  // 'site'
  'direct_messages': { method: 'GET' },
  'direct_messages/sent': { method: 'GET' },
  'direct_messages/show': { method: 'GET' },
  'direct_messages/destroy': { method: 'POST' },
  'direct_messages/new': { method: 'POST' },
  'friends/ids': { method: 'GET' },
  'followers/ids': { method: 'GET' },
  'friendships/lookup': { method: 'GET' },
  'friendships/incoming': { method: 'GET' },
  'friendships/outgoing': { method: 'GET' },
  'friendships/create': { method: 'POST' },
  'friendships/destroy': { method: 'POST' },
  'friendships/update': { method: 'POST' },
  'friendships/show': { method: 'GET' },
  'friends/list': { method: 'GET' },
  'followers/list': { method: 'GET' },
  'account/settings': { method: 'POST' },
  'account/verify_credentials': { method: 'POST' },
  'account/settings': { method: 'POST' },
  'account/update_delivery_device': { method: 'POST' },
  'account/update_profile': { method: 'POST' },
  'account/update_profile_background_image': { method: 'POST' },
  'account/update_profile_colors': { method: 'POST' },
  'account/update_profile_image': { method: 'POST' },
  'blocks/list': { method: 'GET' },
  'blocks/ids': { method: 'GET' },
  'blocks/create': { method: 'POST' },
  'blocks/destroy': { method: 'POST' },
  'users/lookup': { method: 'GET' },
  'users/show': { method: 'GET' },
  'users/search': { method: 'GET' },
  'users/contributees': { method: 'GET' },
  'users/contributors': { method: 'GET' },
  'account/remove_profile_banner': { method: 'POST' },
  'account/update_profile_banner': { method: 'POST' },
  'users/profile_banner': { method: 'GET' },
  'users/suggestions/:slug': { method: 'GET' },
  'users/suggestions': { method: 'GET' },
  'users/suggestions/:slug/members': { method: 'GET' },
  'favorites/list': { method: 'GET' },
  'favorites/destroy': { method: 'POST' },
  'favorites/create': { method: 'POST' },
  'lists/list': { method: 'GET' },
  'lists/statuses': { method: 'GET' },
  'lists/members/destroy': { method: 'POST' },
  'lists/memberships': { method: 'GET' },
  'lists/subscribers': { method: 'GET' },
  'lists/subscribers/create': { method: 'POST' },
  'lists/subscribers/show': { method: 'GET' },
  'lists/subscribers/destroy': { method: 'POST' },
  'lists/members/create_all': { method: 'POST' },
  'lists/members/show': { method: 'GET' },
  'lists/members': { method: 'GET' },
  'lists/members/create': { method: 'POST' },
  'lists/destroy': { method: 'POST' },
  'lists/update': { method: 'POST' },
  'lists/create': { method: 'POST' },
  'lists/show': { method: 'GET' },
  'lists/subscriptions': { method: 'GET' },
  'lists/members/destroy_all': { method: 'POST' },
  'saved_searches/list': { method: 'GET' },
  'saved_searches/show/:id': { method: 'GET' },
  'saved_searches/create': { method: 'POST' },
  'saved_searches/destroy/:id': { method: 'POST' }
};









// main manager function
/**
* Manager Function
*
* Managers all watchers and url calls to the twitter service.
*
* Should eventually be used to monitor usage limits.
* Handles all oAuth requests.
*/
module.exports = function(options) {
  var self = this;
  if(options.redis) {
    var datastore = require('./redis.js')(options.redis.host, options.redis.port);
  }
  self.cacheDuration = 60; // 60 secs default cache.
  self.consumer = new oauth.OAuth(
    "https://twitter.com/oauth/request_token",
    "https://twitter.com/oauth/access_token",
    options.consumerKey,
    options.consumerSecret,
    "1.0A",
    options.domain + options.loginCallback,
    "HMAC-SHA1"
  );

  /**
  * Fetches the url provided passing along all the oauth params.
  * @param  {string}   url              URL to fetch
  * @param  {[type]}   oauthToken       Oauth token provided by twitter.
  * @param  {[type]}   oauthTokenSecret Oauth secret provided by twitter.
  * @param  {Function} callback         Function to call when all data has been completed. Takes error, data
  */
  self.fetch =  function(url, oauthToken, oauthTokenSecret, callback) {
    var self = this;
    var get = function(url, oauthToken, oauthTokenSecret, callback) {
      self.consumer.get(url, oauthToken, oauthTokenSecret, function (error, data, response) {
        if(response && response.headers) {
          // this info should get sent back with each request.
          var limits = {
            remaining: response.headers['x-rate-limit-remaining'],
            reset: response.headers['x-rate-limit-reset']
          }
          if(limits.remaining === "0") {  //rate limit has not been reached.
            callback({
              limitReached: true,
              limits: limits,
              auth: data
            }, null);
            return;
          }
        }
        if (error) {
          callback(error, null);
          return;
        }
        try { // sometime data is coming back as invalid json.   https://dev.twitter.com/discussions/9554
          data = JSON.parse(data);
          if(data.error) {
            callback(data, null);
            return;
          }
          if(options.redis) {
            var key = 'twitterStore:'+url;
            datastore.set(key, JSON.stringify(data));
            datastore.expire(key, self.cacheDuration);
          }
          if(callback) {
            callback(null, data, limits);
          }
        } catch(error) {
          // leaving this in  so we can keep an eye of invalid json being returned.
          console.log('ERROR', error);
        }
      });
    };

    if(options.redis) {
      datastore.get('twitterStore:'+url, function(redisError, data) {
        if(redisError || !data){
          get(url, oauthToken, oauthTokenSecret, callback);
        } else {  // we have cached data, lets send that.
          callback(null, JSON.parse(data));
        }
      });
    }else {
      get(url, oauthToken, oauthTokenSecret, callback);
    }
  };

  /*
    Handle Post request
   */

  self.post =  function(url, oauthToken, oauthTokenSecret, body, callback) {
    self.consumer.post(url, oauthToken, oauthTokenSecret, body, 'json', function (error, data, response) {
      callback(error, data);
    });
  };

  /**
   * Call any method on the twitter API.
   * @param  {String}   funct    Name of a function from this list: https://dev.twitter.com/docs/api/1.1
   *                             in the format: statuses/update
   * @param  {String}   method   GET or POST
   * @param  {Object}   params   Values to be sent with the request
   * @param  {Object}   oauth    Needs secret and token
   * @param  {Function} callback Called once complete
   */
  self.method = function(funct, method, params, oauth, callback) {
    var processData = function(error, data, limits) {
      callback(error, {
        limit: limits,
        data: data
      });
    };
    if(method === 'GET'){
      self.fetch('https://api.twitter.com/1.1/'+funct+'.json?'+qs.stringify(params), oauth.token, oauth.secret, processData);
    }else if(method === 'POST') {
      self.post('https://api.twitter.com/1.1/'+funct+'.json', oauth.token, oauth.secret, params, processData);
    }else {
      console.log('Only GET and POST supported.');
    }
  };

  /**
   * Returns info about the user specified by the handle.
   *
   * docs: https://dev.twitter.com/docs/api/1.1/get/account/verify_credentials
   *
   * @param  {String}   oauthToken       oauth token provided by twitter.
   * @param  {String}   oauthTokenSecret oauth secret provided by twitter.
   * @param  {Function} callback         Called with the mentions. (error, data)
   */
  self.verify = function(oauthToken, oauthTokenSecret, callback) {
    var processData = function(error, data, limit) {
      callback(error, {
        limit: limits,
        user: data
      });
    };
    self.fetch('https://api.twitter.com/1.1/account/verify_credentials.json', oauthToken, oauthTokenSecret, processData);
  };



  // oauth routes.
  //
  // Come on - you know this one.
  self.logout = function(req, res, next) {
    req.session.oauthAccessToken = null;
    req.session.oauthAccessTokenSecret = null;
    req.session.destroy();
    res.json({'logout': 'ok'});
  };

  // Used to connect using oauth.
  self.oauthConnect = function(req, res, next) {
    var referer = req.header('Referer');
    if(referer){
      req.session.originalUrl = referer; // stored so we can return them to here later.
    }
    self.consumer.getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret, results){
      if (error) {
        res.send("Error getting OAuth request token : ", 500);
        console.log('oAuth error: '+ error);
      } else {
        req.session.oauthRequestToken = oauthToken; // we will need these values in the oauthCallback so store them on the session.
        req.session.oauthRequestTokenSecret = oauthTokenSecret;

       var connectCallback = function(req, res, next) { // keep track of the site id in the sesion for the callback.
          req.session.siteId = req.params.siteId;
          req.session.apiKey = req.params.apiKey;
          req.session.siteToken = req.params.siteToken;
       };

        if(options.connectCallback) {
          options.connectCallback(req, res, next);
        }else {
          connectCallback(req, res, next);
        }
        console.log('DO REDIRECT');
        res.redirect("https://twitter.com/oauth/authorize?oauth_token="+req.session.oauthRequestToken);
      }
    });
  };

  self.oauthCallback = function(req, res, next) {
    console.log('wotcha');
    self.consumer.getOAuthAccessToken(req.session.oauthRequestToken, req.session.oauthRequestTokenSecret, req.query.oauth_verifier, function(error, oauthAccessToken, oauthAccessTokenSecret, results) {
      if (error) {
        res.send("Access Denied." , 500);
        console.log('oAuth Error: step2: ' + JSON.stringify(error) + "["+oauthAccessToken+"]"+ "["+oauthAccessTokenSecret+"]");
      } else {
        req.session.oauthAccessToken = oauthAccessToken; // ensure we are clearing the session variables.
        req.session.oauthAccessTokenSecret = oauthAccessTokenSecret;
        if(options.oauthCallbackCallback) {
          options.oauthCallbackCallback(req, res, next, results.screen_name, oauthAccessToken, oauthAccessTokenSecret);
        }else {
          res.redirect(options.completeCallback);
        }
      }
    });
  };




  var handleRequest = function(func, params, oauth, callback) {
    self.method(func, supported[func].method, params, oauth, callback);
  };



var addApiMethod = function(key, api) {
  var items = key.split('/');
  for(b = 0; b < items.length; b++ ){
    if(!current){ // api is not defined.
      if(!api[items[b]]){
        api[items[b]] = {};
      }
      var current = api[items[b]];
    }else { // api is defined and current set
      if(!current[items[b]]){
        if(b === items.length-1) { // its the last item from the / so much be function.
          current[items[b]] = handleRequest.bind(this, key)
        }else {
          current[items[b]] = {};
        }
      }
      current = current[items[b]];
    }
  }
  return api;
};



  /**
   * Takes the supported object and builds the api object from it.
   * @param  {Object} supported [description]
   * @return {Object}           The API with methods ready to use.
   */
  var buildApi = function(supported) {
    var api = {};
    for(func in supported) {
      api = addApiMethod(func, api);
    }
    return api;
  };


  self.api = buildApi(supported);

  return self;
};


