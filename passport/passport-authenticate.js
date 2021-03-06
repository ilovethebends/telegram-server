var logger = require('nlogger').logger(module);
var db = require('./../database/database');
var User = db.model('User');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var bcrypt = require('bcrypt');
var userUtil = require('../router/routes/user/user-util');
var configAuth = require('./../auth');
logger.info('config: ', configAuth);

passport.use('local', new LocalStrategy(
    function (username, password, done) {
        logger.info('fnc LocalStrategy - username: ', username);
        
        User.findOne({id: username}, function (err, user) {
            if (err) { 
                logger.info('FindOne returned error in local passport');
                logger.error(err);
                return done(err); 
            }
            if (!user) { 
                logger.warn('User is incorrect.');
                return done(null, false, { message: 'Incorrect username' } );
            }

            bcrypt.compare(password, user.password, function(err, res) {
                if (err) {
                    logger.error('Bcrypt password compare error: ', err);
                }
                if(res) {
                    logger.info('Bcrypt passed: ', res);
                    logger.info('local returning user: ', user.id);
                    return done(null, user);
                } else {
                    logger.warn('Bcrypt failed: ', 'query: ',password);
                    logger.warn( ' user.password: ', user.password);
                    return done(null, false, { message: 'Incorrect password.' } );
                }
            });
        });
    })
);

passport.serializeUser(function(user, done) {
    logger.info('Serialized user: ', user.id);
    done(null, user.id);
});

passport.deserializeUser(function(id, done) {
    logger.info('Deserialized user: ', id);
    User.findOne({id: id}, function (err, user) {
        done(err, user);
    });
});

passport.use(new FacebookStrategy({

    // pull in our app id and secret from our auth.js file
        clientID        : configAuth.facebookAuth.clientID,
        clientSecret    : configAuth.facebookAuth.clientSecret,
        callbackURL     : configAuth.facebookAuth.callbackURL
    },

// facebook will send back the token and profile
    function(token, refreshToken, profile, done) {
        User.findOne({ id: profile.id }, function(err, user) {
            logger.info('user found from facebook: ', profile);
            if(err) done(err);
            
            if(user) {
                return done(null, user); // if the user is found, then log them in
            } else {
                // if there is no user found with that facebook id, create them
                var newUser = {};
                newUser.id    = profile.id; // set the users facebook id                   
                newUser.name = profile.name.givenName + ' ' + profile.name.familyName; // look at the passport user profile to see how names are returned
                newUser.picture = userUtil.assignAvatar();
                
                User.create(newUser, function(err, user) {
                    if (err) {
                        logger.error('User not Created', err);
                        done(err);
                    }
                    logger.info('User Created: ', user.id);
                    return done(null, user);
                });
            }
                    
        });
        
    })
);




module.exports = passport;