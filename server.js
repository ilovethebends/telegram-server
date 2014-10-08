var express = require('express');
var session = require('express-session');
var async = require('async');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var app = express();
var logger = require('nlogger').logger(module);
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var db = require('./database');

var User = db.model('User');
var Post = db.model('Post');

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false })); // parse application/json // used for POST and parsed request.body
app.use(bodyParser.json()); // parse application/vnd.api+json as json
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));
app.use(session({ secret: 'keyboard cat', resave: true, saveUninitialized: true, rolling: true }));
app.use(passport.initialize());
app.use(passport.session());

/**
* User LOGIN or get users. Used for following and follower stream
*/
app.get('/api/users', function(req, res) {
    logger.info('GET /users/');

    if (req.query.operation === 'login') {
        logger.info('req.query.operation = login - username: ', req.query.username);

        passport.authenticate('local', function(err, user, info) {
            logger.info("passport.authenticate() - user.id: ", user.id);

            if (err) { 
                logger.error('Passport authenticate error in authenticating');
                return res.status(500).end(); 
            }
            
            if (!user) { 
                return res.status(404).end(); 
            }
            
            req.logIn(user, function(err) {
                if (err) { 
                    logger.info('if err in req.login() user.id: ', user);
                    logger.error('Something wrong with res.login()', err);
                    return res.status(500).end(); 
                }

                return res.send({ users: [removePassword(user)] } );
            });
        })(req, res);

    //Used when viewing other users profile. 
    //If he is logged in then it will fire true and return the current user;
    } else if (req.query.operation === 'authenticating') {
        logger.info('isAuthenticated: ', req.isAuthenticated());
        
        if (req.isAuthenticated()) {
            return res.send({ users:[removePassword(req.user)] });
        } else {
            return res.send({ users: [] } );    
        }

    } else if (req.query.operation === 'following') {
        logger.info('GET /users/ req.query.operation = following - req.query.curUser: ', req.query.curUser);
        
        var emberArray = [];
        
        User.findOne({ id: req.query.curUser }, function (err, curUser) {
            if (err) return res.status(403).end();
            User.find({ id: { $in: curUser.following }}, function (err, following) {
                logger.info('Fn find() curUser.following - following: ', curUser.following);
                if (err) return res.status(403).end();
                //*** maybe use forEach ?
                following.forEach(function (follower) {
                    var u = removePassword(follower);
                    u = setIsFollowed(u, req.user);
                    emberArray.push(u);
                });
                
                return res.send({ users: emberArray });
            });
        });

    } else if (req.query.operation === 'followers') {
        logger.info('Getting followers for: ', req.query.curUser);
        
        var emberArray = [];
        
        User.findOne({ id: req.query.curUser }, function (err, curUser) {
            if (err) return res.status(403).end();
            
            User.find({ id: { $in: curUser.followers }}, function (err, followers) {
                if (err) return res.status(403).end();

                followers.forEach(function (follower) {
                    var u = removePassword(follower);
                    u = setIsFollowed(u, req.user);
                    emberArray.push(u);
                });

                return res.send({ users: emberArray });
            });
        });
    } else {
        logger.info('find all users');
        User.find({}, function (err, users) {
            return res.send({ users: users } );    
        })
        
    }
});

/**
* This GET REQUEST is for specific users.
* Used for url username request. 
* Also for dashboard individual user-posts.
*/

app.get('/api/users/:user_id', function (req, res) {
    logger.info('GET REQUEST for individual user: ', req.params.user_id);

    User.findOne({ 'id': req.params.user_id }, function (err, user) {
        //if user is not found will return null. 

        if (err) { return res.status(500).end() };
        if(!user) { return res.status(404).end() };
        return res.send({ 'user': removePassword(user) });
    });
});


// app.get('/api/users/:user_id/following', function (req, res) {
//     logger.info('GET Users Following: ',req.query.following );
//     User.find({}, function (err, users) {
//         if (err) return res.status(404).end();
//         return res.send({ users: users });
//     })
// });


/**
* This is the local stratgey used by Passport.
* Passport can use different types of strategies. 
*/

//require(/database) 
//passport-aunthenticate
passport.use(new LocalStrategy(
    function (username, password, done) {
        logger.info('fnc LocalStrategy - username: ', username);
        //User.find({user: username}, function(err.user))
        //findUser is superfluous
        //git branch 
        // findUserById( username, function (err, user) {
        User.findOne({id: username}, function (err, user) {
            if (err) { 
                logger.info('findOne returned error in local passport');
                return done(err); 
            }
            if (!user) { 
                logger.warn('User is incorrect.');
                return done(null, false, { message: 'Incorrect username' } );
            }
            if (user.password !== password) {
                logger.warn('Password is incorrect.');
                return done(null, false, { message: 'Incorrect password.' } );
            }
            logger.info('local returning user: ', user.id);
            return done(null, user);
        });
    })
);

/**
* In a typical web application, 
* the credentials used to authenticate a user 
* will only be transmitted during the login request. req.login()
* If authentication succeeds, 
* a session will be established and maintained via a cookie set in the user's browser.
*/

/**
* Serialize is called by req.login. 
* It takes in user instances to be used for sessions. 
* The following uses user.id (this is used to keep data in the session small).
*/

//var authenticate = require('/authentication');

passport.serializeUser(function(user, done) {
    logger.info('serialUser() - user: ', user);
    //passes in unique key
    done(null, user.id);
});

passport.deserializeUser(function(id, done) {
    User.findOne({id: id}, function (err, user) {
        done(err, user);
    });
});


/**
* Requesting posts from the Posts Stream
* dashboard GET()
*/

app.get('/api/posts', function (req, res) {
    
    logger.info('GET on /api/posts');


/** 
* query - If there's an author get the posts from that author.
* else get all the posts.
*/
    //Always init variable

    var query = {};
    
    if (req.query.operation === 'dashboard') {
        query = { $or: [{ author : { $in: req.user.following }}, { author: req.user.id }]};
        logger.info('this is query: ', query);
    } else {
        query = req.query.author ? { author: req.query.author } : {} ;
    }

    Post.find(query, function (err, posts) {
        if (err) return res.status(403).end();
        var emberPosts = [];
        posts.forEach(function (post) {
            var emberPost = {
                id: post._id,
                author: post.author, 
                text: post.text,
                timestamp: post.timestamp
            }
            emberPosts.push(emberPost);

        });
        return res.send({ posts: emberPosts } );
    });
});


/**
* Creating a post. Most Likely from the dashboard.
*/
app.post('/api/posts', ensureAuthenticated, function (req, res) {
    logger.info('posts request');

    var post = {
        author: req.body.post.author,
        text: req.body.post.text,
        timestamp: req.body.post.timestamp
    };

    if (req.user.id === post.author) {
        logger.info('id and author passed');

        Post.create(post, function (err, post) {
            if (err) return res.status(403).end();
            
            logger.info('Post Record Created: ', post.text);
            
            var emberPost = {
                id: post._id,
                author: req.user.id,
                text: post.text,
                timestamp: post.timestamp
            };
            
            return res.send({ post: emberPost });
        });
    } else {
        logger.warning('user tried unauthorized post');
        return res.status(403).end();
    }
});


/**
* CREATE USER - new user record.
* POST is always used for creating a new record.
*/
app.post('/api/users', function (req, res) {
    logger.info('CREATE USER - POST to api/users: ', req.body.user);

    if (req.body.user) {
        req.body.user.isFollowed = true;
        User.create(req.body.user, function (err, user) {
            if (err) return res.status(403).end();

            logger.info('User Created: ', user.id);
            req.login(req.body.user, function(err) {
                logger.info('req.login');
                if (err) { return res.status(500).end(); }
                var u = removePassword(user);
                return res.send({user: u});
            });
        });    

    } else {
        logger.debug('signUp error: ', req.body.user);
        res.status(403).end();
    }
});

//api/user/follow
app.post('/api/follow', ensureAuthenticated, function (req, res) {
    logger.info('POST on api/follow: ',req.user, ' ', req.body);
    //logged in user array adds to following
    //current adds user to follwers
    async.parallel({ 
        
        setFollowing: function(cb) {
            logger.info('setFollowing()');
            User.findOneAndUpdate( 
                { id: req.user.id },
                { $addToSet: { following: req.body.id }},
                //***** use addToset instead of push so you get unique posts in mongodb. 
                { safe: true, upsert: true },
                function (err, user) {
                    console.log(err);
                    return cb(null, {user: user});
                }
            );
        },
        setFollowers: function(cb) {
            logger.info('setFollowers()');
            User.findOneAndUpdate( 
                { id: req.body.id },
                { $addToSet: { followers: req.user.id }},
                { safe: true, upsert: true },
                function (err, user) {
                    console.log(err);
                    return cb(null, {user: user});
                }
            );
        }
    }, 
    function (err, results) {
        if(err) {return res.status(500).end();}
        return res.status(200).end();
    });
});

app.post('/api/unfollow', ensureAuthenticated, function (req, res) {
    logger.info('POST on api/unfollow: ',req.user, ' ', req.body);

    async.parallel({ 
        setFollowing: function(cb) {
            User.findOneAndUpdate( 
                { id: req.user.id },
                { $pull: { following: req.body.id }},
                { safe: true, upsert: true },
                function (err, user) {
                    console.log(err);
                    return cb(null, {user: user});
                }
            );
            
        },
        setFollowers: function(cb) {
            User.findOneAndUpdate( 
                { id: req.body.id },
                { $pull: { followers: req.user.id }},
                { safe: true, upsert: true },
                function (err, user) {
                    if (err) {
                        logger.error(err);
                    }
                    console.log(err);
                    return cb(null, {user: user});
                }
            );
            logger.info('setFollowers()');
            
        }
    }, 
    function (err, results) {
        if(err) {return res.status(500).end();}
        return res.status(200).end();
    });
});


app.delete('/api/posts/:post_id', ensureAuthenticated, function (req, res) {
    logger.info('DELETE POST: ', req.params.post_id);
    Post.remove({ _id: req.params.post_id }, function (err) {
        if (err) {return res.status(404).end();}
        return res.send({});
    });
});


//user-route api/users/logout
app.get('/api/logout', function (req, res) {
    req.logout();
    return res.status(200).end();
});


//user-routes.js
function removePassword (user) {
logger.info('fn removePassword user: ', user);
    var copy = {
        id: user.id,
        name: user.name,
        picture: '/assets/images/cristian-strat.png'
    };
    return copy;
}

function setIsFollowed (user, loggedInUser) {

    if (loggedInUser) {
        var userIsFollowing = loggedInUser.following.indexOf(user.id) !== -1 ? true : false;
        if (userIsFollowing) {
            user.isFollowed = true;
        } else {
            user.isFollowed = false;
        }
    }
    return user;
}

// ensureAuthenticate module.exports
//is also a middleware
function ensureAuthenticated (req, res, next) {
    logger.info('ensureAuthticated: ', req.isAuthenticated());
    if (req.isAuthenticated()) {
        logger.info('isAuthenticated');
        return next();
    } else {
        return res.status(403);
    }
}

var server = app.listen(3000, function() {
    console.log('Serving on: ', server.address().port, '**************************************');
});